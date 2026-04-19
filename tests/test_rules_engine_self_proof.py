"""AC 23: rules-engine self-proof integration test.

Runs `run_checks(repo_root, "all")` against the actual dynos-work
checkout and asserts:
  - error_violations == 0  (the live tree complies with its own rules)
  - elapsed < 2.0 seconds  (engine stays inside the perf budget)

Marked `@pytest.mark.integration`. Auto-skipped unless either:
  - the env var RUN_INTEGRATION=1 is set, or
  - pytest is invoked with `-m integration`.
"""

from __future__ import annotations

import os
import sys
import time
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "hooks"))

from rules_engine import run_checks  # noqa: E402


def _integration_requested(config) -> bool:
    """Detect whether the user actually asked for integration tests.

    Two channels:
      1. RUN_INTEGRATION=1 environment variable.
      2. The pytest invocation includes `-m integration` (or any marker
         expression that selects the `integration` mark).
    """
    if os.environ.get("RUN_INTEGRATION") == "1":
        return True
    markexpr = ""
    try:
        markexpr = config.getoption("-m") or ""
    except Exception:
        markexpr = ""
    return "integration" in markexpr


@pytest.fixture(autouse=True)
def _skip_unless_integration_requested(request):
    if not _integration_requested(request.config):
        pytest.skip(
            "integration: set RUN_INTEGRATION=1 or pass `-m integration` to run"
        )


@pytest.mark.integration
def test_self_proof_repo_passes_rules_within_budget():
    repo_root = ROOT
    start = time.perf_counter()
    violations = run_checks(repo_root, "all")
    elapsed = time.perf_counter() - start

    error_violations = [v for v in violations if v.severity == "error"]
    assert error_violations == [], (
        f"self-proof: expected zero error-severity violations against the "
        f"live tree, got {len(error_violations)}: "
        f"{[(v.rule_id, v.file, v.line, v.message) for v in error_violations]}"
    )
    assert elapsed < 2.0, (
        f"self-proof: run_checks took {elapsed:.3f}s, exceeds 2.0s budget"
    )
