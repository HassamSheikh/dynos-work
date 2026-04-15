/**
 * Tests for cli/src/utils/render-blocks.ts
 *
 * Covers acceptance criteria:
 *   - Criterion 13: 5 pure helpers, capability-aware, returning a string
 *   - Criterion 14: {{SPAWN:{json}}} argumented placeholder is parsed and
 *     dispatched to renderAgentSpawnBlock
 *
 * Exercises each helper against:
 *   - a Claude-like config (all 6 capability flags true)
 *   - a capability-disabled config (all flags false, frontmatter=null a la warp)
 */
import { describe, it, expect } from 'bun:test';

import {
  renderAgentSpawnBlock,
  renderHooksPath,
  renderModel,
  renderAskUserBlock,
  renderSessionStartBootstrap,
} from '../render-blocks.ts';

type PlatformConfig = {
  platform: string;
  displayName: string;
  installType: string;
  folderStructure: { root: string; skillPath: string; filename: string };
  frontmatter: Record<string, string> | null;
  capabilities: {
    parallel_subagents: boolean;
    lifecycle_hooks: boolean;
    transcript_parsing: boolean;
    per_agent_model: boolean;
    structured_questions: boolean;
    env_injection: boolean;
  };
};

const CLAUDE: PlatformConfig = {
  platform: 'claude',
  displayName: 'Claude Code',
  installType: 'full',
  folderStructure: { root: '.claude', skillPath: 'skills/dynos-work', filename: 'SKILL.md' },
  frontmatter: { name: 'dynos-work' },
  capabilities: {
    parallel_subagents: true,
    lifecycle_hooks: true,
    transcript_parsing: true,
    per_agent_model: true,
    structured_questions: true,
    env_injection: true,
  },
};

const DEGRADED: PlatformConfig = {
  platform: 'warp',
  displayName: 'Warp',
  installType: 'reference',
  folderStructure: { root: '.warp', skillPath: 'skills/dynos-work', filename: 'SKILL.md' },
  frontmatter: null,
  capabilities: {
    parallel_subagents: false,
    lifecycle_hooks: false,
    transcript_parsing: false,
    per_agent_model: false,
    structured_questions: false,
    env_injection: false,
  },
};

describe('renderHooksPath', () => {
  it('returns ${CLAUDE_PLUGIN_ROOT}/hooks for Claude (env_injection=true)', () => {
    const out = renderHooksPath(CLAUDE as any, false);
    expect(out).toContain('${CLAUDE_PLUGIN_ROOT}');
    expect(out).toContain('hooks');
  });

  it('returns absolute ~/.dynos-work/hooks path for degraded config', () => {
    const out = renderHooksPath(DEGRADED as any, false);
    expect(out).not.toContain('${CLAUDE_PLUGIN_ROOT}');
    expect(out).not.toContain('${PLUGIN_HOOKS}');
    expect(out).toContain('~/.dynos-work/hooks');
  });

  it('returns a string', () => {
    expect(typeof renderHooksPath(CLAUDE as any, false)).toBe('string');
    expect(typeof renderHooksPath(DEGRADED as any, true)).toBe('string');
  });
});

describe('renderModel', () => {
  it('preserves literal `opus` for Claude (per_agent_model=true)', () => {
    const out = renderModel(CLAUDE as any, 'opus');
    expect(out).toBe('opus');
  });

  it('preserves literal `sonnet` for Claude', () => {
    expect(renderModel(CLAUDE as any, 'sonnet')).toBe('sonnet');
  });

  it('emits a markdown comment (no model: leak) for degraded config', () => {
    const out = renderModel(DEGRADED as any, 'opus');
    // Must not leak the literal "opus" as a yaml value a harness might parse
    expect(out).not.toBe('opus');
    // Degraded form should be a markdown/HTML comment so no yaml parser picks it up
    expect(out.startsWith('<!--') || out.startsWith('#')).toBe(true);
  });
});

describe('renderAgentSpawnBlock', () => {
  it('returns Claude-idiomatic "Spawn the … subagent" text for Claude', () => {
    const out = renderAgentSpawnBlock(CLAUDE as any, { agent: 'planning', phase: 'discovery' });
    expect(out.toLowerCase()).toContain('spawn');
    expect(out).toContain('planning');
  });

  it('returns inlined agent body under "### Role: ..." heading for degraded config', () => {
    const out = renderAgentSpawnBlock(DEGRADED as any, { agent: 'planning', phase: 'discovery' });
    expect(out).toContain('### Role:');
    expect(out).toContain('planning');
    // The inlined body should NOT re-emit Claude agent frontmatter
    expect(out).not.toMatch(/^---\nname:/);
  });

  it('accepts only {agent,phase?} shaped args (criterion 14 argumented form)', () => {
    // Missing agent key should throw
    expect(() => renderAgentSpawnBlock(CLAUDE as any, {} as any)).toThrow();
  });
});

describe('renderAskUserBlock', () => {
  const questions = [
    { id: 'q1', question: 'What is your name?', options: ['Alice', 'Bob'] },
    { id: 'q2', question: 'Proceed?', options: ['yes', 'no'] },
  ];

  it('returns AskUserQuestion-flavored content for Claude', () => {
    const out = renderAskUserBlock(CLAUDE as any, questions);
    expect(out).toContain('AskUserQuestion');
  });

  it('returns a plain numbered list for degraded config (no AskUserQuestion leak)', () => {
    const out = renderAskUserBlock(DEGRADED as any, questions);
    expect(out).not.toContain('AskUserQuestion');
    expect(out).toContain('1.');
    expect(out).toContain('What is your name?');
    expect(out).toContain('2.');
  });
});

describe('renderSessionStartBootstrap', () => {
  it('returns a hook-aware paragraph for Claude (lifecycle_hooks=true)', () => {
    const out = renderSessionStartBootstrap(CLAUDE as any);
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
  });

  it('returns an inline bootstrap block for degraded config', () => {
    const out = renderSessionStartBootstrap(DEGRADED as any);
    expect(out).not.toContain('${CLAUDE_PLUGIN_ROOT}');
    expect(out).not.toContain('${PLUGIN_HOOKS}');
    // Inline bootstrap runs dynoregistry/dynomaintain setup steps
    expect(out.toLowerCase()).toContain('dynoregistry');
  });
});

describe('{{SPAWN:{json}}} argumented placeholder (criterion 14)', () => {
  // The renderer pre-pass is expected to be exported from template.ts; we import lazily
  // so this test file runs independently of template.ts availability.
  it('extracts JSON arg and dispatches to renderAgentSpawnBlock', async () => {
    const templateMod = await import('../template.ts');
    const renderSpawnPlaceholders = (templateMod as any).renderSpawnPlaceholders;
    if (typeof renderSpawnPlaceholders !== 'function') {
      throw new Error(
        'template.ts must export renderSpawnPlaceholders(body, config) for criterion 14',
      );
    }
    const body = 'Preamble.\n{{SPAWN:{"agent":"planning","phase":"discovery"}}}\nEpilogue.';
    const out = renderSpawnPlaceholders(body, DEGRADED);
    expect(out).not.toContain('{{SPAWN:');
    expect(out).toContain('### Role:');
    expect(out).toContain('planning');
  });

  it('handles balanced braces inside JSON arg', async () => {
    const templateMod = await import('../template.ts');
    const renderSpawnPlaceholders = (templateMod as any).renderSpawnPlaceholders;
    const body = 'X {{SPAWN:{"agent":"planning","phase":"discovery","meta":{"k":"v"}}}} Y';
    const out = renderSpawnPlaceholders(body, DEGRADED);
    expect(out).not.toContain('{{SPAWN:');
    expect(out).toContain('X ');
    expect(out).toContain(' Y');
  });
});
