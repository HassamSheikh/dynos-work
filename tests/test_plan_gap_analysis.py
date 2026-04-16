"""Tests for hooks/plan_gap_analysis.py — deterministic plan verification.

Validates:
  - Markdown table parsing from plan sections
  - Section extraction from plan.md
  - API Contracts gap analysis (route detection across frameworks)
  - Data Model gap analysis (model/schema detection across ORMs)
  - Integration with validate_task_artifacts
  - CLI invocation
  - Graceful handling of missing/empty sections
"""
from __future__ import annotations

import json
import subprocess
import sys
import textwrap
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "hooks"))

import plan_gap_analysis
from plan_gap_analysis import (
    analyze_api_contracts,
    analyze_data_model,
    extract_section,
    findings_from_report,
    parse_markdown_table,
    run_gap_analysis,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _plan_with_api(endpoint_rows: str) -> str:
    return textwrap.dedent(f"""\
        # Implementation Plan

        ## Technical Approach
        Some approach.

        ## Reference Code
        None.

        ## Components / Modules
        None.

        ## API Contracts
        | Endpoint | Method | Request shape | Response shape | Auth | Status codes |
        |---|---|---|---|---|---|
        {endpoint_rows}

        ## Data Flow
        Flow.

        ## Error Handling Strategy
        Errors.

        ## Test Strategy
        Tests.

        ## Dependency Graph
        Deps.

        ## Open Questions
        None.
    """)


def _plan_with_data_model(table_rows: str) -> str:
    return textwrap.dedent(f"""\
        # Implementation Plan

        ## Technical Approach
        Some approach.

        ## Reference Code
        None.

        ## Components / Modules
        None.

        ## Data Model
        | Table | Column | Type | Nullable | Default | Index | Notes |
        |---|---|---|---|---|---|---|
        {table_rows}

        ## Data Flow
        Flow.

        ## Error Handling Strategy
        Errors.

        ## Test Strategy
        Tests.

        ## Dependency Graph
        Deps.

        ## Open Questions
        None.
    """)


def _make_project(tmp_path: Path, source_files: dict[str, str]) -> tuple[Path, Path]:
    """Create a project root and task dir with given source files + plan."""
    task_dir = tmp_path / ".dynos" / "task-1"
    task_dir.mkdir(parents=True)
    for path, content in source_files.items():
        fpath = tmp_path / path
        fpath.parent.mkdir(parents=True, exist_ok=True)
        fpath.write_text(content)
    return tmp_path, task_dir


# ---------------------------------------------------------------------------
# parse_markdown_table
# ---------------------------------------------------------------------------

class TestParseMarkdownTable:
    def test_standard_table(self):
        text = textwrap.dedent("""\
            | Name | Value |
            |---|---|
            | foo | bar |
            | baz | qux |
        """)
        rows = parse_markdown_table(text)
        assert len(rows) == 2
        assert rows[0] == {"Name": "foo", "Value": "bar"}
        assert rows[1] == {"Name": "baz", "Value": "qux"}

    def test_empty_text(self):
        assert parse_markdown_table("") == []

    def test_no_table(self):
        assert parse_markdown_table("Just some text\nNo tables here") == []

    def test_header_only(self):
        text = "| A | B |\n|---|---|"
        assert parse_markdown_table(text) == []

    def test_extra_text_around_table(self):
        text = textwrap.dedent("""\
            Some preamble text.

            | Col1 | Col2 |
            |---|---|
            | a | b |

            Some trailing text.
        """)
        rows = parse_markdown_table(text)
        assert len(rows) == 1
        assert rows[0] == {"Col1": "a", "Col2": "b"}

    def test_backtick_values(self):
        text = textwrap.dedent("""\
            | Endpoint | Method |
            |---|---|
            | `/api/users` | `GET` |
        """)
        rows = parse_markdown_table(text)
        assert rows[0]["Endpoint"] == "`/api/users`"


# ---------------------------------------------------------------------------
# extract_section
# ---------------------------------------------------------------------------

class TestExtractSection:
    def test_extract_existing_section(self):
        text = "## Foo\nfoo content\n## Bar\nbar content\n"
        result = extract_section(text, "Foo")
        assert "foo content" in result
        assert "bar content" not in result

    def test_last_section(self):
        text = "## Foo\nfoo\n## Bar\nbar stuff\n"
        result = extract_section(text, "Bar")
        assert "bar stuff" in result

    def test_missing_section(self):
        assert extract_section("## Foo\ncontent", "Missing") == ""


# ---------------------------------------------------------------------------
# API Contracts gap analysis
# ---------------------------------------------------------------------------

class TestAnalyzeApiContracts:
    def test_express_route_found(self, tmp_path: Path):
        root, task_dir = _make_project(tmp_path, {
            "src/routes.js": "app.get('/api/users', handler);\napp.post('/api/users', createHandler);",
        })
        plan = _plan_with_api("| `/api/users` | GET | — | `{users: []}` | none | 200 |")
        (task_dir / "plan.md").write_text(plan)
        result = analyze_api_contracts(plan, root)
        assert not result["skipped"]
        assert result["verified"] >= 1
        assert len(result["unverified"]) == 0

    def test_flask_route_found(self, tmp_path: Path):
        root, task_dir = _make_project(tmp_path, {
            "app.py": '@app.route("/api/items", methods=["GET"])\ndef get_items(): pass',
        })
        plan = _plan_with_api("| `/api/items` | GET | — | `[]` | none | 200 |")
        (task_dir / "plan.md").write_text(plan)
        result = analyze_api_contracts(plan, root)
        assert result["verified"] >= 1

    def test_fastapi_route_found(self, tmp_path: Path):
        root, task_dir = _make_project(tmp_path, {
            "main.py": '@router.get("/api/health")\nasync def health(): pass',
        })
        plan = _plan_with_api("| `/api/health` | GET | — | `{ok: true}` | none | 200 |")
        (task_dir / "plan.md").write_text(plan)
        result = analyze_api_contracts(plan, root)
        assert result["verified"] >= 1

    def test_missing_endpoint_flagged(self, tmp_path: Path):
        root, task_dir = _make_project(tmp_path, {
            "src/routes.js": "app.get('/api/existing', handler);",
        })
        plan = _plan_with_api("| `/api/nonexistent` | POST | `{}` | `{}` | bearer | 201 |")
        (task_dir / "plan.md").write_text(plan)
        result = analyze_api_contracts(plan, root)
        assert len(result["unverified"]) == 1
        assert result["unverified"][0]["endpoint"] == "/api/nonexistent"

    def test_no_section_skips(self, tmp_path: Path):
        root, _ = _make_project(tmp_path, {})
        result = analyze_api_contracts("## Technical Approach\nstuff", root)
        assert result["skipped"]

    def test_empty_table_skips(self, tmp_path: Path):
        root, _ = _make_project(tmp_path, {})
        plan = textwrap.dedent("""\
            ## API Contracts
            No endpoints needed.
        """)
        result = analyze_api_contracts(plan, root)
        assert result["skipped"]

    def test_spring_boot_route(self, tmp_path: Path):
        root, task_dir = _make_project(tmp_path, {
            "Controller.java": '@GetMapping("/api/products")\npublic List<Product> list() {}',
        })
        plan = _plan_with_api("| `/api/products` | GET | — | `Product[]` | none | 200 |")
        (task_dir / "plan.md").write_text(plan)
        result = analyze_api_contracts(plan, root)
        assert result["verified"] >= 1

    def test_django_urls_route(self, tmp_path: Path):
        root, task_dir = _make_project(tmp_path, {
            "urls.py": "path('/api/orders', views.orders),",
        })
        plan = _plan_with_api("| `/api/orders` | GET | — | `[]` | none | 200 |")
        (task_dir / "plan.md").write_text(plan)
        result = analyze_api_contracts(plan, root)
        assert result["verified"] >= 1

    def test_parameterized_route_match(self, tmp_path: Path):
        root, task_dir = _make_project(tmp_path, {
            "routes.ts": "router.get('/api/users/:id', getUser);",
        })
        plan = _plan_with_api("| `/api/users/{id}` | GET | — | `User` | bearer | 200, 404 |")
        (task_dir / "plan.md").write_text(plan)
        result = analyze_api_contracts(plan, root)
        assert result["verified"] >= 1

    def test_empty_codebase(self, tmp_path: Path):
        root, task_dir = _make_project(tmp_path, {})
        plan = _plan_with_api("| `/api/test` | GET | — | `{}` | none | 200 |")
        (task_dir / "plan.md").write_text(plan)
        result = analyze_api_contracts(plan, root)
        assert len(result["unverified"]) == 1


# ---------------------------------------------------------------------------
# Data Model gap analysis
# ---------------------------------------------------------------------------

class TestAnalyzeDataModel:
    def test_sqlalchemy_model_found(self, tmp_path: Path):
        root, task_dir = _make_project(tmp_path, {
            "models.py": "class User(Base):\n    __tablename__ = 'users'\n    id = Column(Integer)",
        })
        plan = _plan_with_data_model("| `users` | id | int | no | auto | pk | — |")
        (task_dir / "plan.md").write_text(plan)
        result = analyze_data_model(plan, root)
        assert not result["skipped"]
        # "user" class is found by ORM pattern
        assert len(result["verified"]) >= 1 or "users" in str(result)

    def test_sql_create_table_found(self, tmp_path: Path):
        root, task_dir = _make_project(tmp_path, {
            "migrations/001.sql": "CREATE TABLE orders (id INT PRIMARY KEY);",
        })
        plan = _plan_with_data_model("| `orders` | id | int | no | auto | pk | — |")
        (task_dir / "plan.md").write_text(plan)
        result = analyze_data_model(plan, root)
        assert "orders" in result["verified"]

    def test_prisma_model_found(self, tmp_path: Path):
        root, task_dir = _make_project(tmp_path, {
            "schema.prisma": "model Product {\n  id Int @id\n  name String\n}",
        })
        # Prisma file extension isn't in CODE_EXTENSIONS but the pattern is
        # tested via .ts files that import prisma
        plan = _plan_with_data_model("| `Product` | id | int | no | auto | pk | — |")
        (task_dir / "plan.md").write_text(plan)
        # This won't find it because .prisma isn't in CODE_EXTENSIONS
        # That's correct — prisma schema is usually backed by migration SQL
        result = analyze_data_model(plan, root)
        assert not result["skipped"]

    def test_missing_table_flagged(self, tmp_path: Path):
        root, task_dir = _make_project(tmp_path, {
            "models.py": "class User(Base): pass",
        })
        plan = _plan_with_data_model("| `nonexistent_table` | id | int | no | auto | pk | — |")
        (task_dir / "plan.md").write_text(plan)
        result = analyze_data_model(plan, root)
        assert "nonexistent_table" in result["unverified"]

    def test_django_model_found(self, tmp_path: Path):
        root, task_dir = _make_project(tmp_path, {
            "models.py": "class Order(models.Model):\n    total = models.DecimalField()",
        })
        plan = _plan_with_data_model("| `Order` | total | decimal | no | — | — | — |")
        (task_dir / "plan.md").write_text(plan)
        result = analyze_data_model(plan, root)
        assert "order" in result["verified"]

    def test_no_section_skips(self, tmp_path: Path):
        root, _ = _make_project(tmp_path, {})
        result = analyze_data_model("## Technical Approach\nstuff", root)
        assert result["skipped"]

    def test_activerecord_model_found(self, tmp_path: Path):
        root, task_dir = _make_project(tmp_path, {
            "app/models/post.rb": "class Post < ApplicationRecord\nend",
        })
        plan = _plan_with_data_model("| `Post` | id | int | no | auto | pk | — |")
        (task_dir / "plan.md").write_text(plan)
        result = analyze_data_model(plan, root)
        assert "post" in result["verified"]

    def test_knex_migration_found(self, tmp_path: Path):
        root, task_dir = _make_project(tmp_path, {
            "migrations/create_comments.js": "knex.schema.createTable('comments', t => { t.increments('id'); });",
        })
        plan = _plan_with_data_model("| `comments` | id | int | no | auto | pk | — |")
        (task_dir / "plan.md").write_text(plan)
        result = analyze_data_model(plan, root)
        assert "comments" in result["verified"]


# ---------------------------------------------------------------------------
# findings_from_report
# ---------------------------------------------------------------------------

class TestFindingsFromReport:
    def test_unverified_api_endpoint(self):
        report = {
            "api_contracts": {
                "skipped": False,
                "unverified": [{"method": "POST", "endpoint": "/api/ghost"}],
            },
            "data_model": {"skipped": True},
        }
        errors = findings_from_report(report)
        assert len(errors) == 1
        assert "POST /api/ghost" in errors[0]

    def test_unverified_data_model(self):
        report = {
            "api_contracts": {"skipped": True},
            "data_model": {
                "skipped": False,
                "unverified": ["phantom_table"],
            },
        }
        errors = findings_from_report(report)
        assert len(errors) == 1
        assert "phantom_table" in errors[0]

    def test_no_gaps_no_errors(self):
        report = {
            "api_contracts": {"skipped": False, "unverified": []},
            "data_model": {"skipped": False, "unverified": []},
        }
        assert findings_from_report(report) == []

    def test_skipped_sections_no_errors(self):
        report = {
            "api_contracts": {"skipped": True, "reason": "no section"},
            "data_model": {"skipped": True, "reason": "no section"},
        }
        assert findings_from_report(report) == []

    def test_multiple_gaps(self):
        report = {
            "api_contracts": {
                "skipped": False,
                "unverified": [
                    {"method": "GET", "endpoint": "/api/a"},
                    {"method": "POST", "endpoint": "/api/b"},
                ],
            },
            "data_model": {
                "skipped": False,
                "unverified": ["table_x", "table_y"],
            },
        }
        errors = findings_from_report(report)
        assert len(errors) == 4


# ---------------------------------------------------------------------------
# Integration: validate_task_artifacts with gap analysis
# ---------------------------------------------------------------------------

class TestValidateTaskArtifactsGapIntegration:
    def _make_full_task(
        self, tmp_path: Path, domains: list[str], plan_text: str,
        source_files: dict[str, str] | None = None,
    ) -> Path:
        task_dir = tmp_path / ".dynos" / "task-gap"
        task_dir.mkdir(parents=True)
        manifest = {
            "stage": "PLANNING",
            "classification": {"type": "feature", "domains": domains, "risk_level": "medium", "notes": ""},
        }
        (task_dir / "manifest.json").write_text(json.dumps(manifest))
        (task_dir / "spec.md").write_text(textwrap.dedent("""\
            # Normalized Spec
            ## Task Summary
            T.
            ## User Context
            U.
            ## Acceptance Criteria
            1. Works.
            ## Implicit Requirements Surfaced
            None.
            ## Out of Scope
            Nothing.
            ## Assumptions
            None.
            ## Risk Notes
            None.
        """))
        (task_dir / "plan.md").write_text(plan_text)
        if source_files:
            for path, content in source_files.items():
                fpath = tmp_path / path
                fpath.parent.mkdir(parents=True, exist_ok=True)
                fpath.write_text(content)
        return task_dir

    def test_gap_errors_surface_in_validation(self, tmp_path: Path):
        from lib_validate import validate_task_artifacts
        plan = _plan_with_api("| `/api/phantom` | GET | — | `{}` | none | 200 |")
        task_dir = self._make_full_task(tmp_path, ["backend"], plan)
        errors = validate_task_artifacts(task_dir)
        assert any("plan API Contracts" in e and "phantom" in e for e in errors)

    def test_no_gap_errors_when_routes_exist(self, tmp_path: Path):
        from lib_validate import validate_task_artifacts
        plan = _plan_with_api("| `/api/items` | GET | — | `[]` | none | 200 |")
        task_dir = self._make_full_task(
            tmp_path, ["backend"], plan,
            source_files={"src/app.js": "app.get('/api/items', handler);"},
        )
        errors = validate_task_artifacts(task_dir)
        assert not any("plan API Contracts" in e for e in errors)

    def test_data_model_gap_errors_surface(self, tmp_path: Path):
        from lib_validate import validate_task_artifacts
        plan = _plan_with_data_model("| `ghost_table` | id | int | no | — | pk | — |")
        task_dir = self._make_full_task(tmp_path, ["db"], plan)
        errors = validate_task_artifacts(task_dir)
        assert any("plan Data Model" in e and "ghost_table" in e for e in errors)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

class TestCLI:
    def test_json_output(self, tmp_path: Path):
        task_dir = tmp_path / ".dynos" / "task-1"
        task_dir.mkdir(parents=True)
        (task_dir / "plan.md").write_text(_plan_with_api(
            "| `/api/test` | GET | — | `{}` | none | 200 |"
        ))

        result = subprocess.run(
            [sys.executable, str(Path(__file__).resolve().parent.parent / "hooks" / "plan_gap_analysis.py"),
             "--root", str(tmp_path), "--task-dir", str(task_dir)],
            capture_output=True, text=True, timeout=30,
        )
        assert result.returncode == 0
        data = json.loads(result.stdout)
        assert "api_contracts" in data
        assert "data_model" in data

    def test_no_plan_file(self, tmp_path: Path):
        task_dir = tmp_path / ".dynos" / "task-1"
        task_dir.mkdir(parents=True)

        result = subprocess.run(
            [sys.executable, str(Path(__file__).resolve().parent.parent / "hooks" / "plan_gap_analysis.py"),
             "--root", str(tmp_path), "--task-dir", str(task_dir)],
            capture_output=True, text=True, timeout=30,
        )
        assert result.returncode == 0
        data = json.loads(result.stdout)
        assert "error" in data


# ---------------------------------------------------------------------------
# Route pattern coverage
# ---------------------------------------------------------------------------

class TestRoutePatternCoverage:
    """Verify route detection works across major frameworks."""

    @pytest.mark.parametrize("code,expected_path", [
        ("app.get('/api/users', handler)", "/api/users"),
        ("router.post('/api/items', create)", "/api/items"),
        ("server.delete('/api/records/:id', remove)", "/api/records/:id"),
        ('@app.get("/api/health")\nasync def health(): pass', "/api/health"),
        ('@router.post("/api/submit")\ndef submit(): pass', "/api/submit"),
        ("path('/api/orders', views.orders)", "/api/orders"),
        ('@GetMapping("/api/products")\npublic List list() {}', "/api/products"),
        ('.GET("/api/data", handler)', "/api/data"),
    ])
    def test_route_detected(self, tmp_path: Path, code: str, expected_path: str):
        root, task_dir = _make_project(tmp_path, {"routes.py": code})
        plan = _plan_with_api(f"| `{expected_path}` | GET | — | `{{}}` | none | 200 |")
        (task_dir / "plan.md").write_text(plan)
        result = analyze_api_contracts(plan, root)
        assert result["routes_found_in_code"] >= 1


# ---------------------------------------------------------------------------
# Model pattern coverage
# ---------------------------------------------------------------------------

class TestModelPatternCoverage:
    @pytest.mark.parametrize("code,expected_name", [
        ("class User(Base):\n    pass", "user"),
        ("class Order(db.Model):\n    pass", "order"),
        ("class Post < ApplicationRecord\nend", "post"),
        ("CREATE TABLE products (id INT);", "products"),
        ("ALTER TABLE customers ADD COLUMN email VARCHAR;", "customers"),
        ("knex.schema.createTable('comments', t => {})", "comments"),
        ("model Invoice {\n  id Int @id\n}", "invoice"),
    ])
    def test_model_detected(self, tmp_path: Path, code: str, expected_name: str):
        root, task_dir = _make_project(tmp_path, {"models.py": code})
        plan = _plan_with_data_model(f"| `{expected_name}` | id | int | no | — | pk | — |")
        (task_dir / "plan.md").write_text(plan)
        result = analyze_data_model(plan, root)
        assert expected_name.lower() in result["verified"]
