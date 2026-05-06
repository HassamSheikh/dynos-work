"""Runaway-defense seal tests.

This test file encodes the RUNAWAY-DEFENSE SEAL:
  - compute_segment_budget NEVER returns > 40 for any input.
  - would_overflow is True for any n >= 12, False for any n <= 11.

These tests CANNOT be marked xfail or skipped. They are red-line tests.
If any test in this file is failing, production code is broken — do not
paper over it with marks. Fix the code.

Coverage:
  - AC-19: tool_budget never exceeds 40 for any (n_files, model) combination
  - AC-3:  would_overflow boundary is correct at 11/12
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT / "hooks") not in sys.path:
    sys.path.insert(0, str(ROOT / "hooks"))


# ---------------------------------------------------------------------------
# Parametrized ceiling seal
# ---------------------------------------------------------------------------


FILE_COUNTS = [0, 1, 8, 11, 12, 100, 1000]
MODELS = ["haiku", "sonnet", "opus"]


@pytest.mark.parametrize("n_files", FILE_COUNTS)
@pytest.mark.parametrize("model", MODELS)
def test_compute_segment_budget_never_exceeds_ceiling(n_files: int, model: str):
    """compute_segment_budget must NEVER return > 40 for any (n_files, model).

    This is the runaway-defense seal. The ceiling is 40. No code path may
    produce an unbounded budget. Violating this invariant means a runaway
    executor spawn can consume unlimited tool calls.
    """
    from lib_tool_budget import compute_segment_budget, TOOL_BUDGET_CEILING
    result = compute_segment_budget(n_files, model)
    assert result <= TOOL_BUDGET_CEILING, (
        f"RUNAWAY DEFENSE VIOLATED: compute_segment_budget({n_files}, {model!r}) "
        f"returned {result} which exceeds ceiling {TOOL_BUDGET_CEILING}. "
        f"No executor spawn may receive an unbounded budget."
    )


@pytest.mark.parametrize("n_files", FILE_COUNTS)
@pytest.mark.parametrize("model", MODELS)
def test_compute_segment_budget_always_positive(n_files: int, model: str):
    """compute_segment_budget must return a positive integer >= 1 for any input."""
    from lib_tool_budget import compute_segment_budget
    result = compute_segment_budget(n_files, model)
    assert isinstance(result, int), (
        f"compute_segment_budget({n_files}, {model!r}) returned {type(result).__name__}, expected int"
    )
    assert result >= 1, (
        f"compute_segment_budget({n_files}, {model!r}) returned {result}, must be >= 1"
    )


# ---------------------------------------------------------------------------
# would_overflow boundary seal
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("n_files", [0, 1, 2, 5, 8, 10, 11])
def test_would_overflow_false_for_n_lte_11(n_files: int):
    """would_overflow must be False for any n <= 11 (raw budget <= 40)."""
    from lib_tool_budget import would_overflow
    assert would_overflow(n_files) is False, (
        f"would_overflow({n_files}) returned True but must be False for n <= 11. "
        f"This breaks the runaway-defense seal: valid segments would be falsely rejected."
    )


@pytest.mark.parametrize("n_files", [12, 13, 15, 20, 50, 100, 1000])
def test_would_overflow_true_for_n_gte_12(n_files: int):
    """would_overflow must be True for any n >= 12 (raw budget > 40)."""
    from lib_tool_budget import would_overflow
    assert would_overflow(n_files) is True, (
        f"would_overflow({n_files}) returned False but must be True for n >= 12. "
        f"This breaks the runaway-defense seal: oversized segments would bypass the guard."
    )


def test_would_overflow_boundary_11_is_the_max_safe_count():
    """11 is the maximum file count that does not overflow — one more causes overflow."""
    from lib_tool_budget import would_overflow
    # 11 is safe
    assert would_overflow(11) is False, "11-file segment must not overflow (38 <= 40)"
    # 12 overflows
    assert would_overflow(12) is True, "12-file segment must overflow (41 > 40)"


# ---------------------------------------------------------------------------
# Ceiling constant integrity
# ---------------------------------------------------------------------------


def test_ceiling_constant_is_exactly_40():
    """TOOL_BUDGET_CEILING must be exactly 40. Any other value breaks the seal."""
    from lib_tool_budget import TOOL_BUDGET_CEILING
    assert TOOL_BUDGET_CEILING == 40, (
        f"TOOL_BUDGET_CEILING is {TOOL_BUDGET_CEILING}, must be exactly 40. "
        f"The frontmatter maxTurns=40, validator ceiling=40, and max budget=40 must all agree."
    )


def test_ceiling_consistent_with_would_overflow_boundary():
    """The overflow boundary (11/12) must be consistent with PER_FILE_COST,
    FIXED_OVERHEAD, and TOOL_BUDGET_CEILING."""
    from lib_tool_budget import PER_FILE_COST, FIXED_OVERHEAD, TOOL_BUDGET_CEILING
    # 11 * 3 + 5 = 38 <= 40 → no overflow
    assert 11 * PER_FILE_COST + FIXED_OVERHEAD <= TOOL_BUDGET_CEILING
    # 12 * 3 + 5 = 41 > 40 → overflow
    assert 12 * PER_FILE_COST + FIXED_OVERHEAD > TOOL_BUDGET_CEILING
