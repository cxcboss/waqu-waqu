// Shared pieces for the screens outside work (home page, HQ hall, the frog's home, the shop):
// tap targets, a scrolling list, the header bar, paper tabs, dialogs and the dressed-up frog.
import { INK, P } from '../art/palette';
import { K, type SpriteBank } from '../art/sprites';
import { ellipse, hit, panel, pressIn, pressOut, roundRect, text, type Rect } from '../art/ui';
import { approach, clamp } from '../engine/math';
import type { Ctx } from '../platform/types';
import type { Wear } from './career';
import type { Game } from './game';

/**
 * Tap targets, registered while drawing each frame (so they always match what's on screen).
 * A press is cancelled when the finger slides away, which is how lists scroll without tapping.
 */
export class Taps {
  private list: { id: string; r: Rect; pad: number }[] = [];
  pressed: string | null = null;
  private at = { x: 0, y: 0 };

  clear() {
    this.list.length = 0;
  }
  /** Registers an area for this frame; true while it's held down. */
  add(id: string, r: Rect, pad = 0) {
    this.list.push({ id, r, pad });
    return this.pressed === id;
  }
  /** The topmost area under the finger (drawn last wins). */
  down(x: number, y: number): string | null {
    this.pressed = null;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const b = this.list[i];
      if (hit(b.r, x, y, b.pad)) {
        this.pressed = b.id;
        break;
      }
    }
    this.at = { x, y };
    return this.pressed;
  }
  move(x: number, y: number) {
    if (this.pressed && Math.hypot(x - this.at.x, y - this.at.y) > 16) this.pressed = null;
  }
  /** The id of a completed tap (let go over the same area), or null. */
  up(x: number, y: number): string | null {
    const id = this.pressed;
    this.pressed = null;
    if (!id) return null;
    // the same id can cover more than one area (the wardrobe and its toolbar button)
    return this.list.some((b) => b.id === id && hit(b.r, x, y, b.pad + 10)) ? id : null;
  }
}

/** A vertical list that scrolls with a drag and keeps sliding a little after letting go. */
export class Scroller {
  y = 0;
  max = 0;
  view: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private v = 0;
  private drag: { y0: number; s0: number; last: number; lastT: number } | null = null;
  private t = 0;

  down(x: number, y: number) {
    if (!hit(this.view, x, y)) return;
    this.drag = { y0: y, s0: this.y, last: y, lastT: this.t };
    this.v = 0;
  }
  move(_x: number, y: number) {
    const d = this.drag;
    if (!d) return;
    let ny = d.s0 - (y - d.y0);
    // rubber band past the ends
    if (ny < 0) ny *= 0.4;
    else if (ny > this.max) ny = this.max + (ny - this.max) * 0.4;
    const dt = Math.max(1 / 120, this.t - d.lastT);
    this.v = -(y - d.last) / dt;
    d.last = y;
    d.lastT = this.t;
    this.y = ny;
  }
  up() {
    if (this.drag && this.t - this.drag.lastT > 0.08) this.v = 0;
    this.drag = null;
  }
  reset() {
    this.y = 0;
    this.v = 0;
  }
  update(dt: number) {
    this.t += dt;
    if (this.drag) return;
    this.y += this.v * dt;
    this.v *= Math.exp(-4.5 * dt);
    if (Math.abs(this.v) < 5) this.v = 0;
    if (this.y < 0) {
      this.y = approach(this.y, 0, 14, dt);
      this.v = 0;
    } else if (this.y > this.max) {
      this.y = approach(this.y, this.max, 14, dt);
      this.v = 0;
    }
  }
  /** Content height decides how far it scrolls. */
  setContent(h: number) {
    this.max = Math.max(0, h - this.view.h);
  }
  begin(ctx: Ctx) {
    const v = this.view;
    ctx.save();
    ctx.beginPath();
    ctx.rect(v.x, v.y, v.w, v.h);
    ctx.clip();
    ctx.translate(0, -this.y);
  }
  end(ctx: Ctx) {
    ctx.restore();
    if (this.max <= 0) return;
    const v = this.view;
    const h = Math.max(60, (v.h * v.h) / (v.h + this.max));
    const y = v.y + (clamp(this.y, 0, this.max) / this.max) * (v.h - h);
    ctx.save();
    ctx.globalAlpha = 0.35;
    roundRect(ctx, v.x + v.w - 8, y, 5, h, 3);
    ctx.fillStyle = INK;
    ctx.fill();
    ctx.restore();
  }
  /** A content-space rect as it sits on screen, or null when it's scrolled out of view. */
  screen(r: Rect): Rect | null {
    const s = { x: r.x, y: r.y - this.y, w: r.w, h: r.h };
    const v = this.view;
    if (s.y + s.h < v.y || s.y > v.y + v.h) return null;
    // only the visible part can be tapped
    const y0 = Math.max(s.y, v.y), y1 = Math.min(s.y + s.h, v.y + v.h);
    return { x: s.x, y: y0, w: s.w, h: y1 - y0 };
  }
}

/** A short message in a pill near the top. */
export class Toast {
  private msg: { text: string; t: number } | null = null;
  show(s: string) {
    this.msg = { text: s, t: 0 };
  }
  update(dt: number) {
    if (this.msg && (this.msg.t += dt) > 2.4) this.msg = null;
  }
  render(ctx: Ctx, y: number) {
    const m = this.msg;
    if (!m) return;
    const a = Math.min(1, m.t * 6) * (m.t > 2 ? (2.4 - m.t) / 0.4 : 1);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = '28px WK';
    const w = Math.min(700, Math.max(240, ctx.measureText(m.text).width + 64));
    panel(ctx, 375 - w / 2, y, w, 60, { r: 30, fill: P.cream });
    text(ctx, m.text, 375, y + 31, 28, { maxWidth: w - 40 });
    ctx.restore();
  }
}

/** Round button with a label, used for small actions. */
export function pill(ctx: Ctx, taps: Taps, id: string, x: number, y: number, w: number, h: number, label: string, o: { fill?: string; color?: string; size?: number; disabled?: boolean } = {}) {
  const r = { x, y, w, h };
  const down = taps.add(id, r, 6);
  pressIn(ctx, r, down);
  ctx.save();
  if (o.disabled) ctx.globalAlpha = 0.45;
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = o.fill ?? P.cream;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.stroke();
  text(ctx, label, x + w / 2, y + h / 2 + 1, o.size ?? 24, { bold: true, color: o.color ?? INK, maxWidth: w - 20 });
  ctx.restore();
  pressOut(ctx, down, () => roundRect(ctx, x, y, w, h, h / 2));
}

/** The coin count in a pill. */
export function coinPill(ctx: Ctx, sp: SpriteBank, x: number, y: number, coins: number, flash = 0) {
  const w = 150, h = 56;
  panel(ctx, x, y, w, h, { r: 28, shadow: false, fill: flash > 0 ? '#FCEBC0' : P.paper });
  sp.draw(ctx, 'coin', x + 32, y + 28, 0.62 * (1 + flash * 0.25));
  text(ctx, String(coins), x + w - 20, y + 29, 28, { bold: true, align: 'right' });
}

/** Header bar: a back button, the screen's name and the coin count. */
export function header(ctx: Ctx, game: Game, taps: Taps, title: string, o: { back?: string; flash?: number } = {}) {
  const top = game.safeT;
  panel(ctx, 16, top + 10, 718, 76, { r: 22 });
  const br = { x: 26, y: top + 20, w: 130, h: 56 };
  const down = taps.add('back', br, 8);
  pressIn(ctx, br, down);
  roundRect(ctx, br.x, br.y, br.w, br.h, 28);
  ctx.fillStyle = P.cream;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.stroke();
  text(ctx, `‹ ${o.back ?? '主页'}`, br.x + br.w / 2, br.y + 29, 26, { bold: true });
  pressOut(ctx, down, () => roundRect(ctx, br.x, br.y, br.w, br.h, 28));
  text(ctx, title, 375, top + 49, 34, { bold: true, maxWidth: 300 });
  coinPill(ctx, game.sprites, 574, top + 20, game.save.coins, o.flash ?? 0);
}

/** A row of paper tabs; `dots` puts a red dot on a tab. Registers `${prefix}${i}`. */
/** Draws a painted sprite centred on (x, y) with its longer side `size` long; false while it isn't loaded. */
export function iconAt(ctx: Ctx, sp: SpriteBank, name: string, x: number, y: number, size: number, alpha = 1) {
  if (!sp.has(name)) return false;
  const s = sp.get(name);
  const k = size / Math.max(s.w, s.h);
  sp.draw(ctx, name, x - (s.w / 2 - s.ax) * k, y - (s.h / 2 - s.ay) * k, k, k, 0, alpha);
  return true;
}

/** Paper tabs; `icons` are sprite names drawn beside each label when painted. */
export function tabs(ctx: Ctx, taps: Taps, prefix: string, x: number, y: number, w: number, labels: string[], sel: number, dots: boolean[] = [], icons?: { sp: SpriteBank; names: string[] }) {
  const n = labels.length;
  const tw = w / n;
  for (let i = 0; i < n; i++) {
    const on = i === sel;
    const r = { x: x + i * tw + 3, y: on ? y - 8 : y, w: tw - 6, h: on ? 70 : 62 };
    const down = taps.add(`${prefix}${i}`, r, 2);
    pressIn(ctx, r, down);
    ctx.save();
    ctx.beginPath();
    const rr = 16;
    ctx.moveTo(r.x, r.y + r.h);
    ctx.lineTo(r.x, r.y + rr);
    ctx.arcTo(r.x, r.y, r.x + rr, r.y, rr);
    ctx.lineTo(r.x + r.w - rr, r.y);
    ctx.arcTo(r.x + r.w, r.y, r.x + r.w, r.y + rr, rr);
    ctx.lineTo(r.x + r.w, r.y + r.h);
    ctx.fillStyle = on ? P.paper : P.kraftTop;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.stroke();
    const painted = icons && icons.sp.has(icons.names[i]);
    if (painted) iconAt(ctx, icons.sp, icons.names[i], r.x + 30, r.y + r.h / 2 + 1, on ? 46 : 40);
    text(ctx, labels[i], r.x + r.w / 2 + (painted ? 22 : 0), r.y + 32, on ? 28 : 25, { bold: on, color: on ? INK : P.inkSoft, maxWidth: r.w - (painted ? 60 : 14) });
    if (dots[i]) dot(ctx, r.x + r.w - 14, r.y + 12);
    ctx.restore();
    pressOut(ctx, down, () => roundRect(ctx, r.x, r.y, r.w, r.h, 12));
  }
}

/** The little red "something new" dot. */
export function dot(ctx: Ctx, x: number, y: number, r = 9) {
  ellipse(ctx, x, y, r, r);
  ctx.fillStyle = P.red;
  ctx.fill();
  ctx.strokeStyle = P.white;
  ctx.lineWidth = 2.5;
  ctx.stroke();
}

/** Dims the screen and draws a dialog panel; returns its rect. Taps outside it register as `${id}Out`. */
export function dialog(ctx: Ctx, game: Game, taps: Taps, id: string, w: number, h: number, t: number): Rect {
  const H = game.H;
  ctx.save();
  ctx.globalAlpha = Math.min(1, t * 5) * 0.55;
  ctx.fillStyle = '#1C1612';
  ctx.fillRect(0, 0, 750, H);
  ctx.restore();
  taps.add(`${id}Out`, { x: 0, y: 0, w: 750, h: H });
  const k = Math.min(1, t * 5);
  const s = 0.9 + 0.1 * (1 - Math.pow(1 - k, 3));
  const x = 375 - w / 2, y = clamp(H / 2 - h / 2, game.safeT + 20, H - h - 20);
  ctx.translate(375, y + h / 2);
  ctx.scale(s, s);
  ctx.translate(-375, -(y + h / 2));
  panel(ctx, x, y, w, h, { r: 24 });
  // a dialog swallows taps on itself
  taps.add(`${id}In`, { x, y, w, h });
  return { x, y, w, h };
}

/**
 * Where the head and neck are on each painted frog (pixels of the 416x472 PNG; the frog's anchor is
 * at (208, 392)). cx/top = middle and top of the eyes, w = head width, rot = head tilt in radians,
 * cap = top of the frog's own postman cap, neck = [x, y] of the chin where scarves hang.
 */
interface FrogHead { cx: number; top: number; w: number; rot: number; cap: number; neck: [number, number]; }
const HEADS: Record<string, FrogHead> = {
  frog_stand: { cx: 209, top: 61, w: 236, rot: 0, cap: 29, neck: [209, 196] },
  frog_happy: { cx: 209, top: 58, w: 248, rot: 0, cap: 23, neck: [209, 192] },
  frog_nervous: { cx: 207, top: 60, w: 232, rot: 0, cap: 27, neck: [207, 196] },
  frog_shock: { cx: 207, top: 55, w: 230, rot: 0, cap: 15, neck: [207, 202] },
  frog_crouch: { cx: 228, top: 117, w: 245, rot: -0.07, cap: 84, neck: [226, 250] },
  frog_jump: { cx: 211, top: 85, w: 222, rot: -0.014, cap: 55, neck: [210, 236] },
};

/**
 * How each hat sits: width as a share of the head, and how far its lower edge dips below the top of
 * the eyes (px at head width 236; scales with the head). `onCap` hats keep the frog's own cap on.
 */
const HATS: Record<string, { w: number; dip: number; dx?: number; onCap?: boolean }> = {
  hat_straw: { w: 1.12, dip: 20 },
  hat_beanie: { w: 0.88, dip: 8 },
  hat_beret: { w: 0.98, dip: 6 },
  hat_top: { w: 0.8, dip: 8 },
  hat_pilot: { w: 0.95, dip: 28 },
  hat_swim: { w: 0.74, dip: 20 },
  hat_gold: { w: 0.66, dip: 40 },
  hat_flower: { w: 0.3, dip: 0, dx: 34, onCap: true },
};

/** The painted part of each worn item as a share of its PNG [left, top, right, bottom] (the PNGs carry some empty margin). */
const VIS: Record<string, [number, number, number, number]> = {
  hat_beanie: [0.062, 0.007, 0.938, 0.993], hat_beret: [0.005, 0.02, 0.995, 0.971], hat_flower: [0.013, 0.229, 0.987, 0.762],
  hat_gold: [0.007, 0.061, 0.993, 0.939], hat_pilot: [0.006, 0.02, 0.994, 0.974], hat_straw: [0.048, 0.008, 0.952, 0.992],
  hat_swim: [0.007, 0.096, 0.993, 0.904], hat_top: [0.006, 0.161, 0.994, 0.833], neck_bow: [0.008, 0.083, 0.992, 0.917],
  neck_camera: [0.136, 0.008, 0.856, 0.992], neck_scarf: [0.113, 0.008, 0.887, 0.992],
};

/** Scarf, bow and camera: [width share of the head, drop below the chin in px]. */
const NECKS: Record<string, [number, number]> = { neck_scarf: [0.78, 12], neck_bow: [0.5, 6], neck_camera: [0.44, 8] };

/**
 * The frog in what it's wearing. The clothes are laid over the painted frog; a hat other than the
 * flower swaps in the frog drawn without its own cap (`<pose>_nc`) so two hats never stack.
 */
export function drawDressedFrog(ctx: Ctx, sp: SpriteBank, wear: Wear, pose: string, x: number, y: number, s = 1, sy = s) {
  const h = HEADS[pose] ?? HEADS.frog_stand;
  const hat = wear.hat && sp.has(wear.hat) ? HATS[wear.hat] : undefined;
  const bare = hat && !hat.onCap && sp.has(`${pose}_nc`);
  sp.draw(ctx, bare ? `${pose}_nc` : pose, x, y, s, sy);
  // PNG pixel -> screen: 2 px per concept unit, K screen units per concept unit
  const px = K / 2;
  const at = (u: number, v: number) => [x + (u - 208) * px * s, y + (v - 392) * px * sy] as const;
  if (wear.neck && sp.has(wear.neck) && NECKS[wear.neck]) {
    const [wf, drop] = NECKS[wear.neck];
    const [nx, ny] = at(h.neck[0], h.neck[1] + drop * (h.w / 236));
    putOn(ctx, sp, wear.neck, nx, ny, h.w * wf * px * s, 0, false);
  }
  if (hat && wear.hat) {
    const k = h.w / 236;
    const [hx, hy] = at(h.cx + (hat.dx ?? 0) * k, (hat.onCap ? h.cap + 34 * k : h.top + hat.dip * k));
    putOn(ctx, sp, wear.hat, hx, hy, h.w * hat.w * px * s, h.rot, true);
  }
}

/** Draws a worn item whose painted part is `width` screen units wide, its bottom edge (hats) or top edge (neckwear) at (x, y). */
function putOn(ctx: Ctx, sp: SpriteBank, name: string, x: number, y: number, width: number, rot: number, bottom: boolean) {
  const b = sp.bounds(name);
  const v = VIS[name] ?? [0, 0, 1, 1];
  const bw = (b[2] - b[0]) * K, bh = (b[3] - b[1]) * K;
  const k = width / (bw * (v[2] - v[0]));
  ctx.save();
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  // sprite anchor (the origin of its bounds) relative to the contact point
  const cx = (v[0] + v[2]) / 2, cy = bottom ? v[3] : v[1];
  sp.draw(ctx, name, (-b[0] * K - bw * cx) * k, (-b[1] * K - bh * cy) * k, k);
  ctx.restore();
}

/** Short date like 10月22日. */
export const shortDate = (t: number) => {
  const d = new Date(t);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
};
