/**
 * LessonCore contract unit tests — the pure policy surface, evaluated in a
 * bare VM sandbox exactly like the field_line_builder tests.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '..', 'src', 'lib', 'lesson_core.js'), 'utf8');

const sandbox = createContext({ window: {} });
runInContext(src, sandbox);
const LC = sandbox.window.LessonCore;

describe('learning-level ladder', () => {
  it('has the four levels in the contract order', () => {
    expect(LC.LEVELS.map((l) => l.id)).toEqual(['recognize', 'understand', 'apply', 'challenge']);
  });

  it('every level carries Arabic and English display names', () => {
    for (const lv of LC.LEVELS) {
      expect(lv.ar).toBeTruthy();
      expect(lv.en).toBeTruthy();
      expect(lv.emoji).toBeTruthy();
    }
  });

  it('names the reusable interaction mechanics', () => {
    expect(LC.INTERACTIONS).toContain('mcq');
    expect(LC.INTERACTIONS).toContain('building');
    expect(LC.INTERACTIONS).toContain('error_repair');
  });
});

describe('success-only scoring policy', () => {
  it('a clean first try earns full points, a supported success half', () => {
    expect(LC.xpForItem(true)).toBe(10);
    expect(LC.xpForItem(false)).toBe(5);
  });

  it('stage bonuses stay in the order of one classic level award', () => {
    const total = LC.STAGE_XP.explore + LC.STAGE_XP.compare + LC.STAGE_XP.build +
      LC.STAGE_XP.repair + LC.STAGE_XP.corner;
    expect(total).toBeGreaterThan(30);
    expect(total).toBeLessThanOrEqual(60);
  });
});

describe('progressive hint policy (support only after failure)', () => {
  it('offers rung 0 after the first failure, rung 1 after the second', () => {
    expect(LC.hintRungFor(1, 2)).toBe(0);
    expect(LC.hintRungFor(2, 2)).toBe(1);
  });

  it('repeats the last authored rung on later failures', () => {
    expect(LC.hintRungFor(5, 2)).toBe(1);
    expect(LC.hintRungFor(3, 1)).toBe(0);
  });

  it('offers nothing when no hints are authored', () => {
    expect(LC.hintRungFor(1, 0)).toBe(-1);
  });
});

describe('evidence record (first-try honesty)', () => {
  const item = { id: 'x1', prompt: 'p', concepts: ['c'], difficulty: 2, hints: ['h'] };

  it('records attempts, time, hints, interaction and level', () => {
    const rec = LC.buildItemRecord({
      item, levelIndex: 1, level: 'recognize', interaction: 'mcq',
      firstTry: false, attempts: 3, hintsUsed: 2, ms: 12345,
    });
    expect(rec).toEqual({
      id: 'x1', levelIndex: 1, level: 'recognize', interaction: 'mcq',
      correct: false, attempts: 3, hintsUsed: 2, ms: 12345,
      concepts: ['c'], difficulty: 2, prompt: 'p',
    });
  });

  it('supported success is never a clean pass', () => {
    const rec = LC.buildItemRecord({
      item, level: 'challenge', interaction: 'building',
      firstTry: false, attempts: 2, hintsUsed: 1, ms: 1,
    });
    expect(rec.correct).toBe(false);
  });
});
