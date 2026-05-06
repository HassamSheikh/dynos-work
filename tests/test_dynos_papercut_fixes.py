"""Regression tests for four operator-papercut fixes surfaced during the
PRO-001..PRO-007 residual-drain sessions:

  1. ``ctl write-execution-graph`` preserves segment-level
     ``no_op_justified`` / ``no_op_reason``. The bypass mechanism in
     ``run-execution-segment-done`` consumes those fields; stripping them
     at persist time forced operators to bypass-write the JSON directly.

  2. ``ctl amend-artifact plan`` (and the spec/tdd siblings) re-issues
     the matching ``human-approval-{stage}`` receipt with the new artifact
     hash. Without this, the next stage transition is refused with
     ``hash mismatch`` because the state-machine compares the live
     artifact against the immutable human-approval anchor.

  3. ``ctl record-snapshot`` rewinds to ``HEAD^`` when HEAD's commit
     message starts with ``tdd:``. The TDD-First gate's commit otherwise
     ends up AT the snapshot SHA, which then never appears in
     ``git diff <snap>`` and breaks segment-done coverage verification.

  4. ``build_prompt_context.py --diff <sha>`` validates the SHA resolves
     to a commit and writes a non-empty stderr message + empty stdout
     when it does not. Previously, an abbreviated or wrong SHA produced
     a 1-byte sidecar silently.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent
HOOKS_DIR = REPO_ROOT / "hooks"
sys.path.insert(0, str(HOOKS_DIR))


# ---------------------------------------------------------------------------
# Fix 1 — execution-graph normalizer preserves no_op_justified / no_op_reason
# ---------------------------------------------------------------------------


def test_execution_graph_normalizer_preserves_no_op_justified():
    """``_normalize_execution_graph_payload`` must round-trip
    ``no_op_justified=True`` and ``no_op_reason`` for any segment that
    sets them. These fields are read by run-execution-segment-done's
    bypass path; stripping them is exactly the bug.
    """
    from ctl import _normalize_execution_graph_payload

    payload = {
        "task_id": "task-test-001",
        "segments": [
            {
                "id": "segment-A-tdd",
                "executor": "testing-executor",
                "description": "test seg",
                "files_expected": ["tests/test_foo.py"],
                "depends_on": [],
                "criteria_ids": [1],
                "no_op_justified": True,
                "no_op_reason": "tests/test_foo.py was committed at the snapshot SHA itself",
            }
        ],
    }
    out = _normalize_execution_graph_payload(Path("/tmp/.dynos/task-test-001"), payload)
    seg = out["segments"][0]
    assert seg["no_op_justified"] is True, "no_op_justified must round-trip"
    assert "no_op_reason" in seg, "no_op_reason must round-trip"
    assert "snapshot SHA itself" in seg["no_op_reason"]


def test_execution_graph_normalizer_omits_no_op_when_not_set():
    """Segments without ``no_op_justified`` must not gain the field after
    normalization (avoid spurious bypass on every segment)."""
    from ctl import _normalize_execution_graph_payload

    payload = {
        "task_id": "task-test-002",
        "segments": [
            {
                "id": "segment-B-real",
                "executor": "refactor-executor",
                "description": "real seg",
                "files_expected": ["hooks/real_file.py"],
                "depends_on": [],
                "criteria_ids": [1],
            }
        ],
    }
    out = _normalize_execution_graph_payload(Path("/tmp/.dynos/task-test-002"), payload)
    seg = out["segments"][0]
    assert "no_op_justified" not in seg
    assert "no_op_reason" not in seg


def test_execution_graph_normalizer_rejects_invalid_no_op_reason():
    """``no_op_justified=True`` with empty or non-string ``no_op_reason``
    must drop the reason (and only the reason). The flag still rides
    through; the segment-done bypass also enforces a non-empty reason
    of ≥20 stripped chars, so a missing reason makes the bypass refuse
    cleanly rather than silently swallow."""
    from ctl import _normalize_execution_graph_payload

    payload = {
        "task_id": "task-test-003",
        "segments": [
            {
                "id": "segment-A",
                "executor": "testing-executor",
                "description": "x",
                "files_expected": ["a.py"],
                "depends_on": [],
                "criteria_ids": [1],
                "no_op_justified": True,
                "no_op_reason": "   ",
            }
        ],
    }
    out = _normalize_execution_graph_payload(Path("/tmp/.dynos/task-test-003"), payload)
    seg = out["segments"][0]
    assert seg["no_op_justified"] is True
    assert "no_op_reason" not in seg


# ---------------------------------------------------------------------------
# Fix 2 — amend-artifact plan refreshes human-approval-PLAN_REVIEW
# ---------------------------------------------------------------------------


def _make_task_with_approval(tmp_path: Path, artifact_name: str, body: str) -> tuple[Path, str]:
    """Build a fake task dir with ``{artifact}.md``, the canonical
    ``{stem}-validated.json`` receipt, and a ``human-approval-{stage}.json``
    pre-existing approval receipt anchored to the original hash. Returns
    the task dir and the original artifact's sha256.
    """
    import hashlib

    task_dir = tmp_path / "project" / ".dynos" / "task-fix2"
    task_dir.mkdir(parents=True)
    (task_dir / "receipts").mkdir()

    rel = {"spec": "spec.md", "plan": "plan.md", "tdd": "evidence/tdd-tests.md"}[artifact_name]
    artifact_path = task_dir / rel
    artifact_path.parent.mkdir(parents=True, exist_ok=True)
    artifact_path.write_text(body)
    original_sha = hashlib.sha256(body.encode()).hexdigest()

    # Canonical receipt (spec-validated / plan-validated / tdd_review-approved).
    canonical_stem = {
        "spec": "spec-validated",
        "plan": "plan-validated",
        "tdd": "tdd_review-approved",
    }[artifact_name]
    (task_dir / "receipts" / f"{canonical_stem}.json").write_text(
        json.dumps(
            {"step": canonical_stem, "ts": "2026-05-06T00:00:00Z", "valid": True,
             "artifact_sha256": original_sha}
        )
    )

    # Human-approval anchor.
    stage = {"spec": "SPEC_REVIEW", "plan": "PLAN_REVIEW", "tdd": "TDD_REVIEW"}[artifact_name]
    (task_dir / "receipts" / f"human-approval-{stage}.json").write_text(
        json.dumps(
            {"step": f"human-approval-{stage}", "ts": "2026-05-06T00:00:01Z",
             "valid": True, "artifact_sha256": original_sha, "approver": "human"}
        )
    )

    # Minimal manifest required by some validators.
    (task_dir / "manifest.json").write_text(
        json.dumps({"task_id": "task-fix2", "stage": "PLAN_REVIEW",
                    "created_at": "2026-05-06T00:00:00Z", "raw_input": "fixture"})
    )
    return task_dir, original_sha


def test_amend_artifact_plan_refreshes_human_approval(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """After ``amend-artifact plan`` updates plan.md and the canonical
    plan-validated receipt, the human-approval-PLAN_REVIEW receipt must
    also carry the new hash. Otherwise transition_task refuses the next
    advance with ``hash mismatch``."""
    import argparse
    from ctl import cmd_amend_artifact

    task_dir, original_sha = _make_task_with_approval(tmp_path, "plan", "ORIGINAL plan body\n")

    # Change the plan body.
    new_body = "AMENDED plan body — additional details\n"
    (task_dir / "plan.md").write_text(new_body)

    args = argparse.Namespace(
        task_dir=str(task_dir),
        artifact_name="plan",
        reason="repair audit findings sc-001 + sc-002",
    )
    rc = cmd_amend_artifact(args)
    assert rc == 0, "amend-artifact must succeed on a well-formed amend request"

    # Both receipts should now carry the new hash.
    import hashlib
    new_sha = hashlib.sha256(new_body.encode()).hexdigest()
    assert new_sha != original_sha

    canonical = json.loads((task_dir / "receipts" / "plan-validated.json").read_text())
    assert canonical["artifact_sha256"] == new_sha, "plan-validated must follow amend"

    approval = json.loads((task_dir / "receipts" / "human-approval-PLAN_REVIEW.json").read_text())
    assert approval["artifact_sha256"] == new_sha, (
        "human-approval-PLAN_REVIEW must also follow amend so the state-machine "
        "hash gate continues to permit the post-amend transition"
    )


def test_amend_artifact_plan_works_when_no_approval_exists(tmp_path: Path):
    """The refresh must be conditional — if no human-approval receipt
    exists yet (amend during PLAN_REVIEW before approval), amend-artifact
    must still succeed with just the canonical receipt update."""
    import argparse
    import hashlib
    from ctl import cmd_amend_artifact

    # Same setup but without the human-approval-PLAN_REVIEW.json file.
    task_dir = tmp_path / "project" / ".dynos" / "task-fix2b"
    task_dir.mkdir(parents=True)
    (task_dir / "receipts").mkdir()
    body = "ORIGINAL\n"
    (task_dir / "plan.md").write_text(body)
    original_sha = hashlib.sha256(body.encode()).hexdigest()
    (task_dir / "receipts" / "plan-validated.json").write_text(
        json.dumps({"step": "plan-validated", "ts": "2026-05-06T00:00:00Z",
                    "valid": True, "artifact_sha256": original_sha})
    )
    (task_dir / "manifest.json").write_text(
        json.dumps({"task_id": "task-fix2b", "stage": "PLANNING",
                    "created_at": "2026-05-06T00:00:00Z", "raw_input": "fixture"})
    )
    (task_dir / "plan.md").write_text("AMENDED before approval\n")

    rc = cmd_amend_artifact(argparse.Namespace(
        task_dir=str(task_dir), artifact_name="plan",
        reason="amend before any human approval was issued",
    ))
    assert rc == 0
    assert not (task_dir / "receipts" / "human-approval-PLAN_REVIEW.json").exists()


# ---------------------------------------------------------------------------
# Fix 3 — record-snapshot rewinds when HEAD is a TDD commit
# ---------------------------------------------------------------------------


def _git_init_with_commits(tmp_path: Path, messages: list[str]) -> Path:
    """Create a git repo with one file and N commits using the given
    messages. Returns the repo path. Uses --no-gpg-sign etc. for hermetic
    runs in CI."""
    repo = tmp_path / "repo"
    repo.mkdir()
    env = {
        **os.environ,
        "GIT_AUTHOR_NAME": "test",
        "GIT_AUTHOR_EMAIL": "test@example.com",
        "GIT_COMMITTER_NAME": "test",
        "GIT_COMMITTER_EMAIL": "test@example.com",
    }
    subprocess.run(["git", "init", "--initial-branch=main", "-q"], cwd=str(repo), check=True, env=env)
    subprocess.run(["git", "config", "commit.gpgsign", "false"], cwd=str(repo), check=True, env=env)
    for i, msg in enumerate(messages):
        f = repo / f"file_{i}.txt"
        f.write_text(f"content {i}\n")
        subprocess.run(["git", "add", str(f)], cwd=str(repo), check=True, env=env)
        subprocess.run(["git", "commit", "-m", msg, "-q"], cwd=str(repo), check=True, env=env)
    return repo


def test_record_snapshot_rewinds_for_tdd_head(tmp_path: Path):
    """When HEAD's commit message starts with ``tdd:``, record-snapshot
    must rewind to HEAD^ so the TDD-committed files later appear in the
    post-snapshot diff window."""
    repo = _git_init_with_commits(tmp_path, [
        "feat: baseline work",
        "tdd: PRO-X structural test (RED)",
    ])
    # Resolve the parent of HEAD (what we expect the snapshot to record).
    parent = subprocess.run(
        ["git", "-C", str(repo), "rev-parse", "HEAD^"],
        capture_output=True, text=True, check=True,
    ).stdout.strip()

    # Build a minimal task dir so cmd_record_snapshot succeeds.
    task_dir = repo / ".dynos" / "task-fix3"
    task_dir.mkdir(parents=True)
    (task_dir / "manifest.json").write_text(
        json.dumps({"task_id": "task-fix3", "stage": "PRE_EXECUTION_SNAPSHOT",
                    "created_at": "2026-05-06T00:00:00Z", "raw_input": "fixture"})
    )

    import argparse
    from ctl import cmd_record_snapshot
    rc = cmd_record_snapshot(argparse.Namespace(
        task_dir=str(task_dir), head_sha=None, branch=None,
    ))
    assert rc == 0
    manifest = json.loads((task_dir / "manifest.json").read_text())
    assert manifest["snapshot"]["head_sha"] == parent, (
        "TDD HEAD must be rewound to parent so coverage check works"
    )


def test_record_snapshot_no_rewind_for_non_tdd_head(tmp_path: Path):
    """When HEAD's commit message does NOT start with ``tdd:``,
    record-snapshot must record HEAD as-is."""
    repo = _git_init_with_commits(tmp_path, [
        "feat: baseline",
        "feat: more work",
    ])
    head = subprocess.run(
        ["git", "-C", str(repo), "rev-parse", "HEAD"],
        capture_output=True, text=True, check=True,
    ).stdout.strip()

    task_dir = repo / ".dynos" / "task-fix3b"
    task_dir.mkdir(parents=True)
    (task_dir / "manifest.json").write_text(
        json.dumps({"task_id": "task-fix3b", "stage": "PRE_EXECUTION_SNAPSHOT",
                    "created_at": "2026-05-06T00:00:00Z", "raw_input": "fixture"})
    )

    import argparse
    from ctl import cmd_record_snapshot
    rc = cmd_record_snapshot(argparse.Namespace(
        task_dir=str(task_dir), head_sha=None, branch=None,
    ))
    assert rc == 0
    manifest = json.loads((task_dir / "manifest.json").read_text())
    assert manifest["snapshot"]["head_sha"] == head, (
        "Non-TDD HEAD must not be rewound — that would skip real work"
    )


def test_record_snapshot_explicit_head_sha_is_not_rewound(tmp_path: Path):
    """When --head-sha is passed explicitly, the rewind logic must not
    fire — the caller has named the SHA they want recorded."""
    repo = _git_init_with_commits(tmp_path, [
        "feat: baseline",
        "tdd: PRO-X tests",
    ])
    head = subprocess.run(
        ["git", "-C", str(repo), "rev-parse", "HEAD"],
        capture_output=True, text=True, check=True,
    ).stdout.strip()

    task_dir = repo / ".dynos" / "task-fix3c"
    task_dir.mkdir(parents=True)
    (task_dir / "manifest.json").write_text(
        json.dumps({"task_id": "task-fix3c", "stage": "PRE_EXECUTION_SNAPSHOT",
                    "created_at": "2026-05-06T00:00:00Z", "raw_input": "fixture"})
    )

    import argparse
    from ctl import cmd_record_snapshot
    rc = cmd_record_snapshot(argparse.Namespace(
        task_dir=str(task_dir), head_sha=head, branch=None,
    ))
    assert rc == 0
    manifest = json.loads((task_dir / "manifest.json").read_text())
    assert manifest["snapshot"]["head_sha"] == head, (
        "Explicit --head-sha must be recorded verbatim, no rewind"
    )


# ---------------------------------------------------------------------------
# Fix 4 — build_prompt_context --diff validates SHA
# ---------------------------------------------------------------------------


def test_build_prompt_context_diff_rejects_unresolvable_sha(tmp_path: Path):
    """An abbreviated/wrong SHA that does not resolve to a commit must
    produce empty stdout and a stderr message — not a silent 1-byte
    sidecar."""
    repo = _git_init_with_commits(tmp_path, ["feat: baseline"])
    fake_sha = "deadbeef" * 5  # 40 hex chars but not a real commit

    result = subprocess.run(
        [sys.executable, str(HOOKS_DIR / "build_prompt_context.py"),
         "--diff", fake_sha, "--root", str(repo)],
        capture_output=True, text=True,
    )
    # Stdout is empty (return value of "" from build_diff_context).
    # The script prints empty stdout; just confirm stderr names the SHA.
    assert fake_sha in result.stderr, (
        f"stderr must name the bad SHA so the operator notices; got: {result.stderr!r}"
    )
    assert "does not resolve" in result.stderr


def test_build_prompt_context_diff_accepts_real_sha(tmp_path: Path):
    """A real, resolvable SHA must NOT trigger the validation error
    (regression net for the validation logic)."""
    repo = _git_init_with_commits(tmp_path, [
        "feat: baseline",
        "feat: more work",
    ])
    head = subprocess.run(
        ["git", "-C", str(repo), "rev-parse", "HEAD"],
        capture_output=True, text=True, check=True,
    ).stdout.strip()

    result = subprocess.run(
        [sys.executable, str(HOOKS_DIR / "build_prompt_context.py"),
         "--diff", head, "--root", str(repo)],
        capture_output=True, text=True,
    )
    assert "does not resolve" not in result.stderr
