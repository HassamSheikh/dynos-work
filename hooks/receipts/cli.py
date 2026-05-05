"""Receipt-chain CLI entry points.

Command-line wrappers that operate on the receipt chain stored under a
task directory. Function bodies are copied byte-for-byte from
``hooks/lib_receipts.py`` during the receipts package split — see
``hooks/receipts/__init__.py`` for the public re-export surface.

``cmd_validate_chain`` is intentionally *not* part of the public
``__all__`` — it was never exported by ``lib_receipts`` either.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from .core import validate_chain


def cmd_validate_chain(args: Any) -> int:
    """CLI: validate the receipt chain for a task."""
    task_dir = Path(args.task_dir).resolve()
    gaps = validate_chain(task_dir)
    if gaps:
        print(f"Receipt chain gaps ({len(gaps)}):")
        for gap in gaps:
            print(f"  ✗ {gap}")
        return 1
    print("Receipt chain complete — all required receipts present.")
    return 0
