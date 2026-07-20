/**
 * World stages — behavioral tests for stage-scoped LessonCore sessions
 * (one learning level per session, launched per stage from the world map).
 *
 * Contract under test: no tutorial after stage 1 (lesson.tutorial:false),
 * world stage numbering + seeded done-levels on the progress strip, calm
 * HUD from frame one, unscored understand stages, and the badge firing only
 * on the finale stage.
 */
import { expect, test } from '@playwright/test';
import { bootShell, bridgeEvents, debugState, driveUntil, loadSpec, tap } from '../driver.mjs';

test('understand stage: tutorial skipped, discovery unscored, no badge', async ({ page }) => {
  test.setTimeout(240_000);
  const spec = loadSpec('world_lines_g3_s2.ar.json');
  const errors = await bootShell(page, 'goal_shootout', spec);

  // Straight into the level intro — no classic tutorial level.
  await driveUntil(page, 'story', { timeoutMs: 90000 });
  const events = await bridgeEvents(page);
  expect(events.some((e) => e.type === 'reportLevel'), 'no tutorial level ran').toBe(false);
  const lesson = await page.evaluate(() => window.EduMindDebug.getLesson());
  expect(lesson.levelId).toBe('understand');
  const hud = await page.evaluate(() => {
    const sc = window.EduCore.game.scene.getScene('GameScene');
    return { hudVisible: sc.hud.visible, done: [...sc._lessonHud.doneIds] };
  });
  expect(hud.hudVisible).toBe(false);
  expect(hud.done, 'earlier stages seed the ladder').toEqual(['recognize']);

  await driveUntil(page, 'summary', { timeoutMs: 180000 });
  const summary = (await bridgeEvents(page)).find((e) => e.type === 'reportSummary').payload;
  expect(summary.presented, 'discovery is unscored').toBe(0);
  expect(summary.items).toHaveLength(0);
  expect(
    (await bridgeEvents(page)).some((e) => e.type === 'reportEvent' && e.payload.name === 'lesson_badge'),
    'no badge before the finale stage'
  ).toBe(false);

  const done = (await debugState(page)).tappables.find((t) => t.id === 'done');
  await tap(page, done.x, done.y);
  await page.waitForTimeout(500);
  expect((await bridgeEvents(page)).filter((e) => e.type === 'reportComplete')).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('challenge finale stage: fresh tasks scored, badge awarded', async ({ page }) => {
  test.setTimeout(240_000);
  const spec = loadSpec('world_lines_g3_s4.ar.json');
  const errors = await bootShell(page, 'goal_shootout', spec);

  await driveUntil(page, 'summary', { timeoutMs: 180000 });
  const events = await bridgeEvents(page);
  const badge = events.find((e) => e.type === 'reportEvent' && e.payload.name === 'lesson_badge');
  expect(badge).toBeTruthy();
  expect(badge.payload.id).toBe('field_captain');

  const summary = events.find((e) => e.type === 'reportSummary').payload;
  expect(summary.presented).toBe(2);
  const ids = summary.items.map((i) => i.id);
  expect(ids).toContain('g3s4_mcq');
  expect(ids).toContain('g3s4_build');
  for (const rec of summary.items) expect(rec.level).toBe('challenge');
  expect(errors).toEqual([]);
});
