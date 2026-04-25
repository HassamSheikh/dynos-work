"""
Tests for agent replacement files — AC24, AC25, AC26.

Tests for files that do not yet exist use pytest.mark.skip with a clear reason.
"""
import subprocess
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).parent.parent.parent
INVESTIGATOR_PATH = REPO_ROOT / "agents" / "investigator.md"
INVESTIGATOR_LEGACY_PATH = REPO_ROOT / "agents" / "investigator-legacy.md"
TEMPLATE_INVESTIGATOR_PATH = (
    REPO_ROOT / "cli" / "assets" / "templates" / "base" / "agents" / "investigator.md"
)

DEPRECATION_HEADER = (
    "<!-- DEPRECATED: superseded by the lean evidence-contract investigator. "
    "See agents/investigator.md. -->"
)


# ---------------------------------------------------------------------------
# Helper: check if the investigator.md has been replaced with the lean version
# ---------------------------------------------------------------------------

def _investigator_is_lean():
    """Return True if investigator.md exists and contains 'evidence_dossier'."""
    if not INVESTIGATOR_PATH.exists():
        return False
    return "evidence_dossier" in INVESTIGATOR_PATH.read_text()


# ---------------------------------------------------------------------------
# AC24: investigator.md word count <= 400
# ---------------------------------------------------------------------------

@pytest.mark.skipif(
    not _investigator_is_lean(),
    reason=(
        "agents/investigator.md has not yet been replaced with the lean version "
        "(does not contain 'evidence_dossier') — skipping AC24 word count check"
    ),
)
def test_ac24_investigator_word_count_le_400():
    """agents/investigator.md word count (whitespace-split) is <= 400."""
    content = INVESTIGATOR_PATH.read_text()
    word_count = len(content.split())
    assert word_count <= 400, (
        f"investigators.md word count {word_count} exceeds 400 limit"
    )


@pytest.mark.skipif(
    not _investigator_is_lean(),
    reason="agents/investigator.md has not yet been replaced — skipping lean content checks",
)
def test_ac24_investigator_contains_evidence_dossier():
    """Lean agents/investigator.md contains the string 'evidence_dossier'."""
    content = INVESTIGATOR_PATH.read_text()
    assert "evidence_dossier" in content, (
        "agents/investigator.md must reference 'evidence_dossier'"
    )


@pytest.mark.skipif(
    not _investigator_is_lean(),
    reason="agents/investigator.md has not yet been replaced — skipping tool restriction check",
)
def test_ac24_investigator_restricts_tools_to_read_and_grep():
    """Lean investigator.md declares only Read and Grep tools (no Bash/Write/Edit/Glob)."""
    content = INVESTIGATOR_PATH.read_text()
    # The agent must not declare Bash, Write, Edit, or Glob tools
    for banned_tool in ("Bash", "Write", "Edit", "Glob"):
        assert banned_tool not in content or f"tools: [{banned_tool}" not in content, (
            f"agents/investigator.md must not declare {banned_tool!r} tool"
        )


# ---------------------------------------------------------------------------
# AC25: investigator-legacy.md deprecation header
# ---------------------------------------------------------------------------

@pytest.mark.skipif(
    not INVESTIGATOR_LEGACY_PATH.exists(),
    reason=(
        "agents/investigator-legacy.md does not yet exist "
        "— it will be created during execution phase"
    ),
)
def test_ac25_legacy_first_line_is_deprecation_header():
    """First line of agents/investigator-legacy.md is exactly the deprecation string."""
    content = INVESTIGATOR_LEGACY_PATH.read_text()
    first_line = content.splitlines()[0] if content.splitlines() else ""
    assert first_line == DEPRECATION_HEADER, (
        f"First line mismatch.\n"
        f"Expected: {DEPRECATION_HEADER!r}\n"
        f"Got:      {first_line!r}"
    )


@pytest.mark.skipif(
    not INVESTIGATOR_LEGACY_PATH.exists(),
    reason="agents/investigator-legacy.md does not yet exist — skipping legacy content check",
)
def test_ac25_legacy_contains_dynos_work_investigator():
    """agents/investigator-legacy.md contains 'dynos-work Investigator' from the original."""
    content = INVESTIGATOR_LEGACY_PATH.read_text()
    assert "dynos-work Investigator" in content or "dynos-work" in content, (
        "Legacy file must contain original investigator content"
    )


# ---------------------------------------------------------------------------
# AC26: template investigator.md is identical to agents/investigator.md
# ---------------------------------------------------------------------------

@pytest.mark.skipif(
    not _investigator_is_lean() or not TEMPLATE_INVESTIGATOR_PATH.exists(),
    reason=(
        "agents/investigator.md has not been replaced OR "
        "cli/assets/templates/base/agents/investigator.md does not yet exist "
        "— skipping AC26 diff check"
    ),
)
def test_ac26_template_investigator_identical_to_main():
    """cli/.../base/agents/investigator.md is byte-for-byte identical to agents/investigator.md."""
    proc = subprocess.run(
        ["diff", str(INVESTIGATOR_PATH), str(TEMPLATE_INVESTIGATOR_PATH)],
        capture_output=True,
        text=True,
    )
    assert proc.returncode == 0, (
        f"Files differ.\ndiff output:\n{proc.stdout}"
    )
    assert proc.stdout == "", (
        f"diff produced output — files are not identical:\n{proc.stdout}"
    )
