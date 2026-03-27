---
name: repair
description: "Power user: Manually trigger repair on a specific audit finding. Use when you want to fix a specific issue without running the full repair loop."
---

# dynos-work: Repair

Manually trigger repair for a specific finding from an audit report.

## What you do

1. Find the active task in `.dynos/`
2. Read the latest audit reports
3. If the user specifies a finding ID, repair that finding only
4. If no finding specified, show all open blocking findings and ask which to repair
5. Spawn the appropriate executor subagent via the Agent tool with the precise repair instruction
6. After repair, re-run only the auditor(s) that reported the finding (plus always spec-completion and security)
7. Report new audit result

## Usage

```
/dynos-work:repair                    — shows all open findings
/dynos-work:repair sec-003            — repairs finding sec-003
/dynos-work:repair --all              — repairs all open findings in parallel (where file-safe)
```

## Executor selection

Based on the finding's `assigned_executor` field from the audit report's `repair_tasks`. If not specified, infer from file extension:
- UI files → `dynos-work:execution/ui-executor`
- Backend/API files → `dynos-work:execution/backend-executor`
- Schema/migration → `dynos-work:execution/db-executor`
- Config/env → `dynos-work:execution/integration-executor`
- Tests → `dynos-work:execution/testing-executor`

## Hard rules

- Always re-audit after repair — do not assume the fix worked
- Always include spec-completion and security in the re-audit
- Update repair-log.json with the result
