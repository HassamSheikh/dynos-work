/**
 * Tests for CLI build output.
 *
 * Covers acceptance criteria:
 *   - Criterion 3: `cd cli && bun run build` produces dist/index.js, exit code 0
 *
 * Spawns a `bun run build` subprocess in cli/ and asserts:
 *   1. Exit code is 0
 *   2. cli/dist/index.js exists after build
 *
 * NOTE: This test shells out to a real `bun` binary; it requires bun available on PATH
 * in the CI environment. It is intentionally slow.
 */
import { describe, it, expect } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const CLI_DIR = resolve(import.meta.dir, '..', '..');
const DIST_ENTRY = join(CLI_DIR, 'dist', 'index.js');

describe('cli build', () => {
  it('`bun run build` exits 0 and produces dist/index.js', () => {
    // Clean up any prior artifact so we prove this run produced it
    if (existsSync(DIST_ENTRY)) {
      rmSync(DIST_ENTRY);
    }

    const result = spawnSync('bun', ['run', 'build'], {
      cwd: CLI_DIR,
      encoding: 'utf8',
      env: { ...process.env },
    });

    // If bun is missing, that's a real failure for this criterion.
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(existsSync(DIST_ENTRY)).toBe(true);
  }, 120_000);
});
