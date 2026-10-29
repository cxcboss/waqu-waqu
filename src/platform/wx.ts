// The WeChat mini game platform: the same interface as web.ts, on wx.* instead of the DOM.
// scripts/build_wx.py bundles this with the game into game.js and lays out the package:
//   game.js, fonts/*.ttf, core/art/ (what the first screen needs, plus manifest.json and files.json)  main package
//   art/    the rest of the art                                                                         subpackage "art"
//   audio/  sound and music                                                                             subpackage "audio"
// The game asks for files by their web paths (art/x.webp, audio/…, fonts/x.woff2); `where` maps them to the package.
import type { Canvas, ImageSource, Platform, SaveResult, ScreenInfo, TouchKind, TouchPoint } from './types';

// The wx global and its objects, typed loosely: only what's used here.
declare const wx: any;
type WxTouch = { identifier: number; clientX: number; clientY: number };
type WxTouchEvent = { changedTouches: WxTouch[] };

/** Subpackages by the path their files live under. */
const SUBPACKAGES = ['art', 'audio'] as const;
type Sub = (typeof SUBPACKAGES)[number];

const SHARE_TITLE = '蛙趣蛙趣：小青蛙在河上跳来跳去送快递';

const call = <T = any>(api: string, o: Record<string, unknown> = {}): Promise<T> =>
  new Promise((resolve, reject) => wx[api]({ ...o, success: resolve, fail: reject }));

export class WxPlatform implements Platform {
  readonly kind = 'wx' as const;
  readonly canvas: Canvas;
  readonly longPressSave = false;
  private fs = wx.getFileSystemManager();
  /** Art by sprite name -> its file in the package (written by the build: PNG, or JPEG for opaque art). */
  private art: Record<string, string> = {};
  private subs = new Map<Sub, Promise<void>>();
  private t0 = Date.now();

  constructor() {
    // the first canvas made is the screen
    this.canvas = wx.createCanvas() as Canvas;
    try {
      this.art = JSON.parse(this.fs.readFileSync('core/art/files.json', 'utf8') as string);
    } catch {
      // no file list: every sprite falls back to its placeholder
    }
    // start the art download straight away (it's what the loading screen waits on); sound waits for its turn
    void this.sub('art');
    wx.showShareMenu?.({ menus: ['shareAppMessage', 'shareTimeline'] });
    wx.onShareAppMessage?.(() => ({ title: SHARE_TITLE, imageUrl: 'core/share.jpg' }));
    wx.onShareTimeline?.(() => ({ title: SHARE_TITLE, imageUrl: 'core/share.jpg' }));
    // a newer version waiting: offer to restart into it
    const um = wx.getUpdateManager?.();
    um?.onUpdateReady(() => {
      wx.showModal({
        title: '有新版本', content: '蛙趣蛙趣更新好了，重新打开就能玩新版。', confirmText: '重新打开', cancelText: '等会儿',
        success: (r: { confirm: boolean }) => r.confirm && um.applyUpdate(),
      });
    });
  }

  /** Downloads a subpackage once (retrying a few times on a bad connection). */
  private sub(name: Sub): Promise<void> {
    let p = this.subs.get(name);
    if (!p) {
      p = (async () => {
        for (let i = 0; ; i++) {
          try {
            await call('loadSubpackage', { name });
            return;
          } catch (e) {
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
    const safeBottom = safe ? Math.max(0, height - safe.bottom) : 0;
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
    // a phone call or an alarm takes the sound away like going to the background does
    wx.onAudioInterruptionBegin?.(() => cb(false));
    wx.onAudioInterruptionEnd?.(() => cb(true));
  }

  onGesture(cb: () => void): void {
    wx.onTouchEnd(() => cb());
  }

  createCanvas(w: number, h: number): Canvas {
    const c = wx.createCanvas() as Canvas;
    c.width = Math.max(1, Math.ceil(w));
    c.height = Math.max(1, Math.ceil(h));
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
    try {
      return wx.createWebAudioContext ? (wx.createWebAudioContext() as AudioContext) : null;
    } catch {
      return null;
    }
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
        title: '想存进相册', content: '要先允许蛙趣蛙趣「保存到相册」，打开设置就能改。', confirmText: '去设置', cancelText: '算了',
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
