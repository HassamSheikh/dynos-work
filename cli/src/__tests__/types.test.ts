/**
 * Tests for cli/src/types/index.ts
 *
 * Covers acceptance criteria:
 *   - Criterion 1: cli/ scaffold with src/types/index.ts
 *   - Criterion 4: AI_TYPES tuple has exactly the 18 harness identifiers plus `all`
 */
import { describe, it, expect } from 'bun:test';

import { AI_TYPES, type AIType } from '../types/index.ts';

const EXPECTED_HARNESSES = [
  'claude',
  'cursor',
  'windsurf',
  'antigravity',
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
] as const;

describe('AI_TYPES', () => {
  it('has exactly 19 entries (18 harnesses + all)', () => {
    expect(AI_TYPES.length).toBe(19);
  });

  it('contains `all` as a valid member', () => {
    expect(AI_TYPES).toContain('all' as AIType);
  });

  it.each(EXPECTED_HARNESSES.map((h) => [h]))(
    'contains harness identifier `%s`',
    (harness) => {
      expect(AI_TYPES).toContain(harness as AIType);
    },
  );

  it('contains no duplicate entries', () => {
    const unique = new Set(AI_TYPES);
    expect(unique.size).toBe(AI_TYPES.length);
  });

  it('contains only the 18 expected harnesses plus `all` (no extras)', () => {
    const allowed = new Set<string>([...EXPECTED_HARNESSES, 'all']);
    for (const entry of AI_TYPES) {
      expect(allowed.has(entry)).toBe(true);
    }
  });
});
