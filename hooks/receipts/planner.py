"""Planner / plan-audit / TDD spawn-receipt writers.

Each function in this module writes a structured JSON receipt for a
planner-related skill spawn (planner discovery/spec/plan, plan-audit
check, TDD test generation). Function bodies are copied byte-for-byte
from ``hooks/lib_receipts.py`` during the receipts package split — see
``hooks/receipts/__init__.py`` for the public re-export surface.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from lib_log import log_event
from lib_validate import require_nonblank_str

from .core import (
    INJECTED_PLANNER_PROMPTS_DIR,
    _record_tokens,
    hash_file,
    write_receipt,
)


_INJECTED_PROMPT_SHA256_MISSING = object()


def receipt_planner_spawn(  # called dynamically from skills/start/SKILL.md
    task_dir: Path,
    phase: str,  # "discovery", "spec", or "plan"
    tokens_used: int,
    model_used: str | None = None,
    agent_name: str | None = None,
    injected_prompt_sha256: str = _INJECTED_PROMPT_SHA256_MISSING,  # type: ignore[assignment]
) -> Path:
    """Write receipt proving a planner subagent completed. Also records tokens.

    SEC-004 hardening: ``injected_prompt_sha256`` is REQUIRED at the call
    site. Omitting the kwarg entirely raises ``TypeError`` (the sentinel
    default is a deliberate forced-kwarg pattern so a forgotten sidecar
    assertion cannot silently ship). Passing ``injected_prompt_sha256=None``
    explicitly is ALSO rejected — ``None`` is no longer a legal value and
    raises ``ValueError`` with a message containing the substring
    ``legacy None path removed``. The only valid value is a non-empty
    sha256 hex digest captured from
    ``hooks/router.py planner-inject-prompt --task-id <id> --phase <phase>``.

    The writer asserts that the per-phase planner injected-prompt sidecar
    at ``task_dir / "receipts" / INJECTED_PLANNER_PROMPTS_DIR /
    f"{phase}.sha256"`` exists AND its contents (after stripping trailing
    whitespace) match the supplied digest. On missing file or mismatch
    this function raises ``ValueError`` naming the phase. The mismatch
    message contains the literal substring ``hash mismatch`` so
    downstream tests can pin it.

    The sidecar path is
    ``task_dir/receipts/_injected-planner-prompts/{phase}.sha256`` — both
    writer and reader import the directory name from
    ``INJECTED_PLANNER_PROMPTS_DIR`` so the schema is defined in exactly
    one place. The sidecar itself is written by the
    ``planner-inject-prompt`` CLI subcommand in ``hooks/router.py``.
    """
    if injected_prompt_sha256 is _INJECTED_PROMPT_SHA256_MISSING:
        raise TypeError(
            "receipt_planner_spawn: injected_prompt_sha256 is required. "
            "Pass a non-empty sha256 hex digest obtained from "
            "`hooks/router.py planner-inject-prompt --task-id <id> "
            "--phase <phase>`. The None (no-sidecar) path has been removed."
        )
    if injected_prompt_sha256 is None:
        raise ValueError(
            "injected_prompt_sha256 must be a non-empty sha256 hex string; "
            "legacy None path removed"
        )
    # v4 AC 13: tokens_used MUST be a non-negative int. zero is accepted
    # (signals a free / cached planner invocation) but emits a telemetry
    # event so the anomaly surfaces in retrospectives.
    if not isinstance(tokens_used, int) or isinstance(tokens_used, bool) or tokens_used < 0:
        raise ValueError(
            f"receipt_planner_spawn: tokens_used must be non-negative int "
            f"(got {tokens_used!r})"
        )
    step_name = f"planner-{phase}"

    # Sidecar assertion — unconditional now. Every caller must first run
    # `hooks/router.py planner-inject-prompt` and pass the captured digest.
    require_nonblank_str(
        injected_prompt_sha256,
        field_name="receipt_planner_spawn: injected_prompt_sha256",
    )
    sidecar_file = (
        task_dir / "receipts" / INJECTED_PLANNER_PROMPTS_DIR
        / f"{phase}.sha256"
    )
    if not sidecar_file.exists():
        raise ValueError(
            f"receipt_planner_spawn: planner sidecar missing for phase "
            f"{phase!r} at {sidecar_file}. Run `hooks/router.py "
            f"planner-inject-prompt --task-id <id> --phase {phase}` first."
        )
    try:
        on_disk = sidecar_file.read_text().strip()
    except OSError as e:
        raise ValueError(
            f"receipt_planner_spawn: planner sidecar unreadable for "
            f"phase {phase!r} at {sidecar_file}: {e}"
        ) from e
    if on_disk != injected_prompt_sha256:
        raise ValueError(
            f"receipt_planner_spawn: hash mismatch for phase {phase!r} "
            f"— sidecar={on_disk!r}, payload={injected_prompt_sha256!r}."
        )

    if tokens_used > 0:
        _record_tokens(task_dir, f"planner-{phase}", model_used or "default", tokens_used)
    else:
        # Zero-token planner spawn is a diagnostic signal: emit an event
        # so retrospectives can flag suspected cache-hits, handler
        # stubs, or upstream attribution drift without failing the write.
        root = task_dir.parent.parent
        log_event(
            root,
            "planner_spawn_zero_tokens",
            task=task_dir.name,
            phase=phase,
        )
    return write_receipt(
        task_dir,
        step_name,
        phase=phase,
        tokens_used=tokens_used,
        model_used=model_used,
        agent_name=agent_name,
        injected_prompt_sha256=injected_prompt_sha256,
    )


def receipt_plan_audit(
    task_dir: Path,
    tokens_used: int,
    model_used: str | None = None,
    **_legacy: Any,
) -> Path:
    """Write receipt proving plan audit (spec-completion check) ran.

    Hash-binding (SEC-004 + F2): the writer re-hashes ``spec.md``,
    ``plan.md``, and ``execution-graph.json`` from the task directory at
    write time. Those sha256 hex digests are embedded in the receipt
    payload so the PLAN_AUDIT exit gate can detect artifact drift via
    ``plan_audit_matches(task_dir)`` and refuse to advance when the audit
    was computed over a stale version of the artifacts.

    Callers no longer supply the three hashes (breaking change vs. the
    initial F2 signature). Closes the TOCTOU between a caller's
    hash-read and the receipt write — the writer's own read is the
    authoritative source. Missing artifact files land the literal
    string ``missing`` in the corresponding payload slot, which always
    fails ``plan_audit_matches`` downstream with a distinctive drift
    reason.

    v4 AC 14 (task-007): ``finding_count`` has been removed from the
    signature and the receipt payload. Callers that still pass it raise
    ``TypeError`` — the plan-audit result is surfaced via dedicated audit
    receipts, not embedded in this spawn receipt. ``tokens_used`` must
    be a non-negative int.

    Also records token usage to ``token-usage.json`` when ``tokens_used``
    is positive.
    """
    if _legacy:
        raise TypeError(
            "receipt_plan_audit no longer accepts caller-supplied "
            f"{sorted(_legacy)} — finding_count was removed from the v4 "
            "plan-audit receipt payload"
        )
    if not isinstance(tokens_used, int) or isinstance(tokens_used, bool) or tokens_used < 0:
        raise ValueError(
            f"receipt_plan_audit: tokens_used must be non-negative int "
            f"(got {tokens_used!r})"
        )

    def _hash_or_missing(rel: str) -> str:
        p = task_dir / rel
        if not p.exists():
            return "missing"
        try:
            return hash_file(p)
        except OSError:
            return "missing"

    spec_sha256 = _hash_or_missing("spec.md")
    plan_sha256 = _hash_or_missing("plan.md")
    graph_sha256 = _hash_or_missing("execution-graph.json")

    if tokens_used > 0:
        _record_tokens(task_dir, "plan-audit-check", model_used or "default", tokens_used)
    return write_receipt(
        task_dir,
        "plan-audit-check",
        tokens_used=tokens_used,
        model_used=model_used,
        spec_sha256=spec_sha256,
        plan_sha256=plan_sha256,
        graph_sha256=graph_sha256,
    )


def receipt_tdd_tests(
    task_dir: Path,
    test_file_paths: list[str],
    tests_evidence_sha256: str,
    tokens_used: int,
    model_used: str,
) -> Path:
    """Write receipt proving TDD tests were generated.

    Also records token usage. Validates inputs strictly: paths must be a
    list of strings, the evidence digest must be non-empty.
    """
    if not isinstance(test_file_paths, list) or not all(
        isinstance(p, str) for p in test_file_paths
    ):
        raise ValueError("test_file_paths must be a list[str]")
    require_nonblank_str(tests_evidence_sha256, field_name="tests_evidence_sha256")
    if not isinstance(tokens_used, int) or tokens_used < 0:
        raise ValueError("tokens_used must be a non-negative int")
    require_nonblank_str(model_used, field_name="model_used")

    if tokens_used > 0:
        _record_tokens(task_dir, "tdd-tests", model_used, tokens_used)

    return write_receipt(
        task_dir,
        "tdd-tests",
        test_file_paths=test_file_paths,
        tests_evidence_sha256=tests_evidence_sha256,
        tokens_used=tokens_used,
        model_used=model_used,
    )
