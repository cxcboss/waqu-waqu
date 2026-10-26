// The hand-inked look of the 河湾手账 kit: outlines that wobble a little (always the same wobble for
// the same seed, so nothing shimmers between frames), the fill recipe (flat colour, a shade band on
// the lower right, a highlight on the upper left, optional pencil hatching, ink contour last) and soft
// contact shadows. Light always comes from the upper left, like on the painted characters.
// Pure Canvas 2D: paths, arcs, curves, clip, strokes, gradients.
import type { Ctx } from '../../platform/types';
import { P } from '../palette';
import { shade, tint } from './color';

/** Line weights in design units: outer contour on props and buildings, UI and big icons, small icons, inner detail. */
export const LW = { contour: 3, ui: 2.4, small: 1.8, detail: 1.5 } as const;

/** A fixed pseudo-random number in [-1, 1] for (seed, i): the same every frame, no state to carry. */
export function jit(seed: number, i: number) {
  let h = Math.imul(seed * 374761393 + i * 668265263, 1274126177) ^ 0x5bd1e995;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return ((h >>> 0) / 4294967295) * 2 - 1;
}

/** Same as `jit`, in [0, 1). */
export const jit01 = (seed: number, i: number) => (jit(seed, i) + 1) / 2;

// scratch buffer for subdivided outlines, reused so drawing makes no garbage
let buf = new Float64Array(512);

export type Pt = readonly [number, number];

/**
 * A straight-edged hand-inked polygon (buildings, signs, boxes, furniture): every edge is split about
 * every `step` units and the in-between points wobble by up to `j`; corners are rounded by `r`.
 * Builds the path only (beginPath … closePath). Never use blobPath for boxes: it turns them into ovals.
 */
export function polyPath(ctx: Ctx, pts: readonly Pt[], seed = 1, j = 0.8, r = 5, step = 28) {
  const n = pts.length;
  let m = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const k = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let s = 0; s < k; s++) {
      if ((m + 1) * 3 > buf.length) {
        const nb = new Float64Array(buf.length * 2);
        nb.set(buf);
        buf = nb;
      }
      const t = s / k;
      const w = s ? j : 0;
      buf[m * 3] = a[0] + (b[0] - a[0]) * t + jit(seed, m * 2) * w;
      buf[m * 3 + 1] = a[1] + (b[1] - a[1]) * t + jit(seed, m * 2 + 1) * w;
      buf[m * 3 + 2] = s === 0 ? 1 : 0;
      m++;
    }
  }
  ctx.beginPath();
  ctx.moveTo((buf[0] + buf[(m - 1) * 3]) / 2, (buf[1] + buf[(m - 1) * 3 + 1]) / 2);
  for (let i = 0; i < m; i++) {
    const q = ((i + 1) % m) * 3;
    if (buf[i * 3 + 2] && r > 0) ctx.arcTo(buf[i * 3], buf[i * 3 + 1], buf[q], buf[q + 1], r);
    else ctx.lineTo(buf[i * 3], buf[i * 3 + 1]);
  }
  ctx.closePath();
}

/** A hand-inked box: polyPath on a rectangle. */
export function boxPath(ctx: Ctx, x: number, y: number, w: number, h: number, r = 5, seed = 1, j = 0.8) {
  polyPath(ctx, [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], seed, j, Math.min(r, w / 2, h / 2));
}

/**
 * A rounded rectangle whose edges wobble very slightly (UI panels, cards, plaques). Cheaper than
 * polyPath for big boxes: long edges are drawn as two gentle curves rather than many points.
 */
export function wobbleRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number, seed = 1, j = 0.7) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  const d = (i: number) => jit(seed, i) * j;
  const x1 = x + w, y1 = y + h;
  ctx.beginPath();
  ctx.moveTo(x + r, y + d(0));
  ctx.quadraticCurveTo(x + w / 2, y + d(1) * 1.6, x1 - r, y + d(2));
  ctx.arcTo(x1 + d(3), y + d(4), x1 + d(5), y + r, r);
  ctx.quadraticCurveTo(x1 + d(6) * 1.6, y + h / 2, x1 + d(7), y1 - r);
  ctx.arcTo(x1 + d(8), y1 + d(9), x1 - r, y1 + d(10), r);
  ctx.quadraticCurveTo(x + w / 2, y1 + d(11) * 1.6, x + r, y1 + d(12));
  ctx.arcTo(x + d(13), y1 + d(14), x + d(15), y1 - r, r);
  ctx.quadraticCurveTo(x + d(16) * 1.6, y + h / 2, x + d(17), y + r);
  ctx.arcTo(x + d(18), y + d(19), x + r, y + d(0), r);
  ctx.closePath();
}

/**
 * A smooth hand-inked closed curve through jittered points (foliage, clouds, pads, cushions).
 * The curve passes near, not through, the points: it runs through the midpoints of the edges.
 */
export function blobPath(ctx: Ctx, pts: readonly Pt[], seed = 1, j = 1.2) {
  const n = pts.length;
  const px = (i: number) => pts[i % n][0] + jit(seed, (i % n) * 2) * j;
  const py = (i: number) => pts[i % n][1] + jit(seed, (i % n) * 2 + 1) * j;
  ctx.beginPath();
  ctx.moveTo((px(n - 1) + px(0)) / 2, (py(n - 1) + py(0)) / 2);
  for (let i = 0; i < n; i++) ctx.quadraticCurveTo(px(i), py(i), (px(i) + px(i + 1)) / 2, (py(i) + py(i + 1)) / 2);
  ctx.closePath();
}

/** A blob around an ellipse: `n` points whose distance from the middle wobbles by `wob` (share of the radius). */
export function blobEllipse(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, seed = 1, wob = 0.06, n = 10) {
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    const k = 1 + jit(seed, i + 40) * wob;
    // the control points sit a bit outside so the curve through the midpoints keeps the radius
    pts.push([cx + Math.cos(a) * rx * k * 1.06, cy + Math.sin(a) * ry * k * 1.06]);
  }
  blobPath(ctx, pts, seed, 0);
}

/**
 * A puffy outline of `lobes` round bumps around an ellipse: trees, bushes, clouds, the rim of a rosette.
 * `flat` (0–1) squashes the bottom so clouds sit on a flat base.
 */
export function puffPath(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, lobes = 7, seed = 1, flat = 0) {
  ctx.beginPath();
  for (let i = 0; i <= lobes; i++) {
    const a = (i / lobes) * Math.PI * 2 - Math.PI / 2;
    const k = 1 + jit(seed, i % lobes) * 0.08;
    const x = cx + Math.cos(a) * rx * k;
    const y = cy + Math.sin(a) * ry * k * (flat && Math.sin(a) > 0 ? 1 - flat : 1);
    if (i === 0) ctx.moveTo(x, y);
    else {
      // the bump: a curve bulging outward between this point and the last
      const am = ((i - 0.5) / lobes) * Math.PI * 2 - Math.PI / 2;
      const bulge = 1.32 + jit(seed, i + 20) * 0.08;
      let qy = cy + Math.sin(am) * ry * bulge;
      if (flat && Math.sin(am) > 0) qy = cy + Math.sin(am) * ry * (1 + (bulge - 1) * 0.4) * (1 - flat);
      ctx.quadraticCurveTo(cx + Math.cos(am) * rx * bulge, qy, x, y);
    }
  }
  ctx.closePath();
}

export interface InkOpts {
  /** Ink contour width (default LW.contour); 0 for none. */
  lw?: number;
  ink?: string;
  /** Lower-right shade band and upper-left highlight (default on). */
  shade?: boolean;
  /** How far the shade band reaches in from the edge (default 10). */
  band?: number;
  /** Shade strength (default 0.2) and highlight strength (default 0.45). */
  dark?: number;
  light?: number;
  /** Pencil hatching over [x, y, w, h], fading in toward the lower right. */
  hatch?: readonly [number, number, number, number];
  /** Hatch line gap (default 6). */
  gap?: number;
}

/**
 * The fill recipe: flat palette fill, an inner shade band toward the lower right, a highlight band
 * toward the upper left, optional 45° pencil hatching, and the ink contour last. `path` must build the
 * same path every call (it's called several times).
 */
export function inked(ctx: Ctx, path: () => void, fill: string, o: InkOpts = {}) {
  const band = o.band ?? 10;
  ctx.save();
  path();
  ctx.fillStyle = fill;
  ctx.fill();
  if (o.shade !== false || o.hatch) {
    ctx.save();
    ctx.clip();
    if (o.shade !== false) {
      const sx = band * 0.4, sy = band * 0.6;
      ctx.lineJoin = 'round';
      // shade: the outline nudged up-left shows as a band inside the lower-right edge (two passes for a soft edge)
      ctx.strokeStyle = shade(fill, o.dark ?? 0.2);
      ctx.translate(-sx, -sy);
      ctx.globalAlpha = 0.36;
      ctx.lineWidth = band * 1.5;
      path();
      ctx.stroke();
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = band * 0.9;
      ctx.stroke();
      // highlight: nudged down-right, a thinner band inside the upper-left edge
      ctx.translate(sx * 1.6, sy * 1.6);
      ctx.strokeStyle = tint(fill, o.light ?? 0.45);
      ctx.globalAlpha = 0.6;
      ctx.lineWidth = band * 0.55;
      path();
      ctx.stroke();
      ctx.translate(-sx * 0.6, -sy * 0.6);
    }
    if (o.hatch) {
      ctx.globalAlpha = 1;
      hatch(ctx, o.hatch[0], o.hatch[1], o.hatch[2], o.hatch[3], shade(fill, 0.28), { gap: o.gap, fade: true });
    }
    ctx.restore();
  }
  if ((o.lw ?? LW.contour) > 0) {
    path();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = o.ink ?? P.ink;
    ctx.lineWidth = o.lw ?? LW.contour;
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * 45° pencil hatching over a box (clip to a shape first). With `fade` the strokes fade in from the
 * upper left to the lower right, so the hatching sits on the shadow side.
 */
export function hatch(ctx: Ctx, x: number, y: number, w: number, h: number, color: string, o: { gap?: number; lw?: number; alpha?: number; fade?: boolean } = {}) {
  const gap = o.gap ?? 6;
  ctx.save();
  if (o.fade) {
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.35, 'rgba(0,0,0,0)');
    g.addColorStop(1, color);
    ctx.strokeStyle = g;
  } else ctx.strokeStyle = color;
  ctx.globalAlpha *= o.alpha ?? 0.4;
  ctx.lineWidth = o.lw ?? 1.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  // lines going up to the right, each a touch uneven like a hand doing it
  for (let i = -h, n = 0; i < w; i += gap, n++) {
    const wob = jit(n, 7) * 0.8;
    ctx.moveTo(x + i + wob, y + h);
    ctx.lineTo(x + i + h + wob * 0.5, y);
  }
  ctx.stroke();
  ctx.restore();
}

/** Soft contact shadow under something standing on the ground. */
export function contactShadow(ctx: Ctx, x: number, y: number, rx: number, ry: number, a = 0.24) {
  ctx.save();
  ctx.fillStyle = P.ink;
  ctx.globalAlpha *= a * 0.5;
  ctx.beginPath();
  ctx.ellipse(x, y, rx * 1.15, ry * 1.25, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha /= 0.5;
  ctx.globalAlpha *= 0.7;
  ctx.beginPath();
  ctx.ellipse(x, y, rx * 0.85, ry * 0.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** A hand-drawn line: a gentle curve whose middle wanders by up to `j`. Builds and strokes nothing; call stroke(). */
export function wobbleLine(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, seed = 1, j = 1) {
  const mx = (x0 + x1) / 2 + jit(seed, 1) * j, my = (y0 + y1) / 2 + jit(seed, 2) * j;
  ctx.moveTo(x0 + jit(seed, 3) * j * 0.3, y0 + jit(seed, 4) * j * 0.3);
  ctx.quadraticCurveTo(mx, my, x1 + jit(seed, 5) * j * 0.3, y1 + jit(seed, 6) * j * 0.3);
}

/** Sets the ink stroke: colour, width, round caps and joins. */
export function inkStyle(ctx: Ctx, lw: number = LW.contour, color: string = P.ink) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}
