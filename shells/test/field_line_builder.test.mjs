/**
 * FieldLineBuilder pure-geometry unit tests.
 *
 * The lib is an IIFE that attaches to `window`; its geometry helpers are
 * plain-data functions, so we evaluate the source in a bare VM sandbox and
 * test the math directly — no Phaser, no DOM.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '..', 'src', 'lib', 'field_line_builder.js'), 'utf8');

const sandbox = createContext({ window: {} });
runInContext(src, sandbox);
const G = sandbox.window.FieldLineBuilder.geometry;

const SNAP = { angleDeg: 15, grid: 40, joinDistance: 28 };

describe('angles and snapping', () => {
  it('normalizes degrees into [0, 360)', () => {
    expect(G.normalizeDeg(-90)).toBe(270);
    expect(G.normalizeDeg(360)).toBe(0);
    expect(G.normalizeDeg(725)).toBe(5);
  });

  it('snaps angles to the authored step', () => {
    expect(G.snapAngle(88, 15)).toBe(90);
    expect(G.snapAngle(47, 15)).toBe(45);
    expect(G.snapAngle(7, 0)).toBe(7); // no step → no snap
  });

  it('computes endpoints in screen coords (y grows downward)', () => {
    expect(G.endpointOf({ x: 0, y: 0, angleDeg: 0, length: 10 }).x).toBeCloseTo(10);
    const down = G.endpointOf({ x: 0, y: 0, angleDeg: 90, length: 10 });
    expect(down.x).toBeCloseTo(0);
    expect(down.y).toBeCloseTo(10);
  });

  it('folds the inner angle between directions into [0, 180]', () => {
    expect(G.innerAngleDeg(0, 90)).toBe(90);
    expect(G.innerAngleDeg(350, 80)).toBe(90);
    expect(G.innerAngleDeg(0, 180)).toBe(180);
    expect(G.innerAngleDeg(10, 350)).toBe(20);
  });

  it('right-angle test honors the tolerance parameter', () => {
    expect(G.isRightAngle(92, 4)).toBe(true);
    expect(G.isRightAngle(95, 4)).toBe(false);
    expect(G.isRightAngle(90, 0)).toBe(true);
  });
});

describe('sides, corners and rectangle validation', () => {
  const rect = { x: 200, y: 560, w: 320, h: 240 };

  it('a pose covers a side from either end', () => {
    const [top] = G.rectSides(rect);
    const forward = { x: 200, y: 560, angleDeg: 0, length: 320 };
    const flipped = { x: 520, y: 560, angleDeg: 180, length: 320 };
    expect(G.poseCoversSide(forward, top, 28)).toBe(true);
    expect(G.poseCoversSide(flipped, top, 28)).toBe(true);
    expect(G.poseCoversSide({ ...forward, angleDeg: 15 }, top, 28)).toBe(false);
  });

  it('an exact build solves with four joined right-angle corners', () => {
    const lines = [
      { x: 200, y: 560, angleDeg: 0, length: 320 },
      { x: 520, y: 560, angleDeg: 90, length: 240 },
      { x: 520, y: 800, angleDeg: 180, length: 320 },
      { x: 200, y: 800, angleDeg: 270, length: 240 },
    ];
    const v = G.rectangleCheck(lines, { rect, joinDistance: 28, toleranceDeg: 4 });
    expect(v.solved).toBe(true);
    expect(v.corners).toHaveLength(4);
    expect(v.corners.every((c) => c.ok && Math.round(c.angleDeg) === 90)).toBe(true);
  });

  it('one skewed line breaks the build', () => {
    const lines = [
      { x: 200, y: 560, angleDeg: 0, length: 320 },
      { x: 520, y: 560, angleDeg: 60, length: 240 },
      { x: 520, y: 800, angleDeg: 180, length: 320 },
      { x: 200, y: 800, angleDeg: 270, length: 240 },
    ];
    expect(G.rectangleCheck(lines, { rect, joinDistance: 28, toleranceDeg: 4 }).solved).toBe(false);
  });

  it('corner construction requires a shared pivot and the target angle', () => {
    const pivot = { x: 260, y: 690 };
    const good = [
      { ...pivot, angleDeg: 0, length: 200, locked: true },
      { ...pivot, angleDeg: 270, length: 200 },
    ];
    expect(G.cornerCheck(good, 90, { joinDistance: 28, toleranceDeg: 4 }).solved).toBe(true);
    const skewed = [good[0], { ...pivot, angleDeg: 300, length: 200 }];
    expect(G.cornerCheck(skewed, 90, { joinDistance: 28, toleranceDeg: 4 }).solved).toBe(false);
    const apart = [good[0], { x: 400, y: 690, angleDeg: 270, length: 200 }];
    expect(G.cornerCheck(apart, 90, { joinDistance: 28, toleranceDeg: 4 }).solved).toBe(false);
  });
});

/** Apply one suggested drag the way the e2e driver would (linear drag a→b). */
function applyDrag(lines, drag) {
  for (const l of lines) {
    if (l.locked) continue;
    if (drag.kind === 'move' && Math.hypot(l.x - drag.ax, l.y - drag.ay) < 1) {
      l.x = G.snapCoord(drag.bx, SNAP.grid);
      l.y = G.snapCoord(drag.by, SNAP.grid);
      return;
    }
    if (drag.kind === 'rotate') {
      const end = G.endpointOf(l);
      if (Math.hypot(end.x - drag.ax, end.y - drag.ay) < 1) {
        const raw = (Math.atan2(drag.by - l.y, drag.bx - l.x) * 180) / Math.PI;
        l.angleDeg = G.snapAngle(raw, SNAP.angleDeg);
        return;
      }
    }
  }
  throw new Error(`drag matched no line: ${JSON.stringify(drag)}`);
}

describe('suggested drags steer the automation driver to a solution', () => {
  it('build mode: following the drags always reaches solved', () => {
    const geometry = {
      lines: [
        { x: 120, y: 480, angleDeg: 30, length: 320 },
        { x: 480, y: 920, angleDeg: 165, length: 320 },
        { x: 240, y: 640, angleDeg: 45, length: 240 },
        { x: 560, y: 720, angleDeg: 120, length: 240 },
      ],
      target: { rect: { x: 200, y: 560, w: 320, h: 240 } },
      snap: SNAP,
      toleranceDeg: 4,
    };
    const lines = geometry.lines.map((l) => ({ ...l }));
    for (let step = 0; step < 20; step++) {
      const drags = G.suggestedDrags({ mode: 'build', lines, geometry });
      if (drags.length === 0) break;
      applyDrag(lines, drags[0]);
    }
    const v = G.rectangleCheck(lines, {
      rect: geometry.target.rect,
      joinDistance: SNAP.joinDistance,
      toleranceDeg: 4,
    });
    expect(v.solved).toBe(true);
  });

  it('repair mode: only the skewed line is dragged, then the rect solves', () => {
    const geometry = {
      lines: [
        { x: 200, y: 560, angleDeg: 0, length: 320, locked: true },
        { x: 520, y: 560, angleDeg: 90, length: 240, locked: true },
        { x: 520, y: 800, angleDeg: 180, length: 320, locked: true },
        { x: 200, y: 800, angleDeg: 300, length: 240 },
      ],
      target: { rect: { x: 200, y: 560, w: 320, h: 240 } },
      snap: SNAP,
      toleranceDeg: 4,
    };
    const lines = geometry.lines.map((l) => ({ ...l }));
    for (let step = 0; step < 6; step++) {
      const drags = G.suggestedDrags({ mode: 'repair', lines, geometry });
      if (drags.length === 0) break;
      expect(drags.every((d) => d.kind === 'move' || d.kind === 'rotate')).toBe(true);
      applyDrag(lines, drags[0]);
    }
    expect(
      G.rectangleCheck(lines, { rect: geometry.target.rect, joinDistance: 28, toleranceDeg: 4 }).solved
    ).toBe(true);
    expect(lines[0].angleDeg).toBe(0); // locked lines never touched
  });

  it('corner mode: one rotate drag lands the right angle', () => {
    const geometry = {
      lines: [
        { x: 260, y: 690, angleDeg: 0, length: 200, locked: true },
        { x: 260, y: 690, angleDeg: 40, length: 200 },
      ],
      targetAngleDeg: 90,
      snap: SNAP,
      toleranceDeg: 4,
    };
    const lines = geometry.lines.map((l) => ({ ...l }));
    const drags = G.suggestedDrags({ mode: 'corner', lines, geometry });
    expect(drags).toHaveLength(1);
    expect(drags[0].kind).toBe('rotate');
    applyDrag(lines, drags[0]);
    expect(G.cornerCheck(lines, 90, { joinDistance: 28, toleranceDeg: 4 }).solved).toBe(true);
    expect(G.suggestedDrags({ mode: 'corner', lines, geometry })).toHaveLength(0);
  });

  it('explore mode: offers a nudge drag until minInteractions, then rests', () => {
    const geometry = {
      lines: [{ x: 360, y: 690, angleDeg: 0, length: 220 }],
      minInteractions: 1,
      snap: SNAP,
    };
    const busy = G.suggestedDrags({ mode: 'explore', lines: geometry.lines, geometry, interactions: 0 });
    expect(busy).toHaveLength(1);
    const done = G.suggestedDrags({ mode: 'explore', lines: geometry.lines, geometry, interactions: 1 });
    expect(done).toHaveLength(0);
  });

  it('compare mode never suggests drags (tap-driven)', () => {
    expect(G.suggestedDrags({ mode: 'compare', lines: [], geometry: {} })).toHaveLength(0);
  });
});

describe('assisted seating (magnetAdjust)', () => {
  const target = { x: 200, y: 560, angleDeg: 0 };

  it('seats a near-target pose exactly on the target', () => {
    const pose = { x: 214, y: 548, angleDeg: 15, length: 320 };
    const seat = G.magnetAdjust(pose, target, { magnetPx: 32, angleStep: 15 });
    expect(seat).toEqual({ x: 200, y: 560, angleDeg: 0 });
  });

  it('refuses when the pivot is too far or the direction too skewed', () => {
    expect(G.magnetAdjust({ x: 260, y: 560, angleDeg: 0 }, target, { magnetPx: 32, angleStep: 15 })).toBeNull();
    expect(G.magnetAdjust({ x: 210, y: 560, angleDeg: 45 }, target, { magnetPx: 32, angleStep: 15 })).toBeNull();
  });

  it('is fully opt-in: no magnetPx (or no target) means no adjustment', () => {
    expect(G.magnetAdjust({ x: 200, y: 560, angleDeg: 0 }, target, {})).toBeNull();
    expect(G.magnetAdjust({ x: 200, y: 560, angleDeg: 0 }, null, { magnetPx: 32 })).toBeNull();
  });
});

describe('drawAngle glyph renderer', () => {
  function stubGraphics() {
    const calls = [];
    const record = (name) => (...args) => calls.push([name, ...args]);
    return {
      calls,
      lineStyle: record('lineStyle'),
      beginPath: record('beginPath'),
      moveTo: record('moveTo'),
      lineTo: record('lineTo'),
      strokePath: record('strokePath'),
      strokeRect: record('strokeRect'),
      arc: record('arc'),
      fillStyle: record('fillStyle'),
      fillCircle: record('fillCircle'),
    };
  }

  const drawAngle = sandbox.window.FieldLineBuilder.drawAngle;

  it('draws two arms and a vertex cap', () => {
    const g = stubGraphics();
    drawAngle(g, 100, 200, { angleDeg: 90, arm: 70 });
    const lineTos = g.calls.filter((c) => c[0] === 'lineTo');
    expect(lineTos).toHaveLength(2);
    expect(lineTos[0].slice(1)).toEqual([170, 200]); // horizontal arm
    expect(lineTos[1][1]).toBeCloseTo(100); // vertical arm opens upward
    expect(lineTos[1][2]).toBeCloseTo(130);
    expect(g.calls.some((c) => c[0] === 'fillCircle')).toBe(true);
  });

  it('marker: right angles get the canonical square, others a small arc', () => {
    const right = stubGraphics();
    drawAngle(right, 0, 0, { angleDeg: 90, marker: true });
    expect(right.calls.some((c) => c[0] === 'strokeRect')).toBe(true);
    expect(right.calls.some((c) => c[0] === 'arc')).toBe(false);

    const acute = stubGraphics();
    drawAngle(acute, 0, 0, { angleDeg: 45, marker: true });
    expect(acute.calls.some((c) => c[0] === 'arc')).toBe(true);
    expect(acute.calls.some((c) => c[0] === 'strokeRect')).toBe(false);
  });
});
