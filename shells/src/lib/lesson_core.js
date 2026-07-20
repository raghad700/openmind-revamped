/**
 * LessonCore — the shared primary-school learning contract (grades 1-6).
 *
 * One lesson = four learning LEVELS in a fixed order, each built from
 * data-defined STAGES that pair a learning purpose with a reusable
 * interaction mechanic:
 *
 *   recognize  → visual identification and recall
 *   understand → explore, notice, discover (interaction BEFORE explanation)
 *   apply      → use the idea in a meaningful situation
 *   challenge  → independent checkpoint on fresh tasks
 *
 * The four separations this file enforces:
 *  1. Learning level — the LEVELS ladder below, shown as calm progress.
 *  2. Interaction mechanic — each stage carries an `interaction` tag that is
 *     recorded on its evidence (mcq, selection, rotation, building,
 *     error_repair, observation).
 *  3. Interest wrapper — visuals/story only. Skins and mascots come from the
 *     HOST GAME; every number, target, tolerance and answer comes from the
 *     spec. Nothing here may move educational data into presentation.
 *  4. Shared scoring + evidence — success-only points, automatic retry until
 *     success, first-try honesty (supported success is never a clean pass),
 *     and one record shape for every task.
 *
 * Primary-lesson doctrine (binding): no hearts, no loss, no punishment;
 * retry until success is automatic; points are awarded only after success;
 * the guide (Hudhud) speaks briefly and only when needed; the bee appears
 * ONLY as a success celebration; the interface stays calm.
 *
 * A game adopts the contract by providing these scene hooks and calling
 * `LessonCore.run(this, spec.lesson)` from its beginSession:
 *   presentItem(item, hintApi)  — the game's own answer mechanic (unchanged)
 *   coachSay(text)              — the guide's short dialogue bubble
 *   setPrompt(text)             — the prompt panel
 *   lessonFieldScene(show)      — clear/restore the play field for stages
 *   guide                       — the game's Hoopoe
 *   fieldStage / fieldSkin      — manipulative layout rect + colors (skin!)
 * plus the EduCore members every shell already has (feel, buddy, hud,
 * companion, refreshHud, showExplanation, engine, session, bridge).
 */
(function () {
  'use strict';

  const W = 720;
  const H = 1280;

  // ------------------------------------------------------------- contract
  const LEVELS = [
    { id: 'recognize', ar: 'تعرّف', en: 'Recognize', emoji: '👀' },
    { id: 'understand', ar: 'اكتشف', en: 'Discover', emoji: '🧭' },
    { id: 'apply', ar: 'طبّق', en: 'Apply', emoji: '🛠️' },
    { id: 'challenge', ar: 'تحدَّ', en: 'Challenge', emoji: '🏆' },
  ];

  const INTERACTIONS = ['mcq', 'selection', 'rotation', 'building', 'error_repair', 'observation'];

  /** Success-only item points: clean first try earns full, supported half. */
  function xpForItem(firstTry) {
    return firstTry ? 10 : 5;
  }

  /** Fixed stage bonuses — same order of magnitude as one classic level. */
  const STAGE_XP = {
    explore: 5,
    compare: 8,
    compareRetry: 4,
    build: 15,
    repair: 10,
    corner: 12,
    cornerSupported: 6,
  };
  const LEVEL_XP = 25;

  /**
   * Which authored hint rung the guide offers after a failed attempt:
   * attempt 1 fails → rung 0, attempt 2 fails → rung 1, later fails repeat
   * the last authored rung. Hints exist only AFTER a failure — never before.
   */
  function hintRungFor(attempts, hintCount) {
    if (hintCount <= 0) return -1;
    return Math.min(attempts - 1, hintCount - 1);
  }

  /** The one evidence record shape for every scored lesson task. */
  function buildItemRecord(p) {
    return {
      id: p.item.id,
      levelIndex: p.levelIndex == null ? 0 : p.levelIndex,
      level: p.level,
      interaction: p.interaction,
      correct: !!p.firstTry,
      attempts: p.attempts,
      hintsUsed: p.hintsUsed || 0,
      ms: p.ms || 0,
      concepts: p.item.concepts || [],
      difficulty: p.item.difficulty || 3,
      prompt: p.item.prompt,
    };
  }

  const STRINGS = {
    stepOf: { en: 'Step {n} of {m}', ar: 'المرحلة {n} من {m}' },
    wider: { en: 'Wider', ar: 'أوسع' },
    narrower: { en: 'Narrower', ar: 'أضيق' },
  };
  function tL(key, vars) {
    const lang = EduCore.lang === 'ar' ? 'ar' : 'en';
    let s = STRINGS[key][lang];
    if (vars) for (const k of Object.keys(vars)) s = s.split(`{${k}}`).join(vars[k]);
    return s;
  }

  // ------------------------------------------------------------- lesson HUD
  /**
   * Calm lesson chrome: the classic HUD (XP pill, hearts, combo) and the
   * persistent mascots disappear; a single 4-step progress strip takes
   * their place, with one small points counter.
   */
  function applyLessonHud(scene, doneLevels, currentId) {
    scene.hud.setVisible(false);
    if (scene.buddy) scene.buddy.setVisible(false);
    if (scene.companion) scene.companion.setVisible(false);

    const rtl = EduCore.isRTL;
    const c = scene.add.container(0, 0).setDepth(800);
    const order = rtl ? [...LEVELS].reverse() : LEVELS;
    const xs = [150, 290, 430, 570];
    const pills = [];
    const bar = scene.add.graphics();
    bar.lineStyle(4, 0xffffff, 0.25);
    bar.beginPath();
    bar.moveTo(xs[0], 40);
    bar.lineTo(xs[3], 40);
    bar.strokePath();
    c.add(bar);
    order.forEach((lv, pos) => {
      const g = scene.add.graphics();
      const glyph = scene.add.text(xs[pos], 40, lv.emoji,
        EduCore.textStyle(24, { align: 'center' })).setOrigin(0.5);
      c.add([g, glyph]);
      pills.push({ id: lv.id, x: xs[pos], g, glyph });
    });
    const label = scene.add.text(W / 2, 84, '',
      EduCore.textStyle(24, { weight: '800', color: '#FFFFFF', align: 'center' })).setOrigin(0.5);
    const xpText = scene.add.text(rtl ? 64 : W - 64, 40, '',
      EduCore.textStyle(24, { weight: '800', color: '#FFC800', align: 'center' })).setOrigin(0.5);
    c.add([label, xpText]);
    // Stage-scoped sessions (one level per session, as in a world stage)
    // seed the strip with the levels already completed in earlier stages,
    // so the four-step ladder reads as one continuous journey.
    scene._lessonHud = { container: c, pills, label, xpText, doneIds: new Set(doneLevels || []) };
    refreshLessonHud(scene, currentId || LEVELS[0].id);
  }

  function refreshLessonHud(scene, currentId) {
    const hud = scene._lessonHud;
    if (!hud) return;
    const lang = EduCore.lang === 'ar' ? 'ar' : 'en';
    for (const p of hud.pills) {
      p.g.clear();
      const done = hud.doneIds.has(p.id);
      const current = p.id === currentId;
      p.g.fillStyle(done ? 0x58cc02 : current ? 0xffffff : 0x000000, done ? 1 : current ? 0.95 : 0.3);
      p.g.fillCircle(p.x, 40, 22);
      if (current) {
        p.g.lineStyle(4, 0xffc800, 1);
        p.g.strokeCircle(p.x, 40, 27);
      }
      p.glyph.setAlpha(done || current ? 1 : 0.45);
    }
    const lv = LEVELS.find((l) => l.id === currentId);
    hud.label.setText(lv ? lv[lang] : '');
    refreshLessonXp(scene);
  }

  function refreshLessonXp(scene) {
    const hud = scene._lessonHud;
    if (hud) hud.xpText.setText(EduCore.fmtNum(EduCore.session.xp) + ' ' + EduCore.t('xp'));
  }

  /** Success-only reward juice: points count up and the bee flies in. */
  function awardXp(scene, n, beeKind) {
    if (n) {
      EduCore.session.xp += n;
      scene.feel.popText(W / 2, H * 0.42, '+' + EduCore.fmtNum(n) + ' ' + EduCore.t('xp'), { color: '#FFC800' });
      refreshLessonXp(scene);
      scene.refreshHud();
    }
    celebrate(scene, beeKind || 'correct');
  }

  /**
   * The bee is celebration-only in lesson mode: she appears after a success,
   * reacts, and leaves. She is never a persistent HUD element here.
   */
  function celebrate(scene, kind) {
    const b = scene.buddy;
    if (!b || b._lessonCelebrating) return;
    b._lessonCelebrating = true;
    const home = { x: b.x, y: b.y };
    b.setPosition(W / 2, 150);
    b.setAlpha(0);
    b.setVisible(true);
    scene.tweens.add({ targets: b, alpha: 1, y: 130, duration: 260, ease: 'Sine.easeOut' });
    b.react(kind);
    scene.time.delayedCall(1500, () => {
      scene.tweens.add({
        targets: b, alpha: 0, y: 100, duration: 260,
        onComplete: () => {
          b.setVisible(false);
          b.setAlpha(1);
          b.setPosition(home.x, home.y);
          b._lessonCelebrating = false;
        },
      });
    });
  }

  // ------------------------------------------------------------- primitives
  function stubHintApi() {
    return { button: null, onNarrow() {}, destroy() {} };
  }

  function mountField(scene, mode, geometry, guides, onStatus, extra) {
    const flb = FieldLineBuilder.create(scene, {
      x: scene.fieldStage.x,
      y: scene.fieldStage.y,
      width: scene.fieldStage.width,
      height: scene.fieldStage.height,
      mode,
      geometry,
      skin: scene.fieldSkin,
      feel: scene.feel,
      guides,
      onStatus,
      ...(extra || {}),
    });
    flb.container.setDepth(20);
    return flb;
  }

  function lessonContinue(scene, label) {
    return new Promise((resolve) => {
      const btn = GameFeel.candyButton(scene, W / 2, 1030, 320, 92, label, {
        color: EduCore.accentInt,
        onTap: () => {
          btn.destroy();
          EduCore.setTappables([]);
          resolve();
        },
      });
      btn.setDepth(30);
      EduCore.setTappables([
        { id: 'lesson_continue', label, x: W / 2, y: 1030, w: 320, h: 92, correct: true },
      ]);
    });
  }

  function levelIntro(scene, lv, index, lesson) {
    EduCore.setState('levelStart');
    refreshLessonHud(scene, lv.id);
    const lang = EduCore.lang === 'ar' ? 'ar' : 'en';
    // Multi-level lessons count their own levels; a stage-scoped session
    // shows the WORLD's stage numbering instead (lesson.stageOf), or none.
    const stepLine = lesson.stageOf
      ? tL('stepOf', { n: EduCore.fmtNum(lesson.stageOf.n), m: EduCore.fmtNum(lesson.stageOf.m) })
      : (lesson.levels || []).length > 1
        ? tL('stepOf', { n: EduCore.fmtNum(index + 1), m: EduCore.fmtNum(LEVELS.length) })
        : '';
    return new Promise((resolve) => {
      const c = scene.add.container(0, 0).setDepth(900);
      const dim = scene.add.rectangle(W / 2, H / 2, W, H, 0x0c151b, 0.72);
      const emoji = scene.add.text(W / 2, H / 2 - 120, lv.emoji,
        EduCore.textStyle(64, { align: 'center' })).setOrigin(0.5);
      const name = scene.add.text(W / 2, H / 2 - 30, lv[lang],
        EduCore.textStyle(42, { weight: '800', color: '#FFFFFF', align: 'center' })).setOrigin(0.5);
      const step = scene.add.text(W / 2, H / 2 + 30, stepLine,
        EduCore.textStyle(24, { weight: '700', color: '#AFAFAF', align: 'center' })).setOrigin(0.5);
      const tap = scene.add.text(W / 2, H / 2 + 92, EduCore.t('tapToContinue'),
        EduCore.textStyle(24, { color: '#AFAFAF', align: 'center' })).setOrigin(0.5);
      scene.tweens.add({ targets: tap, alpha: 0.4, duration: 550, yoyo: true, repeat: -1 });
      c.add([dim, emoji, name, step, tap]);
      scene.feel.cascadeIn([emoji, name, step], { stagger: 90, dy: 16 });
      GameFeel.audio.pop();
      const zone = scene.add.zone(W / 2, H / 2, W, H).setInteractive().setDepth(901);
      zone.once('pointerdown', () => {
        zone.destroy();
        c.destroy();
        resolve();
      });
    });
  }

  /**
   * The shared retry item runner — the game's OWN answer mechanic, wrapped
   * in the primary doctrine: a wrong answer costs nothing and simply comes
   * back (with the guide offering the next authored hint); success is the
   * only exit, and only success is rewarded. First-try correctness is what
   * the record keeps.
   */
  async function runLessonItem(scene, item, ctx, interaction) {
    EduCore.setState('question');
    scene.lessonFieldScene(false);
    const t0 = Date.now();
    let attempts = 0;
    let hintsUsed = 0;
    scene.lessonHideHints = true;
    scene.lessonNoReveal = true;
    for (;;) {
      attempts++;
      const result = await scene.presentItem(item, stubHintApi());
      if (result.correct) break;
      GameFeel.audio.blip();
      if (scene.guide) scene.guide.react('wrong');
      const rung = hintRungFor(attempts, (item.hints || []).length);
      if (rung >= 0) {
        hintsUsed = Math.max(hintsUsed, rung + 1);
        await scene.coachSay(item.hints[rung]);
      }
    }
    scene.lessonHideHints = false;
    scene.lessonNoReveal = false;
    const firstTry = attempts === 1;
    await scene.showExplanation(item, true);
    awardXp(scene, xpForItem(firstTry));
    recordTask(scene, {
      item, ctx, interaction, firstTry, attempts, hintsUsed, ms: Date.now() - t0,
    });
    ctx.stats.itemCount++;
    if (firstTry) ctx.stats.firstTryCount++;
    EduCore.engine.recordAnswer(firstTry); // correctness only, as always
  }

  /** One evidence write: session record + score stream, engine untouched. */
  function recordTask(scene, p) {
    const session = EduCore.session;
    session.presented++;
    if (p.firstTry) session.correct++;
    session.items.push(buildItemRecord({
      item: p.item,
      levelIndex: p.ctx.specLevelIndex == null ? 2 : p.ctx.specLevelIndex,
      level: p.ctx.levelId,
      interaction: p.interaction,
      firstTry: p.firstTry,
      attempts: p.attempts,
      hintsUsed: p.hintsUsed,
      ms: p.ms,
    }));
    EduCore.bridge.reportScore({
      xp: session.xp,
      correct: session.correct,
      presented: session.presented,
      combo: session.combo,
      itemId: p.item.id,
      wasCorrect: p.firstTry,
      hintsUsed: p.hintsUsed,
    });
  }

  function stageEvent(scene, ctx, stage, extra) {
    EduCore.bridge.reportEvent('lesson_stage', {
      stage: stage.type,
      level: ctx.levelId,
      interaction: STAGE_DEFS[stage.type].interaction,
      ...extra,
    });
  }

  // ------------------------------------------------------------- stages
  const STAGE_DEFS = {
    mcq_set: { state: 'question', interaction: 'mcq' },
    mcq: { state: 'question', interaction: 'mcq' },
    story: { state: 'story', interaction: 'observation' },
    explore: { state: 'explore', interaction: 'rotation' },
    compare: { state: 'notice', interaction: 'selection' },
    build: { state: 'discover', interaction: 'building' },
    repair: { state: 'apply', interaction: 'error_repair' },
    corner: { state: 'checkpoint', interaction: 'building' },
  };

  async function runMcqSet(scene, stage, ctx) {
    // Items live inline on the stage (world/stage specs) or reference a
    // classic spec level (session specs like the Right Angles reference).
    const fromLevel = stage.fromLevel == null ? null : EduCore.spec.levels[stage.fromLevel];
    const pool = stage.items || (fromLevel ? fromLevel.items : null);
    if (!pool || !pool.length) return;
    ctx.specLevelIndex = stage.fromLevel == null ? 1 : stage.fromLevel;
    const items = EduCore.engine.pickItems(pool, stage.pick || 3);
    for (const item of items) await runLessonItem(scene, item, ctx, 'mcq');
  }

  async function runSingleMcq(scene, stage, ctx) {
    ctx.specLevelIndex = 2;
    EduCore.setState('question');
    scene.lessonFieldScene(false);
    if (stage.intro) await scene.coachSay(stage.intro);
    await runLessonItem(scene, stage.item, ctx, 'mcq');
  }

  /** The problem made VISIBLE: the broken field shows while the guide talks. */
  async function runStory(scene, stage, ctx) {
    EduCore.setState('story');
    scene.lessonFieldScene(true);
    scene.setPrompt('');
    let flb = null;
    if (stage.display) {
      flb = mountField(scene, 'build', stage.display, 'ghost', null);
      flb.setInputEnabled(false);
    }
    for (const line of stage.lines || []) await scene.coachSay(line);
    if (flb) flb.destroy();
    stageEvent(scene, ctx, stage, { correct: true, attempts: 1 });
  }

  /** Free play: no labels, no scoring, no failure — with live wider/narrower
   *  feedback and visual handle explainers. */
  async function runExplore(scene, stage, ctx) {
    EduCore.setState('explore');
    scene.lessonFieldScene(true);
    const t0 = Date.now();
    scene.setPrompt(stage.prompt);
    const min = stage.minInteractions || 1;
    let resolveReady;
    const ready = new Promise((r) => { resolveReady = r; });

    let feedbackText = null;
    let fadeTimer = null;
    const showWord = (delta) => {
      if (Math.abs(delta) < 0.5) return;
      const word = delta > 0 ? tL('wider') : tL('narrower');
      const vertex = stage.lines && stage.lines[0] ? stage.lines[0] : { x: W / 2, y: 640 };
      if (!feedbackText) {
        feedbackText = scene.add.text(vertex.x, vertex.y - 70, '',
          EduCore.textStyle(30, { weight: '800', color: '#FFFFFF', align: 'center', stroke: '#131F24' }))
          .setOrigin(0.5).setDepth(25);
      }
      feedbackText.setText(word).setAlpha(1);
      if (fadeTimer) fadeTimer.remove();
      fadeTimer = scene.time.delayedCall(700, () => {
        if (feedbackText) scene.tweens.add({ targets: feedbackText, alpha: 0, duration: 250 });
      });
    };

    const flb = mountField(scene, 'explore', stage, 'none', (s) => {
      if (s.type === 'angle') showWord(s.delta);
      if (s.type === 'interact' && s.interactions >= min) resolveReady();
    }, { handleGuides: stage.handleGuides !== false });
    await ready;
    await lessonContinue(scene, stage.continueLabel || EduCore.t('tapToContinue'));
    if (feedbackText) feedbackText.destroy();
    flb.destroy();
    awardXp(scene, STAGE_XP.explore);
    stageEvent(scene, ctx, stage, { correct: true, attempts: 1, ms: Date.now() - t0 });
    scene.setPrompt('');
  }

  /** Compare arrangements — a wrong look costs nothing, just look again. */
  async function runCompare(scene, stage, ctx) {
    EduCore.setState('notice');
    scene.lessonFieldScene(true);
    const t0 = Date.now();
    scene.setPrompt(stage.prompt);
    let attempts = 0;
    let onSelect = null;
    const flb = mountField(scene, 'compare', { arrangements: stage.arrangements }, 'none', (s) => {
      if (s.type === 'select' && onSelect) onSelect(s.index);
    });
    const cardTappables = () => flb.compareRects.map((rc, i) => ({
      id: 'arrangement' + i,
      label: String(i),
      x: rc.x + rc.w / 2,
      y: rc.y + rc.h / 2,
      w: rc.w,
      h: rc.h,
      correct: i === stage.correctIndex,
    }));
    EduCore.setTappables(cardTappables());
    await new Promise((resolve) => {
      onSelect = async (idx) => {
        const handler = onSelect;
        onSelect = null;
        EduCore.setTappables([]);
        attempts++;
        if (idx === stage.correctIndex) {
          const rc = flb.compareRects[idx];
          scene.feel.sparkle(rc.x + rc.w / 2, rc.y + rc.h / 2, 0x9be24a, 8);
          await scene.coachSay(stage.feedbackCorrect);
          resolve();
        } else {
          GameFeel.audio.blip();
          if (scene.guide) scene.guide.react('wrong');
          await scene.coachSay(stage.feedbackRetry);
          EduCore.setTappables(cardTappables());
          onSelect = handler;
        }
      };
    });
    flb.destroy();
    awardXp(scene, attempts === 1 ? STAGE_XP.compare : STAGE_XP.compareRetry);
    stageEvent(scene, ctx, stage, { correct: true, attempts, ms: Date.now() - t0 });
    scene.setPrompt('');
  }

  /** Build the target shape; the reveal happens ONLY after success. */
  async function runBuild(scene, stage, ctx) {
    EduCore.setState('discover');
    scene.lessonFieldScene(true);
    const t0 = Date.now();
    scene.setPrompt(stage.prompt);
    let attempts = 0;
    let stallHinted = false;
    let resolveSolved;
    const solvedP = new Promise((r) => { resolveSolved = r; });
    const flb = mountField(scene, 'build', stage, stage.guides || 'ghost', (s) => {
      if (s.type === 'interact' && !stallHinted && stage.stallHint && s.interactions >= 8 && !flb.isSolved()) {
        stallHinted = true;
        flb.setInputEnabled(false);
        scene.coachSay(stage.stallHint).then(() => flb.setInputEnabled(true));
      }
      if (s.type !== 'validate') return;
      attempts++;
      if (s.solved) resolveSolved(s.corners);
    });
    const corners = await solvedP;
    flb.setInputEnabled(false);
    flb.highlightCorners(corners);
    scene.feel.celebrate();
    GameFeel.audio.cheer();
    awardXp(scene, STAGE_XP.build, 'levelComplete');
    for (const line of stage.reveal || []) await scene.coachSay(line);
    flb.destroy();
    stageEvent(scene, ctx, stage, { correct: true, attempts, ms: Date.now() - t0 });
    scene.setPrompt('');
  }

  /** Repair the broken piece — transfer through error-fixing. */
  async function runRepair(scene, stage, ctx) {
    EduCore.setState('apply');
    scene.lessonFieldScene(true);
    const t0 = Date.now();
    scene.setPrompt(stage.prompt);
    let attempts = 0;
    let resolveSolved;
    const solvedP = new Promise((r) => { resolveSolved = r; });
    const flb = mountField(scene, 'repair', stage, stage.guides || 'none', (s) => {
      if (s.type !== 'validate') return;
      attempts++;
      if (s.solved) resolveSolved(s.corners);
    });
    const corners = await solvedP;
    flb.setInputEnabled(false);
    flb.highlightCorners(corners);
    GameFeel.audio.cheer();
    awardXp(scene, STAGE_XP.repair);
    if (stage.success) await scene.coachSay(stage.success);
    flb.destroy();
    stageEvent(scene, ctx, stage, { correct: true, attempts, ms: Date.now() - t0 });
    scene.setPrompt('');
  }

  /** Fresh construction checkpoint: support arrives only AFTER a failed
   *  first attempt, and supported success is recorded as supported. */
  async function runCorner(scene, stage, ctx) {
    EduCore.setState('checkpoint');
    scene.lessonFieldScene(true);
    const t0 = Date.now();
    scene.setPrompt(stage.prompt);
    let attempts = 0;
    let supported = false;
    let resolveSolved;
    const solvedP = new Promise((r) => { resolveSolved = r; });
    const flb = mountField(scene, 'corner', stage, stage.guides || 'none', (s) => {
      if (s.type !== 'validate') return;
      attempts++;
      if (s.solved) {
        resolveSolved(s.corners);
        return;
      }
      if (!supported && stage.hintAfterFail) {
        supported = true;
        flb.setInputEnabled(false);
        scene.coachSay(stage.hintAfterFail).then(() => flb.setInputEnabled(true));
      }
    });
    const corners = await solvedP;
    flb.setInputEnabled(false);
    flb.highlightCorners(corners);
    GameFeel.audio.cheer();
    await new Promise((r) => scene.time.delayedCall(700, r));
    flb.destroy();
    const firstTry = attempts === 1 && !supported;
    awardXp(scene, firstTry ? STAGE_XP.corner : STAGE_XP.cornerSupported);
    recordTask(scene, {
      item: {
        id: stage.id, prompt: stage.prompt,
        concepts: stage.concepts || [], difficulty: stage.difficulty || 3, hints: [],
      },
      ctx, interaction: 'building', firstTry, attempts,
      hintsUsed: supported ? 1 : 0, ms: Date.now() - t0,
    });
    ctx.stats.itemCount++;
    if (firstTry) ctx.stats.firstTryCount++;
    stageEvent(scene, ctx, stage, { correct: firstTry, attempts, ms: Date.now() - t0 });
    scene.setPrompt('');
  }

  async function runBadge(scene, lesson) {
    EduCore.setState('reward');
    scene.lessonFieldScene(false);
    const b = lesson.badge;
    if (!b) return;
    const c = scene.add.container(W / 2, H * 0.4).setDepth(40).setScale(0);
    const pill = scene.add.graphics();
    pill.fillStyle(GameFeel.darken(0xffc800, 0.3), 1);
    pill.fillRoundedRect(-230, -50, 460, 112, 56);
    pill.fillStyle(0xffc800, 1);
    pill.fillRoundedRect(-230, -56, 460, 112, 56);
    const txt = scene.add.text(0, 0, '🏅 ' + b.name,
      EduCore.textStyle(38, { weight: '800', color: '#5A3E00', align: 'center' })).setOrigin(0.5);
    c.add([pill, txt]);
    scene.tweens.add({ targets: c, scale: 1, duration: 420, ease: 'Back.easeOut' });
    scene.feel.celebrate();
    GameFeel.audio.celebration();
    celebrate(scene, 'mastery');
    if (scene.guide) scene.guide.react('correct');
    // reportEvent wraps payloads as {name, ...p} — the display name rides as
    // `title` so it can never shadow the event name.
    EduCore.bridge.reportEvent('lesson_badge', { id: b.id, title: b.name, concept: lesson.concept });
    if (b.line) await scene.coachSay(b.line);
    c.destroy();
  }

  const STAGE_RUNNERS = {
    mcq_set: runMcqSet,
    mcq: runSingleMcq,
    story: runStory,
    explore: runExplore,
    compare: runCompare,
    build: runBuild,
    repair: runRepair,
    corner: runCorner,
  };

  // ------------------------------------------------------------- orchestrator
  /**
   * Run the lesson. `prelude` (optional async fn) is the game's own opening
   * — typically its classic tutorial — executed AFTER the calm lesson HUD is
   * applied, so a lesson session never flashes hearts or the classic chrome.
   */
  async function run(scene, lesson, prelude) {
    const S = { levelId: null, levelIndex: -1, stageType: null, stageIndex: -1 };
    const getLesson = () => ({ ...S, xp: EduCore.session.xp });
    if (typeof window !== 'undefined' && window.EduMindDebug) {
      window.EduMindDebug.getLesson = getLesson;
    }
    const firstEntry = (lesson.levels || [])[0];
    const firstLv = firstEntry
      ? LEVELS.find((l) => l.id === firstEntry.level) || LEVELS[0]
      : LEVELS[0];
    applyLessonHud(scene, lesson.doneLevels, firstLv.id);

    try {
      if (prelude) await prelude();
      for (let li = 0; li < (lesson.levels || []).length; li++) {
        const entry = lesson.levels[li];
        const lv = LEVELS.find((l) => l.id === entry.level) || LEVELS[li];
        S.levelId = lv.id;
        S.levelIndex = li;
        const levelT0 = Date.now();
        await levelIntro(scene, lv, li, lesson);
        const ctx = { lesson, levelId: lv.id, stats: { itemCount: 0, firstTryCount: 0 } };
        for (let si = 0; si < (entry.stages || []).length; si++) {
          const stage = entry.stages[si];
          S.stageType = stage.type;
          S.stageIndex = si;
          const runner = STAGE_RUNNERS[stage.type];
          if (runner) await runner(scene, stage, ctx);
        }
        const ratio = ctx.stats.itemCount
          ? ctx.stats.firstTryCount / ctx.stats.itemCount
          : 1;
        EduCore.session.levelScores.push(ratio);
        EduCore.engine.recordLevel(ratio);
        EduCore.session.xp += LEVEL_XP;
        refreshLessonXp(scene);
        scene.refreshHud();
        hudMarkDone(scene, lv.id);
        celebrate(scene, 'levelComplete');
        EduCore.bridge.reportEvent('lesson_level', {
          level: lv.id, ratio, ms: Date.now() - levelT0,
        });
        await new Promise((r) => scene.time.delayedCall(900, r));
      }
      await runBadge(scene, lesson);
    } finally {
      if (typeof window !== 'undefined' && window.EduMindDebug &&
          window.EduMindDebug.getLesson === getLesson) {
        delete window.EduMindDebug.getLesson;
      }
    }
  }

  function hudMarkDone(scene, levelId) {
    const hud = scene._lessonHud;
    if (!hud) return;
    hud.doneIds.add(levelId);
    refreshLessonHud(scene, levelId);
  }

  window.LessonCore = {
    LEVELS,
    INTERACTIONS,
    STAGE_XP,
    LEVEL_XP,
    xpForItem,
    hintRungFor,
    buildItemRecord,
    run,
  };
})();
