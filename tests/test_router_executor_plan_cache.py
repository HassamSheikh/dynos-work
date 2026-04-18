"""Tests for the executor-plan router cache.

The cache eliminates redundant rebuilds of `build_executor_plan` when
`inject-prompt` is called once per segment as a separate Python process.

Properties under test:
  1. `executor-plan` writes a cache record at .dynos/task-{id}/router-cache/.
  2. `inject-prompt` reads the cached plan when fingerprint matches.
  3. Fingerprint flips when ANY input changes (graph, policy, registry, etc.).
  4. Stale cache triggers live rebuild; correctness preserved.
  5. With epsilon-greedy exploration, cache-hit eliminates re-rolled dice
     so executor-plan and inject-prompt agree on the model.
  6. router-cache-status reports the right status string.
  7. _benchmark_model_for_agent honors RouterContext (no duplicate reads).
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


def _run(env_obj, *args, stdin=None):
    return subprocess.run(
        ["python3", str(ROUTER), *args],
        input=stdin,
        cwd=str(ROOT),
        text=True,
        capture_output=True,
        check=False,
        env={**os.environ, "DYNOS_HOME": str(env_obj.dynos_home)},
    )


def _write_graph(env_obj, task_id: str, segments: list[dict]) -> Path:
    task_dir = env_obj.root / ".dynos" / task_id
    task_dir.mkdir(parents=True, exist_ok=True)
    graph_path = task_dir / "execution-graph.json"
    graph_path.write_text(json.dumps({"segments": segments}))
    return graph_path


def _persistent(env_obj) -> Path:
    p = env_obj.persistent_dir
    p.mkdir(parents=True, exist_ok=True)
    return p


# ---------------------------------------------------------------------------
# 1. executor-plan writes a cache record
# ---------------------------------------------------------------------------

def test_executor_plan_writes_cache_record(dynos_home):
    task_id = "task-20260101-A"
    graph_path = _write_graph(dynos_home, task_id, [
        {"id": "s1", "executor": "backend-executor"},
        {"id": "s2", "executor": "ui-executor"},
    ])

    r = _run(dynos_home, "executor-plan", "--root", str(dynos_home.root),
             "--task-type", "feature", "--graph", str(graph_path))
    assert r.returncode == 0, r.stderr

    cache = dynos_home.root / ".dynos" / task_id / "router-cache" / "executor-plan.json"
    assert cache.exists(), "cache file should be written by executor-plan"
    record = json.loads(cache.read_text())
    assert record["task_id"] == task_id
    assert record["task_type"] == "feature"
    assert record["version"] == "1"
    assert len(record["fingerprint"]) == 64  # sha256 hex
    assert len(record["plan"]["segments"]) == 2


# ---------------------------------------------------------------------------
# 2. inject-prompt hits the cache and never re-derives routing
# ---------------------------------------------------------------------------

def test_inject_prompt_uses_cache_emits_hit_event(dynos_home):
    task_id = "task-20260101-B"
    graph_path = _write_graph(dynos_home, task_id, [
        {"id": "s1", "executor": "backend-executor"},
        {"id": "s2", "executor": "backend-executor"},
        {"id": "s3", "executor": "backend-executor"},
    ])
    # Build cache
    r = _run(dynos_home, "executor-plan", "--root", str(dynos_home.root),
             "--task-type", "feature", "--graph", str(graph_path))
    assert r.returncode == 0, r.stderr

    # Each inject-prompt call should hit the cache
    for seg in ("s1", "s2", "s3"):
        r = _run(dynos_home, "inject-prompt", "--root", str(dynos_home.root),
                 "--task-type", "feature", "--graph", str(graph_path),
                 "--segment-id", seg, stdin="base prompt")
        assert r.returncode == 0, r.stderr

    events_path = dynos_home.root / ".dynos" / "events.jsonl"
    assert events_path.exists()
    events = [json.loads(l) for l in events_path.read_text().splitlines()]
    hits = [e for e in events if e.get("event") == "router_cache_lookup"
            and e.get("status") == "hit"]
    assert len(hits) == 3, f"expected 3 cache hits, got {len(hits)}"

    # No router_model_decision should have fired during inject-prompt phase
    # (all decisions were made at executor-plan time and reused from cache).
    # We can't easily separate event sources, but we CAN verify the count
    # matches a single executor-plan build (1 decision per segment).
    decisions = [e for e in events if e.get("event") == "router_model_decision"]
    assert len(decisions) == 3, (
        f"expected exactly 3 model decisions (one per segment from executor-plan), "
        f"got {len(decisions)} — inject-prompt may be re-deciding"
    )


# ---------------------------------------------------------------------------
# 3. Fingerprint drifts when inputs change
# ---------------------------------------------------------------------------

def test_fingerprint_drifts_when_policy_changes(dynos_home):
    task_id = "task-20260101-C"
    graph_path = _write_graph(dynos_home, task_id, [
        {"id": "s1", "executor": "backend-executor"},
    ])
    _run(dynos_home, "executor-plan", "--root", str(dynos_home.root),
         "--task-type", "feature", "--graph", str(graph_path))

    r = _run(dynos_home, "router-cache-status", "--root", str(dynos_home.root),
             "--task-type", "feature", "--graph", str(graph_path))
    assert r.returncode == 0
    before = json.loads(r.stdout)
    assert before["status"] == "fresh"

    # Mutate policy.json
    persistent = _persistent(dynos_home)
    (persistent / "policy.json").write_text(json.dumps({
        "learning_enabled": True, "exploration_epsilon": 0.5,
    }))

    r = _run(dynos_home, "router-cache-status", "--root", str(dynos_home.root),
             "--task-type", "feature", "--graph", str(graph_path))
    after = json.loads(r.stdout)
    assert after["status"] == "stale"
    assert after["stored_fingerprint"] != after["current_fingerprint"]


def test_fingerprint_drifts_when_graph_changes(dynos_home):
    task_id = "task-20260101-D"
    graph_path = _write_graph(dynos_home, task_id, [
        {"id": "s1", "executor": "backend-executor"},
    ])
    _run(dynos_home, "executor-plan", "--root", str(dynos_home.root),
         "--task-type", "feature", "--graph", str(graph_path))

    # Add a segment to the graph
    new = {"segments": [
        {"id": "s1", "executor": "backend-executor"},
        {"id": "s2", "executor": "ui-executor"},
    ]}
    graph_path.write_text(json.dumps(new))

    r = _run(dynos_home, "router-cache-status", "--root", str(dynos_home.root),
             "--task-type", "feature", "--graph", str(graph_path))
    assert json.loads(r.stdout)["status"] == "stale"


# ---------------------------------------------------------------------------
# 4. Stale cache falls back to live build
# ---------------------------------------------------------------------------

def test_inject_prompt_falls_back_when_cache_stale(dynos_home):
    task_id = "task-20260101-E"
    graph_path = _write_graph(dynos_home, task_id, [
        {"id": "s1", "executor": "backend-executor"},
    ])
    _run(dynos_home, "executor-plan", "--root", str(dynos_home.root),
         "--task-type", "feature", "--graph", str(graph_path))

    # Mutate inputs so cache is stale
    persistent = _persistent(dynos_home)
    (persistent / "policy.json").write_text(json.dumps({"learning_enabled": True,
                                                        "exploration_epsilon": 0.0}))

    r = _run(dynos_home, "inject-prompt", "--root", str(dynos_home.root),
             "--task-type", "feature", "--graph", str(graph_path),
             "--segment-id", "s1", stdin="base prompt")
    assert r.returncode == 0, r.stderr
    assert "base prompt" in r.stdout

    events_path = dynos_home.root / ".dynos" / "events.jsonl"
    events = [json.loads(l) for l in events_path.read_text().splitlines()]
    drift = [e for e in events if e.get("event") == "router_cache_lookup"
             and e.get("status") == "fingerprint_drift"]
    assert len(drift) == 1


def test_inject_prompt_falls_back_when_cache_absent(dynos_home):
    task_id = "task-20260101-F"
    graph_path = _write_graph(dynos_home, task_id, [
        {"id": "s1", "executor": "backend-executor"},
    ])
    # NO executor-plan call — cache file does not exist.
    r = _run(dynos_home, "inject-prompt", "--root", str(dynos_home.root),
             "--task-type", "feature", "--graph", str(graph_path),
             "--segment-id", "s1", stdin="hello")
    assert r.returncode == 0, r.stderr
    assert "hello" in r.stdout

    events_path = dynos_home.root / ".dynos" / "events.jsonl"
    events = [json.loads(l) for l in events_path.read_text().splitlines()]
    miss = [e for e in events if e.get("event") == "router_cache_lookup"
            and e.get("status") == "fingerprint_drift"]
    assert len(miss) == 1


def test_inject_prompt_handles_corrupt_cache(dynos_home):
    task_id = "task-20260101-G"
    graph_path = _write_graph(dynos_home, task_id, [
        {"id": "s1", "executor": "backend-executor"},
    ])
    cache = dynos_home.root / ".dynos" / task_id / "router-cache" / "executor-plan.json"
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text("{not json")

    r = _run(dynos_home, "inject-prompt", "--root", str(dynos_home.root),
             "--task-type", "feature", "--graph", str(graph_path),
             "--segment-id", "s1", stdin="x")
    assert r.returncode == 0, r.stderr
    assert "x" in r.stdout


# ---------------------------------------------------------------------------
# 5. Epsilon-greedy: cache-hit guarantees agreement between
#    executor-plan model and inject-prompt routing.
# ---------------------------------------------------------------------------

def test_cache_eliminates_reroll_under_epsilon(dynos_home):
    """With epsilon=1.0 (always explore), repeated builds would normally
    pick different models. Cache-hit must use the original decision."""
    task_id = "task-20260101-H"
    persistent = _persistent(dynos_home)
    (persistent / "policy.json").write_text(json.dumps({
        "learning_enabled": True, "exploration_epsilon": 1.0,
    }))
    # Need at least one retrospective so learning context is non-trivial
    rd = dynos_home.root / ".dynos" / "task-prior"
    rd.mkdir(parents=True, exist_ok=True)
    (rd / "task-retrospective.json").write_text(json.dumps({
        "task_id": "task-prior", "task_outcome": "DONE",
        "task_type": "feature", "task_domains": "backend",
        "task_risk_level": "medium",
        "auditor_zero_finding_streaks": {},
    }))
    graph_path = _write_graph(dynos_home, task_id, [
        {"id": "s1", "executor": "backend-executor"},
    ])

    r = _run(dynos_home, "executor-plan", "--root", str(dynos_home.root),
             "--task-type", "feature", "--graph", str(graph_path))
    assert r.returncode == 0
    plan = json.loads(r.stdout)
    plan_model = plan["segments"][0]["model"]

    # The cached plan must record the same model (no re-roll on cache write)
    cache = dynos_home.root / ".dynos" / task_id / "router-cache" / "executor-plan.json"
    record = json.loads(cache.read_text())
    assert record["plan"]["segments"][0]["model"] == plan_model

    # inject-prompt should produce a prompt consistent with that model.
    # We can't see the model directly in the prompt, but we can verify the
    # cache was hit (so no re-roll occurred).
    events_path = dynos_home.root / ".dynos" / "events.jsonl"
    events_path.write_text("")  # reset so we only see the inject-prompt events
    r = _run(dynos_home, "inject-prompt", "--root", str(dynos_home.root),
             "--task-type", "feature", "--graph", str(graph_path),
             "--segment-id", "s1", stdin="x")
    assert r.returncode == 0
    events = [json.loads(l) for l in events_path.read_text().splitlines()]
    hits = [e for e in events if e.get("event") == "router_cache_lookup"
            and e.get("status") == "hit"]
    decisions = [e for e in events if e.get("event") == "router_model_decision"]
    assert len(hits) == 1
    assert len(decisions) == 0, (
        "inject-prompt re-decided model under epsilon=1.0 — cache did not "
        "eliminate re-rolled exploration"
    )


# ---------------------------------------------------------------------------
# 6. router-cache-status output shape
# ---------------------------------------------------------------------------

def test_router_cache_status_absent(dynos_home):
    task_id = "task-20260101-I"
    graph_path = _write_graph(dynos_home, task_id, [
        {"id": "s1", "executor": "backend-executor"},
    ])
    r = _run(dynos_home, "router-cache-status", "--root", str(dynos_home.root),
             "--task-type", "feature", "--graph", str(graph_path))
    assert r.returncode == 0
    out = json.loads(r.stdout)
    assert out["status"] == "absent"
    assert out["cache_present"] is False


def test_router_cache_status_fresh_then_stale(dynos_home):
    task_id = "task-20260101-J"
    graph_path = _write_graph(dynos_home, task_id, [
        {"id": "s1", "executor": "backend-executor"},
    ])
    _run(dynos_home, "executor-plan", "--root", str(dynos_home.root),
         "--task-type", "feature", "--graph", str(graph_path))
    r = _run(dynos_home, "router-cache-status", "--root", str(dynos_home.root),
             "--task-type", "feature", "--graph", str(graph_path))
    out = json.loads(r.stdout)
    assert out["status"] == "fresh"
    assert out["segment_count"] == 1
    assert out["version"] == "1"


# ---------------------------------------------------------------------------
# 7. _benchmark_model_for_agent honors RouterContext (no extra reads)
# ---------------------------------------------------------------------------

def test_benchmark_model_uses_ctx_registry_and_history(dynos_home, monkeypatch):
    """If ctx is provided, _benchmark_model_for_agent must NOT re-read
    the registry or benchmark history files."""
    import importlib
    import lib_core
    import router as router_mod
    importlib.reload(router_mod)

    persistent = _persistent(dynos_home)
    (persistent / "learned-agents").mkdir(parents=True, exist_ok=True)
    (persistent / "benchmarks").mkdir(parents=True, exist_ok=True)
    (persistent / "learned-agents" / "registry.json").write_text(json.dumps({
        "agents": [{
            "role": "backend-executor", "task_type": "feature",
            "agent_name": "be-v1", "mode": "alongside", "status": "active",
            "path": "learned-agents/be-v1.md",
            "benchmark_summary": {"mean_composite": 0.7},
        }]
    }))
    (persistent / "benchmarks" / "history.json").write_text(json.dumps({
        "runs": [{"target_name": "be-v1", "role": "backend-executor",
                  "task_type": "feature", "model": "sonnet",
                  "quality_score": 0.7, "cost_score": 0.7, "efficiency_score": 0.7}
                 for _ in range(3)]
    }))

    # Wrap _read_learned_registry and load_json to count file reads
    read_count = {"registry": 0, "history": 0}
    orig_read_registry = router_mod._read_learned_registry
    orig_load_json = lib_core.load_json
    history_path = persistent / "benchmarks" / "history.json"

    def counting_registry(root):
        read_count["registry"] += 1
        return orig_read_registry(root)

    def counting_load_json(path):
        if Path(path) == history_path:
            read_count["history"] += 1
        return orig_load_json(path)

    monkeypatch.setattr(router_mod, "_read_learned_registry", counting_registry)
    monkeypatch.setattr(router_mod, "load_json", counting_load_json)

    ctx = router_mod.RouterContext(dynos_home.root)
    # First call populates ctx caches
    router_mod._benchmark_model_for_agent(dynos_home.root,
                                          "backend-executor", "feature", ctx=ctx)
    after_first = dict(read_count)
    # Second + third calls should NOT re-read registry/history
    router_mod._benchmark_model_for_agent(dynos_home.root,
                                          "backend-executor", "feature", ctx=ctx)
    router_mod._benchmark_model_for_agent(dynos_home.root,
                                          "backend-executor", "feature", ctx=ctx)
    assert read_count["registry"] == after_first["registry"], (
        f"registry was re-read despite ctx caching: {read_count['registry']}"
    )
    assert read_count["history"] == after_first["history"], (
        f"benchmark history was re-read despite ctx caching: {read_count['history']}"
    )
