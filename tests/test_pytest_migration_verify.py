"""
Meta-tests that verify the pytest migration succeeded.

Each test maps to one of the 14 acceptance criteria from the spec.
These tests check structural properties of the migrated files,
not the behavior of the code under test.
"""

import re
import subprocess
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
TESTS_DIR = REPO_ROOT / "tests"


# ---------------------------------------------------------------------------
# AC-1: pytest.ini exists at repo root with [pytest] header and testpaths
# ---------------------------------------------------------------------------

class TestPytestIni:
    def test_pytest_ini_exists(self):
        ini = REPO_ROOT / "pytest.ini"
        assert ini.is_file(), "pytest.ini must exist at the repository root"

    def test_pytest_ini_has_pytest_header(self):
        ini = REPO_ROOT / "pytest.ini"
        content = ini.read_text()
        assert "[pytest]" in content, "pytest.ini must contain a [pytest] header"

    def test_pytest_ini_has_testpaths(self):
        ini = REPO_ROOT / "pytest.ini"
        content = ini.read_text()
        assert "testpaths" in content, "pytest.ini must configure testpaths"
        assert "tests" in content, "testpaths must include 'tests'"


# ---------------------------------------------------------------------------
# AC-2: test_ctl.py exists (renamed), no unittest
# ---------------------------------------------------------------------------

class TestCtlMigration:
    def test_test_ctl_exists(self):
        assert (TESTS_DIR / "test_ctl.py").is_file(), (
            "tests/test_ctl.py must exist (renamed from test_dynosctl.py)"
        )

    def test_old_dynosctl_removed(self):
        assert not (TESTS_DIR / "test_dynosctl.py").exists(), (
            "tests/test_dynosctl.py must be removed after rename"
        )

    def test_test_ctl_no_import_unittest(self):
        content = (TESTS_DIR / "test_ctl.py").read_text()
        for line in content.splitlines():
            stripped = line.strip()
            if stripped.startswith("#"):
                continue
            if "import unittest" in stripped:
                assert stripped.startswith("from unittest.mock"), (
                    f"test_ctl.py has disallowed unittest import: {stripped}"
                )

    def test_test_ctl_no_testcase_subclass(self):
        content = (TESTS_DIR / "test_ctl.py").read_text()
        assert "unittest.TestCase" not in content, (
            "test_ctl.py must not subclass unittest.TestCase"
        )


# ---------------------------------------------------------------------------
# AC-3: test_dream_runtime.py migrated, no unittest
# ---------------------------------------------------------------------------

class TestDreamRuntimeMigration:
    def test_test_dream_runtime_exists(self):
        assert (TESTS_DIR / "test_dream_runtime.py").is_file()

    def test_no_import_unittest(self):
        content = (TESTS_DIR / "test_dream_runtime.py").read_text()
        for line in content.splitlines():
            stripped = line.strip()
            if stripped.startswith("#"):
                continue
            if "import unittest" in stripped:
                assert stripped.startswith("from unittest.mock"), (
                    f"test_dream_runtime.py has disallowed unittest import: {stripped}"
                )

    def test_no_testcase_subclass(self):
        content = (TESTS_DIR / "test_dream_runtime.py").read_text()
        assert "unittest.TestCase" not in content


# ---------------------------------------------------------------------------
# AC-4: test_planner.py exists (renamed), no unittest
# ---------------------------------------------------------------------------

class TestPlannerMigration:
    def test_test_planner_exists(self):
        assert (TESTS_DIR / "test_planner.py").is_file(), (
            "tests/test_planner.py must exist (renamed from test_dynoplanner.py)"
        )

    def test_old_dynoplanner_removed(self):
        assert not (TESTS_DIR / "test_dynoplanner.py").exists(), (
            "tests/test_dynoplanner.py must be removed after rename"
        )

    def test_no_import_unittest(self):
        content = (TESTS_DIR / "test_planner.py").read_text()
        for line in content.splitlines():
            stripped = line.strip()
            if stripped.startswith("#"):
                continue
            if "import unittest" in stripped:
                assert stripped.startswith("from unittest.mock"), (
                    f"test_planner.py has disallowed unittest import: {stripped}"
                )


# ---------------------------------------------------------------------------
# AC-5: test_agent_generator.py no unittest (but unittest.mock allowed)
# ---------------------------------------------------------------------------

class TestAgentGeneratorMigration:
    def test_file_exists(self):
        assert (TESTS_DIR / "test_agent_generator.py").is_file()

    def test_no_bare_import_unittest(self):
        content = (TESTS_DIR / "test_agent_generator.py").read_text()
        for line in content.splitlines():
            stripped = line.strip()
            if stripped.startswith("#"):
                continue
            if "import unittest" in stripped:
                assert stripped.startswith("from unittest.mock"), (
                    f"test_agent_generator.py has disallowed unittest import: {stripped}"
                )

    def test_no_testcase_subclass(self):
        content = (TESTS_DIR / "test_agent_generator.py").read_text()
        assert "unittest.TestCase" not in content

    def test_unittest_mock_retained(self):
        """from unittest.mock import ... is allowed and expected."""
        content = (TESTS_DIR / "test_agent_generator.py").read_text()
        assert "from unittest.mock import" in content, (
            "test_agent_generator.py should retain 'from unittest.mock import'"
        )


# ---------------------------------------------------------------------------
# AC-6: test_reward_scoring.py no unittest, uses pytest.approx
# ---------------------------------------------------------------------------

class TestRewardScoringMigration:
    def test_file_exists(self):
        assert (TESTS_DIR / "test_reward_scoring.py").is_file()

    def test_no_import_unittest(self):
        content = (TESTS_DIR / "test_reward_scoring.py").read_text()
        for line in content.splitlines():
            stripped = line.strip()
            if stripped.startswith("#"):
                continue
            if "import unittest" in stripped:
                assert stripped.startswith("from unittest.mock"), (
                    f"test_reward_scoring.py has disallowed unittest import: {stripped}"
                )

    def test_no_testcase_subclass(self):
        content = (TESTS_DIR / "test_reward_scoring.py").read_text()
        assert "unittest.TestCase" not in content

    def test_uses_pytest_approx(self):
        content = (TESTS_DIR / "test_reward_scoring.py").read_text()
        assert "pytest.approx" in content, (
            "test_reward_scoring.py must use pytest.approx for float comparisons"
        )


# ---------------------------------------------------------------------------
# AC-7: test_policy_json.py no unittest
# ---------------------------------------------------------------------------

class TestPolicyJsonMigration:
    def test_file_exists(self):
        assert (TESTS_DIR / "test_policy_json.py").is_file()

    def test_no_import_unittest(self):
        content = (TESTS_DIR / "test_policy_json.py").read_text()
        for line in content.splitlines():
            stripped = line.strip()
            if stripped.startswith("#"):
                continue
            if "import unittest" in stripped:
                assert stripped.startswith("from unittest.mock"), (
                    f"test_policy_json.py has disallowed unittest import: {stripped}"
                )

    def test_no_testcase_subclass(self):
        content = (TESTS_DIR / "test_policy_json.py").read_text()
        assert "unittest.TestCase" not in content


# ---------------------------------------------------------------------------
# AC-8: test_learning_runtime.py no unittest, no self. references
# ---------------------------------------------------------------------------

class TestLearningRuntimeMigration:
    def test_file_exists(self):
        assert (TESTS_DIR / "test_learning_runtime.py").is_file()

    def test_no_import_unittest(self):
        content = (TESTS_DIR / "test_learning_runtime.py").read_text()
        for line in content.splitlines():
            stripped = line.strip()
            if stripped.startswith("#"):
                continue
            if "import unittest" in stripped:
                assert stripped.startswith("from unittest.mock"), (
                    f"test_learning_runtime.py has disallowed unittest import: {stripped}"
                )

    def test_no_testcase_subclass(self):
        content = (TESTS_DIR / "test_learning_runtime.py").read_text()
        assert "unittest.TestCase" not in content

    def test_no_self_assert_references(self):
        """No self.assert* or self.fail calls should remain after migration."""
        content = (TESTS_DIR / "test_learning_runtime.py").read_text()
        for i, line in enumerate(content.splitlines(), 1):
            stripped = line.strip()
            # Skip comments and string literals (lines that are just strings)
            if stripped.startswith("#"):
                continue
            assert "self.assert" not in line, (
                f"test_learning_runtime.py line {i} still has self.assert: {stripped}"
            )
            assert "self.fail" not in line, (
                f"test_learning_runtime.py line {i} still has self.fail: {stripped}"
            )


# ---------------------------------------------------------------------------
# AC-9: test_global.py exists (renamed from test_dynoglobal.py)
# ---------------------------------------------------------------------------

class TestGlobalRename:
    def test_test_global_exists(self):
        assert (TESTS_DIR / "test_global.py").is_file(), (
            "tests/test_global.py must exist (renamed from test_dynoglobal.py)"
        )

    def test_old_dynoglobal_removed(self):
        assert not (TESTS_DIR / "test_dynoglobal.py").exists(), (
            "tests/test_dynoglobal.py must be removed after rename"
        )


# ---------------------------------------------------------------------------
# AC-10: test_lib_templates.py exists (renamed from test_dynoslib_templates.py)
# ---------------------------------------------------------------------------

class TestLibTemplatesRename:
    def test_test_lib_templates_exists(self):
        assert (TESTS_DIR / "test_lib_templates.py").is_file(), (
            "tests/test_lib_templates.py must exist (renamed from test_dynoslib_templates.py)"
        )

    def test_old_dynoslib_templates_removed(self):
        assert not (TESTS_DIR / "test_dynoslib_templates.py").exists(), (
            "tests/test_dynoslib_templates.py must be removed after rename"
        )


# ---------------------------------------------------------------------------
# AC-11: conftest.py exists and defines dynos_home fixture
# ---------------------------------------------------------------------------

class TestConftest:
    def test_conftest_exists(self):
        assert (TESTS_DIR / "conftest.py").is_file(), (
            "tests/conftest.py must exist"
        )

    def test_conftest_defines_dynos_home_fixture(self):
        content = (TESTS_DIR / "conftest.py").read_text()
        assert "def dynos_home" in content, (
            "conftest.py must define a dynos_home fixture"
        )

    def test_conftest_dynos_home_is_fixture(self):
        content = (TESTS_DIR / "conftest.py").read_text()
        # The dynos_home function should be decorated with @pytest.fixture
        assert re.search(
            r"@pytest\.fixture.*\ndef dynos_home", content, re.DOTALL
        ), "dynos_home must be decorated with @pytest.fixture"


# ---------------------------------------------------------------------------
# AC-12: python3 -m pytest tests/ passes with returncode 0
# ---------------------------------------------------------------------------

class TestFullSuiteRuns:
    def test_pytest_suite_passes(self):
        result = subprocess.run(
            ["python3", "-m", "pytest", "tests/", "-x", "--tb=short", "-q",
             "--ignore=tests/test_pytest_migration_verify.py"],
            cwd=str(REPO_ROOT),
            capture_output=True,
            text=True,
            timeout=120,
        )
        assert result.returncode == 0, (
            f"pytest run failed (rc={result.returncode}).\n"
            f"STDOUT:\n{result.stdout[-2000:]}\n"
            f"STDERR:\n{result.stderr[-2000:]}"
        )


# ---------------------------------------------------------------------------
# AC-13: grep for "import unittest" returns only "from unittest.mock" matches
# ---------------------------------------------------------------------------

class TestNoRawUnittestImports:
    def test_only_unittest_mock_imports(self):
        violations = []
        for test_file in sorted(TESTS_DIR.glob("test_*.py")):
            if test_file.name == "test_pytest_migration_verify.py":
                continue
            content = test_file.read_text()
            for i, line in enumerate(content.splitlines(), 1):
                stripped = line.strip()
                if stripped.startswith("#"):
                    continue
                if "import unittest" in stripped:
                    if not stripped.startswith("from unittest.mock"):
                        violations.append(
                            f"{test_file.name}:{i}: {stripped}"
                        )
        assert not violations, (
            "Found disallowed 'import unittest' (only 'from unittest.mock' allowed):\n"
            + "\n".join(violations)
        )


# ---------------------------------------------------------------------------
# AC-14: No test file under tests/ has "dyno" in the filename
# ---------------------------------------------------------------------------

class TestNoDynoInFilenames:
    def test_no_dyno_in_test_filenames(self):
        bad_files = []
        for test_file in sorted(TESTS_DIR.glob("test_*.py")):
            if "dyno" in test_file.name.lower():
                bad_files.append(test_file.name)
        assert not bad_files, (
            f"Test files with 'dyno' in filename must be renamed: {bad_files}"
        )
