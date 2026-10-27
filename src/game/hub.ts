// The home page (主页): the river-bend village between workdays. From here the frog goes back to
// work, to the owl's HQ (records and photos), home (its room and photo wall) or the hamster's shop.
// The village is drawn in code (src/art/village.ts) for the hour of the day: morning, day, dusk or night.
import { cloud, contactShadow, drawBaked, fireflies, glints, grainRect, hills, icon, inked, lampGlow, sky, stars, sunMoon, TOD, todAt, tuft, type Tod, type TodName } from '../art/kit';
import { alpha, blobPath, mix, shade, tint } from '../art/kit';
import { INK, P } from '../art/palette';
import { codeSprite } from '../art/sprites';
import { button, ellipse, panel, pressIn, pressOut, roundRect, text } from '../art/ui';
import { bush, fence, flowerClump, hue, lampPost, leaves, lilyHouse, lilyPad, pine, postOffice, reeds, rock, roundTree, shopStall, signpost, van, vanWheel } from '../art/village';
import { clamp, easeOutCubic, lerp } from '../engine/math';
import type { Ctx } from '../platform/types';
import { ACHIEVEMENTS, RANKS, daysWorked, firstDay, rankIndex, stampCount, stampsPossible, unreadNotes } from './career';
import { GEAR, gearDef, gearMax, ITEMS, priceOf } from './catalog';
import { DAYS } from './config';
import type { Game, Scene } from './game';
import { HallScene } from './hall';
import { HomeScene } from './home';
import { MapScene } from './map';
import { Taps, Toast, coinPill, dialog, dot, drawDressedFrog, iconButton, pill, shortDate } from './menu';
import { PlayScene } from './play';
import { ShopScene } from './shop';
import { SCENE_MUSIC, hubAmbience } from './sound';

type Place = 'hq' | 'shop' | 'home' | 'work';
type Pt = { x: number; y: number };

interface Layout {
  H: number;
  top: number;
  bot: number;
  /** Height in the village as a share (0 at the header, 1 at the buttons). */
  Y: (v: number) => number;
  /** Buildings are drawn a little smaller on short screens. */
  sc: number;
  /** Where the land meets the hills. */
  hz: number;
  hq: Pt;
  shop: Pt;
  home: Pt;
  road: number;
  van: Pt;
  frog: Pt;
  /** Top of the river along the bottom. */
  river: number;
}

const HOP_T = 0.42;

/** What the locked places are called, for the newbie toast. */
const PLACE_NAMES: Record<string, string> = { hq: '河湾总部', shop: '福利社', home: '我的家', map: '路线图' };

const todOf = (v: string) => TOD[v as TodName] ?? TOD.day;
codeSprite('hub_hq', [-200, -318, 200, 28], (c, v) => postOffice(c, todOf(v)));
codeSprite('hub_shop', [-180, -294, 180, 26], (c, v) => shopStall(c, todOf(v)));
codeSprite('hub_home', [-180, -254, 180, 26], (c, v) => lilyHouse(c, todOf(v)));
codeSprite('hub_van', [-134, -172, 134, 20], (c, v) => van(c, todOf(v)));

/** Clouds: start x, height above the horizon, speed and size, seed. */
const CLOUDS = [[80, 150, 0.9, 3], [460, 118, 0.7, 5], [760, 168, 1.1, 8]] as const;
/** Lily pads on the river: x, depth below the bank, radius, seed, in flower. */
const PADS = [[268, 52, 30, 1, true], [420, 92, 24, 2, false], [574, 44, 34, 3, false], [700, 86, 26, 4, true], [36, 100, 22, 5, false]] as const;
/** Street lamps: x and height in the village (their light is drawn live). */
const LAMPS = [[392, 0.43], [252, 0.75], [700, 0.69]] as const;
/** Butterflies: home x, height, phase, colour. */
const FLIES = [[250, 0.4, 0, P.pink], [470, 0.62, 2.1, P.gold], [120, 0.7, 4.3, P.white]] as const;

/** Everything in the village that doesn't move, back to front. */
function paintVillage(ctx: Ctx, L: Layout, tod: Tod) {
  const { H, hz, Y } = L;
  const [dk, md] = leaves(tod);
  // sky, sun or moon, far mountains and the hills
  sky(ctx, 0, 0, 750, hz + 60, tod);
  sunMoon(ctx, 664, hz - 104, 26, tod);
  hills(ctx, -40, 840, hz - 70, hz + 60, 72, mix(tod.hillFar, tod.skyBot, 0.45), 21, 0.12);
  hills(ctx, -40, 840, hz - 26, hz + 60, 40, tod.hillFar, 7, 0.28);
  // a line of far trees along the hills
  ctx.fillStyle = shade(tod.hillNear, 0.1);
  for (let i = 0; i < 16; i++) {
    const x = i * 52 - 20 + (i % 3) * 9, r = 16 + (i % 4) * 4;
    puff(ctx, x, hz - 4 - r * 0.6, r, r * 0.9, i);
  }
  hills(ctx, -40, 840, hz, H, 14, tod.hillNear, 13, 0.3);
  // the lake on the right
  const lake = () => blobPath(ctx, [[480, hz + 26], [560, hz + 6], [690, hz + 2], [800, hz + 4], [800, hz + 64], [690, hz + 72], [560, hz + 62]], 9, 1.5);
  ctx.save();
  lake();
  ctx.lineWidth = 12;
  ctx.strokeStyle = hue(P.bank, tod);
  ctx.stroke();
  ctx.restore();
  inked(ctx, lake, tod.water, { band: 10, lw: 2.2, light: 0.3 });
  // a little sail on the lake
  inked(ctx, () => {
    ctx.beginPath();
    ctx.moveTo(624, hz + 30);
    ctx.lineTo(664, hz + 30);
    ctx.lineTo(656, hz + 38);
    ctx.lineTo(632, hz + 38);
    ctx.closePath();
  }, hue(P.wood, tod), { shade: false, lw: 1.8 });
  inked(ctx, () => {
    ctx.beginPath();
    ctx.moveTo(644, hz + 28);
    ctx.lineTo(644, hz - 4);
    ctx.lineTo(662, hz + 24);
    ctx.closePath();
  }, hue(P.white, tod), { shade: false, lw: 1.8 });
  // the village ground
  hills(ctx, -40, 840, hz + 40, H, 10, tod.ground, 17, 0.2);
  const gr = ctx.createLinearGradient(0, hz + 60, 0, H);
  gr.addColorStop(0, alpha(tod.ground, 0));
  gr.addColorStop(1, alpha(shade(tod.ground, 0.08), 1));
  ctx.fillStyle = gr;
  ctx.fillRect(0, hz + 60, 750, H - hz - 60);
  ctx.fillStyle = alpha(tod.groundDeep, 0.55);
  for (let i = 0; i < 14; i++) {
    const x = (i * 211 + 60) % 760, y = Y(0.2 + ((i * 0.137) % 0.72));
    puff(ctx, x, y, 46 + (i % 3) * 18, 14 + (i % 2) * 6, i + 30);
  }
  // paths from the square to every place, and the road out of the village
  const road = hue(P.road, tod), roadEdge = shade(tod.ground, 0.16);
  const path = (w: number, draw: () => void) => {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    draw();
    ctx.strokeStyle = roadEdge;
    ctx.lineWidth = w + 8;
    ctx.stroke();
    ctx.strokeStyle = road;
    ctx.lineWidth = w;
    ctx.stroke();
    ctx.strokeStyle = alpha(tint(road, 0.4), tod.stars ? 0.25 : 0.7);
    ctx.lineWidth = w * 0.35;
    ctx.stroke();
    ctx.restore();
  };
  const f = L.frog;
  path(66, () => {
    ctx.beginPath();
    ctx.moveTo(f.x, f.y - 10);
    ctx.quadraticCurveTo(420, L.road + 6, 560, L.road);
    ctx.lineTo(800, L.road - 4);
  });
  path(46, () => {
    ctx.beginPath();
    ctx.moveTo(f.x, f.y - 10);
    ctx.bezierCurveTo(360, Y(0.62), 250, Y(0.46), L.hq.x, L.hq.y + 10);
  });
  path(42, () => {
    ctx.beginPath();
    ctx.moveTo(f.x, f.y - 10);
    ctx.quadraticCurveTo(200, Y(0.74), L.home.x + 34 * L.sc, L.home.y + 8);
  });
  path(42, () => {
    ctx.beginPath();
    ctx.moveTo(318, Y(0.55));
    ctx.quadraticCurveTo(440, Y(0.53), L.shop.x - 20, L.shop.y + 10);
  });
  // pebbles along the paths
  ctx.fillStyle = alpha(hue(P.roadDeep, tod), 0.9);
  for (let i = 0; i < 26; i++) {
    const x = 120 + ((i * 167) % 560), y = Y(0.3 + ((i * 0.071) % 0.58));
    ellipse(ctx, x, y, 3 + (i % 3), 2 + (i % 2));
    ctx.fill();
  }
  // the square: a round of cobbles where the frog waits
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(f.x, f.y - 6, 124, 42, 0, 0, Math.PI * 2);
  ctx.fillStyle = tint(road, 0.25);
  ctx.fill();
  ctx.strokeStyle = roadEdge;
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.strokeStyle = alpha(INK, 0.3);
  ctx.lineWidth = 1.6;
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    ctx.beginPath();
    ctx.ellipse(f.x + Math.cos(a) * 112, f.y - 6 + Math.sin(a) * 34, 9, 5, a, 0, Math.PI * 2);
    ctx.fillStyle = hue('#D9CCAE', tod);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
  // the river along the bottom: a sandy bank, the water darker toward the bottom, reeds and stones
  const bank = () => {
    ctx.beginPath();
    ctx.moveTo(-20, H + 10);
    ctx.lineTo(-20, L.river + 8);
    for (let x = -20; x <= 780; x += 20) ctx.lineTo(x, L.river + Math.sin(x / 90) * 8 + Math.sin(x / 33) * 3);
    ctx.lineTo(780, H + 10);
    ctx.closePath();
  };
  ctx.save();
  ctx.translate(0, -8);
  bank();
  ctx.fillStyle = hue(P.bank, tod);
  ctx.fill();
  ctx.strokeStyle = alpha(INK, 0.35);
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
  const wg = ctx.createLinearGradient(0, L.river, 0, H);
  wg.addColorStop(0, tod.water);
  wg.addColorStop(1, tod.waterDeep);
  inked(ctx, bank, tod.water, { band: 14, lw: 2.4, light: 0.3 });
  ctx.save();
  bank();
  ctx.clip();
  ctx.fillStyle = wg;
  ctx.globalAlpha = 0.7;
  ctx.fillRect(0, L.river + 20, 750, H);
  ctx.restore();
  // a little landing stage where the rowboat is tied
  inked(ctx, () => polyPath4(ctx, 26, L.river - 18, 90, 66), hue(P.wood, tod), { band: 5, lw: 2.4 });
  ctx.save();
  ctx.strokeStyle = alpha(INK, 0.45);
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  for (let y = L.river - 6; y < L.river + 48; y += 12) {
    ctx.moveTo(28, y);
    ctx.lineTo(114, y);
  }
  ctx.stroke();
  ctx.restore();
  for (const px of [30, 110]) inked(ctx, () => polyPath4(ctx, px - 5, L.river + 30, 10, 34), hue(P.woodDeep, tod), { band: 2, lw: 2 });

  // trees, bushes, rocks, lamps and the rest, back to front
  type Thing = [number, () => void];
  const things: Thing[] = [];
  const add = (y: number, draw: () => void) => things.push([y, draw]);
  for (const [x, v, s, seed] of [[30, 0.11, 0.55, 1], [92, 0.1, 0.5, 2], [470, 0.13, 0.52, 3], [512, 0.15, 0.62, 4], [118, 0.23, 0.78, 5], [728, 0.33, 0.72, 6], [20, 0.31, 0.7, 7]] as const) add(Y(v), () => pine(ctx, x, Y(v), s, tod, seed));
  for (const [x, v, s, seed, fruit] of [
    [160, 0.13, 0.5, 11, ''], [48, 0.27, 0.9, 12, P.orange], [690, 0.25, 0.78, 13, P.pink], [36, 0.47, 0.82, 14, ''],
    [46, 0.87, 0.92, 15, P.red], [700, 0.885, 0.86, 16, ''],
  ] as const) add(Y(v), () => roundTree(ctx, x, Y(v), s, tod, seed, fruit ? hue(fruit, tod) : undefined));
  for (const [x, v, s, seed, bloom] of [[198, 0.33, 0.7, 21, P.pink], [452, 0.36, 0.62, 22, ''], [72, 0.71, 0.8, 23, P.white], [452, 0.87, 0.6, 24, P.gold], [612, 0.83, 0.55, 25, '']] as const) {
    add(Y(v), () => bush(ctx, x, Y(v), s, tod, seed, bloom || undefined));
  }
  for (const [x, dy, s, seed] of [[600, -6, 1, 31], [190, 2, 0.8, 32], [360, -2, 0.6, 33]] as const) add(L.river + dy, () => rock(ctx, x, L.river + dy, s, tod, seed));
  for (const [x, dy, s, seed] of [[150, 10, 0.9, 41], [520, 6, 0.8, 42], [742, 12, 1, 43], [400, 16, 0.7, 44]] as const) add(L.river + dy, () => reeds(ctx, x, L.river + dy, s, tod, seed));
  for (const [x, v] of LAMPS) add(Y(v), () => lampPost(ctx, x, Y(v), tod));
  add(L.road - 34, () => fence(ctx, 440, L.road - 36, 770, L.road - 40, tod, 51));
  add(f.y - 2, () => signpost(ctx, 150, f.y - 2, tod));
  for (const [x, v, seed] of [[250, 0.37, 61], [416, 0.6, 62], [118, 0.65, 63], [566, 0.81, 64], [270, 0.68, 65], [470, 0.47, 66], [24, 0.6, 67], [650, 0.4, 68], [340, 0.91, 69]] as const) add(Y(v), () => flowerClump(ctx, x, Y(v), tod, seed));
  for (let i = 0; i < 22; i++) {
    const x = (i * 293 + 40) % 740, v = 0.18 + ((i * 0.193) % 0.72);
    add(Y(v), () => tuft(ctx, x, Y(v), 0, 0.9, i % 2 ? md : dk));
  }
  things.sort((a, b) => a[0] - b[0]);
  for (const [, draw] of things) draw();
  grainRect(ctx, 0, 0, 750, H, 0.35);
}

/** A soft round lump (far trees, ground patches) filled with the current fill style. */
function puff(ctx: Ctx, x: number, y: number, rx: number, ry: number, seed: number) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, (seed % 5) * 0.04 - 0.08, 0, Math.PI * 2);
  ctx.fill();
}

/** A plain hand-inked box path, for the landing stage's planks and posts. */
function polyPath4(ctx: Ctx, x: number, y: number, w: number, h: number) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y + 1);
  ctx.lineTo(x + w - 1, y + h);
  ctx.lineTo(x + 1, y + h - 1);
  ctx.closePath();
}

export class HubScene implements Scene {
  readonly id = 'hub';
  private t = 0;
  private taps = new Taps();
  private toast = new Toast();
  /** The frog hopping toward where it was sent; the screen changes when it lands. */
  private hop: { to: Place; t: number; x0: number; y0: number; x1: number; y1: number; done?: boolean } | null = null;
  private joy = 0;
  /** The hour's look: morning, day, dusk or night (the same hours as the room's window). */
  private tod = todAt();
  private profile: { t: number } | null = null;
  private spots: Record<Place, Pt> = { hq: { x: 0, y: 0 }, shop: { x: 0, y: 0 }, home: { x: 0, y: 0 }, work: { x: 0, y: 0 } };
  private frogAt: Pt = { x: 375, y: 0 };

  constructor(private game: Game) {
    game.audio.setMusic(SCENE_MUSIC.hub);
    game.audio.setAmbience(hubAmbience(this.tod.stars));
    game.tm.day = null;
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
    // the hour can turn while the player sits here
    if (Math.floor(this.t) !== Math.floor(this.t - dt) && Math.floor(this.t) % 30 === 0) {
      const now = todAt();
      if (now !== this.tod) {
        this.tod = now;
        this.game.audio.setAmbience(hubAmbience(now.stars));
      }
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
      this.toast.show(`先去上班，通过第 1 天就开放${PLACE_NAMES[id]}啦`, 'lock');
      this.game.tm.log('hub_locked', { id });
      return;
    }
    if (id === 'hq' || id === 'shop' || id === 'home' || id === 'work') this.go(id);
    else if (id === 'map') {
      au.play('ui_confirm');
      this.game.tm.log('hub_go', { to: 'map' });
      this.game.go(new MapScene(this.game), true);
    } else if (id === 'music' || id === 'sfx') {
      const s = this.game.save;
      const on = id === 'music' ? !s.music : !s.sfx;
      this.game.setAudio(id === 'music' ? { music: on } : { sfx: on });
      if (s.sfx) au.play('ui_tap');
      this.toast.show(`${id === 'music' ? '音乐' : '音效'}${on ? '已打开' : '已关闭'}`, id === 'music' ? (on ? 'music' : 'musicOff') : on ? 'speaker' : 'mute');
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

  /** Where everything goes on this screen: the village fills what's between the header and the buttons. */
  private layout(): Layout {
    const g = this.game;
    const H = g.H, top = g.safeT, bot = H - g.safeB;
    const y0 = top + 128, h = bot - 158 - y0;
    const Y = (v: number) => y0 + h * v;
    const road = Y(0.715);
    return {
      H, top, bot, Y,
      sc: clamp(h / 1300, 0.8, 1),
      hz: Y(0.1),
      hq: { x: 292, y: Y(0.255) },
      shop: { x: 566, y: Y(0.5) },
      home: { x: 170, y: Y(0.56) },
      road,
      van: { x: 540, y: road + 24 },
      frog: { x: 300, y: Y(0.82) },
      river: Y(0.92),
    };
  }

  render(ctx: Ctx) {
    const g = this.game;
    const sp = g.sprites;
    const s = g.save;
    const L = this.layout();
    const tod = this.tod;
    const bot = L.bot;
    this.taps.clear();
    this.frogAt = L.frog;
    const sc = L.sc;
    this.spots = {
      hq: { x: L.hq.x, y: L.hq.y + 6 },
      shop: { x: L.shop.x - 30, y: L.shop.y + 10 },
      home: { x: L.home.x + 34 * sc, y: L.home.y + 8 },
      work: { x: L.van.x + 40 * sc, y: L.van.y + 8 },
    };

    // the village itself is baked once per hour and screen size; only the things that move are drawn live
    drawBaked(ctx, `hub:${tod.name}:${Math.round(L.H)}:${Math.round(L.top)}:${Math.round(bot)}`, 0, 0, [0, 0, 750, L.H], (c) => paintVillage(c, L, tod));
    this.drawLive(ctx, L, false);

    const unread = unreadNotes(s) > 0;
    const shopNew = this.affordable();
    const homeNew = s.letters.length > s.seen.letters;
    this.smoke(ctx, L.hq.x - 104 * sc, L.hq.y - 306 * sc, 0.8);
    this.place(ctx, 'hq', 'hub_hq', L.hq.x, L.hq.y, '河湾总部', '送单 · 日志 · 相册', unread, sc);
    this.place(ctx, 'shop', 'hub_shop', L.shop.x, L.shop.y, '福利社', '装备 · 衣帽 · 家居', shopNew, sc);
    this.smoke(ctx, L.home.x + 62 * sc, L.home.y - 246 * sc, 1);
    this.place(ctx, 'home', 'hub_home', L.home.x, L.home.y, '我的家', '房间 · 照片墙 · 记录', homeNew, sc);
    this.drawVan(ctx, L);
    this.drawLive(ctx, L, true);

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
    button(ctx, 504, by, 214, 104, '路线图', { pressed: mapDown, size: 34, disabled: this.newbie, icon: this.newbie ? 'lock' : 'map' });
    roundRect(ctx, 40, by + 112, 670, 32, 16);
    ctx.fillStyle = alpha(P.white, 0.9);
    ctx.fill();
    text(ctx, `第${day}天 · ${DAYS[day - 1].intro}`, 375, by + 128, 22, { color: INK, alpha: 0.85, maxWidth: 650 });

    if (this.profile) this.drawProfile(ctx);
    // clear of the staff card's bottom edge
    this.toast.render(ctx, g.safeT + 140);
  }

  /** A gear upgrade or something on sale the frog can pay for right now. */
  private affordable() {
    const s = this.game.save;
    if (GEAR.some((g) => (s.gear[g.id] ?? 1) < gearMax(g.id) && gearDef(g.id).prices[(s.gear[g.id] ?? 1) - 1] <= s.coins)) return true;
    return ITEMS.some((i) => i.price && !s.owned.includes(i.id) && (priceOf(i) ?? Infinity) <= s.coins && s.coins >= 150);
  }

  /**
   * What moves in the village. Behind the buildings (`front` false): clouds, birds, stars, water glints, lily
   * pads, the rowboat. In front of them: lamp light, fireflies and butterflies.
   */
  private drawLive(ctx: Ctx, L: Layout, front: boolean) {
    const t = this.t, tod = this.tod;
    if (!front) {
      if (tod.stars) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, 750, L.hz - 110);
        ctx.clip();
        stars(ctx, 0, L.top + 90, 750, L.hz - 110 - (L.top + 90), t, 46);
        ctx.restore();
      }
      for (const [x0, y, k, seed] of CLOUDS) {
        const x = ((x0 + t * 7 * k) % 1000) - 150;
        drawBaked(ctx, `cloud:${tod.name}:${seed}`, x, L.hz - y, [-80, -50, 80, 30], (c) => cloud(c, 0, 0, 1, tod, seed), k);
      }
      if (!tod.stars) this.birds(ctx, L);
      // the lake and the river glint, the pads bob
      glints(ctx, () => {
        ctx.beginPath();
        ctx.moveTo(560, L.hz + 26);
        ctx.lineTo(760, L.hz + 26);
        ctx.moveTo(600, L.hz + 46);
        ctx.lineTo(760, L.hz + 46);
      }, t * 0.4, tod, 2.4);
      glints(ctx, () => {
        ctx.beginPath();
        for (const dy of [26, 62, 100]) {
          ctx.moveTo(-40, L.river + dy);
          for (let x = -40; x <= 790; x += 30) ctx.lineTo(x, L.river + dy + Math.sin(x / 80 + dy) * 5);
        }
      }, t, tod, 3);
      for (const [x, dy, r, seed, bloom] of PADS) {
        const bob = Math.sin(t * 1.3 + seed) * 2;
        drawBaked(ctx, `pad:${tod.name}:${seed}:${r}`, x + Math.sin(t * 0.4 + seed) * 4, L.river + dy + bob, [-r - 8, -r - 30, r + 8, r * 0.6 + 8], (c) => lilyPad(c, 0, 0, r, tod, seed, bloom));
      }
      this.rowboat(ctx, 128, L.river + 66 + Math.sin(t * 1.6) * 2, Math.sin(t * 1.1) * 0.03);
      return;
    }
    if (tod.lit > 0) for (const [x, v] of LAMPS) lampGlow(ctx, x, L.Y(v) - 114, 90, tod, t + x);
    if (tod.stars) fireflies(ctx, 0, L.Y(0.3), 750, L.river - L.Y(0.3), t, 10);
    else this.butterflies(ctx, L);
  }

  /** Two birds gliding across the sky now and then. */
  private birds(ctx: Ctx, L: Layout) {
    const k = (this.t / 26) % 1;
    if (k > 0.6) return;
    const x = -60 + (k / 0.6) * 900, y = L.hz - 120 + Math.sin(k * 9) * 10;
    ctx.save();
    ctx.strokeStyle = alpha(P.ink, 0.6);
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const [dx, dy, ph] of [[0, 0, 0], [-34, 14, 1.4]] as const) {
      const f = Math.sin(this.t * 9 + ph) * 5;
      ctx.beginPath();
      ctx.moveTo(x + dx - 12, y + dy - 2 - f);
      ctx.quadraticCurveTo(x + dx - 5, y + dy - 6 - f * 0.5, x + dx, y + dy);
      ctx.quadraticCurveTo(x + dx + 5, y + dy - 6 - f * 0.5, x + dx + 12, y + dy - 2 - f);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Butterflies wandering over the flowers in daylight. */
  private butterflies(ctx: Ctx, L: Layout) {
    for (const [cx, v, ph, color] of FLIES) {
      const t = this.t * 0.5 + ph;
      const x = cx + Math.sin(t * 1.3) * 60 + Math.sin(t * 2.9) * 14;
      const y = L.Y(v) + Math.sin(t * 1.7) * 26 + Math.cos(t * 3.3) * 8;
      const flap = Math.abs(Math.sin(this.t * 14 + ph));
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = color;
      ctx.strokeStyle = P.ink;
      ctx.lineWidth = 1.4;
      for (const s of [-1, 1]) {
        ctx.save();
        ctx.scale(s * (0.3 + flap * 0.7), 1);
        ctx.beginPath();
        ctx.ellipse(6, -4, 7, 5.5, -0.5, 0, Math.PI * 2);
        ctx.ellipse(5, 4, 5, 4, 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
      ctx.fillStyle = P.ink;
      ctx.fillRect(-1, -6, 2, 12);
      ctx.restore();
    }
  }

  /** The little rowboat tied up by the bank. */
  private rowboat(ctx: Ctx, x: number, y: number, rot: number) {
    const tod = this.tod;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.beginPath();
    ctx.ellipse(0, 8, 58, 9, 0, 0, Math.PI * 2);
    ctx.fillStyle = alpha(shade(tod.waterDeep, 0.3), 0.4);
    ctx.fill();
    inked(ctx, () => {
      ctx.beginPath();
      ctx.moveTo(-60, -16);
      ctx.quadraticCurveTo(0, -10, 62, -18);
      ctx.quadraticCurveTo(52, 6, 30, 8);
      ctx.lineTo(-38, 8);
      ctx.quadraticCurveTo(-56, 4, -60, -16);
      ctx.closePath();
    }, hue(P.wood, tod), { band: 6, lw: 2.4 });
    inked(ctx, () => {
      ctx.beginPath();
      ctx.moveTo(-54, -15);
      ctx.quadraticCurveTo(0, -9, 56, -17);
      ctx.quadraticCurveTo(0, -4, -54, -15);
      ctx.closePath();
    }, hue(P.woodDeep, tod), { shade: false, lw: 1.8 });
    ctx.strokeStyle = alpha(P.ink, 0.5);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-50, -4);
    ctx.quadraticCurveTo(0, 0, 50, -6);
    ctx.stroke();
    ctx.restore();
    // its rope to the bank
    ctx.strokeStyle = alpha(P.ink, 0.6);
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(x - 56, y - 14);
    ctx.quadraticCurveTo(x - 76, y - 10, x - 84, y - 52);
    ctx.stroke();
  }

  /** The courier van waiting on the road: idling a little, a puff of exhaust now and then, lights on after dark. */
  private drawVan(ctx: Ctx, L: Layout) {
    const tod = this.tod, sp = this.game.sprites;
    const { x, y } = L.van;
    const k = L.sc * 0.92;
    const down = this.taps.add('work', { x: x - 120 * k, y: y - 170 * k, w: 240 * k, h: 180 * k });
    const go = this.hop?.to === 'work' ? Math.sin((this.hop.t / HOP_T) * Math.PI) : 0;
    const bob = Math.sin(this.t * 13) * 0.8 - go * 4;
    ctx.save();
    if (down) {
      ctx.translate(x, y);
      ctx.scale(0.97, 0.97);
      ctx.translate(-x, -y);
    }
    // exhaust
    for (let i = 0; i < 3; i++) {
      const p = (this.t * 0.8 + i / 3) % 1;
      ctx.globalAlpha = 0.45 * (1 - p);
      ellipse(ctx, x - 118 * k - p * 60, y - 30 * k - p * 26, 6 + p * 14, 5 + p * 10);
      ctx.fillStyle = tod.stars ? '#C8CFD8' : P.white;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (tod.lit > 0) lampGlow(ctx, x + 124 * k, y - 58 * k, 70, tod, this.t);
    sp.draw(ctx, `hub_van:${tod.name}`, x, y + bob, k);
    for (const wx of [-62, 62]) vanWheel(ctx, x + wx * k, y - 22 * k, 21 * k, this.t * 0.6, tod);
    ctx.restore();
    this.sign(ctx, 'work', x - 105, y + 12, '运输车', `去上班 · 第${this.workDay}天`, false, 210);
  }

  private smoke(ctx: Ctx, x: number, y: number, s: number) {
    ctx.save();
    for (let i = 0; i < 4; i++) {
      const k = (this.t * 0.3 + i / 4) % 1;
      ctx.globalAlpha = 0.55 * (1 - k) * Math.min(1, k * 6);
      ellipse(ctx, x + Math.sin(k * 5 + i) * 10 * s, y - k * 110 * s, (10 + k * 18) * s, (8 + k * 14) * s);
      ctx.fillStyle = this.tod.stars ? '#C8CFD8' : P.white;
      ctx.fill();
    }
    ctx.restore();
  }

  /** A building with its signpost; the whole thing is one tap target. */
  private place(ctx: Ctx, id: Place, sprite: string, x: number, y: number, name: string, sub: string, isNew: boolean, k = 1) {
    const sp = this.game.sprites;
    const name_ = `${sprite}:${this.tod.name}`;
    const s = sp.get(name_);
    const r = { x: x - s.ax * k, y: y - s.ay * k, w: s.w * k, h: s.h * k + 70 };
    const down = this.taps.add(id, r);
    const bounce = this.hop?.to === id ? Math.sin((this.hop.t / HOP_T) * Math.PI) * 0.03 : 0;
    const locked = this.newbie;
    ctx.save();
    if (down) {
      ctx.translate(x, y);
      ctx.scale(0.97, 0.97);
      ctx.translate(-x, -y);
    }
    sp.draw(ctx, name_, x, y, k * (1 + bounce), k * (1 - bounce));
    ctx.restore();
    this.sign(ctx, id, x - 110, y + 8, locked ? '未开放' : name, locked ? '通过第 1 天后开放' : sub, locked ? false : isNew, 220, down, locked);
  }

  private sign(ctx: Ctx, id: string, x: number, y: number, name: string, sub: string, isNew: boolean, w: number, down = this.taps.pressed === id, locked = false) {
    x = clamp(x, 10, 740 - w);
    const r = { x, y, w, h: 76 };
    this.taps.add(id, r, 6);
    pressIn(ctx, r, down);
    panel(ctx, x, y, w, 76, { r: 14, fill: locked ? '#EDE6D6' : P.cream, shadow: true });
    if (locked) {
      icon(ctx, 'lock', x + 34, y + 38, 34, { faded: true });
      text(ctx, name, x + w / 2 + 16, y + 26, 30, { bold: true, color: P.inkSoft });
      text(ctx, sub, x + w / 2 + 16, y + 56, 18, { color: P.inkSoft, maxWidth: w - 70 });
    } else {
      text(ctx, name, x + w / 2, y + 26, 30, { bold: true });
      text(ctx, sub, x + w / 2, y + 56, 19, { color: P.inkSoft, maxWidth: w - 20 });
    }
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
    contactShadow(ctx, x, y + 2, 36 - z * 0.12, 10, this.tod.shadow + 0.1);
    drawDressedFrog(ctx, sp, s.wear, pose, x, y - z, 0.8);
    this.taps.add('frog', { x: x - 60, y: y - 150, w: 120, h: 160 });
  }

  /** Staff card on the left; coins, music and effects switches on the right; the start date underneath. */
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

    coinPill(ctx, sp, 422, top + 2, s.coins, 0, { w: 140 });
    iconButton(ctx, this.taps, 'music', 612, top + 30, 58, s.music ? 'music' : 'musicOff');
    iconButton(ctx, this.taps, 'sfx', 690, top + 30, 58, s.sfx ? 'speaker' : 'mute');
    roundRect(ctx, 432, top + 68, 290, 34, 17);
    ctx.fillStyle = alpha(P.white, 0.88);
    ctx.fill();
    text(ctx, `入职 ${shortDate(s.since)} · ${firstDay(s) ? '今天第一天' : `已上班 ${daysWorked(s)} 天`}`, 577, top + 86, 20, { color: P.inkSoft });
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
