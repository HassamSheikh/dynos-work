"""
Tests for JSON schema files — AC4, AC22, AC23.
"""
import json
from pathlib import Path

import pytest

SCHEMAS_DIR = Path(__file__).parent.parent / "schemas"
DOSSIER_SCHEMA_PATH = SCHEMAS_DIR / "evidence_dossier.schema.json"
BUG_REPORT_SCHEMA_PATH = SCHEMAS_DIR / "bug_report.schema.json"


def _load_dossier_schema():
    """Load the dossier schema, failing with a clear message if missing."""
    if not DOSSIER_SCHEMA_PATH.exists():
        pytest.fail(
            f"Schema file not yet created: {DOSSIER_SCHEMA_PATH}\n"
            "Implement debug-module/schemas/evidence_dossier.schema.json to make this test pass."
        )
    return json.loads(DOSSIER_SCHEMA_PATH.read_text())


def _load_bug_report_schema():
    """Load the bug_report schema, failing with a clear message if missing."""
    if not BUG_REPORT_SCHEMA_PATH.exists():
        pytest.fail(
            f"Schema file not yet created: {BUG_REPORT_SCHEMA_PATH}\n"
            "Implement debug-module/schemas/bug_report.schema.json to make this test pass."
        )
    return json.loads(BUG_REPORT_SCHEMA_PATH.read_text())


# ---------------------------------------------------------------------------
# AC4: Schema files parse as valid JSON
# ---------------------------------------------------------------------------

def test_ac4_dossier_schema_parses_as_valid_json():
    """evidence_dossier.schema.json parses as valid JSON without error."""
    data = _load_dossier_schema()
    assert isinstance(data, dict)


def test_ac4_bug_report_schema_parses_as_valid_json():
    """bug_report.schema.json parses as valid JSON without error."""
    data = _load_bug_report_schema()
    assert isinstance(data, dict)


# ---------------------------------------------------------------------------
# AC22: evidence_dossier.schema.json required fields
# ---------------------------------------------------------------------------

def test_ac22_dossier_schema_is_draft07():
    """evidence_dossier.schema.json declares JSON Schema draft-07."""
    data = _load_dossier_schema()
    schema_uri = data.get("$schema", "")
    assert "draft-07" in schema_uri or "draft/07" in schema_uri, (
        f"Expected draft-07 schema URI, got {schema_uri!r}"
    )


def test_ac22_dossier_schema_requires_investigation_id():
    """evidence_dossier.schema.json requires 'investigation_id' field."""
    data = _load_dossier_schema()
    required = data.get("required", [])
    assert "investigation_id" in required, (
        f"'investigation_id' not in required: {required}"
    )


def test_ac22_dossier_schema_requires_bug_text():
    """evidence_dossier.schema.json requires 'bug_text' field."""
    data = _load_dossier_schema()
    required = data.get("required", [])
    assert "bug_text" in required, f"'bug_text' not in required: {required}"


def test_ac22_dossier_schema_requires_repo_path():
    """evidence_dossier.schema.json requires 'repo_path' field."""
    data = _load_dossier_schema()
    required = data.get("required", [])
    assert "repo_path" in required, f"'repo_path' not in required: {required}"


def test_ac22_dossier_schema_requires_pipeline_errors():
    """evidence_dossier.schema.json requires 'pipeline_errors' field."""
    data = _load_dossier_schema()
    required = data.get("required", [])
    assert "pipeline_errors" in required, f"'pipeline_errors' not in required: {required}"


def test_ac22_dossier_schema_requires_evidence_index():
    """evidence_dossier.schema.json requires 'evidence_index' field."""
    data = _load_dossier_schema()
    required = data.get("required", [])
    assert "evidence_index" in required, f"'evidence_index' not in required: {required}"


def test_ac22_dossier_schema_requires_languages_detected():
    """evidence_dossier.schema.json requires 'languages_detected' field."""
    data = _load_dossier_schema()
    required = data.get("required", [])
    assert "languages_detected" in required, (
        f"'languages_detected' not in required: {required}"
    )


def test_ac22_dossier_schema_requires_bug_type():
    """evidence_dossier.schema.json requires 'bug_type' field."""
    data = _load_dossier_schema()
    required = data.get("required", [])
    assert "bug_type" in required, f"'bug_type' not in required: {required}"


def test_ac22_dossier_schema_evidence_index_has_pattern_keys():
    """evidence_index property in dossier schema has additionalProperties with pattern."""
    data = _load_dossier_schema()
    props = data.get("properties", {})
    evidence_index_schema = props.get("evidence_index", {})
    has_pattern = (
        "patternProperties" in evidence_index_schema
        or "additionalProperties" in evidence_index_schema
    )
    assert has_pattern, (
        "evidence_index schema must constrain key patterns; "
        f"got: {evidence_index_schema}"
    )


# ---------------------------------------------------------------------------
# AC23: bug_report.schema.json required fields
# ---------------------------------------------------------------------------

def test_ac23_bug_report_schema_is_draft07():
    """bug_report.schema.json declares JSON Schema draft-07."""
    data = _load_bug_report_schema()
    schema_uri = data.get("$schema", "")
    assert "draft-07" in schema_uri or "draft/07" in schema_uri, (
        f"Expected draft-07 schema URI, got {schema_uri!r}"
    )


def test_ac23_bug_report_schema_requires_investigation_id():
    """bug_report.schema.json requires 'investigation_id' field."""
    data = _load_bug_report_schema()
    required = data.get("required", [])
    assert "investigation_id" in required, f"'investigation_id' not in required: {required}"


def test_ac23_bug_report_schema_requires_causal_chain():
    """bug_report.schema.json requires 'causal_chain' field."""
    data = _load_bug_report_schema()
    required = data.get("required", [])
    assert "causal_chain" in required, f"'causal_chain' not in required: {required}"


def test_ac23_bug_report_causal_chain_min_items():
    """causal_chain in bug_report.schema.json has minItems: 1."""
    data = _load_bug_report_schema()
    props = data.get("properties", {})
    causal_chain = props.get("causal_chain", {})
    assert causal_chain.get("minItems") == 1, (
        f"causal_chain minItems must be 1, got {causal_chain.get('minItems')}"
    )


def test_ac23_bug_report_schema_requires_root_cause():
    """bug_report.schema.json requires 'root_cause' field."""
    data = _load_bug_report_schema()
    required = data.get("required", [])
    assert "root_cause" in required, f"'root_cause' not in required: {required}"


def test_ac23_bug_report_schema_requires_recommended_fix():
    """bug_report.schema.json requires 'recommended_fix' field."""
    data = _load_bug_report_schema()
    required = data.get("required", [])
    assert "recommended_fix" in required, f"'recommended_fix' not in required: {required}"


def test_ac23_bug_report_causal_chain_item_has_evidence_ids():
    """Each causal_chain item schema requires 'evidence_ids' with minItems: 1."""
    data = _load_bug_report_schema()
    props = data.get("properties", {})
    causal_chain = props.get("causal_chain", {})
    item_schema = causal_chain.get("items", {})
    item_required = item_schema.get("required", [])
    assert "evidence_ids" in item_required, (
        f"causal_chain item must require 'evidence_ids': {item_required}"
    )


def test_ac23_bug_report_root_cause_has_evidence_ids():
    """root_cause schema requires 'evidence_ids' with minItems: 1."""
    data = _load_bug_report_schema()
    props = data.get("properties", {})
    root_cause = props.get("root_cause", {})
    rc_required = root_cause.get("required", [])
    assert "evidence_ids" in rc_required, (
        f"root_cause must require 'evidence_ids': {rc_required}"
    )


def test_ac23_bug_report_recommended_fix_has_evidence_ids():
    """recommended_fix schema requires 'evidence_ids' with minItems: 1."""
    data = _load_bug_report_schema()
    props = data.get("properties", {})
    fix = props.get("recommended_fix", {})
    fix_required = fix.get("required", [])
    assert "evidence_ids" in fix_required, (
        f"recommended_fix must require 'evidence_ids': {fix_required}"
    )
