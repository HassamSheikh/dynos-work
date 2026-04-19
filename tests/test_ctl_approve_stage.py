"""Subprocess tests for `python3 hooks/ctl.py approve-stage`."""
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]


SPEC_TEMPLATE = (
    "# Normalized Spec\n\n"
    "## Task Summary\nA.\n\n"
    "## User Context\nB.\n\n"
    "## Acceptance Criteria\n1. one\n2. two\n\n"
    "## Implicit Requirements Surfaced\nC.\n\n"
    "## Out of Scope\nD.\n\n"
    "## Assumptions\nsafe assumption: none\n\n"
    "## Risk Notes\nE.\n"
)


def _make_task(tmp_path: Path, stage: str = "SPEC_REVIEW") -> Path:
    task_dir = tmp_path / ".dynos" / "task-20260418-A"
    task_dir.mkdir(parents=True)
    (task_dir / "manifest.json").write_text(
        json.dumps(
            {
                "task_id": "task-20260418-A",
                "created_at": "2026-04-18T00:00:00Z",
                "title": "Test",
                "raw_input": "x",
                "stage": stage,
                "classification": {
                    "type": "feature",
                    "domains": ["backend"],
                    "risk_level": "medium",
                    "notes": "n",
                },
                "retry_counts": {},
                "blocked_reason": None,
                "completion_at": None,
            },
            indent=2,
        )
    )
    (task_dir / "spec.md").write_text(SPEC_TEMPLATE)
    return task_dir


def _run(env_dir: Path, *args: str) -> subprocess.CompletedProcess:
    env = {**os.environ}
    env["PYTHONPATH"] = str(ROOT / "hooks")
    return subprocess.run(
        [sys.executable, str(ROOT / "hooks" / "ctl.py"), *args],
        cwd=str(ROOT),
        text=True,
        capture_output=True,
        check=False,
        env=env,
    )


def test_happy_path_advances_stage_and_writes_receipt(tmp_path: Path):
    task_dir = _make_task(tmp_path, "SPEC_REVIEW")
    r = _run(tmp_path, "approve-stage", str(task_dir), "SPEC_REVIEW")
    assert r.returncode == 0, r.stderr
    receipt = task_dir / "receipts" / "human-approval-SPEC_REVIEW.json"
    assert receipt.exists()
    payload = json.loads(receipt.read_text())
    assert payload["approver"] == "human"
    assert len(payload["artifact_sha256"]) == 64
    manifest = json.loads((task_dir / "manifest.json").read_text())
    assert manifest["stage"] == "PLANNING"


def test_unknown_stage_exits_one(tmp_path: Path):
    task_dir = _make_task(tmp_path)
    r = _run(tmp_path, "approve-stage", str(task_dir), "BOGUS_STAGE")
    assert r.returncode == 1
    assert "unknown stage" in r.stderr
    # No receipt written and stage unchanged
    receipts_dir = task_dir / "receipts"
    if receipts_dir.exists():
        assert not list(receipts_dir.glob("human-approval-*.json"))
    manifest = json.loads((task_dir / "manifest.json").read_text())
    assert manifest["stage"] == "SPEC_REVIEW"


def test_missing_artifact_exits_one(tmp_path: Path):
    task_dir = _make_task(tmp_path, "SPEC_REVIEW")
    (task_dir / "spec.md").unlink()
    r = _run(tmp_path, "approve-stage", str(task_dir), "SPEC_REVIEW")
    assert r.returncode == 1
    assert "missing artifact" in r.stderr or "spec.md" in r.stderr


def test_does_not_register_force_flag(tmp_path: Path):
    task_dir = _make_task(tmp_path, "SPEC_REVIEW")
    r = _run(tmp_path, "approve-stage", str(task_dir), "SPEC_REVIEW", "--force")
    # argparse rejects unknown flag with exit code 2
    assert r.returncode != 0
