"""AC 26: rules_engine install-hook CLI behaviour and bash-runnability.

Five tests:
  (a) Fresh git repo + no hook → install-hook writes
      .git/hooks/pre-commit with mode 0o755 and the dynos marker.
  (b) Re-running install-hook in the same repo is idempotent (exit 0).
  (c) Pre-existing non-dynos hook + no --force → exit 1 refusal,
      original hook bytes preserved.
  (d) --force overwrites a pre-existing non-dynos hook.
  (e) Running the installed hook (bash) against a staged-violation
      tmp repo exits non-zero (the engine reports >= 1 error).
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
ENGINE = ROOT / "hooks" / "rules_engine.py"
DYNOS_HOOKS_DIR = ROOT / "hooks"

HOOK_MARKER = "# dynos-rules-engine v1"


def _git(repo: Path, *args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["git", "-C", str(repo), *args],
        capture_output=True, text=True, check=True,
    )


def _init_repo(tmp_path: Path) -> Path:
    repo = tmp_path / "repo"
    repo.mkdir()
    _git(repo, "init", "--quiet")
    # Make commits possible without a globally-set user.
    _git(repo, "config", "user.email", "tester@example.invalid")
    _git(repo, "config", "user.name", "Tester")
    return repo


def _run_install(repo: Path, *, force: bool = False) -> subprocess.CompletedProcess:
    args = [sys.executable, str(ENGINE), "install-hook"]
    if force:
        args.append("--force")
    env = {**os.environ, "PYTHONPATH": str(DYNOS_HOOKS_DIR)}
    # The CLI uses Path.cwd() to discover the repo, so cwd MUST be inside
    # the tmp repo.
    return subprocess.run(
        args, cwd=str(repo), capture_output=True, text=True,
        check=False, env=env,
    )


# ---------------------------------------------------------------------------
# (a) Fresh install
# ---------------------------------------------------------------------------


def test_install_hook_writes_executable_marker_file(tmp_path):
    repo = _init_repo(tmp_path)
    r = _run_install(repo)
    assert r.returncode == 0, f"stderr={r.stderr!r}"
    hook_path = repo / ".git" / "hooks" / "pre-commit"
    assert hook_path.exists(), "pre-commit hook must be written"
    content = hook_path.read_text()
    assert HOOK_MARKER in content, (
        f"hook content must include marker {HOOK_MARKER!r}; got: {content!r}"
    )
    mode = hook_path.stat().st_mode & 0o777
    assert mode == 0o755, f"hook mode must be 0o755, got {oct(mode)}"


# ---------------------------------------------------------------------------
# (b) Idempotent re-run
# ---------------------------------------------------------------------------


def test_install_hook_is_idempotent(tmp_path):
    repo = _init_repo(tmp_path)
    r1 = _run_install(repo)
    assert r1.returncode == 0
    hook_path = repo / ".git" / "hooks" / "pre-commit"
    bytes1 = hook_path.read_bytes()

    r2 = _run_install(repo)
    assert r2.returncode == 0, f"second install must exit 0; stderr={r2.stderr!r}"
    bytes2 = hook_path.read_bytes()
    assert bytes2 == bytes1, "idempotent re-run must NOT alter hook bytes"


# ---------------------------------------------------------------------------
# (c) Refuse to overwrite non-dynos hook without --force
# ---------------------------------------------------------------------------


def test_install_hook_refuses_existing_non_dynos_hook(tmp_path):
    repo = _init_repo(tmp_path)
    hooks_dir = repo / ".git" / "hooks"
    hooks_dir.mkdir(parents=True, exist_ok=True)
    hook_path = hooks_dir / "pre-commit"
    foreign_body = "#!/usr/bin/env bash\necho 'foreign hook'\nexit 0\n"
    hook_path.write_text(foreign_body)
    hook_path.chmod(0o755)

    r = _run_install(repo)
    assert r.returncode == 1, (
        f"refusal must exit 1, got {r.returncode}; stderr={r.stderr!r}"
    )
    # Original bytes preserved.
    assert hook_path.read_text() == foreign_body, (
        "refusal path must NOT clobber the existing foreign hook"
    )
    assert "refusal" in r.stderr.lower() or "force" in r.stderr.lower()


# ---------------------------------------------------------------------------
# (d) --force overwrites
# ---------------------------------------------------------------------------


def test_install_hook_force_overwrites_non_dynos_hook(tmp_path):
    repo = _init_repo(tmp_path)
    hooks_dir = repo / ".git" / "hooks"
    hooks_dir.mkdir(parents=True, exist_ok=True)
    hook_path = hooks_dir / "pre-commit"
    foreign = "#!/usr/bin/env bash\necho 'foreign hook'\nexit 0\n"
    hook_path.write_text(foreign)
    hook_path.chmod(0o755)

    r = _run_install(repo, force=True)
    assert r.returncode == 0, f"--force must succeed; stderr={r.stderr!r}"
    new_content = hook_path.read_text()
    assert HOOK_MARKER in new_content, (
        "--force must replace foreign hook with dynos hook (marker present)"
    )
    assert "foreign hook" not in new_content, (
        "foreign hook content must be gone after --force"
    )


# ---------------------------------------------------------------------------
# (e) Running the installed hook against a staged-violation repo
# ---------------------------------------------------------------------------


def test_installed_hook_fails_on_staged_violation(tmp_path):
    """The installed hook script invokes the rules engine via
    `git rev-parse --show-toplevel`. We make that resolve into a
    workspace whose `hooks/rules_engine.py` is the real engine and
    whose persistent rules dir contains a single `pattern_must_not_appear`
    rule — then we stage a Python file containing the forbidden literal
    and confirm the hook exits non-zero."""
    workspace = tmp_path / "violation_repo"
    workspace.mkdir()
    # Symlink the real hooks/ directory into the workspace so the
    # installed hook (`exec python3 .../hooks/rules_engine.py ...`)
    # finds the engine.
    (workspace / "hooks").symlink_to(DYNOS_HOOKS_DIR)

    _git(workspace, "init", "--quiet")
    _git(workspace, "config", "user.email", "tester@example.invalid")
    _git(workspace, "config", "user.name", "Tester")

    # Set up persistent rules dir under a tmp DYNOS_HOME. The persistent
    # dir slug is derived from the repo's main worktree path; the
    # engine derives that via `git rev-parse --git-common-dir`.
    home = tmp_path / "dynos-home"
    home.mkdir()
    slug = str(workspace.resolve()).strip("/").replace("/", "-")
    persistent = home / "projects" / slug
    persistent.mkdir(parents=True, exist_ok=True)
    rules = {
        "rules": [
            {
                "rule_id": "r-no-bad-literal",
                "template": "pattern_must_not_appear",
                "params": {
                    "regex": r"FORBIDDEN_LITERAL_TOKEN_XYZ",
                    "scope": "*.py",
                },
                "severity": "error",
            }
        ]
    }
    (persistent / "prevention-rules.json").write_text(json.dumps(rules))

    # Install the hook (cwd inside the workspace).
    r_install = subprocess.run(
        [sys.executable, str(ENGINE), "install-hook"],
        cwd=str(workspace), capture_output=True, text=True,
        env={**os.environ, "PYTHONPATH": str(DYNOS_HOOKS_DIR), "DYNOS_HOME": str(home)},
        check=False,
    )
    assert r_install.returncode == 0, (
        f"install-hook setup failed; stderr={r_install.stderr!r}"
    )
    hook_path = workspace / ".git" / "hooks" / "pre-commit"
    assert hook_path.exists()

    # Stage a violating file.
    bad_file = workspace / "naughty.py"
    bad_file.write_text("X = 'FORBIDDEN_LITERAL_TOKEN_XYZ'\n")
    _git(workspace, "add", "naughty.py")

    # Run the hook directly with bash. The hook execs python3 with the
    # repo-discovered engine path; we pass DYNOS_HOME so the engine
    # finds the persistent rules.
    r_hook = subprocess.run(
        ["bash", str(hook_path)],
        cwd=str(workspace), capture_output=True, text=True,
        env={**os.environ, "DYNOS_HOME": str(home), "PYTHONPATH": str(DYNOS_HOOKS_DIR)},
        check=False,
    )
    assert r_hook.returncode != 0, (
        f"hook must fail when staged violation exists; "
        f"got returncode={r_hook.returncode}, stdout={r_hook.stdout!r}, "
        f"stderr={r_hook.stderr!r}"
    )
    # Sanity: confirm the violation was reported by the engine.
    assert "r-no-bad-literal" in (r_hook.stdout + r_hook.stderr), (
        f"engine output must mention the violating rule_id; "
        f"stdout={r_hook.stdout!r} stderr={r_hook.stderr!r}"
    )
