---
name: investigate
description: "Deep bug investigation. Pass a short description of the problem — error message, unexpected behavior, or failing test. Returns structured root cause analysis with evidence and fix recommendation."
---

# dynos-work: investigate

Runs a deterministic-first investigation pipeline: triage first, reasoning second, citation validation third. The LLM never gathers evidence on its own — it reasons over a pre-built dossier.

## Ruthlessness Standard

- Name the mechanism, not the symptom.
- Every conclusion must cite a pre-minted evidence ID from the dossier.
- If the evidence does not support a claim, say so instead of guessing.

## Phase 1 — Deterministic Evidence Gathering

Run the triage orchestrator before invoking the LLM:

```bash
python3 debug-module/triage.py --bug "<bug text>" --repo <repo_path> --out /tmp/dossier.json
```

This produces an evidence dossier at `/tmp/dossier.json` with pre-minted evidence IDs (`F-001` for files, `S-001` for symbols, etc.), git blame, linter findings, and Semgrep silent-accomplice findings. The LLM does not gather evidence — it reasons over what triage has already found.

## Phase 2 — Causal Reasoning

Spawn the `@investigator` subagent with the dossier path. Pass the contents of `/tmp/dossier.json` as input and instruct the agent to:

- Trace root cause, immediate cause, and detection failure.
- Cite only evidence IDs that exist in the dossier.
- Write its structured JSON output to `/tmp/bug_report.json`.

The agent must not invent file paths, symbols, or findings outside the dossier.

## Phase 3 — Citation Validation and Markdown Render

Validate citations and render the final report:

```bash
python3 debug-module/lib/render_report.py --report /tmp/bug_report.json --dossier /tmp/dossier.json
```

`render_report.py` mechanically verifies every `evidence_ids[]` reference in `bug_report.json` exists in the dossier and renders the final Markdown. Any citation pointing to a non-existent ID surfaces as a visible WARNING in the output.

## Usage

```
/dynos-work:investigate <your problem description>
```

Examples:
```
/dynos-work:investigate TypeError: Cannot read properties of undefined reading 'id' at UserService.ts:47
/dynos-work:investigate the checkout flow always skips the discount calculation when coupon code is applied
/dynos-work:investigate test suite: AuthController > login > should return 401 on invalid password is failing
```
