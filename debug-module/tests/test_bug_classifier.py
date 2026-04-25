"""
Tests for debug-module/lib/bug_classifier.py — AC9.

Every test maps to exactly one behaviour specified in AC9.
"""
import sys
from pathlib import Path

import pytest

# Ensure debug-module/ is on sys.path so 'from lib import ...' works
_DEBUG_MODULE_DIR = str(Path(__file__).parent.parent)
if _DEBUG_MODULE_DIR not in sys.path:
    sys.path.insert(0, _DEBUG_MODULE_DIR)


def _import_classifier():
    """Import bug_classifier, failing the test clearly if not yet implemented."""
    try:
        from lib import bug_classifier
        return bug_classifier
    except ModuleNotFoundError as exc:
        pytest.fail(
            f"bug_classifier module not yet implemented: {exc}\n"
            f"Implement debug-module/lib/bug_classifier.py to make this test pass."
        )


# ---------------------------------------------------------------------------
# bug_type classification
# ---------------------------------------------------------------------------

def test_ac9_runtime_error_classification():
    """classify() returns bug_type == 'runtime-error' for a TypeError message."""
    m = _import_classifier()
    result = m.classify("TypeError: Cannot read properties of undefined")
    assert result["bug_type"] == "runtime-error"


def test_ac9_test_failure_classification():
    """classify() returns bug_type == 'test-failure' for a test suite description."""
    m = _import_classifier()
    result = m.classify("test suite: AuthController > login")
    assert result["bug_type"] == "test-failure"


def test_ac9_logic_bug_classification():
    """classify() returns bug_type == 'logic-bug' for a plain wrong-output description."""
    m = _import_classifier()
    result = m.classify("workout volume calc is wrong")
    assert result["bug_type"] == "logic-bug"


def test_ac9_race_condition_or_logic_bug_for_intermittent():
    """classify() returns 'race-condition' or 'logic-bug' for intermittent-behaviour text."""
    m = _import_classifier()
    result = m.classify("sometimes shows 0")
    assert result["bug_type"] in ("race-condition", "logic-bug"), (
        f"Expected 'race-condition' or 'logic-bug', got {result['bug_type']!r}"
    )


# ---------------------------------------------------------------------------
# Edge cases — empty input
# ---------------------------------------------------------------------------

def test_ac9_empty_string_returns_dict_with_bug_type():
    """classify('') must return a dict containing 'bug_type' without raising."""
    m = _import_classifier()
    result = m.classify("")
    assert isinstance(result, dict), "classify() must return a dict"
    assert "bug_type" in result, "dict must contain 'bug_type' key"


# ---------------------------------------------------------------------------
# mentioned_files extraction
# ---------------------------------------------------------------------------

def test_ac9_mentioned_files_extracts_path_with_line():
    """classify() extracts file paths with line numbers into mentioned_files."""
    m = _import_classifier()
    result = m.classify("src/foo.py:42")
    mentioned = result["mentioned_files"]
    assert any(
        entry.get("path") == "src/foo.py" and entry.get("line") == 42
        for entry in mentioned
    ), f"Expected {{'path': 'src/foo.py', 'line': 42}} in mentioned_files, got: {mentioned}"


def test_ac9_mentioned_files_is_always_list():
    """mentioned_files is always a list, even when no files are present."""
    m = _import_classifier()
    result = m.classify("totally unrelated prose with no paths")
    assert isinstance(result["mentioned_files"], list)


# ---------------------------------------------------------------------------
# mentioned_symbols extraction
# ---------------------------------------------------------------------------

def test_ac9_mentioned_symbols_extracts_backtick_symbol():
    """classify() extracts backtick-wrapped function names into mentioned_symbols."""
    m = _import_classifier()
    result = m.classify("`calculate()` returns wrong value")
    assert isinstance(result["mentioned_symbols"], list)
    assert len(result["mentioned_symbols"]) > 0, (
        "mentioned_symbols must be non-empty when a backtick symbol is present"
    )


def test_ac9_mentioned_symbols_is_always_list():
    """mentioned_symbols is always a list, even when no symbols are present."""
    m = _import_classifier()
    result = m.classify("no symbols here at all")
    assert isinstance(result["mentioned_symbols"], list)


# ---------------------------------------------------------------------------
# Return structure completeness
# ---------------------------------------------------------------------------

def test_ac9_classify_always_returns_required_keys():
    """classify() always returns a dict with all three required keys."""
    m = _import_classifier()
    result = m.classify("some random text")
    for key in ("bug_type", "mentioned_files", "mentioned_symbols"):
        assert key in result, f"Missing required key: {key!r}"


def test_ac9_bug_type_is_always_from_allowed_set():
    """bug_type is always one of the 9 allowed enum values."""
    m = _import_classifier()
    allowed = {
        "runtime-error", "logic-bug", "test-failure", "race-condition",
        "state-corruption", "performance", "data-corruption", "schema-drift", "unknown",
    }
    inputs = [
        "TypeError in user service",
        "test failed: should return 401",
        "calculation is sometimes wrong",
        "database is corrupted",
        "app is slow",
        "data got overwritten",
        "migration pending",
        "",
        "gibberish fjdkslafjd",
    ]
    for text in inputs:
        result = m.classify(text)
        assert result["bug_type"] in allowed, (
            f"classify({text!r}) returned invalid bug_type {result['bug_type']!r}"
        )
