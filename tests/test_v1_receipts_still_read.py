"""Tests that v1 receipts (no contract_version) remain readable (AC 30)."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "hooks"))

from lib_receipts import read_receipt, validate_chain  # noqa: E402


def _setup(tmp_path: Path, *, stage: str) -> Path:
    project = tmp_path / "project"
    td = project / ".dynos" / "task-20260418-V1"
    td.mkdir(parents=True)
    (td / "manifest.json").write_text(json.dumps({
        "task_id": td.name,
        "stage": stage,
    }))
    (td / "receipts").mkdir()
    return td


def _write_v1_receipt(td: Path, name: str, **payload):
    payload = {"step": name, "ts": "2025-01-01T00:00:00Z", "valid": True, **payload}
    # Critical: NO contract_version field
    (td / "receipts" / f"{name}.json").write_text(json.dumps(payload))


def test_v1_receipt_read_returns_payload(tmp_path: Path):
    td = _setup(tmp_path, stage="EXECUTION")
    _write_v1_receipt(td, "spec-validated", criteria_count=3, spec_sha256="x" * 64)
    out = read_receipt(td, "spec-validated")
    assert out is not None
    assert out["criteria_count"] == 3
    assert "contract_version" not in out


def test_v1_receipt_passes_validate_chain(tmp_path: Path):
    td = _setup(tmp_path, stage="EXECUTION")
    _write_v1_receipt(td, "plan-validated", segment_count=1,
                      criteria_coverage=[1], validation_passed=True)
    gaps = validate_chain(td)
    assert "plan-validated" not in gaps


def test_v1_receipt_with_valid_false_returns_none(tmp_path: Path):
    """Defensive: an invalid v1 receipt must be skipped, even without contract_version."""
    td = _setup(tmp_path, stage="EXECUTION")
    payload = {"step": "spec-validated", "ts": "2025-01-01T00:00:00Z", "valid": False}
    (td / "receipts" / "spec-validated.json").write_text(json.dumps(payload))
    out = read_receipt(td, "spec-validated")
    assert out is None


def test_v1_audit_routing_passes_done_chain(tmp_path: Path):
    """Mix v1 audit-routing + v2 dependent receipts; chain must accept it."""
    td = _setup(tmp_path, stage="DONE")
    # Audit routing without contract_version
    _write_v1_receipt(td, "audit-routing", auditors=[])
    # Other required receipts at DONE
    _write_v1_receipt(td, "plan-validated", segment_count=0, criteria_coverage=[])
    _write_v1_receipt(td, "executor-routing", segments=[])
    _write_v1_receipt(td, "retrospective", quality_score=0.95,
                      cost_score=0.9, efficiency_score=0.9, total_tokens=100)
    _write_v1_receipt(td, "post-completion", handlers_run=[])
    gaps = validate_chain(td)
    assert gaps == [], f"unexpected gaps: {gaps}"
