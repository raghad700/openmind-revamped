/**
 * FieldLineBuilder — a reusable "arrange the lines" manipulative.
 *
 * A small line-segment workbench a game scene can mount for learning stages:
 * the student drags a line by its pivot cap (translate, grid snap) or by its
 * far-end handle (rotate, angle snap) to explore, compare, build or repair
 * arrangements — e.g. discovering the right angles of a rectangle.
 *
 * INDEPENDENCE DOCTRINE (why this file is not part of any one game):
 *  - `geometry` config (line poses, targets, snap, tolerances) is educational
 *    data and comes verbatim from the injected spec. It decides correctness.
 *  - `skin` config (colors, stroke widths) is presentation and comes from the
 *    hosting game. It can never change a pose, a target, or a tolerance, so
 *    reskinning per theme/interest cannot alter the learning content.
 *  - The component renders NO text. Prompts, feedback and labels belong to
 *    the scene (EduCore.textStyle), which owns language and RTL correctly.
 *
 * Interaction is one-finger pointer only, mirroring draw_connect's manual
 * pointer tracking (no draggable plugin, no key input of any kind). All
 * poses live in the fixed 720x1280 stage space.
 *
 * The pure helpers under `FieldLineBuilder.geometry` take and return plain
 * data (no Phaser), so they are unit-tested in a bare VM sandbox.
 */
(function () {
  'use strict';

  const GRAB_RADIUS = 40; // px around a cap/handle that captures a touch (>=44px zone)
  const DEFAULT_TOL_DEG = 4;

  // ------------------------------------------------------------------ pure geometry

  function normalizeDeg(a) {
    let d = a % 360;
    if (d < 0) d += 360;
    return d;
  }

  function snapAngle(a, step) {
    if (!step) return normalizeDeg(a);
    return normalizeDeg(Math.round(a / step) * step);
  }

  function snapCoord(v, grid) {
    return grid ? Math.round(v / grid) * grid : v;
  }

  /** Far end of a pose (pivot + length along angleDeg; y grows downward). */
  function endpointOf(pose) {
    const r = (pose.angleDeg * Math.PI) / 180;
    return { x: pose.x + Math.cos(r) * pose.length, y: pose.y + Math.sin(r) * pose.length };
  }

  function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  /** Smallest angle between two directions, folded into [0, 180]. */
  function innerAngleDeg(aDeg, bDeg) {
    const d = Math.abs(normalizeDeg(aDeg) - normalizeDeg(bDeg)) % 360;
    return d > 180 ? 360 - d : d;
  }

  function isRightAngle(angleDeg, tol) {
    return Math.abs(angleDeg - 90) <= (tol == null ? DEFAULT_TOL_DEG : tol);
  }

  /**
   * Assisted (magnetic) seating: when a released pose lands close enough to
   * its target — pivot within magnetPx AND direction within one snap step —
   * return the exact target pose; otherwise null. Purely advisory: the
   * caller decides to apply it, and a spec that sets no `snap.magnet`
   * changes nothing.
   */
  function magnetAdjust(pose, target, opts) {
    const magnetPx = (opts && opts.magnetPx) || 0;
    if (!magnetPx || !target) return null;
    const step = (opts && opts.angleStep) || 15;
    if (distance({ x: pose.x, y: pose.y }, { x: target.x, y: target.y }) > magnetPx) return null;
    if (innerAngleDeg(pose.angleDeg, target.angleDeg) > step) return null;
    return { x: target.x, y: target.y, angleDeg: normalizeDeg(target.angleDeg) };
  }

  /**
   * Shared angle-glyph renderer: two arms meeting at a vertex, drawn into an
   * existing Graphics object. The second arm opens UPWARD on screen so a
   * glyph reads naturally. With `marker`, a right angle gets the canonical
   * small square; any other angle gets a small arc. Pure drawing — no text.
   */
  function drawAngle(g, x, y, opts) {
    const o = opts || {};
    const arm = o.arm == null ? 70 : o.arm;
    const color = o.color == null ? 0xf2f6f8 : o.color;
    const width = o.width == null ? 8 : o.width;
    const angle = normalizeDeg(o.angleDeg == null ? 90 : o.angleDeg);
    const r = (-angle * Math.PI) / 180;
    g.lineStyle(width, color, 1);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + arm, y);
    g.strokePath();
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(r) * arm, y + Math.sin(r) * arm);
    g.strokePath();
    if (o.marker) {
      const mc = o.markerColor == null ? color : o.markerColor;
      g.lineStyle(Math.max(3, width - 4), mc, 1);
      if (Math.abs(angle - 90) <= 4) {
        const s = o.markerSize == null ? 20 : o.markerSize;
        g.strokeRect(x, y - s, s, s);
      } else {
        g.beginPath();
        g.arc(x, y, o.markerSize == null ? 22 : o.markerSize, r, 0);
        g.strokePath();
      }
    }
    g.fillStyle(o.capColor == null ? color : o.capColor, 1);
    g.fillCircle(x, y, o.capRadius == null ? 7 : o.capRadius);
  }

  /**
   * Find corners: pairs of line ends (from different lines) that sit within
   * joinDistance. Each corner reports the joint point and the inner angle
   * between the two lines' directions pointing AWAY from the joint.
   */
  function joinCorners(lines, joinDistance, tol) {
    const ends = [];
    lines.forEach((l, li) => {
      const far = endpointOf(l);
      ends.push({ li, point: { x: l.x, y: l.y }, awayDeg: l.angleDeg });
      ends.push({ li, point: far, awayDeg: normalizeDeg(l.angleDeg + 180) });
    });
    const used = new Set();
    const corners = [];
    for (let i = 0; i < ends.length; i++) {
      if (used.has(i)) continue;
      let best = -1;
      let bestD = joinDistance;
      for (let j = i + 1; j < ends.length; j++) {
        if (used.has(j) || ends[j].li === ends[i].li) continue;
        const d = distance(ends[i].point, ends[j].point);
        if (d <= bestD) {
          bestD = d;
          best = j;
        }
      }
      if (best >= 0) {
        used.add(i);
        used.add(best);
        const a = ends[i];
        const b = ends[best];
        const angle = innerAngleDeg(a.awayDeg, b.awayDeg);
        corners.push({
          point: { x: (a.point.x + b.point.x) / 2, y: (a.point.y + b.point.y) / 2 },
          angleDeg: angle,
          ok: isRightAngle(angle, tol),
        });
      }
    }
    return corners;
  }

  /** The four sides of a target rect as canonical poses (clockwise). */
  function rectSides(rect) {
    return [
      { x: rect.x, y: rect.y, angleDeg: 0, length: rect.w },
      { x: rect.x + rect.w, y: rect.y, angleDeg: 90, length: rect.h },
      { x: rect.x + rect.w, y: rect.y + rect.h, angleDeg: 180, length: rect.w },
      { x: rect.x, y: rect.y + rect.h, angleDeg: 270, length: rect.h },
    ];
  }

  /** Does the pose cover the side as a segment (either end may be the pivot)? */
  function poseCoversSide(pose, side, joinDistance) {
    const pEnd = endpointOf(pose);
    const sStart = { x: side.x, y: side.y };
    const sEnd = endpointOf(side);
    return (
      (distance({ x: pose.x, y: pose.y }, sStart) <= joinDistance && distance(pEnd, sEnd) <= joinDistance) ||
      (distance({ x: pose.x, y: pose.y }, sEnd) <= joinDistance && distance(pEnd, sStart) <= joinDistance)
    );
  }

  /**
   * Build/repair solution state against a target rect: which sides are
   * covered, the joined corners, and whether the arrangement is solved
   * (every side covered by a distinct line).
   */
  function rectangleCheck(lines, opts) {
    const join = opts.joinDistance == null ? 28 : opts.joinDistance;
    const tol = opts.toleranceDeg == null ? DEFAULT_TOL_DEG : opts.toleranceDeg;
    const sides = rectSides(opts.rect);
    const claimed = new Set();
    const covered = sides.map((side) => {
      for (let i = 0; i < lines.length; i++) {
        if (claimed.has(i)) continue;
        if (poseCoversSide(lines[i], side, join)) {
          claimed.add(i);
          return true;
        }
      }
      return false;
    });
    const corners = joinCorners(lines, join, tol);
    return { solved: covered.every(Boolean), covered, corners };
  }

  /**
   * Corner-construction state: two lines sharing a pivot; solved when their
   * inner angle matches targetAngleDeg within tolerance.
   */
  function cornerCheck(lines, targetAngleDeg, opts) {
    const join = (opts && opts.joinDistance) == null ? 28 : opts.joinDistance;
    const tol = (opts && opts.toleranceDeg) == null ? DEFAULT_TOL_DEG : opts.toleranceDeg;
    if (lines.length < 2) return { solved: false, corners: [] };
    const a = lines[0];
    const b = lines[1];
    const joined = distance({ x: a.x, y: a.y }, { x: b.x, y: b.y }) <= join;
    const angle = innerAngleDeg(a.angleDeg, b.angleDeg);
    const ok = joined && Math.abs(angle - targetAngleDeg) <= tol;
    return {
      solved: ok,
      corners: [{ point: { x: a.x, y: a.y }, angleDeg: angle, ok }],
    };
  }

  /**
   * Assign each unlocked line a target pose for a build/repair rect. Sides
   * already covered by locked lines are excluded; remaining sides are matched
   * by closest length then closest pivot, deterministically in line order.
   * Of a side's two orientations (either corner as pivot), the nearer one to
   * the line's current pivot is chosen.
   */
  function assignBuildTargets(lines, rect, joinDistance) {
    const join = joinDistance == null ? 28 : joinDistance;
    const sides = rectSides(rect);
    const openSides = sides.filter(
      (side) => !lines.some((l) => l.locked && poseCoversSide(l, side, join))
    );
    const taken = new Set();
    return lines.map((line) => {
      if (line.locked) return null;
      let best = null;
      let bestCost = Infinity;
      openSides.forEach((side, si) => {
        if (taken.has(si)) return;
        const sEnd = endpointOf(side);
        const optA = { x: side.x, y: side.y, angleDeg: side.angleDeg, length: side.length };
        const optB = { x: sEnd.x, y: sEnd.y, angleDeg: normalizeDeg(side.angleDeg + 180), length: side.length };
        for (const cand of [optA, optB]) {
          const cost =
            Math.abs(side.length - line.length) * 1000 +
            distance({ x: line.x, y: line.y }, { x: cand.x, y: cand.y });
          if (cost < bestCost) {
            bestCost = cost;
            best = { side: si, pose: cand };
          }
        }
      });
      if (!best) return null;
      taken.add(best.side);
      return best.pose;
    });
  }

  /**
   * Next drags that move the arrangement toward its target — the automation
   * affordance (a linear drag from `a` to `b` lands the exact pose thanks to
   * snapping). Move first, then rotate; empty when nothing is needed.
   */
  function suggestedDrags(state) {
    const { mode, lines, geometry } = state;
    const drags = [];
    const snap = geometry.snap || {};
    const join = snap.joinDistance == null ? 28 : snap.joinDistance;
    const tol = geometry.toleranceDeg == null ? DEFAULT_TOL_DEG : geometry.toleranceDeg;

    if (mode === 'explore') {
      if (state.interactions >= (geometry.minInteractions || 1)) return [];
      const free = lines.find((l) => !l.locked);
      if (!free) return [];
      const from = endpointOf(free);
      const to = endpointOf({ ...free, angleDeg: normalizeDeg(free.angleDeg + 45) });
      return [{ ax: from.x, ay: from.y, bx: to.x, by: to.y, kind: 'rotate' }];
    }

    if (mode === 'build' || mode === 'repair') {
      const targets = assignBuildTargets(lines, geometry.target.rect, join);
      lines.forEach((line, i) => {
        const t = targets[i];
        if (!t) return;
        const pivotOff = distance({ x: line.x, y: line.y }, { x: t.x, y: t.y }) > join;
        if (pivotOff) {
          drags.push({ ax: line.x, ay: line.y, bx: t.x, by: t.y, kind: 'move' });
          return;
        }
        if (innerAngleDeg(line.angleDeg, t.angleDeg) > tol) {
          const from = endpointOf(line);
          const to = endpointOf({ ...t, length: line.length });
          drags.push({ ax: from.x, ay: from.y, bx: to.x, by: to.y, kind: 'rotate' });
        }
      });
      return drags;
    }

    if (mode === 'corner') {
      const locked = lines.find((l) => l.locked) || lines[0];
      const free = lines.find((l) => !l.locked);
      if (!free) return [];
      const target = geometry.targetAngleDeg == null ? 90 : geometry.targetAngleDeg;
      if (Math.abs(innerAngleDeg(locked.angleDeg, free.angleDeg) - target) <= tol) return [];
      const candA = normalizeDeg(locked.angleDeg + target);
      const candB = normalizeDeg(locked.angleDeg - target);
      const pick =
        innerAngleDeg(free.angleDeg, candA) <= innerAngleDeg(free.angleDeg, candB) ? candA : candB;
      const from = endpointOf(free);
      const to = endpointOf({ ...free, angleDeg: pick });
      return [{ ax: from.x, ay: from.y, bx: to.x, by: to.y, kind: 'rotate' }];
    }

    return []; // compare mode is tap-driven
  }

  // ------------------------------------------------------------------ component

  /**
   * Mount the manipulative on a scene.
   *
   * config = {
   *   x, y, width, height,       stage rect in 720x1280 coords
   *   mode,                      'explore' | 'compare' | 'build' | 'repair' | 'corner'
   *   geometry,                  spec data: lines, target/targetAngleDeg,
   *                              snap {angleDeg, grid, joinDistance},
   *                              toleranceDeg, arrangements, minInteractions
   *   skin,                      colors/strokes only (host-owned)
   *   feel,                      the scene's GameFeel instance (shared juice)
   *   guides,                    'ghost' | 'none' (build target outline)
   *   onStatus(s),               {type:'interact'|'select'|'validate', ...}
   * }
   */
  function create(scene, config) {
    const geo = config.geometry || {};
    const skin = config.skin || {};
    const feel = config.feel;
    const snap = geo.snap || {};
    const mode = config.mode;
    const lineColor = skin.lineColor == null ? 0xf2f6f8 : skin.lineColor;
    const capColor = skin.capColor == null ? 0xffc800 : skin.capColor;
    const handleColor = skin.rotateHandleColor == null ? 0x1cb0f6 : skin.rotateHandleColor;
    const ghostColor = skin.ghostColor == null ? 0xffffff : skin.ghostColor;
    const glowColor = skin.jointGlowColor == null ? 0x9be24a : skin.jointGlowColor;
    const cardColor = skin.cardColor == null ? 0x16242c : skin.cardColor;
    const lineWidth = skin.lineWidth == null ? 10 : skin.lineWidth;

    const lines = (geo.lines || []).map((l) => ({
      x: l.x, y: l.y, angleDeg: normalizeDeg(l.angleDeg), length: l.length, locked: !!l.locked,
    }));

    const state = {
      mode,
      lines,
      geometry: geo,
      interactions: 0,
      solved: false,
      inputEnabled: true,
    };

    const container = scene.add.container(0, 0);
    const ghostG = scene.add.graphics();
    const linesG = scene.add.graphics();
    const marksG = scene.add.graphics();
    const guidesG = scene.add.graphics();
    container.add([ghostG, linesG, marksG, guidesG]);

    // Visual handle explainer (explore): pulsing rings + a straight two-way
    // arrow on the move cap and a curved arrow on the rotate handle. Pure
    // pictographs (no text); they fade out on the first real interaction.
    let guidesTween = null;
    function drawHandleGuides() {
      const free = lines.find((l) => !l.locked);
      if (!free) return;
      const end = endpointOf(free);
      guidesG.clear();
      guidesG.lineStyle(4, ghostColor, 0.9);
      guidesG.strokeCircle(free.x, free.y, 26);
      const ay = free.y - 46;
      guidesG.beginPath();
      guidesG.moveTo(free.x - 24, ay);
      guidesG.lineTo(free.x + 24, ay);
      guidesG.strokePath();
      guidesG.fillStyle(ghostColor, 0.9);
      guidesG.fillTriangle(free.x - 36, ay, free.x - 24, ay - 8, free.x - 24, ay + 8);
      guidesG.fillTriangle(free.x + 36, ay, free.x + 24, ay - 8, free.x + 24, ay + 8);
      guidesG.lineStyle(4, ghostColor, 0.9);
      guidesG.strokeCircle(end.x, end.y, 22);
      guidesG.beginPath();
      guidesG.arc(end.x, end.y, 40, -Math.PI * 0.85, -Math.PI * 0.2);
      guidesG.strokePath();
      const tipA = -Math.PI * 0.2;
      const tx = end.x + Math.cos(tipA) * 40;
      const ty = end.y + Math.sin(tipA) * 40;
      guidesG.fillTriangle(tx + 9, ty + 3, tx - 7, ty - 8, tx - 3, ty + 11);
    }
    function fadeGuides() {
      if (!config.handleGuides || guidesG.alpha === 0) return;
      if (guidesTween) {
        guidesTween.stop();
        guidesTween = null;
      }
      scene.tweens.add({ targets: guidesG, alpha: 0, duration: 350, onComplete: () => guidesG.clear() });
    }
    if (config.handleGuides) {
      drawHandleGuides();
      guidesTween = scene.tweens.add({
        targets: guidesG, alpha: { from: 1, to: 0.35 }, duration: 650, yoyo: true, repeat: -1,
      });
    }

    const compareRects = [];
    if (mode === 'compare') {
      const n = (geo.arrangements || []).length;
      const cw = 176;
      const ch = 210;
      const cy = config.y + config.height / 2;
      for (let i = 0; i < n; i++) {
        const cx = config.x + ((i + 0.5) * config.width) / n;
        compareRects.push({ x: cx - cw / 2, y: cy - ch / 2, w: cw, h: ch });
      }
    }

    function validateNow() {
      if (mode === 'build' || mode === 'repair') {
        return rectangleCheck(lines, {
          rect: geo.target.rect,
          joinDistance: snap.joinDistance,
          toleranceDeg: geo.toleranceDeg,
        });
      }
      if (mode === 'corner') {
        return cornerCheck(lines, geo.targetAngleDeg == null ? 90 : geo.targetAngleDeg, {
          joinDistance: snap.joinDistance,
          toleranceDeg: geo.toleranceDeg,
        });
      }
      return { solved: false, corners: [] };
    }

    function dashedLine(g, ax, ay, bx, by) {
      const seg = 14;
      const gap = 9;
      const total = Math.hypot(bx - ax, by - ay);
      const ux = (bx - ax) / total;
      const uy = (by - ay) / total;
      for (let d = 0; d < total; d += seg + gap) {
        const e = Math.min(d + seg, total);
        g.beginPath();
        g.moveTo(ax + ux * d, ay + uy * d);
        g.lineTo(ax + ux * e, ay + uy * e);
        g.strokePath();
      }
    }

    function redraw() {
      ghostG.clear();
      if (config.guides === 'ghost' && geo.target && geo.target.rect) {
        ghostG.lineStyle(3, ghostColor, 0.35);
        const r = geo.target.rect;
        dashedLine(ghostG, r.x, r.y, r.x + r.w, r.y);
        dashedLine(ghostG, r.x + r.w, r.y, r.x + r.w, r.y + r.h);
        dashedLine(ghostG, r.x + r.w, r.y + r.h, r.x, r.y + r.h);
        dashedLine(ghostG, r.x, r.y + r.h, r.x, r.y);
      }

      linesG.clear();
      if (mode === 'compare') {
        for (let i = 0; i < compareRects.length; i++) {
          const rc = compareRects[i];
          linesG.fillStyle(cardColor, 0.92);
          linesG.fillRoundedRect(rc.x, rc.y, rc.w, rc.h, 16);
          linesG.lineStyle(3, lineColor, 0.35);
          linesG.strokeRoundedRect(rc.x, rc.y, rc.w, rc.h, 16);
          const arr = geo.arrangements[i];
          const vx = rc.x + rc.w / 2 - 28;
          const vy = rc.y + rc.h / 2 + 42;
          drawAngle(linesG, vx, vy, {
            angleDeg: arr.angleDeg, arm: 88, color: lineColor, width: 8, capColor,
          });
        }
        return;
      }

      // Assisted-build feedback: a line already covering one of the target
      // sides reads as "seated" — brighter, glowing, pinned at both ends.
      const seatSides = (mode === 'build' || mode === 'repair') && geo.target && geo.target.rect
        ? rectSides(geo.target.rect)
        : null;
      const seatJoin = snap.joinDistance == null ? 28 : snap.joinDistance;

      for (const l of lines) {
        const end = endpointOf(l);
        const seated = seatSides ? seatSides.some((s) => poseCoversSide(l, s, seatJoin)) : false;
        linesG.lineStyle(lineWidth + 4, 0x0c151b, 0.35);
        linesG.beginPath();
        linesG.moveTo(l.x, l.y + 3);
        linesG.lineTo(end.x, end.y + 3);
        linesG.strokePath();
        if (seated) {
          linesG.lineStyle(lineWidth + 8, glowColor, 0.3);
          linesG.beginPath();
          linesG.moveTo(l.x, l.y);
          linesG.lineTo(end.x, end.y);
          linesG.strokePath();
        }
        linesG.lineStyle(seated ? lineWidth + 2 : lineWidth, lineColor, l.locked ? 0.9 : 1);
        linesG.beginPath();
        linesG.moveTo(l.x, l.y);
        linesG.lineTo(end.x, end.y);
        linesG.strokePath();
        if (seated) {
          linesG.fillStyle(glowColor, 1);
          linesG.fillCircle(l.x, l.y, 5);
          linesG.fillCircle(end.x, end.y, 5);
        }
        if (!l.locked && state.inputEnabled) {
          linesG.fillStyle(capColor, 1);
          linesG.fillCircle(l.x, l.y, 15);
          linesG.lineStyle(3, 0x0c151b, 0.4);
          linesG.strokeCircle(l.x, l.y, 15);
          linesG.fillStyle(handleColor, 1);
          linesG.fillCircle(end.x, end.y, 12);
          linesG.lineStyle(3, 0x0c151b, 0.4);
          linesG.strokeCircle(end.x, end.y, 12);
          linesG.fillStyle(0xffffff, 0.9);
          linesG.fillCircle(end.x, end.y, 4);
        } else {
          linesG.fillStyle(lineColor, 0.7);
          linesG.fillCircle(l.x, l.y, 6);
          linesG.fillCircle(end.x, end.y, 6);
        }
      }
    }

    /** Small square markers — the canonical right-angle notation. */
    function highlightCorners(corners) {
      marksG.clear();
      const s = 26;
      for (const c of corners || []) {
        if (!c.ok) continue;
        marksG.lineStyle(4, glowColor, 1);
        marksG.strokeRect(c.point.x - s / 2, c.point.y - s / 2, s, s);
        if (feel) feel.sparkle(c.point.x, c.point.y, glowColor, 6);
      }
    }

    // ---------------- pointer handling (manual, one finger, like draw_connect)
    let drag = null; // { line, kind:'move'|'rotate', startPose }
    let lastAngleEmit = 0;
    let lastAngleVal = null;

    function grabbableAt(px, py) {
      let best = null;
      let bestD = GRAB_RADIUS;
      for (const l of lines) {
        if (l.locked) continue;
        const end = endpointOf(l);
        const dEnd = Math.hypot(px - end.x, py - end.y);
        if (dEnd <= bestD) {
          bestD = dEnd;
          best = { line: l, kind: 'rotate' };
        }
        const dPivot = Math.hypot(px - l.x, py - l.y);
        if (dPivot < bestD) {
          bestD = dPivot;
          best = { line: l, kind: 'move' };
        }
      }
      return best;
    }

    function inside(rc, px, py) {
      return px >= rc.x && px <= rc.x + rc.w && py >= rc.y && py <= rc.y + rc.h;
    }

    function onDown(pointer) {
      if (!state.inputEnabled) return;
      const px = pointer.x;
      const py = pointer.y;
      if (mode === 'compare') {
        for (let i = 0; i < compareRects.length; i++) {
          if (inside(compareRects[i], px, py)) {
            if (feel) feel.wiggle(container, 0.5);
            config.onStatus && config.onStatus({ type: 'select', index: i });
            return;
          }
        }
        return;
      }
      const hit = grabbableAt(px, py);
      if (!hit) return;
      drag = { line: hit.line, kind: hit.kind, startPose: { ...hit.line } };
      if (window.GameFeel) window.GameFeel.audio.pop();
    }

    function onMove(pointer) {
      if (!drag || !state.inputEnabled) return;
      const l = drag.line;
      if (drag.kind === 'move') {
        l.x = Math.min(Math.max(pointer.x, config.x), config.x + config.width);
        l.y = Math.min(Math.max(pointer.y, config.y), config.y + config.height);
      } else {
        l.angleDeg = normalizeDeg((Math.atan2(pointer.y - l.y, pointer.x - l.x) * 180) / Math.PI);
        // Live opening feedback while rotating: report the inner angle
        // against a partner line sharing this pivot (throttled). The host
        // renders any wording — this component stays text-free.
        if (config.onStatus) {
          const now = Date.now();
          if (now - lastAngleEmit >= 80) {
            const near = (snap.joinDistance == null ? 28 : snap.joinDistance) * 1.5;
            const partner = lines.find(
              (o) => o !== l && distance({ x: o.x, y: o.y }, { x: l.x, y: l.y }) <= near
            );
            if (partner) {
              lastAngleEmit = now;
              const a = innerAngleDeg(l.angleDeg, partner.angleDeg);
              config.onStatus({
                type: 'angle',
                angleDeg: a,
                delta: lastAngleVal == null ? 0 : a - lastAngleVal,
              });
              lastAngleVal = a;
            }
          }
        }
      }
      redraw();
    }

    function onUp() {
      if (!drag) return;
      const l = drag.line;
      if (drag.kind === 'move') {
        l.x = Math.min(Math.max(snapCoord(l.x, snap.grid), config.x), config.x + config.width);
        l.y = Math.min(Math.max(snapCoord(l.y, snap.grid), config.y), config.y + config.height);
      } else {
        l.angleDeg = snapAngle(l.angleDeg, snap.angleDeg);
      }
      // Assisted seating (opt-in via snap.magnet): a near-target release
      // settles exactly on its target pose so building never becomes a
      // pixel-hunt. The spec decides where the assist applies.
      if (snap.magnet) {
        let target = null;
        if ((mode === 'build' || mode === 'repair') && geo.target && geo.target.rect) {
          const join = snap.joinDistance == null ? 28 : snap.joinDistance;
          target = assignBuildTargets(lines, geo.target.rect, join)[lines.indexOf(l)];
        } else if (mode === 'corner') {
          const locked = lines.find((o) => o.locked) || lines[0];
          if (l !== locked) {
            const want = geo.targetAngleDeg == null ? 90 : geo.targetAngleDeg;
            const candA = normalizeDeg(locked.angleDeg + want);
            const candB = normalizeDeg(locked.angleDeg - want);
            const pick =
              innerAngleDeg(l.angleDeg, candA) <= innerAngleDeg(l.angleDeg, candB) ? candA : candB;
            target = { x: l.x, y: l.y, angleDeg: pick };
          }
        }
        const seat = magnetAdjust(l, target, { magnetPx: snap.magnet, angleStep: snap.angleDeg || 15 });
        if (seat) {
          l.x = seat.x;
          l.y = seat.y;
          l.angleDeg = seat.angleDeg;
          if (feel) feel.sparkle(l.x, l.y, glowColor, 4);
        }
      }
      const changed =
        l.x !== drag.startPose.x || l.y !== drag.startPose.y || l.angleDeg !== drag.startPose.angleDeg;
      drag = null;
      redraw();
      if (!changed) return;
      fadeGuides();
      state.interactions++;
      if (window.GameFeel) window.GameFeel.audio.tick();
      config.onStatus && config.onStatus({ type: 'interact', interactions: state.interactions });
      if (mode === 'build' || mode === 'repair' || mode === 'corner') {
        const v = validateNow();
        state.solved = v.solved;
        config.onStatus && config.onStatus({ type: 'validate', solved: v.solved, corners: v.corners });
      }
    }

    scene.input.on('pointerdown', onDown);
    scene.input.on('pointermove', onMove);
    scene.input.on('pointerup', onUp);

    const api = {
      container,
      compareRects,
      isSolved: () => state.solved,
      getPoses: () => lines.map((l) => ({ ...l })),
      validate: validateNow,
      setInputEnabled(b) {
        state.inputEnabled = !!b;
        drag = null;
        redraw();
      },
      highlightCorners,
      showGhost(b) {
        config.guides = b ? 'ghost' : 'none';
        redraw();
      },
      destroy() {
        scene.input.off('pointerdown', onDown);
        scene.input.off('pointermove', onMove);
        scene.input.off('pointerup', onUp);
        container.destroy();
        if (typeof window !== 'undefined' && window.EduMindDebug &&
            window.EduMindDebug.getFieldLines === debugAccessor) {
          delete window.EduMindDebug.getFieldLines;
        }
      },
    };

    // Automation affordance — how the headless driver "sees" this component.
    function debugAccessor() {
      return {
        mode,
        solved: state.solved,
        inputEnabled: state.inputEnabled,
        interactions: state.interactions,
        lines: lines.map((l) => ({ ...l })),
        drags: !state.inputEnabled || state.solved ? [] : suggestedDrags(state),
      };
    }
    if (typeof window !== 'undefined' && window.EduMindDebug) {
      window.EduMindDebug.getFieldLines = debugAccessor;
    }

    redraw();
    return api;
  }

  window.FieldLineBuilder = {
    create,
    geometry: {
      normalizeDeg,
      snapAngle,
      snapCoord,
      endpointOf,
      innerAngleDeg,
      isRightAngle,
      joinCorners,
      rectSides,
      poseCoversSide,
      rectangleCheck,
      cornerCheck,
      assignBuildTargets,
      suggestedDrags,
      magnetAdjust,
    },
    drawAngle,
  };
})();
