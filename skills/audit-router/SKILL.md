---
name: audit-router
description: Use after each implementation task completes. Inspects files touched via git diff, classifies context (UI/code/mixed), and dispatches the correct combination of dynos-audit auditors. Collects results and only declares complete when all dispatched auditors pass.
---

# Audit Router

## Purpose

Detect what kind of work just completed by inspecting actual files touched — not by trusting agent claims — then dispatch the correct auditors.

## Step 1: Inspect files touched

Run:

```bash
git diff --name-only HEAD~1 HEAD
```

If this is the first commit, run:

```bash
git diff --name-only $(git rev-list --max-parents=0 HEAD) HEAD
```

Collect the full list of changed files.

## Step 2: Classify context

Classify each file by extension:

**UI files:** `.tsx`, `.jsx`, `.css`, `.html`, `.vue`, `.svelte`, `.scss`, `.less`

**Logic/code files:** `.ts`, `.js`, `.py`, `.go`, `.rs`, `.java`, `.rb`, `.php`, `.c`, `.cpp`, `.cs`

**Test files:** `.test.ts`, `.test.js`, `.spec.ts`, `.spec.js`, `_test.go`, `test_*.py`

**Config/docs:** `.json`, `.yaml`, `.yml`, `.md`, `.toml` — do not use these alone to classify context. Only use them as tiebreakers if both UI and code files are present.

**Classification rules:**
- Only UI files present → **UI context**
- Only logic files present → **Code context**
- Both UI and logic files present → **Full context**
- User explicitly says "full audit" → **Full context** regardless of files

## Step 3: Dispatch auditors

| Context | Auditors to invoke |
|---|---|
| UI | `dynos-audit:spec-auditor` + `dynos-audit:ui-auditor` |
| Code | `dynos-audit:spec-auditor` + `dynos-audit:code-quality-auditor` |
| Full | `dynos-audit:spec-auditor` + `dynos-audit:ui-auditor` + `dynos-audit:code-quality-auditor` |

Invoke each auditor in sequence. Do not skip any.

## Step 4: Collect results

After each auditor completes, record its verdict:
- **Pass** — all requirements in scope for this auditor are Done with evidence
- **Fail** — gaps remain

## Step 5: Declare outcome

Only declare the task complete when **all** dispatched auditors return Pass.

If any auditor returns Fail:
- The implementer must fix the gaps
- Re-invoke the failing auditor after fixes
- Repeat until all pass

Do not advance to the next task while any auditor has open gaps.

## Output format

```
Audit Router — Task: [task name]
Files touched: [list]
Context detected: UI | Code | Full

Dispatching:
- dynos-audit:spec-auditor → [Pass | Fail]
- dynos-audit:ui-auditor → [Pass | Fail | Skipped]
- dynos-audit:code-quality-auditor → [Pass | Fail | Skipped]

Overall verdict: Complete | Incomplete
Open gaps: [list if any]
```
