/**
 * Tests for cli/assets/templates/base/*
 *
 * Covers acceptance criteria:
 *   - Criterion 8: 22 canonical skill body files in base/
 *   - Criterion 9: no ${CLAUDE_PLUGIN_ROOT} / ${PLUGIN_HOOKS} literal in any base .md
 *   - Criterion 10: 21 .extra/ dirs carry contract.json (all skills except trajectory)
 *   - Criterion 11: 17 canonical agent body files + _shared/ dir
 *   - Criterion 27: top-level skill.json exists and mirrors ui-ux-pro-max manifest shape
 *     (listed here to consolidate template/manifest assertions)
 */
import { describe, it, expect } from 'bun:test';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const CLI_DIR = resolve(import.meta.dir, '..', '..');
const BASE_DIR = join(CLI_DIR, 'assets', 'templates', 'base');
const AGENTS_DIR = join(BASE_DIR, 'agents');
const REPO_ROOT = resolve(CLI_DIR, '..');

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

// Per plan: all skills except `trajectory` carry a contract.json → 21 .extra/ dirs.
const SKILLS_WITH_EXTRA = SKILL_NAMES.filter((s) => s !== 'trajectory');

describe('base skill templates (criterion 8)', () => {
  it.each(SKILL_NAMES.map((n) => [n]))('has base template for %s.md', (name) => {
    const p = join(BASE_DIR, `${name}.md`);
    expect(existsSync(p)).toBe(true);
  });

  it('has exactly 22 .md files at base/ top level', () => {
    if (!existsSync(BASE_DIR)) {
      throw new Error(`Base dir missing: ${BASE_DIR}`);
    }
    const topLevelMds = readdirSync(BASE_DIR)
      .filter((e) => e.endsWith('.md'))
      .filter((e) => statSync(join(BASE_DIR, e)).isFile());
    expect(topLevelMds.sort()).toEqual(SKILL_NAMES.map((n) => `${n}.md`).sort());
  });
});

describe('no Claude-coupled literals in base templates (criterion 9)', () => {
  it.each(SKILL_NAMES.map((n) => [n]))(
    '%s.md contains no ${CLAUDE_PLUGIN_ROOT} / ${PLUGIN_HOOKS} literal',
    (name) => {
      const body = readFileSync(join(BASE_DIR, `${name}.md`), 'utf8');
      expect(body).not.toContain('${CLAUDE_PLUGIN_ROOT}');
      expect(body).not.toContain('${PLUGIN_HOOKS}');
    },
  );

  it.each(AGENT_NAMES.map((n) => [n]))(
    'agents/%s.md contains no ${CLAUDE_PLUGIN_ROOT} / ${PLUGIN_HOOKS} literal',
    (name) => {
      const p = join(AGENTS_DIR, `${name}.md`);
      if (!existsSync(p)) throw new Error(`Missing base agent: ${p}`);
      const body = readFileSync(p, 'utf8');
      expect(body).not.toContain('${CLAUDE_PLUGIN_ROOT}');
      expect(body).not.toContain('${PLUGIN_HOOKS}');
    },
  );
});

describe('auxiliary .extra/ directories (criterion 10)', () => {
  it.each(SKILLS_WITH_EXTRA.map((n) => [n]))(
    '%s has a .extra/ directory with contract.json',
    (name) => {
      const dir = join(BASE_DIR, `${name}.extra`);
      expect(existsSync(dir)).toBe(true);
      expect(existsSync(join(dir, 'contract.json'))).toBe(true);
    },
  );

  it('trajectory has no .extra/ directory (or no contract.json inside it)', () => {
    const dir = join(BASE_DIR, 'trajectory.extra');
    if (existsSync(dir)) {
      expect(existsSync(join(dir, 'contract.json'))).toBe(false);
    }
  });
});

describe('base agent templates (criterion 11)', () => {
  it.each(AGENT_NAMES.map((n) => [n]))('has agents/%s.md', (name) => {
    expect(existsSync(join(AGENTS_DIR, `${name}.md`))).toBe(true);
  });

  it('has exactly 17 agent .md files at agents/ top level', () => {
    if (!existsSync(AGENTS_DIR)) {
      throw new Error(`Agents dir missing: ${AGENTS_DIR}`);
    }
    const mds = readdirSync(AGENTS_DIR)
      .filter((e) => e.endsWith('.md'))
      .filter((e) => statSync(join(AGENTS_DIR, e)).isFile());
    expect(mds.sort()).toEqual(AGENT_NAMES.map((n) => `${n}.md`).sort());
  });

  it('has _shared/ directory copied under base/agents/', () => {
    const shared = join(AGENTS_DIR, '_shared');
    expect(existsSync(shared)).toBe(true);
    expect(statSync(shared).isDirectory()).toBe(true);
  });

  it.each(AGENT_NAMES.map((n) => [n]))(
    '%s has a {{MODEL}} placeholder in its frontmatter (per criterion 11)',
    (name) => {
      const body = readFileSync(join(AGENTS_DIR, `${name}.md`), 'utf8');
      expect(body).toMatch(/^---[\s\S]*?\nmodel:\s*\{\{MODEL\}\}/m);
    },
  );
});

describe('top-level skill.json manifest (criterion 27)', () => {
  it('repo-root skill.json exists', () => {
    const p = join(REPO_ROOT, 'skill.json');
    expect(existsSync(p)).toBe(true);
  });

  it('skill.json lists all 18 platforms', () => {
    const p = join(REPO_ROOT, 'skill.json');
    const body = readFileSync(p, 'utf8');
    const data = JSON.parse(body);
    const platforms = data.platforms;
    expect(Array.isArray(platforms) || (platforms && typeof platforms === 'object')).toBe(true);
    const HARNESSES = [
      'claude', 'cursor', 'windsurf', 'antigravity', 'copilot', 'kiro', 'codex', 'roocode',
      'qoder', 'gemini', 'trae', 'opencode', 'continue', 'codebuddy', 'droid', 'kilocode',
      'warp', 'augment',
    ];
    const flat = JSON.stringify(platforms);
    for (const h of HARNESSES) {
      expect(flat).toContain(h);
    }
  });

  it('skill.json carries an install template mentioning dynos-work-cli init', () => {
    const p = join(REPO_ROOT, 'skill.json');
    const body = readFileSync(p, 'utf8');
    expect(body).toContain('dynos-work-cli init');
    expect(body).toContain('{{platform}}');
  });
});
