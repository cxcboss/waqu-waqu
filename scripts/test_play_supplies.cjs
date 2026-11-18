#!/usr/bin/env node
// Gameplay state and touch-input regressions. No platform accounts or network requests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, after } = require('node:test');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'waqu-play-'));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));
const bundle = path.join(tmp, 'play.cjs');
esbuild.buildSync({
  stdin: { contents: "export { PlayScene } from './src/game/play'; export { upgradeSave } from './src/game/career'", resolveDir: root },
  bundle: true, platform: 'node', format: 'cjs', outfile: bundle,
});
const { PlayScene, upgradeSave } = require(bundle);
const noop = () => {};
const drawing = new Proxy({ measureText: s => ({ width: s.length * 24 }), globalAlpha: 1 }, {
  get: (target, name) => target[name] ?? noop,
});

function fixture(day = 2, { stock = {}, assist = false, height = 1334, safeT = 0, safeB = 0, video } = {}) {
  const events = [], writes = [];
  const game = {
    H: height, safeT, safeB, lastDay: 35, ms: 0,
    save: upgradeSave({ day, supplies: stock, assist: { [day]: assist }, tips: { swim: true } }),
    sprites: { ensure: async () => {}, has: () => false, draw: noop },
    audio: new Proxy({}, { get: () => noop }),
    platform: { now: () => game.ms, vibrate: noop, adsAvailable: () => !!video, showRewardedAd: video },
    tm: { run: 0, count: () => 1, log: (event, data) => events.push({ event, data }) },
    writeSave: () => writes.push(JSON.stringify(game.save)), go: scene => { game.scene = scene; },
  };
  const scene = new PlayScene(game, day);
  scene.stepT = 1;
  return { game, scene, events, writes };
}

function tap(scene, rect) {
  const x = rect.x + rect.w / 2, y = rect.y + rect.h / 2;
  scene.down(x, y, 1);
  scene.up(x, y, 1);
}

function sweep(scene) {
  scene.fall(285, scene.camY + scene.game.H + 66);
  scene.checkDanger(1 / 60);
}

for (const [height, safeT, safeB] of [[790, 30, 20], [1334, 0, 0], [1640, 92, 62]]) {
  test(`day 1 drawn drag lands on the marked starting lily at height ${height}`, () => {
    const { scene, game, events } = fixture(1, { height, safeT, safeB, stock: { whistle: 2 } });
    scene.drawCoach(drawing);
    assert.equal(scene.supplyBtn, null);
    assert.equal(scene.whistleBtn, null);
    tap(scene, scene.introBtn);
    scene.refreshTray();
    tap(scene, scene.truckCards()[0].rect);
    const target = scene.lv.plats.find(p => p.role === 'start');
    assert.equal(scene.aimTarget, target);
    let hand;
    scene.drawHand = (_ctx, kind, x, y, pull) => { hand = { kind, x, y, ...pull }; };
    scene.drawCoach(drawing);
    const { kind, x, y, dx, dy } = hand;
    assert.equal(kind, 'drag');
    for (let i = 0; i < 2; i++) { scene.down(x, y, 1); scene.up(x, y, 1); }
    assert.equal(scene.pullCoaches, 0);
    scene.down(x, y, 1);
    game.ms += 180;
    scene.move(x + dx, y + dy, 1);
    scene.up(x + dx, y + dy, 1);
    assert.equal(scene.frog.state, 'jump');
    assert.ok(Math.hypot(scene.frog.jump.x1 - target.x, scene.frog.jump.y1 - target.y) < 1);
    for (let i = 0; i < 60; i++) scene.update(1 / 60);
    assert.equal(scene.frog.on, target);
    assert.equal(scene.step, 'go');
    assert.equal(events.find(e => e.event === 'jump').data.target, true);
    assert.equal(game.save.supplies.whistle, 2);
  });
}

test('a missed first jump still teaches the swim wheel and lets an unequipped frog climb out', () => {
  const { scene, game, events } = fixture(1);
  game.save.tips.swim = false;
  scene.startDay();
  scene.refreshTray();
  tap(scene, scene.truckCards()[0].rect);
  // Find an open patch of water outside the snap margin for this seeded river.
  const pull = [[145, -45], [150, 0], [100, -100], [140, 70], [55, -140]].find(([dx, dy]) => {
    const len = Math.hypot(dx, dy), ux = -dx / len, uy = -dy / len;
    const dist = scene.jumpDist(len / 190, ux, uy);
    const x = scene.frog.x + ux * dist, y = scene.frog.y + uy * dist;
    return !scene.findPlat(x, y) && !scene.snapTarget(x, y);
  });
  assert.ok(pull);
  scene.down(280, 600, 1);
  game.ms += 200;
  scene.move(280 + pull[0], 600 + pull[1], 1);
  scene.up(280 + pull[0], 600 + pull[1], 1);
  for (let i = 0; i < 105; i++) scene.update(1 / 60);
  assert.equal(scene.frog.state, 'swim');
  assert.equal(scene.step, 'rescue');
  scene.refreshTray();
  const w = scene.wheel();
  scene.down(w.x, w.y - 65, 1);
  for (let i = 0; i < 20; i++) scene.update(1 / 60);
  scene.up(w.x, w.y - 65, 1);
  assert.ok(scene.tally.strokes > 0);
  for (let i = 0; i < 180; i++) {
    if (scene.gauge && Math.abs(scene.gaugeNeedle(scene.gauge.t) - 0.5) < scene.gaugeZone() / 2) break;
    scene.update(1 / 60);
  }
  scene.down(82, 460, 2);
  scene.up(82, 460, 2);
  assert.equal(scene.frog.jump?.how, 'climb');
  for (let i = 0; i < 50; i++) scene.update(1 / 60);
  assert.equal(scene.frog.state, 'stand');
  assert.equal(scene.ended, null);
  assert.equal(scene.revive, null);
  assert.ok(game.save.tips.swim);
  assert.ok(events.some(e => e.event === 'climb' && e.data.ok));
  assert.ok(!events.some(e => e.event === 'ad_show' || e.event === 'supply_use'));
});

test('a wrap protects every carried parcel once, with normal swimming on every fall', () => {
  const { scene, game, events } = fixture(2, { stock: { wrap: 2 } });
  scene.startDay();
  scene.fall(285, 500);
  assert.equal(game.save.supplies.wrap, 2);
  const [a, b] = scene.lv.orders;
  scene.pickup(a);
  scene.pickup(b);
  a.dunks = 2;
  scene.fall(285, 500);
  assert.deepEqual(scene.bag, [a, b]);
  assert.deepEqual([a.dunks, b.dunks, a.state, b.state], [2, 0, 'bag', 'bag']);
  assert.equal(scene.frog.state, 'swim');
  assert.ok(scene.frog.dunkT > 0);
  assert.equal(scene.floaters.length, 0);
  scene.fall(285, 500);
  assert.deepEqual([a.dunks, b.dunks, a.state, b.state], [3, 1, 'wet', 'float']);
  assert.equal(scene.stats.falls, 3);
  assert.equal(game.save.supplies.wrap, 1);
  assert.deepEqual(events.filter(e => e.event === 'fall').map(e => e.data.protectedCount), [0, 2, 0]);
  assert.equal(events.filter(e => e.event === 'supply_use').length, 1);
});

test('rope waits for a sweep, preserves the wage, and cannot save twice in one run', () => {
  const { scene, game, events, writes } = fixture(2, { stock: { rope: 2 } });
  scene.startDay();
  scene.fall(285, game.H + 30);
  scene.checkDanger(1 / 60);
  assert.equal(game.save.supplies.rope, 2);
  scene.frog.y += 10;
  scene.checkDanger(1 / 60);
  assert.equal(scene.frog.state, 'board');
  assert.equal(JSON.parse(writes.at(-1)).supplies.rope, 1);
  sweep(scene);
  assert.equal(scene.ended, 'thrown');
  assert.equal(game.save.supplies.rope, 1);
  scene.finish();
  assert.equal(game.scene.r.penalty, 0);
  assert.equal(game.scene.r.rope, 1);
  assert.equal(events.filter(e => e.event === 'supply_use').length, 1);
});

test('last delivery and route completion take the free pickup even on the sweep frame', () => {
  for (const cause of ['call', 'route']) {
    const { scene, game, events } = fixture(2, { stock: { rope: 1 } });
    scene.startDay();
    if (cause === 'call') for (const o of scene.lv.orders) o.state = 'delivered';
    else scene.camY = -scene.cfg.length;
    scene.fall(285, scene.camY + game.H + 66);
    scene.update(1 / 60);
    assert.equal(scene.frog.state, 'board');
    assert.equal(game.save.supplies.rope, 1);
    assert.equal(events.find(e => e.event === 'yank').data.why, cause);
    assert.equal(scene.revive, null);
  }
});

test('preparation holds the choice across backgrounding; opening, cancelling and toggling cost nothing', () => {
  const { scene, game, writes } = fixture(2, { stock: { whistle: 2 }, height: 720, safeT: 40, safeB: 30 });
  scene.drawIntro(drawing);
  const [supplies, whistle, start] = [scene.supplyBtn, scene.whistleBtn, scene.introBtn];
  assert.ok(supplies.x + supplies.w < whistle.x && whistle.x + whistle.w < start.x);
  assert.ok(start.y + start.h <= game.H - game.safeB);
  tap(scene, whistle);
  tap(scene, supplies);
  assert.ok(scene.supplyPanel);
  scene.blur();
  scene.update(1);
  assert.equal(scene.paused, false);
  assert.equal(scene.camY, 0);
  scene.escape();
  assert.equal(scene.whistleSelected, true);
  tap(scene, whistle); // deselect
  scene.down(start.x + 10, start.y + 10, 1);
  scene.up(0, 0, 1); // slide off the start button
  assert.equal(scene.step, 'intro');
  assert.equal(writes.length, 0);
  tap(scene, start);
  assert.equal(game.save.supplies.whistle, 2);
});

test('whistle applies only when selected and started; the free slow mode does not multiply it', () => {
  for (const [assist, select, factor] of [[false, false, 1], [true, false, 0.9], [false, true, 0.85], [true, true, 0.85]]) {
    const { scene, game } = fixture(2, { stock: { whistle: 2 }, assist });
    scene.drawIntro(drawing);
    if (select) tap(scene, scene.whistleBtn);
    assert.equal(game.save.supplies.whistle, 2);
    tap(scene, scene.introBtn);
    scene.startDay();
    assert.equal(game.save.supplies.whistle, select ? 1 : 2);
    scene.slowT = 0;
    scene.update(0.1);
    assert.ok(Math.abs(-scene.camY / (scene.cfg.speed * 0.1) - factor) < 1e-9);
  }
});

test('video revival waits for a full voluntary viewing; backgrounding does not open the pause menu', async () => {
  for (const complete of [false, true]) {
    let finish, shows = 0;
    const { scene, game } = fixture(2, { video: () => { shows++; return new Promise(resolve => { finish = resolve; }); } });
    scene.startDay();
    scene.update(1 / 60);
    sweep(scene);
    assert.equal(shows, 0);
    assert.ok(scene.revive);
    const job = scene.takeRevive();
    scene.blur();
    scene.escape();
    assert.equal(scene.paused, false);
    assert.ok(scene.revive.busy);
    const before = scene.camY;
    scene.update(0.2);
    assert.equal(scene.camY, before);
    finish(complete);
    await job;
    assert.equal(shows, 1);
    assert.equal(scene.videoRevived, complete);
    assert.equal(scene.ended, complete ? null : 'thrown');
    if (complete) {
      assert.equal(scene.frog.state, 'board');
      sweep(scene);
      assert.equal(scene.ended, 'thrown');
    }
    assert.equal(game.save.supplies.rope, 0);
  }
});

test('only consecutive empty taps within three seconds trigger the short pull coach, at most twice', () => {
  const { scene } = fixture();
  scene.startDay();
  scene.refreshTray();
  const empty = t => { scene.time = t; scene.down(280, 450, 1); scene.up(280, 450, 1); };
  empty(1);
  empty(4.1);
  assert.equal(scene.pullCoaches, 0);
  tap(scene, scene.truckCards()[0].rect);
  empty(4.6);
  assert.equal(scene.pullCoaches, 0);
  empty(5);
  assert.equal(scene.pullCoaches, 1);
  for (let i = 0; i < 242; i++) scene.update(1 / 60);
  empty(9.3);
  empty(9.5);
  assert.equal(scene.pullCoaches, 2);
  for (let i = 0; i < 242; i++) scene.update(1 / 60);
  empty(14);
  empty(14.2);
  assert.equal(scene.pullCoaches, 2);
});

test('correct and incorrect cash amounts both close the card on release', () => {
  for (const correct of [true, false]) {
    const { scene, events } = fixture();
    scene.startDay();
    const order = scene.lv.orders.find(o => o.cod);
    scene.openCod(order, order.house, 0);
    scene.cod.t = 1;
    scene.drawCod(drawing);
    const right = order.cod.paid - order.cod.price;
    const index = scene.cod.opts.findIndex(o => (o === right) === correct);
    tap(scene, scene.cod.btns[index]);
    assert.equal(scene.cod, null);
    assert.equal(scene.frozen(), false);
    assert.equal(order.codOk, correct);
    assert.equal(events.find(e => e.event === 'cod').data.right, right);
    assert.ok((correct ? scene.popups.at(-1).text : scene.toast.text).includes(`¥${right}`));
  }
});

test('clearing while carrying unused supplies still counts as an unaided clear', () => {
  const { scene, events } = fixture(2, { stock: { rope: 1, wrap: 1, whistle: 1 } });
  scene.startDay();
  for (const o of scene.lv.orders) o.state = 'delivered';
  scene.ended = 'off';
  scene.finish();
  const end = events.find(e => e.event === 'run_end').data;
  assert.equal(end.passed, true);
  assert.equal(end.unassistedClear, true);
  assert.deepEqual(end.suppliesUsed, { rope: 0, wrap: 0, whistle: 0 });
});
