// The home page (主页): the river-bend village between workdays. From here the frog goes back to
// work, to the owl's HQ (records and photos), home (its room and photo wall) or the hamster's shop.
import { INK, P } from '../art/palette';
import { K } from '../art/sprites';
import { button, ellipse, panel, pressIn, pressOut, roundRect, text } from '../art/ui';
import { clamp, easeOutCubic, lerp } from '../engine/math';
import type { Ctx } from '../platform/types';
import { ACHIEVEMENTS, RANKS, daysWorked, firstDay, rankIndex, stampCount, stampsPossible, unreadNotes } from './career';
import { GEAR, gearDef, gearMax, ITEMS, priceOf } from './catalog';
import { DAYS } from './config';
import type { Game, Scene } from './game';
import { HallScene } from './hall';
import { HomeScene } from './home';
import { MapScene } from './map';
import { Taps, Toast, coinPill, dialog, dot, drawDressedFrog, pill, shortDate } from './menu';
import { PlayScene, drawTruckBase } from './play';
import { ShopScene } from './shop';
import { SCENE_MUSIC, hubAmbience } from './sound';

type Place = 'hq' | 'shop' | 'home' | 'work';

const HOP_T = 0.42;

/** What the locked places are called, for the newbie toast. */
const PLACE_NAMES: Record<string, string> = { hq: '河湾总部', shop: '福利社', home: '我的家', map: '路线图' };

export class HubScene implements Scene {
  readonly id = 'hub';
  private t = 0;
  private taps = new Taps();
  private toast = new Toast();
  /** The frog hopping toward where it was sent; the screen changes when it lands. */
  private hop: { to: Place; t: number; x0: number; y0: number; x1: number; y1: number; done?: boolean } | null = null;
  private joy = 0;
  /** After 19:00 and before 6:00 the village is lit by the evening sun (same rule as the room's window). */
  private night = new Date().getHours() >= 19 || new Date().getHours() < 6;
  private profile: { t: number } | null = null;
  private spots: Record<Place, { x: number; y: number }> = { hq: { x: 0, y: 0 }, shop: { x: 0, y: 0 }, home: { x: 0, y: 0 }, work: { x: 0, y: 0 } };
  private frogAt = { x: 375, y: 0 };
  private pads = [
    { x: 80, v: 0, s: 0.42, ph: 0 }, { x: 300, v: 2, s: 0.36, ph: 2 }, { x: 520, v: 1, s: 0.4, ph: 4 },
  ];

  constructor(private game: Game) {
    game.audio.setMusic(SCENE_MUSIC.hub);
    game.audio.setAmbience(hubAmbience(this.night));
    game.tm.day = null;
    void game.sprites.ensure([`hub_bg_${this.night ? 'eve' : 'day'}`, ...['hq', 'shop', 'home'].map((k) => `hub_${k}${this.night ? '_eve' : ''}`)]);
    game.tm.log('hub', { unlocked: game.save.day, coins: game.save.coins, notes: unreadNotes(game.save) });
  }

  update(dt: number) {
    this.t += dt;
    this.toast.update(dt);
    if (this.profile) this.profile.t += dt;
    this.joy = Math.max(0, this.joy - dt);
    const h = this.hop;
    if (h && !h.done && (h.t += dt) >= HOP_T) {
      h.t = HOP_T;
      h.done = true;
      this.enter(h.to);
    }
  }

  down(x: number, y: number) {
    if (this.hop) return;
    this.taps.down(x, y);
  }
  move(x: number, y: number) {
    this.taps.move(x, y);
  }
  up(x: number, y: number) {
    if (this.hop) return;
    const id = this.taps.up(x, y);
    if (!id) return;
    const au = this.game.audio;
    if (this.profile) {
      if (id === 'rename') this.rename();
      else if (id === 'profileOut' || id === 'close') {
        au.play('ui_close');
        this.profile = null;
      }
      return;
    }
    if (this.newbie && (id === 'hq' || id === 'shop' || id === 'home' || id === 'map')) {
      au.play('ui_error', { volume: 0.6 });
      this.toast.show(`先去上班，通过第 1 天就开放${PLACE_NAMES[id]}啦`);
      this.game.tm.log('hub_locked', { id });
      return;
    }
    if (id === 'hq' || id === 'shop' || id === 'home' || id === 'work') this.go(id);
    else if (id === 'map') {
      au.play('ui_confirm');
      this.game.tm.log('hub_go', { to: 'map' });
      this.game.go(new MapScene(this.game), true);
    } else if (id === 'sound') {
      au.play('ui_tap');
      this.game.setSound(!this.game.save.sound);
    } else if (id === 'card') {
      au.play('ui_open');
      this.profile = { t: 0 };
      this.game.tm.log('profile');
    } else if (id === 'frog') {
      this.joy = 0.6;
      au.play('frog_croak', { jitter: true });
    }
  }

  /** Until day 1 is passed, only work is open, so a new player has one obvious place to go. */
  private get newbie() {
    return this.game.save.day <= 1;
  }

  /**
   * The day the truck takes the frog to: the newest one open, or once the whole route is done, the
   * first day still missing a stamp (the last day when every stamp is in).
   */
  private get workDay() {
    const s = this.game.save;
    if (!s.cleared) return clamp(s.day, 1, DAYS.length);
    return DAYS.find((c) => !s.stamps[c.day] || s.stamps[c.day].some((got) => !got))?.day ?? DAYS.length;
  }

  /** The frog hops over to the place first, then the screen changes. */
  private go(to: Place) {
    const s = this.spots[to];
    this.hop = { to, t: 0, x0: this.frogAt.x, y0: this.frogAt.y, x1: s.x, y1: s.y };
    this.game.audio.play('jump_release', { volume: 0.6 });
    this.game.tm.log('hub_go', { to });
  }

  private enter(to: Place) {
    const g = this.game;
    g.audio.play(to === 'work' ? 'truck_horn' : 'ui_confirm', { volume: 0.7 });
    if (to === 'hq') g.go(new HallScene(g), true);
    else if (to === 'shop') g.go(new ShopScene(g), true);
    else if (to === 'home') g.go(new HomeScene(g), true);
    else g.go(new PlayScene(g, this.workDay), true);
  }

  private async rename() {
    const s = this.game.save;
    const name = await this.game.platform.promptText('给小青蛙起个名字（最多 6 个字）', s.name, 6);
    if (name) {
      s.name = name;
      this.game.writeSave();
      this.game.tm.log('rename', { len: [...name].length });
      this.toast.show(`你好，${name}！`);
    }
  }

  // ---------------------------------------------------------------- drawing

  render(ctx: Ctx) {
    const g = this.game;
    const H = g.H, top = g.safeT, bot = H - g.safeB;
    const sp = g.sprites;
    const s = g.save;
    this.taps.clear();
    // the village fills what's between the header and the buttons
    const y0 = top + 210, y1 = bot - 190;
    const sh = y1 - y0;
    const yAt = (k: number) => y0 + sh * k;
    const creekY = yAt(0.42);
    // Painted village (day or evening, three empty pads for the buildings): places go where the picture has them.
    const bgName = `hub_bg_${this.night ? 'eve' : 'day'}`, sfx = this.night ? '_eve' : '';
    const art = sp.has(bgName);
    // tall phones stretch the picture a little more up and down than sideways, so both pads stay on screen
    const bgk = art ? Math.max(1, H / sp.get(bgName).h) : 1;
    const bgx = Math.min(bgk, 1.2);
    const at = (u: number, v: number) => ({ x: 375 + (u - 0.5) * 750 * bgx, y: v * sp.get(bgName).h * bgk });
    let hq = { x: 215, y: yAt(0.31) };
    let shop = { x: 560, y: yAt(0.3) };
    let home = { x: 210, y: yAt(0.94) };
    let truck = { x: 658, y: yAt(0.8) };
    this.frogAt = { x: 390, y: yAt(0.62) };
    this.spots = {
      hq: { x: hq.x + 10, y: hq.y + 20 }, shop: { x: shop.x - 10, y: shop.y + 20 },
      home: { x: home.x + 70, y: home.y + 10 }, work: { x: truck.x - 70, y: truck.y + 40 },
    };
    if (art) {
      hq = at(0.42, 0.245);
      shop = at(0.81, 0.435);
      home = at(0.185, 0.5);
      truck = at(0.5, 0.5);
      this.frogAt = at(0.34, 0.72);
      this.spots = { hq: at(0.42, 0.285), shop: at(0.78, 0.49), home: at(0.25, 0.54), work: at(0.42, 0.56) };
    }

    if (art) sp.draw(ctx, bgName, 375 - (750 * bgx) / 2, 0, bgx, bgk);
    else this.drawGround(ctx, creekY, truck.x, y0, H);

    const unread = unreadNotes(s) > 0;
    const shopNew = this.affordable();
    const homeNew = s.letters.length > s.seen.letters;
    if (art) {
      if (sp.has(`hub_hq${sfx}`)) this.place(ctx, 'hq', `hub_hq${sfx}`, hq.x, hq.y, '河湾总部', '送单 · 日志 · 相册', unread, 0.8);
      else this.hotspot(ctx, 'hq', hq.x, hq.y - 80, 230, 200, '河湾总部', '送单 · 日志 · 相册', unread);
      if (sp.has(`hub_shop${sfx}`)) this.place(ctx, 'shop', `hub_shop${sfx}`, shop.x, shop.y, '福利社', '装备 · 衣帽 · 家居', shopNew, 0.9);
      else this.hotspot(ctx, 'shop', shop.x, shop.y - 100, 250, 220, '福利社', '装备 · 衣帽 · 家居', shopNew);
      if (sp.has(`hub_home${sfx}`)) this.place(ctx, 'home', `hub_home${sfx}`, home.x, home.y, '我的家', '房间 · 照片墙 · 记录', homeNew, 0.9);
      else this.hotspot(ctx, 'home', home.x, home.y - 80, 270, 250, '我的家', '房间 · 照片墙 · 记录', homeNew);
      // the courier truck waits on the road
      const ty = truck.y + Math.sin(this.t * 13) * 0.8;
      ctx.save();
      ctx.translate(truck.x, ty);
      ctx.scale(0.62, 0.62);
      drawTruckBase(ctx, 0, 0, this.t * 60);
      sp.draw(ctx, 'truck_blue', 0, 0, 0.82);
      ctx.restore();
      this.sign(ctx, 'work', truck.x - 105, truck.y + 62, '运输车', `去上班 · 第${this.workDay}天`, false, 210);
      this.taps.add('work', { x: truck.x - 60, y: truck.y - 80, w: 120, h: 140 });
    } else {
      // paths from the square to every place
      this.path(ctx, [[this.frogAt.x, this.frogAt.y], [300, creekY + 40], [hq.x + 40, hq.y + 30]]);
      this.path(ctx, [[this.frogAt.x, this.frogAt.y], [470, creekY + 30], [shop.x - 30, shop.y + 30]]);
      this.path(ctx, [[this.frogAt.x, this.frogAt.y], [300, yAt(0.8)], [home.x + 60, home.y + 20]]);
      this.path(ctx, [[this.frogAt.x, this.frogAt.y], [520, yAt(0.74)], [truck.x - 80, truck.y + 30]]);
      this.bridge(ctx, 372, creekY);

      // trees and flowers around the village
      for (const [x, k, sc] of [[46, 0.18, 0.8], [700, 0.16, 0.7], [470, 0.12, 0.6], [56, 0.62, 0.9], [560, 0.98, 0.75], [400, 1.02, 0.6]] as const) this.tree(ctx, x, yAt(k), sc);
      for (let i = 0; i < 16; i++) this.flower(ctx, (i * 173 + 40) % 600 + 20, yAt(0.48 + ((i * 37) % 50) / 100), i);

      // the places, drawn back to front
      this.place(ctx, 'hq', 'hub_hq', hq.x, hq.y, '河湾总部', '送单 · 日志 · 相册', unread);
      this.place(ctx, 'shop', 'hub_shop', shop.x, shop.y, '福利社', '装备 · 衣帽 · 家居', shopNew);
      this.smoke(ctx, home.x + 104 * K, home.y - 300 * K);
      this.place(ctx, 'home', 'hub_home', home.x, home.y, '我的家', '房间 · 照片墙 · 记录', homeNew);
      // the truck waiting on the road
      const ty = truck.y + Math.sin(this.t * 13) * 0.8;
      drawTruckBase(ctx, truck.x, ty, this.t * 60);
      sp.draw(ctx, 'truck_blue', truck.x, ty, 0.82);
      this.sign(ctx, 'work', 750 - 20 - 210, truck.y + 118, '运输车', `去上班 · 第${this.workDay}天`, false, 210);
      const wr = { x: truck.x - 90, y: truck.y - 120, w: 180, h: 240 };
      this.taps.add('work', wr);
    }

    this.drawFrog(ctx);
    this.drawHeader(ctx);

    // back to work
    const day = this.workDay;
    const by = bot - 150;
    const first = firstDay(s);
    const workDown = this.taps.add('work', { x: 32, y: by, w: 456, h: 104 });
    if (this.newbie) {
      // the one thing to do: the button breathes and a hand taps it
      const k = 1 + Math.sin(this.t * 5) * 0.025;
      ctx.save();
      ctx.translate(260, by + 52);
      ctx.scale(k, k);
      ctx.translate(-260, -(by + 52));
      button(ctx, 32, by, 456, 104, '开始上班', { primary: true, pressed: workDown, size: 42 });
      ctx.restore();
      const cyc = (this.t % 1.2) / 1.2;
      sp.draw(ctx, 'hand', 420, by + 60 - Math.sin(cyc * Math.PI) * 12, 1.1);
    } else button(ctx, 32, by, 456, 104, first ? '开始上班' : s.cleared ? `全部完成 · 再玩一遍第${day}天` : `继续上班 · 第${day}天`, { primary: true, pressed: workDown, size: 38 });
    const mapDown = this.taps.add('map', { x: 504, y: by, w: 214, h: 104 });
    ctx.save();
    if (this.newbie) ctx.globalAlpha = 0.45;
    button(ctx, 504, by, 214, 104, '路线图', { pressed: mapDown, size: 34 });
    ctx.restore();
    if (art) {
      roundRect(ctx, 40, by + 112, 670, 32, 16);
      ctx.fillStyle = 'rgba(255,250,238,0.88)';
      ctx.fill();
    }
    text(ctx, `第${day}天 · ${DAYS[day - 1].intro}`, 375, by + 128, 22, { color: INK, alpha: 0.85, maxWidth: 650 });

    if (this.profile) this.drawProfile(ctx);
    // clear of the staff card's bottom edge
    this.toast.render(ctx, top + 140);
    if (sp.painted === 0) text(ctx, '占位美术为代码绘制，正式美术制作中', 375, bot - 14, 18, { color: P.ink, alpha: 0.6 });
  }

  /** A gear upgrade or something on sale the frog can pay for right now. */
  private affordable() {
    const s = this.game.save;
    if (GEAR.some((g) => (s.gear[g.id] ?? 1) < gearMax(g.id) && gearDef(g.id).prices[(s.gear[g.id] ?? 1) - 1] <= s.coins)) return true;
    return ITEMS.some((i) => i.price && !s.owned.includes(i.id) && (priceOf(i) ?? Infinity) <= s.coins && s.coins >= 150);
  }

  private drawGround(ctx: Ctx, creekY: number, roadX: number, y0: number, H: number) {
    const sp = this.game.sprites;
    ctx.fillStyle = '#E3E6C0';
    ctx.fillRect(0, 0, 750, H);
    ctx.fillStyle = P.bankDeep;
    for (let i = 0; i < 80; i++) {
      const x = (i * 263) % 750, y = (i * 409) % H;
      ellipse(ctx, x, y, 5 + (i % 3) * 2, 3 + (i % 2) * 2);
      ctx.fill();
    }
    // the river at the top, where the work is
    const rTop = y0 - 120, rBot = y0 + 10;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, rTop);
    for (let x = 0; x <= 750; x += 25) ctx.lineTo(x, rTop + Math.sin(x / 90) * 10);
    for (let x = 750; x >= 0; x -= 25) ctx.lineTo(x, rBot + Math.sin(x / 70 + 1) * 12);
    ctx.closePath();
    ctx.fillStyle = P.teal;
    ctx.fill();
    ctx.strokeStyle = 'rgba(74,59,48,0.5)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
    for (const p of this.pads) {
      const x = ((p.x + this.t * 14) % 860) - 60;
      sp.draw(ctx, `lily${p.v}`, x, rTop + 60 + Math.sin(this.t + p.ph) * 4, p.s);
    }
    // the creek across the village
    ctx.save();
    ctx.lineCap = 'round';
    const creek = () => {
      ctx.beginPath();
      ctx.moveTo(-40, creekY + 30);
      ctx.bezierCurveTo(200, creekY - 30, 420, creekY + 40, roadX - 40, creekY - 10);
    };
    creek();
    ctx.strokeStyle = 'rgba(74,59,48,0.5)';
    ctx.lineWidth = 64;
    ctx.stroke();
    creek();
    ctx.strokeStyle = P.teal;
    ctx.lineWidth = 58;
    ctx.stroke();
    creek();
    ctx.setLineDash([22, 30]);
    ctx.lineDashOffset = -this.t * 26;
    ctx.strokeStyle = 'rgba(251,247,238,0.6)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
    // the road on the right, like on the river
    ctx.fillStyle = P.road;
    ctx.fillRect(roadX - 80, rBot - 20, 750, H);
    ctx.strokeStyle = 'rgba(74,59,48,0.5)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(roadX - 80, rBot - 20);
    ctx.lineTo(roadX - 80, H);
    ctx.stroke();
    ctx.setLineDash([30, 26]);
    ctx.strokeStyle = 'rgba(214,199,163,1)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(roadX + 20, rBot);
    ctx.lineTo(roadX + 20, H);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  private path(ctx: Ctx, pts: [number, number][]) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const draw = () => {
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      ctx.quadraticCurveTo(pts[1][0], pts[1][1], pts[2][0], pts[2][1]);
    };
    draw();
    ctx.strokeStyle = 'rgba(148,104,63,0.35)';
    ctx.lineWidth = 40;
    ctx.stroke();
    draw();
    ctx.strokeStyle = '#E9DCB8';
    ctx.lineWidth = 34;
    ctx.stroke();
    ctx.restore();
  }

  private bridge(ctx: Ctx, x: number, y: number) {
    ctx.save();
    ctx.translate(x, y);
    roundRect(ctx, -44, -46, 88, 92, 10);
    ctx.fillStyle = P.woodLight;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(148,104,63,0.6)';
    ctx.lineWidth = 2;
    for (let yy = -34; yy < 46; yy += 14) {
      ctx.beginPath();
      ctx.moveTo(-40, yy);
      ctx.lineTo(40, yy);
      ctx.stroke();
    }
    for (const sx of [-50, 50]) {
      roundRect(ctx, sx - 5, -50, 10, 100, 5);
      ctx.fillStyle = P.woodDeep;
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.stroke();
    }
    ctx.restore();
  }

  private tree(ctx: Ctx, x: number, y: number, s: number) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ellipse(ctx, 0, 8, 60, 14);
    ctx.fillStyle = 'rgba(74,59,48,0.15)';
    ctx.fill();
    roundRect(ctx, -10, -60, 20, 70, 8);
    ctx.fillStyle = P.woodDeep;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    const sway = Math.sin(this.t * 1.2 + x) * 2;
    for (const [dx, dy, r, c] of [[-28, -84, 40, '#93B86C'], [26, -90, 42, '#A9C47F'], [0, -124, 46, '#A9C47F']] as const) {
      ellipse(ctx, dx + sway, dy, r, r * 0.9);
      ctx.fillStyle = c;
      ctx.fill();
      ctx.strokeStyle = 'rgba(74,59,48,0.6)';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
    ctx.restore();
  }

  private flower(ctx: Ctx, x: number, y: number, i: number) {
    const c = [P.pink, P.gold, P.white, P.orange][i % 4];
    ctx.save();
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      ellipse(ctx, x + Math.cos(a) * 5, y + Math.sin(a) * 4, 4, 3.5);
      ctx.fillStyle = c;
      ctx.fill();
    }
    ellipse(ctx, x, y, 2.5, 2.5);
    ctx.fillStyle = P.mustard;
    ctx.fill();
    ctx.restore();
  }

  private smoke(ctx: Ctx, x: number, y: number) {
    ctx.save();
    for (let i = 0; i < 3; i++) {
      const k = (this.t * 0.35 + i / 3) % 1;
      ctx.globalAlpha = 0.5 * (1 - k);
      ellipse(ctx, x + Math.sin(k * 5 + i) * 8, y - k * 90, 12 + k * 16, 10 + k * 12);
      ctx.fillStyle = P.white;
      ctx.fill();
    }
    ctx.restore();
  }

  /** A building with its signpost; the whole thing is one tap target. */
  private place(ctx: Ctx, id: Place, sprite: string, x: number, y: number, name: string, sub: string, isNew: boolean, k = 1) {
    const sp = this.game.sprites;
    const s = sp.get(sprite);
    const r = { x: x - s.ax * k, y: y - s.ay * k, w: s.w * k, h: s.h * k + 90 };
    const down = this.taps.add(id, r);
    const bounce = this.hop?.to === id ? Math.sin((this.hop.t / HOP_T) * Math.PI) * 0.03 : 0;
    const locked = this.newbie;
    ctx.save();
    if (locked) ctx.globalAlpha = 0.5;
    if (down) {
      ctx.translate(x, y);
      ctx.scale(0.97, 0.97);
      ctx.translate(-x, -y);
    }
    sp.draw(ctx, sprite, x, y, k * (1 + bounce), k * (1 - bounce));
    ctx.restore();
    ctx.save();
    if (locked) ctx.globalAlpha = 0.6;
    this.sign(ctx, id, x - 110, y + 10 - (k < 1 ? 6 : 0), locked ? '未开放' : name, locked ? '通过第 1 天后开放' : sub, locked ? false : isNew, 220, down);
    ctx.restore();
  }

  /** A place that is part of the painted background: just a sign and a tap area. */
  private hotspot(ctx: Ctx, id: Place, x: number, y: number, w: number, h: number, name: string, sub: string, isNew: boolean, signW = 220) {
    const down = this.taps.add(id, { x: x - w / 2, y: y - h / 2, w, h: h + 90 });
    const locked = this.newbie && id !== 'work';
    const bounce = this.hop?.to === id ? Math.sin((this.hop.t / HOP_T) * Math.PI) * 6 : 0;
    ctx.save();
    if (locked) ctx.globalAlpha = 0.6;
    this.sign(ctx, id, x - signW / 2, y + h / 2 - 20 - bounce, locked ? '未开放' : name, locked ? '通过第 1 天后开放' : sub, locked ? false : isNew, signW, down);
    ctx.restore();
  }

  private sign(ctx: Ctx, id: string, x: number, y: number, name: string, sub: string, isNew: boolean, w: number, down = this.taps.pressed === id) {
    x = clamp(x, 10, 740 - w);
    const r = { x, y, w, h: 76 };
    this.taps.add(id, r, 6);
    pressIn(ctx, r, down);
    panel(ctx, x, y, w, 76, { r: 14, fill: P.cream, shadow: true });
    text(ctx, name, x + w / 2, y + 26, 30, { bold: true });
    text(ctx, sub, x + w / 2, y + 56, 19, { color: P.inkSoft, maxWidth: w - 20 });
    if (isNew) dot(ctx, x + w - 8, y + 6, 11);
    pressOut(ctx, down, () => roundRect(ctx, x, y, w, 76, 14));
  }

  private drawFrog(ctx: Ctx) {
    const sp = this.game.sprites;
    const s = this.game.save;
    let { x, y } = this.frogAt;
    let z = Math.max(0, Math.sin(this.t * 3)) * 6;
    let pose = this.t % 6 < 4.5 ? 'frog_stand' : 'frog_happy';
    if (this.joy > 0) {
      z = Math.sin((1 - this.joy / 0.6) * Math.PI) * 50;
      pose = 'frog_happy';
    }
    if (this.hop) {
      const k = easeOutCubic(this.hop.t / HOP_T);
      x = lerp(this.hop.x0, this.hop.x1, k);
      y = lerp(this.hop.y0, this.hop.y1, k);
      z = Math.sin(k * Math.PI) * 110;
      pose = 'frog_jump';
    }
    ctx.save();
    ctx.globalAlpha = 0.3;
    ellipse(ctx, x, y + 2, 40 - z * 0.12, 11);
    ctx.fillStyle = P.lilyDeep;
    ctx.fill();
    ctx.restore();
    drawDressedFrog(ctx, sp, s.wear, pose, x, y - z, 0.8);
    this.taps.add('frog', { x: x - 60, y: y - 150, w: 120, h: 160 });
  }

  /** Staff card on the left, coins and sound on the right, the village name underneath. */
  private drawHeader(ctx: Ctx) {
    const g = this.game;
    const s = g.save;
    const sp = g.sprites;
    const top = g.safeT + 16;
    const card = { x: 20, y: top, w: 390, h: 104 };
    const down = this.taps.add('card', card, 4);
    pressIn(ctx, card, down);
    panel(ctx, card.x, card.y, card.w, card.h, { r: 20 });
    this.avatar(ctx, card.x + 56, card.y + 52, 38);
    const ri = rankIndex(stampCount(s));
    text(ctx, s.name, card.x + 108, card.y + 34, 32, { align: 'left', bold: true, maxWidth: 150 });
    text(ctx, RANKS[ri].name, card.x + 108, card.y + 72, 22, { align: 'left', color: P.orangeDeep, bold: true });
    // stamps toward the next rank
    const next = RANKS[ri + 1];
    const n = stampCount(s);
    const bx = card.x + 256, bw = 116;
    text(ctx, `好评章 ${n}`, bx + bw / 2, card.y + 34, 20, { color: P.inkSoft });
    roundRect(ctx, bx, card.y + 62, bw, 16, 8);
    ctx.fillStyle = P.paperShade;
    ctx.fill();
    const k = next ? clamp((n - RANKS[ri].need) / (next.need - RANKS[ri].need), 0, 1) : 1;
    if (k > 0) {
      roundRect(ctx, bx, card.y + 62, Math.max(16, bw * k), 16, 8);
      ctx.fillStyle = P.gold;
      ctx.fill();
    }
    roundRect(ctx, bx, card.y + 62, bw, 16, 8);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.8;
    ctx.stroke();
    pressOut(ctx, down, () => roundRect(ctx, card.x, card.y, card.w, card.h, 20));

    coinPill(ctx, sp, 424, top + 2, s.coins);
    pill(ctx, this.taps, 'sound', 588, top + 2, 142, 56, s.sound ? '音效 开' : '音效 关', { size: 24 });
    roundRect(ctx, 432, top + 68, 290, 34, 17);
    ctx.fillStyle = 'rgba(255,250,238,0.85)';
    ctx.fill();
    text(ctx, `入职 ${shortDate(s.since)} · ${firstDay(s) ? '今天第一天' : `已上班 ${daysWorked(s)} 天`}`, 577, top + 86, 20, { color: P.inkSoft });

    // village ribbon (the painted village needs no title)
    if (sp.has(`hub_bg_${this.night ? 'eve' : 'day'}`)) return;
    const ry = top + 154;
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
    roundRect(ctx, -170, -26, 340, 52, 8);
    ctx.fill();
    ctx.stroke();
    text(ctx, '蛙趣蛙趣 · 河湾小镇', 0, 1, 30, { bold: true, color: P.white });
    ctx.restore();
  }

  /** The frog's face in a round frame, for the staff card. */
  private avatar(ctx: Ctx, x: number, y: number, r: number) {
    const sp = this.game.sprites;
    ctx.save();
    ellipse(ctx, x, y, r, r);
    ctx.fillStyle = P.tealLight;
    ctx.fill();
    ctx.clip();
    drawDressedFrog(ctx, sp, this.game.save.wear, 'frog_happy', x, y + r * 2.15, (0.62 * r) / 38);
    ctx.restore();
    ellipse(ctx, x, y, r, r);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }

  private drawProfile(ctx: Ctx) {
    const g = this.game;
    const s = g.save;
    const t = this.profile!.t;
    ctx.save();
    const d = dialog(ctx, g, this.taps, 'profile', 660, 720, t);
    const x = d.x, y = d.y;
    text(ctx, '我的工牌', 375, y + 50, 36, { bold: true });
    // the badge itself
    const bx = x + 40, by = y + 92, bw = d.w - 80, bh = 250;
    roundRect(ctx, bx, by, bw, bh, 18);
    ctx.fillStyle = P.white;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    roundRect(ctx, bx, by, bw, 46, 18);
    ctx.fillStyle = P.orange;
    ctx.fill();
    ctx.fillRect(bx, by + 24, bw, 22);
    text(ctx, '蛙趣快递 · 河湾线', bx + bw / 2, by + 24, 24, { bold: true, color: P.white });
    this.avatar(ctx, bx + 90, by + 140, 62);
    const ri = rankIndex(stampCount(s));
    text(ctx, s.name, bx + 180, by + 98, 40, { align: 'left', bold: true, maxWidth: 220 });
    text(ctx, RANKS[ri].name, bx + 180, by + 146, 28, { align: 'left', bold: true, color: P.orangeDeep });
    text(ctx, `工号 No.${String((s.since % 9000) + 1000)} · 入职 ${shortDate(s.since)}`, bx + 180, by + 190, 20, { align: 'left', color: P.inkSoft });
    pill(ctx, this.taps, 'rename', bx + bw - 120, by + 74, 100, 48, '改名', { size: 22 });

    // progress to the next rank
    const n = stampCount(s);
    const next = RANKS[ri + 1];
    const py = by + bh + 50;
    text(ctx, next ? `再拿 ${next.need - n} 枚好评章升为「${next.name}」` : '已经是最高职级了！', 375, py, 26, { bold: true, maxWidth: d.w - 60 });
    if (next?.perk) text(ctx, `升职奖励：${next.perk}`, 375, py + 36, 22, { color: P.inkSoft });
    const rows: [string, string][] = [
      ['上班', `${daysWorked(s)} 天`], ['送达', `${s.career.delivered} 单`],
      ['好评章', `${n} / ${stampsPossible()}`], ['成就', `${Object.keys(s.ach).length} / ${ACHIEVEMENTS.length}`],
    ];
    rows.forEach(([k, v], i) => {
      const cx = x + 40 + (i % 2) * ((d.w - 80) / 2), cy = py + 84 + Math.floor(i / 2) * 64;
      roundRect(ctx, cx, cy, (d.w - 80) / 2 - 12, 52, 12);
      ctx.fillStyle = P.cream;
      ctx.fill();
      text(ctx, k, cx + 20, cy + 27, 24, { align: 'left', color: P.inkSoft });
      text(ctx, v, cx + (d.w - 80) / 2 - 32, cy + 27, 26, { align: 'right', bold: true });
    });
    button(ctx, 375 - 120, y + d.h - 104, 240, 80, '好的', { primary: true, pressed: this.taps.add('close', { x: 255, y: y + d.h - 104, w: 240, h: 80 }), size: 30 });
    ctx.restore();
  }
}
