"""Static analysis tests enforcing the SEC-004 bounds-check pattern in hooks/receipts/*.py.

For every function that calls .open() on a report-path-like variable, the same
function body must also contain either a .relative_to(...) call or a call to
ensure_within_task_dir(...). This prevents path-traversal attacks where a
compromised orchestrator supplies a report path that escapes the expected
directory.

## Tracked variable names (AC-3)

Primary tracked names (direct parameter references):
    report_path, report_file, postmortem_json_path

Aliases are tracked at SINGLE LEVEL only. Examples that ARE caught:
    json_path = Path(postmortem_json_path)   # caught
    report_file = Path(report_path)          # caught
    report_file = report_path                # caught

Alias chains that are NOT caught (accepted limitation):
    a = report_path; b = a; b.open(...)      # b is not tracked

## Detection permissiveness (accepted limitation per design-decisions.md)

The .relative_to() detection checks for ANY .relative_to() call anywhere in the
function body, not specifically against task_dir. A function containing a
.relative_to() call on an unrelated object would satisfy the check (false
negative). This is accepted as sufficient given the narrow scope of
hooks/receipts/*.py.

## Negative-case verification (AC-9)

test_static_check_detects_synthetic_unguarded_open uses ast.parse() on a
synthetic Python source string with an unguarded open() on a tracked variable,
feeds it through the same checker logic, and asserts a violation is returned.
This is the chosen approach (option a from AC-9).
"""

import ast
from pathlib import Path

import pytest

# ---------------------------------------------------------------------------
# Shared checker implementation
# ---------------------------------------------------------------------------

# Names that are tracked as "report-path-like" when seen as function parameters.
_TRACKED_PARAM_NAMES = frozenset({"report_path", "report_file", "postmortem_json_path"})


def _collect_violations(source_text: str, rel_path: str) -> list[str]:
    """Parse *source_text* and return a list of violation strings.

    Each violation has the form:
        "hooks/receipts/approval.py:157 — open() on report-path variable
         'json_path' (alias of 'postmortem_json_path') has no adjacent
         .relative_to(task_dir) bounds-check"

    *rel_path* is used verbatim as the file prefix in the message.
    """
    try:
        tree = ast.parse(source_text)
    except SyntaxError:
        return []

    violations: list[str] = []

    for node in ast.walk(tree):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue

        # ------------------------------------------------------------------
        # Step 1: seed tracked names from parameters.
        # tracked maps variable_name -> source_name (the original param name)
        # ------------------------------------------------------------------
        tracked: dict[str, str] = {}
        for arg in node.args.args + node.args.posonlyargs + node.args.kwonlyargs:
            if arg.arg in _TRACKED_PARAM_NAMES:
                tracked[arg.arg] = arg.arg

        # ------------------------------------------------------------------
        # Step 2: walk assignments in the function body to pick up single-level
        # aliases: `<name> = <tracked>` or `<name> = Path(<tracked>)`.
        # ------------------------------------------------------------------
        for stmt in ast.walk(node):
            if not isinstance(stmt, ast.Assign):
                continue
            # RHS: bare name or Path(<name>)
            rhs_source: str | None = None
            rhs = stmt.value
            if isinstance(rhs, ast.Name) and rhs.id in tracked:
                rhs_source = tracked[rhs.id]
            elif (
                isinstance(rhs, ast.Call)
                and isinstance(rhs.func, ast.Name)
                and rhs.func.id == "Path"
                and len(rhs.args) == 1
                and isinstance(rhs.args[0], ast.Name)
                and rhs.args[0].id in tracked
            ):
                rhs_source = tracked[rhs.args[0].id]

            if rhs_source is None:
                continue

            for target in stmt.targets:
                if isinstance(target, ast.Name):
                    tracked[target.id] = rhs_source

        if not tracked:
            continue

        # ------------------------------------------------------------------
        # Step 3: determine whether the function body contains a compliant
        # bounds check: any .relative_to(...) call OR any call to
        # ensure_within_task_dir(...).
        # ------------------------------------------------------------------
        has_bounds_check = False
        for inner in ast.walk(node):
            if isinstance(inner, ast.Call):
                func = inner.func
                # .relative_to(...)
                if isinstance(func, ast.Attribute) and func.attr == "relative_to":
                    has_bounds_check = True
                    break
                # ensure_within_task_dir(...)
                if isinstance(func, ast.Name) and func.id == "ensure_within_task_dir":
                    has_bounds_check = True
                    break

        if has_bounds_check:
            continue

        # ------------------------------------------------------------------
        # Step 4: look for .open() calls on tracked names; each is a violation.
        # ------------------------------------------------------------------
        for inner in ast.walk(node):
            if not isinstance(inner, ast.Call):
                continue
            func = inner.func
            if (
                isinstance(func, ast.Attribute)
                and func.attr == "open"
                and isinstance(func.value, ast.Name)
                and func.value.id in tracked
            ):
                var_name = func.value.id
                source_name = tracked[var_name]
                lineno = inner.lineno
                if var_name == source_name:
                    alias_clause = f"'{var_name}'"
                else:
                    alias_clause = f"'{var_name}' (alias of '{source_name}')"
                msg = (
                    f"{rel_path}:{lineno} — open() on report-path variable "
                    f"{alias_clause} has no adjacent .relative_to(task_dir) bounds-check"
                )
                violations.append(msg)

    return violations


# ---------------------------------------------------------------------------
# Test 1 (AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-8):
# Real AST scan of hooks/receipts/*.py
# ---------------------------------------------------------------------------

def test_receipts_open_calls_have_adjacent_bounds_check() -> None:
    """Scan hooks/receipts/*.py and assert every .open() on a report-path-like
    variable in the same function scope that contains a .relative_to(...) or
    ensure_within_task_dir(...) call.

    Per AC-3, tracked names are: report_path, report_file, postmortem_json_path
    plus single-level aliases (x = Path(name) or x = name).

    On approval.py:157 BEFORE the seg-1 fix, this test FAILS — that is the
    expected TDD-First contract. After the fix is applied this test must pass.
    """
    receipts_dir = Path(__file__).parent.parent / "hooks" / "receipts"
    py_files = sorted(receipts_dir.glob("*.py"))

    assert py_files, f"No .py files found under {receipts_dir}"

    all_violations: list[str] = []

    repo_root = Path(__file__).parent.parent

    for py_file in py_files:
        source = py_file.read_text(encoding="utf-8")
        rel_path = str(py_file.relative_to(repo_root))
        violations = _collect_violations(source, rel_path)
        all_violations.extend(violations)

    if all_violations:
        bullet_list = "\n".join(f"  • {v}" for v in all_violations)
        pytest.fail(
            f"Found {len(all_violations)} unguarded report-path open() site(s):\n"
            f"{bullet_list}"
        )


# ---------------------------------------------------------------------------
# Test 2 (AC-9): Negative case — checker detects synthetic unguarded open()
# ---------------------------------------------------------------------------

def test_static_check_detects_synthetic_unguarded_open() -> None:
    """Feed a synthetic Python source with an unguarded open() on a tracked
    variable through the same checker function and assert at least one violation
    is returned.

    This does NOT modify any real production file. The violation is detected on
    the synthetic string only.
    """
    synthetic_source = """
def fake_writer(task_dir, postmortem_json_path):
    json_path = Path(postmortem_json_path)
    with json_path.open("r", encoding="utf-8") as f:
        data = f.read()
"""
    violations = _collect_violations(synthetic_source, "hooks/receipts/approval.py")
    assert violations, (
        "Expected at least one violation for the synthetic unguarded open() "
        "on 'json_path' (alias of 'postmortem_json_path'), but the checker "
        "returned no violations."
    )
    # The violation message must name the variable and its source.
    combined = "\n".join(violations)
    assert "json_path" in combined, (
        f"Expected 'json_path' in violation message, got: {combined!r}"
    )
    assert "postmortem_json_path" in combined, (
        f"Expected 'postmortem_json_path' in violation message, got: {combined!r}"
    )
    assert "open() on report-path variable" in combined, (
        f"Expected standard violation phrasing in message, got: {combined!r}"
    )


# ---------------------------------------------------------------------------
# Test 3 (AC-8): Compliant stage.py pattern produces no violations
# ---------------------------------------------------------------------------

def test_static_check_passes_on_compliant_site() -> None:
    """A function that calls .relative_to() before .open() on a tracked variable
    must produce zero violations — this verifies no false positives on the
    two stage.py compliant sites.
    """
    compliant_source = """
def receipt_audit_final_envelope(task_dir, report_path):
    report_file = Path(report_path)
    resolved_report = report_file.resolve()
    resolved_task = Path(task_dir).resolve()
    resolved_report.relative_to(resolved_task)
    with report_file.open("r", encoding="utf-8") as fh:
        data = fh.read()
"""
    violations = _collect_violations(compliant_source, "hooks/receipts/stage.py")
    assert not violations, (
        f"Expected zero violations for a compliant (guarded) open() site, "
        f"but got: {violations}"
    )


# ---------------------------------------------------------------------------
# Test 4: Direct parameter reference (no alias) is also tracked
# ---------------------------------------------------------------------------

def test_static_check_tracks_direct_param_open() -> None:
    """Verify that .open() directly on a tracked parameter name (not via alias)
    is caught when no bounds check is present.
    """
    synthetic_source = """
def bad_writer(task_dir, report_path):
    with report_path.open("r") as f:
        data = f.read()
"""
    violations = _collect_violations(synthetic_source, "hooks/receipts/fake.py")
    assert violations, (
        "Expected a violation for direct open() on 'report_path' parameter "
        "with no .relative_to() guard."
    )
    assert "report_path" in violations[0]


# ---------------------------------------------------------------------------
# Test 5: ensure_within_task_dir(...) satisfies the bounds-check requirement
# ---------------------------------------------------------------------------

def test_static_check_accepts_ensure_within_task_dir_helper() -> None:
    """A function that calls ensure_within_task_dir() instead of .relative_to()
    must also be classified as compliant (no violation).
    """
    synthetic_source = """
def safe_writer(task_dir, postmortem_json_path):
    json_path = Path(postmortem_json_path)
    ensure_within_task_dir(json_path, task_dir)
    with json_path.open("r", encoding="utf-8") as f:
        data = f.read()
"""
    violations = _collect_violations(synthetic_source, "hooks/receipts/approval.py")
    assert not violations, (
        f"Expected zero violations when ensure_within_task_dir() is present, "
        f"but got: {violations}"
    )


# ---------------------------------------------------------------------------
# Test 6: Non-tracked variable open() does NOT trigger a violation
# ---------------------------------------------------------------------------

def test_static_check_ignores_non_tracked_variables() -> None:
    """An .open() call on a variable that is NOT derived from a tracked param
    must not produce a violation (no false positives on arbitrary open() calls).
    """
    synthetic_source = """
def reader(task_dir, config_path):
    cfg = Path(config_path)
    with cfg.open("r") as f:
        data = f.read()
"""
    violations = _collect_violations(synthetic_source, "hooks/receipts/core.py")
    assert not violations, (
        f"Expected zero violations for open() on non-tracked variable 'cfg', "
        f"but got: {violations}"
    )
