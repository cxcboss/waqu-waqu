// Placeholder art for the screens outside work: the home page buildings, the frog's room and its
// furniture, the shop's hamster, hats and scarves, and the gear icons. Same conventions as shapes.ts:
// concept units, origin at the sprite's anchor, swapped for painted PNGs through art/manifest.json.
import { E, INK, P, S, circ, ell, g, line, path, rr, tube } from './svg';

const W = (s: string) => g(s, { filter: 'url(#wobbleSoft)' });
const planks = (x: number, y: number, w: number, h: number, gap: number, color: string = P.woodDeep, op = 0.45) => {
  let d = '';
  for (let yy = y + gap; yy < y + h - 4; yy += gap) d += `M${x + 6} ${yy} L${x + w - 6} ${yy} `;
  return path(d, 'none', 0, { stroke: color, 'stroke-width': 2, opacity: op });
};
const grass = (x: number, y: number, s = 1) =>
  path(`M${x - 14 * s} ${y} q${4 * s} ${-16 * s} ${2 * s} ${-24 * s} q${6 * s} ${10 * s} ${6 * s} ${22 * s} q${4 * s} ${-14 * s} ${10 * s} ${-20 * s} q${0} ${12 * s} ${-2 * s} ${22 * s} z`, P.lily, 2);

// ---------------------------------------------------------------- home page buildings

/** Owl HQ: a wooden post office with an orange roof and the owl's round badge. */
export function hubHq() {
  let s = '';
  s += ell(0, 6, 220, 22, P.bankDeep, 0, { opacity: 0.8 });
  s += rr(-196, -28, 392, 34, 8, P.silver, 3);
  s += rr(-176, -250, 352, 226, 6, P.woodLight, 3);
  s += planks(-176, -250, 352, 226, 28);
  // windows with flower boxes
  for (const x of [-138, 70]) {
    s += rr(x, -206, 68, 62, 6, P.tealLight, 3) + line(x + 34, -206, x + 34, -144, INK, 2.5) + line(x, -175, x + 68, -175, INK, 2.5);
    s += rr(x - 6, -142, 80, 18, 4, P.woodDeep, 2.5);
    for (let i = 0; i < 4; i++) s += circ(x + 6 + i * 19, -146, 7, i % 2 ? P.pink : P.gold, 2);
  }
  // door and its little roof
  s += path('M-44 -28 L-44 -122 Q0 -168 44 -122 L44 -28 Z', P.blue, 3);
  s += path('M-30 -36 L-30 -116 Q0 -146 30 -116 L30 -36 Z', 'none', 0, { stroke: P.blueLight, 'stroke-width': 3, opacity: 0.8 });
  s += circ(28, -76, 5, P.gold, 2);
  s += rr(-84, -230, 168, 40, 8, P.cream, 3);
  // roof
  s += path('M-222 -236 L0 -372 L222 -236 Q0 -226 -222 -236 Z', P.orange, 3.5);
  s += path('M-222 -236 Q0 -226 222 -236 L214 -220 Q0 -210 -214 -220 Z', P.orangeDeep, 3);
  s += path('M-160 -270 L-120 -294 M-90 -312 L-50 -336 M60 -330 L100 -306 M130 -288 L170 -264', 'none', 0, { stroke: P.orangeDeep, 'stroke-width': 3, opacity: 0.7 });
  // the owl badge
  s += circ(0, -286, 38, P.cream, 3.5);
  s += circ(0, -286, 30, 'none', 2, { stroke: P.woodDeep, 'stroke-dasharray': '6 5' });
  s += ell(-12, -292, 9, 10, P.white, 2.5) + ell(12, -292, 9, 10, P.white, 2.5) + circ(-11, -291, 4, INK, 0) + circ(13, -291, 4, INK, 0);
  s += path('M-5 -280 L5 -280 L0 -270 Z', P.gold, 2) + path('M-22 -306 L-14 -318 L-8 -304 M22 -306 L14 -318 L8 -304', P.woodDeep, 2);
  // mailbox
  s += rr(166, -96, 14, 76, 3, P.woodDeep, 2.5);
  s += rr(150, -128, 46, 40, 10, P.red, 3) + rr(156, -114, 34, 6, 3, INK, 0);
  s += grass(-186, -4) + grass(-150, -2, 0.8) + grass(196, -4, 0.9);
  return W(s);
}

/** The hamster's shop window: striped awning, a counter, jars and boxes on the shelves. */
export function hubShop() {
  let s = '';
  s += ell(0, 6, 170, 18, P.bankDeep, 0, { opacity: 0.8 });
  s += rr(-150, -200, 300, 196, 8, P.cream, 3);
  s += rr(-120, -184, 240, 86, 6, '#7A5E48', 3);
  s += line(-114, -142, 114, -142, P.woodLight, 4);
  for (let i = 0; i < 6; i++) s += rr(-106 + i * 38, -176, 24, 30, 6, [P.gold, P.tealLight, P.pink, P.lilyLight, P.orange, P.blueLight][i], 2);
  for (let i = 0; i < 5; i++) s += rr(-100 + i * 44, -136, 30, 32, 4, P.kraft, 2) + line(-100 + i * 44, -122, -70 + i * 44, -122, P.woodDeep, 1.5);
  // counter
  s += rr(-162, -100, 324, 100, 8, P.wood, 3);
  s += planks(-162, -100, 324, 100, 25);
  s += rr(-170, -110, 340, 20, 6, P.woodLight, 3);
  for (const [x, c] of [[-120, P.gold], [-70, P.pink], [96, P.lilyLight]] as const) s += ell(x, -122, 16, 12, c, 2.5) + rr(x - 8, -142, 16, 12, 3, P.cream, 2);
  // awning
  let st = '';
  for (let i = 0; i < 8; i++) {
    const x0 = -172 + i * 43;
    st += path(`M${x0} -262 L${x0 + 43} -262 L${x0 + 43} -214 Q${x0 + 21.5} -196 ${x0} -214 Z`, i % 2 ? P.cream : P.orange, 3);
  }
  s += st;
  s += rr(-178, -272, 356, 16, 6, P.orangeDeep, 3);
  // sign board with the hamster's face
  s += rr(-110, -334, 220, 62, 10, P.woodLight, 3) + rr(-100, -324, 200, 42, 6, 'none', 2, { stroke: P.woodDeep, 'stroke-dasharray': '6 5' });
  s += grass(-160, -2) + grass(166, -2, 0.85);
  return W(s);
}

/** The frog's own cottage: round walls under a big lily-pad roof, a round door, a mailbox. */
export function hubHome() {
  let s = '';
  s += ell(0, 6, 180, 20, P.bankDeep, 0, { opacity: 0.8 });
  s += rr(-132, -196, 264, 196, 46, '#F2E2BE', 3);
  s += path('M-120 -60 Q0 -40 120 -60', 'none', 0, { stroke: P.kraft, 'stroke-width': 3, opacity: 0.6 });
  for (const [x, y] of [[-96, -150], [-70, -96], [96, -70]]) s += ell(x, y, 12, 7, P.kraftTop, 2, { opacity: 0.8 });
  // round door
  s += circ(-34, -64, 58, P.woodDeep, 3);
  s += path('M-86 -2 L-86 -64 A52 52 0 0 1 18 -64 L18 -2 Z', P.orange, 3);
  s += path('M-34 -112 L-34 -4 M-80 -64 L12 -64', 'none', 0, { stroke: P.orangeDeep, 'stroke-width': 2.5, opacity: 0.7 });
  s += circ(4, -52, 6, P.gold, 2);
  // round window
  s += circ(76, -124, 32, P.woodLight, 3) + circ(76, -124, 22, P.tealLight, 2.5) + line(76, -146, 76, -102, INK, 2) + line(54, -124, 98, -124, INK, 2);
  // lily-pad roof
  s += ell(0, -186, 176, 66, P.lilyDeep, 3);
  s += path('M0 -200 L40 -262 A170 62 0 1 1 -10 -264 Z', P.lily, 3);
  s += path('M0 -200 Q-60 -220 -140 -210 M0 -200 Q-50 -250 -90 -252 M0 -200 Q70 -230 150 -214 M0 -200 Q60 -246 110 -250', 'none', 0, { stroke: P.lilyDeep, 'stroke-width': 2.4, opacity: 0.7 });
  s += path('M-120 -232 Q-60 -258 -20 -260', 'none', 0, { stroke: P.lilyLight, 'stroke-width': 6, opacity: 0.9, 'stroke-linecap': 'round' });
  // chimney with a flower
  s += rr(100, -296, 30, 56, 6, P.woodLight, 3) + rr(94, -304, 42, 14, 5, P.woodDeep, 2.5);
  s += circ(-110, -250, 14, P.pink, 2.5) + circ(-110, -250, 6, P.gold, 1.5);
  // mailbox on a post, the frog's 信箱
  s += rr(150, -84, 12, 84, 3, P.woodDeep, 2.5);
  s += rr(130, -118, 52, 38, 12, P.blue, 3) + path('M140 -100 L172 -100', 'none', 0, { stroke: P.cream, 'stroke-width': 4 }) + rr(176, -134, 6, 22, 2, P.red, 1.8);
  s += grass(-150, -2) + grass(110, -2, 0.8) + grass(-110, 2, 0.7);
  return W(s);
}

// ---------------------------------------------------------------- the shop

/** 仓鼠店长: round, cheeks always full, a blue apron. Origin at the feet. */
export function hamster() {
  let s = '';
  s += ell(0, 0, 70, 12, INK, 0, { opacity: 0.18 });
  s += ell(-46, -150, 22, 22, '#E2B07A', 3) + ell(46, -150, 22, 22, '#E2B07A', 3) + ell(-46, -150, 11, 11, P.pink, 0) + ell(46, -150, 11, 11, P.pink, 0);
  s += ell(0, -78, 72, 78, '#E2B07A', 3);
  s += ell(0, -60, 46, 52, P.cream, 2.5);
  // apron
  s += path('M-44 -66 Q0 -76 44 -66 L40 -8 Q0 4 -40 -8 Z', P.blue, 3) + rr(-16, -48, 32, 22, 5, P.blueLight, 2) + tube('M-40 -66 Q-30 -110 0 -112 Q30 -110 40 -66', P.blue, 5);
  // full cheeks
  s += ell(-48, -104, 26, 22, '#F0C894', 2.5) + ell(48, -104, 26, 22, '#F0C894', 2.5);
  s += circ(-24, -124, 7, INK, 0) + circ(24, -124, 7, INK, 0) + circ(-22, -126, 2.4, P.white, 0) + circ(26, -126, 2.4, P.white, 0);
  s += ell(0, -110, 7, 5, P.pink, 2) + path('M-8 -100 q8 8 16 0', 'none', 0, S(2.5));
  s += path('M-12 -96 L-12 -88 L-4 -88 L-4 -96 M4 -96 L4 -88 L12 -88 L12 -96', P.white, 1.8);
  // paws on the apron, feet
  s += ell(-30, -40, 12, 10, '#F0C894', 2.5) + ell(30, -40, 12, 10, '#F0C894', 2.5);
  s += ell(-26, -2, 18, 9, '#F0C894', 2.5) + ell(26, -2, 18, 9, '#F0C894', 2.5);
  return W(s);
}

// ---------------------------------------------------------------- the frog's room

export function bed() {
  let s = '';
  s += ell(0, 4, 172, 14, INK, 0, { opacity: 0.16 });
  s += rr(-170, -200, 40, 204, 12, P.wood, 3) + circ(-150, -206, 16, P.woodLight, 3);
  s += rr(130, -120, 34, 124, 10, P.wood, 3) + circ(147, -126, 13, P.woodLight, 3);
  s += rr(-140, -86, 278, 70, 12, P.woodLight, 3);
  s += rr(-134, -118, 268, 44, 18, P.cream, 3);
  // quilt with lily pads
  s += path('M-70 -124 Q40 -136 134 -116 L134 -62 Q30 -50 -70 -62 Z', P.lilyLight, 3);
  for (const [x, y] of [[-20, -96], [40, -104], [96, -88]]) s += ell(x, y, 16, 10, P.lily, 2);
  s += ell(-108, -126, 34, 18, P.white, 3);
  return W(s);
}

export function wardrobe() {
  let s = '';
  s += ell(0, 4, 116, 12, INK, 0, { opacity: 0.16 });
  s += rr(-104, -360, 208, 360, 12, P.wood, 3);
  s += path('M-114 -362 Q0 -404 114 -362 L114 -348 L-114 -348 Z', P.woodDeep, 3);
  s += rr(-90, -336, 86, 300, 8, P.woodLight, 3) + rr(4, -336, 86, 300, 8, P.woodLight, 3);
  s += rr(-76, -320, 58, 120, 6, 'none', 2, { stroke: P.woodDeep, opacity: 0.6 }) + rr(18, -320, 58, 120, 6, 'none', 2, { stroke: P.woodDeep, opacity: 0.6 });
  s += circ(-14, -190, 7, P.gold, 2) + circ(14, -190, 7, P.gold, 2);
  s += rr(-94, -26, 26, 26, 4, P.woodDeep, 2.5) + rr(68, -26, 26, 26, 4, P.woodDeep, 2.5);
  // a spare cap on top
  s += path('M-30 -382 q2 -30 26 -30 q24 0 26 30 z', P.orange, 3) + path('M-34 -382 q34 8 62 -2 q-30 -6 -62 2 z', P.orangeDeep, 2.5);
  return W(s);
}

/** Desk with the work diary and a tray of letters (the frog's mailbox at home). */
export function desk() {
  let s = '';
  s += ell(0, 4, 156, 12, INK, 0, { opacity: 0.16 });
  s += rr(-140, -150, 22, 152, 6, P.woodDeep, 3) + rr(118, -150, 22, 152, 6, P.woodDeep, 3);
  s += rr(-60, -146, 120, 64, 6, P.wood, 3) + circ(0, -114, 6, P.gold, 2);
  s += rr(-156, -170, 312, 28, 8, P.woodLight, 3);
  // diary
  s += path('M-120 -170 L-110 -206 L-30 -206 L-40 -170 Z', P.orange, 3) + path('M-104 -196 L-52 -196', 'none', 0, { stroke: P.cream, 'stroke-width': 3 });
  // letter tray
  s += rr(30, -196, 96, 26, 5, P.kraft, 3);
  s += path('M40 -192 L54 -222 L118 -214 L110 -190 Z', P.white, 2.5) + path('M54 -222 L84 -204 L118 -214', 'none', 0, S(2));
  s += circ(84, -206, 6, P.red, 1.8);
  return W(s);
}

export function rug() {
  let s = '';
  s += path('M0 0 L40 -64 A196 66 0 1 1 -10 -66 Z', P.lily, 3);
  s += ell(0, 0, 160, 50, 'none', 0, { stroke: P.lilyLight, 'stroke-width': 4, 'stroke-dasharray': '18 12', opacity: 0.9 });
  s += path('M0 0 Q-80 -10 -150 10 M0 0 Q-40 30 -90 48 M0 0 Q80 20 150 0 M0 0 Q50 40 100 46', 'none', 0, { stroke: P.lilyDeep, 'stroke-width': 2.4, opacity: 0.6 });
  return W(s);
}

export function plant() {
  let s = '';
  for (const [a, c] of [[-38, P.lily], [-12, P.lilyDeep], [18, P.lily], [40, P.lilyLight]] as const) {
    s += E('ellipse', { cx: 0, cy: -70, rx: 22, ry: 64, fill: c, ...S(2.5), transform: `rotate(${a} 0 -20)` });
  }
  s += path('M-46 -60 L46 -60 L36 0 L-36 0 Z', P.orange, 3) + rr(-52, -70, 104, 18, 5, P.orangeDeep, 3);
  return W(s);
}

export function cuckoo() {
  let s = '';
  s += line(0, 40, 0, -10, INK, 2) + line(-14, 40, -14, 0, INK, 2) + circ(0, 44, 7, P.gold, 2) + ell(-14, 40, 5, 8, P.gold, 2);
  s += path('M-58 -86 L0 -142 L58 -86 Z', P.woodDeep, 3);
  s += rr(-48, -92, 96, 96, 8, P.wood, 3);
  s += circ(0, -40, 30, P.cream, 3) + line(0, -40, 0, -62, INK, 3) + line(0, -40, 14, -34, INK, 3);
  s += rr(-10, -112, 20, 16, 3, '#5A4536', 2) + circ(0, -104, 4, P.gold, 0);
  return W(s);
}

/** A string of star lights hung across the photo wall. Origin at the middle of the top edge. */
export function lights() {
  let s = '';
  s += path('M-250 0 Q-125 46 0 20 Q125 46 250 0', 'none', 0, { stroke: INK, 'stroke-width': 2.5 });
  const pts: [number, number][] = [[-210, 14], [-150, 28], [-90, 32], [-30, 24], [30, 24], [90, 32], [150, 28], [210, 14]];
  pts.forEach(([x, y], i) => {
    const r = 13, c = i % 2 ? P.gold : P.pink;
    let d = '';
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI / 2 + (k * Math.PI) / 5, rk = k % 2 ? r * 0.45 : r;
      d += `${k ? 'L' : 'M'}${(x + rk * Math.cos(a)).toFixed(1)} ${(y + 12 + rk * Math.sin(a)).toFixed(1)} `;
    }
    s += line(x, y, x, y + 2, INK, 2) + path(d + 'Z', c, 2);
  });
  return W(s);
}

export function lamp() {
  let s = '';
  s += ell(0, -96, 70, 34, P.gold, 0, { opacity: 0.25 });
  s += rr(-14, -84, 28, 84, 10, P.cream, 3) + ell(0, -2, 34, 8, P.woodDeep, 2.5);
  s += path('M-56 -84 Q-54 -146 0 -148 Q54 -146 56 -84 Q0 -72 -56 -84 Z', P.red, 3);
  for (const [x, y, r] of [[-26, -112, 8], [12, -128, 7], [32, -100, 6], [-4, -96, 5]]) s += circ(x, y, r, P.white, 1.5);
  return W(s);
}

export function fishbowl() {
  let s = '';
  s += ell(0, -2, 40, 8, P.woodDeep, 2.5);
  s += circ(0, -52, 50, P.tealLight, 3, { 'fill-opacity': 0.8 });
  s += path('M-46 -66 Q0 -76 46 -66', 'none', 0, { stroke: P.tealDeep, 'stroke-width': 2.5 });
  s += ell(-30, -92, 12, 4, P.white, 0, { opacity: 0.8 });
  s += ell(6, -40, 16, 10, P.orange, 2.5) + path('M20 -40 L34 -50 L34 -30 Z', P.orange, 2.5) + circ(0, -42, 2.5, INK, 0);
  for (const [x, c] of [[-24, P.cream], [-8, P.silver], [18, P.kraft], [30, P.cream]] as const) s += circ(x, -10, 6, c, 1.5);
  s += rr(-34, -104, 68, 10, 5, P.tealDeep, 2.5);
  return W(s);
}

/** A wall shelf with books and a little trophy. Origin at the bottom middle of the plank. */
export function shelf() {
  let s = '';
  s += rr(-128, -16, 256, 18, 4, P.woodLight, 3) + path('M-100 2 L-100 24 L-80 2 M100 2 L100 24 L80 2', 'none', 0, S(2.5));
  const books: [number, number, string][] = [[-118, 86, P.blue], [-92, 100, P.red], [-66, 78, P.lilyDeep], [-42, 92, P.gold], [-18, 70, P.orange]];
  for (const [x, h, c] of books) s += rr(x, -16 - h, 22, h, 3, c, 2.5) + line(x + 4, -16 - h + 14, x + 18, -16 - h + 14, P.cream, 2);
  s += E('rect', { x: 10, y: -98, width: 80, height: 22, rx: 3, fill: P.tealDeep, ...S(2.5), transform: 'rotate(-24 10 -16)' });
  s += rr(78, -40, 44, 24, 4, P.woodDeep, 2.5) + path('M84 -40 L80 -84 Q100 -100 120 -84 L116 -40 Z', P.gold, 3) + circ(100, -70, 8, P.mustard, 2);
  return W(s);
}

export function recordPlayer() {
  let s = '';
  s += ell(0, 4, 84, 10, INK, 0, { opacity: 0.16 });
  s += rr(-76, -70, 152, 70, 10, P.wood, 3) + rr(-68, -50, 136, 22, 4, P.woodDeep, 2) + circ(-48, -14, 6, P.gold, 2) + circ(-28, -14, 6, P.gold, 2);
  s += ell(-6, -76, 56, 16, '#3A2E26', 3) + ell(-6, -78, 18, 6, P.red, 1.5);
  // brass horn
  s += tube('M44 -80 Q52 -120 30 -140', P.gold, 8);
  s += path('M30 -140 Q-10 -190 -40 -170 Q-20 -130 30 -140 Z', P.mustard, 3) + ell(-26, -168, 18, 12, '#C99434', 2.5);
  return W(s);
}

// ---------------------------------------------------------------- hats and scarves
// Origin: where the courier cap sits on the frog's head. Hats cover the painted cap.

export function hat(kind: string) {
  let s = '';
  if (kind === 'straw') {
    s += ell(0, 0, 80, 18, '#E7C878', 3);
    s += path('M-40 -2 Q-42 -52 0 -54 Q42 -52 40 -2 Q0 8 -40 -2 Z', '#EFD38A', 3);
    s += path('M-40 -14 Q0 -4 40 -14 L40 -2 Q0 8 -40 -2 Z', P.red, 2.5);
    s += path('M-64 0 Q0 14 64 0 M-30 -36 Q0 -42 30 -36', 'none', 0, { stroke: P.kraft, 'stroke-width': 2, opacity: 0.8 });
  } else if (kind === 'flower') {
    s += E('g', { transform: 'translate(22 -22) scale(0.9)' }, flowerPin());
  } else if (kind === 'beanie') {
    s += path('M-46 4 Q-50 -64 0 -66 Q50 -64 46 4 Z', P.blueLight, 3);
    s += rr(-50, -12, 100, 22, 10, P.blue, 3);
    s += path('M-36 -12 L-36 8 M-20 -12 L-20 8 M-4 -12 L-4 8 M12 -12 L12 8 M28 -12 L28 8', 'none', 0, { stroke: P.blueLight, 'stroke-width': 2.5 });
    s += circ(0, -70, 14, P.cream, 3);
  } else if (kind === 'beret') {
    s += E('ellipse', { cx: 6, cy: -24, rx: 58, ry: 26, fill: P.red, ...S(3), transform: 'rotate(-8 6 -24)' });
    s += rr(-36, -12, 72, 18, 9, '#B8443F', 3);
    s += path('M4 -50 q2 -10 8 -12', 'none', 0, S(4));
  } else if (kind === 'top') {
    s += ell(0, 0, 56, 14, '#3A3A48', 3);
    s += rr(-34, -92, 68, 92, 8, '#4A4A5C', 3);
    s += rr(-34, -30, 68, 16, 2, P.red, 2.5);
    s += ell(0, -92, 34, 9, '#5C5C70', 3);
  } else if (kind === 'pilot') {
    s += path('M-48 8 Q-52 -60 0 -60 Q52 -60 48 8 Z', '#9C6B45', 3);
    s += path('M-48 0 Q-60 24 -46 34 Q-34 26 -36 4 Z', '#9C6B45', 3) + path('M48 0 Q60 24 46 34 Q34 26 36 4 Z', '#9C6B45', 3);
    s += path('M0 -60 L0 4', 'none', 0, { stroke: '#7A5236', 'stroke-width': 2.5 });
    s += rr(-44, -30, 88, 8, 4, '#5A4536', 2) + circ(-20, -26, 16, P.tealLight, 3) + circ(20, -26, 16, P.tealLight, 3) + ell(-24, -30, 5, 3, P.white, 0) + ell(16, -30, 5, 3, P.white, 0);
  } else if (kind === 'swim') {
    s += path('M-46 8 Q-50 -56 0 -58 Q50 -56 46 8 Q0 -2 -46 8 Z', P.gold, 3);
    s += path('M-30 -40 Q-14 -50 4 -50', 'none', 0, { stroke: P.white, 'stroke-width': 5, opacity: 0.8, 'stroke-linecap': 'round' });
    s += path('M-40 -10 Q0 -20 40 -10', 'none', 0, { stroke: P.mustard, 'stroke-width': 3 });
  } else if (kind === 'gold') {
    s += path('M-36 2 q2 -50 36 -50 q34 0 36 50 z', P.gold, 3) + path('M-40 2 q46 14 86 -4 q-42 -8 -86 4 z', P.mustard, 3);
    s += rr(-12, -34, 24, 20, 3, P.cream, 2.5) + path('M0 -30 L4 -22 L-4 -22 Z', P.red, 0);
  }
  return W(s);
}

function flowerPin() {
  let s = '';
  for (let i = 0; i < 6; i++) s += E('ellipse', { cx: 0, cy: -14, rx: 8, ry: 16, fill: i % 2 ? P.pink : '#F6CFC4', ...S(2), transform: `rotate(${i * 60})` });
  s += circ(0, 0, 7, P.gold, 2);
  s += E('ellipse', { cx: -20, cy: 14, rx: 16, ry: 7, fill: P.lily, ...S(2), transform: 'rotate(-30 -20 14)' });
  return s;
}

export function neck(kind: string) {
  let s = '';
  if (kind === 'scarf') {
    s += path('M-64 -8 Q0 14 64 -8 L60 12 Q0 34 -60 12 Z', P.red, 3);
    s += path('M30 10 L52 62 L32 66 L18 16 Z', P.red, 3) + path('M34 56 L36 66 M42 54 L45 64 M48 52 L52 61', 'none', 0, S(2));
    s += path('M-50 2 L50 2', 'none', 0, { stroke: P.white, 'stroke-width': 3, 'stroke-dasharray': '8 8', opacity: 0.8 });
  } else if (kind === 'bow') {
    s += path('M0 0 L-36 -20 L-36 20 Z', P.red, 3) + path('M0 0 L36 -20 L36 20 Z', P.red, 3) + rr(-9, -10, 18, 20, 5, '#B8443F', 2.5);
  } else if (kind === 'camera') {
    s += path('M-40 -8 Q-30 30 -16 34 M40 -8 Q30 30 16 34', 'none', 0, { stroke: INK, 'stroke-width': 4 });
    s += rr(-30, 26, 60, 38, 7, '#4A4A5C', 3) + circ(0, 45, 13, P.silver, 3) + circ(0, 45, 6, P.blue, 0) + rr(14, 20, 12, 8, 2, P.silver, 2);
  }
  return W(s);
}

// ---------------------------------------------------------------- gear icons (origin centered)

export function gearIcon(kind: string) {
  let s = '';
  if (kind === 'bag') {
    s += tube('M-34 -30 Q0 -76 34 -30', P.woodDeep, 6);
    s += rr(-50, -32, 100, 78, 14, P.blue, 3);
    s += path('M-50 -18 Q0 -36 50 -18 L50 14 Q0 26 -50 14 Z', P.blueLight, 3);
    s += rr(-10, 6, 20, 18, 4, P.gold, 2.5);
  } else if (kind === 'shoe') {
    s += path('M-54 10 Q-56 -26 -30 -30 L4 -34 Q24 -12 50 -6 Q60 0 56 14 Z', P.cream, 3);
    s += path('M-54 10 L56 14 Q56 24 46 26 L-48 24 Q-56 20 -54 10 Z', P.orange, 3);
    s += path('M-20 -26 L-8 -10 M-8 -30 L4 -14', 'none', 0, S(3));
    s += path('M-24 26 l-6 12 l12 6 l-12 6 l12 6 l-6 4', 'none', 0, { stroke: P.silver, 'stroke-width': 4, 'stroke-linejoin': 'round' });
    s += path('M-24 26 l-6 12 l12 6 l-12 6 l12 6 l-6 4', 'none', 0, { stroke: INK, 'stroke-width': 1.5 });
  } else if (kind === 'fin') {
    s += path('M-10 -50 Q-48 10 -44 50 Q-20 40 -10 56 Q0 40 10 56 Q20 40 44 50 Q48 10 10 -50 Z', P.lily, 3);
    s += path('M0 -40 L0 48 M-16 -20 L-24 40 M16 -20 L24 40', 'none', 0, { stroke: P.lilyDeep, 'stroke-width': 2.5 });
    s += rr(-16, -58, 32, 22, 8, P.lilyDeep, 3);
  }
  return W(s);
}
