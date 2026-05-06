"""Spawn-budget pause/resume receipt writers.

Each function in this module writes a structured JSON receipt for a
spawn-budget pipeline event:

* ``receipt_spawn_budget_paused`` proves the spawn-budget gate fired
  (auditor-spawn count crossed the threshold for the task class) and
  records the contributing-auditor list, threshold, and exempt count
  that justified the pause.

* ``receipt_spawn_budget_resumed`` proves a paused budget was deliberately
  resumed and records the human/operational reason.

The counts/threshold/exempt_count fields ARE caller-supplied here — they
are derived by ``cmd_check_spawn_budget`` at the call site, not by this
writer. The writer only stamps a timestamp via ``now_iso()`` and
forwards the contract version. See spec.md AC-6 for the exact payload
shape contract.
"""

from __future__ import annotations

from pathlib import Path

from lib_core import now_iso

from .core import (
    RECEIPT_CONTRACT_VERSION,
    write_receipt,
)


def receipt_spawn_budget_paused(
    task_dir: Path,
    *,
    count: int,
    threshold: int,
    exempt_count: int,
    task_class: str,
    contributing_auditors: list[str],
) -> Path:
    """Write receipt proving the spawn-budget gate paused auditor spawning.

    Writes ``receipts/spawn-budget-paused.json``. Step name:
    ``"spawn-budget-paused"``.

    Payload (every field forwarded verbatim — caller-derived):
      - contract_version:       ``RECEIPT_CONTRACT_VERSION`` (injected by
                                ``write_receipt`` from this kwarg)
      - count:                  current auditor-spawn count for the task
      - threshold:              configured threshold for ``task_class``
      - exempt_count:           count of exempt auditors (excluded from the
                                budget calculation)
      - task_class:             classification key used to look up the
                                threshold
      - contributing_auditors:  list of auditor names that contributed to
                                ``count`` (must be a list of strings)
      - paused_at:              ``now_iso()`` timestamp

    Returns the path to the written receipt.
    """
    return write_receipt(
        task_dir,
        "spawn-budget-paused",
        contract_version=RECEIPT_CONTRACT_VERSION,
        count=count,
        threshold=threshold,
        exempt_count=exempt_count,
        task_class=task_class,
        contributing_auditors=list(contributing_auditors),
        paused_at=now_iso(),
    )


def receipt_spawn_budget_resumed(
    task_dir: Path,
    *,
    reason: str,
) -> Path:
    """Write receipt proving a paused spawn-budget was resumed.

    Writes ``receipts/spawn-budget-resumed.json``. Step name:
    ``"spawn-budget-resumed"``.

    Payload:
      - contract_version: ``RECEIPT_CONTRACT_VERSION``
      - reason:           operator-supplied rationale for resuming
      - resumed_at:       ``now_iso()`` timestamp

    Returns the path to the written receipt.
    """
    return write_receipt(
        task_dir,
        "spawn-budget-resumed",
        contract_version=RECEIPT_CONTRACT_VERSION,
        reason=reason,
        resumed_at=now_iso(),
    )
