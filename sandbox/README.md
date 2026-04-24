# sandbox/ — Calibration and Trajectory Modules

Extracted support modules used by the adaptive evaluation layer.

## What's here

| Directory | What it does |
|---|---|
| `calibration/` | Benchmark and evaluation wrappers: agent scoring, fixture management, rollout evaluation, challenge runs |
| `trajectory/` | Trajectory store: retrospective retrieval, similarity search, prior-task context |

## Usage

These modules are invoked by the hooks layer via compatibility wrappers. Direct use is for development and debugging only.

## Dependencies

Requires `hooks/` on PYTHONPATH for: `lib_core`, `lib_defaults`, `lib_trajectory`.
