"""Adaptive per-spawn tool-budget arithmetic (leaf module).

Pure functions and constants used by the router/validator to compute and
enforce a per-segment tool-call budget for spawned executor agents.

Formula (spec AC-2):
    budget = min(
        TOOL_BUDGET_CEILING,
        max(N * PER_FILE_COST + FIXED_OVERHEAD, STATIC_CAPS_BY_MODEL.get(model, 15)),
    )

Overflow predicate (spec AC-3):
    overflow = (N * PER_FILE_COST + FIXED_OVERHEAD) > TOOL_BUDGET_CEILING

This module is a leaf: it MUST NOT import from any other dynos-work hooks/
module. Constants are byte-exact and load-bearing — the router, validator,
and prompt-builder all import these names directly.
"""

from __future__ import annotations

# Per-file marginal cost in tool calls (read + edit + verify).
PER_FILE_COST: int = 3

# Fixed per-segment overhead in tool calls (initial reads, evidence write,
# sanity-check shell calls, etc.).
FIXED_OVERHEAD: int = 5

# Hard ceiling: no segment may be granted more than this many tool calls.
# A segment whose raw budget exceeds this must be decomposed at planning time.
TOOL_BUDGET_CEILING: int = 40

# Soft ceiling: advisory threshold used by self-pacing prompt instruction.
TOOL_BUDGET_ADVISORY: int = 35

# Static per-model floor (minimum budget) keyed by model family name.
# An unknown model falls back to 15 (the haiku floor) — see compute_segment_budget.
STATIC_CAPS_BY_MODEL: dict[str, int] = {"haiku": 15, "sonnet": 20, "opus": 25}


def compute_segment_budget(files_expected_count: int, model: str) -> int:
    """Return the tool-call budget for a segment.

    Spec AC-2:
        min(TOOL_BUDGET_CEILING,
            max(N * PER_FILE_COST + FIXED_OVERHEAD,
                STATIC_CAPS_BY_MODEL.get(model, 15)))

    Args:
        files_expected_count: Number of files in the segment's files_expected.
        model: Model family name ("haiku" | "sonnet" | "opus" | other).

    Returns:
        Integer tool-call budget, always 1 <= budget <= TOOL_BUDGET_CEILING.
    """
    raw = files_expected_count * PER_FILE_COST + FIXED_OVERHEAD
    floor = STATIC_CAPS_BY_MODEL.get(model, 15)
    return min(TOOL_BUDGET_CEILING, max(raw, floor))


def would_overflow(files_expected_count: int) -> bool:
    """Return True if the raw (pre-floor) budget would exceed the hard ceiling.

    Spec AC-3:
        (N * PER_FILE_COST + FIXED_OVERHEAD) > TOOL_BUDGET_CEILING

    Boundary: 11 files -> 38 (False); 12 files -> 41 (True).

    Args:
        files_expected_count: Number of files in the segment's files_expected.

    Returns:
        True iff the segment exceeds the 11-file ceiling and must be decomposed.
    """
    return (files_expected_count * PER_FILE_COST + FIXED_OVERHEAD) > TOOL_BUDGET_CEILING
