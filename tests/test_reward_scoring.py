#!/usr/bin/env python3
"""Tests for reward scoring edge case fix (AC 14)."""

from __future__ import annotations

import os
import sys
import tempfile
import unittest
from pathlib import Path

# Import hooks modules
sys.path.insert(0, str(Path(__file__).parent.parent / "hooks"))


def _make_retrospective(
    task_id: str = "task-001",
    quality_score: float = 0.0,
    cost_score: float = 0.0,
    efficiency_score: float = 0.0,
    task_type: str = "feature",
    risk_level: str = "medium",
    findings: dict | None = None,
    repair_cycles: int = 0,
    spawns: int = 3,
    tokens: float = 10000,
) -> dict:
    """Build a minimal retrospective for reward scoring tests."""
    return {
        "task_id": task_id,
        "task_type": task_type,
        "quality_score": quality_score,
        "cost_score": cost_score,
        "efficiency_score": efficiency_score,
        "task_risk_level": risk_level,
        "task_domains": "backend",
        "model_used_by_agent": {},
        "auditor_zero_finding_streaks": {},
        "executor_repair_frequency": {},
        "findings_by_category": findings or {},
        "findings_by_auditor": {},
        "repair_cycle_count": repair_cycles,
        "spec_review_iterations": 1,
        "subagent_spawn_count": spawns,
        "wasted_spawns": 0,
        "total_token_usage": tokens,
        "agent_source": {},
        "task_outcome": "DONE",
    }


class TestRewardScoringEdgeCase(unittest.TestCase):
    """AC 14: make_trajectory_entry() re-derives scores when quality_score==0."""

    def test_quality_zero_with_nonzero_cost_and_efficiency_triggers_rederivation(self) -> None:
        """When quality_score=0 but cost_score and efficiency_score are non-zero, quality is re-derived.

        This is the core bug fix: the old guard was `if quality == 0 and cost == 0 and efficiency == 0`,
        which meant partial-zero cases were not re-derived.
        """
        from dynoslib import make_trajectory_entry

        retro = _make_retrospective(
            quality_score=0.0,
            cost_score=0.5,
            efficiency_score=0.3,
            findings={"style": 2, "logic": 1},
            repair_cycles=1,
            spawns=4,
            tokens=15000,
        )

        entry = make_trajectory_entry(retro)
        reward = entry["reward"]

        # quality_score should NOT remain 0 after re-derivation
        self.assertGreater(
            reward["quality_score"], 0.0,
            "quality_score should be re-derived when it was 0, even if cost/efficiency are non-zero"
        )
        # Composite reward should also be non-zero
        self.assertGreater(reward["composite_reward"], 0.0)

    def test_quality_zero_cost_zero_efficiency_zero_triggers_rederivation(self) -> None:
        """When all three scores are zero, re-derivation still happens (existing behavior preserved)."""
        from dynoslib import make_trajectory_entry

        retro = _make_retrospective(
            quality_score=0.0,
            cost_score=0.0,
            efficiency_score=0.0,
            findings={"style": 1},
            repair_cycles=0,
            spawns=3,
            tokens=8000,
        )

        entry = make_trajectory_entry(retro)
        reward = entry["reward"]

        # All should be re-derived to non-zero
        self.assertGreater(reward["quality_score"], 0.0)
        self.assertGreater(reward["cost_score"], 0.0)
        self.assertGreater(reward["efficiency_score"], 0.0)
        self.assertGreater(reward["composite_reward"], 0.0)

    def test_all_nonzero_scores_are_not_rederived(self) -> None:
        """When all three scores are non-zero, they pass through without re-derivation."""
        from dynoslib import make_trajectory_entry

        retro = _make_retrospective(
            quality_score=0.75,
            cost_score=0.6,
            efficiency_score=0.8,
        )

        entry = make_trajectory_entry(retro)
        reward = entry["reward"]

        # Scores should pass through as-is
        self.assertAlmostEqual(reward["quality_score"], 0.75)
        self.assertAlmostEqual(reward["cost_score"], 0.6)
        self.assertAlmostEqual(reward["efficiency_score"], 0.8)

    def test_quality_zero_cost_nonzero_efficiency_zero_triggers_rederivation(self) -> None:
        """quality=0 with cost=0.5 and efficiency=0 still triggers re-derivation."""
        from dynoslib import make_trajectory_entry

        retro = _make_retrospective(
            quality_score=0.0,
            cost_score=0.5,
            efficiency_score=0.0,
            findings={},
            repair_cycles=0,
            spawns=2,
            tokens=5000,
        )

        entry = make_trajectory_entry(retro)
        reward = entry["reward"]

        # quality should be re-derived to something > 0
        self.assertGreater(
            reward["quality_score"], 0.0,
            "quality_score=0 should trigger re-derivation regardless of other scores"
        )

    def test_quality_nonzero_cost_zero_efficiency_zero_not_rederived(self) -> None:
        """When quality > 0 but cost and efficiency are 0, no re-derivation happens.

        The fix only triggers on quality==0. Other scores being zero is valid
        (e.g., very expensive task with high quality).
        """
        from dynoslib import make_trajectory_entry

        retro = _make_retrospective(
            quality_score=0.85,
            cost_score=0.0,
            efficiency_score=0.0,
        )

        entry = make_trajectory_entry(retro)
        reward = entry["reward"]

        # quality passes through, cost and efficiency remain 0
        self.assertAlmostEqual(reward["quality_score"], 0.85)
        self.assertAlmostEqual(reward["cost_score"], 0.0)
        self.assertAlmostEqual(reward["efficiency_score"], 0.0)

    def test_rederived_quality_reflects_findings(self) -> None:
        """Re-derived quality_score properly accounts for finding count."""
        from dynoslib import make_trajectory_entry

        # With findings, quality should be lower
        retro_with_findings = _make_retrospective(
            quality_score=0.0,
            cost_score=0.4,
            efficiency_score=0.5,
            findings={"style": 5, "logic": 3},
        )

        # Without findings, quality should be higher (capped at 0.9)
        retro_no_findings = _make_retrospective(
            quality_score=0.0,
            cost_score=0.4,
            efficiency_score=0.5,
            findings={},
        )

        entry_with = make_trajectory_entry(retro_with_findings)
        entry_without = make_trajectory_entry(retro_no_findings)

        self.assertGreater(
            entry_without["reward"]["quality_score"],
            entry_with["reward"]["quality_score"],
            "Zero findings should yield higher quality than many findings"
        )

    def test_rederived_quality_zero_findings_capped_at_09(self) -> None:
        """Re-derived quality with zero findings is capped at 0.9 (may indicate auditor gaps)."""
        from dynoslib import make_trajectory_entry

        retro = _make_retrospective(
            quality_score=0.0,
            cost_score=0.5,
            efficiency_score=0.3,
            findings={},
        )

        entry = make_trajectory_entry(retro)
        self.assertAlmostEqual(
            entry["reward"]["quality_score"], 0.9,
            msg="Zero-findings quality should be 0.9 (capped for potential auditor gaps)"
        )

    def test_composite_reward_uses_standard_weights(self) -> None:
        """Composite reward uses COMPOSITE_WEIGHTS (0.6, 0.25, 0.15)."""
        from dynoslib import make_trajectory_entry, COMPOSITE_WEIGHTS

        retro = _make_retrospective(
            quality_score=0.8,
            cost_score=0.6,
            efficiency_score=0.7,
        )

        entry = make_trajectory_entry(retro)
        wq, we, wc = COMPOSITE_WEIGHTS
        expected = round(wq * 0.8 + we * 0.7 + wc * 0.6, 6)
        self.assertAlmostEqual(entry["reward"]["composite_reward"], expected, places=5)


if __name__ == "__main__":
    unittest.main()
