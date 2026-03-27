---
name: audit
description: "Power user: Trigger audit on existing in-progress work without starting a new task. Useful when you want to audit work done outside of dynos-work:start."
---

# dynos-work: Audit

Trigger a standalone audit on the current state of the codebase.

## What you do

1. Check if there is an active task in `.dynos/` (look for the most recent `manifest.json` with stage not DONE/FAILED)
2. If active task found: spawn all applicable auditors for that task using the Agent tool, wait for all to complete, then report results
3. If no active task: create a minimal task record in `.dynos/`, run all five auditors on the current git diff, report results

## Auditor selection

Always run (in parallel):
- `dynos-work:auditors/spec-completion`
- `dynos-work:auditors/security`

Also spawn based on changed files (from `git diff --name-only`):
- Any `.tsx .jsx .css .html .vue .svelte .scss .less` files changed → `dynos-work:auditors/ui`
- Any `.ts .js .py .go .rs .java .rb .cpp .cs` files changed → `dynos-work:auditors/code-quality`
- Any schema/migration/ORM files changed → `dynos-work:auditors/db-schema`

## Output

After all auditors complete, print a summary:

```
dynos-work Audit Report
=======================
Task: [task-id or "standalone audit"]
Auditors run: [list]

Results:
  spec-completion: PASS | FAIL ([N] findings)
  security: PASS | FAIL ([N] findings)
  ui: PASS | FAIL | SKIPPED
  code-quality: PASS | FAIL | SKIPPED
  db-schema: PASS | FAIL | SKIPPED

Blocking findings:
  [List each with finding ID, auditor, severity, description, file:line]

To repair: /dynos-work:repair
```

## When to use

- Work was done outside of `dynos-work:start` and you want to audit it
- You want to re-audit after making manual fixes
- You want a quick security or spec check on current changes
