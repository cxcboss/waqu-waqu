// The Douyin (抖音) mini game platform: the same interface as web.ts and wx.ts, on tt.* instead of wx.*.
// scripts/build_tt.py bundles this with the game into game.js and lays out the package:
//   game.js, fonts/*.ttf, core/art/ (what the first screen needs, plus manifest.json and files.json)  main package
//   art/    the rest of the art                                                                         subpackage "art"
//   audio/  sound and music                                                                             subpackage "audio"
// The game asks for files by their web paths (art/x.webp, audio/…, fonts/x.woff2); `where` maps them to the package.
//
// Differences from the WeChat side that matter here (from the Douyin mini game API docs):
//   - screen facts come from tt.getSystemInfoSync only; there is no getWindowInfo/getDeviceInfo.
//   - the capsule is tt.getMenuButtonLayout (not getMenuButtonBoundingClientRect).
//   - readFileSync takes an options object, and there is no onUnhandledRejection.
//   - showModal has no `editable`: the frog's name is typed on the system keyboard (tt.showKeyboard).
//   - a share has no per-call image; the card picture is set in the admin console.
//   - 侧边栏复访 is a mandatory ("必接") capability: tt.navigateToScene({scene:'sidebar'}).
import type { Canvas, ImageSource, Platform, RewardedAdReason, SaveResult, ScreenInfo, Stream, TouchKind, TouchPoint } from './types';

// The tt global and its objects, typed loosely: only what's used here.
declare const tt: any;
declare const __BUILD__: string;
type TtTouch = { identifier: number; clientX: number; clientY: number };
type TtTouchEvent = { changedTouches: TtTouch[] };

/** Subpackages by the path their files live under. */
const SUBPACKAGES = ['art', 'audio'] as const;
type Sub = (typeof SUBPACKAGES)[number];

/** Clear space kept along the bottom, in screen points: at least BOTTOM_MIN, and BOTTOM_AIR over the system's inset. */
const BOTTOM_MIN = 24;
const BOTTOM_AIR = 10;

const SHARE_TITLE = '蛙趣送包裹：小青蛙在河上跳来跳去送快递';
const SHARE_DESC = '按住蓄力，松手起跳，把包裹送到河湾的每一户人家。';

/**
 * 流量主 → 广告管理 里创建的「激励视频」广告位 id。留空时游戏完全不出现广告入口（旧版行为），
 * 也不调用任何广告 API；拿到 id 后填这里、重新打包即可，玩法代码不用改。
 * 注意：抖音的激励视频广告位要求开通流量主且前一日 DAU > 50，新游上线初期通常还没有广告位，
 * 所以这个降级是常态，不是故障。
 */
const REWARDED_AD_UNIT_ID = '';

const call = <T = any>(api: string, o: Record<string, unknown> = {}): Promise<T> =>
  new Promise((resolve, reject) => tt[api]({ ...o, success: resolve, fail: reject }));

export class TtPlatform implements Platform {
  readonly kind = 'tt' as const;
  readonly canvas: Canvas;
  readonly longPressSave = false;
  private fs: any = null;
  /** Art by sprite name -> its file in the package (written by the build: PNG, or JPEG for opaque art). */
  private art: Record<string, string> = {};
  private subs = new Map<Sub, Promise<void>>();
  private t0 = Date.now();
  /** Douyin's realtime log manager (开发者后台 → 实时日志), and how many lines this run has sent (capped). */
  private rt: any = null;
  private rtLines = 0;
  /** Canvases made, and their pixels when made: the biggest memory the game holds besides images. */
  private canvases = { n: 0, px: 0 };
  /** Player errors logged so far (a broken file mustn't fill the log). */
  private streamErrors = 0;
  /** 抖音 asks for one global RewardedVideoAd for the whole game, created on first use. */
  private ad: any = null;
  /** One video at a time: a second tap while the first is up must not stack two rewards. */
  private adBusy = false;
  private failAd: (() => void) | null = null;
  /** Once the platform stops filling ads the entrance quietly disappears until one loads again. */
  private adBlocked = false;
  /** Whether this宿主 has the 侧边栏 entrance (tt.checkScene); unknown until asked. */
  private sidebarOk = true;
  /** The last time the game was opened from Douyin's home side bar (launch_from/location on tt.onShow). */
  private sideCame = false;
  /** On a computer: the window is minimized. */
  private minimized = false;
  /** Keys held down, and when each last sent a keydown. */
  private keys: Record<string, { held: boolean; t: number }> = {};

  constructor() {
    // the first canvas made is the screen
    this.canvas = tt.createCanvas() as Canvas;
    try {
      this.fs = tt.getFileSystemManager();
      this.art = JSON.parse(this.readSync('core/art/files.json') as string);
    } catch {
      // no file list: every sprite falls back to its placeholder
    }
    // start the art download straight away (it's what the loading screen waits on), then the sound's
    void this.sub('art')
      .catch(() => undefined)
      .then(() => this.sub('audio'))
      .catch(() => undefined);
    this.startLog();
    try {
      tt.showShareMenu?.({});
      tt.onShareAppMessage?.(() => ({ title: SHARE_TITLE, desc: SHARE_DESC }));
    } catch {
      /* not on this client */
    }
    // 侧边栏: is the entrance there at all? (an old host says no, and the entry stays hidden)
    try {
      tt.checkScene?.({
        scene: 'sidebar',
        success: (r: { isExist?: boolean }) => { if (r && r.isExist === false) this.sidebarOk = false; },
        fail: () => { /* unknown: keep it on, openSidebar() degrades quietly */ },
      });
    } catch {
      /* not on this client */
    }
    // a newer version waiting: offer to restart into it
    try {
      const um = tt.getUpdateManager?.();
      um?.onUpdateReady?.(() => {
        tt.showModal({
          title: '有新版本', content: '蛙趣送包裹更新好了，重新打开就能玩新版。', confirmText: '重新打开', cancelText: '等会',
          success: (r: { confirm: boolean }) => r.confirm && um.applyUpdate?.(),
        });
      });
    } catch {
      /* not on this client */
    }
  }

  /** A packaged text file, read synchronously (Douyin's readFileSync takes an options object). */
  private readSync(filePath: string): string {
    return this.fs.readFileSync({ filePath, encoding: 'utf8' });
  }

  /** The remote log: lines go to Douyin's 实时日志, tagged with the build so one version's lines can be picked out. */
  private startLog() {
    try {
      this.rt = tt.getRealtimeLogManager ? tt.getRealtimeLogManager() : null;
      this.rt?.setFilterMsg?.('waqu');
      this.rt?.addFilterMsg?.('b' + (typeof __BUILD__ === 'string' ? __BUILD__ : 'dev'));
    } catch {
      this.rt = null;
    }
    let d: any = {};
    try {
      d = tt.getSystemInfoSync();
    } catch {
      d = {};
    }
    this.log('info', `start ${d.brand} ${d.model} ${d.system} tt${d.version} sdk${d.SDKVersion} ${d.windowWidth}x${d.windowHeight}@${d.pixelRatio} build ${typeof __BUILD__ === 'string' ? __BUILD__ : 'dev'}`);
    tt.onShow?.((p: { launch_from?: string; location?: string }) => {
      this.noteEntry(p);
      this.log('info', 'show');
    });
    tt.onHide?.(() => this.log('info', 'hide'));
    tt.onMemoryWarning?.((r: { level?: number }) => this.log('warn', `memory warning ${r?.level ?? ''} canvases ${this.canvases.n} ${Math.round(this.canvases.px / 1e6)}Mpx`));
    tt.onError?.((e: { message?: string; stack?: string }) => this.log('error', `error ${String(e.message).slice(0, 160)} | ${String(e.stack ?? '').split('\n').slice(0, 3).join(' | ').slice(0, 300)}`));
  }

  /** Remembers whether this open came from Douyin's home side bar. */
  private noteEntry(p?: { launch_from?: string; location?: string }) {
    if (p && p.launch_from === 'homepage' && p.location === 'sidebar_card') this.sideCame = true;
  }

  log(level: 'info' | 'warn' | 'error', msg: string): void {
    // one report holds at most 200 lines and 5 KB per few seconds; a runaway loop must not eat the day's quota
    if (!this.rt || this.rtLines >= 2000) return;
    this.rtLines++;
    try {
      this.rt[level](`${((Date.now() - this.t0) / 1000).toFixed(1)}s ${msg.slice(0, 400)}`);
    } catch {
      /* not on this client */
    }
  }

  /** Canvases made so far and their pixels, for the heartbeat line. */
  get canvasTally() {
    return this.canvases;
  }

  /** Downloads a subpackage once (retrying a few times on a bad connection). */
  private sub(name: Sub): Promise<void> {
    let p = this.subs.get(name);
    if (!p) {
      p = (async () => {
        const t = Date.now();
        for (let i = 0; ; i++) {
          try {
            await call('loadSubpackage', { name });
            this.log('info', `subpackage ${name} ${((Date.now() - t) / 1000).toFixed(1)}s`);
            return;
          } catch (e) {
            this.log('warn', `subpackage ${name} failed ${String((e as { errMsg?: string })?.errMsg ?? e).slice(0, 120)}`);
            if (i >= 4) throw e;
            await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
          }
        }
      })();
      // a failed download can be tried again by the next file that needs it
      p.catch(() => this.subs.delete(name));
      this.subs.set(name, p);
    }
    return p;
  }

  /** Where a file the game asks for by its web path is in the package, after making sure it's downloaded. */
  private async where(url: string): Promise<string> {
    const m = /^art\/(.+)\.webp$/.exec(url);
    if (m) {
      const file = this.art[m[1]];
      if (!file) throw new Error('no art ' + m[1]);
      url = file;
    } else if (url === 'art/manifest.json') url = 'core/art/manifest.json';
    else if (url.startsWith('fonts/')) url = url.replace(/\.woff2$/, '.ttf');
    const sub = SUBPACKAGES.find((s) => url.startsWith(s + '/'));
    if (sub) await this.sub(sub);
    return url;
  }

  screen(): ScreenInfo {
    const s = tt.getSystemInfoSync();
    const width = s.windowWidth, height = s.windowHeight;
    const safe = s.safeArea;
    let safeTop = safe ? safe.top : 0;
    // keep what sits along the bottom clear of the screen's rounded corners and the home bar
    const safeBottom = Math.max(BOTTOM_MIN, (safe ? Math.max(0, height - safe.bottom) : 0) + BOTTOM_AIR);
    // the menu capsule (the ··· button) sits over the top right: keep the header under it
    try {
      const cap = tt.getMenuButtonLayout();
      if (cap && cap.bottom > 0 && cap.bottom < height / 4) safeTop = Math.max(safeTop, cap.bottom + 6);
    } catch {
      /* no capsule (e.g. some hosts) */
    }
    return { width, height, dpr: Math.min(2, s.pixelRatio || 1), safeTop, safeBottom };
  }

  onResize(): void {
    // 抖音 小游戏 has no window resize event on phones; the game re-measures on show instead
  }

  onTouch(cb: (kind: TouchKind, t: TouchPoint) => void): void {
    const each = (kind: TouchKind) => (e: TtTouchEvent) => {
      for (const t of e.changedTouches) cb(kind, { id: t.identifier, x: t.clientX, y: t.clientY });
    };
    tt.onTouchStart(each('start'));
    tt.onTouchMove(each('move'));
    tt.onTouchEnd(each('end'));
    tt.onTouchCancel(each('cancel'));
  }

  onVisibility(cb: (visible: boolean) => void): void {
    tt.onShow((p: { launch_from?: string; location?: string }) => {
      this.noteEntry(p);
      cb(true);
    });
    tt.onHide(() => cb(false));
  }

  onWheel(cb: (dy: number) => void): void {
    // 抖音 on a computer (no wheel on phones)
    try {
      tt.onWheel?.((r: { deltaY?: number }) => {
        const dy = Number(r?.deltaY) || 0;
        if (dy) cb(dy);
      });
    } catch {
      /* not on this client */
    }
  }

  onKey(cb: (key: string) => void): void {
    // 抖音 on a computer
    try {
      tt.onKeyDown?.((r: { key?: string }) => {
        const key = String(r?.key ?? '');
        if (!key) return;
        const t = Date.now();
        const k = this.keys[key];
        const repeat = !!k && k.held && t - k.t < 1000;
        this.keys[key] = { held: true, t };
        if (!repeat) cb(key);
      });
      tt.onKeyUp?.((r: { key?: string }) => {
        const k = r?.key ? this.keys[r.key] : undefined;
        if (k) k.held = false;
      });
    } catch {
      /* not on this client */
    }
  }

  onGesture(cb: () => void): void {
    tt.onTouchEnd(() => cb());
  }

  createCanvas(w: number, h: number): Canvas {
    const c = tt.createCanvas() as Canvas;
    c.width = Math.max(1, Math.ceil(w));
    c.height = Math.max(1, Math.ceil(h));
    this.canvases.n++;
    this.canvases.px += c.width * c.height;
    return c;
  }

  async loadImage(src: string): Promise<ImageSource> {
    const path = src.startsWith('data:') ? src : await this.where(src);
    return new Promise((resolve, reject) => {
      const img: any = tt.createImage();
      const ok = () => resolve(img as ImageSource);
      const bad = () => reject(new Error('image failed: ' + src.slice(0, 60)));
      // 抖音's Image takes both onload/onerror and addEventListener
      img.onload = ok;
      img.onerror = bad;
      try {
        img.addEventListener?.('load', ok);
        img.addEventListener?.('error', bad);
      } catch {
        /* handlers above are enough */
      }
      img.src = path;
    });
  }

  async loadBinary(url: string): Promise<ArrayBuffer> {
    const filePath = await this.where(url);
    return new Promise((resolve, reject) => this.fs.readFile({ filePath, success: (x: { data: ArrayBuffer }) => resolve(x.data), fail: reject }));
  }

  async loadText(url: string): Promise<string> {
    const filePath = await this.where(url);
    return new Promise((resolve, reject) => this.fs.readFile({ filePath, encoding: 'utf8', success: (x: { data: string }) => resolve(x.data), fail: reject }));
  }

  async loadJson<T = unknown>(url: string): Promise<T> {
    return JSON.parse(await this.loadText(url)) as T;
  }

  async loadFont(family: string, url: string): Promise<boolean> {
    try {
      // the build renames the fonts' family to what the game asks for, so this returns `family`
      const got = tt.loadFont(await this.where(url));
      if (got !== family) this.log('warn', `font family ${String(got).slice(0, 20)} != ${family}`);
      return !!got && !!family;
    } catch {
      return false;
    }
  }

  storageGet(key: string): string | null {
    try {
      const v = tt.getStorageSync(key);
      // a missing key reads as ''
      return typeof v === 'string' && v !== '' ? v : null;
    } catch {
      return null;
    }
  }

  storageSet(key: string, value: string): boolean {
    try {
      tt.setStorageSync(key, value);
      return true;
    } catch {
      return false; // over the storage limit
    }
  }

  storageRemove(key: string): void {
    try {
      tt.removeStorageSync(key);
    } catch {
      /* nothing to do */
    }
  }

  createAudioContext(): AudioContext | null {
    // not used by the game here: all its sound goes through createStream (see StreamAudio in src/engine/audio-streams.ts)
    return null;
  }

  createStream(url: string, o: { loop: boolean; volume: number; onEnd?: () => void }): Stream {
    const a = tt.createInnerAudioContext();
    a.loop = o.loop;
    a.volume = o.volume;
    let want = false, dead = false, ready = false;
    const name = url.replace(/^.*\//, '');
    a.onError?.((e: { errMsg?: string; errCode?: number }) => {
      if (this.streamErrors++ < 20) this.log('warn', `stream ${name} error ${e?.errCode ?? ''} ${String(e?.errMsg ?? '').slice(0, 100)}`);
      o.onEnd?.();
    });
    if (o.onEnd) a.onEnded?.(() => !dead && o.onEnd!());
    // the file may still be in its subpackage's download: it's played as soon as it's there, if still wanted
    void this.where(url).then(
      (path) => {
        if (dead) return;
        a.src = path;
        ready = true;
        if (want) a.play();
      },
      (e) => {
        this.log('warn', `stream ${name} not found ${String((e as Error)?.message ?? e).slice(0, 80)}`);
        o.onEnd?.();
      },
    );
    const run = (f: () => void) => {
      if (!ready || dead) return;
      try {
        f();
      } catch {
        /* the player has gone */
      }
    };
    return {
      play: () => {
        want = true;
        run(() => a.play());
      },
      pause: () => {
        want = false;
        run(() => a.pause());
      },
      stop: () => {
        want = false;
        run(() => a.stop());
      },
      get paused() {
        return dead || !ready || a.paused !== false;
      },
      get time() {
        return dead ? 0 : Number(a.currentTime) || 0;
      },
      get volume() {
        return a.volume;
      },
      set volume(v: number) {
        if (!dead) a.volume = v;
      },
      destroy: () => {
        if (dead) return;
        dead = true;
        try {
          a.destroy();
        } catch {
          /* already gone */
        }
      },
    };
  }

  gc(): void {
    try {
      tt.triggerGC?.();
    } catch {
      /* not on this client */
    }
  }

  onMemoryWarning(cb: () => void): void {
    tt.onMemoryWarning?.(() => cb());
  }

  vibrate(): void {
    // 抖音's vibrateShort takes no strength
    tt.vibrateShort?.({ fail: () => undefined });
  }

  prepareImage(): void {
    // nothing to get ready: saving goes through a file
  }

  async saveImage(canvas: Canvas): Promise<SaveResult> {
    let filePath: string;
    try {
      filePath = (canvas as any).toTempFilePathSync({ fileType: 'jpg', quality: 0.92 });
    } catch {
      return 'failed';
    }
    try {
      await call('saveImageToPhotosAlbum', { filePath });
      return 'album';
    } catch (e) {
      const msg = String((e as { errMsg?: string })?.errMsg ?? e);
      if (/cancel/i.test(msg)) return 'cancelled';
      if (!/auth|deny|denied|permission|privacy/i.test(msg)) return 'failed';
      tt.showModal({
        title: '想存进相册', content: '要先允许蛙趣送包裹「保存到相册」，在系统设置里就能改。', confirmText: '去设置', cancelText: '算了',
        success: (r: { confirm: boolean }) => r.confirm && tt.openSetting?.({ fail: () => undefined }),
      });
      return 'denied';
    }
  }

  showImage(): void {
    // there's no page to lay a picture on; saving works from the button
  }

  share(opts: { title: string }): void {
    // 抖音's share card picture isn't set per call: it comes from the admin console
    try {
      tt.shareAppMessage({ title: opts.title, desc: SHARE_DESC });
    } catch {
      /* the player closed the sheet, or the host has no share */
    }
  }

  /** Posting a picture into Douyin needs the 图文分享 ability granted in the console; until then, no. */
  async shareImage(): Promise<boolean> {
    return false;
  }

  encodeImage(canvas: Canvas, quality: number): string | null {
    try {
      const url = (canvas as any).toDataURL('image/jpeg', quality);
      return typeof url === 'string' && url.startsWith('data:image/jpeg') ? url : null;
    } catch {
      return null;
    }
  }

  promptText(title: string, value: string, maxLength: number): Promise<string | null> {
    // 抖音's showModal has no editable field: the system keyboard does the typing.
    // 敏感词必接能力：官方要求以 tt.onKeyboardComplete 返回的文案为最终标准——该文案
    // 已经过平台安全处理（敏感词被替换为 '*'）。不要用 tt.onKeyboardInput 逐字接收
    // （不触发敏感词检测），也不要只依赖 tt.onKeyboardConfirm（玩家直接关闭键盘时不触发）。
    return new Promise((resolve) => {
      let done = false;
      const finish = (v: string | null) => {
        if (done) return;
        done = true;
        try {
          tt.offKeyboardComplete?.(onComplete);
          tt.hideKeyboard?.({ fail: () => undefined });
        } catch {
          /* already gone */
        }
        resolve(v);
      };
      const clean = (v?: string) => {
        const s = String(v ?? '').trim();
        return s ? [...s].slice(0, maxLength).join('') : null;
      };
      const onComplete = (r: { value?: string }) => {
        const s = clean(r?.value);
        // 自审标准 P0：命中敏感词被替换为 '*' 时，需要给出风险提示文案。
        if (s && s.includes('*')) {
          try {
            tt.showToast?.({ title: '因相关法律和要求，相关输入结果不予展示', icon: 'none' });
          } catch {
            /* toast is best-effort */
          }
        }
        finish(s);
      };
      try {
        tt.onKeyboardComplete(onComplete);
        tt.showKeyboard({
          maxLength, defaultValue: value, multiple: false, confirmHold: false, confirmType: 'done',
          fail: () => finish(null),
        });
      } catch {
        finish(null);
      }
      this.log('info', `keyboard for ${title}`);
    });
  }

  deviceInfo(): Record<string, string | number | boolean> {
    const s = tt.getSystemInfoSync();
    const os = String(s.platform || 'other').toLowerCase();
    return {
      os: os === 'oharmony' || os === 'openharmony' ? 'harmony' : os, browser: 'minigame',
      w: s.windowWidth, h: s.windowHeight, dpr: Math.round((s.pixelRatio || 1) * 100) / 100,
      touch: true, standalone: false, tt: String(s.version || ''), sdk: String(s.SDKVersion || ''), host: String(s.appName || ''),
    };
  }

  postJson(url: string, body: string, headers: Record<string, string>): Promise<number> {
    // only reaches servers listed under 服务器域名 in the mini game's settings
    return new Promise((resolve) => {
      tt.request({
        url, method: 'POST', data: body, header: { 'Content-Type': 'application/json', ...headers }, timeout: 8000,
        success: (r: { statusCode: number }) => resolve(r.statusCode),
        fail: () => resolve(0),
      });
    });
  }

  onError(cb: (msg: string, where: string) => void): void {
    tt.onError?.((e: { message?: string; stack?: string }) => cb(String(e.message).slice(0, 200), String(e.stack ?? '').split('\n').slice(0, 3).join(' | ').slice(0, 400)));
    // 抖音 has no onUnhandledRejection
  }

  /** 侧边栏复访 (a mandatory Douyin capability): whether the entrance can be offered. */
  sidebarAvailable(): boolean {
    return this.sidebarOk && typeof tt.navigateToScene === 'function';
  }

  /** Sends the player to Douyin's home side bar, where the game's icon waits (tt.navigateToScene). */
  openSidebar(): void {
    try {
      tt.navigateToScene({
        scene: 'sidebar',
        success: () => this.log('info', 'sidebar ok'),
        fail: (e: { errMsg?: string; errNo?: number }) => this.log('warn', `sidebar fail ${e?.errNo ?? ''} ${e?.errMsg ?? ''}`),
      });
    } catch (e) {
      this.log('warn', `sidebar ${String(e).slice(0, 80)}`);
    }
  }

  /** True once if this open came from the side bar (so the gift can be handed over). */
  fromSidebar(): boolean {
    const was = this.sideCame;
    this.sideCame = false;
    return was;
  }

  adsAvailable(): boolean {
    return !!REWARDED_AD_UNIT_ID && typeof tt !== 'undefined'
      && typeof tt.createRewardedVideoAd === 'function' && !this.adBlocked;
  }

  async showRewardedAd(reason: RewardedAdReason): Promise<boolean> {
    if (!this.adsAvailable() || this.adBusy) return false;
    if (!this.ad) {
      try {
        this.ad = tt.createRewardedVideoAd({ adUnitId: REWARDED_AD_UNIT_ID });
        this.ad.onLoad(() => { this.adBlocked = false; });
        this.ad.onError((e: { errCode?: number; errMsg?: string }) => {
          const code = e?.errCode ?? 0;
          this.log('warn', `waqu ad err ${code} ${e?.errMsg ?? ''}`);
          if (code && code !== 1000 && code !== 1003) this.adBlocked = true;
          this.failAd?.();
        });
      } catch (e) {
        this.log('warn', `waqu ad create ${String(e)}`);
        this.adBlocked = true;
        return false;
      }
    }
    const ad = this.ad;
    this.adBusy = true;
    try {
      return await new Promise<boolean>((resolve) => {
        let settled = false;
        let retried = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const finish = (ok: boolean) => {
          if (settled) return;
          settled = true;
          if (timer) clearTimeout(timer);
          ad.offClose?.(onClose);
          resolve(ok);
        };
        // Old clients omit the close result for legacy rewards. New supplies require confirmed completion.
        const onClose = (res: { isEnded?: boolean } | undefined) => finish(res?.isEnded === true || (!res && reason !== 'supply'));
        this.failAd = () => finish(false);
        ad.onClose(onClose);
        // a stuck ad must never leave the game waiting
        timer = setTimeout(() => finish(false), 180000);
        const show = () => {
          try {
            const p = ad.show();
            if (p && typeof p.catch === 'function') p.catch(async () => {
              // the documented retry: not loaded yet, so load() once and show() again
              if (retried || settled) return finish(false);
              retried = true;
              try {
                await ad.load();
                if (!settled) show();
              } catch {
                this.adBlocked = true;
                finish(false);
              }
            });
          } catch { finish(false); }
        };
        show();
      });
    } catch {
      return false;
    } finally {
      this.adBusy = false;
      this.failAd = null;
      this.log('info', `waqu ad ${reason} done`);
      // warm up the next video; no fill is normal before the unit exists or when the day's cap is spent
      try {
        const p = this.ad?.load();
        if (p && typeof p.catch === 'function') p.catch(() => { /* stay quiet */ });
      } catch { /* stay quiet */ }
    }
  }

  now(): number {
    return Date.now() - this.t0;
  }

  requestFrame(cb: (t: number) => void): void {
    // minimized on a computer the game keeps getting frames; nothing can be seen, so it ticks over slowly instead
    if (this.minimized) setTimeout(() => cb(this.now()), 500);
    else requestAnimationFrame(() => cb(this.now()));
  }
}
