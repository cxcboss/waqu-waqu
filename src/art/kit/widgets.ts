// The kit's signage and labels: wooden signs for places, a ribbon banner, speech bubbles with a tail
// toward whoever speaks, a chalkboard, a luggage price tag, level pips, the '已拥有' postmark, a NEW
// corner ribbon and the empty-state vignettes. The static parts are baked; text is drawn live on top.
// Text a player has to read is 22 design units or more.
import type { Ctx } from '../../platform/types';
import { P } from '../palette';
import { font, text, wrapText } from '../ui';
import { drawBaked } from './canvas';
import { alpha, lightness, shade, tint } from './color';
import { icon } from './icons';
import { boxPath, contactShadow, inked, jit, LW, polyPath, wobbleLine } from './ink';
import { grainFill } from './paper';

const TAU = Math.PI * 2;

// ---------------------------------------------------------------- wooden sign

export interface SignOpts {
  /** A post this long under the sign (a signpost standing in the ground). */
  post?: number;
  /** Ropes this long above the sign (hanging from something). */
  hang?: number;
  /** Plank colour (default light wood). */
  wood?: string;
  /** Tilt in radians (default a hair to the left). */
  rot?: number;
  /** Warm lamplight behind it at dusk and night, 0–1. */
  glow?: number;
  /** Title size (default from the height). */
  size?: number;
  seed?: number;
}

/**
 * A wooden sign centred on (cx, cy): a plank with grain and two nails, the title painted on it and an
 * optional second line. For place names, the day's title, the HQ sign.
 */
export function woodSign(ctx: Ctx, cx: number, cy: number, w: number, h: number, title: string, sub?: string, o: SignOpts = {}) {
  const W = Math.round(w), Hh = Math.round(h), seed = o.seed ?? 3;
  const wood = o.wood ?? P.woodLight;
  ctx.save();
  if (o.glow) {
    const g = ctx.createRadialGradient(cx, cy, 10, cx, cy, w * 0.75);
    g.addColorStop(0, alpha('#FFD98A', 0.5 * o.glow));
    g.addColorStop(1, alpha('#FFD98A', 0));
    ctx.fillStyle = g;
    ctx.fillRect(cx - w * 0.8, cy - w * 0.8, w * 1.6, w * 1.6);
  }
  ctx.translate(cx, cy);
  ctx.rotate(o.rot ?? -0.015);
  if (o.post) {
    contactShadow(ctx, 0, h / 2 + o.post - 2, 22, 6);
    inked(ctx, () => boxPath(ctx, -9, h / 2 - 8, 18, o.post! + 6, 3, seed + 5, 0.4), P.wood, { band: 6, lw: LW.ui });
  }
  if (o.hang) {
    for (const s of [-1, 1]) {
      const rope = () => {
        ctx.beginPath();
        ctx.moveTo(s * (w / 2 - 24), -h / 2 + 12);
        ctx.lineTo(s * (w / 2 - 34), -h / 2 - o.hang!);
      };
      rope();
      ctx.strokeStyle = P.ink;
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.stroke();
      rope();
      ctx.strokeStyle = P.kraftTop;
      ctx.lineWidth = 2.6;
      ctx.stroke();
    }
  }
  drawBaked(ctx, `sign:${W}:${Hh}:${seed}:${wood}`, 0, 0, [-W / 2 - 8, -Hh / 2 - 8, W / 2 + 10, Hh / 2 + 14], (c) => plank(c, W, Hh, seed, wood));
  const ts = o.size ?? Math.max(26, Math.min(40, sub ? h * 0.38 : h * 0.46));
  const ty = sub ? -h * 0.12 : 1;
  // painted lettering: dark paint on light wood, cream paint on darker wood, with an edge that keeps it crisp
  const dark = lightness(wood) < 0.65;
  const paint = dark ? P.paper : P.ink, edge = dark ? shade(wood, 0.55) : tint(wood, 0.45);
  text(ctx, title, 0, ty + 1.5, ts, { bold: true, color: edge, maxWidth: w - 44 });
  text(ctx, title, 0, ty, ts, { bold: true, color: paint, maxWidth: w - 44 });
  if (sub) text(ctx, sub, 0, h * 0.26, Math.max(22, Math.min(26, h * 0.26)), { color: dark ? tint(wood, 0.72) : shade(wood, 0.72), maxWidth: w - 44 });
  ctx.restore();
}

function plank(ctx: Ctx, w: number, h: number, seed: number, wood: string) {
  const outline = () => polyPath(ctx, [[-w / 2, -h / 2 + 1], [w / 2, -h / 2 - 1], [w / 2 + 2, h / 2], [-w / 2 - 1, h / 2 + 1]], seed, 0.9, 7);
  // thickness: the plank's edge shows below, and a soft shadow under that
  ctx.save();
  ctx.translate(3, 7);
  outline();
  ctx.fillStyle = alpha(P.ink, 0.22);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.translate(0, 4);
  outline();
  ctx.fillStyle = shade(wood, 0.32);
  ctx.fill();
  ctx.strokeStyle = P.ink;
  ctx.lineWidth = LW.ui;
  ctx.stroke();
  ctx.restore();
  inked(ctx, outline, wood, { band: Math.min(10, h * 0.16), lw: 0, hatch: [-w / 2, -h / 2, w, h], gap: 7 });
  // grain
  ctx.save();
  outline();
  ctx.clip();
  ctx.strokeStyle = shade(wood, 0.35);
  ctx.globalAlpha = 0.4;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0, yy = -h / 2 + h * 0.2; yy < h / 2 - 4; yy += h * 0.21, i++) {
    ctx.moveTo(-w / 2, yy);
    ctx.bezierCurveTo(-w / 4, yy - 3 + jit(seed, i) * 2, w / 4, yy + 3 + jit(seed, i + 9) * 2, w / 2, yy - 1);
  }
  ctx.stroke();
  // a knot
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  const kx = w * (0.18 + jit(seed, 30) * 0.12), ky = h * 0.18;
  ctx.ellipse(kx, ky, 7, 2.6, 0, 0, TAU);
  ctx.ellipse(kx, ky, 3, 1.2, 0, 0, TAU);
  ctx.stroke();
  grainFill(ctx, 0.5);
  ctx.restore();
  outline();
  ctx.strokeStyle = P.ink;
  ctx.lineWidth = LW.ui;
  ctx.lineJoin = 'round';
  ctx.stroke();
  // nails
  for (const s of [-1, 1]) {
    const nx = s * (w / 2 - 15), ny = -h / 2 + 13;
    ctx.beginPath();
    ctx.arc(nx, ny, 4.2, 0, TAU);
    ctx.fillStyle = '#9C998F';
    ctx.fill();
    ctx.strokeStyle = P.ink;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(nx - 1.2, ny - 1.2, 1.4, 0, TAU);
    ctx.fillStyle = '#E4E1D8';
    ctx.fill();
  }
}

// ---------------------------------------------------------------- ribbon banner

/** A ribbon banner across (cx, cy), `w` wide: an arched band, tails folded behind, the label in white. */
export function ribbon(ctx: Ctx, cx: number, cy: number, w: number, label: string, o: { color?: string; h?: number; size?: number } = {}) {
  const h = o.h ?? 56, c = o.color ?? P.orange;
  const W = Math.round(w);
  drawBaked(ctx, `ribbon:${W}:${h}:${c}`, cx, cy, [-W / 2 - h - 6, -h / 2 - 14, W / 2 + h + 6, h / 2 + h * 0.45 + 8], (g) => ribbonShape(g, W, h, c));
  const size = o.size ?? Math.max(22, Math.min(30, h * 0.5));
  text(ctx, label, cx, cy - 2 + 1.6, size, { bold: true, color: shade(c, 0.4), maxWidth: w - 40 });
  text(ctx, label, cx, cy - 2, size, { bold: true, color: P.white, maxWidth: w - 40 });
}

function ribbonShape(ctx: Ctx, w: number, h: number, c: string) {
  const arch = Math.min(10, w * 0.02);
  const drop = h * 0.36, tail = h * 0.95;
  for (const s of [-1, 1]) {
    // the tail behind each end, with a V cut
    const x0 = s * (w / 2 - h * 0.35), x1 = s * (w / 2 + tail);
    inked(ctx, () => {
      ctx.beginPath();
      ctx.moveTo(x0, -h / 2 + drop);
      ctx.lineTo(x1, -h / 2 + drop);
      ctx.lineTo(x1 - s * h * 0.32, drop);
      ctx.lineTo(x1, h / 2 + drop);
      ctx.lineTo(x0, h / 2 + drop);
      ctx.closePath();
    }, shade(c, 0.12), { band: 7, lw: LW.ui });
    // the fold where the band turns under
    ctx.beginPath();
    ctx.moveTo(s * w / 2, h / 2 - arch * 0.3);
    ctx.lineTo(x0, h / 2 + drop);
    ctx.lineTo(s * w / 2, h / 2 + drop * 0.05);
    ctx.closePath();
    ctx.fillStyle = shade(c, 0.4);
    ctx.fill();
    ctx.strokeStyle = P.ink;
    ctx.lineWidth = LW.ui;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
  const band = () => {
    ctx.beginPath();
    ctx.moveTo(-w / 2, -h / 2);
    ctx.quadraticCurveTo(0, -h / 2 - arch * 2, w / 2, -h / 2);
    ctx.lineTo(w / 2, h / 2);
    ctx.quadraticCurveTo(0, h / 2 - arch * 2, -w / 2, h / 2);
    ctx.closePath();
  };
  inked(ctx, band, c, { band: 9, lw: LW.ui });
  ctx.save();
  band();
  ctx.clip();
  grainFill(ctx, 0.4);
  ctx.setLineDash([7, 5]);
  ctx.strokeStyle = tint(c, 0.45);
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-w / 2 + 6, -h / 2 + 7);
  ctx.quadraticCurveTo(0, -h / 2 + 7 - arch * 2, w / 2 - 6, -h / 2 + 7);
  ctx.moveTo(-w / 2 + 6, h / 2 - 7);
  ctx.quadraticCurveTo(0, h / 2 - 7 - arch * 2, w / 2 - 6, h / 2 - 7);
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------- speech bubble

export interface BubbleOpts {
  fill?: string;
  r?: number;
  /** Width of the tail where it leaves the bubble (default 30). */
  tail?: number;
  shadow?: boolean;
}

/**
 * A speech bubble on x, y, w, h with its tail pointing toward (tx, ty), from whichever side faces that
 * point. The tail is at most about 44 long; the bubble doesn't move to reach far-off points.
 */
export function bubble(ctx: Ctx, x: number, y: number, w: number, h: number, tx: number, ty: number, o: BubbleOpts = {}) {
  const r = Math.min(o.r ?? 22, h / 2, w / 2);
  const tw = o.tail ?? 30;
  const side = ty > y + h ? 'b' : ty < y ? 't' : tx < x ? 'l' : tx > x + w ? 'r' : 'b';
  const cl = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
  // where the tail leaves the edge and where its tip is
  let bx: number, by: number, nx: number, ny: number;
  if (side === 'b' || side === 't') {
    bx = cl(tx, x + r + tw / 2 + 2, x + w - r - tw / 2 - 2);
    by = side === 'b' ? y + h : y;
    nx = 0;
    ny = side === 'b' ? 1 : -1;
  } else {
    by = cl(ty, y + r + tw / 2 + 2, y + h - r - tw / 2 - 2);
    bx = side === 'r' ? x + w : x;
    nx = side === 'r' ? 1 : -1;
    ny = 0;
  }
  const dx = tx - bx, dy = ty - by;
  const along = dx * nx + dy * ny;
  const len = cl(along, 16, 44);
  const lat = cl(nx ? dy : dx, -len * 0.9, len * 0.9);
  const tipX = bx + nx * len + (nx ? 0 : lat), tipY = by + ny * len + (ny ? 0 : lat);
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    if (side === 't') {
      ctx.lineTo(bx - tw / 2, y);
      ctx.quadraticCurveTo(bx - tw * 0.1, y - len * 0.35, tipX, tipY);
      ctx.quadraticCurveTo(bx + tw * 0.15, y - len * 0.2, bx + tw / 2, y);
    }
    ctx.arcTo(x + w, y, x + w, y + h, r);
    if (side === 'r') {
      ctx.lineTo(x + w, by - tw / 2);
      ctx.quadraticCurveTo(x + w + len * 0.35, by - tw * 0.1, tipX, tipY);
      ctx.quadraticCurveTo(x + w + len * 0.2, by + tw * 0.15, x + w, by + tw / 2);
    }
    ctx.arcTo(x + w, y + h, x, y + h, r);
    if (side === 'b') {
      ctx.lineTo(bx + tw / 2, y + h);
      ctx.quadraticCurveTo(bx + tw * 0.1, y + h + len * 0.35, tipX, tipY);
      ctx.quadraticCurveTo(bx - tw * 0.15, y + h + len * 0.2, bx - tw / 2, y + h);
    }
    ctx.arcTo(x, y + h, x, y, r);
    if (side === 'l') {
      ctx.lineTo(x, by + tw / 2);
      ctx.quadraticCurveTo(x - len * 0.35, by + tw * 0.1, tipX, tipY);
      ctx.quadraticCurveTo(x - len * 0.2, by - tw * 0.15, x, by - tw / 2);
    }
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };
  ctx.save();
  if (o.shadow !== false) {
    ctx.translate(2, 5);
    path();
    ctx.fillStyle = alpha(P.ink, 0.16);
    ctx.fill();
    ctx.translate(-2, -5);
  }
  path();
  ctx.fillStyle = o.fill ?? P.white;
  ctx.fill();
  grainFill(ctx, 0.35);
  ctx.strokeStyle = P.ink;
  ctx.lineWidth = 2.2;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.restore();
}

/**
 * Someone says something: a bubble `w` wide around the wrapped text, its top-left at (x, y), tail toward
 * (tx, ty). Returns the bubble's height.
 */
export function say(ctx: Ctx, x: number, y: number, w: number, s: string, tx: number, ty: number, o: BubbleOpts & { size?: number; bold?: boolean } = {}) {
  const size = o.size ?? 24;
  const lines = wrapText(ctx, s, size, w - 40, o.bold);
  const lh = size * 1.32;
  const h = lines.length * lh + 30;
  bubble(ctx, x, y, w, h, tx, ty, o);
  lines.forEach((l, i) => text(ctx, l, x + w / 2, y + 15 + lh * (i + 0.5) + 1, size, { bold: o.bold }));
  return h;
}

// ---------------------------------------------------------------- chalkboard

/** A chalkboard in a wooden frame (the daily deal), optionally hanging on a string. Returns the board area inside the frame. */
export function chalkboard(ctx: Ctx, x: number, y: number, w: number, h: number, o: { hang?: number; seed?: number } = {}) {
  const W = Math.round(w), Hh = Math.round(h), seed = o.seed ?? 7;
  if (o.hang) {
    ctx.save();
    ctx.lineCap = 'round';
    for (const pass of [0, 1]) {
      ctx.beginPath();
      ctx.moveTo(x + 20, y + 10);
      ctx.lineTo(x + w / 2, y - o.hang);
      ctx.lineTo(x + w - 20, y + 10);
      ctx.strokeStyle = pass ? P.kraftTop : P.ink;
      ctx.lineWidth = pass ? 2.4 : 5;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(x + w / 2, y - o.hang, 5, 0, TAU);
    ctx.fillStyle = '#9C998F';
    ctx.fill();
    ctx.strokeStyle = P.ink;
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.restore();
  }
  drawBaked(ctx, `chalk:${W}:${Hh}:${seed}`, x, y, [-6, -6, W + 10, Hh + 14], (c) => board(c, W, Hh, seed));
  const b = Math.max(10, Math.min(16, Math.min(w, h) * 0.08));
  return { x: x + b, y: y + b, w: w - b * 2, h: h - b * 2 };
}

function board(ctx: Ctx, w: number, h: number, seed: number) {
  const b = Math.max(10, Math.min(16, Math.min(w, h) * 0.08));
  ctx.save();
  ctx.translate(3, 6);
  boxPath(ctx, 0, 0, w, h, 6, seed, 0.6);
  ctx.fillStyle = alpha(P.ink, 0.22);
  ctx.fill();
  ctx.restore();
  inked(ctx, () => boxPath(ctx, 0, 0, w, h, 6, seed, 0.6), P.wood, { band: b * 0.6, lw: LW.ui });
  // the slate
  const slate = '#3E5A4B';
  inked(ctx, () => boxPath(ctx, b, b, w - b * 2, h - b * 2, 3, seed + 1, 0.3), slate, { band: 10, lw: LW.ui * 0.8, dark: 0.25, light: 0.12 });
  ctx.save();
  ctx.beginPath();
  ctx.rect(b, b, w - b * 2, h - b * 2);
  ctx.clip();
  // old chalk wiped off: a few faint wide strokes and some dust
  ctx.strokeStyle = '#F4F1E6';
  ctx.lineCap = 'round';
  for (let i = 0; i < 4; i++) {
    ctx.globalAlpha = 0.05 + jit(seed, i) * 0.02;
    ctx.lineWidth = h * 0.18;
    ctx.beginPath();
    wobbleLine(ctx, b + w * 0.1 * i, b + h * (0.25 + 0.2 * i), w - b - w * 0.1 * (3 - i), b + h * (0.2 + 0.18 * i), seed + i, 10);
    ctx.stroke();
  }
  ctx.fillStyle = '#F4F1E6';
  for (let i = 0; i < 70; i++) {
    ctx.globalAlpha = 0.12 + (jit(seed, i + 100) + 1) * 0.08;
    ctx.fillRect(b + (jit(seed, i + 200) + 1) / 2 * (w - b * 2), b + (jit(seed, i + 300) + 1) / 2 * (h - b * 2), 1.4, 1.4);
  }
  ctx.restore();
  // wood grain on the frame
  ctx.save();
  ctx.strokeStyle = shade(P.wood, 0.35);
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(b * 1.2, b * 0.45);
  ctx.lineTo(w - b * 1.6, b * 0.5);
  ctx.moveTo(b * 1.6, h - b * 0.5);
  ctx.lineTo(w - b * 1.2, h - b * 0.45);
  ctx.moveTo(b * 0.5, b * 1.6);
  ctx.lineTo(b * 0.45, h - b * 1.4);
  ctx.moveTo(w - b * 0.5, b * 1.4);
  ctx.lineTo(w - b * 0.45, h - b * 1.6);
  ctx.stroke();
  ctx.restore();
  // a stick of chalk on the ledge
  inked(ctx, () => boxPath(ctx, w - b - 34, h - b - 2, 24, 7, 3, seed + 2, 0.2), P.white, { band: 3, lw: 1.6 });
}

/** Chalk lettering: a little uneven and dusty. Colours: chalk white (default), '#F3D98B' yellow, '#F4B8B0' pink. */
export function chalkText(ctx: Ctx, s: string, x: number, y: number, size: number, o: { color?: string; align?: CanvasTextAlign; bold?: boolean; maxWidth?: number } = {}) {
  const color = o.color ?? '#F4F1E6';
  text(ctx, s, x + 0.9, y + 0.7, size, { ...o, color, alpha: 0.35 });
  text(ctx, s, x, y, size, { ...o, color, alpha: 0.92 });
}

// ---------------------------------------------------------------- luggage price tag

/** A luggage-label price tag centred on (cx, cy): a coin and the amount (or any label). Returns its width. */
export function priceTag(ctx: Ctx, cx: number, cy: number, label: string | number, o: { coin?: boolean; color?: string; rot?: number; size?: number } = {}) {
  const size = o.size ?? 26, coin = o.coin !== false;
  const s = String(label);
  ctx.save();
  ctx.font = font(size, true);
  const tw = ctx.measureText(s).width;
  ctx.restore();
  const h = size * 1.75, w = tw + (coin ? size * 1.25 : 0) + h * 0.55 + 30;
  const x = -w / 2, y = -h / 2;
  const fill = o.color ?? P.kraftTop;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(o.rot ?? -0.05);
  // the string through the hole
  ctx.lineCap = 'round';
  for (const pass of [0, 1]) {
    ctx.beginPath();
    ctx.moveTo(x + h * 0.36, 0);
    ctx.bezierCurveTo(x - h * 0.3, -h * 0.2, x - h * 0.2, -h * 0.9, x - h * 0.6, -h * 0.75);
    ctx.strokeStyle = pass ? P.red : P.ink;
    ctx.lineWidth = pass ? 2 : 4.4;
    ctx.stroke();
  }
  const shape = () => {
    ctx.beginPath();
    const c = h * 0.32;
    ctx.moveTo(x + c, y);
    ctx.lineTo(x + w - 6, y);
    ctx.arcTo(x + w, y, x + w, y + 6, 6);
    ctx.lineTo(x + w, y + h - 6);
    ctx.arcTo(x + w, y + h, x + w - 6, y + h, 6);
    ctx.lineTo(x + c, y + h);
    ctx.lineTo(x, y + h - c);
    ctx.lineTo(x, y + c);
    ctx.closePath();
  };
  ctx.save();
  ctx.translate(2, 4);
  shape();
  ctx.fillStyle = alpha(P.ink, 0.18);
  ctx.fill();
  ctx.restore();
  inked(ctx, shape, fill, { band: 6, lw: 2.2 });
  // stitched edge and the reinforced hole
  ctx.save();
  ctx.setLineDash([5, 4]);
  ctx.strokeStyle = shade(fill, 0.25);
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(x + h * 0.58, y + 5);
  ctx.lineTo(x + w - 6, y + 5);
  ctx.moveTo(x + h * 0.58, y + h - 5);
  ctx.lineTo(x + w - 6, y + h - 5);
  ctx.stroke();
  ctx.restore();
  ctx.beginPath();
  ctx.arc(x + h * 0.36, 0, h * 0.17, 0, TAU);
  ctx.fillStyle = P.gold;
  ctx.fill();
  ctx.strokeStyle = P.ink;
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x + h * 0.36, 0, h * 0.08, 0, TAU);
  ctx.fillStyle = P.paper;
  ctx.fill();
  ctx.stroke();
  let tx = x + h * 0.62 + 6;
  if (coin) {
    icon(ctx, 'coin', tx + size * 0.5, 0, size * 1.1);
    tx += size * 1.25;
  }
  text(ctx, s, tx + tw / 2 + 2, 1, size, { bold: true });
  ctx.restore();
  return w;
}

// ---------------------------------------------------------------- level pips

/** `n` of `of` level pips in a row starting at x, centred on cy. Returns the row's width. */
export function pips(ctx: Ctx, x: number, cy: number, n: number, of: number, o: { r?: number; gap?: number; color?: string } = {}) {
  const r = o.r ?? 11, gap = o.gap ?? 8, c = o.color ?? P.gold;
  for (let i = 0; i < of; i++) {
    const px = x + r + i * (r * 2 + gap);
    const dot = () => {
      ctx.beginPath();
      ctx.arc(px, cy, r, 0, TAU);
    };
    if (i < n) {
      inked(ctx, dot, c, { band: r * 0.55, lw: 2 });
      ctx.beginPath();
      ctx.arc(px - r * 0.35, cy - r * 0.35, r * 0.22, 0, TAU);
      ctx.fillStyle = alpha(P.white, 0.85);
      ctx.fill();
    } else {
      ctx.save();
      dot();
      ctx.fillStyle = alpha(P.paperShade, 0.55);
      ctx.fill();
      ctx.globalAlpha *= 0.6;
      ctx.setLineDash([3.5, 3]);
      ctx.strokeStyle = P.ink;
      ctx.lineWidth = 1.8;
      ctx.stroke();
      ctx.restore();
    }
  }
  return of * r * 2 + (of - 1) * gap;
}

// ---------------------------------------------------------------- postmark

/** A red postmark stamped at an angle: two rings, the label inside and wavy cancel lines ('已拥有' by default). */
export function postmark(ctx: Ctx, cx: number, cy: number, label = '已拥有', o: { r?: number; color?: string; rot?: number; lines?: boolean } = {}) {
  const r = o.r ?? 46, c = o.color ?? P.red;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(o.rot ?? -0.14);
  ctx.globalAlpha *= 0.86;
  ctx.strokeStyle = c;
  ctx.fillStyle = c;
  ctx.lineCap = 'round';
  // uneven ink: the rings are broken here and there like a real rubber stamp
  ctx.setLineDash([r * 0.9, 2.5, r * 0.35, 1.5, r * 0.6, 3]);
  ctx.lineWidth = 3.4;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([r * 0.5, 2, r * 0.8, 3]);
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.8, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  for (const s of [-1, 1]) {
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5, a2 = a + Math.PI / 5;
      const px = s * r * 0.9;
      if (i) ctx.lineTo(px + Math.cos(a) * 4.5, Math.sin(a) * 4.5);
      else ctx.moveTo(px + Math.cos(a) * 4.5, Math.sin(a) * 4.5);
      ctx.lineTo(px + Math.cos(a2) * 2, Math.sin(a2) * 2);
    }
    ctx.closePath();
    ctx.fill();
  }
  if (o.lines !== false) {
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    for (let k = -1; k <= 1; k++) {
      const yy = k * r * 0.34;
      ctx.moveTo(r * 1.1, yy);
      for (let i = 0; i < 3; i++) ctx.quadraticCurveTo(r * (1.25 + i * 0.36), yy - 6, r * (1.43 + i * 0.36), yy);
    }
    ctx.stroke();
  }
  ctx.restore();
  text(ctx, label, cx, cy + 1, Math.max(22, r * 0.5), { bold: true, color: c, alpha: 0.86, maxWidth: r * 1.45 });
}

// ---------------------------------------------------------------- NEW corner ribbon

/** A diagonal ribbon across the top-right (or top-left) corner of a card on x, y, w, h with rounded corners r. */
export function cornerRibbon(ctx: Ctx, x: number, y: number, w: number, h: number, label = 'NEW', o: { color?: string; corner?: 'tr' | 'tl'; r?: number; size?: number } = {}) {
  const c = o.color ?? P.red, left = o.corner === 'tl', r = o.r ?? 14;
  const size = o.size ?? 22, bw = size * 1.45, L = bw * 2.2;
  const ox = left ? x : x + w;
  const s = left ? -1 : 1;
  ctx.save();
  // clip to the card so the band ends at its edges
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.clip();
  ctx.translate(ox - s * L * 0.5, y + L * 0.5);
  ctx.rotate(s * Math.PI / 4);
  const band = () => {
    ctx.beginPath();
    ctx.rect(-L, -bw / 2, L * 2, bw);
  };
  inked(ctx, band, c, { band: 5, lw: 2 });
  ctx.setLineDash([5, 4]);
  ctx.strokeStyle = tint(c, 0.5);
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(-L, -bw / 2 + 4);
  ctx.lineTo(L, -bw / 2 + 4);
  ctx.moveTo(-L, bw / 2 - 4);
  ctx.lineTo(L, bw / 2 - 4);
  ctx.stroke();
  ctx.setLineDash([]);
  text(ctx, label, 0, 1, size, { bold: true, color: P.white });
  ctx.restore();
}

// ---------------------------------------------------------------- empty states

export type EmptyKind = 'boat' | 'album' | 'letters' | 'log' | 'news';

/**
 * An empty list's little picture and two lines under it, centred on cx from the top y. `size` is the
 * picture's width (default 180). Returns the y under the text.
 */
export function emptyState(ctx: Ctx, cx: number, y: number, kind: EmptyKind, line1: string, line2?: string, o: { size?: number } = {}) {
  const s = Math.round(o.size ?? 180);
  const h = s * 0.62;
  drawBaked(ctx, `empty:${kind}:${s}`, cx, y + h / 2, [-s / 2 - 8, -h / 2 - 8, s / 2 + 8, h / 2 + 8], (c) => {
    c.scale(s / 180, s / 180);
    VIGNETTES[kind](c);
  });
  let ty = y + h + 34;
  text(ctx, line1, cx, ty, 28, { bold: true, color: P.inkSoft, maxWidth: 640 });
  if (line2) {
    ty += 40;
    text(ctx, line2, cx, ty, 22, { color: P.inkSoft, maxWidth: 640 });
  }
  return ty + 24;
}

// each vignette on a 180 x 112 box around the origin
const VIGNETTES: Record<EmptyKind, (ctx: Ctx) => void> = {
  // a paper boat on still water: the river is quiet today
  boat(ctx) {
    inked(ctx, () => {
      ctx.beginPath();
      ctx.ellipse(0, 30, 86, 22, 0, 0, TAU);
    }, P.tealLight, { lw: 2, band: 8, dark: 0.12 });
    ctx.strokeStyle = alpha(P.white, 0.9);
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.ellipse(-4, 36, 56, 9, 0, 0.2, Math.PI - 0.2);
    ctx.moveTo(42, 22);
    ctx.lineTo(62, 22);
    ctx.moveTo(-70, 30);
    ctx.lineTo(-56, 30);
    ctx.stroke();
    // lily pad
    inked(ctx, () => {
      ctx.beginPath();
      ctx.moveTo(52, 34);
      ctx.arc(52, 34, 15, 0.5, Math.PI * 2 - 0.2);
      ctx.closePath();
    }, P.lily, { lw: 2, band: 5 });
    // the boat
    ctx.save();
    ctx.translate(-8, 22);
    ctx.rotate(-0.04);
    inked(ctx, () => {
      ctx.beginPath();
      ctx.moveTo(-50, -14);
      ctx.lineTo(50, -14);
      ctx.lineTo(32, 6);
      ctx.lineTo(-32, 6);
      ctx.closePath();
    }, P.white, { lw: 2.4, band: 6 });
    inked(ctx, () => {
      ctx.beginPath();
      ctx.moveTo(-26, -14);
      ctx.lineTo(4, -58);
      ctx.lineTo(28, -14);
      ctx.closePath();
    }, '#F3EEE2', { lw: 2.4, band: 7, hatch: [-26, -58, 54, 44] });
    ctx.strokeStyle = alpha(P.ink, 0.5);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(4, -58);
    ctx.lineTo(4, -14);
    ctx.moveTo(-40, -14);
    ctx.lineTo(-30, -4);
    ctx.stroke();
    ctx.restore();
  },
  // a closed album tied with a ribbon: no photos yet
  album(ctx) {
    contactShadow(ctx, 4, 44, 70, 9);
    ctx.save();
    ctx.rotate(-0.06);
    inked(ctx, () => boxPath(ctx, -56, -44, 116, 86, 6, 3, 0.5), shade(P.lilyDeep, 0.15), { lw: 2.4, band: 6 });
    inked(ctx, () => boxPath(ctx, -62, -48, 116, 86, 6, 4, 0.5), P.lilyDeep, { lw: 2.4, band: 10, hatch: [-62, -48, 116, 86] });
    ctx.fillStyle = shade(P.lilyDeep, 0.25);
    ctx.fillRect(-62, -47, 12, 84);
    inked(ctx, () => boxPath(ctx, -24, -32, 50, 40, 2, 5, 0.3), P.white, { lw: 2, band: 4 });
    ctx.fillStyle = P.tealLight;
    ctx.fillRect(-18, -26, 38, 22);
    ctx.fillStyle = P.lily;
    ctx.beginPath();
    ctx.moveTo(-18, -4);
    ctx.lineTo(-6, -16);
    ctx.lineTo(4, -9);
    ctx.lineTo(12, -15);
    ctx.lineTo(20, -6);
    ctx.lineTo(20, -4);
    ctx.closePath();
    ctx.fill();
    // ribbon round it and a bow
    ctx.fillStyle = P.red;
    ctx.fillRect(18, -48, 10, 86);
    ctx.strokeStyle = P.ink;
    ctx.lineWidth = 1.8;
    ctx.strokeRect(18, -48, 10, 86);
    for (const s of [-1, 1]) {
      inked(ctx, () => {
        ctx.beginPath();
        ctx.moveTo(23, -6);
        ctx.bezierCurveTo(23 + s * 8, -26, 23 + s * 30, -20, 23 + s * 22, -6);
        ctx.quadraticCurveTo(23 + s * 14, 0, 23, -6);
        ctx.closePath();
      }, P.red, { lw: 2, band: 4 });
      inked(ctx, () => {
        ctx.beginPath();
        ctx.moveTo(23, -4);
        ctx.lineTo(23 + s * 14, 22);
        ctx.lineTo(23 + s * 6, 20);
        ctx.closePath();
      }, shade(P.red, 0.1), { lw: 2, band: 3 });
    }
    inked(ctx, () => {
      ctx.beginPath();
      ctx.arc(23, -5, 5, 0, TAU);
    }, P.red, { lw: 2, band: 2 });
    ctx.restore();
  },
  // sealed envelopes with wax seals: letters still out there
  letters(ctx) {
    contactShadow(ctx, 0, 46, 74, 8);
    for (const [x, y, r] of [[-30, 4, -0.16], [30, 2, 0.14], [0, 12, 0]] as const) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(r);
      inked(ctx, () => boxPath(ctx, -46, -30, 92, 60, 4, Math.round(x + 50), 0.4), r ? P.cream : P.white, { lw: 2.4, band: 6 });
      ctx.strokeStyle = alpha(P.ink, 0.55);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-44, -28);
      ctx.lineTo(0, 4);
      ctx.lineTo(44, -28);
      ctx.stroke();
      inked(ctx, () => {
        ctx.beginPath();
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * TAU, rr = i % 2 ? 9 : 11;
          if (i) ctx.lineTo(Math.cos(a) * rr, 4 + Math.sin(a) * rr);
          else ctx.moveTo(Math.cos(a) * rr, 4 + Math.sin(a) * rr);
        }
        ctx.closePath();
      }, P.red, { lw: 1.8, band: 4 });
      ctx.restore();
    }
  },
  // the logbook, closed, with a pencil on it: no days worked yet
  log(ctx) {
    contactShadow(ctx, 0, 44, 72, 9);
    ctx.save();
    ctx.rotate(0.04);
    inked(ctx, () => boxPath(ctx, -56, -40, 110, 80, 5, 8, 0.5), P.blue, { lw: 2.4, band: 10, hatch: [-56, -40, 110, 80] });
    ctx.fillStyle = P.paper;
    ctx.fillRect(-52, 36, 102, 4);
    inked(ctx, () => boxPath(ctx, -30, -24, 58, 20, 3, 9, 0.3), P.cream, { lw: 2, band: 3 });
    ctx.fillStyle = P.red;
    ctx.fillRect(30, -42, 8, 40);
    ctx.restore();
    ctx.save();
    ctx.translate(18, 18);
    ctx.rotate(-0.6);
    inked(ctx, () => boxPath(ctx, -50, -6, 84, 12, 2, 10, 0.2), P.mustard, { lw: 2, band: 3 });
    inked(ctx, () => {
      ctx.beginPath();
      ctx.moveTo(34, -6);
      ctx.lineTo(52, 0);
      ctx.lineTo(34, 6);
      ctx.closePath();
    }, P.woodLight, { lw: 2, shade: false });
    ctx.fillStyle = P.ink;
    ctx.beginPath();
    ctx.moveTo(46, -2);
    ctx.lineTo(52, 0);
    ctx.lineTo(46, 2);
    ctx.fill();
    inked(ctx, () => boxPath(ctx, -58, -6, 10, 12, 2, 11, 0.1), P.pink, { lw: 2, shade: false });
    ctx.restore();
  },
  // a rolled newspaper tied with string: no news yet
  news(ctx) {
    contactShadow(ctx, 0, 40, 76, 8);
    ctx.save();
    ctx.rotate(-0.12);
    inked(ctx, () => boxPath(ctx, -72, -22, 140, 48, 22, 12, 0.6), P.white, { lw: 2.4, band: 10, hatch: [-72, -22, 140, 48] });
    inked(ctx, () => {
      ctx.beginPath();
      ctx.ellipse(66, 2, 9, 24, 0, 0, TAU);
    }, P.paperShade, { lw: 2.2, band: 4 });
    ctx.strokeStyle = alpha(P.ink, 0.6);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.ellipse(66, 2, 4, 12, 0, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = alpha(P.ink, 0.55);
    for (let i = 0; i < 3; i++) ctx.fillRect(-56, -10 + i * 10, 40 - i * 8, 3);
    ctx.fillStyle = P.red;
    ctx.fillRect(-4, -14, 44, 8);
    ctx.strokeStyle = P.kraft;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-26, -22);
    ctx.lineTo(-26, 26);
    ctx.moveTo(26, -22);
    ctx.lineTo(26, 26);
    ctx.stroke();
    ctx.restore();
  },
};
