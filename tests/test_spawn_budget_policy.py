"""Tests for spawn-budget policy engine, ctl check-spawn-budget, ctl spawn-resume,
and auto-approve-veto spawn_budget_paused ceiling.

Covers AC-14 (13 exact test names) and AC-15 (full suite passes, no skip/xfail).
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "memory"))
sys.path.insert(0, str(ROOT / "hooks"))

from policy_engine import _build_spawn_budget_policy_data
import ctl
from receipts.budget import (
    receipt_spawn_budget_paused,
    receipt_spawn_budget_resumed,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _retro(
    task_id: str,
    task_type: str,
    risk_level: str,
    wasted_spawns: int,
    *,
    computed_at: str = "2026-05-01T00:00:00Z",
    streaks: dict | None = None,
) -> dict:
    """Build a minimal retrospective dict for policy-engine tests."""
    r: dict = {
        "task_id": task_id,
        "task_type": task_type,
        "risk_level": risk_level,
        "wasted_spawns": wasted_spawns,
        "computed_at": computed_at,
    }
    if streaks is not None:
        r["auditor_zero_finding_streaks"] = streaks
    return r


def _make_task_dir(
    tmp_path: Path,
    *,
    task_id: str = "task-test-001",
    classification: dict | None = None,
    blocked_reason: str | None = None,
    auto_approve_gates: bool | None = None,
) -> Path:
    """Create a minimal task directory with manifest.json."""
    task_dir = tmp_path / ".dynos" / task_id
    task_dir.mkdir(parents=True, exist_ok=True)
    cls = classification or {
        "type": "feature",
        "risk_level": "medium",
        "domains": ["backend"],
    }
    manifest: dict = {
        "task_id": task_id,
        "created_at": "2026-05-06T00:00:00Z",
        "title": "Spawn budget test",
        "raw_input": "x",
        "stage": "AUDIT",
        "classification": cls,
        "retry_counts": {},
        "blocked_reason": blocked_reason,
        "completion_at": None,
    }
    if auto_approve_gates is not None:
        manifest["auto_approve_gates"] = auto_approve_gates
    (task_dir / "manifest.json").write_text(json.dumps(manifest, indent=2))
    return task_dir


def _write_audit_report(
    task_dir: Path,
    auditor: str,
    findings: list,
    *,
    filename: str | None = None,
) -> Path:
    """Write a wasted (empty findings) or non-wasted audit report."""
    reports_dir = task_dir / "audit-reports"
    reports_dir.mkdir(parents=True, exist_ok=True)
    fname = filename or f"{auditor}.json"
    report = {"auditor": auditor, "findings": findings}
    p = reports_dir / fname
    p.write_text(json.dumps(report, indent=2))
    return p


def _write_spawn_budget_policy(
    persistent_dir: Path,
    *,
    per_task_class: dict | None = None,
    exempt_auditors: list | None = None,
    global_fallback_threshold: int = 2,
) -> None:
    """Write spawn-budget-policy.json into the persistent dir."""
    persistent_dir.mkdir(parents=True, exist_ok=True)
    policy = {
        "version": 1,
        "computed_at": "2026-05-06T00:00:00Z",
        "per_task_class": per_task_class or {},
        "global_fallback": {"threshold_count": global_fallback_threshold},
        "exempt_auditors": exempt_auditors or [],
    }
    (persistent_dir / "spawn-budget-policy.json").write_text(
        json.dumps(policy, indent=2)
    )


def _set_dynos_home(monkeypatch, tmp_path: Path) -> Path:
    """Set DYNOS_HOME env var and return the persistent project dir for cwd."""
    dynos_home = tmp_path / "dynos_home"
    monkeypatch.setenv("DYNOS_HOME", str(dynos_home))
    return dynos_home


def _persistent_for_cwd(dynos_home: Path) -> Path:
    """Compute the persistent project dir for the current working directory.

    Mirrors the slug logic in lib_core._persistent_project_dir when not inside
    a git repo (tmp_path is outside the project git tree).
    """
    slug = str(Path.cwd().resolve()).strip("/").replace("/", "-")
    return dynos_home / "projects" / slug


# ---------------------------------------------------------------------------
# AC-14 Tests
# ---------------------------------------------------------------------------


def test_policy_emits_per_class_statistics():
    """Policy engine emits n_observations, baseline, stddev, and threshold for
    a class with >= 3 retrospectives."""
    retros = [
        _retro("t1", "feature", "medium", 3, computed_at="2026-05-01T00:00:00Z"),
        _retro("t2", "feature", "medium", 5, computed_at="2026-05-02T00:00:00Z"),
        _retro("t3", "feature", "medium", 4, computed_at="2026-05-03T00:00:00Z"),
    ]
    policy = _build_spawn_budget_policy_data(retros)
    entry = policy["per_task_class"]["feature:medium"]
    assert entry["n_observations"] == 3
    # mean = 4.0, sample stddev of [3, 5, 4] = 1.0, threshold = max(2, min(10, ceil(4 + 2*1))) = 6
    assert entry["waste_count_baseline"] == pytest.approx(4.0)
    assert entry["waste_count_stddev"] == pytest.approx(1.0)
    assert entry["threshold_count"] == 6


def test_policy_cold_start_omits_class():
    """Policy engine omits a class with fewer than 3 observations (cold start)."""
    retros = [
        _retro("t1", "feature", "low", 1),
        _retro("t2", "feature", "low", 2),
    ]
    policy = _build_spawn_budget_policy_data(retros)
    assert "feature:low" not in policy["per_task_class"]


def test_exempt_auditors_derived_from_streaks():
    """Auditors with streak >= 5 in the most-recent retro per task are exempt."""
    retros = [
        _retro(
            "t1",
            "feature",
            "medium",
            0,
            streaks={"vision-auditor": 6},
            computed_at="2026-05-03T00:00:00Z",
        ),
        _retro(
            "t2",
            "feature",
            "medium",
            0,
            streaks={"vision-auditor": 5},
            computed_at="2026-05-02T00:00:00Z",
        ),
    ]
    policy = _build_spawn_budget_policy_data(retros)
    assert "vision-auditor" in policy["exempt_auditors"]


def test_exempt_auditors_excludes_reset_streak():
    """When the same task has two retros, the latest computed_at wins.
    If the latest retro shows streak < 5, auditor is NOT exempt."""
    retros = [
        _retro(
            "t1",
            "feature",
            "medium",
            0,
            streaks={"vision-auditor": 6},
            computed_at="2026-05-01T00:00:00Z",
        ),
        _retro(
            "t1",
            "feature",
            "medium",
            0,
            streaks={"vision-auditor": 3},
            computed_at="2026-05-02T00:00:00Z",
        ),
    ]
    policy = _build_spawn_budget_policy_data(retros)
    assert "vision-auditor" not in policy["exempt_auditors"]


def test_check_spawn_budget_ok_under_threshold_cold_start(
    tmp_path, monkeypatch, capsys
):
    """check-spawn-budget returns status=ok when no policy file exists (cold start)
    and count < fallback threshold of 2."""
    dynos_home = _set_dynos_home(monkeypatch, tmp_path)
    monkeypatch.chdir(tmp_path)
    task_dir = _make_task_dir(tmp_path)

    # Write one wasted audit report (count=1 < threshold=2)
    _write_audit_report(task_dir, "code-quality-auditor", [])

    args = argparse.Namespace(task_dir=str(task_dir))
    rc = ctl.cmd_check_spawn_budget(args)
    out = capsys.readouterr().out.strip()
    assert rc == 0
    payload = json.loads(out)
    assert payload["status"] == "ok"
    assert payload["count"] == 1
    assert payload["threshold"] == 2  # global fallback


def test_check_spawn_budget_paused_above_learned_threshold(
    tmp_path, monkeypatch, capsys
):
    """check-spawn-budget returns status=paused and writes receipt when count >= threshold."""
    dynos_home = _set_dynos_home(monkeypatch, tmp_path)
    monkeypatch.chdir(tmp_path)

    # Policy with learned threshold of 3 for feature:medium
    persistent = _persistent_for_cwd(dynos_home)
    _write_spawn_budget_policy(
        persistent,
        per_task_class={
            "feature:medium": {
                "threshold_count": 3,
                "waste_count_baseline": 2.0,
                "waste_count_stddev": 0.5,
                "n_observations": 5,
            }
        },
    )

    task_dir = _make_task_dir(tmp_path)
    # Write 3 wasted reports => count=3 >= threshold=3
    _write_audit_report(task_dir, "code-quality-auditor", [], filename="r1.json")
    _write_audit_report(task_dir, "dead-code-auditor", [], filename="r2.json")
    _write_audit_report(task_dir, "db-schema-auditor", [], filename="r3.json")

    args = argparse.Namespace(task_dir=str(task_dir))
    rc = ctl.cmd_check_spawn_budget(args)
    out = capsys.readouterr().out.strip()
    assert rc == 0
    payload = json.loads(out)
    assert payload["status"] == "paused"
    assert payload["count"] == 3
    assert payload["threshold"] == 3
    assert payload["task_class"] == "feature:medium"

    # Manifest must be updated
    manifest = json.loads((task_dir / "manifest.json").read_text())
    assert manifest["blocked_reason"] == "wasted_spawns_exceeded"

    # Receipt must be written
    assert (task_dir / "receipts" / "spawn-budget-paused.json").is_file()


def test_check_spawn_budget_uses_global_fallback_threshold(
    tmp_path, monkeypatch, capsys
):
    """When per_task_class lookup misses, the threshold is read from
    policy['global_fallback']['threshold_count'], not the top-level key.

    Regression: the original implementation read policy['threshold_count']
    which silently always fell back to the hardcoded literal 2 because the
    schema places the threshold under 'global_fallback'. With a policy file
    setting global_fallback.threshold_count=5 and only 4 wasted reports,
    the broken path emitted status='paused' (4 >= 2). The fix reads the
    nested path so the same input emits status='ok' (4 < 5).
    """
    dynos_home = _set_dynos_home(monkeypatch, tmp_path)
    monkeypatch.chdir(tmp_path)

    # Policy file with global_fallback=5 and NO matching per_task_class
    # entry. Reader must consult the nested path to honor the 5.
    persistent = _persistent_for_cwd(dynos_home)
    _write_spawn_budget_policy(
        persistent,
        per_task_class={},  # no entry for "feature:medium"
        global_fallback_threshold=5,
    )

    task_dir = _make_task_dir(tmp_path)
    # 4 wasted reports — between the broken-default 2 and the configured 5.
    for i in range(4):
        _write_audit_report(
            task_dir, f"auditor-{i}", [], filename=f"r{i}.json"
        )

    args = argparse.Namespace(task_dir=str(task_dir))
    rc = ctl.cmd_check_spawn_budget(args)
    out = capsys.readouterr().out.strip()
    assert rc == 0
    payload = json.loads(out)
    # If the bug regresses, threshold would be 2 and status would be "paused".
    assert payload["threshold"] == 5
    assert payload["count"] == 4
    assert payload["status"] == "ok"


def test_ensemble_cascade_final_tier_only_counted(tmp_path, monkeypatch, capsys):
    """For ensemble auditors, only the final (highest mtime) report is counted.
    Earlier reports are deduplicated away."""
    dynos_home = _set_dynos_home(monkeypatch, tmp_path)
    monkeypatch.chdir(tmp_path)

    # Policy: threshold 2 for feature:medium (learned)
    persistent = _persistent_for_cwd(dynos_home)
    _write_spawn_budget_policy(
        persistent,
        per_task_class={
            "feature:medium": {
                "threshold_count": 2,
                "waste_count_baseline": 1.0,
                "waste_count_stddev": 0.0,
                "n_observations": 3,
            }
        },
    )

    task_dir = _make_task_dir(tmp_path)

    # Write audit-plan.json marking "vision-auditor" as ensemble
    (task_dir / "audit-plan.json").write_text(
        json.dumps({"auditors": [{"name": "vision-auditor", "ensemble": True}]})
    )

    # Two wasted reports for the same ensemble auditor (simulating cascade tiers)
    # The final tier (r2.json) has findings, so it is NOT wasted -> count stays 0
    reports_dir = task_dir / "audit-reports"
    reports_dir.mkdir(parents=True, exist_ok=True)
    import time

    p1 = reports_dir / "vision-auditor-r1.json"
    p1.write_text(json.dumps({"auditor": "vision-auditor", "findings": []}))
    time.sleep(0.01)  # ensure different mtime
    p2 = reports_dir / "vision-auditor-r2.json"
    p2.write_text(json.dumps({"auditor": "vision-auditor", "findings": ["finding"]}))

    # One non-ensemble wasted report
    _write_audit_report(task_dir, "dead-code-auditor", [], filename="dead-code.json")

    args = argparse.Namespace(task_dir=str(task_dir))
    rc = ctl.cmd_check_spawn_budget(args)
    out = capsys.readouterr().out.strip()
    assert rc == 0
    payload = json.loads(out)
    # Only dead-code-auditor counts as wasted (count=1); vision-auditor's final
    # report has findings so is not wasted after dedup
    assert payload["count"] == 1
    assert payload["status"] == "ok"


def test_ensemble_cascade_succeeded_not_wasted(tmp_path, monkeypatch, capsys):
    """An ensemble auditor whose final (latest mtime) report has findings is NOT
    counted as wasted, even if earlier cascade tiers were empty."""
    dynos_home = _set_dynos_home(monkeypatch, tmp_path)
    monkeypatch.chdir(tmp_path)
    persistent = _persistent_for_cwd(dynos_home)
    _write_spawn_budget_policy(persistent)

    task_dir = _make_task_dir(tmp_path)
    (task_dir / "audit-plan.json").write_text(
        json.dumps({"auditors": [{"name": "spec-auditor", "ensemble": True}]})
    )

    reports_dir = task_dir / "audit-reports"
    reports_dir.mkdir(parents=True, exist_ok=True)
    import time

    p1 = reports_dir / "spec-auditor-tier1.json"
    p1.write_text(json.dumps({"auditor": "spec-auditor", "findings": []}))
    time.sleep(0.01)
    p2 = reports_dir / "spec-auditor-tier2.json"
    p2.write_text(json.dumps({"auditor": "spec-auditor", "findings": ["real-finding"]}))

    args = argparse.Namespace(task_dir=str(task_dir))
    rc = ctl.cmd_check_spawn_budget(args)
    out = capsys.readouterr().out.strip()
    assert rc == 0
    payload = json.loads(out)
    assert payload["count"] == 0
    assert payload["status"] == "ok"


def test_exempt_auditor_not_counted(tmp_path, monkeypatch, capsys):
    """Auditors listed in policy exempt_auditors are NOT counted toward the budget."""
    dynos_home = _set_dynos_home(monkeypatch, tmp_path)
    monkeypatch.chdir(tmp_path)

    persistent = _persistent_for_cwd(dynos_home)
    _write_spawn_budget_policy(
        persistent,
        per_task_class={
            "feature:medium": {
                "threshold_count": 2,
                "waste_count_baseline": 1.0,
                "waste_count_stddev": 0.0,
                "n_observations": 3,
            }
        },
        exempt_auditors=["vision-auditor"],
    )

    task_dir = _make_task_dir(tmp_path)

    # Two wasted reports: one exempt, one not
    _write_audit_report(task_dir, "vision-auditor", [], filename="exempt.json")
    _write_audit_report(task_dir, "dead-code-auditor", [], filename="nonexempt.json")

    args = argparse.Namespace(task_dir=str(task_dir))
    rc = ctl.cmd_check_spawn_budget(args)
    out = capsys.readouterr().out.strip()
    assert rc == 0
    payload = json.loads(out)
    # Only dead-code-auditor counts (1 < threshold 2)
    assert payload["count"] == 1
    assert payload["exempt_count"] == 1
    assert payload["status"] == "ok"


def test_spawn_resume_clears_pause(tmp_path, monkeypatch, capsys):
    """cmd_spawn_resume clears blocked_reason and writes spawn-budget-resumed receipt."""
    dynos_home = _set_dynos_home(monkeypatch, tmp_path)
    monkeypatch.chdir(tmp_path)
    task_dir = _make_task_dir(tmp_path, blocked_reason="wasted_spawns_exceeded")

    args = argparse.Namespace(
        task_dir=str(task_dir),
        reason="enough chars to clear the pause cleanly",
    )
    rc = ctl.cmd_spawn_resume(args)
    out = capsys.readouterr().out.strip()
    assert rc == 0
    assert json.loads(out) == {"status": "resumed"}

    manifest = json.loads((task_dir / "manifest.json").read_text())
    # blocked_reason should be cleared (None or absent)
    assert manifest.get("blocked_reason") in (None,)

    assert (task_dir / "receipts" / "spawn-budget-resumed.json").is_file()


def test_spawn_resume_rejects_short_reason(tmp_path, monkeypatch, capsys):
    """cmd_spawn_resume returns rc=1 and does NOT mutate manifest when reason < 20 chars."""
    dynos_home = _set_dynos_home(monkeypatch, tmp_path)
    monkeypatch.chdir(tmp_path)
    task_dir = _make_task_dir(tmp_path, blocked_reason="wasted_spawns_exceeded")

    args = argparse.Namespace(task_dir=str(task_dir), reason="short")
    rc = ctl.cmd_spawn_resume(args)
    err = capsys.readouterr().err
    assert rc == 1
    assert "--reason must be at least 20 characters" in err

    manifest = json.loads((task_dir / "manifest.json").read_text())
    assert manifest.get("blocked_reason") == "wasted_spawns_exceeded"  # NOT mutated


def test_spawn_resume_noop_when_not_paused(tmp_path, monkeypatch, capsys):
    """cmd_spawn_resume returns already_resumed and writes no receipt when not paused."""
    dynos_home = _set_dynos_home(monkeypatch, tmp_path)
    monkeypatch.chdir(tmp_path)
    task_dir = _make_task_dir(tmp_path)  # no blocked_reason

    args = argparse.Namespace(
        task_dir=str(task_dir),
        reason="long enough rationale here please",
    )
    rc = ctl.cmd_spawn_resume(args)
    out = capsys.readouterr().out.strip()
    assert rc == 0
    assert json.loads(out) == {"status": "already_resumed"}
    assert not (task_dir / "receipts" / "spawn-budget-resumed.json").exists()


def test_auto_approve_veto_downgrades_when_paused(tmp_path, monkeypatch, capsys):
    """cmd_apply_auto_approve_veto sets auto_approve_gates=False and blocked_by=spawn_budget_paused
    when manifest.blocked_reason == wasted_spawns_exceeded."""
    dynos_home = _set_dynos_home(monkeypatch, tmp_path)
    monkeypatch.chdir(tmp_path)

    task_dir = _make_task_dir(
        tmp_path,
        classification={
            "type": "feature",
            "risk_level": "medium",
            "domains": ["backend"],
        },
        blocked_reason="wasted_spawns_exceeded",
        auto_approve_gates=True,
    )

    args = argparse.Namespace(task_dir=str(task_dir))
    rc = ctl.cmd_apply_auto_approve_veto(args)
    out = capsys.readouterr().out.strip()
    assert rc == 0
    payload = json.loads(out)
    assert payload["auto_approve_gates"] is False
    assert payload["blocked_by"] == "spawn_budget_paused"

    manifest = json.loads((task_dir / "manifest.json").read_text())
    assert manifest["auto_approve_gates"] is False
    policy = manifest["classification"]["auto_approval_policy"]
    assert policy["blocked_by"] == "spawn_budget_paused"
    assert policy["basis"]["spawn_budget_paused"] is True
    assert "spawn_budget_paused" in policy["ceilings_checked"]
