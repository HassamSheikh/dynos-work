#!/usr/bin/env python3
"""Validate dynos-work task artifacts deterministically.

Usage:
  python3 hooks/validate_task_artifacts.py .dynos/task-YYYYMMDD-NNN
"""

from __future__ import annotations
import sys as _sys; _sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent))

import sys
from pathlib import Path

from dynoslib import validate_task_artifacts


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__.strip())
        return 2

    task_dir = Path(sys.argv[1]).resolve()
    errors = validate_task_artifacts(task_dir, strict=True)
    if errors:
        print("Artifact validation failed:")
        for error in errors:
            print(f"- {error}")
        return 1

    print(f"Artifact validation passed for {task_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
