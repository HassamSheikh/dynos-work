"""Tests for claude-md-auditor wiring and lib_claude_md.py deterministic behavior.

Covers spec AC-21 through AC-33:
  - Router registry membership (AC-22, AC-23, AC-24)
  - build_audit_plan entries for standard and fast-track modes (AC-25, AC-26)
  - lib_claude_md.extract_rules: hard/preference classification (AC-27, AC-28)
  - lib_claude_md.extract_rules: missing files, no-rules-found (AC-29, AC-33)
  - lib_claude_md.extract_rules: local-only, no global warning (AC-30)
  - lib_claude_md.extract_rules: conflict detection (AC-31)
  - lib_claude_md.extract_rules: truncation cap (AC-32)

TDD-first: tests 6-12 (lib_claude_md) will fail with ImportError until
hooks/lib_claude_md.py is written. Tests 1-5 (router) will fail with
AssertionError until hooks/router.py is updated with claude-md-auditor entries.
That is the expected TDD-first state.
"""
from __future__ import annotations

import sys
from pathlib import Path
from unittest import mock

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "hooks"))


# ---------------------------------------------------------------------------
# Router registry membership tests (AC-22, AC-23, AC-24)
# ---------------------------------------------------------------------------


def test_default_auditor_registry_contains_claude_md_auditor_in_always():
    """AC-22: claude-md-auditor appears in _DEFAULT_AUDITOR_REGISTRY["always"]."""
    from router import _DEFAULT_AUDITOR_REGISTRY

    assert "claude-md-auditor" in _DEFAULT_AUDITOR_REGISTRY["always"]


def test_default_auditor_registry_contains_claude_md_auditor_in_fast_track():
    """AC-23: claude-md-auditor appears in _DEFAULT_AUDITOR_REGISTRY["fast_track"]."""
    from router import _DEFAULT_AUDITOR_REGISTRY

    assert "claude-md-auditor" in _DEFAULT_AUDITOR_REGISTRY["fast_track"]


def test_skip_exempt_contains_claude_md_auditor():
    """AC-24: claude-md-auditor is in SKIP_EXEMPT (prevents streak-based skip suppression)."""
    from router import SKIP_EXEMPT

    assert "claude-md-auditor" in SKIP_EXEMPT


# ---------------------------------------------------------------------------
# build_audit_plan tests (AC-25, AC-26)
# ---------------------------------------------------------------------------


def test_build_audit_plan_includes_claude_md_auditor_standard(tmp_path: Path):
    """AC-25: Standard (non-fast-track) plan includes claude-md-auditor with action=spawn, model=sonnet."""
    from router import build_audit_plan

    with mock.patch("router.collect_retrospectives", return_value=[]):
        plan = build_audit_plan(tmp_path, "feature", ["backend"], fast_track=False)

    auditor_entries = {entry["name"]: entry for entry in plan["auditors"]}
    assert "claude-md-auditor" in auditor_entries, (
        "claude-md-auditor not found in plan auditors: "
        + str([e["name"] for e in plan["auditors"]])
    )
    entry = auditor_entries["claude-md-auditor"]
    assert entry["action"] == "spawn", f"Expected action=spawn, got {entry['action']!r}"
    assert entry["model"] == "sonnet", f"Expected model=sonnet, got {entry['model']!r}"


def test_build_audit_plan_includes_claude_md_auditor_fast_track(tmp_path: Path):
    """AC-26: Fast-track plan includes claude-md-auditor with model=sonnet (NOT haiku).

    Verifies that the fast-track haiku override at router.py:912 does NOT apply
    to claude-md-auditor (it is gated on auditor == "spec-completion-auditor").
    """
    from router import build_audit_plan

    with mock.patch("router.collect_retrospectives", return_value=[]):
        plan = build_audit_plan(tmp_path, "feature", ["backend"], fast_track=True)

    auditor_entries = {entry["name"]: entry for entry in plan["auditors"]}
    assert "claude-md-auditor" in auditor_entries, (
        "claude-md-auditor not found in fast-track plan auditors: "
        + str([e["name"] for e in plan["auditors"]])
    )
    entry = auditor_entries["claude-md-auditor"]
    assert entry["action"] == "spawn", f"Expected action=spawn, got {entry['action']!r}"
    assert entry["model"] == "sonnet", (
        f"Expected model=sonnet (not haiku) on fast_track for claude-md-auditor, "
        f"got {entry['model']!r}"
    )


# ---------------------------------------------------------------------------
# lib_claude_md.extract_rules tests (AC-27 through AC-33)
# ---------------------------------------------------------------------------


def test_lib_claude_md_hard_rule_classification(tmp_path: Path):
    """AC-27: Lines containing each trigger word from AC-8 are classified as tier="hard".

    Trigger words: never, must, do not, always, important, critical, forbidden.
    """
    from lib_claude_md import extract_rules

    claude_md = tmp_path / "CLAUDE.md"
    claude_md.write_text(
        "never commit secrets to the repo\n"
        "must run tests before merging\n"
        "do not use wildcard imports\n"
        "always use absolute file paths\n"
        "important: keep functions under 50 lines\n"
        "critical: validate all user inputs\n"
        "forbidden to push directly to main\n",
        encoding="utf-8",
    )

    result = extract_rules(str(claude_md), None)
    rules = result["local_rules"]

    assert len(rules) >= 7, f"Expected at least 7 rules, got {len(rules)}: {rules}"
    tiers = {rule["tier"] for rule in rules}
    assert tiers == {"hard"}, (
        f"Expected all rules to be tier='hard', but found tiers: {tiers}. "
        f"Rules: {rules}"
    )


def test_lib_claude_md_preference_rule_classification(tmp_path: Path):
    """AC-28: Lines with no trigger words from AC-8 are classified as tier="preference"."""
    from lib_claude_md import extract_rules

    claude_md = tmp_path / "CLAUDE.md"
    claude_md.write_text(
        "prefer descriptive variable names\n"
        "keep line length under 120 characters\n"
        "use type hints where practical\n",
        encoding="utf-8",
    )

    result = extract_rules(str(claude_md), None)
    rules = result["local_rules"]

    assert len(rules) >= 3, f"Expected at least 3 rules, got {len(rules)}: {rules}"
    for rule in rules:
        assert rule["tier"] == "preference", (
            f"Expected tier='preference' for rule {rule['text']!r}, got {rule['tier']!r}"
        )


def test_lib_claude_md_no_files_present():
    """AC-29: Both paths None → local_rules=[], global_rules=[], no_rules_found=True, no exception."""
    from lib_claude_md import extract_rules

    result = extract_rules(None, None)

    assert result["local_rules"] == [], f"Expected empty local_rules, got {result['local_rules']}"
    assert result["global_rules"] == [], f"Expected empty global_rules, got {result['global_rules']}"
    assert result["no_rules_found"] is True, (
        f"Expected no_rules_found=True, got {result['no_rules_found']}"
    )


def test_lib_claude_md_local_only_no_global_warning(tmp_path: Path):
    """AC-30: Local file present, non-existent global path → global_rules=[], no truncation warnings, no_rules_found=False."""
    from lib_claude_md import extract_rules

    local_claude = tmp_path / "CLAUDE.md"
    local_claude.write_text("always use tabs for indentation\n", encoding="utf-8")
    non_existent_global = str(tmp_path / "nonexistent_global_claude.md")

    result = extract_rules(str(local_claude), non_existent_global)

    assert result["global_rules"] == [], (
        f"Expected empty global_rules for non-existent path, got {result['global_rules']}"
    )
    assert result["truncation_warnings"] == [], (
        f"Expected no truncation warnings, got {result['truncation_warnings']}"
    )
    assert result["no_rules_found"] is False, (
        f"Expected no_rules_found=False when local file has rules, got {result['no_rules_found']}"
    )


def test_lib_claude_md_conflict_detection(tmp_path: Path):
    """AC-31: Opposing rules on same topic (always vs never + tabs) emit a conflict entry."""
    from lib_claude_md import extract_rules

    local_claude = tmp_path / "local_claude.md"
    local_claude.write_text("always use tabs for indentation\n", encoding="utf-8")

    global_claude = tmp_path / "global_claude.md"
    global_claude.write_text("never use tabs for indentation\n", encoding="utf-8")

    result = extract_rules(str(local_claude), str(global_claude))

    conflicts = result["conflicts"]
    assert len(conflicts) > 0, (
        f"Expected at least one conflict for opposing 'always use tabs' vs 'never use tabs', "
        f"got empty conflicts. local_rules={result['local_rules']}, global_rules={result['global_rules']}"
    )
    conflict = conflicts[0]
    assert "local_rule" in conflict, f"Conflict entry missing 'local_rule' field: {conflict}"
    assert "global_rule" in conflict, f"Conflict entry missing 'global_rule' field: {conflict}"


def test_lib_claude_md_truncation_cap(tmp_path: Path):
    """AC-32: File > 200,000 bytes is truncated; processing continues; local_rules is not empty."""
    from lib_claude_md import extract_rules

    large_claude = tmp_path / "CLAUDE.md"
    # Write a preamble with rule content then pad to exceed 200,001 bytes.
    # The preamble must contain valid rule lines so local_rules is non-empty after truncation.
    preamble = (
        "never commit secrets to version control\n"
        "must write tests for all new functions\n"
        "always use absolute file paths in scripts\n"
    )
    padding_needed = 200_001 - len(preamble.encode("utf-8"))
    # Pad with repeated comment-like text that won't produce additional rules
    padding = ("x" * 99 + "\n") * (padding_needed // 100 + 1)
    content = preamble + padding
    # Write as bytes to guarantee exact byte count
    content_bytes = content.encode("utf-8")
    # Ensure file is at least 200,001 bytes
    if len(content_bytes) < 200_001:
        content_bytes += b"x" * (200_001 - len(content_bytes))
    large_claude.write_bytes(content_bytes)

    assert large_claude.stat().st_size >= 200_001, (
        f"Test setup error: file size {large_claude.stat().st_size} < 200,001"
    )

    result = extract_rules(str(large_claude), None)

    assert len(result["truncation_warnings"]) > 0, (
        "Expected at least one truncation warning for a file >= 200,001 bytes"
    )
    warning = result["truncation_warnings"][0]
    assert warning["truncated_at_bytes"] == 200_000, (
        f"Expected truncated_at_bytes=200000, got {warning['truncated_at_bytes']}"
    )
    assert len(result["local_rules"]) > 0, (
        "Expected local_rules to be non-empty after truncation (processing must continue on truncated content)"
    )


def test_lib_claude_md_no_rules_found_flag(tmp_path: Path):
    """AC-33: no_rules_found=True when both files absent; no_rules_found=False when at least one file has a rule."""
    from lib_claude_md import extract_rules

    # Both absent: no_rules_found must be True
    non_existent_local = str(tmp_path / "no_local.md")
    non_existent_global = str(tmp_path / "no_global.md")
    result_absent = extract_rules(non_existent_local, non_existent_global)
    assert result_absent["no_rules_found"] is True, (
        f"Expected no_rules_found=True when both files absent, got {result_absent['no_rules_found']}"
    )

    # At least one present with a rule: no_rules_found must be False
    local_with_rule = tmp_path / "CLAUDE.md"
    local_with_rule.write_text("never use mutable default arguments\n", encoding="utf-8")
    result_present = extract_rules(str(local_with_rule), non_existent_global)
    assert result_present["no_rules_found"] is False, (
        f"Expected no_rules_found=False when local file has rules, got {result_present['no_rules_found']}"
    )
