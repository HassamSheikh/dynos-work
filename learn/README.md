# Learning Pipeline

This directory groups the adaptive learning pipeline implementation.

Purpose:
- retrospective aggregation and trajectory memory
- learned agent generation and evaluation
- benchmark, rollout, and challenger automation
- postmortem and improvement loops

Key hook implementations live in [`learn/hooks/`](./hooks):
- `dynopatterns.py`
- `dynoevolve.py`
- `dynoeval.py`
- `dynogenerate.py`
- `dynostate.py`
- `dynostrajectory.py`
- `dynosdream.py`
- `dynobench.py`
- `dynorollout.py`
- `dynochallenge.py`
- `dynofixture.py`
- `dynoauto.py`
- `dynoslib_qlearn.py`
- `dynopostmortem.py`
- `dynopostmortem_improve.py`

Primary skill surface still lives in the repo-root [`skills/`](../skills) tree:
- `learn`
- `evolve`
- `trajectory`
- `founder`

Compatibility note:
- Existing plugin entrypoints remain in [`hooks/`](../hooks) as thin wrappers so current commands and hook wiring keep working.
