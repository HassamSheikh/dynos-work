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
  python3 hooks/build_prompt_context.py --task-dir .dynos/task-{id} [--root .]

Output is printed to stdout for inclusion in a base prompt. The
``--task-dir`` form reads ``manifest.snapshot.head_sha`` and is
preferred over ``--diff`` because it eliminates the SHA-handling
failure mode (an abbreviated/wrong SHA passed to ``--diff`` produced
a 1-byte sidecar silently).
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

# PRO-007: pin python3/git binaries to absolute paths resolved at import time
# so PATH-shadowing cannot substitute a malicious binary. Mirrors hooks/worktree.py
# and hooks/daemon.py.
_PYTHON3: str = shutil.which("python3") or sys.executable
_GIT: str | None = shutil.which("git")

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
            [_GIT or "git", "-C", str(root), "diff", "--name-only", "--diff-filter=AMRD", snapshot_sha],
            capture_output=True, text=True, check=True,
        )
        changed = [f.strip() for f in result.stdout.splitlines() if f.strip()]
    except subprocess.CalledProcessError:
        return ""

    if not changed:
        return ""

    try:
        diff_result = subprocess.run(
            [_GIT or "git", "-C", str(root), "diff", snapshot_sha, "--", *changed],
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


def _resolve_task_dir_snapshot(task_dir: Path) -> str:
    """Read manifest.snapshot.head_sha from a task dir and return it.

    Raises ValueError when the manifest is absent / unreadable / lacks a
    snapshot. The error message names the exact path so the operator can
    fix the inputs without spelunking. Eliminates the abbreviated-SHA
    failure mode of --diff because the SHA is read directly from the
    state-machine's authoritative record rather than typed by hand.
    """
    import json as _json
    manifest_path = task_dir / "manifest.json"
    if not manifest_path.is_file():
        raise ValueError(f"manifest.json not found at {manifest_path}")
    try:
        manifest = _json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise ValueError(f"failed to read {manifest_path}: {exc}") from exc
    snapshot = manifest.get("snapshot") if isinstance(manifest, dict) else None
    if not isinstance(snapshot, dict):
        raise ValueError(
            f"{manifest_path} has no `snapshot` field — run "
            "`ctl record-snapshot` before invoking --task-dir"
        )
    head_sha = snapshot.get("head_sha")
    if not isinstance(head_sha, str) or not head_sha.strip():
        raise ValueError(
            f"{manifest_path}.snapshot.head_sha is empty or missing"
        )
    return head_sha.strip()


def main() -> None:
    parser = argparse.ArgumentParser(description="Build pre-loaded file context for agent prompts")
    parser.add_argument("files", nargs="*", help="File paths to pre-load")
    parser.add_argument("--root", default=".", help="Repo root (default: cwd)")
    parser.add_argument("--diff", metavar="SHA", help="Pre-load files changed since this git SHA")
    parser.add_argument(
        "--task-dir",
        metavar="PATH",
        default=None,
        help=(
            "Pre-load files changed since the snapshot recorded in "
            "PATH/manifest.json. Reads `snapshot.head_sha` from the "
            "manifest — preferred over --diff for residual-drain "
            "workflows because it removes the SHA-handling failure "
            "mode (abbreviated/wrong SHAs passed to --diff produced "
            "a 1-byte sidecar silently)."
        ),
    )
    parser.add_argument(
        "--sidecar",
        metavar="PATH",
        default=None,
        help=(
            "Write context to PATH instead of stdout. Stdout receives a "
            "short pointer line referencing the path. The audit-skill "
            "orchestrator should use this so the auditor's base prompt "
            "carries the path (~80 bytes) instead of the full 150K-char "
            "blob, and each auditor reads the file with one Read call. "
            "Stops the (auditors x cascade-models x context-size) "
            "input-token multiplication that the 2026-04-30 latency "
            "investigation flagged."
        ),
    )
    args = parser.parse_args()

    root = Path(args.root).resolve()

    # --task-dir and --diff are mutually exclusive. If both are passed,
    # --task-dir wins (it's the authoritative source of the snapshot
    # SHA) and --diff is silently ignored.
    if args.task_dir:
        task_dir_path = Path(args.task_dir)
        if not task_dir_path.is_absolute():
            task_dir_path = (root / task_dir_path).resolve()
        try:
            sha_from_manifest = _resolve_task_dir_snapshot(task_dir_path)
        except ValueError as exc:
            print(f"build_prompt_context: {exc}", file=sys.stderr)
            sys.exit(1)
        content = build_diff_context(sha_from_manifest, root)
    elif args.diff:
        content = build_diff_context(args.diff, root)
    elif args.files:
        content = build_file_context(args.files, root)
    else:
        parser.print_help()
        sys.exit(1)

    if args.sidecar:
        sidecar_path = Path(args.sidecar)
        try:
            sidecar_path.parent.mkdir(parents=True, exist_ok=True)
            # Match stdout-mode trailing newline so sidecar content is
            # byte-identical to what `python3 build_prompt_context.py ...`
            # would have printed without --sidecar.
            sidecar_path.write_text(content + "\n", encoding="utf-8")
        except OSError as exc:
            print(f"build_prompt_context: failed to write sidecar {sidecar_path}: {exc}", file=sys.stderr)
            sys.exit(1)
        # Emit a minimal pointer so callers can pipe stdout into a prompt
        # without dragging the full content along.
        print(f"Context written to {sidecar_path}. Read it once at the start of your work.")
    else:
        print(content)


if __name__ == "__main__":
    main()
