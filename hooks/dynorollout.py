#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parent.parent
_HOOKS_ROOT = _REPO_ROOT / "hooks"
for _path in (str(_REPO_ROOT), str(_HOOKS_ROOT)):
    if _path not in sys.path:
        sys.path.insert(0, _path)

from learn.hooks.dynorollout import *  # noqa: F401,F403


if __name__ == "__main__":
    from dyno_cli_base import cli_main

    raise SystemExit(cli_main(build_parser))
