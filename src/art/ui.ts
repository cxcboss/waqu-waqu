// Canvas helpers for the paper-page UI described in the art bible. The kit (src/art/kit) adds the
// signage, labels, icons and medals that go with them.
import type { Ctx } from '../platform/types';
import { faded, shade, tint } from './kit/color';
import { icon, type IconName } from './kit/icons';
import { wobbleRect } from './kit/ink';
import { grainFill } from './kit/paper';
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

export interface PanelOpts {
  r?: number;
  fill?: string;
  /** Colour of the stitched inner line, or false for none. */
  stitch?: string | false;
  shadow?: boolean;
  lw?: number;
  /** Paper grain over the fill: true for the usual strength, or its alpha. */
  grain?: boolean | number;
  /** A strip of washi tape over the top edge: true, or its colour. */
  tape?: boolean | string;
  /** Hand-drawn edges that wobble a little (the same wobble every frame for the same size). */
  wobble?: boolean;
}

/** Paper panel: cream page, ink outline, stitched kraft inner line, soft drop shadow. */
export function panel(ctx: Ctx, x: number, y: number, w: number, h: number, o: PanelOpts = {}) {
  const r = o.r ?? 14;
  const shape = o.wobble ? () => wobbleRect(ctx, x, y, w, h, r, Math.round(w * 3 + h * 7), 0.8) : () => roundRect(ctx, x, y, w, h, r);
  if (o.shadow !== false) {
    ctx.save();
    ctx.translate(3, 5);
    shape();
    ctx.fillStyle = P.paperShade;
    ctx.globalAlpha *= 0.85;
    ctx.fill();
    ctx.restore();
  }
  shape();
  ctx.fillStyle = o.fill || P.paper;
  ctx.fill();
  if (o.grain) grainFill(ctx, o.grain === true ? 0.4 : o.grain);
  ctx.lineWidth = o.lw ?? 2.2;
  ctx.strokeStyle = INK;
  ctx.lineJoin = 'round';
  ctx.stroke();
  const inset = Math.min(8, h / 6);
  if (inset > 3 && o.stitch !== false) {
    roundRect(ctx, x + inset, y + inset, w - inset * 2, h - inset * 2, Math.max(3, r - inset));
    ctx.setLineDash([7, 5]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = o.stitch || P.kraft;
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (o.tape) tape(ctx, x + w / 2, y + 1, Math.min(150, w * 0.36), typeof o.tape === 'string' ? o.tape : undefined);
}

/** A strip of washi tape centred on (x, y), with torn zigzag ends. */
export function tape(ctx: Ctx, x: number, y: number, w: number, color = 'rgba(232,183,74,0.6)', rot = -0.035) {
  const h = 28;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.beginPath();
  ctx.moveTo(-w / 2, -h / 2);
  ctx.lineTo(w / 2, -h / 2);
  for (let i = 1; i <= 6; i++) ctx.lineTo(w / 2 + (i % 2 ? 4 : 0), -h / 2 + (i * h) / 6);
  ctx.lineTo(-w / 2, h / 2);
  for (let i = 1; i <= 6; i++) ctx.lineTo(-w / 2 - (i % 2 ? 4 : 0), h / 2 - (i * h) / 6);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  // a faint printed pattern on the tape
  ctx.clip();
  ctx.fillStyle = 'rgba(255,250,238,0.35)';
  for (let i = -w / 2 + 6; i < w / 2; i += 14) ctx.fillRect(i, -h / 2, 5, h);
  ctx.restore();
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

export type ButtonKind = 'primary' | 'secondary' | 'ghost';

/** Colours of each kind of button: face, the lip under it, the stitching and the label. */
const BUTTON: Record<ButtonKind, { fill: string; lip: string; stitch: string; label: string }> = {
  primary: { fill: P.orange, lip: P.orangeDeep, stitch: '#F5B48E', label: P.white },
  secondary: { fill: P.kraft, lip: '#B8925F', stitch: P.kraftTop, label: INK },
  ghost: { fill: P.paper, lip: P.paperShade, stitch: P.kraft, label: INK },
};

/**
 * Pill button with a stitched edge: primary (orange), secondary (kraft, the default) or ghost (paper).
 * A disabled button turns grey rather than see-through; `icon` puts a pictogram before the label.
 */
export function button(
  ctx: Ctx, x: number, y: number, w: number, h: number, label: string,
  o: { primary?: boolean; kind?: ButtonKind; pressed?: boolean; size?: number; disabled?: boolean; icon?: IconName } = {},
) {
  const kind = o.kind ?? (o.primary ? 'primary' : 'secondary');
  const look = BUTTON[kind];
  const fill = o.disabled ? faded(look.fill, 0.75) : look.fill;
  pressIn(ctx, { x, y, w, h }, o.pressed);
  ctx.save();
  const dy = o.pressed ? 3 : 0;
  ctx.fillStyle = o.disabled ? faded(look.lip, 0.75) : look.lip;
  roundRect(ctx, x, y + 5, w, h, h / 2);
  ctx.fill();
  roundRect(ctx, x, y + dy, w, h, h / 2);
  ctx.fillStyle = fill;
  ctx.fill();
  // the light catches the upper half, and the face has a little paper tooth
  ctx.save();
  ctx.clip();
  ctx.fillStyle = tint(fill, 0.28);
  ctx.globalAlpha *= 0.5;
  roundRect(ctx, x + h * 0.2, y + dy + 4, w - h * 0.4, h * 0.36, h * 0.18);
  ctx.fill();
  ctx.globalAlpha /= 0.5;
  roundRect(ctx, x, y + dy, w, h, h / 2);
  grainFill(ctx, 0.3);
  ctx.restore();
  roundRect(ctx, x, y + dy, w, h, h / 2);
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = INK;
  ctx.stroke();
  roundRect(ctx, x + 8, y + dy + 7, w - 16, h - 14, (h - 14) / 2);
  ctx.setLineDash([6, 5]);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = o.disabled ? shade(fill, 0.12) : look.stitch;
  ctx.stroke();
  ctx.setLineDash([]);
  const size = o.size || 30;
  const color = o.disabled ? P.inkSoft : look.label;
  if (o.icon) {
    const is = Math.min(h * 0.56, size * 1.5);
    ctx.font = font(size, true);
    const tw = Math.min(ctx.measureText(label).width, w - is - 46);
    const left = x + w / 2 - (is + 8 + tw) / 2;
    icon(ctx, o.icon, left + is / 2, y + dy + h / 2, is, { faded: o.disabled });
    text(ctx, label, left + is + 8 + tw / 2, y + dy + h / 2 + 1, size, { color, bold: true, maxWidth: w - is - 46 });
  } else text(ctx, label, x + w / 2, y + dy + h / 2 + 1, size, { color, bold: true, maxWidth: w - 30 });
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

/** Draws one line of segments centered on x (or starting at x with `left`). */
export function rich(ctx: Ctx, line: Seg[], x: number, y: number, size: number, o: { color?: string; hl?: string; bold?: boolean; left?: boolean } = {}) {
  const bold = !!o.bold;
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

/** Breaks a sentence into lines no wider than maxWidth (character by character, as Chinese allows). */
export function wrapText(ctx: Ctx, s: string, size: number, maxWidth: number, bold = false): string[] {
  ctx.save();
  ctx.font = font(size, bold);
  const out: string[] = [];
  let cur = '';
  for (const ch of s) {
    // keep closing punctuation on the line it belongs to
    if (cur && ctx.measureText(cur + ch).width > maxWidth && !'，。！？、…）”'.includes(ch)) {
      out.push(cur);
      cur = ch;
    } else cur += ch;
  }
  if (cur) out.push(cur);
  ctx.restore();
  return out;
}
