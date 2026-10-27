// Paper grain: one 256x256 tile made from ImageData the first time it's needed (fine speckle, faint 45°
// pencil tooth and a little mottling, all tileable), used as a repeating pattern over baked layers and
// paper panels. The tile and each canvas' pattern are made once, never per frame.
import type { Canvas, Ctx } from '../../platform/types';
import { newCanvas } from './canvas';
import { jit01 } from './ink';

const N = 256;
let tile: Canvas | null = null;
const patterns = new WeakMap<Ctx, CanvasPattern>();

function makeTile(): Canvas | null {
  const c = newCanvas(N, N);
  if (!c) return null;
  const g = c.getContext('2d')!;
  const img = g.createImageData(N, N);
  const d = img.data;
  // smooth 1D noise for the pencil strokes, and an 8x8 lattice for the mottling (both wrap around)
  const line = new Float32Array(N);
  for (let i = 0; i < N; i++) line[i] = jit01(11, i);
  const sm = new Float32Array(N);
  for (let i = 0; i < N; i++) sm[i] = (line[(i + N - 2) & 255] + line[(i + N - 1) & 255] * 2 + line[i] * 3 + line[(i + 1) & 255] * 2 + line[(i + 2) & 255]) / 9;
  const lat = (i: number, j: number) => jit01(23, (i & 7) * 8 + (j & 7));
  const ease = (t: number) => t * t * (3 - 2 * t);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = (y * N + x) * 4;
      // fine speckle
      const r = jit01(x * 7 + 3, y * 13 + 5);
      let dark = r > 0.62 ? (r - 0.62) * 70 : 0;
      const light = r < 0.1 ? (0.1 - r) * 260 : 0;
      // pencil tooth: faint streaks along 45°, each its own strength, broken up along its length
      const k = (x - y) & 255;
      const strength = line[k] * line[k];
      const along = sm[(x + y + Math.floor(line[(k * 7) & 255] * 255)) & 255];
      dark += strength * Math.max(0, along - 0.45) * 46;
      // mottling: slow blotches
      const fx = x / 32, fy = y / 32, ix = Math.floor(fx), iy = Math.floor(fy);
      const tx = ease(fx - ix), ty = ease(fy - iy);
      const m = (lat(ix, iy) * (1 - tx) + lat(ix + 1, iy) * tx) * (1 - ty) + (lat(ix, iy + 1) * (1 - tx) + lat(ix + 1, iy + 1) * tx) * ty;
      dark += Math.max(0, m - 0.5) * 16;
      if (light > dark) {
        d[i] = 255;
        d[i + 1] = 252;
        d[i + 2] = 240;
        d[i + 3] = Math.min(255, light);
      } else {
        d[i] = 74;
        d[i + 1] = 59;
        d[i + 2] = 48;
        d[i + 3] = Math.min(255, dark);
      }
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** The grain tile (made on first use); null before offscreen canvases are available. */
export function grainTile(): Canvas | null {
  if (!tile) tile = makeTile();
  return tile;
}

/** The grain as a repeating pattern for this canvas (one per canvas, kept). */
export function grainPattern(ctx: Ctx): CanvasPattern | null {
  let p = patterns.get(ctx);
  if (!p) {
    const t = grainTile();
    if (!t) return null;
    p = ctx.createPattern(t, 'repeat') ?? undefined;
    if (!p) return null;
    patterns.set(ctx, p);
  }
  return p;
}

/** Lays grain over the current path (build the path first). */
export function grainFill(ctx: Ctx, a = 0.45) {
  const p = grainPattern(ctx);
  if (!p) return;
  ctx.save();
  ctx.globalAlpha *= a;
  ctx.fillStyle = p;
  ctx.fill();
  ctx.restore();
}

/** Lays grain over a rectangle. */
export function grainRect(ctx: Ctx, x: number, y: number, w: number, h: number, a = 0.45) {
  const p = grainPattern(ctx);
  if (!p) return;
  ctx.save();
  ctx.globalAlpha *= a;
  ctx.fillStyle = p;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}
