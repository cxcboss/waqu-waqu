// Canvas helpers for the paper-page UI described in the art bible.
import type { Ctx } from '../platform/types';
import { INK, P } from './palette';

const FALLBACK = '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
export const font = (size: number, bold = false) => `${size}px ${bold ? 'WKB' : 'WK'}, ${FALLBACK}`;

export function text(
  ctx: Ctx, s: string, x: number, y: number, size: number,
  o: { color?: string; align?: CanvasTextAlign; bold?: boolean; baseline?: CanvasTextBaseline; maxWidth?: number; alpha?: number } = {},
) {
  ctx.save();
  let sz = size;
  ctx.font = font(sz, o.bold);
  if (o.maxWidth) {
    while (sz > 12 && ctx.measureText(s).width > o.maxWidth) {
      sz -= 1;
      ctx.font = font(sz, o.bold);
    }
  }
  if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha;
  ctx.fillStyle = o.color || INK;
  ctx.textAlign = o.align || 'center';
  ctx.textBaseline = o.baseline || 'middle';
  ctx.fillText(s, x, y);
  ctx.restore();
}

export function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Paper panel: cream page, ink outline, stitched kraft inner line, soft drop shadow. */
export function panel(ctx: Ctx, x: number, y: number, w: number, h: number, o: { r?: number; fill?: string; stitch?: string; shadow?: boolean; lw?: number } = {}) {
  const r = o.r ?? 14;
  if (o.shadow !== false) {
    ctx.fillStyle = P.paperShade;
    ctx.globalAlpha = 0.85;
    roundRect(ctx, x + 3, y + 5, w, h, r);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = o.fill || P.paper;
  ctx.fill();
  ctx.lineWidth = o.lw ?? 2.2;
  ctx.strokeStyle = INK;
  ctx.stroke();
  const inset = Math.min(8, h / 6);
  if (inset > 3) {
    roundRect(ctx, x + inset, y + inset, w - inset * 2, h - inset * 2, Math.max(3, r - inset));
    ctx.setLineDash([7, 5]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = o.stitch || P.kraft;
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

/**
 * Press feedback shared by every button: while held, it shrinks a little about its middle and a
 * shade goes over it. Call `pressIn` before drawing and `pressOut` with the button's outline after.
 */
export const PRESS_SCALE = 0.93;
export function pressIn(ctx: Ctx, r: Rect, pressed: boolean | undefined) {
  ctx.save();
  if (!pressed) return;
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  ctx.translate(cx, cy);
  ctx.scale(PRESS_SCALE, PRESS_SCALE);
  ctx.translate(-cx, -cy);
}
export function pressOut(ctx: Ctx, pressed: boolean | undefined, shape: () => void) {
  if (pressed) {
    shape();
    ctx.fillStyle = 'rgba(36,28,22,0.22)';
    ctx.fill();
  }
  ctx.restore();
}

/** Pill button with stitched edge. */
export function button(ctx: Ctx, x: number, y: number, w: number, h: number, label: string, o: { primary?: boolean; pressed?: boolean; size?: number; disabled?: boolean } = {}) {
  pressIn(ctx, { x, y, w, h }, o.pressed);
  ctx.save();
  if (o.disabled) ctx.globalAlpha = 0.45;
  const dy = o.pressed ? 3 : 0;
  ctx.fillStyle = o.primary ? P.orangeDeep : '#B8925F';
  roundRect(ctx, x, y + 5, w, h, h / 2);
  ctx.fill();
  roundRect(ctx, x, y + dy, w, h, h / 2);
  ctx.fillStyle = o.primary ? P.orange : P.kraft;
  ctx.fill();
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = INK;
  ctx.stroke();
  roundRect(ctx, x + 8, y + dy + 7, w - 16, h - 14, (h - 14) / 2);
  ctx.setLineDash([6, 5]);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = o.primary ? '#F5B48E' : P.kraftTop;
  ctx.stroke();
  ctx.setLineDash([]);
  text(ctx, label, x + w / 2, y + dy + h / 2 + 1, o.size || 30, { color: o.primary ? P.white : INK, bold: true, maxWidth: w - 30 });
  ctx.restore();
  pressOut(ctx, o.pressed, () => roundRect(ctx, x, y + dy, w, h, h / 2));
}

export function ellipse(ctx: Ctx, x: number, y: number, rx: number, ry: number) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2);
}

/** Pickup-code tag: a little luggage label with a big digit, in the house's color. Centered on (x, y). */
export function codeTag(ctx: Ctx, x: number, y: number, code: number, color: string, size = 1) {
  const w = 34 * size, h = 40 * size;
  ctx.save();
  roundRect(ctx, x - w / 2, y - h / 2, w, h, 8 * size);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = INK;
  ctx.stroke();
  // string hole
  ctx.beginPath();
  ctx.arc(x, y - h / 2 + 6 * size, 2.6 * size, 0, Math.PI * 2);
  ctx.fillStyle = P.paper;
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  text(ctx, String(code), x, y + 4 * size, 28 * size, { color: color === P.gold ? INK : P.white, bold: true });
}

/** Small house-number plate in the house's color. */
export function plate(ctx: Ctx, x: number, y: number, num: number, color: string, size = 1) {
  const w = 30 * size, h = 24 * size;
  roundRect(ctx, x - w / 2, y - h / 2, w, h, 6 * size);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = INK;
  ctx.stroke();
  text(ctx, String(num), x, y + 1, 19 * size, { color: color === P.gold ? INK : P.white, bold: true });
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export const hit = (r: Rect | null | undefined, x: number, y: number, pad = 0) =>
  !!r && x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;

/**
 * A run of caption text: plain strings, highlighted words, and inline house plates.
 * Written as a string, 【...】 marks a highlight.
 */
export type Seg = string | { hl: string } | { code: number; color: string };

export function segs(s: string): Seg[] {
  return s.split(/(【[^】]*】)/).filter(Boolean).map((p) => (p.startsWith('【') ? { hl: p.slice(1, -1) } : p));
}

function segWidth(ctx: Ctx, s: Seg, size: number, bold: boolean) {
  if (typeof s === 'string') {
    ctx.font = font(size, bold);
    return ctx.measureText(s).width;
  }
  if ('hl' in s) {
    ctx.font = font(size, true);
    return ctx.measureText(s.hl).width;
  }
  return 34 * (size / 26) + 10;
}

export function richWidth(ctx: Ctx, line: Seg[], size: number, bold = false) {
  ctx.save();
  const w = line.reduce((m, s) => m + segWidth(ctx, s, size, bold), 0);
  ctx.restore();
  return w;
}

/** Draws one line of segments centered on x (or starting at x with `left`), smaller if it's wider than `maxWidth`. */
export function rich(ctx: Ctx, line: Seg[], x: number, y: number, size: number, o: { color?: string; hl?: string; bold?: boolean; left?: boolean; maxWidth?: number } = {}) {
  const bold = !!o.bold;
  if (o.maxWidth) {
    const w = richWidth(ctx, line, size, bold);
    if (w > o.maxWidth) size = Math.max(12, Math.floor((size * o.maxWidth) / w));
  }
  ctx.save();
  let cx = o.left ? x : x - richWidth(ctx, line, size, bold) / 2;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  for (const s of line) {
    const w = segWidth(ctx, s, size, bold);
    if (typeof s === 'string') {
      ctx.font = font(size, bold);
      ctx.fillStyle = o.color || INK;
      ctx.fillText(s, cx, y);
    } else if ('hl' in s) {
      // marker-pen underline behind the highlighted words
      ctx.fillStyle = 'rgba(232,183,74,0.45)';
      roundRect(ctx, cx - 3, y + size * 0.12, w + 6, size * 0.36, size * 0.18);
      ctx.fill();
      ctx.font = font(size, true);
      ctx.fillStyle = o.hl || P.orangeDeep;
      ctx.fillText(s.hl, cx, y);
    } else {
      codeTag(ctx, cx + w / 2, y, s.code, s.color, size / 26);
    }
    cx += w;
  }
  ctx.restore();
}

/**
 * The pieces a line of text may be broken between: one Chinese character each, but a number or a latin
 * word stays whole, an opening bracket or quote sticks to what follows it, and closing punctuation to
 * what comes before it (so no line starts with '。' or ends with '“').
 */
const BREAKS = /[（“‘《「【(¥$+−]*(?:[0-9A-Za-z]+(?:[.:,/'-][0-9A-Za-z]+)*%?|—+|…+|[\s\S])[，。！？、；：…）”’》」】,.!?;:)]*/gu;
export const breakPieces = (s: string) => s.match(BREAKS) ?? [];

/** Breaks a sentence into lines no wider than maxWidth, between the pieces above. */
export function wrapText(ctx: Ctx, s: string, size: number, maxWidth: number, bold = false): string[] {
  ctx.save();
  ctx.font = font(size, bold);
  const out: string[] = [];
  let cur = '';
  for (const p of breakPieces(s)) {
    if (cur && ctx.measureText(cur + p).width > maxWidth) {
      out.push(cur.trimEnd());
      cur = p.trimStart();
    } else cur += p;
  }
  if (cur) out.push(cur);
  ctx.restore();
  return out;
}
