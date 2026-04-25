"""
Tests for debug-module/rules/silent-accomplices.yml — AC5, AC21.
"""
from pathlib import Path

import pytest

RULES_FILE = Path(__file__).parent.parent / "rules" / "silent-accomplices.yml"

try:
    import yaml
    HAS_YAML = True
except ImportError:
    HAS_YAML = False


# ---------------------------------------------------------------------------
# AC5: Ruleset file existence
# ---------------------------------------------------------------------------

def test_ac5_silent_accomplices_yml_exists():
    """debug-module/rules/silent-accomplices.yml exists as a file."""
    assert RULES_FILE.exists(), (
        f"Ruleset file missing: {RULES_FILE}"
    )
    assert RULES_FILE.is_file(), (
        f"Expected a file at {RULES_FILE}, not a directory"
    )


def test_ac5_ruleset_file_is_non_empty():
    """The ruleset file is non-empty."""
    if not RULES_FILE.exists():
        pytest.fail(
            f"Ruleset file not yet created: {RULES_FILE}\n"
            f"Implement debug-module/rules/silent-accomplices.yml to make this test pass."
        )
    assert RULES_FILE.stat().st_size > 0, (
        f"Ruleset file is empty: {RULES_FILE}"
    )


# ---------------------------------------------------------------------------
# AC21: YAML is parseable
# ---------------------------------------------------------------------------

@pytest.mark.skipif(not HAS_YAML, reason="PyYAML not installed")
def test_ac21_ruleset_is_parseable_yaml():
    """silent-accomplices.yml parses as valid YAML without error."""
    content = RULES_FILE.read_text()
    data = yaml.safe_load(content)
    assert data is not None, "YAML parsed to None — file may be empty"
    assert isinstance(data, dict), f"Expected dict at top level, got {type(data)}"


@pytest.mark.skipif(not HAS_YAML, reason="PyYAML not installed")
def test_ac21_ruleset_has_rules_key():
    """YAML top level contains a 'rules' key."""
    data = yaml.safe_load(RULES_FILE.read_text())
    assert "rules" in data, f"'rules' key missing from YAML: {list(data.keys())}"


@pytest.mark.skipif(not HAS_YAML, reason="PyYAML not installed")
def test_ac21_rules_is_non_empty_list():
    """'rules' is a non-empty list of rule objects."""
    data = yaml.safe_load(RULES_FILE.read_text())
    rules = data.get("rules", [])
    assert isinstance(rules, list) and len(rules) > 0, (
        f"Expected non-empty rules list, got {rules!r}"
    )


@pytest.mark.skipif(not HAS_YAML, reason="PyYAML not installed")
def test_ac21_each_rule_has_id():
    """Every rule has an 'id' field."""
    data = yaml.safe_load(RULES_FILE.read_text())
    for rule in data.get("rules", []):
        assert "id" in rule, f"Rule missing 'id': {rule}"


@pytest.mark.skipif(not HAS_YAML, reason="PyYAML not installed")
def test_ac21_each_rule_has_message():
    """Every rule has a 'message' field."""
    data = yaml.safe_load(RULES_FILE.read_text())
    for rule in data.get("rules", []):
        assert "message" in rule, f"Rule missing 'message': {rule}"


@pytest.mark.skipif(not HAS_YAML, reason="PyYAML not installed")
def test_ac21_each_rule_has_pattern_or_pattern_either():
    """Every rule has at least one 'pattern' or 'pattern-either' field."""
    data = yaml.safe_load(RULES_FILE.read_text())
    for rule in data.get("rules", []):
        has_pattern = (
            "pattern" in rule
            or "pattern-either" in rule
            or "patterns" in rule
            or "pattern-regex" in rule
        )
        assert has_pattern, (
            f"Rule {rule.get('id', '<unknown>')} missing pattern/pattern-either: {rule}"
        )


# ---------------------------------------------------------------------------
# AC21: 7 category keywords must appear in the file text
# ---------------------------------------------------------------------------

def _read_rules_content():
    """Read the rules file, failing the test clearly if it does not exist yet."""
    if not RULES_FILE.exists():
        pytest.fail(
            f"Ruleset file not yet created: {RULES_FILE}\n"
            f"Implement debug-module/rules/silent-accomplices.yml to make this test pass."
        )
    return RULES_FILE.read_text()


def test_ac21_contains_swallowed_or_catch_keyword():
    """Ruleset file contains 'swallowed' or 'catch' keyword (group 1)."""
    content = _read_rules_content()
    assert "swallowed" in content.lower() or "catch" in content.lower(), (
        "Ruleset must cover swallowed-error / catch pattern group"
    )


def test_ac21_contains_masking_or_default_keyword():
    """Ruleset file contains 'masking' or 'default' keyword (group 2)."""
    content = _read_rules_content()
    assert "masking" in content.lower() or "default" in content.lower(), (
        "Ruleset must cover masking / default-value pattern group"
    )


def test_ac21_contains_await_keyword():
    """Ruleset file contains 'await' keyword (group 3)."""
    content = _read_rules_content()
    assert "await" in content.lower(), (
        "Ruleset must cover missing-await pattern group"
    )


def test_ac21_contains_order_by_keyword():
    """Ruleset file contains 'ORDER BY' keyword (group 4)."""
    content = _read_rules_content()
    assert "order by" in content.lower() or "ORDER BY" in content, (
        "Ruleset must cover missing ORDER BY pattern group"
    )


def test_ac21_contains_cascade_keyword():
    """Ruleset file contains 'cascade' keyword (group 5)."""
    content = _read_rules_content()
    assert "cascade" in content.lower(), (
        "Ruleset must cover cascade-delete pattern group"
    )


def test_ac21_contains_sort_keyword():
    """Ruleset file contains 'sort' keyword (group 6)."""
    content = _read_rules_content()
    assert "sort" in content.lower(), (
        "Ruleset must cover sort-order assumption pattern group"
    )


def test_ac21_contains_mutable_keyword():
    """Ruleset file contains 'mutable' keyword (group 7)."""
    content = _read_rules_content()
    assert "mutable" in content.lower(), (
        "Ruleset must cover default mutable argument pattern group"
    )
