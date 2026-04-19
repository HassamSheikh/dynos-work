"""Tests for SPEC_REVIEW -> PLANNING gate (AC 3)."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "hooks"))

from lib_core import transition_task  # noqa: E402
from lib_receipts import hash_file, receipt_human_approval  # noqa: E402


def _setup(tmp_path: Path, *, spec_text: str = "spec content\n") -> Path:
    project = tmp_path / "project"
    td = project / ".dynos" / "task-20260418-S"
    td.mkdir(parents=True)
    (td / "manifest.json").write_text(json.dumps({
        "task_id": "task-20260418-S",
        "stage": "SPEC_REVIEW",
        "classification": {"risk_level": "medium"},
    }))
    (td / "spec.md").write_text(spec_text)
    return td


def test_missing_receipt_refuses(tmp_path: Path):
    td = _setup(tmp_path)
    with pytest.raises(ValueError, match="human-approval-SPEC_REVIEW"):
        transition_task(td, "PLANNING")


def test_hash_drift_refuses(tmp_path: Path):
    td = _setup(tmp_path)
    sha = hash_file(td / "spec.md")
    receipt_human_approval(td, "SPEC_REVIEW", sha)
    # Drift the spec after approval
    (td / "spec.md").write_text("modified content\n")
    with pytest.raises(ValueError, match="hash mismatch"):
        transition_task(td, "PLANNING")


def test_force_bypass_succeeds(tmp_path: Path):
    td = _setup(tmp_path)
    # No receipt; force=True must succeed
    transition_task(td, "PLANNING", force=True)
    manifest = json.loads((td / "manifest.json").read_text())
    assert manifest["stage"] == "PLANNING"


def test_matching_hash_passes(tmp_path: Path):
    td = _setup(tmp_path)
    sha = hash_file(td / "spec.md")
    receipt_human_approval(td, "SPEC_REVIEW", sha)
    transition_task(td, "PLANNING")
    manifest = json.loads((td / "manifest.json").read_text())
    assert manifest["stage"] == "PLANNING"
