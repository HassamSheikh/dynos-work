"""TDD-first test for PRO-006 inject-prompt size guardrail.

AC covered: 36.

This test will FAIL with AssertionError until segment-E-router inserts the
size-check block in cmd_planner_inject_prompt (no planner_prompt_oversize event
is emitted by the current production code). That is the expected TDD-first state.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from unittest import mock

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "hooks"))

ROOT = Path(__file__).resolve().parent.parent

# 100,001 bytes — just over the 100,000-byte cap defined in _MAX_INJECTED_PROMPT_BYTES
_OVERSIZE_BYTES = b"x" * 100_001


def test_planner_inject_prompt_oversize_emits_event_and_writes_sidecar(tmp_path: Path):
    """AC 36: Feeding 100,001 bytes to cmd_planner_inject_prompt:
    (a) emits a planner_prompt_oversize event with phase='planner' in .dynos/events.jsonl,
    (b) writes the .sha256 sidecar file under receipts/_injected-planner-prompts/,
    (c) returns 0.

    The test will FAIL until segment-E adds the size-check block after the stdin read.
    """
    from router import cmd_planner_inject_prompt

    # Build the project directory structure that log_event and cmd_planner_inject_prompt expect
    dynos_dir = tmp_path / ".dynos"
    dynos_dir.mkdir(parents=True)

    # Create the task directory so log_event's task-scoped branch can fire
    # (log_event routes to task-scoped log when task dir exists AND task= kwarg given;
    # the spec's log_event call uses task_id= payload kwarg not task= routing kwarg,
    # so the event will land in the global .dynos/events.jsonl fallback)
    task_dir = dynos_dir / "task-test-001"
    task_dir.mkdir(parents=True)

    # Pre-create global events.jsonl so the write policy sees "modify" not "create"
    global_events = dynos_dir / "events.jsonl"
    global_events.write_text("")

    # Construct the argparse.Namespace that cmd_planner_inject_prompt expects
    args = argparse.Namespace(
        task_id="task-test-001",
        phase="discovery",
        root=str(tmp_path),
    )

    # cmd_planner_inject_prompt does `import sys as _sys` locally, then calls
    # `_sys.stdin.buffer.read()`. Since _sys IS sys, patching sys.stdin.buffer
    # is the correct intercept point.
    fake_buffer = mock.MagicMock()
    fake_buffer.read.return_value = _OVERSIZE_BYTES
    fake_stdin = mock.MagicMock()
    fake_stdin.buffer = fake_buffer

    with mock.patch("sys.stdin", fake_stdin):
        result = cmd_planner_inject_prompt(args)

    # (c) Return value must be 0
    assert result == 0, f"Expected return value 0, got {result}"

    # (b) Sidecar .sha256 file must exist
    from lib_receipts import INJECTED_PLANNER_PROMPTS_DIR
    sidecar_path = task_dir / "receipts" / INJECTED_PLANNER_PROMPTS_DIR / "discovery.sha256"
    assert sidecar_path.exists(), (
        f"Expected sidecar at {sidecar_path} but it was not created"
    )

    # (a) planner_prompt_oversize event must appear in events.jsonl
    # The spec's log_event call uses task_id= (payload kwarg) not task= (routing kwarg),
    # so the event goes to the global .dynos/events.jsonl fallback.
    # However, if the task directory exists, some implementations may use the task-scoped log.
    # Check both locations.
    event_found = False
    event_files = [
        global_events,
        task_dir / "events.jsonl",
    ]
    for event_file in event_files:
        if not event_file.exists():
            continue
        for raw_line in event_file.read_text(encoding="utf-8").splitlines():
            raw_line = raw_line.strip()
            if not raw_line:
                continue
            try:
                record = json.loads(raw_line)
            except json.JSONDecodeError:
                continue
            if record.get("event") == "planner_prompt_oversize":
                assert record.get("phase") == "planner", (
                    f"Expected phase='planner' in event, got {record.get('phase')!r}"
                )
                assert record.get("size_bytes", 0) >= 100_001, (
                    f"Expected size_bytes >= 100001, got {record.get('size_bytes')!r}"
                )
                event_found = True
                break
        if event_found:
            break

    assert event_found, (
        "No planner_prompt_oversize event found in events.jsonl. "
        "segment-E-router must insert the size-check block in cmd_planner_inject_prompt."
    )
