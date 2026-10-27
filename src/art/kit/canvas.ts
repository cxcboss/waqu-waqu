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
  baked.clear();
  area = 0;
}

/** Canvas pixels per design unit, rounded up to a quarter so a tiny change doesn't re-bake everything. */
export const pxPerUnit = () => Math.max(1, Math.ceil(pxFn() * 4 - 0.01) / 4);

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
}

const baked = new Map<string, Bake>();
/** Canvas pixels held by the cache; the oldest bakes go first past the budget (about 24 MB). */
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
  let e = baked.get(key);
  if (!e || e.px !== px) {
    if (e) {
      baked.delete(key);
      area -= e.c.width * e.c.height;
    }
    const c = newCanvas((b[2] - b[0]) * px, (b[3] - b[1]) * px);
    if (!c) {
      // no offscreen canvases (yet): draw it straight onto the screen
      ctx.save();
      ctx.translate(x, y);
      if (k !== 1) ctx.scale(k, k);
      draw(ctx);
      ctx.restore();
      return;
    }
    const g = c.getContext('2d')!;
    g.setTransform(px, 0, 0, px, -b[0] * px, -b[1] * px);
    draw(g);
    e = { c, px, b };
    baked.set(key, e);
    area += c.width * c.height;
    for (const [n, old] of baked) {
      if (area <= AREA_MAX || n === key) break;
      baked.delete(n);
      area -= old.c.width * old.c.height;
    }
  }
  ctx.drawImage(e.c, x + b[0] * k, y + b[1] * k, (b[2] - b[0]) * k, (b[3] - b[1]) * k);
}

/** Drops cached bakes whose key starts with `prefix` (all of them without one). */
export function forgetBaked(prefix = '') {
  for (const [n, e] of baked) {
    if (!n.startsWith(prefix)) continue;
    baked.delete(n);
    area -= e.c.width * e.c.height;
  }
}
