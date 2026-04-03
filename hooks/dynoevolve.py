#!/usr/bin/env python3
"""Learned-agent registry management for dynos-work."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from dynoslib import ensure_learned_registry, register_learned_agent


def cmd_init(args: argparse.Namespace) -> int:
    registry = ensure_learned_registry(Path(args.root).resolve())
    print(json.dumps(registry, indent=2))
    return 0


def cmd_register(args: argparse.Namespace) -> int:
    registry = register_learned_agent(
        Path(args.root).resolve(),
        agent_name=args.agent_name,
        role=args.role,
        task_type=args.task_type,
        path=args.path,
        generated_from=args.generated_from,
        item_kind=args.item_kind,
    )
    print(json.dumps(registry, indent=2))
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    init_parser = subparsers.add_parser("init-registry", help="Create learned-agent registry if missing")
    init_parser.add_argument("--root", default=".")
    init_parser.set_defaults(func=cmd_init)

    register_parser = subparsers.add_parser("register-agent", help="Register a learned agent in shadow mode")
    register_parser.add_argument("agent_name")
    register_parser.add_argument("role")
    register_parser.add_argument("task_type")
    register_parser.add_argument("path")
    register_parser.add_argument("generated_from")
    register_parser.add_argument("--item-kind", choices=["agent", "skill"], default="agent")
    register_parser.add_argument("--root", default=".")
    register_parser.set_defaults(func=cmd_register)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
