#!/usr/bin/env python3
"""Validate dynos-work task artifacts deterministically.

Usage:
  python3 hooks/validate_task_artifacts.py .dynos/task-YYYYMMDD-NNN [--no-gap]

  --no-gap   Skip the plan_gap_analysis pass. Use this from execute
             preflight when planning has already validated the same
             plan — saves up to ~2000 file reads per call.
"""

from __future__ import annotations
import sys as _sys; _sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent))

import sys
from pathlib import Path

from lib_validate import validate_task_artifacts


def main() -> int:
    args = sys.argv[1:]
    run_gap = True
    if "--no-gap" in args:
        run_gap = False
        args = [a for a in args if a != "--no-gap"]
    if len(args) != 1:
        print(__doc__.strip())
        return 2

    task_dir = Path(args[0]).resolve()
    errors = validate_task_artifacts(task_dir, strict=True, run_gap=run_gap)

    # Auto-emit deterministic validation event to per-task token ledger
    try:
        from lib_tokens import record_tokens
        from lib_core import load_json
        manifest = load_json(task_dir / "manifest.json")
        stage = manifest.get("stage", "")
        from lib_tokens import phase_for_stage
        record_tokens(
            task_dir=task_dir,
            agent="validate_task_artifacts",
            model="none",
            input_tokens=0,
            output_tokens=0,
            phase=phase_for_stage(stage),
            stage=stage,
            event_type="deterministic",
            detail=f"{'PASS' if not errors else 'FAIL'} — {len(errors)} error(s)" + (f": {errors[0]}" if errors else ""),
        )
    except Exception:
        pass  # Never let event recording break validation

    if errors:
        print("Artifact validation failed:")
        for error in errors:
            print(f"- {error}")
        return 1

    # Auto-emit plan-validated receipt when execution graph exists
    try:
        from lib_receipts import receipt_plan_validated
        from lib_core import load_json as _load_json
        graph_path = task_dir / "execution-graph.json"
        spec_path = task_dir / "spec.md"
        if graph_path.exists() and spec_path.exists():
            graph = _load_json(graph_path)
            segments = graph.get("segments", [])
            # Collect all criteria_ids across segments
            all_criteria: list[int] = []
            for seg in segments:
                for cid in seg.get("criteria_ids", []):
                    if cid not in all_criteria:
                        all_criteria.append(cid)
            receipt_plan_validated(
                task_dir,
                segment_count=len(segments),
                criteria_coverage=sorted(all_criteria),
            )
    except Exception:
        pass  # Never let receipt writing break validation

    print(f"Artifact validation passed for {task_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
