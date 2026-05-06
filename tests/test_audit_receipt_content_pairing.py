"""TDD-first tests for audit-receipt content pairing (task-20260430-021).

Defense-in-depth on top of the spawn-log presence check landed in
task-20260430-006. The presence check refuses receipts when no
agent_spawn_post matches the auditor; this layer goes further: when
both the spawn-log post entry AND the on-disk audit-report file are
present, receipt_audit_done emits an `audit_receipt_content_paired`
event recording the report file's sha256 alongside the post entry's
result_sha256. A reviewer can then spot mismatches forensically.

Why telemetry rather than a hard check: the agent's return text is
prose with structured JSON embedded; the audit-report file is the
extracted JSON. A strict sha256 equality would always fail. A
substring-or-soft check has too many false-negatives to gate on. The
event-based pairing creates a paper trail without breaking legitimate
flows.

Tests:
  - When both spawn-log and report file exist, the receipt write emits
    an `audit_receipt_content_paired` event with both hashes and the
    auditor name.
  - When the report file is missing (auditor returned text but did not
    materialize), the existing report-existence check at higher layers
    handles it; this test asserts the pairing event is NOT emitted in
    that case (no file, no pairing).
"""
from __future__ import annotations

import hashlib
import json
import sys
import time
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "hooks"))

from lib_receipts import receipt_audit_done  # noqa: E402


def _task_dir(tmp_path: Path) -> Path:
    project = tmp_path / "project"
    td = project / ".dynos" / "task-20260430-CP"
    td.mkdir(parents=True)
    return td


def _write_sidecar(td: Path, auditor: str, model: str, digest: str) -> Path:
    sidecar_dir = td / "receipts" / "_injected-auditor-prompts"
    sidecar_dir.mkdir(parents=True, exist_ok=True)
    p = sidecar_dir / f"{auditor}-{model}.sha256"
    p.write_text(digest)
    return p


def _write_spawn_log(td: Path, entries: list[dict]) -> Path:
    p = td / "spawn-log.jsonl"
    with p.open("w", encoding="utf-8") as fh:
        for e in entries:
            fh.write(json.dumps(e) + "\n")
    return p


def _ts() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _read_events(td: Path) -> list[dict]:
    """Read events from BOTH task-scoped and global event logs.
    log_event prefers task-scoped when task=<id> is passed and the task
    dir exists; otherwise it falls back to the global log."""
    out: list[dict] = []
    for candidate in (td / "events.jsonl", td.parent.parent / ".dynos" / "events.jsonl"):
        if not candidate.is_file():
            continue
        for ln in candidate.read_text().splitlines():
            ln = ln.strip()
            if not ln:
                continue
            try:
                out.append(json.loads(ln))
            except json.JSONDecodeError:
                continue
    return out


def test_content_pairing_event_emitted_when_report_and_post_both_present(tmp_path: Path):
    td = _task_dir(tmp_path)
    digest = "a" * 64
    _write_sidecar(td, "security-auditor", "haiku", digest)
    _write_spawn_log(td, [
        {"phase": "post", "tool": "Agent", "subagent_type": "security-auditor",
         "result_sha256": "r" * 64, "stop_reason": "end_turn", "timestamp": _ts()},
    ])
    audit_dir = td / "audit-reports"
    audit_dir.mkdir()
    report_content = json.dumps({"findings": [], "auditor": "security-auditor"}, indent=2)
    report_path = audit_dir / "security-auditor-checkpoint-001.json"
    report_path.write_text(report_content)
    expected_report_sha = hashlib.sha256(report_content.encode("utf-8")).hexdigest()

    envelope = json.dumps({"report_path": str(report_path), "findings_count": 0, "blocking_count": 0})
    receipt_audit_done(
        td, "security-auditor", "haiku", 0, 0, str(report_path), 100,
        route_mode="replace", agent_path="learned/x.md",
        injected_agent_sha256=digest,
        final_envelope=envelope,
    )

    events = _read_events(td)
    pairing = [e for e in events if e.get("event") == "audit_receipt_content_paired"]
    assert pairing, f"expected an audit_receipt_content_paired event; events seen: {[e.get('event') for e in events][-10:]}"
    e = pairing[-1]
    assert e.get("auditor_name") == "security-auditor"
    assert e.get("report_sha256") == expected_report_sha
    assert e.get("result_sha256") == "r" * 64


def test_no_pairing_event_when_report_file_missing(tmp_path: Path):
    """When report_path is None (no on-disk file the receipt is binding to),
    the pairing event is not emitted — there's nothing to pair against.

    Uses route_mode='generic' because task-20260506-002's final-envelope
    contract makes 'replace' + report_path=None unreachable: the validator
    requires either an envelope (which would also need a report file to
    cross-check counts) or generic mode. The pairing-event semantics
    (no report → no pairing) are independent of route_mode."""
    td = _task_dir(tmp_path)
    _write_spawn_log(td, [
        {"phase": "post", "tool": "Agent", "subagent_type": "security-auditor",
         "result_sha256": "r" * 64, "stop_reason": "end_turn", "timestamp": _ts()},
    ])

    receipt_audit_done(
        td, "security-auditor", "haiku", 0, 0, None, 100,
        route_mode="generic", agent_path=None,
        injected_agent_sha256=None,
    )

    events = _read_events(td)
    pairing = [e for e in events if e.get("event") == "audit_receipt_content_paired"]
    assert not pairing, f"pairing event must not fire when report file is absent; got: {pairing}"
