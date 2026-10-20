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

/** Pill button with stitched edge. */
export function button(ctx: Ctx, x: number, y: number, w: number, h: number, label: string, o: { primary?: boolean; pressed?: boolean; size?: number; disabled?: boolean } = {}) {
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
}

export function ellipse(ctx: Ctx, x: number, y: number, rx: number, ry: number) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2);
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
