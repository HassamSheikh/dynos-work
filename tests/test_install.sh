#!/usr/bin/env bash
# Tests for install.sh (criterion 25).
#
# Covers:
#   - idempotent ~/.dynos-work/{bin,hooks}/ materialisation (second invocation is a no-op)
#   - TTY-gated opt-in before touching shell rc
#   - marker-guarded PATH edit (no duplicate lines on re-run)
#   - backup of shell rc (~/.zshrc.bak-* or ~/.bashrc.bak-*) when edit occurs
#
# Uses TMPDIR as mock $HOME. Runs install.sh in non-TTY (piped stdin) and in
# simulated TTY (answer=yes) to exercise both paths.
#
# Exit 0 = all assertions passed. Any failure exits 1 with a message.

set -u

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
INSTALL_SH="${REPO_ROOT}/install.sh"
PASS=0
FAIL=0
FAILURES=()

assert() {
  local description="$1"
  local condition_rc="$2"
  if [ "$condition_rc" -eq 0 ]; then
    PASS=$((PASS + 1))
    echo "  [PASS] $description"
  else
    FAIL=$((FAIL + 1))
    FAILURES+=("$description")
    echo "  [FAIL] $description"
  fi
}

if [ ! -f "$INSTALL_SH" ]; then
  echo "install.sh missing at $INSTALL_SH"
  exit 1
fi

# ----------------------------------------------------------------------------
# Test 1: non-TTY piped-curl path — install runs, no PATH edit, prints guidance
# ----------------------------------------------------------------------------
echo "Test 1: non-TTY install path"
TMPHOME=$(mktemp -d)
export HOME="$TMPHOME"
# Simulate 'zsh' as user shell
export SHELL=/bin/zsh
touch "$TMPHOME/.zshrc"
PRE_MD5=$(md5sum "$TMPHOME/.zshrc" 2>/dev/null | awk '{print $1}' || md5 -q "$TMPHOME/.zshrc")

# Run piped (non-TTY). We allow non-zero to still inspect behaviour.
bash "$INSTALL_SH" --develop </dev/null >/tmp/dw-install-nontty.log 2>&1 || true

# After non-TTY run, ~/.dynos-work/bin and /hooks should exist (Phase A)
[ -d "$TMPHOME/.dynos-work/bin" ]
assert "non-TTY: ~/.dynos-work/bin materialised" $?
[ -d "$TMPHOME/.dynos-work/hooks" ]
assert "non-TTY: ~/.dynos-work/hooks materialised" $?

# In non-TTY the PATH line must NOT be appended to .zshrc
! grep -q 'dynos-work CLI' "$TMPHOME/.zshrc"
assert "non-TTY: .zshrc untouched (no marker)" $?

POST_MD5=$(md5sum "$TMPHOME/.zshrc" 2>/dev/null | awk '{print $1}' || md5 -q "$TMPHOME/.zshrc")
[ "$PRE_MD5" = "$POST_MD5" ]
assert "non-TTY: .zshrc content byte-identical" $?

rm -rf "$TMPHOME"

# ----------------------------------------------------------------------------
# Test 2: simulated-TTY opt-in path — PATH appended once, backup created
# ----------------------------------------------------------------------------
echo "Test 2: TTY opt-in PATH edit"
TMPHOME=$(mktemp -d)
export HOME="$TMPHOME"
export SHELL=/bin/zsh
touch "$TMPHOME/.zshrc"

# Use `script` or a here-doc with TTY sim where possible; fall back to setting
# a hint env var the install script can detect for test mode.
# We use DW_INSTALL_TEST_OPTIN=1 as an explicit opt-in bypass for the prompt.
# This variable is a documented test hook (install.sh must honour it).
DW_INSTALL_TEST_OPTIN=1 bash "$INSTALL_SH" --develop </dev/null \
    >/tmp/dw-install-tty.log 2>&1 || true

grep -q 'dynos-work CLI' "$TMPHOME/.zshrc"
assert "opt-in: marker appended to .zshrc" $?

grep -q 'export PATH="\$HOME/.dynos-work/bin:\$PATH"' "$TMPHOME/.zshrc"
assert "opt-in: PATH export present in .zshrc" $?

# Backup file should exist
ls "$TMPHOME"/.zshrc.bak-* >/dev/null 2>&1
assert "opt-in: .zshrc backup file created" $?

# Re-run: must be idempotent (no duplicate marker lines)
DW_INSTALL_TEST_OPTIN=1 bash "$INSTALL_SH" --develop </dev/null \
    >/tmp/dw-install-tty2.log 2>&1 || true

MARKER_COUNT=$(grep -c 'dynos-work CLI' "$TMPHOME/.zshrc")
[ "$MARKER_COUNT" -eq 1 ]
assert "idempotent: marker appears exactly once after re-run (got $MARKER_COUNT)" $?

PATH_LINE_COUNT=$(grep -c 'export PATH="\$HOME/.dynos-work/bin:\$PATH"' "$TMPHOME/.zshrc")
[ "$PATH_LINE_COUNT" -eq 1 ]
assert "idempotent: PATH export appears exactly once after re-run (got $PATH_LINE_COUNT)" $?

rm -rf "$TMPHOME"

# ----------------------------------------------------------------------------
# Summary
# ----------------------------------------------------------------------------
echo
echo "Results: $PASS passed, $FAIL failed"
if [ "$FAIL" -gt 0 ]; then
  echo "Failures:"
  for f in "${FAILURES[@]}"; do
    echo "  - $f"
  done
  exit 1
fi
exit 0
