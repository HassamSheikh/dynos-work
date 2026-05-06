"""Tests for receipt_audit_done final-envelope validation (AC 9).

Eight tests covering:
  - valid envelope → receipt written with envelope_sha256 (64-char hex)
  - envelope report_path mismatch → ValueError + audit_envelope_mismatch event
  - envelope findings_count mismatch → ValueError
  - envelope blocking_count mismatch → ValueError
  - final_envelope=None on non-generic → ValueError naming "required"/"non-generic"
  - final_envelope=None on generic → receipt written, envelope_sha256 is None
  - invalid JSON (code-fenced) → ValueError
  - non-integer count field → ValueError naming the field and its type

These tests are written TDD-first: they WILL FAIL until segment-2-code lands
the _validate_final_envelope helper and the final_envelope kwarg on
receipt_audit_done. That failure is the intended TDD signal.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "hooks"))

from lib_receipts import receipt_audit_done  # noqa: E402

# ---------------------------------------------------------------------------
# Fixture helpers — mirrors tests/test_receipt_audit_done_selfverify.py exactly
# ---------------------------------------------------------------------------

def _make_task(tmp_path: Path) -> Path:
    project = tmp_path / "project"
    td = project / ".dynos" / "task-20260419-AS"
    td.mkdir(parents=True)
    return td


def _write_report(task_dir: Path, findings: list[dict]) -> Path:
    """Write a real audit report JSON and return its path."""
    report = task_dir / "audit-reports" / "sec.json"
    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_text(json.dumps({"findings": findings}))
    return report


# ---------------------------------------------------------------------------
# Sidecar helper — mirrors tests/test_receipt_audit_done.py _write_sidecar
# ---------------------------------------------------------------------------

def _write_sidecar(task_dir: Path, auditor: str, model: str, digest: str) -> Path:
    sidecar_dir = task_dir / "receipts" / "_injected-auditor-prompts"
    sidecar_dir.mkdir(parents=True, exist_ok=True)
    p = sidecar_dir / f"{auditor}-{model}.sha256"
    p.write_text(digest)
    return p


# ---------------------------------------------------------------------------
# Test 1: valid envelope for non-generic route → receipt written with 64-char hex
# ---------------------------------------------------------------------------

def test_envelope_match_passes(tmp_path: Path):
    """AC 9: valid envelope matching on-disk report for non-generic auditor.

    Receipt must be written and envelope_sha256 must be a 64-char lowercase hex
    string derived from SHA-256 of the final_envelope string.
    """
    td = _make_task(tmp_path)
    findings = [
        {"id": "F-1", "blocking": True},
        {"id": "F-2", "blocking": False},
        {"id": "F-3", "blocking": True},
    ]
    report = _write_report(td, findings)
    digest = "a" * 64
    _write_sidecar(td, "security-auditor", "haiku", digest)

    envelope = json.dumps({
        "report_path": str(report),
        "findings_count": 3,
        "blocking_count": 2,
    })

    out = receipt_audit_done(
        td, "security-auditor", "haiku", 3, 2, str(report), 100,
        route_mode="replace",
        agent_path="learned/security-auditor.md",
        injected_agent_sha256=digest,
        final_envelope=envelope,
    )

    assert out.exists(), "Receipt file must be written on valid envelope"
    payload = json.loads(out.read_text())
    sha = payload.get("envelope_sha256")
    assert sha is not None, "envelope_sha256 must be present in receipt"
    assert isinstance(sha, str), "envelope_sha256 must be a string"
    assert len(sha) == 64, f"envelope_sha256 must be 64 hex chars, got {len(sha)}"
    assert sha == sha.lower(), "envelope_sha256 must be lowercase hex"
    # Verify the hash is actually SHA-256 of the envelope bytes
    import hashlib
    expected_sha = hashlib.sha256(envelope.encode("utf-8")).hexdigest()
    assert sha == expected_sha, "envelope_sha256 must be SHA-256 of the final_envelope string"


# ---------------------------------------------------------------------------
# Test 2: envelope report_path mismatch → ValueError + event in events.jsonl
# ---------------------------------------------------------------------------

def test_envelope_report_path_mismatch_raises(tmp_path: Path):
    """AC 9: envelope.report_path != arg.report_path → ValueError raised.

    Receipt must not be written. An audit_envelope_mismatch event must be
    emitted to events.jsonl with all 9 required fields.
    """
    td = _make_task(tmp_path)
    findings = [{"id": "F-1", "blocking": False}]
    report = _write_report(td, findings)
    digest = "b" * 64
    _write_sidecar(td, "security-auditor", "haiku", digest)

    wrong_path = str(report.parent / "other-report.json")
    envelope = json.dumps({
        "report_path": wrong_path,       # <-- deliberately wrong
        "findings_count": 1,
        "blocking_count": 0,
    })

    receipt_path = td / "receipts" / "audit-security-auditor.json"

    with pytest.raises(ValueError):
        receipt_audit_done(
            td, "security-auditor", "haiku", 1, 0, str(report), 100,
            route_mode="replace",
            agent_path="learned/security-auditor.md",
            injected_agent_sha256=digest,
            final_envelope=envelope,
        )

    assert not receipt_path.exists(), "Receipt must NOT be written when envelope mismatches"

    # Verify audit_envelope_mismatch event was emitted
    events_file = td.parent.parent / "events.jsonl"
    assert events_file.exists(), "events.jsonl must exist after mismatch event"
    lines = [l.strip() for l in events_file.read_text().splitlines() if l.strip()]
    assert lines, "events.jsonl must have at least one event"
    last_event = json.loads(lines[-1])

    assert last_event.get("type") == "audit_envelope_mismatch", (
        f"Last event type must be 'audit_envelope_mismatch', got {last_event.get('type')!r}"
    )
    # Verify all 9 required fields are present
    required_fields = [
        "task", "auditor_name", "route_mode",
        "expected_report_path", "envelope_report_path",
        "expected_findings_count", "envelope_findings_count",
        "expected_blocking_count", "envelope_blocking_count",
    ]
    for field in required_fields:
        assert field in last_event, f"audit_envelope_mismatch event must contain field {field!r}"

    assert last_event["task"] == td.name
    assert last_event["auditor_name"] == "security-auditor"
    assert last_event["route_mode"] == "replace"
    assert last_event["expected_report_path"] == str(report)
    assert last_event["envelope_report_path"] == wrong_path


# ---------------------------------------------------------------------------
# Test 3: findings_count mismatch → ValueError
# ---------------------------------------------------------------------------

def test_envelope_findings_count_mismatch_raises(tmp_path: Path):
    """AC 9: envelope claims wrong findings_count → ValueError raised, no receipt."""
    td = _make_task(tmp_path)
    findings = [
        {"id": "F-1", "blocking": False},
        {"id": "F-2", "blocking": False},
        {"id": "F-3", "blocking": False},
    ]
    report = _write_report(td, findings)  # 3 findings on disk
    digest = "c" * 64
    _write_sidecar(td, "security-auditor", "haiku", digest)

    envelope = json.dumps({
        "report_path": str(report),
        "findings_count": 5,   # <-- wrong: disk has 3
        "blocking_count": 0,
    })

    receipt_path = td / "receipts" / "audit-security-auditor.json"

    with pytest.raises(ValueError):
        receipt_audit_done(
            td, "security-auditor", "haiku", 3, 0, str(report), 100,
            route_mode="replace",
            agent_path="learned/security-auditor.md",
            injected_agent_sha256=digest,
            final_envelope=envelope,
        )

    assert not receipt_path.exists(), "Receipt must NOT be written on findings_count mismatch"


# ---------------------------------------------------------------------------
# Test 4: blocking_count mismatch → ValueError
# ---------------------------------------------------------------------------

def test_envelope_blocking_count_mismatch_raises(tmp_path: Path):
    """AC 9: envelope claims wrong blocking_count → ValueError raised, no receipt."""
    td = _make_task(tmp_path)
    findings = [
        {"id": "F-1", "blocking": True},
        {"id": "F-2", "blocking": True},
        {"id": "F-3", "blocking": False},
    ]
    report = _write_report(td, findings)  # 2 blocking on disk
    digest = "d" * 64
    _write_sidecar(td, "security-auditor", "haiku", digest)

    envelope = json.dumps({
        "report_path": str(report),
        "findings_count": 3,
        "blocking_count": 0,   # <-- wrong: disk has 2 blocking
    })

    receipt_path = td / "receipts" / "audit-security-auditor.json"

    with pytest.raises(ValueError):
        receipt_audit_done(
            td, "security-auditor", "haiku", 3, 2, str(report), 100,
            route_mode="replace",
            agent_path="learned/security-auditor.md",
            injected_agent_sha256=digest,
            final_envelope=envelope,
        )

    assert not receipt_path.exists(), "Receipt must NOT be written on blocking_count mismatch"


# ---------------------------------------------------------------------------
# Test 5: final_envelope=None on non-generic → ValueError
# ---------------------------------------------------------------------------

def test_missing_envelope_non_generic_raises(tmp_path: Path):
    """AC 9: final_envelope=None with route_mode='replace' → ValueError.

    The error message must name 'required' or 'non-generic' so the orchestrator
    knows why the receipt was refused.
    """
    td = _make_task(tmp_path)
    digest = "e" * 64
    _write_sidecar(td, "security-auditor", "haiku", digest)

    with pytest.raises(ValueError, match=r"required|non-generic"):
        receipt_audit_done(
            td, "security-auditor", "haiku", 0, 0, None, 100,
            route_mode="replace",
            agent_path="learned/security-auditor.md",
            injected_agent_sha256=digest,
            final_envelope=None,
        )


# ---------------------------------------------------------------------------
# Test 6: final_envelope=None on generic → receipt written, envelope_sha256 is None
# ---------------------------------------------------------------------------

def test_generic_skips_envelope_check(tmp_path: Path):
    """AC 9: final_envelope=None with route_mode='generic' → receipt written.

    envelope_sha256 must be None in the receipt JSON (validation skipped).
    """
    td = _make_task(tmp_path)

    out = receipt_audit_done(
        td, "security-auditor", "haiku", 0, 0, None, 100,
        route_mode="generic",
        agent_path=None,
        injected_agent_sha256=None,
        final_envelope=None,
    )

    assert out.exists(), "Receipt must be written for generic route_mode with no envelope"
    payload = json.loads(out.read_text())
    assert "envelope_sha256" in payload, "envelope_sha256 field must be present in receipt"
    assert payload["envelope_sha256"] is None, (
        "envelope_sha256 must be None when envelope validation was skipped (generic mode)"
    )


# ---------------------------------------------------------------------------
# Test 7: invalid JSON (code-fenced) → ValueError
# ---------------------------------------------------------------------------

def test_invalid_json_envelope_raises(tmp_path: Path):
    """AC 9 / Error 2: code-fenced envelope triggers json.JSONDecodeError → ValueError.

    An auditor that wraps its JSON in markdown fences violates the single-line
    bare JSON contract. The validator must reject it without preprocessing.
    """
    td = _make_task(tmp_path)
    findings = [{"id": "F-1", "blocking": False}]
    report = _write_report(td, findings)
    digest = "f" * 64
    _write_sidecar(td, "security-auditor", "haiku", digest)

    # Code-fenced envelope — json.loads will raise JSONDecodeError
    fenced_envelope = f'```json\n{{"report_path": "{report}", "findings_count": 1, "blocking_count": 0}}\n```'

    with pytest.raises(ValueError):
        receipt_audit_done(
            td, "security-auditor", "haiku", 1, 0, str(report), 100,
            route_mode="replace",
            agent_path="learned/security-auditor.md",
            injected_agent_sha256=digest,
            final_envelope=fenced_envelope,
        )


# ---------------------------------------------------------------------------
# Test 8: non-integer counts → ValueError naming field and type
# ---------------------------------------------------------------------------

def test_non_integer_counts_raise(tmp_path: Path):
    """AC 9 / Error 4: findings_count as string '5' → ValueError naming the field.

    The error message must name the non-integer field and its actual type so
    the orchestrator can diagnose the auditor's emission mistake.
    """
    td = _make_task(tmp_path)
    findings = [{"id": "F-1", "blocking": False}]
    report = _write_report(td, findings)
    digest = "0" * 64
    _write_sidecar(td, "security-auditor", "haiku", digest)

    envelope = json.dumps({
        "report_path": str(report),
        "findings_count": "5",   # <-- string, not int
        "blocking_count": 0,
    })

    with pytest.raises(ValueError, match=r"findings_count|str"):
        receipt_audit_done(
            td, "security-auditor", "haiku", 1, 0, str(report), 100,
            route_mode="replace",
            agent_path="learned/security-auditor.md",
            injected_agent_sha256=digest,
            final_envelope=envelope,
        )
