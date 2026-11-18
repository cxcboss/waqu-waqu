#!/usr/bin/env node
/**
 * 广告状态机回归测试：不连真机、不发网络请求，用 wx 假接口驱动
 * src/platform/wx.ts 的 showRewardedAd 与 src/game/ads.ts 的额度逻辑。
 *
 *   node scripts/test_ads.cjs
 *
 * 真机上的广告组件（createRewardedVideoAd）只能在微信开发者工具 / 手机预览里验证；
 * 这里覆盖的是发奖判定、平台频控降级、失败重试与额度规则。
 */
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'waqu-ad-test-'));
const esbuild = path.join(ROOT, 'node_modules', '.bin', 'esbuild');
const compile = (entry, out) => execFileSync(esbuild, [
  path.join(ROOT, entry), '--bundle', '--format=cjs', '--platform=node',
  '--define:__BUILD__="test"', `--outfile=${path.join(OUT, out)}`,
], { cwd: ROOT, stdio: 'pipe' });

compile('src/platform/wx.ts', 'wx.cjs');
compile('src/game/ads.ts', 'ads.cjs');
const { WxPlatform } = require(path.join(OUT, 'wx.cjs'));
const { AD_LIMIT, adLeft, adAllowed, adClaim, adToday } = require(path.join(OUT, 'ads.cjs'));

let passed = 0;
const check = (name, fn) => {
  try { fn(); console.log('  PASS  ' + name); passed++; }
  catch (e) { console.log('  FAIL  ' + name + ' -> ' + e.message); process.exitCode = 1; }
};

// ---- 额度逻辑 ---------------------------------------------------------------
console.log('额度逻辑 (ads.ts)');
const save = (o = {}) => ({ adDay: '', adWage: 0, adRevive: 0, adGift: 0, ...o });
check('复活没有本地每日上限（交给平台频控）', () => {
  assert.equal(AD_LIMIT.revive, null);
  assert.equal(adLeft(save(), 'revive'), null);
  assert.equal(adAllowed(save({ adDay: adToday(), adRevive: 99 }), 'revive'), true);
});
check('工资翻倍每天 1 次，用完即止', () => {
  const s = save();
  assert.equal(adAllowed(s, 'wage'), true);
  adClaim(s, 'wage');
  assert.equal(adAllowed(s, 'wage'), false);
});
check('商店免费礼每天 1 次，且不占用工资翻倍额度', () => {
  const s = save();
  assert.equal(AD_LIMIT.gift, 1);
  assert.equal(adAllowed(s, 'gift'), true);
  adClaim(s, 'gift');
  assert.equal(adAllowed(s, 'gift'), false);
  assert.equal(adAllowed(s, 'wage'), true);
  assert.equal(adAllowed(s, 'revive'), true);
});
check('跨天重置计数', () => {
  const s = save({ adDay: '2000-01-01', adWage: 5, adRevive: 5, adGift: 5 });
  adClaim(s, 'revive');
  assert.equal(s.adDay, adToday());
  assert.equal(s.adWage, 0);
  assert.equal(s.adRevive, 1);
  assert.equal(s.adGift, 0);
  assert.equal(adAllowed(s, 'wage'), true);
  assert.equal(adAllowed(s, 'gift'), true);
});

// ---- 平台层状态机 -----------------------------------------------------------
// Object.create 绕开构造函数（它要 canvas / 文件系统），直接测原型方法。
const platform = () => Object.assign(Object.create(WxPlatform.prototype), {
  ad: null, adBusy: false, adBlocked: false, log: () => {},
});

function adMock(opts = {}) {
  let listeners = { load: [], error: [], close: [] };
  const ad = {
    createdWith: null, showCalls: 0, loadCalls: 0,
    onLoad: (cb) => listeners.load.push(cb),
    onError: (cb) => listeners.error.push(cb),
    onClose: (cb) => listeners.close.push(cb),
    offClose: (cb) => { listeners.close = listeners.close.filter((c) => c !== cb); },
    show: () => {
      ad.showCalls++;
      return opts.showFails && ad.showCalls === 1 ? Promise.reject(new Error('not loaded')) : Promise.resolve();
    },
    load: () => { ad.loadCalls++; return opts.loadFails ? Promise.reject(new Error('no fill')) : Promise.resolve(); },
    fireClose: (res) => listeners.close.slice().forEach((cb) => cb(res)),
    fireError: (e) => listeners.error.slice().forEach((cb) => cb(e)),
    fireLoad: () => listeners.load.slice().forEach((cb) => cb()),
  };
  return ad;
}
const install = (ad) => {
  global.wx = { createRewardedVideoAd: (o) => { ad.createdWith = o.adUnitId; return ad; } };
};
const tick = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

async function run() {
  console.log('平台层状态机 (wx.ts)');
  {
    const ad = adMock(); install(ad);
    const p = platform();
    assert.equal(p.adsAvailable(), true);
    const job = p.showRewardedAd('revive');
    await tick(); ad.fireClose({ isEnded: true });
    assert.equal(await job, true);
    assert.match(ad.createdWith, /^adunit-/);
    console.log('  PASS  完整看完 -> 发奖；创建时用了真实 adUnitId'); passed++;
  }
  {
    const ad = adMock(); install(ad);
    const p = platform();
    const job = p.showRewardedAd('wage');
    await tick(); ad.fireClose({ isEnded: false });
    assert.equal(await job, false);
    console.log('  PASS  中途关闭 -> 不发奖'); passed++;
  }
  {
    const ad = adMock(); install(ad);
    const p = platform();
    const job = p.showRewardedAd('wage');
    await tick(); ad.fireClose(undefined);
    assert.equal(await job, true);
    console.log('  PASS  onClose 无参数（旧基础库）-> 发奖'); passed++;
  }
  {
    const ad = adMock(); install(ad);
    const p = platform();
    const job = p.showRewardedAd('revive');
    await tick(); ad.fireError({ errCode: 1004 });
    assert.equal(p.adsAvailable(), false);
    ad.fireClose({ isEnded: false });
    assert.equal(await job, false);
    ad.fireLoad();
    assert.equal(p.adsAvailable(), true);
    console.log('  PASS  1004 频控 -> 入口隐藏；onLoad -> 恢复'); passed++;
  }
  {
    const ad = adMock(); install(ad);
    const p = platform();
    const job = p.showRewardedAd('wage');
    await tick(); ad.fireError({ errCode: 1000 });
    assert.equal(p.adsAvailable(), true);
    ad.fireClose({ isEnded: true });
    await job;
    console.log('  PASS  1000/1003 临时错误不误关入口'); passed++;
  }
  {
    const ad = adMock({ showFails: true }); install(ad);
    const p = platform();
    const job = p.showRewardedAd('revive');
    await tick();
    assert.equal(ad.loadCalls, 1);
    assert.equal(ad.showCalls, 2);
    ad.fireClose({ isEnded: true });
    assert.equal(await job, true);
    console.log('  PASS  show 失败 -> load 重试 -> 正常发奖'); passed++;
  }
  {
    const ad = adMock({ showFails: true, loadFails: true }); install(ad);
    const p = platform();
    assert.equal(await p.showRewardedAd('revive'), false);
    assert.equal(p.adsAvailable(), false);
    console.log('  PASS  load 也失败 -> 静默降级、入口隐藏（无未处理拒绝）'); passed++;
  }
  {
    const ad = adMock(); install(ad);
    const p = platform();
    const a = p.showRewardedAd('wage');
    const b = p.showRewardedAd('revive');
    assert.equal(await b, false);
    await tick(); ad.fireClose({ isEnded: true });
    assert.equal(await a, true);
    console.log('  PASS  同时点两次只发一次奖'); passed++;
  }
  console.log(`\n通过 ${passed} 项`);
  fs.rmSync(OUT, { recursive: true, force: true });
}

run().catch((e) => { console.error(e); process.exitCode = 1; });
