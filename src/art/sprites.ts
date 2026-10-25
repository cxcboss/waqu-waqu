import type { Ctx, ImageSource, Platform } from '../platform/types';
import { P } from './palette';
import { HOUSE_DEFS, POSES, RESIDENT_DEFS, RES_FRAME } from '../game/cast';
import { critter, critterAvatar } from './critters';
import { placeholderHouse } from './houses';
import * as A from './shapes';
import * as H from './shapes-home';
import { defs } from './svg';

/** Design units (750-wide canvas) per concept unit (1080-wide concept art). */
export const K = 750 / 1080;
export const TILE_H = 2016; // background tile height in concept units (1400 design units)

export interface Sprite {
  img: ImageSource;
  /** Size and anchor in design units. */
  w: number;
  h: number;
  ax: number;
  ay: number;
}

interface SpriteDef {
  /** Bounds in concept units relative to the origin: [x0, y0, x1, y1]. */
  b: [number, number, number, number];
  /** Design units per concept unit. */
  s: number;
  /** Placeholder drawing; null for art that only exists painted. */
  svg: (() => string) | null;
  /** Painted-only art without its PNG borrows this sprite instead (same anchor). */
  alias?: string;
  /** Loaded when a scene asks for it (see `ensure`), not at startup. */
  lazy?: boolean;
  /** Until this one is painted, use `prefer` if that one is (a resident's painted idle pose beats a placeholder pose). */
  prefer?: string;
}

const D: Record<string, SpriteDef> = {};
const def = (name: string, b: SpriteDef['b'], svg: () => string, s = K) => (D[name] = { b, s, svg });
const defLazy = (name: string, b: SpriteDef['b'], svg: (() => string) | null, prefer?: string) => (D[name] = { b, s: K, svg, lazy: true, prefer });
/** Art with no placeholder: missing its PNG, it's the `alias` sprite, or not there at all (see `has`). */
const paintedOnly = (name: string, b: SpriteDef['b'], alias?: string) => (D[name] = { b, s: K, svg: null, alias });

// River
const lilyOpts = [
  { notch: 290, flower: 1 },
  { notch: 220 },
  { notch: 320, color: '#89B871' },
  { notch: 250, flower: 0.9 },
];
lilyOpts.forEach((o, i) => def(`lily${i}`, [-140, -80, 140, 100], () => A.lilyPad(0, 0, 100, o)));
def('log', [-130, -62, 130, 48], A.log);
def('truck_orange', [-136, -202, 136, 200], () => A.truckBody(P.orange, P.orangeDeep, '#F2A57A'));
def('truck_blue', [-136, -202, 136, 200], () => A.truckBody(P.blue, '#2E4659', P.blueLight));
def('splash', [-100, -80, 100, 40], A.splash);
def('heart', [-36, -36, 36, 26], A.heart);

// Frog (origin between the feet)
const FB: SpriteDef['b'] = [-104, -196, 104, 40];
def('frog_stand', FB, () => A.frog({ pose: 'stand' }));
def('frog_crouch', FB, () => A.frog({ pose: 'crouch', look: [2, -5] }));
def('frog_jump', FB, () => A.frog({ pose: 'jump', look: [2, -6] }));
def('frog_swim', [-104, -116, 104, 44], () => A.frog({ pose: 'swim', mood: 'nervous' }));
def('frog_nervous', FB, () => A.frog({ pose: 'stand', mood: 'nervous', look: [6, -4] }));
def('frog_happy', FB, () => A.frog({ pose: 'stand', mood: 'happy' }));
def('frog_shock', FB, () => A.frog({ pose: 'stand', mood: 'shock', look: [0, -2] }));
paintedOnly('frog_lick', FB, 'frog_shock');
paintedOnly('frog_cling', [-104, -116, 104, 44], 'frog_swim');
paintedOnly('frog_dunk', [-104, -116, 104, 44], 'frog_swim');
// More frog moments: painted-only, standing in for an existing pose until they're painted.
// The water and truck ones are drawn by the swimming and rope-pull code.
for (const [name, alias] of [
  ['frog_land', 'frog_crouch'], ['frog_wobble', 'frog_nervous'], ['frog_give', 'frog_stand'], ['frog_salute', 'frog_happy'],
  ['frog_cheer', 'frog_happy'], ['frog_sad', 'frog_nervous'], ['frog_tired', 'frog_nervous'], ['frog_heavy', 'frog_stand'],
  ['frog_yawn', 'frog_happy'], ['frog_look', 'frog_stand'], ['frog_flip', 'frog_crouch'], ['frog_dragged', 'frog_nervous'],
  ['frog_flung', 'frog_shock'], ['frog_dizzy', 'frog_nervous'],
]) paintedOnly(name, FB, alias);
// The frog without its postman cap, for wearing a hat of its own
for (const k of ['stand', 'happy', 'nervous', 'shock', 'crouch', 'jump']) paintedOnly(`frog_${k}_nc`, FB, `frog_${k}`);
paintedOnly('frog_kick', [-104, -116, 104, 44], 'frog_swim');
def('satchel0', [-30, -12, 36, 40], () => A.satchel(0));
def('satchel1', [-36, -12, 42, 48], () => A.satchel(1));
def('satchel2', [-42, -12, 48, 58], () => A.satchel(2));

// Residents: r_<who>_<pose>, all in one frame with the origin at the feet, plus a portrait each.
for (const r of RESIDENT_DEFS) {
  for (const pose of POSES) defLazy(`r_${r.id}_${pose}`, RES_FRAME, () => critter(r.id, pose), pose === 'idle' ? undefined : `r_${r.id}_idle`);
  defLazy(`avatar_${r.id}`, [-38, -38, 38, 38], () => critterAvatar(r.id));
}

// Houses (origin at the raft center). door_<house> is the painted door standing open, over the door.
const OLD_HOUSES: Record<string, () => string> = { teapot: A.teapotHouse, boot: A.bootHouse, can: A.canHouse };
for (const h of HOUSE_DEFS) {
  defLazy(`house_${h.id}`, h.b, OLD_HOUSES[h.id] ?? (() => placeholderHouse(h.id)));
  const d = h.door;
  defLazy(`door_${h.id}`, [d.x - d.w / 2 - 8, d.y - d.h - 8, d.x + d.w / 2 + 8, d.y + 4], null);
}

// Parcels (origin at bottom center of the front face)
for (const size of [0, 1, 2] as const) {
  def(`box${size}`, [-44, -80, 44, 6], () => A.box(size, 'label'));
  def(`box${size}u`, [-44, -80, 44, 6], () => A.box(size, 'urgent'));
  paintedOnly(`box${size}c`, [-44, -80, 44, 6], `box${size}`);
}

/** A parcel's sprite: plain, urgent (red label) or cash on delivery (gold label). */
export const boxSprite = (size: number, urgent?: boolean, cod?: unknown) => `box${size}${urgent ? 'u' : cod ? 'c' : ''}`;

// UI bits
def('coin', [-30, -30, 30, 30], () => A.coin(26));
def('hand', [-44, -6, 64, 120], A.hand);
paintedOnly('letter', [-42, -28, 42, 28]);
paintedOnly('bill', [-135.4, -74.9, 135.4, 74.9]);

// Route map
paintedOnly('willow', [-89.3, -132.5, 89.3, 92.2]);
paintedOnly('map_meadow', [0, 0, 1080, 1620]);

// HQ
const HQ_ROOM_H = 1296;
export const HQ_ROOM = { h: HQ_ROOM_H * K, contentH: 800 * K };
def('hq_room', [0, 0, 1080, HQ_ROOM_H], () => A.hqRoom(HQ_ROOM_H));
def('hq_counter', [-20, -68, 1100, 236], A.hqCounter);
def('owl', [-150, -320, 150, 6], A.owl);
def('owl_wing', [-10, -190, 210, 20], A.owlWing);

// Outside work: home page buildings, the frog's room, the shop, hats and gear (shapes-home.ts)
def('hub_hq', [-226, -380, 226, 30], H.hubHq);
def('hub_shop', [-182, -340, 182, 26], H.hubShop);
def('hub_home', [-182, -314, 190, 28], H.hubHome);
def('shop_hamster', [-74, -176, 74, 14], H.hamster);
def('home_bed', [-176, -226, 170, 20], H.bed);
def('home_wardrobe', [-118, -418, 118, 18], H.wardrobe);
def('home_desk', [-160, -228, 160, 18], H.desk);
def('deco_rug', [-200, -72, 200, 72], H.rug);
def('deco_plant', [-64, -142, 64, 6], H.plant);
def('deco_clock', [-62, -146, 62, 54], H.cuckoo);
def('deco_lights', [-256, -6, 256, 54], H.lights);
def('deco_lamp', [-72, -154, 72, 8], H.lamp);
def('deco_fish', [-56, -108, 56, 8], H.fishbowl);
def('deco_shelf', [-132, -120, 132, 28], H.shelf);
def('deco_record', [-86, -194, 86, 16], H.recordPlayer);
for (const [k, b] of [
  ['straw', [-84, -60, 84, 22]], ['flower', [-6, -50, 46, 20]], ['beanie', [-54, -88, 54, 14]], ['beret', [-58, -56, 66, 12]],
  ['top', [-58, -106, 58, 18]], ['pilot', [-60, -64, 60, 38]], ['swim', [-50, -62, 50, 14]], ['gold', [-44, -52, 50, 14]],
] as const) def(`hat_${k}`, [...b], () => H.hat(k));
for (const [k, b] of [['scarf', [-68, -14, 68, 70]], ['bow', [-40, -24, 40, 24]], ['camera', [-44, -12, 44, 68]]] as const) def(`neck_${k}`, [...b], () => H.neck(k));
for (const k of ['bag', 'shoe', 'fin']) def(`gear_${k}`, [-62, -64, 62, 64], () => H.gearIcon(k));
/** Optional painted backgrounds; without them the screens draw their own. */
paintedOnly('home_room', [0, 0, 1080, 1620]);
paintedOnly('shop_room', [0, 0, 1080, 1620]);

// Scene art (round 5), painted only: home page scenery, HQ owl poses / tabs / badges / medals / frames,
// the room's window and new furniture, the shop's hamster poses / counter / gear levels. Loaded when a scene asks.
for (const [name, b, s] of [
  ['hub_signpost', [-95, -260, 95, 0], K],
  ['hub_bridge', [-100, -130, 100, 130], K],
  ['hub_tree_a', [-110, -300, 110, 0], K],
  ['hub_tree_b', [-100, -320, 100, 0], K],
  ['hub_flowers_a', [-80, -100, 80, 0], K],
  ['hub_flowers_b', [-70, -110, 70, 0], K],
  ['hub_lamp', [-45, -240, 45, 0], K],
  ['hub_bg_day', [0, 0, 1080, 1620], K],
  ['hub_bg_eve', [0, 0, 1080, 1620], K],
  ['hub_hq_eve', [-226, -380, 226, 30], K],
  ['hub_shop_eve', [-182, -340, 182, 26], K],
  ['hub_home_eve', [-182, -314, 190, 28], K],
  ['owl_read', [-150, -320, 150, 6], K],
  ['owl_stamp', [-150, -320, 150, 6], K],
  ['owl_cheer', [-150, -320, 150, 6], K],
  ['owl_sleepy', [-150, -320, 150, 6], K],
  ['tab_record', [-48, -48, 48, 48], K],
  ['tab_log', [-48, -48, 48, 48], K],
  ['tab_album', [-48, -48, 48, 48], K],
  ['tab_honour', [-48, -48, 48, 48], K],
  ['tab_news', [-48, -48, 48, 48], K],
  ['badge_rank0', [-180, -115, 180, 115], K],
  ['badge_rank1', [-180, -115, 180, 115], K],
  ['badge_rank2', [-180, -115, 180, 115], K],
  ['badge_rank3', [-180, -115, 180, 115], K],
  ['badge_rank4', [-180, -115, 180, 115], K],
  ['badge_rank5', [-180, -115, 180, 115], K],
  ['badge_rank6', [-180, -115, 180, 115], K],
  ['frame_wood', [-180, -220, 180, 220], K],
  ['frame_lily', [-180, -220, 180, 220], K],
  ['frame_shell', [-180, -220, 180, 220], K],
  ['frame_gold', [-180, -220, 180, 220], K],
  ['medal_first', [-64, -64, 64, 64], K],
  ['medal_first_off', [-64, -64, 64, 64], K],
  ['medal_deliver30', [-64, -64, 64, 64], K],
  ['medal_deliver30_off', [-64, -64, 64, 64], K],
  ['medal_deliver100', [-64, -64, 64, 64], K],
  ['medal_deliver100_off', [-64, -64, 64, 64], K],
  ['medal_urgent10', [-64, -64, 64, 64], K],
  ['medal_urgent10_off', [-64, -64, 64, 64], K],
  ['medal_cod10', [-64, -64, 64, 64], K],
  ['medal_cod10_off', [-64, -64, 64, 64], K],
  ['medal_trip3', [-64, -64, 64, 64], K],
  ['medal_trip3_off', [-64, -64, 64, 64], K],
  ['medal_sgrade', [-64, -64, 64, 64], K],
  ['medal_sgrade_off', [-64, -64, 64, 64], K],
  ['medal_clean5', [-64, -64, 64, 64], K],
  ['medal_clean5_off', [-64, -64, 64, 64], K],
  ['medal_spring', [-64, -64, 64, 64], K],
  ['medal_spring_off', [-64, -64, 64, 64], K],
  ['medal_longjump', [-64, -64, 64, 64], K],
  ['medal_longjump_off', [-64, -64, 64, 64], K],
  ['medal_fall1', [-64, -64, 64, 64], K],
  ['medal_fall1_off', [-64, -64, 64, 64], K],
  ['medal_fall50', [-64, -64, 64, 64], K],
  ['medal_fall50_off', [-64, -64, 64, 64], K],
  ['medal_rescue1', [-64, -64, 64, 64], K],
  ['medal_rescue1_off', [-64, -64, 64, 64], K],
  ['medal_rescue30', [-64, -64, 64, 64], K],
  ['medal_rescue30_off', [-64, -64, 64, 64], K],
  ['medal_thrown1', [-64, -64, 64, 64], K],
  ['medal_thrown1_off', [-64, -64, 64, 64], K],
  ['medal_letter1', [-64, -64, 64, 64], K],
  ['medal_letter1_off', [-64, -64, 64, 64], K],
  ['medal_letter3', [-64, -64, 64, 64], K],
  ['medal_letter3_off', [-64, -64, 64, 64], K],
  ['medal_runs10', [-64, -64, 64, 64], K],
  ['medal_runs10_off', [-64, -64, 64, 64], K],
  ['medal_album10', [-64, -64, 64, 64], K],
  ['medal_album10_off', [-64, -64, 64, 64], K],
  ['medal_home1', [-64, -64, 64, 64], K],
  ['medal_home1_off', [-64, -64, 64, 64], K],
  ['medal_hats3', [-64, -64, 64, 64], K],
  ['medal_hats3_off', [-64, -64, 64, 64], K],
  ['medal_gearmax', [-64, -64, 64, 64], K],
  ['medal_gearmax_off', [-64, -64, 64, 64], K],
  ['home_window_day', [-150, -180, 150, 180], K],
  ['home_window_night', [-150, -180, 150, 180], K],
  ['home_mailbox', [-75, -210, 75, 0], K],
  ['home_ledger', [-100, -150, 100, 0], K],
  ['home_wardrobe_open', [-118, -436, 118, 0], K],
  ['deco_cushion', [-75, -120, 75, 0], K],
  ['deco_teatable', [-115, -200, 115, 0], K],
  ['deco_painting', [-85, -200, 85, 0], K],
  ['deco_hammock', [-170, -200, 170, 0], K],
  ['deco_globe', [-75, -200, 75, 0], K],
  ['deco_trophy', [-100, -240, 100, 0], K],
  ['deco_curtain', [-150, -380, 150, 0], K],
  ['deco_flag', [-65, -230, 65, 0], K],
  ['shop_hamster_happy', [-74, -176, 74, 14], K],
  ['shop_hamster_give', [-74, -176, 74, 14], K],
  ['shop_hamster_think', [-74, -176, 74, 14], K],
  ['shop_hamster_bow', [-74, -176, 74, 14], K],
  ['shop_counter', [0, 0, 750, 260], 1],
  ['shop_dealboard', [-150, -100, 150, 100], K],
  ['shop_gift', [-80, -160, 80, 0], K],
  ['shop_shelf_jars', [0, 0, 620, 220], 1],
  ['cat_gear', [-48, -48, 48, 48], K],
  ['cat_hat', [-48, -48, 48, 48], K],
  ['cat_neck', [-48, -48, 48, 48], K],
  ['cat_deco', [-48, -48, 48, 48], K],
  ['cat_frame', [-48, -48, 48, 48], K],
  ['gear_bag_lv2', [-62, -64, 62, 64], K],
  ['gear_bag_lv3', [-62, -64, 62, 64], K],
  ['gear_bag_lv4', [-62, -64, 62, 64], K],
  ['gear_bag_lv5', [-62, -64, 62, 64], K],
  ['gear_shoe_lv2', [-62, -64, 62, 64], K],
  ['gear_shoe_lv3', [-62, -64, 62, 64], K],
  ['gear_shoe_lv4', [-62, -64, 62, 64], K],
  ['gear_shoe_lv5', [-62, -64, 62, 64], K],
  ['gear_fin_lv2', [-62, -64, 62, 64], K],
  ['gear_fin_lv3', [-62, -64, 62, 64], K],
  ['gear_fin_lv4', [-62, -64, 62, 64], K],
  ['gear_fin_lv5', [-62, -64, 62, 64], K],
] as const) D[name] = { b: [...b], s, svg: null, lazy: true };

// Background tile
def('river', [0, 0, 1080, TILE_H], () => A.riverTile(TILE_H));

/** Non-lazy art that has to be in before the first screen (the loading screen waits for it). */
const CORE = /^(frog_stand|frog_happy|coin|hand|hat_|neck_)/;
/** The art one day of play needs; the rest is only for the other screens. */
const PLAY = /^(frog_|box\d|satchel|lily|log$|river$|hand$|coin$|bill$|letter$|splash$|willow$|truck_|hat_|neck_|gear_)/;

export const SPRITE_NAMES = Object.keys(D);
/** The definitions, for tools that render the placeholders (art reference sheets). */
export const SPRITE_DEFS: Readonly<Record<string, SpriteDef>> = D;

/**
 * Holds the game's art. Painted images listed in `art/manifest.json` are used where they exist
 * (every entry is a WebP named after its sprite; scripts/optimize_art.py makes them);
 * everything else is rasterized from the SVG placeholders once, at the current render scale.
 * A painting covers its sprite's bounds box exactly, so it lines up with the same anchor.
 */
export class SpriteBank {
  private map = new Map<string, Sprite>();
  /** How many sprites are painted art rather than placeholders. */
  painted = 0;

  constructor(private platform: Platform) {}

  private px = 1;
  private base = 'art/';
  private files = new Map<string, string>();
  private loading = new Map<string, Promise<void>>();
  private isPainted = new Set<string>();

  /** Sprites the loading screen leaves for later (see `load`): drawing one that hasn't arrived just skips it. */
  private deferred = new Set<string>();
  /** Deferred sprites whose load has finished, one way or another (some have no art at all). */
  private settled = new Set<string>();
  private backgroundRun: Promise<void> | null = null;

  /**
   * Loads what the first screen needs, then fetches the rest of the non-lazy art in the background:
   * the day's gameplay art first, the other screens' art after it. `whenReady` says when a screen's art is in.
   */
  async load(pxPerUnit: number, onProgress?: (done: number, total: number) => void, artBase = 'art/') {
    const all = SPRITE_NAMES.filter((n) => !D[n].lazy);
    const names = all.filter((n) => CORE.test(n));
    for (const n of all) if (!CORE.test(n)) this.deferred.add(n);
    const painted = await this.paintedList(artBase);
    this.px = pxPerUnit;
    this.base = artBase;
    this.files = painted;
    let done = 0;
    // Rasterize in small batches so phones don't choke on SVG filters.
    const batch = 10;
    for (let i = 0; i < names.length; i += batch) {
      await Promise.all(
        names.slice(i, i + batch).map(async (name) => {
          const d = D[name];
          const file = painted.get(name);
          const png = file ? await this.png(d, artBase + file) : null;
          if (png) {
            this.painted++;
            this.isPainted.add(name);
          }
          const s = png ?? (d.svg ? await this.raster(d, pxPerUnit) : null);
          if (s) this.map.set(name, s);
          onProgress?.(++done, names.length);
        }),
      );
    }
    for (const name of names) {
      const alias = D[name].alias;
      if (!this.map.has(name) && alias && this.map.has(alias)) this.map.set(name, this.get(alias));
    }
  }

  /** Resolves once every sprite requested so far has finished loading. */
  async idle() {
    while (this.loading.size && [...this.loading.keys()].some((n) => !this.settled.has(n))) {
      await Promise.all([...this.loading.values()]);
    }
  }

  /** Starts fetching the deferred art, gameplay first. Call once the first screen is up. */
  startBackground() {
    if (this.backgroundRun) return;
    const order = [...this.deferred].sort((a, b) => Number(PLAY.test(b)) - Number(PLAY.test(a)));
    this.backgroundRun = (async () => {
      for (let i = 0; i < order.length; i += 4) await this.ensure(order.slice(i, i + 4));
    })();
  }

  /** Resolves when the art for a day's play (or, without `playOnly`, for every screen) has arrived. */
  whenReady(playOnly: boolean): Promise<void> {
    this.startBackground();
    const need = [...this.deferred].filter((n) => !playOnly || PLAY.test(n));
    return this.ensure(need);
  }

  /** How many of the deferred sprites are still on their way (0 once everything is in). */
  get waiting() {
    let n = 0;
    for (const name of this.deferred) if (!this.settled.has(name) && !this.map.has(name)) n++;
    return n;
  }

  /**
   * Loads sprites left out at startup (residents, houses). Safe to call again; drawing one that
   * isn't ready yet just skips it for that frame.
   */
  ensure(names: string[]): Promise<void> {
    return Promise.all(names.filter((n) => n in D).map((n) => this.loadOne(n))).then(() => undefined);
  }

  /** Everything not loaded yet, a few at a time in the background. */
  async preloadRest() {
    const rest = SPRITE_NAMES.filter((n) => D[n].lazy && !this.map.has(n));
    for (let i = 0; i < rest.length; i += 4) {
      await this.ensure(rest.slice(i, i + 4));
      await new Promise((r) => setTimeout(r, 16));
    }
  }

  private loadOne(name: string): Promise<void> {
    if (this.map.has(name)) return Promise.resolve();
    let p = this.loading.get(name);
    if (!p) {
      p = (async () => {
        const d = D[name];
        if (d.prefer) await this.loadOne(d.prefer);
        const file = this.files.get(name);
        const png = file ? await this.png(d, this.base + file) : null;
        if (png) {
          this.painted++;
          this.isPainted.add(name);
          this.map.set(name, png);
        } else if (d.prefer && this.isPainted.has(d.prefer)) this.map.set(name, this.get(d.prefer));
        else if (d.svg) this.map.set(name, await this.raster(d, this.px));
        else if (d.alias) {
          await this.loadOne(d.alias);
          if (this.map.has(d.alias)) this.map.set(name, this.get(d.alias));
        }
      })();
      p = p.finally(() => this.settled.add(name));
      this.loading.set(name, p);
    }
    return p;
  }

  /** Whether this sprite is painted art (its own, not borrowed). */
  isArt(name: string) {
    return this.isPainted.has(name);
  }

  /** Painted art listed in the manifest: sprite name -> file name. */
  private async paintedList(base: string): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    try {
      const raw = await this.platform.loadBinary(base + 'manifest.json');
      const list: unknown = JSON.parse(new TextDecoder().decode(raw));
      for (const n of Array.isArray(list) ? list : []) {
        if (typeof n !== 'string') continue;
        const name = n.replace(/\.(png|jpg|jpeg|webp)$/i, '');
        if (name in D) out.set(name, name + '.webp');
      }
    } catch {
      // no painted art yet
    }
    return out;
  }

  private async png(d: SpriteDef, url: string): Promise<Sprite | null> {
    const [x0, y0, x1, y1] = d.b;
    try {
      const img = await this.platform.loadImage(url);
      return { img, w: (x1 - x0) * d.s, h: (y1 - y0) * d.s, ax: -x0 * d.s, ay: -y0 * d.s };
    } catch (e) {
      console.warn(e);
      return null;
    }
  }

  private async raster(d: SpriteDef, pxPerUnit: number): Promise<Sprite> {
    const [x0, y0, x1, y1] = d.b;
    // Big background art is capped so it stays light on memory.
    const k = d.s * Math.min(pxPerUnit, (x1 - x0) * d.s > 600 ? 1.6 : 2.5);
    const wpx = Math.ceil((x1 - x0) * k);
    const hpx = Math.ceil((y1 - y0) * k);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${wpx}" height="${hpx}" viewBox="${x0} ${y0} ${x1 - x0} ${y1 - y0}">${defs()}${d.svg?.() ?? ''}</svg>`;
    const c = this.platform.createCanvas(wpx, hpx);
    try {
      const img = await this.platform.loadImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
      c.getContext('2d')!.drawImage(img, 0, 0, wpx, hpx);
    } catch (e) {
      console.warn(e);
    }
    return { img: c, w: (x1 - x0) * d.s, h: (y1 - y0) * d.s, ax: -x0 * d.s, ay: -y0 * d.s };
  }

  /** Whether there's art for this sprite (painted-only sprites may be missing). */
  has(name: string) {
    return this.map.has(name);
  }

  get(name: string): Sprite {
    const s = this.map.get(name);
    if (!s) throw new Error('missing sprite ' + name);
    return s;
  }

  /** Bounds of a sprite in concept units relative to its anchor. */
  bounds(name: string): SpriteDef['b'] {
    return D[name].b;
  }

  /** Draws a sprite with its anchor at (x, y), optionally scaled, rotated and faded. */
  draw(ctx: Ctx, name: string, x: number, y: number, sx = 1, sy = sx, rot = 0, alpha = 1) {
    const s = this.map.get(name);
    if (!s) {
      if (D[name]?.lazy || this.deferred.has(name)) void this.loadOne(name);
      else throw new Error('missing sprite ' + name);
      return;
    }
    if (alpha <= 0) return;
    if (rot === 0 && alpha === 1) {
      ctx.drawImage(s.img, x - s.ax * sx, y - s.ay * sy, s.w * sx, s.h * sy);
      return;
    }
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate(x, y);
    if (rot) ctx.rotate(rot);
    ctx.drawImage(s.img, -s.ax * sx, -s.ay * sy, s.w * sx, s.h * sy);
    ctx.restore();
  }
}
