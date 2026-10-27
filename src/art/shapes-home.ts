// Placeholder art for the screens outside work: the shop's hamster, hats and scarves, and the gear icons. Same conventions as shapes.ts:
// concept units, origin at the sprite's anchor, swapped for painted PNGs through art/manifest.json.
import { E, INK, P, S, circ, ell, g, path, rr, tube } from './svg';

const W = (s: string) => g(s, { filter: 'url(#wobbleSoft)' });
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
