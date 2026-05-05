"""Structural surface-equality test for the hooks/receipts/* split.

Covers:
- AC 14: shim re-exports same __all__ as receipts package; all names callable on both modules
- AC 16: 5 private symbols (_LOG_MESSAGES, _HASH_CACHE, _HASH_CACHE_MAX, _WRITE_ROLE,
         _POSTMORTEM_SKIP_REASONS) accessible as attributes of lib_receipts
- AC 11/12 indirectly: shim's __all__ matches the original 29-name set; receipt_scheduler_refused absent
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

# Both lib_receipts (the shim) and the receipts package live under hooks/.
# The existing test suite already puts hooks/ on sys.path via this pattern.
_HOOKS_DIR = Path(__file__).resolve().parent.parent / "hooks"
sys.path.insert(0, str(_HOOKS_DIR))

import lib_receipts  # noqa: E402  (import after sys.path manipulation)
import receipts  # noqa: E402  (the new hooks/receipts package)


# ---------------------------------------------------------------------------
# AC 14 — __all__ parity between shim and package
# ---------------------------------------------------------------------------

def test_shim_all_matches_package_all():
    """AC 14(a): shim __all__ and package __all__ are set-equal.

    If any name is missing from one side, the set difference reveals it.
    """
    assert set(lib_receipts.__all__) == set(receipts.__all__), (
        f"__all__ mismatch.\n"
        f"  only in lib_receipts: {set(lib_receipts.__all__) - set(receipts.__all__)}\n"
        f"  only in receipts:     {set(receipts.__all__) - set(lib_receipts.__all__)}"
    )


# ---------------------------------------------------------------------------
# AC 14 — every public name reachable on both modules as the same object
# ---------------------------------------------------------------------------

def test_every_public_name_callable_on_shim():
    """AC 14(b): every name in lib_receipts.__all__ is an attribute on both
    lib_receipts and receipts, and both attributes are the *same* object.

    This catches any name that was declared in __all__ but not actually
    bound in the shim (AttributeError) or was accidentally duplicated as
    a different object (identity failure).
    """
    for name in lib_receipts.__all__:
        shim_attr = getattr(lib_receipts, name)  # raises AttributeError if missing
        pkg_attr = getattr(receipts, name)        # raises AttributeError if missing
        assert shim_attr is pkg_attr, (
            f"'{name}': shim and package hold different objects "
            f"({type(shim_attr)} vs {type(pkg_attr)})"
        )


# ---------------------------------------------------------------------------
# AC 16 / AC 13 — all five private symbols accessible on the shim module
# ---------------------------------------------------------------------------

_REQUIRED_PRIVATE_SYMBOLS = [
    "_LOG_MESSAGES",
    "_HASH_CACHE",
    "_HASH_CACHE_MAX",
    "_WRITE_ROLE",
    "_POSTMORTEM_SKIP_REASONS",
]


def test_private_symbols_present_on_shim():
    """AC 16 / AC 13(c): each of the 5 private symbols is accessible as an
    attribute of lib_receipts.  Private names are excluded from star-imports,
    so the shim must re-export each one explicitly.
    """
    for name in _REQUIRED_PRIVATE_SYMBOLS:
        assert hasattr(lib_receipts, name), (
            f"lib_receipts.{name} is missing; the shim must explicitly re-export it"
        )


# ---------------------------------------------------------------------------
# AC 9 — _POSTMORTEM_SKIP_REASONS value integrity
# ---------------------------------------------------------------------------

def test_postmortem_skip_reasons_value():
    """AC 9 / AC 16: _POSTMORTEM_SKIP_REASONS must be exactly the frozenset
    {"clean-task", "no-findings"}.

    A wrong value (e.g. a mutable set or an extra entry) would silently
    corrupt postmortem-skip validation logic.
    """
    assert lib_receipts._POSTMORTEM_SKIP_REASONS == frozenset({"clean-task", "no-findings"}), (
        f"Expected frozenset({{'clean-task', 'no-findings'}}), "
        f"got {lib_receipts._POSTMORTEM_SKIP_REASONS!r}"
    )
    assert isinstance(lib_receipts._POSTMORTEM_SKIP_REASONS, frozenset), (
        "_POSTMORTEM_SKIP_REASONS must be a frozenset, not a plain set"
    )


# ---------------------------------------------------------------------------
# AC 12 — receipt_scheduler_refused absent from __all__ (negative evidence)
# ---------------------------------------------------------------------------

def test_scheduler_refused_not_in_all():
    """AC 12: receipt_scheduler_refused was not in the original __all__ and
    must not appear in either the shim's or the package's __all__.

    Its presence would silently change the public surface and would break
    test_receipts_exports.py's exact-set assertions.
    """
    assert "receipt_scheduler_refused" not in lib_receipts.__all__, (
        "receipt_scheduler_refused must NOT be in lib_receipts.__all__"
    )
    assert "receipt_scheduler_refused" not in receipts.__all__, (
        "receipt_scheduler_refused must NOT be in receipts.__all__"
    )


# ---------------------------------------------------------------------------
# AC 17 — no circular imports between submodules (subprocess isolation)
# ---------------------------------------------------------------------------

def test_no_circular_imports_in_submodules():
    """AC 17: importing each submodule in isolation must not raise
    ImportError (circular import) or any other exception.

    Each submodule is imported in a *fresh* subprocess so that cached
    module state from the parent process cannot mask a real circular
    import that would fire in a clean interpreter.
    """
    submodules = [
        "receipts.core",
        "receipts.stage",
        "receipts.planner",
        "receipts.approval",
        "receipts.cli",
    ]
    hooks_dir = str(_HOOKS_DIR)
    for mod in submodules:
        result = subprocess.run(
            [
                sys.executable,
                "-c",
                f"import sys; sys.path.insert(0, {hooks_dir!r}); import {mod}",
            ],
            capture_output=True,
            text=True,
        )
        assert result.returncode == 0, (
            f"Importing '{mod}' in a clean subprocess failed "
            f"(possible circular import).\n"
            f"  stdout: {result.stdout.strip()}\n"
            f"  stderr: {result.stderr.strip()}"
        )


# ---------------------------------------------------------------------------
# AC 13 — private symbols are the *same* objects (object identity, not copies)
# ---------------------------------------------------------------------------

def test_log_messages_object_identity():
    """AC 13: lib_receipts._LOG_MESSAGES must be the *same* dict object as
    receipts.core._LOG_MESSAGES — not a copy or a second definition.

    A copied dict can diverge silently if one side is mutated at runtime.
    """
    import receipts.core as _core  # noqa: PLC0415

    assert lib_receipts._LOG_MESSAGES is _core._LOG_MESSAGES, (
        "lib_receipts._LOG_MESSAGES is a different object than "
        "receipts.core._LOG_MESSAGES; the shim must re-export the same object"
    )
