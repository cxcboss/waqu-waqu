// The courier has the same inputs as a player: press, pull, release, steer and tap.
import { TUNING, SIZE_INFO } from './config';
import type { Plat } from './level';
import type { PlayScene } from './play';

const TOUCH = -1;
const DECISION = 0.16;
const AIM_TIME = 0.2;
type View = PlayScene['autoplayView'];
type Point = { x: number; y: number };

export function tap(scene: { down(x: number, y: number, id: number): void; up(x: number, y: number, id: number): void }, { x, y }: Point) {
  scene.down(x, y, TOUCH);
  scene.up(x, y, TOUCH);
}

export function center(r: { x: number; y: number; w: number; h: number }): Point {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

interface Hop {
  pad: Plat;
  pull: Point;
}

function standSpot(p: Plat): Point {
  if (p.kind === 'truck') return { x: p.x - 48, y: p.y + 28 };
  if (p.house) return { x: p.x + p.house.porch.x, y: p.y + p.house.porch.y };
  return p;
}

interface RouteNode extends Point {
  pad: Plat;
  cost: number;
  visited: boolean;
  first?: Hop;
}

export class CourierAutoplay {
  private next = 0;
  private aimed: { at: number; start: Point; hop: Hop } | null = null;
  private wheel: Point | null = null;
  private recent = new Map<Plat, number>();

  constructor(private retry = 0) {}

  cancel(scene: PlayScene) {
    if (this.aimed || this.wheel) scene.cancel(TOUCH);
    this.aimed = null;
    this.wheel = null;
  }

  update(scene: PlayScene) {
    const v = scene.autoplayView;
    const { time, frog, height } = v;
    if (v.blocked) {
      this.cancel(scene);
      return;
    }
    if (this.aimed) {
      const a = this.aimed;
      if (v.held !== TOUCH) {
        this.aimed = null;
        return;
      }
      if (time < a.at) return;
      this.aimed = null;
      const pull = scene.autoplayPull(a.hop.pad);
      if (pull) {
        const x = a.start.x + pull.x, y = a.start.y + pull.y;
        scene.move(x, y, TOUCH);
        scene.up(x, y, TOUCH);
        if (frog.on) this.recent.set(frog.on, time);
      } else scene.cancel(TOUCH);
      this.next = time + DECISION;
      return;
    }
    if (v.swim) {
      this.swim(scene, v, v.swim);
      return;
    }
    if (this.wheel) this.cancel(scene);
    if (v.held !== undefined || time < this.next) return;
    this.next = time + DECISION;
    if (v.intro) {
      if (time >= 0.75 && v.intro.w) tap(scene, center(v.intro));
      return;
    }
    if (v.till) {
      if (v.change) tap(scene, center(v.change));
      return;
    }
    if (v.gull && v.gull.x >= 0 && v.gull.x <= 750 && v.gull.y >= v.safeTop && v.gull.y < height) {
      tap(scene, v.gull);
      return;
    }
    const on = frog.on;
    if (frog.state !== 'stand' || !on || !frog.ready) return;
    const wet = v.floaters.find((p) => Math.hypot(p.x - frog.x, p.y - frog.y + v.camY) < 130);
    if (wet) {
      tap(scene, wet);
      return;
    }

    const nearOrder = v.bag.filter((o) => !o.ret && !o.house.passed).sort((a, b) => a.house.id - b.house.id)[0];
    const fitting = v.cards.filter((c) => SIZE_INFO[c.order.size].slots <= v.free);
    if (on === v.truck && !v.guide) {
      const cargo = fitting.find((c) => c.where === 'truck' &&
        (!nearOrder || c.order.house.plat.y > nearOrder.house.plat.y - height * 0.76));
      if (cargo) {
        tap(scene, center(cargo.rect));
        return;
      }
    }
    if (on.house) {
      const matching = v.cards.find((c) => c.where === 'bag' && c.order.house === on.house)
        ?? fitting.find((c) => c.where === 'ret');
      if (matching) {
        tap(scene, center(matching.rect));
        return;
      }
    }
    if (v.pick) return;
    const ret = v.orders.filter((o) => o.ret && o.state === 'pool' && !o.house.passed && SIZE_INFO[o.size].slots <= v.free &&
      o.house.plat.y - v.camY > v.safeTop + 140).sort((a, b) => a.house.id - b.house.id)[0];
    const nextCargo = v.orders.filter((o) => !o.ret && !o.later && o.state === 'pool' && !o.house.passed)
      .sort((a, b) => a.house.id - b.house.id)[0];
    const nextStop = nearOrder ?? nextCargo;
    const collectReturn = ret && !v.bag.some((o) => o.ret) && (!nextStop || ret.house.id <= nextStop.house.id);
    const task = collectReturn ? ret : nearOrder;
    const goal = v.guide ?? task?.house.plat ?? v.truck;
    if (goal === on) return;
    const goalY = goal.y - v.camY;
    const waitLine = Math.max(v.safeTop + 140, height * (0.28 + (this.retry % 4) * 0.025));
    if (!v.guide && goal !== v.truck && goalY < waitLine && on === v.truck) return;
    const hop = this.route(scene, v, goal);
    if (hop) this.startPull(scene, v, hop);
  }

  private startPull(scene: PlayScene, v: View, hop: Hop) {
    const y = Math.max(v.safeTop + 105, v.height * 0.35);
    for (const x of [365, 230, 500]) {
      if (y + hop.pull.y < 2 || y + hop.pull.y > v.height - 2 || !scene.autoplayTouchPoint(x, y)) continue;
      scene.down(x, y, TOUCH);
      scene.move(x + hop.pull.x, y + hop.pull.y, TOUCH);
      this.aimed = { at: v.time + AIM_TIME, start: { x, y }, hop };
      return;
    }
  }

  private route(scene: PlayScene, v: View, goal: Plat): Hop | undefined {
    if (v.guide) {
      const pull = scene.autoplayPull(goal);
      if (pull) return { pad: goal, pull };
    }
    const { frog, camY, height } = v;
    const upper = v.safeTop + 120;
    const lower = height * 0.82;
    const safe = (p: Plat) => !p.gone && !p.used && (p.hp === undefined || p.hp > 1)
      && (p.bud === undefined || p.bud < 0.9) && (!p.house?.goose || p === goal);
    const nodes: RouteNode[] = [...v.plats, v.truck].filter((p) =>
      p !== frog.on && safe(p) && p.y - camY >= upper && p.y - camY <= lower
    ).map((pad) => ({ pad, ...standSpot(pad), cost: Infinity, visited: false }));
    const source = { pad: frog.on!, x: frog.x, y: frog.y, cost: 0, visited: false };
    const graph: RouteNode[] = [source, ...nodes];
    for (;;) {
      let u: RouteNode | undefined;
      for (const n of graph) if (!n.visited && Number.isFinite(n.cost) && (!u || n.cost < u.cost)) u = n;
      if (!u) break;
      if (u.pad === goal) return u.first;
      u.visited = true;
      for (const n of nodes) {
        if (n.visited) continue;
        const dist = Math.hypot(n.x - u.x, n.y - u.y);
        if (dist > v.reach + (u === source ? Math.min(55, n.pad.rx * 0.8) : 12)) continue;
        const recentlyLeft = v.time - (this.recent.get(n.pad) ?? -Infinity) < 3;
        const unstable = n.pad.amp || n.pad.bud !== undefined || n.pad.kind === 'leaf' || n.pad.kind === 'stone';
        const cost = u.cost + 110 + dist + (unstable ? 55 : 0) +
          (recentlyLeft && n.pad !== goal ? 145 : 0) + Math.max(0, n.y - camY - height * 0.67) * 0.9;
        if (cost >= n.cost) continue;
        let first = u.first;
        if (u === source) {
          const pull = scene.autoplayPull(n.pad);
          if (!pull) continue;
          first = { pad: n.pad, pull };
        }
        n.cost = cost;
        n.first = first;
      }
    }
    // A house outside the view or a moving platform that isn't reachable yet: move within the
    // current part of the river only if it improves our position, then look again after landing.
    const to = standSpot(goal);
    const toY = Math.max(height * 0.34 + camY, to.y);
    const distance = (p: Point) => Math.hypot(p.x - to.x, p.y - toY);
    const danger = frog.y - camY > height * 0.69;
    const current = distance(frog);
    let best = danger ? Infinity : current - 48;
    let first: Hop | undefined;
    for (const n of nodes) {
      if (!n.first || (n.pad === v.truck && goal !== v.truck)) continue;
      if (danger && n.y > frog.y - 85) continue;
      if (!danger && Math.abs(n.y - camY) < height * 0.31 && goal.y - camY < height * 0.28) continue;
      const cost = distance(n) + n.cost * 0.13;
      if (cost < best) {
        best = cost;
        first = n.first;
      }
    }
    return first;
  }

  private swim(scene: PlayScene, v: View, swim: NonNullable<View['swim']>) {
    const f = { x: v.frog.x, y: v.frog.y - v.camY };
    const parcel = v.floaters.find((p) => Math.hypot(p.x - f.x, p.y - f.y) < 125);
    if (parcel && v.time >= this.next) {
      tap(scene, parcel);
      this.next = v.time + 0.25;
    }
    if (swim.green && swim.target && (!swim.target.house?.goose) && swim.target.kind !== 'dam') {
      const p = [140, 260, 400].map((x) => ({ x, y: v.height * 0.36 })).find(({ x, y }) => scene.autoplayTouchPoint(x, y));
      if (p) {
        this.cancel(scene);
        tap(scene, p);
        return;
      }
    }
    const goal = v.floaters[0] ?? v.plats.filter((p) => !p.gone && !p.used && !p.house?.goose &&
      p.y - v.camY > v.safeTop + 130 && p.y <= v.frog.y + 25 && p.kind !== 'dam')
      .map((p) => ({ x: p.x, y: p.y - v.camY }))
      .reduce<Point>((a, p) => Math.hypot(p.x - f.x, p.y - f.y) < Math.hypot(a.x - f.x, a.y - f.y) ? p : a,
        { x: Math.min(TUNING.riverR - 20, f.x), y: f.y - 300 });
    const dx = goal.x - f.x, dy = goal.y - f.y, d = Math.hypot(dx, dy) || 1;
    const w = swim.wheel;
    const p = { x: w.x + dx / d * w.r * 0.7, y: w.y + dy / d * w.r * 0.7 };
    if (!this.wheel) scene.down(p.x, p.y, TOUCH);
    else scene.move(p.x, p.y, TOUCH);
    this.wheel = p;
  }
}
