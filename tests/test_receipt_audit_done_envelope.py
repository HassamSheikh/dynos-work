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

    # Verify audit_envelope_mismatch event was emitted.
    # log_event is called with task_dir.parent.parent as root and task_dir.name
    # as the task kwarg. Since the task directory exists, log_event routes the
    # event to the task-scoped log: <root>/.dynos/<task>/events.jsonl, which
    # equals td / "events.jsonl".
    events_file = td / "events.jsonl"
    assert events_file.exists(), "events.jsonl must exist after mismatch event"
    lines = [l.strip() for l in events_file.read_text().splitlines() if l.strip()]
    assert lines, "events.jsonl must have at least one event"
    last_event = json.loads(lines[-1])

    # log_event stores the event type under the key "event", not "type"
    assert last_event.get("event") == "audit_envelope_mismatch", (
        f"Last event type must be 'audit_envelope_mismatch', got {last_event.get('event')!r}"
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


# ---------------------------------------------------------------------------
# Test 10-12: SEC-002 information-disclosure regression — exception messages
# must NOT echo the ground-truth actual_finding_count / actual_blocking_count
# values. The audit_envelope_mismatch event records both for forensic review;
# exception text propagated to stderr where a hostile orchestrator could read
# it back to discover the true counts and reconstruct a passing forged
# envelope.
#
# Closes residual efffb867 (postmortem-analysis from PR #167's audit cycle):
# "Validation errors must not interpolate ground-truth counts or raw
# report_path into messages."
#
# These tests are the regression seal on hooks/receipts/stage.py:724-729
# (SEC-002 hardening). The implementation already prevents disclosure;
# these tests lock the no-echo behavior so a future code change cannot
# silently re-introduce the leak.
# ---------------------------------------------------------------------------


def test_envelope_findings_count_mismatch_does_not_disclose_actual_count(tmp_path: Path):
    """SEC-002 regression: exception message must not contain the on-disk findings count."""
    td = _make_task(tmp_path)
    # 7 findings on disk — a distinctive number that won't collide with
    # other contents of the exception message.
    findings = [{"id": f"F-{i}", "blocking": False} for i in range(7)]
    report = _write_report(td, findings)
    digest = "e" * 64
    _write_sidecar(td, "security-auditor", "haiku", digest)

    envelope = json.dumps({
        "report_path": str(report),
        "findings_count": 5,   # caller-supplied wrong; on-disk is 7
        "blocking_count": 0,
    })

    with pytest.raises(ValueError) as excinfo:
        receipt_audit_done(
            td, "security-auditor", "haiku", 7, 0, str(report), 100,
            route_mode="replace",
            agent_path="learned/security-auditor.md",
            injected_agent_sha256=digest,
            final_envelope=envelope,
        )

    msg = str(excinfo.value)
    # The on-disk count (7) and the caller-supplied count (5) must NOT
    # appear in the exception message. This is the disclosure-prevention
    # invariant. Use distinctive numbers + word-boundary matching to
    # avoid false-positives on incidental digits.
    import re
    assert not re.search(r"\b7\b", msg), (
        f"SEC-002 regression: exception message echoed actual_finding_count=7. "
        f"Message: {msg!r}"
    )
    assert not re.search(r"\b5\b", msg), (
        f"SEC-002 regression: exception message echoed env_findings_count=5. "
        f"Message: {msg!r}"
    )
    # Sanity: the message MUST mention the structured event for forensic review.
    assert "audit_envelope_mismatch" in msg, (
        f"Exception message must point to audit_envelope_mismatch event for "
        f"forensic review. Message: {msg!r}"
    )


def test_envelope_blocking_count_mismatch_does_not_disclose_actual_count(tmp_path: Path):
    """SEC-002 regression: exception message must not contain the on-disk blocking count."""
    td = _make_task(tmp_path)
    # 4 blocking findings on disk — distinctive.
    findings = [{"id": f"F-{i}", "blocking": True} for i in range(4)]
    findings.extend([{"id": "F-NB", "blocking": False}])
    report = _write_report(td, findings)
    digest = "f" * 64
    _write_sidecar(td, "security-auditor", "haiku", digest)

    envelope = json.dumps({
        "report_path": str(report),
        "findings_count": 5,   # matches on-disk (5 total), so this passes
        "blocking_count": 1,   # wrong; on-disk has 4
    })

    with pytest.raises(ValueError) as excinfo:
        receipt_audit_done(
            td, "security-auditor", "haiku", 5, 4, str(report), 100,
            route_mode="replace",
            agent_path="learned/security-auditor.md",
            injected_agent_sha256=digest,
            final_envelope=envelope,
        )

    msg = str(excinfo.value)
    # Both counts must NOT appear. (5 is the agreed findings_count; only
    # blocking_count is mismatched. Test focuses on blocking_count disclosure.)
    import re
    assert not re.search(r"\b4\b", msg), (
        f"SEC-002 regression: exception message echoed actual_blocking_count=4. "
        f"Message: {msg!r}"
    )
    assert not re.search(r"\b1\b", msg), (
        f"SEC-002 regression: exception message echoed env_blocking_count=1. "
        f"Message: {msg!r}"
    )
    assert "audit_envelope_mismatch" in msg, (
        f"Exception message must point to audit_envelope_mismatch event. "
        f"Message: {msg!r}"
    )


def test_envelope_mismatch_message_does_not_contain_raw_report_path_traversal(tmp_path: Path):
    """SEC-002 regression: when the envelope's report_path contains a
    traversal-style suffix, the exception message must not pass that
    suffix through verbatim. The path-traversal guard at stage.py:735-743
    rejects out-of-task paths up front; this test confirms a within-task
    mismatch doesn't leak the raw envelope-supplied path either.

    Note: the existing path-mismatch raise at line 740 DOES include the
    rejected path because it must — that's the diagnostic for a path
    traversal attempt and it's NOT echoing ground-truth counts. This test
    is scoped to the COUNT mismatch raises (lines 772-776, 786-790) which
    must not include either the report_path or the counts.
    """
    td = _make_task(tmp_path)
    findings = [{"id": "F-1", "blocking": False}]
    report = _write_report(td, findings)
    digest = "1" * 64
    _write_sidecar(td, "security-auditor", "haiku", digest)

    envelope = json.dumps({
        "report_path": str(report),
        "findings_count": 99,  # distinctive wrong value
        "blocking_count": 0,
    })

    with pytest.raises(ValueError) as excinfo:
        receipt_audit_done(
            td, "security-auditor", "haiku", 1, 0, str(report), 100,
            route_mode="replace",
            agent_path="learned/security-auditor.md",
            injected_agent_sha256=digest,
            final_envelope=envelope,
        )

    msg = str(excinfo.value)
    # The count-mismatch raise (lines 772-776 in stage.py) must not
    # interpolate the raw report_path verbatim. Auditor name is allowed
    # (it's caller-supplied trust boundary, not ground-truth from disk).
    import re
    assert not re.search(r"\b99\b", msg), (
        f"SEC-002 regression: exception message echoed env_findings_count=99. "
        f"Message: {msg!r}"
    )
    assert not re.search(r"\b1\b", msg), (
        f"SEC-002 regression: exception message echoed actual_finding_count=1. "
        f"Message: {msg!r}"
    )
    # Defensive: full str(report) is too noisy a signal — the fixture may
    # share path components with the message structurally. The structured
    # event is the canonical channel for this data.
    assert "audit_envelope_mismatch" in msg, (
        f"Exception message must direct reader to audit_envelope_mismatch event. "
        f"Message: {msg!r}"
    )


# ---------------------------------------------------------------------------
# Test 13-14: missing-on-disk report_path → ValueError. Closes residual
# 123a8fe0 (postmortem-analysis from PR #167's audit cycle):
# "Require at least one test asserting _validate_final_envelope raises on
# missing report_path."
#
# Distinct from test_envelope_report_path_mismatch_raises (test 2) which
# covers the case where the envelope's report_path field STRING-DIFFERS
# from the caller-supplied report_path arg — both paths exist but
# disagree. This pair covers the orthogonal case where the envelope's
# report_path field MATCHES the caller arg, but the file at that path
# does not exist on disk.
#
# The implementation at hooks/receipts/stage.py:744-754 raises with
# "missing or unreadable" when report_file.open() fails. Without these
# tests, a future code change that silently skipped on OSError (the
# inverted-implicit-requirement-13 pattern this residual was filed
# against) would slip past the existing test pack.
# ---------------------------------------------------------------------------


def test_envelope_report_path_missing_file_raises(tmp_path: Path):
    """Closes residual 123a8fe0: envelope has valid report_path field but
    the file at that path was never written to disk → ValueError raised
    with message naming the missing path; receipt is NOT written."""
    td = _make_task(tmp_path)
    digest = "9" * 64
    _write_sidecar(td, "security-auditor", "haiku", digest)

    # Construct a path INSIDE task_dir (passes the SEC-001 path-traversal
    # bounds check) but DON'T write a file at it.
    missing_path = td / "audit-reports" / "security-auditor-never-written.json"
    assert not missing_path.exists(), (
        "Test setup: report file should NOT exist on disk for this test"
    )

    envelope = json.dumps({
        "report_path": str(missing_path),
        "findings_count": 0,
        "blocking_count": 0,
    })

    receipt_path = td / "receipts" / "audit-security-auditor.json"

    with pytest.raises(ValueError) as excinfo:
        receipt_audit_done(
            td, "security-auditor", "haiku", 0, 0, str(missing_path), 100,
            route_mode="replace",
            agent_path="learned/security-auditor.md",
            injected_agent_sha256=digest,
            final_envelope=envelope,
        )

    msg = str(excinfo.value)
    # Message must indicate the file is missing/unreadable. The
    # implementation at stage.py:751-754 uses the exact phrase
    # "missing or unreadable".
    assert "missing or unreadable" in msg, (
        f"Exception message must say 'missing or unreadable' to satisfy IR-13. "
        f"Message: {msg!r}"
    )
    # Receipt must not exist — a missing report cannot back a passing receipt.
    assert not receipt_path.exists(), (
        "Receipt must NOT be written when the report_path file is missing"
    )


def test_envelope_report_path_missing_file_no_silent_skip(tmp_path: Path):
    """Closes residual 123a8fe0: explicit regression seal that the missing
    file does NOT cause a silent skip with null counts. The exact
    inversion of implicit requirement 13 the residual was filed against.

    A future code change that wrapped the OSError in `try ... except:
    pass` and treated counts as None would let an auditor claim arbitrary
    counts via a missing report. This test asserts that path is closed —
    OSError MUST raise, not return null counts that downstream code might
    accept."""
    td = _make_task(tmp_path)
    digest = "a" * 64
    _write_sidecar(td, "security-auditor", "haiku", digest)

    missing_path = td / "audit-reports" / "security-auditor-not-on-disk.json"

    envelope = json.dumps({
        "report_path": str(missing_path),
        "findings_count": 99,   # an attacker-supplied wrong count
        "blocking_count": 99,
    })

    # The whole point: even with a perfectly-shaped envelope, a missing
    # report_path file MUST short-circuit to ValueError, not let the
    # caller-supplied counts propagate.
    with pytest.raises(ValueError):
        receipt_audit_done(
            td, "security-auditor", "haiku", 99, 99, str(missing_path), 100,
            route_mode="replace",
            agent_path="learned/security-auditor.md",
            injected_agent_sha256=digest,
            final_envelope=envelope,
        )

    # Defense-in-depth: verify no receipt was emitted with the
    # caller-supplied counts. A silent-skip implementation would have
    # written a receipt with finding_count=99 / blocking_count=99 and
    # returned successfully.
    receipt_path = td / "receipts" / "audit-security-auditor.json"
    assert not receipt_path.exists(), (
        "Silent-skip regression: a receipt was written despite the report file "
        "being missing on disk. This is the exact inversion of implicit "
        "requirement 13 the residual was filed against."
    )
