import type { Ctx, ImageSource, Platform } from '../platform/types';
import { P } from './palette';
import { HOUSE_DEFS, POSES, RESIDENT_DEFS, RES_FRAME } from '../game/cast';
import { critter, critterAvatar } from './critters';
import { placeholderHouse } from './houses';
import * as A from './shapes';
import * as H from './shapes-home';
import { defs } from './svg';
import { pxPerUnit, useCanvas } from './kit/canvas';

/** Width of the design canvas, and design units per concept unit (1080-wide concept art). */
export const DESIGN_W = 750;
export const K = DESIGN_W / 1080;
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

// HQ (the room and the counter are code art: room.ts)
def('owl', [-150, -320, 150, 6], A.owl);
def('owl_wing', [-10, -190, 210, 20], A.owlWing);

// Outside work: the shopkeeper, hats and gear (shapes-home.ts). The buildings, rooms and furniture are
// code art (village.ts, room.ts, furniture.ts, registered in hub.ts and codeart.ts).
def('shop_hamster', [-74, -176, 74, 14], H.hamster);
for (const [k, b] of [
  ['straw', [-84, -60, 84, 22]], ['flower', [-6, -50, 46, 20]], ['beanie', [-54, -88, 54, 14]], ['beret', [-58, -56, 66, 12]],
  ['top', [-58, -106, 58, 18]], ['pilot', [-60, -64, 60, 38]], ['swim', [-50, -62, 50, 14]], ['gold', [-44, -52, 50, 14]],
] as const) def(`hat_${k}`, [...b], () => H.hat(k));
for (const [k, b] of [['scarf', [-68, -14, 68, 70]], ['bow', [-40, -24, 40, 24]], ['camera', [-44, -12, 44, 68]]] as const) def(`neck_${k}`, [...b], () => H.neck(k));
for (const k of ['bag', 'shoe', 'fin']) def(`gear_${k}`, [-62, -64, 62, 64], () => H.gearIcon(k));
// Scene art (round 5), painted only: HQ owl poses, the shop's hamster poses, gear levels. Loaded when a scene asks.
for (const [name, b, s] of [
  ['owl_read', [-150, -320, 150, 6], K],
  ['owl_stamp', [-150, -320, 150, 6], K],
  ['owl_cheer', [-150, -320, 150, 6], K],
  ['owl_sleepy', [-150, -320, 150, 6], K],
  ['shop_hamster_happy', [-74, -176, 74, 14], K],
  ['shop_hamster_give', [-74, -176, 74, 14], K],
  ['shop_hamster_think', [-74, -176, 74, 14], K],
  ['shop_hamster_bow', [-74, -176, 74, 14], K],
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

// ---------------------------------------------------------------- code-drawn art

interface CodeDef {
  /** Bounds in design units around the anchor: [x0, y0, x1, y1]. */
  b: [number, number, number, number];
  draw: (ctx: Ctx, variant: string) => void;
  /** Extra sharpness for sprites usually drawn scaled up. */
  res: number;
}
const C: Record<string, CodeDef> = {};
const banks: SpriteBank[] = [];
/** The code art behind `name` or `name:variant`. */
const codeDef = (name: string): CodeDef | undefined => {
  const i = name.indexOf(':');
  return C[i < 0 ? name : name.slice(0, i)];
};

/**
 * Static art drawn in code (the 河湾手账 kit) rather than painted. `draw` paints it once into an offscreen
 * canvas at the screen's sharpness, with the anchor at (0, 0) and design units as units; it's painted again
 * only when the resolution changes. Ask for a variant with `name:variant` (for example `hub_hq:night`):
 * each variant is baked on its own and `draw` gets the part after the colon ('' without one).
 * After that it's an ordinary sprite: `sp.draw`, `sp.has`, `iconAt` work the same as for painted art, and a
 * code sprite takes over from a painted or placeholder sprite of the same name. Pure Canvas 2D, no SVG.
 * `bounds()` reports it in concept units like any other sprite (the design-unit bounds divided by K).
 */
export function codeSprite(name: string, b: [number, number, number, number], draw: (ctx: Ctx, variant: string) => void, o: { res?: number } = {}) {
  C[name] = { b, draw, res: o.res ?? 1 };
  for (const bank of banks) bank.dropCode(name);
}

/** Non-lazy art that has to be in before the first screen (the loading screen waits for it; the mini game keeps it in its main package). */
export const CORE = /^(frog_stand|frog_happy|coin|hand|hat_|neck_)/;
/** The art one day of play needs; the rest is only for the other screens. */
const PLAY = /^(frog_|box\d|satchel|lily|log$|river$|hand$|coin$|bill$|letter$|splash$|truck_|hat_|neck_|gear_)/;

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

  /** Baked code sprites by full name (with variant), and the sharpness each was baked at. */
  private code = new Map<string, { s: Sprite; px: number }>();

  constructor(private platform: Platform) {
    // the kit bakes icons, medals and frames into offscreen canvases at the main canvas' sharpness
    useCanvas((w, h) => platform.createCanvas(w, h), () => platform.canvas.width / DESIGN_W);
    banks.push(this);
  }

  /** Registers code-drawn art (see the `codeSprite` function). */
  codeSprite(name: string, b: [number, number, number, number], draw: (ctx: Ctx, variant: string) => void, o: { res?: number } = {}) {
    codeSprite(name, b, draw, o);
  }

  /** Forgets the bakes of a code sprite (all its variants), so it's drawn afresh next time. */
  dropCode(name: string) {
    for (const k of [...this.code.keys()]) if (k === name || k.startsWith(name + ':')) this.code.delete(k);
  }

  /** The baked code sprite for `name` (or `name:variant`), baking it now if needed; undefined if there's no such code art. */
  private codeArt(name: string): Sprite | undefined {
    const d = codeDef(name);
    if (!d) return undefined;
    const i = name.indexOf(':');
    const [x0, y0, x1, y1] = d.b;
    // big layers are capped like the placeholders, so they stay light on memory
    const px = Math.min(pxPerUnit(), x1 - x0 > 600 ? 1.6 : 2.5) * d.res;
    const e = this.code.get(name);
    if (e && e.px === px) return e.s;
    const c = this.platform.createCanvas((x1 - x0) * px, (y1 - y0) * px);
    const g = c.getContext('2d')!;
    g.setTransform(c.width / (x1 - x0), 0, 0, c.height / (y1 - y0), -x0 * (c.width / (x1 - x0)), -y0 * (c.height / (y1 - y0)));
    d.draw(g, i < 0 ? '' : name.slice(i + 1));
    const s: Sprite = { img: c, w: x1 - x0, h: y1 - y0, ax: -x0, ay: -y0 };
    this.code.set(name, { s, px });
    return s;
  }

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
      const list = await this.platform.loadJson(base + 'manifest.json');
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

  /** Whether there's art for this sprite (painted-only sprites may be missing; code sprites are always there). */
  has(name: string) {
    return this.map.has(name) || codeDef(name) !== undefined;
  }

  get(name: string): Sprite {
    const s = this.codeArt(name) ?? this.map.get(name);
    if (!s) throw new Error('missing sprite ' + name);
    return s;
  }

  /** Bounds of a sprite in concept units relative to its anchor (a code sprite's design-unit bounds are converted). */
  bounds(name: string): SpriteDef['b'] {
    const c = codeDef(name)?.b;
    return c ? [c[0] / K, c[1] / K, c[2] / K, c[3] / K] : D[name].b;
  }

  /** Draws a sprite with its anchor at (x, y), optionally scaled, rotated and faded. */
  draw(ctx: Ctx, name: string, x: number, y: number, sx = 1, sy = sx, rot = 0, alpha = 1) {
    const s = this.codeArt(name) ?? this.map.get(name);
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
