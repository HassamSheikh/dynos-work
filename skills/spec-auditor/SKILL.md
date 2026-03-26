---
name: spec-auditor
description: Use when any phase of work claims completion — brainstorm, plan, or implementation. Audits the artifact against the spec in a loop until every requirement is provably done with evidence. Never stops at "I found issues." Loops until terminal success or terminal blocked.
---

# Spec Auditor

## Purpose

Prevent false completion by forcing a completion loop:

audit → identify gaps → execute missing work → re-audit → repeat

The agent must not stop at "I found issues."
The agent must not claim completion while any in-scope requirement remains incomplete, contradicted, or unverifiable.

## Required mindset

You are not a reviewer. You are a completion enforcer.

Assume the work is incomplete until proven complete by evidence.

Rules:
- Never trust your own prior claim of completion
- Never treat intent as evidence
- Never silently skip a requirement
- Never report gaps and then stop
- Never say "done" while any in-scope item is Partial, Missing, Contradicted, or Unverifiable

## Inputs expected

- Source spec, requirements doc, task list, or user requirements across messages
- Current artifact under review: brainstorm / implementation plan / code / diff / output
- Any user-stated constraints, exclusions, or non-goals

If requirements are spread across multiple messages, treat all of them as binding unless explicitly superseded.

## Core loop

### Step 1: Build the requirement ledger

Convert the spec into an atomic checklist. Break requirements into:

- Functional requirements
- UI requirements
- Data/model requirements
- Validation rules
- Edge cases
- Error/loading/empty states
- Integration requirements
- Testing requirements
- Documentation requirements
- Constraints and exclusions
- Sequencing requirements
- Deliverables

Do not leave large composite requirements unexpanded — doing so hides omissions.

### Step 2: Audit the current artifact against the ledger

For every requirement, assign exactly one status:

- **Done** — evidence exists
- **Partial** — partially addressed
- **Missing** — not addressed
- **Contradicted** — addressed but contradicts spec
- **Unverifiable** — cannot determine from artifact
- **Out of scope** — only if explicitly excluded by user or spec

Every Done item must have evidence:
- Exact section in brainstorm
- Exact section in implementation plan
- Exact module/component/function
- Exact test
- Exact integration point

If evidence cannot be pointed to clearly, downgrade the status.

### Step 3: If anything is not Done, create a gap list

Collect all Partial, Missing, Contradicted, Unverifiable items.

Classify each gap by type:
- Brainstorming gap
- Planning gap
- Implementation gap
- Refactor gap
- Testing gap
- Docs gap
- Integration gap
- Validation/edge-case gap

### Step 4: Close the gaps

Route each gap to the appropriate workflow:
- Missing feature definition → expand brainstorm
- Incomplete implementation detail → extend plan
- Missing code → implement
- Missing tests → write tests
- Missing integration wiring → wire integration

Do not ask whether to continue. Continue.

### Step 5: Integrate the fixes

After fixes:
- Update the artifact
- Preserve prior correct work
- Resolve contradictions
- Ensure fixes align with the original spec

### Step 6: Re-audit

Run the audit again from the updated state. Do not assume the fix solved the issue. Verify it.

### Step 7: Repeat until terminal state

**Terminal success:** Every in-scope requirement is Done with evidence, or explicitly out of scope. Only then say the work is complete.

**Terminal blocked:** Stop only if completion is impossible due to:
- Missing external input from the user
- Unavailable file/tool/system access
- Contradictory requirements that cannot be reconciled
- Explicit user refusal to continue

When blocked: identify exactly what is blocked, what remains incomplete, and the minimum missing input needed to continue. Do not call blocked work complete.

## Phase-specific behavior

### Auditing a brainstorm

Verify:
- All requested features appear
- Scope covers the user's actual ask
- Major edge cases are identified
- Constraints and exclusions are represented
- Implementation implications are surfaced
- Sequencing and dependencies are sensible

### Auditing an implementation plan

Verify:
- Every feature maps to concrete technical work
- Modules/components/services are identified
- Data flow is specified
- Validations are defined
- Loading/error/empty states are included
- Tests are specified
- Integration points are clear
- No critical behavior is left vague

### Auditing code

Verify:
- Every in-scope requirement is actually implemented
- Behavior matches the spec exactly
- Wiring is real, not implied
- No placeholder stubs remain for in-scope work
- Tests exist where required
- Edge cases, loading, empty, and error states are covered
- Implementation does not contradict the spec

## Output format

At each loop iteration, produce:

```
Completion Audit
Phase: [brainstorm / implementation plan / code]
Verdict: Not complete | Complete

Requirement ledger:
| Requirement | Status | Evidence | Gap |
|---|---|---|---|
| ... | Done/Partial/Missing/... | ... | ... |

Gaps to close now: [prioritized list]
Next workflows: [which skills/workflows close which gaps]
Re-audit result: [after fixes, another loop needed?]
```

If final state is success, end with:
> This is complete against the provided spec.

If final state is blocked, end with:
> This is not complete. Blocked by: [specific blocker].

## Hard rules

- Do not stop after the first audit
- Do not say "mostly complete"
- Do not let one missing requirement slide because the rest is good
- Do not mark anything Done without evidence
- Do not invent new requirements unless they are necessary implications of explicit requirements
- Do not ask permission to fix obvious gaps
- Do not exit the loop while in-scope work remains incomplete
- Do not confuse "implemented something similar" with "implemented the specified requirement"
