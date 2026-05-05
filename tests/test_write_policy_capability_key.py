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
    from write_policy import require_write_allowed, _get_capability_key  # noqa: F401 — import both per plan

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
    from write_policy import require_write_allowed, _get_capability_key

    task_dir = tmp_path / ".dynos" / "task-test-rw"
    task_dir.mkdir(parents=True)
    (task_dir / "receipts").mkdir(parents=True, exist_ok=True)
    attempt = _make_receipt_writer_attempt(task_dir)

    with pytest.raises(ValueError) as exc_info:
        require_write_allowed(attempt, capability_key=_get_capability_key("ctl"))

    assert "capability_key mismatch" in str(exc_info.value)


def test_require_write_allowed_correct_capability_key_passes(tmp_path: Path):
    """AC 11: Passing the correct capability_key for the attempt's role does not raise.

    attempt.role is 'ctl', capability_key is get_capability_key('ctl'),
    and the path is manifest.json which decide_write permits for ctl.
    No exception should be raised.
    """
    from write_policy import require_write_allowed, _get_capability_key

    task_dir = tmp_path / ".dynos" / "task-test-pass"
    task_dir.mkdir(parents=True)
    attempt = _make_ctl_attempt(task_dir)

    # Must not raise; capture raised exception explicitly to produce a useful failure message
    raised = None
    try:
        require_write_allowed(attempt, capability_key=_get_capability_key("ctl"), emit_event=False)
    except Exception as exc:
        raised = exc
    assert raised is None, f"Expected no exception but got {type(raised).__name__}: {raised}"


# AC-13
def test_forge_via_tautological_path(tmp_path: Path) -> None:
    """AC 13: Adversarial forge via tautological path — _append_jsonl rejects mismatched key.

    An attacker controls WriteAttempt(role="ctl", ...) and routes it through
    _append_jsonl. The _append_jsonl caller (simulated here as an eventbus caller)
    supplies _get_capability_key("eventbus") — its own role's key, not the attacker's
    claimed role's key.

    After segment-D, _append_jsonl requires a caller-supplied capability_key and
    forwards it directly to require_write_allowed, which checks identity against
    _CAPABILITY_KEYS.get(attempt.role). Since the eventbus key does not equal the
    ctl key, require_write_allowed raises ValueError containing 'capability_key mismatch'.

    This test will be RED on main (segment-D not yet applied) because:
      (a) _append_jsonl still derives the key from attempt.role (tautological),
          making the mismatch check impossible, AND
      (b) _get_capability_key does not yet exist (segment-B not yet applied).
    """
    from lib_log import _append_jsonl  # noqa: PLC0415
    from write_policy import WriteAttempt, _get_capability_key  # noqa: PLC0415

    # Attacker constructs a WriteAttempt claiming the high-privilege 'ctl' role
    task_dir = tmp_path / ".dynos" / "task-x"
    task_dir.mkdir(parents=True)
    manifest_path = task_dir / "manifest.json"

    attacker_attempt = WriteAttempt(
        role="ctl",
        task_dir=task_dir,
        path=manifest_path,
        operation="modify",
        source="ctl",
    )

    # Simulate an eventbus caller passing its own role's key — NOT the attacker's key.
    # After segment-D this must raise ValueError with "capability_key mismatch" because
    # the eventbus key is not the ctl key.
    with pytest.raises(ValueError, match="capability_key mismatch"):
        _append_jsonl(
            manifest_path,
            '{"event": "forge_attempt"}\n',
            attempt=attacker_attempt,
            capability_key=_get_capability_key("eventbus"),
        )


# AC-14
def test_attempt_none_safety_role(tmp_path: Path) -> None:
    """AC 14: _atomic_write_bytes(path, data, attempt=None) closes the dormant bypass.

    After segment-E, when attempt is None, _atomic_write_bytes constructs a
    WriteAttempt(role='system', task_dir=None, ...) and calls require_write_allowed
    with _get_capability_key('system'). Because task_dir=None, _emit_policy_event
    returns early without any file I/O, so no stub is needed.

    Assertions:
      1. No exception is raised.
      2. The output file exists after the call.
      3. The output file contains exactly the bytes that were written.
      4. _get_capability_key('system') is importable from write_policy — confirming
         the private-name rename has landed (segment-B).

    This test will be RED on main (segment-E not yet applied) because:
      (a) _get_capability_key does not yet exist in write_policy (segment-B not yet applied),
          so the import below raises ImportError; AND
      (b) after segment-B lands but before segment-E, _atomic_write_bytes still skips
          the policy check entirely when attempt=None — the bypass is still open.
          The file write succeeds via bypass; the test passes for the wrong reason
          until segment-E lands and closes the bypass with the system-role policy check.
    """
    import router  # noqa: PLC0415
    from write_policy import _get_capability_key  # noqa: PLC0415 — RED on main until segment-B

    out_path = tmp_path / "out.bin"
    data = b"data"

    # Verify _get_capability_key("system") is callable and returns an object
    # (the system sentinel). This is the key _atomic_write_bytes must use internally
    # when constructing the safety-role attempt (segment-E post-condition).
    system_key = _get_capability_key("system")
    assert system_key is not None, "_get_capability_key('system') must return a non-None sentinel"

    # Must not raise — the system safety role permits non-task writes (task_dir=None)
    router._atomic_write_bytes(out_path, data, attempt=None)

    assert out_path.exists(), (
        "_atomic_write_bytes(attempt=None) did not create the output file"
    )
    assert out_path.read_bytes() == data, (
        f"Output file content mismatch: expected {data!r}, got {out_path.read_bytes()!r}"
    )
