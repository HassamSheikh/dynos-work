---
name: code-quality-auditor
description: Use when logic/backend files have been modified (.ts, .js, .py, .go, .rs, etc.). Audits code quality against spec. v1 is a checklist the agent must verify manually. v2 will be a full automated audit loop.
---

# Code Quality Auditor (v1)

Verify the following before marking any code work complete. Every item must be checked — do not skip any.

## Spec coverage

- [ ] Every function/method described in the spec exists
- [ ] Every behavior described in the spec is implemented
- [ ] No placeholder stubs remain for in-scope work (search for `TODO`, `FIXME`, `pass`, `throw new Error('not implemented')`)

## Edge cases

- [ ] Null/undefined inputs are handled
- [ ] Empty collections are handled
- [ ] Boundary values are handled (0, -1, max int, empty string)
- [ ] Invalid input returns a clear error, not a crash

## Error handling

- [ ] Network/IO errors are caught and handled
- [ ] Error messages are meaningful, not generic
- [ ] Errors do not swallow stack traces silently

## Tests

- [ ] Every new function has at least one test
- [ ] Tests cover the happy path
- [ ] Tests cover at least one error/edge case per function
- [ ] All tests pass: run `npm test` / `pytest` / `go test ./...` / appropriate command and confirm 0 failures

## Code correctness

- [ ] No dead code left in
- [ ] No debug logging left in (`console.log`, `print`, `fmt.Println` for debug purposes)
- [ ] Logic matches spec behavior exactly (re-read spec and compare)

## Output

For each item above, mark: Done (with evidence) | Missing | Not applicable

If any item is Missing: fix it, then re-run this checklist.

Only return Pass when every in-scope item is Done with evidence.
