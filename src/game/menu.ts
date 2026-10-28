// Shared pieces for the screens outside work (home page, HQ hall, the frog's home, the shop):
// tap targets, a scrolling list, the header bar, paper tabs, dialogs, round icon buttons and the
// dressed-up frog. Pictograms come from the kit's icon set (src/art/kit/icons.ts).
import { grainFill, icon, ICON_NAMES, ribbon, shade, tint, type IconName } from '../art/kit';
import { INK, P } from '../art/palette';
import { K, type SpriteBank } from '../art/sprites';
import { ellipse, font, hit, panel, pressIn, pressOut, roundRect, text, type Rect } from '../art/ui';
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

/** A short message in a pill near the top, with an optional pictogram before it. */
export class Toast {
  private msg: { text: string; t: number; icon?: IconName; secs: number } | null = null;
  /** Shows `s` for `secs` seconds (the last 0.4 of them fading out). */
  show(s: string, icon?: IconName, secs = 2.4) {
    this.msg = { text: s, t: 0, icon, secs };
  }
  update(dt: number) {
    if (this.msg && (this.msg.t += dt) > this.msg.secs) this.msg = null;
  }
  render(ctx: Ctx, y: number) {
    const m = this.msg;
    if (!m) return;
    const a = Math.min(1, m.t * 6) * (m.t > m.secs - 0.4 ? (m.secs - m.t) / 0.4 : 1);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = font(28);
    const iw = m.icon ? 44 : 0;
    const w = Math.min(700, Math.max(240, ctx.measureText(m.text).width + 64 + iw));
    // it drops in from a little higher
    const yy = y - (1 - Math.min(1, m.t * 6)) * 12;
    panel(ctx, 375 - w / 2, yy, w, 60, { r: 30, fill: P.cream, grain: true });
    if (m.icon) icon(ctx, m.icon, 375 - w / 2 + 40, yy + 30, 36);
    text(ctx, m.text, 375 + iw / 2, yy + 31, 28, { maxWidth: w - 40 - iw });
    ctx.restore();
  }
}

/** Round button with a label (or a pictogram and a label), used for small actions. */
export function pill(ctx: Ctx, taps: Taps, id: string, x: number, y: number, w: number, h: number, label: string, o: { fill?: string; color?: string; size?: number; disabled?: boolean; icon?: IconName } = {}) {
  const r = { x, y, w, h };
  const down = taps.add(id, r, 6);
  pressIn(ctx, r, down);
  ctx.save();
  if (o.disabled) ctx.globalAlpha *= 0.45;
  const fill = o.fill ?? P.cream;
  roundRect(ctx, x, y + 3, w, h, h / 2);
  ctx.fillStyle = shade(fill, 0.16);
  ctx.fill();
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = fill;
  ctx.fill();
  grainFill(ctx, 0.3);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.stroke();
  const size = o.size ?? 24;
  if (o.icon) {
    const is = Math.min(h * 0.62, size * 1.5);
    ctx.font = font(size, true);
    const tw = label ? Math.min(ctx.measureText(label).width, w - is - 34) : 0;
    const left = x + w / 2 - (is + (label ? 6 + tw : 0)) / 2;
    icon(ctx, o.icon, left + is / 2, y + h / 2, is);
    if (label) text(ctx, label, left + is + 6 + tw / 2, y + h / 2 + 1, size, { bold: true, color: o.color ?? INK, maxWidth: w - is - 34 });
  } else text(ctx, label, x + w / 2, y + h / 2 + 1, size, { bold: true, color: o.color ?? INK, maxWidth: w - 20 });
  ctx.restore();
  pressOut(ctx, down, () => roundRect(ctx, x, y, w, h, h / 2));
}

/**
 * Round icon button centred on (cx, cy), `d` across (speaker, pause, close…). Its tap area is padded
 * to at least 88 units. `dot` adds the red "something new" dot. Returns whether it's held down.
 */
export function iconButton(ctx: Ctx, taps: Taps, id: string, cx: number, cy: number, d: number, name: IconName, o: { fill?: string; dot?: boolean; disabled?: boolean } = {}) {
  const r = { x: cx - d / 2, y: cy - d / 2, w: d, h: d };
  const down = taps.add(id, r, Math.max(6, (88 - d) / 2));
  const fill = o.fill ?? P.cream;
  const circle = (y: number, rad: number) => {
    ctx.beginPath();
    ctx.arc(cx, y, rad, 0, Math.PI * 2);
  };
  pressIn(ctx, r, down);
  ctx.save();
  if (o.disabled) ctx.globalAlpha *= 0.5;
  circle(cy + 4, d / 2);
  ctx.fillStyle = shade(fill, 0.2);
  ctx.fill();
  circle(cy, d / 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = tint(fill, 0.4);
  ctx.globalAlpha *= 0.55;
  ctx.beginPath();
  ctx.ellipse(cx - d * 0.1, cy - d * 0.2, d * 0.3, d * 0.16, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  circle(cy, d / 2);
  grainFill(ctx, 0.3);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.2;
  ctx.stroke();
  circle(cy, d / 2 - 6);
  ctx.setLineDash([5, 4]);
  ctx.strokeStyle = P.kraft;
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.setLineDash([]);
  icon(ctx, name, cx, cy, d * 0.56, { faded: o.disabled });
  ctx.restore();
  if (o.dot) dot(ctx, cx + d * 0.36, cy - d * 0.36);
  pressOut(ctx, down, () => circle(cy, d / 2));
  return down;
}

/**
 * The coin count in a pill, `w` wide (150 by default; six digits still fit). With `right` the pill's
 * right edge is at x and it grows to the left to fit the number.
 */
export function coinPill(ctx: Ctx, _sp: SpriteBank, x: number, y: number, coins: number, flash = 0, o: { w?: number; right?: boolean } = {}) {
  const h = 56, s = String(coins);
  ctx.save();
  ctx.font = font(28, true);
  const tw = ctx.measureText(s).width;
  ctx.restore();
  const w = o.w ?? (o.right ? Math.max(150, tw + 80) : 150);
  const left = o.right ? x - w : x;
  panel(ctx, left, y, w, h, { r: 28, shadow: false, fill: flash > 0 ? '#FCEBC0' : P.paper, grain: true });
  icon(ctx, 'coin', left + 31, y + 28, 38 * (1 + flash * 0.25));
  text(ctx, s, left + w - 20, y + 29, 28, { bold: true, align: 'right', maxWidth: w - 74 });
}

/**
 * Header bar, the same on every screen: a back button, the screen's name (with an optional pictogram)
 * and the coin count, which grows to the left for big numbers.
 */
export function header(ctx: Ctx, game: Game, taps: Taps, title: string, o: { back?: string; flash?: number; icon?: IconName } = {}) {
  const top = game.safeT;
  panel(ctx, 16, top + 10, 718, 76, { r: 22, grain: true });
  const br = { x: 26, y: top + 20, w: 132, h: 56 };
  const down = taps.add('back', br, 10);
  pressIn(ctx, br, down);
  roundRect(ctx, br.x, br.y + 3, br.w, br.h, 28);
  ctx.fillStyle = shade(P.cream, 0.16);
  ctx.fill();
  roundRect(ctx, br.x, br.y, br.w, br.h, 28);
  ctx.fillStyle = P.cream;
  ctx.fill();
  grainFill(ctx, 0.3);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.stroke();
  icon(ctx, 'back', br.x + 30, br.y + 28, 30);
  text(ctx, o.back ?? '主页', br.x + 80, br.y + 29, 26, { bold: true, maxWidth: 82 });
  pressOut(ctx, down, () => roundRect(ctx, br.x, br.y, br.w, br.h, 28));
  if (o.icon) {
    ctx.save();
    ctx.font = font(34, true);
    const tw = Math.min(ctx.measureText(title).width, 250);
    ctx.restore();
    icon(ctx, o.icon, 375 - tw / 2 - 2, top + 48, 44);
    text(ctx, title, 375 + 24, top + 49, 34, { bold: true, maxWidth: 250 });
  } else text(ctx, title, 375, top + 49, 34, { bold: true, maxWidth: 300 });
  coinPill(ctx, game.sprites, 724, top + 20, game.save.coins, o.flash ?? 0, { right: true });
}

/** Draws a painted sprite centred on (x, y) with its longer side `size` long; false while it isn't loaded. */
export function iconAt(ctx: Ctx, sp: SpriteBank, name: string, x: number, y: number, size: number, alpha = 1) {
  if (!sp.has(name)) return false;
  const s = sp.get(name);
  const k = size / Math.max(s.w, s.h);
  sp.draw(ctx, name, x - (s.w / 2 - s.ax) * k, y - (s.h / 2 - s.ay) * k, k, k, 0, alpha);
  return true;
}

/** The painted tab and category pictures, now drawn from the icon set. */
const TAB_CODE: Record<string, IconName> = {
  tab_record: 'clipboard', tab_log: 'logbook', tab_album: 'album', tab_honour: 'trophy', tab_news: 'newspaper',
  cat_gear: 'bag', cat_hat: 'hat', cat_neck: 'scarf', cat_deco: 'sofa', cat_frame: 'frame',
};
const isIcon = (n: string): n is IconName => (ICON_NAMES as string[]).includes(n);

/** The paper sheet that tabs sit on. */
export function sheet(ctx: Ctx, x: number, y: number, w: number, h: number, fill: string = P.paper) {
  roundRect(ctx, x, y, w, h, 18);
  ctx.fillStyle = fill;
  ctx.fill();
  grainFill(ctx, 0.35);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.2;
  ctx.stroke();
}

/**
 * Folder tabs along the top of a sheet; `dots` puts a red dot on a tab. Registers `${prefix}${i}`.
 * `icons.names` are icon names (or the old painted tab_* / cat_* names, which map to icons).
 * With `o.sheet` the tabs draw the sheet under them as well (its top at y + 58, `h` tall) and the chosen
 * tab joins it like a real folder tab; without it the caller draws its own sheet afterwards.
 */
export function tabs(
  ctx: Ctx, taps: Taps, prefix: string, x: number, y: number, w: number, labels: string[], sel: number, dots: boolean[] = [],
  icons?: { sp?: SpriteBank; names: string[] }, o: { sheet?: { h: number; x?: number; w?: number; fill?: string } } = {},
) {
  const n = labels.length;
  const tw = w / n;
  const rectOf = (i: number) => {
    const on = i === sel;
    return { x: x + i * tw + 3, y: on ? y - 8 : y, w: tw - 6, h: on ? (o.sheet ? 66 : 70) : 62 };
  };
  // a folder tab: sides leaning in a little, round top corners, open at the bottom
  const shape = (r: Rect, close: boolean) => {
    const rr = 16, lean = 4;
    ctx.beginPath();
    ctx.moveTo(r.x, r.y + r.h);
    ctx.lineTo(r.x + lean * 0.4, r.y + rr);
    ctx.arcTo(r.x + lean, r.y, r.x + rr + lean, r.y, rr);
    ctx.lineTo(r.x + r.w - rr - lean, r.y);
    ctx.arcTo(r.x + r.w - lean, r.y, r.x + r.w - lean * 0.4, r.y + rr, rr);
    ctx.lineTo(r.x + r.w, r.y + r.h);
    if (close) ctx.closePath();
  };
  const drawTab = (i: number) => {
    const on = i === sel;
    const r = rectOf(i);
    const down = taps.add(`${prefix}${i}`, r, 2);
    pressIn(ctx, r, down);
    ctx.save();
    shape(r, true);
    ctx.fillStyle = on ? (o.sheet?.fill ?? P.paper) : P.kraftTop;
    ctx.fill();
    grainFill(ctx, on ? 0.35 : 0.45);
    // the chosen tab runs into the sheet, hiding the sheet's edge under it
    if (on && o.sheet) ctx.fillRect(r.x + 1.2, r.y + r.h - 6, r.w - 2.4, 9);
    shape(r, false);
    ctx.strokeStyle = INK;
    ctx.lineWidth = on ? 2.2 : 2;
    ctx.lineJoin = 'round';
    ctx.stroke();
    // the others sit a little in the sheet's shade
    if (!on) {
      ctx.fillStyle = 'rgba(74,59,48,0.08)';
      ctx.fillRect(r.x + 2, r.y + r.h - 12, r.w - 4, 12);
    }
    const name = icons?.names[i];
    const code = name ? (isIcon(name) ? name : TAB_CODE[name]) : undefined;
    const size = on ? 46 : 40;
    const cy = r.y + (on ? 34 : 31);
    let shown = false;
    if (code) {
      icon(ctx, code, r.x + 32, cy, size);
      shown = true;
    } else if (name && icons?.sp) shown = iconAt(ctx, icons.sp, name, r.x + 30, cy, size);
    text(ctx, labels[i], r.x + r.w / 2 + (shown ? 22 : 0), cy + 1, on ? 28 : 25, { bold: on, color: on ? INK : P.inkSoft, maxWidth: r.w - (shown ? 64 : 14) });
    if (dots[i]) dot(ctx, r.x + r.w - 14, r.y + 12);
    ctx.restore();
    pressOut(ctx, down, () => roundRect(ctx, r.x, r.y, r.w, r.h, 12));
  };
  for (let i = 0; i < n; i++) if (i !== sel) drawTab(i);
  if (o.sheet) sheet(ctx, o.sheet.x ?? x - 8, y + 58, o.sheet.w ?? w + 16, o.sheet.h, o.sheet.fill);
  if (sel >= 0 && sel < n) drawTab(sel);
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

/**
 * Dims the screen and draws a dialog panel; returns its rect. Taps outside it register as `${id}Out`.
 * `o.title` hangs a ribbon banner with the dialog's name across its top edge.
 */
export function dialog(ctx: Ctx, game: Game, taps: Taps, id: string, w: number, h: number, t: number, o: { title?: string } = {}): Rect {
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
  panel(ctx, x, y, w, h, { r: 24, grain: true });
  if (o.title) ribbon(ctx, 375, y + 2, Math.min(w - 160, 380), o.title, { h: 54 });
  // a dialog swallows taps on itself
  taps.add(`${id}In`, { x, y, w, h });
  return { x, y, w, h };
}

/**
 * Where the head and neck are on each painted frog (pixels of the 416x472 PNG; the frog's anchor is
 * at (208, 392)). cx/top = middle and top of the eyes, w = head width, rot = head tilt in radians,
 * cap = top of the frog's own postman cap, dome = top of the bare head between the eyes (in the `_nc`
 * drawings), neck = [x, y] of the chin where scarves hang.
 */
interface FrogHead { cx: number; top: number; w: number; rot: number; cap: number; dome: number; neck: [number, number]; }
const HEADS: Record<string, FrogHead> = {
  frog_stand: { cx: 209, top: 61, w: 236, rot: 0, cap: 29, dome: 65, neck: [209, 196] },
  frog_happy: { cx: 209, top: 58, w: 248, rot: 0, cap: 23, dome: 62, neck: [209, 192] },
  frog_nervous: { cx: 207, top: 60, w: 232, rot: 0, cap: 27, dome: 64, neck: [207, 196] },
  frog_shock: { cx: 207, top: 55, w: 230, rot: 0, cap: 15, dome: 59, neck: [207, 202] },
  frog_crouch: { cx: 228, top: 117, w: 245, rot: -0.07, cap: 84, dome: 121, neck: [226, 250] },
  frog_jump: { cx: 211, top: 85, w: 222, rot: -0.014, cap: 55, dome: 89, neck: [210, 236] },
};

/**
 * How each hat sits: width as a share of the head, and how far its lower edge dips below the top of
 * the eyes (px at head width 236; scales with the head). A hat whose ear flaps hang below the crown
 * gives `seat`, the line (share of its PNG height) where the inside of the crown rests on the head:
 * that line goes `dip` px below the top of the bare head instead. `onCap` hats keep the frog's own cap on.
 */
const HATS: Record<string, { w: number; dip: number; seat?: number; dx?: number; onCap?: boolean }> = {
  hat_straw: { w: 1.12, dip: 20 },
  hat_beanie: { w: 0.88, dip: 8 },
  hat_beret: { w: 0.98, dip: 6 },
  hat_top: { w: 0.8, dip: 8 },
  hat_pilot: { w: 1.1, dip: 4, seat: 0.553 },
  hat_swim: { w: 0.74, dip: 20 },
  hat_gold: { w: 0.66, dip: 40 },
  hat_flower: { w: 0.3, dip: 0, dx: 34, onCap: true },
};

/** The painted part of each worn item as a share of its PNG [left, top, right, bottom] (the PNGs carry some empty margin). */
const VIS: Record<string, [number, number, number, number]> = {
  hat_beanie: [0.062, 0.007, 0.938, 0.993], hat_beret: [0.005, 0.02, 0.995, 0.971], hat_flower: [0.013, 0.229, 0.987, 0.762],
  hat_gold: [0.007, 0.061, 0.993, 0.939], hat_pilot: [0.066, 0.021, 0.934, 0.716], hat_straw: [0.048, 0.008, 0.952, 0.992],
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
    putOn(ctx, sp, wear.neck, nx, ny, h.w * wf * px * s, 0, 'top');
  }
  if (hat && wear.hat) {
    const k = h.w / 236;
    const y0 = hat.onCap ? h.cap + 34 * k : hat.seat ? h.dome + hat.dip * k : h.top + hat.dip * k;
    const [hx, hy] = at(h.cx + (hat.dx ?? 0) * k, y0);
    putOn(ctx, sp, wear.hat, hx, hy, h.w * hat.w * px * s, h.rot, hat.seat ?? 'bottom');
  }
}

/**
 * Draws a worn item whose painted part is `width` screen units wide, with its bottom edge (hats), top
 * edge (neckwear) or the given line (share of its PNG height) at (x, y).
 */
function putOn(ctx: Ctx, sp: SpriteBank, name: string, x: number, y: number, width: number, rot: number, edge: 'top' | 'bottom' | number) {
  const b = sp.bounds(name);
  const v = VIS[name] ?? [0, 0, 1, 1];
  const bw = (b[2] - b[0]) * K, bh = (b[3] - b[1]) * K;
  const k = width / (bw * (v[2] - v[0]));
  ctx.save();
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  // sprite anchor (the origin of its bounds) relative to the contact point
  const cx = (v[0] + v[2]) / 2, cy = edge === 'top' ? v[1] : edge === 'bottom' ? v[3] : edge;
  sp.draw(ctx, name, (-b[0] * K - bw * cx) * k, (-b[1] * K - bh * cy) * k, k);
  ctx.restore();
}

/** Short date like 10月22日. */
export const shortDate = (t: number) => {
  const d = new Date(t);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
};
