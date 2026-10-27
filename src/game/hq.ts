import { todSprite } from '../art/codeart';
import { emptyState, todAt, woodSign } from '../art/kit';
import { INK, P } from '../art/palette';
import { HQ_CLOCK, HQ_ROOM, clockHands } from '../art/room';
import { K } from '../art/sprites';
import { button, ellipse, hit, panel, pressIn, pressOut, roundRect, text, type Rect } from '../art/ui';
import { clamp, easeInCubic, easeOutBack, easeOutCubic } from '../engine/math';
import type { Canvas, Ctx } from '../platform/types';
import { rankOf, recordDay, type DayRecord } from './career';
import { DAYS_PER_CHAPTER, PASS_RATE, TUNING, chapterOf, passRate } from './config';
import { dayConfig } from './level';
import type { Game, Scene } from './game';
import { HubScene } from './hub';
import { drawStamp } from './map';
import { PlayScene } from './play';
import { earnedStamps, passed } from './progress';
import { SCENE_MUSIC } from './sound';
import { PhotoViewer, type ViewerPhoto } from './viewer';

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
  /** Cash-on-delivery parcels handed over, how many got the right change, and the tips and losses from it. */
  codTotal: number;
  /** All of the day's cash-on-delivery parcels, handed over or not (the 到付 challenge wants every one). */
  codOrders: number;
  /** Times the lifeline rope hauled the frog back (at most once a day). */
  rope: number;
  codRight: number;
  codTips: number;
  codLoss: number;
  /** Most parcels handed over in one trip from the truck. */
  bestTrip: number;
  /** An urgent parcel made it within the day-2 challenge time. */
  fastUrgent: boolean;
  extra?: DayExtra;
}

/** More about the day, for the career totals and the river news (see career.ts). */
export interface DayExtra {
  jumps: number;
  /** Farthest jump, design units. */
  longest: number;
  /** Parcels fished back out of the river. */
  rescued: number;
  /** The id of the lost letter picked up on the road, if any (see LETTERS in lines.ts). */
  letter: string | null;
  /** Every parcel: who got it (`to`), who it was for (`owner`), and how it ended. */
  parcels: { to: string; owner: string; species: string; state: 'delivered' | 'wrong' | 'wet' | 'missed'; urgent: boolean }[];
}

const GRADES: Record<string, { name: string; line: string }> = {
  S: { name: '完 美', line: '完美！河湾线就靠你了。' },
  A: { name: '优 秀', line: '不错嘛，明天继续保持。' },
  B: { name: '良 好', line: '今天……还行吧。' },
  C: { name: '及 格', line: '这样下去，工资要扣光了。' },
  D: { name: '待改进', line: '勉强过关，明天用心点。' },
};
/** The rating stamp on a day that wasn't passed, whatever the score. */
const FAILED = '未通过';
const TENTHS = '零一二三四五六七八九十';
const ORDER = 'SABCD';

const ROW_GAP = 0.28;
/** First row of the report and the distance between rows, on the sheet. */
const ROW_Y = 154;
const ROW_H = 42;
const SHEET_H = 622;
/** Share of the wide shot the polaroid shows. */
const THUMB_CROP = 0.6;


interface Row {
  icon: 'ok' | 'wrong' | 'wet' | 'miss' | 'rope' | 'urgent' | 'cod' | 'stamp';
  label: string;
  value: string;
  money: string;
  color?: string;
}

export class HqScene implements Scene {
  readonly id = 'hq';
  private t = 0;
  private grade: string;
  private income: number;
  private stamps: [boolean, boolean, boolean];
  /** Stamps earned for the first time today. */
  private fresh: boolean[];
  private pass: boolean;
  /** This run passed a chapter's last day for the first time: the next chapter opens. */
  private chapterDone = false;
  private note: string;
  private owlLine: string;
  private left: Row[];
  private right: Row[];
  private stampAt: number;
  private endAt: number;
  private btns: { id: string; rect: Rect }[] = [];
  private viewBtn: Rect | null = null;
  private pressed: string | null = null;
  /** The press on 'view0' came from the 看大图 button rather than the first polaroid. */
  private viewBtnHeld = false;
  /** Polaroids on the sheet, in screen coordinates, for opening the big view; and their 收藏 hearts. */
  private thumbs: Rect[] = [];
  private hearts: Rect[] = [];
  private viewer: PhotoViewer | null = null;
  private toast: { text: string; t: number } | null = null;
  /** What the day added to the career: bonus coins, rank, achievements, news. */
  private rec: DayRecord;
  private rankCoins: number;
  private cheered = false;
  private stamped = false;
  private ticks = 0;
  private snaps = 0;

  constructor(private game: Game, private r: DayResult) {
    const score = r.total ? (r.delivered + 0.3 * r.urgentOnTime - 0.5 * r.wrong - 0.5 * r.wet) / r.total : 0;
    let grade = score >= 0.95 && r.wrong + r.wet === 0 && r.delivered === r.total ? 'S' : score >= 0.75 ? 'A' : score >= 0.5 ? 'B' : score >= 0.25 ? 'C' : 'D';
    if (r.thrown && ORDER.indexOf(grade) < 2) grade = 'B';
    this.pass = passed(r);
    // a day that has to be run again doesn't get a passing mark on its stamp
    if (!this.pass) grade = 'D';
    this.grade = grade;
    this.income = r.pay + r.bonus + r.codTips - r.penalty - r.codLoss;
    this.stamps = earnedStamps(dayConfig(r.day), r, grade);
    const had = game.save.stamps[r.day] ?? [];
    this.fresh = this.stamps.map((v, i) => v && !had[i]);
    // higher ranks get a share more of the base pay
    this.rankCoins = Math.round(r.pay * rankOf(game.save).pay);
    this.owlLine = this.owl(!!had[0]);
    this.note = this.noteLine();
    const pay = r.pay + this.rankCoins;
    const rope = r.rope || 0;
    this.left = [
      { icon: 'ok', label: '正确配送', value: `${r.delivered} 单`, money: pay ? `+${pay}` : '0' },
      { icon: 'wrong', label: '错误配送', value: `${r.wrong} 单`, money: r.wrong ? `-${r.wrong * TUNING.wrongPenalty}` : '0' },
      { icon: 'wet', label: '落水损坏', value: `${r.wet} 单`, money: r.wet ? `-${r.wet * TUNING.wetPenalty}` : '0' },
      { icon: 'miss', label: '漏送', value: `${r.missed} 单`, money: '—' },
      { icon: 'rope', label: '救命绳', value: `${rope} 次`, money: rope ? `-${rope * TUNING.ropePenalty}` : '0' },
    ];
    const cod = r.codTips - r.codLoss;
    this.right = [
      { icon: 'urgent', label: '加急准时', value: r.urgentTotal ? `${r.urgentOnTime} / ${r.urgentTotal}` : '—', money: r.bonus ? `+${r.bonus}` : '' },
      { icon: 'cod', label: '到付找零', value: r.codTotal ? `${r.codRight} / ${r.codTotal}` : '—', money: cod > 0 ? `+${cod}` : cod < 0 ? `${cod}` : '' },
      { icon: 'stamp', label: '好评章', value: '', money: '' },
    ];
    this.stampAt = 0.7 + (Math.max(this.left.length, this.right.length + 1) + 1) * ROW_GAP + 0.35;
    this.endAt = this.stampAt + 0.5 + r.photos.length * 0.28 + 0.2;

    // Save progress
    const s = game.save;
    this.chapterDone = this.pass && s.day <= r.day && r.day % DAYS_PER_CHAPTER === 0 && r.day < game.lastDay;
    // only a passed day opens the next one
    if (this.pass) s.day = Math.max(s.day, Math.min(r.day + 1, game.lastDay));
    if (this.pass && r.day >= game.lastDay) s.cleared = true;
    s.stamps[r.day] = this.stamps.map((v, i) => v || !!had[i]);
    const prev = s.best[r.day];
    if (!prev || ORDER.indexOf(grade) < ORDER.indexOf(prev)) s.best[r.day] = grade;
    // pay, the work log, river news, rank and achievements (coins go in there too)
    this.rec = recordDay(s, r, { grade, stamps: this.stamps, fresh: this.fresh, income: this.income, rankCoins: this.rankCoins, owl: this.owlLine, pass: this.pass });
    if (this.rec.stampCoins) this.right[2].money = `+${this.rec.stampCoins}`;
    this.income += this.rec.stampCoins + this.rankCoins;
    game.writeSave();
    game.tm.log('hq', {
      grade, pass: this.pass, stamps: this.stamps, fresh: this.fresh, income: this.income, coins: s.coins, photos: r.photos.length,
      rankUp: this.rec.rankUp?.name ?? null, ach: this.rec.unlocked.map((a) => a.id), news: this.rec.notes.length,
    });
    game.audio.setMusic(this.pass ? SCENE_MUSIC.hq : SCENE_MUSIC.hqLow);
    game.audio.setAmbience(null);
    game.audio.play('paper_flip', { delay: 0.15 });
    game.audio.play('owl_hoot', { delay: 0.5, volume: 0.8 });
  }

  /** There is a next day, and it's open. */
  private get canNext() {
    return this.r.day < this.game.lastDay && this.game.save.day > this.r.day;
  }

  /** The owl's line: it never says "tomorrow" about a day that has to be run again, or the other way round. */
  private owl(passedBefore: boolean) {
    const r = this.r;
    // (the bubble holds about eleven characters)
    if (r.thrown) return passedBefore ? '被甩出去了？坐稳点。' : '被甩出去了，得重跑！';
    if (!this.pass) {
      if (passedBefore) return '送少了，好在早就过了。';
      if (r.day <= 1) return '送对一半就算过，再来！';
      if (passRate(r.day) < PASS_RATE) return '五成就算过，再来一次！';
      return '送对的太少，得重跑。';
    }
    if (r.day >= this.game.lastDay) return this.grade === 'S' ? '完美收官！辛苦啦。' : '最后一单送完，辛苦啦！';
    if (this.grade !== 'S' && this.grade !== 'A' && r.falls >= 3) return '是来送快递，还是游泳？';
    return GRADES[this.grade].line;
  }

  /** The note under the figures: about the day's biggest slip, if there was one. */
  private noteLine() {
    const r = this.r;
    if (r.thrown) return '“跟紧运输车，可别掉到河湾外面去。”';
    const slips: [number, string][] = [
      [r.wet, '“包裹泡了水，可不算送到哦。”'],
      [r.wrong, `“${r.wrongNames[0] ?? '有位邻居'}说没买过这个……”`],
      [r.missed, `“还有 ${r.missed} 个包裹没送出去。”`],
    ];
    const worst = slips.reduce((a, b) => (b[0] > a[0] ? b : a));
    if (worst[0] > 0) return worst[1];
    if (r.rope) return '“救命绳是救急用的，可别天天拽。”';
    return '“干净利落，我喜欢。”';
  }

  /** The rank-up and achievement ribbons, once the paperwork is done or on the way out. */
  private cheer() {
    if (this.cheered) return;
    this.cheered = true;
    this.game.celebrate(this.rec.unlocked, this.rec.rankUp);
  }

  /** The buttons work once they're fully shown; before that a tap skips the paperwork. */
  private get live() {
    return this.t >= this.stampAt + 0.3;
  }

  private playStamp() {
    const au = this.game.audio;
    au.play('stamp');
    const good = ORDER.indexOf(this.grade) <= 2;
    au.play(good ? 'rating_good' : 'rating_bad', { delay: 0.35 });
    au.play(good ? 'owl_pleased' : 'owl_hmm', { delay: 1.5, volume: 0.8 });
    if (this.chapterDone) {
      au.play('chapter_clear', { delay: 0.9 });
      const c = chapterOf(this.r.day);
      this.toast = { text: `第${'一二三四五六七'[c]}章完成！新河段开放了`, t: -0.9 };
    }
  }

  update(dt: number) {
    this.t += dt;
    this.viewer?.update(dt);
    if (this.toast && (this.toast.t += dt) > 2.4) this.toast = null;
    // the paperwork is done: now the rank and achievements
    if (this.t >= this.endAt + 0.3) this.cheer();
    const rowsShown = Math.floor((this.t - 0.7) / ROW_GAP) + 1;
    const nRows = Math.max(this.left.length, this.right.length + 1) + 1;
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
    if (this.viewer) return this.viewer.down(x, y);
    if (this.live) for (const b of this.btns) if (hit(b.rect, x, y)) this.pressed = b.id;
    this.hearts.forEach((r, i) => {
      if (!this.pressed && hit(r, x, y, 4)) this.pressed = `keep${i}`;
    });
    this.viewBtnHeld = false;
    if (this.viewBtn && hit(this.viewBtn, x, y, 8)) {
      this.pressed = 'view0';
      this.viewBtnHeld = true;
    }
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
    this.viewer?.move(x);
  }

  up(x: number, y: number) {
    if (this.viewer) return this.viewer.up(x, y);
    const id = this.pressed;
    this.pressed = null;
    if (!id) return;
    if (id.startsWith('keep')) {
      const i = Number(id.slice(4));
      if (this.hearts[i] && hit(this.hearts[i], x, y, 8)) this.keep(i);
      return;
    }
    if (id.startsWith('view')) {
      const i = Number(id.slice(4));
      const r = id === 'view0' && this.viewBtn && hit(this.viewBtn, x, y, 8) ? this.viewBtn : this.thumbs[i];
      if (r && hit(r, x, y, 8)) this.openView(i);
      return;
    }
    const b = this.btns.find((b) => b.id === id);
    if (!b || !hit(b.rect, x, y)) return;
    // leaving before the ribbons came up still shows them (on the next screen that isn't a day's run)
    if (id !== 'next' || this.canNext) this.cheer();
    this.game.audio.play('ui_tap');
    this.game.platform.showImage(null);
    this.game.tm.log('hq_btn', { id, open: id !== 'next' || this.canNext, sec: Math.round(this.t) });
    if (id === 'retry') this.game.go(new PlayScene(this.game, this.r.day));
    else if (id === 'home') this.game.go(new HubScene(this.game), true);
    else if (id === 'next') {
      if (this.canNext) this.game.go(new PlayScene(this.game, this.r.day + 1));
      else {
        const why = this.r.thrown ? '被甩出去了，这一天要重跑' : `第${this.r.day}天送对${TENTHS[Math.round(passRate(this.r.day) * 10)]}成以上`;
        this.toast = { text: `${why}才能解锁下一天`, t: 0 };
      }
    }
  }

  // ---------------------------------------------------------------- big view, keeping photos

  /** Puts a photo of the day in the album (to hang at home later), or takes it back out. */
  private keep(i: number) {
    const p = this.r.photos[i];
    const al = this.game.album;
    if (!p) return;
    const had = al.keptId(p);
    if (had) {
      al.remove(had);
      this.toast = { text: '已从相册拿出来了', t: 0 };
      this.game.audio.play('paper_flip', { volume: 0.7 });
      this.game.tm.log('photo_keep', { i, kind: p.kind, on: false });
      return;
    }
    const res = al.add(p, this.r.day);
    if (res === 'full') this.toast = { text: '相册满了，先去总部删掉几张', t: 0 };
    else if (res === 'failed') this.toast = { text: '没存上，手机空间可能不够了', t: 0 };
    else {
      this.toast = { text: '收藏好了，回家可以挂到墙上', t: 0 };
      this.game.audio.play('photo_shutter', { volume: 0.6 });
    }
    this.game.tm.log('photo_keep', { i, kind: p.kind, on: res !== 'full' && res !== 'failed', n: al.list.length });
  }

  private viewerPhotos(): ViewerPhoto[] {
    return this.r.photos.map((p, i) => ({ key: `d${i}`, img: () => p.img, caption: p.caption, footer: `蛙趣快递 · 第 ${this.r.day} 天 · 今日精彩瞬间` }));
  }

  private openView(i: number) {
    if (!this.r.photos[i]) return;
    this.game.tm.log('photo', { i, kind: this.r.photos[i].kind });
    this.viewer = new PhotoViewer(this.game, this.viewerPhotos(), i,
      (_p, k) => [
        { id: 'close', label: '关闭' },
        { id: 'keep', label: this.game.album.keptId(this.r.photos[k]) ? '已收藏 ♥' : '收藏' },
        { id: 'save', label: '存到手机', primary: true },
      ],
      (id, k) => this.viewAction(id, k), '今日精彩瞬间');
  }

  private viewAction(id: string, i: number) {
    const v = this.viewer!;
    if (id === 'close') {
      v.close();
      this.viewer = null;
      this.game.audio.play('ui_close');
    } else if (id === 'keep') this.keep(i);
    else if (id === 'save') {
      this.game.audio.play('ui_tap');
      const p = this.r.photos[i];
      void v.save(`waqu-day${this.r.day}-${i + 1}.jpg`).then((m) => {
        this.game.tm.log('photo_save', { i, kind: p.kind, res: m });
        if (m) this.toast = { text: m, t: 0 };
      });
    }
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
    sp.draw(ctx, todSprite('hq_room', todAt()), 0, roomTop);
    clockHands(ctx, HQ_CLOCK.x, roomTop + HQ_CLOCK.y, HQ_CLOCK.r, new Date());
    // the HQ sign, hanging from the picture rail
    woodSign(ctx, 375, contentTop + 54, 420, 84, '蛙趣快递 · 河湾总部', undefined, { wood: P.woodDeep, hang: contentTop + 54 - 42 - (roomTop + 126), size: 32 });

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
    if (show < 1) {
      // still filling in the report: the buttons aren't there yet, a tap anywhere skips ahead
      ctx.save();
      ctx.globalAlpha = 1 - show;
      panel(ctx, 375 - 150, btnTop + 14, 300, 56, { r: 28, fill: P.cream });
      text(ctx, '轻点任意处跳过', 375, btnTop + 43, 26, { color: P.inkSoft });
      ctx.restore();
    }
    ctx.save();
    ctx.globalAlpha = show;
    if (last) {
      this.btns = [
        { id: 'retry', rect: { x: 40, y: btnTop, w: 310, h: 84 } },
        { id: 'home', rect: { x: 390, y: btnTop, w: 320, h: 84 } },
      ];
      button(ctx, 40, btnTop, 310, 84, '再来一次', { pressed: this.pressed === 'retry', size: 32 });
      button(ctx, 390, btnTop, 320, 84, '回主页 →', { primary: true, pressed: this.pressed === 'home', size: 32 });
    } else {
      this.btns = [
        { id: 'retry', rect: { x: 24, y: btnTop, w: 220, h: 84 } },
        { id: 'home', rect: { x: 258, y: btnTop, w: 200, h: 84 } },
        { id: 'next', rect: { x: 472, y: btnTop, w: 254, h: 84 } },
      ];
      button(ctx, 24, btnTop, 220, 84, '再来一次', { primary: !this.canNext, pressed: this.pressed === 'retry', size: 30 });
      button(ctx, 258, btnTop, 200, 84, '回主页', { pressed: this.pressed === 'home', size: 30 });
      button(ctx, 472, btnTop, 254, 84, '下一天 →', { primary: this.canNext, disabled: !this.canNext, pressed: this.pressed === 'next', size: 30 });
    }
    ctx.restore();

    if (this.viewer) this.viewer.render(ctx);
    if (this.toast && this.toast.t >= 0) {
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
    // the two columns fill in side by side
    this.left.forEach((row, i) => this.drawRow(ctx, row, 34, ROW_Y + i * ROW_H, 296, shown(i)));
    this.right.forEach((row, i) => this.drawRow(ctx, row, 372, ROW_Y + i * ROW_H, 300, shown(i + 0.5)));
    // the day's three stamps, the new ones thumped down one after another
    const sa = shown(2.5);
    if (sa > 0) {
      ctx.save();
      ctx.globalAlpha = sa;
      for (let i = 0; i < 3; i++) {
        const fresh = this.fresh[i];
        const k = clamp((this.t - this.stampAt - 0.2 - i * 0.15) / 0.15, 0, 1);
        const sc = fresh ? 1.6 - 0.6 * k : 1;
        ctx.save();
        ctx.translate(518 + i * 35, ROW_Y + 2 * ROW_H);
        ctx.scale(sc, sc);
        drawStamp(ctx, 0, 0, 15, this.stamps[i] && (!fresh || k > 0), i + 1);
        ctx.restore();
      }
      ctx.restore();
    }
    // income box
    const nRows = Math.max(this.left.length, this.right.length + 1);
    const ia = shown(nRows);
    const iy = ROW_Y + 3 * ROW_H - 10;
    if (ia > 0) {
      ctx.save();
      ctx.globalAlpha = ia;
      roundRect(ctx, 366, iy, 306, 54, 12);
      ctx.fillStyle = '#F0E2C4';
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.stroke();
      text(ctx, '今日收入', 384, iy + 28, 28, { align: 'left', bold: true });
      sp.draw(ctx, 'coin', 548, iy + 27, 0.75);
      const k = clamp((this.t - 0.7 - nRows * ROW_GAP) / 0.6, 0, 1);
      const v = Math.round(this.income * k);
      text(ctx, `${v >= 0 ? '+' : ''}${v}`, 656, iy + 29, 34, { align: 'right', bold: true, color: v >= 0 ? P.lilyDeep : P.red });
      ctx.restore();
    }
    // owl's note
    if (this.t > this.stampAt) text(ctx, `${this.note} —— 猫头鹰经理`, 351, 366, 23, { color: P.inkSoft, maxWidth: 640, alpha: clamp((this.t - this.stampAt) / 0.4, 0, 1) });

    // highlights
    text(ctx, '今日精彩瞬间', 351, 398, 28, { bold: true });
    ctx.strokeStyle = P.orange;
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(271, 416);
    ctx.quadraticCurveTo(351, 423, 431, 416);
    ctx.stroke();
    const photos = this.r.photos;
    const sheetTop = this.sheetScreenTop();
    if (photos.length) {
      this.viewBtn = { x: 24 + 560, y: sheetTop + 380, w: 110, h: 38 };
      const down = this.pressed === 'view0' && this.viewBtnHeld;
      pressIn(ctx, { x: 560, y: 380, w: 110, h: 38 }, down);
      roundRect(ctx, 560, 380, 110, 38, 19);
      ctx.fillStyle = P.cream;
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.8;
      ctx.stroke();
      text(ctx, '看大图', 615, 400, 22, { bold: true });
      pressOut(ctx, down, () => roundRect(ctx, 560, 380, 110, 38, 19));
    }
    const n = photos.length;
    this.thumbs = [];
    this.hearts = [];
    photos.forEach((p, i) => {
      const k = clamp((this.t - this.stampAt - 0.5 - i * 0.28) / 0.3, 0, 1);
      if (k <= 0) return;
      const cx = n === 1 ? 351 : n === 2 ? 236 + i * 230 : 120 + i * 231;
      this.thumbs[i] = { x: 24 + cx - 100, y: sheetTop + 522 - 96, w: 200, h: 192 };
      const rot = [-0.05, 0.035, -0.03][i];
      const down = this.pressed === `view${i}` && !(i === 0 && this.viewBtnHeld);
      ctx.save();
      ctx.globalAlpha = k;
      ctx.translate(cx, 522 - (1 - easeOutBack(k)) * 30);
      ctx.rotate(rot);
      if (down) ctx.scale(0.94, 0.94);
      this.polaroid(ctx, p);
      if (down) {
        ctx.fillStyle = 'rgba(36,28,22,0.22)';
        ctx.fillRect(-100, -96, 200, 192);
      }
      // 收藏: keep it in the album, to hang at home
      const kept = !!this.game.album.keptId(p);
      const hd = this.pressed === `keep${i}`;
      ctx.translate(76, -70);
      if (hd) ctx.scale(0.88, 0.88);
      ellipse(ctx, 0, 0, 25, 25);
      ctx.fillStyle = kept ? P.red : P.white;
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.stroke();
      heartPath(ctx, 0, 1, 12);
      ctx.fillStyle = kept ? P.white : 'rgba(217,83,79,0.25)';
      ctx.fill();
      ctx.strokeStyle = kept ? P.white : P.red;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
      this.hearts[i] = { x: 24 + cx + 76 - 32, y: sheetTop + 522 - 70 - 32, w: 64, h: 64 };
    });
    if (!n) emptyState(ctx, 351, 436, 'boat', '今天风平浪静，没拍到照片', undefined, { size: 112 });
    else if (this.t > this.endAt && !photos.some((p) => this.game.album.keptId(p))) text(ctx, '点 ♥ 收藏进相册', 40, 400, 19, { align: 'left', color: P.inkSoft });

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
      text(ctx, this.pass ? GRADES[this.grade].name : FAILED, 0, 42, 16, { color: P.red, bold: true });
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
    const bg = { ok: P.lily, wrong: P.gold, wet: P.blueLight, miss: P.paperShade, rope: P.orange, urgent: P.red, cod: P.lilyLight, stamp: P.pink }[kind];
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
    } else if (kind === 'rope') {
      // a coil of rope, as on the lifeline tag in the day
      ctx.lineWidth = 2.2;
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.moveTo(x + 3.5, y);
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.stroke();
    } else if (kind === 'urgent') {
      ctx.moveTo(x, y - 8);
      ctx.lineTo(x, y);
      ctx.lineTo(x + 6, y + 4);
      ctx.stroke();
    } else if (kind === 'cod') {
      text(ctx, '¥', x, y + 1, 20, { bold: true, color: P.lilyDeep });
    } else {
      ctx.lineWidth = 2;
      ellipse(ctx, x, y, 8, 8);
      ctx.stroke();
    }
  }
}

/** A small heart centred on (x, y). */
function heartPath(ctx: Ctx, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x, y + r * 0.9);
  ctx.bezierCurveTo(x - r * 1.4, y - r * 0.1, x - r * 0.7, y - r * 1.2, x, y - r * 0.45);
  ctx.bezierCurveTo(x + r * 0.7, y - r * 1.2, x + r * 1.4, y - r * 0.1, x, y + r * 0.9);
  ctx.closePath();
}
