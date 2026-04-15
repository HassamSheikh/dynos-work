#!/usr/bin/env bash
# Test for `npm pack` pipeline (criterion 26).
#
# Covers:
#   - `npm pack` inside cli/ produces dynos-work-cli-7.0.0.tgz
#   - Tarball includes dist/index.js and assets/ tree (platform JSONs + base templates)
#
# Requires: node, npm, and a completed `bun run build` step beforehand so dist/ exists.
#
# Exit 0 = pass.

set -u

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLI_DIR="$REPO_ROOT/cli"
PASS=0
FAIL=0
FAILURES=()

assert() {
  local desc="$1" rc="$2"
  if [ "$rc" -eq 0 ]; then
    PASS=$((PASS + 1)); echo "  [PASS] $desc"
  else
    FAIL=$((FAIL + 1)); FAILURES+=("$desc"); echo "  [FAIL] $desc"
  fi
}

if [ ! -d "$CLI_DIR" ]; then
  echo "cli/ directory missing at $CLI_DIR"
  exit 1
fi

if [ ! -f "$CLI_DIR/package.json" ]; then
  echo "cli/package.json missing"
  exit 1
fi

# Version field must be 7.0.0 (criterion 26 implies this tarball name)
VERSION=$(node -e "console.log(require('$CLI_DIR/package.json').version)" 2>/dev/null || echo "")
[ "$VERSION" = "7.0.0" ]
assert "cli/package.json version is 7.0.0 (got '$VERSION')" $?

NAME=$(node -e "console.log(require('$CLI_DIR/package.json').name)" 2>/dev/null || echo "")
[ "$NAME" = "dynos-work-cli" ]
assert "cli/package.json name is dynos-work-cli (got '$NAME')" $?

# Build dist if missing (npm pack won't include it otherwise).
if [ ! -f "$CLI_DIR/dist/index.js" ]; then
  echo "  (building dist/ via bun run build)"
  (cd "$CLI_DIR" && bun run build >/dev/null 2>&1) || echo "  (bun build failed or not installed)"
fi

# npm pack in a temp dir so we don't pollute the repo
PACK_DIR=$(mktemp -d)
(cd "$CLI_DIR" && npm pack --pack-destination "$PACK_DIR" >/tmp/dw-npm-pack.log 2>&1)
PACK_RC=$?
assert "npm pack exits 0" $PACK_RC

TARBALL="$PACK_DIR/dynos-work-cli-7.0.0.tgz"
[ -f "$TARBALL" ]
assert "tarball dynos-work-cli-7.0.0.tgz produced" $?

if [ -f "$TARBALL" ]; then
  CONTENTS=$(tar -tzf "$TARBALL")
  echo "$CONTENTS" | grep -q 'package/dist/index.js'
  assert "tarball contains dist/index.js" $?

  echo "$CONTENTS" | grep -q 'package/assets/templates/platforms/claude.json'
  assert "tarball contains assets/templates/platforms/claude.json" $?

  echo "$CONTENTS" | grep -q 'package/assets/templates/base/start.md'
  assert "tarball contains assets/templates/base/start.md" $?

  echo "$CONTENTS" | grep -q 'package/assets/templates/base/agents/planning.md'
  assert "tarball contains assets/templates/base/agents/planning.md" $?
fi

rm -rf "$PACK_DIR"

echo
echo "Results: $PASS passed, $FAIL failed"
if [ "$FAIL" -gt 0 ]; then
  for f in "${FAILURES[@]}"; do echo "  - $f"; done
  exit 1
fi
exit 0
