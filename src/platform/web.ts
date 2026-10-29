import type { Canvas, ImageSource, Platform, SaveResult, ScreenInfo, TouchKind, TouchPoint } from './types';

/** Narrowest and widest portrait aspect (height / width) the game lays out for. */
const MIN_ASPECT = 1334 / 750;

export class WebPlatform implements Platform {
  readonly kind = 'web' as const;
  readonly canvas: Canvas;
  readonly longPressSave = true;
  private probe: HTMLElement | null;
  private touch: ((kind: TouchKind, t: TouchPoint) => void) | null = null;
  /** Encoded pictures, so a save can start right inside the tap. */
  private encoded = new WeakMap<Canvas, Promise<Blob | null>>();
  private blobs = new WeakMap<Canvas, Blob>();
  private urls = new WeakMap<Canvas, string>();
  private overlay: { el: HTMLImageElement; src: Canvas | null; key: string } | null = null;

  constructor() {
    this.canvas = document.getElementById('game') as Canvas;
    this.probe = document.getElementById('safe-probe');
    // Keep iOS from scrolling or zooming the page while playing.
    document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    // (except on a picture laid over the game, which is there to be saved)
    document.addEventListener('contextmenu', (e) => {
      if ((e.target as Element | null)?.tagName !== 'IMG') e.preventDefault();
    });
  }

  screen(): ScreenInfo {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let w = vw;
    let h = vh;
    // On wide screens (desktop, landscape) play in a centered portrait column.
    if (h / w < MIN_ASPECT) w = Math.round(h / MIN_ASPECT);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    let safeTop = 0;
    let safeBottom = 0;
    if (this.probe) {
      const cs = getComputedStyle(this.probe);
      safeTop = parseFloat(cs.paddingTop) || 0;
      safeBottom = parseFloat(cs.paddingBottom) || 0;
    }
    return { width: w, height: h, dpr, safeTop, safeBottom };
  }

  onResize(cb: () => void): void {
    let pending = 0;
    const fire = () => {
      cancelAnimationFrame(pending);
      pending = requestAnimationFrame(() => cb());
    };
    window.addEventListener('resize', fire);
    window.addEventListener('orientationchange', () => setTimeout(fire, 200));
    window.visualViewport?.addEventListener('resize', fire);
  }

  private pt(e: PointerEvent): TouchPoint {
    const r = this.canvas.getBoundingClientRect();
    return { id: e.pointerId, x: e.clientX - r.left, y: e.clientY - r.top };
  }

  onTouch(cb: (kind: TouchKind, t: TouchPoint) => void): void {
    const c = this.canvas;
    const pt = (e: PointerEvent) => this.pt(e);
    this.touch = cb;
    c.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try {
        c.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      cb('start', pt(e));
    });
    c.addEventListener('pointermove', (e) => cb('move', pt(e)));
    c.addEventListener('pointerup', (e) => cb('end', pt(e)));
    c.addEventListener('pointercancel', (e) => cb('cancel', pt(e)));
  }

  onWheel(cb: (dy: number) => void): void {
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      cb(e.deltaMode === 1 ? e.deltaY * 32 : e.deltaY);
    }, { passive: false });
  }

  onVisibility(cb: (visible: boolean) => void): void {
    document.addEventListener('visibilitychange', () => cb(document.visibilityState === 'visible'));
  }

  onGesture(cb: () => void): void {
    // browsers only let audio start inside these (a touch counts when it ends; pointerdown doesn't)
    for (const type of ['touchend', 'pointerup', 'click', 'keydown']) document.addEventListener(type, cb, { capture: true, passive: true });
  }

  createCanvas(w: number, h: number): Canvas {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w));
    c.height = Math.max(1, Math.ceil(h));
    return c;
  }

  loadImage(src: string): Promise<ImageSource> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('image failed: ' + src.slice(0, 60)));
      img.src = src;
    });
  }

  async loadBinary(url: string): Promise<ArrayBuffer> {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    return r.arrayBuffer();
  }

  async loadText(url: string): Promise<string> {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    return r.text();
  }

  async loadJson<T = unknown>(url: string): Promise<T> {
    return JSON.parse(await this.loadText(url)) as T;
  }

  async loadFont(family: string, url: string): Promise<boolean> {
    try {
      const face = new FontFace(family, `url(${url})`);
      await face.load();
      (document.fonts as unknown as { add(f: FontFace): void }).add(face);
      return true;
    } catch {
      return false;
    }
  }

  storageGet(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  storageSet(key: string, value: string): boolean {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch {
      return false; // private mode or full: it just isn't kept
    }
  }

  storageRemove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      /* nothing to do */
    }
  }

  createAudioContext(): AudioContext | null {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    try {
      return new AC();
    } catch {
      return null;
    }
  }

  vibrate(ms: number): void {
    try {
      navigator.vibrate?.(ms);
    } catch {
      /* not supported (iOS Safari) */
    }
  }

  private encode(canvas: Canvas): Promise<Blob | null> {
    let p = this.encoded.get(canvas);
    if (!p) {
      p = new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92)).then((b) => {
        if (b) {
          this.blobs.set(canvas, b);
          this.urls.set(canvas, URL.createObjectURL(b));
        }
        return b;
      });
      this.encoded.set(canvas, p);
    }
    return p;
  }

  prepareImage(canvas: Canvas): void {
    void this.encode(canvas);
  }

  async saveImage(canvas: Canvas, filename: string): Promise<SaveResult> {
    // WeChat's browser ignores downloads; the picture can be long-pressed there instead.
    if (/MicroMessenger/i.test(navigator.userAgent)) return 'longpress';
    // No await before the share sheet when the picture is ready: it has to open inside the tap.
    const blob = this.blobs.get(canvas) ?? (await this.encode(canvas));
    if (!blob) return 'failed';
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const file = new File([blob], filename, { type: blob.type });
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (ios && nav.canShare?.({ files: [file] })) {
      try {
        await nav.share({ files: [file] });
        return 'shared';
      } catch (e) {
        if ((e as DOMException).name === 'AbortError') return 'cancelled';
        // otherwise fall back to a download
      }
    }
    try {
      const a = document.createElement('a');
      a.download = filename;
      a.href = this.urls.get(canvas) ?? URL.createObjectURL(blob);
      document.body.appendChild(a);
      a.click();
      a.remove();
      return 'downloaded';
    } catch {
      return 'failed';
    }
  }

  showImage(canvas: Canvas | null, rect?: { x: number; y: number; w: number; h: number }): void {
    if (!canvas || !rect) {
      if (this.overlay) this.overlay.el.style.display = 'none';
      return;
    }
    let o = this.overlay;
    if (!o) {
      const el = document.createElement('img');
      el.alt = '';
      el.draggable = false;
      el.style.cssText = 'position:fixed;z-index:2;display:none;-webkit-touch-callout:default;-webkit-user-select:auto;user-select:auto;touch-action:none;';
      // taps and swipes on the picture still steer the game
      for (const [type, kind] of [['pointerdown', 'start'], ['pointermove', 'move'], ['pointerup', 'end'], ['pointercancel', 'cancel']] as const) {
        el.addEventListener(type, (e) => this.touch?.(kind, this.pt(e)));
      }
      document.body.appendChild(el);
      o = this.overlay = { el, src: null, key: '' };
    }
    if (o.src !== canvas) {
      o.src = canvas;
      o.key = '';
      o.el.removeAttribute('src');
      const ov = o;
      void this.encode(canvas).then(() => {
        const url = this.urls.get(canvas);
        if (ov.src === canvas && url) ov.el.src = url;
      });
    }
    const r = this.canvas.getBoundingClientRect();
    const key = [r.left + rect.x, r.top + rect.y, rect.w, rect.h].map((v) => v.toFixed(1)).join();
    if (key !== o.key) {
      o.key = key;
      const s = o.el.style;
      s.left = `${r.left + rect.x}px`;
      s.top = `${r.top + rect.y}px`;
      s.width = `${rect.w}px`;
      s.height = `${rect.h}px`;
    }
    o.el.style.display = o.el.getAttribute('src') ? 'block' : 'none';
  }

  share(opts: { title: string; canvas?: Canvas }): void {
    // Reserved for the WeChat build (share card). On the web, fall back to the share sheet if any.
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    nav.share?.({ title: opts.title, url: location.href }).catch(() => undefined);
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
    // the browser's own box; the WeChat build will use wx.showModal({ editable: true })
    const s = window.prompt(title, value);
    return Promise.resolve(s === null ? null : [...s.trim()].slice(0, maxLength).join(''));
  }

  deviceInfo(): Record<string, string | number | boolean> {
    const ua = navigator.userAgent;
    const os = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ? 'ios'
      : /Android|HarmonyOS/.test(ua) ? 'android' : /Mac/.test(ua) ? 'mac' : /Win/.test(ua) ? 'win' : 'other';
    // the app the link was opened in matters more than the engine (WeChat's browser behaves differently)
    const apps: [RegExp, string][] = [
      [/MicroMessenger/i, 'wechat'], [/QQ\//, 'qq'], [/DingTalk/i, 'dingtalk'], [/Lark|Feishu/i, 'feishu'], [/Weibo/i, 'weibo'],
      [/UCBrowser/i, 'uc'], [/Quark/i, 'quark'], [/HuaweiBrowser/i, 'huawei'], [/MiuiBrowser/i, 'xiaomi'],
      [/baiduboxapp|baidubrowser/i, 'baidu'], [/EdgA?\/|EdgiOS/, 'edge'], [/FxiOS|Firefox\//, 'firefox'],
      [/CriOS|Chrome\//, 'chrome'], [/Safari\//, 'safari'],
    ];
    const browser = apps.find(([re]) => re.test(ua))?.[1] ?? 'other';
    return {
      os, browser,
      w: window.innerWidth, h: window.innerHeight, dpr: Math.round((window.devicePixelRatio || 1) * 100) / 100,
      touch: navigator.maxTouchPoints > 0,
      standalone: window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true,
    };
  }

  async postJson(url: string, body: string, headers: Record<string, string>, keepalive = false): Promise<number> {
    // the stats server is often unreachable from mainland China: give up quickly instead of holding the connection (and the queue) open
    const stop = new AbortController();
    const timer = setTimeout(() => stop.abort(), 8000);
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body, keepalive, signal: stop.signal });
      return r.status;
    } catch {
      return 0;
    } finally {
      clearTimeout(timer);
    }
  }

  onError(cb: (msg: string, where: string) => void): void {
    window.addEventListener('error', (e) => {
      const stack = (e.error as Error | undefined)?.stack?.split('\n').slice(0, 3).join(' | ') ?? '';
      cb(String(e.message).slice(0, 200), `${(e.filename || '').split('/').pop()}:${e.lineno}:${e.colno} ${stack}`.slice(0, 400));
    });
    window.addEventListener('unhandledrejection', (e) => {
      const r = e.reason as Error | undefined;
      cb(String(r?.message ?? r).slice(0, 200), `promise ${r?.stack?.split('\n').slice(0, 3).join(' | ') ?? ''}`.slice(0, 400));
    });
  }

  now(): number {
    return performance.now();
  }

  requestFrame(cb: (t: number) => void): void {
    requestAnimationFrame(cb);
  }
}
