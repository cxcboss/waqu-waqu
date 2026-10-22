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
paintedOnly('hub_bg', [0, 0, 1080, 1620]);
paintedOnly('home_room', [0, 0, 1080, 1620]);
paintedOnly('shop_room', [0, 0, 1080, 1620]);

// Background tile
def('river', [0, 0, 1080, TILE_H], () => A.riverTile(TILE_H));

export const SPRITE_NAMES = Object.keys(D);
/** The definitions, for tools that render the placeholders (art reference sheets). */
export const SPRITE_DEFS: Readonly<Record<string, SpriteDef>> = D;

/**
 * Holds the game's art. Painted images listed in `art/manifest.json` are used where they exist
 * (a bare name is a PNG; backgrounds may be listed with their extension, e.g. "river.jpg");
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

  async load(pxPerUnit: number, onProgress?: (done: number, total: number) => void, artBase = 'art/') {
    const names = SPRITE_NAMES.filter((n) => !D[n].lazy);
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
      if (!this.map.has(name) && alias) this.map.set(name, this.get(alias));
    }
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
        if (name in D) out.set(name, name === n ? n + '.png' : n);
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

  /** Draws a sprite with its anchor at (x, y), optionally scaled, rotated and faded. */
  draw(ctx: Ctx, name: string, x: number, y: number, sx = 1, sy = sx, rot = 0, alpha = 1) {
    const s = this.map.get(name);
    if (!s) {
      if (D[name]?.lazy) void this.loadOne(name);
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
