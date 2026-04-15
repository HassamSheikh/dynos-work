/**
 * Tests for cli/assets/templates/platforms/*.json
 *
 * Covers acceptance criteria:
 *   - Criterion 5: 18 platform JSON files named per spec
 *   - Criterion 6: each parses as JSON, has required keys, validates against schema
 *   - Criterion 7: per-harness structural constraints:
 *       * claude: all 6 capability flags true, extraFiles targets hooks.json + .claude-plugin/plugin.json,
 *         folderStructure.root=".claude", skillPath="skills/dynos-work", filename="SKILL.md"
 *       * all 17 non-Claude: parallel_subagents/lifecycle_hooks/transcript_parsing/env_injection=false
 *       * warp: frontmatter=null
 *       * copilot: skillNamePrefix="dynos-work-", flat root .github/prompts
 *       * kiro: skillOrWorkflow="Workflow", skillPath="steering/dynos-work"
 */
import { describe, it, expect, beforeAll } from 'bun:test';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const PLATFORMS_DIR = resolve(import.meta.dir, '..', '..', 'assets', 'templates', 'platforms');

const PLATFORM_FILES = [
  'claude.json',
  'cursor.json',
  'windsurf.json',
  'agent.json',
  'copilot.json',
  'kiro.json',
  'codex.json',
  'roocode.json',
  'qoder.json',
  'gemini.json',
  'trae.json',
  'opencode.json',
  'continue.json',
  'codebuddy.json',
  'droid.json',
  'kilocode.json',
  'warp.json',
  'augment.json',
];

// 17 non-Claude files (everything except claude.json)
const NON_CLAUDE_FILES = PLATFORM_FILES.filter((f) => f !== 'claude.json');

type Json = Record<string, unknown>;

function readJson(file: string): Json {
  const full = join(PLATFORMS_DIR, file);
  if (!existsSync(full)) {
    throw new Error(`Platform file missing: ${full}`);
  }
  return JSON.parse(readFileSync(full, 'utf8')) as Json;
}

describe('platforms directory', () => {
  it('contains exactly 18 platform JSON files (criterion 5)', () => {
    for (const f of PLATFORM_FILES) {
      expect(existsSync(join(PLATFORMS_DIR, f))).toBe(true);
    }
  });

  it('includes `agent.json` (antigravity) not `antigravity.json` (D9)', () => {
    expect(existsSync(join(PLATFORMS_DIR, 'agent.json'))).toBe(true);
    expect(existsSync(join(PLATFORMS_DIR, 'antigravity.json'))).toBe(false);
  });

  it('has a checked-in platform.schema.json', () => {
    expect(existsSync(join(PLATFORMS_DIR, 'platform.schema.json'))).toBe(true);
  });
});

describe('platform JSON shape (criterion 6)', () => {
  it.each(PLATFORM_FILES.map((f) => [f]))('%s parses and has required keys', (file) => {
    const data = readJson(file);
    expect(typeof data.platform).toBe('string');
    expect(typeof data.displayName).toBe('string');
    expect(typeof data.installType).toBe('string');

    const fs = data.folderStructure as Json | undefined;
    expect(fs).toBeDefined();
    expect(typeof fs?.root).toBe('string');
    expect(typeof fs?.skillPath).toBe('string');
    expect(typeof fs?.filename).toBe('string');

    // frontmatter may be object or null — presence check only
    expect('frontmatter' in data).toBe(true);

    const caps = data.capabilities as Json | undefined;
    expect(caps).toBeDefined();
    const capKeys = [
      'parallel_subagents',
      'lifecycle_hooks',
      'transcript_parsing',
      'per_agent_model',
      'structured_questions',
      'env_injection',
    ];
    for (const k of capKeys) {
      expect(typeof caps?.[k]).toBe('boolean');
    }
  });

  it('each platform JSON validates against the platform schema', async () => {
    // Lazy-load ajv so tests don't fail at import time when the dep isn't installed yet.
    let Ajv: any;
    try {
      Ajv = (await import('ajv')).default;
    } catch {
      throw new Error(
        'ajv is not installed — add it to cli/package.json devDependencies to run schema validation',
      );
    }
    const ajv = new Ajv({ allErrors: true, strict: false });
    const schema = JSON.parse(
      readFileSync(join(PLATFORMS_DIR, 'platform.schema.json'), 'utf8'),
    );
    const validate = ajv.compile(schema);

    for (const f of PLATFORM_FILES) {
      const data = readJson(f);
      const ok = validate(data);
      if (!ok) {
        throw new Error(
          `${f} failed schema validation: ${JSON.stringify(validate.errors, null, 2)}`,
        );
      }
    }
  });
});

describe('claude.json (criterion 7)', () => {
  let claude: Json;
  beforeAll(() => {
    claude = readJson('claude.json');
  });

  it('sets all 6 capability flags to true', () => {
    const caps = claude.capabilities as Record<string, boolean>;
    expect(caps.parallel_subagents).toBe(true);
    expect(caps.lifecycle_hooks).toBe(true);
    expect(caps.transcript_parsing).toBe(true);
    expect(caps.per_agent_model).toBe(true);
    expect(caps.structured_questions).toBe(true);
    expect(caps.env_injection).toBe(true);
  });

  it('declares folderStructure rooted at `.claude`', () => {
    const fs = claude.folderStructure as Record<string, string>;
    expect(fs.root).toBe('.claude');
    expect(fs.skillPath).toBe('skills/dynos-work');
    expect(fs.filename).toBe('SKILL.md');
  });

  it('declares extraFiles targeting hooks.json and .claude-plugin/plugin.json', () => {
    const extras = claude.extraFiles as Array<Record<string, string>> | undefined;
    expect(Array.isArray(extras)).toBe(true);
    const targets = (extras ?? []).map((e) => e.target);
    expect(targets).toContain('hooks.json');
    expect(targets).toContain('.claude-plugin/plugin.json');
  });
});

describe('non-Claude platforms (criterion 7)', () => {
  it.each(NON_CLAUDE_FILES.map((f) => [f]))(
    '%s sets parallel_subagents/lifecycle_hooks/transcript_parsing/env_injection all false',
    (file) => {
      const data = readJson(file);
      const caps = data.capabilities as Record<string, boolean>;
      expect(caps.parallel_subagents).toBe(false);
      expect(caps.lifecycle_hooks).toBe(false);
      expect(caps.transcript_parsing).toBe(false);
      expect(caps.env_injection).toBe(false);
    },
  );
});

describe('warp.json (criterion 7)', () => {
  it('sets frontmatter to null', () => {
    const warp = readJson('warp.json');
    expect(warp.frontmatter).toBeNull();
  });
});

describe('copilot.json (criterion 7)', () => {
  it('declares skillNamePrefix "dynos-work-"', () => {
    const copilot = readJson('copilot.json');
    expect(copilot.skillNamePrefix).toBe('dynos-work-');
  });

  it('uses a flat layout rooted at .github/prompts', () => {
    const copilot = readJson('copilot.json');
    const fs = copilot.folderStructure as Record<string, string>;
    expect(fs.root).toBe('.github');
    expect(fs.skillPath).toBe('prompts');
  });
});

describe('kiro.json (criterion 7)', () => {
  it('declares skillOrWorkflow "Workflow"', () => {
    const kiro = readJson('kiro.json');
    expect(kiro.skillOrWorkflow).toBe('Workflow');
  });

  it('declares skillPath "steering/dynos-work"', () => {
    const kiro = readJson('kiro.json');
    const fs = kiro.folderStructure as Record<string, string>;
    expect(fs.skillPath).toBe('steering/dynos-work');
  });
});
