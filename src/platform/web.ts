import type { Canvas, ImageSource, Platform, ScreenInfo, TouchKind, TouchPoint } from './types';

/** Narrowest and widest portrait aspect (height / width) the game lays out for. */
const MIN_ASPECT = 1334 / 750;

export class WebPlatform implements Platform {
  readonly kind = 'web' as const;
  readonly canvas: Canvas;
  private probe: HTMLElement | null;

  constructor() {
    this.canvas = document.getElementById('game') as Canvas;
    this.probe = document.getElementById('safe-probe');
    // Keep iOS from scrolling or zooming the page while playing.
    document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('contextmenu', (e) => e.preventDefault());
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

  onTouch(cb: (kind: TouchKind, t: TouchPoint) => void): void {
    const c = this.canvas;
    const pt = (e: PointerEvent): TouchPoint => {
      const r = c.getBoundingClientRect();
      return { id: e.pointerId, x: e.clientX - r.left, y: e.clientY - r.top };
    };
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

  saveImage(canvas: Canvas, filename: string): void {
    const a = document.createElement('a');
    a.download = filename;
    a.href = canvas.toDataURL('image/png');
    document.body.appendChild(a);
    a.click();
    a.remove();
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
