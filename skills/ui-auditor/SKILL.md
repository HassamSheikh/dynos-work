---
name: ui-auditor
description: Use when UI files have been modified (.tsx, .jsx, .css, .html, .vue, .svelte). Audits UI completeness against spec. v1 is a checklist the agent must verify manually. v2 will be a full automated audit loop.
---

# UI Auditor (v1)

Verify the following before marking any UI work complete. Every item must be checked — do not skip any.

## States

- [ ] Loading state exists and is shown while data fetches
- [ ] Empty state exists and is shown when there is no data
- [ ] Error state exists and is shown when a request fails
- [ ] Success state matches the spec exactly

## Spec coverage

- [ ] Every UI element described in the spec is present
- [ ] Every interaction described in the spec works (click, input, submit, navigation)
- [ ] Labels, copy, and placeholder text match the spec

## Edge cases

- [ ] Long text does not break layout (overflow, truncation)
- [ ] Empty inputs are handled (validation shown)
- [ ] Zero items, one item, many items all render correctly

## Accessibility

- [ ] Interactive elements are keyboard-reachable
- [ ] Images have alt text
- [ ] Form fields have labels

## Output

For each item above, mark: Done (with evidence) | Missing | Not applicable

If any item is Missing: fix it, then re-run this checklist.

Only return Pass when every in-scope item is Done with evidence.
