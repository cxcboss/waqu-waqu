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

function play(day, H) {
  const save = upgradeSave({});
  applyUnlockAll(save);
  const events = [];
  const game = {
    H, W: 750, safeT: 0, safeB: 0, lastDay: DAYS.length, ms: 0, save,
    sprites: { ensure: noop, has: () => false, draw: noop },
    audio: new Proxy({}, { get: () => noop }),
    platform: { now: () => game.ms, vibrate: noop, createCanvas: () => ({ getContext: () => ctx }) },
    tm: { run: 0, count: () => 1, log: (event, data) => events.push([event, data]) },
    writeSave: noop, go: (next) => { game.scene = next; }, album: { keptId: () => null },
  };
  const scene = new PlayScene(game, day);
  game.scene = scene;
  const autoplay = new CourierAutoplay();
  for (let frame = 0; frame < 60 * 360 && game.scene === scene; frame++) {
    game.ms += 1000 / 60;
    scene.update(1 / 60);
    scene.refreshTray();
    if (scene.step === 'intro') scene.drawCoach(ctx);
    if (scene.cod) scene.drawCod(ctx);
    autoplay.update(scene);
  }
  return { game, scene, events };
}

const requested = process.env.WAQU_TEST_DAYS?.split(',').map(Number);
const heights = process.env.WAQU_TEST_HEIGHTS?.split(',').map(Number) ?? [1334, 1623];
for (const H of heights) for (const day of requested ?? [0, ...DAYS.map((d) => d.day)]) {
  test(`day ${day} at height ${H} passes through the normal report`, () => {
    const { game, scene, events } = play(day, H);
    const report = game.scene.r;
    const jumps = events.filter(([name]) => name === 'jump');
    const delivered = events.filter(([name, d]) => (name === 'deliver' && d.ok) || name === 'return_in');
    assert.ok(report && game.scene.pass, JSON.stringify({
      report, time: Math.round(scene.time), position: scene.frog.on?.kind, step: scene.step,
      jumpCount: jumps.length, successfulTouches: delivered.length,
      orders: scene.lv.orders.map(o => `${o.house.id}:${o.state}${o.ret ? '/return' : ''}`),
    }));
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
