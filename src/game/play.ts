import { INK, P } from '../art/palette';
import { K, TILE_H } from '../art/sprites';
import { button, codeTag, ellipse, font, hit, panel, rich, richWidth, roundRect, segs, text, wrapText, type Rect, type Seg } from '../art/ui';
import { approach, clamp, easeOutBack, easeOutCubic, lerp, pick, springOut } from '../engine/math';
import type { LoopHandle } from '../engine/audio';
import type { Canvas, Ctx } from '../platform/types';
import { SIZE_INFO, TUNING } from './config';
import type { Game, Scene } from './game';
import { HqScene, type DayResult, type Photo } from './hq';
import { buildLevel, dayConfig, type House, type Level, type Order, type Plat } from './level';
import { OFFWORK_LINES } from './lines';
import { TitleScene } from './title';

const FROG_S = 0.92; // frog sprite scale on top of K, matching the concept art
const TILE = TILE_H * K;

type How = 'jump' | 'climb' | 'auto';

interface Jump {
  x0: number; y0: number; x1: number; y1: number;
  t: number; T: number; H: number; dist: number;
  whistled?: boolean;
  /** Set for jumps that land on a chosen spot whatever is underneath (leaping out of the water). */
  to?: Plat;
  how?: How;
}

/**
 * The hop onto a truck from the road once it has caught up (a flip and a croak), or, with `yank`,
 * the truck's rope hauling the frog back from wherever it is. Positions are on screen because the
 * trucks keep pace with the camera.
 */
interface Board { truck: Plat; t: number; x0: number; y0: number; yank: boolean; said: boolean }

/** Exhaust from a truck's tail pipe: drifts behind on the road and hides what's under it. */
interface Puff { x: number; y: number; vx: number; vy: number; r: number; t: number; dur: number }

interface Frog {
  state: 'stand' | 'jump' | 'swim' | 'board';
  x: number; y: number; z: number;
  on: Plat | null;
  lx: number; ly: number;
  settle: { fx: number; fy: number; tx: number; ty: number; t: number } | null;
  jump: Jump | null;
  board: Board | null;
  vx: number; vy: number;
  swimT: number;
  strokeT: number;
  landT: number;
  /** How hard the last landing was (about 0.25–1.1), for the squash. */
  impact: number;
  /** Lean toward the resident while handing a parcel over, fading out. */
  give: number;
  giveDir: number;
  swing: number; swingV: number;
}

/** A parcel bobbing in the river after a fall. It can be fished out for a few seconds. */
interface Floater { o: Order; x: number; y: number; vx: number; vy: number; t: number; spin: number }

interface Fx {
  kind: 'ripple' | 'splash' | 'dust' | 'floatBox' | 'heart' | 'fly' | 'qmark' | 'drops' | 'petals' | 'sink' | 'arc' | 'coins' | 'say';
  x: number; y: number; t: number; dur: number;
  size?: number; urgent?: boolean;
  /** For 'fly' (screen space) and 'arc' (world space): where it ends. */
  x2?: number; y2?: number;
  label?: string;
  /** Random seed for the particle kinds. */
  seed?: number;
}

interface Popup { text: string; x: number; y: number; t: number; color: string }

interface Shot { at: number; caption: string; prio: number; kind: string; thrown?: boolean }

interface Card { order: Order; rect: Rect }

type HintKey = 'go' | 'refill' | 'call' | 'egg' | 'road' | 'swim' | 'rescue' | 'warn' | 'urgent' | 'heavy' | 'wrongHouse';

/**
 * Coached steps at the start of a day. 'intro' is the briefing card (every day); day 1 then walks
 * through pick → aim → go → deliver → refill. 'rescue' is shown once, the first time parcels end up
 * in the water. The river holds still during the hands-on steps.
 */
type Step = 'intro' | 'pick' | 'aim' | 'go' | 'deliver' | 'refill' | 'rescue' | null;

/** The drive home after everything is handed out: camera pans to the truck, it drives off. */
interface Offwork { truck: Plat; t: number; line: string; baseY: number; drive: number; panX: number; panY: number; horn: boolean; card: boolean }

const codeSeg = (o: Order): Seg => ({ code: o.code, color: o.house.color });
const frac = (v: number) => v - Math.floor(v);

/** How to fit each briefing icon in its circle: offset from the circle center and scale. */
const ICONS: Record<string, [number, number, number]> = {
  box0: [0, 34, 1.2], box0u: [0, 34, 1.2], box1: [0, 32, 1.05], box2: [0, 32, 0.85],
  hand: [-8, -38, 0.62], frog_swim: [0, 14, 0.42], coin: [0, 0, 1.15], satchel2: [-4, -28, 1.1], lily1: [0, -4, 0.4],
};

const PAN_T = 0.8;
const DRIVE_AT = 0.95;
const CARD_AT = 1.5;
const OFF_END = 5.2;

/** Seconds a dropped parcel stays afloat, and how close the frog must swim to scoop it up. */
const FLOAT_T = 5.5;
const GRAB_R = 70;
/** How far the tongue reaches, from the water or from a pad. */
const TONGUE_R = 270;
const TONGUE_OUT = 0.13;
const TONGUE_IN = 0.22;
/** A tap while swimming this close to a pad or the bank leaps out of the water. */
const LEAP_R = 170;
/** Countdown once everything is handed out, before the truck hauls the frog in. */
const CALL_T = 15;
const BOARD_LEAP_T = 0.4;
const YANK_T = 0.8;
/** Jumping off the road behind a truck: it blows exhaust, which slows the frog for a while. */
const SMOG_T = 2.6;
const SMOG_REACH = 0.7;
const SMOG_SLOW = 1.5;

const LETTERS = [
  '“给河湾的快递员：谢谢你每天都来。——住在桥洞的老乌龟”',
  '“如果你捡到这封信，说明你很会偷懒。——猫头鹰经理”',
  '“明天的荷叶会更大一点。——一只路过的鹭”',
];

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
  private hint: { key: HintKey; line: Seg[]; sub?: string; t: number; dur: number; warn?: boolean } | null = null;
  private step: Step = 'intro';
  private stepT = 0;
  /** Lily the aim step points at. */
  private aimTarget: Plat | null = null;
  private introBtn: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private off: Offwork | null = null;
  /** Set once the day's result is handed to HQ, while the screen fades out. */
  private leaving = false;
  /** World-to-screen shift, used by the drive-home camera. */
  private camX = 0;
  private panY = 0;
  private banner: { title: string; sub: string; t: number; dur: number } | null = null;
  private toast: { text: string; t: number } | null = null;
  private ended: null | 'done' | 'thrown' | 'off' = null;
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
  private hum: { setPitch(hz: number): void; stop(): void } | null = null;
  /** How many tick marks the pull has passed; each new one clicks a little higher. */
  private notch = 0;
  private chargeMax = false;
  private predicted = false;
  private tick: LoopHandle | null = null;
  /** Parcels in the water that can still be saved, and the tongue fetching one of them. */
  private floaters: Floater[] = [];
  private tongue: { fl: Floater; t: number } | null = null;
  private tongueQ: Floater[] = [];
  /** Where the tutorial was when the rescue lesson cut in. */
  private stepBefore: Step = null;
  private lessonAt: number | null = null;
  /** Seconds left to get back on a truck once everything is handed out. */
  private callT: number | null = null;
  private honkT = 0;
  private lastHonk = 0;
  /** Something to find on the road behind the truck while the countdown runs. */
  private egg: { x: number; y: number; got: boolean } | null = null;
  private shakeT = 0;
  private puffs: Puff[] = [];
  /** Seconds the frog stays slowed by exhaust. */
  private smogT = 0;
  /** The current stand on the road has already set off the exhaust. */
  private puffed = false;
  /** For the road: whether the frog came down ahead of its truck (and waits) or behind it. */
  private roadSpot: 'ahead' | 'behind' | null = null;

  constructor(private game: Game, readonly day: number) {
    const cfg = dayConfig(day);
    this.lv = buildLevel(cfg, game.H);
    const truck = this.lv.trucks[0];
    this.placeTrucks();
    const lx = TUNING.truckSpotX[1];
    this.frog = {
      state: 'stand', x: truck.x + lx, y: truck.y + 40, z: 0, on: truck, lx, ly: 40, settle: null, jump: null, board: null,
      vx: 0, vy: 0, swimT: 0, strokeT: 9, landT: 9, impact: 0.5, give: 0, giveDir: 1, swing: 0, swingV: 0,
    };
    this.slowT = TUNING.truckSlowSec;
    this.slowCd = TUNING.truckSlowSec + TUNING.slowCooldown;
    game.audio.setMusic('bgm_work');
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
    if (this.paused || this.leaving) return;
    this.time += dt;
    this.stepT += dt;
    this.shakeT = Math.max(0, this.shakeT - dt);
    this.honkT = Math.max(0, this.honkT - dt);
    this.smogT = Math.max(0, this.smogT - dt);
    for (const p of this.puffs) {
      p.t += dt;
      if (p.t < 0) continue;
      const d = Math.exp(-1.6 * dt);
      p.vx *= d;
      p.vy *= d;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.puffs = this.puffs.filter((p) => p.t < p.dur);
    const cfg = this.cfg;

    if (this.off) this.updateOffwork(dt);
    else {
      this.slowT = Math.max(0, this.slowT - dt);
      this.slowCd = Math.max(0, this.slowCd - dt);
      // the convoy also eases off while it waits for the frog at the end of the round
      const target = this.ended === 'done' ? 0 : this.slowT > 0 || this.callT !== null ? TUNING.slowFactor : 1;
      this.speedK = approach(this.speedK, target, 4, dt);
      // The river holds still while the tutorial has the player's hands busy.
      if (!this.frozen()) this.camY -= cfg.speed * this.speedK * dt;
      this.placeTrucks();
    }
    for (const p of this.lv.plats) {
      p.bobT += dt;
      if (p.kind === 'log') {
        p.x += p.drift * dt;
        if (p.x < TUNING.riverL + 84) p.drift = Math.abs(p.drift);
        if (p.x > TUNING.riverR - 84) p.drift = -Math.abs(p.drift);
      }
    }
    for (const h of this.lv.houses) {
      if (h.react) h.react.t += dt;
      if (h.hold && (h.hold.t += dt) > 1.6) h.hold = null;
    }

    this.updateFrog(dt);
    this.updateFloaters(dt);
    this.updateTongue(dt);
    if (this.aim) this.aim.t += dt;
    this.updateSound();

    if (!this.ended) {
      this.checkHouses();
      this.checkUrgent();
      this.checkDanger(dt);
      this.tutorial();
      this.updateRoad();
      this.updateCall(dt);
      this.checkEgg();
      this.checkOffwork();
      if (!this.ended && -this.camY >= cfg.length) this.endDay('done');
    } else if (this.ended !== 'off') {
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

  private frozen() {
    return this.step === 'intro' || this.step === 'pick' || this.step === 'aim' || this.step === 'deliver' || this.step === 'rescue';
  }

  private setStep(step: Step) {
    this.step = step;
    this.stepT = 0;
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
      if (k >= 0.55 && !j.whistled && !j.to) {
        j.whistled = true;
        if (!this.findPlat(j.x1, j.y1)) this.game.audio.play('fall_whistle', { volume: 0.8 });
      }
      if (k >= 1) {
        if (j.to) this.standOn(j.to, j.x1, j.y1, j.how ?? 'jump');
        else this.land(j.x1, j.y1);
      }
    } else if (f.state === 'board') this.updateBoard(dt);
    else if (f.state === 'swim' && this.step !== 'rescue') {
      f.swimT += dt;
      f.strokeT += dt;
      const d = Math.exp(-TUNING.swimDrag * dt);
      f.vx *= d;
      f.vy *= d;
      f.x = clamp(f.x + f.vx * dt, TUNING.riverL - 24, TUNING.riverR + 24);
      f.y += (f.vy + TUNING.current) * dt;
      // bumping into something on the way springs the frog out of the water
      if (f.swimT > 0.4) {
        const p = this.findPlat(f.x, f.y, true);
        if (p) this.leapOut(p);
      }
    }
    f.give = Math.max(0, f.give - dt * 2.2);
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
    return TUNING.maxJump * (1 - TUNING.weightPenalty * this.weight()) * (this.smogT > 0 ? SMOG_REACH : 1);
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

  private standOn(p: Plat, x: number, y: number, how: How) {
    const f = this.frog;
    const dist = f.jump?.dist ?? 0;
    // the road rules (wait for the truck, or exhaust) are sorted out once the frog has settled
    this.roadSpot = null;
    this.puffed = false;
    let tx: number, ty: number;
    let cx = x - p.x, cy = y - p.y;
    switch (p.kind) {
      case 'truck': {
        // the inner half of the bed, which is the part on screen
        const [a, b] = TUNING.truckSpotX;
        tx = p.side === 0 ? clamp(cx, a, b) : clamp(cx, -b, -a);
        ty = clamp(cy, 8, 72);
        break;
      }
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
        tx = p.side === 0 ? clamp(x, 30, TUNING.riverL - 26) : clamp(x, TUNING.riverR + 26, 720);
        ty = y;
    }
    f.state = 'stand';
    f.on = p;
    f.z = 0;
    f.jump = null;
    f.board = null;
    f.landT = 0;
    f.lx = cx;
    f.ly = cy;
    f.settle = { fx: cx, fy: cy, tx, ty, t: 0 };
    f.swingV += 5 + this.weight() * 1.5;
    // How hard it came down: far jumps hit harder, and everything gives way to match.
    const impact = how === 'auto' ? 0.6 : clamp(dist / 300, 0.25, 1.1);
    f.impact = impact;
    p.bobT = 0;
    p.tilt = 0;
    const au = this.game.audio;
    if (how === 'climb' && this.sy(y) > this.H * TUNING.warnLine) {
      this.stats.closeCalls++;
      this.queueShot('close', '极限上岸！', 7, 0.2);
    }
    if (p.kind === 'lily' || p.kind === 'log') {
      // small and young pads give more; logs barely sink but rock
      const soft = p.kind === 'log' ? 0.45 : clamp(62 / p.rx, 0.8, 1.4) * (p.variant === 2 ? 1.2 : 1);
      p.press = impact * soft;
      p.tilt = clamp((x - p.x) / p.rx, -1, 1);
      this.fx.push({ kind: 'ripple', x: p.x, y: p.y + 6, t: 0, dur: 0.6 + impact * 0.5, size: p.rx * (1 + impact * 0.4) });
      if (p.kind === 'lily' && (p.variant === 0 || p.variant === 3) && impact > 0.35) {
        this.fx.push({ kind: 'petals', x: p.x + p.rx * 0.35, y: p.y - p.ry * 0.15, t: 0, dur: 1.1, size: impact, seed: Math.random() * 100 });
      }
      if (p.press > 0.8) this.fx.push({ kind: 'drops', x, y, t: 0, dur: 0.6, size: impact, seed: Math.random() * 100 });
      if (p.kind === 'log') au.play('land_house', { volume: 0.5 + impact * 0.4, rate: 1.25 - impact * 0.2, jitter: true });
      else au.play('land_pad', { volume: 0.55 + impact * 0.45, rate: 1.15 - impact * 0.25, jitter: true });
    } else {
      p.press = impact * 0.5;
      this.fx.push({ kind: 'dust', x, y, t: 0, dur: 0.5, size: impact });
      if (p.kind === 'truck') au.play('land_truck', { volume: 0.6 + impact * 0.4 });
      else au.play('land_house', { volume: 0.6 + impact * 0.4, rate: 1.1 - impact * 0.15 });
    }
    if (dist > 260) {
      this.shakeT = 0.22;
      this.game.platform.vibrate(25);
    }

    if (p.kind === 'truck') {
      this.game.platform.vibrate(12);
      // hopping on by itself from the road keeps the convoy at its pace
      if (this.slowCd <= 0 && how !== 'auto') {
        this.slowT = TUNING.truckSlowSec;
        this.slowCd = TUNING.truckSlowSec + TUNING.slowCooldown;
        au.play('truck_slowdown', { volume: 0.7, delay: 0.1 });
      }
      this.doneHint('refill');
      if (this.step === 'refill') this.setStep(null);
    } else if (p.kind === 'house' && this.bag.length) {
      if (this.slowCd <= 0) {
        this.slowT = TUNING.houseSlowSec;
        this.slowCd = TUNING.houseSlowSec + TUNING.slowCooldown;
      }
      const h = p.house!;
      if (this.step === 'go' && this.bag.some((o) => o.house === h)) {
        this.setStep('deliver');
        this.hint = null;
      } else if (this.cfg.tutorial && !this.bag.some((o) => o.house === h)) {
        const waits = this.lv.orders.filter((o) => o.house === h && (o.state === 'pool' || o.state === 'bag'));
        const line: Seg[] = waits.length ? ['这家等的是 ', ...waits.map(codeSeg), '，你的是 ', codeSeg(this.bag[0])] : ['这家没有包裹，你的是 ', codeSeg(this.bag[0])];
        this.showHint('wrongHouse', line, { dur: 4, again: true });
      }
    }
  }

  /** Up onto truck `t` from world point (x, y) with a flip, or hauled in by its rope with `yank`. */
  private runToTruck(t: Plat, x: number, y: number, yank: boolean) {
    const f = this.frog;
    f.state = 'board';
    f.on = null;
    f.settle = null;
    f.jump = null;
    f.z = 0;
    f.board = { truck: t, t: 0, x0: x, y0: this.sy(y), yank, said: false };
    this.aim = null;
    this.stopCharge();
    this.roadSpot = null;
    const au = this.game.audio;
    this.fx.push({ kind: 'dust', x, y, t: 0, dur: 0.5, size: 0.6 });
    if (yank) au.play('truck_horn');
    au.play('jump_whoosh', { volume: yank ? 0.8 : 0.5 });
  }

  private updateBoard(dt: number) {
    const f = this.frog;
    const b = f.board!;
    b.t += dt;
    // the leap, homing in on the bed as the truck rocks along
    const t = b.truck;
    const T = b.yank ? YANK_T : BOARD_LEAP_T;
    const k = Math.min(1, b.t / T);
    const lx = (t.side === 0 ? 1 : -1) * TUNING.truckSpotX[1];
    const tx = t.x + lx, ts = this.sy(t.y) + 40;
    const e = b.yank ? easeOutCubic(k) : k;
    f.x = lerp(b.x0, tx, e);
    f.y = this.camY + lerp(b.y0, ts, e);
    f.z = 4 * (b.yank ? 170 : 70) * k * (1 - k);
    if (!b.said && k > 0.2) {
      b.said = true;
      this.fx.push({ kind: 'say', x: 0, y: 0, t: 0, dur: b.yank ? 1.1 : 0.8, label: b.yank ? '哇啊——' : '呱！' });
      this.game.audio.play('frog_croak', { volume: 0.8, rate: b.yank ? 1.35 : 1.1, jitter: true });
    }
    if (k >= 1) this.standOn(t, tx, t.y + 40, 'auto');
  }

  /**
   * On the road: ahead of its truck the frog waits for the truck to catch up and hops on by itself;
   * behind it, the road carries the frog off the bottom unless it jumps.
   */
  private updateRoad() {
    const f = this.frog;
    if (f.state !== 'stand' || f.on?.kind !== 'bank') return;
    const t = this.lv.trucks[f.on.side];
    const s = this.sy(f.y), ts = this.sy(t.y);
    if (!this.roadSpot) {
      this.roadSpot = s > ts + t.ry ? 'behind' : 'ahead';
      if (this.roadSpot === 'ahead' && s < ts - t.ry - 70) this.fx.push({ kind: 'say', x: 0, y: 0, t: 0, dur: 1.4, label: '等车来…' });
      else if (this.roadSpot === 'behind' && this.callT === null) {
        this.showHint('road', '落在【车尾】了！不跳会被甩出去', { dur: 4, sub: '在车尾起跳，卡车会喷尾气：跳得慢、看不清', warn: true, again: true });
      }
    }
    if (this.roadSpot === 'ahead' && s >= ts - t.ry - 70 && !this.aim) this.runToTruck(t, f.x, f.y, false);
  }

  /** Pressing to jump off the road behind a truck: it blows a cloud of exhaust over the frog. */
  private exhaust() {
    const f = this.frog;
    if (this.puffed || this.callT !== null || this.roadSpot !== 'behind' || f.on?.kind !== 'bank') return;
    this.puffed = true;
    const t = this.lv.trucks[f.on.side];
    const dir = t.side === 0 ? 1 : -1;
    const px = t.x + dir * 40, py = t.y + t.ry - 6;
    // a few big belches, billowing out behind and toward the river
    for (let i = 0; i < 20; i++) {
      const a = Math.PI / 2 - dir * (Math.random() * 1.1 - 0.15);
      const v = 70 + Math.random() * 190;
      this.puffs.push({
        x: px + (Math.random() - 0.5) * 24, y: py, t: -Math.floor(i / 5) * 0.22 - Math.random() * 0.08, dur: SMOG_T + Math.random() * 0.8,
        vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: 30 + Math.random() * 45,
      });
    }
    this.smogT = SMOG_T;
    const au = this.game.audio;
    au.play('truck_speedup', { volume: 0.9, rate: 0.8 });
    au.play('frog_croak', { volume: 0.5, rate: 0.7, delay: 0.3 });
    this.game.platform.vibrate(40);
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
    // the satchel spills: each parcel bobs off on its own and can still be fished out
    const spilled = this.bag.splice(0);
    const n = spilled.length;
    spilled.forEach((o, i) => {
      o.state = 'float';
      const side = i - (n - 1) / 2;
      // flung out of the satchel, ahead and to the sides
      const a = -Math.PI / 2 + (n > 1 ? side / ((n - 1) / 2) : Math.random() - 0.5) * 0.9;
      const v = 190 + Math.random() * 60;
      this.floaters.push({ o, x: x + side * 30, y: y + 6, t: 0, spin: Math.random() * 6, vx: Math.cos(a) * v, vy: Math.sin(a) * v });
    });
    this.fx.push({ kind: 'splash', x, y, t: 0, dur: 0.7 });
    this.fx.push({ kind: 'ripple', x, y, t: 0, dur: 1, size: 70 });
    this.fx.push({ kind: 'drops', x, y, t: 0, dur: 0.7, size: 1, seed: Math.random() * 100 });
    const au = this.game.audio;
    au.play('splash');
    if (n) au.play('bag_open', { volume: 0.6, delay: 0.15 });
    au.duck(true);
    this.bubbles?.stop();
    this.bubbles = au.loop('swim_bubbles', { volume: 0.5, fadeIn: 0.6 });
    this.game.platform.vibrate(70);
    this.queueShot('splash', `扑通！第${this.stats.falls}次落水`, this.stats.falls === 1 ? 8 : 6, 0.28);
    if (n && !this.game.save.tips.rescue && this.step !== 'intro') {
      // first time: once the parcels have spread out, stop the river and show how to get them back
      this.lessonAt = this.time + 0.7;
    } else if (n) {
      this.showHint('rescue', '包裹掉水里了！【点包裹】捞回来', { dur: 4, sub: '连续点屏幕，也能游过去捡', warn: true, again: true });
    } else this.swimHint();
  }

  private swimHint() {
    this.showHint('swim', '掉水里了！【连续点屏幕】游回去', { dur: 5, sub: '靠近荷叶或岸边时再点，就能跳上去', warn: true, again: true });
  }

  private endRescueLesson() {
    this.game.save.tips.rescue = true;
    this.game.writeSave();
    this.setStep(this.stepBefore);
    this.stepBefore = null;
  }

  /** Floating parcels drift with the current a little faster than the frog, then sink. */
  private updateFloaters(dt: number) {
    if (this.lessonAt !== null && this.time >= this.lessonAt) {
      this.lessonAt = null;
      if (this.floaters.length) {
        this.stepBefore = this.step;
        this.setStep('rescue');
        this.aim = null;
        this.stopCharge();
        this.hint = null;
      }
    }
    if (this.step === 'rescue') {
      if (!this.floaters.length) this.endRescueLesson();
      return;
    }
    const f = this.frog;
    for (const fl of this.floaters) {
      if (this.tongue?.fl === fl) continue;
      fl.t += dt;
      const d = Math.exp(-1.8 * dt);
      fl.vx *= d;
      fl.vy *= d;
      fl.x = clamp(fl.x + fl.vx * dt, TUNING.riverL + 24, TUNING.riverR - 24);
      fl.y += (fl.vy + TUNING.current * 1.3) * dt;
    }
    for (const fl of [...this.floaters]) {
      if (this.tongue?.fl === fl || this.tongueQ.includes(fl)) continue;
      if (f.state === 'swim' && fl.t > 0.6 && Math.hypot(fl.x - f.x, fl.y - f.y) < GRAB_R) this.catchParcel(fl);
      else if (fl.t >= FLOAT_T || this.sy(fl.y) > this.H - 20) this.loseParcel(fl);
    }
  }

  private catchParcel(fl: Floater) {
    const f = this.frog;
    const o = fl.o;
    this.floaters = this.floaters.filter((x) => x !== fl);
    this.fx.push({ kind: 'drops', x: fl.x, y: fl.y, t: 0, dur: 0.5, size: 0.6, seed: Math.random() * 100 });
    const au = this.game.audio;
    if (o.house.passed) {
      o.state = 'missed';
      this.showToast(`取件码 ${o.code} 的包裹没赶上`);
    } else {
      o.state = 'bag';
      this.bag.push(o);
      f.swingV += 6;
      this.popups.push({ text: '捞回来了！', x: f.x, y: f.y - 70, t: 0, color: P.blue });
      au.play('parcel_pickup');
    }
    if (!this.floaters.length) {
      this.doneHint('rescue');
      if (f.state === 'swim') this.swimHint();
    }
  }

  private loseParcel(fl: Floater) {
    this.floaters = this.floaters.filter((x) => x !== fl);
    fl.o.state = 'wet';
    this.fx.push({ kind: 'sink', x: fl.x, y: fl.y, t: 0, dur: 1, size: fl.o.size, urgent: fl.o.urgent });
    this.fx.push({ kind: 'ripple', x: fl.x, y: fl.y + 6, t: 0, dur: 0.9, size: 44 });
    this.game.audio.play('parcel_soaked');
    this.showToast(`取件码 ${fl.o.code} 的包裹沉下去了……`);
    if (!this.floaters.length) {
      this.doneHint('rescue');
      if (this.frog.state === 'swim') this.swimHint();
    }
  }

  /** The floating parcel under a screen point, if any. */
  private floaterAt(x: number, y: number): Floater | null {
    let best: Floater | null = null;
    let bestD = 66;
    for (const fl of this.floaters) {
      const d = Math.hypot(fl.x - x, this.sy(fl.y) - 8 - y);
      if (d < bestD) {
        bestD = d;
        best = fl;
      }
    }
    return best;
  }

  /** A tap on a floating parcel: the tongue fetches it if it's in reach, otherwise swim for it. */
  private tapFloater(fl: Floater) {
    const f = this.frog;
    if (Math.hypot(fl.x - f.x, fl.y - f.y) <= TONGUE_R && f.state !== 'jump' && f.state !== 'board') this.lick(fl);
    else if (f.state === 'swim') this.swimStroke(fl);
    else this.showToast('太远了，舌头够不着');
  }

  /** One parcel at a time; any others tapped meanwhile wait their turn. */
  private lick(fl: Floater) {
    if (this.tongue?.fl === fl || this.tongueQ.includes(fl)) return;
    if (this.tongue) {
      this.tongueQ.push(fl);
      return;
    }
    this.tongue = { fl, t: 0 };
    this.frog.giveDir = fl.x < this.frog.x ? -1 : 1;
    this.game.audio.play('jump_release', { rate: 1.9, volume: 0.6 });
  }

  private updateTongue(dt: number) {
    const tg = this.tongue;
    if (!tg) return;
    tg.t += dt;
    if (tg.t < TONGUE_OUT + TONGUE_IN) return;
    this.tongue = null;
    this.catchParcel(tg.fl);
    this.game.audio.play('frog_croak', { volume: 0.4, rate: 1.3 });
    while (this.tongueQ.length) {
      const next = this.tongueQ.shift()!;
      if (this.floaters.includes(next)) {
        this.lick(next);
        break;
      }
    }
  }

  /** Where the tongue starts, in world coordinates. */
  private mouth(): [number, number] {
    const f = this.frog;
    if (f.state === 'swim') return [f.x, f.y - 20];
    return [f.x + f.giveDir * 4, f.y - f.z - 58];
  }

  /** Tongue tip and the parcel it holds while reeling in, in world coordinates. */
  private tongueTip(): [number, number] | null {
    const tg = this.tongue;
    if (!tg) return null;
    const [mx, my] = this.mouth();
    if (tg.t < TONGUE_OUT) {
      const k = easeOutCubic(tg.t / TONGUE_OUT);
      return [lerp(mx, tg.fl.x, k), lerp(my, tg.fl.y - 10, k)];
    }
    const k = clamp((tg.t - TONGUE_OUT) / TONGUE_IN, 0, 1);
    return [lerp(tg.fl.x, mx, k * k), lerp(tg.fl.y - 10, my, k * k)];
  }

  /** Mashing in the water: go for the nearest parcel first, then for safety, leaping out when close. */
  private swimTap() {
    const f = this.frog;
    const fl = this.nearestFloater();
    const out = this.leapTarget();
    const danger = this.sy(f.y) > this.H * TUNING.warnLine - 80;
    if (out && (!fl || danger) && f.swimT > 0.2) this.leapOut(out);
    else this.swimStroke(fl ?? this.nearestRefuge());
  }

  private nearestFloater(): Floater | null {
    const f = this.frog;
    let best: Floater | null = null;
    let bestD = Infinity;
    for (const fl of this.floaters) {
      if (this.tongue?.fl === fl || this.tongueQ.includes(fl)) continue;
      const d = Math.hypot(fl.x - f.x, fl.y - f.y);
      if (d < bestD) {
        bestD = d;
        best = fl;
      }
    }
    return best;
  }

  /** A pad, house or bank close enough to spring onto from the water. */
  private leapTarget(): Plat | null {
    const f = this.frog;
    let best: Plat | null = null;
    let bestD = LEAP_R;
    for (const p of this.lv.plats) {
      if (Math.abs(p.y - f.y) > 320) continue;
      const s = this.sy(p.y);
      if (s < this.game.safeT + 130 || s > this.H - 30) continue;
      const d = Math.hypot(p.x - f.x, (p.y - f.y) * 1.25) - p.rx * 0.8;
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    const dl = f.x - TUNING.riverL, dr = TUNING.riverR - f.x;
    if (Math.min(dl, dr) < bestD) return this.lv.banks[dl <= dr ? 0 : 1];
    return best;
  }

  /** Springs out of the water onto `p`, the end of every swim. */
  private leapOut(p: Plat) {
    const f = this.frog;
    let x1: number, y1: number;
    if (p.kind === 'bank') {
      x1 = p.side === 0 ? TUNING.riverL - 40 : TUNING.riverR + 40;
      y1 = f.y - 40;
    } else if (p.kind === 'house') {
      x1 = p.x + p.house!.porch.x;
      y1 = p.y + p.house!.porch.y;
    } else if (p.kind === 'truck') {
      x1 = p.x + (p.side === 0 ? 1 : -1) * TUNING.truckSpotX[1];
      y1 = p.y + 40;
    } else {
      x1 = lerp(f.x, p.x, 0.8);
      y1 = lerp(f.y, p.y, 0.8);
    }
    const dist = Math.hypot(x1 - f.x, y1 - f.y);
    f.state = 'jump';
    f.on = null;
    f.jump = { x0: f.x, y0: f.y, x1, y1, t: 0, T: 0.3 + dist / 1100, H: 50 + dist * 0.22, dist, to: p, how: 'climb' };
    this.bubbles?.stop(0.2);
    this.bubbles = null;
    const au = this.game.audio;
    au.duck(false);
    au.play('swim_climb');
    au.play('jump_whoosh', { volume: 0.5 });
    this.fx.push({ kind: 'splash', x: f.x, y: f.y, t: 0, dur: 0.5 });
    this.fx.push({ kind: 'drops', x: f.x, y: f.y, t: 0, dur: 0.6, size: 0.8, seed: Math.random() * 100 });
    this.fx.push({ kind: 'ripple', x: f.x, y: f.y + 4, t: 0, dur: 0.8, size: 60 });
    this.doneHint('swim');
  }

  private swimStroke(tgt: { x: number; y: number }) {
    const f = this.frog;
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
    this.fx.push({ kind: 'drops', x: f.x, y: f.y, t: 0, dur: 0.4, size: 0.35, seed: Math.random() * 100 });
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
    const ux = -dx / len, uy = -dy / len;
    const dist = this.jumpDist(power, ux, uy);
    // coughing in exhaust, the frog jumps in slow motion
    const T = (0.34 + dist / 1000) * (this.smogT > 0 ? SMOG_SLOW : 1);
    f.jump = { x0: f.x, y0: f.y, x1: f.x + ux * dist, y1: f.y + uy * dist, t: 0, T, H: 36 + dist * 0.3, dist };
    if (this.step === 'aim') this.setStep('go');
    // the push-off shoves the pad down and away
    const from = f.on;
    if (from && (from.kind === 'lily' || from.kind === 'log')) {
      from.bobT = 0;
      from.press = (0.3 + power * 0.5) * (from.kind === 'log' ? 0.5 : 1);
      from.tilt = -ux;
      this.fx.push({ kind: 'ripple', x: from.x, y: from.y + 6, t: 0, dur: 0.6, size: from.rx });
    } else if (from) this.fx.push({ kind: 'dust', x: f.x, y: f.y, t: 0, dur: 0.4, size: 0.5 + power * 0.5 });
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
  }

  /** How far a jump goes with this much pull, shortened so it never leaves the screen. */
  private jumpDist(power: number, ux: number, uy: number) {
    const f = this.frog;
    const want = TUNING.minJump + power * (this.maxJump() - TUNING.minJump);
    const x = f.x, y = this.sy(f.y);
    const x0 = 26, x1 = 724, y0 = this.game.safeT + 110, y1 = this.H - 24;
    let d = want;
    if (ux < -1e-3) d = Math.min(d, (x - x0) / -ux);
    if (ux > 1e-3) d = Math.min(d, (x1 - x) / ux);
    if (uy < -1e-3) d = Math.min(d, (y - y0) / -uy);
    if (uy > 1e-3) d = Math.min(d, (y1 - y) / uy);
    return Math.max(0, d);
  }

  private checkHouses() {
    for (const h of this.lv.houses) {
      if (h.passed || this.sy(h.plat.y) < this.H + 150) continue;
      h.passed = true;
      for (const o of this.lv.orders) {
        if (o.house !== h || (o.state !== 'pool' && o.state !== 'bag')) continue;
        if (o.state === 'bag') {
          this.bag = this.bag.filter((b) => b !== o);
          this.showToast(`取件码 ${o.code} 的包裹没赶上`);
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
    const onTruck = (f.state === 'stand' && f.on?.kind === 'truck') || f.state === 'board';
    const s = this.sy(f.y);
    if (f.state !== 'jump' && !onTruck && s > this.H + 36) {
      // with the round already done, the waiting truck just reels the frog back in
      if (this.callT !== null) this.yank();
      else this.endDay('thrown');
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
      if (f.state === 'stand') this.showHint('warn', '太靠下了！【快往上跳】', { dur: 3.5, sub: '或者跳回运输车', warn: true, again: true });
    } else {
      this.inWarnT = 0;
      this.warnBuzz = 0;
      this.warnSfx = 0;
    }
  }

  private tutorial() {
    if (this.step === 'intro' || this.step === 'rescue' || this.banner) return;
    const f = this.frog;
    const onTruck = f.state === 'stand' && f.on?.kind === 'truck';
    const goal = this.bag[0];
    if (this.step === 'go' && goal && f.state === 'stand') {
      this.showHint('go', ['跳到挂着 ', codeSeg(goal), ' 的房子，送出包裹'], { dur: 5, sub: '河水一直在流，别落到红线下面' });
    }
    if (this.step === 'refill' && f.state === 'stand') this.showHint('refill', '送到了！跳回【运输车】取下一个', { dur: 5 });
    if (onTruck && this.poolCards().some((c) => c.order.urgent)) this.showHint('urgent', '【红标签】是加急件，倒计时内送到有奖金', { dur: 5 });
    if (onTruck && this.poolCards().some((c) => c.order.size === 2)) this.showHint('heavy', '【大件】很重，背着它跳不远', { dur: 5 });
  }

  /** Everything is handed out: the trucks wait a while for the frog, honk, then reel it in. */
  private updateCall(dt: number) {
    const f = this.frog;
    const aboard = (f.state === 'stand' && f.on?.kind === 'truck') || f.state === 'board';
    if (this.callT === null) {
      if (this.step === 'intro' || this.step === 'rescue' || aboard) return;
      if (this.bag.length || this.floaters.length || this.tongue || this.lv.orders.some((o) => o.state === 'pool')) return;
      this.callT = CALL_T;
      this.lastHonk = CALL_T;
      this.hint = null;
      this.showHint('call', `全部送完！【${CALL_T}秒内】跳回运输车下班`, { dur: 6, sub: '时间到会被拽上车；不着急的话，去车后面的路上逛逛' });
      this.spawnEgg();
      this.game.audio.play('truck_horn', { volume: 0.6 });
      return;
    }
    if (aboard) return;
    this.callT = Math.max(0, this.callT - dt);
    const left = Math.ceil(this.callT);
    if (left < this.lastHonk) {
      this.lastHonk = left;
      const au = this.game.audio;
      if (left >= 1 && left <= 3) {
        au.play('truck_horn', { rate: 1 + (3 - left) * 0.06 });
        this.honkT = 0.5;
        this.game.platform.vibrate(30);
      } else if (left >= 1 && left <= 6) au.play('ui_tick', { volume: 0.5 });
    }
    // a frog in mid-air gets to land first
    if (this.callT <= 0 && (f.state === 'stand' || f.state === 'swim')) this.yank();
  }

  /** Time's up (or swept away while the truck waits): the nearest truck hauls the frog aboard. */
  private yank() {
    const f = this.frog;
    if (f.state === 'board') return;
    const [a, b] = this.lv.trucks;
    const d = (t: Plat) => Math.hypot(t.x - f.x, t.y - f.y);
    const t = d(a) <= d(b) ? a : b;
    if (f.state === 'swim') {
      this.bubbles?.stop(0.2);
      this.bubbles = null;
      this.game.audio.duck(false);
      this.fx.push({ kind: 'splash', x: f.x, y: f.y, t: 0, dur: 0.5 });
    }
    this.hint = null;
    this.showToast('时间到！被运输车一把拽了回去');
    this.queueShot('yank', '被拽回车上！', 6, 0.35);
    this.runToTruck(t, f.x, f.y, true);
  }

  /** A lost letter lying on the road behind the right-hand truck, for whoever goes looking. */
  private spawnEgg() {
    if (this.egg) return;
    const t = this.lv.trucks[1];
    this.egg = { x: 692, y: t.y + TUNING.truckHalfH + 110, got: false };
  }

  private checkEgg() {
    const e = this.egg, f = this.frog;
    if (!e || e.got || f.state !== 'stand' || f.on?.kind !== 'bank') return;
    if (Math.hypot(f.x - e.x, f.y - e.y) > 90) return;
    e.got = true;
    this.hint = null;
    this.showHint('egg', '捡到一封【遗失的信】！', { dur: 5, sub: pick(LETTERS, Math.random) });
    this.queueShot('egg', '捡到一封遗失的信！', 8, 0.1);
    this.popups.push({ text: '发现彩蛋！', x: e.x - 60, y: e.y - 60, t: 0, color: P.orangeDeep });
    this.game.audio.play('paper_flip');
    this.game.audio.play('coin', { delay: 0.2, volume: 0.7 });
  }

  /** Nothing left on the trucks or in the bag: landing on a truck ends the day early. */
  private checkOffwork() {
    const f = this.frog;
    if (f.state !== 'stand' || f.on?.kind !== 'truck' || f.settle || this.step === 'intro') return;
    if (this.bag.length || this.floaters.length || this.tongue || this.lv.orders.some((o) => o.state === 'pool')) return;
    const t = f.on;
    this.ended = 'off';
    this.callT = null;
    this.aim = null;
    this.stopCharge();
    this.hint = null;
    this.toast = null;
    this.setStep(null);
    // pan so the whole truck shows, and bring it to the middle of the screen
    const half = 112;
    const panX = t.side === 0 ? Math.max(0, half - t.x) : -Math.max(0, t.x + half - 750);
    this.off = { truck: t, t: 0, line: pick(OFFWORK_LINES, Math.random), baseY: t.y, drive: 0, panX, panY: this.H * 0.56 - this.sy(t.y), horn: false, card: false };
    this.game.audio.setMusic(null);
    this.queueShot('offwork', '收工回家！', 6, 0.9);
  }

  private updateOffwork(dt: number) {
    const o = this.off!;
    o.t += dt;
    const k = easeOutCubic(Math.min(1, o.t / PAN_T));
    this.camX = o.panX * k;
    this.panY = o.panY * k;
    // the camera holds still now; only the truck moves
    this.speedK = approach(this.speedK, 0, 3, dt);
    this.placeTrucks();
    if (o.t >= DRIVE_AT) {
      if (!o.horn) {
        o.horn = true;
        this.game.audio.play('truck_horn');
      }
      const d = o.t - DRIVE_AT;
      o.drive = 60 * d + 450 * d * d;
    }
    o.truck.y = o.baseY - o.drive;
    if (o.t >= CARD_AT && !o.card) {
      o.card = true;
      this.game.audio.play('day_complete');
    }
    if (o.t >= OFF_END) this.finish();
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
    if (!this.ended || this.leaving) return;
    this.leaving = true;
    for (const o of this.lv.orders) {
      if (o.state === 'pool' || o.state === 'bag') o.state = 'missed';
      else if (o.state === 'float') o.state = 'wet';
    }
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
    this.game.go(new HqScene(this.game, result), true);
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
    // off the cargo stack and into the frog's satchel
    const f = this.frog;
    const t = f.on;
    if (t?.kind === 'truck') {
      const dir = t.side === 0 ? 1 : -1;
      this.fx.push({ kind: 'arc', x: t.x + dir * 40 * K, y: t.y + 100 * K, x2: f.x + 26 * dir, y2: f.y - 36, t: 0, dur: 0.3, size: o.size, urgent: o.urgent });
      this.fx.push({ kind: 'dust', x: f.x + 26 * dir, y: f.y - 20, t: -0.3, dur: 0.35, size: 0.4 });
    }
    f.swingV += 4;
    this.game.audio.play('parcel_pickup');
    if (this.step === 'pick') {
      this.setStep('aim');
      this.aimTarget = this.findAimTarget(o.house);
    }
  }

  private deliver(o: Order, h: House) {
    this.bag = this.bag.filter((b) => b !== o);
    o.deliveredTo = h;
    const f = this.frog;
    const rx = h.plat.x + h.resident.x, ry = h.plat.y + h.resident.y;
    // The frog leans in and tosses it over; the resident catches it and holds it up.
    const T = 0.34;
    f.give = 1;
    f.giveDir = rx < f.x ? -1 : 1;
    f.swingV += 5;
    this.fx.push({ kind: 'arc', x: f.x + f.giveDir * 24, y: f.y - 44, x2: rx, y2: ry - 64, t: 0, dur: T, size: o.size, urgent: o.urgent });
    h.hold = { size: o.size, urgent: o.urgent, wrong: o.house !== h, t: -T };
    const au = this.game.audio;
    au.play('jump_whoosh', { volume: 0.35, rate: 1.5 });
    au.play('parcel_place', { delay: T });
    if (o.house === h) {
      o.state = 'delivered';
      h.react = { kind: 'happy', t: -T };
      const amount = SIZE_INFO[o.size].pay + (o.urgent && !o.late ? TUNING.urgentBonus : 0);
      this.popups.push({ text: `+${amount}`, x: rx, y: ry - 120, t: -T - 0.1, color: P.lilyDeep });
      this.fx.push({ kind: 'heart', x: rx, y: ry - 110, t: -T, dur: 1.1 });
      this.fx.push({ kind: 'coins', x: rx, y: ry - 90, t: -T - 0.05, dur: 0.9, seed: Math.random() * 100 });
      au.play('deliver_happy', { delay: T + 0.1 });
      au.play('coin', { delay: T + 0.3, volume: 0.8 });
      const n = this.lv.orders.filter((x) => x.state === 'delivered').length;
      if (n === 1) this.queueShot('first', '第一单送达！', 4, T + 0.3);
      if (o.urgent && !o.late) this.queueShot('urgent', '加急件准时送达！', 5, T + 0.3);
    } else {
      // Not blocked: the review at HQ catches it. The resident just looks puzzled.
      o.state = 'wrong';
      h.react = { kind: 'confused', t: -T };
      au.play('deliver_confused', { delay: T + 0.15 });
      this.queueShot('wrong', `${h.name}：这是我的吗？`, 7, T + 0.5);
    }
    const more = this.lv.orders.some((x) => x.state === 'pool');
    if (this.step === 'deliver') this.setStep(!this.bag.length && more ? 'refill' : null);
    else if (this.cfg.tutorial && !this.bag.length && more) this.showHint('refill', '送到了！跳回【运输车】取下一个', { dur: 6 });
  }

  // ---------------------------------------------------------------- input

  down(x: number, y: number, id: number) {
    if (this.paused) {
      for (const b of this.menuBtns) if (hit(b.rect, x, y)) this.pressed = b.id;
      return;
    }
    if (this.off) {
      // a tap once the card is up skips the rest of the drive home
      if (this.off.t > CARD_AT + 0.8) this.off.t = OFF_END;
      return;
    }
    if (this.ended) return;
    if (this.step === 'intro') {
      if (this.stepT > 0.4 && hit(this.introBtn, x, y, 24)) this.pressed = 'intro';
      return;
    }
    if (hit(this.pauseBtn, x, y, 14)) {
      this.setPaused(true);
      this.game.audio.play('ui_open');
      return;
    }
    const fl = this.floaterAt(x, y);
    if (this.step === 'rescue') {
      // the lesson only lets go once a parcel is tapped
      if (fl) {
        this.endRescueLesson();
        this.tapFloater(fl);
      }
      return;
    }
    for (const c of this.cards) {
      if (!hit(c.rect, x, y, 4)) continue;
      if (this.trayMode === 'pickup') this.pickup(c.order);
      else if (this.trayMode === 'deliver' && this.frog.on?.house) this.deliver(c.order, this.frog.on.house);
      if (this.trayMode !== 'bag') return;
    }
    // while a card is spotlighted, only the cards respond
    if (this.step === 'pick' || this.step === 'deliver') return;
    const f = this.frog;
    if (fl && (f.state === 'swim' || f.state === 'stand')) {
      this.tapFloater(fl);
      return;
    }
    if (f.state === 'swim') {
      this.swimTap();
      return;
    }
    if (f.state === 'stand' && !this.aim) {
      this.aim = { id, sx: x, sy: y, x, y, t: 0 };
      this.exhaust();
    }
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
    if (this.pressed === 'intro') {
      this.pressed = null;
      this.startDay();
      return;
    }
    if (!this.aim || this.aim.id !== id) return;
    const a = this.aim;
    this.aim = null;
    if (this.frog.state === 'stand') this.startJump(x - a.sx, y - a.sy);
    this.stopCharge();
  }

  /** Closes the briefing card; day 1 goes on into the hands-on tutorial. */
  private startDay() {
    const au = this.game.audio;
    au.play('ui_confirm');
    au.play('truck_horn', { delay: 0.25 });
    if (this.cfg.tutorial) this.setStep('pick');
    else {
      this.setStep(null);
      this.banner = { title: `第${this.day}天 · 开工！`, sub: this.cfg.intro, t: 0, dur: 1.8 };
    }
    this.queueShot('start', '上班出发！', 1, 1.2);
  }

  /** A lily ahead that gets the frog closer to `h`, comfortably in reach: the first jump to practise. */
  private findAimTarget(h: House): Plat | null {
    const f = this.frog;
    const reach = this.maxJump() * 0.8;
    const goal = { x: h.plat.x, y: h.plat.y };
    let best: Plat | null = null;
    let bestD = Infinity;
    for (const p of this.lv.plats) {
      if (p.kind !== 'lily' && p.kind !== 'log') continue;
      const d = Math.hypot(p.x - f.x, p.y - f.y);
      const s = this.sy(p.y);
      if (d > reach || d < 120 || s > this.sy(f.y) - 60 || s < this.game.safeT + 260) continue;
      const g = Math.hypot(goal.x - p.x, goal.y - p.y) + (p.kind === 'log' ? 300 : 0);
      if (g < bestD) {
        bestD = g;
        best = p;
      }
    }
    return best;
  }

  private stopCharge() {
    this.hum?.stop();
    this.hum = null;
    this.notch = 0;
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
    this.engine?.setRate(this.off ? 0.85 + Math.min(1, this.off.drive / 500) * 0.7 : 0.8 + this.speedK * 0.2);
    if (this.frog.state === 'swim' && !this.bubbles && !this.ended) {
      // back from the pause menu while still in the water
      this.bubbles = au.loop('swim_bubbles', { volume: 0.5, fadeIn: 0.6 });
      au.duck(true);
    }
    if (this.aim && this.frog.state === 'stand') {
      // 跳一跳-style charge: a hum that rises with the pull, plus a click per notch
      const p = this.aimPower();
      if (!this.hum && p > 0.05) this.hum = au.tone(0.06);
      this.hum?.setPitch(220 * Math.pow(3, p));
      const notch = Math.floor(p * 8 + 0.001);
      if (notch > this.notch) au.play('ui_tick', { rate: 0.8 + notch * 0.12, volume: 0.55 });
      this.notch = notch;
      if (p >= 0.99 && !this.chargeMax) {
        this.chargeMax = true;
        au.play('jump_charge_max', { volume: 0.8 });
      } else if (p < 0.95) this.chargeMax = false;
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
    if (!this.ended) this.setPaused(true);
    this.aim = null;
    this.stopCharge();
  }

  /** The pause menu stops everything that makes noise, music included, and picks it up again after. */
  private setPaused(on: boolean) {
    if (this.paused === on) return;
    this.paused = on;
    const au = this.game.audio;
    if (on) {
      this.aim = null;
      this.stopLoops();
      au.pauseMusic();
    } else au.resumeMusic();
  }

  private menu(id: string) {
    this.game.audio.play(id === 'resume' ? 'ui_close' : 'ui_tap');
    if (id === 'resume') this.setPaused(false);
    else if (id === 'restart') {
      this.stopLoops();
      this.game.go(new PlayScene(this.game, this.day));
    } else if (id === 'title') {
      this.stopLoops();
      this.game.go(new TitleScene(this.game));
    } else if (id === 'sound') this.game.setSound(!this.game.save.sound);
  }

  // ---------------------------------------------------------------- hints, photos

  private showHint(key: HintKey, line: string | Seg[], o: { dur?: number; sub?: string; warn?: boolean; again?: boolean } = {}) {
    if (this.hintsDone.has(key) || this.hint?.key === key) return;
    // a standing tutorial hint only gives way to emergencies
    if (this.hint && this.hint.dur > 50 && key !== 'swim' && key !== 'warn' && key !== 'wrongHouse') return;
    this.hint = { key, line: typeof line === 'string' ? segs(line) : line, sub: o.sub, t: 0, dur: o.dur ?? 5, warn: o.warn };
    if (!o.again) this.hintsDone.add(key);
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
      const cx = clamp(f.x + this.camX, w / 2, 750 - w / 2);
      const fy = s.thrown ? this.H - 90 : this.sy(f.y) + this.panY - f.z - 50;
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
    if (this.camX) {
      // the road carries on past the tile's edge while the camera is panned sideways
      ctx.fillStyle = P.road;
      ctx.fillRect(0, 0, 750, H);
    }
    ctx.save();
    // a hard landing gives the camera a little knock
    const sh = this.shakeT > 0 ? (this.shakeT / 0.22) * 7 : 0;
    ctx.translate(this.camX + (sh ? Math.sin(this.time * 90) * sh : 0), this.panY + (sh ? Math.cos(this.time * 77) * sh * 0.6 : 0));
    // River background tiles
    const top = this.camY - this.panY;
    for (let k = Math.floor(top / TILE); k * TILE - top < H; k++) {
      ctx.drawImage(this.game.sprites.get('river').img, 0, k * TILE - this.camY, 750, TILE + 1);
    }
    this.drawWorld(ctx);
    ctx.restore();
    this.takeShots(ctx);
    const hudA = this.off ? 1 - clamp(this.off.t / 0.4, 0, 1) : 1;
    if (hudA > 0) {
      ctx.save();
      ctx.globalAlpha = hudA;
      this.drawAim(ctx);
      this.drawPullHandle(ctx);
      this.drawWarn(ctx);
      this.drawHud(ctx);
      ctx.restore();
    }
    if (this.step && this.step !== 'go' && this.step !== 'refill' && !this.paused) this.drawCoach(ctx);
    if (this.off) this.drawOffCard(ctx);
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
      const s = this.sy(p.y) + this.panY;
      if (s < -260 || s > H + 140) continue;
      items.push({ y: p.y, draw: () => this.drawPlat(ctx, p) });
    }
    for (const t of this.lv.trucks) items.push({ y: t.y, draw: () => this.drawTruck(ctx, t) });
    // Effects that sit on the water go first.
    for (const e of this.fx) if (e.t >= 0 && (e.kind === 'ripple' || e.kind === 'floatBox' || e.kind === 'sink')) items.push({ y: e.y - 40, draw: () => this.drawFx(ctx, e) });
    const egg = this.egg;
    if (egg && !egg.got) items.push({ y: egg.y - 20, draw: () => this.drawEgg(ctx, egg.x, this.sy(egg.y)) });
    const flying = f.state === 'jump' || f.state === 'board';
    if (!flying) {
      const key = f.state === 'stand' && f.on ? (f.on.kind === 'bank' ? f.y : f.on.y + 0.5 + (f.on.kind === 'house' ? 40 : 0)) : f.y;
      items.push({ y: key, draw: () => this.drawFrog(ctx) });
    }
    items.sort((a, b) => a.y - b.y);
    for (const it of items) it.draw();
    // parcels adrift stay on top so they're never lost behind a pad
    for (const fl of this.floaters) this.drawFloater(ctx, fl);
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
    // Back-to-the-truck arrows while the tutorial asks for a refill, or the trucks are waiting
    if (this.step === 'refill' || (this.callT !== null && f.state !== 'board' && !this.off)) {
      for (const t of this.lv.trucks) {
        const dir = t.side === 0 ? -1 : 1;
        const x = t.x - dir * (120 + Math.abs(Math.sin(this.time * 5)) * 14), y = this.sy(t.y) + 30;
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(dir, 1);
        ctx.fillStyle = P.orange;
        ctx.strokeStyle = INK;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(-26, -12);
        ctx.lineTo(4, -12);
        ctx.lineTo(4, -26);
        ctx.lineTo(30, 0);
        ctx.lineTo(4, 26);
        ctx.lineTo(4, 12);
        ctx.lineTo(-26, 12);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }
    if (flying) this.drawFrog(ctx);
    if (f.board?.yank) this.drawRope(ctx, f.board.truck);
    this.drawTongue(ctx);
    for (const e of this.fx) if (e.t >= 0 && e.kind !== 'ripple' && e.kind !== 'floatBox' && e.kind !== 'sink' && e.kind !== 'fly') this.drawFx(ctx, e);
    for (const p of this.popups) {
      if (p.t < 0) continue;
      const k = p.t / 1.2;
      text(ctx, p.text, p.x, this.sy(p.y) - 40 * easeOutCubic(k), 34, { color: p.color, bold: true, alpha: 1 - k * k });
    }
    this.drawPuffs(ctx);
  }

  /** Exhaust clouds: thick enough to hide the road and the frog under them. */
  private drawPuffs(ctx: Ctx) {
    if (!this.puffs.length) return;
    ctx.save();
    for (const p of this.puffs) {
      if (p.t < 0) continue;
      const k = p.t / p.dur;
      const a = (k < 0.08 ? k / 0.08 : k > 0.7 ? (1 - k) / 0.3 : 1) * 0.9;
      const r = p.r * (0.45 + easeOutCubic(Math.min(1, k * 2.2)) * 0.95);
      const x = p.x, y = this.sy(p.y);
      ctx.globalAlpha = a;
      ellipse(ctx, x, y, r, r * 0.86);
      ctx.fillStyle = '#3E3733';
      ctx.fill();
      ctx.strokeStyle = 'rgba(36,28,22,0.6)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ellipse(ctx, x - r * 0.25, y - r * 0.28, r * 0.55, r * 0.45);
      ctx.fillStyle = '#5A514B';
      ctx.fill();
    }
    ctx.restore();
  }

  /** Damped wobble after a landing (positive = pushed down); a pad also sinks under a charging frog. */
  private wobble(p: Plat) {
    const t = p.bobT;
    const w = t < 1.5 ? Math.exp(-4.5 * t) * Math.cos(15 * t) * p.press : 0;
    const f = this.frog;
    const load = f.state === 'stand' && f.on === p && this.aim ? this.aimPower() * 0.4 : 0;
    return w + load;
  }

  /** How far the frog standing on `p` sinks with it. */
  private padSink(p: Plat | null) {
    if (!p) return 0;
    const a = this.wobble(p);
    return p.kind === 'lily' ? a * 7 : p.kind === 'log' ? a * 3 : p.kind === 'house' ? a * 2.5 : 0;
  }

  private drawPlat(ctx: Ctx, p: Plat) {
    const sp = this.game.sprites;
    const x = p.x, y = this.sy(p.y);
    const a = this.wobble(p);
    const dy = this.padSink(p);
    const w = p.bobT < 1.5 ? Math.exp(-4.5 * p.bobT) * Math.sin(15 * p.bobT) : 0;
    if (p.kind === 'lily') {
      const s = p.rx / (100 * K);
      // squashes flat, then springs back, tipping toward where the frog came down
      sp.draw(ctx, `lily${p.variant}`, x, y + dy, s * (1 + a * 0.05), s * (1 - a * 0.12), p.tilt * w * p.press * 0.12);
    } else if (p.kind === 'log') {
      // a log barely sinks, it rocks
      sp.draw(ctx, 'log', x, y + dy, 1, 1 - a * 0.04, p.rot + p.tilt * w * p.press * 0.08);
    } else if (p.kind === 'house') {
      const h = p.house!;
      sp.draw(ctx, `house_${h.type}`, x, y + dy);
      this.drawResident(ctx, h, x, y + dy);
      this.drawCodeSign(ctx, h, x + h.plateAt.x, y + dy + h.plateAt.y);
    }
  }

  /** A post by the door with the pickup codes this house is still waiting for. */
  private drawCodeSign(ctx: Ctx, h: House, px: number, py: number) {
    const codes = this.lv.orders.filter((o) => o.house === h && (o.state === 'pool' || o.state === 'bag' || o.state === 'float'));
    const n = codes.length;
    const bw = Math.max(1, n) * 40 + 10;
    ctx.save();
    ctx.strokeStyle = P.woodDeep;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(px, py - 30);
    ctx.lineTo(px, py + 34);
    ctx.stroke();
    // crossbar the tags hang from
    roundRect(ctx, px - bw / 2, py - 36, bw, 10, 4);
    ctx.fillStyle = P.wood;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.restore();
    codes.forEach((o, i) => {
      const tx = px - bw / 2 + 25 + i * 40, sway = Math.sin(this.time * 2 + h.phase + i) * 0.06;
      ctx.save();
      ctx.translate(tx, py - 28);
      ctx.rotate(sway);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, 6);
      ctx.stroke();
      codeTag(ctx, 0, 26, o.code, h.color, 0.95);
      ctx.restore();
    });
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
    const r = h.react && h.react.t >= 0 ? h.react : null;
    if (r && r.t < 1.8) {
      if (r.kind === 'happy') ry -= Math.abs(Math.sin(r.t * 9)) * 16 * Math.max(0, 1 - r.t / 1.2);
      else rot += 0.2 * Math.sin(Math.min(r.t * 6, Math.PI / 2));
    }
    sp.draw(ctx, h.species, rx, ry, sx * 1.05, sy * 1.05, rot);
    // the parcel just handed over, held up overhead (and turned about, if it isn't theirs)
    const hd = h.hold;
    if (hd && hd.t >= 0) {
      const up = easeOutBack(Math.min(1, hd.t / 0.25));
      const a = hd.t > 1.25 ? Math.max(0, (1.6 - hd.t) / 0.35) : 1;
      const shake = hd.wrong ? Math.sin(hd.t * 26) * 0.12 * Math.max(0, 1 - hd.t / 1.2) : 0;
      sp.draw(ctx, `box${hd.size}${hd.urgent ? 'u' : ''}`, rx + (hd.wrong ? Math.sin(hd.t * 26) * 3 : 0), ry - 58 - up * 16, 0.85, 0.85, shake + rot, a);
    }
    if (r && r.kind === 'confused' && r.t < 2) {
      const a = Math.min(1, r.t * 5) * (r.t > 1.6 ? (2 - r.t) / 0.4 : 1);
      ctx.save();
      ctx.globalAlpha = a;
      const bx = rx + (hd ? 52 : 18), by = ry - (hd ? 118 : 92);
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
    // honking makes the whole truck jitter
    const honk = this.honkT > 0 ? Math.sin(this.time * 70 + t.side) * 3 * (this.honkT / 0.5) : 0;
    const x = t.x + honk, y = this.sy(t.y) + Math.sin(this.time * 13 + t.side) * 0.8;
    drawTruckBase(ctx, x, y, -this.camY);
    sp.draw(ctx, t.side === 0 ? 'truck_orange' : 'truck_blue', x, y);
    text(ctx, '蛙趣', x, y + 173 * K + 0.5, 11, { bold: true });
    // cargo = the shared pool of parcels still waiting
    const pool = this.lv.orders.filter((o) => o.state === 'pool' && !o.house.passed).slice(0, 5);
    // stacked on the inner half of the bed, the half that's on screen
    const slots: [number, number][] = [[20, 74], [62, 80], [30, 106], [66, 140], [24, 156]];
    const dir = t.side === 0 ? 1 : -1;
    const drawn = pool.map((o, i) => ({ o, s: slots[i] })).sort((a, b) => a.s[1] - b.s[1]);
    for (const { o, s } of drawn) sp.draw(ctx, `box${o.size}${o.urgent ? 'u' : ''}`, x + dir * s[0] * K, y + s[1] * K);
    if (this.honkT > 0) {
      const k = 1 - this.honkT / 0.5;
      const bx = t.x + dir * 70, by = this.sy(t.y) - 150 - k * 14;
      ctx.save();
      ctx.globalAlpha = Math.min(1, (1 - k) * 3);
      panel(ctx, bx - 58, by - 26, 116, 52, { r: 26, fill: P.gold, shadow: false });
      text(ctx, '嘀嘀！', bx, by + 1, 28, { bold: true });
      ctx.restore();
    }
  }

  private drawFrog(ctx: Ctx) {
    const sp = this.game.sprites;
    const f = this.frog;
    const x = f.x, gy = this.sy(f.y);
    if (f.state === 'swim') {
      // each stroke kicks the frog forward: a squash, a lunge, and a wake behind it
      const stroke = f.strokeT < 0.3 ? 1 - f.strokeT / 0.3 : 0;
      const bob = Math.sin(this.time * 7) * 2 - stroke * 5;
      const v = Math.hypot(f.vx, f.vy);
      if (v > 40) {
        const ux = f.vx / v, uy = f.vy / v;
        ctx.save();
        ctx.strokeStyle = 'rgba(251,247,238,0.75)';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(x - ux * 30 + uy * side * 22, gy + 8 - uy * 14 - ux * side * 8);
          ctx.lineTo(x - ux * (60 + v * 0.12) + uy * side * (40 + v * 0.06), gy + 10 - uy * 30 - ux * side * 16);
          ctx.stroke();
        }
        ctx.restore();
      }
      ellipse(ctx, x, gy + 6, 56 + stroke * 8, 16 + stroke * 3);
      ctx.strokeStyle = 'rgba(251,247,238,0.7)';
      ctx.lineWidth = 3;
      ctx.stroke();
      // leaning into the stroke, or toward a parcel being licked up
      const lean = this.tongue ? f.giveDir * 0.15 : v > 20 ? clamp(f.vx / 300, -0.3, 0.3) : 0;
      sp.draw(ctx, 'frog_swim', x, gy + 4 + bob, FROG_S * (1 + stroke * 0.1), FROG_S * (1 - stroke * 0.08), lean + Math.sin(this.time * 9) * 0.05 * (1 - stroke));
      return;
    }
    const b = f.board;
    // shadow stays on the surface below
    const onWood = f.state === 'stand' && f.on && (f.on.kind === 'house' || f.on.kind === 'truck' || f.on.kind === 'log');
    const sink = f.state === 'stand' ? this.padSink(f.on) : 0;
    const shrink = 1 - Math.min(0.5, f.z / 300);
    ctx.save();
    ctx.globalAlpha = 0.42 * shrink;
    ellipse(ctx, x + 5 + f.z * 0.08, gy + 3 + sink, 40 * shrink, 11 * shrink);
    ctx.fillStyle = f.state === 'jump' ? P.tealDeep : b || f.on?.kind === 'bank' ? P.roadDeep : onWood ? P.woodDeep : P.lilyDeep;
    ctx.fill();
    ctx.restore();

    let sx = 1, sy = 1, rot = 0, ox = 0;
    let name = this.off ? 'frog_happy' : this.smogT > 0 ? 'frog_nervous' : 'frog_stand';
    const power = this.aimPower();
    if (f.state === 'stand') {
      sy *= 1 + Math.sin(this.time * 3) * 0.015;
      if (this.aim && power > 0.05) {
        name = 'frog_crouch';
        sy *= 1 - 0.13 * power;
        sx *= 1 + 0.06 * power;
        const [ux] = this.aimDir();
        rot = clamp(ux * 0.2 * power, -0.2, 0.2);
        // fully wound up: a little tremble
        if (power >= 0.99) ox = Math.sin(this.time * 70) * 1.6;
      }
      if (f.landT < 0.36) {
        // harder landings squash further
        const k = springOut(f.landT / 0.36, 2);
        sy *= 1 - (0.08 + 0.16 * f.impact) * k;
        sx *= 1 + (0.05 + 0.1 * f.impact) * k;
      }
      if (f.give > 0 || this.tongue) {
        // leaning in to hand a parcel over, or to lick one out of the water
        const lean = this.tongue ? 1 : Math.sin(f.give * Math.PI);
        rot += f.giveDir * 0.2 * lean;
        ox += f.giveDir * 8 * lean;
        if (this.tongue) name = 'frog_shock';
      }
    } else if (b) {
      // the hop onto the bed is a flip; on the end of the rope it's two panicked spins
      const k = clamp(b.t / (b.yank ? YANK_T : BOARD_LEAP_T), 0, 1);
      const dir = b.truck.side === 0 ? -1 : 1;
      name = b.yank ? 'frog_shock' : f.z > 10 ? 'frog_jump' : 'frog_crouch';
      rot = dir * Math.PI * 2 * (b.yank ? 2 * k : easeOutCubic(k));
    } else if (f.jump) {
      const k = f.jump.t / f.jump.T;
      name = f.z > 8 ? 'frog_jump' : 'frog_crouch';
      if (k < 0.3) {
        sy *= 1.18 - (k / 0.3) * 0.18;
        sx *= 0.9 + (k / 0.3) * 0.1;
      }
      rot = ((f.jump.x1 - f.jump.x0) / Math.max(1, f.jump.dist)) * 0.22;
    }
    const y = gy - f.z + sink;
    ctx.save();
    // flips turn about the frog's middle rather than its feet
    const mid = b ? 50 : 0;
    ctx.translate(x + ox, y - mid);
    ctx.rotate(rot);
    ctx.translate(0, mid);
    sp.draw(ctx, name, 0, 0, FROG_S * sx, FROG_S * sy);
    // satchel hangs from the strap and swings with the jumps
    const w = this.weight();
    const size = w <= 1 ? 0 : w <= 3 ? 1 : 2;
    const sxp = 30 * K * FROG_S * sx, syp = -40 * K * FROG_S * sy;
    sp.draw(ctx, `satchel${size}`, sxp, syp, FROG_S * (this.bag.length ? 1 : 0.9), FROG_S, clamp(f.swing * 0.1, -0.5, 0.5));
    ctx.restore();
  }

  /** A parcel adrift: bobbing, with a ring that runs out as it gets ready to sink. */
  private drawFloater(ctx: Ctx, fl: Floater) {
    const sp = this.game.sprites;
    const x = fl.x, y = this.sy(fl.y);
    const left = clamp(1 - fl.t / FLOAT_T, 0, 1);
    const sink = fl.t > FLOAT_T - 1.5 ? (fl.t - (FLOAT_T - 1.5)) / 1.5 : 0;
    const bob = Math.sin(this.time * 4 + fl.spin) * 3;
    const reeled = this.tongue?.fl === fl && this.tongue.t >= TONGUE_OUT;
    if (reeled) {
      const [tx, ty] = this.tongueTip()!;
      sp.draw(ctx, `box${fl.o.size}${fl.o.urgent ? 'u' : ''}`, tx, this.sy(ty) + 24, 0.8, 0.8, Math.sin(this.time * 20) * 0.2);
      return;
    }
    ctx.save();
    ellipse(ctx, x, y + 4, 46, 18);
    ctx.fillStyle = 'rgba(63,94,120,0.22)';
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x, y + 4, 52, 22, 0, -Math.PI / 2, -Math.PI / 2 + left * Math.PI * 2);
    ctx.strokeStyle = left < 0.35 ? P.red : P.white;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.restore();
    sp.draw(ctx, `box${fl.o.size}${fl.o.urgent ? 'u' : ''}`, x, y + 8 + bob + sink * 16, 0.82, 0.82 * (1 - sink * 0.35), Math.sin(this.time * 2 + fl.spin) * 0.2, 1 - sink * 0.5);
    // a wavy water line across the bottom of the box
    ctx.save();
    ctx.strokeStyle = 'rgba(251,247,238,0.85)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i <= 8; i++) {
      const wx = x - 34 + i * 8.5, wy = y + 6 + Math.sin(this.time * 6 + i) * 2;
      if (i === 0) ctx.moveTo(wx, wy);
      else ctx.lineTo(wx, wy);
    }
    ctx.stroke();
    ctx.restore();
    codeTag(ctx, x + 34, y - 40 + bob, fl.o.code, fl.o.house.color, 0.75);
  }

  private drawTongue(ctx: Ctx) {
    const tip = this.tongueTip();
    if (!tip) return;
    const [mx, my] = this.mouth();
    const ax = mx, ay = this.sy(my), bx = tip[0], by = this.sy(tip[1]);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.strokeStyle = '#E07F79';
    ctx.lineWidth = 8;
    ctx.stroke();
    ellipse(ctx, bx, by, 9, 9);
    ctx.fillStyle = '#E07F79';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  /** The tow rope from the cab while the truck hauls the frog in. */
  private drawRope(ctx: Ctx, t: Plat) {
    const f = this.frog;
    const dir = t.side === 0 ? 1 : -1;
    const ax = t.x + dir * 30, ay = this.sy(t.y) - 70;
    const bx = f.x, by = this.sy(f.y) - f.z - 40;
    const sag = 40 * (1 - clamp(f.board!.t / YANK_T, 0, 1));
    ctx.save();
    ctx.strokeStyle = P.woodDeep;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.setLineDash([10, 4]);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.quadraticCurveTo((ax + bx) / 2, (ay + by) / 2 + sag, bx, by);
    ctx.stroke();
    ctx.restore();
  }

  /** The lost letter: an envelope with a red seal, glinting now and then. */
  private drawEgg(ctx: Ctx, x: number, y: number) {
    const bob = Math.sin(this.time * 3) * 2;
    ctx.save();
    ctx.translate(x, y + bob);
    ctx.rotate(-0.15);
    ctx.globalAlpha = 0.35;
    ellipse(ctx, 2, 18, 30, 7);
    ctx.fillStyle = P.roadDeep;
    ctx.fill();
    ctx.globalAlpha = 1;
    roundRect(ctx, -28, -18, 56, 36, 4);
    ctx.fillStyle = P.white;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.2;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-28, -18);
    ctx.lineTo(0, 4);
    ctx.lineTo(28, -18);
    ctx.stroke();
    ellipse(ctx, 0, 4, 7, 7);
    ctx.fillStyle = P.red;
    ctx.fill();
    ctx.stroke();
    const g = (this.time * 0.7) % 1;
    if (g < 0.25) {
      // a little sparkle
      const k = g / 0.25;
      ctx.globalAlpha = Math.sin(k * Math.PI);
      ctx.strokeStyle = P.gold;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(22, -34);
      ctx.lineTo(22, -18);
      ctx.moveTo(14, -26);
      ctx.lineTo(30, -26);
      ctx.stroke();
    }
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
      case 'drops': {
        // droplets thrown up and falling back
        const n = Math.round(4 + (e.size ?? 1) * 6);
        const sd = e.seed ?? 0;
        ctx.save();
        ctx.globalAlpha = 1 - k * k;
        for (let i = 0; i < n; i++) {
          const ang = Math.PI * (0.15 + 0.7 * frac(sd + i * 0.618));
          const v = (60 + 90 * frac(sd * 1.7 + i * 0.37)) * (0.6 + (e.size ?? 1) * 0.5);
          const dx = Math.cos(ang) * v * k * (i % 2 ? 1 : -1);
          const dy = -Math.sin(ang) * v * k * 1.3 + 260 * k * k;
          const r = 3 + 3 * frac(sd + i * 0.91);
          ellipse(ctx, x + dx, y - 14 + dy, r, r * 1.2);
          ctx.fillStyle = P.white;
          ctx.fill();
          ctx.strokeStyle = P.tealDeep;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
        ctx.restore();
        break;
      }
      case 'petals': {
        // petals knocked off the flower, fluttering down onto the water
        const sd = e.seed ?? 0;
        ctx.save();
        ctx.globalAlpha = k > 0.6 ? (1 - k) / 0.4 : 1;
        for (let i = 0; i < 5; i++) {
          const ang = Math.PI * 2 * frac(sd + i * 0.23);
          const v = (30 + 40 * frac(sd * 2.3 + i * 0.41)) * (0.6 + (e.size ?? 1) * 0.6);
          const px = x + Math.cos(ang) * v * easeOutCubic(k) + Math.sin(e.t * 6 + i) * 5;
          const py = y - 20 + Math.sin(ang) * v * 0.5 * easeOutCubic(k) - 40 * Math.sin(k * Math.PI) * (0.6 + frac(sd + i));
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(e.t * 5 + i);
          ellipse(ctx, 0, 0, 8, 4.5);
          ctx.fillStyle = P.pink;
          ctx.fill();
          ctx.strokeStyle = INK;
          ctx.lineWidth = 1.2;
          ctx.stroke();
          ctx.restore();
        }
        ctx.restore();
        break;
      }
      case 'sink': {
        // the lost parcel goes under in a burst of bubbles
        sp.draw(ctx, `box${e.size ?? 0}${e.urgent ? 'u' : ''}`, x, y + 8 + k * 26, 0.82, 0.82 * (1 - k * 0.7), Math.sin(e.t * 9) * 0.15, (1 - k) * 0.7);
        ctx.save();
        ctx.strokeStyle = P.white;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 1 - k;
        for (let i = 0; i < 4; i++) {
          const bk = (k * 1.6 + i * 0.25) % 1;
          ellipse(ctx, x - 18 + i * 12, y - bk * 40, 4 + i, 4 + i);
          ctx.stroke();
        }
        ctx.restore();
        break;
      }
      case 'arc': {
        // a parcel tossed from one spot to another
        const kk = easeOutCubic(k);
        const ax = lerp(x, e.x2!, kk), ay = lerp(y, this.sy(e.y2!), kk) - 90 * Math.sin(k * Math.PI);
        sp.draw(ctx, `box${e.size ?? 0}${e.urgent ? 'u' : ''}`, ax, ay + 24, 0.8, 0.8, k * 2 * Math.PI * 0.5);
        break;
      }
      case 'coins': {
        const sd = e.seed ?? 0;
        for (let i = 0; i < 3; i++) {
          const dx = (i - 1) * 34 * easeOutCubic(k) + (frac(sd + i) - 0.5) * 10;
          const dy = -90 * easeOutCubic(k) + 120 * k * k - i * 8;
          sp.draw(ctx, 'coin', x + dx, y + dy, 0.55, 0.55 * Math.abs(Math.cos(e.t * 10 + i)), 0, 1 - k * k);
        }
        break;
      }
      case 'say': {
        // a speech bubble that follows the frog
        const f = this.frog;
        const bx = f.x + 54, by = this.sy(f.y) - f.z - 128;
        const pop = easeOutBack(Math.min(1, e.t / 0.18));
        const a = k > 0.75 ? (1 - k) / 0.25 : 1;
        ctx.save();
        ctx.globalAlpha = a;
        ctx.translate(bx, by);
        ctx.scale(pop, pop);
        ctx.font = font(30, true);
        const w = ctx.measureText(e.label ?? '').width + 36;
        panel(ctx, -w / 2, -26, w, 52, { r: 24, fill: P.white, shadow: false });
        text(ctx, e.label ?? '', 0, 1, 30, { bold: true });
        ctx.restore();
        break;
      }
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
    const delay = this.step === 'aim' ? 0 : this.cfg.predictDelay;
    if (this.aim.t >= delay && len >= TUNING.deadDrag) {
      const dist = this.jumpDist(power, ux, uy);
      const tx = fx + ux * dist, ty = fy + uy * dist;
      const hj = 36 + dist * 0.3;
      const a = Math.min(1, (this.aim.t - delay) * 4);
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

  /**
   * The slingshot under the finger: where the press started, the band to the finger, and an arrow
   * the way the frog will go. The pull works anywhere, so this mirrors the frog's own aim.
   */
  private drawPullHandle(ctx: Ctx) {
    const a = this.aim;
    if (!a || this.frog.state !== 'stand') return;
    const [dx, dy] = this.aimVec();
    const len = Math.hypot(dx, dy);
    const power = this.aimPower();
    const [ux, uy] = this.aimDir();
    ctx.save();
    // anchor ring with the power filling clockwise
    ellipse(ctx, a.sx, a.sy, 40, 40);
    ctx.fillStyle = 'rgba(251,247,238,0.35)';
    ctx.fill();
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.setLineDash([]);
    if (power > 0.01) {
      ctx.beginPath();
      ctx.arc(a.sx, a.sy, 40, -Math.PI / 2, -Math.PI / 2 + power * Math.PI * 2);
      ctx.strokeStyle = power >= 0.99 ? P.red : P.gold;
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      ctx.stroke();
    }
    if (len >= 6) {
      // rubber band to the finger
      const pl = Math.min(len, TUNING.maxDrag);
      const fx = a.sx - ux * pl, fy = a.sy - uy * pl;
      ctx.strokeStyle = P.blue;
      ctx.globalAlpha = 0.8;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(a.sx, a.sy);
      ctx.lineTo(fx, fy);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ellipse(ctx, fx, fy, 15, 15);
      ctx.fillStyle = P.white;
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.stroke();
      // arrow out of the anchor, the way the frog will jump
      const al = 26 + 56 * power;
      const bx = a.sx + ux * (40 + al), by = a.sy + uy * (40 + al);
      ctx.strokeStyle = P.orange;
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(a.sx + ux * 44, a.sy + uy * 44);
      ctx.lineTo(bx, by);
      ctx.stroke();
      ctx.fillStyle = P.orange;
      ctx.lineWidth = 2;
      ctx.strokeStyle = INK;
      ctx.beginPath();
      ctx.moveTo(bx + ux * 15, by + uy * 15);
      ctx.lineTo(bx - uy * 10, by + ux * 10);
      ctx.lineTo(bx + uy * 10, by - ux * 10);
      ctx.closePath();
      ctx.fill();
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

    if (this.callT !== null && !this.off) this.drawCall(ctx);
    // hint bubble
    if (this.hint && !this.paused && (!this.step || this.step === 'go' || this.step === 'refill')) this.drawHint(ctx);
    if (this.toast) {
      const a = Math.min(1, this.toast.t * 6) * (this.toast.t > 1.8 ? (2.2 - this.toast.t) / 0.4 : 1);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.font = '26px WK';
      const w = Math.max(220, ctx.measureText(this.toast.text).width + 60);
      const y = this.trayY() - (this.callT !== null ? 270 : 190);
      panel(ctx, 375 - w / 2, y, w, 56, { r: 28, fill: P.cream });
      text(ctx, this.toast.text, 375, y + 29, 26);
      ctx.restore();
    }
    if (this.banner) this.drawBanner(ctx);
  }

  /** The countdown pill while the trucks wait: calm at first, red and honking at the end. */
  private drawCall(ctx: Ctx) {
    const left = Math.max(0, Math.ceil(this.callT!));
    const hurry = left <= 3;
    const y = this.trayY() - 160;
    const s = hurry ? 1 + Math.max(0, Math.sin(this.time * 12)) * 0.06 : 1;
    ctx.save();
    ctx.translate(375, y);
    ctx.scale(s, s);
    panel(ctx, -250, -44, 500, 88, { r: 44, fill: hurry ? '#FBE6DE' : P.paper, stitch: hurry ? P.red : undefined });
    rich(ctx, segs(`跳回运输车下班  【${left}】秒`), 0, -8, 36, { bold: true, color: hurry ? P.red : INK, hl: hurry ? P.red : undefined });
    // time bar
    const k = clamp(this.callT! / CALL_T, 0, 1);
    roundRect(ctx, -190, 22, 380, 10, 5);
    ctx.fillStyle = 'rgba(74,59,48,0.15)';
    ctx.fill();
    roundRect(ctx, -190, 22, 380 * k, 10, 5);
    ctx.fillStyle = hurry ? P.red : P.orange;
    ctx.fill();
    ctx.restore();
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
    codeTag(ctx, 100, 54, urgent.code, urgent.house.color, 0.85);
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
        title = `交给 ${h.name}`;
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
    const pulse = (this.step === 'pick' || this.step === 'deliver') && this.trayMode !== 'bag' ? 1 + Math.sin(this.time * 6) * 0.03 : 1;
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
    codeTag(ctx, x + w * 0.76, y + 30 * k, o.code, o.house.color, 1.05 * k);
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
    // below the top bar, or below the urgent card when one is showing
    const urgent = this.bag.some((o) => o.urgent);
    this.drawCaption(ctx, h.line, h.sub, this.game.safeT + (urgent ? 214 : 98), a, h.warn);
  }

  /** Big caption card used by the tutorial and the hints: one line of rich text and an optional smaller line. */
  private drawCaption(ctx: Ctx, line: Seg[], sub: string | undefined, y: number, alpha: number, warn = false) {
    ctx.save();
    ctx.globalAlpha *= alpha;
    let size = 38;
    const lw = richWidth(ctx, line, size, true);
    if (lw > 640) size = Math.floor((size * 640) / lw);
    ctx.font = font(26);
    const sw = sub ? ctx.measureText(sub).width : 0;
    const w = clamp(Math.max(richWidth(ctx, line, size, true), sw) + 80, 380, 710);
    const h = sub ? 128 : 86;
    panel(ctx, 375 - w / 2, y, w, h, { r: 22, fill: warn ? '#FBE6DE' : P.paper, stitch: warn ? P.red : undefined });
    rich(ctx, line, 375, y + 44, size, { bold: true, color: warn ? P.red : INK, hl: warn ? P.red : undefined });
    if (sub) text(ctx, sub, 375, y + 96, 26, { color: P.inkSoft, maxWidth: w - 40 });
    ctx.restore();
  }

  /** Spotlight tutorial steps: the screen dims except what to touch, with a big caption and a demo hand. */
  private drawCoach(ctx: Ctx) {
    if (this.step === 'intro') {
      this.drawIntro(ctx);
      return;
    }
    const H = this.H;
    const f = this.frog;
    const holes: { x: number; y: number; w: number; h: number; round: boolean }[] = [];
    let line: Seg[] = [];
    let sub = '';
    let capY = 0;
    let hand: { kind: 'tap' | 'drag'; x: number; y: number } | null = null;
    if (this.step === 'pick' || this.step === 'deliver') {
      if (!this.cards.length || this.trayMode === 'bag') return;
      const c = (this.step === 'deliver' && this.cards.find((c) => c.order.house === f.on?.house)) || this.cards[0];
      const first = this.cards[0].rect, last = this.cards[this.cards.length - 1].rect;
      holes.push({ x: first.x - 16, y: first.y - 56, w: Math.max(last.x + last.w - first.x + 32, 340), h: first.h + 72, round: false });
      line = segs(this.step === 'pick' ? '点一下【包裹】，装进背包' : '点【包裹】，交给住户');
      sub = this.step === 'pick' ? '卡片上的数字是取件码，房子上挂着同样的码' : '取件码和颜色要对得上';
      capY = first.y - 56 - 150;
      hand = { kind: 'tap', x: c.rect.x + c.rect.w * 0.55, y: c.rect.y + c.rect.h * 0.5 };
    } else if (this.step === 'aim') {
      const fy = this.sy(f.y);
      holes.push({ x: f.x - 100, y: fy - 160, w: 200, h: 210, round: true });
      const t = this.aimTarget;
      if (t) holes.push({ x: t.x - t.rx - 30, y: this.sy(t.y) - t.ry - 44, w: (t.rx + 30) * 2, h: (t.ry + 44) * 2, round: true });
      const zx = 470, zy = clamp(fy - 40, H * 0.4, H * 0.62);
      holes.push({ x: zx - 90, y: zy - 90, w: 180, h: 180, round: true });
      line = segs('在【任意空白处】按住往下拉');
      sub = '不用按青蛙，松手就往反方向跳，拉得越长跳得越远';
      capY = this.game.safeT + 100;
      if (!this.aim) hand = { kind: 'drag', x: zx, y: zy };
    } else if (this.step === 'rescue') {
      for (const fl of this.floaters) {
        const fy = this.sy(fl.y);
        holes.push({ x: fl.x - 66, y: fy - 80, w: 132, h: 130, round: true });
      }
      holes.push({ x: f.x - 70, y: this.sy(f.y) - 70, w: 140, h: 100, round: true });
      line = segs('包裹掉水里了！【点一下包裹】');
      sub = '青蛙会用舌头捞回来；时间圈走完或漂太远就沉了';
      const fl = this.floaters[0];
      const up = fl && this.sy(fl.y) < H * 0.45;
      capY = up ? H * 0.6 : this.game.safeT + 100;
      if (fl) hand = { kind: 'tap', x: fl.x + 8, y: this.sy(fl.y) + 4 };
    }
    // Dim everything but the holes; while dragging, ease off so the aim line shows.
    const a = Math.min(1, this.stepT * 4) * (this.aim ? 0.35 : 1);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, 750, H);
    for (const h of holes) {
      if (h.round) {
        ctx.moveTo(h.x + h.w, h.y + h.h / 2);
        ctx.ellipse(h.x + h.w / 2, h.y + h.h / 2, h.w / 2, h.h / 2, 0, 0, Math.PI * 2);
      } else {
        const r = 22;
        ctx.moveTo(h.x + r, h.y);
        ctx.arcTo(h.x + h.w, h.y, h.x + h.w, h.y + h.h, r);
        ctx.arcTo(h.x + h.w, h.y + h.h, h.x, h.y + h.h, r);
        ctx.arcTo(h.x, h.y + h.h, h.x, h.y, r);
        ctx.arcTo(h.x, h.y, h.x + h.w, h.y, r);
        ctx.closePath();
      }
    }
    ctx.fillStyle = `rgba(36,28,22,${0.6 * a})`;
    ctx.fill('evenodd');
    // pulsing dashed outline around each hole
    ctx.setLineDash([14, 10]);
    ctx.lineDashOffset = -this.time * 30;
    ctx.strokeStyle = P.gold;
    ctx.lineWidth = 4;
    ctx.globalAlpha = 0.6 + Math.sin(this.time * 5) * 0.3;
    for (const h of holes) {
      if (h.round) ellipse(ctx, h.x + h.w / 2, h.y + h.h / 2, h.w / 2, h.h / 2);
      else roundRect(ctx, h.x, h.y, h.w, h.h, 22);
      ctx.stroke();
    }
    ctx.restore();
    if (this.step === 'aim' && this.aimTarget && !this.aim) {
      const t = this.aimTarget;
      const ty = this.sy(t.y) - t.ry - 74 + Math.sin(this.time * 5) * 5;
      panel(ctx, t.x - 78, ty - 26, 156, 52, { r: 26, fill: P.gold, shadow: false });
      text(ctx, '跳到这里', t.x, ty + 1, 28, { bold: true });
    }
    this.drawCaption(ctx, line, sub, capY, Math.min(1, this.stepT * 4));
    if (hand) this.drawHand(ctx, hand.kind, hand.x, hand.y);
  }

  private drawHand(ctx: Ctx, kind: 'tap' | 'drag', x: number, y: number) {
    const sp = this.game.sprites;
    ctx.save();
    if (kind === 'tap') {
      const cyc = (this.time % 1.1) / 1.1;
      const press = cyc < 0.25 ? cyc / 0.25 : cyc < 0.45 ? 1 : Math.max(0, 1 - (cyc - 0.45) / 0.3);
      if (press > 0.8) {
        ctx.globalAlpha = 0.6;
        ellipse(ctx, x, y, 26 + (press - 0.8) * 60, 26 + (press - 0.8) * 60);
        ctx.strokeStyle = P.white;
        ctx.lineWidth = 4;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      sp.draw(ctx, 'hand', x, y + 14 - press * 14, 1.1 - press * 0.08);
    } else {
      // press, pull down, let go
      const cyc = (this.time % 2) / 2;
      const k = cyc < 0.15 ? 0 : cyc < 0.7 ? easeOutCubic((cyc - 0.15) / 0.55) : 1;
      const hx = x - k * 30, hy = y + k * 170;
      ctx.globalAlpha = cyc > 0.85 ? (1 - cyc) / 0.15 : 1;
      if (k > 0) {
        ctx.strokeStyle = P.white;
        ctx.setLineDash([8, 10]);
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(hx, hy);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      sp.draw(ctx, 'hand', hx, hy, 1.1);
      if (cyc > 0.72) text(ctx, '松手！', hx + 90, hy + 40, 32, { bold: true, color: P.white });
    }
    ctx.restore();
  }

  /** The day's briefing card: what to do today, in big type, before the river starts moving. */
  private drawIntro(ctx: Ctx) {
    const H = this.H;
    const b = this.cfg.brief;
    const sp = this.game.sprites;
    const a = Math.min(1, this.stepT * 4);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(36,28,22,0.6)';
    ctx.fillRect(0, 0, 750, H);
    const rowH = 104;
    const ch = 150 + b.rows.length * rowH + 140;
    const y0 = (H - ch) / 2 - 20;
    const s = 0.9 + 0.1 * easeOutBack(Math.min(1, this.stepT * 3));
    ctx.translate(375, y0 + ch / 2);
    ctx.scale(s, s);
    ctx.translate(-375, -(y0 + ch / 2));
    panel(ctx, 40, y0, 670, ch, { r: 28 });
    text(ctx, b.title, 375, y0 + 72, 46, { bold: true });
    ctx.strokeStyle = 'rgba(74,59,48,0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(90, y0 + 124);
    ctx.lineTo(660, y0 + 124);
    ctx.stroke();
    b.rows.forEach(([icon, line], i) => {
      const ry = y0 + 150 + i * rowH + rowH / 2;
      ellipse(ctx, 128, ry, 44, 44);
      ctx.fillStyle = P.cream;
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.stroke();
      if (icon === 'code') codeTag(ctx, 128, ry, 7, P.tealDeep, 1.4);
      else {
        const [dx, dy, sc] = ICONS[icon] ?? [0, 0, 0.6];
        sp.draw(ctx, icon, 128 + dx, ry + dy, sc);
      }
      rich(ctx, segs(line), 196, ry, 34, { left: true });
    });
    this.introBtn = { x: 215, y: y0 + ch - 116, w: 320, h: 88 };
    button(ctx, 215, y0 + ch - 116, 320, 88, this.cfg.tutorial ? '开始上班' : '开工！', { primary: true, pressed: this.pressed === 'intro', size: 36 });
    ctx.restore();
  }

  /** "愉快下班了" card with a random line, while the truck drives off. */
  private drawOffCard(ctx: Ctx) {
    const o = this.off!;
    if (o.t < CARD_AT) return;
    const k = Math.min(1, (o.t - CARD_AT) / 0.45);
    const lines = wrapText(ctx, o.line, 30, 500);
    const h = 156 + lines.length * 46;
    ctx.save();
    ctx.globalAlpha = k;
    ctx.translate(375, this.H * 0.42 + (1 - easeOutCubic(k)) * 70);
    ctx.rotate(-0.02);
    ctx.fillStyle = P.orange;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    for (const d of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(d * 290, -h / 2 + 30);
      ctx.lineTo(d * 340, -h / 2 + 30);
      ctx.lineTo(d * 320, -h / 2 + 60);
      ctx.lineTo(d * 340, -h / 2 + 90);
      ctx.lineTo(d * 290, -h / 2 + 90);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    panel(ctx, -295, -h / 2, 590, h, { r: 24 });
    text(ctx, '愉快下班了！', 0, -h / 2 + 64, 54, { bold: true, color: P.orangeDeep });
    lines.forEach((l, i) => text(ctx, l, 0, -h / 2 + 132 + i * 46, 30, { color: P.ink }));
    if (o.t > CARD_AT + 0.8) text(ctx, '点击屏幕继续', 0, h / 2 + 40, 24, { color: P.white, alpha: 0.6 + Math.sin(this.time * 4) * 0.3 });
    ctx.restore();
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
