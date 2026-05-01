"""TDD-first tests for active-segment-role lockdown (task-20260430-004).

Closes the self-elevation primitive that enabled the audit-chain forgery
incident: an orchestrator running as `execute-inline` could write the
string `audit-spec-completion` to `.dynos/task-{id}/active-segment-role`,
which the next call's role-resolution chain would treat as authoritative,
re-entering write_policy with role=`audit-spec-completion`. That role
unlocks `audit-reports/` writes, so the orchestrator could then materialize
synthetic auditor reports.

Mechanical fix:
  - active-segment-role joins _WRAPPER_REQUIRED in write_policy.py;
    direct writes from any agent role are denied with a wrapper hint.
  - hooks/ctl.py grows a `stamp-role` subcommand that performs the
    canonical write under role=ctl. The command validates the role
    string against an explicit allowlist (subset of executor roles —
    audit-* roles cannot be stamped this way; auditors run in their own
    subagent context with role resolved at spawn time, not via
    orchestrator-stamped role files).

Tests:
  (a) Direct Write to active-segment-role is denied (exit 2).
  (b) Bash redirection (`printf '%s' x > active-segment-role`) is denied
      via the Bash pre-filter (exit 2).
  (c) `python3 hooks/ctl.py stamp-role <task_dir> --role <r>` writes
      the file when <r> is a valid executor role.
  (d) `stamp-role` rejects audit-* roles with exit 1 and a stderr
      message that names the lockdown rationale.
  (e) `stamp-role` rejects unknown role strings with exit 1.
"""
from __future__ import annotations

import json
import os
import stat
import subprocess
import sys
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[1]
HOOK_PATH = ROOT / "hooks" / "pre-tool-use"
CTL_PATH = ROOT / "hooks" / "ctl.py"


def _hook_available() -> bool:
    if not HOOK_PATH.exists():
        return False
    try:
        mode = HOOK_PATH.stat().st_mode
    except OSError:
        return False
    return bool(mode & (stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH))


def _make_task_dir(tmp_path: Path) -> tuple[Path, Path]:
    project_root = tmp_path / "project"
    project_root.mkdir()
    (project_root / ".dynos").mkdir()
    task_dir = project_root / ".dynos" / "task-20260430-998"
    task_dir.mkdir()
    (task_dir / "manifest.json").write_text(json.dumps({"task_id": task_dir.name}))
    return project_root, task_dir


# ---------------------------------------------------------------------------
# (a) direct Write to active-segment-role denied
# ---------------------------------------------------------------------------
@pytest.mark.skipif(not _hook_available(), reason="hooks/pre-tool-use not present")
def test_direct_write_to_active_segment_role_denied(tmp_path: Path):
    project_root, task_dir = _make_task_dir(tmp_path)
    target = task_dir / "active-segment-role"
    payload = {
        "tool_name": "Write",
        "tool_input": {"file_path": str(target), "content": "audit-spec-completion"},
        "cwd": str(project_root),
    }
    env = {**os.environ, "DYNOS_TASK_DIR": str(task_dir)}
    env.pop("DYNOS_ROLE", None)
    proc = subprocess.run(
        ["bash", str(HOOK_PATH)],
        cwd=str(project_root),
        input=json.dumps(payload),
        capture_output=True,
        text=True,
        env=env,
        timeout=30,
    )
    assert proc.returncode == 2, (
        f"direct Write to active-segment-role must be denied; "
        f"rc={proc.returncode} stderr={proc.stderr}"
    )
    assert "write-policy:" in proc.stderr
    assert "stamp-role" in proc.stderr or "wrapper" in proc.stderr.lower()


# ---------------------------------------------------------------------------
# (b) Bash redirection denied
# ---------------------------------------------------------------------------
@pytest.mark.skipif(not _hook_available(), reason="hooks/pre-tool-use not present")
def test_bash_redirect_to_active_segment_role_denied(tmp_path: Path):
    project_root, task_dir = _make_task_dir(tmp_path)
    role_file_rel = f".dynos/{task_dir.name}/active-segment-role"
    payload = {
        "tool_name": "Bash",
        "tool_input": {
            "command": f"printf '%s' 'audit-spec-completion' > {role_file_rel}",
        },
        "cwd": str(project_root),
    }
    env = {**os.environ, "DYNOS_TASK_DIR": str(task_dir), "DYNOS_ROLE": "execute-inline"}
    proc = subprocess.run(
        ["bash", str(HOOK_PATH)],
        cwd=str(project_root),
        input=json.dumps(payload),
        capture_output=True,
        text=True,
        env=env,
        timeout=30,
    )
    assert proc.returncode == 2, (
        f"Bash redirection to active-segment-role must be denied; "
        f"rc={proc.returncode} stderr={proc.stderr}"
    )


# ---------------------------------------------------------------------------
# (c) ctl stamp-role wrapper writes the role file
# ---------------------------------------------------------------------------
def test_ctl_stamp_role_writes_role_file(tmp_path: Path):
    project_root, task_dir = _make_task_dir(tmp_path)
    proc = subprocess.run(
        [sys.executable, str(CTL_PATH), "stamp-role", str(task_dir), "--role", "backend-executor"],
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert proc.returncode == 0, f"stamp-role failed: rc={proc.returncode} stderr={proc.stderr}"
    role_file = task_dir / "active-segment-role"
    assert role_file.is_file(), "stamp-role did not create active-segment-role"
    assert role_file.read_text().strip() == "backend-executor"


# ---------------------------------------------------------------------------
# (d) stamp-role accepts audit-* roles when in the allowlist
# ---------------------------------------------------------------------------
# NOTE: the original test_ctl_stamp_role_rejects_audit_roles was inverted on
# 2026-04-30 after we recognized that refusing audit-* in stamp-role broke
# the legitimate auditor write path: a real auditor subagent that runs and
# writes its own audit-report needs role=audit-* set in the role file, and
# the only legitimate way to set the role file is through this wrapper.
# Forgery defense for audit-* claims lives downstream at receipt_audit_done,
# which cross-checks against the hook-owned spawn-log.jsonl. Stamping
# audit-spec-completion without a matching real spawn produces nothing
# useful — the auditor never ran, no report lands on disk, the receipt
# fails. See task-20260430-005 for the design rationale.
def test_ctl_stamp_role_accepts_audit_roles(tmp_path: Path):
    project_root, task_dir = _make_task_dir(tmp_path)
    proc = subprocess.run(
        [sys.executable, str(CTL_PATH), "stamp-role", str(task_dir), "--role", "audit-spec-completion"],
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert proc.returncode == 0, f"audit-* role must be accepted: rc={proc.returncode} stderr={proc.stderr}"
    role_file = task_dir / "active-segment-role"
    assert role_file.is_file()
    assert role_file.read_text().strip() == "audit-spec-completion"


# ---------------------------------------------------------------------------
# (e) stamp-role refuses unknown role strings
# ---------------------------------------------------------------------------
def test_ctl_stamp_role_rejects_unknown_role(tmp_path: Path):
    project_root, task_dir = _make_task_dir(tmp_path)
    proc = subprocess.run(
        [sys.executable, str(CTL_PATH), "stamp-role", str(task_dir), "--role", "nonsense-role"],
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert proc.returncode == 1
    assert "nonsense-role" in proc.stderr or "allowlist" in proc.stderr.lower()
