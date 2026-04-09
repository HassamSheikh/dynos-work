# Task Pipeline

This directory groups the mission-critical task pipeline implementation.

Purpose:
- intake, planning, execution, audit, repair, and task completion
- deterministic validation and contract enforcement
- task-local artifacts and task lifecycle control

Key hook implementations live in [`tasks/hooks/`](./hooks):
- `dynosctl.py`
- `dynoplanner.py`
- `dynorouter.py`
- `dynoslib_contracts.py`
- `dynoslib_validate.py`
- `validate_task_artifacts.py`

Primary skill surface still lives in the repo-root [`skills/`](../skills) tree:
- `start`
- `execute`
- `audit`
- `status`
- `resume`
- `investigate`

Compatibility note:
- Existing plugin entrypoints remain in [`hooks/`](../hooks) as thin wrappers so current commands and hook wiring keep working.
