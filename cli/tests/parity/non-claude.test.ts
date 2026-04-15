/**
 * Tests for non-Claude harness output (cursor, windsurf, copilot, warp).
 *
 * Covers acceptance criteria:
 *   - Criterion 19: correct output roots per platform; no .claude-plugin/, no hooks.json, no .claude/agents/
 *   - Criterion 20: zero occurrences of ${CLAUDE_PLUGIN_ROOT}, ${PLUGIN_HOOKS}, model: opus,
 *     model: sonnet, AskUserQuestion
 *   - Criterion 21: every ${PLUGIN_HOOKS}/foo.py reference rewritten to ~/.dynos-work/hooks/foo.py;
 *     warp outputs have no --- frontmatter delimiters
 *   - Criterion 22: inlined-agent contract — start/SKILL.md (cursor) contains verbatim body of
 *     base/agents/planning.md stripped of frontmatter
 */
import { describe, it, expect, beforeAll } from 'bun:test';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const CLI_DIR = resolve(import.meta.dir, '..', '..');
const DIST_ENTRY = join(CLI_DIR, 'dist', 'index.js');

const HARNESS_ROOTS: Record<string, string> = {
  cursor: '.cursor/skills/dynos-work',
  windsurf: '.windsurf/skills/dynos-work',
  copilot: '.github/prompts',
  warp: '.warp/skills/dynos-work',
};

const SKILL_NAMES = [
  'start', 'execute', 'audit', 'investigate', 'repair', 'status', 'resume', 'plan',
  'autofix', 'maintain', 'dashboard', 'init', 'evolve', 'learn', 'list', 'register',
  'global', 'local', 'trajectory', 'founder', 'dry-run', 'execution',
];

function ensureBuilt() {
  if (!existsSync(DIST_ENTRY)) {
    throw new Error(`dist/index.js missing. Run \`cd cli && bun run build\` first.`);
  }
}

function regenerate(harness: string): string {
  ensureBuilt();
  const target = mkdtempSync(join(tmpdir(), `dw-${harness}-`));
  const result = spawnSync('node', [DIST_ENTRY, 'init', '--ai', harness, '--target', target], {
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(
      `CLI regen failed for ${harness} (exit ${result.status}):\n${result.stderr}`,
    );
  }
  return target;
}

function walk(dir: string, rel = ''): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const relPath = rel ? join(rel, entry) : entry;
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full, relPath));
    else out.push(relPath);
  }
  return out;
}

describe('non-Claude roots (criterion 19)', () => {
  it('cursor produces 22 SKILL.md under .cursor/skills/dynos-work/', () => {
    const t = regenerate('cursor');
    for (const name of SKILL_NAMES) {
      expect(existsSync(join(t, '.cursor', 'skills', 'dynos-work', name, 'SKILL.md'))).toBe(true);
    }
  });

  it('windsurf produces 22 SKILL.md under .windsurf/skills/dynos-work/', () => {
    const t = regenerate('windsurf');
    for (const name of SKILL_NAMES) {
      expect(existsSync(join(t, '.windsurf', 'skills', 'dynos-work', name, 'SKILL.md'))).toBe(true);
    }
  });

  it('copilot produces flat files .github/prompts/dynos-work-{name}.prompt.md', () => {
    const t = regenerate('copilot');
    for (const name of SKILL_NAMES) {
      const p = join(t, '.github', 'prompts', `dynos-work-${name}.prompt.md`);
      expect(existsSync(p)).toBe(true);
    }
  });

  it.each(['cursor', 'windsurf', 'copilot', 'warp'].map((h) => [h]))(
    '%s does NOT leak .claude-plugin/, hooks.json, or .claude/agents/',
    (h) => {
      const t = regenerate(h);
      expect(existsSync(join(t, '.claude-plugin'))).toBe(false);
      expect(existsSync(join(t, 'hooks.json'))).toBe(false);
      expect(existsSync(join(t, '.claude', 'agents'))).toBe(false);
    },
  );
});

describe('non-Claude negative substring sweep (criterion 20)', () => {
  const FORBIDDEN = [
    '${CLAUDE_PLUGIN_ROOT}',
    '${PLUGIN_HOOKS}',
    'model: opus',
    'model: sonnet',
    'AskUserQuestion',
  ];

  it.each(Object.keys(HARNESS_ROOTS).map((h) => [h]))(
    '%s rendered output contains no forbidden substrings',
    (harness) => {
      const t = regenerate(harness);
      const root = join(t, HARNESS_ROOTS[harness]);
      const files = walk(root).filter((f) => f.endsWith('.md'));
      expect(files.length).toBeGreaterThan(0);
      for (const rel of files) {
        const body = readFileSync(join(root, rel), 'utf8');
        for (const forbidden of FORBIDDEN) {
          if (body.includes(forbidden)) {
            throw new Error(
              `${harness}:${rel} contains forbidden substring "${forbidden}"`,
            );
          }
        }
      }
    },
  );
});

describe('non-Claude hook-path rewriting (criterion 21)', () => {
  it.each(Object.keys(HARNESS_ROOTS).map((h) => [h]))(
    '%s rewrites hook references to ~/.dynos-work/hooks/…',
    (harness) => {
      const t = regenerate(harness);
      const root = join(t, HARNESS_ROOTS[harness]);
      const files = walk(root).filter((f) => f.endsWith('.md'));
      let sawHookRef = false;
      for (const rel of files) {
        const body = readFileSync(join(root, rel), 'utf8');
        if (/\.dynos-work\/hooks\/\S+\.py/.test(body)) {
          sawHookRef = true;
        }
        // Must never contain the Claude env var or placeholder
        expect(body).not.toContain('${PLUGIN_HOOKS}');
        expect(body).not.toContain('${CLAUDE_PLUGIN_ROOT}');
      }
      // At least one skill references hooks/*.py; assert that the rewrite actually happens somewhere
      expect(sawHookRef).toBe(true);
    },
  );
});

describe('warp has no frontmatter delimiters (criterion 21)', () => {
  it('no SKILL.md under .warp/skills/dynos-work/ starts with ---', () => {
    const t = regenerate('warp');
    const root = join(t, '.warp', 'skills', 'dynos-work');
    const files = walk(root).filter((f) => f.endsWith('.md'));
    expect(files.length).toBeGreaterThan(0);
    for (const rel of files) {
      const body = readFileSync(join(root, rel), 'utf8');
      expect(body.startsWith('---')).toBe(false);
    }
  });
});

describe('inlined-agent contract (criterion 22)', () => {
  it('cursor start/SKILL.md contains verbatim body of base/agents/planning.md (sans frontmatter)', () => {
    const t = regenerate('cursor');
    const skillBody = readFileSync(
      join(t, '.cursor', 'skills', 'dynos-work', 'start', 'SKILL.md'),
      'utf8',
    );

    const planningPath = join(
      CLI_DIR,
      'assets',
      'templates',
      'base',
      'agents',
      'planning.md',
    );
    if (!existsSync(planningPath)) {
      throw new Error(`Base agent template missing: ${planningPath}`);
    }
    const planning = readFileSync(planningPath, 'utf8');
    // Strip a single leading frontmatter block
    const stripped = planning.replace(/^---\n[\s\S]*?\n---\n/, '').trim();
    // Stripped body must appear verbatim in the inlined skill body.
    // Guard: stripped must be non-empty; otherwise the frontmatter strip pattern broke.
    expect(stripped.length).toBeGreaterThan(0);
    expect(skillBody).toContain(stripped);
  });

  it('cursor start/SKILL.md introduces the inlined role with a heading', () => {
    const t = regenerate('cursor');
    const body = readFileSync(
      join(t, '.cursor', 'skills', 'dynos-work', 'start', 'SKILL.md'),
      'utf8',
    );
    expect(body).toMatch(/### Role:\s*planning/);
  });
});
