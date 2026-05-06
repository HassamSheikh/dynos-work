"""Tests that the plan-time overflow guard rejects oversized segments at
planning stages and passes them at PRE_EXECUTION_SNAPSHOT (in-flight grandfather).

TDD-first: tests will fail until production code lands in hooks/lib_validate.py
and/or hooks/validate_task_artifacts.py.

Coverage:
  - AC-9:  12-file segment fails at PLANNING with exact error message
  - AC-10: 12-file segment passes at PRE_EXECUTION_SNAPSHOT (in-flight grandfather)
  - AC-10: 12-file segment also fails at PLAN_REVIEW and EXECUTION_GRAPH_BUILD
  - AC-10: 11-file segment passes at all stages
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT / "hooks") not in sys.path:
    sys.path.insert(0, str(ROOT / "hooks"))


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_task_dir(tmp_path: Path, stage: str, segments: list[dict]) -> Path:
    """Create a minimal task directory with manifest.json and execution-graph.json."""
    task_dir = tmp_path / "task-20260506-overflow"
    task_dir.mkdir(parents=True, exist_ok=True)

    manifest = {
        "task_id": "task-20260506-overflow",
        "created_at": "2026-05-06T00:00:00Z",
        "raw_input": "test task",
        "stage": stage,
        "task_type": "feature",
        "classification": {
            "type": "feature",
            "risk_level": "medium",
            "domains": ["backend"],
        },
    }
    (task_dir / "manifest.json").write_text(json.dumps(manifest))

    graph = {"segments": segments}
    (task_dir / "execution-graph.json").write_text(json.dumps(graph))

    # Write a minimal spec.md and plan.md so artifact validation doesn't fail on those
    spec_text = "\n".join([
        "## Task Summary", "test",
        "## User Context", "test",
        "## Acceptance Criteria", "1. AC one",
        "## Implicit Requirements Surfaced", "none",
        "## Out of Scope", "nothing",
        "## Assumptions", "none",
        "## Risk Notes", "none",
    ])
    (task_dir / "spec.md").write_text(spec_text)

    plan_text = "\n".join([
        "## Technical Approach", "test",
        "## Reference Code", "none",
        "## API Contracts", "none",
        "## Components / Modules", "test",
        "## Data Flow", "test",
        "## Error Handling Strategy", "test",
        "## Test Strategy", "test",
        "## Dependency Graph", "test",
        "## Open Questions", "none",
    ])
    (task_dir / "plan.md").write_text(plan_text)

    return task_dir


def _call_validate(task_dir: Path, dynos_home, monkeypatch) -> list[str]:
    """Call validate_task_artifacts and return list of error strings."""
    from lib_validate import validate_task_artifacts
    return validate_task_artifacts(task_dir, strict=False, run_gap=False)


def _segment(seg_id: str, n_files: int) -> dict:
    """Build a segment dict with n_files in files_expected."""
    return {
        "id": seg_id,
        "executor": "backend-executor",
        "description": f"Test segment {seg_id} with {n_files} files",
        "criteria_ids": [1],
        "files_expected": [f"file{i}.py" for i in range(n_files)],
    }


# ---------------------------------------------------------------------------
# AC-9: 12-file segment fails validation at PLANNING with exact error message
# ---------------------------------------------------------------------------


def test_twelve_file_segment_fails_at_planning(tmp_path, dynos_home, monkeypatch):
    """A 12-file segment must fail validation at PLANNING stage."""
    monkeypatch.setenv("DYNOS_HOME", str(dynos_home.dynos_home))
    task_dir = _make_task_dir(tmp_path, "PLANNING", [_segment("seg-01", 12)])
    errors = _call_validate(task_dir, dynos_home, monkeypatch)
    overflow_errors = [e for e in errors if "would overflow tool budget" in e]
    assert overflow_errors, (
        f"Expected overflow validation error at PLANNING for 12-file segment, "
        f"got errors: {errors}"
    )


def test_twelve_file_segment_error_message_contains_segment_id(tmp_path, dynos_home, monkeypatch):
    """Error message must contain the segment id (spec AC-9 load-bearing format)."""
    monkeypatch.setenv("DYNOS_HOME", str(dynos_home.dynos_home))
    task_dir = _make_task_dir(tmp_path, "PLANNING", [_segment("seg-overflow-id", 12)])
    errors = _call_validate(task_dir, dynos_home, monkeypatch)
    overflow_errors = [e for e in errors if "would overflow tool budget" in e]
    assert overflow_errors, f"No overflow error found, got: {errors}"
    assert any("seg-overflow-id" in e for e in overflow_errors), (
        f"Segment id 'seg-overflow-id' not found in error message: {overflow_errors}"
    )


def test_twelve_file_segment_error_message_contains_file_count(tmp_path, dynos_home, monkeypatch):
    """Error message must contain the file count N (spec AC-9 load-bearing format)."""
    monkeypatch.setenv("DYNOS_HOME", str(dynos_home.dynos_home))
    task_dir = _make_task_dir(tmp_path, "PLANNING", [_segment("seg-abc", 12)])
    errors = _call_validate(task_dir, dynos_home, monkeypatch)
    overflow_errors = [e for e in errors if "would overflow tool budget" in e]
    assert overflow_errors, f"No overflow error found, got: {errors}"
    assert any("12" in e for e in overflow_errors), (
        f"File count 12 not found in error message: {overflow_errors}"
    )


def test_twelve_file_segment_error_message_contains_ceiling_text(tmp_path, dynos_home, monkeypatch):
    """Error message must contain 'files exceeds 11-file ceiling' (spec AC-9 exact text)."""
    monkeypatch.setenv("DYNOS_HOME", str(dynos_home.dynos_home))
    task_dir = _make_task_dir(tmp_path, "PLANNING", [_segment("seg-xyz", 12)])
    errors = _call_validate(task_dir, dynos_home, monkeypatch)
    overflow_errors = [e for e in errors if "would overflow tool budget" in e]
    assert overflow_errors, f"No overflow error found, got: {errors}"
    assert any("files exceeds 11-file ceiling" in e for e in overflow_errors), (
        f"'files exceeds 11-file ceiling' not found in error: {overflow_errors}"
    )


def test_twelve_file_segment_error_message_contains_decompose(tmp_path, dynos_home, monkeypatch):
    """Error message must contain 'decompose' (spec AC-9 exact text)."""
    monkeypatch.setenv("DYNOS_HOME", str(dynos_home.dynos_home))
    task_dir = _make_task_dir(tmp_path, "PLANNING", [_segment("seg-decompose", 12)])
    errors = _call_validate(task_dir, dynos_home, monkeypatch)
    overflow_errors = [e for e in errors if "would overflow tool budget" in e]
    assert overflow_errors, f"No overflow error found, got: {errors}"
    assert any("decompose" in e for e in overflow_errors), (
        f"'decompose' not found in error: {overflow_errors}"
    )


# ---------------------------------------------------------------------------
# AC-10: 12-file segment also fires at PLAN_REVIEW and EXECUTION_GRAPH_BUILD
# ---------------------------------------------------------------------------


def test_twelve_file_segment_fails_at_plan_review(tmp_path, dynos_home, monkeypatch):
    """12-file segment must also fail at PLAN_REVIEW stage."""
    monkeypatch.setenv("DYNOS_HOME", str(dynos_home.dynos_home))
    task_dir = _make_task_dir(tmp_path, "PLAN_REVIEW", [_segment("seg-01", 12)])
    errors = _call_validate(task_dir, dynos_home, monkeypatch)
    overflow_errors = [e for e in errors if "would overflow tool budget" in e]
    assert overflow_errors, (
        f"Expected overflow error at PLAN_REVIEW for 12-file segment, got: {errors}"
    )


def test_twelve_file_segment_fails_at_execution_graph_build(tmp_path, dynos_home, monkeypatch):
    """12-file segment must also fail at EXECUTION_GRAPH_BUILD stage."""
    monkeypatch.setenv("DYNOS_HOME", str(dynos_home.dynos_home))
    task_dir = _make_task_dir(tmp_path, "EXECUTION_GRAPH_BUILD", [_segment("seg-01", 12)])
    errors = _call_validate(task_dir, dynos_home, monkeypatch)
    overflow_errors = [e for e in errors if "would overflow tool budget" in e]
    assert overflow_errors, (
        f"Expected overflow error at EXECUTION_GRAPH_BUILD for 12-file segment, got: {errors}"
    )


# ---------------------------------------------------------------------------
# AC-10: 12-file segment PASSES at PRE_EXECUTION_SNAPSHOT (in-flight grandfather)
# ---------------------------------------------------------------------------


def test_twelve_file_segment_passes_at_pre_execution_snapshot(tmp_path, dynos_home, monkeypatch):
    """12-file segment must NOT raise overflow error at PRE_EXECUTION_SNAPSHOT stage.
    In-flight tasks that already passed plan validation are unaffected."""
    monkeypatch.setenv("DYNOS_HOME", str(dynos_home.dynos_home))
    task_dir = _make_task_dir(tmp_path, "PRE_EXECUTION_SNAPSHOT", [_segment("seg-01", 12)])
    errors = _call_validate(task_dir, dynos_home, monkeypatch)
    overflow_errors = [e for e in errors if "would overflow tool budget" in e]
    assert not overflow_errors, (
        f"Overflow guard must be skipped at PRE_EXECUTION_SNAPSHOT, "
        f"but got overflow errors: {overflow_errors}"
    )


# ---------------------------------------------------------------------------
# AC-10: 11-file segment passes at ALL stages (boundary value)
# ---------------------------------------------------------------------------


def test_eleven_file_segment_passes_at_planning(tmp_path, dynos_home, monkeypatch):
    """An 11-file segment (at boundary) must pass validation at PLANNING."""
    monkeypatch.setenv("DYNOS_HOME", str(dynos_home.dynos_home))
    task_dir = _make_task_dir(tmp_path, "PLANNING", [_segment("seg-01", 11)])
    errors = _call_validate(task_dir, dynos_home, monkeypatch)
    overflow_errors = [e for e in errors if "would overflow tool budget" in e]
    assert not overflow_errors, (
        f"11-file segment must NOT trigger overflow error at PLANNING, "
        f"but got: {overflow_errors}"
    )


def test_eleven_file_segment_passes_at_plan_review(tmp_path, dynos_home, monkeypatch):
    """An 11-file segment passes at PLAN_REVIEW."""
    monkeypatch.setenv("DYNOS_HOME", str(dynos_home.dynos_home))
    task_dir = _make_task_dir(tmp_path, "PLAN_REVIEW", [_segment("seg-01", 11)])
    errors = _call_validate(task_dir, dynos_home, monkeypatch)
    overflow_errors = [e for e in errors if "would overflow tool budget" in e]
    assert not overflow_errors, (
        f"11-file segment must NOT trigger overflow error at PLAN_REVIEW, "
        f"but got: {overflow_errors}"
    )


def test_eleven_file_segment_passes_at_pre_execution_snapshot(tmp_path, dynos_home, monkeypatch):
    """An 11-file segment passes at PRE_EXECUTION_SNAPSHOT."""
    monkeypatch.setenv("DYNOS_HOME", str(dynos_home.dynos_home))
    task_dir = _make_task_dir(tmp_path, "PRE_EXECUTION_SNAPSHOT", [_segment("seg-01", 11)])
    errors = _call_validate(task_dir, dynos_home, monkeypatch)
    overflow_errors = [e for e in errors if "would overflow tool budget" in e]
    assert not overflow_errors, (
        f"11-file segment must NOT trigger overflow error at PRE_EXECUTION_SNAPSHOT, "
        f"but got: {overflow_errors}"
    )
