"""TDD-first tests for PRO-001 CapabilityKey enforcement.

ACs covered: 9, 10, 11.

These tests will FAIL with ImportError or TypeError until segment-A-write-policy
adds _CAPABILITY_KEYS, get_capability_key, and the new require_write_allowed
signature with required capability_key kwarg. That is the expected TDD-first state.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "hooks"))

ROOT = Path(__file__).resolve().parent.parent


def _make_ctl_attempt(task_dir: Path) -> object:
    """Build a WriteAttempt for role='ctl' that decide_write will permit."""
    from write_policy import WriteAttempt
    manifest_path = task_dir / "manifest.json"
    return WriteAttempt(
        role="ctl",
        task_dir=task_dir,
        path=manifest_path,
        operation="modify",
        source="ctl",
    )


def _make_receipt_writer_attempt(task_dir: Path) -> object:
    """Build a WriteAttempt for role='receipt-writer' that decide_write permits."""
    from write_policy import WriteAttempt
    receipt_path = task_dir / "receipts" / "some-receipt.json"
    return WriteAttempt(
        role="receipt-writer",
        task_dir=task_dir,
        path=receipt_path,
        operation="create",
        source="receipt-writer",
    )


def test_require_write_allowed_missing_capability_key_raises_typeerror(tmp_path: Path):
    """AC 9: Calling require_write_allowed without capability_key raises TypeError.

    After segment-A, capability_key is a required keyword-only argument with no
    default. Python must raise TypeError for missing required kwarg.
    """
    from write_policy import require_write_allowed, get_capability_key  # noqa: F401 — import both per plan

    task_dir = tmp_path / ".dynos" / "task-test-ctl"
    task_dir.mkdir(parents=True)
    attempt = _make_ctl_attempt(task_dir)

    with pytest.raises(TypeError):
        require_write_allowed(attempt)


def test_require_write_allowed_wrong_capability_key_raises_valueerror(tmp_path: Path):
    """AC 10: Passing capability_key for a different role raises ValueError with 'capability_key mismatch'.

    attempt.role is 'receipt-writer' but the key supplied is for 'ctl'.
    The identity check must catch this and raise ValueError.
    """
    from write_policy import require_write_allowed, get_capability_key

    task_dir = tmp_path / ".dynos" / "task-test-rw"
    task_dir.mkdir(parents=True)
    (task_dir / "receipts").mkdir(parents=True, exist_ok=True)
    attempt = _make_receipt_writer_attempt(task_dir)

    with pytest.raises(ValueError) as exc_info:
        require_write_allowed(attempt, capability_key=get_capability_key("ctl"))

    assert "capability_key mismatch" in str(exc_info.value)


def test_require_write_allowed_correct_capability_key_passes(tmp_path: Path):
    """AC 11: Passing the correct capability_key for the attempt's role does not raise.

    attempt.role is 'ctl', capability_key is get_capability_key('ctl'),
    and the path is manifest.json which decide_write permits for ctl.
    No exception should be raised.
    """
    from write_policy import require_write_allowed, get_capability_key

    task_dir = tmp_path / ".dynos" / "task-test-pass"
    task_dir.mkdir(parents=True)
    attempt = _make_ctl_attempt(task_dir)

    # Must not raise; capture raised exception explicitly to produce a useful failure message
    raised = None
    try:
        require_write_allowed(attempt, capability_key=get_capability_key("ctl"), emit_event=False)
    except Exception as exc:
        raised = exc
    assert raised is None, f"Expected no exception but got {type(raised).__name__}: {raised}"
