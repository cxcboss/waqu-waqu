// Photo frames for any width and height: wood (mitred planks, grain, a vine on two corners), lily (a
// leafy green border with lily pads and lotus flowers at the corners), shell (driftwood with shells and
// a starfish) and gold (bevelled, corner scrolls, a crest on top). The opening is see-through: draw the
// photo into `frameOpening()` first, then the frame over it (it casts a little shadow onto the photo).
import type { Ctx } from '../../platform/types';
import { P } from '../palette';
import { drawBaked } from './canvas';
import { shade, tint } from './color';
import { inked, jit, LW, polyPath } from './ink';

export type FrameKind = 'wood' | 'lily' | 'shell' | 'gold';
export const FRAME_KINDS: readonly FrameKind[] = ['wood', 'lily', 'shell', 'gold'];

/** Border width for a frame of this size. */
const border = (w: number, h: number) => Math.max(8, Math.min(26, Math.min(w, h) * 0.13));

/** Where the photo shows through a frame at x, y, w, h. */
export function frameOpening(_kind: FrameKind, x: number, y: number, w: number, h: number) {
  const b = border(w, h);
  return { x: x + b, y: y + b, w: w - b * 2, h: h - b * 2 };
}

/** Draws a frame with its outer edge on x, y, w, h; returns the opening. Baked once per kind and size. */
export function frame(ctx: Ctx, kind: FrameKind, x: number, y: number, w: number, h: number) {
  const W = Math.round(w), H = Math.round(h);
  const b = border(W, H);
  const m = b * 0.9 + 6;
  drawBaked(ctx, `frame:${kind}:${W}:${H}`, x, y, [-m, -m - (kind === 'gold' ? b * 0.9 : 0), W + m, H + m], (c) => drawFrame(c, kind, W, H, b), 1);
  return frameOpening(kind, x, y, w, h);
}

function drawFrame(ctx: Ctx, kind: FrameKind, w: number, h: number, b: number) {
  const lw = Math.min(LW.ui, Math.max(LW.small, b * 0.16));
  const seed = Math.round(w * 7 + h * 13);
  // shadow on the wall: the frame's shape nudged down-right, only where it falls outside the frame
  ctx.save();
  ctx.beginPath();
  ctx.rect(b * 0.22, b * 0.32, w, h);
  ctx.rect(w, 0, -w, h);
  ctx.fillStyle = 'rgba(74,59,48,0.26)';
  ctx.fill('evenodd');
  ctx.restore();
  const ring = (inset: number, r = 3) => {
    ctx.beginPath();
    rrPath(ctx, inset, inset, w - inset * 2, h - inset * 2, r);
    rrPath(ctx, b, b, w - b * 2, h - b * 2, 1, true);
  };
  if (kind === 'wood') woodFrame(ctx, w, h, b, lw, seed);
  else if (kind === 'lily') lilyFrame(ctx, w, h, b, lw, seed, ring);
  else if (kind === 'shell') shellFrame(ctx, w, h, b, lw, seed);
  else goldFrame(ctx, w, h, b, lw);
  // the frame's depth falls on the photo along the top and left of the opening
  ctx.save();
  ctx.beginPath();
  ctx.rect(b, b, w - b * 2, h - b * 2);
  ctx.clip();
  ctx.strokeStyle = 'rgba(74,59,48,0.32)';
  ctx.lineWidth = b * 0.35;
  ctx.strokeRect(b - b * 0.12, b - b * 0.08, w - b * 2, h - b * 2);
  ctx.restore();
  ctx.strokeStyle = P.ink;
  ctx.lineWidth = lw * 0.8;
  ctx.strokeRect(b, b, w - b * 2, h - b * 2);
}

/** Rounded rectangle sub-path (no beginPath), optionally wound the other way. */
function rrPath(ctx: Ctx, x: number, y: number, w: number, h: number, r: number, ccw = false) {
  r = Math.min(r, w / 2, h / 2);
  if (!ccw) {
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
  } else {
    ctx.moveTo(x + r, y);
    ctx.arcTo(x, y, x, y + h, r);
    ctx.arcTo(x, y + h, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x + w, y, r);
    ctx.arcTo(x + w, y, x, y, r);
  }
  ctx.closePath();
}

/** A small leaf pointing along angle `a` from (x, y). */
function leaf(ctx: Ctx, x: number, y: number, a: number, len: number, color: string, lw: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  inked(ctx, () => {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(len * 0.5, -len * 0.42, len, 0);
    ctx.quadraticCurveTo(len * 0.5, len * 0.42, 0, 0);
    ctx.closePath();
  }, color, { lw, band: len * 0.25 });
  ctx.strokeStyle = shade(color, 0.3);
  ctx.lineWidth = lw * 0.6;
  ctx.beginPath();
  ctx.moveTo(len * 0.1, 0);
  ctx.lineTo(len * 0.75, 0);
  ctx.stroke();
  ctx.restore();
}

/** A vine curling around a corner with a few leaves. `sx`, `sy` say which way the corner opens. */
function cornerVine(ctx: Ctx, x: number, y: number, sx: number, sy: number, b: number, lw: number, seed: number) {
  const L = b * 3.2;
  ctx.save();
  ctx.translate(x, y);
  ctx.lineCap = 'round';
  const stem = () => {
    ctx.beginPath();
    ctx.moveTo(sx * L, sy * b * 0.15);
    ctx.bezierCurveTo(sx * L * 0.5, -sy * b * 0.25, sx * b * 0.1, sy * b * 0.1, 0, 0);
    ctx.bezierCurveTo(-sx * b * 0.1, sy * b * 0.4, sy * 0, sy * L * 0.5, -sx * b * 0.05, sy * L);
  };
  stem();
  ctx.strokeStyle = P.ink;
  ctx.lineWidth = lw * 2.2;
  ctx.stroke();
  stem();
  ctx.strokeStyle = P.lilyDeep;
  ctx.lineWidth = lw * 1.1;
  ctx.stroke();
  const ls = b * 0.95;
  // leaves along the top run (pointing away from the corner) and down the side run
  const along = sx > 0 ? 0 : Math.PI, down = sy > 0 ? Math.PI / 2 : -Math.PI / 2;
  leaf(ctx, sx * L * 0.66, -sy * b * 0.02, along - sx * sy * 0.75, ls, P.lily, lw * 0.9);
  leaf(ctx, sx * L * 0.32, -sy * b * 0.1, along + sx * sy * 0.85, ls * 0.8, P.lilyLight, lw * 0.9);
  leaf(ctx, -sx * b * 0.04, sy * L * 0.66, down + sx * sy * 0.75, ls, P.lily, lw * 0.9);
  leaf(ctx, sx * b * 0.06, sy * L * 0.3, down - sx * sy * 0.85, ls * 0.8, P.lilyLight, lw * 0.9);
  // a bud
  ctx.beginPath();
  ctx.arc(jit(seed, 3) * 1.5, jit(seed, 4) * 1.5, b * 0.24, 0, Math.PI * 2);
  ctx.fillStyle = P.pink;
  ctx.fill();
  ctx.strokeStyle = P.ink;
  ctx.lineWidth = lw * 0.8;
  ctx.stroke();
  ctx.restore();
}

function woodFrame(ctx: Ctx, w: number, h: number, b: number, lw: number, seed: number) {
  // four mitred planks, lit from the upper left
  const planks: [number[], string, number][] = [
    [[0, 0, w, 0, w - b, b, b, b], tint(P.wood, 0.12), 0],
    [[w, 0, w, h, w - b, h - b, w - b, b], shade(P.wood, 0.1), 1],
    [[w, h, 0, h, b, h - b, w - b, h - b], shade(P.wood, 0.06), 0],
    [[0, h, 0, 0, b, b, b, h - b], tint(P.wood, 0.04), 1],
  ];
  planks.forEach(([p, c, vert], i) => {
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(p[0], p[1]);
      for (let k = 2; k < 8; k += 2) ctx.lineTo(p[k], p[k + 1]);
      ctx.closePath();
    };
    inked(ctx, path, c, { lw: 0, band: b * 0.35 });
    // grain along the plank
    ctx.save();
    path();
    ctx.clip();
    ctx.strokeStyle = shade(P.wood, 0.32);
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = Math.max(0.8, b * 0.07);
    ctx.beginPath();
    const len = vert ? h : w;
    for (let r = 0; r < 3; r++) {
      const off = b * (0.25 + r * 0.25) + jit(seed + i, r) * b * 0.06;
      for (let s = 0; s < len; s += len / 2) {
        const a0 = s, a1 = s + len / 2;
        const o0 = off, o1 = off + jit(seed + i, r + s) * b * 0.08;
        const mid = (a0 + a1) / 2, om = off + jit(seed + i, r * 7 + 3) * b * 0.12;
        const P0 = vert ? [i === 1 ? w - o0 : o0, a0] : [a0, i === 2 ? h - o0 : o0];
        const Pm = vert ? [i === 1 ? w - om : om, mid] : [mid, i === 2 ? h - om : om];
        const P1 = vert ? [i === 1 ? w - o1 : o1, a1] : [a1, i === 2 ? h - o1 : o1];
        ctx.moveTo(P0[0], P0[1]);
        ctx.quadraticCurveTo(Pm[0], Pm[1], P1[0], P1[1]);
      }
    }
    ctx.stroke();
    // a knot
    const t = 0.3 + 0.4 * (jit(seed, i + 9) * 0.5 + 0.5);
    const kx = vert ? (i === 1 ? w - b * 0.5 : b * 0.5) : w * t, ky = vert ? h * t : (i === 2 ? h - b * 0.5 : b * 0.5);
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.ellipse(kx, ky, vert ? b * 0.12 : b * 0.26, vert ? b * 0.26 : b * 0.12, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  });
  // mitre joints and the outer contour
  ctx.strokeStyle = P.ink;
  ctx.lineCap = 'round';
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = lw * 0.6;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(b, b);
  ctx.moveTo(w, 0);
  ctx.lineTo(w - b, b);
  ctx.moveTo(w, h);
  ctx.lineTo(w - b, h - b);
  ctx.moveTo(0, h);
  ctx.lineTo(b, h - b);
  ctx.stroke();
  ctx.globalAlpha = 1;
  polyPath(ctx, [[0, 0], [w, 0], [w, h], [0, h]], seed, 0.5, 2.5);
  ctx.lineWidth = lw;
  ctx.lineJoin = 'round';
  ctx.stroke();
  cornerVine(ctx, b * 0.5, b * 0.5, 1, 1, b, lw, seed);
  cornerVine(ctx, w - b * 0.5, h - b * 0.5, -1, -1, b, lw, seed + 1);
}

function lilyFrame(ctx: Ctx, w: number, h: number, b: number, lw: number, seed: number, ring: (inset: number, r?: number) => void) {
  inked(ctx, () => ring(0, b * 0.5), P.lily, { lw, band: b * 0.4 });
  // a twisting vine runs round the border, with leaves along it
  const per = 2 * (w + h - b * 2);
  const pt = (d: number): [number, number, number] => {
    const iw = w - b, ih = h - b;
    d = ((d % per) + per) % per;
    if (d < iw) return [b / 2 + d, b / 2, 0];
    d -= iw;
    if (d < ih) return [w - b / 2, b / 2 + d, Math.PI / 2];
    d -= ih;
    if (d < iw) return [w - b / 2 - d, h - b / 2, Math.PI];
    d -= iw;
    return [b / 2, h - b / 2 - d, -Math.PI / 2];
  };
  ctx.save();
  ctx.strokeStyle = P.lilyDeep;
  ctx.lineWidth = Math.max(1.2, b * 0.12);
  ctx.lineCap = 'round';
  ctx.beginPath();
  const step = b * 0.9;
  for (let d = 0; d <= per; d += step / 4) {
    const [px, py, a] = pt(d);
    const o = Math.sin((d / step) * Math.PI) * b * 0.2;
    const x = px - Math.sin(a) * o, y = py + Math.cos(a) * o;
    if (d) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.stroke();
  ctx.restore();
  for (let d = step * 0.5, i = 0; d < per; d += step, i++) {
    const [px, py, a] = pt(d);
    const side = i % 2 ? 1 : -1;
    leaf(ctx, px, py, a + side * 0.9, b * 0.55, i % 3 ? P.lilyLight : tint(P.lily, 0.15), lw * 0.7);
  }
  ctx.strokeStyle = P.ink;
  ctx.lineWidth = lw;
  ctx.beginPath();
  rrPath(ctx, 0, 0, w, h, b * 0.5);
  ctx.stroke();
  // pads on the corners, lotus flowers on two of them
  const corners: [number, number][] = [[b * 0.55, b * 0.55], [w - b * 0.55, b * 0.55], [w - b * 0.55, h - b * 0.55], [b * 0.55, h - b * 0.55]];
  corners.forEach(([cx, cy], i) => {
    const r = b * 0.95;
    const notch = (i * 1.7 + 0.6) % (Math.PI * 2);
    inked(ctx, () => {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, notch + 0.35, notch - 0.35 + Math.PI * 2);
      ctx.closePath();
    }, i % 2 ? P.lily : tint(P.lily, 0.1), { lw, band: r * 0.4 });
    ctx.strokeStyle = shade(P.lily, 0.25);
    ctx.lineWidth = lw * 0.6;
    ctx.beginPath();
    for (let k = 1; k < 5; k++) {
      const a = notch + 0.35 + (k / 5) * (Math.PI * 2 - 0.7);
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * r * 0.75, cy + Math.sin(a) * r * 0.75);
    }
    ctx.stroke();
    if (i % 2 === 0) lotus(ctx, cx + (i ? -1 : 1) * r * 0.2, cy + (i ? -1 : 1) * r * 0.1, b * 0.75, lw);
  });
  void seed;
}

function lotus(ctx: Ctx, x: number, y: number, s: number, lw: number) {
  ctx.save();
  ctx.translate(x, y);
  for (const [a, k, c] of [[-0.9, 0.85, P.pink], [0.9, 0.85, P.pink], [-0.45, 1, tint(P.pink, 0.25)], [0.45, 1, tint(P.pink, 0.25)], [0, 1.1, tint(P.pink, 0.4)]] as const) {
    ctx.save();
    ctx.rotate(a);
    inked(ctx, () => {
      ctx.beginPath();
      ctx.moveTo(0, s * 0.2);
      ctx.quadraticCurveTo(-s * 0.4, -s * 0.4 * k, 0, -s * k);
      ctx.quadraticCurveTo(s * 0.4, -s * 0.4 * k, 0, s * 0.2);
      ctx.closePath();
    }, c, { lw: lw * 0.8, band: s * 0.2 });
    ctx.restore();
  }
  ctx.beginPath();
  ctx.arc(0, -s * 0.05, s * 0.16, 0, Math.PI * 2);
  ctx.fillStyle = P.gold;
  ctx.fill();
  ctx.restore();
}

function shellFrame(ctx: Ctx, w: number, h: number, b: number, lw: number, seed: number) {
  const drift = '#D8CCB6';
  const path = () => {
    polyPath(ctx, [[0, 0], [w, 0], [w, h], [0, h]], seed, b * 0.08, b * 0.35, 22);
    ctx.moveTo(b, b);
    ctx.lineTo(b, h - b);
    ctx.lineTo(w - b, h - b);
    ctx.lineTo(w - b, b);
    ctx.closePath();
  };
  inked(ctx, path, drift, { lw, band: b * 0.45, dark: 0.16 });
  // smooth wavy driftwood grain
  ctx.save();
  path();
  ctx.clip('evenodd');
  ctx.strokeStyle = shade(drift, 0.3);
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = Math.max(0.8, b * 0.06);
  ctx.beginPath();
  for (let r = 0; r < 2; r++) {
    const o = b * (0.32 + r * 0.34);
    for (const [x0, y0, x1, y1] of [[0, o, w, o], [0, h - o, w, h - o]]) {
      ctx.moveTo(x0, y0);
      for (let x = 0; x <= x1; x += b * 1.6) ctx.quadraticCurveTo(x + b * 0.8, y0 + Math.sin(x * 0.3 + r) * b * 0.12, x + b * 1.6, y1 + jit(seed, x) * b * 0.05);
    }
    for (const [x0] of [[o], [w - o]]) {
      ctx.moveTo(x0, 0);
      for (let y = 0; y <= h; y += b * 1.6) ctx.quadraticCurveTo(x0 + Math.sin(y * 0.3 + r) * b * 0.12, y + b * 0.8, x0 + jit(seed, y) * b * 0.05, y + b * 1.6);
    }
  }
  ctx.stroke();
  ctx.restore();
  scallop(ctx, b * 0.6, b * 0.55, b * 1.05, -0.5, '#F2C3A8', lw);
  scallop(ctx, w - b * 0.6, h - b * 0.5, b * 0.95, Math.PI - 0.4, '#F4D3B0', lw);
  snail(ctx, w - b * 0.55, b * 0.55, b * 0.62, lw);
  starfish(ctx, b * 0.6, h - b * 0.6, b * 0.85, lw);
}

function scallop(ctx: Ctx, x: number, y: number, s: number, rot: number, c: string, lw: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  const fan = () => {
    ctx.beginPath();
    ctx.moveTo(0, s * 0.55);
    ctx.lineTo(-s * 0.62, -s * 0.2);
    for (let i = 0; i < 5; i++) {
      const a0 = -s * 0.62 + (i * s * 1.24) / 5, a1 = a0 + (s * 1.24) / 5;
      ctx.quadraticCurveTo((a0 + a1) / 2, -s * (0.62 + 0.08 * Math.sin((i / 4) * Math.PI)), a1, -s * 0.2 - (i === 4 ? 0 : 0));
    }
    ctx.closePath();
  };
  inked(ctx, fan, c, { lw: lw * 0.85, band: s * 0.22 });
  ctx.strokeStyle = shade(c, 0.3);
  ctx.lineWidth = lw * 0.55;
  ctx.beginPath();
  for (let i = 1; i < 5; i++) {
    const a = -s * 0.62 + (i * s * 1.24) / 5;
    ctx.moveTo(0, s * 0.45);
    ctx.lineTo(a, -s * 0.36);
  }
  ctx.stroke();
  inked(ctx, () => {
    ctx.beginPath();
    ctx.moveTo(-s * 0.22, s * 0.42);
    ctx.lineTo(s * 0.22, s * 0.42);
    ctx.lineTo(s * 0.12, s * 0.62);
    ctx.lineTo(-s * 0.12, s * 0.62);
    ctx.closePath();
  }, shade(c, 0.08), { lw: lw * 0.7, shade: false });
  ctx.restore();
}

function snail(ctx: Ctx, x: number, y: number, s: number, lw: number) {
  ctx.save();
  ctx.translate(x, y);
  inked(ctx, () => {
    ctx.beginPath();
    ctx.arc(0, 0, s, 0, Math.PI * 2);
  }, '#EED7B0', { lw: lw * 0.85, band: s * 0.35 });
  ctx.strokeStyle = shade('#EED7B0', 0.45);
  ctx.lineWidth = lw * 0.7;
  ctx.beginPath();
  for (let i = 0; i <= 40; i++) {
    const a = (i / 40) * Math.PI * 3.6;
    const r = s * (0.9 - i * 0.021);
    if (i) ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    else ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.stroke();
  ctx.restore();
}

function starfish(ctx: Ctx, x: number, y: number, s: number, lw: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(0.3);
  inked(ctx, () => {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? s * 0.42 : s;
      const px = Math.cos(a) * r, py = Math.sin(a) * r;
      if (i) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    }
    ctx.closePath();
  }, P.orange, { lw: lw * 0.85, band: s * 0.3 });
  ctx.fillStyle = tint(P.orange, 0.5);
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * s * 0.5, Math.sin(a) * s * 0.5, s * 0.07, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function goldFrame(ctx: Ctx, w: number, h: number, b: number, lw: number) {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, tint(P.gold, 0.35));
  g.addColorStop(0.5, P.gold);
  g.addColorStop(1, shade(P.gold, 0.18));
  // crest over the top edge
  const cw = Math.min(w * 0.36, b * 3.4), ch = b * 1.5;
  const crest = () => {
    ctx.beginPath();
    ctx.moveTo(w / 2 - cw / 2, b * 0.4);
    ctx.bezierCurveTo(w / 2 - cw / 2, -ch * 0.3, w / 2 - cw * 0.2, -ch * 0.2, w / 2 - cw * 0.12, -ch * 0.45);
    ctx.quadraticCurveTo(w / 2, -ch * 0.95, w / 2 + cw * 0.12, -ch * 0.45);
    ctx.bezierCurveTo(w / 2 + cw * 0.2, -ch * 0.2, w / 2 + cw / 2, -ch * 0.3, w / 2 + cw / 2, b * 0.4);
    ctx.closePath();
  };
  inked(ctx, crest, P.gold, { lw, band: b * 0.35, dark: 0.2 });
  // the border, then two bevel lines inside it
  ctx.beginPath();
  rrPath(ctx, 0, 0, w, h, 2);
  rrPath(ctx, b, b, w - b * 2, h - b * 2, 1, true);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.lineWidth = b * 0.22;
  ctx.strokeStyle = 'rgba(255,248,224,0.7)';
  ctx.strokeRect(b * 0.22, b * 0.22, w - b * 0.44, h - b * 0.44);
  ctx.strokeStyle = 'rgba(150,100,30,0.35)';
  ctx.strokeRect(b * 0.78, b * 0.78, w - b * 1.56, h - b * 1.56);
  ctx.restore();
  ctx.strokeStyle = shade(P.gold, 0.4);
  ctx.lineWidth = lw * 0.6;
  ctx.strokeRect(b * 0.5, b * 0.5, w - b, h - b);
  ctx.strokeStyle = P.ink;
  ctx.lineWidth = lw;
  ctx.beginPath();
  rrPath(ctx, 0, 0, w, h, 2);
  ctx.stroke();
  // corner scrolls
  for (const [cx, cy, sx, sy] of [[0, 0, 1, 1], [w, 0, -1, 1], [w, h, -1, -1], [0, h, 1, -1]] as const) {
    ctx.save();
    ctx.translate(cx + sx * b * 0.5, cy + sy * b * 0.5);
    ctx.scale(sx, sy);
    const curl = () => {
      ctx.beginPath();
      ctx.moveTo(b * 1.6, -b * 0.05);
      ctx.bezierCurveTo(b * 0.9, -b * 0.45, b * 0.1, -b * 0.3, 0, 0);
      ctx.bezierCurveTo(-b * 0.3, b * 0.1, -b * 0.45, b * 0.9, -b * 0.05, b * 1.6);
    };
    curl();
    ctx.strokeStyle = P.ink;
    ctx.lineWidth = lw * 1.9;
    ctx.lineCap = 'round';
    ctx.stroke();
    curl();
    ctx.strokeStyle = tint(P.gold, 0.45);
    ctx.lineWidth = lw * 0.9;
    ctx.stroke();
    inked(ctx, () => {
      ctx.beginPath();
      ctx.arc(0, 0, b * 0.36, 0, Math.PI * 2);
    }, P.gold, { lw: lw * 0.8, band: b * 0.2 });
    ctx.restore();
  }
  // a red jewel on the crest
  inked(ctx, () => {
    ctx.beginPath();
    ctx.ellipse(w / 2, -ch * 0.25 + b * 0.15, b * 0.26, b * 0.32, 0, 0, Math.PI * 2);
  }, P.red, { lw: lw * 0.8, band: b * 0.18 });
}
