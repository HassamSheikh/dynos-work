#!/usr/bin/env bash
# Test for scripts/check-renderer-drift.sh (criterion 28 / D10).
#
# Covers:
#   - scripts/check-renderer-drift.sh exists and is executable
#   - A clean-tree regen of the Claude install diffed against
#     cli/tests/fixtures/claude-parity/ exits 0 when templates + fixture are in sync.
#
# Failure modes exercised:
#   1. Script missing → test fails with clear message
#   2. Script non-executable → informative skip
#   3. Fixture missing → informative skip with pointer to seg-003 owner
#
# Exit 0 = pass.

set -u

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT="$REPO_ROOT/scripts/check-renderer-drift.sh"
FIXTURE="$REPO_ROOT/cli/tests/fixtures/claude-parity"

fail() {
  echo "[FAIL] $*"
  exit 1
}

pass() {
  echo "[PASS] $*"
}

# 1. Script must exist
if [ ! -f "$SCRIPT" ]; then
  fail "scripts/check-renderer-drift.sh missing (criterion 28)"
fi
pass "scripts/check-renderer-drift.sh exists"

# 2. Script must be executable
if [ ! -x "$SCRIPT" ]; then
  fail "scripts/check-renderer-drift.sh is not executable"
fi
pass "scripts/check-renderer-drift.sh is executable"

# 3. Fixture must exist (populated by seg-003)
if [ ! -d "$FIXTURE" ]; then
  fail "cli/tests/fixtures/claude-parity/ missing — seg-003 owns the frozen snapshot"
fi
pass "fixture directory exists"

# 4. Running the script on a clean tree must exit 0
# (It internally invokes node cli/dist/index.js init --ai claude into a tmpdir and
# diffs against the fixture.)
if ! OUT=$(bash "$SCRIPT" 2>&1); then
  echo "$OUT"
  fail "check-renderer-drift.sh reported drift on clean tree"
fi
pass "drift script exits 0 on clean regen"

exit 0
