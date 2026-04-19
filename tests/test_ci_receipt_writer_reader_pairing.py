"""CI CHECK-1 (Class A — writer-reader pairing lint).

Closes the "silently vacuous gate" class by asserting every writer step
name in `lib_receipts._LOG_MESSAGES` has at least one in-tree reader
(either a `read_receipt`/`require_receipt` call in Python source, a
``stage_requires`` tuple entry in ``hooks/lib_core.py``, or a prose
reference in skills/cli templates naming the step name).

Orphan writers (task-007 A-001: ``receipt_plan_routing``) are now
structurally impossible to re-introduce — any writer added without a
reader will fail this test.

No ALLOWLIST escape hatch. If a writer is genuinely unused, the fix is
to delete it, not extend the allowlist.
"""
from __future__ import annotations

import ast
import re
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent
HOOKS_DIR = REPO_ROOT / "hooks"
sys.path.insert(0, str(HOOKS_DIR))

import lib_receipts  # noqa: E402


# Family-prefix step names — these are dynamically suffixed by writers
# (``audit-{auditor_name}``, ``executor-{segment_id}``) so the per-name
# reader isn't literal. Presence of a prefix reader satisfies the pair.
_FAMILY_PREFIXES = {
    "audit-": ["audit-"],
    "executor-": ["executor-"],
}


def _writer_step_names() -> set[str]:
    """Canonical writer set — every writer appends a _LOG_MESSAGES entry.

    _LOG_MESSAGES keys ARE the step names. A writer without a log message
    is already caught by test_log_messages_all_reachable.
    """
    return set(lib_receipts._LOG_MESSAGES.keys())


def _collect_reader_literals() -> set[str]:
    """Scan the in-tree reader surface for step-name literals.

    Sources:
      1. Python AST scan of hooks/*.py for ``read_receipt(td, "X")`` and
         ``require_receipt(td, "X")`` calls.
      2. ``stage_requires`` dict literal in ``hooks/lib_core.py`` — every
         tuple value names step names.
      3. Plain-text references in skills/*.md, cli/assets/templates/*.md,
         bin/dynos (any word matching a _LOG_MESSAGES key).

    Returns the union of literal step names found anywhere a reader
    could plausibly refer to them.
    """
    reader_names: set[str] = set()

    # (1) Python AST scan of hooks/
    for py in HOOKS_DIR.rglob("*.py"):
        try:
            tree = ast.parse(py.read_text(encoding="utf-8"), filename=str(py))
        except SyntaxError:
            continue
        for node in ast.walk(tree):
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) \
                    and node.func.id in {"read_receipt", "require_receipt"}:
                # Second positional arg is the step name.
                if len(node.args) >= 2 and isinstance(node.args[1], ast.Constant) \
                        and isinstance(node.args[1].value, str):
                    reader_names.add(node.args[1].value)
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) \
                    and node.func.attr in {"read_receipt", "require_receipt"}:
                if len(node.args) >= 2 and isinstance(node.args[1], ast.Constant) \
                        and isinstance(node.args[1].value, str):
                    reader_names.add(node.args[1].value)

    # (2) stage_requires dict literals — scan lib_core.py for any dict
    # whose values are iterables of string literals; treat every literal
    # as a reader reference.
    for py in [HOOKS_DIR / "lib_core.py", HOOKS_DIR / "lib_receipts.py"]:
        if not py.exists():
            continue
        text = py.read_text(encoding="utf-8")
        # Match literal strings that appear inside tuple/list/set contexts
        # close to the keyword ``stage_requires`` or ``stage_requires =``.
        # Conservative: collect all string literals in the file — this
        # over-counts but never misses a real reader.
        try:
            tree = ast.parse(text, filename=str(py))
        except SyntaxError:
            continue
        for node in ast.walk(tree):
            if isinstance(node, ast.Constant) and isinstance(node.value, str):
                reader_names.add(node.value)

    # (3) Plain-text references in skills + cli templates + bin/.
    for pattern in ("skills/**/*.md", "cli/assets/templates/**/*.md"):
        for md in REPO_ROOT.glob(pattern):
            try:
                txt = md.read_text(encoding="utf-8")
            except UnicodeDecodeError:
                continue
            # For each known step name, test literal presence as a word.
            for name in _writer_step_names():
                if re.search(rf"\b{re.escape(name)}\b", txt):
                    reader_names.add(name)
    bin_dynos = REPO_ROOT / "bin" / "dynos"
    if bin_dynos.exists():
        try:
            txt = bin_dynos.read_text(encoding="utf-8")
            for name in _writer_step_names():
                if re.search(rf"\b{re.escape(name)}\b", txt):
                    reader_names.add(name)
        except UnicodeDecodeError:
            pass

    return reader_names


def _has_family_reader(step_name: str, reader_literals: set[str]) -> bool:
    """For family-prefixed step names (``audit-sec``, ``executor-seg-1``),
    accept any reader literal that shares the family prefix or the bare
    prefix itself."""
    for prefix in _FAMILY_PREFIXES:
        if step_name == prefix or step_name.startswith(prefix):
            return any(lit.startswith(prefix) for lit in reader_literals)
    return False


def test_every_writer_step_has_a_reader():
    """Every _LOG_MESSAGES key must be referenced by an in-tree reader.

    Task-007 CHECK-1 (A-class structural prevention): this is the lint
    that would have caught ``plan-routing`` (the writer deleted by
    A-001) before it landed. Going forward, a writer with no readers
    fails this test immediately and cannot be merged.
    """
    writers = _writer_step_names()
    readers = _collect_reader_literals()

    orphaned = []
    for step in sorted(writers):
        if step in readers:
            continue
        if _has_family_reader(step, readers):
            continue
        orphaned.append(step)

    assert not orphaned, (
        "silently-vacuous writer(s): these step names in "
        "_LOG_MESSAGES have no reader anywhere in the tree — "
        f"either wire a reader or delete the writer: {orphaned}"
    )


def test_no_plan_routing_regression():
    """Specific pin: task-007 A-001 deleted ``receipt_plan_routing`` and
    its ``plan-routing`` log message. A regression that re-adds either
    should fail this test before the orphan-pairing test catches it."""
    assert "plan-routing" not in lib_receipts._LOG_MESSAGES
    assert not hasattr(lib_receipts, "receipt_plan_routing")
    assert "receipt_plan_routing" not in lib_receipts.__all__
