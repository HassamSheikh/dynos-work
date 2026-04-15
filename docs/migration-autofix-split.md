# Migration: Autofix split to separate repo (7.0.0)

In 7.0.0, the autofix subsystem — the background code scanner, PR opener, and dead-code / dependency-vuln detectors — moves out of `dynos-work` into its own repository at [**dynos-fit/autofix**](https://github.com/dynos-fit/autofix). This doc walks you through the upgrade.

## What changed

Removed from `dynos-work`:

| Surface | Status |
|---|---|
| `/dynos-work:autofix on`, `/dynos-work:autofix off` slash commands | Gone |
| `dynos init --autofix` flag | Gone |
| `dynos autofix scan` / `list` / `clear` CLI subcommands | Gone |
| `hooks/dynoproactive.py` | Gone |
| Background autofix loop inside the local daemon | Gone (daemon itself replaced by system crontab — see below) |
| Dashboard "Autofix" tab | Gone |
| `skills/autofix/` | Gone |

Kept in `dynos-work`:

- `/dynos-work:maintain` — reworded to describe technical-debt triage without the autofix PR automation. Still surfaces findings for your attention; no longer opens PRs on its own.
- `.dynos/proactive-findings.json` layout — preserved for backward compat so the new autofix repo can read existing state if you point it at your project.

## Upgrade path

1. **Install the new autofix repo:**
   ```bash
   # Install instructions live in the new repo's README:
   git clone https://github.com/dynos-fit/autofix ~/.dynos-autofix
   # Follow its setup — it uses system crontab for scheduled scans
   ```

2. **Update Claude Code:**
   ```bash
   claude plugin update dynos-work
   ```
   This pulls 7.0.0. After the update, `/dynos-work:autofix` no longer exists; Claude Code will say "unknown command" if you try it.

3. **Your existing autofix state (policy, findings, outcomes) stays put:**
   - `.dynos/proactive-findings.json` — left alone, readable by the new autofix repo
   - `~/.dynos/projects/<slug>/policy.json` — autofix-specific fields are still there; the new repo reads them
   - `~/.dynos/projects/<slug>/q-learning/` — preserved

4. **If you had a project daemon with `--autofix`:**
   The Python daemon is replaced by system crontab in 7.0.0. The dynos-work half — task maintenance, dashboard refresh — auto-registers itself as a crontab entry when you run `dynos init`. The autofix half is handled by the new repo's installer.

## Dashboard

The `Autofix` tab is removed. If you have an older dashboard build cached, rebuild it:

```bash
cd hooks/dashboard-ui
npm install
npm run build
```

The rebuilt dashboard no longer has the Autofix route. The new autofix repo ships its own dashboard page.

## Why the split?

- Autofix is a background-scanner concern that most foundry users don't need.
- Keeping both surfaces in one plugin meant every dynos-work user paid install cost for features they didn't use.
- Splitting lets autofix iterate on its own schedule (detector changes, LLM-review prompt tweaks) without churning the foundry plugin.
- The shared abstractions (`dynoslib_core`, `dynoevents`, `dynolineage`) stay in dynos-work; the autofix repo imports them as a dependency.

## Questions

- **"I was mid-scan when I upgraded — what happens to in-flight findings?"**
  The new repo picks up `.dynos/proactive-findings.json` as-is and continues from where you left off.

- **"Do I have to use the new autofix repo?"**
  No. `/dynos-work:maintain` still surfaces findings when invoked manually. You just don't get background scans or auto-PRs anymore unless you install the new repo.

- **"Can I go back to 6.0.0?"**
  `claude plugin install dynos-work@6.0.0` pins to the old version. Not recommended long-term — new foundry features ship against 7.0.0+.
