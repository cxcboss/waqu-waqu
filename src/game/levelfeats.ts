// The chapters' mechanics, as the river builder lays them out (see `feats` in config.ts): some lily pads
// turn into something else (bud pads, stones, maple leaves, ice floes, thin ice), new things go in
// (turtles, a dam, piers, a ferry, a crane's hook, whirlpools, stretches of rapids), and some parcels
// get a twist (fragile, chilled or hot, to be sent back, chased up, or coming with the restock).
// The play scene does the rest (play.ts); everything here only decides where things are.
import { clamp, lerp, shuffle } from '../engine/math';
import { RESIDENT } from './cast';
import { TUNING, type DayConfig } from './config';
import type { House, Order, Plat, PlatKind } from './level';

type MakePlat = (kind: PlatKind, x: number, y: number, rx: number, ry: number, extra?: Partial<Plat>) => Plat;

/** Seconds a chilled or hot parcel keeps once it's off the truck. */
export const KEEP_T = 42;
/** A fragile parcel takes this many hard landings before it breaks (the first is a warning). */
export const FRAGILE_HITS = 2;
/** Whirlpools pull in anything within this distance of their middle. */
export const WHIRL_R = 150;
/** The dam's gates: offsets from its middle, and half the gap each leaves (art/river.ts draws the dam to match). */
export const DAM_GATES = [-118, 112];
export const GATE_HALF = 40;

export interface FeatLayout {
  rapids: { y0: number; y1: number }[];
  whirls: { x: number; y: number; r: number; w: number }[];
  /** Where the gap filler mustn't put a lily: lanes things move along, whirlpools. */
  blocked(x: number, y: number, rx: number): boolean;
}

interface Build {
  cfg: DayConfig;
  plats: Plat[];
  houses: House[];
  H: number;
  r: () => number;
  /** World y of the first and last houses (the route runs from firstY up to lastY, which is negative). */
  firstY: number;
  lastY: number;
  plat: MakePlat;
}

/** n of `list`, spread evenly along it. */
function spread<T>(list: T[], n: number): T[] {
  if (n >= list.length) return [...list];
  return Array.from({ length: n }, (_, i) => list[Math.floor(((i + 0.5) * list.length) / n)]);
}

export function placeFeats(b: Build): FeatLayout {
  const { cfg, plats, houses, r, plat } = b;
  const f = cfg.feats;
  const { riverL, riverR } = TUNING;
  const mid = (riverL + riverR) / 2;
  const out: FeatLayout = { rapids: [], whirls: [], blocked: () => false };
  const lanes: { y: number; h: number }[] = [];
  /** Heights already taken by something across the river. */
  const used: number[] = [];
  const holes: { x: number; y: number; r: number }[] = [];
  out.blocked = (x, y, rx) => lanes.some((l) => Math.abs(y - l.y) < l.h + rx * 0.6) || holes.some((h) => Math.hypot(x - h.x, y - h.y) < h.r + rx);
  // where things start: a little way up the river, so the first moments of a day are calm
  const top = b.lastY - 120, bottom = Math.min(b.firstY, b.H * 0.1);
  const nearHouse = (y: number, d: number) => houses.some((h) => Math.abs(h.plat.y - y) < d);
  /** Lily pads of these roles along the route, downstream first, clear of the house rows. */
  const pads = (...roles: Plat['role'][]) =>
    plats.filter((p) => p.kind === 'lily' && roles.includes(p.role) && p.y < bottom && p.y > top && !nearHouse(p.y, 150) && p.bud === undefined).sort((a, b) => b.y - a.y);
  /** Takes out the river's own pads (never a house or anything a mechanic put in) that `keep` says go. */
  const remove = (keep: (p: Plat) => boolean) => {
    for (let i = plats.length - 1; i >= 0; i--) if (plats[i].role && plats[i].role !== 'start' && !keep(plats[i])) plats.splice(i, 1);
  };
  /** Rows of the path forward (the main pads' heights), downstream first. */
  const rows = () => plats.filter((p) => p.role === 'main' && p.y < bottom && p.y > top).map((p) => p.y).sort((a, b) => b - a);
  /**
   * n clear lanes across the river between two rows, spread along the route and away from the houses,
   * the dams and piers and each other; with `room` they're kept clear of pads the gap filler would add.
   */
  const lanesAt = (n: number, room = 0) => {
    const ys = rows();
    const gaps: number[] = [];
    for (let i = 0; i + 1 < ys.length; i++) {
      const y = (ys[i] + ys[i + 1]) / 2;
      if (ys[i] - ys[i + 1] > 150 && !nearHouse(y, 230) && !used.some((u) => Math.abs(u - y) < 260)) gaps.push(y);
    }
    const at = spread(gaps, n);
    for (const y of at) {
      used.push(y);
      if (room) lanes.push({ y, h: room });
    }
    return at;
  };
  const turn = (p: Plat, kind: PlatKind, rx: number, ry: number, extra: Partial<Plat> = {}) => {
    p.kind = kind;
    p.rx = rx;
    p.ry = ry;
    p.x = clamp(p.x, riverL + rx + 6, riverR - rx - 6);
    Object.assign(p, extra);
  };

  // ---- whole rows of the river: the dam, piers, whirlpools, the lanes the movers take
  if (f.dam) {
    // across the river halfway between two houses, with two gates that open in turn
    const at = spread(houses.slice(1, -1), f.dam);
    for (const h of at) {
      const next = houses[h.id + 1];
      const y = (h.plat.y + next.plat.y) / 2;
      remove((p) => Math.abs(p.y - y) > 110 + p.ry);
      used.push(y);
      const w = (riverR - riverL) / 2;
      plats.push(plat('dam', mid, y, w - 2, 22, { dam: { gates: DAM_GATES.map((x, i) => ({ x, w: GATE_HALF, ph: i * 0.5 })) } }));
    }
  }
  if (f.pier) {
    // out from either bank by turns, long enough to rest on
    const ys = rows().filter((y) => !nearHouse(y, 200));
    spread(ys, f.pier).forEach((y, i) => {
      const left = i % 2 === 0;
      const x = left ? riverL + 120 : riverR - 120;
      remove((p) => Math.abs(p.y - y) > 40 + p.ry || Math.abs(p.x - x) > 120 + p.rx + 30);
      used.push(y);
      plats.push(plat('pier', x, y, 120, 24, { variant: left ? 0 : 1 }));
    });
  }
  if (f.whirl) {
    // on one side of the river, so the other side stays a way round; three pads go round it
    for (const y of lanesAt(f.whirl)) {
      const x = r() < 0.5 ? riverL + 165 : riverR - 165;
      remove((p) => Math.hypot(p.x - x, p.y - y) > WHIRL_R + p.rx * 0.5);
      const w = (r() < 0.5 ? -1 : 1) * (0.5 + r() * 0.15);
      out.whirls.push({ x, y, r: WHIRL_R, w });
      holes.push({ x, y, r: WHIRL_R - 20 });
      const a0 = r() * Math.PI * 2;
      for (let i = 0; i < 3; i++) {
        const a = a0 + (i * Math.PI * 2) / 3;
        plats.push(plat('lily', x + Math.cos(a) * 100, y + Math.sin(a) * 100 * 0.62, 44, 44 * 0.6, { variant: (i + 1) % 4, orbit: { cx: x, cy: y, r: 100, a, w }, amp: 110 }));
      }
    }
  }
  const movers = (n: number, room: number, make: (y: number, i: number) => Plat) => {
    lanesAt(n, room).forEach((y, i) => {
      remove((p) => Math.abs(p.y - y) > room + p.ry);
      plats.push(make(y, i));
    });
  };
  if (f.turtle) movers(f.turtle, 44, (y, i) => plat('turtle', lerp(riverL + 120, riverR - 120, r()), y, 64, 40, { drift: (i % 2 ? -1 : 1) * (38 + r() * 10), amp: 600, variant: i }));
  if (f.ferry) movers(f.ferry, 44, (y, i) => plat('ferry', riverL + 100, y, 80, 36, { ferry: { x0: riverL + 104, x1: riverR - 104, ph: r() + i * 0.37 }, amp: 600 }));
  if (f.hook) movers(f.hook, 34, (y) => plat('hook', mid, y, 38, 28, { hook: { cx: mid, amp: 190, w: (Math.PI * 2) / 5.6, ph: r() * Math.PI * 2 }, amp: 600 }));

  // ---- pads that turn into something else
  if (f.bud) for (const p of spread(pads('main'), f.bud)) p.bud = 0;
  if (f.slip) for (const p of spread(pads('main', 'side'), f.slip)) turn(p, 'stone', clamp(p.rx * 0.9, 44, 56), clamp(p.rx * 0.9, 44, 56) * 0.64, { variant: Math.floor(r() * 3) });
  if (f.leaf) for (const p of spread(pads('main', 'side'), f.leaf)) turn(p, 'leaf', 62, 38, { rot: (r() - 0.5) * 0.9, variant: Math.floor(r() * 3) });
  if (f.floe) for (const p of spread(pads('main', 'side'), f.floe)) turn(p, 'floe', 74, 46, { ang: r() * Math.PI * 2, spin: (r() < 0.5 ? -1 : 1) * (0.22 + r() * 0.14), amp: 28, variant: Math.floor(r() * 3) });
  if (f.thin) for (const p of spread(pads('main', 'side'), f.thin)) turn(p, 'thin', 56, 35, { hp: 2, variant: Math.floor(r() * 3) });

  if (f.rapids) {
    // stretches of fast water: everything in them rocks from side to side
    const span = 700;
    const at = spread(rows().filter((y) => y < b.firstY - 600), f.rapids * 3).filter((_, i) => i % 3 === 1);
    for (const yc of at) {
      const y0 = yc - span / 2, y1 = yc + span / 2;
      out.rapids.push({ y0, y1 });
      for (const p of plats) {
        if (p.kind !== 'lily' && p.kind !== 'stone' && p.kind !== 'leaf') continue;
        if (p.y < y0 || p.y > y1 || p.orbit) continue;
        const amp = 40;
        const x0 = clamp(p.x, riverL + p.rx + amp + 6, riverR - p.rx - amp - 6);
        p.sway = { x0, amp, w: 1.5 + r() * 0.7, ph: r() * Math.PI * 2 };
        p.x = x0;
        p.amp = amp;
      }
    }
  }
  if (f.night || f.storm) for (const p of plats) if (p.role === 'main' || p.role === 'start' || p.role === 'porch' || (p.role === 'side' && r() < 0.35)) p.lit = true;

  // ---- the day's lost letter, on a pad off to the side a little past halfway
  if (cfg.day >= 1 && cfg.day <= 30) {
    const want = lerp(b.firstY, b.lastY, 0.55);
    const near = plats.filter((p) => p.kind === 'lily' && (p.role === 'side' || p.role === 'porch') && p.bud === undefined && !p.sway && !p.orbit).sort((a, b) => Math.abs(a.y - want) - Math.abs(b.y - want))[0];
    if (near) near.letter = cfg.day;
  }

  // ---- who lives where
  if (f.quiet) {
    // the bear sleeps in a house past the middle of the route
    const h = houses[Math.max(2, Math.floor(houses.length * 0.55))];
    const other = houses.find((o) => o.species === 'bear' && o !== h);
    if (other) {
      other.species = h.species;
      other.name = h.name;
    }
    h.species = 'bear';
    h.name = RESIDENT.bear.name;
    h.quiet = true;
  }
  if (f.goose) for (const h of spread(houses.slice(2).filter((h) => !h.quiet), f.goose)) h.goose = { ph: r() * 7 };
  return out;
}

/** Which house each order goes to: as dealt, but on 双十一 a few houses take three each. */
export function orderHouses(cfg: DayConfig, houses: House[], base: number[]): number[] {
  const n = cfg.feats.bulk;
  if (!n) return base;
  const big = new Set(spread(houses.slice(2, -1), n).map((h) => h.id));
  return base.flatMap((id) => (big.has(id) ? [id, id, id] : [id]));
}

/** The parcels' twists: fragile, chilled and hot ones, ones to send back or chased up, and the restock. */
export function featOrders(o: { cfg: DayConfig; orders: Order[]; houses: House[]; r: () => number }) {
  const { cfg, orders, houses, r } = o;
  const f = cfg.feats;
  const plain = () => shuffle(orders.filter((x) => x.house.id >= 1 && !x.urgent && !x.cod && x.fragile === undefined && !x.keep && !x.ret && !x.nag), r);
  const take = (n: number | undefined, from: Order[]) => from.slice(0, n ?? 0);
  // the hard ones go to a house further along when there's a choice
  for (const x of take(f.fragile, plain())) x.fragile = 0;
  for (const x of take(f.cold, plain())) x.keep = { kind: 'cold', left: KEEP_T, max: KEEP_T };
  for (const x of take(f.warm, plain())) x.keep = { kind: 'warm', left: KEEP_T, max: KEEP_T };
  for (const x of take(f.return, plain().filter((x) => x.house.id >= 2))) x.ret = true;
  for (const x of take(f.nag, plain())) x.nag = { at: 0, late: false };
  if (f.bulk) {
    const count = new Map<House, number>();
    for (const x of orders) count.set(x.house, (count.get(x.house) ?? 0) + 1);
    const half = Math.ceil(houses.length / 2);
    for (const x of orders) {
      if ((count.get(x.house) ?? 0) > 1) x.group = true;
      if (x.house.id >= half) x.later = true;
    }
  }
}
