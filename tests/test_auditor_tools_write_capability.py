"""Regression seal: auditor agents that must persist findings as JSON
must have a tool capable of writing to ``audit-reports/``.

Closes residual 350aaf8d (postmortem-analysis from PR #171's audit cycle):
"code-quality-auditor on haiku must be promoted to sonnet or use
structured-output schema."

Empirical pattern observed in task-20260506-001 and task-20260506-003
audit cycles: code-quality-auditor at haiku tier returned text-only
output and did not write its report file. Other haiku-tier auditors with
the same ``[Read, Grep, Glob, Bash]`` tool list exhibited the same
behavior. The auditors with ``Write`` in their tool list (e.g.
spec-completion-auditor) wrote reports reliably regardless of model.

This test enforces the rule that any auditor whose contract requires
emitting an ``audit-reports/{auditor}-checkpoint-{ts}.json`` file MUST
have ``Write`` in its frontmatter tool list. Without ``Write``, the
auditor must use ``Bash`` heredoc to materialize the file — a pattern
that haiku-tier models do not reliably execute.

The CI gate locks the fix so a future change cannot silently revert
code-quality-auditor's tool list back to the broken shape.
"""
from __future__ import annotations

import re
from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parent.parent
AGENTS_DIR = REPO_ROOT / "agents"


# Auditors whose contract REQUIRES writing audit-reports/ JSON. Listed
# here explicitly so a future audit-* agent doesn't silently inherit
# the requirement without consideration.
AUDITORS_REQUIRED_TO_WRITE = frozenset({
    "spec-completion-auditor",
    "code-quality-auditor",
})


def _read_frontmatter_tools(agent_path: Path) -> list[str]:
    """Extract the ``tools:`` list from a Claude Code agent file's frontmatter.

    Returns the list of tool names as strings. Raises AssertionError if
    the frontmatter is malformed or the ``tools:`` field is missing.
    """
    text = agent_path.read_text(encoding="utf-8")
    # Frontmatter is delimited by --- on its own lines at the top of the file.
    fm_match = re.match(r"^---\s*\n(.*?)\n---\s*\n", text, re.DOTALL)
    assert fm_match, f"{agent_path}: missing YAML frontmatter"
    frontmatter = fm_match.group(1)
    # Find tools: [...] line. Keep simple — bracket-delimited list on one line.
    tools_match = re.search(r"^tools:\s*\[([^\]]*)\]\s*$", frontmatter, re.MULTILINE)
    assert tools_match, f"{agent_path}: missing or malformed `tools:` field"
    return [t.strip() for t in tools_match.group(1).split(",") if t.strip()]


@pytest.mark.parametrize("auditor_name", sorted(AUDITORS_REQUIRED_TO_WRITE))
def test_auditor_has_write_tool(auditor_name: str):
    """Auditors whose contract requires materializing a JSON report file
    must have ``Write`` in their frontmatter tool list.

    Without ``Write``, haiku-tier models reliably fail to use ``Bash``
    heredoc to create the report — observed in task-20260506-001 and
    task-20260506-003 audit cycles. The audit-receipt wrapper then
    falls back to the no-report-path default (zero findings), which is
    forgery-safe but loses the auditor's actual analysis.
    """
    agent_path = AGENTS_DIR / f"{auditor_name}.md"
    assert agent_path.exists(), f"agent file missing: {agent_path}"
    tools = _read_frontmatter_tools(agent_path)
    assert "Write" in tools, (
        f"{auditor_name} must have 'Write' in its frontmatter tool list. "
        f"Current tools: {tools}. Without Write, haiku-tier models do not "
        f"reliably emit the audit-reports/ JSON file. See residual 350aaf8d "
        f"and task-20260506-001 / task-20260506-003 postmortems."
    )


def test_audit_reports_write_rule_permits_audit_role():
    """write_policy.py allows any role starting with 'audit-' to write
    files under audit-reports/. This is the policy-side guarantee that
    Write-equipped auditors can actually exercise the tool.

    This test reads write_policy.py source to verify the rule is in
    place. It is not a runtime test — it's a structural lock so a
    future refactor cannot silently revoke the audit-role write
    permission without breaking this test.
    """
    write_policy_path = REPO_ROOT / "hooks" / "write_policy.py"
    text = write_policy_path.read_text(encoding="utf-8")
    # The rule is at hooks/write_policy.py:260-263 as of 2026-05-06:
    #   if rel_posix is not None and rel_posix.startswith("audit-reports/"):
    #       if attempt.role.startswith("audit-"):
    #           return WriteDecision(True, ...)
    assert 'rel_posix.startswith("audit-reports/")' in text, (
        "write_policy.py must contain the audit-reports/ path-prefix rule"
    )
    assert 'attempt.role.startswith("audit-")' in text, (
        "write_policy.py must permit any audit-* role to write to audit-reports/"
    )


def test_code_quality_auditor_keeps_bash_for_typecheck_hooks():
    """Adding Write must NOT remove Bash from code-quality-auditor.

    The auditor's contract still requires running deterministic
    typecheck/lint hooks (mypy, ruff) via Bash. The fix is additive
    (Bash → Bash + Write), not a swap. This test catches a future
    regression that swapped tool lists wholesale.
    """
    agent_path = AGENTS_DIR / "code-quality-auditor.md"
    tools = _read_frontmatter_tools(agent_path)
    assert "Bash" in tools, (
        f"code-quality-auditor must keep Bash for typecheck/lint hooks. "
        f"Current tools: {tools}"
    )
    assert "Write" in tools, (
        f"code-quality-auditor must have Write for report emission. "
        f"Current tools: {tools}"
    )
