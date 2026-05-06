"""Unit tests for hooks/lib_tool_budget.py.

Pure-function tests covering constants, compute_segment_budget, and would_overflow.
These are TDD-first tests: they will fail with ImportError until the production
module is created. That failure is the correct TDD signal.

hooks/ is on sys.path via conftest.py ROOT insertion.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
# hooks/ must be on sys.path for `import lib_tool_budget` to resolve.
if str(ROOT / "hooks") not in sys.path:
    sys.path.insert(0, str(ROOT / "hooks"))


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------


def test_per_file_cost_is_3():
    """PER_FILE_COST must equal 3 (spec AC-1, design-decisions line 19)."""
    from lib_tool_budget import PER_FILE_COST
    assert PER_FILE_COST == 3


def test_fixed_overhead_is_5():
    """FIXED_OVERHEAD must equal 5 (spec AC-1, design-decisions line 20)."""
    from lib_tool_budget import FIXED_OVERHEAD
    assert FIXED_OVERHEAD == 5


def test_tool_budget_ceiling_is_40():
    """TOOL_BUDGET_CEILING must equal 40 (spec AC-1, design-decisions line 21)."""
    from lib_tool_budget import TOOL_BUDGET_CEILING
    assert TOOL_BUDGET_CEILING == 40


def test_tool_budget_advisory_is_35():
    """TOOL_BUDGET_ADVISORY must equal 35 (spec AC-1, design-decisions line 22)."""
    from lib_tool_budget import TOOL_BUDGET_ADVISORY
    assert TOOL_BUDGET_ADVISORY == 35


def test_static_caps_by_model_exact():
    """STATIC_CAPS_BY_MODEL must be exactly {haiku: 15, sonnet: 20, opus: 25} (spec AC-1)."""
    from lib_tool_budget import STATIC_CAPS_BY_MODEL
    assert STATIC_CAPS_BY_MODEL == {"haiku": 15, "sonnet": 20, "opus": 25}


# ---------------------------------------------------------------------------
# compute_segment_budget — boundary values from spec AC-2
# ---------------------------------------------------------------------------


def test_compute_zero_files_haiku_returns_floor():
    """0 files + haiku: raw=5, floor=15 applies → 15."""
    from lib_tool_budget import compute_segment_budget
    result = compute_segment_budget(0, "haiku")
    assert result == 15


def test_compute_one_file_sonnet_returns_floor():
    """1 file + sonnet: raw=8, floor=20 applies → 20."""
    from lib_tool_budget import compute_segment_budget
    result = compute_segment_budget(1, "sonnet")
    assert result == 20


def test_compute_eleven_files_sonnet_raw_dominates():
    """11 files + sonnet: raw=38, floor=20 → 38 (under ceiling)."""
    from lib_tool_budget import compute_segment_budget
    result = compute_segment_budget(11, "sonnet")
    assert result == 38


def test_compute_twelve_files_sonnet_hits_ceiling():
    """12 files + sonnet: raw=41 > ceiling=40 → ceiling 40."""
    from lib_tool_budget import compute_segment_budget
    result = compute_segment_budget(12, "sonnet")
    assert result == 40


def test_compute_thirteen_files_opus_hits_ceiling():
    """13 files + opus: raw=44 > ceiling=40 → ceiling 40."""
    from lib_tool_budget import compute_segment_budget
    result = compute_segment_budget(13, "opus")
    assert result == 40


def test_compute_eight_files_opus_raw_dominates():
    """8 files + opus: raw=29, floor=25 → 29 (under ceiling)."""
    from lib_tool_budget import compute_segment_budget
    result = compute_segment_budget(8, "opus")
    assert result == 29


def test_compute_unknown_model_falls_back_to_floor_15():
    """Unknown model: STATIC_CAPS_BY_MODEL.get(model, 15) → fallback floor 15."""
    from lib_tool_budget import compute_segment_budget
    # 0 files: raw=5, unknown-model floor=15 → 15
    result = compute_segment_budget(0, "unknown-model-xyz")
    assert result == 15


def test_compute_unknown_model_floor_still_applied_when_raw_low():
    """Unknown model with 1 file: raw=8 < fallback floor 15 → still 15."""
    from lib_tool_budget import compute_segment_budget
    result = compute_segment_budget(1, "mystery")
    assert result == 15


def test_compute_budget_never_exceeds_ceiling_at_exact_threshold():
    """12 files is exactly the overflow threshold; result must be capped at 40."""
    from lib_tool_budget import compute_segment_budget, TOOL_BUDGET_CEILING
    for model in ("haiku", "sonnet", "opus"):
        result = compute_segment_budget(12, model)
        assert result == TOOL_BUDGET_CEILING, (
            f"compute_segment_budget(12, {model!r}) returned {result}, expected {TOOL_BUDGET_CEILING}"
        )


def test_compute_budget_formula_integrity():
    """Verify formula: min(CEILING, max(N * PER_FILE_COST + FIXED_OVERHEAD, floor)) for several inputs."""
    from lib_tool_budget import (
        compute_segment_budget,
        PER_FILE_COST,
        FIXED_OVERHEAD,
        TOOL_BUDGET_CEILING,
        STATIC_CAPS_BY_MODEL,
    )
    cases = [
        (0, "haiku"),
        (5, "sonnet"),
        (10, "opus"),
        (11, "sonnet"),
        (12, "haiku"),
    ]
    for n, model in cases:
        expected = min(
            TOOL_BUDGET_CEILING,
            max(n * PER_FILE_COST + FIXED_OVERHEAD, STATIC_CAPS_BY_MODEL.get(model, 15)),
        )
        actual = compute_segment_budget(n, model)
        assert actual == expected, (
            f"compute_segment_budget({n}, {model!r}) == {actual}, expected {expected}"
        )


# ---------------------------------------------------------------------------
# would_overflow — boundary values from spec AC-3
# ---------------------------------------------------------------------------


def test_would_overflow_eleven_is_false():
    """11 files: raw=38 <= 40 → False (spec AC-3)."""
    from lib_tool_budget import would_overflow
    assert would_overflow(11) is False


def test_would_overflow_twelve_is_true():
    """12 files: raw=41 > 40 → True (spec AC-3)."""
    from lib_tool_budget import would_overflow
    assert would_overflow(12) is True


def test_would_overflow_zero_is_false():
    """0 files: raw=5 <= 40 → False."""
    from lib_tool_budget import would_overflow
    assert would_overflow(0) is False


def test_would_overflow_ceiling_boundary_exact():
    """11 is the largest file count that does not overflow; 12 is the smallest that does."""
    from lib_tool_budget import would_overflow
    assert would_overflow(11) is False
    assert would_overflow(12) is True


def test_would_overflow_large_count_is_true():
    """Very large file count always overflows."""
    from lib_tool_budget import would_overflow
    assert would_overflow(1000) is True
