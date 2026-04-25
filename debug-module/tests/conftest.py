"""
Shared fixtures for debug-module tests.
"""
import json
import os
import subprocess
import sys
from pathlib import Path
from unittest.mock import patch

import pytest

REPO_ROOT = Path(__file__).parent.parent.parent


# ---------------------------------------------------------------------------
# Synthetic coverage file helpers
# ---------------------------------------------------------------------------

@pytest.fixture
def istanbul_coverage_dir(tmp_path):
    """Create a minimal Istanbul coverage-final.json in a coverage/ subdir."""
    cov_dir = tmp_path / "coverage"
    cov_dir.mkdir()
    coverage_data = {
        "src/app.ts": {
            "path": "src/app.ts",
            "statementMap": {
                "0": {"start": {"line": 1, "column": 0}, "end": {"line": 1, "column": 10}},
                "1": {"start": {"line": 5, "column": 0}, "end": {"line": 5, "column": 10}},
            },
            "fnMap": {},
            "branchMap": {},
            "s": {"0": 1, "1": 0},
            "f": {},
            "b": {},
        }
    }
    (cov_dir / "coverage-final.json").write_text(json.dumps(coverage_data))
    return tmp_path


@pytest.fixture
def empty_coverage_dir(tmp_path):
    """A directory with no coverage files at all."""
    return tmp_path


# ---------------------------------------------------------------------------
# Synthetic log file helpers
# ---------------------------------------------------------------------------

@pytest.fixture
def log_dir_with_errors(tmp_path):
    """Create an error.log with exactly 3 ERROR lines and 2 INFO lines."""
    log_content = (
        "2024-01-01T10:00:00Z INFO  Application started\n"
        "2024-01-01T10:01:00Z ERROR Database connection failed\n"
        "2024-01-01T10:02:00Z ERROR Retry attempt 1 failed\n"
        "2024-01-01T10:03:00Z INFO  Retrying connection\n"
        "2024-01-01T10:04:00Z ERROR Maximum retries exceeded\n"
    )
    (tmp_path / "error.log").write_text(log_content)
    return tmp_path


@pytest.fixture
def empty_log_dir(tmp_path):
    """A directory with no log files."""
    return tmp_path


# ---------------------------------------------------------------------------
# Mock PATH manipulation
# ---------------------------------------------------------------------------

@pytest.fixture
def empty_path(tmp_path, monkeypatch):
    """Patch PATH to an empty temp dir so no external tools are found."""
    bin_dir = tmp_path / "empty_bin"
    bin_dir.mkdir()
    monkeypatch.setenv("PATH", str(bin_dir))
    return bin_dir


# ---------------------------------------------------------------------------
# Mock semgrep subprocess
# ---------------------------------------------------------------------------

SEMGREP_VALID_OUTPUT = {
    "results": [
        {
            "check_id": "silent-accomplices.swallowed-error",
            "path": "src/app.ts",
            "start": {"line": 10},
            "extra": {
                "message": "Swallowed error in empty catch block",
                "severity": "WARNING",
            },
        }
    ],
    "errors": [],
}


@pytest.fixture
def mock_semgrep_success():
    """Return a context manager that mocks subprocess.run to return valid semgrep JSON."""
    import subprocess

    class FakeCompletedProcess:
        returncode = 0
        stdout = json.dumps(SEMGREP_VALID_OUTPUT)
        stderr = ""

    with patch("subprocess.run", return_value=FakeCompletedProcess()) as m:
        yield m


# ---------------------------------------------------------------------------
# Alembic ini fixture
# ---------------------------------------------------------------------------

@pytest.fixture
def alembic_repo(tmp_path):
    """Create a directory that looks like an Alembic project."""
    (tmp_path / "alembic.ini").write_text("[alembic]\nscript_location = alembic\n")
    return tmp_path


@pytest.fixture
def no_migration_repo(tmp_path):
    """A directory with none of the sentinel migration files."""
    return tmp_path


# ---------------------------------------------------------------------------
# Repo root convenience
# ---------------------------------------------------------------------------

@pytest.fixture
def dynos_repo_root():
    """Return the dynos-work repo root as a string."""
    return str(REPO_ROOT)
