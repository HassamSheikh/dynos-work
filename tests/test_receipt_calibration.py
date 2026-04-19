"""Tests for receipt_calibration_applied writer (AC 21)."""
from __future__ import annotations

import json
import sys
from pathlib import Path
from unittest import mock

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "hooks"))

import lib_receipts  # noqa: E402
from lib_receipts import receipt_calibration_applied  # noqa: E402


def _task_dir(tmp_path: Path) -> Path:
    project = tmp_path / "project"
    td = project / ".dynos" / "task-20260418-CA"
    td.mkdir(parents=True)
    return td


def test_happy_path(tmp_path: Path):
    td = _task_dir(tmp_path)
    out = receipt_calibration_applied(
        td, retros_consumed=3, scores_updated=2,
        policy_sha256_before="a" * 64, policy_sha256_after="b" * 64,
    )
    assert out.exists()
    payload = json.loads(out.read_text())
    assert payload["retros_consumed"] == 3
    assert payload["scores_updated"] == 2
    assert payload["policy_sha256_before"] == "a" * 64
    assert payload["policy_sha256_after"] == "b" * 64
    assert payload["valid"] is True


def test_record_tokens_NOT_invoked(tmp_path: Path):
    """Calibration is deterministic; no token recording should occur."""
    td = _task_dir(tmp_path)
    with mock.patch.object(lib_receipts, "_record_tokens") as rt:
        receipt_calibration_applied(td, 1, 1, "a" * 64, "b" * 64)
    assert not rt.called


def test_rejects_negative_counts(tmp_path: Path):
    td = _task_dir(tmp_path)
    with pytest.raises(ValueError, match="retros_consumed"):
        receipt_calibration_applied(td, -1, 0, "a" * 64, "b" * 64)
    with pytest.raises(ValueError, match="scores_updated"):
        receipt_calibration_applied(td, 0, -2, "a" * 64, "b" * 64)


def test_rejects_empty_policy_hashes(tmp_path: Path):
    td = _task_dir(tmp_path)
    with pytest.raises(ValueError, match="policy_sha256_before"):
        receipt_calibration_applied(td, 0, 0, "", "b" * 64)
    with pytest.raises(ValueError, match="policy_sha256_after"):
        receipt_calibration_applied(td, 0, 0, "a" * 64, "")
