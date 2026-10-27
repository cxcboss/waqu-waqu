// The chapters' river things, drawn in code in the 河湾手账 style (see kit/): the lotus bud on a bud pad,
// turtles, rain-slick stones, maple leaves, ice floes and thin ice, the beaver's dam, harbour piers, the
// ferry and the crane's hook, plus the live bits (the dam's gates, cracks in the ice, whirlpools, gulls,
// the goose) and the briefing icons. Origin at the middle of what the frog stands on, design units,
// light from the upper left. Static parts are code sprites (baked once); moving parts are drawn each frame.
import { DAM_GATES, GATE_HALF } from '../game/levelfeats';
import type { Ctx } from '../platform/types';
import { P } from './palette';
import { alpha, blobEllipse, contactShadow, inked, inkStyle, jit, jit01, polyPath, shade, tint, type Pt } from './kit';
import { codeSprite, type SpriteBank } from './sprites';
import { roundRect, text } from './ui';

const WATER = '#5FA9A3';
const FOAM = 'rgba(251,247,238,0.85)';

/** A pale ring of disturbed water round something floating, open at the back. */
function waterRing(c: Ctx, rx: number, ry: number, y = 0) {
  c.save();
  c.strokeStyle = FOAM;
  c.lineWidth = 2.5;
  c.lineCap = 'round';
  c.globalAlpha = 0.8;
  c.beginPath();
  c.ellipse(0, y, rx, ry, 0, Math.PI * 0.08, Math.PI * 0.92);
  c.stroke();
  c.globalAlpha = 0.45;
  c.beginPath();
  c.ellipse(0, y + 4, rx * 1.12, ry * 1.15, 0, Math.PI * 0.25, Math.PI * 0.75);
  c.stroke();
  c.restore();
}

/** A soft shadow on the water under something floating or hanging. */
function waterShadow(c: Ctx, x: number, y: number, rx: number, ry: number, a = 0.22) {
  c.save();
  c.fillStyle = shade(WATER, 0.45);
  c.globalAlpha = a;
  c.beginPath();
  c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

// ---------------------------------------------------------------- the lotus bud

/** The pink bud on a bud pad (`open` for the flower it turns into as it sinks). Anchor: where the stem meets the pad. */
function lotusBud(c: Ctx, open: boolean) {
  c.save();
  inkStyle(c, 4, P.lilyDeep);
  c.beginPath();
  c.moveTo(0, 2);
  c.quadraticCurveTo(-4, -12, 1, -24);
  c.stroke();
  inkStyle(c, 2, P.lilyLight);
  c.stroke();
  if (!open) {
    // two sepals cupping the bud
    for (const d of [-1, 1]) inked(c, () => { c.beginPath(); c.moveTo(1, -22); c.quadraticCurveTo(d * 14, -26, d * 12, -38); c.quadraticCurveTo(d * 4, -30, 1, -22); c.closePath(); }, P.lily, { lw: 1.8, band: 3 });
    const bud = () => {
      c.beginPath();
      c.moveTo(1, -24);
      c.bezierCurveTo(18, -30, 14, -52, 2, -64);
      c.bezierCurveTo(-12, -52, -16, -30, 1, -24);
      c.closePath();
    };
    inked(c, bud, P.pink, { lw: 2.4, band: 6, light: 0.6 });
    c.save();
    bud();
    c.clip();
    c.fillStyle = '#E07F79';
    c.globalAlpha = 0.75;
    c.beginPath();
    c.ellipse(2, -62, 9, 12, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();
    inkStyle(c, 1.5, shade(P.pink, 0.35));
    c.beginPath();
    c.moveTo(1, -26);
    c.quadraticCurveTo(-4, -44, 2, -60);
    c.moveTo(4, -27);
    c.quadraticCurveTo(10, -44, 3, -60);
    c.stroke();
  } else {
    // in flower: two rings of petals round a gold middle
    const petal = (a: number, l: number, w: number, fill: string) =>
      inked(c, () => {
        c.save();
        c.translate(1, -30);
        c.rotate(a);
        c.beginPath();
        c.moveTo(0, 0);
        c.quadraticCurveTo(w, -l * 0.55, 0, -l);
        c.quadraticCurveTo(-w, -l * 0.55, 0, 0);
        c.closePath();
        c.restore();
      }, fill, { lw: 1.8, band: 4 });
    for (const a of [-1.9, -1.1, 1.1, 1.9]) petal(a, 30, 13, tint(P.pink, 0.2));
    for (const a of [-0.55, 0, 0.55]) petal(a, 34, 13, P.pink);
    inked(c, () => { c.beginPath(); c.ellipse(1, -32, 9, 6, 0, 0, Math.PI * 2); }, P.gold, { lw: 1.8, band: 3 });
  }
  c.restore();
}

// ---------------------------------------------------------------- turtle

/** A turtle seen from above, swimming toward +x; `v` 'a'/'b' are the two strokes of its flippers. */
function turtle(c: Ctx, v: string) {
  const b = v === 'b';
  waterRing(c, 74, 46, 4);
  const skin = '#A9BC6E', skinDeep = '#7E9150';
  const flipper = (x: number, y: number, a: number, l: number) =>
    inked(c, () => { c.beginPath(); c.ellipse(x, y, l, 11, a, 0, Math.PI * 2); }, skin, { lw: 2.2, band: 4 });
  const s = b ? 1 : -1;
  flipper(38, -34, -0.7 + s * 0.35, 24);
  flipper(38, 34, 0.7 - s * 0.35, 24);
  flipper(-44, -28, 0.5 - s * 0.3, 16);
  flipper(-44, 28, -0.5 + s * 0.3, 16);
  inked(c, () => { c.beginPath(); c.moveTo(-58, -6); c.quadraticCurveTo(-82, 0, -58, 6); c.closePath(); }, skin, { lw: 2, band: 3 });
  // the head, a friendly old face looking where it's going
  inked(c, () => blobEllipse(c, 70, 0, 22, 17, 5, 0.04, 8), skin, { lw: 2.6, band: 6 });
  c.fillStyle = P.ink;
  for (const d of [-1, 1]) {
    c.beginPath();
    c.ellipse(80, d * 8, 3.6, 4.2, 0, 0, Math.PI * 2);
    c.fill();
  }
  c.fillStyle = P.white;
  for (const d of [-1, 1]) {
    c.beginPath();
    c.arc(79, d * 8 - 1.5, 1.3, 0, Math.PI * 2);
    c.fill();
  }
  inkStyle(c, 1.6, skinDeep);
  c.beginPath();
  c.moveTo(66, -12);
  c.quadraticCurveTo(62, 0, 66, 12);
  c.stroke();
  // the shell: a rim, then the plates
  const shell = () => blobEllipse(c, 0, 0, 62, 40, 9, 0.025, 12);
  inked(c, shell, '#6F8C4A', { band: 9, dark: 0.25 });
  const top = '#93AE62';
  inked(c, () => blobEllipse(c, -2, -3, 50, 31, 13, 0.03, 10), top, { lw: 2, band: 7 });
  const plate = (x: number, y: number, rx: number, ry: number, seed: number) => {
    const pts: Pt[] = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      pts.push([x + Math.cos(a) * rx * (1 + jit(seed, i) * 0.06), y + Math.sin(a) * ry * (1 + jit(seed, i + 9) * 0.06)]);
    }
    inked(c, () => polyPath(c, pts, seed, 0.4, 3, 40), tint(top, 0.22), { lw: 1.6, band: 4 });
  };
  plate(-2, -4, 17, 12, 21);
  plate(-28, -6, 12, 13, 22);
  plate(24, -6, 12, 13, 23);
  plate(-14, -24, 12, 7, 24);
  plate(12, -24, 12, 7, 25);
  plate(-14, 16, 12, 7, 26);
  plate(12, 16, 12, 7, 27);
  c.save();
  c.globalAlpha = 0.5;
  c.fillStyle = P.white;
  c.beginPath();
  c.ellipse(-18, -18, 14, 5, -0.3, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

// ---------------------------------------------------------------- stone

/** A river stone, slick with rain: grey, a mossy side, wet highlights. Made for rx 50, ry 32. */
function stone(c: Ctx, v: number) {
  const seed = 31 + v * 7;
  waterRing(c, 58, 34, 8);
  inked(c, () => blobEllipse(c, 0, 8, 52, 30, seed + 1, 0.06, 10), '#8B867A', { band: 8, dark: 0.3 });
  const top = () => blobEllipse(c, -1, 0, 49, 29, seed, 0.07, 10);
  inked(c, top, '#B7B2A5', { band: 9, light: 0.5 });
  c.save();
  top();
  c.clip();
  // moss on the shady side
  c.fillStyle = '#8FAE6A';
  c.globalAlpha = 0.85;
  const mx = v === 1 ? -26 : 24;
  c.beginPath();
  c.ellipse(mx, 14, 26, 14, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#6F9150';
  c.globalAlpha = 0.6;
  for (let i = 0; i < 6; i++) {
    c.beginPath();
    c.arc(mx + jit(seed, i) * 18, 14 + jit(seed, i + 7) * 8, 2.5, 0, Math.PI * 2);
    c.fill();
  }
  // wet streaks of light
  c.globalAlpha = 0.7;
  inkStyle(c, 4, P.white);
  c.beginPath();
  c.moveTo(-30, -12);
  c.quadraticCurveTo(-16, -22, 4, -20);
  c.stroke();
  c.globalAlpha = 0.5;
  c.lineWidth = 2.5;
  c.beginPath();
  c.moveTo(10, -18);
  c.lineTo(18, -16);
  c.stroke();
  c.restore();
}

// ---------------------------------------------------------------- maple leaf

const LEAF_COLORS = ['#D9533F', '#E9824E', '#E8B74A'];

/** A maple leaf's outline, pointing up, about 100 across, before it's squashed flat on the water. */
const MAPLE: Pt[] = (() => {
  // lobe tips (angle from straight up in degrees, length) with notches between; the stem at the bottom
  const lobes: [number, number][] = [[0, 50], [-48, 44], [-100, 40], [48, 44], [100, 40]];
  const pts: Pt[] = [];
  const order = [-100, -48, 0, 48, 100];
  const lobeLen = new Map(lobes.map(([a, l]) => [a, l]));
  pts.push([0, 18]);
  pts.push([-14, 20]);
  for (let i = 0; i < order.length; i++) {
    const a = order[i], l = lobeLen.get(a)!;
    const rad = ((a - 90) * Math.PI) / 180;
    const tip: Pt = [Math.cos(rad) * l, Math.sin(rad) * l];
    // a small tooth either side of the tip
    const side = (d: number): Pt => {
      const r2 = ((a - 90 + d * 14) * Math.PI) / 180;
      return [Math.cos(r2) * l * 0.74, Math.sin(r2) * l * 0.74];
    };
    pts.push(side(-1), tip, side(1));
    if (i < order.length - 1) {
      const m = ((((a + order[i + 1]) / 2) - 90) * Math.PI) / 180;
      pts.push([Math.cos(m) * 20, Math.sin(m) * 20]);
    }
  }
  pts.push([14, 20]);
  return pts;
})();

function mapleLeaf(c: Ctx, v: number) {
  const col = LEAF_COLORS[v % 3];
  waterRing(c, 62, 34, 6);
  c.save();
  c.scale(1.28, 0.78);
  const outline = () => polyPath(c, MAPLE, 40 + v, 0.6, 3, 14);
  waterShadow(c, 4, 10, 54, 34, 0.2);
  inked(c, outline, col, { band: 8, lw: 2.6 });
  // veins from the stem to each tip, and the stem itself
  inkStyle(c, 1.8, shade(col, 0.32));
  c.beginPath();
  for (const a of [-100, -48, 0, 48, 100]) {
    const rad = ((a - 90) * Math.PI) / 180;
    const l = a === 0 ? 46 : Math.abs(a) === 48 ? 40 : 34;
    c.moveTo(0, 14);
    c.lineTo(Math.cos(rad) * l, Math.sin(rad) * l + 8);
  }
  c.stroke();
  inkStyle(c, 3.2, shade(col, 0.4));
  c.beginPath();
  c.moveTo(0, 16);
  c.quadraticCurveTo(2, 30, 10, 38);
  c.stroke();
  c.restore();
}

// ---------------------------------------------------------------- ice

/** An ice floe's outline round an ellipse, a little ragged. */
function floePts(rx: number, ry: number, seed: number, n = 11): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + jit(seed, i) * 0.12;
    const k = 1 + jit(seed, i + 30) * 0.1;
    pts.push([Math.cos(a) * rx * k, Math.sin(a) * ry * k]);
  }
  return pts;
}

/**
 * A floe of white ice with a pale blue edge, seen from straight above: the play scene turns it in the
 * plane of the water and squashes it to the river's slant (about 0.62), so it keeps its shape as it
 * spins. Two layers, each drawn turned: the side (`side`, drawn 9 lower so it shows under the top
 * whichever way it faces, with the shadow on the water) and the top.
 */
function floe(c: Ctx, v: number, side: boolean) {
  const seed = 60 + v * 11;
  const pts = floePts(76, 72, seed);
  if (side) {
    waterShadow(c, 4, 5, 82, 80, 0.25);
    inked(c, () => polyPath(c, pts, seed, 0.5, 6, 30), '#9CC9DA', { band: 6, lw: 3.2 });
    return;
  }
  const top = () => polyPath(c, pts, seed, 0.5, 6, 30);
  inked(c, top, '#E7F3F7', { band: 10, dark: 0.12, light: 0.7, lw: 3.2 });
  c.save();
  top();
  c.clip();
  // snow drifts and a couple of old cracks
  c.fillStyle = P.white;
  for (let i = 0; i < 3; i++) {
    c.beginPath();
    c.ellipse(jit(seed, i + 50) * 40, jit(seed, i + 60) * 32, 18 + jit01(seed, i) * 12, 13 + jit01(seed, i + 5) * 8, jit(seed, i + 70), 0, Math.PI * 2);
    c.fill();
  }
  inkStyle(c, 2, alpha('#7FA9BC', 0.8));
  c.beginPath();
  c.moveTo(-40, -10);
  c.lineTo(-22, 3);
  c.lineTo(-10, -6);
  c.moveTo(18, 26);
  c.lineTo(30, 13);
  c.stroke();
  c.restore();
}

/** Thin ice: a see-through pane with a frosty rim (the cracks are drawn live, see `thinCracks`). */
function thinIce(c: Ctx, v: number) {
  const seed = 80 + v * 13;
  const pts = floePts(58, 36, seed, 10);
  const pane = () => polyPath(c, pts, seed, 0.4, 5, 26);
  c.save();
  pane();
  c.fillStyle = 'rgba(214,236,244,0.62)';
  c.fill();
  c.clip();
  c.strokeStyle = 'rgba(255,255,255,0.9)';
  c.lineWidth = 6;
  pane();
  c.stroke();
  // glints
  inkStyle(c, 3, 'rgba(255,255,255,0.85)');
  c.beginPath();
  c.moveTo(-30, -14);
  c.lineTo(-14, -22);
  c.moveTo(-22, -6);
  c.lineTo(-12, -11);
  c.stroke();
  c.restore();
  pane();
  inkStyle(c, 2, alpha('#6E97A8', 0.9));
  c.stroke();
}

/** The cracks in thin ice: one after the first landing, a web of them once it's about to go. */
export function thinCracks(c: Ctx, x: number, y: number, rx: number, seed: number, level: number, shake = 0) {
  c.save();
  c.translate(x + shake, y);
  c.scale(rx / 58, rx / 58);
  inkStyle(c, 2.4, '#4E7A8C');
  c.beginPath();
  const arms = level >= 2 ? 6 : 2;
  for (let i = 0; i < arms; i++) {
    const a = (i / arms) * Math.PI * 2 + jit(seed, i) * 0.5;
    let px = jit(seed, 40) * 6, py = jit(seed, 41) * 4;
    c.moveTo(px, py);
    for (let s = 1; s <= 3; s++) {
      px += Math.cos(a + jit(seed, i * 5 + s) * 0.5) * 15;
      py += Math.sin(a + jit(seed, i * 5 + s) * 0.5) * 9;
      c.lineTo(px, py);
    }
  }
  c.stroke();
  if (level >= 2) {
    c.lineWidth = 1.4;
    c.beginPath();
    c.ellipse(0, 0, 24, 14, 0, 0, Math.PI * 2);
    c.stroke();
  }
  c.restore();
}

// ---------------------------------------------------------------- the beaver's dam

/** Logs stacked across the river with mud between and sticks poking up, gaps where the gates go. */
function dam(c: Ctx, half: number, gates: number[]) {
  const gaps = gates.map((g) => [g - GATE_HALF, g + GATE_HALF] as const);
  // the water piled up behind it, a shade darker and calmer
  c.save();
  c.fillStyle = alpha(shade(WATER, 0.18), 0.35);
  c.fillRect(-half, -44, half * 2, 20);
  c.restore();
  // stretches of dam between the gates
  const edges = [-half, ...gaps.flatMap(([a, b]) => [a, b]), half];
  for (let i = 0; i < edges.length; i += 2) {
    const x0 = edges[i], x1 = edges[i + 1];
    const seed = 100 + i;
    // mud and sticks underneath
    inked(c, () => polyPath(c, [[x0, -16], [x1, -16], [x1 + 2, 22], [x0 - 2, 22]], seed, 1.4, 6, 18), '#8C6644', { band: 7, dark: 0.3 });
    // two rows of logs, ends showing
    const logRow = (y: number, h: number, off: number, s: number) => {
      for (let x = x0 + off; x < x1 - 8; ) {
        const len = Math.min(x1 - x, 46 + jit01(s, x | 0) * 30);
        if (len < 16) break;
        const lx = x, lw = len - 3;
        inked(c, () => { roundRect(c, lx, y - h / 2, lw, h, h / 2); }, P.wood, { band: 5, lw: 2.2 });
        inkStyle(c, 1.3, P.woodDeep);
        c.beginPath();
        c.moveTo(lx + 8, y - 2);
        c.lineTo(lx + lw - 10, y - 3);
        c.stroke();
        // the cut end
        inked(c, () => { c.beginPath(); c.ellipse(lx + lw - h * 0.3, y, h * 0.28, h / 2 - 1, 0, 0, Math.PI * 2); }, P.woodLight, { lw: 1.6, shade: false });
        x += len;
      }
    };
    logRow(-6, 18, 0, seed);
    logRow(12, 16, 18, seed + 3);
    // sticks poking up out of the top
    inkStyle(c, 3, P.woodDeep);
    c.beginPath();
    for (let x = x0 + 14; x < x1 - 10; x += 34 + jit01(seed, x | 0) * 20) {
      const a = jit(seed, x | 0) * 0.6;
      c.moveTo(x, -14);
      c.lineTo(x + Math.sin(a) * 22, -14 - Math.cos(a) * 18);
    }
    c.stroke();
  }
  // the gate frames: a post either side
  for (const [a, b] of gaps) {
    for (const x of [a, b]) {
      inked(c, () => { roundRect(c, x - 6, -30, 12, 56, 4); }, P.woodDeep, { band: 4, lw: 2.2 });
    }
  }
}

export type GateState = 'closed' | 'warn' | 'open';

/**
 * One of the dam's gates, live: the board down (closed), shaking with its lamp gone amber (about to
 * open), or hauled up with the river pouring through and foaming below (open). `k` is how far into the
 * state it is, 0–1.
 */
export function damGate(c: Ctx, x: number, y: number, state: GateState, k: number, t: number) {
  c.save();
  c.translate(x, y);
  const w = GATE_HALF * 2 - 12;
  const lamp = state === 'closed' ? P.lily : state === 'warn' ? (Math.sin(t * 18) > 0 ? P.gold : '#B78A2E') : P.red;
  if (state === 'open') {
    // water rushing through the gap and foaming out below
    c.fillStyle = tint(WATER, 0.25);
    c.fillRect(-w / 2, -26, w, 52);
    inkStyle(c, 3, FOAM);
    for (let i = 0; i < 5; i++) {
      const ox = -w / 2 + 8 + i * ((w - 16) / 4);
      const ph = (t * 3 + i * 0.37) % 1;
      c.beginPath();
      c.moveTo(ox, -24 + ph * 30);
      c.lineTo(ox, -4 + ph * 30);
      c.stroke();
    }
    for (let i = 0; i < 6; i++) {
      const ph = (t * 1.6 + i / 6) % 1;
      c.globalAlpha = 1 - ph;
      c.fillStyle = P.white;
      c.beginPath();
      c.arc(jit(i, 3) * w * 0.5, 30 + ph * 46, 5 + ph * 7, 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;
    // the board, hauled up above the frame
    const up = -40 - Math.min(1, k * 4) * 6;
    inked(c, () => { roundRect(c, -w / 2, up - 12, w, 16, 3); }, P.woodLight, { band: 4, lw: 2.2 });
  } else {
    const shake = state === 'warn' ? Math.sin(t * 40) * 1.5 : 0;
    inked(c, () => { roundRect(c, -w / 2 + shake, -22, w, 42, 4); }, P.woodLight, { band: 6, lw: 2.4 });
    inkStyle(c, 1.5, P.woodDeep);
    c.beginPath();
    for (const ly of [-8, 6]) {
      c.moveTo(-w / 2 + 6 + shake, ly);
      c.lineTo(w / 2 - 6 + shake, ly);
    }
    c.stroke();
    if (state === 'warn') {
      // a trickle under the board
      c.fillStyle = FOAM;
      for (let i = 0; i < 3; i++) {
        c.beginPath();
        c.arc(-14 + i * 14, 26 + ((t * 2 + i * 0.3) % 1) * 12, 3, 0, Math.PI * 2);
        c.fill();
      }
    }
  }
  // the lamp on the post
  c.save();
  c.globalAlpha = state === 'closed' ? 0.25 : 0.45;
  c.fillStyle = lamp;
  c.beginPath();
  c.arc(GATE_HALF, -36, 15, 0, Math.PI * 2);
  c.fill();
  c.restore();
  inked(c, () => { c.beginPath(); c.arc(GATE_HALF, -36, 7, 0, Math.PI * 2); }, lamp, { lw: 2, band: 3 });
  c.restore();
}

// ---------------------------------------------------------------- harbour

/** A plank pier reaching out from a bank (variant 0 from the left, 1 from the right): posts, a bollard, a lamp. */
function pier(c: Ctx, v: number) {
  c.save();
  if (v === 1) c.scale(-1, 1);
  const L = 120, D = 24;
  // the posts it stands on, going down into the water
  for (const x of [-L + 22, -10, L - 22]) {
    inked(c, () => { roundRect(c, x - 7, D - 4, 14, 30, 4); }, P.woodDeep, { band: 4, lw: 2.2 });
    c.save();
    c.translate(x, D + 26);
    waterRing(c, 14, 5);
    c.restore();
  }
  // the deck's edge, then the deck
  inked(c, () => { roundRect(c, -L, -D + 8, L * 2, D * 2, 5); }, P.woodDeep, { band: 4, lw: 2.6 });
  const deck = () => polyPath(c, [[-L, -D], [L, -D], [L, D], [-L, D]], 7, 0.5, 5);
  inked(c, deck, P.woodLight, { band: 8 });
  c.save();
  deck();
  c.clip();
  inkStyle(c, 1.6, P.wood);
  c.beginPath();
  for (let x = -L + 22; x < L; x += 22) {
    c.moveTo(x + jit(3, x) * 1.5, -D);
    c.lineTo(x + jit(4, x) * 1.5, D);
  }
  c.stroke();
  c.fillStyle = P.woodDeep;
  for (let x = -L + 11; x < L; x += 22) {
    c.beginPath();
    c.arc(x, -D + 6, 1.6, 0, Math.PI * 2);
    c.arc(x, D - 6, 1.6, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
  // a bollard with a coil of rope at the river end
  inked(c, () => { c.beginPath(); c.ellipse(L - 18, -4, 10, 7, 0, 0, Math.PI * 2); }, '#5B4A3D', { lw: 2.2, band: 3 });
  inkStyle(c, 3, P.kraft);
  c.beginPath();
  c.ellipse(L - 18, -4, 15, 10, 0, 0.4, Math.PI * 2 - 0.4);
  c.stroke();
  // a lamp post at the bank end
  inkStyle(c, 4, '#5B4A3D');
  c.beginPath();
  c.moveTo(-L + 14, -D + 6);
  c.lineTo(-L + 14, -D - 46);
  c.stroke();
  inked(c, () => { roundRect(c, -L + 4, -D - 66, 20, 24, 5); }, P.gold, { lw: 2.2, band: 4 });
  c.restore();
}

/** The ferry: a flat wooden boat with a rim, a mast and pennant at the stern, a bell at the bow. */
function ferry(c: Ctx) {
  const L = 82, D = 38;
  waterRing(c, L + 10, D + 6, 8);
  inked(c, () => { roundRect(c, -L, -D + 10, L * 2, D * 2, 30); }, '#7A5636', { band: 5, lw: 2.6 });
  const rim = () => { roundRect(c, -L, -D, L * 2, D * 2, 30); };
  inked(c, rim, P.woodDeep, { band: 6 });
  const deck = () => { roundRect(c, -L + 9, -D + 8, L * 2 - 18, D * 2 - 16, 22); };
  inked(c, deck, P.woodLight, { band: 7, lw: 2 });
  c.save();
  deck();
  c.clip();
  inkStyle(c, 1.5, P.wood);
  c.beginPath();
  for (let y = -D + 20; y < D; y += 14) {
    c.moveTo(-L, y);
    c.lineTo(L, y);
  }
  c.stroke();
  c.restore();
  // a stripe of paint round the rim
  inkStyle(c, 4, P.blue);
  roundRect(c, -L + 4, -D + 3, L * 2 - 8, D * 2 - 6, 27);
  c.stroke();
  // mast and pennant at the back
  inkStyle(c, 4, '#5B4A3D');
  c.beginPath();
  c.moveTo(-L + 18, -D + 10);
  c.lineTo(-L + 18, -D - 50);
  c.stroke();
  inked(c, () => { c.beginPath(); c.moveTo(-L + 20, -D - 50); c.lineTo(-L + 52, -D - 42); c.lineTo(-L + 20, -D - 32); c.closePath(); }, P.red, { lw: 2, band: 3 });
  // the bell at the front
  inkStyle(c, 3, '#5B4A3D');
  c.beginPath();
  c.moveTo(L - 18, -D + 10);
  c.lineTo(L - 18, -D - 18);
  c.lineTo(L - 6, -D - 18);
  c.stroke();
  inked(c, () => { c.beginPath(); c.moveTo(L - 12, -D - 16); c.quadraticCurveTo(L - 2, -D - 14, L - 2, -D - 2); c.lineTo(L - 22, -D - 2); c.quadraticCurveTo(L - 22, -D - 14, L - 12, -D - 16); c.closePath(); }, P.gold, { lw: 2, band: 3 });
}

/** The crane's hook: a slatted pallet hung on four ropes from a big orange hook and its pulley block. */
function hook(c: Ctx) {
  const W = 40, D = 28;
  // ropes from the corners up to the ring
  inkStyle(c, 2.6, P.kraft);
  c.beginPath();
  for (const [x, y] of [[-W + 6, -D + 6], [W - 6, -D + 6], [-W + 4, D - 8], [W - 4, D - 8]]) {
    c.moveTo(x, y);
    c.lineTo(0, -84);
  }
  c.stroke();
  inked(c, () => { roundRect(c, -W, -D + 8, W * 2, D * 2, 4); }, P.woodDeep, { band: 3, lw: 2.2 });
  const top = () => { roundRect(c, -W, -D, W * 2, D * 2, 4); };
  inked(c, top, P.woodLight, { band: 6 });
  c.save();
  top();
  c.clip();
  c.fillStyle = alpha(P.woodDeep, 0.55);
  for (let x = -W + 12; x < W; x += 17) c.fillRect(x, -D, 4, D * 2);
  c.restore();
  // the hook through the ring
  inkStyle(c, 7, P.ink);
  c.beginPath();
  c.moveTo(0, -112);
  c.lineTo(0, -98);
  c.arc(-7, -90, 8, -Math.PI / 2 + 0.6, Math.PI * 0.9);
  c.stroke();
  inkStyle(c, 4.5, P.orange);
  c.stroke();
  inked(c, () => { c.beginPath(); c.arc(0, -86, 5, 0, Math.PI * 2); }, '#8B8579', { lw: 2, shade: false });
  inked(c, () => { roundRect(c, -14, -132, 28, 24, 6); }, P.gold, { band: 4, lw: 2.4 });
  c.fillStyle = P.ink;
  c.beginPath();
  c.arc(0, -120, 3, 0, Math.PI * 2);
  c.fill();
}

codeSprite('rv_bud', [-28, -70, 28, 8], (c) => lotusBud(c, false));
codeSprite('rv_bloom', [-38, -72, 40, 8], (c) => lotusBud(c, true));
codeSprite('rv_turtle', [-100, -66, 106, 66], (c, v) => turtle(c, v || 'a'));
codeSprite('rv_stone', [-66, -42, 66, 52], (c, v) => stone(c, Number(v) || 0));
codeSprite('rv_leaf', [-82, -60, 82, 46], (c, v) => mapleLeaf(c, Number(v) || 0));
codeSprite('rv_floe', [-96, -96, 96, 96], (c, v) => floe(c, parseInt(v, 10) || 0, v.endsWith('s')));
codeSprite('rv_thin', [-72, -48, 72, 48], (c, v) => thinIce(c, Number(v) || 0));
codeSprite('rv_pier', [-140, -100, 140, 66], (c, v) => pier(c, Number(v) || 0));
codeSprite('rv_ferry', [-100, -98, 104, 60], ferry);
codeSprite('rv_hook', [-48, -136, 48, 40], hook);
/** The dam is as wide as the river; its gates sit where levelfeats.ts puts them. */
codeSprite('rv_dam', [-300, -56, 300, 44], (c, v) => dam(c, Number(v) || 282, DAM_GATES));

// ---------------------------------------------------------------- live bits

/** A whirlpool: arms of foam turning round a dark middle. */
export function whirlpool(c: Ctx, x: number, y: number, r: number, t: number, w: number) {
  c.save();
  c.translate(x, y);
  c.scale(1, 0.62);
  const g = c.createRadialGradient(0, 0, 4, 0, 0, r);
  g.addColorStop(0, alpha(shade(WATER, 0.5), 0.75));
  g.addColorStop(0.55, alpha(shade(WATER, 0.25), 0.35));
  g.addColorStop(1, alpha(WATER, 0));
  c.fillStyle = g;
  c.beginPath();
  c.arc(0, 0, r, 0, Math.PI * 2);
  c.fill();
  c.rotate(t * w * 1.6);
  c.lineCap = 'round';
  for (let arm = 0; arm < 4; arm++) {
    c.rotate(Math.PI / 2);
    c.beginPath();
    for (let i = 0; i <= 18; i++) {
      const k = i / 18;
      const a = k * 2.6 * Math.sign(w || 1);
      const rr = r * (0.95 - k * 0.8);
      if (i === 0) c.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    c.strokeStyle = 'rgba(251,247,238,0.7)';
    c.lineWidth = 4;
    c.stroke();
  }
  c.restore();
}

/** A stretch of rapids over [y0, y1] on screen: darker, faster water, chevrons racing down it, white water along the banks. */
export function rapidsFoam(c: Ctx, x0: number, x1: number, y0: number, y1: number, t: number) {
  c.save();
  const h = y1 - y0;
  const deep = shade(WATER, 0.3);
  const g = c.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, alpha(deep, 0));
  g.addColorStop(0.1, alpha(deep, 0.4));
  g.addColorStop(0.9, alpha(deep, 0.4));
  g.addColorStop(1, alpha(deep, 0));
  c.fillStyle = g;
  c.fillRect(x0, y0, x1 - x0, h);
  c.beginPath();
  c.rect(x0, y0, x1 - x0, h);
  c.clip();
  c.lineCap = 'round';
  c.lineJoin = 'round';
  const fade = (y: number) => Math.max(0, Math.min(1, (y - y0) / 90, (y1 - y) / 90));
  // rows of chevrons pointing downstream, each row keeping its own stagger as it goes
  const row = 74, run = (t * 300) / row, base = Math.floor(run);
  const n = Math.max(1, Math.round((x1 - x0) / 120));
  const gap = (x1 - x0) / n;
  c.strokeStyle = FOAM;
  for (let k = -1; k <= h / row + 1; k++) {
    const ry = y0 + (k + run - base) * row, id = k - base;
    const a = fade(ry);
    if (a <= 0) continue;
    c.globalAlpha = 0.6 * a;
    c.lineWidth = 4;
    c.beginPath();
    for (let j = 0; j < n; j++) {
      const cx = x0 + gap * (j + 0.5) + (id % 2 ? gap / 2 : 0) + jit(id, j) * 12;
      if (cx > x1 - 16) continue;
      const w = 18 + jit01(id, j + 9) * 10;
      c.moveTo(cx - w, ry - 11);
      c.quadraticCurveTo(cx - 3, ry - 2, cx, ry + 1);
      c.quadraticCurveTo(cx + 3, ry - 2, cx + w, ry - 11);
    }
    c.stroke();
  }
  // white water churning along both banks
  c.fillStyle = FOAM;
  for (const side of [0, 1]) {
    for (let i = 0; i < h / 34 + 1; i++) {
      const y = y0 + ((i * 34 + t * (260 + side * 40)) % (h + 34)) - 17;
      const a = fade(y);
      if (a <= 0) continue;
      const r = 7 + jit01(i, side + 3) * 6;
      c.globalAlpha = 0.75 * a;
      c.beginPath();
      c.arc(side ? x1 - 6 - jit01(i, 7) * 10 : x0 + 6 + jit01(i, 8) * 10, y, r, 0, Math.PI * 2);
      c.fill();
    }
  }
  c.restore();
}

/**
 * The crane over the harbour, high above the hook: a steel truss across the river at screen height y,
 * its trolley at cx where the hook's rope comes down.
 */
export function craneBeam(c: Ctx, y: number, x0: number, x1: number, cx: number) {
  const h = 26;
  c.save();
  // legs down to the banks at either end
  for (const x of [x0 + 10, x1 - 10]) inked(c, () => roundRect(c, x - 8, y - 4, 16, 64, 3), shade(P.orange, 0.15), { lw: 2.2, band: 3 });
  inked(c, () => roundRect(c, x0, y - h / 2, x1 - x0, h, 4), P.orange, { lw: 2.6, band: 5 });
  // the truss between the top and bottom chords
  inkStyle(c, 2.2, shade(P.orange, 0.4));
  c.beginPath();
  for (let x = x0 + 10; x + 30 < x1 - 8; x += 30) {
    c.moveTo(x, y + h / 2 - 4);
    c.lineTo(x + 15, y - h / 2 + 4);
    c.lineTo(x + 30, y + h / 2 - 4);
  }
  c.stroke();
  // the trolley riding along it
  inked(c, () => roundRect(c, cx - 26, y - h / 2 - 8, 52, h + 18, 6), P.gold, { lw: 2.4, band: 4 });
  for (const d of [-14, 14]) inked(c, () => { c.beginPath(); c.arc(cx + d, y - h / 2 - 8, 6, 0, Math.PI * 2); }, '#5B4A3D', { lw: 2, shade: false });
  c.restore();
}

/** A gull from above: wings flapping (`flap` 0–1 round the beat), heading `dir` (radians), maybe carrying a parcel. */
export function gull(c: Ctx, x: number, y: number, flap: number, dir: number, s = 1) {
  c.save();
  c.translate(x, y);
  c.rotate(dir + Math.PI / 2);
  c.scale(s, s);
  const up = Math.sin(flap * Math.PI * 2);
  for (const d of [-1, 1]) {
    inked(c, () => {
      c.beginPath();
      c.moveTo(d * 8, -4);
      c.quadraticCurveTo(d * 30, -18 - up * 10, d * (52 - Math.abs(up) * 8), -6 - up * 14);
      c.quadraticCurveTo(d * 30, 4, d * 8, 8);
      c.closePath();
    }, '#E9E6DE', { lw: 2.2, band: 4 });
    inkStyle(c, 3, '#5E5A55');
    c.beginPath();
    c.moveTo(d * (40 - Math.abs(up) * 6), -8 - up * 12);
    c.lineTo(d * (52 - Math.abs(up) * 8), -6 - up * 14);
    c.stroke();
  }
  inked(c, () => { c.beginPath(); c.ellipse(0, 2, 10, 22, 0, 0, Math.PI * 2); }, P.white, { lw: 2.2, band: 4 });
  inked(c, () => { c.beginPath(); c.moveTo(-4, -18); c.lineTo(0, -32); c.lineTo(4, -18); c.closePath(); }, P.gold, { lw: 1.6, shade: false });
  c.fillStyle = P.ink;
  for (const d of [-1, 1]) {
    c.beginPath();
    c.arc(d * 5, -12, 2, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
}

/** The goose on a porch: neck up and wings out while it's guarding (`angry`), pottering about when it isn't. */
export function goose(c: Ctx, x: number, y: number, t: number, angry: boolean, face: number) {
  c.save();
  c.translate(x, y);
  c.scale(face, 1);
  contactShadow(c, 0, 2, 26, 7, 0.3);
  const bob = angry ? Math.sin(t * 14) * 2 : Math.sin(t * 3) * 1.5;
  if (angry) {
    for (const d of [-1, 1]) inked(c, () => { c.beginPath(); c.ellipse(d * 22, -30 + bob, 22, 12, d * -0.6, 0, Math.PI * 2); }, '#EEEAE0', { lw: 2.2, band: 4 });
  }
  inked(c, () => { c.beginPath(); c.ellipse(-4, -24 + bob, 28, 20, 0, 0, Math.PI * 2); }, P.white, { lw: 2.4, band: 6 });
  // the neck and head, stretched out at the frog when it's guarding
  const hx = angry ? 26 : 16, hy = angry ? -64 : -58 - Math.sin(t * 2) * 3;
  inkStyle(c, 13, P.ink);
  c.beginPath();
  c.moveTo(12, -34 + bob);
  c.quadraticCurveTo(18, -48, hx, hy);
  c.stroke();
  inkStyle(c, 9, P.white);
  c.stroke();
  inked(c, () => { c.beginPath(); c.ellipse(hx + 2, hy, 10, 9, 0, 0, Math.PI * 2); }, P.white, { lw: 2.2, band: 3 });
  inked(c, () => { c.beginPath(); c.moveTo(hx + 9, hy - 4); c.lineTo(hx + (angry ? 26 : 22), hy + 1); c.lineTo(hx + 9, hy + 4); c.closePath(); }, P.orange, { lw: 1.8, shade: false });
  c.fillStyle = P.ink;
  c.beginPath();
  c.arc(hx + 4, hy - 3, 2.2, 0, Math.PI * 2);
  c.fill();
  if (angry) {
    // honking
    inkStyle(c, 3, P.red);
    c.beginPath();
    for (const a of [-0.5, 0, 0.5]) {
      c.moveTo(hx + 32 + Math.cos(a) * 4, hy + Math.sin(a) * 4);
      c.lineTo(hx + 44 + Math.cos(a) * 8, hy + Math.sin(a) * 10);
    }
    c.stroke();
  }
  c.restore();
}

/** A firework bursting: rays of sparks fading out as they fall, `k` 0–1 through its life. */
export function firework(c: Ctx, x: number, y: number, k: number, color: string, seed: number) {
  c.save();
  c.lineCap = 'round';
  const n = 14;
  const R = 40 + 90 * (1 - (1 - k) * (1 - k));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + jit(seed, i) * 0.1;
    const r0 = R * 0.55, r1 = R;
    const sag = k * k * 30;
    c.globalAlpha = Math.max(0, 1 - k) * 0.95;
    c.strokeStyle = i % 3 === 0 ? P.white : color;
    c.lineWidth = 3.5 * (1 - k * 0.5);
    c.beginPath();
    c.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0 + sag * 0.6);
    c.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1 + sag);
    c.stroke();
  }
  c.restore();
}

/** A forked bolt of lightning from the top of the screen. */
export function lightning(c: Ctx, x: number, y0: number, y1: number, seed: number, a: number) {
  c.save();
  c.globalAlpha = a;
  c.lineJoin = 'round';
  const pts: Pt[] = [[x, y0]];
  let px = x;
  const n = 7;
  for (let i = 1; i <= n; i++) {
    px += jit(seed, i) * 36;
    pts.push([px, y0 + ((y1 - y0) * i) / n]);
  }
  for (const [w, col] of [[14, 'rgba(255,248,214,0.35)'], [6, '#FFF6CF'], [2.5, P.white]] as const) {
    c.strokeStyle = col;
    c.lineWidth = w;
    c.beginPath();
    pts.forEach(([qx, qy], i) => (i ? c.lineTo(qx, qy) : c.moveTo(qx, qy)));
    const [bx, by] = pts[3];
    c.moveTo(bx, by);
    c.lineTo(bx + 40 * Math.sign(jit(seed, 20) || 1), by + 70);
    c.stroke();
  }
  c.restore();
}

/** A sealed letter lying on a pad, glinting. */
export function padLetter(c: Ctx, x: number, y: number, t: number) {
  c.save();
  c.translate(x, y - 12 + Math.sin(t * 3) * 2);
  c.rotate(-0.12);
  inked(c, () => { roundRect(c, -24, -16, 48, 32, 3); }, P.white, { lw: 2.2, band: 4 });
  inkStyle(c, 1.8);
  c.beginPath();
  c.moveTo(-24, -16);
  c.lineTo(0, 3);
  c.lineTo(24, -16);
  c.stroke();
  inked(c, () => { c.beginPath(); c.arc(0, 3, 6, 0, Math.PI * 2); }, P.red, { lw: 1.6, shade: false });
  const g = (t * 0.8) % 1;
  if (g < 0.3) {
    c.globalAlpha = Math.sin((g / 0.3) * Math.PI);
    inkStyle(c, 3, P.gold);
    c.beginPath();
    c.moveTo(22, -34);
    c.lineTo(22, -18);
    c.moveTo(14, -26);
    c.lineTo(30, -26);
    c.stroke();
  }
  c.restore();
}

// ---------------------------------------------------------------- briefing icons

/** The icon for a mechanic on the briefing card, in a circle of radius about 44 round (x, y). */
export function featIcon(c: Ctx, sp: SpriteBank, f: string, x: number, y: number) {
  c.save();
  c.translate(x, y);
  const box = (tag: string, col: string) => {
    sp.draw(c, 'box0', 0, 30, 1.05);
    inked(c, () => roundRect(c, tag.length > 1 ? -2 : 4, -30, tag.length > 1 ? 46 : 34, 24, 6), col, { lw: 2, shade: false });
    text(c, tag, 21, -17, tag.length > 1 ? 15 : 18, { bold: true, color: P.white });
  };
  switch (f) {
    case 'bud':
      sp.draw(c, 'lily1', 0, 10, 0.32);
      sp.draw(c, 'rv_bud', 2, 14, 0.6);
      break;
    case 'turtle':
      sp.draw(c, 'rv_turtle', -6, 2, 0.42);
      break;
    case 'fragile':
      box('易碎', P.red);
      break;
    case 'cold':
      box('冷', P.blue);
      break;
    case 'warm':
      box('热', P.orange);
      break;
    case 'return':
      box('退', P.tealDeep);
      break;
    case 'nag':
      box('催', P.orangeDeep);
      break;
    case 'bulk':
      sp.draw(c, 'box0', -16, 32, 0.9);
      sp.draw(c, 'box0', 16, 32, 0.9);
      sp.draw(c, 'box0', 0, 8, 0.9);
      break;
    case 'rapids':
      rapidsFoam(c, -40, 40, -40, 40, 0.3);
      break;
    case 'dam':
      c.save();
      c.beginPath();
      c.arc(0, 0, 42, 0, Math.PI * 2);
      c.clip();
      sp.draw(c, 'rv_dam', 118, 6, 0.55);
      c.restore();
      break;
    case 'slip':
      sp.draw(c, 'rv_stone', 0, 8, 0.66);
      inkStyle(c, 2.5, P.blueLight);
      c.beginPath();
      for (const [dx, dy] of [[-24, -34], [4, -40], [28, -30]]) {
        c.moveTo(dx, dy);
        c.lineTo(dx - 4, dy + 12);
      }
      c.stroke();
      break;
    case 'whirl':
      whirlpool(c, 0, 0, 40, 0.8, 0.6);
      break;
    case 'storm':
    case 'rain':
      inked(c, () => { c.beginPath(); c.ellipse(0, -10, 32, 18, 0, 0, Math.PI * 2); }, '#8E9AA6', { lw: 2.2 });
      if (f === 'storm') lightning(c, 2, 4, 40, 3, 1);
      else {
        inkStyle(c, 2.5, P.blueLight);
        c.beginPath();
        for (const dx of [-16, 0, 16]) {
          c.moveTo(dx, 14);
          c.lineTo(dx - 5, 30);
        }
        c.stroke();
      }
      break;
    case 'leaf':
      sp.draw(c, 'rv_leaf', 0, 6, 0.5);
      break;
    case 'gust':
      inkStyle(c, 4, P.blueLight);
      c.beginPath();
      c.moveTo(-34, -12);
      c.lineTo(14, -12);
      c.arc(14, -22, 10, Math.PI / 2, -Math.PI * 0.9, true);
      c.moveTo(-30, 6);
      c.lineTo(24, 6);
      c.arc(24, 16, 10, -Math.PI / 2, Math.PI * 0.9);
      c.stroke();
      break;
    case 'night':
      inked(c, () => { c.beginPath(); c.arc(-4, -4, 24, 0, Math.PI * 2); }, P.gold, { lw: 2.2 });
      c.fillStyle = P.cream;
      c.beginPath();
      c.arc(8, -12, 22, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#F6E27A';
      for (const [dx, dy] of [[24, 18], [-20, 26]]) {
        c.beginPath();
        c.arc(dx, dy, 4, 0, Math.PI * 2);
        c.fill();
      }
      break;
    case 'floe':
      sp.draw(c, 'rv_floe:0s', 0, 6.5, 0.56, 0.35);
      sp.draw(c, 'rv_floe', 0, 2, 0.56, 0.35);
      break;
    case 'thin':
      sp.draw(c, 'rv_thin', 0, 2, 0.62);
      thinCracks(c, 0, 2, 58 * 0.62, 7, 2);
      break;
    case 'quiet':
      sp.draw(c, 'avatar_bear', -6, 6, 0.9);
      text(c, 'Z', 24, -20, 22, { bold: true, color: P.blue });
      text(c, 'z', 36, -34, 16, { bold: true, color: P.blue });
      break;
    case 'blizzard':
    case 'snow':
      inkStyle(c, 4, P.blueLight);
      c.beginPath();
      for (let i = 0; i < 3; i++) {
        const a = (i * Math.PI) / 3;
        c.moveTo(Math.cos(a) * 26, Math.sin(a) * 26);
        c.lineTo(-Math.cos(a) * 26, -Math.sin(a) * 26);
      }
      c.stroke();
      break;
    case 'pier':
      sp.draw(c, 'rv_pier', 30, 14, 0.42);
      break;
    case 'ferry':
      sp.draw(c, 'rv_ferry', 0, 10, 0.44);
      break;
    case 'hook':
      sp.draw(c, 'rv_hook', 0, 22, 0.5);
      break;
    case 'gull':
      gull(c, 0, 0, 0.2, -Math.PI / 2, 0.8);
      break;
    case 'goose':
      goose(c, -6, 30, 0, true, 1);
      break;
    case 'owl':
      sp.draw(c, 'owl', 0, 38, 0.3);
      break;
    case 'fireworks':
      firework(c, 0, 0, 0.35, P.red, 4);
      firework(c, 0, 0, 0.55, P.gold, 9);
      break;
    default:
      break;
  }
  c.restore();
}
