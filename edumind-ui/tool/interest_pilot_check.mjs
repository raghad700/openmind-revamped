// Manual QA driver for the middle-school interest-personalization pilot.
// Seeds a profile directly into localStorage (same technique as home_check.mjs)
// so we skip onboarding and land straight in the middle-school shell, then
// screenshots each step. Coordinates are tuned interactively against
// screenshots, same philosophy as onboarding_check.mjs.
//   node tool/interest_pilot_check.mjs <scenario>
import { chromium } from '@playwright/test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const PORT = 5050;
const shotDir = join(here, 'pilot_shots');
await (await import('node:fs/promises')).mkdir(shotDir, { recursive: true });

const scenario = process.argv[2] || 'two_interests';

const profiles = {
  two_interests: { name: 'ريان', grade: 7, language: 'ar', color: '#1CB0F6', gender: 'm', interests: ['tech_robotics', 'sports_movement'], dailyGoal: 3, stage: 'middle_interactive_learning' },
  one_interest: { name: 'لينا', grade: 7, language: 'ar', color: '#CE82FF', gender: 'f', interests: ['reading_stories'], dailyGoal: 3, stage: 'middle_interactive_learning' },
  legacy_only: { name: 'سامر', grade: 7, language: 'ar', color: '#58CC02', learningContext: 'market', dailyGoal: 3, stage: 'middle_interactive_learning' },
  neutral: { name: 'نور', grade: 7, language: 'ar', color: '#FFC800', dailyGoal: 3, stage: 'middle_interactive_learning' },
};

const profile = profiles[scenario];
if (!profile) {
  console.error('unknown scenario', scenario, 'options:', Object.keys(profiles));
  process.exit(1);
}

const browser = await chromium.launch();
// An explicit context (not the browser.newPage() shorthand, which creates a
// FRESH isolated context per call) so localStorage/IndexedDB genuinely
// persist across the "restart" page opened later in this same context.
const context = await browser.newContext({ viewport: { width: 402, height: 874 } });
await context.addInitScript(([profile]) => {
  localStorage.setItem('flutter.profile', JSON.stringify(JSON.stringify(profile)));
}, [profile]);
const page = await context.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });

const shot = (name) => page.screenshot({ path: join(shotDir, `${scenario}_${name}.png`) });
const wait = (ms) => page.waitForTimeout(ms);

await page.goto(`http://localhost:${PORT}`, { waitUntil: 'load' });
await wait(9000);
await shot('01_start');

// "ابدأ التجربة" CTA on the Start-tab recommendation card.
await page.mouse.click(200, 276);
await wait(2500);
await shot('02_scene');

// Back to the tab bar, then "رحلتي" (Journey) tab.
await page.goBack();
await wait(1500);
await page.mouse.click(245, 809);
await wait(1500);
await shot('03_journey');

// "أرض تصنع الفرق" (land_of_difference) path card.
await page.mouse.click(200, 664);
await wait(1500);
await shot('04_path_land_of_difference');

// "مساحة المثلث" (triangle_garden) node — the "أنت هنا" ready station.
await page.mouse.click(200, 524);
await wait(2000);
await shot('05_triangle_scene');

// Refresh mid-experience: same tab, same localStorage — the SAME interest
// variant must render again (re-enter via the SAME nav path since reload
// resets to the Start tab).
await page.reload({ waitUntil: 'load' });
await wait(9000);
await page.mouse.click(245, 809); // رحلتي
await wait(1500);
await page.mouse.click(200, 664); // أرض تصنع الفرق
await wait(1500);
await page.mouse.click(200, 524); // مساحة المثلث
await wait(2000);
await shot('06_triangle_after_refresh');

// "App restart": close this page, open a NEW page in the SAME persistent
// browser context (localStorage/IndexedDB survive — a fresh engine init on
// the same on-disk profile is exactly what a real app restart is).
await page.close();
const page2 = await context.newPage();
await page2.goto(`http://localhost:${PORT}`, { waitUntil: 'load' });
await page2.waitForTimeout(9000);
await page2.mouse.click(245, 809); // رحلتي
await page2.waitForTimeout(1500);
await page2.mouse.click(200, 664); // أرض تصنع الفرق
await page2.waitForTimeout(1500);
await page2.mouse.click(200, 524); // مساحة المثلث
await page2.waitForTimeout(2000);
await page2.screenshot({ path: join(shotDir, `${scenario}_07_triangle_after_restart.png`) });

console.log(`[${scenario}] loaded. errors so far:`, errs.length ? errs.join('\n') : 'none');
await browser.close();
