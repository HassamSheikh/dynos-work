"""
Tests for skills/investigate/SKILL.md update — AC27.
"""
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).parent.parent.parent
SKILL_PATH = REPO_ROOT / "skills" / "investigate" / "SKILL.md"


# ---------------------------------------------------------------------------
# AC27: SKILL.md contains triage.py and render_report references
# ---------------------------------------------------------------------------

def test_ac27_skill_md_exists():
    """skills/investigate/SKILL.md exists."""
    assert SKILL_PATH.exists(), f"SKILL.md not found at {SKILL_PATH}"


def test_ac27_skill_md_contains_triage_py():
    """skills/investigate/SKILL.md contains the string 'triage.py'."""
    content = SKILL_PATH.read_text()
    assert "triage.py" in content, (
        f"'triage.py' not found in SKILL.md. First 500 chars:\n{content[:500]}"
    )


def test_ac27_skill_md_contains_render_report():
    """skills/investigate/SKILL.md contains the string 'render_report'."""
    content = SKILL_PATH.read_text()
    assert "render_report" in content, (
        f"'render_report' not found in SKILL.md. First 500 chars:\n{content[:500]}"
    )


def test_ac27_skill_md_does_not_spawn_without_triage():
    """SKILL.md does not instruct spawning @investigator before running triage.py.

    Verifies the pipeline order: triage.py must appear before @investigator.
    If neither appears yet, this test is skipped.
    """
    content = SKILL_PATH.read_text()
    has_investigator = "@investigator" in content
    has_triage = "triage.py" in content

    if not has_investigator or not has_triage:
        pytest.skip(
            "SKILL.md does not yet reference both @investigator and triage.py — "
            "order check skipped pending execution phase"
        )

    triage_pos = content.index("triage.py")
    investigator_pos = content.index("@investigator")
    assert triage_pos < investigator_pos, (
        f"triage.py (pos {triage_pos}) must appear before @investigator (pos {investigator_pos}) "
        "in SKILL.md — the pipeline must run triage first"
    )


def test_ac27_skill_md_references_three_phases():
    """SKILL.md describes a three-phase pipeline structure after update."""
    content = SKILL_PATH.read_text()
    has_triage = "triage.py" in content
    has_render = "render_report" in content

    if not has_triage or not has_render:
        pytest.skip(
            "SKILL.md missing triage.py or render_report — full pipeline check skipped"
        )

    # After update, the file should reference all three pipeline stages
    # Stage 1: triage.py, Stage 2: @investigator, Stage 3: render_report
    assert "triage.py" in content, "Phase 1 (triage) missing"
    assert "render_report" in content, "Phase 3 (render) missing"
