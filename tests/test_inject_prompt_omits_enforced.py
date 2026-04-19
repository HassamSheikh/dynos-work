"""AC 25: build_executor_plan + inject-prompt CLI omit enforced rules
unless --include-enforced is explicitly passed.

Two tests:
  (a) Build executor plan in-process with mixed advisory + enforced
      rules. Assert the segment's `prevention_rules` text list contains
      ONLY the advisory rules; assert prevention_rules_omitted equals
      the enforced count.
  (b) Drive `python3 hooks/router.py inject-prompt` as a subprocess
      with the same mixed rules; without the flag the enforced rules
      must be absent from stdout, with `--include-enforced` they must
      reappear.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[1]
ROUTER = ROOT / "hooks" / "router.py"
sys.path.insert(0, str(ROOT / "hooks"))

from router import build_executor_plan  # noqa: E402


def _persistent_dir(env_home: Path, project: Path) -> Path:
    slug = str(project.resolve()).strip("/").replace("/", "-")
    p = env_home / "projects" / slug
    p.mkdir(parents=True, exist_ok=True)
    return p


def _write_rules(persistent: Path, rules: list[dict]) -> Path:
    rules_path = persistent / "prevention-rules.json"
    rules_path.write_text(json.dumps({"rules": rules}))
    return rules_path


def _mixed_rules() -> list[dict]:
    """Three advisory rules + two enforced (template != advisory).

    The advisory rules cover both:
      - explicit `template: "advisory"`
      - missing template (legacy / pre-migration row) — backward-compat
    """
    return [
        {
            "executor": "backend-executor",
            "rule": "ADVISORY one — be careful with concurrency",
            "category": "process",
            "enforcement": "review-checklist",
            "template": "advisory",
            "params": {},
        },
        {
            "executor": "backend-executor",
            "rule": "ADVISORY two — legacy rule with no template",
            "category": "process",
            "enforcement": "review-checklist",
            # NOTE: no template key — backward-compat advisory.
        },
        {
            "executor": "backend-executor",
            "rule": "ADVISORY three — yet another advisory",
            "category": "cq",
            "enforcement": "prompt-constraint",
            "template": "advisory",
            "params": {},
        },
        {
            "executor": "backend-executor",
            "rule": "ENFORCED A — no time.time() in throttled paths",
            "category": "cq",
            "enforcement": "static-check",
            "template": "pattern_must_not_appear",
            "params": {"regex": r"\btime\.time\(\)", "scope": "hooks/*.py"},
        },
        {
            "executor": "backend-executor",
            "rule": "ENFORCED B — every name in __all__ must be callable",
            "category": "cq",
            "enforcement": "static-check",
            "template": "every_name_in_X_satisfies_Y",
            "params": {
                "module": "hooks.lib_receipts",
                "container": "__all__",
                "predicate": "callable",
            },
        },
    ]


# ---------------------------------------------------------------------------
# (a) In-process build_executor_plan
# ---------------------------------------------------------------------------


def test_build_executor_plan_omits_enforced_by_default(tmp_path, monkeypatch):
    home = tmp_path / "dynos-home"
    home.mkdir()
    project = tmp_path / "project"
    (project / ".dynos").mkdir(parents=True)
    monkeypatch.setenv("DYNOS_HOME", str(home))
    persistent = _persistent_dir(home, project)
    _write_rules(persistent, _mixed_rules())

    plan = build_executor_plan(
        project,
        task_type="feature",
        segments=[{"id": "s1", "executor": "backend-executor"}],
    )
    assert len(plan["segments"]) == 1
    seg = plan["segments"][0]

    # Default mode: advisory + missing-template kept; enforced omitted.
    rules_text = seg["prevention_rules"]
    advisory_count = sum(1 for r in rules_text if r.startswith("ADVISORY"))
    enforced_count = sum(1 for r in rules_text if r.startswith("ENFORCED"))
    assert advisory_count == 3, (
        f"expected 3 advisory rules in injected prompt list, got "
        f"{advisory_count}: {rules_text!r}"
    )
    assert enforced_count == 0, (
        f"enforced rules MUST be omitted from prompt by default; got "
        f"{enforced_count} in {rules_text!r}"
    )
    assert seg["prevention_rules_omitted"] == 2, (
        f"prevention_rules_omitted must equal enforced-rule count (2); "
        f"got {seg['prevention_rules_omitted']}"
    )

    # Sanity flip: with include_enforced=True, all 5 rules are present
    # and prevention_rules_omitted is 0.
    plan_all = build_executor_plan(
        project,
        task_type="feature",
        segments=[{"id": "s1", "executor": "backend-executor"}],
        include_enforced=True,
    )
    seg_all = plan_all["segments"][0]
    assert len(seg_all["prevention_rules"]) == 5
    assert seg_all["prevention_rules_omitted"] == 0


# ---------------------------------------------------------------------------
# (b) CLI inject-prompt subprocess
# ---------------------------------------------------------------------------


def _run_inject_prompt(
    *, project: Path, task_id: str, env_home: Path,
    include_enforced: bool, base_prompt: str = "BASE EXECUTOR PROMPT",
):
    graph_path = project / ".dynos" / task_id / "execution-graph.json"
    args = [
        sys.executable, str(ROUTER), "inject-prompt",
        "--root", str(project),
        "--task-type", "feature",
        "--graph", str(graph_path),
        "--segment-id", "seg-A",
    ]
    if include_enforced:
        args.append("--include-enforced")
    env = {
        **os.environ,
        "DYNOS_HOME": str(env_home),
        "PYTHONPATH": str(ROOT / "hooks"),
    }
    return subprocess.run(
        args, input=base_prompt, text=True,
        capture_output=True, check=False, env=env, cwd=str(ROOT),
    )


def test_inject_prompt_cli_default_omits_and_flag_includes(tmp_path):
    home = tmp_path / "dynos-home"
    home.mkdir()
    project = tmp_path / "project"
    task_id = "task-20260418-INJ"
    task_dir = project / ".dynos" / task_id
    task_dir.mkdir(parents=True)
    graph = {
        "segments": [
            {"id": "seg-A", "executor": "backend-executor"},
        ]
    }
    (task_dir / "execution-graph.json").write_text(json.dumps(graph))

    persistent = _persistent_dir(home, project)
    _write_rules(persistent, _mixed_rules())

    # Default: enforced rules MUST NOT appear in stdout.
    r1 = _run_inject_prompt(
        project=project, task_id=task_id, env_home=home,
        include_enforced=False,
    )
    assert r1.returncode == 0, f"stderr={r1.stderr!r} stdout={r1.stdout!r}"
    out1 = r1.stdout
    # Advisory rules present; enforced absent.
    assert "ADVISORY one" in out1
    assert "ADVISORY two" in out1
    assert "ADVISORY three" in out1
    assert "ENFORCED A" not in out1, (
        f"enforced rule leaked into default prompt: {out1!r}"
    )
    assert "ENFORCED B" not in out1

    # With --include-enforced: every rule present.
    r2 = _run_inject_prompt(
        project=project, task_id=task_id, env_home=home,
        include_enforced=True,
    )
    assert r2.returncode == 0, f"stderr={r2.stderr!r} stdout={r2.stdout!r}"
    out2 = r2.stdout
    assert "ADVISORY one" in out2
    assert "ADVISORY two" in out2
    assert "ADVISORY three" in out2
    assert "ENFORCED A" in out2, (
        f"--include-enforced must reintroduce enforced rules; got {out2!r}"
    )
    assert "ENFORCED B" in out2
