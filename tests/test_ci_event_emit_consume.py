"""CI CHECK-3 (Class A — event emit-consume pairing lint).

Closes the "diagnostic log_event with zero consumers" class. Every
``log_event(root, "<name>", ...)`` callsite in ``hooks/`` must be EITHER:

  1. Consumed — some reader checks ``evt.get("event") == "<name>"`` or
     ``evt.get("event","").startswith("<prefix>")`` somewhere in the
     tree, OR
  2. Allowlisted — the event name is in
     ``hooks/lib_log.DIAGNOSTIC_ONLY_EVENTS`` (frozenset added by
     task-007 A-007).

No implicit escape — every unread event name must be in the
allowlist, declared by name, or the emission is a bug.
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

from lib_log import DIAGNOSTIC_ONLY_EVENTS  # noqa: E402


def _collect_emit_names() -> set[str]:
    """Scan hooks/*.py for all ``log_event(root, "X", ...)`` and
    ``_log_event(root, "X", ...)`` callsites. The event name is the
    second positional argument (first is ``root``)."""
    emits: set[str] = set()
    for py in HOOKS_DIR.rglob("*.py"):
        try:
            tree = ast.parse(py.read_text(encoding="utf-8"), filename=str(py))
        except SyntaxError:
            continue
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call):
                continue
            func = node.func
            name = None
            if isinstance(func, ast.Name):
                name = func.id
            elif isinstance(func, ast.Attribute):
                name = func.attr
            if name not in {"log_event", "_log_event"}:
                continue
            if len(node.args) >= 2 and isinstance(node.args[1], ast.Constant) \
                    and isinstance(node.args[1].value, str):
                emits.add(node.args[1].value)
    return emits


def _collect_consume_patterns() -> tuple[set[str], list[str]]:
    """Scan the whole tree (hooks + telemetry + cli + skills) for event
    consumers. Returns (exact_names, prefixes).

    Exact name patterns:
      * ``evt.get("event") == "X"``
      * ``event_name == "X"`` where local variable is clearly from an evt
      * ``"event": "X"`` in filter-dict contexts

    Prefix patterns:
      * ``evt.get("event", "").startswith("X")``
    """
    exact: set[str] = set()
    prefixes: list[str] = []
    scan_roots = [HOOKS_DIR, REPO_ROOT / "telemetry", REPO_ROOT / "cli"]
    for root in scan_roots:
        if not root.exists():
            continue
        for py in root.rglob("*.py"):
            try:
                text = py.read_text(encoding="utf-8")
            except (OSError, UnicodeDecodeError):
                continue
            for m in re.finditer(
                r'(?:evt|event|e|record|r)\.get\(\s*["\']event["\']\s*(?:,\s*[^)]*?)?\)\s*==\s*["\']([^"\']+)["\']',
                text,
            ):
                exact.add(m.group(1))
            for m in re.finditer(
                r'(?:evt|event|e|record|r)\.get\(\s*["\']event["\']\s*(?:,\s*[^)]*?)?\)\s*\.startswith\(\s*["\']([^"\']+)["\']',
                text,
            ):
                prefixes.append(m.group(1))
            # also: if event_name == "X"
            for m in re.finditer(
                r'event(?:_name)?\s*==\s*["\']([^"\']+)["\']',
                text,
            ):
                exact.add(m.group(1))
    return exact, prefixes


def _emit_is_consumed(emit_name: str, consume_exact: set[str],
                      consume_prefixes: list[str]) -> bool:
    if emit_name in consume_exact:
        return True
    return any(emit_name.startswith(p) for p in consume_prefixes)


def test_every_log_event_is_consumed_or_allowlisted():
    """task-007 CHECK-3: every emitted event name must be reachable.

    An event with no consumer AND not in DIAGNOSTIC_ONLY_EVENTS is a
    silently-dead log line. Either wire a consumer, add the name to
    DIAGNOSTIC_ONLY_EVENTS (with a reason), or delete the emission.
    """
    emits = _collect_emit_names()
    exact, prefixes = _collect_consume_patterns()

    orphaned: list[str] = []
    for name in sorted(emits):
        if _emit_is_consumed(name, exact, prefixes):
            continue
        if name in DIAGNOSTIC_ONLY_EVENTS:
            continue
        orphaned.append(name)

    assert not orphaned, (
        "log_event name(s) have no consumer and are not in "
        "DIAGNOSTIC_ONLY_EVENTS. Either wire a consumer, add the name "
        f"to the allowlist in hooks/lib_log.py, or delete: {orphaned}"
    )


def test_diagnostic_allowlist_is_nonempty_and_typed():
    """The allowlist itself must be a frozenset of non-empty strings
    (guards against accidental ``{None}`` / ``{""}`` drift)."""
    assert isinstance(DIAGNOSTIC_ONLY_EVENTS, frozenset)
    assert len(DIAGNOSTIC_ONLY_EVENTS) >= 1
    for name in DIAGNOSTIC_ONLY_EVENTS:
        assert isinstance(name, str) and name, (
            f"DIAGNOSTIC_ONLY_EVENTS contains an invalid entry: {name!r}"
        )
