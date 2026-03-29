---
name: audit
description: "Power user: Run checkpoint audit, repair any findings, then run final audit to reach DONE — all in one shot. Use after /dynos-work:execute."
---

# dynos-work: Audit

Runs the full audit-to-done pipeline: checkpoint audit → repair loop → final audit → DONE.

## What you do

### Step 1 — Find active task

Find the most recent active task in `.dynos/`. Read `manifest.json`.

Verify stage is `CHECKPOINT_AUDIT`. If not, print the current stage and what command to run instead.

### Step 2 — Diff scope

Run `git diff --name-only {snapshot.head_sha}` to get all files changed by this task. Pass this list to every auditor. Auditors only inspect these files.

If no snapshot exists (standalone audit), use `git diff --name-only HEAD`.

### Step 3 — Checkpoint audit (risk-based)

Update `manifest.json` stage to `CHECKPOINT_AUDIT`. Append to log:
```
{timestamp} [STAGE] → CHECKPOINT_AUDIT
{timestamp} [SPAWN] checkpoint auditors — risk-based selection
```

Select auditors based on `classification.risk_level`:

| Risk Level | Auditors Spawned |
|---|---|
| `low` | spec-completion + security |
| `medium` | spec-completion + security + domain-relevant (see below) |
| `high` / `critical` | ALL 5 auditors |
| no classification | ALL 5 auditors |

Domain-relevant auditors (for `medium` risk, based on changed files):
- Any `.tsx .jsx .css .html .vue .svelte .scss .less .dart` files → `ui-auditor`
- Any `.ts .js .py .go .rs .java .rb .cpp .cs .dart` logic files → `code-quality-auditor`
- Any schema/migration/ORM files → `db-schema-auditor`

Spawn selected auditors in parallel. Each writes its report to `.dynos/task-{id}/audit-reports/{auditor}-checkpoint-{timestamp}.json`.

Wait for all to complete. Append to log:
```
{timestamp} [DONE] checkpoint audit complete
```

### Step 4 — Repair loop (if findings exist)

Read all checkpoint audit reports. Collect all blocking findings.

**If no blocking findings:** append `{timestamp} [ADVANCE] CHECKPOINT_AUDIT → FINAL_AUDIT` to log. Skip to Step 5.

**If blocking findings exist:**

Update stage to `REPAIR_PLANNING`. Append to log:
```
{timestamp} [REPAIR] {N} findings — {list of finding IDs}
{timestamp} [STAGE] → REPAIR_PLANNING
```

Spawn `repair-coordinator` agent with instruction: "Read all audit reports in `.dynos/task-{id}/audit-reports/`. Produce a repair plan. Assign each finding to an executor. Write to `.dynos/task-{id}/repair-log.json`."

Wait for completion. Update stage to `REPAIR_EXECUTION`. Append to log:
```
{timestamp} [STAGE] → REPAIR_EXECUTION
```

Spawn executor agents (in parallel where file-safe) for each repair task as assigned in `repair-log.json`:
- `ui-executor`, `backend-executor`, `ml-executor`, `db-executor`, `refactor-executor`, `testing-executor`, `integration-executor`

Each executor receives: the specific finding, the file(s) to fix, `spec.md`, `plan.md`.

After all repairs complete, append to log:
```
{timestamp} [DONE] repair-execution — all fixes applied
```

**Re-audit:** spawn only the auditors that reported the repaired findings (plus always spec-completion and security). Wait for results.

- If all clear: append `{timestamp} [ADVANCE] REPAIR_EXECUTION → FINAL_AUDIT` to log. Proceed to Step 5.
- If new findings: increment `retry_counts` for each finding. If any finding has exceeded 3 retries, set stage to `FAILED`, append `[FAILED] max retries exceeded for: {finding-ids}`, and stop. Otherwise loop back to repair.

### Step 5 — Final audit (all 6 auditors, no evidence reuse)

Update `manifest.json` stage to `FINAL_AUDIT`. Append to log:
```
{timestamp} [STAGE] → FINAL_AUDIT
{timestamp} [SPAWN] all 6 auditors in parallel — final gate
```

Spawn simultaneously (no evidence reuse — every auditor runs fresh):
- `spec-completion-auditor`
- `security-auditor`
- `code-quality-auditor`
- `ui-auditor`
- `db-schema-auditor`
- `dead-code-auditor`

Each receives: `spec.md`, `plan.md`, all evidence files, the diff-scoped file list. Each writes its report to `.dynos/task-{id}/audit-reports/{auditor}-final-{timestamp}.json`.

Wait for ALL 6 to complete. Append to log:
```
{timestamp} [DONE] final audit complete
```

### Step 6 — Gate to DONE

Read all 6 final audit reports. Write `audit-summary.json`.

**If all 6 pass:**
Write `completion.json`. Update stage to `DONE`. Append to log:
```
{timestamp} [ADVANCE] FINAL_AUDIT → DONE
```
Print:
```
Audit complete — ALL PASSED

Checkpoint:      PASS
Final audit:
  spec-completion:  PASS
  security:         PASS
  code-quality:     PASS
  ui:               PASS
  db-schema:        PASS
  dead-code:        PASS

Task complete. Snapshot branch dynos/task-{id}-snapshot can be deleted if desired.
```

**If any final audit findings:**
Update stage to `REPAIR_PLANNING`. Append to log:
```
{timestamp} [REPAIR] final audit — {N} findings: {list of finding IDs}
{timestamp} [ADVANCE] FINAL_AUDIT → REPAIR_PLANNING
```
Loop back to Step 4 to repair and re-run final audit. Apply the same 3-retry limit per finding.

---

## Standalone use (no active task)

If no active task is found, run auditors on `git diff --name-only HEAD`. Use `high` risk level (all 5 auditors + dead-code). Skip Steps 5–6 (no DONE state to write). Print results and stop.
