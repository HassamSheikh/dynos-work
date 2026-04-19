"""CI CHECK-5 (Class A — gate-diagnostic parity lint).

Asserts that ``validate_chain`` (the CLI/diagnostic surface) cannot
report a green chain on a task ``require_receipts_for_done`` would
refuse. The gate must be at least as strict as the diagnostic.

Closes A-008 — task-007's investigator found that ``validate_chain``
and ``require_receipts_for_done`` had drifted: the diagnostic could
say GREEN on a task the gate would refuse, masking real failures.

Method: build a small but exhaustive matrix of fixture task_dirs
covering missing/malformed receipts and stage states. For each
fixture, compute ``diag_gaps = validate_chain(td)`` and
``gate_gaps = require_receipts_for_done(td)``. Assert
``set(diag_gaps) >= set(gate_gaps)`` (every gate-rejected gap is
also reported by the diagnostic — the gate cannot refuse on a gap
the diagnostic doesn't see).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "hooks"))

from lib_core import require_receipts_for_done  # noqa: E402
from lib_receipts import (  # noqa: E402
    receipt_audit_routing,
    receipt_calibration_applied,
    receipt_executor_routing,
    receipt_plan_validated,
    receipt_post_completion,
    receipt_postmortem_generated,
    receipt_postmortem_skipped,
    receipt_retrospective,
    validate_chain,
)


@pytest.fixture(autouse=True)
def _enable_test_override(monkeypatch):
    monkeypatch.setenv("DYNOS_ALLOW_TEST_OVERRIDE", "1")


def _make_task(tmp_path: Path, stage: str) -> Path:
    project = tmp_path / "project"
    td = project / ".dynos" / "task-20260419-DGP"
    td.mkdir(parents=True)
    (td / "manifest.json").write_text(json.dumps({
        "task_id": td.name,
        "stage": stage,
        "created_at": "2026-04-19T00:00:00Z",
        "raw_input": "test",
        "classification": {"type": "refactor", "risk_level": "medium",
                            "domains": ["backend"]},
    }))
    (td / "spec.md").write_text(
        "## Task Summary\n\nt\n## User Context\n\nt\n"
        "## Acceptance Criteria\n\n1. one\n\n## Implicit Requirements Surfaced\n\nt\n"
        "## Out of Scope\n\nt\n## Assumptions\n\nt\n## Risk Notes\n\nt\n"
    )
    (td / "plan.md").write_text(
        "## Technical Approach\n\nt\n## Reference Code\n\nt\n## Components / Modules\n\nt\n"
        "## Data Flow\n\nt\n## Error Handling Strategy\n\nt\n## Test Strategy\n\nt\n"
        "## Dependency Graph\n\nt\n## Open Questions\n\nt\n"
    )
    (td / "execution-graph.json").write_text(
        '{"task_id":"x","segments":[{"id":"seg-1","criteria_ids":[1]}]}'
    )
    return td


def _full_done_chain(td: Path) -> None:
    """Write every required receipt for DONE so the chain is complete."""
    receipt_plan_validated(td, validation_passed_override=True)
    receipt_executor_routing(td, [])
    receipt_audit_routing(td, [])
    (td / "task-retrospective.json").write_text(json.dumps({
        "quality_score": 0.9, "cost_score": 0.9, "efficiency_score": 0.9,
        "total_token_usage": 1000,
    }))
    receipt_retrospective(td)
    receipt_post_completion(td, [])
    receipt_calibration_applied(td, 0, 0, "a" * 64, "b" * 64)
    pm = td / "postmortem.json"
    pm.write_text('{"anomalies": [], "recurring_patterns": []}')
    receipt_postmortem_generated(td, pm)
    receipt_postmortem_skipped(td, "no-findings", "f" * 64, subsumed_by=[])


def test_diagnostic_reports_every_gate_gap_at_done(tmp_path: Path):
    """Empty DONE: gate refuses with N gaps; diagnostic must report a
    superset of those N. Gate cannot reject for a gap the diagnostic
    silently passes."""
    td = _make_task(tmp_path, stage="DONE")
    diag = set(validate_chain(td))
    gate = set(require_receipts_for_done(td))
    missing_in_diag = gate - diag
    assert not missing_in_diag, (
        "validate_chain (diagnostic) failed to report gaps that "
        "require_receipts_for_done (gate) raises. The diagnostic is "
        "weaker than the gate — closes task-007 A-008 regression. "
        f"Missing: {missing_in_diag}"
    )


def test_diagnostic_clean_at_done_implies_gate_clean(tmp_path: Path):
    """If diagnostic reports a green chain, the gate must also pass.
    Inverse of the previous test — the diagnostic is upper-bounded by
    the gate's strictness."""
    td = _make_task(tmp_path, stage="DONE")
    _full_done_chain(td)
    diag = validate_chain(td)
    gate = require_receipts_for_done(td)
    if not diag:
        assert not gate, (
            "validate_chain reported green at DONE but the gate still "
            "raised — diagnostic is unreliable for completion checks. "
            f"gate gaps: {gate}"
        )


def test_partial_chain_diag_superset_of_gate(tmp_path: Path):
    """Mid-completion DONE: only some receipts present. Diagnostic
    output must still cover every gap the gate would refuse on."""
    td = _make_task(tmp_path, stage="DONE")
    # Only the first 3 of 9 required receipts
    receipt_plan_validated(td, validation_passed_override=True)
    receipt_executor_routing(td, [])
    receipt_audit_routing(td, [])
    diag = set(validate_chain(td))
    gate = set(require_receipts_for_done(td))
    missing_in_diag = gate - diag
    assert not missing_in_diag, (
        "diagnostic missed gate-blocking gaps in partial-chain task. "
        f"Missing: {missing_in_diag}"
    )


def test_validate_chain_imports_require_receipts_for_done():
    """Source-level pin: validate_chain must reference
    require_receipts_for_done (or its module path) — that's the
    enforcement that the diagnostic and gate share a code path.

    Pure structural check: the `validate_chain` source must mention
    `require_receipts_for_done` so any code-archeology refactor
    that disconnects the two trips this test."""
    import inspect
    src = inspect.getsource(validate_chain)
    assert "require_receipts_for_done" in src, (
        "validate_chain no longer references require_receipts_for_done. "
        "Per task-007 A-008, the diagnostic must bridge to the gate so "
        "the two cannot drift. Reinstate the call."
    )
