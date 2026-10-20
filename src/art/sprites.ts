import type { Ctx, ImageSource, Platform } from '../platform/types';
import { P } from './palette';
import * as A from './shapes';
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
  svg: () => string;
}

const D: Record<string, SpriteDef> = {};
const def = (name: string, b: SpriteDef['b'], svg: () => string, s = K) => (D[name] = { b, s, svg });

// River
const lilyOpts = [
  { notch: 290, flower: 1 },
  { notch: 220 },
  { notch: 320, color: '#89B871' },
  { notch: 250, flower: 0.9 },
];
lilyOpts.forEach((o, i) => def(`lily${i}`, [-140, -80, 140, 100], () => A.lilyPad(0, 0, 100, o)));
def('log', [-130, -62, 130, 48], A.log);
def('house_teapot', [-170, -222, 182, 106], A.teapotHouse);
def('house_boot', [-150, -306, 150, 96], A.bootHouse);
def('house_can', [-160, -236, 160, 96], A.canHouse);
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
def('satchel0', [-30, -12, 36, 40], () => A.satchel(0));
def('satchel1', [-36, -12, 42, 48], () => A.satchel(1));
def('satchel2', [-42, -12, 48, 58], () => A.satchel(2));

// Residents (origin at feet)
def('duck', [-50, -86, 56, 14], () => A.duck({ cup: true }));
def('rabbit', [-36, -128, 36, 14], A.rabbit);
def('hedgehog', [-46, -72, 42, 14], A.hedgehog);
def('avatar_duck', [-38, -38, 38, 38], () => A.avatar('duck'));
def('avatar_rabbit', [-38, -38, 38, 38], () => A.avatar('rabbit'));
def('avatar_hedgehog', [-38, -38, 38, 38], () => A.avatar('hedgehog'));

// Parcels (origin at bottom center of the front face)
for (const size of [0, 1, 2] as const) {
  def(`box${size}`, [-44, -80, 44, 6], () => A.box(size, 'label'));
  def(`box${size}u`, [-44, -80, 44, 6], () => A.box(size, 'urgent'));
}

// UI bits
def('coin', [-30, -30, 30, 30], () => A.coin(26));
def('hand', [-44, -6, 64, 120], A.hand);

// HQ
const HQ_ROOM_H = 1296;
export const HQ_ROOM = { h: HQ_ROOM_H * K, contentH: 800 * K };
def('hq_room', [0, 0, 1080, HQ_ROOM_H], () => A.hqRoom(HQ_ROOM_H));
def('hq_counter', [-20, -56, 1100, 236], A.hqCounter);
def('owl', [-150, -320, 150, 6], A.owl);
def('owl_wing', [-10, -190, 210, 20], A.owlWing);

// Background tile
def('river', [0, 0, 1080, TILE_H], () => A.riverTile(TILE_H));

export const SPRITE_NAMES = Object.keys(D);

/**
 * Holds the game's art. Painted PNGs listed in `art/manifest.json` are used where they exist;
 * everything else is rasterized from the SVG placeholders once, at the current render scale.
 * A PNG covers its sprite's bounds box exactly, so it lines up with the same anchor.
 */
export class SpriteBank {
  private map = new Map<string, Sprite>();

  constructor(private platform: Platform) {}

  async load(pxPerUnit: number, onProgress?: (done: number, total: number) => void, artBase = 'art/') {
    const names = SPRITE_NAMES;
    const painted = await this.paintedList(artBase);
    let done = 0;
    // Rasterize in small batches so phones don't choke on SVG filters.
    const batch = 6;
    for (let i = 0; i < names.length; i += batch) {
      await Promise.all(
        names.slice(i, i + batch).map(async (name) => {
          const png = painted.has(name) ? await this.png(D[name], artBase + name + '.png') : null;
          this.map.set(name, png ?? (await this.raster(D[name], pxPerUnit)));
          onProgress?.(++done, names.length);
        }),
      );
    }
  }

  private async paintedList(base: string): Promise<Set<string>> {
    try {
      const raw = await this.platform.loadBinary(base + 'manifest.json');
      const list: unknown = JSON.parse(new TextDecoder().decode(raw));
      return new Set(Array.isArray(list) ? list.filter((n): n is string => typeof n === 'string' && n in D) : []);
    } catch {
      return new Set(); // no painted art yet
    }
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
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${wpx}" height="${hpx}" viewBox="${x0} ${y0} ${x1 - x0} ${y1 - y0}">${defs()}${d.svg()}</svg>`;
    const c = this.platform.createCanvas(wpx, hpx);
    try {
      const img = await this.platform.loadImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
      c.getContext('2d')!.drawImage(img, 0, 0, wpx, hpx);
    } catch (e) {
      console.warn(e);
    }
    return { img: c, w: (x1 - x0) * d.s, h: (y1 - y0) * d.s, ax: -x0 * d.s, ay: -y0 * d.s };
  }

  get(name: string): Sprite {
    const s = this.map.get(name);
    if (!s) throw new Error('missing sprite ' + name);
    return s;
  }

  /** Draws a sprite with its anchor at (x, y), optionally scaled, rotated and faded. */
  draw(ctx: Ctx, name: string, x: number, y: number, sx = 1, sy = sx, rot = 0, alpha = 1) {
    const s = this.get(name);
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
