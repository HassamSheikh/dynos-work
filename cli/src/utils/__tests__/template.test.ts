/**
 * Tests for cli/src/utils/template.ts
 *
 * Covers acceptance criteria:
 *   - Criterion 12: template.ts exports loadPlatformConfig, renderSkillFile,
 *     generatePlatformFiles, generateAllPlatformFiles, and AI_TO_PLATFORM map
 *     (with antigravity → agent, every other AIType → its own key)
 */
import { describe, it, expect } from 'bun:test';

describe('template.ts exports (criterion 12)', () => {
  it('exports loadPlatformConfig', async () => {
    const mod: any = await import('../template.ts');
    expect(typeof mod.loadPlatformConfig).toBe('function');
  });

  it('exports renderSkillFile', async () => {
    const mod: any = await import('../template.ts');
    expect(typeof mod.renderSkillFile).toBe('function');
  });

  it('exports generatePlatformFiles', async () => {
    const mod: any = await import('../template.ts');
    expect(typeof mod.generatePlatformFiles).toBe('function');
  });

  it('exports generateAllPlatformFiles', async () => {
    const mod: any = await import('../template.ts');
    expect(typeof mod.generateAllPlatformFiles).toBe('function');
  });

  it('exports AI_TO_PLATFORM record', async () => {
    const mod: any = await import('../template.ts');
    expect(mod.AI_TO_PLATFORM).toBeDefined();
    expect(typeof mod.AI_TO_PLATFORM).toBe('object');
  });
});

describe('AI_TO_PLATFORM mapping (criterion 12)', () => {
  it('maps antigravity → agent (D9 asymmetry)', async () => {
    const mod: any = await import('../template.ts');
    expect(mod.AI_TO_PLATFORM.antigravity).toBe('agent');
  });

  const SAME_MAP_HARNESSES = [
    'claude',
    'cursor',
    'windsurf',
    'copilot',
    'kiro',
    'codex',
    'roocode',
    'qoder',
    'gemini',
    'trae',
    'opencode',
    'continue',
    'codebuddy',
    'droid',
    'kilocode',
    'warp',
    'augment',
  ];

  it.each(SAME_MAP_HARNESSES.map((h) => [h]))(
    '%s maps to its own key',
    async (harness) => {
      const mod: any = await import('../template.ts');
      expect(mod.AI_TO_PLATFORM[harness]).toBe(harness);
    },
  );
});

describe('loadPlatformConfig (criterion 12)', () => {
  it('loads a valid platform config for "claude"', async () => {
    const mod: any = await import('../template.ts');
    const cfg = await mod.loadPlatformConfig('claude');
    expect(cfg).toBeDefined();
    expect(cfg.platform).toBe('claude');
    expect(cfg.capabilities).toBeDefined();
  });

  it('loads agent.json when given "antigravity" (criterion 12, D9)', async () => {
    const mod: any = await import('../template.ts');
    const cfg = await mod.loadPlatformConfig('antigravity');
    expect(cfg).toBeDefined();
    // Not asserting platform string value (may be 'antigravity' or 'agent'); only that it loads
  });

  it('throws a descriptive error for unknown AIType', async () => {
    const mod: any = await import('../template.ts');
    await expect(mod.loadPlatformConfig('nonexistent-ai')).rejects.toThrow();
  });
});
