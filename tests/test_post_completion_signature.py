"""Tests for receipt_post_completion signature shape (AC 20)."""
from __future__ import annotations

import inspect
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "hooks"))

from lib_receipts import receipt_post_completion  # noqa: E402


def test_signature_only_has_task_dir_and_handlers_run():
    params = inspect.signature(receipt_post_completion).parameters
    assert set(params.keys()) == {"task_dir", "handlers_run"}


def test_postmortem_written_param_removed():
    params = inspect.signature(receipt_post_completion).parameters
    assert "postmortem_written" not in params


def test_patterns_updated_param_removed():
    params = inspect.signature(receipt_post_completion).parameters
    assert "patterns_updated" not in params
