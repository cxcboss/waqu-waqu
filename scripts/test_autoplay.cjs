#!/usr/bin/env node
// Run the real scene clock and touch handlers without drawing the river or loading audio.
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { after, test } = require('node:test');
const { buildSync } = require('esbuild');

const tmp = mkdtempSync(path.join(tmpdir(), 'waqu-autoplay-'));
after(() => rmSync(tmp, { recursive: true, force: true }));
const bundle = path.join(tmp, 'autoplay.cjs');
buildSync({
  stdin: {
    contents: `export { DAYS } from './src/game/config';
      export { CourierAutoplay } from './src/game/autopilot';
      export { applyUnlockAll } from './src/game/unlock';
      export { PlayScene } from './src/game/play';
      export { upgradeSave } from './src/game/career';`,
    resolveDir: path.resolve(__dirname, '..'),
  },
  bundle: true, format: 'cjs', platform: 'node', outfile: bundle,
});
const { DAYS, CourierAutoplay, applyUnlockAll, PlayScene, upgradeSave } = require(bundle);
const noop = () => {};
const ctx = new Proxy({
  globalAlpha: 1, measureText: (s) => ({ width: String(s).length * 18 }),
  createLinearGradient: () => ({ addColorStop: noop }), createRadialGradient: () => ({ addColorStop: noop }),
}, { get: (obj, key) => key in obj ? obj[key] : noop });

function play(day, H, watch, options) {
  const save = upgradeSave({});
  applyUnlockAll(save);
  const events = [];
  const game = {
    H, W: 750, safeT: 0, safeB: 0, lastDay: DAYS.length, ms: 0, save,
    sprites: { ensure: noop, has: () => false, draw: noop },
    audio: new Proxy({}, { get: () => noop }),
    platform: { now: () => game.ms, vibrate: noop, createCanvas: () => ({ getContext: () => ctx }) },
    tm: { run: 0, count: () => 1, log: (event, data, time) => events.push([event, data, time]) },
    writeSave: noop, go: (next) => { game.scene = next; }, album: { keptId: () => null },
  };
  const scene = new PlayScene(game, day);
  game.scene = scene;
  const autoplay = new CourierAutoplay(0, day, options);
  for (let frame = 0; frame < 60 * 360 && game.scene === scene; frame++) {
    game.ms += 1000 / 60;
    scene.update(1 / 60);
    scene.refreshTray();
    if (scene.step === 'intro') scene.drawCoach(ctx);
    if (scene.cod) scene.drawCod(ctx);
    autoplay.update(scene);
    if (watch?.(scene, events) === false) break;
  }
  return { game, scene, events };
}

test('loading at an early stop leads into a visible pull and a normal jump', () => {
  const pullLengths = [];
  let delay, held, launched, landed, anchorY;
  play(2, 1542, (scene, events) => {
    const aim = scene.aim;
    if (aim && scene.frog.on === scene.lv.truck) {
      delay ??= scene.time - events.findLast(([name]) => name === 'pickup')[2];
      anchorY ??= aim.sy;
      pullLengths.push(Math.hypot(aim.x - aim.sx, aim.y - aim.sy));
      held = aim.t;
    }
    if (scene.frog.jump?.info?.from === 'truck') launched = true;
    if (launched && scene.frog.on) {
      landed = scene.frog.on.kind;
      return false;
    }
  });
  const full = Math.max(...pullLengths);
  const intermediate = new Set(pullLengths.filter((length) => length > full * 0.1 && length < full * 0.9).map(Math.round));
  assert.ok(delay < 1.1, `the courier waited ${delay?.toFixed(2)} s on the truck after loading`);
  assert.ok(held >= 0.4 && intermediate.size >= 5, `only ${intermediate.size} visible pull positions over ${held?.toFixed(2)} s`);
  assert.ok(anchorY > 1542 * 0.58, `the pull started at ${Math.round(anchorY)}, outside the lower part of the screen`);
  assert.equal(landed, 'lily');
});

const speeds = ['slowest', 'slow', 'normal', 'fast', 'fastest'];

test('all five speeds keep a visible, human-paced pull', () => {
  const pullSeconds = speeds.map((speed) => {
    let lastHold = 0;
    play(2, 1542, (scene) => {
      if (scene.aim) lastHold = scene.aim.t;
      if (scene.frog.jump?.info?.from === 'truck') return false;
    }, { speed, mistakes: false });
    return lastHold;
  });
  assert.ok(pullSeconds.every((seconds, i) => i === 0 || seconds < pullSeconds[i - 1]), pullSeconds.join(', '));
  assert.ok(pullSeconds.at(-1) >= 0.35, 'the fastest normal pull should still animate');
});

test('a reachable upper landing starts the convoy rushing before the frog drifts to mid-screen', () => {
  const H = 1542;
  let upper = false, followed = false;
  play(2, H, (scene) => {
    const jump = scene.frog.jump;
    if (jump?.info && jump.y1 - scene.camY < H * 0.28) upper = true;
    if (upper && scene.speedK > 1.2) followed = true;
    if (followed || scene.time >= 12) return false;
  });
  assert.ok(upper, 'all early jumps waited for lower screen positions');
  assert.ok(followed, 'the convoy did not follow the upper jump');
});

const requested = process.env.WAQU_TEST_DAYS?.split(',').map(Number);
const heights = process.env.WAQU_TEST_HEIGHTS?.split(',').map(Number) ?? [1334, 1623];
const testedSpeeds = process.env.WAQU_TEST_SPEEDS?.split(',') ?? ['normal'];
for (const H of heights) for (const speed of testedSpeeds) for (const day of requested ?? [0, ...DAYS.map((d) => d.day)]) {
  test(`day ${day} at height ${H} and ${speed} speed passes through the normal report`, () => {
    let highest = H, lowest = 0;
    const { game, scene, events } = play(day, H, (scene) => {
      const f = scene.frog;
      if (!f.jump?.info) return;
      const y = f.y - scene.camY - f.z;
      highest = Math.min(highest, y);
      lowest = Math.max(lowest, y);
    }, { speed, mistakes: false });
    const report = game.scene.r;
    const jumps = events.filter(([name]) => name === 'jump');
    const delivered = events.filter(([name, d]) => (name === 'deliver' && d.ok) || name === 'return_in');
    assert.ok(report && game.scene.pass, JSON.stringify({
      report, time: Math.round(scene.time), position: scene.frog.on?.kind, step: scene.step,
      jumpCount: jumps.length, successfulTouches: delivered.length,
      orders: scene.lv.orders.map(o => `${o.house.id}:${o.state}${o.ret ? '/return' : ''}`),
    }));
    assert.ok(highest >= 140 && lowest < H - 12, `jumps reached ${Math.round(highest)}–${Math.round(lowest)} in a ${H} tall view`);
    assert.ok(jumps.length > 0);
    assert.equal(report.thrown, false);
    assert.equal(report.delivered, delivered.length);
    assert.equal(report.feats.assist, false);
    assert.ok(events.some(([name]) => name === 'pickup'));
    if (day === 12 || day === 34) assert.ok(events.some(([name]) => name === 'return_in'));
    assert.equal(report.wrong, 0);
    assert.equal(report.codRight, report.codTotal);
    assert.ok(!events.some(([name]) => name === 'ad_show' || name === 'ad_done'));
    assert.ok(events.some(([name, d]) => name === 'run_end' && d.passed === true));
  });
}
