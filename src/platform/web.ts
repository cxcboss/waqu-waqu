import type { Canvas, ImageSource, Platform, SaveResult, ScreenInfo, TouchKind, TouchPoint } from './types';

/** Narrowest and widest portrait aspect (height / width) the game lays out for. */
const MIN_ASPECT = 1334 / 750;

export class WebPlatform implements Platform {
  readonly kind = 'web' as const;
  readonly canvas: Canvas;
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

  onVisibility(cb: (visible: boolean) => void): void {
    document.addEventListener('visibilitychange', () => cb(document.visibilityState === 'visible'));
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

  storageSet(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* private mode: progress just isn't kept */
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

  now(): number {
    return performance.now();
  }

  requestFrame(cb: (t: number) => void): void {
    requestAnimationFrame(cb);
  }
}
