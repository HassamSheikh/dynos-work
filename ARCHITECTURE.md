# Architecture

This document is for contributors working on `dynos-work` itself.

It explains where behavior lives, how the runtime is split, and what design constraints matter when changing the system.

## Architecture Summary

`dynos-work` is built from three cooperating layers:

1. Workflow skills and agent definitions
2. Deterministic runtime control
3. Adaptive evaluation and observability

The core rule of the repo is:

> prompts can suggest behavior, but runtime code should enforce invariants

That rule is what separates the public workflow from the internal control plane.

## Layer 1: Skills And Agents

The workflow surface lives under:

- `skills/`
- `agents/`

User-facing skills (invoked directly via `/dynos-work:<name>`):

- `start` — discovery, spec, plan, approval
- `execute` — run the approved plan
- `audit` — verify, repair, close
- `investigate` — deep bug investigation with root cause analysis
- `maintain` — trigger a manual maintenance cycle
- `status` — show current task state
- `resume` — continue interrupted work
- `dashboard` — generate/serve the project dashboard

Internal skills (spawned by the system, not invoked directly by users):

- `plan` — planner subagent spawned by `start`
- `execution` — execution coordinator subagent
- `repair` — repair executor subagent
- `calibration` — learned agent lifecycle management
- `global`, `local`, `init`, `register`, `list`, `memory`, `trajectory`, `dry-run` — system maintenance and CLI support

Agent markdown files define specialist roles: planners, executors, auditors, and the repair coordinator.

Guideline:

- Use skills and agent docs to describe behavior, sequencing, and user-facing policy.
- Do not rely on markdown alone for safety-critical guarantees.

If a rule must be true regardless of model behavior, it belongs in runtime code.

## Layer 2: Deterministic Runtime

The runtime lives primarily in:

- `hooks/lib_core.py` — stage definitions, legal transitions, `transition_task()`, receipt gates
- `hooks/lib_validate.py` — task artifact validation, retrospective scoring, gap analysis
- `hooks/lib_receipts.py` — all receipt writers and readers
- `hooks/ctl.py` — control CLI: validation, transitions, next-command resolution, ownership checks
- `hooks/validate_task_artifacts.py` — plan and execution-graph artifact validation entrypoint

`hooks/lib.py` is a thin re-export facade that forwards to the above modules for import-path compatibility. Read the implementation in `lib_core.py`, `lib_validate.py`, or `lib_receipts.py` directly rather than stopping at the facade.

Design rule:

- reusable logic belongs in `lib_core.py` or `lib_validate.py`
- narrow operator entrypoints belong in small CLIs under `hooks/`

Avoid putting non-trivial policy directly into multiple scripts. Centralize it in the shared library.

### Scheduler Scope

The scheduler currently owns only the `SPEC_REVIEW` → `PLANNING` edge. All other stage transitions are driven by skill markdown invoking deterministic `ctl.py` subprocess commands — for example `python3 hooks/ctl.py transition` and `python3 hooks/ctl.py approve-stage`. Skills never call `transition_task()` directly; they always go through `ctl.py`. This keeps the control-plane surface narrow and ensures every transition passes through the same validator.

### Compatibility Wrappers

Approximately 22 files under `hooks/` are thin forwarding stubs. Their implementations have moved into `memory/`, `telemetry/`, or `sandbox/`. Each stub carries a docstring like `Compatibility wrapper — implementation moved to memory/postmortem.py`. When reading code under `hooks/`, follow the import into the target package for the real implementation rather than stopping at the stub.

## Layer 3: Adaptive Evaluation

The adaptive layer is split across three packages: `memory/`, `telemetry/`, and `sandbox/`. Many files in `hooks/` are thin compatibility wrappers that forward to one of these three packages — see the Compatibility Wrappers note in Layer 2.

### Memory Package

The `memory/` package owns learning and postmortem logic:

- `memory/lib_qlearn.py` — Q-learning repair policy
- `memory/policy_engine.py` — EMA effectiveness scoring for learned policies
- `memory/postmortem.py`, `memory/postmortem_analysis.py`, `memory/postmortem_improve.py` — postmortem extraction and improvement loops
- `memory/agent_generator.py` — learned agent synthesis

These implement the durable memory substrate that informs future planning and repair.

### Telemetry Package

The `telemetry/` package owns observability surfaces:

- `telemetry/dashboard.py` — per-project dashboard artifacts and serving
- `telemetry/lineage.py` — lineage graph output
- `telemetry/global_dashboard.py` — cross-project dashboard aggregation
- `telemetry/global_stats.py` — anonymous aggregate statistics

These provide machine-readable status, lineage graphs, and real-time dashboard artifacts.

### Hooks Package (Remaining Adaptive Pieces)

The following `hooks/` modules are compatibility wrappers forwarding to `sandbox/`:

- `hooks/trajectory.py` — trajectory retrieval (→ `sandbox/trajectory/`)
- `hooks/eval.py` — evaluation entrypoint (→ `sandbox/calibration/`)
- `hooks/bench.py`, `hooks/rollout.py`, `hooks/challenge.py`, `hooks/fixture.py` — fixtures, benchmarks, rollouts, challenger runs (→ `sandbox/calibration/`)
- `hooks/route.py`, `hooks/auto.py` — route resolution and automation priority (→ `sandbox/calibration/`)

The following `hooks/` modules are compatibility wrappers forwarding to `telemetry/`:

- `hooks/lineage.py` → `telemetry/lineage.py`
- `hooks/dashboard.py` → `telemetry/dashboard.py`

The following `hooks/` module has its own implementation:

- `hooks/report.py` — compact runtime observability report (not a wrapper)

## Data Model

### Task State

Task state lives in `.dynos/task-*/`.

Important files:

- `manifest.json`
- `spec.md`
- `plan.md`
- `execution-graph.json`
- `execution-log.md`
- `repair-log.json`
- `task-retrospective.json`

### Learned State

Learned state lives under:

- `.dynos/learned-agents/registry.json`
- `.dynos/trajectories.json`
- `.dynos/benchmarks/history.json`
- `.dynos/benchmarks/index.json`
- `.dynos/automation/queue.json`
- `.dynos/automation/status.json`
- `.dynos/policy.json`

### Dashboard State

The dashboard consumes:

- `.dynos/dashboard-data.json`
- `.dynos/dashboard.html`

## Invariants

When contributing, preserve these invariants:

### Task Safety

- Illegal stage transitions must fail.
- Malformed task artifacts must not silently advance.
- Execution graph cycles and uncovered criteria must be rejected.
- Segment ownership must stay enforceable.

### Learned Routing Safety

- New learned components start in `shadow`.
- Promotion must depend on benchmark evidence.
- Must-pass regressions must block promotion.
- Active regressions must be able to demote routes.
- Stale learned routes must not silently stay active forever.

### User Control

- Human approval gates should remain explicit at spec and plan boundaries.
- Learned behavior should optimize choices inside guardrails, not redefine guardrails.

## Multi-Project Architecture

### Global vs Local State

`dynos-work` separates state into two scopes:

**Local state** (`.dynos/` inside each project):
- Task directories, manifests, specs, plans, execution graphs
- Trajectories and retrospectives
- Learned agents and registry
- Benchmarks, automation queues, dashboard artifacts
- Policy overrides

**Global state** (`~/.dynos/`):
- `registry.json`: the project registry
- `global.log`: daemon activity log
- `daemon.pid`: PID file for the background daemon
- Aggregated anonymous statistics
- Portable prevention rules collected across projects

### What Is Shared Across Projects

The global daemon shares only:

- Anonymous aggregate statistics (task counts, success rates, timing distributions)
- Portable prevention rules (patterns that caused failures, stripped of project-specific context)

The global daemon does **not** share:

- File paths or directory structures
- Task content, specs, plans, or execution graphs
- Learned agents or skills
- Project-specific patterns, trajectories, or retrospectives
- Credentials or environment variables

This boundary is enforced by design: the daemon reads local `.dynos/` state but writes cross-project outputs only to `~/.dynos/` in anonymized form.

### Registry Schema

The registry lives at `~/.dynos/registry.json`:

```json
{
  "projects": [
    {
      "path": "/absolute/path/to/project",
      "registered_at": "2026-04-03T12:00:00Z",
      "last_active_at": "2026-04-03T14:30:00Z",
      "status": "active"
    }
  ]
}
```

Each entry tracks:

- `path`: absolute filesystem path to the project root
- `registered_at`: ISO timestamp of first registration
- `last_active_at`: ISO timestamp of last activity (updated on registration, resume, or set-active)
- `status`: one of `active` or `paused`

### Daemon Lifecycle

The global daemon follows this loop:

1. **Start**: `daemon.py start` forks a background process, writes `~/.dynos/daemon.pid`
2. **Run loop**: the daemon iterates over all registered projects in `registry.json`
3. **Per-project maintenance**: for each active project, run a maintenance cycle (validation sweeps, stale route checks, automation queue processing)
4. **Backoff for idle projects**: projects whose `last_active_at` is old receive exponential backoff, so the daemon spends less time on dormant repos
5. **Cross-project aggregation**: after visiting all projects, aggregate anonymous stats and update portable prevention rules in `~/.dynos/`
6. **Sleep**: wait for the configured interval before repeating

The daemon can be stopped with `daemon.py stop`, which sends SIGTERM to the PID in the pidfile. `daemon.py run-once` executes a single sweep without looping.

### Runtime Files

| File | Purpose |
|---|---|
| `hooks/daemon.py` | Global daemon: start, stop, status, run-loop, run-once |
| `hooks/registry.py` | Registry CLI: register, unregister, list, status, pause, resume, set-active |

Both tools expose `--help` for all subcommands.

## Extension Guidelines

### When Adding A New Runtime Script

Ask:

1. Is this enforcing an invariant?
2. Does this belong as shared logic in `lib_core.py` or `lib_validate.py` first?
3. Does it need tests covering both happy and blocking paths?
4. Does it create or mutate `.dynos/` state that should be documented?

### When Changing Skills

Ask:

1. Is this user-facing workflow guidance or runtime enforcement?
2. If it is enforcement, should it move to code?
3. Does the skill still describe what the runtime actually does?

### When Changing Learned Policy

Ask:

1. Does this increase auditability or reduce it?
2. Can it regress silently?
3. Does it need a benchmark or freshness policy update?
4. Should route resolution change, or only evaluation behavior?

## Testing Strategy

Current automated coverage lives mainly in:

- `tests/test_ctl.py`
- `tests/test_learning_runtime.py`

Contributors should add tests whenever changing:

- stage control
- validation logic
- benchmark scoring
- promotion or demotion policy
- auto queueing behavior
- dashboard or lineage outputs

Preferred pattern:

- add small deterministic fixtures
- assert on JSON outputs
- avoid tests that depend on network or host-specific setup

## Recommended Reading Order

For contributors, the best order is:

1. `README.md`
2. `PIPELINES.md`
3. `INTERNALS.md`
4. `skills/start/SKILL.md`
5. `skills/execute/SKILL.md`
6. `skills/audit/SKILL.md`
7. `hooks/lib_core.py`
8. `hooks/lib_validate.py`
9. `hooks/ctl.py`
10. `tests/test_learning_runtime.py`

## Contributor Principle

If you are deciding whether a rule belongs in a prompt or in code, bias toward code.

If you are deciding whether a learned behavior should be trusted by default, bias toward shadow mode.
