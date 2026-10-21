import { INK, P } from '../art/palette';
import { HQ_ROOM, K } from '../art/sprites';
import { button, ellipse, hit, panel, roundRect, text, type Rect } from '../art/ui';
import { approach, clamp, easeInCubic, easeOutBack, easeOutCubic } from '../engine/math';
import type { Canvas, Ctx, SaveResult } from '../platform/types';
import type { Game, Scene } from './game';
import { PlayScene } from './play';

export interface Photo {
  img: Canvas;
  caption: string;
  prio: number;
  kind: string;
  t: number;
  /** Where the frog is in the picture (0–1 each way); the polaroid crops in around it. */
  focus: [number, number];
}

export interface DayResult {
  day: number;
  thrown: boolean;
  total: number;
  delivered: number;
  wrong: number;
  wet: number;
  missed: number;
  urgentTotal: number;
  urgentOnTime: number;
  pay: number;
  bonus: number;
  penalty: number;
  falls: number;
  wrongNames: string[];
  photos: Photo[];
}

const GRADES: Record<string, { name: string; line: string }> = {
  S: { name: '完 美', line: '完美！河湾线就靠你了。' },
  A: { name: '优 秀', line: '不错嘛，明天继续保持。' },
  B: { name: '良 好', line: '今天……还行吧。' },
  C: { name: '及 格', line: '这样下去，工资要扣光了。' },
  D: { name: '待改进', line: '你是来送快递，还是来游泳的？' },
};
const ORDER = 'SABCD';

const ROW_GAP = 0.28;
const SHEET_H = 622;
/** Share of the wide shot the polaroid shows. */
const THUMB_CROP = 0.6;

const SAVED: Record<SaveResult, string> = {
  shared: '搞定！',
  downloaded: '图片已保存',
  longpress: '长按图片，选「保存图片」',
  cancelled: '',
  failed: '没存上，试试长按图片保存',
};

interface Row {
  icon: 'ok' | 'wrong' | 'wet' | 'miss' | 'urgent' | 'heart';
  label: string;
  value: string;
  money: string;
  color?: string;
}

export class HqScene implements Scene {
  private t = 0;
  private grade: string;
  private income: number;
  private stars: number;
  private note: string;
  private owlLine: string;
  private left: Row[];
  private right: Row[];
  private stampAt: number;
  private endAt: number;
  private btns: { id: string; rect: Rect }[] = [];
  private viewBtn: Rect | null = null;
  private pressed: string | null = null;
  /** Polaroids on the sheet, in screen coordinates, for opening the big view. */
  private thumbs: Rect[] = [];
  /** The big view: which photo, how long it's been open, and the sideways drag/slide offset. */
  private view: { i: number; t: number; dx: number } | null = null;
  private swipe: { x: number; y: number; moved: boolean } | null = null;
  private viewBtns: { id: string; rect: Rect }[] = [];
  private cardRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private cards = new Map<Photo, Canvas>();
  private toast: { text: string; t: number } | null = null;
  private stamped = false;
  private ticks = 0;
  private snaps = 0;

  constructor(private game: Game, private r: DayResult) {
    const score = r.total ? (r.delivered + 0.3 * r.urgentOnTime - 0.5 * r.wrong - 0.5 * r.wet) / r.total : 0;
    let grade = score >= 0.95 && r.wrong + r.wet === 0 ? 'S' : score >= 0.75 ? 'A' : score >= 0.5 ? 'B' : score >= 0.25 ? 'C' : 'D';
    if (r.thrown && ORDER.indexOf(grade) < 2) grade = 'B';
    this.grade = grade;
    this.income = r.pay + r.bonus - r.penalty;
    this.stars = r.total ? clamp(Math.round((5 * (r.delivered - 0.5 * r.wrong)) / r.total + (r.urgentOnTime ? 0.4 : 0)), 1, 5) : 3;
    this.owlLine = r.thrown ? '被甩出去了？明天坐稳点。' : GRADES[grade].line;
    this.note = r.wet ? '“包裹泡了水，可不算送到哦。”'
      : r.wrong ? `“${r.wrongNames[0]}说没买过这个……”`
        : r.missed ? `“还有 ${r.missed} 个包裹没送出去。”`
          : '“干净利落，我喜欢。”';
    this.left = [
      { icon: 'ok', label: '正确配送', value: `${r.delivered} 单`, money: r.pay ? `+${r.pay}` : '0' },
      { icon: 'wrong', label: '错误配送', value: `${r.wrong} 单`, money: r.wrong ? `-${r.wrong * 5}` : '0' },
      { icon: 'wet', label: '落水损坏', value: `${r.wet} 单`, money: r.wet ? `-${r.wet * 5}` : '0' },
      { icon: 'miss', label: '漏送', value: `${r.missed} 单`, money: '—' },
    ];
    this.right = [
      { icon: 'urgent', label: '加急准时', value: r.urgentTotal ? `${r.urgentOnTime} / ${r.urgentTotal}` : '—', money: r.bonus ? `+${r.bonus}` : '' },
      { icon: 'heart', label: '顾客满意', value: '', money: '' },
    ];
    this.stampAt = 0.7 + (this.left.length + this.right.length + 1) * ROW_GAP + 0.35;
    this.endAt = this.stampAt + 0.5 + r.photos.length * 0.28 + 0.2;

    // Save progress
    const s = game.save;
    s.coins = Math.max(0, s.coins + this.income);
    s.day = Math.max(s.day, Math.min(r.day + 1, game.lastDay));
    const prev = s.best[r.day];
    if (!prev || ORDER.indexOf(grade) < ORDER.indexOf(prev)) s.best[r.day] = grade;
    game.writeSave();
    game.audio.setMusic('bgm_hq');
    game.audio.play('paper_flip', { delay: 0.15 });
    game.audio.play('owl_hoot', { delay: 0.5, volume: 0.8 });
  }

  private playStamp() {
    const au = this.game.audio;
    au.play('stamp');
    au.play(ORDER.indexOf(this.grade) <= 2 ? 'rating_good' : 'rating_bad', { delay: 0.35 });
  }

  update(dt: number) {
    this.t += dt;
    if (this.view) {
      this.view.t += dt;
      if (!this.swipe) this.view.dx = approach(this.view.dx, 0, 16, dt);
    }
    if (this.toast && (this.toast.t += dt) > 2.4) this.toast = null;
    const rowsShown = Math.floor((this.t - 0.7) / ROW_GAP) + 1;
    const nRows = this.left.length + this.right.length + 1;
    if (rowsShown > this.ticks && this.ticks < nRows && this.t >= 0.7) {
      this.ticks++;
      this.game.audio.play('ui_tick');
    }
    if (!this.stamped && this.t >= this.stampAt) {
      this.stamped = true;
      this.playStamp();
      this.game.platform.vibrate(30);
    }
    const snapsShown = Math.floor((this.t - this.stampAt - 0.5) / 0.28) + 1;
    if (snapsShown > this.snaps && this.snaps < this.r.photos.length && this.t >= this.stampAt + 0.5) {
      this.snaps++;
      this.game.audio.play('photo_shutter', { volume: 0.8 });
    }
  }

  down(x: number, y: number) {
    if (this.view) {
      for (const b of this.viewBtns) if (hit(b.rect, x, y, 8)) this.pressed = b.id;
      if (!this.pressed) this.swipe = { x, y, moved: false };
      return;
    }
    for (const b of this.btns) if (hit(b.rect, x, y)) this.pressed = b.id;
    if (this.viewBtn && hit(this.viewBtn, x, y, 8)) this.pressed = 'view0';
    this.thumbs.forEach((r, i) => {
      if (!this.pressed && hit(r, x, y, 6)) this.pressed = `view${i}`;
    });
    if (!this.pressed && this.t < this.endAt) {
      // tap to skip the paperwork animation
      this.t = this.endAt;
      this.ticks = 99;
      this.snaps = 99;
      if (!this.stamped) {
        this.stamped = true;
        this.playStamp();
      }
    }
  }

  move(x: number) {
    const sw = this.swipe;
    if (!this.view || !sw) return;
    const dx = x - sw.x;
    if (Math.abs(dx) > 12) sw.moved = true;
    // one photo only: it gives a little and springs back
    this.view.dx = this.r.photos.length > 1 ? dx : dx * 0.25;
  }

  up(x: number, y: number) {
    const id = this.pressed;
    this.pressed = null;
    if (this.view) {
      const sw = this.swipe;
      this.swipe = null;
      if (id) {
        const b = this.viewBtns.find((b) => b.id === id);
        if (b && hit(b.rect, x, y, 8)) this.viewAction(id);
      } else if (sw && sw.moved && Math.abs(this.view.dx) > 80) this.flip(this.view.dx < 0 ? 1 : -1);
      else if (sw && !sw.moved && !hit(this.cardRect, x, y)) this.closeView();
      return;
    }
    if (!id) return;
    if (id.startsWith('view')) {
      const i = Number(id.slice(4));
      const r = id === 'view0' && this.viewBtn && hit(this.viewBtn, x, y, 8) ? this.viewBtn : this.thumbs[i];
      if (r && hit(r, x, y, 8)) this.openView(i);
      return;
    }
    const b = this.btns.find((b) => b.id === id);
    if (!b || !hit(b.rect, x, y)) return;
    this.game.audio.play('ui_tap');
    this.game.platform.showImage(null);
    if (id === 'retry') this.game.go(new PlayScene(this.game, this.r.day));
    else if (id === 'next') this.game.go(new PlayScene(this.game, this.r.day >= this.game.lastDay ? 1 : this.r.day + 1));
  }

  // ---------------------------------------------------------------- big view

  private openView(i: number) {
    if (!this.r.photos[i]) return;
    this.view = { i, t: 0, dx: 0 };
    this.game.audio.play('ui_open');
    // get every picture ready to save, so the save can happen right inside the tap
    for (const p of this.r.photos) this.game.platform.prepareImage(this.card(p));
  }

  private closeView() {
    this.view = null;
    this.swipe = null;
    this.game.platform.showImage(null);
    this.game.audio.play('ui_close');
  }

  /** Next (1) or previous (-1) photo; the new one slides in from that side. */
  private flip(d: number) {
    const v = this.view!;
    const n = this.r.photos.length;
    if (n < 2) return;
    v.i = (v.i + d + n) % n;
    v.dx = d * 750 + v.dx;
    this.game.audio.play('paper_flip', { volume: 0.7 });
  }

  private viewAction(id: string) {
    const v = this.view!;
    if (id === 'close') this.closeView();
    else if (id === 'prev') this.flip(-1);
    else if (id === 'next') this.flip(1);
    else if (id === 'save') {
      this.game.audio.play('ui_tap');
      const p = this.r.photos[v.i];
      void this.game.platform.saveImage(this.card(p), `waqu-day${this.r.day}-${v.i + 1}.jpg`).then((res) => {
        if (SAVED[res]) this.toast = { text: SAVED[res], t: 0 };
        if (res === 'shared' || res === 'downloaded') this.game.audio.play('photo_shutter', { volume: 0.6 });
      });
    }
  }

  /** The photo as a keepsake: polaroid border, the caption, and a footer. Shown big and saved as is. */
  private card(p: Photo): Canvas {
    const have = this.cards.get(p);
    if (have) return have;
    const iw = p.img.width, ih = p.img.height;
    const u = iw / 600;
    const pad = Math.round(26 * u), capH = Math.round(124 * u);
    const c = this.game.platform.createCanvas(iw + pad * 2, ih + pad + capH);
    const g = c.getContext('2d')!;
    g.fillStyle = '#FFFDF7';
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(p.img, pad, pad);
    g.strokeStyle = INK;
    g.lineWidth = 2 * u;
    g.strokeRect(pad, pad, iw, ih);
    text(g, p.caption, c.width / 2, pad + ih + 54 * u, 40 * u, { bold: true, maxWidth: iw - 20 * u });
    text(g, `蛙趣快递 · 第 ${this.r.day} 天 · 今日精彩瞬间`, c.width / 2, pad + ih + 100 * u, 22 * u, { color: P.inkSoft });
    g.lineWidth = 3 * u;
    g.strokeRect(1.5 * u, 1.5 * u, c.width - 3 * u, c.height - 3 * u);
    this.cards.set(p, c);
    return c;
  }

  private drawViewer(ctx: Ctx) {
    const v = this.view!;
    const H = this.game.H;
    const photos = this.r.photos;
    const p = photos[v.i];
    const card = this.card(p);
    const a = easeOutCubic(clamp(v.t / 0.25, 0, 1));
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(28,22,18,0.9)';
    ctx.fillRect(0, 0, 750, H);
    ctx.restore();

    const top = this.game.safeT + 96;
    const btnY = H - this.game.safeB - 30 - 84;
    const maxW = 690, maxH = btnY - 150 - top;
    const s = Math.min(maxW / card.width, maxH / card.height);
    const pop = 0.88 + 0.12 * easeOutBack(clamp(v.t / 0.3, 0, 1));
    const w = card.width * s * pop, h = card.height * s * pop;
    const x = 375 - w / 2 + v.dx, y = top + (maxH - h) / 2;
    this.cardRect = { x, y, w, h };
    ctx.save();
    ctx.globalAlpha = 0.35 * a;
    ctx.fillStyle = '#000';
    ctx.fillRect(x + 8, y + 12, w, h);
    ctx.restore();
    ctx.drawImage(card, x, y, w, h);
    // a real picture over it, for long-press saving
    const k = this.game.cssScale;
    this.game.platform.showImage(card, { x: x * k, y: y * k, w: w * k, h: h * k });

    text(ctx, '今日精彩瞬间', 375, this.game.safeT + 48, 34, { bold: true, color: P.cream, alpha: a });
    this.viewBtns = [];
    const ry = y + h + 50;
    if (photos.length > 1) {
      text(ctx, `${v.i + 1} / ${photos.length}`, 375, ry, 30, { bold: true, color: P.cream, alpha: a });
      for (const [id, cx, dir] of [['prev', 245, -1], ['next', 505, 1]] as const) {
        const r = { x: cx - 36, y: ry - 36, w: 72, h: 72 };
        this.viewBtns.push({ id, rect: r });
        ctx.save();
        ctx.globalAlpha = a;
        ellipse(ctx, cx, ry, 32, 32);
        ctx.fillStyle = this.pressed === id ? P.paperShade : P.paper;
        ctx.fill();
        ctx.strokeStyle = INK;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(cx - dir * 5, ry - 12);
        ctx.lineTo(cx + dir * 7, ry);
        ctx.lineTo(cx - dir * 5, ry + 12);
        ctx.stroke();
        ctx.restore();
      }
    }
    text(ctx, photos.length > 1 ? '左右滑动换一张 · 长按图片也能保存' : '长按图片也能保存', 375, btnY - 34, 24, { color: P.cream, alpha: 0.7 * a });
    ctx.save();
    ctx.globalAlpha = a;
    this.viewBtns.push({ id: 'close', rect: { x: 40, y: btnY, w: 250, h: 84 } }, { id: 'save', rect: { x: 310, y: btnY, w: 400, h: 84 } });
    button(ctx, 40, btnY, 250, 84, '关闭', { pressed: this.pressed === 'close', size: 32 });
    button(ctx, 310, btnY, 400, 84, '保存这张', { primary: true, pressed: this.pressed === 'save', size: 32 });
    ctx.restore();
  }

  render(ctx: Ctx) {
    const H = this.game.H;
    const sp = this.game.sprites;
    const btnTop = H - this.game.safeB - 30 - 84;
    const sheetTop = btnTop - 22 - SHEET_H;
    const counterY = sheetTop - 70;
    const roomTop = counterY + 36 - HQ_ROOM.h;
    const contentTop = roomTop + HQ_ROOM.h - HQ_ROOM.contentH;

    // floor + room
    ctx.fillStyle = '#C9A37A';
    ctx.fillRect(0, 0, 750, H);
    ctx.strokeStyle = 'rgba(148,104,63,0.4)';
    ctx.lineWidth = 1.5;
    for (let y = counterY + 200; y < H; y += 44) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(750, y);
      ctx.stroke();
    }
    sp.draw(ctx, 'hq_room', 0, roomTop);
    if (roomTop > 0) {
      ctx.fillStyle = '#EEDFC0';
      ctx.fillRect(0, 0, 750, roomTop + 1);
    }
    text(ctx, '蛙趣快递 · 河湾总部', 375, contentTop + 54, 30, { color: P.cream, bold: true });

    // owl behind the counter, stamping wing
    const ox = 640 * K, oy = counterY + 3;
    const bob = Math.sin(this.t * 2) * 2;
    sp.draw(ctx, 'owl', ox, oy + bob);
    const st = this.t - this.stampAt;
    let wingRot = -0.1 + Math.sin(this.t * 1.5) * 0.03;
    if (st > -0.5 && st < 0) wingRot = -0.1 - easeOutCubic((st + 0.5) / 0.5) * 0.35;
    else if (st >= 0 && st < 0.12) wingRot = -0.45 + easeInCubic(st / 0.12) * 1.2;
    else if (st >= 0.12 && st < 0.6) wingRot = 0.75 - easeOutCubic((st - 0.12) / 0.48) * 0.85;
    sp.draw(ctx, 'owl_wing', ox + 104 * K, oy + bob - 150 * K, 1, 1, wingRot);
    sp.draw(ctx, 'hq_counter', 0, counterY);
    // owl's speech bubble with typewriter text
    this.drawBubble(ctx, 172, contentTop + 268);

    // frog in front of the counter
    const good = this.grade === 'S' || this.grade === 'A';
    const fy = counterY + 76;
    sp.draw(ctx, good ? 'frog_happy' : 'frog_nervous', 136, fy + Math.sin(this.t * 3) * 1.5, 1.2, 1.2);
    if (this.r.falls > 0) {
      for (const [dx, dy, ph] of [[-62, -150, 0], [66, -136, 1.3], [-74, -96, 2.1]]) {
        const k = ((this.t * 0.8 + ph) % 1);
        ctx.save();
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = P.tealLight;
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        const x = 136 + dx, y = fy + dy + k * 30;
        ctx.moveTo(x, y - 9);
        ctx.quadraticCurveTo(x + 7, y + 2, x, y + 6);
        ctx.quadraticCurveTo(x - 7, y + 2, x, y - 9);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }

    // report sheet slides up
    const slide = 1 - easeOutCubic(clamp(this.t / 0.55, 0, 1));
    ctx.save();
    ctx.translate(24, sheetTop + slide * (H - sheetTop));
    ctx.rotate(-0.008);
    this.drawSheet(ctx);
    ctx.restore();

    // buttons
    const last = this.r.day >= this.game.lastDay;
    const show = clamp((this.t - this.stampAt) / 0.3, 0, 1);
    ctx.save();
    ctx.globalAlpha = 0.3 + 0.7 * show;
    this.btns = [
      { id: 'retry', rect: { x: 40, y: btnTop, w: 310, h: 84 } },
      { id: 'next', rect: { x: 390, y: btnTop, w: 320, h: 84 } },
    ];
    button(ctx, 40, btnTop, 310, 84, '再来一次', { pressed: this.pressed === 'retry', size: 32 });
    button(ctx, 390, btnTop, 320, 84, last ? '从第1天再玩 →' : '下一天 →', { primary: true, pressed: this.pressed === 'next', size: 32 });
    ctx.restore();

    if (this.view) this.drawViewer(ctx);
    if (this.toast) {
      const tt = this.toast.t;
      const a = Math.min(1, tt * 6) * (tt > 2 ? (2.4 - tt) / 0.4 : 1);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.font = '28px WK';
      const w = Math.max(240, ctx.measureText(this.toast.text).width + 64);
      const y = this.game.safeT + 110;
      panel(ctx, 375 - w / 2, y, w, 60, { r: 30, fill: P.cream });
      text(ctx, this.toast.text, 375, y + 31, 28);
      ctx.restore();
    }
  }

  private drawBubble(ctx: Ctx, x: number, y: number) {
    const chars = Math.floor(clamp((this.t - 0.3) * 14, 0, this.owlLine.length));
    if (chars <= 0) return;
    const w = 300, h = 70;
    ctx.save();
    roundRect(ctx, x - w / 2, y - h / 2, w, h, 22);
    ctx.fillStyle = P.white;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.2;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + 90, y + h / 2 - 1);
    ctx.lineTo(x + 112, y + h / 2 + 24);
    ctx.lineTo(x + 116, y + h / 2 - 1);
    ctx.fillStyle = P.white;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + 90, y + h / 2);
    ctx.lineTo(x + 112, y + h / 2 + 24);
    ctx.lineTo(x + 116, y + h / 2);
    ctx.stroke();
    text(ctx, this.owlLine.slice(0, chars), x, y + 1, 26, { bold: true, maxWidth: w - 30 });
    ctx.restore();
  }

  private drawSheet(ctx: Ctx) {
    const W = 702;
    const sp = this.game.sprites;
    panel(ctx, 0, 0, W, SHEET_H, { r: 12 });
    // paper clip
    roundRect(ctx, 26, -18, 18, 54, 9);
    ctx.strokeStyle = '#9AA3A6';
    ctx.lineWidth = 4;
    ctx.stroke();
    text(ctx, '今日工作报告', 300, 58, 44, { bold: true });
    text(ctx, `第 ${this.r.day} 天 · 蛙趣快递 河湾线`, 300, 100, 22, { color: P.inkSoft });
    ctx.strokeStyle = 'rgba(74,59,48,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(34, 126);
    ctx.lineTo(668, 126);
    ctx.stroke();

    const shown = (i: number) => clamp((this.t - 0.7 - i * ROW_GAP) / 0.2, 0, 1);
    this.left.forEach((row, i) => this.drawRow(ctx, row, 34, 160 + i * 50, 296, shown(i)));
    this.right.forEach((row, i) => this.drawRow(ctx, row, 372, 160 + i * 50, 300, shown(this.left.length + i)));
    // stars
    const sa = shown(this.left.length + 1);
    if (sa > 0) {
      ctx.save();
      ctx.globalAlpha = sa;
      for (let i = 0; i < 5; i++) this.star(ctx, 548 + i * 26, 210, i < this.stars ? P.gold : P.paperShade);
      ctx.restore();
    }
    // income box
    const ia = shown(this.left.length + this.right.length);
    if (ia > 0) {
      ctx.save();
      ctx.globalAlpha = ia;
      roundRect(ctx, 366, 244, 306, 60, 12);
      ctx.fillStyle = '#F0E2C4';
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.stroke();
      text(ctx, '今日收入', 384, 275, 28, { align: 'left', bold: true });
      sp.draw(ctx, 'coin', 548, 274, 0.75);
      const k = clamp((this.t - 0.7 - (this.left.length + this.right.length) * ROW_GAP) / 0.6, 0, 1);
      const v = Math.round(this.income * k);
      text(ctx, `${v >= 0 ? '+' : ''}${v}`, 656, 276, 34, { align: 'right', bold: true, color: v >= 0 ? P.lilyDeep : P.red });
      ctx.restore();
    }
    // owl's note
    if (this.t > this.stampAt) text(ctx, `${this.note} —— 猫头鹰经理`, 351, 352, 23, { color: P.inkSoft, maxWidth: 640, alpha: clamp((this.t - this.stampAt) / 0.4, 0, 1) });

    // highlights
    text(ctx, '今日精彩瞬间', 351, 394, 28, { bold: true });
    ctx.strokeStyle = P.orange;
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(271, 414);
    ctx.quadraticCurveTo(351, 422, 431, 414);
    ctx.stroke();
    const photos = this.r.photos;
    const sheetTop = this.sheetScreenTop();
    if (photos.length) {
      this.viewBtn = { x: 24 + 560, y: sheetTop + 376, w: 110, h: 38 };
      roundRect(ctx, 560, 376, 110, 38, 19);
      ctx.fillStyle = this.pressed === 'view0' ? P.paperShade : P.cream;
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.8;
      ctx.stroke();
      text(ctx, '看大图', 615, 396, 22, { bold: true });
    }
    const n = photos.length;
    this.thumbs = [];
    photos.forEach((p, i) => {
      const k = clamp((this.t - this.stampAt - 0.5 - i * 0.28) / 0.3, 0, 1);
      if (k <= 0) return;
      const cx = n === 1 ? 351 : n === 2 ? 236 + i * 230 : 120 + i * 231;
      this.thumbs[i] = { x: 24 + cx - 100, y: sheetTop + 512 - 96, w: 200, h: 192 };
      const rot = [-0.05, 0.035, -0.03][i];
      ctx.save();
      ctx.globalAlpha = k;
      ctx.translate(cx, 512 - (1 - easeOutBack(k)) * 30);
      ctx.rotate(rot);
      this.polaroid(ctx, p);
      ctx.restore();
    });
    if (!n) text(ctx, '今天风平浪静，没拍到照片', 351, 500, 24, { color: P.inkSoft });

    // rating stamp
    const st = this.t - this.stampAt;
    if (st >= 0) {
      const k = clamp(st / 0.12, 0, 1);
      const s = 1.8 - 0.8 * k;
      ctx.save();
      ctx.translate(596, 74);
      ctx.rotate(-0.24);
      ctx.scale(s, s);
      ctx.globalAlpha = 0.25 + 0.65 * k;
      ctx.strokeStyle = P.red;
      ctx.lineWidth = 4.5;
      ellipse(ctx, 0, 0, 62, 62);
      ctx.stroke();
      ctx.lineWidth = 2;
      ellipse(ctx, 0, 0, 51, 51);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-42, -28);
      ctx.lineTo(42, -28);
      ctx.stroke();
      text(ctx, '审 核', 0, -38, 15, { color: P.red, bold: true });
      text(ctx, this.grade, 0, 8, 64, { color: P.red, bold: true });
      text(ctx, GRADES[this.grade].name, 0, 42, 16, { color: P.red, bold: true });
      ctx.restore();
    }
  }

  private sheetScreenTop() {
    const H = this.game.H;
    return H - this.game.safeB - 30 - 84 - 22 - SHEET_H;
  }

  private polaroid(ctx: Ctx, p: Photo) {
    const w = 200, h = 192;
    ctx.fillStyle = P.paperShade;
    ctx.fillRect(-w / 2 + 4, -h / 2 + 6, w, h);
    ctx.fillStyle = '#FFFDF7';
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.strokeRect(-w / 2, -h / 2, w, h);
    const iw = 182, ih = 140;
    const sw = p.img.width * THUMB_CROP, sh = p.img.height * THUMB_CROP;
    const sx = clamp(p.focus[0] * p.img.width - sw / 2, 0, p.img.width - sw);
    const sy = clamp(p.focus[1] * p.img.height - sh / 2, 0, p.img.height - sh);
    ctx.drawImage(p.img, sx, sy, sw, sh, -iw / 2, -h / 2 + 9, iw, ih);
    ctx.strokeRect(-iw / 2, -h / 2 + 9, iw, ih);
    text(ctx, p.caption, 0, h / 2 - 22, 22, { bold: true, maxWidth: w - 16 });
    // tape
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = '#E7D3AE';
    ctx.rotate(-0.06);
    ctx.fillRect(-30, -h / 2 - 12, 60, 22);
    ctx.restore();
  }

  private drawRow(ctx: Ctx, row: Row, x: number, y: number, w: number, a: number) {
    if (a <= 0) return;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate((1 - a) * 12, 0);
    this.icon(ctx, row.icon, x + 18, y);
    text(ctx, row.label, x + 46, y + 1, 26, { align: 'left' });
    if (row.value) text(ctx, row.value, x + w - 76, y + 1, 26, { align: 'right', bold: true });
    if (row.money) text(ctx, row.money, x + w - 4, y + 1, 26, { align: 'right', bold: true, color: row.money.startsWith('-') ? P.red : row.money.startsWith('+') ? P.lilyDeep : P.inkSoft });
    ctx.strokeStyle = P.kraft;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 7]);
    ctx.beginPath();
    ctx.moveTo(x, y + 24);
    ctx.lineTo(x + w, y + 24);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  private icon(ctx: Ctx, kind: Row['icon'], x: number, y: number) {
    const bg = { ok: P.lily, wrong: P.gold, wet: P.blueLight, miss: P.paperShade, urgent: P.red, heart: P.pink }[kind];
    ellipse(ctx, x, y, 15, 15);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = P.white;
    ctx.fillStyle = P.white;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (kind === 'ok') {
      ctx.moveTo(x - 7, y);
      ctx.lineTo(x - 2, y + 6);
      ctx.lineTo(x + 8, y - 6);
      ctx.stroke();
    } else if (kind === 'wrong') {
      text(ctx, '?', x, y + 1, 20, { bold: true });
    } else if (kind === 'wet') {
      ctx.moveTo(x, y - 9);
      ctx.quadraticCurveTo(x + 8, y + 2, x, y + 7);
      ctx.quadraticCurveTo(x - 8, y + 2, x, y - 9);
      ctx.fill();
    } else if (kind === 'miss') {
      text(ctx, '…', x, y - 2, 18, { bold: true });
    } else if (kind === 'urgent') {
      ctx.moveTo(x, y - 8);
      ctx.lineTo(x, y);
      ctx.lineTo(x + 6, y + 4);
      ctx.stroke();
    } else {
      ctx.moveTo(x, y + 7);
      ctx.bezierCurveTo(x - 14, y - 2, x - 6, y - 12, x, y - 4);
      ctx.bezierCurveTo(x + 6, y - 12, x + 14, y - 2, x, y + 7);
      ctx.fill();
    }
  }

  private star(ctx: Ctx, x: number, y: number, fill: string) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 5 : 12;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.8;
    ctx.stroke();
  }
}
