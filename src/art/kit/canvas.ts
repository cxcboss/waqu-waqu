// Offscreen canvases for the kit. Static drawings (icons, medals, frames, paper grain) are drawn once
// into a canvas at the screen's sharpness and then copied, so a screen full of them costs one
// drawImage each per frame. The platform supplies the canvases (see SpriteBank's constructor).
import type { Canvas, Ctx } from '../../platform/types';

let maker: ((w: number, h: number) => Canvas) | null = null;
let pxFn: () => number = () => 2;

/**
 * Tells the kit how to make an offscreen canvas and how many canvas pixels there are per design
 * unit right now (it changes when the game lowers its resolution on a slow phone).
 */
export function useCanvas(make: (w: number, h: number) => Canvas, pxPerUnit: () => number) {
  maker = make;
  pxFn = pxPerUnit;
  forgetBaked();
}

/** Canvas pixels per design unit, rounded up to a quarter so a tiny change doesn't re-bake everything. */
export const pxPerUnit = () => Math.max(1, Math.ceil(pxFn() * 4 - 0.01) / 4);

/**
 * Shrinks a canvas nobody will draw again, so its pixels are freed now rather than whenever the garbage collector
 * gets round to it: the mini game's canvases live outside the script's memory, which the collector doesn't count.
 */
export function releaseCanvas(c: Canvas) {
  c.width = 1;
  c.height = 1;
}

/** A new offscreen canvas, or null before the platform has said how to make one. */
export function newCanvas(w: number, h: number): Canvas | null {
  return maker ? maker(Math.max(1, Math.ceil(w)), Math.max(1, Math.ceil(h))) : null;
}

/** Area around a drawing's origin, in design units: [x0, y0, x1, y1]. */
export type Bounds = [number, number, number, number];

interface Bake {
  c: Canvas;
  px: number;
  b: Bounds;
  /** What it shows, for a bake kept in one place that's redrawn when this changes (see `drawBakedScreen`). */
  state: string;
}

const baked = new Map<string, Bake>();
/** Canvas pixels held by the cache; past the budget (about 24 MB) the least recently drawn bakes go first. */
let area = 0;
const AREA_MAX = 6e6;

/**
 * Draws a static picture through the cache: the first time into an offscreen canvas, after that a copy.
 * `key` has to name everything the picture depends on (kind, size, colours, state). The drawing's origin
 * lands on (x, y); `b` is the area it may cover around that origin, and `k` scales the copy (the bake
 * itself is always at the screen's sharpness for k = 1, so keep k near 1 or bake a bigger version).
 */
export function drawBaked(ctx: Ctx, key: string, x: number, y: number, b: Bounds, draw: (c: Ctx) => void, k = 1) {
  const px = pxPerUnit();
  const e = bake(key, '', px, (b[2] - b[0]) * px, (b[3] - b[1]) * px, b, draw);
  if (e) ctx.drawImage(e.c, x + b[0] * k, y + b[1] * k, (b[2] - b[0]) * k, (b[3] - b[1]) * k);
  else {
    // no offscreen canvases (yet): draw it straight onto the screen
    ctx.save();
    ctx.translate(x, y);
    if (k !== 1) ctx.scale(k, k);
    draw(ctx);
    ctx.restore();
  }
}

/**
 * Off while a page draws things somewhere other than the game's own transform (the dev artboard's specimens, moved
 * and scaled): the screen-exact drawing below then draws straight onto the screen instead.
 */
let exact = true;
export function screenExact(on: boolean) {
  exact = on;
}

/**
 * `drawBaked` for a background, a panel, a list: anything drawn at the game's own transform (see `blit`), or that
 * moved down by `dy` (a scrolled list). Baked at exactly the screen's pixels and copied onto whole pixels, so it's
 * never resampled, and the many shapes and words in it cost one copy a frame. One bake is kept for each `key`,
 * drawn again whenever `state` (everything it shows: the words, the numbers, the hour) changes.
 */
export function drawBakedScreen(ctx: Ctx, key: string, state: string, x: number, y: number, b: Bounds, draw: (c: Ctx) => void, dy = 0) {
  const s = pxFn();
  const e = exact ? bake(key, state, -s, Math.round((b[2] - b[0]) * s), Math.round((b[3] - b[1]) * s), b, draw) : null;
  if (!e) {
    ctx.save();
    ctx.translate(x, y);
    draw(ctx);
    ctx.restore();
    return;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(e.c, Math.round((x + b[0]) * s), Math.round((y + dy + b[1]) * s));
  ctx.setTransform(s, 0, 0, s, 0, dy * s);
}

/**
 * A long list that doesn't move (only scrolls) drawn through bakes (see `drawBakedScreen`), in strips `strip` design
 * units tall: only the strips between `lo` and `hi` (the list's own units) are drawn, each baked once as `key:n`
 * until `state` changes. `draw` is told which part it's drawing, so it can skip the rest. The strips meet on whole
 * pixels, so there are no seams. The list spans x0–x1 and is moved down by `dy` (minus the scroll).
 */
export function drawStrips(ctx: Ctx, key: string, state: string, x0: number, x1: number, lo: number, hi: number, dy: number, strip: number, draw: (c: Ctx, lo: number, hi: number) => void) {
  const s = pxFn();
  if (!exact) return draw(ctx, lo, hi);
  const X = Math.round(x0 * s), W = Math.round(x1 * s) - X, oy = Math.round(dy * s);
  for (let k = Math.floor(lo / strip); k * strip < hi; k++) {
    const a = k * strip, b = a + strip;
    const pa = Math.round(a * s);
    const e = bake(`${key}:${k}`, state, -s, W, Math.round(b * s) - pa, [x0, a, x1, b], (c) => draw(c, a, b));
    if (!e) {
      // no offscreen canvases (yet): draw it straight onto the screen
      draw(ctx, lo, hi);
      return;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(e.c, X, oy + pa);
    ctx.setTransform(s, 0, 0, s, 0, dy * s);
  }
}

/**
 * The cached bake for `key`, made now if it's missing, was made at another sharpness (`px`; negative for an exact
 * screen bake, see `drawBakedScreen`), over other bounds or of another `state`: a w × h canvas with the drawing's
 * bounds `b` stretched over it.
 */
function bake(key: string, state: string, px: number, w: number, h: number, b: Bounds, draw: (c: Ctx) => void): Bake | null {
  let e = baked.get(key);
  if (e && e.px === px && e.state === state && e.b[0] === b[0] && e.b[1] === b[1] && e.b[2] === b[2] && e.b[3] === b[3]) {
    // most recently used last, so the budget lets go of what hasn't been drawn for longest
    baked.delete(key);
    baked.set(key, e);
    return e;
  }
  let c: Canvas | null = null;
  if (e) {
    baked.delete(key);
    // the same size: drawn over again rather than let go and made anew (a new canvas costs a phone far more)
    if (e.c.width === Math.max(1, Math.ceil(w)) && e.c.height === Math.max(1, Math.ceil(h))) c = e.c;
    else {
      area -= e.c.width * e.c.height;
      releaseCanvas(e.c);
    }
  }
  const fresh = !c;
  c ??= newCanvas(w, h);
  if (!c) return null;
  const g = c.getContext('2d')!;
  if (fresh) area += c.width * c.height;
  else {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, c.width, c.height);
  }
  const sx = c.width / (b[2] - b[0]), sy = c.height / (b[3] - b[1]);
  // drawn inside save/restore, so a canvas drawn over again starts from the same settings as a new one
  g.save();
  g.setTransform(sx, 0, 0, sy, -b[0] * sx, -b[1] * sy);
  draw(g);
  g.restore();
  e = { c, px, b, state };
  baked.set(key, e);
  for (const [n, old] of baked) {
    if (area <= AREA_MAX || n === key) break;
    baked.delete(n);
    area -= old.c.width * old.c.height;
    releaseCanvas(old.c);
  }
  return e;
}

/** Big pictures scaled to the screen's pixels for `blit`, most recently drawn last. */
const fitted = new Map<object, { key: string; c: Canvas }>();
/** Kept at once: the river (and its tinted copy) and a scene's backdrop or two. */
const FITTED_MAX = 4;

/**
 * Draws a big picture (a backdrop, the river) the cheap way: scaled to the screen's pixels once, then copied pixel
 * for pixel onto whole pixels every frame. Resampling a screenful every frame is the most a frame draws (the canvas
 * is often not at the art's size, e.g. 720 pixels for 750 design units); a straight copy costs a fraction of that.
 * `ctx` has to be at the game's own transform (the plain scale Game.frame sets): (x, y, w, h) are design units on the
 * screen. `tint` is filled over the picture once, the same as filling it over the picture every frame.
 */
export function blit(ctx: Ctx, img: CanvasImageSource & { width: number; height: number }, x: number, y: number, w: number, h: number, tint?: string | null) {
  const s = pxFn();
  const W = Math.round(w * s), H = Math.round(h * s);
  const key = `${W}x${H}:${tint ?? ''}`;
  let e = exact ? fitted.get(img) : undefined;
  if (!e || e.key !== key) {
    const c = exact ? newCanvas(W, H) : null;
    if (!c) {
      ctx.drawImage(img, x, y, w, h);
      if (tint) {
        ctx.fillStyle = tint;
        ctx.fillRect(x, y, w, h);
      }
      return;
    }
    if (e) releaseCanvas(e.c);
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0, W, H);
    if (tint) {
      g.fillStyle = tint;
      g.fillRect(0, 0, W, H);
    }
    e = { key, c };
  }
  // most recently drawn last; the oldest goes when there are too many
  fitted.delete(img);
  fitted.set(img, e);
  for (const [k, old] of fitted) {
    if (fitted.size <= FITTED_MAX) break;
    fitted.delete(k);
    releaseCanvas(old.c);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(e.c, Math.round(x * s), Math.round(y * s));
  ctx.setTransform(s, 0, 0, s, 0, 0);
}

/** Drops cached bakes whose key starts with `prefix` (all of them without one). */
export function forgetBaked(prefix = '') {
  for (const [n, e] of baked) {
    if (!n.startsWith(prefix)) continue;
    baked.delete(n);
    area -= e.c.width * e.c.height;
    releaseCanvas(e.c);
  }
  if (prefix) return;
  for (const e of fitted.values()) releaseCanvas(e.c);
  fitted.clear();
}
