"""Static-allowlist and invariant tests for the capability-key forge boundary.

Segment owner: segment-A-tdd-allowlist (task-20260504-008).
ACs covered: 2 (public name gone), 11 (module allowlist grep enforcement).
PRO-001 hard constraint: sc-001 (no sys._getframe reintroduction), sc-002 (public name removed).

TDD ordering: these tests are INITIALLY RED on main because:
  - test_module_allowlist_grep: _get_capability_key does not yet exist in write_policy.py
    (the function is still the public get_capability_key), so importing
    _PRIVILEGED_ROLE_MODULE_MAP will succeed but the grep will find zero import lines
    for the post-rename name, meaning the test will pass trivially — UNTIL the
    rename lands (segment-B) and then the test properly validates all six importing files.
    NOTE: on the current main the test passes trivially because no hooks file yet
    imports _get_capability_key (they all import get_capability_key). The meaningful
    RED state for this test is triggered by test_public_get_capability_key_is_gone.
  - test_public_get_capability_key_is_gone: FAILS RED because get_capability_key
    still exists in write_policy (hasattr returns True).
  - test_no_sys_getframe_reintroduction: passes GREEN on main (no violations).
"""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

import pytest

# ---------------------------------------------------------------------------
# Path setup
# ---------------------------------------------------------------------------

ROOT = Path(__file__).resolve().parents[1]
HOOKS_DIR = ROOT / "hooks"

if str(HOOKS_DIR) not in sys.path:
    sys.path.insert(0, str(HOOKS_DIR))


# ---------------------------------------------------------------------------
# AC 11 — Module allowlist grep enforcement
# ---------------------------------------------------------------------------


# AC-11
def test_module_allowlist_grep() -> None:
    """AC 11: Every hooks/*.py module that imports _get_capability_key must appear
    in at least one value-set of _PRIVILEGED_ROLE_MODULE_MAP.

    Greps hooks/*.py (excluding write_policy.py) for:
      - lines matching: from write_policy import ... _get_capability_key
      - lines matching: write_policy._get_capability_key

    For each file found, asserts its stem is present in at least one frozenset
    value of _PRIVILEGED_ROLE_MODULE_MAP. Fails explicitly (never silently skips)
    when any importing module's stem is missing from all value-sets.
    """
    from write_policy import _PRIVILEGED_ROLE_MODULE_MAP  # noqa: PLC0415

    # Build set of all allowlisted stems (union of all frozenset values)
    allowlisted_stems: set[str] = set()
    for value_set in _PRIVILEGED_ROLE_MODULE_MAP.values():
        allowlisted_stems.update(value_set)

    # Patterns that detect an import of _get_capability_key from write_policy
    import_pattern = re.compile(r"from write_policy import[^#\n]*_get_capability_key")
    dotaccess_pattern = re.compile(r"write_policy\._get_capability_key")

    importing_files: list[Path] = []
    for hooks_file in sorted(HOOKS_DIR.glob("*.py")):
        if hooks_file.name == "write_policy.py":
            continue
        source = hooks_file.read_text(encoding="utf-8")
        for lineno, line in enumerate(source.splitlines(), start=1):
            # Skip comment-only lines
            stripped = line.lstrip()
            if stripped.startswith("#"):
                continue
            if import_pattern.search(line) or dotaccess_pattern.search(line):
                importing_files.append(hooks_file)
                break  # one match per file is sufficient

    violations: list[str] = []
    for hooks_file in importing_files:
        stem = hooks_file.stem
        if stem not in allowlisted_stems:
            violations.append(
                f"Module '{stem}' (file: {hooks_file.relative_to(ROOT)}) imports "
                f"_get_capability_key but its stem is absent from all value-sets of "
                f"_PRIVILEGED_ROLE_MODULE_MAP. Add '{stem}' to the appropriate "
                f"frozenset in write_policy.py or remove the import."
            )

    assert not violations, "\n".join(violations)


# ---------------------------------------------------------------------------
# PRO-001 hard constraint sc-001 — no sys._getframe reintroduction
# ---------------------------------------------------------------------------


# AC covers PRO-001 prohibition (audit finding sc-001)
def test_no_sys_getframe_reintroduction() -> None:
    """Greps the seven in-scope hooks files for sys._getframe or caller_module.

    Excludes comment-only lines (first non-whitespace character is '#').
    Asserts zero non-comment matches. The single existing comment-only mention
    in hooks/write_policy.py line 37 is tolerated by this exclusion.

    In-scope files:
      hooks/write_policy.py, hooks/lib_log.py, hooks/router.py,
      hooks/lib_tokens.py, hooks/lib_receipts.py, hooks/ctl.py, hooks/lib_core.py
    """
    in_scope_files = [
        HOOKS_DIR / "write_policy.py",
        HOOKS_DIR / "lib_log.py",
        HOOKS_DIR / "router.py",
        HOOKS_DIR / "lib_tokens.py",
        HOOKS_DIR / "lib_receipts.py",
        HOOKS_DIR / "ctl.py",
        HOOKS_DIR / "lib_core.py",
    ]

    forbidden_patterns = [
        re.compile(r"sys\._getframe"),
        re.compile(r"caller_module"),
    ]

    violations: list[str] = []
    for hooks_file in in_scope_files:
        if not hooks_file.exists():
            # File missing is itself a structural problem; report it
            violations.append(f"In-scope file not found: {hooks_file}")
            continue
        source = hooks_file.read_text(encoding="utf-8")
        for lineno, line in enumerate(source.splitlines(), start=1):
            stripped = line.lstrip()
            # Skip comment-only lines (first non-whitespace char is '#')
            if stripped.startswith("#"):
                continue
            for pattern in forbidden_patterns:
                if pattern.search(line):
                    violations.append(
                        f"{hooks_file.relative_to(ROOT)}:{lineno}: "
                        f"forbidden pattern {pattern.pattern!r} found in non-comment line: "
                        f"{line.rstrip()!r}"
                    )

    assert not violations, (
        "PRO-001 prohibition violated — sys._getframe or caller_module found in "
        f"non-comment code:\n" + "\n".join(violations)
    )


# ---------------------------------------------------------------------------
# AC 2 — Public get_capability_key name is gone
# ---------------------------------------------------------------------------


# AC-2
def test_public_get_capability_key_is_gone() -> None:
    """AC 2: The public name 'get_capability_key' must not exist in write_policy.

    Two assertions:
    1. hasattr(write_policy_module, 'get_capability_key') is False — the attribute
       must not be present at all on the imported module.
    2. A subprocess attempting 'from write_policy import get_capability_key' must
       exit with a non-zero return code AND 'ImportError' must appear in its
       combined stdout+stderr output.

    The private name '_get_capability_key' (underscore-prefixed) is expected to
    exist after segment-B; this test only verifies the public name is absent.
    """
    import importlib  # noqa: PLC0415

    # Force a fresh import (the module may already be in sys.modules from other tests)
    if "write_policy" in sys.modules:
        write_policy_module = sys.modules["write_policy"]
    else:
        write_policy_module = importlib.import_module("write_policy")

    assert not hasattr(write_policy_module, "get_capability_key"), (
        "write_policy still exposes the public 'get_capability_key' attribute. "
        "Rename it to '_get_capability_key' per AC 1 and AC 2."
    )

    # Subprocess check: importing the public name must raise ImportError
    result = subprocess.run(
        [
            sys.executable,
            "-c",
            "import sys; sys.path.insert(0, 'hooks'); from write_policy import get_capability_key",
        ],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
    )

    assert result.returncode != 0, (
        "Expected subprocess to exit non-zero when importing the removed public name "
        "'get_capability_key' from write_policy, but it exited 0. "
        "The public name has not been removed."
    )

    combined_output = result.stdout + result.stderr
    assert "ImportError" in combined_output, (
        "Expected 'ImportError' in subprocess output when importing the removed "
        f"public name 'get_capability_key', but got:\n{combined_output!r}"
    )
