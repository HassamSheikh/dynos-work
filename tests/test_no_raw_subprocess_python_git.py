"""Structural regression test: no `hooks/` Python file (excluding `worktree.py`
and `daemon.py`, which already define `_PYTHON3`/`_GIT` constants) may use a
bare `"python3"` or `"git"` string literal as the first element of a list.

PRO-007 (task-20260505-003) widened scope after the freshness-probe found that
the original residual under-counted: literals appear via three patterns —
direct `subprocess.run([...])`, helper indirection (`_run([...], ...)`), and
variable-stored lists later passed to `subprocess.run`. The original AST-only
test missed the latter two. This test scans for ANY list literal whose first
element is a bare `"python3"`/`"git"` constant, regardless of where the list
flows. False-positives are avoided: `_GIT or "git"` produces an `ast.BoolOp`
as the list element, not an `ast.Constant`, so it does not match.

Expected state on unmodified main: RED (25 violations across 8 files).
Expected state after the PRO-007 fix lands: GREEN (0 violations).
"""

import ast
from pathlib import Path

HOOKS_DIR = Path(__file__).resolve().parent.parent / "hooks"
EXCLUDE_FILES = {"worktree.py", "daemon.py"}
RAW_LITERALS = {"python3", "git"}


def _hook_source_files() -> list[Path]:
    """Yield every .py file under hooks/ excluding test files and the two
    files that already define `_PYTHON3`/`_GIT` (worktree.py, daemon.py).

    Recurses into subdirectories (e.g. `hooks/handlers/`) because subprocess
    helpers live there too.
    """
    files: list[Path] = []
    for py_file in HOOKS_DIR.rglob("*.py"):
        if py_file.name in EXCLUDE_FILES:
            continue
        if py_file.name.startswith("test_"):
            continue
        files.append(py_file)
    return sorted(files)


def _collect_violations() -> list[tuple[str, int]]:
    """Find every `ast.List` literal in the source whose first element is a
    bare `"python3"` or `"git"` `ast.Constant`.

    This is broader than scanning only direct `subprocess.run(...)` calls —
    it catches helper indirection (`_run([...], ...)`) and variable-stored
    forms (`cmd = ["git", ...]; subprocess.run(cmd, ...)`) too. Both
    patterns are common in `hooks/` and were the root cause of PRO-007's
    scope under-count.

    Returns a sorted list of `(filepath_str, lineno)` violations.
    """
    violations: list[tuple[str, int]] = []

    for py_file in _hook_source_files():
        source = py_file.read_text(encoding="utf-8")
        try:
            tree = ast.parse(source, filename=str(py_file))
        except SyntaxError:
            continue

        for node in ast.walk(tree):
            if not isinstance(node, ast.List):
                continue
            if not node.elts:
                continue
            first_elt = node.elts[0]
            if not isinstance(first_elt, ast.Constant):
                continue
            if first_elt.value in RAW_LITERALS:
                violations.append((str(py_file), node.lineno))

    return sorted(violations)


def test_no_raw_subprocess_python_git_in_hooks() -> None:
    """Assert that no hooks/ file uses a bare `"python3"` or `"git"` string
    constant as the first element of a list literal. Catches direct,
    helper-indirected, and variable-stored subprocess command patterns.
    """
    violations = _collect_violations()
    assert violations == [], (
        f"Found {len(violations)} raw 'python3'/'git' list-literal(s) in "
        f"hooks/ (excluding worktree.py + daemon.py). Each must be replaced "
        f"with the resolved `_PYTHON3` / `_GIT or \"git\"` constant from the "
        f"file's module scope.\n"
        f"Offending (file, line) pairs:\n"
        + "\n".join(f"  {filepath}:{lineno}" for filepath, lineno in violations)
    )
