import { INK, P } from '../art/palette';
import { button, ellipse, hit, panel, pressIn, pressOut, roundRect, text, type Rect } from '../art/ui';
import { clamp, easeOutBack, easeOutCubic, lerp } from '../engine/math';
import type { Ctx } from '../platform/types';
import { CHAPTERS, DAYS, DAYS_PER_CHAPTER, chapterOf } from './config';
import type { Game, Scene } from './game';
import { PlayScene } from './play';
import { STAMP_GLYPHS, STAMP_NAMES, stampRules } from './progress';
import { HubScene } from './hub';

/** A stop on the route map: a big lily pad in the river, with a signpost underneath. */
interface Stop { day: number; x: number; y: number }

const HOP_T = 0.45;
/** Vertical distance between neighbouring stops. */
const GAP = 250;
/** A drag longer than this is a scroll, not a tap. */
const DRAG_MIN = 12;

/**
 * The route map: chapter one's river (春 · 柳湾), one stop per day from the bottom up, each showing
 * its best grade and the three stamps collected. Tap a stop to see what it asks for and start it.
 */
export class MapScene implements Scene {
  readonly id = 'map';
  private t = 0;
  private sel: number;
  /** The chapter under the middle of the screen (the ribbon names it). */
  private view: number;
  /** How far the whole river has been pulled down; 0 puts day 1 near the bottom. */
  private off = 0;
  private offV = 0;
  private drag: { id: number; y0: number; off0: number; y: number; moved: boolean } | null = null;
  private lastY = 0;
  /** The frog hopping from one stop to another. */
  private hop: { from: number; t: number } | null = null;
  private stops: Stop[] = [];
  private btns: { id: string; rect: Rect }[] = [];
  private pressed: string | null = null;
  private toast: { text: string; t: number } | null = null;
  private sheetT = 0;

  constructor(private game: Game, day?: number) {
    this.sel = clamp(day ?? game.save.day, 1, this.unlocked);
    this.view = chapterOf(this.sel);
    this.off = this.centreOn(this.sel);
    game.audio.setMusic('bgm_title');
    game.tm.day = null;
    game.tm.log('map', { sel: this.sel, unlocked: this.unlocked });
  }

  private get unlocked() {
    return clamp(this.game.save.day, 1, DAYS.length);
  }

  /** Stop 0's anchor y and the scroll range, from the current screen. */
  private get y0() {
    return this.game.H - this.game.safeB - 24 - 300 - 120;
  }

  private get maxOff() {
    return (DAYS.length - 1) * GAP + this.game.safeT + 350 - this.y0;
  }

  private centreOn(day: number) {
    const mid = (this.game.safeT + 130 + this.y0 + 100) / 2;
    return clamp(mid - this.y0 + (day - 1) * GAP, -30, this.maxOff);
  }

  wheelBy(dy: number) {
    this.off = clamp(this.off - dy, -30, this.maxOff);
    this.offV = 0;
  }

  move(_x: number, y: number, id: number) {
    const d = this.drag;
    if (!d || d.id !== id) return;
    if (!d.moved && Math.abs(y - d.y0) > DRAG_MIN) d.moved = true;
    if (d.moved) {
      this.off = clamp(d.off0 + (y - d.y0), -30, this.maxOff);
      this.offV = (y - this.lastY) * 60;
      this.pressed = null;
    }
    this.lastY = y;
  }

  update(dt: number) {
    this.t += dt;
    if (!this.drag && Math.abs(this.offV) > 5) {
      this.off = clamp(this.off + this.offV * dt, -30, this.maxOff);
      this.offV *= Math.pow(0.04, dt);
    }
    this.sheetT += dt;
    if (this.hop && (this.hop.t += dt) >= HOP_T) this.hop = null;
    if (this.toast && (this.toast.t += dt) > 2) this.toast = null;
  }

  down(x: number, y: number, id = 0) {
    this.drag = { id, y0: y, off0: this.off, y, moved: false };
    this.lastY = y;
    this.offV = 0;
    for (const b of this.btns) if (hit(b.rect, x, y, 6)) this.pressed = b.id;
    if (this.pressed) return;
    const s = this.stopAt(x, y);
    if (s) this.pressed = `stop${s.day}`;
  }

  private stopAt(x: number, y: number) {
    return this.stops.find((s) => Math.hypot(x - s.x, (y - s.y) * 1.2) <= 90 || hit({ x: s.x - 115, y: s.y + 26, w: 230, h: 76 }, x, y));
  }

  up(x: number, y: number, pid = 0) {
    const moved = this.drag?.moved;
    if (this.drag?.id === pid) this.drag = null;
    const id = this.pressed;
    this.pressed = null;
    if (moved) return;
    if (id?.startsWith('stop')) {
      const s = this.stopAt(x, y);
      if (s && `stop${s.day}` === id) this.select(s.day);
      return;
    }
    const b = this.btns.find((b) => b.id === id && hit(b.rect, x, y, 6));
    if (!b) return;
    const au = this.game.audio;
    this.game.tm.log(b.id === 'go' ? 'map_go' : 'map_back', { sel: this.sel, sec: Math.round(this.t) });
    if (b.id === 'back') {
      au.play('ui_back');
      this.game.go(new HubScene(this.game));
    } else if (b.id === 'go') {
      au.play('ui_confirm');
      this.game.go(new PlayScene(this.game, this.sel), true);
    }
  }

  private select(day: number) {
    const au = this.game.audio;
    if (day > this.unlocked) {
      this.game.tm.log('map_locked', { day });
      au.play('ui_error');
      this.toast = { text: `先通过第${day - 1}天，才能解锁这一站`, t: 0 };
      return;
    }
    if (day === this.sel) return;
    this.hop = { from: this.sel, t: 0 };
    this.sel = day;
    this.sheetT = 0;
    au.play('jump_release', { volume: 0.6 });
    au.play('land_pad', { delay: HOP_T * 0.9, volume: 0.6 });
  }

  render(ctx: Ctx) {
    const H = this.game.H;
    const sp = this.game.sprites;
    const top = this.game.safeT;
    const sheetH = 300;
    const sheetTop = H - this.game.safeB - 24 - sheetH;

    // stops zigzag up the river, day 1 at the bottom; the whole river scrolls
    const y0 = this.y0;
    this.stops = DAYS.map((d, i) => ({ day: d.day, x: i % 2 ? 530 : 220, y: y0 - i * GAP + this.off }));
    this.view = chapterOf(clamp(Math.round((y0 + this.off - H * 0.4) / GAP), 0, DAYS.length - 1) + 1);

    // spring meadow, tiled (every other tile flipped so the seams vanish) and drifting with the river
    if (sp.has('map_meadow')) {
      const m = sp.get('map_meadow');
      const k = Math.max(750 / m.w, H / m.h);
      const th = m.h * k;
      const par = this.off * 0.6;
      const n0 = Math.floor(-par / th) - 1;
      for (let n = n0; n <= n0 + Math.ceil(H / th) + 2; n++) {
        const ty = n * th + par;
        if (ty > H || ty + th < 0) continue;
        ctx.save();
        if (((n % 2) + 2) % 2) {
          ctx.translate(0, ty + th);
          ctx.scale(1, -1);
          sp.draw(ctx, 'map_meadow', 375 - (m.w * k) / 2, 0, k);
        } else sp.draw(ctx, 'map_meadow', 375 - (m.w * k) / 2, ty, k);
        ctx.restore();
      }
    } else {
      ctx.fillStyle = '#E3E6C0';
      ctx.fillRect(0, 0, 750, H);
      ctx.fillStyle = P.bankDeep;
      for (let i = 0; i < 70; i++) {
        const x = (i * 263) % 750, y = (((i * 409) % H) + this.off * 0.6 + H * 10) % H;
        ellipse(ctx, x, y, 5 + (i % 3) * 2, 3 + (i % 2) * 2);
        ctx.fill();
      }
    }

    const pts: [number, number][] = [[300, this.stops[0].y + 330], ...this.stops.map((s): [number, number] => [s.x, s.y]), [375, this.stops[this.stops.length - 1].y - 330]];
    this.drawRiver(ctx, pts);

    // willows along the banks, it's spring in 柳湾
    for (let i = 0; i < DAYS.length; i += 2) this.willow(ctx, i % 4 ? 690 : 66, this.stops[i].y - 90, 0.85 + (i % 3) * 0.08);

    const tint = CHAPTERS[this.view].tint;
    if (tint) {
      ctx.fillStyle = tint;
      ctx.fillRect(0, 0, 750, H);
    }

    // chapter banners between chapters; the first chapter still locked waits in the mist
    const firstLocked = chapterOf(this.unlocked) + 1;
    for (let c = 1; c < CHAPTERS.length; c++) {
      const by = (this.stops[c * DAYS_PER_CHAPTER - 1].y + this.stops[c * DAYS_PER_CHAPTER].y) / 2;
      if (by < -120 || by > H + 120) continue;
      const title = `第${'一二三四五六'[c]}章 · ${CHAPTERS[c].title}`;
      if (c === firstLocked) this.drawFog(ctx, by, title);
      else if (c < firstLocked) text(ctx, title, 375, by, 28, { bold: true, color: P.inkSoft });
    }

    const unlocked = this.unlocked;
    this.stops.forEach((s, i) => {
      if (s.y < -140 || s.y > H + 140) return;
      const open = s.day <= unlocked;
      const bob = Math.sin(this.t * 1.6 + i) * 2;
      const down = this.pressed === `stop${s.day}`;
      pressIn(ctx, { x: s.x - 115, y: s.y - 70, w: 230, h: 172 }, down);
      ctx.save();
      if (!open) ctx.globalAlpha = 0.55;
      sp.draw(ctx, `lily${i % 4}`, s.x, s.y + bob, 1.05);
      ctx.restore();
      if (s.day === this.sel) {
        ctx.save();
        ctx.setLineDash([12, 8]);
        ctx.lineDashOffset = -this.t * 30;
        ctx.strokeStyle = P.gold;
        ctx.lineWidth = 4;
        ellipse(ctx, s.x, s.y + bob, 92, 58);
        ctx.stroke();
        ctx.restore();
      }
      this.drawSign(ctx, s, open);
      pressOut(ctx, down, () => roundRect(ctx, s.x - 115, s.y + 30, 230, 72, 14));
    });

    // the frog on the chosen stop, hopping over when another is picked
    const to = this.stops.find((s) => s.day === this.sel);
    if (to) {
    let fx = to.x, fy = to.y - 8, z = 0, name = 'frog_happy';
    if (this.hop) {
      const from = this.stops.find((s) => s.day === this.hop!.from) ?? to;
      const k = easeOutCubic(this.hop.t / HOP_T);
      fx = lerp(from.x, to.x, k);
      fy = lerp(from.y, to.y, k) - 8;
      z = Math.sin(k * Math.PI) * 120;
      name = 'frog_jump';
    } else z = Math.max(0, Math.sin(this.t * 3)) * 8;
    ctx.save();
    ctx.globalAlpha = 0.35;
    ellipse(ctx, fx + 4, fy + 4, 34, 10);
    ctx.fillStyle = P.lilyDeep;
    ctx.fill();
    ctx.restore();
    sp.draw(ctx, name, fx, fy - z, 0.85, 0.85);
    }

    // header
    this.btns = [];
    panel(ctx, 16, top + 10, 718, 76, { r: 22 });
    const br = { x: 26, y: top + 20, w: 120, h: 56 };
    this.btns.push({ id: 'back', rect: br });
    pressIn(ctx, br, this.pressed === 'back');
    roundRect(ctx, 26, top + 20, 120, 56, 28);
    ctx.fillStyle = P.cream;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.stroke();
    text(ctx, '‹ 主页', 86, top + 49, 26, { bold: true });
    pressOut(ctx, this.pressed === 'back', () => roundRect(ctx, 26, top + 20, 120, 56, 28));
    text(ctx, '路线图', 375, top + 49, 34, { bold: true });
    sp.draw(ctx, 'coin', 618, top + 48, 0.6);
    text(ctx, String(this.game.save.coins), 696, top + 49, 26, { bold: true, align: 'right' });
    // chapter ribbon
    const ry = top + 116;
    ctx.save();
    ctx.translate(375, ry);
    ctx.rotate(-0.015);
    ctx.fillStyle = P.orange;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    for (const d of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(d * 150, -18);
      ctx.lineTo(d * 196, -18);
      ctx.lineTo(d * 180, 2);
      ctx.lineTo(d * 196, 22);
      ctx.lineTo(d * 150, 22);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    roundRect(ctx, -170, -24, 340, 48, 8);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.translate(375, ry);
    ctx.rotate(-0.015);
    text(ctx, `第${'一二三四五六'[this.view]}章 · ${CHAPTERS[this.view].title}`, 0, 1, 26, { bold: true, color: P.white, maxWidth: 330 });
    ctx.restore();

    this.drawSheet(ctx, sheetTop, sheetH);

    if (this.toast) {
      const tt = this.toast.t;
      ctx.save();
      ctx.globalAlpha = Math.min(1, tt * 6) * (tt > 1.6 ? (2 - tt) / 0.4 : 1);
      ctx.font = '26px WK';
      const w = Math.max(240, ctx.measureText(this.toast.text).width + 60);
      panel(ctx, 375 - w / 2, sheetTop - 76, w, 56, { r: 28, fill: P.cream });
      text(ctx, this.toast.text, 375, sheetTop - 47, 26);
      ctx.restore();
    }
  }

  /** The river as one thick ribbon through the stops. */
  private drawRiver(ctx: Ctx, pts: [number, number][]) {
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length - 1; i++) {
        const [x, y] = pts[i], [nx, ny] = pts[i + 1];
        ctx.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2);
      }
      const l = pts[pts.length - 1];
      ctx.lineTo(l[0], l[1]);
    };
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    path();
    ctx.strokeStyle = 'rgba(74,59,48,0.55)';
    ctx.lineWidth = 196;
    ctx.stroke();
    path();
    ctx.strokeStyle = P.teal;
    ctx.lineWidth = 190;
    ctx.stroke();
    path();
    ctx.strokeStyle = P.tealLight;
    ctx.lineWidth = 150;
    ctx.globalAlpha = 0.35;
    ctx.stroke();
    path();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = P.white;
    ctx.lineWidth = 3;
    ctx.setLineDash([26, 34]);
    ctx.lineDashOffset = this.t * 30;
    ctx.stroke();
    ctx.restore();
  }

  private willow(ctx: Ctx, x: number, y: number, s: number) {
    const sp = this.game.sprites;
    if (sp.has('willow')) {
      // the painted tree sways as a whole, about the foot of its trunk
      ctx.save();
      ctx.translate(x, y + 60 * s);
      ctx.rotate(Math.sin(this.t * 1.3 + x) * 0.025);
      sp.draw(ctx, 'willow', 0, -60 * s, s);
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.strokeStyle = INK;
    ctx.lineCap = 'round';
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(0, 60);
    ctx.quadraticCurveTo(-6, 10, 4, -40);
    ctx.stroke();
    ctx.strokeStyle = P.woodDeep;
    ctx.lineWidth = 6;
    ctx.stroke();
    ellipse(ctx, 2, -52, 54, 34);
    ctx.fillStyle = '#A9C47F';
    ctx.fill();
    ctx.strokeStyle = 'rgba(74,59,48,0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();
    // drooping strands, swaying a little
    ctx.strokeStyle = '#7FA35A';
    ctx.lineWidth = 3;
    for (let i = 0; i < 9; i++) {
      const sx = -46 + i * 11.5;
      const sway = Math.sin(this.t * 1.3 + i * 0.7 + x) * 5;
      ctx.beginPath();
      ctx.moveTo(sx, -50);
      ctx.quadraticCurveTo(sx + sway, -10, sx + sway * 1.6, 18 + (i % 3) * 10);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Clouds over the river's top end, where the next chapter will be. */
  private drawFog(ctx: Ctx, y: number, title: string) {
    ctx.save();
    for (let i = 0; i < 9; i++) {
      const x = 40 + i * 84 + Math.sin(this.t * 0.4 + i) * 10;
      ellipse(ctx, x, y + (i % 2) * 22 - 6, 80, 46);
      ctx.fillStyle = 'rgba(251,247,238,0.92)';
      ctx.fill();
    }
    ctx.restore();
    text(ctx, title, 375, y - 4, 26, { bold: true, color: P.inkSoft });
    text(ctx, '雾还没散，敬请期待', 375, y + 30, 22, { color: P.inkSoft });
  }

  /** The signpost under a stop: day and name, best grade, and the three stamps (or a lock). */
  private drawSign(ctx: Ctx, s: Stop, open: boolean) {
    const cfg = DAYS[s.day - 1];
    const x = s.x - 115, y = s.y + 30, w = 230, h = 72;
    const sel = s.day === this.sel;
    panel(ctx, x, y, w, h, { r: 14, fill: !open ? P.paperShade : sel ? P.cream : P.paper, shadow: false, stitch: sel ? P.orange : undefined });
    text(ctx, `第${s.day}天 · ${cfg.name}`, s.x, y + 22, 22, { bold: true, maxWidth: w - 20 });
    if (!open) {
      this.lock(ctx, s.x - 64, y + 50);
      text(ctx, '未解锁', s.x + 6, y + 51, 20, { color: P.inkSoft });
      return;
    }
    const got = this.game.save.stamps[s.day] ?? [];
    for (let i = 0; i < 3; i++) drawStamp(ctx, s.x - 72 + i * 36, y + 50, 14, !!got[i], i + 1);
    const best = this.game.save.best[s.day];
    if (best) {
      ctx.save();
      ctx.translate(s.x + 74, y + 48);
      ctx.rotate(-0.2);
      ctx.strokeStyle = P.red;
      ctx.lineWidth = 2;
      ellipse(ctx, 0, 0, 19, 19);
      ctx.stroke();
      text(ctx, best, 0, 1, 24, { bold: true, color: P.red });
      ctx.restore();
    }
  }

  private lock(ctx: Ctx, x: number, y: number) {
    ctx.save();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y - 6, 7, Math.PI, 0);
    ctx.stroke();
    roundRect(ctx, x - 11, y - 6, 22, 17, 4);
    ctx.fillStyle = P.kraft;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  /** The chosen day: what it's about, how to earn each stamp, and the start button. */
  private drawSheet(ctx: Ctx, y: number, h: number) {
    const cfg = DAYS[this.sel - 1];
    const k = easeOutBack(Math.min(1, this.sheetT * 4));
    ctx.save();
    ctx.translate(0, (1 - k) * 40);
    panel(ctx, 24, y, 702, h, { r: 24 });
    text(ctx, `第${cfg.day}天 · ${cfg.name}`, 56, y + 46, 38, { bold: true, align: 'left' });
    text(ctx, cfg.intro, 56, y + 92, 24, { color: P.inkSoft, align: 'left', maxWidth: 640 });
    const got = this.game.save.stamps[cfg.day] ?? [];
    const rules = stampRules(cfg);
    for (let i = 0; i < 3; i++) {
      const ry = y + 140 + i * 46;
      drawStamp(ctx, 74, ry, 17, !!got[i], i + 1);
      text(ctx, `${STAMP_NAMES[i]}：`, 102, ry + 1, 24, { bold: true, align: 'left' });
      text(ctx, rules[i], 226, ry + 1, 22, { align: 'left', color: got[i] ? P.lilyDeep : INK, maxWidth: 252 });
    }
    const bx = 486, by = y + h - 112;
    this.btns.push({ id: 'go', rect: { x: bx, y: by, w: 210, h: 84 } });
    button(ctx, bx, by, 210, 84, '开工！', { primary: true, pressed: this.pressed === 'go', size: 36 });
    const best = this.game.save.best[cfg.day];
    text(ctx, best ? `最好评级 ${best}` : '还没跑过这一天', bx + 105, by - 30, 22, { color: P.inkSoft });
    ctx.restore();
  }
}

/** One of a day's three stamps: a red postmark with its letter when earned, a dashed ring when not. */
export function drawStamp(ctx: Ctx, x: number, y: number, r: number, got: boolean, which: 1 | 2 | 3 | number) {
  ctx.save();
  ellipse(ctx, x, y, r, r);
  if (got) {
    ctx.fillStyle = '#FBE6DE';
    ctx.fill();
    ctx.strokeStyle = P.red;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ellipse(ctx, x, y, r - 4, r - 4);
    ctx.lineWidth = 1.2;
    ctx.stroke();
    text(ctx, STAMP_GLYPHS[(which - 1) % 3], x, y + 1, r * 1.05, { bold: true, color: P.red });
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fill();
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = 'rgba(74,59,48,0.45)';
    ctx.lineWidth = 2;
    ctx.stroke();
    text(ctx, STAMP_GLYPHS[(which - 1) % 3], x, y + 1, r * 1.05, { color: 'rgba(74,59,48,0.35)' });
  }
  ctx.restore();
}
