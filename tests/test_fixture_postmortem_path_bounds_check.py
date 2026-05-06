"""Static analysis tests enforcing the SEC-001 path-traversal bounds-check pattern
in pytest fixtures that call receipt_postmortem_generated().

## SEC-001 lineage

This check is a direct follow-on to PR #171 (task-20260506-003), which added the
production-side path-traversal bounds check in hooks/receipts/approval.py. PR #171
repaired two broken fixtures in test_gate_done_postmortem.py and
test_receipt_contract_version_bump.py. This file detects any future fixture that
constructs a postmortem path rooted inside task_dir and passes it to
receipt_postmortem_generated(), catching the class of regression that caused the
third broken fixture in test_ci_diagnostic_gate_parity.py::_full_done_chain (lines
89-91), which is repaired in task-20260506-004 (AC-1).

## Accepted limitation: single-level alias chains only

The detection algorithm tracks the task_dir variable extracted from the first
positional argument of the receipt_postmortem_generated() call and checks whether
the path variable (second positional arg or postmortem_json_path= kwarg) was
assigned via a BinOp of the form `<task_dir_var> / <anything>`. Only direct
assignment is detected. Aliased chains such as:

    task = td
    pm = task / "postmortem.json"

are NOT caught because `task` is not `td` in the AST name comparison. This matches
the single-level limitation established in PR #171 and documented in
design-decisions.md section B.

## Path() unwrap scope

The path argument resolution (AC-5 Step 5) unwraps exactly one level of Path(...)
wrapping. If the second argument to receipt_postmortem_generated() is
Path(some_var), the checker peels it and tracks some_var. Deeper nesting (e.g.,
Path(Path(x))) is not unwrapped — only the outermost level is peeled.

## Negative-case verification approach

test_static_check_detects_synthetic_task_dir_postmortem feeds a synthetic Python
source string (an antipattern fixture function) through _collect_fixture_violations()
via ast.parse() and asserts a violation is returned. No real files on disk are
modified or read for this test.
"""

import ast
from pathlib import Path

import pytest

# ---------------------------------------------------------------------------
# Module-level constants encoding positional argument indexes for
# receipt_postmortem_generated(task_dir, postmortem_json_path) calls.
# ---------------------------------------------------------------------------

_TASK_DIR_ARG_INDEX = 0
_PATH_ARG_INDEX = 1


# ---------------------------------------------------------------------------
# Checker implementation
# ---------------------------------------------------------------------------


def _collect_fixture_violations(source_text: str, rel_path: str) -> list[str]:
    """Parse *source_text* and return a list of violation strings.

    Detection algorithm (AC-5 steps 1-7, verbatim):

    Step 1: ast.parse(source_text); on SyntaxError return [].
    Step 2: Walk ast.FunctionDef / ast.AsyncFunctionDef nodes.
    Step 3: Within each function, collect ast.Call nodes whose func is
            ast.Name(id="receipt_postmortem_generated").
    Step 4: Extract the first positional arg (index _TASK_DIR_ARG_INDEX=0).
            If fewer than 1 positional arg, skip. If arg is ast.Name, record
            task_dir_var = node.id; else skip.
    Step 5: Extract the second positional arg (index _PATH_ARG_INDEX=1) or the
            keyword arg whose arg == "postmortem_json_path". Resolve to name:
              - ast.Name -> path_var = node.id
              - ast.Call(func=Name("Path"), one positional arg that is Name) ->
                peel one level, path_var = inner_arg.id
              - otherwise skip.
    Step 6: Walk ast.Assign statements in the same function. Check whether the
            RHS is ast.BinOp with op=ast.Div, left=ast.Name(id==task_dir_var),
            and any target of the assignment is ast.Name(id==path_var).
            If such an assignment is found: violation.
    Step 7: Emit:
            "{rel_path}:{lineno} — receipt_postmortem_generated() called with
            postmortem path '{path_var}' constructed inside task_dir
            ('{task_dir_var}'); must use _persistent_project_dir(root) /
            \"postmortems\""
            using the ast.Call node's lineno.

    *rel_path* is used verbatim as the file prefix in the message.
    """
    # Step 1: parse
    try:
        tree = ast.parse(source_text)
    except SyntaxError:
        return []

    violations: list[str] = []

    # Step 2: walk function nodes
    for node in ast.walk(tree):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue

        # Step 3: collect receipt_postmortem_generated calls
        rpg_calls: list[ast.Call] = []
        for inner in ast.walk(node):
            if (
                isinstance(inner, ast.Call)
                and isinstance(inner.func, ast.Name)
                and inner.func.id == "receipt_postmortem_generated"
            ):
                rpg_calls.append(inner)

        for call in rpg_calls:
            # Step 4: extract task_dir candidate
            if len(call.args) < 1:
                continue
            first_arg = call.args[_TASK_DIR_ARG_INDEX]
            if not isinstance(first_arg, ast.Name):
                continue
            task_dir_var = first_arg.id

            # Step 5: extract path argument name
            path_arg_node: ast.expr | None = None
            if len(call.args) > _PATH_ARG_INDEX:
                path_arg_node = call.args[_PATH_ARG_INDEX]
            else:
                for kw in call.keywords:
                    if kw.arg == "postmortem_json_path":
                        path_arg_node = kw.value
                        break

            if path_arg_node is None:
                continue

            # Resolve to a name
            path_var: str | None = None
            if isinstance(path_arg_node, ast.Name):
                path_var = path_arg_node.id
            elif (
                isinstance(path_arg_node, ast.Call)
                and isinstance(path_arg_node.func, ast.Name)
                and path_arg_node.func.id == "Path"
                and len(path_arg_node.args) == 1
                and isinstance(path_arg_node.args[0], ast.Name)
            ):
                path_var = path_arg_node.args[0].id

            if path_var is None:
                continue

            # Step 6: check assignment — look for path_var = task_dir_var / <anything>
            violation_found = False
            for stmt in ast.walk(node):
                if not isinstance(stmt, ast.Assign):
                    continue
                rhs = stmt.value
                if not (
                    isinstance(rhs, ast.BinOp)
                    and isinstance(rhs.op, ast.Div)
                    and isinstance(rhs.left, ast.Name)
                    and rhs.left.id == task_dir_var
                ):
                    continue
                for target in stmt.targets:
                    if isinstance(target, ast.Name) and target.id == path_var:
                        violation_found = True
                        break
                if violation_found:
                    break

            if not violation_found:
                continue

            # Step 7: emit violation
            lineno = call.lineno
            msg = (
                f"{rel_path}:{lineno} — receipt_postmortem_generated() called with "
                f"postmortem path '{path_var}' constructed inside task_dir "
                f"('{task_dir_var}'); must use _persistent_project_dir(root) / \"postmortems\""
            )
            violations.append(msg)

    return violations


# ---------------------------------------------------------------------------
# Test 1 (AC-7): Real scan of tests/test_*.py
# ---------------------------------------------------------------------------


def test_fixture_postmortem_paths_use_persistent_dir() -> None:
    """Scan all tests/test_*.py files and assert that no fixture constructs a
    postmortem path inside task_dir and passes it to receipt_postmortem_generated().

    Globs Path(__file__).parent for test_*.py files. Asserts at least one file is
    found (catches misconfigured paths). On violation calls pytest.fail() with a
    bullet-list message showing each offending site.
    """
    tests_dir = Path(__file__).parent
    py_files = sorted(tests_dir.glob("test_*.py"))

    assert py_files, f"No test_*.py files found under {tests_dir}"

    repo_root = Path(__file__).parent.parent
    all_violations: list[str] = []

    for py_file in py_files:
        source = py_file.read_text(encoding="utf-8")
        rel_path = str(py_file.relative_to(repo_root))
        violations = _collect_fixture_violations(source, rel_path)
        all_violations.extend(violations)

    if all_violations:
        bullet_list = "\n".join(f"  • {v}" for v in all_violations)
        pytest.fail(
            f"Found {len(all_violations)} fixture(s) constructing postmortem path inside task_dir:\n"
            f"{bullet_list}"
        )


# ---------------------------------------------------------------------------
# Test 2 (AC-9): Negative case — checker detects synthetic antipattern
# ---------------------------------------------------------------------------


def test_static_check_detects_synthetic_task_dir_postmortem() -> None:
    """Feed a synthetic Python source with the antipattern through _collect_fixture_violations
    and assert at least one violation is returned naming 'pm' and 'td'.

    The synthetic source contains pm = td / "postmortem.json" followed by
    receipt_postmortem_generated(td, pm) — the exact pattern banned by SEC-001.
    """
    source = (
        'def bad_fixture(td, task_dir):\n'
        '    pm = td / "postmortem.json"\n'
        '    pm.write_text("{}")\n'
        '    receipt_postmortem_generated(td, pm)\n'
    )

    violations = _collect_fixture_violations(source, "tests/fake_test.py")

    assert violations, (
        "Expected at least one violation for the synthetic antipattern "
        "(pm = td / 'postmortem.json' passed to receipt_postmortem_generated), "
        "but the checker returned no violations."
    )

    combined = "\n".join(violations)
    assert "'pm'" in combined, (
        f"Expected \"'pm'\" in violation message, got: {combined!r}"
    )
    assert "'td'" in combined, (
        f"Expected \"'td'\" in violation message, got: {combined!r}"
    )
    assert "receipt_postmortem_generated() called with postmortem path" in combined, (
        f"Expected standard violation phrasing in message, got: {combined!r}"
    )


# ---------------------------------------------------------------------------
# Test 3 (AC-10): False-positive guard — call-derived postmortem path
# ---------------------------------------------------------------------------


def test_static_check_passes_on_call_derived_postmortem_path() -> None:
    """A fixture where pm is the return value of _write_postmortem_fixture(...)
    must produce zero violations.

    pm is assigned from an ast.Call node, not an ast.BinOp, so step 6's BinOp
    check does not match and the checker correctly reports no violations.
    """
    source = (
        'def good_fixture(td):\n'
        '    pm = _write_postmortem_fixture(td, 0, 0)\n'
        '    receipt_postmortem_generated(td, pm)\n'
    )

    violations = _collect_fixture_violations(source, "tests/fake_test.py")

    assert violations == [], (
        f"Expected zero violations for call-derived postmortem path, "
        f"but got: {violations}"
    )


# ---------------------------------------------------------------------------
# Test 4 (AC-11): False-positive guard — persistent_dir BinOp pattern
# ---------------------------------------------------------------------------


def test_static_check_passes_on_persistent_dir_postmortem_path() -> None:
    """A fixture where pm is constructed via postmortems_dir / f"{td.name}.json"
    (the canonical SEC-001-compliant pattern) must produce zero violations.

    pm is assigned via a BinOp whose left is Name('postmortems_dir'), not Name('td').
    Step 6 checks left.id == task_dir_var ('td'); postmortems_dir != td, so the
    BinOp does not match and zero violations are returned.
    """
    source = (
        'def good_fixture(td):\n'
        '    from lib_core import _persistent_project_dir\n'
        '    postmortems_dir = _persistent_project_dir(td.parent.parent) / "postmortems"\n'
        '    postmortems_dir.mkdir(parents=True, exist_ok=True)\n'
        '    pm = postmortems_dir / f"{td.name}.json"\n'
        '    receipt_postmortem_generated(td, pm)\n'
    )

    violations = _collect_fixture_violations(source, "tests/fake_test.py")

    assert violations == [], (
        f"Expected zero violations for the canonical persistent_dir pattern, "
        f"but got: {violations}"
    )
