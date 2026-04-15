/**
 * Tests for Claude-output byte parity.
 *
 * Covers acceptance criteria:
 *   - Criterion 15: regenerating Claude install produces 22 SKILL.md, 17 agents,
 *     hooks.json, and .claude-plugin/plugin.json at the expected paths
 *   - Criterion 16: byte-equivalence vs cli/tests/fixtures/claude-parity/
 *   - Criterion 17: every agent frontmatter has `model: opus` or `model: sonnet`,
 *     every SKILL.md preserves `${CLAUDE_PLUGIN_ROOT}` literals
 *   - Criterion 18: hooks.json has the 3 Claude hook events; plugin.json version = 7.0.0
 */
import { describe, it, expect, beforeAll } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const CLI_DIR = resolve(import.meta.dir, '..', '..');
const DIST_ENTRY = join(CLI_DIR, 'dist', 'index.js');
const FIXTURE_DIR = join(CLI_DIR, 'tests', 'fixtures', 'claude-parity');

const SKILL_NAMES = [
  'start', 'execute', 'audit', 'investigate', 'repair', 'status', 'resume', 'plan',
  'autofix', 'maintain', 'dashboard', 'init', 'evolve', 'learn', 'list', 'register',
  'global', 'local', 'trajectory', 'founder', 'dry-run', 'execution',
];
const AGENT_NAMES = [
  'planning', 'investigator', 'backend-executor', 'ui-executor', 'db-executor',
  'ml-executor', 'refactor-executor', 'testing-executor', 'integration-executor',
  'repair-coordinator', 'state-encoder', 'code-quality-auditor', 'dead-code-auditor',
  'db-schema-auditor', 'security-auditor', 'spec-completion-auditor', 'ui-auditor',
];

let tmpTarget: string;

function ensureBuilt() {
  if (!existsSync(DIST_ENTRY)) {
    throw new Error(
      `dist/index.js missing at ${DIST_ENTRY}. Run \`cd cli && bun run build\` before parity tests.`,
    );
  }
}

function regenerateClaude(): string {
  ensureBuilt();
  const target = mkdtempSync(join(tmpdir(), 'dw-claude-parity-'));
  const result = spawnSync('node', [DIST_ENTRY, 'init', '--ai', 'claude', '--target', target], {
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(
      `CLI regen failed (exit ${result.status}):\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
    );
  }
  return target;
}

function walk(dir: string, rel = ''): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const relPath = rel ? join(rel, entry) : entry;
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...walk(full, relPath));
    } else {
      out.push(relPath);
    }
  }
  return out;
}

describe('Claude output structure (criterion 15)', () => {
  beforeAll(() => {
    tmpTarget = regenerateClaude();
  });

  it('writes 22 SKILL.md files under .claude/skills/dynos-work/', () => {
    for (const name of SKILL_NAMES) {
      const p = join(tmpTarget, '.claude', 'skills', 'dynos-work', name, 'SKILL.md');
      expect(existsSync(p)).toBe(true);
    }
  });

  it('writes 17 agent files under .claude/agents/', () => {
    for (const name of AGENT_NAMES) {
      const p = join(tmpTarget, '.claude', 'agents', `${name}.md`);
      expect(existsSync(p)).toBe(true);
    }
  });

  it('writes hooks.json at target root', () => {
    expect(existsSync(join(tmpTarget, 'hooks.json'))).toBe(true);
  });

  it('writes .claude-plugin/plugin.json at target root', () => {
    expect(existsSync(join(tmpTarget, '.claude-plugin', 'plugin.json'))).toBe(true);
  });
});

describe('Claude byte parity vs fixture (criterion 16)', () => {
  beforeAll(() => {
    if (!existsSync(FIXTURE_DIR)) {
      throw new Error(
        `Fixture missing at ${FIXTURE_DIR}. seg-003 must freeze a pre-tokenization snapshot before parity tests run.`,
      );
    }
    if (!tmpTarget) tmpTarget = regenerateClaude();
  });

  it('regenerated .claude/ tree matches fixture byte-for-byte', () => {
    const fixtureClaude = join(FIXTURE_DIR, '.claude');
    const genClaude = join(tmpTarget, '.claude');

    const fixtureFiles = walk(fixtureClaude).sort();
    const genFiles = walk(genClaude).sort();

    expect(genFiles).toEqual(fixtureFiles);

    for (const rel of fixtureFiles) {
      const a = readFileSync(join(fixtureClaude, rel));
      const b = readFileSync(join(genClaude, rel));
      if (!a.equals(b)) {
        throw new Error(`Byte mismatch at ${rel}`);
      }
    }
  });

  it('regenerated hooks.json matches fixture byte-for-byte', () => {
    const a = readFileSync(join(FIXTURE_DIR, 'hooks.json'));
    const b = readFileSync(join(tmpTarget, 'hooks.json'));
    expect(b.equals(a)).toBe(true);
  });

  it('regenerated .claude-plugin/plugin.json matches fixture byte-for-byte', () => {
    const a = readFileSync(join(FIXTURE_DIR, '.claude-plugin', 'plugin.json'));
    const b = readFileSync(join(tmpTarget, '.claude-plugin', 'plugin.json'));
    expect(b.equals(a)).toBe(true);
  });
});

describe('Claude agent frontmatter (criterion 17)', () => {
  beforeAll(() => {
    if (!tmpTarget) tmpTarget = regenerateClaude();
  });

  it.each(AGENT_NAMES.map((n) => [n]))(
    '%s has model: opus or model: sonnet',
    (agent) => {
      const body = readFileSync(join(tmpTarget, '.claude', 'agents', `${agent}.md`), 'utf8');
      expect(body).toMatch(/^---[\s\S]*?\nmodel:\s*(opus|sonnet)\b/m);
    },
  );
});

describe('Claude SKILL.md ${CLAUDE_PLUGIN_ROOT} preservation (criterion 17)', () => {
  beforeAll(() => {
    if (!tmpTarget) tmpTarget = regenerateClaude();
  });

  it('every generated SKILL.md that referenced ${CLAUDE_PLUGIN_ROOT} in fixture still does', () => {
    const fixtureSkills = join(FIXTURE_DIR, '.claude', 'skills', 'dynos-work');
    const genSkills = join(tmpTarget, '.claude', 'skills', 'dynos-work');

    for (const name of SKILL_NAMES) {
      const fx = join(fixtureSkills, name, 'SKILL.md');
      const gn = join(genSkills, name, 'SKILL.md');
      if (!existsSync(fx)) continue;
      const fixtureBody = readFileSync(fx, 'utf8');
      if (fixtureBody.includes('${CLAUDE_PLUGIN_ROOT}')) {
        expect(existsSync(gn)).toBe(true);
        const genBody = readFileSync(gn, 'utf8');
        expect(genBody).toContain('${CLAUDE_PLUGIN_ROOT}');
      }
    }
  });
});

describe('Claude hooks.json and plugin.json (criterion 18)', () => {
  beforeAll(() => {
    if (!tmpTarget) tmpTarget = regenerateClaude();
  });

  it('hooks.json contains SessionStart, TaskCompleted, SubagentStop entries', () => {
    const body = readFileSync(join(tmpTarget, 'hooks.json'), 'utf8');
    const json = JSON.parse(body);
    // Shape: top-level object keyed by hooks or events array
    const flat = JSON.stringify(json);
    expect(flat).toContain('SessionStart');
    expect(flat).toContain('TaskCompleted');
    expect(flat).toContain('SubagentStop');
  });

  it('.claude-plugin/plugin.json declares "version": "7.0.0"', () => {
    const body = readFileSync(join(tmpTarget, '.claude-plugin', 'plugin.json'), 'utf8');
    const json = JSON.parse(body);
    expect(json.version).toBe('7.0.0');
  });
});
