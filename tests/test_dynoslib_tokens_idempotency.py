"""Tests for dynoslib_tokens.py record_tokens idempotency on spawn_id.

Covers acceptance criteria:
  - Criterion 23: record_tokens is idempotent on (task_dir, agent, spawn_id);
    a second call with the same spawn_id does not double-append events or
    double-count by_agent aggregates.
  - Criterion 24: the CLI surface gains a --spawn-id argparse argument and
    forwards it to record_tokens.

Tests here intentionally target the POST-idempotency behavior, so they will
fail against today's code (which unconditionally appends). That is intended:
these tests are written TDD-first and gate the seg-005 implementation.
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest


HOOKS_DIR = Path(__file__).resolve().parent.parent / "hooks"
TOKENS_SCRIPT = HOOKS_DIR / "dynoslib_tokens.py"

sys.path.insert(0, str(HOOKS_DIR))


@pytest.fixture
def task_dir(tmp_path: Path) -> Path:
    """A fresh .dynos/task-{id} directory — isolated per test."""
    d = tmp_path / ".dynos" / "task-test-000"
    d.mkdir(parents=True)
    return d


def _record(task_dir: Path, **overrides) -> dict:
    """Call record_tokens with sensible defaults; overrides win."""
    # Import fresh each call to catch import-time regressions.
    import importlib
    import dynoslib_tokens  # type: ignore[import-not-found]
    importlib.reload(dynoslib_tokens)

    kwargs = dict(
        task_dir=task_dir,
        agent="backend-executor",
        model="opus",
        input_tokens=1000,
        output_tokens=500,
        phase="execution",
        stage="EXECUTION",
        event_type="spawn",
        segment="seg-001",
        detail=None,
    )
    kwargs.update(overrides)
    return dynoslib_tokens.record_tokens(**kwargs)


# ---------------------------------------------------------------------------
# Criterion 23: idempotency on (agent, spawn_id)
# ---------------------------------------------------------------------------

def test_same_spawn_id_does_not_double_append(task_dir: Path) -> None:
    """Two calls with identical spawn_id produce a single event."""
    first = _record(task_dir, spawn_id="seg-001-exec-001")
    second = _record(task_dir, spawn_id="seg-001-exec-001")

    assert len(second["events"]) == 1, (
        f"expected 1 event after two identical-spawn_id calls, got {len(second['events'])}"
    )
    # Totals must match the single-call result.
    assert second["total"] == first["total"]
    assert second["total_input_tokens"] == first["total_input_tokens"]
    assert second["total_output_tokens"] == first["total_output_tokens"]

    by_agent = second["by_agent"]["backend-executor"]
    assert by_agent["input_tokens"] == 1000
    assert by_agent["output_tokens"] == 500
    assert by_agent["tokens"] == 1500


def test_different_spawn_id_appends_new_event(task_dir: Path) -> None:
    """Call with a different spawn_id appends normally; by_agent sums."""
    _record(task_dir, spawn_id="seg-001-exec-001")
    result = _record(task_dir, spawn_id="seg-001-exec-002")

    assert len(result["events"]) == 2
    # by_agent doubles
    by_agent = result["by_agent"]["backend-executor"]
    assert by_agent["input_tokens"] == 2000
    assert by_agent["output_tokens"] == 1000
    assert by_agent["tokens"] == 3000


def test_missing_spawn_id_preserves_legacy_append(task_dir: Path) -> None:
    """spawn_id=None preserves the legacy unconditional-append behavior."""
    _record(task_dir, spawn_id=None)
    result = _record(task_dir, spawn_id=None)

    assert len(result["events"]) == 2
    by_agent = result["by_agent"]["backend-executor"]
    assert by_agent["tokens"] == 3000


def test_spawn_id_scoped_per_agent(task_dir: Path) -> None:
    """Same spawn_id across different agents does not collide."""
    _record(task_dir, agent="backend-executor", spawn_id="shared-id")
    result = _record(task_dir, agent="ui-executor", spawn_id="shared-id")

    assert len(result["events"]) == 2
    assert "backend-executor" in result["by_agent"]
    assert "ui-executor" in result["by_agent"]


def test_spawn_id_persists_across_process_invocations(task_dir: Path) -> None:
    """Idempotency survives separate function calls writing through disk."""
    first = _record(task_dir, spawn_id="persistent-id")
    usage_path = task_dir / "token-usage.json"
    assert usage_path.exists()
    on_disk = json.loads(usage_path.read_text())
    assert len(on_disk["events"]) == 1

    # Second call re-reads from disk and must still dedupe
    second = _record(task_dir, spawn_id="persistent-id")
    assert len(second["events"]) == 1
    assert second["total"] == first["total"]


# ---------------------------------------------------------------------------
# Criterion 24: CLI --spawn-id argument
# ---------------------------------------------------------------------------

def test_cli_accepts_spawn_id_argument(task_dir: Path) -> None:
    """`dynoslib_tokens.py record --spawn-id …` exits 0 and records."""
    result = subprocess.run(
        [
            sys.executable, str(TOKENS_SCRIPT), "record",
            "--task-dir", str(task_dir),
            "--agent", "planning",
            "--model", "opus",
            "--input-tokens", "1000",
            "--output-tokens", "500",
            "--phase", "planning",
            "--stage", "PLANNING",
            "--spawn-id", "start-planner-001",
        ],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, (
        f"CLI invocation failed (exit {result.returncode}):\n"
        f"stdout: {result.stdout}\n"
        f"stderr: {result.stderr}"
    )
    payload = json.loads(result.stdout)
    assert payload["ok"] is True
    assert payload["events_count"] == 1


def test_cli_spawn_id_idempotent_across_invocations(task_dir: Path) -> None:
    """Two CLI invocations with the same --spawn-id produce one event."""
    def invoke() -> subprocess.CompletedProcess:
        return subprocess.run(
            [
                sys.executable, str(TOKENS_SCRIPT), "record",
                "--task-dir", str(task_dir),
                "--agent", "planning",
                "--model", "opus",
                "--input-tokens", "1000",
                "--output-tokens", "500",
                "--spawn-id", "start-planner-001",
            ],
            capture_output=True,
            text=True,
        )

    r1 = invoke()
    r2 = invoke()
    assert r1.returncode == 0, r1.stderr
    assert r2.returncode == 0, r2.stderr
    usage = json.loads((task_dir / "token-usage.json").read_text())
    assert len(usage["events"]) == 1
    assert usage["by_agent"]["planning"]["tokens"] == 1500


def test_cli_rejects_unknown_arguments_but_accepts_spawn_id(task_dir: Path) -> None:
    """Sanity: --spawn-id is recognized (not an argparse error)."""
    result = subprocess.run(
        [
            sys.executable, str(TOKENS_SCRIPT), "record",
            "--task-dir", str(task_dir),
            "--agent", "planning",
            "--model", "opus",
            "--input-tokens", "0",
            "--output-tokens", "0",
            "--spawn-id", "x",
        ],
        capture_output=True,
        text=True,
    )
    # argparse errors go to stderr with non-zero status when --spawn-id is unknown
    assert result.returncode == 0, (
        f"argparse rejected --spawn-id: stderr={result.stderr}"
    )
