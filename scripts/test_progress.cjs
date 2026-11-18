#!/usr/bin/env node
// node --test scripts/test_progress.cjs — actual river generation, report drawing and touch handlers.
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { after, test } = require('node:test');
const { buildSync } = require('esbuild');

const tmp = mkdtempSync(path.join(tmpdir(), 'waqu-progress-'));
after(() => rmSync(tmp, { recursive: true, force: true }));
const bundle = path.join(tmp, 'game.cjs');
buildSync({
  stdin: {
    contents: `export { DAYS, SECRET, passRate } from './src/game/config';
      export { buildLevel } from './src/game/level';
      export { passed } from './src/game/progress';
      export { HqScene } from './src/game/hq';
      export { upgradeSave } from './src/game/career';
      export { adToday } from './src/game/ads';`,
    resolveDir: path.resolve(__dirname, '..'),
  },
  bundle: true, format: 'cjs', platform: 'node', outfile: bundle, define: { __BUILD__: '"test"' },
});
const { DAYS, SECRET, passRate, buildLevel, passed, HqScene, upgradeSave, adToday } = require(bundle);

test('35 days and the secret route give each recipient one distinct code across seeds and screen sizes', () => {
  for (const cfg of [...DAYS, SECRET]) {
    for (const seed of [cfg.seed, 0, 1, 7331, 0xffffffff]) {
      let first;
      for (const height of [1000, 1624]) {
        const { orders } = buildLevel({ ...cfg, seed }, height);
        const codes = new Map();
        for (const o of orders) {
          if (codes.has(o.house.id)) assert.equal(o.code, codes.get(o.house.id), `day ${cfg.day} house ${o.house.id}`);
          codes.set(o.house.id, o.code);
        }
        assert.equal(new Set(codes.values()).size, codes.size, `day ${cfg.day} seed ${seed}`);
        assert.equal(orders.length, cfg.orders);
        if (cfg.ordered) {
          const upstream = [...codes].sort(([a], [b]) => a - b).map(([, code]) => code);
          assert.deepEqual(upstream, Array.from({ length: codes.size }, (_, i) => i + 1));
        } else if (codes.size <= 10) {
          assert.ok([...codes.values()].every((n) => Number.isInteger(n) && n >= 0 && n <= 9));
        }
        if (cfg.day === 35) {
          assert.equal(orders.length, 12);
          assert.deepEqual([...codes.values()].sort((a, b) => a - b), Array.from({ length: 11 }, (_, i) => i));
        }
        const labels = orders.map((o) => [o.house.id, o.code, o.house.color]);
        if (first) assert.deepEqual(labels, first);
        first = labels;
      }
    }
  }
});

test('the three late-day river speeds and every ordinary pass threshold', () => {
  assert.deepEqual([15, 25, 35].map((d) => DAYS[d - 1].speed), [65, 69, 71]);
  for (const { day, orders } of DAYS) {
    const rate = [1, 15, 25].includes(day) ? 0.5 : 0.6;
    assert.equal(passRate(day), rate);
    const r = { day, total: orders, thrown: false, delivered: Math.ceil(orders * rate) };
    assert.equal(passed(r), true);
    assert.equal(passed({ ...r, delivered: r.delivered - 1 }), false);
    assert.equal(passed({ ...r, thrown: true }), false);
  }
});

const noop = () => {};
// Capture captions from the real report renderer. Images, sound and the ad SDK stay off-device.
function frame(scene) {
  const captions = [];
  const ctx = new Proxy({
    globalAlpha: 1, fillText: (label) => captions.push(label), measureText: (s) => ({ width: s.length * 12 }),
    createLinearGradient: () => ({ addColorStop: noop }), createRadialGradient: () => ({ addColorStop: noop }),
  }, { get: (obj, key) => key in obj ? obj[key] : noop });
  scene.render(ctx);
  return captions;
}

function report(result = {}, save = {}) {
  const game = {
    H: 1000, safeT: 28, safeB: 36, lastDay: DAYS.length, save: upgradeSave({ stamps: {}, ...save }),
    sprites: { blit: noop, draw: noop, ensure: noop }, album: { keptId: () => null },
    audio: { setMusic: noop, setAmbience: noop, play: noop, preload: noop, resume: noop, suspend: noop, loop: noop },
    platform: { adsAvailable: () => true, showRewardedAd: async () => false, vibrate: noop, showImage: noop, now: () => 0 },
    tm: { run: 0, log: noop, count: () => 1 }, writeSave: noop, celebrate: noop,
    go(next) { this.scene = next; },
  };
  const scene = new HqScene(game, {
    day: 1, thrown: false, total: 4, delivered: 4, wrong: 0, wet: 0, missed: 0,
    urgentTotal: 0, urgentOnTime: 0, pay: 40, bonus: 0, penalty: 0, falls: 0, wrongNames: [], photos: [],
    codTotal: 0, codOrders: 0, codRight: 0, codTips: 0, codLoss: 0, rope: 0, bestTrip: 1, fastUrgent: false,
    ...result,
  });
  game.scene = scene;
  scene.update(8);
  return { game, scene };
}

function tap(scene, rect) {
  assert.ok(rect, 'missing touch target');
  const x = rect.x + rect.w / 2, y = rect.y + rect.h / 2;
  scene.down(x, y);
  scene.up(x, y);
}

const nav = (scene, id) => scene.btns.find((b) => b.id === id)?.rect;

test('the wage button fits beside income and leaves the photo viewer and home immediately usable', () => {
  const photo = { img: { width: 400, height: 800 }, caption: '留影', prio: 1, kind: 'delivery', t: 0, focus: [.5, .5] };
  const { scene, game } = report({ photos: [photo, photo, photo], rope: 1 });
  let videos = 0;
  game.platform.showRewardedAd = async () => { videos++; return true; };
  for (const height of [900, 1000, 1334, 1624]) {
    game.H = height;
    const labels = frame(scene);
    assert.ok(labels.includes('看广告翻倍'));
    assert.ok(!labels.includes('再领一份工资'));
    assert.ok(!labels.includes('救命绳'), 'using a rope has no deduction row');
    const b = scene.wageButton;
    assert.ok(b.x >= 0 && b.x + b.w <= 750 && b.y >= game.safeT);
    for (const other of [scene.viewBtn, ...scene.thumbs, ...scene.hearts, ...scene.btns.map((button) => button.rect)]) {
      assert.ok(b.y + b.h + 16 < other.y - 8);
    }
  }
  tap(scene, scene.viewBtn);
  assert.equal(scene.viewer.current.caption, photo.caption);
  scene.escape();
  tap(scene, scene.wageButton);
  assert.ok(frame(scene).includes('再领一份工资'));
  tap(scene, scene.adCard.btns[1]);
  scene.update(3);
  assert.ok(!frame(scene).includes('再领一份工资'));
  tap(scene, nav(scene, 'home'));
  assert.equal(game.scene.id, 'hub');
  assert.equal(videos, 0);
  assert.equal(game.save.adWage, 0);
});

test('only a completed wage video pays once and a cancelled video can be retried', async () => {
  const { scene, game } = report();
  const base = game.save.coins, wage = game.save.log[0].income;
  const progress = JSON.stringify([game.save.day, game.save.stamps, game.save.best]);
  let finish, calls = 0;
  game.platform.showRewardedAd = (kind) => {
    assert.equal(kind, 'wage');
    calls++;
    return new Promise((resolve) => { finish = resolve; });
  };
  for (const completed of [false, true]) {
    frame(scene);
    tap(scene, scene.wageButton);
    frame(scene);
    const confirm = scene.adCard.btns[0];
    tap(scene, confirm);
    tap(scene, confirm);
    assert.equal(calls, completed ? 2 : 1);
    assert.equal(game.save.coins, base);
    finish(completed);
    await new Promise(setImmediate);
    assert.equal(game.save.adWage, completed ? 1 : 0);
    assert.equal(game.save.coins, base + (completed ? wage : 0));
  }
  const labels = frame(scene);
  assert.ok(labels.includes('已翻倍') && labels.includes(`+${wage * 2}`));
  assert.equal(scene.wageButton, null);
  assert.equal(game.save.ledger.filter((e) => e.text.includes('工资翻倍')).length, 1);
  assert.equal(JSON.stringify([game.save.day, game.save.stamps, game.save.best]), progress);
  game.save.adDay = '2000-01-01';
  frame(scene);
  assert.equal(scene.wageButton, null, 'the same report cannot pay again tomorrow');
});

test('unpaid work, a spent daily allowance and missing ad inventory have no wage button', () => {
  const unpaid = report({ delivered: 0, pay: 0, missed: 4 });
  const capped = report({}, { adDay: adToday(), adWage: 1 });
  const unavailable = report();
  unavailable.game.platform.adsAvailable = () => false;
  const noPlayer = report();
  delete noPlayer.game.platform.showRewardedAd;
  for (const { scene } of [unpaid, capped, unavailable, noPlayer]) {
    assert.ok(!frame(scene).includes('看广告翻倍'));
    assert.equal(scene.wageButton, null);
    assert.equal(scene.adCard, null);
  }
});

test('on day 35 free slowing is optional from failure two, stays on for retries, and never promises a skip', () => {
  const loss = { day: 35, total: 12, delivered: 0, pay: 0, missed: 12 };
  let slowedDistance;
  for (const failures of [1, 2, 3, 5]) {
    const { scene, game } = report(loss, { day: 35, fails: { 35: failures - 1 } });
    const labels = frame(scene);
    assert.ok(!scene.owlLine.includes('跳过') && !nav(scene, 'skip'));
    assert.ok(nav(scene, 'retry') && nav(scene, 'home'));
    assert.equal(labels.includes('免费减速 10% 重试'), failures >= 2);
    assert.equal(!!nav(scene, 'slow'), failures >= 2);
    if (failures === 2) {
      game.platform.adsAvailable = () => false;
      const coins = game.save.coins;
      tap(scene, nav(scene, 'slow'));
      assert.equal(game.scene.id, 'play');
      assert.equal(game.scene.day, 35);
      assert.equal(game.save.assist[35], true);
      assert.equal(game.save.coins, coins);
      game.scene.startDay();
      game.scene.update(1 / 60);
      slowedDistance = -game.scene.camY;
    }
  }
  const assisted = report(loss, { day: 35, assist: { 35: true }, fails: { 35: 2 } });
  assert.ok(frame(assisted.scene).includes('减速重试'));
  assert.ok(assisted.scene.owlLine.includes('已慢一成'));
  tap(assisted.scene, nav(assisted.scene, 'retry'));
  assert.equal(assisted.game.scene.flowFactor, 0.9);
  const normal = report(loss, { day: 35, fails: { 35: 1 } });
  frame(normal.scene);
  tap(normal.scene, nav(normal.scene, 'retry'));
  normal.game.scene.startDay();
  normal.game.scene.update(1 / 60);
  assert.ok(slowedDistance > 0);
  assert.ok(Math.abs(slowedDistance / -normal.game.scene.camY - 0.9) < 1e-8);
});

test('the skip after three losses on earlier days opens the next day without awarding stamps', () => {
  const { scene, game } = report({ day: 15, total: 10, delivered: 0, pay: 0, missed: 10 }, { day: 15, fails: { 15: 2 } });
  assert.ok(frame(scene).includes('跳过这一天'));
  assert.ok(nav(scene, 'slow') && scene.owlLine.includes('跳过'));
  tap(scene, nav(scene, 'skip'));
  assert.equal(game.scene.day, 16);
  assert.equal(game.save.day, 16);
  assert.deepEqual(game.save.skipped, [15]);
  assert.deepEqual(game.save.stamps[15], [false, false, false]);
});
