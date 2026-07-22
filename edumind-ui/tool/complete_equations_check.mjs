// Drives the FULL equations experience to reach the completion screen and
// verify the whyItMattersNow/futureConnection layout for a resolved interest.
//   node tool/complete_equations_check.mjs
import { chromium } from '@playwright/test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const PORT = 5050;
const shotDir = join(here, 'pilot_shots');
await (await import('node:fs/promises')).mkdir(shotDir, { recursive: true });

const profile = { name: 'ريان', grade: 7, language: 'ar', color: '#1CB0F6', gender: 'm', interests: ['tech_robotics', 'sports_movement'], dailyGoal: 3, stage: 'middle_interactive_learning' };

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 402, height: 874 } });
await context.addInitScript(([profile]) => {
  localStorage.setItem('flutter.profile', JSON.stringify(JSON.stringify(profile)));
}, [profile]);
const page = await context.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));

const shot = (name) => page.screenshot({ path: join(shotDir, `complete_${name}.png`) });
const wait = (ms) => page.waitForTimeout(ms);

await page.goto(`http://localhost:${PORT}`, { waitUntil: 'load' });
await wait(9000);
await page.mouse.click(200, 276); // "ابدأ التجربة" -> equations
await wait(2500);
await shot('01_scene');

// step 1 (scene): just continue
await page.mouse.click(200, 831);
await wait(1500);
await shot('02_explore');

// step 2 (explore): tap "+" once to register interaction, then continue.
await page.mouse.click(38, 425);
await wait(800);
await page.mouse.click(200, 831);
await wait(1500);
await shot('03_choice');

// step 3 (abstract choice): tap the correct option (index 0).
await page.mouse.click(200, 305);
await wait(1200);
await shot('03b_choice_answered');
await page.mouse.click(200, 831);
await wait(1500);
await shot('04_challenge');

// step 4 (challenge, 3x+2=17): nudge the slider so a real interaction is
// registered, then move it back to the target (x=5) and check.
await page.mouse.click(364, 475); // "-" once: x=4
await wait(500);
await page.mouse.click(38, 475); // "+" once: back to x=5
await wait(500);
await shot('04a_challenge_nudged');
await page.mouse.click(200, 542); // تحقق
await wait(1200);
await shot('04b_challenge_checked');
await page.mouse.click(200, 831);
await wait(1500);
await shot('05_apply');

// step 4 continue -> step 5 (apply, x+4=22, x=18)
await page.mouse.click(200, 831);
await wait(1500);
await shot('05_apply');

// step 5 (apply, x+4=22): x=15 by default, need x=18 -> tap "+" 3 times.
for (let i = 0; i < 3; i++) { await page.mouse.click(38, 546); await wait(300); }
await shot('05a_apply_x18');
await page.mouse.click(200, 613); // تحقق
await wait(1200);
await shot('05b_apply_checked');

// answer the nested choice: "18 لاعبًا" (correct, index 0)
await page.mouse.click(200, 730);
await wait(1200);
await shot('05c_apply_answered');
await page.mouse.click(200, 831);
await wait(1500);
await shot('06_check');

// check step: 4 quick questions, correctIndex=0 for all. Each answer reveals
// a "التالي"/"إنهاء" button at ~y=668 (distinct from the outer "متابعة" bar).
// Generous waits: answering hits the server for evidence recording.
for (let i = 0; i < 4; i++) {
  await page.mouse.click(200, 382); // first option
  await wait(1800);
  await shot(`06_q${i + 1}_answered`);
  // The "التالي"/"إنهاء" pill's Y shifts with how tall the prompt/options
  // are (2-line prompts push it down) — try a couple of plausible spots.
  for (const y of [668, 737, 706]) {
    await page.mouse.click(62, y);
    await wait(900);
  }
  await wait(1200);
  await shot(`06_q${i + 1}_advanced`);
}
await shot('06b_check_done');
await page.mouse.click(200, 831); // متابعة (outer bar, now unlocked)
await wait(2000);
await shot('07_completion');

console.log('errors:', errs.length ? errs.join('\n') : 'none');
await browser.close();
