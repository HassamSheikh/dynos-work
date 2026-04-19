"""Tests that telemetry tolerates new stages without KeyError (AC 28b)."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "hooks"))


def test_reconcile_stage_handles_calibrated_manifest(tmp_path: Path):
    """Loading a manifest with stage=CALIBRATED through telemetry/dashboard.py
    must not raise KeyError or any uncaught exception."""
    from telemetry.dashboard import reconcile_stage

    td = tmp_path / ".dynos" / "task-20260418-TT"
    td.mkdir(parents=True)
    manifest = {
        "task_id": td.name,
        "stage": "CALIBRATED",
        "classification": {"risk_level": "medium"},
    }
    (td / "manifest.json").write_text(json.dumps(manifest))
    (td / "execution-log.md").write_text("[STAGE] DONE -> CALIBRATED\n")

    out = reconcile_stage(td, manifest)
    assert isinstance(out, dict)
    # Stage must remain CALIBRATED (or at least be a string we can work with)
    assert isinstance(out.get("stage"), str)


def test_reconcile_stage_handles_tdd_review_log_line(tmp_path: Path):
    from telemetry.dashboard import reconcile_stage

    td = tmp_path / ".dynos" / "task-20260418-TR"
    td.mkdir(parents=True)
    manifest = {
        "task_id": td.name,
        "stage": "PLAN_AUDIT",
    }
    (td / "manifest.json").write_text(json.dumps(manifest))
    (td / "execution-log.md").write_text("[STAGE] PLAN_AUDIT \u2192 TDD_REVIEW\n")
    # Should not raise. Unknown stage in STAGE_ORDER is treated as 0,
    # so progression isn't asserted — only that no exception fires.
    out = reconcile_stage(td, manifest)
    assert isinstance(out, dict)


def test_reconcile_stage_does_not_crash_on_unknown_stage(tmp_path: Path):
    from telemetry.dashboard import reconcile_stage

    td = tmp_path / ".dynos" / "task-20260418-UN"
    td.mkdir(parents=True)
    manifest = {
        "task_id": td.name,
        "stage": "TOTALLY_NEW_STAGE",
    }
    (td / "manifest.json").write_text(json.dumps(manifest))
    (td / "execution-log.md").write_text("[STAGE] X \u2192 Y\n")
    out = reconcile_stage(td, manifest)
    assert isinstance(out, dict)
