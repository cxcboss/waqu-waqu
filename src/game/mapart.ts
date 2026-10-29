// The route map's scenery, drawn in code: the river winds up the screen through the chapters' seasons
// (spring willows, the summer lotus pond, the rainy gorge, autumn maples, the frozen river, the new-year
// harbour, early spring again). The map is long, so it's baked in tiles of TILE units as they scroll in.
// Map units: x across the 750-wide screen, u up the river from day 1's stop (u = 0).
import { alpha, blobEllipse, boxPath, contactShadow, drawBakedScreen, grainRect, inked, jit, jit01, mix, polyPath, puffPath, TOD, tuft } from '../art/kit';
import { INK, P } from '../art/palette';
import { bush, flowerClump, lilyPad, pine, reeds, rock, roundTree, willow } from '../art/village';
import type { Ctx } from '../platform/types';
import { DAYS_PER_CHAPTER } from './config';

/** Distance up the river between neighbouring stops. */
export const GAP = 250;
/** Height of one baked tile. */
const TILE = 500;
/** Width of the river. */
const RIVER_W = 190;
/** How far below day 1 and above the last day the river runs on. */
export const RIVER_PAD = 330;

interface Season {
  ground: string;
  /** Patches and the shady side of things. */
  deep: string;
  water: string;
  waterDeep: string;
  bank: string;
}

/** One season per chapter (the seventh is the early-spring bonus run). */
const SEASONS: Season[] = [
  { ground: '#CFE0A0', deep: '#B7CC88', water: '#8FC9BE', waterDeep: '#5FA9A3', bank: '#E4DDB6' },
  { ground: '#BCD98E', deep: '#A2C274', water: '#86C4AE', waterDeep: '#57A08E', bank: '#DCD8AE' },
  { ground: '#A9C495', deep: '#90AE7F', water: '#7FB1B6', waterDeep: '#4F8A96', bank: '#C8C3AE' },
  { ground: '#E5CF95', deep: '#D2B474', water: '#8CBDB3', waterDeep: '#5E9B94', bank: '#E8D9B0' },
  { ground: '#EEF2F0', deep: '#D6E1E6', water: '#A7D1DA', waterDeep: '#79AFC0', bank: '#E2E9EA' },
  { ground: '#EAD9AC', deep: '#D9C08A', water: '#79BAC6', waterDeep: '#4C93A6', bank: '#F1E4BE' },
  { ground: '#D6E7AA', deep: '#BDD48D', water: '#93CDC1', waterDeep: '#64ABA2', bank: '#E6DFBA' },
];
export const SEASON_COUNT = SEASONS.length;

const CH_LEN = DAYS_PER_CHAPTER * GAP;
/** The chapter whose stretch of river u is in (its edges are halfway between two stops). */
const chapterAt = (u: number) => Math.max(0, Math.min(SEASONS.length - 1, Math.floor((u + GAP / 2) / CH_LEN)));

/** A season colour at u, blended over 300 units where two chapters meet. */
function colorAt(u: number, key: keyof Season) {
  const c = chapterAt(u);
  const edgeUp = (c + 1) * CH_LEN - GAP / 2;
  const edgeDown = c * CH_LEN - GAP / 2;
  if (c + 1 < SEASONS.length && u > edgeUp - 150) return mix(SEASONS[c][key], SEASONS[c + 1][key], (u - (edgeUp - 150)) / 600);
  if (c > 0 && u < edgeDown + 150) return mix(SEASONS[c - 1][key], SEASONS[c][key], 0.5 + (u - edgeDown) / 300);
  return SEASONS[c][key];
}

/** The river's centre line, from the stops' positions: x across for any u. */
export class RiverLine {
  /** Points along the line, u going up. */
  readonly pts: { x: number; u: number }[] = [];

  constructor(xs: readonly number[]) {
    // the same curve the river always had: through the midpoints, bending at each stop
    const ctl = [{ x: 300, u: -RIVER_PAD }, ...xs.map((x, i) => ({ x, u: i * GAP })), { x: 375, u: (xs.length - 1) * GAP + RIVER_PAD }];
    let p = ctl[0];
    this.pts.push(p);
    for (let i = 1; i < ctl.length - 1; i++) {
      const c = ctl[i], n = ctl[i + 1];
      const m = i < ctl.length - 2 ? { x: (c.x + n.x) / 2, u: (c.u + n.u) / 2 } : n;
      for (let k = 1; k <= 16; k++) {
        const t = k / 16;
        this.pts.push({ x: (1 - t) * (1 - t) * p.x + 2 * (1 - t) * t * c.x + t * t * m.x, u: (1 - t) * (1 - t) * p.u + 2 * (1 - t) * t * c.u + t * t * m.u });
      }
      p = m;
    }
  }

  get top() {
    return this.pts[this.pts.length - 1].u;
  }

  xAt(u: number) {
    const a = this.pts;
    if (u <= a[0].u) return a[0].x;
    let lo = 0, hi = a.length - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (a[m].u <= u) lo = m;
      else hi = m;
    }
    const p = a[lo], q = a[hi];
    return p.x + ((q.x - p.x) * (u - p.u)) / Math.max(1e-6, q.u - p.u);
  }

  /** Builds the centre line between u0 and u1 as a path, with u mapped to y by `y`. */
  path(ctx: Ctx, u0: number, u1: number, y: (u: number) => number) {
    ctx.beginPath();
    let first = true;
    for (const p of this.pts) {
      if (p.u < u0 - 40 || p.u > u1 + 40) continue;
      if (first) ctx.moveTo(p.x, y(p.u));
      else ctx.lineTo(p.x, y(p.u));
      first = false;
    }
  }
}

/**
 * Draws the map's scenery for the screen: the tiles between u = uBot and u = uTop, each baked once,
 * with u = 0 (day 1) at screen y `y0`.
 */
export function drawMapScenery(ctx: Ctx, line: RiverLine, stops: readonly { x: number }[], y0: number, uBot: number, uTop: number) {
  const k0 = Math.floor(uBot / TILE), k1 = Math.floor(uTop / TILE);
  for (let k = k0; k <= k1; k++) {
    drawBakedScreen(ctx, `maptile:${k}`, `${line.pts.length}`, 0, y0 - (k + 1) * TILE, [0, -1, 750, TILE + 1], (c) => paintTile(c, k, line, stops));
  }
}

/** One tile: u from k·TILE (its bottom edge) to (k+1)·TILE (its top), drawn with y = (k+1)·TILE − u. */
function paintTile(ctx: Ctx, k: number, line: RiverLine, stops: readonly { x: number }[]) {
  ctx_ = ctx;
  const uTop = (k + 1) * TILE, uBot = k * TILE;
  const y = (u: number) => uTop - u;
  // the ground, blending from one season to the next
  const grad = (key: keyof Season) => {
    const g = ctx.createLinearGradient(0, 0, 0, TILE);
    for (let i = 0; i <= 10; i++) g.addColorStop(i / 10, colorAt(uTop - (TILE * i) / 10, key));
    return g;
  };
  ctx.fillStyle = grad('ground');
  ctx.fillRect(0, -1, 750, TILE + 2);
  // patches of deeper ground, snow drifts, sand ripples
  ctx.save();
  ctx.fillStyle = grad('deep');
  ctx.globalAlpha = 0.6;
  for (let u = Math.floor((uBot - 120) / 90) * 90; u < uTop + 120; u += 90) {
    const n = Math.round(u / 90);
    for (let j = 0; j < 2; j++) {
      const x = jit01(n, j) * 750;
      ctx.beginPath();
      ctx.ellipse(x, y(u + jit(n, j + 5) * 30), 50 + jit01(n, j + 9) * 40, 14 + jit01(n, j + 11) * 8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();

  // the river: bank, water, a darker middle
  const river = () => line.path(ctx, uBot - 200, uTop + 200, y);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  river();
  ctx.strokeStyle = grad('bank');
  ctx.lineWidth = RIVER_W + 26;
  ctx.stroke();
  ctx.strokeStyle = alpha(INK, 0.5);
  ctx.lineWidth = RIVER_W + 4;
  ctx.stroke();
  ctx.strokeStyle = grad('water');
  ctx.lineWidth = RIVER_W;
  ctx.stroke();
  ctx.strokeStyle = grad('waterDeep');
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = RIVER_W * 0.55;
  ctx.stroke();
  ctx.restore();

  // things on the banks and on the water, back to front
  const things: [number, () => void][] = [];
  for (let u = Math.floor((uBot - 200) / 70) * 70; u < uTop + 260; u += 70) placeAt(u, line, stops, (x, uu, draw) => things.push([y(uu), () => draw(x, y(uu))]));
  things.sort((a, b) => a[0] - b[0]);
  for (const [, draw] of things) draw();
  // rain over the gorge
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, -1, 750, TILE + 2);
  ctx.clip();
  for (let u = uBot; u < uTop; u += 40) {
    if (chapterAt(u) !== 2) continue;
    const n = Math.round(u / 40);
    ctx.strokeStyle = alpha(P.white, 0.55);
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let j = 0; j < 6; j++) {
      const x = jit01(n, j + 70) * 750, yy = y(u) + jit(n, j + 80) * 20;
      ctx.moveTo(x, yy);
      ctx.lineTo(x - 8, yy + 22);
    }
    ctx.stroke();
  }
  ctx.restore();
  grainRect(ctx, 0, -1, 750, TILE + 2, 0.35);
}

type Put = (x: number, u: number, draw: (x: number, y: number) => void) => void;

/**
 * What stands at height u: a few things on the banks (never on a stop's lily pad or its sign) and now
 * and then something on the water. Everything comes from u alone, so neighbouring tiles agree.
 */
function placeAt(u: number, line: RiverLine, stops: readonly { x: number }[], put: Put) {
  if (u < -RIVER_PAD - 100 || u > line.top + 100) return;
  const c = chapterAt(u);
  const n = Math.round(u / 70) + 1000;
  const rx = line.xAt(u);
  // the nearest stop: keep its pad and its sign clear
  const si = Math.round(u / GAP);
  const stop = si >= 0 && si < stops.length ? { x: stops[si].x, u: si * GAP } : null;
  const clear = (x: number, uu: number, r: number) => !stop || Math.abs(x - stop.x) > 130 + r || uu > stop.u + 100 + r * 0.5 || uu < stop.u - 140 - r * 0.5;
  // two or three spots on the banks
  for (let j = 0; j < 3; j++) {
    const side = jit(n, j * 3) < 0 ? -1 : 1;
    const room = side < 0 ? rx - RIVER_W / 2 - 40 : 750 - (rx + RIVER_W / 2 + 40);
    if (room < 50) continue;
    const x = side < 0 ? 20 + jit01(n, j * 3 + 1) * (room - 20) : rx + RIVER_W / 2 + 40 + jit01(n, j * 3 + 1) * (room - 20);
    const uu = u + jit(n, j * 3 + 2) * 30;
    const pick = jit01(n, j * 3 + 20);
    const big = pick < 0.34;
    if (!clear(x, uu, big ? 60 : 20)) continue;
    put(x, uu, (px, py) => bankThing(c, pick, px, py, n * 7 + j));
  }
  // on the water, every few rows
  if (jit01(n, 40) < 0.3) {
    const off = jit(n, 41) * (RIVER_W / 2 - 30);
    const x = rx + off, uu = u + jit(n, 42) * 20;
    if (clear(x, uu, 30)) put(x, uu, (px, py) => waterThing(c, jit01(n, 43), px, py, n));
  }
}

const day = TOD.day;
const MAPLE = [P.orange, P.red, P.gold, '#D9733F'];

/** Something on a bank in chapter c: `pick` (0–1) chooses what, the big things first. */
function bankThing(c: number, pick: number, x: number, y: number, seed: number) {
  const s = 0.62 + jit01(seed, 1) * 0.18;
  switch (c) {
    case 0:
      if (pick < 0.2) willow(ctx_, x, y, s, day, seed);
      else if (pick < 0.34) roundTree(ctx_, x, y, s * 0.9, day, seed, undefined, '#9CC77A');
      else if (pick < 0.6) flowerClump(ctx_, x, y, day, seed);
      else if (pick < 0.75) bush(ctx_, x, y, s, day, seed, [P.pink, P.white, P.gold][seed % 3]);
      else tufts(x, y, seed, '#7FB069');
      break;
    case 1:
      if (pick < 0.34) roundTree(ctx_, x, y, s, day, seed, seed % 3 ? undefined : P.red);
      else if (pick < 0.55) reeds(ctx_, x, y, 0.9, day, seed);
      else if (pick < 0.75) bush(ctx_, x, y, s, day, seed, seed % 2 ? P.pink : undefined);
      else flowerClump(ctx_, x, y, day, seed, P.pink);
      break;
    case 2:
      if (pick < 0.2) pine(ctx_, x, y, s, day, seed);
      else if (pick < 0.34) cliff(x, y, s, seed);
      else if (pick < 0.6) rock(ctx_, x, y, s * 1.4, day, seed);
      else if (pick < 0.8) puddle(x, y, seed);
      else tufts(x, y, seed, '#6E9C62');
      break;
    case 3:
      if (pick < 0.34) roundTree(ctx_, x, y, s, day, seed, undefined, MAPLE[seed % 4]);
      else if (pick < 0.48) pumpkin(x, y, seed);
      else if (pick < 0.6) mushroom(x, y, seed);
      else if (pick < 0.7) haystack(x, y, s);
      else fallenLeaves(x, y, seed);
      break;
    case 4:
      if (pick < 0.3) pine(ctx_, x, y, s, day, seed, true);
      else if (pick < 0.38) snowman(x, y, s);
      else if (pick < 0.55) snowyRock(x, y, s, seed);
      else footprints(x, y, seed);
      break;
    case 5:
      if (pick < 0.04) lighthouse(x, y, s);
      else if (pick < 0.16) stall(x, y, s, seed);
      else if (pick < 0.34) netRack(x, y, s, seed);
      else if (pick < 0.48) crates(x, y, seed);
      else if (pick < 0.6) lanternPost(x, y);
      else if (pick < 0.72) gullPost(x, y, seed);
      else shells(x, y, seed);
      break;
    default:
      if (pick < 0.34) roundTree(ctx_, x, y, s, day, seed, undefined, seed % 2 ? '#F2B9C4' : '#F6CFD4');
      else if (pick < 0.55) sprouts(x, y, seed);
      else if (pick < 0.75) bush(ctx_, x, y, s, day, seed, P.white);
      else flowerClump(ctx_, x, y, day, seed);
  }
}

/** Something on the water in chapter c. */
function waterThing(c: number, pick: number, x: number, y: number, seed: number) {
  switch (c) {
    case 1:
      lilyPad(ctx_, x, y, 22 + pick * 10, day, seed, pick < 0.5);
      break;
    case 2:
      rapids(x, y, seed);
      break;
    case 4:
      iceFloe(x, y, seed);
      break;
    case 5:
      if (pick < 0.5) boat(x, y, seed);
      else lilyPad(ctx_, x, y, 20, day, seed);
      break;
    default:
      if (pick < 0.6) lilyPad(ctx_, x, y, 18 + pick * 12, day, seed, c === 6 && pick < 0.3);
      else ripple(x, y);
  }
}

/** The tile being baked: the pieces below draw into it. */
let ctx_: Ctx;

function tufts(x: number, y: number, seed: number, color: string) {
  for (let i = 0; i < 3; i++) tuft(ctx_, x + jit(seed, i) * 22, y + jit(seed, i + 3) * 8, 0, 0.8, color);
}

function cliff(x: number, y: number, s: number, seed: number) {
  const g = '#B4AE9E';
  inked(ctx_, () => polyPath(ctx_, [[x - 60 * s, y], [x - 44 * s, y - 70 * s], [x - 10 * s, y - 96 * s], [x + 30 * s, y - 80 * s], [x + 56 * s, y - 30 * s], [x + 62 * s, y]], seed, 1.4, 6), g, { band: 12, hatch: [x - 60 * s, y - 96 * s, 122 * s, 96 * s] });
  ctx_.strokeStyle = alpha(INK, 0.4);
  ctx_.lineWidth = 1.8;
  ctx_.beginPath();
  ctx_.moveTo(x - 20 * s, y - 80 * s);
  ctx_.lineTo(x - 6 * s, y - 40 * s);
  ctx_.lineTo(x + 18 * s, y - 30 * s);
  ctx_.stroke();
  inked(ctx_, () => puffPath(ctx_, x - 8 * s, y - 92 * s, 30 * s, 10 * s, 5, seed, 0.5), '#86AE73', { band: 3, lw: 1.8 });
}

function puddle(x: number, y: number, seed: number) {
  inked(ctx_, () => blobEllipse(ctx_, x, y, 30, 10, seed, 0.15, 8), alpha('#9EC3C6', 0.85), { shade: false, lw: 1.6 });
  ctx_.strokeStyle = alpha(P.white, 0.8);
  ctx_.lineWidth = 1.6;
  ctx_.beginPath();
  ctx_.ellipse(x - 6, y - 1, 10, 3, 0, Math.PI * 1.1, Math.PI * 1.8);
  ctx_.stroke();
}

function pumpkin(x: number, y: number, seed: number) {
  contactShadow(ctx_, x, y, 20, 5, 0.22);
  for (const dx of [-9, 9, 0]) inked(ctx_, () => blobEllipse(ctx_, x + dx, y - 14, 12, 14, seed + dx, 0.05), P.orange, { band: 4, lw: 1.8 });
  inked(ctx_, () => boxPath(ctx_, x - 2, y - 34, 5, 8, 2, seed, 0.2), P.lilyDeep, { shade: false, lw: 1.6 });
}

function mushroom(x: number, y: number, seed: number) {
  for (const [dx, k] of [[0, 1], [16, 0.7]] as const) {
    inked(ctx_, () => boxPath(ctx_, x + dx - 4 * k, y - 16 * k, 8 * k, 16 * k, 3, seed, 0.2), P.cream, { band: 2, lw: 1.6 });
    inked(ctx_, () => {
      ctx_.beginPath();
      ctx_.ellipse(x + dx, y - 16 * k, 14 * k, 11 * k, 0, Math.PI, 0);
      ctx_.closePath();
    }, P.red, { band: 3, lw: 1.8 });
    for (const [ox, oy] of [[-5, -21], [4, -24], [7, -18]] as const) {
      ctx_.beginPath();
      ctx_.arc(x + dx + ox * k, y + oy * k, 2 * k, 0, Math.PI * 2);
      ctx_.fillStyle = P.white;
      ctx_.fill();
    }
  }
}

function haystack(x: number, y: number, s: number) {
  contactShadow(ctx_, x, y, 40 * s, 8 * s, 0.22);
  inked(ctx_, () => {
    ctx_.beginPath();
    ctx_.moveTo(x - 40 * s, y);
    ctx_.quadraticCurveTo(x - 40 * s, y - 70 * s, x, y - 74 * s);
    ctx_.quadraticCurveTo(x + 40 * s, y - 70 * s, x + 40 * s, y);
    ctx_.closePath();
  }, P.mustard, { band: 9, hatch: [x - 40 * s, y - 74 * s, 80 * s, 74 * s] });
  ctx_.strokeStyle = alpha(INK, 0.4);
  ctx_.lineWidth = 1.6;
  ctx_.beginPath();
  for (let i = -2; i <= 2; i++) {
    ctx_.moveTo(x + i * 12 * s, y - 4);
    ctx_.lineTo(x + i * 8 * s, y - 50 * s);
  }
  ctx_.stroke();
}

function fallenLeaves(x: number, y: number, seed: number) {
  for (let i = 0; i < 5; i++) {
    const lx = x + jit(seed, i) * 30, ly = y + jit(seed, i + 9) * 10;
    ctx_.save();
    ctx_.translate(lx, ly);
    ctx_.rotate(jit(seed, i + 20) * 2);
    inked(ctx_, () => {
      ctx_.beginPath();
      ctx_.ellipse(0, 0, 7, 4, 0, 0, Math.PI * 2);
    }, MAPLE[(seed + i) % 4], { shade: false, lw: 1.2 });
    ctx_.restore();
  }
}

function snowman(x: number, y: number, s: number) {
  contactShadow(ctx_, x, y, 30 * s, 7 * s, 0.2);
  inked(ctx_, () => blobEllipse(ctx_, x, y - 26 * s, 30 * s, 26 * s, 3, 0.04), '#FBFCFA', { band: 7, dark: 0.12 });
  inked(ctx_, () => blobEllipse(ctx_, x, y - 68 * s, 21 * s, 19 * s, 4, 0.04), '#FBFCFA', { band: 5, dark: 0.12 });
  ctx_.fillStyle = INK;
  for (const dx of [-7, 7]) {
    ctx_.beginPath();
    ctx_.arc(x + dx * s, y - 72 * s, 2.6 * s, 0, Math.PI * 2);
    ctx_.fill();
  }
  inked(ctx_, () => polyPath(ctx_, [[x, y - 67 * s], [x + 16 * s, y - 63 * s], [x, y - 61 * s]], 5, 0.1, 1), P.orange, { shade: false, lw: 1.4 });
  inked(ctx_, () => boxPath(ctx_, x - 24 * s, y - 52 * s, 48 * s, 8 * s, 3, 6, 0.2), P.red, { shade: false, lw: 1.6 });
  inked(ctx_, () => boxPath(ctx_, x - 15 * s, y - 104 * s, 30 * s, 18 * s, 3, 7, 0.2), P.blue, { shade: false, lw: 1.6 });
}

function snowyRock(x: number, y: number, s: number, seed: number) {
  rock(ctx_, x, y, s * 1.2, day, seed);
  inked(ctx_, () => puffPath(ctx_, x, y - 24 * s, 24 * s, 7 * s, 5, seed, 0.6), '#FBFCFA', { shade: false, lw: 1.6 });
}

function footprints(x: number, y: number, seed: number) {
  ctx_.fillStyle = alpha('#9DB3C2', 0.6);
  for (let i = 0; i < 4; i++) {
    ctx_.beginPath();
    ctx_.ellipse(x + i * 16 + (i % 2) * 4, y - i * 8 + (i % 2) * 6 + jit(seed, i) * 2, 5, 3, 0.3, 0, Math.PI * 2);
    ctx_.fill();
  }
}

function lighthouse(x: number, y: number, s: number) {
  contactShadow(ctx_, x, y, 34 * s, 8 * s, 0.22);
  const body = () => polyPath(ctx_, [[x - 26 * s, y], [x - 18 * s, y - 120 * s], [x + 18 * s, y - 120 * s], [x + 26 * s, y]], 9, 0.6, 3);
  inked(ctx_, body, P.white, { band: 8 });
  ctx_.save();
  body();
  ctx_.clip();
  ctx_.fillStyle = P.red;
  for (const by of [-30, -80]) ctx_.fillRect(x - 40 * s, y + by * s, 80 * s, 22 * s);
  ctx_.restore();
  inked(ctx_, body, 'rgba(0,0,0,0)', { shade: false });
  inked(ctx_, () => boxPath(ctx_, x - 16 * s, y - 146 * s, 32 * s, 26 * s, 3, 10, 0.3), '#FFE7A0', { band: 4, lw: 2.2 });
  inked(ctx_, () => polyPath(ctx_, [[x - 22 * s, y - 144 * s], [x, y - 166 * s], [x + 22 * s, y - 144 * s]], 11, 0.3, 2), P.red, { band: 3, lw: 2.2 });
}

function stall(x: number, y: number, s: number, seed: number) {
  contactShadow(ctx_, x, y, 50 * s, 8 * s, 0.22);
  inked(ctx_, () => boxPath(ctx_, x - 44 * s, y - 42 * s, 88 * s, 42 * s, 3, seed, 0.4), P.wood, { band: 6 });
  for (const sx of [-1, 1]) inked(ctx_, () => boxPath(ctx_, x + sx * 40 * s - 3, y - 92 * s, 6, 52 * s, 2, seed + sx, 0.2), P.woodDeep, { shade: false, lw: 1.6 });
  inked(ctx_, () => polyPath(ctx_, [[x - 56 * s, y - 84 * s], [x, y - 108 * s], [x + 56 * s, y - 84 * s]], seed, 0.4, 3), P.red, { band: 5, lw: 2.2 });
  // red lanterns for the new year
  for (const lx of [-26, 26]) {
    ctx_.strokeStyle = INK;
    ctx_.lineWidth = 1.4;
    ctx_.beginPath();
    ctx_.moveTo(x + lx * s, y - 88 * s);
    ctx_.lineTo(x + lx * s, y - 80 * s);
    ctx_.stroke();
    inked(ctx_, () => blobEllipse(ctx_, x + lx * s, y - 70 * s, 9 * s, 11 * s, seed + lx, 0.02), P.red, { band: 3, lw: 1.6 });
    ctx_.fillStyle = P.gold;
    ctx_.fillRect(x + lx * s - 1.5, y - 59 * s, 3, 6 * s);
  }
  for (let i = 0; i < 3; i++) inked(ctx_, () => blobEllipse(ctx_, x - 22 * s + i * 22 * s, y - 48 * s, 9 * s, 7 * s, seed + i, 0.1), [P.orange, P.gold, P.pink][i], { band: 2, lw: 1.4 });
}

/** Fishing nets hung to dry between two poles. */
function netRack(x: number, y: number, s: number, seed: number) {
  contactShadow(ctx_, x, y, 44 * s, 6 * s, 0.18);
  for (const dx of [-36, 36]) inked(ctx_, () => boxPath(ctx_, x + dx * s - 3, y - 70 * s, 6, 72 * s, 2, seed + dx, 0.2), P.woodDeep, { shade: false, lw: 1.6 });
  const net = () => {
    ctx_.beginPath();
    ctx_.moveTo(x - 36 * s, y - 64 * s);
    ctx_.quadraticCurveTo(x, y - 54 * s, x + 36 * s, y - 64 * s);
    ctx_.lineTo(x + 30 * s, y - 24 * s);
    ctx_.quadraticCurveTo(x, y - 12 * s, x - 30 * s, y - 24 * s);
    ctx_.closePath();
  };
  net();
  ctx_.fillStyle = alpha(P.cream, 0.5);
  ctx_.fill();
  ctx_.save();
  net();
  ctx_.clip();
  ctx_.strokeStyle = alpha(INK, 0.45);
  ctx_.lineWidth = 1.2;
  ctx_.beginPath();
  for (let i = -6; i <= 6; i++) {
    ctx_.moveTo(x + i * 9 * s - 30 * s, y - 70 * s);
    ctx_.lineTo(x + i * 9 * s + 30 * s, y - 10 * s);
    ctx_.moveTo(x + i * 9 * s + 30 * s, y - 70 * s);
    ctx_.lineTo(x + i * 9 * s - 30 * s, y - 10 * s);
  }
  ctx_.stroke();
  ctx_.restore();
  net();
  ctx_.strokeStyle = INK;
  ctx_.lineWidth = 1.8;
  ctx_.stroke();
  for (let i = 0; i < 3; i++) {
    ctx_.beginPath();
    ctx_.arc(x + (i - 1) * 20 * s, y - 22 * s + (i % 2) * 4, 4, 0, Math.PI * 2);
    ctx_.fillStyle = P.orange;
    ctx_.fill();
    ctx_.stroke();
  }
}

/** A mooring post with a gull standing on it. */
function gullPost(x: number, y: number, seed: number) {
  contactShadow(ctx_, x, y, 14, 4, 0.2);
  inked(ctx_, () => boxPath(ctx_, x - 7, y - 34, 14, 36, 4, seed, 0.3), P.wood, { band: 3, lw: 1.8 });
  const d = seed % 2 ? 1 : -1;
  inked(ctx_, () => {
    ctx_.beginPath();
    ctx_.ellipse(x, y - 46, 13, 9, 0, 0, Math.PI * 2);
  }, P.white, { band: 3, lw: 1.8 });
  inked(ctx_, () => {
    ctx_.beginPath();
    ctx_.arc(x + d * 9, y - 58, 7, 0, Math.PI * 2);
  }, P.white, { band: 2, lw: 1.8 });
  inked(ctx_, () => polyPath(ctx_, [[x + d * 15, y - 59], [x + d * 25, y - 57], [x + d * 15, y - 55]], seed, 0.1, 1), P.gold, { shade: false, lw: 1.2 });
  inked(ctx_, () => polyPath(ctx_, [[x - d * 10, y - 48], [x - d * 2, y - 52], [x + d * 6, y - 44], [x - d * 4, y - 42]], seed + 1, 0.2, 2), P.silver, { shade: false, lw: 1.4 });
  ctx_.beginPath();
  ctx_.arc(x + d * 11, y - 60, 1.6, 0, Math.PI * 2);
  ctx_.fillStyle = INK;
  ctx_.fill();
}

function crates(x: number, y: number, seed: number) {
  contactShadow(ctx_, x, y, 34, 6, 0.2);
  inked(ctx_, () => boxPath(ctx_, x - 30, y - 30, 32, 30, 3, seed, 0.4), P.woodLight, { band: 4, lw: 2 });
  inked(ctx_, () => boxPath(ctx_, x + 2, y - 22, 26, 22, 3, seed + 1, 0.4), P.kraft, { band: 4, lw: 2 });
  ctx_.strokeStyle = alpha(INK, 0.5);
  ctx_.lineWidth = 1.4;
  ctx_.beginPath();
  ctx_.moveTo(x - 30, y - 15);
  ctx_.lineTo(x + 2, y - 15);
  ctx_.moveTo(x + 15, y - 22);
  ctx_.lineTo(x + 15, y);
  ctx_.stroke();
}

function lanternPost(x: number, y: number) {
  contactShadow(ctx_, x, y, 14, 4, 0.2);
  inked(ctx_, () => boxPath(ctx_, x - 3, y - 70, 6, 72, 2, 3, 0.2), P.woodDeep, { shade: false, lw: 1.6 });
  ctx_.strokeStyle = INK;
  ctx_.lineWidth = 1.6;
  ctx_.beginPath();
  ctx_.moveTo(x, y - 68);
  ctx_.lineTo(x + 18, y - 68);
  ctx_.lineTo(x + 18, y - 62);
  ctx_.stroke();
  inked(ctx_, () => blobEllipse(ctx_, x + 18, y - 52, 9, 11, 4, 0.02), P.red, { band: 3, lw: 1.6 });
}

function shells(x: number, y: number, seed: number) {
  for (let i = 0; i < 3; i++) {
    const sx = x + jit(seed, i) * 20, sy = y + jit(seed, i + 4) * 6;
    inked(ctx_, () => {
      ctx_.beginPath();
      ctx_.moveTo(sx - 6, sy);
      ctx_.arc(sx, sy, 6, Math.PI, 0);
      ctx_.closePath();
    }, [P.pink, P.cream, P.white][i], { shade: false, lw: 1.2 });
  }
}

function sprouts(x: number, y: number, seed: number) {
  for (let i = 0; i < 3; i++) {
    const sx = x + (i - 1) * 14 + jit(seed, i) * 3;
    ctx_.strokeStyle = P.lilyDeep;
    ctx_.lineWidth = 2;
    ctx_.beginPath();
    ctx_.moveTo(sx, y);
    ctx_.lineTo(sx, y - 12);
    ctx_.stroke();
    for (const d of [-1, 1]) {
      inked(ctx_, () => {
        ctx_.beginPath();
        ctx_.ellipse(sx + d * 5, y - 14, 6, 3.4, d * 0.5, 0, Math.PI * 2);
      }, P.lilyLight, { shade: false, lw: 1.2 });
    }
  }
}

function rapids(x: number, y: number, seed: number) {
  rock(ctx_, x, y, 0.9, day, seed);
  ctx_.strokeStyle = alpha(P.white, 0.9);
  ctx_.lineWidth = 2.6;
  ctx_.lineCap = 'round';
  ctx_.beginPath();
  for (let i = 0; i < 3; i++) {
    const w = 22 + i * 8;
    ctx_.moveTo(x - w, y + 6 + i * 7);
    ctx_.quadraticCurveTo(x, y + i * 7, x + w, y + 6 + i * 7);
  }
  ctx_.stroke();
}

function iceFloe(x: number, y: number, seed: number) {
  inked(ctx_, () => polyPath(ctx_, [[x - 30, y], [x - 18, y - 14], [x + 14, y - 16], [x + 32, y - 4], [x + 20, y + 10], [x - 16, y + 10]], seed, 1, 5), '#F2F8FA', { band: 6, dark: 0.12, lw: 2 });
}

function boat(x: number, y: number, seed: number) {
  inked(ctx_, () => {
    ctx_.beginPath();
    ctx_.moveTo(x - 30, y - 8);
    ctx_.lineTo(x + 32, y - 8);
    ctx_.quadraticCurveTo(x + 24, y + 6, x + 14, y + 6);
    ctx_.lineTo(x - 22, y + 6);
    ctx_.closePath();
  }, seed % 2 ? P.blue : P.wood, { band: 4, lw: 2 });
  ctx_.strokeStyle = INK;
  ctx_.lineWidth = 2;
  ctx_.beginPath();
  ctx_.moveTo(x, y - 8);
  ctx_.lineTo(x, y - 48);
  ctx_.stroke();
  inked(ctx_, () => polyPath(ctx_, [[x + 2, y - 46], [x + 26, y - 14], [x + 2, y - 14]], seed, 0.3, 2), P.white, { band: 3, lw: 1.8 });
}

function ripple(x: number, y: number) {
  ctx_.strokeStyle = alpha(P.white, 0.7);
  ctx_.lineWidth = 2;
  ctx_.beginPath();
  ctx_.ellipse(x, y, 16, 5, 0, 0, Math.PI * 2);
  ctx_.moveTo(x + 28, y);
  ctx_.ellipse(x, y, 28, 9, 0, 0, Math.PI * 2);
  ctx_.stroke();
}
