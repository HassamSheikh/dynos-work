# dynos-work — Codex Installation

Codex does not support automatic plugin loading. Follow these steps to install dynos-work manually.

## Step 1: Copy skills

```bash
cp -r /path/to/dynos-work/skills/* ~/.codex/skills/
```

## Step 2: Add rules to AGENTS.md

Add the following to your project's `AGENTS.md`:

```
<EXTREMELY_IMPORTANT>
dynos-work is installed and active.

To start any task: invoke dynos-work:start with your task description.

Core guarantee: No task is complete until independent auditors verify it with evidence.
Agent self-reports of completion are untrusted.
</EXTREMELY_IMPORTANT>
```

## Step 3: Verify

Start a Codex session and ask: "What audit rules are active?"
Expected: Codex lists dynos-work lifecycle rules.
