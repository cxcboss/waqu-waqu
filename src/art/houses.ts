// Placeholder houses for the residents to live in (see HOUSE_DEFS in game/cast.ts). Each sits on
// the standard raft with its front door exactly where the game opens it. Concept units, origin
// at the raft center. The teapot, boot and can are in shapes.ts.
import { HOUSE, type HouseDef } from '../game/cast';
import { INK, P, S, circ, ell, g, line, path, r1, rr, tube } from './svg';
import { leafBit, raft } from './shapes';

/** The door as an arch, in the house's door color. */
export function doorArch(d: HouseDef['door'], fill: string, sw = 3) {
  const x0 = d.x - d.w / 2, r = d.w / 2;
  return path(`M${r1(x0)} ${r1(d.y)} V${r1(d.y - d.h + r)} A${r1(r)} ${r1(r)} 0 0 1 ${r1(x0 + d.w)} ${r1(d.y - d.h + r)} V${r1(d.y)} Z`, fill, sw);
}

function door(h: HouseDef) {
  const d = h.door;
  return doorArch(d, h.doorColor) + circ(d.x + (d.x < 0 ? 1 : -1) * d.w * 0.28, d.y - d.h * 0.42, 3.5, P.gold, 1.5) + path(`M${d.x - d.w / 2 - 6} ${d.y} h${d.w + 12}`, 'none', 0, S(3));
}

const win = (x: number, y: number, r: number, frame: string = P.cream) => circ(x, y, r + 4, frame, 3) + circ(x, y, r, P.tealLight, 2) + path(`M${x} ${y - r} v${r * 2} M${x - r} ${y} h${r * 2}`, 'none', 0, S(2));
const pot = (x: number, y: number) => rr(x - 12, y - 18, 24, 20, 5, P.orange, 2.5) + leafBit(x - 6, y - 20, -70, 1, P.lily) + leafBit(x + 6, y - 22, -110, 1, P.lily);

const BODY: Record<string, (h: HouseDef) => string> = {
  pumpkin: () => {
    let s = ell(0, -84, 116, 84, '#E9824E', 3);
    s += path('M-60 -160 Q-86 -84 -60 -6 M0 -168 V-2 M60 -160 Q86 -84 60 -6', 'none', 0, S(2.5, { stroke: P.orangeDeep }));
    s += tube('M6 -166 q-4 -26 14 -36', P.lilyDeep, 10) + leafBit(20, -186, -20, 2.4, P.lily) + path('M-8 -170 q-20 -20 -4 -34 q10 10 -6 18', 'none', 0, S(2.5, { stroke: P.lilyDeep }));
    return s + win(58, -100, 18, P.mustard);
  },
  mushroom: () => {
    let s = path('M-56 -2 V-110 Q0 -124 56 -110 V-2 Z', P.cream, 3);
    s += path('M-136 -112 C-130 -220 130 -220 136 -112 Q0 -88 -136 -112 Z', P.red, 3);
    for (const [x, y, r] of [[-84, -146, 14], [-20, -186, 18], [50, -160, 15], [100, -128, 10], [-110, -122, 8], [20, -132, 9]]) s += ell(x, y, r, r * 0.8, P.white, 2);
    return s + win(-26, -66, 14, P.woodLight);
  },
  stump: () => {
    let s = path('M-104 -2 Q-120 -6 -132 6 Q-114 0 -96 -14 L-96 -150 H96 V-14 Q114 0 132 6 Q120 -6 104 -2 Z', '#A9764B', 3);
    s += ell(0, -150, 96, 26, '#D9B48A', 3) + ell(0, -150, 66, 17, 'none', 2, { stroke: P.woodDeep }) + ell(0, -150, 34, 9, 'none', 2, { stroke: P.woodDeep });
    s += path('M-70 -120 v50 M40 -130 v70 M76 -90 v60', 'none', 0, S(2, { stroke: '#7A5636', opacity: 0.7 }));
    s += path('M-96 -70 q20 -14 30 0 q10 -10 20 2 v12 h-50 z', P.lily, 2) + tube('M30 -158 q-2 -30 10 -48', P.wood, 4) + leafBit(40, -206, -40, 1.6, P.lily) + leafBit(38, -192, 200, 1.4, P.lilyLight);
    return s + win(-56, -104, 14, P.woodLight);
  },
  acorn: () => {
    let s = path('M-92 -112 C-100 -40 -50 -2 0 -2 C50 -2 100 -40 92 -112 Z', '#D9B48A', 3);
    s += path('M-108 -112 C-110 -200 110 -200 108 -112 Q0 -96 -108 -112 Z', '#8C6644', 3);
    for (let i = 0; i < 4; i++) s += path(`M${-96 + i * 6} ${-130 - i * 16} Q0 ${-118 - i * 18} ${96 - i * 6} ${-130 - i * 16}`, 'none', 0, S(2, { stroke: '#6B4B30', opacity: 0.7 }));
    s += tube('M0 -184 q4 -18 16 -24', '#6B4B30', 9);
    return s + win(-44, -64, 14, P.wood);
  },
  barrel: () => {
    let s = path('M-90 -2 Q-110 -84 -90 -168 H90 Q110 -84 90 -2 Z', '#C19468', 3);
    s += ell(0, -168, 90, 20, '#D9B48A', 3);
    s += path('M-98 -40 Q0 -28 98 -40 M-104 -100 Q0 -88 104 -100 M-96 -150 Q0 -140 96 -150', 'none', 0, { stroke: '#56606A', 'stroke-width': 8 });
    s += path('M-50 -150 V-10 M50 -150 V-10', 'none', 0, S(2, { stroke: P.woodDeep, opacity: 0.6 }));
    s += rr(40, -220, 18, 50, 3, P.silver, 2.5) + ell(49, -222, 13, 5, P.silver, 2.5);
    return s + win(-50, -120, 14, P.woodLight) + pot(96, 10);
  },
  milk: () => {
    let s = path('M-84 -2 V-250 H84 V-2 Z', P.white, 3);
    s += path('M-84 -250 L-60 -316 H60 L84 -250 Z', '#E8E5DC', 3) + rr(-64, -330, 128, 16, 3, P.white, 2.5);
    s += path('M-84 -150 Q0 -120 84 -150 V-110 Q0 -84 -84 -110 Z', P.blueLight, 2.5);
    s += ell(-40, -200, 22, 14, '#4A3B30', 0, { opacity: 0.85 }) + ell(46, -212, 14, 10, '#4A3B30', 0, { opacity: 0.85 }) + ell(56, -70, 16, 11, '#4A3B30', 0, { opacity: 0.85 });
    return s + rr(-62, -100, 40, 36, 6, P.tealLight, 3) + line(-42, -100, -42, -64, INK, 2);
  },
  shell: () => {
    let s = path('M-120 -2 C-140 -100 -60 -190 40 -170 C110 -156 130 -90 100 -40 C84 -10 40 -2 0 -2 Z', '#F2C9B8', 3);
    s += path('M40 -170 C70 -200 110 -210 130 -196 C116 -180 100 -170 90 -150', '#F2C9B8', 3);
    s += path('M-100 -60 Q-40 -140 60 -120 M-110 -24 Q-30 -100 90 -70 M-60 -150 Q10 -120 96 -36', 'none', 0, S(2.5, { stroke: '#C98E80' }));
    return s + win(56, -96, 13, P.white);
  },
  strawberry: () => {
    let s = path('M0 -2 C-80 -10 -126 -80 -110 -140 C-96 -186 -40 -190 0 -172 C40 -190 96 -186 110 -140 C126 -80 80 -10 0 -2 Z', P.red, 3);
    for (let i = 0; i < 16; i++) {
      const x = -84 + (i % 5) * 42 + (Math.floor(i / 5) % 2) * 20, y = -150 + Math.floor(i / 5) * 34;
      if (Math.abs(x) < 100 - (y + 150) * 0.2) s += ell(x, y, 3, 5, P.gold, 1.4);
    }
    for (const a of [-60, -30, 0, 30, 60]) s += g(path('M0 0 Q-14 -10 0 -46 Q14 -10 0 0 Z', P.lily, 2.5), { transform: `translate(0 -172) rotate(${a})` });
    return s + tube('M0 -200 q6 -20 18 -22', P.lilyDeep, 8) + win(-50, -110, 14, P.cream);
  },
  lantern: () => {
    let s = ell(0, -110, 112, 100, P.red, 3);
    s += path('M-56 -200 Q-90 -110 -56 -20 M0 -210 V-10 M56 -200 Q90 -110 56 -20', 'none', 0, S(2.5, { stroke: '#A93B37' }));
    s += rr(-56, -224, 112, 22, 6, P.gold, 3) + rr(-52, -20, 104, 18, 6, P.gold, 3);
    s += line(0, -224, 0, -250, INK, 3) + circ(0, -254, 6, P.gold, 2);
    return s + win(58, -120, 16, P.gold) + path('M100 -40 q8 30 0 50 M108 -40 q8 30 0 50', 'none', 0, S(3, { stroke: P.gold }));
  },
  beehive: () => {
    let s = path('M-110 -2 C-120 -110 -70 -190 0 -192 C70 -190 120 -110 110 -2 Z', '#E2AE48', 3);
    for (let i = 1; i < 6; i++) {
      const y = -2 - i * 32, w = 110 * Math.sqrt(1 - ((i * 32) / 196) ** 2) + 4;
      s += path(`M${-w} ${y} Q0 ${y + 14} ${w} ${y}`, 'none', 0, S(2.5, { stroke: '#B88A2E' }));
    }
    s += rr(-90, -12, 30, 26, 6, P.gold, 2.5) + path('M-90 -12 q15 -10 30 0', '#F3D27A', 2);
    return s + win(-36, -120, 13, P.woodLight);
  },
  mailbox: () => {
    let s = path('M-74 -2 V-240 C-74 -330 74 -330 74 -240 V-2 Z', '#4F8A4B', 3);
    s += rr(-80, -250, 160, 16, 4, P.gold, 2.5) + rr(-80, -24, 160, 22, 4, '#3F6E3B', 2.5);
    s += rr(-40, -214, 80, 12, 6, '#2E4A2C', 2.5);
    return s + rr(-50, -170, 100, 60, 8, P.tealLight, 3) + line(0, -170, 0, -110, INK, 2) + circ(0, -300, 7, P.gold, 2);
  },
  basket: () => {
    let s = path('M-116 -2 L-106 -130 H106 L116 -2 Z', '#C9A26B', 3);
    for (let i = 1; i < 5; i++) s += path(`M${-116 + i * 2} ${-2 - i * 26} H${116 - i * 2}`, 'none', 0, S(2, { stroke: '#94683F', opacity: 0.7 }));
    for (let i = 1; i < 9; i++) s += line(-106 + i * 23.5, -130, -116 + i * 25.8, -2, '#94683F', 1.6, { opacity: 0.5 });
    s += path('M-122 -130 Q-60 -156 0 -134 Q60 -156 122 -130 L110 -104 Q0 -120 -110 -104 Z', P.white, 3);
    for (let i = 0; i < 6; i++) s += rr(-104 + i * 40, -138, 16, 26, 2, P.red, 0, { opacity: 0.8 });
    return s + tube('M-80 -140 C-70 -250 70 -250 80 -140', '#A9764B', 10) + win(-50, -70, 13, P.woodLight);
  },
  gourd: () => {
    let s = circ(0, -96, 96, '#D8B25A', 3) + circ(0, -232, 64, '#D8B25A', 3);
    s += path('M-44 -178 Q0 -160 44 -178 L40 -194 Q0 -180 -40 -194 Z', P.red, 2.5);
    s += tube('M0 -294 q2 -24 -12 -36', P.woodDeep, 8) + leafBit(0, -300, -30, 2.4, P.lily) + path('M-10 -310 q-24 -6 -20 14 q4 10 12 2', 'none', 0, S(2, { stroke: P.lilyDeep }));
    return s + win(0, -236, 18, P.woodLight) + win(-56, -110, 13, P.woodLight);
  },
  lighthouse: () => {
    let s = path('M-80 -2 L-56 -280 H56 L80 -2 Z', P.white, 3);
    s += path('M-76 -50 L-72 -96 H72 L76 -50 Z M-68 -150 L-64 -196 H64 L68 -150 Z M-60 -240 L-58 -270 H58 L60 -240 Z', P.red, 2.5);
    s += rr(-72, -296, 144, 16, 4, P.blue, 3) + rr(-44, -340, 88, 44, 6, P.gold, 3) + path('M-50 -340 L0 -380 L50 -340 Z', P.red, 3);
    return s + win(-20, -120, 12, P.white);
  },
  clock: () => {
    let s = circ(-74, -212, 28, P.gold, 3) + circ(74, -212, 28, P.gold, 3) + line(0, -220, 0, -238, INK, 4) + circ(0, -242, 7, P.gold, 2);
    s += tube('M-40 -16 L-60 6 M40 -16 L60 6', P.woodDeep, 8);
    s += circ(0, -112, 104, P.mustard, 3) + circ(0, -122, 76, P.cream, 3);
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6;
      s += line(Math.cos(a) * 64, -122 + Math.sin(a) * 64, Math.cos(a) * 70, -122 + Math.sin(a) * 70, INK, 2.5);
    }
    return s + line(0, -122, 0, -170, INK, 4) + line(0, -122, 34, -112, INK, 4) + circ(0, -122, 6, P.red, 2);
  },
  spool: () => {
    let s = ell(0, -10, 112, 26, P.woodLight, 3);
    s += rr(-88, -170, 176, 160, 4, P.blueLight, 3);
    for (let i = 0; i < 9; i++) s += path(`M-88 ${-160 + i * 18} Q0 ${-150 + i * 18} 88 ${-160 + i * 18}`, 'none', 0, S(1.6, { stroke: P.blue, opacity: 0.7 }));
    s += ell(0, -172, 112, 26, P.woodLight, 3) + ell(0, -172, 30, 8, P.woodDeep, 2);
    s += tube('M30 -176 L70 -270', P.silver, 6) + ell(70, -268, 4, 7, 'none', 2);
    return s + circ(-48, -100, 18, P.red, 3) + circ(-54, -104, 3, INK, 0) + circ(-42, -104, 3, INK, 0) + circ(-54, -94, 3, INK, 0) + circ(-42, -94, 3, INK, 0);
  },
  books: () => {
    const book = (y: number, w: number, hh: number, c: string, dx: number) =>
      rr(-w / 2 + dx, y - hh, w, hh, 6, c, 3) + rr(-w / 2 + dx + 8, y - hh + 6, w - 16, hh - 12, 3, P.cream, 0, { opacity: 0.35 }) + line(-w / 2 + dx + 4, y - hh * 0.5, w / 2 + dx - 4, y - hh * 0.5, INK, 1.5, { opacity: 0.4 });
    let s = book(-2, 220, 100, P.lilyDeep, 0) + book(-102, 190, 74, P.orange, -8) + book(-176, 168, 66, P.blue, 10) + book(-242, 140, 52, P.mustard, -4);
    s += path('M-74 -294 Q-4 -330 0 -296 Q4 -330 74 -294 L70 -290 Q0 -306 -70 -290 Z', P.white, 2.5);
    return s + rr(28, -150, 40, 34, 6, P.tealLight, 3) + win(-40, -210, 11, P.cream);
  },
};

/** A house in its placeholder drawing, door and all. */
export function placeholderHouse(id: string) {
  const h = HOUSE[id];
  let s = raft(0, 0, h.rx, h.ry);
  s += BODY[id](h);
  s += door(h);
  return g(s, { filter: 'url(#wobbleSoft)' });
}

export const PLACEHOLDER_HOUSES = Object.keys(BODY);
