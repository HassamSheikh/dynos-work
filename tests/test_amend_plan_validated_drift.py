"""Regression test for the cmd_amend_artifact / plan-validated drift bug.

Scenario hit in user reports across multiple repos:
  1. spec.md is amended via `ctl amend-artifact spec --reason ...`
  2. cmd_amend_artifact updates the canonical spec-validated receipt's
     artifact_sha256 (and, post-PR-#162, refreshes
     human-approval-SPEC_REVIEW)
  3. BUT: plan-validated has its own `artifact_hashes` dict which
     captures spec.md/plan.md/execution-graph.json hashes — that dict
     is NOT touched by amend.
  4. Transition PRE_EXECUTION_SNAPSHOT -> EXECUTION runs
     `plan_validated_receipt_matches` which compares artifact_hashes
     to current files, sees spec.md drift, refuses transition with
     "plan-validated: spec.md hash drift".

Fix: cmd_amend_artifact, after updating the canonical receipt and
human-approval receipt, also re-issues plan-validated. That re-runs
validate_task_artifacts and recaptures fresh hashes for all three
artifacts.

These tests assert the fix holds for spec/plan/tdd amend paths plus
the early-planning case where no plan-validated receipt exists yet.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent
HOOKS_DIR = REPO_ROOT / "hooks"
sys.path.insert(0, str(HOOKS_DIR))


def _make_task_with_full_planning_state(
    tmp_path: Path,
    spec_body: str = "# Spec\n\n## Task Summary\nx\n",
    plan_body: str = "# Plan\n\nbody\n",
    graph_body: str | None = None,
) -> tuple[Path, str, str, str]:
    """Build a fake task dir with spec.md / plan.md / execution-graph.json,
    plus the three receipts the EXECUTION gate consults: spec-validated,
    plan-validated (with all-three artifact_hashes), human-approval-SPEC_REVIEW,
    human-approval-PLAN_REVIEW. Returns the task dir and the original
    sha256 of each artifact."""

    task_dir = tmp_path / "project" / ".dynos" / "task-fix-drift"
    task_dir.mkdir(parents=True)
    (task_dir / "receipts").mkdir()

    if graph_body is None:
        graph_body = json.dumps({
            "task_id": "task-fix-drift",
            "segments": [
                {
                    "id": "seg-A",
                    "executor": "backend-executor",
                    "description": "x",
                    "files_expected": ["a.py"],
                    "depends_on": [],
                    "parallelizable": False,
                    "criteria_ids": [1],
                }
            ],
        }, indent=2)

    (task_dir / "spec.md").write_text(spec_body)
    (task_dir / "plan.md").write_text(plan_body)
    (task_dir / "execution-graph.json").write_text(graph_body)

    spec_sha = hashlib.sha256(spec_body.encode()).hexdigest()
    plan_sha = hashlib.sha256(plan_body.encode()).hexdigest()
    graph_sha = hashlib.sha256(graph_body.encode()).hexdigest()

    # Canonical spec-validated.
    (task_dir / "receipts" / "spec-validated.json").write_text(json.dumps({
        "step": "spec-validated", "ts": "2026-05-06T00:00:00Z",
        "valid": True, "artifact_sha256": spec_sha,
    }))

    # Canonical plan-validated WITH artifact_hashes covering all three.
    # validation_passed=True is the field plan_validated_receipt_matches
    # checks first.
    (task_dir / "receipts" / "plan-validated.json").write_text(json.dumps({
        "step": "plan-validated", "ts": "2026-05-06T00:00:01Z",
        "valid": True, "validation_passed": True,
        "artifact_sha256": plan_sha,
        "artifact_hashes": {
            "spec.md": spec_sha,
            "plan.md": plan_sha,
            "execution-graph.json": graph_sha,
        },
    }))

    # Human-approval anchors.
    for stage, sha in [("SPEC_REVIEW", spec_sha), ("PLAN_REVIEW", plan_sha)]:
        (task_dir / "receipts" / f"human-approval-{stage}.json").write_text(json.dumps({
            "step": f"human-approval-{stage}", "ts": "2026-05-06T00:00:02Z",
            "valid": True, "artifact_sha256": sha, "approver": "human",
        }))

    (task_dir / "manifest.json").write_text(json.dumps({
        "task_id": "task-fix-drift",
        "stage": "PRE_EXECUTION_SNAPSHOT",
        "created_at": "2026-05-06T00:00:00Z",
        "raw_input": "fixture",
    }))
    return task_dir, spec_sha, plan_sha, graph_sha


def _read_plan_validated_hashes(task_dir: Path) -> dict[str, str]:
    return json.loads(
        (task_dir / "receipts" / "plan-validated.json").read_text()
    ).get("artifact_hashes", {})


# ---------------------------------------------------------------------------
# Bug repro + fix
# ---------------------------------------------------------------------------


def test_amend_spec_refreshes_plan_validated_artifact_hashes(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    """After `amend-artifact spec`, plan-validated.artifact_hashes['spec.md']
    must equal the post-amend spec.md hash. Without the fix the field
    retains the pre-amend hash and the next EXECUTION transition refuses
    with 'plan-validated: spec.md hash drift'."""
    from ctl import cmd_amend_artifact

    task_dir, original_spec_sha, _plan_sha, _graph_sha = _make_task_with_full_planning_state(tmp_path)

    # Mutate spec.md.
    new_spec = "# Spec\n\n## Task Summary\nAMENDED\n"
    (task_dir / "spec.md").write_text(new_spec)
    new_spec_sha = hashlib.sha256(new_spec.encode()).hexdigest()
    assert new_spec_sha != original_spec_sha

    rc = cmd_amend_artifact(argparse.Namespace(
        task_dir=str(task_dir),
        artifact_name="spec",
        reason="audit found a missing AC; adding it",
    ))
    assert rc == 0

    # plan-validated.artifact_hashes['spec.md'] MUST equal the new hash.
    captured = _read_plan_validated_hashes(task_dir)
    assert captured.get("spec.md") == new_spec_sha, (
        "plan-validated.artifact_hashes['spec.md'] is stale post-amend; "
        "the EXECUTION gate will refuse with 'spec.md hash drift'. "
        f"Expected new sha {new_spec_sha[:16]}; got {captured.get('spec.md', '')[:16]}"
    )


def test_amend_plan_refreshes_plan_validated_artifact_hashes(
    tmp_path: Path,
):
    """Same fix must apply when amending plan.md. plan-validated has TWO
    fields tracking plan.md: artifact_sha256 (the legacy field, updated
    by the existing canonical-receipt update) AND artifact_hashes['plan.md']
    (the dict checked by plan_validated_receipt_matches)."""
    from ctl import cmd_amend_artifact

    task_dir, _spec_sha, original_plan_sha, _graph_sha = _make_task_with_full_planning_state(tmp_path)

    new_plan = "# Plan\n\nbody — AMENDED for audit repair\n"
    (task_dir / "plan.md").write_text(new_plan)
    new_plan_sha = hashlib.sha256(new_plan.encode()).hexdigest()
    assert new_plan_sha != original_plan_sha

    rc = cmd_amend_artifact(argparse.Namespace(
        task_dir=str(task_dir),
        artifact_name="plan",
        reason="repair audit findings sc-001 and sc-002",
    ))
    assert rc == 0

    captured = _read_plan_validated_hashes(task_dir)
    assert captured.get("plan.md") == new_plan_sha, (
        "plan-validated.artifact_hashes['plan.md'] is stale post-amend"
    )

    # The artifact_sha256 field (PR #162's existing fix) must also reflect
    # the new hash — regression net for the fix that already shipped.
    canonical = json.loads((task_dir / "receipts" / "plan-validated.json").read_text())
    assert canonical["artifact_sha256"] == new_plan_sha


def test_amend_skips_refresh_when_plan_validated_missing(tmp_path: Path):
    """If amend is called during early planning (before plan-validated
    has ever been written), the refresh must silently skip — there's no
    receipt to refresh, and constructing one would prematurely lock in
    artifact_hashes for an incomplete plan."""
    from ctl import cmd_amend_artifact

    task_dir = tmp_path / "project" / ".dynos" / "task-early"
    task_dir.mkdir(parents=True)
    (task_dir / "receipts").mkdir()
    (task_dir / "spec.md").write_text("# Spec\n## Task Summary\nx\n")
    spec_sha = hashlib.sha256((task_dir / "spec.md").read_bytes()).hexdigest()
    # Only spec-validated exists; no plan-validated, no plan.md, no graph.
    (task_dir / "receipts" / "spec-validated.json").write_text(json.dumps({
        "step": "spec-validated", "ts": "2026-05-06T00:00:00Z",
        "valid": True, "artifact_sha256": spec_sha,
    }))
    (task_dir / "manifest.json").write_text(json.dumps({
        "task_id": "task-early", "stage": "SPEC_NORMALIZATION",
        "created_at": "2026-05-06T00:00:00Z", "raw_input": "fixture",
    }))

    (task_dir / "spec.md").write_text("# Spec\n## Task Summary\nAMENDED\n")
    rc = cmd_amend_artifact(argparse.Namespace(
        task_dir=str(task_dir),
        artifact_name="spec",
        reason="amend during early planning, no plan exists",
    ))
    assert rc == 0
    # No plan-validated should have been created.
    assert not (task_dir / "receipts" / "plan-validated.json").exists(), (
        "amend-artifact must NOT create plan-validated when none exists; "
        "doing so would prematurely lock hashes for an incomplete plan"
    )


def test_amend_tdd_refreshes_plan_validated_too(
    tmp_path: Path,
):
    """Amending the TDD evidence file must also refresh plan-validated
    even though the canonical receipt is tdd_review-approved (different
    file). Reason: plan-validated.artifact_hashes captures the planning
    triple, but the EXECUTION gate requires that triple to match disk
    regardless of which artifact triggered the amend. Future changes to
    plan-validated's captured set could include tdd-tests; the refresh
    is a defense-in-depth keeping the receipt always-fresh."""
    from ctl import cmd_amend_artifact

    task_dir, original_spec_sha, original_plan_sha, original_graph_sha = (
        _make_task_with_full_planning_state(tmp_path)
    )
    # Add TDD evidence + canonical receipt.
    evidence_dir = task_dir / "evidence"
    evidence_dir.mkdir()
    tdd_body = "# TDD\n\n## Coverage\n- AC 1: covered\n"
    (evidence_dir / "tdd-tests.md").write_text(tdd_body)
    tdd_sha = hashlib.sha256(tdd_body.encode()).hexdigest()
    (task_dir / "receipts" / "tdd_review-approved.json").write_text(json.dumps({
        "step": "tdd_review-approved", "ts": "2026-05-06T00:00:03Z",
        "valid": True, "artifact_sha256": tdd_sha,
    }))

    new_tdd = "# TDD\n\n## Coverage\n- AC 1: covered\n- AC 2: covered\n"
    (evidence_dir / "tdd-tests.md").write_text(new_tdd)

    rc = cmd_amend_artifact(argparse.Namespace(
        task_dir=str(task_dir),
        artifact_name="tdd",
        reason="audit asked for one additional test case for AC 2",
    ))
    assert rc == 0

    # After amend, plan-validated.artifact_hashes must still match the
    # current planning files (which were not touched by the tdd amend).
    captured = _read_plan_validated_hashes(task_dir)
    assert captured.get("spec.md") == original_spec_sha
    assert captured.get("plan.md") == original_plan_sha
    assert captured.get("execution-graph.json") == original_graph_sha
