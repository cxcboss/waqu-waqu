// Placeholder residents: one rig for every species, posed for each frame the game uses
// (see POSES in game/cast.ts). Concept units, origin between the feet, three-quarter view
// facing right; the game mirrors them to face left. Painted art replaces these later.
import type { Pose } from '../game/cast';
import { E, INK, P, S, circ, ell, g, line, path, r1, rr, tube } from './svg';

type Ears = 'round' | 'long' | 'pointy' | 'tuft' | 'floppy' | 'tiny' | 'big' | 'none';
type Muzzle = 'bill' | 'beak' | 'longbeak' | 'pouch' | 'snout' | 'pig' | 'nose' | 'star' | 'teeth' | 'none';
type Tail = 'stub' | 'cotton' | 'fluffy' | 'curl' | 'flat' | 'long' | 'ring' | 'thin' | 'cat' | 'none';
type Arms = 'paw' | 'wing' | 'claw';
type Legs = 'short' | 'long' | 'crab' | 'snail';

interface Look {
  fur: string;
  belly?: string;
  /** Head and limbs when they differ from the body (the sheep's dark face and legs). */
  headColor?: string;
  limb?: string;
  /** Body half width and height; the head's radius and center height (and sideways offset). */
  w: number;
  h: number;
  r: number;
  hy: number;
  hx?: number;
  ears: Ears;
  earIn?: string;
  muzzle: Muzzle;
  muzzleColor?: string;
  tail: Tail;
  tailColor?: string;
  arms: Arms;
  legs: Legs;
  foot?: string;
  /** Long necks (egret, swan) lift the head off the body. */
  neck?: number;
  /** Extra bits: drawn behind everything, over the body, and over the head. */
  back?: (k: Rig) => string;
  front?: (k: Rig) => string;
  hat?: (k: Rig) => string;
  /** Something held in the free hand when it's hanging down (a cane, a bag). */
  carry?: (x: number, y: number) => string;
  sleepy?: boolean;
}

/** Where the parts are for one pose. */
interface Rig {
  look: Look;
  pose: Pose;
  /** Feet off the ground (cheer), body lean and head tilt in degrees. */
  lift: number;
  lean: number;
  tilt: number;
  /** Head center. */
  hx: number;
  hy: number;
  /** Shoulders and hands, far (left) and near (right). */
  sL: [number, number];
  sR: [number, number];
  hL: [number, number];
  hR: [number, number];
  back: boolean;
}

const darken = (hex: string, k = 0.78) => {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.round(v * k).toString(16).padStart(2, '0');
  return `#${c(n >> 16)}${c((n >> 8) & 255)}${c(n & 255)}`;
};

function rig(look: Look, pose: Pose): Rig {
  const { w, h, r } = look;
  const lift = pose === 'cheer' ? 12 : pose === 'wait' ? 4 : 0;
  const lean = pose === 'wait' ? 7 : pose === 'walk' ? 5 : pose === 'sad' ? 4 : pose === 'reach' ? 6 : 0;
  const tilt = pose === 'puzzled' ? 16 : pose === 'sad' ? 12 : pose === 'cheer' ? -6 : 0;
  const hx = (look.hx ?? 0) + (pose === 'back' ? -(look.hx ?? 0) * 0.6 : 0);
  const hy = -look.hy - lift + (pose === 'sad' ? 5 : 0);
  const sy = -h * 0.72 - lift;
  const sL: [number, number] = [-w * 0.78, sy];
  const sR: [number, number] = [w * 0.78, sy];
  const down = (s: [number, number], dir: number, k = 1): [number, number] => [s[0] + dir * 8 * k, s[1] + h * 0.42];
  let hL = down(sL, -1), hR = down(sR, 1);
  const top = look.neck ? -h - lift - 26 : hy - r;
  const bird = !!look.neck;
  switch (pose) {
    case 'wait':
      hR = bird ? [sR[0] + 22, sR[1] - 10] : [hx + r * 0.55, hy - r * 0.45];
      hL = [sL[0] - 6, sL[1] + h * 0.3];
      break;
    case 'wave':
      hR = [sR[0] + 22, top - 6];
      break;
    case 'reach':
      hR = [sR[0] + 30, sy + 6];
      hL = [sR[0] + 18, sy + 12];
      break;
    case 'cheer':
      hL = [sL[0] - 12, top - 4];
      hR = [sR[0] + 12, top - 4];
      break;
    case 'puzzled':
      hR = bird ? [sR[0] + 6, sR[1] - 22] : [hx + r * 0.95, hy - r * 0.35];
      break;
    case 'sad':
      hL = [sL[0] + 2, sL[1] + h * 0.5];
      hR = [sR[0] - 2, sR[1] + h * 0.5];
      break;
    case 'walk':
      hR = [sR[0] + 16, sR[1] + h * 0.34];
      hL = [sL[0] - 14, sL[1] + h * 0.34];
      break;
    case 'back':
      hL = [sL[0] - 10, sL[1] + h * 0.36];
      hR = [sR[0] + 10, sR[1] + h * 0.36];
      break;
  }
  return { look, pose, lift, lean, tilt, hx, hy, sL, sR, hL, hR, back: pose === 'back' };
}

// ---------- parts ----------

function body(k: Rig) {
  const { w, h, fur, belly } = k.look;
  const b = -k.lift;
  let s = path(`M${-w} ${b - 4} C${-w * 1.06} ${b - h * 0.62} ${-w * 0.62} ${b - h} 0 ${b - h} C${w * 0.62} ${b - h} ${w * 1.06} ${b - h * 0.62} ${w} ${b - 4} Q0 ${b + 7} ${-w} ${b - 4} Z`, fur, 3);
  if (belly && !k.back) s += ell(w * 0.16, b - h * 0.4, w * 0.58, h * 0.36, belly, 0);
  return s;
}

function feet(k: Rig) {
  const { w, legs, foot } = k.look;
  const fur = k.look.limb ?? k.look.fur;
  const b = -k.lift;
  const c = foot ?? darken(fur, 0.85);
  const walk = k.pose === 'walk';
  if (legs === 'snail') {
    return path(`M${-w - 16} ${b + 2} Q${-w - 22} ${b - 10} ${-w} ${b - 12} L${w + 10} ${b - 10} Q${w + 30} ${b - 6} ${w + 24} ${b + 2} Z`, k.look.fur, 3);
  }
  if (legs === 'crab') {
    let s = '';
    for (let i = 0; i < 3; i++) {
      const dx = w * (0.45 + i * 0.22), up = 4 + i * 5, kick = walk ? (i % 2 ? 6 : -6) : 0;
      s += path(`M${-dx + 8} ${b - h(k) * 0.3} q${-10} ${-up} ${-18 + kick} ${up + h(k) * 0.3 - 2}`, 'none', 0, S(4, { stroke: INK })) + path(`M${-dx + 8} ${b - h(k) * 0.3} q${-10} ${-up} ${-18 + kick} ${up + h(k) * 0.3 - 2}`, 'none', 0, { stroke: k.look.fur, 'stroke-width': 2, 'stroke-linecap': 'round' });
      s += path(`M${dx - 8} ${b - h(k) * 0.3} q${10} ${-up} ${18 - kick} ${up + h(k) * 0.3 - 2}`, 'none', 0, S(4, { stroke: INK })) + path(`M${dx - 8} ${b - h(k) * 0.3} q${10} ${-up} ${18 - kick} ${up + h(k) * 0.3 - 2}`, 'none', 0, { stroke: k.look.fur, 'stroke-width': 2, 'stroke-linecap': 'round' });
    }
    return s;
  }
  if (legs === 'long') {
    const L = 40;
    const a = walk ? 10 : 0;
    return line(-6, b - L, -6 - a, b, INK, 3.5) + line(6, b - L, 8 + a, b - (walk ? 6 : 0), INK, 3.5) + ell(-8 - a, b, 9, 3, c, 2) + ell(10 + a, b - (walk ? 6 : 0), 9, 3, c, 2);
  }
  const fx = w * 0.45;
  const front = walk ? [fx + 7, b - 5] : [fx, b];
  const back = walk ? [-fx - 3, b] : [-fx, b];
  return ell(back[0], back[1], 10, 5.5, c, 2.5) + ell(front[0], front[1], 10, 5.5, c, 2.5);
}
const h = (k: Rig) => k.look.h;

function arm(k: Rig, s: [number, number], hand: [number, number], near: boolean) {
  const { arms } = k.look;
  const fur = k.look.limb ?? k.look.fur;
  const c = near ? fur : darken(fur, 0.9);
  if (arms === 'wing') {
    const dx = hand[0] - s[0], dy = hand[1] - s[1], L = Math.hypot(dx, dy) || 1;
    const nx = -dy / L, ny = dx / L, wd = 9;
    const m1 = [s[0] + dx * 0.45 + nx * wd, s[1] + dy * 0.45 + ny * wd], m2 = [s[0] + dx * 0.45 - nx * wd, s[1] + dy * 0.45 - ny * wd];
    return path(`M${r1(s[0])} ${r1(s[1])} Q${r1(m1[0])} ${r1(m1[1])} ${r1(hand[0])} ${r1(hand[1])} Q${r1(m2[0])} ${r1(m2[1])} ${r1(s[0])} ${r1(s[1])} Z`, c, 2.5);
  }
  const mid = [(s[0] + hand[0]) / 2 + (hand[0] > s[0] ? 2 : -2), (s[1] + hand[1]) / 2 + 3];
  let out = tube(`M${r1(s[0])} ${r1(s[1])} Q${r1(mid[0])} ${r1(mid[1])} ${r1(hand[0])} ${r1(hand[1])}`, c, 7);
  if (arms === 'claw') {
    const cc = darken(fur, 0.95);
    out += g(path('M0 4 C-14 2 -16 -16 -4 -20 L0 -8 L6 -20 C16 -14 12 4 0 4 Z', cc, 2.5) + line(0, -8, 0, -2, INK, 2), { transform: `translate(${r1(hand[0])} ${r1(hand[1])}) rotate(${hand[1] < s[1] ? 0 : 180})` });
  } else out += circ(hand[0], hand[1], 5.5, c, 2.5);
  return out;
}

function ears(k: Rig) {
  const { ears, r, earIn } = k.look;
  const fur = k.look.headColor ?? k.look.fur;
  const { hx, hy } = k;
  const inC = earIn ?? P.pink;
  const droop = k.pose === 'sad';
  const at = (deg: number, d = 0.85): [number, number] => [hx + r * d * Math.cos((deg * Math.PI) / 180), hy - r * d * Math.sin((deg * Math.PI) / 180)];
  let s = '';
  const two = (f: (x: number, y: number, side: number) => string) => {
    const [x1, y1] = at(118), [x2, y2] = at(62);
    return f(x1, y1, -1) + f(x2, y2, 1);
  };
  switch (ears) {
    case 'round':
      s = two((x, y) => circ(x, y, r * 0.34, fur, 2.5) + circ(x, y, r * 0.17, inC, 0));
      break;
    case 'big':
      s = two((x, y, sd) => circ(x + sd * 4, y - 2, r * 0.62, fur, 2.5) + circ(x + sd * 4, y - 2, r * 0.38, inC, 0));
      break;
    case 'tiny':
      s = two((x, y) => circ(x, y + 2, r * 0.2, fur, 2));
      break;
    case 'long': {
      const rot = droop ? 55 : 10;
      s = two((x, y, sd) => g(ell(0, -24, 8.5, 25, fur, 2.5) + ell(0, -24, 4, 16, inC, 0), { transform: `translate(${r1(x)} ${r1(y + 6)}) rotate(${sd * rot})` }));
      break;
    }
    case 'pointy':
    case 'tuft':
      s = two((x, y, sd) => {
        const tip = ears === 'tuft' ? path(`M-3 -22 l3 -8 l3 8`, darken(fur, 0.8), 2) : '';
        return g(path('M-10 4 L0 -24 L10 4 Z', fur, 2.5) + path('M-5 0 L0 -14 L5 0 Z', inC, 0) + tip, { transform: `translate(${r1(x)} ${r1(y + 2)}) rotate(${sd * (droop ? 40 : 14)})` });
      });
      break;
    case 'floppy':
      s = two((x, y, sd) => g(path('M-9 -2 Q0 -10 10 -2 L4 18 Q0 22 -4 18 Z', darken(fur, 0.95), 2.5), { transform: `translate(${r1(x)} ${r1(y + 4)}) rotate(${sd * (droop ? 50 : 30)})` }));
      break;
  }
  return s;
}

function eyes(k: Rig) {
  const { r, sleepy } = k.look;
  const fx = k.hx + r * 0.16, y = k.hy - r * 0.08;
  const xs = [fx - r * 0.32, fx + r * 0.34];
  const blush = ell(xs[0] - r * 0.18, y + r * 0.3, r * 0.17, r * 0.1, P.pink, 0, { opacity: 0.75 }) + ell(xs[1] + r * 0.16, y + r * 0.3, r * 0.17, r * 0.1, P.pink, 0, { opacity: 0.75 });
  let s = '';
  switch (k.pose) {
    case 'cheer':
      s = xs.map((x) => path(`M${x - 4} ${y + 1} q4 -6 8 0`, 'none', 0, S(2.6))).join('');
      break;
    case 'sad':
      s = xs.map((x) => circ(x, y + 2, 2.6, INK, 0)).join('') + path(`M${xs[0] - 5} ${y - 7} l8 3 M${xs[1] + 5} ${y - 7} l-8 3`, 'none', 0, S(2));
      break;
    case 'puzzled':
      s = circ(xs[0], y, 3, INK, 0) + path(`M${xs[1] - 4} ${y - 3} l6 3 l-6 3`, 'none', 0, S(2.4));
      break;
    case 'wave':
    case 'reach':
      s = xs.map((x) => circ(x, y, 3.8, INK, 0) + circ(x + 1.2, y - 1.4, 1.2, P.white, 0)).join('');
      break;
    case 'wait':
      s = xs.map((x) => circ(x + 2, y - 1, 3.2, INK, 0)).join('');
      break;
    default:
      s = sleepy && k.pose === 'idle'
        ? xs.map((x) => path(`M${x - 4} ${y} q4 3 8 0`, 'none', 0, S(2.4))).join('')
        : xs.map((x) => circ(x, y, 3.2, INK, 0)).join('');
  }
  return s + blush;
}

function mouth(k: Rig) {
  const { r, muzzle, muzzleColor } = k.look;
  const x = k.hx + r * 0.2, y = k.hy + r * 0.38;
  const open = k.pose === 'wave' || k.pose === 'cheer' || k.pose === 'reach';
  const mc = muzzleColor ?? P.orange;
  // Beaks stick out of the right side of the head.
  if (muzzle === 'bill' || muzzle === 'beak' || muzzle === 'longbeak' || muzzle === 'pouch') {
    const bx = k.hx + r * 0.8, by = k.hy + r * 0.12;
    const L = muzzle === 'longbeak' ? 30 : muzzle === 'pouch' ? 34 : muzzle === 'beak' ? 14 : 18;
    const top = muzzle === 'bill' ? `M${bx - 2} ${by - 6} q${L * 0.7} -4 ${L} 2 q-2 5 -${L * 0.4} 5 L${bx - 2} ${by + 1} Z` : `M${bx - 2} ${by - 5} L${bx + L} ${by + 1} L${bx - 2} ${by + 3} Z`;
    let s = '';
    if (muzzle === 'pouch') s += path(`M${bx + 2} ${by + 2} Q${bx + L * 0.5} ${by + 22} ${bx + L - 4} ${by + 3} Z`, '#F2C46A', 2.5);
    s += path(top, mc, 2.5);
    if (open) s += path(`M${bx} ${by + 3} L${bx + L * 0.8} ${by + 9} L${bx} ${by + 7} Z`, mc, 2);
    return s;
  }
  let s = '';
  if (muzzle === 'snout' || muzzle === 'teeth') s += ell(x + 2, y - 3, r * 0.34, r * 0.24, k.look.belly ?? P.cream, 2);
  if (muzzle === 'pig') s += ell(x + 3, y - 4, r * 0.3, r * 0.2, darken(k.look.fur, 0.88), 2.2) + circ(x - 1, y - 4, 1.6, INK, 0) + circ(x + 7, y - 4, 1.6, INK, 0);
  if (muzzle === 'snout' || muzzle === 'nose' || muzzle === 'teeth') s += ell(x + 3, y - 7, 3.6, 2.6, muzzleColor ?? INK, 0);
  if (muzzle === 'star') {
    for (let i = 0; i < 8; i++) s += ell(x + 3 + Math.cos(i * 0.785) * 4, y - 6 + Math.sin(i * 0.785) * 4, 2.6, 1.6, P.pink, 1.2, { transform: `rotate(${i * 45} ${r1(x + 3 + Math.cos(i * 0.785) * 4)} ${r1(y - 6 + Math.sin(i * 0.785) * 4)})` });
  }
  const my = muzzle === 'pig' ? y + 4 : y;
  if (k.pose === 'sad') s += path(`M${x - 4} ${my + 3} q4 -4 8 0`, 'none', 0, S(2.2));
  else if (k.pose === 'puzzled') s += path(`M${x - 5} ${my} l3 -2 l3 2 l3 -2`, 'none', 0, S(2));
  else if (open) s += ell(x + 1, my + 1, 4, 3.4, '#B8564A', 1.8);
  else s += path(`M${x - 4} ${my} q4 4 8 0`, 'none', 0, S(2.2));
  if (muzzle === 'teeth') s += rr(x - 1, my - 1, 7, 7, 1.5, P.white, 1.5) + line(x + 2.5, my - 1, x + 2.5, my + 6, INK, 1);
  return s;
}

function head(k: Rig) {
  const { r, belly, neck } = k.look;
  const fur = k.look.headColor ?? k.look.fur;
  let s = '';
  if (neck) {
    // a long curved neck up from the body
    const bx = k.back ? 0 : 4, by = -k.look.h * 0.8 - k.lift;
    s += tube(`M${bx} ${by} C${bx + 14} ${by - neck * 0.45} ${k.hx - 18} ${k.hy + neck * 0.45} ${k.hx} ${k.hy + r * 0.5}`, fur, 13);
  }
  s += ears(k);
  s += circ(k.hx, k.hy, r, fur, 3);
  if (belly && !k.back && k.look.muzzle !== 'bill' && k.look.muzzle !== 'beak' && k.look.muzzle !== 'longbeak' && k.look.muzzle !== 'pouch') {
    s += ell(k.hx + r * 0.22, k.hy + r * 0.28, r * 0.62, r * 0.5, belly, 0);
  }
  if (!k.back) s += eyes(k) + mouth(k);
  if (k.look.hat) s += k.look.hat(k);
  return g(s, { transform: `rotate(${k.tilt} ${r1(k.hx)} ${r1(k.hy + r)})` });
}

function tail(k: Rig) {
  const { tail, w, fur, tailColor } = k.look;
  const c = tailColor ?? fur;
  const b = -k.lift;
  const x = k.back ? 0 : -w * 0.9, y = b - k.look.h * 0.3;
  switch (tail) {
    case 'stub':
      return path(`M${x + 4} ${y} q-16 -4 -14 -14 q8 2 16 8 z`, c, 2.5);
    case 'cotton':
      return circ(x + (k.back ? 0 : 2), y + 4, 9, c, 2.5);
    case 'fluffy':
      return path(`M${x + 6} ${y + 10} C${x - 34} ${y + 6} ${x - 40} ${y - 50} ${x - 14} ${y - 60} C${x - 2} ${y - 40} ${x + 4} ${y - 20} ${x + 6} ${y + 10} Z`, c, 3) +
        path(`M${x - 14} ${y - 60} q-8 6 -6 14 q8 0 10 -10 z`, P.white, 2);
    case 'curl':
      return path(`M${x + 8} ${y + 14} C${x - 40} ${y + 10} ${x - 46} ${y - 70} ${x - 6} ${y - 96} C${x + 26} ${y - 110} ${x + 34} ${y - 70} ${x + 10} ${y - 66} C${x - 6} ${y - 64} ${x - 2} ${y - 84} ${x + 10} ${y - 80}`, c, 3);
    case 'flat':
      return g(rr(-14, -6, 30, 46, 14, c, 2.5) + path('M-8 4 l20 12 M-8 16 l20 12 M8 0 l-14 14 M8 14 l-14 14', 'none', 0, S(1.5, { opacity: 0.6 })), { transform: `translate(${x - 14} ${b - 10}) rotate(70)` });
    case 'long':
      return tube(`M${x + 6} ${y + 12} Q${x - 30} ${y + 16} ${x - 44} ${y - 4}`, c, 10);
    case 'ring': {
      let s = path(`M${x + 6} ${y + 10} C${x - 30} ${y + 14} ${x - 44} ${y - 16} ${x - 36} ${y - 34} C${x - 22} ${y - 30} ${x - 8} ${y - 10} ${x + 6} ${y + 10} Z`, c, 2.5);
      s += path(`M${x - 18} ${y + 10} q-6 -10 2 -18 M${x - 30} ${y - 2} q-2 -10 8 -16`, 'none', 0, { stroke: '#4A4440', 'stroke-width': 6, 'stroke-linecap': 'round' });
      return s;
    }
    case 'thin':
      return path(`M${x + 6} ${y + 12} C${x - 30} ${y + 20} ${x - 34} ${y - 14} ${x - 18} ${y - 16}`, 'none', 0, S(3.4, { stroke: P.pink }));
    case 'cat':
      return tube(`M${x + 6} ${y + 10} C${x - 34} ${y + 10} ${x - 26} ${y - 40} ${x - 40} ${y - 52}`, c, 8);
    default:
      return '';
  }
}

/** One resident in one pose. */
export function critter(id: string, pose: Pose) {
  const look = LOOKS[id] ?? LOOKS.duck;
  const k = rig(look, pose);
  const raise = look.legs === 'long' ? `translate(0 -40)` : '';
  let s = ell(0, 2, look.w * 1.05, 7, P.woodDeep, 0, { opacity: 0.3 });
  let fig = '';
  if (!k.back) fig += tail(k);
  if (look.back) fig += look.back(k);
  fig += arm(k, k.sL, k.hL, false);
  if (look.legs !== 'long') fig += feet(k);
  fig += body(k);
  if (look.front) fig += look.front(k);
  if (k.back) fig += tail(k);
  if (!look.neck && look.r > 1) fig += head(k);
  fig += arm(k, k.sR, k.hR, true);
  if (look.carry && (pose === 'idle' || pose === 'walk' || pose === 'wait')) fig += look.carry(k.hL[0], k.hL[1]);
  let all = look.legs === 'long' ? feet(k) + g(fig, { transform: raise }) : fig;
  if (look.neck) all += g(head(k), { transform: look.legs === 'long' ? raise : '' });
  s += g(all, { transform: `rotate(${k.lean} 0 0)` });
  return g(s, { filter: 'url(#wobbleSoft)' });
}

/** Round portrait for the parcel cards: the idle pose's head, framed. */
export function critterAvatar(id: string) {
  const look = LOOKS[id] ?? LOOKS.duck;
  const headY = look.hy + (look.legs === 'long' ? 40 : 0);
  const s = Math.min(1.5, 30 / look.r);
  const inner = g(critter(id, 'idle'), { transform: `translate(${-(look.hx ?? 0) * s} ${(headY - 6) * s}) scale(${s})` });
  const id2 = `av_${id}`;
  return E('clipPath', { id: id2 }, E('circle', { cx: 0, cy: 0, r: 34 })) + circ(0, 0, 34, P.tealLight, 0) + g(inner, { 'clip-path': `url(#${id2})` }) + circ(0, 0, 34, 'none', 3);
}

// ---------- the cast ----------

const scarf = (color: string) => (k: Rig) => {
  const y = -k.look.h * 0.86 - k.lift, w = k.look.w * 0.7;
  return path(`M${-w} ${y} q${w} ${12} ${w * 2} 0 l-2 9 q${-w} 10 ${-w * 2 + 4} 0 z`, color, 2.5) + (k.back ? '' : path(`M${w * 0.4} ${y + 6} l6 14 l8 -4 z`, color, 2));
};
const apron = (color: string) => (k: Rig) => {
  if (k.back) return path(`M${-k.look.w * 0.7} ${-k.look.h * 0.45 - k.lift} h${k.look.w * 1.4}`, 'none', 0, S(3, { stroke: color }));
  const y = -k.look.h * 0.62 - k.lift, w = k.look.w * 0.62;
  return path(`M${-w + 4} ${y} h${w * 2 - 4} l4 ${k.look.h * 0.56} q${-w} 8 ${-w * 2 - 4} 0 z`, color, 2.5) + rr(-6, y + k.look.h * 0.24, 16, 10, 3, darken(color, 0.9), 1.8);
};
const glasses = (k: Rig, tint = 'none') => {
  if (k.back) return '';
  const r = k.look.r, fx = k.hx + r * 0.16, y = k.hy - r * 0.08;
  return circ(fx - r * 0.32, y, 6.5, tint, 2.2, { stroke: P.gold }) + circ(fx + r * 0.34, y, 6.5, tint, 2.2, { stroke: P.gold }) + line(fx - r * 0.32 + 6, y, fx + r * 0.34 - 6, y, P.gold, 2);
};

const LOOKS: Record<string, Look> = {
  duck: {
    fur: P.white, w: 32, h: 46, r: 21, hy: 64, hx: 10, ears: 'none', muzzle: 'bill', tail: 'stub', arms: 'wing', legs: 'short', foot: P.orange,
    front: scarf(P.blue),
  },
  rabbit: {
    fur: P.white, w: 22, h: 40, r: 22, hy: 62, ears: 'long', muzzle: 'nose', muzzleColor: P.pink, tail: 'cotton', arms: 'paw', legs: 'short',
    front: scarf(P.orange),
  },
  hedgehog: {
    fur: '#F1DDBE', w: 26, h: 36, r: 20, hy: 46, hx: 6, ears: 'tiny', muzzle: 'snout', tail: 'none', arms: 'paw', legs: 'short', foot: '#C9A27E',
    back: (k) => {
      let s = `M-34 ${-k.lift} `;
      const cx = k.back ? 0 : -4, cy = -36 - k.lift;
      for (let i = 0; i <= 12; i++) {
        const a = Math.PI * 0.95 + (i * Math.PI * 1.1) / 12;
        s += `L${r1(cx + 46 * Math.cos(a - 0.12))} ${r1(cy + 44 * Math.sin(a - 0.12))} L${r1(cx + 36 * Math.cos(a))} ${r1(cy + 34 * Math.sin(a))} `;
      }
      return path(s + `L34 ${-k.lift} Z`, '#9C7B5C', 2.5);
    },
  },
  turtle: {
    fur: '#C3CC8E', belly: '#E6DDB0', w: 30, h: 42, r: 19, hy: 62, hx: 4, ears: 'none', muzzle: 'none', tail: 'none', arms: 'paw', legs: 'short',
    back: (k) => {
      const cy = -30 - k.lift;
      return ell(k.back ? 0 : -6, cy, 40, 34, '#7E9A52', 3) + path(`M${-20} ${cy - 18} l12 -8 l14 4 l2 14 l-12 8 l-14 -4 z M${8} ${cy - 2} l12 -6 l12 8 M${-30} ${cy + 4} l12 -2 l10 10`, 'none', 0, S(2, { stroke: '#56713A' }));
    },
    hat: (k) => glasses(k) + (k.back ? '' : path(`M${k.hx - 8} ${k.hy - 13} q6 -4 12 0 M${k.hx + 6} ${k.hy - 13} q6 -4 12 0`, 'none', 0, S(3, { stroke: P.white }))),
    carry: (x, y) => tube(`M${x} ${y - 10} L${x - 4} ${y + 30}`, P.wood, 5) + path(`M${x} ${y - 10} q6 -10 12 -2`, 'none', 0, S(5, { stroke: P.woodDeep })),
  },
  otter: {
    fur: '#9A7350', belly: '#E8D3B0', w: 22, h: 50, r: 19, hy: 70, hx: 4, ears: 'tiny', muzzle: 'snout', tail: 'long', arms: 'paw', legs: 'short',
    front: (k) => {
      const y0 = -k.look.h * 0.85 - k.lift;
      let s = '';
      for (let i = 0; i < 4; i++) s += path(`M${-18} ${y0 + 8 + i * 9} q18 4 36 0`, 'none', 0, { stroke: P.blue, 'stroke-width': 4, opacity: 0.85 });
      return s;
    },
    hat: (k) => (k.back ? '' : path(`M${k.hx + 14} ${k.hy + 8} l14 -3 M${k.hx + 14} ${k.hy + 12} l14 2`, 'none', 0, S(1.4))),
  },
  beaver: {
    fur: '#A9764B', belly: '#DDBB8E', w: 30, h: 44, r: 20, hy: 62, hx: 4, ears: 'tiny', muzzle: 'teeth', tail: 'flat', tailColor: '#6E4B2E', arms: 'paw', legs: 'short',
    front: (k) => rr(-k.look.w + 2, -k.look.h * 0.36 - k.lift, k.look.w * 2 - 4, 9, 3, P.woodDeep, 2) + (k.back ? '' : rr(8, -k.look.h * 0.36 - k.lift - 2, 6, 18, 2, P.silver, 1.5)),
    hat: (k) => g(rr(-2, -14, 5, 28, 2, P.mustard, 1.6) + path('M-2 14 l2.5 6 l2.5 -6', P.cream, 1.4), { transform: `translate(${k.hx - 14} ${k.hy - 14}) rotate(-60)` }),
  },
  egret: {
    fur: P.white, w: 22, h: 34, r: 13, hy: 96, hx: 18, ears: 'none', muzzle: 'longbeak', muzzleColor: P.gold, tail: 'stub', arms: 'wing', legs: 'long', foot: INK, neck: 34,
    front: (k) => (k.back ? '' : Array.from({ length: 5 }, (_, i) => circ(-8 + i * 4.5, -k.look.h * 0.84 - k.lift + Math.sin(i * 0.8) * 2 + 2, 2.6, P.cream, 1.2)).join('')),
    hat: (k) => path(`M${k.hx - 8} ${k.hy - 8} q-20 -6 -30 6 M${k.hx - 8} ${k.hy - 4} q-18 2 -26 14`, 'none', 0, S(2, { stroke: P.white, 'stroke-width': 3 })),
  },
  squirrel: {
    fur: '#D98A52', belly: '#F4E2C2', w: 22, h: 38, r: 19, hy: 56, hx: 4, ears: 'tuft', muzzle: 'nose', tail: 'curl', arms: 'paw', legs: 'short',
    front: (k) => (k.back ? '' : path(`M${-k.look.w + 2} ${-k.look.h * 0.9 - k.lift} L${k.look.w - 8} ${-k.look.h * 0.25 - k.lift}`, 'none', 0, S(2.5, { stroke: P.woodDeep })) + ell(k.look.w - 8, -k.look.h * 0.2 - k.lift, 8, 9, P.wood, 2) + path(`M${k.look.w - 16} ${-k.look.h * 0.26 - k.lift} q8 -8 16 0`, '#7A5636', 2)),
  },
  raccoon: {
    fur: '#A8A39A', belly: '#E6E1D6', w: 26, h: 44, r: 21, hy: 64, hx: 4, ears: 'pointy', earIn: '#E6E1D6', muzzle: 'snout', tail: 'ring', arms: 'paw', legs: 'short', foot: '#5C5650',
    front: apron(P.pink),
    hat: (k) => (k.back ? '' : path(`M${k.hx - k.look.r * 0.62} ${k.hy - 6} q${k.look.r * 0.8} -6 ${k.look.r * 1.6} 0 q-4 10 -${k.look.r * 0.8} 6 q-${k.look.r * 0.4} 6 -${k.look.r * 0.8} -6 z`, '#4A4440', 0, { opacity: 0.85 }) + circ(k.hx - k.look.r * 0.16, k.hy - k.look.r * 0.08, 2.6, P.white, 0) + circ(k.hx + k.look.r * 0.5, k.hy - k.look.r * 0.08, 2.6, P.white, 0)),
  },
  bear: {
    fur: '#A0704A', belly: '#D9B48A', w: 30, h: 46, r: 23, hy: 66, hx: 4, ears: 'round', earIn: '#D9B48A', muzzle: 'snout', tail: 'none', arms: 'paw', legs: 'short', sleepy: true,
    front: (k) => {
      const y = -k.look.h - k.lift + 4;
      return path(`M${-k.look.w + 1} ${-6 - k.lift} C${-k.look.w - 1} ${y + 18} ${-k.look.w * 0.5} ${y} 0 ${y} C${k.look.w * 0.5} ${y} ${k.look.w + 1} ${y + 18} ${k.look.w - 1} ${-6 - k.lift} Z`, P.tealLight, 2.5) +
        (k.back ? '' : circ(4, y + 14, 2.4, P.white, 1.2) + circ(4, y + 26, 2.4, P.white, 1.2) + circ(4, y + 38, 2.4, P.white, 1.2));
    },
    hat: (k) => path(`M${k.hx - 20} ${k.hy - 12} Q${k.hx - 4} ${k.hy - 46} ${k.hx + 30} ${k.hy - 26} Q${k.hx + 8} ${k.hy - 24} ${k.hx + 20} ${k.hy - 12} Z`, P.blueLight, 2.5) + circ(k.hx + 32, k.hy - 24, 6, P.white, 2),
  },
  swan: {
    fur: P.white, w: 32, h: 40, r: 14, hy: 118, hx: 20, ears: 'none', muzzle: 'beak', muzzleColor: P.orange, tail: 'stub', arms: 'wing', legs: 'short', foot: INK, neck: 46,
    hat: (k) => path(`M${k.hx - 8} ${k.hy - 12} l3 -10 l5 6 l4 -9 l4 9 l5 -6 l2 10 z`, P.gold, 2),
  },
  crab: {
    fur: '#E0704C', w: 40, h: 34, r: 0.1, hy: 30, ears: 'none', muzzle: 'none', tail: 'none', arms: 'claw', legs: 'crab',
    front: (k) => {
      const y = -k.look.h - k.lift;
      let s = '';
      for (const sd of [-1, 1]) {
        const ex = sd * 12 + (k.pose === 'puzzled' && sd > 0 ? 4 : 0);
        s += line(sd * 9, y + 6, ex, y - 16, INK, 3) + circ(ex, y - 20, 7, P.white, 2.5);
        if (!k.back) s += k.pose === 'cheer' ? path(`M${ex - 3} ${y - 19} q3 -4 6 0`, 'none', 0, S(2)) : circ(ex + 1.5, y - 20, 3, INK, 0);
      }
      if (!k.back) {
        const my = y + 18;
        s += path(`M-10 ${my} q5 -5 10 0 q5 -5 10 0`, 'none', 0, S(2.4, { stroke: '#7A3B2B' }));
        s += k.pose === 'sad' ? path(`M-5 ${my + 8} q5 -4 10 0`, 'none', 0, S(2)) : k.pose === 'cheer' || k.pose === 'wave' ? ell(0, my + 8, 4, 3.4, '#B8564A', 1.6) : path(`M-5 ${my + 6} q5 4 10 0`, 'none', 0, S(2));
        s += ell(-20, y + 20, 5, 3, P.pink, 0, { opacity: 0.7 }) + ell(20, y + 20, 5, 3, P.pink, 0, { opacity: 0.7 });
      }
      s += ell(0, y - 2, 18, 5, P.mustard, 2) + path(`M-10 ${y - 4} q10 -14 20 0 z`, P.mustard, 2) + line(-10, y - 4, 10, y - 4, P.red, 2.5);
      return s;
    },
  },
  mouse: {
    fur: '#B9B4A6', belly: '#E8E5DC', w: 16, h: 26, r: 16, hy: 40, hx: 3, ears: 'big', muzzle: 'nose', muzzleColor: P.pink, tail: 'thin', arms: 'paw', legs: 'short',
    front: (k) => rr(-k.look.w + 2, -k.look.h * 0.6 - k.lift, k.look.w * 2 - 4, k.look.h * 0.6 - 2, 6, P.red, 2.5) + line(-8, -k.look.h * 0.6 - k.lift, -10, -k.look.h - k.lift + 4, P.red, 3) + line(8, -k.look.h * 0.6 - k.lift, 10, -k.look.h - k.lift + 4, P.red, 3),
    hat: (k) => (k.back ? '' : path(`M${k.hx + 12} ${k.hy + 4} l12 -3 M${k.hx + 12} ${k.hy + 7} l12 2`, 'none', 0, S(1.2))),
  },
  fox: {
    fur: '#E07B45', belly: P.white, w: 22, h: 48, r: 20, hy: 70, hx: 5, ears: 'pointy', earIn: '#4A3B30', muzzle: 'snout', tail: 'fluffy', arms: 'paw', legs: 'short', foot: '#4A3B30',
    front: (k) => {
      const y = -k.look.h * 0.9 - k.lift, w = k.look.w;
      if (k.back) return path(`M${-w + 1} ${-8 - k.lift} V${y + 10} q${w} -8 ${w * 2 - 2} 0 V${-8 - k.lift} Z`, P.lilyDeep, 2.5);
      return path(`M${-w + 1} ${-8 - k.lift} V${y + 8} L${-2} ${y + 26} V${-8 - k.lift} Z M${w - 1} ${-8 - k.lift} V${y + 8} L${8} ${y + 26} V${-8 - k.lift} Z`, P.lilyDeep, 2.5) +
        path(`M-4 ${y + 2} l-6 -5 v10 z M8 ${y + 2} l6 -5 v10 z`, P.red, 1.8) + circ(2, y + 2, 2.4, P.red, 1.5);
    },
    hat: (k) => glasses(k),
  },
  pig: {
    fur: '#F2B8AA', belly: '#F8D3C8', w: 30, h: 44, r: 22, hy: 62, hx: 4, ears: 'floppy', muzzle: 'pig', tail: 'none', arms: 'paw', legs: 'short',
    front: apron(P.cream),
    hat: (k) => {
      const { hx, hy } = k, r = k.look.r;
      return path(`M${hx - r - 2} ${hy + 2} C${hx - r} ${hy - r * 1.5} ${hx + r} ${hy - r * 1.5} ${hx + r + 2} ${hy + 2} Q${hx} ${hy - r * 0.6} ${hx - r - 2} ${hy + 2} Z`, P.red, 2.5) +
        circ(hx - 8, hy - r * 0.8, 2, P.white, 0) + circ(hx + 6, hy - r * 0.95, 2, P.white, 0) + circ(hx + 14, hy - r * 0.6, 2, P.white, 0) + circ(hx - 14, hy - r * 0.4, 2, P.white, 0);
    },
  },
  sheep: {
    fur: P.cream, headColor: '#5C4A3D', limb: '#5C4A3D', w: 30, h: 44, r: 17, hy: 64, hx: 6, ears: 'floppy', muzzle: 'none', tail: 'none', arms: 'paw', legs: 'short',
    back: (k) => {
      let s = '';
      const y = -k.look.h * 0.5 - k.lift;
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        s += circ(Math.cos(a) * 26, y + Math.sin(a) * 20, 14, P.cream, 2.5);
      }
      return s + ell(0, y, 30, 22, P.cream, 0);
    },
    front: (k) => (k.back ? '' : path(`M-14 ${-k.look.h * 0.8 - k.lift} q14 8 28 0`, 'none', 0, S(3, { stroke: P.red })) + circ(2, -k.look.h * 0.74 - k.lift, 5, P.gold, 2)),
    hat: (k) => circ(k.hx - 8, k.hy - 14, 8, P.cream, 2.5) + circ(k.hx + 2, k.hy - 17, 8, P.cream, 2.5) + circ(k.hx + 11, k.hy - 13, 7, P.cream, 2.5),
  },
  mole: {
    fur: '#6B5A50', belly: '#8A786C', w: 28, h: 40, r: 20, hy: 56, hx: 5, ears: 'none', muzzle: 'star', tail: 'none', arms: 'paw', legs: 'short', foot: P.pink,
    hat: (k) => glasses(k, '#3A302A') + path(`M${k.hx - 20} ${k.hy - 8} Q${k.hx} ${k.hy - 36} ${k.hx + 20} ${k.hy - 8} Z`, P.mustard, 2.5) + (k.back ? '' : circ(k.hx + 2, k.hy - 20, 5, P.cream, 2)),
  },
  snail: {
    fur: '#D8D9A0', w: 18, h: 46, r: 16, hy: 56, hx: 6, ears: 'none', muzzle: 'none', tail: 'none', arms: 'paw', legs: 'snail',
    back: (k) => {
      const cx = k.back ? 0 : -16, cy = -38 - k.lift;
      return circ(cx, cy, 34, '#B9867A', 3) + path(`M${cx} ${cy} m0 -4 a4 4 0 1 1 -4 4 a10 10 0 0 1 10 -10 a16 16 0 0 1 16 16 a22 22 0 0 1 -22 22 a28 28 0 0 1 -28 -28`, 'none', 0, S(2.5, { stroke: '#8C5E54' }));
    },
    front: (k) => (k.back ? '' : path(`M${-k.look.w - 4} ${-k.look.h * 0.82 - k.lift} q${k.look.w + 4} 18 ${k.look.w * 2 + 8} 0 l-6 16 q-${k.look.w} 10 -${k.look.w * 2 - 4} 0 z`, P.pink, 2.5)),
    hat: (k) => {
      let s = '';
      for (const sd of [-1, 1]) s += line(k.hx + sd * 6, k.hy - 12, k.hx + sd * 10, k.hy - 32, INK, 2.5) + circ(k.hx + sd * 10, k.hy - 34, 4, k.look.fur, 2);
      return s;
    },
  },
  pelican: {
    fur: P.white, w: 30, h: 48, r: 18, hy: 66, hx: 8, ears: 'none', muzzle: 'pouch', muzzleColor: P.gold, tail: 'stub', arms: 'wing', legs: 'short', foot: P.orange,
    front: scarf(P.red),
    hat: (k) => ell(k.hx - 2, k.hy - 14, 18, 6, P.white, 2.5) + path(`M${k.hx - 16} ${k.hy - 14} q16 -16 30 0 z`, P.blue, 2.5) + rr(k.hx - 14, k.hy - 17, 28, 4, 2, P.white, 1.2),
  },
  cat: {
    fur: '#F4E9C8', belly: P.white, w: 22, h: 44, r: 21, hy: 64, hx: 4, ears: 'pointy', earIn: P.pink, muzzle: 'nose', muzzleColor: P.pink, tail: 'cat', tailColor: '#E9A06A', arms: 'paw', legs: 'short',
    front: (k) => path(`M-10 ${-k.look.h * 0.95 - k.lift} q8 6 14 -2 l2 10 q-8 4 -16 2 z`, '#E9A06A', 0, { opacity: 0.8 }),
    hat: (k) => {
      const x = k.hx + k.look.r * 0.55, y = k.hy - k.look.r * 0.95;
      return path(`M${x} ${y} l-10 -7 v14 z M${x} ${y} l10 -7 v14 z`, P.pink, 2) + circ(x, y, 3, P.pink, 1.6) +
        path(`M${k.hx - 12} ${k.hy - 14} q6 -4 10 2 M${k.hx + 2} ${k.hy - 18} q6 -2 8 4`, 'none', 0, { stroke: '#E9A06A', 'stroke-width': 4, 'stroke-linecap': 'round' });
    },
    carry: (x, y) => path(`M${x - 4} ${y - 6} q6 -14 12 0`, 'none', 0, S(2.5, { stroke: P.pink })) + rr(x - 10, y - 4, 24, 20, 3, P.pink, 2.5),
  },
};
