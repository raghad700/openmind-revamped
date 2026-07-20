/**
 * Grade-4 "Right Angles" lesson — behavioral test of the SHARED primary
 * lesson contract (LessonCore) with goal_shootout as the reference game.
 *
 * Contract under test: four learning levels with visible progress; calm HUD
 * (no hearts, no persistent bee, no hint button); retry-until-success on
 * every task with support only after failure; success-only points;
 * first-try honesty in the evidence records; reveal only after discovery;
 * badge reward. The classic quiz path has its own suite (shells.spec.mjs).
 */
import { expect, test } from '@playwright/test';
import {
  bootShell, bridgeEvents, debugState, drag, driveUntil, loadSpec, tap,
} from '../driver.mjs';

const SPEC_FILE = 'goal_shootout_right_angles_lesson.ar.json';

const scoreCount = async (page) =>
  (await bridgeEvents(page)).filter((e) => e.type === 'reportScore').length;

const lessonStages = async (page) =>
  (await bridgeEvents(page))
    .filter((e) => e.type === 'reportEvent' && e.payload.name === 'lesson_stage')
    .map((e) => e.payload);

const hearts = (page) => page.evaluate(() => window.EduCore.session.hearts);
const lessonState = (page) =>
  page.evaluate(() => (window.EduMindDebug.getLesson ? window.EduMindDebug.getLesson() : null));

/** Calm-HUD probe: classic HUD hidden, bee not persistent, no hint button. */
const calmHud = (page) =>
  page.evaluate(() => {
    const sc = window.EduCore.game.scene.getScene('GameScene');
    return {
      hudVisible: sc.hud.visible,
      beeVisible: sc.buddy ? sc.buddy.visible : false,
      hintButtons: sc.children.list.filter((c) => c.isCandyButton && c.visible && c.y > 1100).length,
    };
  });

/** Wait until the current question shows its four options again. */
async function awaitOptions(page, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const dbg = await debugState(page);
    if (dbg.state === 'question' && dbg.tappables.length === 4) return dbg;
    await tap(page, 360, 1010); // advance any open guide dialog
    await page.waitForTimeout(400);
  }
  throw new Error('question options did not (re)appear');
}

test('right-angles lesson: shared contract — levels, retry, calm HUD, honesty', async ({ page }) => {
  test.setTimeout(420_000);
  const spec = loadSpec(SPEC_FILE);
  const errors = await bootShell(page, 'goal_shootout', spec);

  expect(await page.evaluate(() => document.documentElement.dir)).toBe('rtl');

  // ---- Recognize: visual identification under the calm-HUD doctrine.
  await driveUntil(page, 'question', { timeoutMs: 120000 });
  const dbg1 = await awaitOptions(page);
  expect((await lessonState(page)).levelId).toBe('recognize');
  const hud = await calmHud(page);
  expect(hud.hudVisible, 'hearts/combo/XP-pill row is hidden').toBe(false);
  expect(hud.beeVisible, 'the bee is not a persistent HUD element').toBe(false);
  expect(hud.hintButtons, 'no hint button in lesson mode').toBe(0);

  // A deliberate wrong answer: nothing is lost, the SAME question returns
  // with the guide's support, and points arrive only with success.
  const xpBefore = (await lessonState(page)).xp;
  const promptLabels = dbg1.tappables.map((t) => t.label).sort();
  const wrongOpt = dbg1.tappables.find((t) => !t.correct);
  await tap(page, wrongOpt.x, wrongOpt.y);
  await page.waitForTimeout(1200);
  expect(await hearts(page), 'no hearts are ever lost in a lesson').toBe(3);
  expect((await lessonState(page)).xp, 'no points move on a wrong answer').toBe(xpBefore);
  const dbg2 = await awaitOptions(page);
  expect(dbg2.tappables.map((t) => t.label).sort(), 'the same item is retried').toEqual(promptLabels);
  const correctOpt = dbg2.tappables.find((t) => t.correct);
  await tap(page, correctOpt.x, correctOpt.y);
  await driveUntil(page, ['feedback'], { timeoutMs: 60000 });
  await page.waitForTimeout(300);

  // ---- Understand: story → explore (never scored) → notice → discover.
  await driveUntil(page, 'explore', { timeoutMs: 120000 });
  expect((await lessonState(page)).levelId).toBe('understand');
  const scoresBeforeExplore = await scoreCount(page);
  await driveUntil(page, 'notice', { timeoutMs: 120000 });
  expect(await scoreCount(page), 'exploration is never scored').toBe(scoresBeforeExplore);
  const stagesSoFar = await lessonStages(page);
  expect(stagesSoFar.some((s) => s.stage === 'story')).toBe(true);
  expect(stagesSoFar.some((s) => s.stage === 'explore' && s.interaction === 'rotation')).toBe(true);

  // Notice: a wrong look costs nothing.
  const noticeDbg = await debugState(page);
  const wrongCard = noticeDbg.tappables.find((t) => !t.correct);
  await tap(page, wrongCard.x, wrongCard.y);
  await page.waitForTimeout(900);
  expect((await debugState(page)).state).toBe('notice');
  expect(await hearts(page)).toBe(3);

  // Discover: nothing revealed before the build actually succeeds.
  await driveUntil(page, 'discover', { timeoutMs: 120000 });
  const early = await debugState(page);
  if (early.fieldLines) expect(early.fieldLines.solved).toBe(false);
  expect((await lessonStages(page)).some((s) => s.stage === 'build')).toBe(false);

  // ---- Apply: contextual questions + repairing the broken corner.
  await driveUntil(page, 'apply', { timeoutMs: 180000 });
  expect((await lessonState(page)).levelId).toBe('apply');
  const stagesAtApply = await lessonStages(page);
  expect(stagesAtApply.some((s) => s.stage === 'build' && s.correct === true)).toBe(true);
  expect(stagesAtApply.find((s) => s.stage === 'compare').attempts).toBeGreaterThan(1);
  expect(await scoreCount(page), 'six scored items after both quiz sets').toBe(6);

  // ---- Challenge: fresh checkpoint, support only after failure.
  await driveUntil(page, 'question', { timeoutMs: 120000 });
  expect((await lessonState(page)).levelId).toBe('challenge');
  expect((await calmHud(page)).hintButtons).toBe(0);

  await driveUntil(page, 'checkpoint', { timeoutMs: 120000 });
  await page.waitForTimeout(400);
  const cp = await debugState(page);
  expect(cp.fieldLines).toBeTruthy();
  const free = cp.fieldLines.lines.find((l) => !l.locked);
  const end = {
    x: free.x + Math.cos((free.angleDeg * Math.PI) / 180) * free.length,
    y: free.y + Math.sin((free.angleDeg * Math.PI) / 180) * free.length,
  };
  const wrong = {
    x: free.x + Math.cos((30 * Math.PI) / 180) * free.length,
    y: free.y + Math.sin((30 * Math.PI) / 180) * free.length,
  };
  await drag(page, end.x, end.y, wrong.x, wrong.y);
  await page.waitForTimeout(600);
  const failed = await debugState(page);
  expect(failed.fieldLines.solved).toBe(false);
  expect(failed.fieldLines.inputEnabled, 'support dialog holds the lines still').toBe(false);
  expect(failed.fieldLines.drags, 'no drag suggestions while the dialog is open').toHaveLength(0);

  // ---- Reward: badge, then the standard summary.
  await driveUntil(page, 'reward', { timeoutMs: 120000 });
  const badge = (await bridgeEvents(page)).find(
    (e) => e.type === 'reportEvent' && e.payload.name === 'lesson_badge'
  );
  expect(badge).toBeTruthy();
  expect(badge.payload.id).toBe('field_engineer');

  await driveUntil(page, 'summary', { timeoutMs: 120000 });
  const levelEvents = (await bridgeEvents(page))
    .filter((e) => e.type === 'reportEvent' && e.payload.name === 'lesson_level')
    .map((e) => e.payload.level);
  expect(levelEvents).toEqual(['recognize', 'understand', 'apply', 'challenge']);

  const summary = (await bridgeEvents(page)).find((e) => e.type === 'reportSummary').payload;
  expect(summary.items.length).toBe(summary.presented);
  expect(summary.presented).toBe(8);
  const ids = summary.items.map((i) => i.id);
  expect(ids).toContain('cp_mcq');
  expect(ids).toContain('cp_build');

  // Evidence: attempts/time/interaction/level ride every record, and
  // first-try honesty holds for both the retried MCQ and the supported build.
  for (const rec of summary.items) {
    expect(rec.attempts).toBeGreaterThanOrEqual(1);
    expect(rec.ms).toBeGreaterThan(0);
    expect(['mcq', 'building']).toContain(rec.interaction);
    expect(['recognize', 'understand', 'apply', 'challenge']).toContain(rec.level);
  }
  const retried = summary.items[0];
  expect(retried.level).toBe('recognize');
  expect(retried.attempts, 'the deliberately missed item records its retry').toBe(2);
  expect(retried.correct, 'supported success is not a clean pass').toBe(false);
  expect(retried.hintsUsed).toBe(1);
  const build = summary.items.find((i) => i.id === 'cp_build');
  expect(build.correct).toBe(false);
  expect(build.hintsUsed).toBe(1);
  expect(build.interaction).toBe('building');

  expect(summary.xp).toBeGreaterThan(100);
  expect(summary.xp).toBeLessThanOrEqual(520);

  const done = (await debugState(page)).tappables.find((t) => t.id === 'done');
  expect(done).toBeTruthy();
  await tap(page, done.x, done.y);
  await page.waitForTimeout(600);
  const completes = (await bridgeEvents(page)).filter((e) => e.type === 'reportComplete');
  expect(completes).toHaveLength(1);
  expect(errors).toEqual([]);
});
