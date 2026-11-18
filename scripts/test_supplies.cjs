// Offline regression checks for the shop, supplies, saves and mini-game ad callbacks.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, after } = require('node:test');
const { buildSync } = require('esbuild');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'waqu-supplies-'));
after(() => fs.rmSync(dir, { recursive: true, force: true }));
const bundle = path.join(dir, 'game.cjs');
buildSync({
  stdin: {
    resolveDir: path.resolve(__dirname, '..'),
    contents: [
      "export { Game } from './src/game/game';",
      "export { ShopScene } from './src/game/shop';",
      "export { SupplyPanel, useSupply, canShowSupplies } from './src/game/supplies';",
      "export { adToday } from './src/game/ads';",
      "export { WxPlatform } from './src/platform/wx';",
      "export { TtPlatform } from './src/platform/tt';",
    ].join('\n'),
  },
  bundle: true, platform: 'node', format: 'cjs', outfile: bundle,
});
const { Game, ShopScene, SupplyPanel, useSupply, canShowSupplies, adToday, WxPlatform, TtPlatform } = require(bundle);
const noop = () => {};
const tick = () => new Promise((resolve) => setImmediate(resolve));
const empty = { rope: 0, wrap: 0, whistle: 0 };

function gameWith(raw = {}) {
  const storage = new Map([['waqu.save.v1', JSON.stringify(raw)]]);
  const game = Object.assign(Object.create(Game.prototype), {
    platform: {
      adsAvailable: () => true, showRewardedAd: async () => true,
      storageGet: (key) => storage.get(key), storageSet: (key, value) => storage.set(key, value),
    },
    audio: { play: noop, resume: noop, suspend: noop, setMusic: noop, setAmbience: noop },
    sprites: { ensure: noop, has: () => false, draw: noop, blit: noop },
    tm: { day: null, log: (...row) => game.events.push(row) }, events: [],
    H: 1334, safeT: 0, safeB: 0, medals: [],
  });
  game.save = game.readSave();
  return game;
}

// Capture button labels from the real canvas scene, then tap where they were drawn.
function labels(scene, label) {
  const points = [];
  const ctx = new Proxy({
    globalAlpha: 1, measureText: (s) => ({ width: s.length * 14 }),
    fillText: (s, x, y) => { if (label === s) points.push({ x, y }); },
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
  }, { get: (obj, key) => obj[key] ?? noop });
  scene.render(ctx);
  return points;
}

function tapPoint(scene, point) {
  scene.down(point.x, point.y);
  scene.up(point.x, point.y);
}

function tap(scene, label, index = 0) {
  const point = labels(scene, label)[index];
  assert.ok(point, `Missing button: ${label} #${index}`);
  tapPoint(scene, point);
}

test('旧存档默认零库存，读档修正越界、缺失和无效类型', () => {
  assert.deepEqual(gameWith({ day: 4 }).save.supplies, empty);
  assert.deepEqual(gameWith({ supplies: { rope: 6, wrap: -3, whistle: '1' } }).save.supplies, { ...empty, rope: 3 });
  assert.deepEqual(gameWith({ supplies: { whistle: 1.6 } }).save.supplies, { ...empty, whistle: 2 });
});

test('商店正常入口、返回和广告不可用时的已有库存', () => {
  const g = gameWith();
  const shop = new ShopScene(g);
  tap(shop, '送件补给');
  assert.equal(labels(shop, '看广告领1件').length, 3);
  tap(shop, '返回');
  assert.equal(labels(shop, '看广告领1件').length, 0);
  g.platform.adsAvailable = () => false;
  assert.equal(canShowSupplies(g), false);
  assert.equal(labels(shop, '送件补给').length, 0);
  g.save.supplies.wrap = 1;
  assert.equal(canShowSupplies(g), true);
  tap(shop, '送件补给');
  assert.equal(labels(shop, '看广告领1件').length, 0);
  assert.equal(labels(shop, '库存 1/3').length, 1);
  shop.escape();
  assert.equal(labels(shop, '库存 1/3').length, 0);
});

test('完整观看仅为所选道具加一，每种库存上限独立，工资和外观额度不变', async () => {
  const g = gameWith({ adDay: adToday(), adWage: 1, adGift: 1, adRevive: 2 });
  const p = new SupplyPanel(g, noop);
  for (const id of Object.keys(empty)) {
    for (let qty = 1; qty <= 3; qty++) {
      tap(p, '看广告领1件'); // Full rows no longer have an ad button.
      await tick();
      assert.equal(g.readSave().supplies[id], qty);
    }
  }
  assert.equal(labels(p, '看广告领1件').length, 0);
  assert.deepEqual(g.readSave().supplies, { rope: 3, wrap: 3, whistle: 3 });
  assert.deepEqual([g.save.adWage, g.save.adGift, g.save.adRevive], [1, 1, 2]);
  assert.deepEqual(g.events.filter(([ev]) => ev === 'ad_done').map(([, d]) => [d.where, d.ok]),
    ['rope', 'rope', 'rope', 'wrap', 'wrap', 'wrap', 'whistle', 'whistle', 'whistle'].map((id) => [id, true]));
});

test('取消、失败和重复点击不多发，关闭补给面板可以立即返回', async () => {
  const g = gameWith();
  let calls = 0, resolveAd;
  g.platform.showRewardedAd = () => { calls++; return new Promise((resolve) => { resolveAd = resolve; }); };
  let closed = false;
  const p = new SupplyPanel(g, () => { closed = true; });
  const point = labels(p, '看广告领1件')[0];
  tapPoint(p, point);
  tapPoint(p, point);
  assert.equal(calls, 1);
  tap(p, '返回');
  assert.equal(closed, true);
  resolveAd(false);
  await tick();
  assert.deepEqual(g.readSave().supplies, empty);

  const next = new SupplyPanel(g, noop);
  g.platform.showRewardedAd = async () => { throw new Error('no fill'); };
  tap(next, '看广告领1件', 1);
  await tick();
  assert.deepEqual(g.readSave().supplies, empty);
  assert.ok(g.events.filter(([ev]) => ev === 'ad_done').every(([, d]) => d.ok === false));
});

test('开工前可反复勾选和取消缓流哨，实际使用才扣库存并存档', () => {
  const g = gameWith({ day: 5, supplies: { rope: 1, wrap: 1, whistle: 1 } });
  g.tm.day = 2;
  g.platform.adsAvailable = () => false;
  let selected = false;
  const p = new SupplyPanel(g, noop, { selected: () => selected, toggle: () => { selected = !selected; } });
  tap(p, '本趟用缓流哨');
  assert.equal(selected, true);
  tap(p, '已选缓流哨');
  assert.equal(selected, false);
  assert.equal(g.readSave().supplies.whistle, 1);
  for (const id of Object.keys(empty)) {
    assert.equal(useSupply(g, id), true);
    assert.equal(g.readSave().supplies[id], 0);
    assert.equal(useSupply(g, id), false);
  }
  assert.deepEqual(g.events.filter(([ev]) => ev === 'supply_use').map(([, d]) => d), Object.keys(empty).map((kind) => ({ kind, day: 2 })));
  assert.equal(labels(p, '本趟用缓流哨').length, 0);
});

for (const [tab, name, id, owned, achievement, coins] of [
  ['家居', '荷叶地毯', 'deco_rug', [], 'home1', 20],
  ['衣帽', '草帽', 'hat_straw', ['hat_flower', 'hat_beanie'], 'hats3', 40],
]) {
  test(`商店广告领取${name}后立即读档保留成就、奖金和账本`, async () => {
    const g = gameWith({ owned });
    const shop = new ShopScene(g);
    tap(shop, tab);
    tap(shop, name);
    shop.update(0.25);
    tap(shop, '看短片 · 免费领');
    await tick();
    const save = g.readSave();
    assert.ok(save.owned.includes(id));
    assert.ok(save.ach[achievement]);
    assert.equal(save.coins, coins);
    assert.equal(save.ledger.filter((entry) => entry.amount === coins).length, 1);
    assert.equal(save.notes.filter((note) => note.kind === 'ach').length, 1);
    assert.equal(save.adGift, 1);
    if (id === 'hat_straw') assert.equal(save.wear.hat, id);
  });
}

for (const [host, Adapter] of [['wx', WxPlatform], ['tt', TtPlatform]]) {
  test(`${host} 补给广告仅认可明确看完，错误后的迟到回调不发奖`, async () => {
    let close, error;
    const ad = {
      onLoad: noop, onClose: (cb) => { close = cb; }, offClose: noop, onError: (cb) => { error = cb; },
      show: async () => {}, load: async () => {},
    };
    global[host] = { createRewardedVideoAd: () => ad };
    const p = Object.assign(Object.create(Adapter.prototype), { log: noop, adsAvailable() { return !this.adBlocked; } });
    for (const [result, expected] of [[undefined, false], [{ isEnded: false }, false], [{ isEnded: true }, true]]) {
      const watch = p.showRewardedAd('supply');
      close(result);
      close({ isEnded: true });
      assert.equal(await watch, expected);
    }
    const watch = p.showRewardedAd('supply');
    error({ errCode: 1004 });
    close({ isEnded: true });
    assert.equal(await watch, false);
    assert.equal(p.adsAvailable(), false);
    delete global[host];
  });
}
