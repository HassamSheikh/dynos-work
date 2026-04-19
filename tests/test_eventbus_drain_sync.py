"""Tests for `python3 hooks/eventbus.py drain --sync --task-dir <dir>` (AC 24)."""
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
EVENTBUS = ROOT / "hooks" / "eventbus.py"


def _make_root(tmp_path: Path, *, stage: str = "DONE") -> Path:
    root = tmp_path / "project"
    (root / ".dynos" / "events").mkdir(parents=True)
    (root / ".dynos" / "events.jsonl").touch()
    return root


def _make_task(root: Path, *, stage: str) -> Path:
    td = root / ".dynos" / "task-20260418-DR"
    td.mkdir(parents=True, exist_ok=True)
    (td / "manifest.json").write_text(json.dumps({
        "task_id": "task-20260418-DR",
        "stage": stage,
        "classification": {"risk_level": "medium"},
    }))
    return td


def _run(*args: str, cwd: Path | None = None) -> subprocess.CompletedProcess:
    env = {**os.environ, "PYTHONPATH": str(ROOT / "hooks")}
    return subprocess.run(
        [sys.executable, str(EVENTBUS), *args],
        text=True, capture_output=True, check=False, env=env,
        cwd=str(cwd or ROOT),
    )


def test_already_calibrated_is_idempotent(tmp_path: Path):
    root = _make_root(tmp_path)
    td = _make_task(root, stage="CALIBRATED")
    r = _run("drain", "--sync", "--task-dir", str(td), "--root", str(root))
    assert r.returncode == 0, r.stderr
    assert "already CALIBRATED" in r.stdout or "already CALIBRATED" in r.stderr


def test_sync_drain_returns_zero_on_no_events(tmp_path: Path):
    root = _make_root(tmp_path)
    td = _make_task(root, stage="DONE")
    r = _run("drain", "--sync", "--task-dir", str(td), "--root", str(root))
    # No queued task-completed event => no-op drain returns 0
    assert r.returncode == 0, r.stderr


def test_drain_sync_flag_is_recognized(tmp_path: Path):
    root = _make_root(tmp_path)
    r = _run("drain", "--sync", "--task-dir", str(tmp_path / "missing"),
             "--root", str(root))
    # Even with a non-existent task dir, the flag must be parsed without error
    # (it just falls through to drain itself, which produces no events).
    assert r.returncode in (0, 1), f"unexpected exit {r.returncode}: {r.stderr}"
    # Ensure argparse did not reject --sync as an unknown option
    assert "unrecognized arguments" not in r.stderr
