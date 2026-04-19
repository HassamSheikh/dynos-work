"""Tests for receipt_human_approval writer."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "hooks"))

from lib_receipts import receipt_human_approval  # noqa: E402


def _task_dir(tmp_path: Path) -> Path:
    project = tmp_path / "project"
    dynos = project / ".dynos"
    td = dynos / "task-20260418-T"
    td.mkdir(parents=True)
    return td


def test_happy_path_writes_receipt_with_required_fields(tmp_path: Path):
    td = _task_dir(tmp_path)
    sha = "a" * 64
    out = receipt_human_approval(td, "SPEC_REVIEW", sha, approver="human")
    assert out.exists()
    payload = json.loads(out.read_text())
    assert payload["stage"] == "SPEC_REVIEW"
    assert payload["artifact_sha256"] == sha
    assert payload["approver"] == "human"
    assert payload["valid"] is True


def test_payload_step_name_is_human_approval_stage(tmp_path: Path):
    td = _task_dir(tmp_path)
    out = receipt_human_approval(td, "PLAN_REVIEW", "b" * 64)
    payload = json.loads(out.read_text())
    assert payload["step"] == "human-approval-PLAN_REVIEW"
    assert out.name == "human-approval-PLAN_REVIEW.json"


def test_default_approver_is_human(tmp_path: Path):
    td = _task_dir(tmp_path)
    out = receipt_human_approval(td, "TDD_REVIEW", "c" * 64)
    payload = json.loads(out.read_text())
    assert payload["approver"] == "human"


def test_rejects_path_separator_in_stage(tmp_path: Path):
    td = _task_dir(tmp_path)
    with pytest.raises(ValueError, match="path separators"):
        receipt_human_approval(td, "SPEC/EVIL", "d" * 64)


def test_rejects_empty_stage(tmp_path: Path):
    td = _task_dir(tmp_path)
    with pytest.raises(ValueError, match="non-empty"):
        receipt_human_approval(td, "", "d" * 64)


def test_rejects_empty_artifact_sha256(tmp_path: Path):
    td = _task_dir(tmp_path)
    with pytest.raises(ValueError, match="artifact_sha256"):
        receipt_human_approval(td, "SPEC_REVIEW", "")
