#!/usr/bin/env python3
"""LLM-powered postmortem analysis for dynos-work.

Reads task artifacts (retrospective, audit reports, repair log) and
produces a structured analysis with prevention rules, root causes,
and improvement proposals. Designed to be called from the audit skill
which has Agent tool access.

Two modes:
  build-prompt  — reads artifacts, outputs a structured prompt for an LLM
  apply         — reads LLM output (JSON from stdin), writes prevention rules
"""

from __future__ import annotations
import sys as _sys; _sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent)); _sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent.parent / "hooks"))

import argparse
import json
from pathlib import Path

from lib_core import (
    _persistent_project_dir,
    load_json,
    now_iso,
    write_json,
)


def _read_artifact(path: Path) -> dict | list | None:
    """Read a JSON artifact, returning None if missing or broken."""
    try:
        return load_json(path)
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return None


def _collect_audit_findings(task_dir: Path) -> list[dict]:
    """Collect all findings from audit reports."""
    reports_dir = task_dir / "audit-reports"
    if not reports_dir.is_dir():
        return []
    findings = []
    for report_path in sorted(reports_dir.glob("*.json")):
        report = _read_artifact(report_path)
        if not isinstance(report, dict):
            continue
        auditor = report.get("auditor_name", report_path.stem)
        for f in report.get("findings", []):
            if isinstance(f, dict):
                f["_auditor"] = auditor
                findings.append(f)
    return findings


def build_analysis_prompt(task_dir: Path) -> dict:
    """Build a structured prompt for LLM analysis of a completed task.

    Returns {"prompt": str, "has_findings": bool, "task_id": str}.
    If the task had no findings or repairs, returns has_findings=False
    and the caller can skip the LLM spawn.
    """
    task_dir = Path(task_dir).resolve()

    retro = _read_artifact(task_dir / "task-retrospective.json") or {}
    repair_log = _read_artifact(task_dir / "repair-log.json")
    findings = _collect_audit_findings(task_dir)
    manifest = _read_artifact(task_dir / "manifest.json") or {}

    task_id = retro.get("task_id", manifest.get("task_id", "unknown"))
    repair_count = int(retro.get("repair_cycle_count", 0))
    quality = retro.get("quality_score", 1.0)

    # Skip analysis if task was clean — nothing to learn from
    has_findings = bool(findings) or repair_count > 0 or (quality is not None and float(quality) < 0.8)
    if not has_findings:
        return {"prompt": "", "has_findings": False, "task_id": task_id}

    # Build context sections
    sections = []

    sections.append(f"Task: {task_id}")
    sections.append(f"Type: {retro.get('task_type', 'unknown')}, Domains: {retro.get('task_domains', 'unknown')}, Risk: {retro.get('task_risk_level', 'unknown')}")
    sections.append(f"Quality: {quality}, Repairs: {repair_count}, Tokens: {retro.get('total_token_usage', 0)}")
    sections.append("")

    if findings:
        sections.append(f"## Audit Findings ({len(findings)} total)")
        for f in findings[:20]:  # cap to avoid huge prompts
            sections.append(f"- [{f.get('_auditor', '?')}] {f.get('severity', '?')}: {f.get('description', f.get('message', f.get('id', '?')))}")
            if f.get("file"):
                sections.append(f"  File: {f['file']}:{f.get('line', '?')}")
        sections.append("")

    if repair_log and isinstance(repair_log, dict):
        sections.append("## Repair Log")
        for batch in repair_log.get("batches", [])[:5]:
            cycle = batch.get("repair_cycle", "?")
            tasks = batch.get("tasks", [])
            for t in tasks[:10]:
                sections.append(f"- Cycle {cycle}: {t.get('finding_id', '?')} -> {t.get('executor', '?')} ({t.get('status', '?')})")
        sections.append("")

    findings_by_cat = retro.get("findings_by_category", {})
    if findings_by_cat:
        sections.append("## Finding Categories")
        for cat, count in sorted(findings_by_cat.items(), key=lambda x: -x[1]):
            sections.append(f"- {cat}: {count}")
        sections.append("")

    executor_repairs = retro.get("executor_repair_frequency", {})
    if executor_repairs:
        sections.append("## Executor Repair Frequency")
        for ex, count in sorted(executor_repairs.items(), key=lambda x: -x[1]):
            sections.append(f"- {ex}: {count} repairs")
        sections.append("")

    context = "\n".join(sections)

    prompt = f"""Analyze this completed task's audit and repair data. Identify root causes and propose specific prevention rules.

{context}

Respond with ONLY a JSON object (no markdown, no explanation):
{{
  "root_causes": [
    {{
      "finding_category": "sec|cq|dc|perf|comp|ui|db",
      "root_cause": "One sentence explaining WHY this kept happening",
      "affected_executor": "backend-executor|ui-executor|etc or null",
      "severity": "high|medium|low"
    }}
  ],
  "prevention_rules": [
    {{
      "executor": "backend-executor|ui-executor|all",
      "rule": "Specific, actionable instruction to prevent this class of failure",
      "category": "sec|cq|dc|perf|comp|ui|db",
      "source_finding": "The finding ID or description that motivated this rule"
    }}
  ],
  "model_suggestions": [
    {{
      "agent": "agent-name",
      "current_model": "haiku|sonnet|opus",
      "suggested_model": "haiku|sonnet|opus",
      "reason": "Why"
    }}
  ]
}}

Rules:
- Only propose prevention rules for issues that actually occurred (not hypothetical)
- Rules must be specific enough to be actionable — not generic advice
- If a finding category appeared 2+ times, it definitely needs a rule
- If repairs failed and were retried, explain why the first attempt failed
- Keep rules under 100 characters each
- Return empty arrays if nothing meaningful to propose"""

    return {"prompt": prompt, "has_findings": True, "task_id": task_id}


def apply_analysis(task_dir: Path, analysis: dict) -> dict:
    """Apply LLM analysis output to project state.

    Reads the LLM's JSON output and writes prevention rules.
    Returns summary of what was applied.
    """
    task_dir = Path(task_dir).resolve()
    retro = _read_artifact(task_dir / "task-retrospective.json") or {}
    task_id = retro.get("task_id", "unknown")

    # Determine project root from task dir
    root = task_dir.parent.parent
    persistent = _persistent_project_dir(root)

    # Write full analysis to task dir
    analysis["analyzed_at"] = now_iso()
    analysis["task_id"] = task_id
    write_json(task_dir / "postmortem-analysis.json", analysis)

    # Extract and merge prevention rules
    new_rules = analysis.get("prevention_rules", [])
    if not new_rules:
        return {"task_id": task_id, "rules_added": 0, "analysis_written": True}

    rules_path = persistent / "prevention-rules.json"
    existing: dict = {}
    try:
        existing = load_json(rules_path)
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        existing = {}

    current_rules = existing.get("rules", [])
    existing_rule_texts = {r.get("rule", "").lower() for r in current_rules}

    added = 0
    for rule in new_rules:
        if not isinstance(rule, dict):
            continue
        text = rule.get("rule", "").strip()
        if not text or text.lower() in existing_rule_texts:
            continue
        current_rules.append({
            "executor": rule.get("executor", "all"),
            "category": rule.get("category", "unknown"),
            "rule": text,
            "source_task": task_id,
            "source_finding": rule.get("source_finding", ""),
            "added_at": now_iso(),
        })
        existing_rule_texts.add(text.lower())
        added += 1

    if added:
        write_json(rules_path, {"rules": current_rules, "updated_at": now_iso()})

    return {"task_id": task_id, "rules_added": added, "analysis_written": True}


def cmd_build_prompt(args: argparse.Namespace) -> int:
    result = build_analysis_prompt(Path(args.task_dir))
    print(json.dumps(result, indent=2))
    return 0


def cmd_apply(args: argparse.Namespace) -> int:
    analysis = json.load(_sys.stdin)
    result = apply_analysis(Path(args.task_dir), analysis)
    print(json.dumps(result, indent=2))
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    bp = sub.add_parser("build-prompt", help="Build analysis prompt from task artifacts")
    bp.add_argument("task_dir")
    bp.set_defaults(func=cmd_build_prompt)

    ap = sub.add_parser("apply", help="Apply LLM analysis output (reads JSON from stdin)")
    ap.add_argument("task_dir")
    ap.set_defaults(func=cmd_apply)

    return parser


if __name__ == "__main__":
    from cli_base import cli_main
    raise SystemExit(cli_main(build_parser))
