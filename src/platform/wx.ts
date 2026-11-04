// The WeChat mini game platform: the same interface as web.ts, on wx.* instead of the DOM.
// scripts/build_wx.py bundles this with the game into game.js and lays out the package:
//   game.js, fonts/*.ttf, core/art/ (what the first screen needs, plus manifest.json and files.json)  main package
//   art/    the rest of the art                                                                         subpackage "art"
//   audio/  sound and music                                                                             subpackage "audio"
// The game asks for files by their web paths (art/x.webp, audio/…, fonts/x.woff2); `where` maps them to the package.
import type { Canvas, FriendRank, ImageSource, Platform, SaveResult, ScreenInfo, Stream, TouchKind, TouchPoint } from './types';

// The wx global and its objects, typed loosely: only what's used here.
declare const wx: any;
declare const __BUILD__: string;
/** Built with the friends' ranking (npm run build:wx -- --rank): game.json then has the open data context. */
declare const __WX_RANK__: boolean;
type WxTouch = { identifier: number; clientX: number; clientY: number };
type WxTouchEvent = { changedTouches: WxTouch[] };

/** Subpackages by the path their files live under. */
const SUBPACKAGES = ['art', 'audio'] as const;
type Sub = (typeof SUBPACKAGES)[number];

/** Clear space kept along the bottom, in screen points: at least BOTTOM_MIN, and BOTTOM_AIR over the system's inset. */
const BOTTOM_MIN = 24;
const BOTTOM_AIR = 10;

const SHARE_TITLE = '蛙趣送包裹：小青蛙在河上跳来跳去送快递';

const call = <T = any>(api: string, o: Record<string, unknown> = {}): Promise<T> =>
  new Promise((resolve, reject) => wx[api]({ ...o, success: resolve, fail: reject }));

/** a >= b for dotted versions ("3.6.6"). */
function atLeast(a: string, b: string) {
  const x = a.split('.').map(Number), y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return true;
}

/** The ranking's key: the same as the one set up in the admin (游戏能力地图 → 微信排行榜配置). */
const RANK_KEY = 'stamps';
/** Set once the player has opened the ranking: only then is their score sent to WeChat. */
const RANK_ON = 'waqu-rank-on';

/**
 * The friends' ranking. The list itself is drawn by wx/opendata/index.js (the open data context, the only place
 * friends' data can be read) on WeChat's shared canvas in screenCanvas mode: an on-screen canvas laid over the
 * game, so the game's own canvas has none of the offscreen mode's limits (the river photos copy it). That mode
 * is fixed the first time the context is asked for, so it's asked for at startup, and only from base library
 * 3.6.6, where screenCanvas exists; before that there's no ranking at all.
 */
class WxFriendRank {
  private odc: any;
  private at = '';
  private sent = '';

  constructor(private pl: WxPlatform) {
    this.odc = wx.getOpenDataContext({ sharedCanvasMode: 'screenCanvas' });
    this.hide();
  }

  private get on() {
    return this.pl.storageGet(RANK_ON) === '1';
  }

  private hide() {
    const c = this.odc.canvas;
    c.width = 1;
    c.height = 1;
    Object.assign(c.style, { width: '1px', height: '1px', left: '-10px', top: '-10px' });
  }

  /** Sends the score unless WeChat already has this one. */
  private upload(stamps: number, day: number): Promise<boolean> {
    const value = JSON.stringify({ wxgame: { score: Math.max(0, Math.round(stamps)), update_time: Math.floor(Date.now() / 1000) }, day });
    const same = `${stamps}:${day}`;
    if (same === this.sent) return Promise.resolve(true);
    return call('setUserCloudStorage', { KVDataList: [{ key: RANK_KEY, value }] })
      .then(() => {
        this.sent = same;
        return true;
      })
      .catch((e) => {
        this.pl.log('warn', `rank upload ${String(e?.errMsg ?? e).slice(0, 120)}`);
        return false;
      });
  }

  score(stamps: number, day: number) {
    if (this.on) void this.upload(stamps, day);
  }

  async open(stamps: number, day: number) {
    // the privacy guide lists 微信朋友关系: WeChat shows its consent first if the player hasn't agreed yet
    if (wx.requirePrivacyAuthorize) {
      try {
        await call('requirePrivacyAuthorize');
      } catch {
        this.pl.log('info', 'rank privacy declined');
        return false;
      }
    }
    this.pl.storageSet(RANK_ON, '1');
    await this.upload(stamps, day);
    // the list fetches friends' scores now (the first time WeChat asks to use 微信朋友信息)
    this.odc.postMessage({ cmd: 'load' });
    this.pl.log('info', 'rank open');
    return true;
  }

  place(rect: { x: number; y: number; w: number; h: number } | null) {
    const at = rect ? `${Math.round(rect.x)},${Math.round(rect.y)},${Math.round(rect.w)},${Math.round(rect.h)}` : '';
    if (at === this.at) return;
    this.at = at;
    if (!rect) {
      this.hide();
      this.odc.postMessage({ cmd: 'hide' });
      return;
    }
    const w = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const dpr = Math.min(w.pixelRatio || 2, 3);
    const c = this.odc.canvas;
    c.width = Math.round(rect.w * dpr);
    c.height = Math.round(rect.h * dpr);
    Object.assign(c.style, { width: `${Math.round(rect.w)}px`, height: `${Math.round(rect.h)}px`, left: `${Math.round(rect.x)}px`, top: `${Math.round(rect.y)}px` });
    // resizing cleared it: the list draws itself again (and takes its touches from inside this box)
    this.odc.postMessage({ cmd: 'show', x: rect.x, y: rect.y, w: rect.w, h: rect.h, dpr });
  }

  async remind(): Promise<'accept' | 'reject' | 'failed'> {
    try {
      const r = await call<Record<string, string>>('requestSubscribeSystemMessage', { msgTypeList: ['SYS_MSG_TYPE_RANK'] });
      return r.SYS_MSG_TYPE_RANK === 'accept' ? 'accept' : 'reject';
    } catch (e) {
      this.pl.log('warn', `rank remind ${String((e as { errMsg?: string })?.errMsg ?? e).slice(0, 120)}`);
      return 'failed';
    }
  }
}

export class WxPlatform implements Platform {
  readonly kind = 'wx' as const;
  readonly canvas: Canvas;
  readonly longPressSave = false;
  private fs = wx.getFileSystemManager();
  /** Art by sprite name -> its file in the package (written by the build: PNG, or JPEG for opaque art). */
  private art: Record<string, string> = {};
  private subs = new Map<Sub, Promise<void>>();
  private t0 = Date.now();
  /** WeChat's 实时日志, and how many lines this run has sent to it (capped, see `log`). */
  private rt: any = null;
  private rtLines = 0;
  /** Canvases made, and their pixels when made: the biggest memory the game holds besides images. */
  private canvases = { n: 0, px: 0 };
  /** Player errors logged so far (a broken file mustn't fill the log). */
  private streamErrors = 0;
  /** The game club button (made the first time a screen wants it), and where it sits now ('' when hidden). */
  private club: any = null;
  private clubAt = '';
  private clubFailed = false;
  /** Only in a `--rank` build on a base library with screenCanvas (3.6.6). */
  readonly friendRank?: FriendRank;

  constructor() {
    // the first canvas made is the screen
    this.canvas = wx.createCanvas() as Canvas;
    try {
      this.art = JSON.parse(this.fs.readFileSync('core/art/files.json', 'utf8') as string);
    } catch {
      // no file list: every sprite falls back to its placeholder
    }
    // start the art download straight away (it's what the loading screen waits on), then the sound's
    void this.sub('art')
      .catch(() => undefined)
      .then(() => this.sub('audio'))
      .catch(() => undefined);
    this.startLog();
    if (typeof __WX_RANK__ !== 'undefined' && __WX_RANK__ && wx.getOpenDataContext) {
      const sdk = String((wx.getAppBaseInfo ? wx.getAppBaseInfo() : wx.getSystemInfoSync()).SDKVersion || '0');
      try {
        if (atLeast(sdk, '3.6.6')) this.friendRank = new WxFriendRank(this);
      } catch (e) {
        this.log('warn', `rank ${String((e as Error)?.message ?? e).slice(0, 80)}`);
      }
    }
    wx.showShareMenu?.({ menus: ['shareAppMessage', 'shareTimeline'] });
    wx.onShareAppMessage?.(() => ({ title: SHARE_TITLE, imageUrl: 'core/share.jpg' }));
    wx.onShareTimeline?.(() => ({ title: SHARE_TITLE, imageUrl: 'core/share.jpg' }));
    // a newer version waiting: offer to restart into it
    const um = wx.getUpdateManager?.();
    um?.onUpdateReady(() => {
      wx.showModal({
        title: '有新版本', content: '蛙趣送包裹更新好了，重新打开就能玩新版。', confirmText: '重新打开', cancelText: '等会儿',
        success: (r: { confirm: boolean }) => r.confirm && um.applyUpdate(),
      });
    });
  }

  /**
   * The remote log: lines go to WeChat's 实时日志 (only from phones, not the developer tool), tagged with
   * the build so one version's lines can be picked out. The game's lifecycle, memory warnings and errors are
   * logged from here; the game adds its own lines (sound, a heartbeat every few seconds).
   */
  private startLog() {
    try {
      this.rt = wx.getRealtimeLogManager ? wx.getRealtimeLogManager() : null;
      this.rt?.setFilterMsg?.('waqu');
      this.rt?.addFilterMsg?.('b' + (typeof __BUILD__ === 'string' ? __BUILD__ : 'dev'));
    } catch {
      this.rt = null;
    }
    const d = wx.getDeviceInfo ? wx.getDeviceInfo() : wx.getSystemInfoSync();
    const w = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const app = wx.getAppBaseInfo ? wx.getAppBaseInfo() : wx.getSystemInfoSync();
    this.log('info', `start ${d.brand} ${d.model} ${d.system} wx${app.version} sdk${app.SDKVersion} ${w.windowWidth}x${w.windowHeight}@${w.pixelRatio} mem${d.memorySize ?? '?'} build ${typeof __BUILD__ === 'string' ? __BUILD__ : 'dev'}`);
    wx.onShow?.(() => this.log('info', 'show'));
    wx.onHide?.(() => this.log('info', 'hide'));
    wx.onAudioInterruptionBegin?.(() => this.log('warn', 'audio interruption begin'));
    wx.onAudioInterruptionEnd?.(() => this.log('info', 'audio interruption end'));
    wx.onMemoryWarning?.((r: { level?: number }) => this.log('warn', `memory warning ${r?.level ?? ''} canvases ${this.canvases.n} ${Math.round(this.canvases.px / 1e6)}Mpx`));
    wx.onError?.((e: { message?: string; stack?: string }) => this.log('error', `error ${String(e.message).slice(0, 160)} | ${String(e.stack ?? '').split('\n').slice(0, 3).join(' | ').slice(0, 300)}`));
    wx.onUnhandledRejection?.((e: { reason?: { message?: string } }) => this.log('error', `rejection ${String(e.reason?.message ?? e.reason).slice(0, 200)}`));
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
    const w = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const width = w.windowWidth, height = w.windowHeight;
    const safe = w.safeArea;
    let safeTop = safe ? safe.top : w.statusBarHeight || 0;
    // The game runs to the very edge of the glass: keep what sits along the bottom clear of the screen's
    // rounded corners and the home bar. Phones with a home bar report it (34 on iPhone); round-cornered
    // ones without one report nothing, so there's a floor, and a little air above whatever is reported.
    const safeBottom = Math.max(BOTTOM_MIN, (safe ? Math.max(0, height - safe.bottom) : 0) + BOTTOM_AIR);
    // WeChat's capsule (the ··· and close buttons) sits over the top right: keep the header under it
    try {
      const cap = wx.getMenuButtonBoundingClientRect();
      if (cap && cap.bottom > 0 && cap.bottom < height / 4) safeTop = Math.max(safeTop, cap.bottom + 6);
    } catch {
      /* no capsule (PC) */
    }
    return { width, height, dpr: Math.min(2, w.pixelRatio || 1), safeTop, safeBottom };
  }

  onResize(cb: () => void): void {
    wx.onWindowResize?.(() => cb());
  }

  onTouch(cb: (kind: TouchKind, t: TouchPoint) => void): void {
    const each = (kind: TouchKind) => (e: WxTouchEvent) => {
      for (const t of e.changedTouches) cb(kind, { id: t.identifier, x: t.clientX, y: t.clientY });
    };
    wx.onTouchStart(each('start'));
    wx.onTouchMove(each('move'));
    wx.onTouchEnd(each('end'));
    wx.onTouchCancel(each('cancel'));
  }

  onVisibility(cb: (visible: boolean) => void): void {
    wx.onShow(() => cb(true));
    wx.onHide(() => cb(false));
    // after a phone call or an alarm the sound has to be resumed (WeChat's audio notes); the start of one
    // isn't passed on: a real call sends the game to the background anyway
    wx.onAudioInterruptionEnd?.(() => cb(true));
  }

  onGesture(cb: () => void): void {
    wx.onTouchEnd(() => cb());
  }

  createCanvas(w: number, h: number): Canvas {
    const c = wx.createCanvas() as Canvas;
    c.width = Math.max(1, Math.ceil(w));
    c.height = Math.max(1, Math.ceil(h));
    this.canvases.n++;
    this.canvases.px += c.width * c.height;
    return c;
  }

  async loadImage(src: string): Promise<ImageSource> {
    const path = src.startsWith('data:') ? src : await this.where(src);
    return new Promise((resolve, reject) => {
      const img = wx.createImage();
      img.onload = () => resolve(img as ImageSource);
      img.onerror = () => reject(new Error('image failed: ' + src.slice(0, 60)));
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
      return !!wx.loadFont(await this.where(url)) && !!family;
    } catch {
      return false;
    }
  }

  storageGet(key: string): string | null {
    try {
      const v = wx.getStorageSync(key);
      // a missing key reads as ''
      return typeof v === 'string' && v !== '' ? v : null;
    } catch {
      return null;
    }
  }

  storageSet(key: string, value: string): boolean {
    try {
      wx.setStorageSync(key, value);
      return true;
    } catch {
      return false; // over the 10 MB storage (or 1 MB for one key)
    }
  }

  storageRemove(key: string): void {
    try {
      wx.removeStorageSync(key);
    } catch {
      /* nothing to do */
    }
  }

  createAudioContext(): AudioContext | null {
    // not used by the game here: all its sound goes through createStream (see StreamAudio in src/engine/audio-streams.ts)
    try {
      return wx.createWebAudioContext ? (wx.createWebAudioContext() as AudioContext) : null;
    } catch {
      return null;
    }
  }

  createStream(url: string, o: { loop: boolean; volume: number; onEnd?: () => void }): Stream {
    // the system's player, not its Web Audio version (useWebAudioImplement), which is what the rest of the sound
    // used to go through and what broke up on Android phones
    const a = wx.createInnerAudioContext();
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
      wx.triggerGC?.();
    } catch {
      /* not on this client */
    }
  }

  onMemoryWarning(cb: () => void): void {
    wx.onMemoryWarning?.(() => cb());
  }

  vibrate(ms: number): void {
    wx.vibrateShort?.({ type: ms >= 50 ? 'heavy' : ms >= 25 ? 'medium' : 'light', fail: () => undefined });
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
      if (!/auth|deny|denied|privacy/i.test(msg)) return 'failed';
      // said no before: the switch is in the settings page, which can be opened from a tap in a dialog
      wx.showModal({
        title: '想存进相册', content: '要先允许蛙趣送包裹「保存到相册」，打开设置就能改。', confirmText: '去设置', cancelText: '算了',
        success: (r: { confirm: boolean }) => r.confirm && wx.openSetting?.({}),
      });
      return 'denied';
    }
  }

  showImage(): void {
    // there's no page to lay a picture on; saving works from the button
  }

  share(opts: { title: string; canvas?: Canvas }): void {
    let imageUrl = 'core/share.jpg';
    try {
      // a share card is 5:4
      if (opts.canvas) {
        const c = opts.canvas as any;
        const h = Math.min(c.height, Math.round((c.width * 4) / 5));
        imageUrl = c.toTempFilePathSync({ y: Math.max(0, (c.height - h) / 2), height: h, destWidth: 500, destHeight: 400, fileType: 'jpg', quality: 0.9 });
      }
    } catch {
      /* the stock picture */
    }
    wx.shareAppMessage({ title: opts.title, imageUrl });
  }

  gameClub(rect: { x: number; y: number; w: number; h: number } | null): void {
    if (this.clubFailed) return;
    if (!rect) {
      if (this.clubAt) {
        this.club?.hide();
        this.clubAt = '';
      }
      return;
    }
    const style = { left: Math.round(rect.x), top: Math.round(rect.y), width: Math.round(rect.w), height: Math.round(rect.h) };
    const at = `${style.left},${style.top},${style.width},${style.height}`;
    if (at === this.clubAt) return;
    try {
      if (!this.club) {
        // WeChat's own icon (green on a white rounded tile), so players know it as the game club
        this.club = wx.createGameClubButton({ type: 'image', icon: 'light', style });
        this.club.onTap?.(() => this.log('info', 'game club tap'));
      } else {
        Object.assign(this.club.style, style);
        this.club.show();
      }
      this.clubAt = at;
    } catch (e) {
      // an old WeChat (before 2.0.3) or the PC client: no game club
      this.clubFailed = true;
      this.log('warn', `game club button ${String((e as Error)?.message ?? e).slice(0, 80)}`);
    }
  }

  encodeImage(canvas: Canvas, quality: number): string | null {
    try {
      const url = canvas.toDataURL('image/jpeg', quality);
      return url.startsWith('data:image/jpeg') ? url : null;
    } catch {
      return null;
    }
  }

  promptText(title: string, value: string, maxLength: number): Promise<string | null> {
    return new Promise((resolve) => {
      wx.showModal({
        title, editable: true, content: value, placeholderText: '输入名字', confirmText: '好',
        success: (r: { confirm: boolean; content?: string }) => resolve(r.confirm && r.content?.trim() ? [...r.content.trim()].slice(0, maxLength).join('') : null),
        fail: () => resolve(null),
      });
    });
  }

  deviceInfo(): Record<string, string | number | boolean> {
    const d = wx.getDeviceInfo ? wx.getDeviceInfo() : wx.getSystemInfoSync();
    const w = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const app = wx.getAppBaseInfo ? wx.getAppBaseInfo() : wx.getSystemInfoSync();
    const os = String(d.platform || 'other').toLowerCase();
    return {
      os: os === 'ohos' ? 'harmony' : os, browser: 'minigame',
      w: w.windowWidth, h: w.windowHeight, dpr: Math.round((w.pixelRatio || 1) * 100) / 100,
      touch: true, standalone: false, wx: String(app.version || ''), sdk: String(app.SDKVersion || ''),
    };
  }

  postJson(url: string, body: string, headers: Record<string, string>): Promise<number> {
    // only reaches servers listed under 服务器域名 in the mini game's settings (which have to be ICP-registered)
    return new Promise((resolve) => {
      wx.request({
        url, method: 'POST', data: body, header: { 'Content-Type': 'application/json', ...headers }, timeout: 8000,
        success: (r: { statusCode: number }) => resolve(r.statusCode),
        fail: () => resolve(0),
      });
    });
  }

  onError(cb: (msg: string, where: string) => void): void {
    wx.onError?.((e: { message?: string; stack?: string }) => cb(String(e.message).slice(0, 200), String(e.stack ?? '').split('\n').slice(0, 3).join(' | ').slice(0, 400)));
    wx.onUnhandledRejection?.((e: { reason?: { message?: string; stack?: string } }) => {
      const r = e.reason;
      cb(String(r?.message ?? r).slice(0, 200), `promise ${r?.stack?.split('\n').slice(0, 3).join(' | ') ?? ''}`.slice(0, 400));
    });
  }

  now(): number {
    // wx.getPerformance().now() counts microseconds here; milliseconds from the wall clock are plenty
    return Date.now() - this.t0;
  }

  requestFrame(cb: (t: number) => void): void {
    requestAnimationFrame(() => cb(this.now()));
  }
}
