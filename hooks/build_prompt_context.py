#!/usr/bin/env python3
"""
Pre-load file contents into agent prompt context.

Reads each file and emits a formatted markdown block for injection into
a base prompt before inject-prompt. The agent receives file contents
upfront and does not need to call Read/Grep/Glob for them.

Usage:
  python3 hooks/build_prompt_context.py file1 file2 ...
  python3 hooks/build_prompt_context.py --root /path/to/repo file1 file2 ...
  python3 hooks/build_prompt_context.py --diff <snapshot_sha> [--root .]

Output is printed to stdout for inclusion in a base prompt.
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

# Hard caps to prevent the pre-load itself from blowing up context
_MAX_FILE_CHARS = 40_000
_MAX_TOTAL_CHARS = 150_000

_LANG: dict[str, str] = {
    ".py": "python",
    ".ts": "typescript",
    ".tsx": "tsx",
    ".js": "javascript",
    ".jsx": "jsx",
    ".md": "markdown",
    ".json": "json",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".sh": "bash",
    ".bash": "bash",
    ".sql": "sql",
    ".html": "html",
    ".css": "css",
    ".toml": "toml",
    ".txt": "",
}


def _lang(suffix: str) -> str:
    return _LANG.get(suffix.lower(), "")


def _read_file(path: Path) -> str:
    if not path.exists():
        return "*(file does not exist yet — create it)*"
    try:
        content = path.read_text(errors="replace")
    except OSError as e:
        return f"*(could not read: {e})*"
    if len(content) > _MAX_FILE_CHARS:
        content = content[:_MAX_FILE_CHARS] + f"\n\n... [truncated at {_MAX_FILE_CHARS} chars]"
    return content


def build_file_context(files: list[str], root: Path) -> str:
    if not files:
        return ""

    blocks: list[str] = []
    total = 0

    for filepath in files:
        p = Path(filepath)
        if not p.is_absolute():
            p = (root / filepath).resolve()
        content = _read_file(p)
        lang = _lang(p.suffix)
        block = f"### `{filepath}`\n\n```{lang}\n{content}\n```\n"
        if total + len(block) > _MAX_TOTAL_CHARS:
            blocks.append(f"### `{filepath}`\n\n*(omitted — total pre-load limit reached)*\n")
            break
        blocks.append(block)
        total += len(block)

    header = (
        "## Pre-loaded File Contents\n\n"
        "The following files are pre-loaded in full. "
        "Do NOT call Read, Grep, or Glob for these files — use the content below directly. "
        "This eliminates unnecessary tool calls and keeps your context small.\n\n"
    )
    return header + "\n".join(blocks)


def build_diff_context(snapshot_sha: str, root: Path) -> str:
    try:
        result = subprocess.run(
            ["git", "-C", str(root), "diff", "--name-only", "--diff-filter=AMRD", snapshot_sha],
            capture_output=True, text=True, check=True,
        )
        changed = [f.strip() for f in result.stdout.splitlines() if f.strip()]
    except subprocess.CalledProcessError:
        return ""

    if not changed:
        return ""

    try:
        diff_result = subprocess.run(
            ["git", "-C", str(root), "diff", snapshot_sha, "--", *changed],
            capture_output=True, text=True, check=True,
        )
        diff_text = diff_result.stdout
    except subprocess.CalledProcessError:
        diff_text = ""

    blocks: list[str] = []

    # Include the unified diff if not too large
    if diff_text and len(diff_text) <= _MAX_TOTAL_CHARS // 2:
        blocks.append("### Unified Diff\n\n```diff\n" + diff_text[:_MAX_FILE_CHARS] + "\n```\n")

    # Include current content of each changed file
    total = sum(len(b) for b in blocks)
    for filepath in changed:
        p = (root / filepath).resolve()
        if not p.exists():
            continue
        content = _read_file(p)
        lang = _lang(p.suffix)
        block = f"### `{filepath}` (current)\n\n```{lang}\n{content}\n```\n"
        if total + len(block) > _MAX_TOTAL_CHARS:
            break
        blocks.append(block)
        total += len(block)

    if not blocks:
        return ""

    header = (
        "## Pre-loaded Diff Context\n\n"
        f"Changed files since snapshot `{snapshot_sha[:12]}`: "
        + ", ".join(f"`{f}`" for f in changed)
        + ".\n\n"
        "These files are pre-loaded below. "
        "Do NOT call Read, Grep, or Glob for files listed above — use the content here directly.\n\n"
    )
    return header + "\n".join(blocks)


def main() -> None:
    parser = argparse.ArgumentParser(description="Build pre-loaded file context for agent prompts")
    parser.add_argument("files", nargs="*", help="File paths to pre-load")
    parser.add_argument("--root", default=".", help="Repo root (default: cwd)")
    parser.add_argument("--diff", metavar="SHA", help="Pre-load files changed since this git SHA")
    args = parser.parse_args()

    root = Path(args.root).resolve()

    if args.diff:
        print(build_diff_context(args.diff, root))
    elif args.files:
        print(build_file_context(args.files, root))
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
