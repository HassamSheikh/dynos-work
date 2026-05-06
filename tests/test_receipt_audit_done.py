"""Tests for receipt_audit_done sidecar assertion (AC 9)."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "hooks"))

from lib_receipts import receipt_audit_done  # noqa: E402


def _task_dir(tmp_path: Path) -> Path:
    project = tmp_path / "project"
    td = project / ".dynos" / "task-20260418-AD"
    td.mkdir(parents=True)
    return td


def _write_sidecar(td: Path, auditor: str, model: str, digest: str) -> Path:
    sidecar_dir = td / "receipts" / "_injected-auditor-prompts"
    sidecar_dir.mkdir(parents=True, exist_ok=True)
    p = sidecar_dir / f"{auditor}-{model}.sha256"
    p.write_text(digest)
    return p


def _write_report(td: Path, findings: list[dict]) -> Path:
    """Write a real audit report JSON and return its path."""
    report = td / "audit-reports" / "sec.json"
    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_text(json.dumps({"findings": findings}))
    return report


def test_matching_sidecar_passes(tmp_path: Path):
    td = _task_dir(tmp_path)
    digest = "a" * 64
    _write_sidecar(td, "security-auditor", "haiku", digest)
    # Write an empty report so the envelope path and counts match on disk.
    report = _write_report(td, [])
    final_envelope = json.dumps({
        "report_path": str(report),
        "findings_count": 0,
        "blocking_count": 0,
    })
    out = receipt_audit_done(
        td, "security-auditor", "haiku", 0, 0, str(report), 100,
        route_mode="replace", agent_path="learned/x.md",
        injected_agent_sha256=digest,
        final_envelope=final_envelope,
    )
    assert out.exists()
    payload = json.loads(out.read_text())
    assert payload["injected_agent_sha256"] == digest
    assert payload["route_mode"] == "replace"


def test_mismatched_sidecar_raises(tmp_path: Path):
    td = _task_dir(tmp_path)
    _write_sidecar(td, "sec", "haiku", "a" * 64)
    with pytest.raises(ValueError, match="mismatch"):
        receipt_audit_done(
            td, "sec", "haiku", 0, 0, None, 100,
            route_mode="replace", agent_path="learned/x.md",
            injected_agent_sha256="b" * 64,
        )


def test_missing_sidecar_raises(tmp_path: Path):
    td = _task_dir(tmp_path)
    with pytest.raises(ValueError, match="sidecar"):
        receipt_audit_done(
            td, "sec", "haiku", 0, 0, None, 100,
            route_mode="replace", agent_path="learned/x.md",
            injected_agent_sha256="a" * 64,
        )


def test_env_var_no_longer_bypasses_assertion(tmp_path: Path, monkeypatch):
    """Regression: DYNOS_SKIP_RECEIPT_SIDECAR_ASSERT=1 was removed (SEC-003).
    Even with the env var set, sidecar enforcement must still fire."""
    td = _task_dir(tmp_path)
    # No sidecar at all on disk
    monkeypatch.setenv("DYNOS_SKIP_RECEIPT_SIDECAR_ASSERT", "1")
    with pytest.raises(ValueError, match="sidecar"):
        receipt_audit_done(
            td, "sec", "haiku", 0, 0, None, 100,
            route_mode="replace", agent_path="learned/x.md",
            injected_agent_sha256="a" * 64,
        )


def test_generic_mode_allows_none_injected(tmp_path: Path):
    td = _task_dir(tmp_path)
    out = receipt_audit_done(
        td, "sec", "haiku", 0, 0, None, 100,
        route_mode="generic", agent_path=None,
        injected_agent_sha256=None,
    )
    assert out.exists()
    payload = json.loads(out.read_text())
    assert payload["injected_agent_sha256"] is None


def test_non_generic_with_none_injected_rejected(tmp_path: Path):
    td = _task_dir(tmp_path)
    with pytest.raises(ValueError, match="generic"):
        receipt_audit_done(
            td, "sec", "haiku", 0, 0, None, 100,
            route_mode="replace", agent_path="learned/x.md",
            injected_agent_sha256=None,
        )
