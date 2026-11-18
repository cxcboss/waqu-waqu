#!/usr/bin/env node
/**
 * 抖音适配层回归测试：不连真机、不发网络请求，用 tt 假接口驱动
 * src/platform/tt.ts 的关键路径，以及 src/game/sidebar.ts 的每日礼包规则。
 *
 *   node scripts/test_tt.cjs
 *
 * 真机上的渲染、音频、激励视频只能在抖音开发者工具 / 手机预览里验证；这里覆盖的是
 * 平台接口映射（画布、屏幕信息、胶囊、存储、字体、分享、侧边栏、广告降级、存档奖励）。
 */
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'waqu-tt-test-'));
const esbuild = path.join(ROOT, 'node_modules', '.bin', 'esbuild');
const compile = (entry, out) => execFileSync(esbuild, [
  path.join(ROOT, entry), '--bundle', '--format=cjs', '--platform=node',
  '--define:__BUILD__="test"', `--outfile=${path.join(OUT, out)}`,
], { cwd: ROOT, stdio: 'pipe' });

let passed = 0;
const check = async (name, fn) => {
  try { await fn(); console.log('  PASS  ' + name); passed++; }
  catch (e) { console.log('  FAIL  ' + name + ' -> ' + e.message); process.exitCode = 1; }
};
const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));

// ---- 假 tt -------------------------------------------------------------------
function makeTt(over = {}) {
  const calls = [];
  const el = () => ({
    width: 0, height: 0, getContext: () => ({}),
    toTempFilePathSync: () => 'ttfile://temp/x.jpg',
    toDataURL: () => 'data:image/jpeg;base64,AA',
  });
  const tt = {
    calls,
    createCanvas: () => el(),
    createImage: () => {
      const img = { width: 10, height: 10 };
      Object.defineProperty(img, 'src', { set() { setTimeout(() => img.onload && img.onload(), 0); } });
      return img;
    },
    getFileSystemManager: () => ({
      readFileSync: ({ filePath }) => (filePath.endsWith('files.json') ? JSON.stringify({ frog: 'core/art/frog.png' }) : '[]'),
      readFile: ({ encoding, success }) => success({ data: encoding ? '[]' : new ArrayBuffer(0) }),
    }),
    loadSubpackage: ({ name, success }) => { calls.push(['loadSubpackage', name]); setTimeout(() => success({ errMsg: 'ok' }), 0); },
    getSystemInfoSync: () => ({
      brand: 'Apple', model: 'iPhone', system: 'iOS 18', platform: 'ios', version: '33.0.0', SDKVersion: '3.10.0', appName: 'Douyin',
      windowWidth: 390, windowHeight: 844, pixelRatio: 3, safeArea: { top: 47, bottom: 810 },
    }),
    getMenuButtonLayout: () => ({ top: 50, bottom: 88, left: 280, right: 380, width: 100, height: 38 }),
    getRealtimeLogManager: () => ({ info: (m) => calls.push(['log', m]), warn: () => {}, error: () => {}, setFilterMsg: () => {}, addFilterMsg: () => {} }),
    showShareMenu: () => calls.push(['showShareMenu']),
    onShareAppMessage: (cb) => { tt._share = cb(); },
    shareAppMessage: (o) => calls.push(['share', o]),
    checkScene: ({ success }) => success({ isExist: true }),
    navigateToScene: (o) => { calls.push(['navigateToScene', o.scene]); o.success && o.success({}); },
    onShow: (cb) => { tt._onShow = cb; },
    onHide: () => {},
    onTouchStart: () => {}, onTouchMove: () => {}, onTouchEnd: () => {}, onTouchCancel: () => {},
    onError: () => {}, onMemoryWarning: () => {},
    getStorageSync: (k) => (k === 'waqu.save.v1' ? '{"day":3}' : ''),
    setStorageSync: (k, v) => calls.push(['setStorageSync', k, v]),
    removeStorageSync: () => {},
    loadFont: () => 'WK',
    triggerGC: () => {},
    vibrateShort: () => calls.push(['vibrateShort']),
    saveImageToPhotosAlbum: ({ success }) => success({ errMsg: 'ok' }),
    showModal: ({ success }) => success && success({ confirm: false }),
    showKeyboard: ({ defaultValue, success }) => { calls.push(['showKeyboard', defaultValue]); success && success({ errMsg: 'ok' }); },
    hideKeyboard: () => {},
    showToast: (o) => calls.push(['toast', o && o.title]),
    // 平台只在键盘收起时返回经过敏感词过滤（'*'）的文案；onKeyboardConfirm 不作为取值来源。
    onKeyboardConfirm: () => {},
    onKeyboardComplete: (cb) => { tt._kb = cb; },
    offKeyboardConfirm: () => {}, offKeyboardComplete: () => {},
    createInnerAudioContext: () => {
      const a = {
        loop: false, volume: 1, paused: true, currentTime: 0,
        play: () => { a.paused = false; calls.push(['audio', a.src]); },
        pause: () => {}, stop: () => {}, destroy: () => {},
        onError: () => {}, onEnded: () => {},
      };
      return a;
    },
    request: ({ success }) => success({ statusCode: 204 }),
    ...over,
  };
  return tt;
}

(async () => {
  global.tt = makeTt();
  const tt = global.tt;
  compile('src/platform/tt.ts', 'tt.cjs');
  const { TtPlatform } = require(path.join(OUT, 'tt.cjs'));
  const p = new TtPlatform();

  console.log('平台映射 (tt.ts)');
  await check('kind 是 tt', () => assert.equal(p.kind, 'tt'));
  await check('屏幕：windowWidth/Height、safeArea、胶囊底边、dpr 压到 2', () => {
    const s = p.screen();
    assert.equal(s.width, 390);
    assert.equal(s.height, 844);
    assert.equal(s.dpr, 2);
    assert.equal(s.safeTop, 94, '胶囊 bottom 88 + 6');
    assert.equal(s.safeBottom, 44, '844-810+10');
  });
  await check('存储读写走 tt.getStorageSync/setStorageSync', () => {
    assert.equal(p.storageGet('waqu.save.v1'), '{"day":3}');
    assert.equal(p.storageGet('missing'), null);
    assert.equal(p.storageSet('k', 'v'), true);
    assert.ok(tt.calls.some((c) => c[0] === 'setStorageSync' && c[1] === 'k'));
  });
  await check('图片：按 files.json 映射到包内路径，并先拉 art 分包', async () => {
    const img = await p.loadImage('art/frog.webp');
    assert.ok(img);
    assert.ok(tt.calls.some((c) => c[0] === 'loadSubpackage' && c[1] === 'art'));
  });
  await check('字体：loadFont 返回家族名', async () => {
    assert.equal(await p.loadFont('WK', 'fonts/wk-regular.woff2'), true);
  });
  await check('编码图片：JPEG data URL', () => {
    assert.ok(String(p.encodeImage(global.tt.createCanvas(), 0.8)).startsWith('data:image/jpeg'));
  });
  await check('改名走系统键盘，以 onKeyboardComplete 的过滤文案为准', async () => {
    const pr = p.promptText('改名', '小呱', 6);
    tt._kb({ value: '  呱呱大王  ' });
    assert.equal(await pr, '呱呱大王');
  });
  await check('命中敏感词被替换为 * 时给出提示文案', async () => {
    const pr = p.promptText('改名', '小呱', 6);
    tt._kb({ value: '呱*王' });
    assert.equal(await pr, '呱*王');
    assert.ok(tt.calls.some((c) => c[0] === 'toast' && String(c[1]).includes('不予展示')));
  });
  await check('网络：postJson 返回状态码', async () => {
    assert.equal(await p.postJson('https://x/y', '{}', {}), 204);
  });
  await check('存相册：走 toTempFilePathSync + saveImageToPhotosAlbum', async () => {
    const r = await p.saveImage(global.tt.createCanvas());
    assert.equal(r, 'album');
  });
  await check('侧边栏可用，openSidebar 调用 tt.navigateToScene', () => {
    assert.equal(p.sidebarAvailable(), true);
    p.openSidebar();
    const call = tt.calls.find((c) => c[0] === 'navigateToScene');
    assert.equal(call[1], 'sidebar');
  });
  await check('从侧边栏进入只提示一次', () => {
    tt._onShow({ launch_from: 'homepage', location: 'sidebar_card' });
    assert.equal(p.fromSidebar(), true);
    assert.equal(p.fromSidebar(), false);
  });
  await check('普通进入不算侧边栏', () => {
    tt._onShow({ launch_from: 'feed', location: 'card' });
    assert.equal(p.fromSidebar(), false);
  });
  await check('广告位未配置时不出现入口（新游常态）', () => assert.equal(p.adsAvailable(), false));
  await check('分享用标题+描述（分享图在后台配）', () => {
    p.share({ title: '蛙趣送包裹' });
    const c = tt.calls.find((x) => x[0] === 'share');
    assert.equal(c[1].title, '蛙趣送包裹');
    assert.ok(c[1].desc);
  });
  await check('音频：分包就绪后才播放，src 是包内路径', async () => {
    const st = p.createStream('audio/ui_tap.mp3', { loop: false, volume: 0.5 });
    st.play();
    await tick(60);
    const played = tt.calls.filter((c) => c[0] === 'audio');
    assert.equal(played.length, 1);
    assert.equal(played[0][1], 'audio/ui_tap.mp3');
    assert.equal(st.paused, false);
    st.destroy();
  });

  // ---- 侧边栏礼包 -------------------------------------------------------------
  console.log('侧边栏礼包 (sidebar.ts)');
  compile('src/game/sidebar.ts', 'sidebar.cjs');
  const { SIDEBAR_GIFT, sidebarClaim, sidebarGiftLeft } = require(path.join(OUT, 'sidebar.cjs'));
  let wrote = false;
  const mkGame = (save = {}) => ({
    save: { sideDay: '', sideGift: 0, coins: 100, ledger: [], ...save },
    writeSave: () => { wrote = true; },
    tm: { log: () => {} },
  });
  await check('同一天只发一次，金币与账本各记一次', () => {
    const g = mkGame();
    assert.equal(sidebarGiftLeft(g.save), true);
    assert.equal(sidebarClaim(g), SIDEBAR_GIFT);
    assert.equal(g.save.coins, 100 + SIDEBAR_GIFT);
    assert.equal(sidebarGiftLeft(g.save), false);
    assert.equal(sidebarClaim(g), null);
    assert.equal(g.save.coins, 100 + SIDEBAR_GIFT);
    assert.equal(wrote, true);
    assert.equal(g.save.ledger.length, 1);
  });
  await check('跨天又能领', () => {
    const g = mkGame({ sideDay: '2000-01-01' });
    assert.equal(sidebarClaim(g), SIDEBAR_GIFT);
  });
  await check('次数只作统计', () => {
    const g = mkGame();
    sidebarClaim(g);
    assert.equal(g.save.sideGift, 1);
  });

  console.log(`\n${passed} 项通过${process.exitCode ? '，有失败' : ''}`);
})();
