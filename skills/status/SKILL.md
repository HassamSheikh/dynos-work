---
name: status
description: "Power user: Show current task state, lifecycle stage, audit results, and open gaps."
---

# dynos-work: Status

Show the current state of the active dynos-work task.

## What you do

1. Find the most recent active task in `.dynos/` (manifest.json with stage not DONE/FAILED)
2. If no active task, report "No active dynos-work task found. Start one with /dynos-work:start"
3. Read: manifest.json, spec.md, execution-graph.json, latest audit-reports, repair-log.json
4. Print a human-readable status report

## Output format

```
dynos-work Status Report
========================
Task: task-20260327-001
Title: [First 80 chars of task]
Stage: CHECKPOINT_AUDIT
Risk: medium

Lifecycle Progress:
  ✓ INTAKE
  ✓ TASK_CLASSIFICATION
  ✓ SPEC_NORMALIZATION
  ✓ PLANNING
  ✓ EXECUTION_GRAPH_BUILD
  ✓ EXECUTION (3/3 segments complete)
  → CHECKPOINT_AUDIT (in progress)
  ○ FINAL_AUDIT
  ○ COMPLETION_REVIEW

Acceptance Criteria: [N]/[total] covered

Latest Audit Results:
  spec-completion: PASS | FAIL | not yet run
  security: PASS | FAIL | not yet run
  ui: PASS | FAIL | SKIPPED | not yet run
  code-quality: PASS | FAIL | SKIPPED | not yet run
  db-schema: PASS | FAIL | SKIPPED | not yet run

Open Blocking Findings:
  [finding-id] [auditor]: [description] ([file:line])

Repair Cycle: [N] ([N] findings resolved, [N] remaining)

To repair: /dynos-work:repair
To resume lifecycle: /dynos-work:resume
```
