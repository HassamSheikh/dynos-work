"""Regression: no `learned_agent_injected` literal anywhere in caller code (AC 14)."""
from __future__ import annotations

import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_no_literal_in_hooks_or_skills_or_templates():
    """Use ripgrep to confirm zero matches for `learned_agent_injected` in
    hooks/, skills/, and cli/assets/templates/. Excludes __pycache__/*.pyc."""
    targets = [ROOT / "hooks", ROOT / "skills", ROOT / "cli" / "assets" / "templates"]
    targets = [str(p) for p in targets if p.exists()]
    assert targets, "expected at least one target dir to exist"
    proc = subprocess.run(
        ["grep", "-rn", "--include=*.py", "--include=*.md",
         "learned_agent_injected", *targets],
        capture_output=True, text=True, check=False,
    )
    # grep returns 1 when no matches; 0 when matches found.
    assert proc.returncode == 1, (
        f"unexpected matches for learned_agent_injected:\n{proc.stdout}"
    )
