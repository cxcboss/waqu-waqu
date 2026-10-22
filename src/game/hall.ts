// The HQ hall (河湾总部), open between workdays: the frog's delivery record, the work log, the
// photo album, the wall of honour (achievements) and the river news, with the owl behind the counter.
import { INK, P } from '../art/palette';
import { HQ_ROOM, K } from '../art/sprites';
import { ellipse, roundRect, text, wrapText } from '../art/ui';
import { clamp } from '../engine/math';
import type { Ctx } from '../platform/types';
import { ALBUM_MAX } from './album';
import { ACHIEVEMENTS, RANKS, rankIndex, stampCount, unreadNotes, type NoteKind } from './career';
import { item } from './catalog';
import { DAYS } from './config';
import type { Game, Scene } from './game';
import { HubScene } from './hub';
import { drawStamp } from './map';
import { Scroller, Taps, Toast, dot, header, shortDate, tabs } from './menu';
import { PhotoViewer, type ViewerPhoto } from './viewer';

const TABS = ['送单', '日志', '相册', '荣誉', '动态'];
const OWL = [
  '这是你的送单记录，继续保持。',
  '每天下班的工作日志都在这里。',
  '收藏的照片在这儿，回家能挂起来。',
  '有的奖励，福利社都买不到。',
  '河湾里最近发生的事，看看吧。',
];
const NOTE_ICON: Record<NoteKind, [string, string]> = {
  story: ['拆', P.lily], mixup: ['?', P.gold], soaked: ['湿', P.blueLight], letter: ['信', P.orange],
  stamp: ['章', P.pink], rank: ['升', P.red], ach: ['★', P.gold],
};

export class HallScene implements Scene {
  readonly id = 'hall';
  private t = 0;
  private tab = 0;
  private tabT = 0;
  private taps = new Taps();
  private scroll = new Scroller();
  private toast = new Toast();
  private viewer: PhotoViewer | null = null;
  /** Unread news when the hall opened, and the last news seen before, so new lines keep their dot this visit. */
  private unread: number;
  private seen0: number;
  /** Work-log pages opened up to show everything. */
  private open = new Set<number>();

  constructor(private game: Game, tab = 0) {
    this.tab = tab;
    this.unread = unreadNotes(game.save);
    this.seen0 = game.save.seen.notes;
    game.audio.setMusic('bgm_hq');
    game.audio.play('owl_hoot', { delay: 0.3, volume: 0.6 });
    game.tm.log('hall', { tab, notes: this.unread });
    if (tab === 4) this.markRead();
  }

  private markRead() {
    const s = this.game.save;
    const top = s.notes[0]?.id ?? 0;
    if (top > s.seen.notes) {
      s.seen.notes = top;
      this.game.writeSave();
    }
  }

  update(dt: number) {
    this.t += dt;
    this.tabT += dt;
    this.scroll.update(dt);
    this.toast.update(dt);
    this.viewer?.update(dt);
  }

  down(x: number, y: number) {
    if (this.viewer) return this.viewer.down(x, y);
    this.taps.down(x, y);
    this.scroll.down(x, y);
  }
  move(x: number, y: number) {
    if (this.viewer) return this.viewer.move(x);
    this.taps.move(x, y);
    this.scroll.move(x, y);
  }
  up(x: number, y: number) {
    if (this.viewer) return this.viewer.up(x, y);
    this.scroll.up();
    const id = this.taps.up(x, y);
    if (!id) return;
    const au = this.game.audio;
    if (id === 'back') {
      au.play('ui_back');
      this.game.go(new HubScene(this.game), true);
    } else if (id.startsWith('tab')) {
      const i = Number(id.slice(3));
      if (i === this.tab) return;
      au.play('paper_flip', { volume: 0.7 });
      this.tab = i;
      this.tabT = 0;
      this.scroll.reset();
      this.game.tm.log('hall_tab', { tab: TABS[i] });
      if (i === 4) this.markRead();
    } else if (id.startsWith('log')) {
      const n = Number(id.slice(3));
      au.play('ui_tap');
      if (this.open.has(n)) this.open.delete(n);
      else this.open.add(n);
    } else if (id.startsWith('photo')) {
      this.openPhoto(Number(id.slice(5)));
    }
  }

  // ---------------------------------------------------------------- album

  private photos(): ViewerPhoto[] {
    const al = this.game.album;
    return al.list.map((a) => ({ key: a.id, img: () => al.image(a.id), caption: a.caption, footer: `蛙趣快递 · 第 ${a.day} 天 · ${shortDate(a.at)}` }));
  }

  private openPhoto(i: number) {
    this.game.tm.log('album_view', { i, n: this.game.album.list.length });
    this.viewer = new PhotoViewer(this.game, this.photos(), i,
      () => [{ id: 'close', label: '关闭' }, { id: 'del', label: '移出相册' }, { id: 'save', label: '存到手机', primary: true }],
      (id, k) => this.viewerAction(id, k), '相册');
  }

  private viewerAction(id: string, i: number) {
    const v = this.viewer!;
    const al = this.game.album;
    if (id === 'close') {
      v.close();
      this.viewer = null;
      this.game.audio.play('ui_close');
    } else if (id === 'save') {
      this.game.audio.play('ui_tap');
      void v.save(`waqu-album-${i + 1}.jpg`).then((m) => m && this.toast.show(m));
    } else if (id === 'del') {
      const a = al.list[i];
      if (!a) return;
      al.remove(a.id);
      this.game.tm.log('album_del', { n: al.list.length });
      this.game.audio.play('paper_flip');
      this.toast.show('已移出相册');
      if (!al.list.length) {
        v.close();
        this.viewer = null;
      } else v.setPhotos(this.photos());
    }
  }

  // ---------------------------------------------------------------- drawing

  render(ctx: Ctx) {
    const g = this.game;
    const H = g.H, top = g.safeT, bot = H - g.safeB;
    const sp = g.sprites;
    this.taps.clear();
    const counterY = top + 380;
    const roomTop = counterY + 36 - HQ_ROOM.h;
    ctx.fillStyle = '#C9A37A';
    ctx.fillRect(0, 0, 750, H);
    sp.draw(ctx, 'hq_room', 0, roomTop);
    if (roomTop > 0) {
      ctx.fillStyle = '#EEDFC0';
      ctx.fillRect(0, 0, 750, roomTop + 1);
    }
    const ox = 640 * K, oy = counterY + 3;
    const bob = Math.sin(this.t * 2) * 2;
    sp.draw(ctx, 'owl', ox, oy + bob, 0.92);
    sp.draw(ctx, 'owl_wing', ox + 96 * K, oy + bob - 138 * K, 0.92, 0.92, -0.1 + Math.sin(this.t * 1.5) * 0.04);
    sp.draw(ctx, 'hq_counter', 0, counterY);
    this.bubble(ctx, 250, counterY - 150, OWL[this.tab]);

    const sheetTop = counterY + 110, sheetBot = bot - 16;
    tabs(ctx, this.taps, 'tab', 24, sheetTop - 58, 702, TABS, this.tab, [false, false, false, false, this.unread > 0 && this.tab !== 4]);
    roundRect(ctx, 16, sheetTop, 718, sheetBot - sheetTop, 18);
    ctx.fillStyle = P.paper;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.2;
    ctx.stroke();
    this.scroll.view = { x: 16, y: sheetTop + 6, w: 718, h: sheetBot - sheetTop - 12 };
    this.scroll.begin(ctx);
    const y0 = sheetTop + 22;
    const h = [() => this.drawRecord(ctx, y0), () => this.drawLog(ctx, y0), () => this.drawAlbum(ctx, y0), () => this.drawHonour(ctx, y0), () => this.drawNews(ctx, y0)][this.tab]();
    this.scroll.end(ctx);
    this.scroll.setContent(h - sheetTop + 20);

    header(ctx, g, this.taps, '河湾总部');
    if (this.viewer) this.viewer.render(ctx);
    this.toast.render(ctx, top + 110);
  }

  private bubble(ctx: Ctx, x: number, y: number, line: string) {
    const w = 330, h = 68;
    roundRect(ctx, x - w / 2, y - h / 2, w, h, 22);
    ctx.fillStyle = P.white;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.2;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + 120, y + h / 2 - 1);
    ctx.lineTo(x + 150, y + h / 2 + 22);
    ctx.lineTo(x + 146, y + h / 2 - 1);
    ctx.fillStyle = P.white;
    ctx.fill();
    ctx.stroke();
    text(ctx, line, x, y + 1, 24, { bold: true, maxWidth: w - 30 });
  }

  /** Section heading inside the sheet. */
  private heading(ctx: Ctx, s: string, y: number, right?: string) {
    text(ctx, s, 48, y, 28, { bold: true, align: 'left' });
    if (right) text(ctx, right, 702, y, 22, { align: 'right', color: P.inkSoft });
    ctx.strokeStyle = P.kraft;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(48, y + 24);
    ctx.lineTo(702, y + 24);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  private empty(ctx: Ctx, y: number, a: string, b: string) {
    text(ctx, a, 375, y + 80, 28, { bold: true, color: P.inkSoft });
    text(ctx, b, 375, y + 124, 22, { color: P.inkSoft, maxWidth: 620 });
    return y + 180;
  }

  // 送单情况: rank, the numbers, best day by day, who gets the most parcels
  private drawRecord(ctx: Ctx, y: number) {
    const s = this.game.save;
    const k = s.career;
    const sp = this.game.sprites;
    const n = stampCount(s);
    const ri = rankIndex(n);
    const next = RANKS[ri + 1];
    roundRect(ctx, 40, y, 670, 110, 16);
    ctx.fillStyle = P.cream;
    ctx.fill();
    text(ctx, `职级：${RANKS[ri].name}`, 64, y + 34, 30, { bold: true, align: 'left' });
    text(ctx, next ? `下一级「${next.name}」还差 ${next.need - n} 枚好评章` : '已经是最高职级', 64, y + 78, 22, { align: 'left', color: P.inkSoft });
    const bx = 470, bw = 210;
    roundRect(ctx, bx, y + 30, bw, 22, 11);
    ctx.fillStyle = P.paperShade;
    ctx.fill();
    const kk = next ? clamp((n - RANKS[ri].need) / (next.need - RANKS[ri].need), 0, 1) : 1;
    if (kk > 0) {
      roundRect(ctx, bx, y + 30, Math.max(22, bw * kk), 22, 11);
      ctx.fillStyle = P.gold;
      ctx.fill();
    }
    roundRect(ctx, bx, y + 30, bw, 22, 11);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.stroke();
    text(ctx, `${n} 枚`, bx + bw / 2, y + 78, 22, { bold: true });
    y += 140;

    this.heading(ctx, '送单情况', y);
    y += 50;
    const sent = k.delivered + k.wrong + k.wet + k.missed;
    const tiles: [string, string][] = [
      ['上班', `${k.runs} 天`], ['正确送达', `${k.delivered} 单`],
      ['送对率', sent ? `${Math.round((k.delivered / sent) * 100)}%` : '—'], ['错投 / 泡水', `${k.wrong} / ${k.wet}`],
      ['加急准时', `${k.urgentOnTime} / ${k.urgent}`], ['到付找零对', `${k.codRight} / ${k.cod}`],
      ['落水', `${k.falls} 次`], ['救回包裹', `${k.rescued} 个`],
      ['最远一跳', k.longest ? `${(k.longest / 100).toFixed(1)} 米` : '—'], ['一趟最多', `${k.bestTrip} 个`],
      ['被甩出去', `${k.thrown} 次`], ['累计收入', `${k.earned} 金币`],
    ];
    tiles.forEach(([a, b], i) => {
      const tx = 40 + (i % 2) * 340, ty = y + Math.floor(i / 2) * 92;
      roundRect(ctx, tx, ty, 330, 80, 14);
      ctx.fillStyle = P.white;
      ctx.fill();
      ctx.strokeStyle = P.kraft;
      ctx.lineWidth = 2;
      ctx.stroke();
      text(ctx, a, tx + 22, ty + 40, 24, { align: 'left', color: P.inkSoft });
      text(ctx, b, tx + 308, ty + 41, 30, { align: 'right', bold: true });
    });
    y += Math.ceil(tiles.length / 2) * 92 + 30;

    this.heading(ctx, '每天的最好成绩', y);
    y += 56;
    for (const d of DAYS) {
      const open = d.day <= s.day;
      text(ctx, `第${d.day}天 · ${d.name}`, 56, y + 2, 26, { align: 'left', color: open ? INK : P.inkSoft });
      const got = s.stamps[d.day] ?? [];
      for (let i = 0; i < 3; i++) drawStamp(ctx, 470 + i * 40, y, 16, !!got[i], i + 1);
      const best = s.best[d.day];
      text(ctx, best ?? (open ? '—' : '未解锁'), 660, y + 2, best ? 34 : 22, { bold: !!best, color: best ? P.red : P.inkSoft });
      y += 56;
    }
    y += 20;

    const who = Object.entries(k.byResident).sort((a, b) => b[1].n - a[1].n).slice(0, 6);
    this.heading(ctx, '常送的居民', y);
    y += 56;
    if (!who.length) {
      text(ctx, '还没给谁送过包裹', 375, y + 10, 24, { color: P.inkSoft });
      return y + 60;
    }
    const max = who[0][1].n;
    for (const [name, e] of who) {
      const av = `avatar_${e.species}`;
      if (sp.has(av)) sp.draw(ctx, av, 76, y + 4, 0.62);
      else {
        ellipse(ctx, 76, y + 4, 24, 24);
        ctx.fillStyle = P.lilyLight;
        ctx.fill();
      }
      text(ctx, name, 116, y + 4, 26, { align: 'left' });
      roundRect(ctx, 290, y - 8, 330 * (e.n / max), 24, 12);
      ctx.fillStyle = P.lily;
      ctx.fill();
      text(ctx, `${e.n} 单`, 690, y + 4, 24, { align: 'right', bold: true });
      y += 64;
    }
    return y;
  }

  // 工作日志: one page per day worked, newest first; tap a page to read all of it
  private drawLog(ctx: Ctx, y: number) {
    const s = this.game.save;
    if (!s.log.length) return this.empty(ctx, y, '还没有工作日志', '每天下班回总部结算后，这里会自动记一页');
    this.heading(ctx, '工作日志', y, `最近 ${s.log.length} 天`);
    y += 50;
    for (const e of s.log) {
      const open = this.open.has(e.n);
      const lines: string[] = [];
      if (open) {
        lines.push(`猫头鹰评语：${e.owl}`);
        if (e.story) lines.push(`今日趣事：${e.story}`);
        if (e.photo) lines.push(`精彩瞬间：${e.photo}`);
        lines.push(`落水 ${e.falls} 次${e.thrown ? ' · 被甩出了屏幕' : ''}${e.missed ? ` · 漏送 ${e.missed} 单` : ''}`);
      }
      ctx.save();
      const wrapped = lines.flatMap((l) => wrapText(ctx, l, 22, 560));
      ctx.restore();
      const h = 128 + wrapped.length * 32 + (open ? 14 : 0);
      const r = { x: 40, y, w: 670, h };
      const sr = this.scroll.screen(r);
      if (sr) this.taps.add(`log${e.n}`, sr);
      roundRect(ctx, r.x, r.y, r.w, r.h, 16);
      ctx.fillStyle = this.taps.pressed === `log${e.n}` ? P.paperShade : P.white;
      ctx.fill();
      ctx.strokeStyle = P.kraft;
      ctx.lineWidth = 2;
      ctx.stroke();
      const name = DAYS[e.day - 1]?.name ?? '';
      text(ctx, `第 ${e.n} 次上班 · ${shortDate(e.at)}`, 64, y + 32, 22, { align: 'left', color: P.inkSoft });
      text(ctx, `第${e.day}天 · ${name}`, 64, y + 70, 30, { align: 'left', bold: true, maxWidth: 420 });
      text(ctx, `送达 ${e.delivered}/${e.total} · 错投 ${e.wrong} · 泡水 ${e.wet} · 收入 ${e.income >= 0 ? '+' : ''}${e.income}`, 64, y + 106, 22, { align: 'left' });
      // grade postmark
      ctx.save();
      ctx.translate(640, y + 62);
      ctx.rotate(-0.2);
      ctx.strokeStyle = e.pass ? P.red : P.inkSoft;
      ctx.lineWidth = 3;
      ellipse(ctx, 0, 0, 36, 36);
      ctx.stroke();
      text(ctx, e.grade, 0, 2, 40, { bold: true, color: e.pass ? P.red : P.inkSoft });
      ctx.restore();
      for (let i = 0; i < 3; i++) drawStamp(ctx, 518 + i * 32, y + 32, 12, !!e.stamps[i], i + 1);
      wrapped.forEach((l, i) => text(ctx, l, 64, y + 146 + i * 32, 22, { align: 'left', color: P.inkSoft }));
      if (!open) text(ctx, '点开看详情', 690, y + 106, 18, { align: 'right', color: P.inkSoft });
      y += h + 16;
    }
    return y;
  }

  // 相册: kept photos as polaroids; tap one to see it big
  private drawAlbum(ctx: Ctx, y: number) {
    const al = this.game.album;
    const list = al.list;
    if (!list.length) return this.empty(ctx, y, '相册还是空的', '下班结算时，点照片上的「收藏」就会放进相册');
    this.heading(ctx, '我的相册', y, `${list.length} / ${ALBUM_MAX} 张`);
    y += 50;
    const cw = 206, ch = 200;
    list.forEach((a, i) => {
      const col = i % 3, row = Math.floor(i / 3);
      const cx = 48 + col * (cw + 22), cy = y + row * (ch + 24);
      const r = { x: cx, y: cy, w: cw, h: ch };
      const sr = this.scroll.screen(r);
      const down = !!sr && this.taps.add(`photo${i}`, sr);
      ctx.save();
      ctx.translate(cx + cw / 2, cy + ch / 2);
      ctx.rotate([-0.03, 0.02, -0.015][i % 3]);
      if (down) ctx.scale(0.94, 0.94);
      ctx.fillStyle = P.paperShade;
      ctx.fillRect(-cw / 2 + 4, -ch / 2 + 6, cw, ch);
      ctx.fillStyle = '#FFFDF7';
      ctx.fillRect(-cw / 2, -ch / 2, cw, ch);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.strokeRect(-cw / 2, -ch / 2, cw, ch);
      const img = sr ? al.image(a.id) : null;
      const iw = cw - 20, ih = 136;
      if (img) {
        // crop to the frame's shape from the middle
        const k = Math.min(img.width / iw, img.height / ih);
        const sw = iw * k, sh = ih * k;
        ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, -iw / 2, -ch / 2 + 10, iw, ih);
      } else {
        ctx.fillStyle = P.paperShade;
        ctx.fillRect(-iw / 2, -ch / 2 + 10, iw, ih);
      }
      ctx.strokeRect(-iw / 2, -ch / 2 + 10, iw, ih);
      text(ctx, a.caption, 0, ch / 2 - 34, 20, { bold: true, maxWidth: cw - 16 });
      text(ctx, `第${a.day}天`, 0, ch / 2 - 12, 16, { color: P.inkSoft });
      if (this.game.save.room.frames.some((f) => f?.photo === a.id)) {
        roundRect(ctx, cw / 2 - 58, -ch / 2 + 16, 50, 26, 13);
        ctx.fillStyle = P.orange;
        ctx.fill();
        text(ctx, '挂着', cw / 2 - 33, -ch / 2 + 30, 16, { bold: true, color: P.white });
      }
      if (down) {
        ctx.fillStyle = 'rgba(36,28,22,0.18)';
        ctx.fillRect(-cw / 2, -ch / 2, cw, ch);
      }
      ctx.restore();
    });
    return y + Math.ceil(list.length / 3) * (ch + 24) + 10;
  }

  // 荣誉墙: every achievement with its progress and reward
  private drawHonour(ctx: Ctx, y: number) {
    const s = this.game.save;
    const got = ACHIEVEMENTS.filter((a) => s.ach[a.id]).length;
    this.heading(ctx, '荣誉墙', y, `已达成 ${got} / ${ACHIEVEMENTS.length}`);
    y += 50;
    const sorted = [...ACHIEVEMENTS].sort((a, b) => Number(!!s.ach[b.id]) - Number(!!s.ach[a.id]));
    for (const a of sorted) {
      const done = !!s.ach[a.id];
      const v = Math.min(a.goal, a.value(s));
      roundRect(ctx, 40, y, 670, 112, 16);
      ctx.fillStyle = done ? '#FDF3D2' : P.white;
      ctx.fill();
      ctx.strokeStyle = done ? P.gold : P.kraft;
      ctx.lineWidth = 2;
      ctx.stroke();
      ellipse(ctx, 96, y + 56, 34, 34);
      ctx.fillStyle = done ? P.gold : P.paperShade;
      ctx.fill();
      ctx.strokeStyle = done ? INK : 'rgba(74,59,48,0.4)';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      text(ctx, '★', 96, y + 58, 34, { color: done ? P.white : 'rgba(74,59,48,0.3)', bold: true });
      text(ctx, a.name, 148, y + 32, 28, { align: 'left', bold: true, color: done ? INK : P.inkSoft });
      text(ctx, a.desc, 148, y + 66, 21, { align: 'left', color: P.inkSoft, maxWidth: 380 });
      const reward = `+${a.coins} 金币${a.reward ? ` · ${item(a.reward)?.name}` : ''}`;
      text(ctx, reward, 148, y + 94, 19, { align: 'left', color: P.orangeDeep, bold: true, maxWidth: 380 });
      if (done) text(ctx, `${shortDate(s.ach[a.id])}达成`, 686, y + 56, 20, { align: 'right', color: P.lilyDeep, bold: true });
      else {
        const bx = 540, bw = 146;
        roundRect(ctx, bx, y + 46, bw, 18, 9);
        ctx.fillStyle = P.paperShade;
        ctx.fill();
        if (v > 0) {
          roundRect(ctx, bx, y + 46, Math.max(18, (bw * v) / a.goal), 18, 9);
          ctx.fillStyle = P.lily;
          ctx.fill();
        }
        text(ctx, a.goal >= 100 && a.id === 'longjump' ? `${(v / 100).toFixed(1)} / ${(a.goal / 100).toFixed(1)} 米` : `${v} / ${a.goal}`, bx + bw / 2, y + 86, 20, { color: P.inkSoft });
      }
      y += 124;
    }
    return y;
  }

  // 河湾动态: news, newest first
  private drawNews(ctx: Ctx, y: number) {
    const s = this.game.save;
    if (!s.notes.length) return this.empty(ctx, y, '河湾里还很安静', '送出包裹后，居民们的趣事会出现在这里');
    this.heading(ctx, '河湾动态', y, `${s.notes.length} 条`);
    y += 50;
    for (const n of s.notes) {
      ctx.save();
      const lines = wrapText(ctx, n.text, 24, 540);
      ctx.restore();
      const h = 52 + lines.length * 34;
      roundRect(ctx, 40, y, 670, h, 16);
      ctx.fillStyle = P.white;
      ctx.fill();
      ctx.strokeStyle = P.kraft;
      ctx.lineWidth = 2;
      ctx.stroke();
      const [glyph, color] = NOTE_ICON[n.kind] ?? ['·', P.kraft];
      ellipse(ctx, 86, y + 40, 26, 26);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.stroke();
      text(ctx, glyph, 86, y + 42, 24, { bold: true, color: P.white });
      lines.forEach((l, i) => text(ctx, l, 130, y + 38 + i * 34, 24, { align: 'left' }));
      text(ctx, `${n.day ? `第${n.day}天 · ` : ''}${shortDate(n.at)}`, 686, y + h - 20, 18, { align: 'right', color: P.inkSoft });
      if (n.id > this.seen0) dot(ctx, 62, y + 16, 8);
      y += h + 14;
    }
    return y;
  }
}
