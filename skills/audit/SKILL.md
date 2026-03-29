---
name: audit
description: "Power user: Trigger audit on existing in-progress work without starting a new task. Useful when you want to audit work done outside of dynos-work:start."
---

# dynos-work: Audit

Trigger a standalone audit on the current state of the codebase.

## What you do

1. Check if there is an active task in `.dynos/` (look for the most recent `manifest.json` with stage not DONE/FAILED)
2. If active task found: use its classification for risk-based auditor selection, and diff-scope to task changes
3. If no active task: create a minimal task record in `.dynos/`, run auditors on the current git diff

## Diff-scoped auditing

Before spawning auditors, determine the scope of changed files:
- If active task with `snapshot.head_sha`: `git diff --name-only {snapshot_head_sha}`
- If no active task: `git diff --name-only HEAD`

Pass this file list to each auditor. Auditors should only inspect these files, not the entire codebase.

## Risk-based auditor selection

If the task has a classification with `risk_level`:

| Risk Level | Auditors Spawned |
|---|---|
| `low` | spec-completion + security |
| `medium` | spec-completion + security + domain-relevant (see below) |
| `high` / `critical` | ALL 5 auditors |

If no classification exists (standalone audit), use `high` risk level (run all).

Domain-relevant auditors (for `medium` risk):
- Any `.tsx .jsx .css .html .vue .svelte .scss .less .dart` widget files changed → `ui-auditor` agent
- Any `.ts .js .py .go .rs .java .rb .cpp .cs .dart` logic files changed → `code-quality-auditor` agent
- Any schema/migration/ORM files changed → `db-schema-auditor` agent

**Dead code auditor:** Always include `dead-code-auditor` in standalone `/dynos-work:audit` runs (regardless of risk level). It checks for unused imports, dead functions, unused exports, unreferenced files, unused variables, and commented-out code.

Spawn all selected auditors in parallel via the Agent tool.

## Output

After all auditors complete, print a summary:

```
dynos-work Audit Report
=======================
Task: [task-id or "standalone audit"]
Risk level: [low | medium | high | critical]
Files scoped: [N] files
Auditors run: [list]

Results:
  spec-completion: PASS | FAIL ([N] findings)
  security: PASS | FAIL ([N] findings)
  ui: PASS | FAIL | SKIPPED
  code-quality: PASS | FAIL | SKIPPED
  db-schema: PASS | FAIL | SKIPPED
  dead-code: PASS | FAIL ([N] findings)

Blocking findings:
  [List each with finding ID, auditor, severity, description, file:line]

To repair: /dynos-work:repair
```

## When to use

- Work was done outside of `dynos-work:start` and you want to audit it
- You want to re-audit after making manual fixes
- You want a quick security or spec check on current changes
