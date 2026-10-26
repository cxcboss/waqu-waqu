import { PLATE_COLORS } from '../art/palette';
import { K } from '../art/sprites';
import { clamp, rng, shuffle } from '../engine/math';
import { HOUSE, HOUSE_DEFS, RESIDENT_DEFS } from './cast';
import { DAYS, TUNING, type DayConfig, type Size } from './config';
import { newResident, type ResidentState } from './resident';

export type PlatKind = 'lily' | 'log' | 'house' | 'truck' | 'bank';

export interface Plat {
  id: number;
  kind: PlatKind;
  /** World position (design units). World y grows downward like the screen; the camera moves toward negative y. */
  x: number;
  y: number;
  /** Ellipse radii (lily, house raft), half length / half thickness (log), half extents (truck). */
  rx: number;
  ry: number;
  rot: number;
  variant: number;
  /** Seconds since something landed on it (drives the bob), large when idle. */
  bobT: number;
  /** How hard the last landing pushed it down (drives the wobble), and which way it tipped (-1..1). */
  press: number;
  tilt: number;
  drift: number;
  house?: House;
}

export interface House {
  id: number;
  /** Which kind of house (HOUSE_DEFS) and who lives in it (RESIDENT_DEFS); they're picked separately. */
  type: string;
  /** Color of the pickup-code tags hanging at this house (and on its parcels' cards). */
  color: string;
  name: string;
  species: string;
  plat: Plat;
  /** Where the resident is right now (they come out of the door and go back in), relative to the raft center. */
  resident: { x: number; y: number };
  /** Where the resident waits, and the frog's porch spot, relative to the raft center. */
  spot: { x: number; y: number };
  porch: { x: number; y: number };
  plateAt: { x: number; y: number };
  /** The front door: center x, bottom y, width and height, relative to the raft center. */
  door: { x: number; y: number; w: number; h: number };
  /** Roof height above the raft center. */
  top: number;
  res: ResidentState;
  react: { kind: 'happy' | 'confused'; t: number } | null;
  /** The parcel the resident is holding up after a hand-over; t < 0 while it's still flying over. */
  hold: { size: Size; urgent: boolean; cod: boolean; wrong: boolean; t: number } | null;
  passed: boolean;
  phase: number;
}

/** 'float': dropped in the river and still within reach of a rescue. */
export type OrderState = 'pool' | 'bag' | 'float' | 'delivered' | 'wrong' | 'wet' | 'missed';

export interface Order {
  id: number;
  /** Pickup code 0–9, unique within the day; shown on the card and on the house waiting for it. */
  code: number;
  house: House;
  size: Size;
  urgent: boolean;
  /** Cash on delivery: what the resident owes, and the bill they pay with. */
  cod: { price: number; paid: number } | null;
  /** Whether the change handed back was right, once it's been counted out. */
  codOk: boolean | null;
  /** Times it has gone into the river; the third time it's ruined and washed away. */
  dunks: number;
  state: OrderState;
  /** Set on the first pickup and kept, so putting an urgent parcel back doesn't restart its clock. */
  deadline: number;
  pickedAt: number;
  late: boolean;
  deliveredTo: House | null;
}

export interface Level {
  cfg: DayConfig;
  plats: Plat[];
  houses: House[];
  orders: Order[];
  truck: Plat;
  /** The road the truck drives on, along the right bank. */
  road: Plat;
}

let nextId = 1;

function plat(kind: PlatKind, x: number, y: number, rx: number, ry: number, extra: Partial<Plat> = {}): Plat {
  return { id: nextId++, kind, x, y, rx, ry, rot: 0, variant: 0, bobT: 9, press: 0, tilt: 0, drift: 0, ...extra };
}

export function dayConfig(day: number): DayConfig {
  return DAYS[clamp(day, 1, DAYS.length) - 1];
}

/** Builds one day's river. Same seed, same river. `H` is the screen height in design units. */
export function buildLevel(cfg: DayConfig, H: number): Level {
  const r = rng(cfg.seed);
  // How many rows fit, and so how many draws `r` makes, depends on the screen height. The parcels and
  // the houses' own looks draw from streams of their own, so a day brings the same parcels to the same
  // neighbours on every phone.
  const ro = rng((cfg.seed ^ 0x9e3779b9) >>> 0);
  const rh = rng((cfg.seed ^ 0x85ebca6b) >>> 0);
  const { riverL, riverR } = TUNING;
  const plats: Plat[] = [];
  const houses: House[] = [];

  // House positions: the first one is already on screen at the start, the rest evenly spaced.
  const firstY = H * 0.14;
  const lastY = -(cfg.length - H * 0.45);
  const gap = (firstY - lastY) / Math.max(1, cfg.houses - 1);
  const houseYs = Array.from({ length: cfg.houses }, (_, i) => firstY - i * gap);

  // A different house and a different neighbor at every stop; any of them can live in any house.
  const deal = <T>(all: T[]) => {
    const out: T[] = [];
    while (out.length < cfg.houses) out.push(...shuffle([...all], r));
    return out.slice(0, cfg.houses);
  };
  const types = deal(HOUSE_DEFS.map((h) => h.id));
  const who = deal(RESIDENT_DEFS);
  const colors = shuffle([...PLATE_COLORS], r);

  const mid = (riverL + riverR) / 2;
  let pathX = mid + 60;
  let side: 0 | 1 = r() < 0.5 ? 0 : 1;
  /** Set right after a house: the next row has to dodge its roof sideways. */
  let afterHouse: number | null = null;
  const lilyX = (rx: number, want: number) => clamp(want, riverL + rx + 6, riverR - rx - 6);

  const row = (y: number) => {
    // A main landing spot within reach of the last one, sometimes a log, sometimes a second lily.
    let want = pathX + (r() - 0.5) * 260;
    if (afterHouse !== null) want = afterHouse + (afterHouse < mid ? 1 : -1) * (112 + r() * 22); // clear of the roof
    afterHouse = null;
    if (r() < 0.16) {
      const lx = clamp(want, riverL + 90, riverR - 90);
      plats.push(plat('log', lx, y, 76, 18, { rot: (r() - 0.5) * 0.35, drift: (r() < 0.5 ? -1 : 1) * (8 + r() * 8) }));
      pathX = lx;
    } else {
      const rx = 48 + r() * 24;
      const lx = lilyX(rx, want);
      plats.push(plat('lily', lx, y + (r() - 0.5) * 20, rx, rx * 0.6, { variant: Math.floor(r() * 4) }));
      pathX = lx;
    }
    // The wider river has room for a second pad off to the side, and now and then a third.
    if (r() < 0.5) {
      const rx = 42 + r() * 18;
      const away = pathX < mid ? pathX + 190 + r() * 70 : pathX - 190 - r() * 70;
      plats.push(plat('lily', lilyX(rx, away), y + (r() - 0.5) * 50, rx, rx * 0.6, { variant: Math.floor(r() * 4) }));
      if (r() < 0.22) {
        const sx = pathX < mid ? riverR - 70 : riverL + 70;
        const srx = 36 + r() * 10;
        if (Math.abs(sx - away) > 150) plats.push(plat('lily', lilyX(srx, sx), y + (r() - 0.5) * 60, srx, srx * 0.6, { variant: Math.floor(r() * 4) }));
      }
    }
  };

  const house = (i: number, hy: number) => {
    const geo = HOUSE[types[i]];
    const hx = side === 0 ? riverL + 128 + rh() * 14 : riverR - 128 - rh() * 14;
    const p = plat('house', hx, hy, geo.rx * K, geo.ry * K, { variant: i });
    const pt = ([x, y]: [number, number]) => ({ x: x * K, y: y * K });
    const d = geo.door;
    const h: House = {
      id: i, type: geo.id, color: colors[i % colors.length],
      name: who[i].name, species: who[i].id, plat: p,
      resident: pt(geo.spot), spot: pt(geo.spot), porch: pt(geo.porch), plateAt: pt(geo.plate),
      door: { x: d.x * K, y: d.y * K, w: d.w * K, h: d.h * K }, top: geo.top * K,
      res: newResident(rh()),
      react: null, hold: null, passed: false, phase: rh() * 6,
    };
    p.house = h;
    plats.push(p);
    houses.push(h);
    // A lily on the open side of the river so the house row stays crossable.
    const orx = 44 + r() * 10;
    const ox = side === 0 ? hx + 190 : hx - 190;
    plats.push(plat('lily', lilyX(orx, ox + (r() - 0.5) * 30), hy + 30 + r() * 30, orx, orx * 0.6, { variant: Math.floor(r() * 4) }));
    pathX = hx;
    side = side === 0 ? 1 : 0;
    afterHouse = hx;
  };

  // Rows are spaced evenly between houses so every gap stays jumpable. The row just past a
  // house sits closer, since it has to dodge the roof sideways.
  let y = H * 0.86;
  pathX = mid - 120;
  row(y);
  houseYs.forEach((hy, i) => {
    if (i > 0) {
      y -= 160;
      row(y);
    }
    const n = Math.max(1, Math.ceil((y - hy) / 195));
    const step = (y - hy) / n;
    for (let k = 1; k < n; k++) row(y - k * step);
    house(i, hy);
    y = hy;
  });
  const yEnd = -(cfg.length + H * 1.3);
  y -= 160;
  row(y);
  while (y > yEnd) {
    y -= 175 + r() * 30;
    row(y);
  }
  // A lily just ahead of the truck, where the frog starts: an easy first hop.
  const sx = riverR - 96, sy = H * TUNING.truckAnchor - 150;
  for (let i = plats.length - 1; i >= 0; i--) {
    const q = plats[i];
    if (q.kind !== 'house' && Math.hypot(q.x - sx, q.y - sy) < q.rx + 52 + 30) plats.splice(i, 1);
  }
  plats.push(plat('lily', sx, sy, 52, 52 * 0.6, { variant: 1 }));
  bridgeGaps(plats, cfg, yEnd + H);

  // Orders: the first house always has one (the tutorial walks you there), the rest spread out.
  const houseOrder = [0, ...shuffle(houses.slice(1).map((h) => h.id), ro)];
  const orders: Order[] = [];
  for (let i = 0; i < cfg.orders; i++) {
    const h = houses[houseOrder[i % houseOrder.length]];
    orders.push({
      id: i, code: 0, house: h, size: cfg.sizes[Math.floor(ro() * cfg.sizes.length)], urgent: false, cod: null, codOk: null, dunks: 0,
      state: 'pool', deadline: 0, pickedAt: 0, late: false, deliveredTo: null,
    });
  }
  // Early days count up the river: the first house waits for 1, the next for 2, and so on.
  // From day 4 on the codes are shuffled, so every card has to be read.
  if (cfg.ordered) orders.slice().sort((a, b) => a.house.id - b.house.id || a.id - b.id).forEach((o, i) => (o.code = i + 1));
  else {
    const codes = shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], ro);
    orders.forEach((o, i) => (o.code = codes[i % codes.length]));
  }
  // Urgent parcels go to houses that are not the very first ones, so there's time to plan.
  const urgentCandidates = shuffle(orders.filter((o) => o.house.id >= 2), ro);
  urgentCandidates.slice(0, cfg.urgent).forEach((o) => (o.urgent = true));
  // Cash on delivery goes to plain parcels past the first two houses; on day 1 that's after the basics.
  const codCandidates = shuffle(orders.filter((o) => o.house.id >= 2 && !o.urgent), ro);
  for (const o of codCandidates.slice(0, cfg.cod)) {
    const price = cfg.codNote === 10 ? 3 + Math.floor(ro() * 6) : 11 + Math.floor(ro() * 7);
    o.cod = { price, paid: cfg.codNote };
  }

  const truck = plat('truck', TUNING.truckX, 0, TUNING.truckHalfW, TUNING.truckHalfH, { variant: 1 });
  const road = plat('bank', 0, 0, 0, 0);
  return { cfg, plats, houses, orders, truck, road };
}

/** Where the frog ends up standing on a platform. */
function spot(p: Plat) {
  return p.house ? { x: p.x + p.house.porch.x, y: p.y + p.house.porch.y } : { x: p.x, y: p.y };
}

/**
 * Safety net for the generator: from every landing spot there has to be somewhere further
 * upriver within a jump made with a full bag. Where there isn't, a lily is added in between.
 */
function bridgeGaps(plats: Plat[], cfg: DayConfig, top: number) {
  const reach = TUNING.maxJump * (1 - TUNING.weightPenalty * cfg.bagSlots) * 0.88;
  const { riverL, riverR } = TUNING;
  const blocked = (x: number, y: number, rx: number) =>
    plats.some((q) => {
      if (q.kind === 'house') {
        // the raft itself, and the house standing on it (about 70 wide each way, as tall as its roof)
        if (Math.abs(x - q.x) < q.rx + rx && Math.abs(y - q.y) < q.ry + rx * 0.7) return true;
        return Math.abs(x - q.x) < 70 + rx && y > q.y - q.house!.top - 40 && y < q.y;
      }
      return Math.hypot(x - q.x, y - q.y) < q.rx + rx + 14;
    });
  const given = new Set<Plat>();
  for (let guard = 0; guard < 80; guard++) {
    const sorted = plats.slice().sort((a, b) => b.y - a.y);
    const stuck = sorted.find((p) => {
      if (p.y < top || given.has(p)) return false;
      const s = spot(p);
      // logs drift across the river, so they can't be counted on as the way forward
      return !plats.some((q) => q !== p && q.kind !== 'log' && q.y < s.y - 60 && Math.hypot(q.x - s.x, q.y - s.y) <= reach);
    });
    if (!stuck) return;
    const s = spot(stuck);
    const rx = 48;
    let at: [number, number] | null = null;
    for (const dy of [170, 140, 200]) {
      for (const dx of [0, 80, -80, 140, -140, 190, -190]) {
        const x = clamp(s.x + dx, riverL + rx + 6, riverR - rx - 6);
        if (Math.hypot(x - s.x, dy) <= reach && !blocked(x, s.y - dy, rx)) {
          at = [x, s.y - dy];
          break;
        }
      }
      if (at) break;
    }
    // Nowhere free (a roof in the way): leave it, the side lily next to the house is the way out.
    if (!at) given.add(stuck);
    else plats.push(plat('lily', at[0], at[1], rx, rx * 0.6, { variant: guard % 4 }));
  }
}
