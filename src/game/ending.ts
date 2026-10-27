// The year's end, after day 30 is first passed: New Year's Eve on the river, fireworks over the village,
// and a few storybook pages over it (the year in numbers, the owl opening chapter 7, the old turtle's
// letters). Tap to turn the page; the last one goes to the route map, where the early-spring run waits.
import { alpha, drawBaked, hills, icon, mix, ribbon, shade, stars, sunMoon, TOD, type IconName } from '../art/kit';
import { INK, P } from '../art/palette';
import { lilyPad } from '../art/village';
import { button, ellipse, hit, panel, roundRect, text, wrapText, type Rect } from '../art/ui';
import { clamp, easeOutBack, easeOutCubic } from '../engine/math';
import type { Ctx } from '../platform/types';
import { stampCount } from './career';
import { YEAR_END } from './config';
import type { Game, Scene } from './game';
import { MapScene } from './map';
import { drawDressedFrog } from './menu';
import { SCENE_MUSIC } from './sound';

const NIGHT = TOD.night;
const COLORS = [P.red, P.gold, P.pink, P.tealLight, P.white, P.orange];
/** Seconds between rockets, and how long one climbs and bursts. */
const EVERY = 0.75, CLIMB = 0.7, BURST = 1.7;
const CARD_H = 380;

interface Rocket {
  x: number;
  y: number;
  color: string;
  seed: number;
  t: number;
}

interface Page {
  title: string;
  body: string;
  who?: 'owl' | 'turtle' | 'pelican';
  stats?: boolean;
  color?: string;
}

export class EndingScene implements Scene {
  readonly id = 'ending';
  private t = 0;
  /** Time on the current page, for its text coming in. */
  private pt = 0;
  private page = 0;
  private pages: Page[];
  private rockets: Rocket[] = [];
  private next = 0.4;
  private seed = 1;
  private btn: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private skip: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private pressed: string | null = null;

  constructor(private game: Game) {
    const s = game.save;
    game.audio.setMusic(SCENE_MUSIC.ending);
    if (!s.ending) {
      s.ending = true;
      game.writeSave();
    }
    const found = s.story.length;
    const letters =
      s.secret >= 2 ? '第一封信已经送到阿灰手里了。听说今晚，他也在上游的码头上看烟花。'
      : s.secret === 1 || found >= YEAR_END ? '三十封信全找齐了！最后一封里，乌龟爷爷拜托捡到信的人：把第一封信送给上游的阿灰。信箱里多了一件「第0号快递」。'
      : found ? `信箱里有 ${found} 封乌龟爷爷写给老朋友阿灰的信，还差 ${YEAR_END - found} 封。没捡到的信还漂在那几天的河上，回去补跑就能找到。`
      : '乌龟爷爷年轻时给老朋友阿灰写过三十封信，全被河水冲散了。每天的河上都漂着一封，下次留意那个小信封。';
    this.pages = [
      { title: '除夕夜', body: `柳湾河上放起了烟花。这一年，${s.name}从春天的荷叶跳到冬天的浮冰，把包裹送到了河上每一户人家。` },
      { title: '这一年', body: '', stats: true, color: P.teal },
      { title: '猫头鹰站长', who: 'owl', color: P.orangeDeep, body: '辛苦啦！过了年，河道就连成一圈了。第七章「早春·环河联运」开张，这一年学会的本事都要用上。' },
      { title: '乌龟爷爷的信', who: s.secret >= 2 ? 'pelican' : 'turtle', color: P.woodDeep, body: letters },
      { title: '蛙趣快递', body: '蛙趣快递祝河湾的大家新年快乐！明年也请多多关照。', color: P.red },
    ];
    game.tm.log('ending', { found, secret: s.secret });
  }

  update(dt: number) {
    this.t += dt;
    this.pt += dt;
    this.next -= dt;
    if (this.next <= 0) {
      // the last page gets a bigger show
      this.next = EVERY * (this.page === this.pages.length - 1 ? 0.5 : 1) * (0.7 + this.rand() * 0.6);
      const top = this.game.safeT + 150;
      this.rockets.push({ x: 90 + this.rand() * 570, y: top + this.rand() * (this.horizon() - top - 200), color: COLORS[Math.floor(this.rand() * COLORS.length)], seed: Math.floor(this.rand() * 99), t: 0 });
    }
    for (const r of this.rockets) {
      const was = r.t;
      r.t += dt;
      if (was < CLIMB && r.t >= CLIMB) this.game.audio.play('firecracker', { volume: 0.22, jitter: true });
    }
    this.rockets = this.rockets.filter((r) => r.t < CLIMB + BURST);
  }

  private rand() {
    this.seed = (this.seed * 16807) % 2147483647;
    return (this.seed - 1) / 2147483646;
  }

  private horizon() {
    return Math.round(this.game.H * 0.45);
  }

  // ---------------------------------------------------------------- input

  down(x: number, y: number) {
    this.pressed = hit(this.skip, x, y, 10) ? 'skip' : hit(this.btn, x, y, 6) ? 'btn' : 'page';
  }

  up(x: number, y: number) {
    const id = this.pressed;
    this.pressed = null;
    if (!id) return;
    const last = this.page === this.pages.length - 1;
    if (id === 'skip' && hit(this.skip, x, y, 10) && !last) return this.turn(this.pages.length - 1);
    if (id === 'btn' && !hit(this.btn, x, y, 6)) return;
    // a tap while the words are still coming in shows them all first
    if (id === 'page' && this.pt < this.revealT()) {
      this.pt = this.revealT();
      return;
    }
    if (!last) return this.turn(this.page + 1);
    if (id !== 'btn') return;
    this.game.audio.play('ui_tap');
    this.game.go(new MapScene(this.game, Math.min(YEAR_END + 1, this.game.lastDay)), true);
  }

  private turn(i: number) {
    this.page = i;
    this.pt = 0;
    this.game.audio.play(i % 2 ? 'paper_flip' : 'paper_flip_2', { volume: 0.7 });
    this.game.tm.log('ending_page', { i });
  }

  /** When the current page's words are all in. */
  private revealT() {
    const p = this.pages[this.page];
    return 0.35 + (p.stats ? 1.2 : p.body.length / 30);
  }

  // ---------------------------------------------------------------- drawing

  render(ctx: Ctx) {
    const g = this.game;
    const H = g.H, hz = this.horizon();
    drawBaked(ctx, `ending:${H}`, 0, 0, [0, 0, 750, H], (c) => paintNight(c, H, hz));
    stars(ctx, 0, g.safeT + 40, 750, hz - g.safeT - 140, this.t, 54);
    // the sky lights up with each burst, and so does the river
    for (const r of this.rockets) if (r.t >= CLIMB) this.drawGlow(ctx, r, hz);
    this.drawVillage(ctx, hz);
    for (const r of this.rockets) this.drawRocket(ctx, r);
    this.drawWater(ctx, hz, H);
    this.drawLanterns(ctx, g.safeT + 56);
    this.drawFriends(ctx, hz);
    this.drawCard(ctx);
  }

  private drawGlow(ctx: Ctx, r: Rocket, hz: number) {
    const k = (r.t - CLIMB) / BURST;
    const a = 0.22 * (1 - k) * (1 - k);
    const gr = ctx.createRadialGradient(r.x, r.y, 10, r.x, r.y, 300);
    gr.addColorStop(0, alpha(r.color, a));
    gr.addColorStop(1, alpha(r.color, 0));
    ctx.fillStyle = gr;
    ctx.fillRect(r.x - 300, r.y - 300, 600, 600);
    // its reflection: a soft smear on the water under it
    ctx.save();
    ctx.globalAlpha = a * 1.6;
    ctx.fillStyle = r.color;
    const ry = hz + 60 + (hz - r.y) * 0.22;
    ellipse(ctx, r.x, ry, 70 * (0.6 + k), 12);
    ctx.fill();
    ctx.restore();
  }

  private drawRocket(ctx: Ctx, r: Rocket) {
    const hz = this.horizon();
    if (r.t < CLIMB) {
      // the climb: a spark and its fading tail
      const k = easeOutCubic(r.t / CLIMB);
      const y = hz + 10 + (r.y - hz - 10) * k;
      ctx.save();
      ctx.strokeStyle = alpha(P.gold, 0.6);
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(r.x, y);
      ctx.lineTo(r.x + Math.sin(r.t * 30) * 2, y + 46);
      ctx.stroke();
      ctx.fillStyle = '#FFF4C8';
      ctx.beginPath();
      ctx.arc(r.x, y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    const k = (r.t - CLIMB) / BURST;
    burst(ctx, r.x, r.y, k, r.color, r.seed);
  }

  /** The village across the river with its windows lit, and the HQ's clock. */
  private drawVillage(ctx: Ctx, hz: number) {
    const sp = this.game.sprites;
    sp.draw(ctx, 'hub_home:night', 150, hz + 30, 0.42);
    sp.draw(ctx, 'hub_shop:night', 360, hz + 26, 0.38);
    sp.draw(ctx, 'hub_hq:night', 590, hz + 32, 0.46);
  }

  private drawWater(ctx: Ctx, hz: number, H: number) {
    // ripples drifting across, lit by whatever is bursting
    const lit = this.rockets.find((r) => r.t >= CLIMB && r.t < CLIMB + 0.8);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineWidth = 2.4;
    for (let i = 0; i < 18; i++) {
      const y = hz + 60 + ((i * 47) % (H - hz - 80));
      const x = ((i * 173 + this.t * (14 + (i % 4) * 5)) % 860) - 60;
      ctx.strokeStyle = alpha(lit && i % 3 === 0 ? lit.color : NIGHT.glint, 0.22 + (i % 3) * 0.06);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + 16, y - 4, x + 34 + (i % 3) * 10, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** A string of red lanterns across the top of the sky. */
  private drawLanterns(ctx: Ctx, y: number) {
    ctx.save();
    ctx.strokeStyle = alpha(INK, 0.7);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-10, y - 30);
    ctx.quadraticCurveTo(375, y + 50, 760, y - 30);
    ctx.stroke();
    for (let i = 0; i < 6; i++) {
      const u = (i + 0.5) / 6;
      const x = -10 + 770 * u;
      // on the rope's curve
      const ly = (1 - u) * (1 - u) * (y - 30) + 2 * u * (1 - u) * (y + 50) + u * u * (y - 30);
      const sw = Math.sin(this.t * 1.6 + i * 1.3) * 0.08;
      ctx.save();
      ctx.translate(x, ly);
      ctx.rotate(sw);
      lantern(ctx, i);
      ctx.restore();
    }
    ctx.restore();
  }

  /** The frog on a lily pad watching the fireworks, with the old turtle (or 阿灰, once the first letter is his). */
  private drawFriends(ctx: Ctx, hz: number) {
    const g = this.game, sp = g.sprites, s = g.save;
    const y = Math.min(hz + 170, this.cardTop() - 40);
    const bob = (i: number) => Math.sin(this.t * 1.3 + i) * 3;
    drawBaked(ctx, 'ending:pad0', 250, y + bob(0), [-108, -40, 108, 70], (c) => lilyPad(c, 0, 0, 96, NIGHT, 4, true));
    drawBaked(ctx, 'ending:pad1', 470, y + 18 + bob(2), [-96, -36, 96, 62], (c) => lilyPad(c, 0, 0, 84, NIGHT, 7));
    const look = this.page === this.pages.length - 1 ? 'frog_cheer' : 'frog_look';
    drawDressedFrog(ctx, sp, s.wear, look, 236, y + bob(0) - 4, 0.72);
    sp.draw(ctx, 'r_turtle_idle', 474, y + 16 + bob(2), -1.05, 1.05);
    if (s.secret >= 2) {
      drawBaked(ctx, 'ending:pad2', 650, y + 6 + bob(4), [-80, -30, 80, 52], (c) => lilyPad(c, 0, 0, 70, NIGHT, 11));
      sp.draw(ctx, 'r_pelican_wave', 650, y + 8 + bob(4), -0.95, 0.95);
    }
  }

  private cardTop() {
    return this.btnY() - 26 - CARD_H;
  }

  private btnY() {
    return this.game.H - this.game.safeB - 30 - 84;
  }

  private drawCard(ctx: Ctx) {
    const g = this.game, sp = g.sprites;
    const p = this.pages[this.page];
    const x = 40, w = 670, y0 = this.cardTop();
    // each page slides up a little as it comes in
    const k = easeOutBack(clamp(this.pt / 0.35, 0, 1));
    const y = y0 + (1 - k) * 30;
    ctx.save();
    ctx.globalAlpha = clamp(this.pt / 0.2, 0, 1);
    panel(ctx, x, y, w, CARD_H, { r: 24, fill: P.paper, shadow: true, grain: true });
    ribbon(ctx, 375, y + 4, Math.min(360, 140 + p.title.length * 36), p.title, { color: p.color ?? P.orange, h: 56 });
    const shown = Math.floor(clamp((this.pt - 0.3) * 30, 0, p.body.length));
    if (p.stats) this.drawStats(ctx, x, y + 70, w);
    else if (this.page === this.pages.length - 1) {
      text(ctx, '新年快乐', 375, y + 150, 76, { bold: true, color: P.red });
      this.drawBody(ctx, p.body.slice(0, shown), x + 70, y + 240, w - 140, 'center');
    } else if (p.who) {
      // the speaker on the left, the words beside them
      const px = x + 100, py = y + CARD_H - 60;
      ellipse(ctx, px, py - 4, 74, 14);
      ctx.fillStyle = alpha(P.inkSoft, 0.15);
      ctx.fill();
      if (p.who === 'owl') sp.draw(ctx, 'owl', px, py, 0.62);
      else sp.draw(ctx, `r_${p.who}_${p.who === 'pelican' ? 'cheer' : 'wave'}`, px, py, 1.7);
      this.drawBody(ctx, p.body.slice(0, shown), x + 200, y + 92, w - 236, 'left');
    } else this.drawBody(ctx, p.body.slice(0, shown), x + 50, y + 104, w - 100, 'left');
    // which page this is
    const n = this.pages.length;
    for (let i = 0; i < n; i++) {
      ellipse(ctx, 375 + (i - (n - 1) / 2) * 24, y + CARD_H - 24, 6, 6);
      ctx.fillStyle = i === this.page ? P.orange : P.paperShade;
      ctx.fill();
    }
    ctx.restore();
    const last = this.page === n - 1;
    const by = this.btnY();
    this.btn = { x: 165, y: by, w: 420, h: 84 };
    if (last) button(ctx, 165, by, 420, 84, '去看第二年的路线', { primary: true, pressed: this.pressed === 'btn', size: 32 });
    else {
      this.btn = { x: 0, y: 0, w: 0, h: 0 };
      ctx.save();
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(this.t * 3);
      text(ctx, '点一下翻页', 375, by + 42, 26, { color: P.white, bold: true });
      ctx.restore();
    }
    // skip to the last page
    this.skip = last ? { x: 0, y: 0, w: 0, h: 0 } : { x: 600, y: by + 17, w: 110, h: 50 };
    if (!last) {
      roundRect(ctx, 600, by + 17, 110, 50, 25);
      ctx.fillStyle = alpha(INK, 0.35);
      ctx.fill();
      text(ctx, '跳过', 655, by + 43, 24, { color: P.white, bold: true });
    }
  }

  private drawBody(ctx: Ctx, s: string, x: number, y: number, w: number, align: 'left' | 'center') {
    const lines = wrapText(ctx, s, 30, w);
    lines.forEach((l, i) => text(ctx, l, align === 'left' ? x : x + w / 2, y + i * 48, 30, { align, color: INK }));
  }

  /** The year in six numbers. */
  private drawStats(ctx: Ctx, x: number, y: number, w: number) {
    const s = this.game.save, c = s.career;
    const cells: [IconName, string, string][] = [
      ['parcel', `${c.delivered}`, '送到的包裹'],
      ['shoe', `${c.jumps}`, '跳了几下'],
      ['drop', `${c.falls}`, '掉进河里'],
      ['buoy', `${c.rescued}`, '捞回的包裹'],
      ['stamp', `${stampCount(s)}`, '好评章'],
      ['letter', `${s.story.length}/${YEAR_END}`, '乌龟爷爷的信'],
    ];
    const cw = (w - 60) / 3, ch = 132;
    cells.forEach(([ic, n, label], i) => {
      const k = clamp((this.pt - 0.2 - i * 0.16) / 0.3, 0, 1);
      if (k <= 0) return;
      const cx = x + 30 + cw * (i % 3) + cw / 2, cy = y + 10 + ch * Math.floor(i / 3);
      ctx.save();
      ctx.globalAlpha *= k;
      roundRect(ctx, cx - cw / 2 + 8, cy, cw - 16, ch - 14, 16);
      ctx.fillStyle = mix(P.paper, P.paperShade, 0.6);
      ctx.fill();
      icon(ctx, ic, cx, cy + 28, 36);
      text(ctx, n, cx, cy + 68, 36, { bold: true, color: i === 5 ? P.orangeDeep : INK, maxWidth: cw - 30 });
      text(ctx, label, cx, cy + 102, 20, { color: P.inkSoft, maxWidth: cw - 24 });
      ctx.restore();
    });
  }
}

/** The still night: sky, moon, far hills, the far bank and the river's colour. */
function paintNight(c: Ctx, H: number, hz: number) {
  const gr = c.createLinearGradient(0, 0, 0, hz + 40);
  gr.addColorStop(0, shade(NIGHT.skyTop, 0.25));
  gr.addColorStop(1, NIGHT.skyBot);
  c.fillStyle = gr;
  c.fillRect(0, 0, 750, hz + 40);
  sunMoon(c, 118, hz - 300, 30, NIGHT);
  hills(c, -40, 840, hz - 40, hz + 60, 70, mix(NIGHT.hillFar, NIGHT.skyBot, 0.35), 21, 0.1);
  hills(c, -40, 840, hz - 4, hz + 60, 30, NIGHT.hillFar, 7, 0.22);
  hills(c, -40, 840, hz + 22, hz + 60, 8, NIGHT.ground, 13, 0.25);
  const w = c.createLinearGradient(0, hz + 40, 0, H);
  w.addColorStop(0, NIGHT.water);
  w.addColorStop(1, shade(NIGHT.waterDeep, 0.25));
  c.fillStyle = w;
  c.fillRect(0, hz + 40, 750, H - hz - 40);
  c.strokeStyle = alpha(INK, 0.4);
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(0, hz + 40);
  c.lineTo(750, hz + 40);
  c.stroke();
  // the moon on the water
  c.fillStyle = alpha(NIGHT.sun, 0.25);
  for (let i = 0; i < 5; i++) {
    roundRect(c, 118 - 34 + i * 6, hz + 70 + i * 22, 68 - i * 12, 6, 3);
    c.fill();
  }
}

/** A firework: a ring of sparks flying out, then drifting down as they fade. */
function burst(c: Ctx, x: number, y: number, k: number, color: string, seed: number) {
  const n = 18;
  const R = 150 * (1 - (1 - Math.min(1, k * 1.6)) ** 3);
  const sag = k * k * 60;
  c.save();
  c.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + ((seed * 7 + i * 13) % 10) * 0.012;
    const r1 = R * (0.92 + ((seed + i * 5) % 3) * 0.06), r0 = r1 * (0.55 + k * 0.35);
    c.globalAlpha = Math.max(0, 1 - k) ** 1.4;
    c.strokeStyle = i % 4 === 0 ? P.white : color;
    c.lineWidth = 4 * (1 - k * 0.6);
    c.beginPath();
    c.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0 + sag * 0.6);
    c.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1 + sag);
    c.stroke();
    // a glittering tip
    if (k > 0.3 && (i + Math.floor(k * 20)) % 3 === 0) {
      c.fillStyle = '#FFF4C8';
      c.beginPath();
      c.arc(x + Math.cos(a) * r1, y + Math.sin(a) * r1 + sag, 2.6, 0, Math.PI * 2);
      c.fill();
    }
  }
  c.restore();
}

/** A red paper lantern hanging from its string at the origin. */
function lantern(c: Ctx, i: number) {
  const glow = c.createRadialGradient(0, 40, 4, 0, 40, 70);
  glow.addColorStop(0, alpha('#FFB060', 0.4));
  glow.addColorStop(1, alpha('#FFB060', 0));
  c.fillStyle = glow;
  c.fillRect(-70, -30, 140, 140);
  c.strokeStyle = INK;
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(0, 0);
  c.lineTo(0, 12);
  c.stroke();
  roundRect(c, -12, 10, 24, 8, 3);
  c.fillStyle = P.gold;
  c.fill();
  c.stroke();
  ellipse(c, 0, 40, 26 + (i % 2) * 3, 24);
  c.fillStyle = P.red;
  c.fill();
  c.stroke();
  // ribs and the warm light inside
  c.strokeStyle = alpha(shade(P.red, 0.35), 0.8);
  c.lineWidth = 1.4;
  for (const dx of [-12, 0, 12]) {
    c.beginPath();
    c.ellipse(0, 40, Math.abs(dx) || 1, 23, 0, 0, Math.PI * 2);
    c.stroke();
  }
  ellipse(c, -6, 34, 8, 9);
  c.fillStyle = alpha('#FFE6A0', 0.5);
  c.fill();
  roundRect(c, -12, 62, 24, 8, 3);
  c.fillStyle = P.gold;
  c.fill();
  c.strokeStyle = INK;
  c.lineWidth = 2;
  c.stroke();
  c.strokeStyle = P.red;
  c.lineWidth = 2.4;
  c.beginPath();
  for (const dx of [-5, 0, 5]) {
    c.moveTo(dx, 70);
    c.lineTo(dx * 1.3, 92);
  }
  c.stroke();
}
