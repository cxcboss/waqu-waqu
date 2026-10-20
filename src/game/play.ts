import { INK, P } from '../art/palette';
import { K, TILE_H } from '../art/sprites';
import { button, ellipse, hit, panel, plate, roundRect, text, type Rect } from '../art/ui';
import { approach, clamp, easeOutBack, easeOutCubic, lerp, springOut } from '../engine/math';
import type { LoopHandle } from '../engine/audio';
import type { Canvas, Ctx } from '../platform/types';
import { SIZE_INFO, TUNING } from './config';
import type { Game, Scene } from './game';
import { HqScene, type DayResult, type Photo } from './hq';
import { buildLevel, dayConfig, type House, type Level, type Order, type Plat } from './level';
import { TitleScene } from './title';

const FROG_S = 0.92; // frog sprite scale on top of K, matching the concept art
const TILE = TILE_H * K;

interface Jump {
  x0: number; y0: number; x1: number; y1: number;
  t: number; T: number; H: number; dist: number;
  whistled?: boolean;
}

interface Frog {
  state: 'stand' | 'jump' | 'swim';
  x: number; y: number; z: number;
  on: Plat | null;
  lx: number; ly: number;
  settle: { fx: number; fy: number; tx: number; ty: number; t: number } | null;
  jump: Jump | null;
  vx: number; vy: number;
  swimT: number;
  strokeT: number;
  landT: number;
  swing: number; swingV: number;
}

interface Fx {
  kind: 'ripple' | 'splash' | 'dust' | 'floatBox' | 'heart' | 'fly' | 'qmark';
  x: number; y: number; t: number; dur: number;
  size?: number; urgent?: boolean;
  /** For 'fly': screen-space start and end. */
  x2?: number; y2?: number;
}

interface Popup { text: string; x: number; y: number; t: number; color: string }

interface Shot { at: number; caption: string; prio: number; kind: string; thrown?: boolean }

interface Card { order: Order; rect: Rect }

type HintKey = 'pick' | 'aim' | 'deliver' | 'refill' | 'swim' | 'warn' | 'urgent' | 'heavy';

export class PlayScene implements Scene {
  private lv: Level;
  private camY = 0;
  private speedK = 1;
  private slowT = 0;
  private slowCd = 0;
  private time = 0;
  private frog: Frog;
  private bag: Order[] = [];
  private aim: { id: number; sx: number; sy: number; x: number; y: number; t: number } | null = null;
  private fx: Fx[] = [];
  private popups: Popup[] = [];
  private photos: Photo[] = [];
  private shots: Shot[] = [];
  private hintsDone = new Set<HintKey>();
  private hint: { key: HintKey; text: string; t: number; hand: boolean; dur: number } | null = null;
  private banner: { title: string; sub: string; t: number; dur: number } | null = null;
  private toast: { text: string; t: number } | null = null;
  private ended: null | 'done' | 'thrown' = null;
  private endT = 0;
  private paused = false;
  private warnK = 0;
  private warnBuzz = 0;
  private warnSfx = 0;
  private inWarnT = 0;
  private stats = { falls: 0, jumps: 0, longest: 0, closeCalls: 0 };
  private cards: Card[] = [];
  private trayMode: 'pickup' | 'deliver' | 'bag' = 'bag';
  private pauseBtn: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private menuBtns: { id: string; rect: Rect }[] = [];
  private shakeCard: { id: number; t: number } | null = null;
  private pressed: string | null = null;
  private amb: LoopHandle | null = null;
  private engine: LoopHandle | null = null;
  private bubbles: LoopHandle | null = null;
  private charge: LoopHandle | null = null;
  private chargeMax = false;
  private predicted = false;
  private tick: LoopHandle | null = null;

  constructor(private game: Game, readonly day: number) {
    const cfg = dayConfig(day);
    this.lv = buildLevel(cfg, game.H);
    const truck = this.lv.trucks[0];
    this.placeTrucks();
    this.frog = {
      state: 'stand', x: truck.x, y: truck.y + 40, z: 0, on: truck, lx: 0, ly: 40, settle: null, jump: null,
      vx: 0, vy: 0, swimT: 0, strokeT: 9, landT: 9, swing: 0, swingV: 0,
    };
    this.slowT = TUNING.truckSlowSec;
    this.slowCd = TUNING.truckSlowSec + TUNING.slowCooldown;
    this.banner = { title: `第${day}天 · 开工！`, sub: cfg.intro, t: 0, dur: 2.2 };
    game.audio.play('truck_horn', { delay: 0.2 });
    game.audio.setMusic('bgm_work');
    this.queueShot('start', '上班出发！', 1, 1.2);
  }

  private get H() {
    return this.game.H;
  }
  private get cfg() {
    return this.lv.cfg;
  }
  private sy(worldY: number) {
    return worldY - this.camY;
  }

  // ---------------------------------------------------------------- update

  update(dt: number) {
    if (this.paused) return;
    this.time += dt;
    const cfg = this.cfg;

    this.slowT = Math.max(0, this.slowT - dt);
    this.slowCd = Math.max(0, this.slowCd - dt);
    const target = this.ended === 'done' ? 0 : this.slowT > 0 ? TUNING.slowFactor : 1;
    this.speedK = approach(this.speedK, target, 4, dt);
    this.camY -= cfg.speed * this.speedK * dt;

    this.placeTrucks();
    for (const p of this.lv.plats) {
      p.bobT += dt;
      if (p.kind === 'log') {
        p.x += p.drift * dt;
        if (p.x < TUNING.riverL + 84) p.drift = Math.abs(p.drift);
        if (p.x > TUNING.riverR - 84) p.drift = -Math.abs(p.drift);
      }
    }
    for (const h of this.lv.houses) if (h.react) h.react.t += dt;

    this.updateFrog(dt);
    if (this.aim) this.aim.t += dt;
    this.updateSound();

    if (!this.ended) {
      this.checkHouses();
      this.checkUrgent();
      this.checkDanger(dt);
      this.tutorial();
      if (-this.camY >= cfg.length) this.endDay('done');
    } else {
      this.endT += dt;
      if (this.endT > 2.6) this.finish();
    }

    for (const f of this.fx) f.t += dt;
    this.fx = this.fx.filter((f) => f.t < f.dur);
    for (const p of this.popups) p.t += dt;
    this.popups = this.popups.filter((p) => p.t < 1.2);
    if (this.banner && (this.banner.t += dt) > this.banner.dur) this.banner = null;
    if (this.toast && (this.toast.t += dt) > 2.2) this.toast = null;
    if (this.hint && (this.hint.t += dt) > this.hint.dur) this.hint = null;
    if (this.shakeCard && (this.shakeCard.t += dt) > 0.4) this.shakeCard = null;
  }

  private placeTrucks() {
    for (const t of this.lv.trucks) {
      t.y = this.camY + this.H * TUNING.truckAnchor[t.side] + Math.sin(this.time * 0.55 + t.side * 2.1) * 26;
    }
  }

  private updateFrog(dt: number) {
    const f = this.frog;
    if (f.state === 'stand' && f.on) {
      const p = f.on;
      if (f.settle) {
        f.settle.t += dt;
        const k = easeOutCubic(Math.min(1, f.settle.t / 0.16));
        f.lx = lerp(f.settle.fx, f.settle.tx, k);
        f.ly = lerp(f.settle.fy, f.settle.ty, k);
        if (f.settle.t >= 0.16) f.settle = null;
      }
      f.x = p.x + f.lx;
      f.y = p.y + f.ly;
      f.landT += dt;
    } else if (f.state === 'jump' && f.jump) {
      const j = f.jump;
      j.t += dt;
      const k = Math.min(1, j.t / j.T);
      f.x = lerp(j.x0, j.x1, k);
      f.y = lerp(j.y0, j.y1, k);
      f.z = 4 * j.H * k * (1 - k);
      if (k >= 0.55 && !j.whistled) {
        j.whistled = true;
        if (!this.findPlat(j.x1, j.y1)) this.game.audio.play('fall_whistle', { volume: 0.8 });
      }
      if (k >= 1) this.land(j.x1, j.y1);
    } else if (f.state === 'swim') {
      f.swimT += dt;
      f.strokeT += dt;
      const d = Math.exp(-TUNING.swimDrag * dt);
      f.vx *= d;
      f.vy *= d;
      f.x = clamp(f.x + f.vx * dt, TUNING.riverL - 24, TUNING.riverR + 24);
      f.y += (f.vy + TUNING.current) * dt;
      if (f.swimT > 0.4) {
        const p = this.findPlat(f.x, f.y, true);
        if (p) this.standOn(p, f.x, f.y, 'climb');
      }
    }
    // satchel swing spring
    f.swingV += (-60 * f.swing - 6 * f.swingV) * dt;
    f.swing += f.swingV * dt;
  }

  private weight() {
    return this.bag.reduce((w, o) => w + SIZE_INFO[o.size].weight, 0);
  }
  private slotsUsed() {
    return this.bag.reduce((w, o) => w + SIZE_INFO[o.size].slots, 0);
  }
  private maxJump() {
    return TUNING.maxJump * (1 - TUNING.weightPenalty * this.weight());
  }

  /** Finds what's under a world point: truck, river object, bank, or null for water. */
  private findPlat(x: number, y: number, swimming = false): Plat | null {
    for (const t of this.lv.trucks) {
      if (Math.abs(x - t.x) <= t.rx + 14 && Math.abs(y - t.y) <= t.ry + 16) return t;
    }
    let best: Plat | null = null;
    let bestN = swimming ? 0.92 : 1;
    for (const p of this.lv.plats) {
      if (Math.abs(p.y - y) > 200) continue;
      let n: number;
      if (p.kind === 'lily') n = ((x - p.x) / (p.rx * 1.12)) ** 2 + ((y - p.y) / (p.ry * 1.32)) ** 2;
      else if (p.kind === 'house') n = ((x - p.x) / (p.rx * 1.08)) ** 2 + ((y - p.y) / (p.ry * 1.4)) ** 2;
      else {
        const c = Math.cos(-p.rot), s = Math.sin(-p.rot);
        const lx = (x - p.x) * c - (y - p.y) * s;
        const ly = (x - p.x) * s + (y - p.y) * c;
        n = Math.max(Math.abs(lx) / (p.rx + 12), Math.abs(ly) / (p.ry + 18));
      }
      if (n <= bestN) {
        bestN = n;
        best = p;
      }
    }
    if (best) return best;
    const edge = swimming ? 8 : -2;
    if (x < TUNING.riverL + edge) return this.lv.banks[0];
    if (x > TUNING.riverR - edge) return this.lv.banks[1];
    return null;
  }

  private standOn(p: Plat, x: number, y: number, how: 'jump' | 'climb') {
    const f = this.frog;
    // Climbing out next to a truck puts you on the truck.
    if (p.kind === 'bank') {
      for (const t of this.lv.trucks) {
        if (t.side === p.side && Math.abs(y - t.y) <= t.ry + 30) {
          p = t;
          break;
        }
      }
    }
    let tx: number, ty: number;
    let cx = x - p.x, cy = y - p.y;
    switch (p.kind) {
      case 'truck':
        tx = clamp(cx, -34, 34);
        ty = clamp(cy, 8, 72);
        break;
      case 'house':
        tx = p.house!.porch.x;
        ty = p.house!.porch.y;
        break;
      case 'lily':
        tx = cx * 0.5;
        ty = cy * 0.5;
        break;
      case 'log': {
        const c = Math.cos(p.rot), s = Math.sin(p.rot);
        const along = clamp(cx * c + cy * s, -p.rx + 18, p.rx - 18);
        tx = along * c;
        ty = along * s;
        break;
      }
      default:
        cx = x;
        cy = y;
        tx = p.side === 0 ? Math.min(x, TUNING.riverL - 26) : Math.max(x, TUNING.riverR + 26);
        ty = y;
    }
    f.state = 'stand';
    f.on = p;
    f.z = 0;
    f.jump = null;
    f.landT = 0;
    f.lx = cx;
    f.ly = cy;
    f.settle = { fx: cx, fy: cy, tx, ty, t: 0 };
    f.swingV += 5 + this.weight() * 1.5;
    p.bobT = 0;
    const au = this.game.audio;
    if (how === 'climb') {
      au.play('swim_climb');
      this.bubbles?.stop(0.2);
      this.bubbles = null;
      au.duck(false);
      this.doneHint('swim');
      if (this.sy(y) > this.H * TUNING.warnLine) {
        this.stats.closeCalls++;
        this.queueShot('close', '极限上岸！', 7, 0.2);
      }
    } else if (p.kind === 'truck') au.play('land_truck');
    else if (p.kind === 'lily' || p.kind === 'log') au.play('land_pad', { jitter: true });
    else au.play('land_house');
    if (p.kind === 'lily' || p.kind === 'log') this.fx.push({ kind: 'ripple', x: p.x, y: p.y + 6, t: 0, dur: 0.8, size: p.rx * 1.2 });
    else this.fx.push({ kind: 'dust', x: f.x, y: f.y, t: 0, dur: 0.5 });

    if (p.kind === 'truck') {
      this.game.platform.vibrate(12);
      if (this.slowCd <= 0) {
        this.slowT = TUNING.truckSlowSec;
        this.slowCd = TUNING.truckSlowSec + TUNING.slowCooldown;
        au.play('truck_slowdown', { volume: 0.7, delay: 0.1 });
      }
      this.doneHint('refill');
    } else if (p.kind === 'house' && this.bag.length) {
      if (this.slowCd <= 0) {
        this.slowT = TUNING.houseSlowSec;
        this.slowCd = TUNING.houseSlowSec + TUNING.slowCooldown;
      }
      if (this.cfg.tutorial) this.showHint('deliver', '看门牌号和颜色，点对应的包裹交给住户', { dur: 8 });
    }
  }

  private land(x: number, y: number) {
    const j = this.frog.jump!;
    const p = this.findPlat(x, y);
    if (p) {
      this.standOn(p, x, y, 'jump');
      if (j.dist > 285 && p.kind !== 'bank' && j.dist > this.stats.longest) {
        this.stats.longest = j.dist;
        this.shots = this.shots.filter((s) => s.kind !== 'long');
        this.photos = this.photos.filter((s) => s.kind !== 'long');
        this.queueShot('long', `飞跃${(j.dist / 100).toFixed(1)}米！`, 5, 0.15);
      }
    } else this.fall(x, y);
  }

  private fall(x: number, y: number) {
    const f = this.frog;
    f.state = 'swim';
    f.on = null;
    f.jump = null;
    f.z = 0;
    f.x = x;
    f.y = y;
    f.vx = 0;
    f.vy = 0;
    f.swimT = 0;
    this.slowT = 0;
    this.stats.falls++;
    const wet = this.bag.splice(0);
    wet.forEach((o, i) => {
      o.state = 'wet';
      this.fx.push({ kind: 'floatBox', x: x + (i - (wet.length - 1) / 2) * 34, y: y + 10, t: 0, dur: 3.2, size: o.size, urgent: o.urgent });
    });
    this.fx.push({ kind: 'splash', x, y, t: 0, dur: 0.7 });
    this.fx.push({ kind: 'ripple', x, y, t: 0, dur: 1, size: 70 });
    const au = this.game.audio;
    au.play('splash');
    if (wet.length) au.play('parcel_soaked', { delay: 0.35 });
    au.duck(true);
    this.bubbles?.stop();
    this.bubbles = au.loop('swim_bubbles', { volume: 0.5, fadeIn: 0.6 });
    this.game.platform.vibrate(70);
    this.queueShot('splash', `扑通！第${this.stats.falls}次落水`, this.stats.falls === 1 ? 8 : 6, 0.28);
    this.showHint('swim', '快速连点屏幕，游上岸！', { dur: 6 });
    if (wet.length) this.showToast(`${wet.length} 个包裹泡水了……`);
  }

  private swimStroke() {
    const f = this.frog;
    const tgt = this.nearestRefuge();
    const dx = tgt.x - f.x, dy = tgt.y - f.y;
    const d = Math.hypot(dx, dy) || 1;
    f.vx += (dx / d) * TUNING.swimImpulse;
    f.vy += (dy / d) * TUNING.swimImpulse;
    const v = Math.hypot(f.vx, f.vy);
    if (v > TUNING.swimMax) {
      f.vx *= TUNING.swimMax / v;
      f.vy *= TUNING.swimMax / v;
    }
    f.strokeT = 0;
    this.fx.push({ kind: 'ripple', x: f.x, y: f.y + 4, t: 0, dur: 0.6, size: 46 });
    this.game.audio.play('swim_stroke', { jitter: true });
  }

  private nearestRefuge() {
    const f = this.frog;
    let best = { x: TUNING.riverL - 20, y: f.y - 30 };
    let bestD = f.x - TUNING.riverL;
    if (TUNING.riverR - f.x < bestD) {
      bestD = TUNING.riverR - f.x;
      best = { x: TUNING.riverR + 20, y: f.y - 30 };
    }
    for (const p of this.lv.plats) {
      if (Math.abs(p.y - f.y) > 500) continue;
      let d = Math.hypot(p.x - f.x, p.y - f.y) - p.rx * 0.75;
      if (this.sy(p.y) > this.H * 0.9) d += 150;
      if (d < bestD) {
        bestD = d;
        best = { x: p.x, y: p.y };
      }
    }
    return best;
  }

  private startJump(dx: number, dy: number) {
    const f = this.frog;
    const len = Math.hypot(dx, dy);
    if (len < TUNING.deadDrag || f.state !== 'stand') return;
    const power = clamp(len / TUNING.maxDrag, 0, 1);
    const maxJ = this.maxJump();
    const dist = TUNING.minJump + power * (maxJ - TUNING.minJump);
    const ux = -dx / len, uy = -dy / len;
    f.jump = { x0: f.x, y0: f.y, x1: f.x + ux * dist, y1: f.y + uy * dist, t: 0, T: 0.34 + dist / 1000, H: 36 + dist * 0.3, dist };
    f.state = 'jump';
    f.on = null;
    f.settle = null;
    f.swingV -= 6 + this.weight() * 2;
    const au = this.game.audio;
    if (this.slowT > 0.3) au.play('truck_speedup', { volume: 0.6 });
    this.slowT = 0;
    this.stats.jumps++;
    this.stopCharge();
    au.play('jump_release');
    if (Math.random() < 0.25) au.play('frog_croak', { volume: 0.55, delay: 0.08, jitter: true });
    if (dist > 250) au.play('jump_whoosh', { volume: 0.7, delay: 0.1 });
    this.doneHint('aim');
  }

  private checkHouses() {
    for (const h of this.lv.houses) {
      if (h.passed || this.sy(h.plat.y) < this.H + 150) continue;
      h.passed = true;
      for (const o of this.lv.orders) {
        if (o.house !== h || (o.state !== 'pool' && o.state !== 'bag')) continue;
        if (o.state === 'bag') {
          this.bag = this.bag.filter((b) => b !== o);
          this.showToast(`${h.num}号的包裹没赶上`);
        }
        o.state = 'missed';
      }
    }
  }

  private checkUrgent() {
    for (const o of this.bag) {
      if (o.urgent && !o.late && this.time > o.deadline) {
        o.late = true;
        this.showToast('加急件超时了，还是要送到哦');
        this.game.audio.play('urgent_late');
      }
    }
  }

  private checkDanger(dt: number) {
    const f = this.frog;
    const onTruck = f.state === 'stand' && f.on?.kind === 'truck';
    const s = this.sy(f.y);
    if (f.state !== 'jump' && !onTruck && s > this.H + 36) {
      this.endDay('thrown');
      return;
    }
    const inWarn = f.state !== 'jump' && !onTruck && s > this.H * TUNING.warnLine;
    this.warnK = approach(this.warnK, inWarn ? 1 : 0, 6, dt);
    if (inWarn) {
      this.inWarnT += dt;
      this.warnBuzz -= dt;
      this.warnSfx -= dt;
      if (this.warnBuzz <= 0) {
        this.game.platform.vibrate(40);
        this.warnBuzz = 0.9;
      }
      if (f.state === 'stand') this.showHint('warn', '太靠下了！快往上跳，或跳回运输车', { dur: 3.5 });
    } else {
      this.inWarnT = 0;
      this.warnBuzz = 0;
      this.warnSfx = 0;
    }
  }

  private tutorial() {
    if (this.banner) return;
    const f = this.frog;
    const onTruck = f.state === 'stand' && f.on?.kind === 'truck';
    if (this.cfg.tutorial) {
      if (onTruck && !this.bag.length && !this.hintsDone.has('pick') && this.poolCards().length) {
        this.showHint('pick', '点下面的包裹，把它装进背包', { dur: 99 });
      }
      if (this.hintsDone.has('pick') && !this.hintsDone.has('aim') && f.state === 'stand') {
        this.showHint('aim', '按住屏幕往下拉，松手就往反方向跳', { dur: 99, hand: true });
      }
    }
    if (onTruck && this.poolCards().some((c) => c.order.urgent)) this.showHint('urgent', '红标签是加急件，按时送到有奖金', { dur: 5 });
    if (onTruck && this.poolCards().some((c) => c.order.size === 2)) this.showHint('heavy', '大件更重，背着它跳不远', { dur: 5 });
  }

  private endDay(kind: 'done' | 'thrown') {
    if (this.ended) return;
    this.ended = kind;
    this.endT = 0;
    this.aim = null;
    this.stopCharge();
    this.game.audio.setMusic(null);
    this.bubbles?.stop(0.3);
    this.bubbles = null;
    this.hint = null;
    if (kind === 'done') {
      this.banner = { title: '下班啦！', sub: '运输车到站，回总部交差', t: 0, dur: 9 };
      this.game.audio.play('truck_horn');
      this.game.audio.play('day_complete', { delay: 0.6 });
    } else {
      this.banner = { title: '被甩出屏幕！', sub: '今天提前下班，回总部挨训……', t: 0, dur: 9 };
      this.game.audio.play('day_fail');
      this.game.platform.vibrate(200);
      this.queueShot('thrown', '被甩出屏幕……', 9, 0, true);
    }
  }

  private finish() {
    if (!this.ended) return;
    for (const o of this.lv.orders) if (o.state === 'pool' || o.state === 'bag') o.state = 'missed';
    const orders = this.lv.orders;
    const count = (s: Order['state']) => orders.filter((o) => o.state === s).length;
    const delivered = orders.filter((o) => o.state === 'delivered');
    const pay = delivered.reduce((m, o) => m + SIZE_INFO[o.size].pay, 0);
    const urgentOnTime = delivered.filter((o) => o.urgent && !o.late).length;
    const wrong = count('wrong');
    const wet = count('wet');
    const result: DayResult = {
      day: this.day,
      thrown: this.ended === 'thrown',
      total: orders.length,
      delivered: delivered.length,
      wrong,
      wet,
      missed: count('missed'),
      urgentTotal: orders.filter((o) => o.urgent).length,
      urgentOnTime,
      pay,
      bonus: urgentOnTime * TUNING.urgentBonus,
      penalty: wrong * TUNING.wrongPenalty + wet * TUNING.wetPenalty,
      falls: this.stats.falls,
      wrongNames: orders.filter((o) => o.state === 'wrong' && o.deliveredTo).map((o) => o.deliveredTo!.name),
      photos: this.pickPhotos(),
    };
    this.ended = null;
    this.stopLoops();
    this.game.go(new HqScene(this.game, result));
  }

  // ---------------------------------------------------------------- parcels

  private poolCards(): Card[] {
    if (this.trayMode !== 'pickup') return [];
    return this.cards;
  }

  private pickup(o: Order) {
    const used = this.slotsUsed();
    if (used + SIZE_INFO[o.size].slots > this.cfg.bagSlots) {
      this.shakeCard = { id: o.id, t: 0 };
      this.game.audio.play('bag_full');
      this.showToast('背包装不下了');
      return;
    }
    o.state = 'bag';
    if (o.urgent) {
      // Enough time for the house to come down to the frog, plus a margin.
      const ahead = Math.max(0, this.H * 0.45 - this.sy(o.house.plat.y));
      o.deadline = this.time + Math.max(TUNING.urgentSeconds, ahead / this.cfg.speed + 16);
    }
    this.bag.push(o);
    if (o.urgent) this.game.audio.play('urgent_alert', { delay: 0.25 });
    const c = this.cards.find((c) => c.order === o);
    if (c) this.fx.push({ kind: 'fly', x: c.rect.x + c.rect.w / 2, y: c.rect.y + c.rect.h / 2, x2: 74, y2: this.trayY(), t: 0, dur: 0.35, size: o.size });
    this.game.audio.play('parcel_pickup');
    this.doneHint('pick');
  }

  private deliver(o: Order, h: House) {
    this.bag = this.bag.filter((b) => b !== o);
    o.deliveredTo = h;
    const rx = h.plat.x + h.resident.x, ry = h.plat.y + h.resident.y;
    const c = this.cards.find((c) => c.order === o);
    if (c) this.fx.push({ kind: 'fly', x: c.rect.x + c.rect.w / 2, y: c.rect.y + c.rect.h / 2, x2: rx, y2: this.sy(ry) - 30, t: 0, dur: 0.35, size: o.size });
    if (o.house === h) {
      o.state = 'delivered';
      h.react = { kind: 'happy', t: 0 };
      const amount = SIZE_INFO[o.size].pay + (o.urgent && !o.late ? TUNING.urgentBonus : 0);
      this.popups.push({ text: `+${amount}`, x: rx, y: ry - 70, t: 0, color: P.lilyDeep });
      this.fx.push({ kind: 'heart', x: rx, y: ry - 60, t: 0, dur: 1.1 });
      this.game.audio.play('parcel_place');
      this.game.audio.play('deliver_happy', { delay: 0.12 });
      this.game.audio.play('coin', { delay: 0.35, volume: 0.8 });
      const n = this.lv.orders.filter((x) => x.state === 'delivered').length;
      if (n === 1) this.queueShot('first', '第一单送达！', 4, 0.3);
      if (o.urgent && !o.late) this.queueShot('urgent', '加急件准时送达！', 5, 0.3);
    } else {
      // Not blocked: the review at HQ catches it. The resident just looks puzzled.
      o.state = 'wrong';
      h.react = { kind: 'confused', t: 0 };
      this.game.audio.play('parcel_place');
      this.game.audio.play('deliver_confused', { delay: 0.15 });
      this.queueShot('wrong', `${h.name}：这是我的吗？`, 7, 0.5);
    }
    this.doneHint('deliver');
    if (this.cfg.tutorial && !this.bag.length && this.lv.orders.some((x) => x.state === 'pool')) {
      this.showHint('refill', '送完了！跳回运输车再取件', { dur: 6 });
    }
  }

  // ---------------------------------------------------------------- input

  down(x: number, y: number, id: number) {
    if (this.paused) {
      for (const b of this.menuBtns) if (hit(b.rect, x, y)) this.pressed = b.id;
      return;
    }
    if (this.ended) return;
    if (hit(this.pauseBtn, x, y, 14)) {
      this.paused = true;
      this.aim = null;
      this.stopCharge();
      this.game.audio.play('ui_open');
      return;
    }
    for (const c of this.cards) {
      if (!hit(c.rect, x, y, 4)) continue;
      if (this.trayMode === 'pickup') this.pickup(c.order);
      else if (this.trayMode === 'deliver' && this.frog.on?.house) this.deliver(c.order, this.frog.on.house);
      if (this.trayMode !== 'bag') return;
    }
    const f = this.frog;
    if (f.state === 'swim') {
      this.swimStroke();
      return;
    }
    if (f.state === 'stand' && !this.aim) this.aim = { id, sx: x, sy: y, x, y, t: 0 };
  }

  move(x: number, y: number, id: number) {
    if (this.aim && this.aim.id === id) {
      this.aim.x = x;
      this.aim.y = y;
    }
  }

  up(x: number, y: number, id: number) {
    if (this.paused) {
      const b = this.menuBtns.find((b) => b.id === this.pressed && hit(b.rect, x, y));
      this.pressed = null;
      if (b) this.menu(b.id);
      return;
    }
    if (!this.aim || this.aim.id !== id) return;
    const a = this.aim;
    this.aim = null;
    if (this.frog.state === 'stand') this.startJump(x - a.sx, y - a.sy);
    this.stopCharge();
  }

  private stopCharge() {
    this.charge?.stop(0.05);
    this.charge = null;
  }

  private stopLoops() {
    this.stopCharge();
    for (const h of [this.amb, this.engine, this.bubbles, this.tick]) h?.stop(0.4);
    this.amb = this.engine = this.bubbles = this.tick = null;
    this.game.audio.duck(false);
  }

  /** Keeps ambience, charge-up and countdown sounds in step with the game state. */
  private updateSound() {
    const au = this.game.audio;
    if (!this.ended) {
      if (!this.amb) this.amb = au.loop('amb_river', { fadeIn: 1.5 });
      if (!this.engine) this.engine = au.loop('truck_engine_loop', { volume: 0.6, fadeIn: 2 });
    }
    this.engine?.setRate(0.8 + this.speedK * 0.2);
    if (this.aim && this.frog.state === 'stand') {
      const p = this.aimPower();
      if (!this.charge && p > 0.08 && !this.chargeMax) this.charge = au.loop('jump_charge', { once: true, volume: 0.8 });
      this.charge?.setRate(0.9 + 0.25 * p);
      if (p >= 0.99 && !this.chargeMax) {
        this.chargeMax = true;
        au.play('jump_charge_max', { volume: 0.8 });
      }
      if (!this.predicted && this.aim.t >= this.cfg.predictDelay && p > 0.1) {
        this.predicted = true;
        au.play('aim_predict', { volume: 0.6 });
      }
    } else {
      this.chargeMax = false;
      this.predicted = false;
    }
    const soon = this.bag.some((o) => o.urgent && !o.late && o.deadline - this.time <= 10);
    if (soon && !this.tick && !this.ended) this.tick = au.loop('urgent_tick_loop', { volume: 0.6 });
    if ((!soon || this.ended) && this.tick) {
      this.tick.stop(0.2);
      this.tick = null;
    }
  }

  blur() {
    if (!this.ended) this.paused = true;
    this.aim = null;
    this.stopCharge();
  }

  private menu(id: string) {
    this.game.audio.play(id === 'resume' ? 'ui_close' : 'ui_tap');
    if (id === 'resume') this.paused = false;
    else if (id === 'restart') {
      this.stopLoops();
      this.game.go(new PlayScene(this.game, this.day));
    } else if (id === 'title') {
      this.stopLoops();
      this.game.go(new TitleScene(this.game));
    } else if (id === 'sound') this.game.setSound(!this.game.save.sound);
  }

  // ---------------------------------------------------------------- hints, photos

  private showHint(key: HintKey, text: string, o: { dur?: number; hand?: boolean } = {}) {
    if (this.hintsDone.has(key) || this.hint?.key === key) return;
    if (this.hint && this.hint.dur > 50 && key !== 'swim' && key !== 'warn') return; // don't bump a pending tutorial step
    this.hint = { key, text, t: 0, hand: !!o.hand, dur: o.dur ?? 5 };
    if (key !== 'pick' && key !== 'aim') this.hintsDone.add(key);
  }

  private doneHint(key: HintKey) {
    this.hintsDone.add(key);
    if (this.hint?.key === key) this.hint = null;
  }

  private showToast(t: string) {
    this.toast = { text: t, t: 0 };
  }

  private queueShot(kind: string, caption: string, prio: number, delay: number, thrown = false) {
    this.shots.push({ at: this.time + delay, caption, prio, kind, thrown });
  }

  /** Copies the area around the frog from the frame being drawn: a real "photo" of the moment. */
  private takeShots(ctx: Ctx) {
    const due = this.shots.filter((s) => s.at <= this.time);
    if (!due.length) return;
    this.shots = this.shots.filter((s) => s.at > this.time);
    const src = ctx.canvas as Canvas;
    const sc = this.game.scale;
    const f = this.frog;
    for (const s of due) {
      const w = 300, h = 230;
      const cx = clamp(f.x, w / 2, 750 - w / 2);
      const fy = s.thrown ? this.H - 90 : this.sy(f.y) - f.z - 50;
      const cy = clamp(fy, h / 2, this.H - h / 2);
      const ps = Math.min(sc, 1.5);
      const c = this.game.platform.createCanvas(w * ps, h * ps);
      c.getContext('2d')!.drawImage(src, (cx - w / 2) * sc, (cy - h / 2) * sc, w * sc, h * sc, 0, 0, c.width, c.height);
      this.photos.push({ img: c, caption: s.caption, prio: s.prio, kind: s.kind, t: this.time });
      if (this.photos.length > 10) {
        this.photos.sort((a, b) => b.prio - a.prio);
        this.photos.length = 10;
      }
    }
  }

  private pickPhotos(): Photo[] {
    const sorted = [...this.photos].sort((a, b) => b.prio - a.prio || a.t - b.t);
    const out: Photo[] = [];
    const kinds = new Set<string>();
    for (const p of sorted) {
      if (out.length >= 3) break;
      if (kinds.has(p.kind)) continue;
      kinds.add(p.kind);
      out.push(p);
    }
    return out.sort((a, b) => a.t - b.t);
  }

  // ---------------------------------------------------------------- render

  render(ctx: Ctx) {
    const H = this.H;
    this.refreshTray();
    // River background tiles
    const k0 = Math.floor(this.camY / TILE);
    for (let k = k0; k * TILE - this.camY < H; k++) {
      ctx.drawImage(this.game.sprites.get('river').img, 0, k * TILE - this.camY, 750, TILE + 1);
    }
    this.drawWorld(ctx);
    this.takeShots(ctx);
    this.drawAim(ctx);
    this.drawWarn(ctx);
    this.drawHud(ctx);
    if (this.paused) this.drawPause(ctx);
  }

  private refreshTray() {
    const f = this.frog;
    const on = f.state === 'stand' ? f.on : null;
    this.trayMode = this.ended ? 'bag' : on?.kind === 'truck' ? 'pickup' : on?.kind === 'house' && this.bag.length ? 'deliver' : 'bag';
    const list: Order[] = this.trayMode === 'pickup'
      ? this.lv.orders.filter((o) => o.state === 'pool' && !o.house.passed).sort((a, b) => b.house.plat.y - a.house.plat.y).slice(0, 4)
      : this.bag.slice(0, 4);
    const small = this.trayMode === 'bag';
    const cw = small ? 84 : 108, ch = small ? 98 : 124, gap = small ? 8 : 10;
    const y = this.trayY() - ch / 2;
    this.cards = list.map((order, i) => ({ order, rect: { x: 146 + i * (cw + gap), y, w: cw, h: ch } }));
  }

  private trayY() {
    return this.H - this.game.safeB - 96;
  }

  private drawWorld(ctx: Ctx) {
    const H = this.H;
    const f = this.frog;
    type D = { y: number; draw: () => void };
    const items: D[] = [];
    for (const p of this.lv.plats) {
      const s = this.sy(p.y);
      if (s < -260 || s > H + 140) continue;
      items.push({ y: p.y, draw: () => this.drawPlat(ctx, p) });
    }
    for (const t of this.lv.trucks) items.push({ y: t.y, draw: () => this.drawTruck(ctx, t) });
    // Effects that sit on the water go first.
    for (const e of this.fx) if (e.kind === 'ripple' || e.kind === 'floatBox') items.push({ y: e.y - 40, draw: () => this.drawFx(ctx, e) });
    if (f.state !== 'jump') {
      const key = f.state === 'stand' && f.on ? (f.on.kind === 'bank' ? f.y : f.on.y + 0.5 + (f.on.kind === 'house' ? 40 : 0)) : f.y;
      items.push({ y: key, draw: () => this.drawFrog(ctx) });
    }
    items.sort((a, b) => a.y - b.y);
    for (const it of items) it.draw();
    // Target markers for tutorial days
    if (this.cfg.markTargets) {
      for (const h of this.lv.houses) {
        if (!this.bag.some((o) => o.house === h)) continue;
        const x = h.plat.x, y = this.sy(h.plat.y) - 200 + Math.sin(this.time * 5) * 6;
        if (y < -20 || y > H) continue;
        ctx.save();
        ctx.fillStyle = P.orange;
        ctx.strokeStyle = INK;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(x - 16, y - 18);
        ctx.lineTo(x + 16, y - 18);
        ctx.lineTo(x, y + 4);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }
    if (f.state === 'jump') this.drawFrog(ctx);
    for (const e of this.fx) if (e.kind !== 'ripple' && e.kind !== 'floatBox' && e.kind !== 'fly') this.drawFx(ctx, e);
    for (const p of this.popups) {
      const k = p.t / 1.2;
      text(ctx, p.text, p.x, this.sy(p.y) - 40 * easeOutCubic(k), 34, { color: p.color, bold: true, alpha: 1 - k * k });
    }
  }

  private drawPlat(ctx: Ctx, p: Plat) {
    const sp = this.game.sprites;
    const x = p.x, y = this.sy(p.y);
    const bob = p.bobT < 1 ? springOut(p.bobT / 0.9, 1.5) : 0;
    if (p.kind === 'lily') {
      const s = p.rx / (100 * K);
      sp.draw(ctx, `lily${p.variant}`, x, y + bob * 4, s * (1 + bob * 0.03), s * (1 - bob * 0.06));
    } else if (p.kind === 'log') {
      sp.draw(ctx, 'log', x, y + bob * 3, 1, 1, p.rot);
    } else if (p.kind === 'house') {
      const h = p.house!;
      sp.draw(ctx, `house_${h.type}`, x, y + bob * 2);
      this.drawResident(ctx, h, x, y);
      // number plate on a post
      const px = x + h.plateAt.x, py = y + h.plateAt.y;
      ctx.strokeStyle = P.woodDeep;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(px, py + 8);
      ctx.lineTo(px, py + 30);
      ctx.stroke();
      plate(ctx, px, py, h.num, h.color, 1.1);
    }
  }

  private drawResident(ctx: Ctx, h: House, x: number, y: number) {
    const sp = this.game.sprites;
    const t = this.time + h.phase;
    let rx = x + h.resident.x, ry = y + h.resident.y;
    let rot = 0, sy = 1, sx = h.species === 'hedgehog' ? -1 : 1;
    if (h.species === 'duck') {
      rot = Math.sin(t * 1.6) * 0.04;
      ry -= Math.abs(Math.sin(t * 1.6)) * 1.5;
    } else if (h.species === 'rabbit') sy = 1 + Math.sin(t * 2.4) * 0.035;
    else rot = Math.sin(t * 1.2) * 0.05;
    const r = h.react;
    if (r && r.t < 1.8) {
      if (r.kind === 'happy') ry -= Math.abs(Math.sin(r.t * 9)) * 16 * Math.max(0, 1 - r.t / 1.2);
      else rot += 0.2 * Math.sin(Math.min(r.t * 6, Math.PI / 2));
    }
    sp.draw(ctx, h.species, rx, ry, sx * 1.05, sy * 1.05, rot);
    if (r && r.kind === 'confused' && r.t < 2) {
      const a = Math.min(1, r.t * 5) * (r.t > 1.6 ? (2 - r.t) / 0.4 : 1);
      ctx.save();
      ctx.globalAlpha = a;
      const bx = rx + 18, by = ry - 92;
      ellipse(ctx, bx, by, 20, 20);
      ctx.fillStyle = P.white;
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.stroke();
      text(ctx, '?', bx, by + 1, 28, { bold: true });
      ctx.restore();
    }
  }

  private drawTruck(ctx: Ctx, t: Plat) {
    const sp = this.game.sprites;
    const x = t.x, y = this.sy(t.y) + Math.sin(this.time * 13 + t.side) * 0.8;
    drawTruckBase(ctx, x, y, -this.camY);
    sp.draw(ctx, t.side === 0 ? 'truck_orange' : 'truck_blue', x, y);
    text(ctx, '蛙趣', x, y + 173 * K + 0.5, 11, { bold: true });
    // cargo = the shared pool of parcels still waiting
    const pool = this.lv.orders.filter((o) => o.state === 'pool' && !o.house.passed).slice(0, 5);
    const slots: [number, number][] = [[-47, 74], [34, 78], [-26, 94], [-56, 142], [24, 156]];
    const drawn = pool.map((o, i) => ({ o, s: slots[i] })).sort((a, b) => a.s[1] - b.s[1]);
    for (const { o, s } of drawn) sp.draw(ctx, `box${o.size}${o.urgent ? 'u' : ''}`, x + s[0] * K, y + s[1] * K);
  }

  private drawFrog(ctx: Ctx) {
    const sp = this.game.sprites;
    const f = this.frog;
    const x = f.x, gy = this.sy(f.y);
    if (f.state === 'swim') {
      const bob = Math.sin(this.time * 7) * 2 - (f.strokeT < 0.2 ? (0.2 - f.strokeT) * 30 : 0);
      ellipse(ctx, x, gy + 6, 56, 16);
      ctx.strokeStyle = 'rgba(251,247,238,0.7)';
      ctx.lineWidth = 3;
      ctx.stroke();
      sp.draw(ctx, 'frog_swim', x, gy + 4 + bob, FROG_S, FROG_S, Math.sin(this.time * 9) * 0.05);
      return;
    }
    // shadow stays on the surface below
    const onWood = f.state === 'stand' && f.on && (f.on.kind === 'house' || f.on.kind === 'truck' || f.on.kind === 'log');
    const shrink = 1 - Math.min(0.5, f.z / 300);
    ctx.save();
    ctx.globalAlpha = 0.42 * shrink;
    ellipse(ctx, x + 5 + f.z * 0.08, gy + 3, 40 * shrink, 11 * shrink);
    ctx.fillStyle = f.state === 'jump' ? P.tealDeep : onWood ? P.woodDeep : f.on?.kind === 'bank' ? P.bankDeep : P.lilyDeep;
    ctx.fill();
    ctx.restore();

    let sx = 1, sy = 1, rot = 0;
    let name = 'frog_stand';
    const power = this.aimPower();
    if (f.state === 'stand') {
      sy *= 1 + Math.sin(this.time * 3) * 0.015;
      if (this.aim && power > 0.05) {
        name = 'frog_crouch';
        sy *= 1 - 0.13 * power;
        sx *= 1 + 0.06 * power;
        const [ux] = this.aimDir();
        rot = clamp(ux * 0.2 * power, -0.2, 0.2);
      }
      if (f.landT < 0.32) {
        const k = springOut(f.landT / 0.32, 2);
        sy *= 1 - 0.16 * k;
        sx *= 1 + 0.1 * k;
      }
    } else if (f.jump) {
      const k = f.jump.t / f.jump.T;
      name = f.z > 8 ? 'frog_jump' : 'frog_crouch';
      if (k < 0.3) {
        sy *= 1.18 - (k / 0.3) * 0.18;
        sx *= 0.9 + (k / 0.3) * 0.1;
      }
      rot = ((f.jump.x1 - f.jump.x0) / Math.max(1, f.jump.dist)) * 0.22;
    }
    const y = gy - f.z;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    sp.draw(ctx, name, 0, 0, FROG_S * sx, FROG_S * sy);
    // satchel hangs from the strap and swings with the jumps
    const w = this.weight();
    const size = w <= 1 ? 0 : w <= 3 ? 1 : 2;
    const sxp = 30 * K * FROG_S * sx, syp = -40 * K * FROG_S * sy;
    sp.draw(ctx, `satchel${size}`, sxp, syp, FROG_S * (this.bag.length ? 1 : 0.9), FROG_S, clamp(f.swing * 0.1, -0.5, 0.5));
    ctx.restore();
  }

  private drawFx(ctx: Ctx, e: Fx) {
    const sp = this.game.sprites;
    const k = e.t / e.dur;
    const x = e.x, y = this.sy(e.y);
    switch (e.kind) {
      case 'ripple': {
        const r = (e.size || 50) * (0.7 + k * 0.6);
        ctx.save();
        ctx.globalAlpha = (1 - k) * 0.8;
        ellipse(ctx, x, y, r, r * 0.42);
        ctx.strokeStyle = P.white;
        ctx.lineWidth = 3;
        ctx.setLineDash([22, 10, 8, 14]);
        ctx.stroke();
        ctx.restore();
        break;
      }
      case 'splash':
        sp.draw(ctx, 'splash', x, y, 0.6 + easeOutBack(Math.min(1, k * 2)) * 0.5, 0.5 + easeOutBack(Math.min(1, k * 2)) * 0.6, 0, 1 - k * k);
        break;
      case 'dust': {
        ctx.save();
        ctx.globalAlpha = (1 - k) * 0.8;
        ctx.fillStyle = P.cream;
        ctx.strokeStyle = 'rgba(74,59,48,0.4)';
        ctx.lineWidth = 1.5;
        for (const d of [-1, 1]) {
          ellipse(ctx, x + d * (20 + k * 26), y - k * 8, 9 * (1 - k * 0.5), 6 * (1 - k * 0.5));
          ctx.fill();
          ctx.stroke();
        }
        ctx.restore();
        break;
      }
      case 'floatBox': {
        const bob = Math.sin(e.t * 4 + x) * 3;
        const fy = y + e.t * TUNING.current * 0.6;
        sp.draw(ctx, `box${e.size ?? 0}${e.urgent ? 'u' : ''}`, x, fy + bob, 0.9, 0.9, Math.sin(e.t * 2 + x) * 0.2, k > 0.7 ? (1 - k) / 0.3 : 1);
        break;
      }
      case 'heart':
        sp.draw(ctx, 'heart', x + Math.sin(e.t * 6) * 6, y - easeOutCubic(k) * 50, 0.9, 0.9, 0, 1 - k * k);
        break;
      default:
        break;
    }
  }

  private aimVec(): [number, number] {
    if (!this.aim) return [0, 0];
    return [this.aim.x - this.aim.sx, this.aim.y - this.aim.sy];
  }
  private aimPower() {
    const [dx, dy] = this.aimVec();
    return clamp(Math.hypot(dx, dy) / TUNING.maxDrag, 0, 1);
  }
  private aimDir(): [number, number] {
    const [dx, dy] = this.aimVec();
    const l = Math.hypot(dx, dy) || 1;
    return [-dx / l, -dy / l];
  }

  private drawAim(ctx: Ctx) {
    const f = this.frog;
    if (!this.aim || f.state !== 'stand') return;
    const [dx, dy] = this.aimVec();
    const len = Math.hypot(dx, dy);
    if (len < 6) return;
    const power = this.aimPower();
    const [ux, uy] = this.aimDir();
    const fx = f.x, fy = this.sy(f.y);
    // rubber bands to the pulled-back point
    const pl = Math.min(len, TUNING.maxDrag) * 0.75;
    const px = fx - ux * pl, py = fy - 34 - uy * pl;
    ctx.save();
    ctx.strokeStyle = P.blue;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(fx - 22, fy - 46);
    ctx.quadraticCurveTo(fx - 22 - ux * pl * 0.3, py - 10, px, py);
    ctx.moveTo(fx + 22, fy - 46);
    ctx.quadraticCurveTo(fx + 22 - ux * pl * 0.3, py - 10, px, py);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ellipse(ctx, px, py, 24, 24);
    ctx.fillStyle = 'rgba(251,247,238,0.55)';
    ctx.fill();
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.setLineDash([]);
    ellipse(ctx, px, py, 8, 8);
    ctx.fillStyle = P.white;
    ctx.fill();
    ctx.stroke();
    // launch direction arrow
    const ax = fx + ux * 40, ay = fy - 70 + uy * 40;
    const al = 22 + 52 * power;
    const bx = ax + ux * al, by = ay + uy * al;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 11;
    ctx.globalAlpha = 0.25;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = P.orange;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.fillStyle = P.orange;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bx + ux * 16, by + uy * 16);
    ctx.lineTo(bx - uy * 11, by + ux * 11);
    ctx.lineTo(bx + uy * 11, by - ux * 11);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // dotted prediction after aiming for a while
    if (this.aim.t >= this.cfg.predictDelay && len >= TUNING.deadDrag) {
      const dist = TUNING.minJump + power * (this.maxJump() - TUNING.minJump);
      const tx = fx + ux * dist, ty = fy + uy * dist;
      const hj = 36 + dist * 0.3;
      const a = Math.min(1, (this.aim.t - this.cfg.predictDelay) * 4);
      ctx.globalAlpha = a;
      for (let i = 1; i < 16; i++) {
        const k = i / 16;
        const qx = lerp(fx, tx, k), qy = lerp(fy, ty, k) - 4 * hj * k * (1 - k) - 50 * (1 - k);
        ellipse(ctx, qx, qy, 4.5, 4.5);
        ctx.fillStyle = 'rgba(74,59,48,0.25)';
        ctx.fill();
        ellipse(ctx, qx, qy - 1, 3.5, 3.5);
        ctx.fillStyle = P.white;
        ctx.fill();
      }
      ctx.setLineDash([10, 7]);
      ctx.strokeStyle = P.orange;
      ctx.lineWidth = 3.5;
      ellipse(ctx, tx, ty, 32, 13);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(tx - 9, ty);
      ctx.lineTo(tx + 9, ty);
      ctx.moveTo(tx, ty - 6);
      ctx.lineTo(tx, ty + 6);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawWarn(ctx: Ctx) {
    const H = this.H;
    const top = H * TUNING.warnLine;
    ctx.save();
    // faint stitched line always shows where the danger zone starts
    ctx.strokeStyle = P.red;
    ctx.globalAlpha = 0.28 + this.warnK * 0.4;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([16, 12]);
    ctx.beginPath();
    for (let x = 0; x <= 750; x += 30) {
      const y = top + Math.sin(x / 30 * Math.PI) * 4;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    const g = ctx.createLinearGradient(0, top, 0, H);
    g.addColorStop(0, 'rgba(217,83,79,0)');
    g.addColorStop(1, `rgba(217,83,79,${0.12 + this.warnK * 0.32})`);
    ctx.globalAlpha = 1;
    ctx.fillStyle = g;
    ctx.fillRect(0, top, 750, H - top);
    if (this.warnK > 0.02) {
      // red edges creeping in from the sides
      for (const side of [0, 1]) {
        const sg = ctx.createLinearGradient(side ? 750 : 0, 0, side ? 690 : 60, 0);
        sg.addColorStop(0, `rgba(217,83,79,${0.35 * this.warnK})`);
        sg.addColorStop(1, 'rgba(217,83,79,0)');
        ctx.fillStyle = sg;
        ctx.fillRect(side ? 690 : 0, H * 0.45, 60, H * 0.55);
      }
    }
    ctx.restore();
  }

  private drawHud(ctx: Ctx) {
    const sp = this.game.sprites;
    const H = this.H;
    const ty = this.game.safeT + 10;
    // Top bar: pause, day, route progress, delivered count
    panel(ctx, 16, ty, 718, 72, { r: 22 });
    this.pauseBtn = { x: 26, y: ty + 12, w: 48, h: 48 };
    ellipse(ctx, 50, ty + 36, 21, 21);
    ctx.fillStyle = P.cream;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.fillRect(43, ty + 27, 5, 18);
    ctx.fillRect(53, ty + 27, 5, 18);
    text(ctx, `第${this.day}天`, 118, ty + 37, 30, { bold: true });
    const x0 = 200, x1 = 532, ly = ty + 36;
    const prog = clamp(-this.camY / this.cfg.length, 0, 1);
    ctx.save();
    ctx.strokeStyle = 'rgba(74,59,48,0.35)';
    ctx.lineWidth = 4;
    ctx.setLineDash([2, 10]);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x0, ly);
    ctx.lineTo(x1, ly);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = P.orange;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(x0, ly);
    ctx.lineTo(lerp(x0, x1, prog), ly);
    ctx.stroke();
    for (let i = 0; i < 5; i++) {
      const cx = lerp(x0, x1, i / 4);
      ellipse(ctx, cx, ly, 6, 6);
      ctx.fillStyle = i / 4 <= prog ? P.orange : P.paper;
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    // little van marker
    const vx = lerp(x0, x1, prog);
    roundRect(ctx, vx - 17, ly - 15, 34, 20, 6);
    ctx.fillStyle = P.orange;
    ctx.fill();
    ctx.stroke();
    roundRect(ctx, vx - 12, ly - 21, 16, 10, 3);
    ctx.fillStyle = '#F2A57A';
    ctx.fill();
    ctx.stroke();
    for (const d of [-9, 9]) {
      ellipse(ctx, vx + d, ly + 7, 4.5, 4.5);
      ctx.fillStyle = '#5B4A3D';
      ctx.fill();
      ctx.stroke();
    }
    // postmark at the route's end
    ctx.strokeStyle = P.red;
    ctx.lineWidth = 2.5;
    ellipse(ctx, 562, ly, 17, 17);
    ctx.stroke();
    ellipse(ctx, 562, ly, 11, 11);
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.restore();
    // delivered count
    const handed = this.lv.orders.filter((o) => o.state === 'delivered' || o.state === 'wrong').length;
    sp.draw(ctx, 'box0', 618, ly + 14, 0.95);
    text(ctx, `${handed}/${this.lv.orders.length}`, 690, ly + 2, 30, { bold: true });

    this.drawUrgentCard(ctx, ty + 84);

    // Power gauge while aiming
    if (this.aim && this.frog.state === 'stand') {
      const gx = 696, gy0 = H * 0.42, gh = H * 0.24;
      panel(ctx, gx, gy0, 40, gh, { r: 18, shadow: false });
      const inner = { x: gx + 10, y: gy0 + 12, w: 20, h: gh - 24 };
      roundRect(ctx, inner.x, inner.y, inner.w, inner.h, 9);
      ctx.fillStyle = '#EADBC0';
      ctx.fill();
      const reach = (this.maxJump() - TUNING.minJump) / (TUNING.maxJump - TUNING.minJump);
      // unreachable part because of the load
      if (reach < 0.999) {
        ctx.fillStyle = 'rgba(74,59,48,0.22)';
        roundRect(ctx, inner.x, inner.y, inner.w, inner.h * (1 - reach), 9);
        ctx.fill();
      }
      const fill = this.aimPower() * reach;
      if (fill > 0.01) {
        const g = ctx.createLinearGradient(0, inner.y + inner.h, 0, inner.y);
        g.addColorStop(0, P.gold);
        g.addColorStop(1, P.orange);
        ctx.fillStyle = g;
        roundRect(ctx, inner.x, inner.y + inner.h * (1 - fill), inner.w, inner.h * fill, 9);
        ctx.fill();
      }
      roundRect(ctx, inner.x, inner.y, inner.w, inner.h, 9);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    this.drawTray(ctx);

    // flying parcels (screen space)
    for (const e of this.fx) {
      if (e.kind !== 'fly') continue;
      const k = easeOutCubic(e.t / e.dur);
      const x = lerp(e.x, e.x2!, k), y = lerp(e.y, e.y2!, k) - Math.sin(k * Math.PI) * 60;
      sp.draw(ctx, `box${e.size ?? 0}`, x, y + 20, 1 - k * 0.3);
    }

    // hint bubble
    if (this.hint && !this.paused) this.drawHint(ctx);
    if (this.toast) {
      const a = Math.min(1, this.toast.t * 6) * (this.toast.t > 1.8 ? (2.2 - this.toast.t) / 0.4 : 1);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.font = '26px WK';
      const w = Math.max(220, ctx.measureText(this.toast.text).width + 60);
      panel(ctx, 375 - w / 2, ty + 210, w, 56, { r: 28, fill: P.cream });
      text(ctx, this.toast.text, 375, ty + 239, 26);
      ctx.restore();
    }
    if (this.banner) this.drawBanner(ctx);
  }

  private drawUrgentCard(ctx: Ctx, y: number) {
    const urgent = this.bag.filter((o) => o.urgent).sort((a, b) => a.deadline - b.deadline)[0];
    if (!urgent) return;
    const sp = this.game.sprites;
    const left = Math.ceil(urgent.deadline - this.time);
    ctx.save();
    ctx.translate(26, y);
    ctx.rotate(-0.04);
    ctx.strokeStyle = P.woodDeep;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(70, -12);
    ctx.lineTo(70, 4);
    ctx.stroke();
    panel(ctx, 0, 0, 150, 112, { r: 10 });
    roundRect(ctx, 0, 0, 150, 30, 10);
    ctx.fillStyle = P.red;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.stroke();
    text(ctx, '加急', 75, 16, 22, { color: P.white, bold: true });
    sp.draw(ctx, `avatar_${urgent.house.species}`, 38, 66, 0.82);
    plate(ctx, 98, 52, urgent.house.num, urgent.house.color, 0.95);
    const late = urgent.late;
    const s = late ? '超时' : `0:${String(Math.max(0, left)).padStart(2, '0')}`;
    text(ctx, s, 104, 88, 26, { color: late || left <= 10 ? P.red : INK, bold: true });
    ctx.restore();
  }

  private drawTray(ctx: Ctx) {
    const sp = this.game.sprites;
    const cy = this.trayY();
    if (this.trayMode !== 'bag') {
      const n = Math.max(1, this.cards.length);
      const first = this.cards[0]?.rect ?? { x: 146, y: cy - 62, w: 108, h: 124 };
      const tw = Math.max(n * (first.w + 10) + 14, 330);
      panel(ctx, first.x - 12, first.y - 52, tw, first.h + 64, { r: 16, fill: '#EFE3C8' });
      let title: string;
      if (this.trayMode === 'pickup') title = this.cards.length ? '取件 · 点包裹装进背包' : '车上的包裹都送出去了';
      else {
        const h = this.frog.on!.house!;
        title = `交给 ${h.num}号 ${h.name}`;
      }
      text(ctx, title, first.x + 2, first.y - 26, 24, { align: 'left', bold: true, maxWidth: tw - 30 });
    }
    // Backpack button
    ellipse(ctx, 74, cy, 54, 54);
    ctx.fillStyle = P.paper;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.2;
    ctx.stroke();
    ellipse(ctx, 74, cy, 45, 45);
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = P.kraft;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.setLineDash([]);
    const w = this.weight();
    sp.draw(ctx, `satchel${w <= 1 ? 0 : w <= 3 ? 1 : 2}`, 74, cy - 20, 1.25);
    const used = this.slotsUsed();
    roundRect(ctx, 40, cy + 30, 68, 32, 16);
    ctx.fillStyle = used >= this.cfg.bagSlots ? P.red : P.orange;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.stroke();
    text(ctx, `${used}/${this.cfg.bagSlots}`, 74, cy + 47, 22, { color: P.white, bold: true });
    for (const c of this.cards) this.drawCard(ctx, c);
  }

  private drawCard(ctx: Ctx, c: Card) {
    const sp = this.game.sprites;
    const o = c.order;
    let { x, y, w, h } = c.rect;
    if (this.shakeCard && this.shakeCard.id === o.id) x += Math.sin(this.shakeCard.t * 50) * 6 * (1 - this.shakeCard.t / 0.4);
    const small = this.trayMode === 'bag';
    const pulse = this.hint?.key === 'pick' && this.trayMode === 'pickup' ? 1 + Math.sin(this.time * 6) * 0.03 : 1;
    ctx.save();
    if (pulse !== 1) {
      ctx.translate(x + w / 2, y + h / 2);
      ctx.scale(pulse, pulse);
      ctx.translate(-(x + w / 2), -(y + h / 2));
    }
    const full = this.trayMode === 'pickup' && this.slotsUsed() + SIZE_INFO[o.size].slots > this.cfg.bagSlots;
    if (full) ctx.globalAlpha = 0.55;
    panel(ctx, x, y, w, h, { r: 12, fill: P.paper });
    const k = small ? 0.78 : 1;
    sp.draw(ctx, `avatar_${o.house.species}`, x + w * 0.32, y + 34 * k, 0.86 * k);
    plate(ctx, x + w * 0.76, y + 28 * k, o.house.num, o.house.color, 1.1 * k);
    sp.draw(ctx, `box${o.size}${o.urgent ? 'u' : ''}`, x + w / 2, y + h - 10 * k, (o.size === 0 ? 1.15 : o.size === 1 ? 1 : 0.9) * k);
    if (o.urgent) {
      roundRect(ctx, x - 6, y + h * 0.5 - 12, 30 * k + 8, 24 * k, 6);
      ctx.fillStyle = P.red;
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.8;
      ctx.stroke();
      text(ctx, '急', x + 9 * k + 2, y + h * 0.5 - 12 + 12 * k, 18 * k, { color: P.white, bold: true });
    }
    ctx.restore();
  }

  private drawHint(ctx: Ctx) {
    const h = this.hint!;
    const a = Math.min(1, h.t * 5) * (h.t > h.dur - 0.3 ? Math.max(0, (h.dur - h.t) / 0.3) : 1);
    const y = this.game.safeT + 108;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = '27px WKB';
    const w = Math.min(690, ctx.measureText(h.text).width + 70);
    panel(ctx, 375 - w / 2, y, w, 64, { r: 18 });
    text(ctx, h.text, 375, y + 33, 27, { bold: true, maxWidth: w - 40 });
    ctx.restore();
    if (h.hand && this.frog.state === 'stand') {
      // animated finger showing the pull-back
      const f = this.frog;
      const cyc = (this.time % 1.8) / 1.8;
      const k = cyc < 0.15 ? 0 : cyc < 0.7 ? easeOutCubic((cyc - 0.15) / 0.55) : 1;
      const hx = f.x + 30 - k * 40, hy = this.sy(f.y) + 20 + k * 150;
      ctx.save();
      ctx.globalAlpha = cyc > 0.85 ? (1 - cyc) / 0.15 : 1;
      if (k > 0) {
        ctx.strokeStyle = 'rgba(74,59,48,0.35)';
        ctx.setLineDash([6, 8]);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(f.x + 30, this.sy(f.y) + 20);
        ctx.lineTo(hx, hy);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      this.game.sprites.draw(ctx, 'hand', hx, hy, 0.9);
      ctx.restore();
    }
  }

  private drawBanner(ctx: Ctx) {
    const b = this.banner!;
    const inT = Math.min(1, b.t / 0.35);
    const out = b.dur < 5 && b.t > b.dur - 0.35 ? (b.dur - b.t) / 0.35 : 1;
    const y = this.H * 0.4;
    ctx.save();
    ctx.globalAlpha = Math.max(0, out);
    const s = 0.8 + easeOutBack(inT) * 0.2;
    ctx.translate(375, y);
    ctx.scale(s, s);
    ctx.rotate(-0.02);
    panel(ctx, -280, -80, 560, 160, { r: 20 });
    // ribbon tails
    ctx.fillStyle = P.orange;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    for (const d of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(d * 280, -40);
      ctx.lineTo(d * 330, -40);
      ctx.lineTo(d * 310, -10);
      ctx.lineTo(d * 330, 20);
      ctx.lineTo(d * 280, 20);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    text(ctx, b.title, 0, -22, 48, { bold: true, color: this.ended === 'thrown' ? P.red : INK });
    text(ctx, b.sub, 0, 34, 26, { color: P.inkSoft, maxWidth: 500 });
    ctx.restore();
  }

  private drawPause(ctx: Ctx) {
    const H = this.H;
    ctx.fillStyle = 'rgba(74,59,48,0.45)';
    ctx.fillRect(0, 0, 750, H);
    const y0 = H * 0.5 - 260;
    panel(ctx, 115, y0, 520, 520, { r: 24 });
    text(ctx, '休息一下', 375, y0 + 64, 42, { bold: true });
    const btns: [string, string, boolean][] = [
      ['resume', '继续上班', true],
      ['restart', '重新开始今天', false],
      ['title', '回到标题', false],
      ['sound', `音效：${this.game.save.sound ? '开' : '关'}`, false],
    ];
    this.menuBtns = btns.map(([id, label, primary], i) => {
      const rect = { x: 195, y: y0 + 120 + i * 92, w: 360, h: 72 };
      button(ctx, rect.x, rect.y, rect.w, rect.h, label, { primary, pressed: this.pressed === id, size: 30 });
      return { id, rect };
    });
  }
}

/** Ground shadow and wheels under a truck sprite; `odo` scrolls the tread. */
export function drawTruckBase(ctx: Ctx, x: number, y: number, odo: number) {
  ctx.save();
  ctx.globalAlpha = 0.9;
  roundRect(ctx, x - 96 * K, y - 170 * K, 210 * K, 360 * K, 24);
  ctx.fillStyle = P.roadDeep;
  ctx.fill();
  ctx.restore();
  const tread = (odo * 0.6) % 10;
  for (const [wx, wy] of [[-70, -56], [72, -56], [-70, 69], [72, 69]]) {
    const cx = x + wx, cy = y + wy;
    roundRect(ctx, cx - 8, cy - 21, 16, 42, 6);
    ctx.fillStyle = '#5B4A3D';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = '#8B7765';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let ly = -18 + tread; ly < 19; ly += 10) {
      ctx.moveTo(cx - 5, cy + ly);
      ctx.lineTo(cx + 5, cy + ly);
    }
    ctx.stroke();
  }
}
