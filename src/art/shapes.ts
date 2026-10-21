// Placeholder art drawn as SVG in "concept units" (the 1080-wide concept canvas).
// Every function returns SVG markup with its origin at the sprite's anchor point.
// These get rasterized once at startup (see sprites.ts) and are swapped for
// AI-generated PNG parts later without touching the game code.
import { E, INK, P, S, circ, ell, g, line, path, r1, rng, rr, tube, overlays } from './svg';

// ---------- river things ----------
export function lilyPad(cx: number, cy: number, r: number, o: { notch?: number; flower?: number; color?: string } = {}) {
  const rx = r, ry = r * 0.6;
  const a0 = ((o.notch ?? 300) * Math.PI) / 180, w = 0.2;
  const pt = (a: number, k = 1) => `${r1(cx + rx * k * Math.cos(a))} ${r1(cy + ry * k * Math.sin(a))}`;
  const shift = (p: string, dy: number) => p.split(' ').map((v, i) => (i ? +v + dy : v)).join(' ');
  const pad = (dy: number) => `M${cx} ${cy + dy} L${shift(pt(a0 + w), dy)} A${rx} ${ry} 0 1 1 ${shift(pt(a0 - w), dy)} Z`;
  let s = '';
  s += ell(cx + 8, cy + 18, rx * 1.03, ry * 1.02, P.tealDeep, 0, { opacity: 0.55 });
  s += ell(cx, cy + 10, rx * 1.28, ry * 1.32, 'none', 0, { stroke: P.white, 'stroke-width': 2.5, opacity: 0.55, 'stroke-dasharray': '46 20 14 34', 'stroke-linecap': 'round' });
  s += path(pad(7), P.lilyDeep, 3);
  s += path(pad(0), o.color || P.lily, 3);
  let veins = '';
  for (let k = 0; k < 9; k++) {
    const a = a0 + w + 0.32 + (k * (2 * Math.PI - 2 * w - 0.64)) / 8;
    const mx = cx + rx * 0.45 * Math.cos(a + 0.06), my = cy + ry * 0.45 * Math.sin(a + 0.06);
    veins += `M${cx} ${cy} Q${r1(mx)} ${r1(my)} ${pt(a, 0.84)} `;
  }
  s += path(veins, 'none', 0, { stroke: P.lilyDeep, 'stroke-width': 2.2, opacity: 0.7, 'stroke-linecap': 'round' });
  const h1 = 3.55, h2 = 4.25;
  s += path(`M${pt(h1, 0.82)} A${rx * 0.82} ${ry * 0.82} 0 0 1 ${pt(h2, 0.82)}`, 'none', 0, { stroke: P.lilyLight, 'stroke-width': 6, 'stroke-linecap': 'round', opacity: 0.9 });
  if (o.flower) s += flower(cx + rx * 0.35, cy - ry * 0.15, o.flower);
  return g(s, { filter: 'url(#wobbleSoft)' });
}

export function flower(cx: number, cy: number, s = 1) {
  let out = '';
  for (let i = 0; i < 8; i++) {
    const a = (i * 360) / 8;
    out += E('ellipse', { cx: 0, cy: -13 * s, rx: 7 * s, ry: 15 * s, fill: i % 2 ? P.pink : '#F6CFC4', ...S(2), transform: `rotate(${a})` });
  }
  for (let i = 0; i < 5; i++) {
    const a = (i * 360) / 5 + 36;
    out += E('ellipse', { cx: 0, cy: -8 * s, rx: 5 * s, ry: 10 * s, fill: '#F9DDD4', ...S(1.8), transform: `rotate(${a})` });
  }
  out += circ(0, 0, 5 * s, P.gold, 1.8);
  return g(out, { transform: `translate(${cx} ${cy}) scale(1 0.72)` });
}

export function curl(x: number, y: number, s = 1, color: string = P.tealDeep, op = 0.7) {
  return path(`M${x} ${y} q${10 * s} ${-9 * s} ${20 * s} 0 t${20 * s} 0 t${20 * s} 0`, 'none', 0, { stroke: color, 'stroke-width': 3, opacity: op, 'stroke-linecap': 'round' });
}
export function spiral(x: number, y: number, s = 1, color: string = P.white, op = 0.7) {
  return path(`M${x} ${y} c${8 * s} ${-10 * s} ${22 * s} ${-4 * s} ${16 * s} ${6 * s} c${-4 * s} ${6 * s} ${-12 * s} ${2 * s} ${-8 * s} ${-3 * s}`, 'none', 0, { stroke: color, 'stroke-width': 3, opacity: op, 'stroke-linecap': 'round' });
}
export function leafBit(x: number, y: number, rot: number, s = 1, fill: string = P.lilyLight) {
  return g(path(`M0 0 Q${10 * s} ${-12 * s} ${24 * s} 0 Q${10 * s} ${12 * s} 0 0 Z`, fill, 2) + line(2 * s, 0, 20 * s, 0, P.lilyDeep, 1.5), { transform: `translate(${x} ${y}) rotate(${rot})` });
}

export function raft(cx: number, cy: number, rx: number, ry: number) {
  let s = '';
  s += ell(cx + 6, cy + 22, rx * 1.02, ry, P.tealDeep, 0, { opacity: 0.55 });
  s += ell(cx, cy + 12, rx * 1.3, ry * 1.4, 'none', 0, { stroke: P.white, 'stroke-width': 2.5, opacity: 0.5, 'stroke-dasharray': '60 22 16 40' });
  s += ell(cx, cy + 12, rx, ry, P.woodDeep, 3);
  s += ell(cx, cy, rx, ry, P.woodLight, 3);
  let planks = '';
  for (let x = cx - rx + 34; x < cx + rx - 10; x += 34) {
    const dx = (x - cx) / rx, h = ry * Math.sqrt(Math.max(0, 1 - dx * dx));
    planks += `M${r1(x)} ${r1(cy - h + 3)} L${r1(x)} ${r1(cy + h - 3)} `;
  }
  s += path(planks, 'none', 0, { stroke: P.woodDeep, 'stroke-width': 2, opacity: 0.6 });
  return s;
}

export function log() {
  let s = '';
  s += rr(-112, -10, 228, 50, 25, P.tealDeep, 0, { opacity: 0.5 });
  s += rr(-118, -26, 228, 50, 25, P.wood, 3);
  s += path('M-90 -12 q40 -6 80 0 t80 0 M-80 6 q50 6 100 0 t70 -2', 'none', 0, { stroke: P.woodDeep, 'stroke-width': 2, opacity: 0.7 });
  s += ell(98, -1, 14, 25, P.woodLight, 3);
  s += ell(98, -1, 7, 13, 'none', 2, { stroke: P.woodDeep });
  s += rr(-58, -46, 8, 20, 3, P.cream, 2) + path('M-68 -44 q14 -24 28 0 z', P.orange, 2) + circ(-60, -50, 2.5, P.cream, 0) + circ(-50, -48, 2, P.cream, 0);
  s += rr(-36, -38, 6, 13, 3, P.cream, 2) + path('M-44 -37 q10 -16 21 0 z', P.orange, 2);
  return g(s, { filter: 'url(#wobbleSoft)' });
}

// ---------- characters ----------
export type FrogPose = 'stand' | 'crouch' | 'jump' | 'swim';
export type FrogMood = 'normal' | 'nervous' | 'happy' | 'shock';

/** Frog courier, without satchel and shadow (both drawn separately). Origin = between the feet. */
export function frog(o: { pose?: FrogPose; mood?: FrogMood; look?: [number, number]; bag?: boolean } = {}) {
  const pose = o.pose || 'stand';
  const look = o.look || [3, -3];
  const mood = o.mood || 'normal';
  if (pose === 'swim') return frogSwim(mood);
  const sq = pose === 'crouch' ? 1.12 : 1;
  let b = '';
  if (pose === 'jump') {
    // legs stretched down and back
    b += ell(-36, -6, 20, 36, P.frog, 3, { transform: 'rotate(18 -36 -6)' }) + ell(36, -6, 20, 36, P.frog, 3, { transform: 'rotate(-18 36 -6)' });
    b += path('M-58 30 q4 -12 14 -8 q6 -8 13 -1 q8 -5 11 4 z', P.frog, 2.5) + path('M58 30 q-4 -12 -14 -8 q-6 -8 -13 -1 q-8 -5 -11 4 z', P.frog, 2.5);
  } else {
    b += ell(-50 * sq, -20, 32, 22, P.frog, 3) + ell(50 * sq, -20, 32, 22, P.frog, 3);
    b += path(`M${-78 * sq} 2 q6 -10 14 -6 q6 -8 13 -2 q8 -6 12 2 z`, P.frog, 2.5) + path(`M${78 * sq} 2 q-6 -10 -14 -6 q-6 -8 -13 -2 q-8 -6 -12 2 z`, P.frog, 2.5);
  }
  b += ell(0, -46, 56 * sq, pose === 'crouch' ? 44 : 50, P.frog, 3);
  b += ell(0, -38, 34 * sq, 28, P.cream, 2.5);
  b += circ(-40 * sq, -62, 6, P.frogDeep, 0, { opacity: 0.55 }) + circ(-30 * sq, -40, 4, P.frogDeep, 0, { opacity: 0.55 }) + circ(44 * sq, -50, 5, P.frogDeep, 0, { opacity: 0.55 });
  if (o.bag !== false) b += tube(`M${-40 * sq} -84 L${30 * sq} -40`, P.blue, 7);
  // arms
  const arm = pose === 'jump' ? `M${-40} -70 q-26 -20 -30 -46` : `M${-34 * sq} -62 q-18 16 -6 30`;
  b += path(arm, 'none', 0, S(3)) + path(arm, 'none', 0, { stroke: P.frog, 'stroke-width': 9, 'stroke-linecap': 'round' });
  if (pose === 'jump') {
    const arm2 = 'M40 -70 q26 -20 30 -46';
    b += path(arm2, 'none', 0, S(3)) + path(arm2, 'none', 0, { stroke: P.frog, 'stroke-width': 9, 'stroke-linecap': 'round' });
  }
  b += frogHead(look, mood, pose === 'jump' ? 'o' : undefined);
  return g(b, { filter: 'url(#wobbleSoft)' });
}

function frogHead(look: [number, number], mood: FrogMood, mouth?: 'o', dy = 0) {
  let b = '';
  b += ell(0, -104 + dy, 64, 46, P.frog, 3);
  const eye = (ex: number) => {
    let e = circ(ex, -140 + dy, 23, P.frog, 3);
    if (mood === 'happy') {
      e += path(`M${ex - 11} ${-138 + dy} q11 -14 22 0`, 'none', 0, S(3.5));
    } else {
      const r = mood === 'shock' ? 18 : 16;
      e += circ(ex, -141 + dy, r, P.white, 2.5) + circ(ex + look[0], -141 + dy + look[1], mood === 'shock' ? 6 : 8.5, INK, 0) + circ(ex + look[0] + 3, -141 + dy + look[1] - 3, 2.6, P.white, 0);
    }
    return e;
  };
  b += eye(-40) + eye(40);
  // cap with stamp badge
  b += path(`M-27 ${-146 + dy} q2 -36 27 -36 q25 0 27 36 z`, P.orange, 3) + path(`M-30 ${-146 + dy} q34 10 64 -4 q-30 -6 -64 4 z`, P.orangeDeep, 2.5) + rr(-9, -172 + dy, 18, 15, 2, P.cream, 2) + circ(0, -164.5 + dy, 3.5, P.red, 0);
  if (mouth === 'o' || mood === 'shock') {
    b += ell(0, -90 + dy, 10, 8, '#C46F5E', 2.5);
  } else if (mood === 'nervous') {
    b += path(`M-20 ${-92 + dy} q10 -6 20 0 q10 6 20 0`, 'none', 0, S(3)) + path(`M54 ${-128 + dy} q8 10 0 18 q-8 -8 0 -18 z`, P.tealLight, 2);
  } else if (mood === 'happy') {
    b += path(`M-26 ${-96 + dy} q26 24 52 0 q-26 6 -52 0 z`, '#C46F5E', 2.5);
  } else {
    b += path(`M-28 ${-94 + dy} q28 16 56 0`, 'none', 0, S(3)) + path(`M20 ${-91 + dy} q4 9 10 3`, P.pink, 2);
  }
  b += ell(-42, -98 + dy, 10, 6, P.pink, 0, { opacity: 0.7 }) + ell(42, -98 + dy, 10, 6, P.pink, 0, { opacity: 0.7 });
  if (mood !== 'happy') b += path(`M-16 ${-128 + dy} q-4 -6 -10 -4 M16 ${-128 + dy} q4 -6 10 -4`, 'none', 0, S(2.5));
  return b;
}

/** Swimming frog: head and paddling hands above a wavy water line at y=0. */
function frogSwim(mood: FrogMood) {
  let b = '';
  b += ell(-74, -8, 18, 11, P.frog, 2.5, { transform: 'rotate(-20 -74 -8)' }) + ell(74, -8, 18, 11, P.frog, 2.5, { transform: 'rotate(20 74 -8)' });
  b += frogHead([0, -6], mood === 'normal' ? 'nervous' : mood, undefined, 84);
  // water in front of the chin
  b += path('M-96 6 q16 -12 32 0 t32 0 t32 0 t32 0 t32 0 t32 0 V40 H-96 z', P.teal, 0);
  b += path('M-96 6 q16 -12 32 0 t32 0 t32 0 t32 0 t32 0 t32 0', 'none', 0, { stroke: P.white, 'stroke-width': 4, 'stroke-linecap': 'round', opacity: 0.85 });
  return g(b, { filter: 'url(#wobbleSoft)' });
}

/** Kraft satchel; origin at the strap end so it can swing. size 0..2 = small/medium/large. */
export function satchel(size: 0 | 1 | 2) {
  const w = [46, 56, 68][size], h = [38, 46, 56][size];
  const x = -w / 2 + 6, y = -6;
  let s = '';
  s += rr(x, y, w, h, 10, P.kraft, 3);
  s += path(`M${x} ${y + 2} h${w} v${h * 0.36} q${-w / 2} ${h * 0.26} ${-w} 0 z`, P.kraftTop, 2.5);
  s += rr(x + w / 2 - 6, y + h * 0.22, 12, 11, 2, P.red, 1.5);
  if (size === 2) s += path(`M${x + 6} ${y + h - 10} q${w / 2 - 6} 8 ${w - 12} 0`, 'none', 0, S(2, { opacity: 0.6 }));
  return g(s, { filter: 'url(#wobbleSoft)' });
}

export function duck(o: { cup?: boolean } = {}) {
  let b = '';
  b += ell(0, 2, 34, 9, P.woodDeep, 0, { opacity: 0.35 });
  b += path('M-30 -8 q-6 -36 22 -40 q30 -2 36 24 q4 18 -16 22 h-30 q-12 0 -12 -6 z', P.white, 3);
  b += path('M-34 -26 q-12 -6 -10 8 q6 6 14 2', P.white, 2.5);
  b += circ(14, -58, 22, P.white, 3);
  b += path('M32 -58 q18 -2 18 6 q-6 8 -20 4 z', P.orange, 2.5);
  b += circ(20, -62, 3.6, INK, 0);
  b += ell(10, -50, 7, 4, P.pink, 0, { opacity: 0.7 });
  b += path('M-4 -42 q18 12 34 0 l-2 10 q-16 8 -30 -2 z', P.blue, 2.5);
  if (o.cup) b += rr(26, -40, 18, 16, 4, P.gold, 2.5) + path('M44 -36 q8 2 0 10', 'none', 0, S(2.5)) + path('M30 -46 q-4 -8 2 -14 q6 -6 0 -14', 'none', 0, { stroke: P.white, 'stroke-width': 3, 'stroke-linecap': 'round', opacity: 0.9 });
  return g(b, { filter: 'url(#wobbleSoft)' });
}

export function hedgehog() {
  let b = '';
  b += ell(0, 2, 30, 8, P.woodDeep, 0, { opacity: 0.35 });
  let spikes = 'M-30 -6 ';
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI + (i * Math.PI) / 10;
    const rx = 34, ry = 40;
    spikes += `L${r1(rx * 1.2 * Math.cos(a - 0.15))} ${r1(-24 + ry * 1.2 * Math.sin(a - 0.15))} L${r1(rx * Math.cos(a))} ${r1(-24 + ry * Math.sin(a))} `;
  }
  b += path(spikes + 'Z', '#9C7B5C', 2.5);
  b += ell(4, -22, 22, 22, '#F1DDBE', 2.5);
  b += circ(-4, -26, 3, INK, 0) + circ(12, -26, 3, INK, 0) + circ(5, -18, 3.5, INK, 0) + ell(-10, -16, 5, 3, P.pink, 0, { opacity: 0.7 });
  b += path('M22 -30 q16 -14 12 -34', 'none', 0, S(3)) + path('M22 -30 q16 -14 12 -34', 'none', 0, { stroke: '#F1DDBE', 'stroke-width': 7, 'stroke-linecap': 'round' });
  return g(b, { filter: 'url(#wobbleSoft)' });
}

function rabbitHead(x: number, y: number, s = 1) {
  let b = '';
  b += ell(-12, -46, 9, 26, P.white, 2.5, { transform: 'rotate(-10 -12 -46)' }) + ell(-12, -46, 4, 17, P.pink, 0, { transform: 'rotate(-10 -12 -46)' });
  b += ell(12, -48, 9, 26, P.white, 2.5, { transform: 'rotate(12 12 -48)' }) + ell(12, -48, 4, 17, P.pink, 0, { transform: 'rotate(12 12 -48)' });
  b += ell(0, -8, 24, 20, P.white, 2.5);
  b += circ(-8, -10, 3, INK, 0) + circ(9, -10, 3, INK, 0) + path('M-2 -2 l2 2 l2 -2', 'none', 0, S(2)) + ell(-15, -3, 5, 3, P.pink, 0, { opacity: 0.7 }) + ell(15, -3, 5, 3, P.pink, 0, { opacity: 0.7 });
  return g(b, { transform: `translate(${x} ${y}) scale(${s})` });
}

export function rabbit() {
  let b = '';
  b += ell(0, 2, 28, 8, P.woodDeep, 0, { opacity: 0.35 });
  b += ell(-12, -4, 12, 7, P.white, 2.5) + ell(12, -4, 12, 7, P.white, 2.5);
  b += ell(0, -26, 22, 26, P.white, 3);
  b += circ(20, -18, 8, P.white, 2.5); // tail-side paw
  b += path('M-16 -42 q16 10 32 0 l-2 9 q-14 7 -28 0 z', P.orange, 2.5); // scarf
  b += rabbitHead(0, -48, 1);
  return g(b, { filter: 'url(#wobbleSoft)' });
}

export function owl() {
  const brown = '#B08D67', brownDeep = '#8C6B4C';
  let b = '';
  b += path('M-92 -250 l-26 -60 l58 34 z', brown, 3) + path('M92 -250 l26 -60 l-58 34 z', brown, 3);
  b += path('M-120 0 C-140 -150 -110 -290 0 -292 C110 -290 140 -150 120 0 Z', brown, 3);
  b += path('M-70 0 C-84 -80 -60 -140 0 -144 C60 -140 84 -80 70 0 Z', '#F1E2C4', 2.5);
  for (let r = 0; r < 4; r++) for (let c = -2; c <= 2; c++) {
    if (Math.abs(c) > 2 - (r === 0 ? 1 : 0)) continue;
    const cx = c * 24 + (r % 2 ? 12 : 0), cy = -116 + r * 28;
    if (Math.abs(cx) > 56 - (r === 0 ? 14 : 0)) continue;
    b += path(`M${cx - 8} ${cy} l8 7 l8 -7`, 'none', 0, { stroke: brownDeep, 'stroke-width': 2.5, 'stroke-linecap': 'round', opacity: 0.8 });
  }
  b += path('M-118 -40 C-122 -100 -112 -150 -76 -168 L-40 -40 Z', P.blue, 3) + path('M118 -40 C122 -100 112 -150 76 -168 L40 -40 Z', P.blue, 3);
  b += circ(-48, -70, 5, P.gold, 2) + circ(48, -70, 5, P.gold, 2) + rr(-104, -120, 30, 22, 3, P.cream, 2) + circ(-89, -109, 4, P.red, 0);
  b += ell(-48, -214, 52, 48, '#E9D7B4', 2.5) + ell(48, -214, 52, 48, '#E9D7B4', 2.5);
  b += circ(-46, -212, 23, INK, 0) + circ(46, -212, 23, INK, 0) + circ(-38, -220, 7, P.white, 0) + circ(54, -220, 7, P.white, 0);
  b += path('M-90 -222 q42 -20 84 0', '#E9D7B4', 0) + path('M-90 -222 q42 -14 84 -2', 'none', 0, S(3));
  b += circ(-46, -212, 38, 'none', 0, { stroke: P.gold, 'stroke-width': 6 }) + circ(46, -212, 38, 'none', 0, { stroke: P.gold, 'stroke-width': 6 });
  b += circ(-46, -212, 41, 'none', 0, { stroke: INK, 'stroke-width': 1.8 }) + circ(46, -212, 41, 'none', 0, { stroke: INK, 'stroke-width': 1.8 });
  b += line(-8, -216, 8, -216, P.gold, 5);
  b += path('M10 -262 q34 -26 74 -12', 'none', 0, S(5, { stroke: brownDeep }));
  b += path('M-12 -180 l12 24 l12 -24 z', P.gold, 2.5);
  b += path('M-106 -60 q-40 20 -24 60 h56 q4 -40 -32 -60 z', brownDeep, 3);
  return g(b, { filter: 'url(#wobbleSoft)' });
}

/** The owl's raised wing holding the rubber stamp; origin at the shoulder. */
export function owlWing() {
  const brownDeep = '#8C6B4C';
  let b = path('M0 0 q70 -10 96 -96 q-46 -4 -84 40 z', brownDeep, 3);
  b += g(rr(-18, -64, 36, 40, 12, P.woodLight, 3) + circ(0, -74, 18, P.woodLight, 3) + rr(-34, -26, 68, 22, 4, P.wood, 3) + rr(-36, -6, 72, 14, 3, P.red, 3), { transform: 'translate(108 -96) rotate(18)' });
  return g(b, { filter: 'url(#wobbleSoft)' });
}

// ---------- props ----------
/** Parcel seen in 3/4; origin at the bottom center of the front face. */
export function box(size: 0 | 1 | 2, tag: 'label' | 'urgent' | 'none' = 'label') {
  const [w, h, d] = [[50, 32, 14], [62, 42, 18], [78, 52, 22]][size];
  const x = -w / 2, y = -(h + d);
  let s = '';
  s += rr(x, y + d, w, h, 4, P.kraft, 2.5);
  s += path(`M${x} ${y + d} L${x + 10} ${y} H${x + w - 10} L${x + w} ${y + d} Z`, P.kraftTop, 2.5);
  s += line(x + w / 2, y + 1, x + w / 2, y + d + h - 1, P.woodDeep, 2.2, { opacity: 0.9 });
  s += line(x + 6, y + d / 2, x + w - 6, y + d / 2, P.woodDeep, 2.2, { opacity: 0.9 });
  if (tag === 'urgent') s += rr(x + 6, y + d + 6, w * 0.38, h * 0.36, 2, P.red, 1.5);
  if (tag === 'label') s += rr(x + 6, y + d + 6, w * 0.34, h * 0.3, 2, P.cream, 1.5);
  return g(s, { filter: 'url(#wobbleSoft)' });
}

/** Truck seen from above: hood, cab and flatbed. Wheels and cargo are drawn in code. */
export function truckBody(color: string, dark: string, light: string) {
  let s = '';
  s += rr(-78, -192, 156, 88, 34, color, 3);
  s += path('M-40 -186 v40 M-20 -188 v44 M0 -188 v44 M20 -188 v44 M40 -186 v40', 'none', 0, { stroke: dark, 'stroke-width': 2.5, opacity: 0.7 });
  s += circ(-56, -176, 13, P.cream, 3) + circ(56, -176, 13, P.cream, 3);
  s += rr(-92, -124, 184, 112, 20, color, 3);
  s += rr(-72, -114, 144, 70, 16, light, 2.5);
  s += circ(0, -79, 24, P.cream, 2.5) + frogBadge(0, -79, 0.9);
  s += rr(-92, -30, 184, 22, 6, dark, 3) + rr(-40, -27, 80, 14, 4, P.tealLight, 2);
  s += rr(-104, -6, 208, 168, 8, P.woodLight, 3);
  s += path('M-104 36 H104 M-104 78 H104 M-104 120 H104', 'none', 0, { stroke: P.woodDeep, 'stroke-width': 2, opacity: 0.55 });
  s += rr(-104, -6, 14, 168, 5, color, 3) + rr(90, -6, 14, 168, 5, color, 3);
  s += rr(-104, 158, 208, 30, 8, dark, 3);
  s += circ(-82, 173, 8, P.red, 2) + circ(82, 173, 8, P.red, 2);
  s += rr(-34, 164, 68, 18, 4, P.cream, 2);
  return g(s, { filter: 'url(#wobbleSoft)' });
}

export function frogBadge(x: number, y: number, s = 1) {
  const b = ell(0, 4, 14, 10, P.frog, 2) + circ(-8, -5, 6, P.frog, 2) + circ(8, -5, 6, P.frog, 2) + circ(-8, -5, 2.4, INK, 0) + circ(8, -5, 2.4, INK, 0) + path('M-6 6 q6 4 12 0', 'none', 0, S(1.6));
  return g(b, { transform: `translate(${x} ${y}) scale(${s})` });
}

export function coin(r = 26) {
  return circ(0, 0, r, P.gold, 2.5) + circ(0, 0, r * 0.68, 'none', 2, { stroke: '#C9973A' }) + frogBadge(0, 1, r / 26);
}

export function postmark(r: number, color: string = P.red) {
  return circ(0, 0, r, 'none', 0, { stroke: color, 'stroke-width': 3 }) + circ(0, 0, r * 0.72, 'none', 0, { stroke: color, 'stroke-width': 2 }) +
    path(`M${r + 4} -8 q10 -6 20 0 t20 0 M${r + 4} 2 q10 -6 20 0 t20 0 M${r + 4} 12 q10 -6 20 0 t20 0`, 'none', 0, { stroke: color, 'stroke-width': 2.5, 'stroke-linecap': 'round' });
}

export function heart() {
  return g(path('M0 18 q-30 -20 -18 -34 q10 -10 18 4 q8 -14 18 -4 q12 14 -18 34 z', P.pink, 3) + path('M-12 -8 q4 -6 8 -2', 'none', 0, { stroke: P.white, 'stroke-width': 3, 'stroke-linecap': 'round' }), { filter: 'url(#wobbleSoft)' });
}

/** Ink-curl water splash crown; origin at the water point. */
export function splash() {
  let s = '';
  const drops: [number, number, number][] = [[-70, -36, -40], [-36, -70, -15], [0, -84, 0], [36, -70, 15], [70, -36, 40]];
  for (const [x, y, rot] of drops) {
    s += g(path('M0 0 q-14 -26 0 -46 q14 20 0 46 z', P.white, 3), { transform: `translate(${x * 0.6} ${y * 0.3}) rotate(${rot}) scale(${1 - Math.abs(x) / 260})` });
  }
  s += ell(0, 4, 74, 22, 'none', 0, { stroke: P.white, 'stroke-width': 5, opacity: 0.9 });
  s += spiral(-60, -6, 1.1, P.white, 0.95) + spiral(44, -10, 1, P.white, 0.95);
  return g(s, { filter: 'url(#wobbleSoft)' });
}

/** Tutorial pointing hand; origin at the fingertip. */
export function hand() {
  let s = '';
  s += path('M-8 6 C-10 -10 -10 -40 -6 -52 C-4 -60 8 -60 8 -50 L10 -26 C14 -30 26 -30 28 -22 C34 -26 44 -24 44 -14 C52 -16 58 -10 56 2 C54 26 46 44 24 52 C6 58 -14 50 -22 36 L-36 12 C-40 4 -32 -4 -24 2 Z', P.white, 3);
  s += path('M10 -26 L12 -6 M28 -22 L28 -4 M44 -14 L42 0', 'none', 0, S(2.5, { opacity: 0.7 }));
  return g(s, { transform: 'translate(-2 60)', filter: 'url(#wobbleSoft)' });
}

/** Round resident portrait for parcel labels. */
export function avatar(species: 'duck' | 'rabbit' | 'hedgehog') {
  const inner = species === 'duck' ? g(duck(), { transform: 'translate(-6 64) scale(0.95)' })
    : species === 'rabbit' ? g(rabbit(), { transform: 'translate(0 82) scale(0.8)' })
      : g(hedgehog(), { transform: 'translate(-2 38) scale(1.05)' });
  return E('clipPath', { id: 'av' }, E('circle', { cx: 0, cy: 0, r: 34 })) + circ(0, 0, 34, P.tealLight, 0) + g(inner, { 'clip-path': 'url(#av)' }) + circ(0, 0, 34, 'none', 3);
}

// ---------- houses (origin = raft center; number plates and residents drawn in code) ----------
export function teapotHouse() {
  let s = raft(0, 0, 150, 64);
  s += tube('M-92 -128 q-62 10 -54 56 q6 30 46 28', P.white, 18);
  s += ell(0, -78, 108, 86, P.white, 3);
  s += path('M-104 -96 q104 34 208 0 l2 26 q-106 36 -212 0 z', P.blue, 2.5);
  for (let i = 0; i < 6; i++) {
    const t = (i + 0.5) / 6, bx = -96 + t * 192, by = -80 + Math.sin(t * Math.PI) * 14;
    s += circ(bx, by, 5, P.cream, 0) + circ(bx, by, 2, P.gold, 0);
  }
  s += tube('M92 -92 q46 -10 58 -74', P.white, 24);
  s += ell(152, -168, 15, 7, P.white, 3);
  s += path('M-62 -156 q62 -60 124 0 z', P.white, 3);
  s += ell(0, -156, 64, 14, P.cream, 3);
  s += circ(0, -194, 13, P.blue, 3);
  s += circ(54, -132, 17, P.tealLight, 3) + path('M54 -149 v34 M37 -132 h34', 'none', 0, S(2));
  s += path('M-28 -2 v-46 a28 28 0 0 1 56 0 v46 z', P.blue, 3) + circ(16, -30, 4, P.gold, 1.5);
  s += path('M-34 0 h68', 'none', 0, S(3));
  s += rr(-132, -30, 26, 22, 5, P.orange, 2.5) + leafBit(-128, -32, -70, 1, P.lily) + leafBit(-116, -34, -110, 1, P.lily);
  return g(s, { filter: 'url(#wobbleSoft)' });
}

export function bootHouse() {
  let s = raft(0, 0, 128, 56);
  s += path('M-78 -10 V-218 q0 -14 14 -14 h72 q14 0 14 14 V-92 q74 4 92 44 q8 30 -10 38 Z', P.mustard, 3);
  s += path('M-80 -10 h184 q10 0 8 -10 h-196 z', '#8E6A3D', 3);
  s += ell(-28, -230, 52, 13, '#A67F39', 3);
  s += leafBit(-30, -236, -60, 2.2, P.lily) + leafBit(-30, -236, -130, 2, P.lilyLight) + leafBit(-30, -236, -95, 2.6, P.lily) + leafBit(-26, -236, -20, 1.8, P.lilyLight);
  s += path('M-4 -196 l22 12 l-22 12 l22 12 l-22 12', 'none', 0, S(2.5, { stroke: P.cream }));
  for (let i = 0; i < 5; i++) s += circ(-4 + (i % 2) * 22, -196 + i * 12, 3, INK, 0);
  s += circ(-46, -160, 18, P.tealLight, 3) + path('M-62 -168 q10 8 16 -8 q6 16 16 8', P.pink, 2);
  s += path('M24 -10 v-34 a22 22 0 0 1 44 0 v34 z', P.orange, 3) + circ(58, -30, 3.5, P.gold, 1.5);
  return g(s, { filter: 'url(#wobbleSoft)' });
}

export function canHouse() {
  let s = raft(0, 0, 120, 52);
  const top = -196, bot = -12, l = -74, r = 74;
  s += path(`M${l} ${top} V${bot} a74 18 0 0 0 148 0 V${top} z`, P.silver, 3);
  s += path(`M${l} ${top + 44} V${bot - 30} a74 18 0 0 0 148 0 V${top + 44} a74 18 0 0 1 -148 0 z`, P.cream, 2.5);
  s += path(`M${l} ${top + 62} a74 18 0 0 0 148 0 M${l} ${bot - 46} a74 18 0 0 0 148 0`, 'none', 0, { stroke: P.orange, 'stroke-width': 9 });
  s += path(`M${l} ${top + 14} a74 18 0 0 0 148 0 M${l} ${bot - 6} a74 18 0 0 0 148 0`, 'none', 0, { stroke: INK, 'stroke-width': 1.6, opacity: 0.5 });
  void r;
  s += ell(0, top, 74, 18, '#E8E5DC', 3) + ell(0, top, 60, 13, 'none', 2, { stroke: '#B9B4A6' });
  s += ell(20, top - 18, 12, 8, P.silver, 2.5) + line(20, top - 10, 14, top - 2, INK, 2.5);
  // window with checked curtain + awning
  s += rr(-4, top + 70, 60, 48, 8, '#5C7F96', 3);
  s += path(`M-2 ${top + 74} h56 v12 q-14 16 -28 4 q-14 12 -28 -4 z`, P.cream, 2) + line(26, top + 74, 26, top + 116, P.cream, 3);
  let aw = `M-14 ${top + 72} L-4 ${top + 50} H56 L66 ${top + 72} `;
  s += path(aw + 'Z', P.red, 3);
  s += path(`M6 ${top + 50} L2 ${top + 72} M26 ${top + 50} v22 M46 ${top + 50} l4 22`, 'none', 0, { stroke: P.cream, 'stroke-width': 7 });
  s += path(aw, 'none', 3);
  s += path(`M-14 ${top + 72} q10 10 20 0 q10 10 20 0 q10 10 20 0 q10 10 20 0`, P.red, 2.5);
  s += path(`M-58 ${bot + 6} v-40 a18 18 0 0 1 36 0 v40 z`, P.blue, 3);
  return g(s, { filter: 'url(#wobbleSoft)' });
}

// ---------- bank plants (quiet, low contrast) ----------
const Q = { stroke: INK, 'stroke-opacity': 0.42, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
function reeds(x: number, y: number, n: number, seed: number, s = 1) {
  const R = rng(seed);
  let out = '';
  for (let i = 0; i < n; i++) {
    const dx = (R() - 0.5) * 50 * s, h = (70 + R() * 70) * s, bend = (R() - 0.5) * 30 * s;
    out += path(`M${x + dx} ${y} q${bend} ${-h / 2} ${bend * 1.4} ${-h}`, 'none', 0, { ...Q, 'stroke-width': 2.4 });
    if (R() > 0.4) out += ell(x + dx + bend * 1.4, y - h - 4, 6 * s, 16 * s, '#A98B6C', 0, { ...Q, 'stroke-width': 2, transform: `rotate(${bend / 3} ${x + dx + bend * 1.4} ${y - h - 4})` });
    out += path(`M${x + dx} ${y} q${-bend - 16} ${-h * 0.4} ${-bend - 30} ${-h * 0.6} q${bend + 22} ${h * 0.25} ${bend + 30} ${h * 0.6}`, '#AEBB8C', 0, { ...Q, 'stroke-width': 2 });
  }
  return out;
}
function fern(x: number, y: number, len: number, rot: number) {
  let out = path(`M0 0 Q${len * 0.1} ${-len * 0.5} 0 ${-len}`, 'none', 0, { ...Q, 'stroke-width': 2.4 });
  for (let t = 0.12; t < 0.95; t += 0.11) {
    const yy = -len * t, ww = (1 - t) * 26 + 6;
    out += E('ellipse', { cx: ww / 2 + 2, cy: yy, rx: ww / 2, ry: 5, fill: '#A9BD8E', ...Q, 'stroke-width': 1.6, transform: `rotate(-25 0 ${r1(yy)})` });
    out += E('ellipse', { cx: -ww / 2 - 2, cy: yy - 4, rx: ww / 2, ry: 5, fill: '#B5C79A', ...Q, 'stroke-width': 1.6, transform: `rotate(25 0 ${r1(yy - 4)})` });
  }
  return g(out, { transform: `translate(${x} ${y}) rotate(${rot})` });
}
function wildflower(x: number, y: number, color: string, s = 1) {
  let out = path(`M${x} ${y} q-4 ${-20 * s} 2 ${-34 * s}`, 'none', 0, { ...Q, 'stroke-width': 2 });
  for (let i = 0; i < 5; i++) {
    const a = (i * 2 * Math.PI) / 5;
    out += circ(x + 2 + Math.cos(a) * 6 * s, y - 36 * s + Math.sin(a) * 6 * s, 5 * s, color, 0, { ...Q, 'stroke-width': 1.5 });
  }
  out += circ(x + 2, y - 36 * s, 3 * s, '#E9CF8E', 0);
  return out;
}
function tuft(x: number, y: number, s = 1) {
  return path(`M${x - 8 * s} ${y} q2 ${-12 * s} -4 ${-20 * s} M${x} ${y} q0 ${-16 * s} 2 ${-26 * s} M${x + 8 * s} ${y} q2 ${-10 * s} 8 ${-18 * s}`, 'none', 0, { ...Q, stroke: '#8E9F72', 'stroke-opacity': 0.8, 'stroke-width': 2.4 });
}
function stone(x: number, y: number, r: number) {
  return ell(x, y, r, r * 0.7, '#D2CAB4', 0, { ...Q, 'stroke-width': 2.2 }) + path(`M${x - r * 0.5} ${y - r * 0.25} q${r * 0.3} ${-r * 0.3} ${r * 0.6} ${-r * 0.2}`, 'none', 0, { stroke: '#EEE8D8', 'stroke-width': 3, 'stroke-linecap': 'round' });
}
function mailbox(x: number, y: number) {
  return rr(x - 3, y - 50, 6, 50, 2, '#B79B7C', 0, { ...Q, 'stroke-width': 2 }) + rr(x - 16, y - 74, 32, 26, 10, '#D99A80', 0, { ...Q, 'stroke-width': 2 }) + line(x + 16, y - 70, x + 16, y - 86, '#C7826A', 2.5) + rr(x + 16, y - 88, 10, 7, 1, '#C7826A', 0);
}

/** River edge x (concept units) at height y; periodic in the tile height so tiles stack seamlessly. */
export function riverEdge(side: 'L' | 'R', y: number, tileH: number) {
  const base = side === 'L' ? 180 : 900;
  const k = (2 * Math.PI) / tileH;
  return base + Math.sin(y * k * 3 + (side === 'L' ? 0 : 2)) * 12 + Math.sin(y * k * 7) * 5;
}

/** One seamless vertical tile of banks, roads and river (concept units, 1080 wide). */
export function riverTile(tileH: number) {
  const W = 1080;
  let s = '';
  s += rr(0, 0, W, tileH, 0, P.bank, 0);
  s += rr(-40, -10, 188, tileH + 20, 0, P.road, 0) + rr(932, -10, 188, tileH + 20, 0, P.road, 0);
  const R = rng(5);
  for (let i = 0; i < 80; i++) {
    const x = R() < 0.5 ? 4 + R() * 136 : 940 + R() * 136;
    s += circ(x, 10 + R() * (tileH - 20), 2 + R() * 3, P.roadDeep, 0, { opacity: 0.8 });
  }
  // river body
  const pts = (side: 'L' | 'R') => {
    const out: [number, number][] = [];
    for (let y = 0; y <= tileH; y += 24) out.push([riverEdge(side, y, tileH), y]);
    return out;
  };
  const L = pts('L'), Rt = pts('R');
  const ext = (p: [number, number][]) => [[p[0][0], -4] as [number, number], ...p, [p[p.length - 1][0], tileH + 4] as [number, number]];
  const Le = ext(L), Re = ext(Rt);
  const river = `M${Le[0][0]} ${Le[0][1]} ` + Le.slice(1).map(([x, y]) => `L${r1(x)} ${y}`).join(' ') + ' ' + Re.slice().reverse().map(([x, y]) => `L${r1(x)} ${y}`).join(' ') + ' Z';
  s += path(river, P.teal, 0);
  // deeper current down the middle (periodic)
  const q = tileH / 4;
  s += path(`M540 -4 C600 ${q * 0.6} 480 ${q * 1.4} 540 ${q * 2} S600 ${q * 3.4} 540 ${tileH + 4}`, 'none', 0, { stroke: P.tealDeep, 'stroke-width': 90, opacity: 0.14 });
  const edgePath = (p: [number, number][]) => `M${p[0][0]} ${p[0][1]} ` + p.slice(1).map(([x, y]) => `L${r1(x)} ${y}`).join(' ');
  s += path(edgePath(Le.map(([x, y]) => [x + 10, y])), 'none', 0, { stroke: P.tealLight, 'stroke-width': 12, opacity: 0.8, 'stroke-linejoin': 'round' });
  s += path(edgePath(Re.map(([x, y]) => [x - 10, y])), 'none', 0, { stroke: P.tealLight, 'stroke-width': 12, opacity: 0.8, 'stroke-linejoin': 'round' });
  s += path(edgePath(Le), 'none', 0, { stroke: INK, 'stroke-width': 3, opacity: 0.55, 'stroke-linejoin': 'round' });
  s += path(edgePath(Re), 'none', 0, { stroke: INK, 'stroke-width': 3, opacity: 0.55, 'stroke-linejoin': 'round' });
  // flow curls (kept away from the seams)
  const R2 = rng(12);
  for (let i = 0; i < 40; i++) {
    const x = 240 + R2() * 600, y = 30 + R2() * (tileH - 60);
    s += R2() < 0.7 ? curl(x, y, 0.6 + R2() * 0.5, P.tealDeep, 0.4) : spiral(x, y, 0.8, P.white, 0.5);
  }
  // bank plants and stones
  let plants = '';
  const step = tileH / 12;
  for (let i = 0; i < 12; i++) {
    const y = i * step + 40;
    plants += reeds(168, y + 60, 3, 100 + i, 0.7) + reeds(912, y + 110, 3, 200 + i, 0.7);
    plants += stone(172 + (i % 3) * 4, y + 100, 11) + stone(908, y + 40, 10);
    plants += tuft(160, y + 130) + tuft(922, y + 80);
  }
  const fl: [number, number, string][] = [[160, 0.26, '#F2C9C0'], [162, 0.62, '#F4E2B0'], [918, 0.45, '#F2C9C0'], [914, 0.86, '#EDE6D6'], [166, 0.9, '#F4E2B0'], [916, 0.12, '#EDE6D6']];
  for (const [x, t, c] of fl) plants += wildflower(x, t * tileH, c, 1.1) + wildflower(x + 10, t * tileH + 16, c, 0.8);
  plants += fern(158, tileH * 0.4, 84, 20) + fern(922, tileH * 0.55, 80, -20) + fern(160, tileH * 0.75, 76, 26) + fern(920, tileH * 0.95 - 20, 84, -24);
  plants += mailbox(156, tileH * 0.34) + mailbox(924, tileH * 0.7);
  s += g(plants, { filter: 'url(#wobbleSoft)', opacity: 0.95 });
  // road center dashes: period 48 divides the tile height
  for (const x of [54, 1026]) s += line(x, -14, x, tileH + 14, P.roadDeep, 4, { 'stroke-dasharray': '28 20', opacity: 0.9 });
  s += overlays(0, 0, W, tileH);
  return s;
}

// ---------- HQ (总部) ----------
const WALL = '#EEDFC0', WALL2 = '#E4D2AE';

function wallpaper(y0: number, y1: number) {
  let s = rr(0, y0, 1080, y1 - y0, 0, WALL, 0);
  for (let y = y0 + 40, row = 0; y < y1 - 30; y += 90, row++) {
    for (let x = row % 2 ? 60 : 15; x < 1080; x += 90) {
      s += g(path('M0 0 Q10 -12 24 0 Q10 12 0 0 Z', WALL2, 0) + line(3, 0, 20, 0, '#D6C29A', 1.5), { transform: `translate(${x} ${y}) rotate(-30)` });
      s += circ(x + 45, y + 45, 3, WALL2, 0);
    }
  }
  return s;
}

function shelves(x0: number, y0: number) {
  let s = rr(x0, y0, 300, 380, 10, P.wood, 3);
  const cw = 70, ch = 86;
  const R = rng(3);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    const x = x0 + 12 + c * (cw + 2), y = y0 + 14 + r * (ch + 6);
    s += rr(x, y, cw, ch, 4, '#8E6845', 2.5);
    const k = R();
    if (k < 0.35) s += g(box(0, R() < 0.4 ? 'urgent' : 'label'), { transform: `translate(${x + cw / 2} ${y + ch - 6}) scale(1.1)` });
    else if (k < 0.7) {
      for (let i = 0; i < 3; i++) s += rr(x + 10 + i * 6, y + 30 - i * 4, 44, 52, 3, i === 1 ? '#F3E6CC' : P.cream, 2, { transform: `rotate(${(i - 1) * 4} ${x + 32} ${y + 56})` });
    } else if (k < 0.85) s += rr(x + 12, y + 46, 46, 36, 6, P.blueLight, 2.5) + line(x + 12, y + 56, x + 58, y + 56, INK, 2);
  }
  return g(s, { filter: 'url(#wobbleSoft)' });
}

function clock(cx: number, cy: number, r: number) {
  let s = circ(cx, cy, r + 10, P.wood, 3) + circ(cx, cy, r, P.cream, 3);
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    s += line(cx + Math.cos(a) * (r - 10), cy + Math.sin(a) * (r - 10), cx + Math.cos(a) * (r - (i % 3 ? 16 : 22)), cy + Math.sin(a) * (r - (i % 3 ? 16 : 22)), INK, i % 3 ? 2 : 3.5);
  }
  s += line(cx, cy, cx, cy + r * 0.62, INK, 5) + line(cx, cy, cx + r * 0.22, cy - r * 0.4, INK, 6) + circ(cx, cy, 6, P.orange, 2);
  s += frogBadge(cx, cy - r * 0.42, 0.7);
  return g(s, { filter: 'url(#wobbleSoft)' });
}

function windowView(x: number, y: number, w: number, h: number) {
  let s = rr(x - 14, y - 14, w + 28, h + 28, 14, P.wood, 3);
  s += E('clipPath', { id: 'win' }, E('rect', { x, y, width: w, height: h, rx: 8 }));
  let v = rr(x, y, w, h, 0, '#F4C9A0', 0) + rr(x, y + h * 0.55, w, h * 0.45, 0, '#E9A48A', 0, { opacity: 0.5 });
  v += circ(x + w * 0.66, y + h * 0.58, 44, '#F7DE9B', 0, { opacity: 0.95 });
  v += path(`M${x} ${y + h * 0.66} q${w * 0.25} -30 ${w * 0.5} -6 t${w * 0.5} -10 V${y + h} H${x} z`, '#A9B98A', 2.5);
  v += path(`M${x} ${y + h * 0.82} q${w * 0.3} -16 ${w * 0.6} 0 t${w * 0.5} 0 V${y + h} H${x} z`, P.teal, 2.5);
  v += curl(x + 40, y + h * 0.9, 0.7, P.white, 0.8) + curl(x + 170, y + h * 0.94, 0.7, P.white, 0.8);
  v += g(rr(-26, -14, 52, 26, 7, P.blue, 2) + circ(-14, 13, 5, '#5B4A3D', 1.5) + circ(14, 13, 5, '#5B4A3D', 1.5), { transform: `translate(${x + 90} ${y + h * 0.7}) scale(0.8)` });
  s += g(v, { 'clip-path': 'url(#win)' });
  s += rr(x, y, w, h, 8, 'none', 3) + line(x + w / 2, y, x + w / 2, y + h, P.wood, 10) + line(x, y + h / 2, x + w, y + h / 2, P.wood, 10);
  s += path(`M${x - 20} ${y - 22} h70 q-20 ${h * 0.4} 6 ${h * 0.62} q-40 10 -76 0 z`, P.red, 3, { opacity: 0.95 });
  s += path(`M${x + w + 20} ${y - 22} h-70 q20 ${h * 0.4} -6 ${h * 0.62} q40 10 76 0 z`, P.red, 3, { opacity: 0.95 });
  for (const cx of [x + 2, x + w - 2]) for (let i = 0; i < 4; i++) s += circ(cx + (cx < x + w / 2 ? 8 : -8), y + 10 + i * 46, 4, P.cream, 0);
  s += rr(x - 30, y - 30, w + 60, 12, 6, P.woodDeep, 3);
  return g(s, { filter: 'url(#wobbleSoft)' });
}

/** HQ room behind the counter. Content sits in the bottom 800 units; wallpaper fills above. */
export function hqRoom(totalH: number) {
  const top = totalH - 800;
  let s = wallpaper(0, totalH - 240);
  s += rr(0, totalH - 240, 1080, 240, 0, P.woodLight, 0) + line(0, totalH - 240, 1080, totalH - 240, INK, 3, { opacity: 0.6 });
  for (let x = 30; x < 1080; x += 120) s += rr(x, totalH - 210, 96, 170, 10, 'none', 0, { stroke: P.woodDeep, 'stroke-width': 2.5, opacity: 0.45 });
  s += g(rr(290, top + 34, 500, 86, 14, P.wood, 3) + rr(302, top + 46, 476, 62, 8, 'none', 0, { stroke: P.woodDeep, 'stroke-width': 2, opacity: 0.6 }) + line(330, 0, 330, top + 34, INK, 3) + line(750, 0, 750, top + 34, INK, 3), { filter: 'url(#wobbleSoft)' });
  s += shelves(30, top + 160);
  s += clock(468, top + 260, 62);
  s += windowView(760, top + 200, 250, 280);
  s += ell(560, top + 600, 300, 200, '#FFE6A8', 0, { opacity: 0.35, filter: 'url(#soft)' });
  s += line(560, top + 120, 560, top + 330, INK, 3) + path(`M512 ${top + 380} q48 -76 96 0 z`, P.blue, 3) + ell(560, top + 380, 48, 10, '#FFE9A6', 2.5);
  s += overlays(0, 0, 1080, totalH);
  return s;
}

/** Counter top that hides the owl's lower body; origin at its top-left. */
export function hqCounter() {
  let s = rr(-20, 0, 1120, 34, 8, P.woodLight, 3);
  s += rr(-20, 34, 1120, 200, 0, P.wood, 3);
  for (let x = 40; x < 1080; x += 170) s += rr(x, 58, 140, 150, 10, 'none', 0, { stroke: P.woodDeep, 'stroke-width': 2.5, opacity: 0.6 });
  s += rr(900, -32, 90, 34, 6, '#5B4A3D', 3) + rr(908, -36, 74, 10, 4, P.red, 2);
  s += rr(380, -48, 64, 50, 10, P.orange, 3) + leafBit(412, -50, -80, 2, P.lily) + leafBit(408, -48, -130, 1.6, P.lilyLight) + leafBit(412, -48, -40, 1.7, P.lilyLight);
  for (let i = 0; i < 4; i++) s += rr(286 + i * 3, -22 - i * 7, 76, 18, 3, i % 2 ? P.cream : '#F3E6CC', 2);
  return g(s, { filter: 'url(#wobbleSoft)' });
}
