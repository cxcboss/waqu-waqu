import { alpha, cloud, drawBaked, glints, icon, ribbon, TOD } from '../art/kit';
import { INK, P } from '../art/palette';
import { button, ellipse, hit, panel, pressIn, pressOut, roundRect, text } from '../art/ui';
import { lilyPad } from '../art/village';
import { clamp, easeOutBack, easeOutCubic, lerp } from '../engine/math';
import type { Ctx } from '../platform/types';
import { CHAPTERS, DAYS, DAYS_PER_CHAPTER, chapterOf } from './config';
import type { Game, Scene } from './game';
import { GAP, RiverLine, drawMapScenery } from './mapart';
import { Taps, Toast, header } from './menu';
import { PlayScene } from './play';
import { STAMP_GLYPHS, STAMP_NAMES, stampRules } from './progress';
import { HubScene } from './hub';
import { SCENE_MUSIC, hubAmbience } from './sound';

/** A stop on the route map: a big lily pad in the river, with a signpost underneath. */
interface Stop { day: number; x: number; y: number }

const HOP_T = 0.45;
/** A drag longer than this is a scroll, not a tap. */
const DRAG_MIN = 12;
/** Where each stop sits across the river: they zigzag up it. */
const stopX = (i: number) => (i % 2 ? 530 : 220);
const CN = '一二三四五六七';

/**
 * The route map: the river from day 1 at the bottom up through every chapter's season, one stop per
 * day, each showing its best grade and the three stamps collected. Tap a stop to see what it asks for
 * and start it.
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
  private line = new RiverLine(DAYS.map((_, i) => stopX(i)));
  private taps = new Taps();
  private pressed: string | null = null;
  private toast = new Toast();
  private sheetT = 0;

  constructor(private game: Game, day?: number) {
    this.sel = clamp(day ?? game.save.day, 1, this.unlocked);
    this.view = chapterOf(this.sel);
    this.off = this.centreOn(this.sel);
    game.audio.setMusic(SCENE_MUSIC.map);
    game.audio.setAmbience(hubAmbience(new Date().getHours() >= 19 || new Date().getHours() < 6));
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
      this.taps.pressed = null;
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
    this.toast.update(dt);
  }

  down(x: number, y: number, id = 0) {
    this.drag = { id, y0: y, off0: this.off, y, moved: false };
    this.lastY = y;
    this.offV = 0;
    this.pressed = null;
    if (this.taps.down(x, y)) return;
    const s = this.stopAt(x, y);
    if (s) this.pressed = `stop${s.day}`;
  }

  private stopAt(x: number, y: number) {
    // the header, the chapter ribbon under it and the day card at the bottom sit on top of the river
    const H = this.game.H, top = this.game.safeT;
    if (y < top + 146 || (y >= H - this.game.safeB - 24 - 300 && x >= 24 && x <= 726)) return undefined;
    return this.stops.find((s) => Math.hypot(x - s.x, (y - s.y) * 1.2) <= 90 || hit({ x: s.x - 115, y: s.y + 26, w: 230, h: 76 }, x, y));
  }

  up(x: number, y: number, pid = 0) {
    const moved = this.drag?.moved;
    if (this.drag?.id === pid) this.drag = null;
    const id = this.pressed;
    this.pressed = null;
    const tap = this.taps.up(x, y);
    if (moved) return;
    if (id?.startsWith('stop')) {
      const s = this.stopAt(x, y);
      if (s && `stop${s.day}` === id) this.select(s.day);
      return;
    }
    if (tap !== 'back' && tap !== 'go') return;
    const au = this.game.audio;
    this.game.tm.log(tap === 'go' ? 'map_go' : 'map_back', { sel: this.sel, sec: Math.round(this.t) });
    if (tap === 'back') {
      au.play('ui_back');
      this.game.go(new HubScene(this.game));
    } else {
      au.play('ui_confirm');
      this.game.go(new PlayScene(this.game, this.sel), true);
    }
  }

  private select(day: number) {
    const au = this.game.audio;
    if (day > this.unlocked) {
      this.game.tm.log('map_locked', { day });
      au.play('ui_error');
      // the one to pass is the furthest day open, whichever locked stop was tapped
      this.toast.show(`先通过第${this.unlocked}天，才能解锁这一站`, 'lock');
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
    this.taps.clear();

    // stops zigzag up the river, day 1 at the bottom; the whole river scrolls (u = 0 is day 1, at y0 + off)
    const base = this.y0 + this.off;
    const yOf = (u: number) => base - u;
    this.stops = DAYS.map((d, i) => ({ day: d.day, x: stopX(i), y: yOf(i * GAP) }));
    this.view = chapterOf(clamp(Math.round((this.y0 + this.off - H * 0.4) / GAP), 0, DAYS.length - 1) + 1);

    // the seasons' banks and the river, then the water's glints on top
    drawMapScenery(ctx, this.line, this.stops, base, base - H, base);
    glints(ctx, () => this.line.path(ctx, base - H, base, yOf), this.t, TOD.day, 3);

    // chapter names where each chapter begins; the first chapter still locked waits in the mist
    const firstLocked = chapterOf(this.unlocked) + 1;
    for (let c = 1; c < CHAPTERS.length; c++) {
      const by = yOf((c * DAYS_PER_CHAPTER - 0.5) * GAP);
      if (by < -160 || by > H + 160) continue;
      const title = `第${CN[c]}章 · ${CHAPTERS[c].title}`;
      if (c === firstLocked) this.drawFog(ctx, by, title, c);
      else if (c < firstLocked) this.chapterSign(ctx, by, title);
    }
    if (firstLocked >= CHAPTERS.length) {
      // past the last chapter the river runs on into the mist
      const by = yOf((DAYS.length - 0.5) * GAP + 60);
      if (by > -160) this.drawFog(ctx, by, '', -1);
    }

    const unlocked = this.unlocked;
    this.stops.forEach((s, i) => {
      if (s.y < -140 || s.y > H + 140) return;
      const open = s.day <= unlocked;
      const done = (this.game.save.stamps[s.day] ?? []).filter(Boolean).length === 3;
      const bob = Math.sin(this.t * 1.6 + i) * 2;
      const down = this.pressed === `stop${s.day}`;
      pressIn(ctx, { x: s.x - 115, y: s.y - 70, w: 230, h: 172 }, down);
      ctx.save();
      if (!open) ctx.globalAlpha = 0.6;
      // every stop's pad is its own; a day with all three stamps has a lotus in flower
      drawBaked(ctx, `mappad:${i}:${done}`, s.x, s.y + bob, [-92, -72, 92, 54], (c) => lilyPad(c, 0, 0, 82, TOD.day, i + 3, done));
      ctx.restore();
      if (s.day === this.sel) {
        ctx.save();
        ctx.setLineDash([12, 8]);
        ctx.lineDashOffset = -this.t * 30;
        ctx.strokeStyle = P.gold;
        ctx.lineWidth = 4;
        ellipse(ctx, s.x, s.y + bob, 98, 54);
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
      ctx.globalAlpha = 0.3;
      ellipse(ctx, fx + 4, fy + 4, 34, 10);
      ctx.fillStyle = INK;
      ctx.fill();
      ctx.restore();
      sp.draw(ctx, name, fx, fy - z, 0.85, 0.85);
    }

    header(ctx, this.game, this.taps, '路线图', { icon: 'map' });
    ribbon(ctx, 375, top + 128, 380, `第${CN[this.view]}章 · ${CHAPTERS[this.view].title}`, { h: 50, size: 26 });

    this.drawSheet(ctx, sheetTop, sheetH);
    this.toast.render(ctx, sheetTop - 80);
  }

  /** A chapter's name on a paper label by the river, where the chapter begins. */
  private chapterSign(ctx: Ctx, y: number, title: string) {
    const w = 380;
    panel(ctx, 375 - w / 2, y - 26, w, 52, { r: 26, fill: alpha(P.white, 0.92), shadow: false, stitch: false, lw: 2 });
    text(ctx, title, 375, y + 1, 26, { bold: true, color: P.inkSoft, maxWidth: w - 30 });
  }

  /** Clouds over the river where the next chapter will be (c < 0: past the last one). */
  private drawFog(ctx: Ctx, y: number, title: string, c: number) {
    const tod = TOD.day;
    for (let i = 0; i < 8; i++) {
      const x = 20 + i * 102 + Math.sin(this.t * 0.4 + i) * 10;
      drawBaked(ctx, `mapfog:${i % 4}`, x, y + (i % 2) * 34 - 4, [-100, -64, 100, 44], (g) => cloud(g, 0, 0, 1.3, tod, (i % 4) + 2));
    }
    for (let i = 0; i < 6; i++) {
      const x = 70 + i * 124 + Math.sin(this.t * 0.5 + i * 2) * 8;
      drawBaked(ctx, `mapfog:${(i + 2) % 4}`, x, y - 50 + (i % 2) * 18, [-100, -64, 100, 44], (g) => cloud(g, 0, 0, 1.3, tod, ((i + 2) % 4) + 2));
    }
    if (c < 0) return;
    text(ctx, title, 375, y - 8, 28, { bold: true, color: P.inkSoft });
    icon(ctx, 'lock', 375 - 166, y + 30, 26, { faded: true });
    text(ctx, `通过第${c * DAYS_PER_CHAPTER}天，解锁第${CN[c]}章`, 375 + 14, y + 30, 22, { color: P.inkSoft });
  }

  /** The signpost under a stop: day and name, best grade, and the three stamps (or a lock). */
  private drawSign(ctx: Ctx, s: Stop, open: boolean) {
    const cfg = DAYS[s.day - 1];
    const x = s.x - 115, y = s.y + 30, w = 230, h = 72;
    const sel = s.day === this.sel;
    panel(ctx, x, y, w, h, { r: 14, fill: !open ? P.paperShade : sel ? P.cream : P.paper, shadow: false, stitch: sel ? P.orange : undefined });
    text(ctx, `第${s.day}天 · ${cfg.name}`, s.x, y + 22, 22, { bold: true, maxWidth: w - 20 });
    if (!open) {
      icon(ctx, 'lock', s.x - 60, y + 49, 28, { faded: true });
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
    const goDown = this.taps.add('go', { x: bx, y: by, w: 210, h: 84 }, 6);
    button(ctx, bx, by, 210, 84, '开工！', { primary: true, pressed: goDown, size: 36 });
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
