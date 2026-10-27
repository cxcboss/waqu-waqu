// The frog's home (我的家): its room with a photo wall for pictures kept from HQ, furniture bought at
// the shop, the wardrobe, a desk with personal records and the money book, and the letters found.
import { todSprite } from '../art/codeart';
import { alpha, drawBaked, frame, frameOpening, FRAME_KINDS, lampGlow, todAt, type FrameKind } from '../art/kit';
import { INK, P } from '../art/palette';
import { homeRoom } from '../art/room';
import { button, ellipse, roundRect, text, wrapText, type Rect } from '../art/ui';
import { clamp } from '../engine/math';
import type { Ctx, ImageSource } from '../platform/types';
import { RANKS, newMail, rankIndex, stampCount, stampsPossible } from './career';
import { ITEMS, item, type ItemKind } from './catalog';
import { DAYS, YEAR_END } from './config';
import type { Game, Scene } from './game';
import { HallScene } from './hall';
import { HubScene } from './hub';
import { FIRST_LETTER, LETTERS, STORY, letterText } from './lines';
import { Scroller, Taps, Toast, dialog, dot, drawDressedFrog, header, iconAt, pill, shortDate, tabs } from './menu';
import { PlayScene } from './play';
import { ShopScene } from './shop';
import { SCENE_MUSIC } from './sound';

type Modal =
  | { kind: 'hang'; slot: number; frame: string }
  | { kind: 'wardrobe' }
  | { kind: 'records'; tab: number }
  /** `open`: the old turtle's letter being read (its day, 0 for the first one), or -1. */
  | { kind: 'letters'; tab: number; open: number }
  | { kind: 'decor' };

export const ALL_LETTERS = LETTERS.length;

export class HomeScene implements Scene {
  readonly id = 'home';
  private t = 0;
  private taps = new Taps();
  private toast = new Toast();
  private modal: (Modal & { t: number }) | null = null;
  private mScroll = new Scroller();
  private joy = 0;
  private slots: Rect[] = [];

  constructor(private game: Game) {
    game.audio.setMusic(SCENE_MUSIC.home);
    game.audio.setAmbience(null);
    void game.sprites.ensure(ITEMS.map((i) => i.id));
    game.tm.log('home', { frames: game.save.room.frames.filter(Boolean).length, decos: this.decos().length });
  }

  private decos() {
    const s = this.game.save;
    return ITEMS.filter((i) => i.kind === 'deco' && s.owned.includes(i.id));
  }
  private shown(id: string) {
    const s = this.game.save;
    return s.owned.includes(id) && !s.room.hidden.includes(id);
  }

  update(dt: number) {
    this.t += dt;
    this.toast.update(dt);
    this.mScroll.update(dt);
    if (this.modal) this.modal.t += dt;
    this.joy = Math.max(0, this.joy - dt);
  }

  down(x: number, y: number) {
    this.taps.down(x, y);
    if (this.modal) this.mScroll.down(x, y);
  }
  move(x: number, y: number) {
    this.taps.move(x, y);
    if (this.modal) this.mScroll.move(x, y);
  }
  up(x: number, y: number) {
    this.mScroll.up();
    const id = this.taps.up(x, y);
    if (!id) return;
    const g = this.game;
    const s = g.save;
    const au = g.audio;
    if (this.modal) return this.modalTap(id);
    if (id === 'back') {
      au.play('ui_back');
      g.go(new HubScene(g), true);
    } else if (id.startsWith('slot')) {
      const i = Number(id.slice(4));
      this.openModal({ kind: 'hang', slot: i, frame: s.room.frames[i]?.frame ?? this.lastFrame() });
    } else if (id === 'wardrobe') this.openModal({ kind: 'wardrobe' });
    else if (id === 'records') this.openModal({ kind: 'records', tab: 0 });
    else if (id === 'letters') {
      // opens on whichever has something new; the turtle's letters first
      const road = s.letters.length > s.seen.letters && s.story.length <= s.seen.story;
      this.openModal({ kind: 'letters', tab: road ? 1 : 0, open: -1 });
      if (newMail(s)) {
        s.seen.letters = s.letters.length;
        s.seen.story = s.story.length;
        g.writeSave();
      }
    } else if (id === 'decor') this.openModal({ kind: 'decor' });
    else if (id === 'frog') {
      this.joy = 0.6;
      au.play('frog_croak', { jitter: true });
    }
  }

  private lastFrame() {
    const s = this.game.save;
    return s.room.frames.find(Boolean)?.frame ?? 'frame_wood';
  }

  private openModal(m: Modal) {
    this.modal = { ...m, t: 0 };
    this.mScroll.reset();
    this.game.audio.play('ui_open');
    this.game.tm.log('home_open', { what: m.kind });
  }

  private closeModal() {
    this.modal = null;
    this.game.audio.play('ui_close');
  }

  private modalTap(id: string) {
    const m = this.modal!;
    const g = this.game;
    const s = g.save;
    const au = g.audio;
    if (id.endsWith('Out') || id === 'close') return this.closeModal();
    if (id === 'shop') {
      au.play('ui_confirm');
      g.go(new ShopScene(g, m.kind === 'wardrobe' ? 1 : m.kind === 'hang' ? 3 : 2), true);
      return;
    }
    if (id === 'hall') {
      au.play('ui_confirm');
      g.go(new HallScene(g, 2), true);
      return;
    }
    if (m.kind === 'hang') {
      if (id.startsWith('fr_')) {
        m.frame = id.slice(3);
        const cur = s.room.frames[m.slot];
        if (cur) {
          cur.frame = m.frame;
          g.writeSave();
        }
        au.play('ui_tap');
      } else if (id.startsWith('ph_')) {
        const photo = id.slice(3);
        s.room.frames[m.slot] = { photo, frame: m.frame };
        g.writeSave();
        g.tm.log('photo_hang', { slot: m.slot, frame: m.frame, hung: s.room.frames.filter(Boolean).length });
        au.play('frame_tap');
        this.toast.show('挂好啦！');
        this.modal = null;
      } else if (id === 'unhang') {
        s.room.frames[m.slot] = null;
        g.writeSave();
        au.play('paper_flip');
        this.modal = null;
      }
    } else if (m.kind === 'wardrobe') {
      const [slot, val] = id.split(':');
      if (slot === 'hat' || slot === 'neck') {
        s.wear[slot] = val === 'none' ? null : val;
        g.writeSave();
        g.tm.log('wear', { slot, id: s.wear[slot] });
        au.play('equip');
        this.joy = 0.6;
      }
    } else if (m.kind === 'letters') {
      if (id.startsWith('lt')) {
        m.tab = Number(id.slice(2));
        m.open = -1;
        this.mScroll.reset();
        au.play('tab_switch');
      } else if (id.startsWith('st_')) {
        m.open = Number(id.slice(3));
        au.play('letter_open', { volume: 0.8 });
        g.tm.log('story_read', { n: m.open });
      } else if (id === 'stBack') {
        m.open = -1;
        au.play('paper_flip', { volume: 0.7 });
      } else if (id === 'stPrev' || id === 'stNext') {
        const have = this.storyShelf();
        const i = have.indexOf(m.open) + (id === 'stPrev' ? -1 : 1);
        if (i >= 0 && i < have.length) {
          m.open = have[i];
          au.play('paper_flip', { volume: 0.7 });
        }
      } else if (id === 'secret' && s.secret === 1) {
        au.play('ui_confirm');
        g.tm.log('secret_start', {});
        g.go(new PlayScene(g, 0), true);
      }
    } else if (m.kind === 'records') {
      if (id.startsWith('rt')) {
        m.tab = Number(id.slice(2));
        this.mScroll.reset();
        au.play('tab_switch');
      }
    } else if (m.kind === 'decor') {
      if (id.startsWith('dc_')) {
        const d = id.slice(3);
        const h = s.room.hidden;
        if (h.includes(d)) s.room.hidden = h.filter((x) => x !== d);
        else h.push(d);
        g.writeSave();
        au.play('ui_tap');
      }
    }
  }

  // ---------------------------------------------------------------- the room

  render(ctx: Ctx) {
    const g = this.game;
    const H = g.H, top = g.safeT, bot = H - g.safeB;
    const sp = g.sprites;
    const s = g.save;
    this.taps.clear();
    const roomTop = top + 96, roomBot = bot - 130;
    // the wall is just tall enough for two rows of photos; the floor takes the rest
    const floorY = roomTop + clamp((roomBot - roomTop) * 0.46, 560, 640);
    const tod = todAt();
    const at = (name: string) => todSprite(name, tod);

    // wall things: window, photo wall, shelf, clock, lights (hung down from the wainscot)
    const row2 = floorY - 230, row1 = row2 - 170;
    const wy = row1 - 80;
    drawBaked(ctx, `homeroom:${tod.name}:${Math.round(floorY)}:${Math.round(H)}`, 0, 0, [0, 0, 750, H], (c) => homeRoom(c, tod, floorY, H, 630, wy + 230));
    sp.draw(ctx, at('home_window'), 630, wy + 122);
    if (this.shown('deco_curtain')) sp.draw(ctx, 'deco_curtain', 630, wy + 252);
    if (this.shown('deco_fish')) sp.draw(ctx, 'deco_fish', 630, wy + 216);
    this.slots = [];
    for (let i = 0; i < 6; i++) {
      const cx = [100, 236, 372][i % 3], cy = i < 3 ? row1 : row2;
      this.drawSlot(ctx, i, cx, cy);
    }
    if (this.shown('deco_lights')) sp.draw(ctx, 'deco_lights', 236, row1 - 116);
    if (this.shown('deco_clock')) {
      const sw = Math.sin(this.t * 2.4) * 0.12;
      sp.draw(ctx, 'deco_clock', 487, row1 + 20, 1, 1, sw * 0.1);
    }
    if (this.shown('deco_shelf')) sp.draw(ctx, 'deco_shelf', 470, floorY - 80);
    if (this.shown('deco_painting')) sp.draw(ctx, 'deco_painting', 487, row2 + 28);
    if (this.shown('deco_flag')) sp.draw(ctx, at('deco_flag'), 46, floorY + 40);

    // floor things, back to front; on a tall screen they spread out over the deeper floor
    const fs = clamp((roomBot - 40 - floorY) / 520, 1, 1.4);
    const fy = (d: number) => floorY + d * fs;
    const bedY = Math.min(roomBot - 30, fy(470));
    if (this.shown('deco_rug')) sp.draw(ctx, at('deco_rug'), 375, fy(200));
    else sp.draw(ctx, 'home_rug', 375, fy(210));
    if (this.shown('deco_record')) {
      sp.draw(ctx, 'deco_record', 140, floorY + 70);
      // notes floating up from the horn
      for (let i = 0; i < 2; i++) {
        const k = (this.t * 0.4 + i / 2) % 1;
        text(ctx, '♪', 114 - k * 30, floorY - 54 - k * 60, 26, { color: P.orangeDeep, alpha: 1 - k });
      }
    }
    if (this.shown('deco_trophy')) sp.draw(ctx, 'deco_trophy', 142, fy(290));
    if (this.shown('deco_globe')) sp.draw(ctx, 'deco_globe', 548, fy(362));
    if (this.shown('deco_cushion')) sp.draw(ctx, at('deco_cushion'), 255, fy(397));
    if (this.shown('deco_hammock')) sp.draw(ctx, 'deco_hammock', 470, bedY + 8);
    if (this.shown('deco_teatable')) sp.draw(ctx, 'deco_teatable', 345, fy(475));
    const desk = { x: 420, y: floorY + 110 };
    sp.draw(ctx, 'home_desk', desk.x, desk.y);
    if (this.shown('deco_lamp')) {
      sp.draw(ctx, 'deco_lamp', desk.x - 96, desk.y - 118);
      lampGlow(ctx, desk.x - 96, desk.y - 190, 150, tod, this.t);
    }
    this.taps.add('records', { x: desk.x - 111, y: desk.y - 160, w: 150, h: 160 });
    this.taps.add('letters', { x: desk.x + 10, y: desk.y - 160, w: 100, h: 160 });
    if (newMail(s)) dot(ctx, desk.x + 82, desk.y - 156);
    // the mailbox by the door: the same letters as the desk, with a flag that waves when something new came
    const mx = 690, my = fy(335);
    sp.draw(ctx, 'home_mailbox', mx, my);
    this.taps.add('letters', { x: mx - 46, y: my - 146, w: 92, h: 150 });
    if (newMail(s)) dot(ctx, mx + 30, my - 140);
    sp.draw(ctx, 'home_wardrobe', 646, floorY + 96);
    this.taps.add('wardrobe', { x: 566, y: floorY + 96 - 290, w: 160, h: 290 });
    this.drawFrog(ctx, 375, fy(210));
    sp.draw(ctx, 'home_bed', 140, bedY);
    if (this.shown('deco_plant')) sp.draw(ctx, at('deco_plant'), 650, bedY - 6);

    header(ctx, g, this.taps, `${s.name}的家`);
    this.toolbar(ctx, bot - 118);
    if (this.modal) this.drawModal(ctx);
    this.toast.render(ctx, top + 110);
  }

  /** One hook on the photo wall: a framed photo, or a dashed outline asking for one. */
  private drawSlot(ctx: Ctx, i: number, cx: number, cy: number) {
    const s = this.game.save;
    const f = s.room.frames[i];
    const w = 134, h = 110;
    const r = { x: cx - w / 2 - 6, y: cy - h / 2 - 20, w: w + 12, h: h + 30 };
    const down = this.taps.add(`slot${i}`, r, 4);
    this.slots[i] = r;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate([-0.04, 0.03, -0.02, 0.025, -0.035, 0.02][i]);
    if (down) ctx.scale(0.94, 0.94);
    if (!f) {
      ctx.setLineDash([8, 6]);
      ctx.strokeStyle = 'rgba(74,59,48,0.4)';
      ctx.lineWidth = 2.5;
      roundRect(ctx, -w / 2, -h / 2, w, h, 8);
      ctx.stroke();
      ctx.setLineDash([]);
      text(ctx, '+', 0, -10, 40, { color: 'rgba(74,59,48,0.45)', bold: true });
      text(ctx, '挂照片', 0, 26, 20, { color: 'rgba(74,59,48,0.55)' });
    } else {
      // string and nail
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-w / 3, -h / 2);
      ctx.lineTo(0, -h / 2 - 22);
      ctx.lineTo(w / 3, -h / 2);
      ctx.stroke();
      ellipse(ctx, 0, -h / 2 - 22, 4, 4);
      ctx.fillStyle = P.silver;
      ctx.fill();
      ctx.stroke();
      drawFrame(ctx, f.frame, -w / 2, -h / 2, w, h, this.game.album.image(f.photo));
    }
    ctx.restore();
  }

  private drawFrog(ctx: Ctx, x: number, y: number) {
    let z = Math.max(0, Math.sin(this.t * 2.2)) * 4;
    let pose = this.t % 7 < 5 ? 'frog_stand' : 'frog_happy';
    if (this.joy > 0) {
      z = Math.sin((1 - this.joy / 0.6) * Math.PI) * 46;
      pose = 'frog_happy';
    }
    ctx.save();
    ctx.globalAlpha = 0.25;
    ellipse(ctx, x, y + 2, 44 - z * 0.12, 12);
    ctx.fillStyle = INK;
    ctx.fill();
    ctx.restore();
    drawDressedFrog(ctx, this.game.sprites, this.game.save.wear, pose, x, y - z, 0.95);
    this.taps.add('frog', { x: x - 70, y: y - 180, w: 140, h: 190 });
  }

  private toolbar(ctx: Ctx, y: number) {
    const s = this.game.save;
    const items: [string, string, boolean][] = [
      ['wardrobe', '衣柜', false], ['records', '个人记录', false], ['letters', '信箱', newMail(s)], ['decor', '布置', false],
    ];
    const w = 164, gap = 12, x0 = 375 - (items.length * w + (items.length - 1) * gap) / 2;
    items.forEach(([id, label, isNew], i) => {
      const x = x0 + i * (w + gap);
      pill(ctx, this.taps, id, x, y, w, 84, label, { size: 30, fill: P.paper });
      if (isNew) dot(ctx, x + w - 14, y + 10);
    });
  }

  // ---------------------------------------------------------------- dialogs

  private drawModal(ctx: Ctx) {
    const m = this.modal!;
    const g = this.game;
    const H = g.H;
    ctx.save();
    const tall = Math.min(H - g.safeT - g.safeB - 140, 1060);
    // the photo picker is only as tall as the album needs
    const fit = m.kind === 'hang' ? Math.max(560, 320 + Math.ceil(g.album.list.length / 3) * 186)
      : m.kind === 'wardrobe' ? 900
        : m.kind === 'letters' ? tall
          : m.kind === 'decor' ? Math.max(520, 190 + Math.ceil(this.decos().length / 3) * 218)
            : tall;
    const d = dialog(ctx, g, this.taps, 'm', 690, Math.min(tall, fit), m.t);
    if (m.kind === 'hang') this.drawHang(ctx, d, m);
    else if (m.kind === 'wardrobe') this.drawWardrobe(ctx, d);
    else if (m.kind === 'records') this.drawRecords(ctx, d, m);
    else if (m.kind === 'letters') this.drawLetters(ctx, d, m);
    else this.drawDecor(ctx, d);
    pill(ctx, this.taps, 'close', d.x + d.w - 84, d.y + 18, 64, 56, '✕', { size: 28 });
    ctx.restore();
  }

  /** A scrolling area inside a dialog. */
  private area(ctx: Ctx, d: Rect, y: number, bottomPad = 24) {
    this.mScroll.view = { x: d.x + 10, y, w: d.w - 20, h: d.y + d.h - bottomPad - y };
    this.mScroll.begin(ctx);
  }

  private drawHang(ctx: Ctx, d: Rect, m: Extract<Modal, { kind: 'hang' }>) {
    const g = this.game;
    const s = g.save;
    text(ctx, '挂一张照片', d.x + 40, d.y + 48, 34, { bold: true, align: 'left' });
    // frame styles owned
    const frames = ITEMS.filter((i) => i.kind === 'frame');
    let x = d.x + 36;
    const fy = d.y + 96;
    text(ctx, '相框', x, fy + 30, 24, { align: 'left', color: P.inkSoft });
    x += 66;
    for (const f of frames) {
      const own = s.owned.includes(f.id);
      if (!own) continue;
      const on = m.frame === f.id;
      const r = { x, y: fy, w: 128, h: 60 };
      const down = this.taps.add(`fr_${f.id}`, r, 4);
      ctx.save();
      if (down) ctx.globalAlpha = 0.7;
      roundRect(ctx, r.x, r.y, r.w, r.h, 12);
      ctx.fillStyle = on ? '#FDF3D2' : P.white;
      ctx.fill();
      ctx.strokeStyle = on ? P.orange : P.kraft;
      ctx.lineWidth = on ? 3.5 : 2;
      ctx.stroke();
      drawFrame(ctx, f.id, r.x + 10, r.y + 12, 40, 36, null);
      text(ctx, f.name.replace('相框', ''), r.x + 88, r.y + 31, 22, { bold: on, maxWidth: 70 });
      ctx.restore();
      x += 140;
    }
    if (frames.some((f) => !s.owned.includes(f.id))) pill(ctx, this.taps, 'shop', d.x + d.w - 170, fy + 4, 140, 52, '更多相框', { size: 22 });
    const cur = s.room.frames[m.slot];
    const list = g.album.list;
    const gy = fy + 90;
    if (!list.length) {
      text(ctx, '相册里还没有照片', 375, gy + 120, 28, { bold: true, color: P.inkSoft });
      text(ctx, '下班结算时点照片上的「收藏」，就能拿回家挂', 375, gy + 166, 22, { color: P.inkSoft, maxWidth: 600 });
      pill(ctx, this.taps, 'hall', 375 - 130, gy + 220, 260, 64, '去总部看相册', { size: 24 });
      return;
    }
    text(ctx, cur ? '换一张，或者取下来' : '从相册里选一张', d.x + 40, gy + 6, 24, { align: 'left', color: P.inkSoft });
    if (cur) pill(ctx, this.taps, 'unhang', d.x + d.w - 170, gy - 22, 140, 52, '取下', { size: 22 });
    this.area(ctx, d, gy + 34);
    const cw = 196, ch = 170;
    list.forEach((a, i) => {
      const cx = d.x + 30 + (i % 3) * (cw + 14), cy = gy + 44 + Math.floor(i / 3) * (ch + 16);
      const sr = this.mScroll.screen({ x: cx, y: cy, w: cw, h: ch });
      const down = !!sr && this.taps.add(`ph_${a.id}`, sr);
      const on = cur?.photo === a.id;
      const elsewhere = s.room.frames.some((f, k) => k !== m.slot && f?.photo === a.id);
      ctx.save();
      if (down) ctx.globalAlpha = 0.7;
      roundRect(ctx, cx, cy, cw, ch, 10);
      ctx.fillStyle = on ? '#FDF3D2' : P.white;
      ctx.fill();
      ctx.strokeStyle = on ? P.orange : P.kraft;
      ctx.lineWidth = on ? 3.5 : 2;
      ctx.stroke();
      const img = sr ? g.album.image(a.id) : null;
      drawPhoto(ctx, img, cx + 10, cy + 10, cw - 20, 112);
      text(ctx, a.caption, cx + cw / 2, cy + 146, 20, { bold: true, maxWidth: cw - 16 });
      if (elsewhere) {
        roundRect(ctx, cx + cw - 64, cy + 14, 54, 26, 13);
        ctx.fillStyle = P.orange;
        ctx.fill();
        text(ctx, '已挂', cx + cw - 37, cy + 28, 16, { bold: true, color: P.white });
      }
      ctx.restore();
    });
    this.mScroll.end(ctx);
    this.mScroll.setContent(Math.ceil(list.length / 3) * (ch + 16) + 30);
  }

  private drawWardrobe(ctx: Ctx, d: Rect) {
    const g = this.game;
    const s = g.save;
    text(ctx, '衣柜', d.x + 40, d.y + 48, 34, { bold: true, align: 'left' });
    // the frog trying things on
    roundRect(ctx, d.x + 30, d.y + 90, d.w - 60, 250, 18);
    ctx.fillStyle = P.tealLight;
    ctx.fill();
    const hop = this.joy > 0 ? Math.sin((1 - this.joy / 0.6) * Math.PI) * 30 : 0;
    iconAt(ctx, g.sprites, 'home_wardrobe_open', d.x + d.w - 150, d.y + 168, 300);
    drawDressedFrog(ctx, g.sprites, s.wear, this.joy > 0 ? 'frog_happy' : 'frog_stand', d.x + 190, d.y + 320 - hop, 1.05);
    let y = d.y + 380;
    for (const [slot, label, kind] of [['hat', '帽子', 'hat'], ['neck', '脖子上', 'neck']] as const) {
      text(ctx, label, d.x + 40, y, 26, { bold: true, align: 'left' });
      y += 24;
      const owned = ITEMS.filter((i) => i.kind === (kind as ItemKind) && s.owned.includes(i.id));
      const opts = [{ id: 'none', name: slot === 'hat' ? '邮差帽' : '不戴' }, ...owned];
      opts.forEach((o, i) => {
        const cx = d.x + 30 + (i % 5) * 128, cy = y + Math.floor(i / 5) * 132;
        const on = (s.wear[slot] ?? 'none') === o.id;
        const r = { x: cx, y: cy, w: 118, h: 120 };
        const down = this.taps.add(`${slot}:${o.id}`, r, 2);
        ctx.save();
        if (down) ctx.globalAlpha = 0.7;
        roundRect(ctx, r.x, r.y, r.w, r.h, 14);
        ctx.fillStyle = on ? '#FDF3D2' : P.white;
        ctx.fill();
        ctx.strokeStyle = on ? P.orange : P.kraft;
        ctx.lineWidth = on ? 3.5 : 2;
        ctx.stroke();
        if (o.id !== 'none' && g.sprites.has(o.id)) g.sprites.draw(ctx, o.id, cx + 59, cy + (slot === 'hat' ? 70 : 46), slot === 'hat' ? 0.85 : 1);
        else if (slot === 'hat') courierCap(ctx, cx + 59, cy + 62);
        else text(ctx, '—', cx + 59, cy + 50, 36, { color: P.inkSoft });
        text(ctx, o.name, cx + 59, cy + 102, 19, { bold: on, maxWidth: 108 });
        ctx.restore();
      });
      y += Math.ceil(opts.length / 5) * 132 + 30;
    }
    if (ITEMS.some((i) => (i.kind === 'hat' || i.kind === 'neck') && i.price && !s.owned.includes(i.id))) pill(ctx, this.taps, 'shop', 375 - 140, d.y + d.h - 90, 280, 64, '去福利社买衣帽', { size: 24 });
  }

  private drawRecords(ctx: Ctx, d: Rect, m: Extract<Modal, { kind: 'records' }>) {
    const g = this.game;
    const s = g.save;
    const k = s.career;
    text(ctx, '个人记录', d.x + 40, d.y + 48, 34, { bold: true, align: 'left' });
    if (m.tab === 1) iconAt(ctx, g.sprites, 'home_ledger', d.x + d.w - 235, d.y + 50, 96);
    tabs(ctx, this.taps, 'rt', d.x + 30, d.y + 100, d.w - 60, ['我的记录', '账本'], m.tab);
    ctx.fillStyle = P.paper;
    ctx.fillRect(d.x + 24, d.y + 160, d.w - 48, 4);
    this.area(ctx, d, d.y + 166);
    let y = d.y + 190;
    if (m.tab === 0) {
      const best = Object.values(s.best).sort((a, b) => 'SABCD'.indexOf(a) - 'SABCD'.indexOf(b))[0] ?? null;
      const rows: [string, string][] = [
        ['名字', s.name], ['职级', RANKS[rankIndex(stampCount(s))].name], ['入职', shortDate(s.since)],
        ['上班天数', `${k.runs} 天`], ['好评章', `${stampCount(s)} / ${stampsPossible()}`], ['成就', `${Object.keys(s.ach).length} 个`],
        ['最远一跳', k.longest ? `${(k.longest / 100).toFixed(1)} 米` : '还没跳过远的'], ['一趟最多送出', `${k.bestTrip} 个包裹`],
        ['最好评级', best ?? '—'], ['完美的一天', `${k.sGrades} 次`], ['零失误', `${k.cleanDays} 天`],
        ['总跳跃', `${k.jumps} 次`], ['落水', `${k.falls} 次`], ['救回包裹', `${k.rescued} 个`],
        ['衣帽', `${s.owned.filter((id) => ['hat', 'neck'].includes(item(id)?.kind ?? '')).length} 件`],
        ['家具', `${this.decos().length} 件`], ['相册', `${s.album.length} 张`], ['找到的信', `${s.letters.length} / ${ALL_LETTERS} 封`],
      ];
      rows.forEach(([a, b], i) => {
        const ry = y + i * 56;
        if (i % 2 === 0) {
          roundRect(ctx, d.x + 30, ry - 24, d.w - 60, 52, 10);
          ctx.fillStyle = P.cream;
          ctx.fill();
        }
        text(ctx, a, d.x + 56, ry + 2, 25, { align: 'left', color: P.inkSoft });
        text(ctx, b, d.x + d.w - 56, ry + 2, 26, { align: 'right', bold: true, maxWidth: 380 });
      });
      y += rows.length * 56;
      const days = DAYS.filter((dd) => s.best[dd.day]).length;
      text(ctx, `跑过 ${days} / ${DAYS.length} 条线路`, 375, y + 20, 22, { color: P.inkSoft });
      y += 50;
    } else {
      // the money book
      const tiles: [string, string, string][] = [['现有', `${s.coins}`, INK], ['累计收入', `+${k.earned}`, P.lilyDeep], ['累计花费', k.spent ? `-${k.spent}` : '0', P.red]];
      tiles.forEach(([a, b, c], i) => {
        const tx = d.x + 30 + i * ((d.w - 60) / 3);
        roundRect(ctx, tx + 4, y - 10, (d.w - 60) / 3 - 8, 90, 14);
        ctx.fillStyle = P.cream;
        ctx.fill();
        text(ctx, a, tx + (d.w - 60) / 6, y + 16, 22, { color: P.inkSoft });
        text(ctx, b, tx + (d.w - 60) / 6, y + 54, 32, { bold: true, color: c });
      });
      y += 110;
      if (!s.ledger.length) text(ctx, '还没有收支记录', 375, y + 30, 24, { color: P.inkSoft });
      for (const e of s.ledger) {
        text(ctx, shortDate(e.at), d.x + 46, y + 4, 20, { align: 'left', color: P.inkSoft });
        text(ctx, e.text, d.x + 150, y + 4, 24, { align: 'left', maxWidth: 350 });
        text(ctx, `${e.amount >= 0 ? '+' : ''}${e.amount}`, d.x + d.w - 46, y + 4, 26, { align: 'right', bold: true, color: e.amount >= 0 ? P.lilyDeep : P.red });
        ctx.strokeStyle = P.kraft;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 7]);
        ctx.beginPath();
        ctx.moveTo(d.x + 40, y + 28);
        ctx.lineTo(d.x + d.w - 40, y + 28);
        ctx.stroke();
        ctx.setLineDash([]);
        y += 56;
      }
    }
    this.mScroll.end(ctx);
    this.mScroll.setContent(y - (d.y + 166) + 20);
  }

  /** The old turtle's letters found so far, in order: the first one (0) once it's been delivered, then by day. */
  private storyShelf() {
    const s = this.game.save;
    return [...(s.secret >= 2 ? [0] : []), ...s.story];
  }

  private drawLetters(ctx: Ctx, d: Rect, m: Extract<Modal, { kind: 'letters' }>) {
    text(ctx, '信箱', d.x + 40, d.y + 48, 34, { bold: true, align: 'left' });
    tabs(ctx, this.taps, 'lt', d.x + 30, d.y + 100, d.w - 60, ['乌龟爷爷的信', '路上捡的信'], m.tab);
    ctx.fillStyle = P.paper;
    ctx.fillRect(d.x + 24, d.y + 160, d.w - 48, 4);
    if (m.tab === 1) this.drawRoadLetters(ctx, d);
    else if (m.open >= 0) this.drawStoryLetter(ctx, d, m.open);
    else this.drawStoryShelf(ctx, d);
  }

  /** Thirty envelopes, one for each day's river; the ones not found yet are blank. */
  private drawStoryShelf(ctx: Ctx, d: Rect) {
    const s = this.game.save;
    this.area(ctx, d, d.y + 166);
    let y = d.y + 192;
    text(ctx, `找到 ${s.story.length} / ${YEAR_END} 封`, d.x + 44, y + 14, 26, { bold: true, align: 'left' });
    y += 44;
    const intro = wrapText(ctx, '乌龟爷爷年轻时写给老朋友阿灰的信，一直没寄出去，被春天的大水冲散了。每天的河上漂着一封，跳到那片荷叶上就能捡到。', 22, d.w - 88);
    intro.forEach((l, i) => text(ctx, l, d.x + 44, y + i * 34, 22, { align: 'left', color: P.inkSoft }));
    y += intro.length * 34 + 10;
    // 第0号快递: once all thirty are in, the first letter waits to be taken up the river
    if (s.secret >= 1) {
      const r = { x: d.x + 34, y, w: d.w - 68, h: 132 };
      roundRect(ctx, r.x, r.y, r.w, r.h, 16);
      ctx.fillStyle = '#FDF3D2';
      ctx.fill();
      ctx.strokeStyle = P.gold;
      ctx.lineWidth = 3;
      ctx.stroke();
      envelope(ctx, r.x + 70, r.y + 66, 1.1, true, '0');
      text(ctx, '第0号快递', r.x + 136, r.y + 44, 30, { bold: true, align: 'left' });
      const sub = s.secret === 1 ? '把第一封信送到上游，交给鹈鹕阿灰' : '阿灰收到了。点开读读第一封信';
      text(ctx, sub, r.x + 136, r.y + 88, 21, { align: 'left', color: P.inkSoft, maxWidth: s.secret === 1 ? 300 : r.w - 160 });
      const sr = this.mScroll.screen(r);
      if (s.secret === 1) {
        const b = { x: r.x + r.w - 180, y: r.y + 34, w: 160, h: 64 };
        const sb = this.mScroll.screen(b);
        const down = !!sb && this.taps.add('secret', sb);
        button(ctx, b.x, b.y, b.w, b.h, '去送信', { primary: true, pressed: down, size: 26 });
      } else if (sr) this.taps.add('st_0', sr);
      y += r.h + 20;
    }
    const cols = 5, gap = 12, cw = (d.w - 68 - gap * (cols - 1)) / cols, ch = 132;
    for (let i = 0; i < YEAR_END; i++) {
      const n = i + 1, got = s.story.includes(n);
      const x = d.x + 34 + (i % cols) * (cw + gap), cy = y + Math.floor(i / cols) * (ch + gap);
      const r = { x, y: cy, w: cw, h: ch };
      const sr = got ? this.mScroll.screen(r) : null;
      const down = !!sr && this.taps.add(`st_${n}`, sr);
      ctx.save();
      if (down) ctx.globalAlpha = 0.7;
      roundRect(ctx, x, cy, cw, ch, 12);
      ctx.fillStyle = got ? '#FFFDF7' : alpha(P.paperShade, 0.6);
      ctx.fill();
      if (got) {
        ctx.strokeStyle = alpha(INK, 0.5);
        ctx.lineWidth = 1.6;
        ctx.stroke();
        envelope(ctx, x + cw / 2, cy + 46, 0.8, true, `${n}`);
        text(ctx, STORY[i].title, x + cw / 2, cy + 106, 20, { bold: true, maxWidth: cw - 12 });
      } else {
        ctx.setLineDash([5, 6]);
        ctx.strokeStyle = alpha(INK, 0.25);
        ctx.lineWidth = 1.6;
        ctx.stroke();
        ctx.setLineDash([]);
        envelope(ctx, x + cw / 2, cy + 46, 0.8, false, '?');
        text(ctx, `第${n}天`, x + cw / 2, cy + 106, 19, { color: P.inkSoft, maxWidth: cw - 12 });
      }
      ctx.restore();
    }
    y += Math.ceil(YEAR_END / cols) * (ch + gap) + 6;
    text(ctx, '没找到的信还漂在那一天的河上，回路线图重跑就能捡到', 375, y + 14, 20, { color: P.inkSoft, maxWidth: d.w - 80 });
    y += 44;
    this.mScroll.end(ctx);
    this.mScroll.setContent(y - (d.y + 166));
  }

  /** One of the old turtle's letters, on its own sheet of paper. */
  private drawStoryLetter(ctx: Ctx, d: Rect, n: number) {
    const shelf = this.storyShelf();
    const i = shelf.indexOf(n);
    const title = n ? STORY[n - 1].title : '第一封信';
    const body = n ? STORY[n - 1].text : FIRST_LETTER;
    const x = d.x + 40, w = d.w - 80, y0 = d.y + 186, h = d.y + d.h - 130 - y0;
    // lined writing paper, a little crooked
    ctx.save();
    ctx.translate(375, y0 + h / 2);
    ctx.rotate(-0.008);
    ctx.translate(-375, -(y0 + h / 2));
    roundRect(ctx, x, y0, w, h, 10);
    ctx.fillStyle = '#FFFDF4';
    ctx.fill();
    ctx.strokeStyle = alpha(INK, 0.6);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = alpha(P.teal, 0.35);
    ctx.lineWidth = 1.4;
    for (let ly = y0 + 150; ly < y0 + h - 30; ly += 52) {
      ctx.beginPath();
      ctx.moveTo(x + 30, ly + 12);
      ctx.lineTo(x + w - 30, ly + 12);
      ctx.stroke();
    }
    text(ctx, title, 375, y0 + 56, 34, { bold: true });
    text(ctx, n ? `第 ${n} 封 · 第${n}天在河上捡到` : '第0号快递 · 已交给阿灰', 375, y0 + 100, 21, { color: P.inkSoft });
    const lines = wrapText(ctx, body, 28, w - 80);
    lines.forEach((l, k) => text(ctx, l, x + 40, y0 + 150 + k * 52, 28, { align: 'left' }));
    text(ctx, n ? '—— 小龟' : '—— 你的朋友 小龟', x + w - 44, y0 + 150 + lines.length * 52 + 20, 26, { align: 'right', color: P.inkSoft });
    ctx.restore();
    const by = d.y + d.h - 106;
    pill(ctx, this.taps, 'stPrev', d.x + 40, by, 170, 72, '‹ 上一封', { size: 26, disabled: i <= 0 });
    pill(ctx, this.taps, 'stBack', 375 - 100, by, 200, 72, '放回去', { size: 26 });
    pill(ctx, this.taps, 'stNext', d.x + d.w - 210, by, 170, 72, '下一封 ›', { size: 26, disabled: i < 0 || i >= shelf.length - 1 });
  }

  /** The lost letters picked up on the road behind the truck. */
  private drawRoadLetters(ctx: Ctx, d: Rect) {
    const s = this.game.save;
    this.area(ctx, d, d.y + 166);
    let y = d.y + 190;
    text(ctx, `找到 ${s.letters.length} / ${ALL_LETTERS} 封`, d.x + 44, y + 14, 26, { bold: true, align: 'left' });
    y += 50;
    for (let i = 0; i < ALL_LETTERS; i++) {
      const l = s.letters[i] ? letterText(s.letters[i]) : '';
      ctx.save();
      const lines = l ? wrapText(ctx, l, 26, d.w - 140) : [];
      ctx.restore();
      const h = l ? 90 + lines.length * 40 : 120;
      roundRect(ctx, d.x + 34, y, d.w - 68, h, 14);
      ctx.fillStyle = l ? '#FFFDF7' : P.paperShade;
      ctx.fill();
      ctx.strokeStyle = l ? INK : 'rgba(74,59,48,0.3)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ellipse(ctx, d.x + d.w - 74, y + 34, 16, 16);
      ctx.fillStyle = l ? P.red : 'rgba(74,59,48,0.2)';
      ctx.fill();
      if (l) {
        text(ctx, `第 ${i + 1} 封`, d.x + 60, y + 36, 22, { align: 'left', color: P.inkSoft, bold: true });
        lines.forEach((ln, k) => text(ctx, ln, d.x + 60, y + 80 + k * 40, 26, { align: 'left' }));
      } else {
        text(ctx, '还没找到', 375, y + 48, 26, { bold: true, color: P.inkSoft });
        text(ctx, '全部送完后别急着上车，去车后面的路上找找', 375, y + 86, 20, { color: P.inkSoft, maxWidth: d.w - 120 });
      }
      y += h + 18;
    }
    this.mScroll.end(ctx);
    this.mScroll.setContent(y - (d.y + 166));
  }

  private drawDecor(ctx: Ctx, d: Rect) {
    const g = this.game;
    const s = g.save;
    text(ctx, '布置房间', d.x + 40, d.y + 48, 34, { bold: true, align: 'left' });
    const list = this.decos();
    if (!list.length) {
      text(ctx, '家里还空荡荡的', 375, d.y + 220, 28, { bold: true, color: P.inkSoft });
      text(ctx, '福利社的「家居」里有地毯、台灯、鱼缸……', 375, d.y + 266, 22, { color: P.inkSoft });
      pill(ctx, this.taps, 'shop', 375 - 130, d.y + 320, 260, 64, '去福利社', { size: 26 });
      return;
    }
    text(ctx, '点一下收起来或摆出来', d.x + 40, d.y + 96, 22, { align: 'left', color: P.inkSoft });
    this.area(ctx, d, d.y + 120);
    list.forEach((it, i) => {
      const cx = d.x + 30 + (i % 3) * 212, cy = d.y + 134 + Math.floor(i / 3) * 210;
      const sr = this.mScroll.screen({ x: cx, y: cy, w: 200, h: 196 });
      const down = !!sr && this.taps.add(`dc_${it.id}`, sr);
      const on = !s.room.hidden.includes(it.id);
      ctx.save();
      if (down) ctx.globalAlpha = 0.7;
      roundRect(ctx, cx, cy, 200, 196, 14);
      ctx.fillStyle = on ? '#FDF3D2' : P.white;
      ctx.fill();
      ctx.strokeStyle = on ? P.orange : P.kraft;
      ctx.lineWidth = on ? 3 : 2;
      ctx.stroke();
      itemIcon(ctx, g, it.id, cx + 100, cy + 84, 120);
      text(ctx, it.name, cx + 100, cy + 154, 22, { bold: true });
      text(ctx, on ? '摆着' : '收起来了', cx + 100, cy + 180, 18, { color: on ? P.lilyDeep : P.inkSoft });
      ctx.restore();
    });
    this.mScroll.end(ctx);
    this.mScroll.setContent(Math.ceil(list.length / 3) * 210 + 30);
  }
}

/** A photo cropped from the middle to fill a box. */
export function drawPhoto(ctx: Ctx, img: ImageSource | null, x: number, y: number, w: number, h: number) {
  if (img) {
    const k = Math.min(img.width / w, img.height / h);
    const sw = w * k, sh = h * k;
    ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
  } else {
    ctx.fillStyle = P.tealLight;
    ctx.fillRect(x, y, w, h);
  }
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x, y, w, h);
}

/** A photo in one of the frame styles from the shop (`frame_wood`, `frame_lily`, …), its outer edge on x, y, w, h. */
export function drawFrame(ctx: Ctx, style: string, x: number, y: number, w: number, h: number, img: ImageSource | null) {
  const k = style.slice(6) as FrameKind;
  const kind = FRAME_KINDS.includes(k) ? k : 'wood';
  const o = frameOpening(kind, x, y, w, h);
  drawPhoto(ctx, img, o.x, o.y, o.w, o.h);
  frame(ctx, kind, x, y, w, h);
}

/** A shop item's picture, fitted in a box of about `size` around (x, y). */
export function itemIcon(ctx: Ctx, g: Game, id: string, x: number, y: number, size: number) {
  const it = item(id);
  const sp = g.sprites;
  if (it?.kind === 'frame') {
    drawFrame(ctx, id, x - size * 0.42, y - size * 0.34, size * 0.84, size * 0.68, null);
    return;
  }
  if (!sp.has(id)) return;
  const s = sp.get(id);
  const k = Math.min(size / s.w, size / s.h, 1.4);
  // anchors differ (feet, middle, hat brim); centre the picture's box instead
  sp.draw(ctx, id, x - (s.w / 2 - s.ax) * k, y - (s.h / 2 - s.ay) * k, k);
}

/** An envelope for the mailbox: kraft with a red wax seal (and its number), or a blank outline if not found yet. */
function envelope(ctx: Ctx, x: number, y: number, s: number, got: boolean, label: string) {
  const w = 76 * s, h = 52 * s;
  ctx.save();
  ctx.lineJoin = 'round';
  roundRect(ctx, x - w / 2, y - h / 2, w, h, 5 * s);
  ctx.fillStyle = got ? P.kraftTop : 'rgba(255,255,255,0.5)';
  ctx.fill();
  ctx.strokeStyle = got ? INK : 'rgba(74,59,48,0.3)';
  ctx.lineWidth = 2;
  ctx.stroke();
  // the flap
  ctx.beginPath();
  ctx.moveTo(x - w / 2 + 3, y - h / 2 + 3);
  ctx.lineTo(x, y + h * 0.12);
  ctx.lineTo(x + w / 2 - 3, y - h / 2 + 3);
  ctx.stroke();
  if (got) {
    ellipse(ctx, x, y + h * 0.1, 13 * s, 13 * s);
    ctx.fillStyle = P.red;
    ctx.fill();
    ctx.stroke();
  }
  text(ctx, label, x, y + h * 0.1 + 1, (label.length > 1 ? 14 : 17) * s, { bold: true, color: got ? P.white : 'rgba(74,59,48,0.35)' });
  ctx.restore();
}

/** The frog's own orange courier cap, for the wardrobe's "no hat" choice. */
function courierCap(ctx: Ctx, x: number, y: number) {
  ctx.save();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = INK;
  ctx.beginPath();
  ctx.moveTo(x - 30, y);
  ctx.quadraticCurveTo(x - 28, y - 40, x, y - 40);
  ctx.quadraticCurveTo(x + 28, y - 40, x + 30, y);
  ctx.closePath();
  ctx.fillStyle = P.orange;
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(x + 4, y + 2, 40, 9, 0, 0, Math.PI * 2);
  ctx.fillStyle = P.orangeDeep;
  ctx.fill();
  ctx.stroke();
  roundRect(ctx, x - 9, y - 30, 18, 15, 2);
  ctx.fillStyle = P.cream;
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}
