"""Tests for receipt_spec_validated writer (AC 15)."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "hooks"))

from lib_receipts import hash_file, receipt_spec_validated  # noqa: E402


def _task_dir(tmp_path: Path) -> Path:
    project = tmp_path / "project"
    td = project / ".dynos" / "task-20260418-SV"
    td.mkdir(parents=True)
    return td


def test_happy_path(tmp_path: Path):
    td = _task_dir(tmp_path)
    out = receipt_spec_validated(td, criteria_count=5, spec_sha256="a" * 64)
    assert out.exists()
    payload = json.loads(out.read_text())
    assert payload["criteria_count"] == 5
    assert payload["spec_sha256"] == "a" * 64
    assert payload["valid"] is True
    assert payload["step"] == "spec-validated"


def test_rejects_negative_criteria_count(tmp_path: Path):
    td = _task_dir(tmp_path)
    with pytest.raises(ValueError, match="criteria_count"):
        receipt_spec_validated(td, criteria_count=-1, spec_sha256="a" * 64)


def test_rejects_non_int_criteria_count(tmp_path: Path):
    td = _task_dir(tmp_path)
    with pytest.raises(ValueError, match="criteria_count"):
        receipt_spec_validated(td, criteria_count="five", spec_sha256="a" * 64)  # type: ignore[arg-type]


def test_rejects_empty_spec_sha256(tmp_path: Path):
    td = _task_dir(tmp_path)
    with pytest.raises(ValueError, match="spec_sha256"):
        receipt_spec_validated(td, criteria_count=3, spec_sha256="")


def test_drift_detectable_via_hash(tmp_path: Path):
    """When spec.md content drifts the receipt-captured hash no longer
    equals hash_file(spec.md). Tests can rely on this for downstream
    validate-style checks."""
    td = _task_dir(tmp_path)
    spec = td / "spec.md"
    spec.write_text("original spec\n")
    sha_before = hash_file(spec)
    receipt_spec_validated(td, criteria_count=2, spec_sha256=sha_before)
    spec.write_text("modified spec\n")
    sha_after = hash_file(spec)
    assert sha_before != sha_after
    payload = json.loads((td / "receipts" / "spec-validated.json").read_text())
    assert payload["spec_sha256"] != sha_after
