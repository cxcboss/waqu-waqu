import { INK, P } from '../art/palette';
import { K, TILE_H, boxSprite } from '../art/sprites';
import { button, codeTag, ellipse, font, hit, panel, pressIn, pressOut, rich, richWidth, roundRect, segs, text, wrapText, type Rect, type Seg } from '../art/ui';
import { approach, clamp, easeOutBack, easeOutCubic, lerp, pick, shuffle, springOut } from '../engine/math';
import type { LoopHandle } from '../engine/audio';
import type { Data } from '../engine/telemetry';
import type { Canvas, Ctx } from '../platform/types';
import { RESIDENT } from './cast';
import { MAX_SLOTS, gearEffects, type GearEffects } from './catalog';
import { SIZE_INFO, TUNING } from './config';
import type { Game, Scene } from './game';
import { HqScene, type DayResult, type Photo } from './hq';
import { buildLevel, dayConfig, type House, type Level, type Order, type Plat } from './level';
import { HURRY_LINES, KICK_LINES, OFFWORK_LINES, dealLine } from './lines';
import { drawHouse, houseSprites, updateResident, type ResidentView } from './resident';
import { MapScene, drawStamp } from './map';

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
  /** Where it took off from, and what the pull looked like, for the play statistics. */
  src?: Plat | null;
  info?: Data;
  /** Kicked off the truck by the driver: tumbles head over heels on the way. */
  spin?: boolean;
}

/**
 * The hop onto a truck from the road once it has caught up (a flip and a croak), or, with `yank`,
 * the truck hauling the frog back from wherever it is: a lasso flies out, the frog digs its heels
 * in, then it's reeled through the air onto the bed. `wx`/`wy` hold the frog in the world until the
 * flight starts; `x0`/`y0` are where the flight starts, on screen because the truck keeps pace with
 * the camera.
 */
interface Board {
  truck: Plat; t: number; x0: number; y0: number; yank: boolean; said: boolean;
  wx: number; wy: number; wet: boolean; flying: boolean; caught: boolean;
  /** Recent screen positions in flight, for the blur of afterimages. */
  trail: { x: number; y: number; rot: number }[];
}

/** Exhaust from a truck's tail pipe: drifts behind on the road and hides what's under it. */
interface Puff { x: number; y: number; vx: number; vy: number; r: number; t: number; dur: number }

/**
 * Swimming: a wheel steers, and while it's held the frog kicks on a beat. A tap anywhere else brings
 * up the leap gauge: a needle swings across it, and a second tap while it's in the green leaps onto
 * the nearest thing within reach; anywhere else the frog only bobs up and back down where it is.
 */
interface Stick { id: number; x: number; y: number }

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
  /** Seconds left spluttering after going under: the current takes the frog and taps do nothing. */
  dunkT: number;
  /** Seconds until the next kick while the wheel is held. */
  kickT: number;
  /** Direction of the last kick, for the frog's lean. */
  kx: number; ky: number;
  /** Seconds left of a hop in place after a leap gauge miss. */
  hop: number;
  landT: number;
  /** How hard the last landing was (about 0.25–1.1), for the squash. */
  impact: number;
  /** Lean toward the resident while handing a parcel over, fading out. */
  give: number;
  giveDir: number;
  swing: number; swingV: number;
}

/** A parcel bobbing in the river after a fall, drifting downstream until the frog licks it up or it's swept off the screen. */
interface Floater { o: Order; x: number; y: number; vx: number; vy: number; t: number; spin: number }

interface Fx {
  kind: 'ripple' | 'splash' | 'dust' | 'floatBox' | 'washed' | 'heart' | 'qmark' | 'drops' | 'petals' | 'sink' | 'arc' | 'coins' | 'say';
  x: number; y: number; t: number; dur: number;
  size?: number; urgent?: boolean; cod?: boolean;
  /** For 'arc' (world space): where it ends. */
  x2?: number; y2?: number;
  label?: string;
  /** Random seed for the particle kinds. */
  seed?: number;
}

interface Popup { text: string; x: number; y: number; t: number; color: string }

interface Shot { at: number; caption: string; prio: number; kind: string; thrown?: boolean }

/** A parcel card in the tray: on the truck's row (tap to take it) or in the satchel's row. */
interface Card { order: Order; rect: Rect; where: 'truck' | 'bag' }

/** A card sliding from one row of the tray to the other after a pickup or a put-back. */
interface Flight { o: Order; from: Rect; t: number }
const FLY_T = 0.5;

/**
 * Counting out change for a cash-on-delivery parcel: the resident pays with a bill and the frog
 * picks the right change from three. The river holds still meanwhile.
 */
interface Cod { o: Order; h: House; t: number; opts: number[]; pick: number | null; pickT: number; btns: Rect[] }

type HintKey = 'go' | 'refill' | 'call' | 'egg' | 'road' | 'swim' | 'rescue' | 'climb' | 'rush' | 'cod' | 'putBack' | 'tired' | 'warn' | 'urgent' | 'heavy' | 'wrongHouse' | 'kick';

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
const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;

/** How to fit each briefing icon in its circle: offset from the circle center and scale. */
const ICONS: Record<string, [number, number, number]> = {
  box0: [0, 34, 1.2], box0u: [0, 34, 1.2], box1: [0, 32, 1.05], box2: [0, 32, 0.85],
  hand: [-8, -38, 0.62], frog_swim: [0, 14, 0.42], frog_nervous: [0, 28, 0.4], coin: [0, 0, 1.15], satchel2: [-4, -28, 1.1], lily1: [0, -4, 0.4], owl: [0, 38, 0.3],
};

const PAN_T = 0.8;
const DRIVE_AT = 0.95;
const CARD_AT = 1.5;
/** Seconds the closing card stays up before HQ, unless tapped. */
const OFF_COUNT = 5;
const OFF_END = CARD_AT + OFF_COUNT;

/** A parcel that goes into the river this many times is ruined and washed away. */
const DUNK_MAX = 3;
/** A parcel flung out of the satchel can't be licked up until it has landed. */
const FLOAT_SETTLE = 0.8;
const TONGUE_OUT = 0.13;
const TONGUE_IN = 0.22;
/** Within this much of the leap gauge's middle, the leap counts as perfect. */
const CLIMB_PERFECT = 0.06;
/** A miss on the leap gauge: the frog bobs up and back down where it is, this long. */
const HOP_T = 0.42;
/** Just climbed out at the bottom of the screen: this long to jump before being swept off. */
const CLIMB_GRACE = 0.8;
/** Countdown once everything is handed out, before the truck hauls the frog in. */
const CALL_T = 15;
const BOARD_LEAP_T = 0.4;
/** The haul when time's up: the lasso's throw, the struggle at the end of it, the flight to the bed. */
const LASSO_T = 0.45;
const TUG_T = 0.45;
const YANK_T = 0.8;
/** Seconds seeing stars after landing on the bed at the end of the rope. */
const DIZZY_T = 1.6;
/** Holding a charge this long makes the frog's legs shake, and this long gives up on the jump. */
const FOOT_WARN = 3.5;
const FOOT_T = 5;
/** A press made while the frog is still in the air is kept this long (seconds) and used on landing. */
const BUFFER_T = 0.5;
/** Jumping off the road behind a truck: it blows exhaust, which slows the frog for a while. */
const SMOG_T = 2.6;
const SMOG_REACH = 0.7;
const SMOG_SLOW = 1.5;
/** Sitting on the truck with work left: the driver honks after IDLE_WARN seconds and kicks the frog off at IDLE_KICK. */
const IDLE_WARN = 7;
const IDLE_KICK = 10;
const KICK_T = 0.8;
/** Seconds before the end of the route when the driver starts calling a frog that isn't aboard. */
const HURRY_AT = 6;
/** The leap gauge hangs on this long after the frog swims out of reach, so it doesn't flicker at the edge. */
const GAUGE_GRACE = 0.35;

const LETTERS = [
  '“给河湾的快递员：谢谢你每天都来。——住在桥洞的老乌龟”',
  '“如果你捡到这封信，说明你很会偷懒。——猫头鹰经理”',
  '“明天的荷叶会更大一点。——一只路过的鹭”',
];

export class PlayScene implements Scene {
  readonly id = 'play';
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
  /** Counts down after climbing out, while being low on the screen doesn't throw the frog off yet. */
  private climbGrace = 0;
  private stats = { falls: 0, jumps: 0, longest: 0, closeCalls: 0, bestTrip: 0, fastUrgent: false, codRight: 0, codTips: 0, codLoss: 0 };
  /** Parcels handed over since the frog last left the truck. */
  private trip = 0;
  private flights: Flight[] = [];
  private cod: Cod | null = null;
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
  /** The convoy is speeding up because the frog has run too far ahead, until it's back in the middle. */
  private rushing = false;
  /** Swimming controls: the thumb on the wheel, the wheel easing in and out, and the leap gauge once tapped up. */
  private stick: Stick | null = null;
  private wheelA = 0;
  private gauge: { t: number } | null = null;
  /** Flashes the tongue's reach after a tap on a parcel too far away. */
  private reachPulse = 0;
  /** Seeing stars after being hauled onto the truck. */
  private dizzyT = 0;
  /** What the driver is shouting from the cab, and the lines already used today (none twice in a day). */
  private driver: { text: string; t: number; dur: number } | null = null;
  private linesUsed = new Set<string>();
  /** Seconds sat on the truck bed with work left to do; too long and the driver kicks the frog off. */
  private idleT = 0;
  private idleWarned = false;
  /** The route has run out: the river stops, the frog is hauled aboard if it isn't already, then home. */
  private routeEnd = false;
  /** The driver has started calling the frog back before the end of the route, and the last whole second counted. */
  private hurried = false;
  private hurryN = Infinity;
  private gaugeGrace = 0;
  /** Legs still aching after a charge held too long: no new pull until this runs out. */
  private tiredT = 0;
  /** A press that began in mid-air, and a jump released in mid-air: both go off when the frog lands. */
  private early: { id: number; sx: number; sy: number; x: number; y: number; t: number } | null = null;
  private queued: { dx: number; dy: number; held: number; sx: number; sy: number; at: number } | null = null;
  /** The truck's lifeline, once a day: spent when the frog would have been swept off the screen. */
  private ropeUsed = 0;
  /** Day 1: the frog has been back to the truck for a second load. */
  private refilled = false;
  /** Counters for the run's summary in the play statistics. */
  private tally = {
    taps: 0, tired: 0, miss: 0, far: 0, climbOk: 0, climbFail: 0, strokes: 0, swimSec: 0, warn: 0, warnSec: 0,
    rush: 0, pauses: 0, putBack: 0, bagFull: 0, exhaust: 0, rescued: 0, sunk: 0, idle: 0, kicked: 0,
    hints: {} as Record<string, number>, misses: {} as Record<string, number>,
  };
  /** The swim in progress, summed up when the frog gets out. */
  private swim: { t: number; strokes: number; fails: number; gauges: number; wheel: number | null } | null = null;
  private lastInput = 0;
  /** When the truck last started hauling the frog in, for how long the haul took. */
  private yankAt = 0;
  private wall: number;
  /** A pose the standing frog holds for a moment after something happens (a salute after a delivery). */
  private frogCue: { pose: string; from: number; until: number } | null = null;
  /** What the shop gear adds (bag slots, jump, swim). */
  private gear: GearEffects;
  /** For the career totals at HQ: farthest landed jump, the lost letter if picked up. */
  private extra = { far: 0, letter: null as string | null };

  constructor(private game: Game, readonly day: number) {
    const cfg = dayConfig(day);
    this.lv = buildLevel(cfg, game.H);
    void game.sprites.ensure(houseSprites(this.lv.houses));
    // a bigger bag holds more; the river is still built for the day's own bag
    this.gear = gearEffects(game.save.gear);
    this.lv.cfg = { ...cfg, bagSlots: Math.min(MAX_SLOTS, cfg.bagSlots + this.gear.slots) };
    const truck = this.lv.truck;
    this.placeTruck();
    const lx = -TUNING.truckSpotX[1];
    this.frog = {
      state: 'stand', x: truck.x + lx, y: truck.y + 40, z: 0, on: truck, lx, ly: 40, settle: null, jump: null, board: null,
      vx: 0, vy: 0, swimT: 0, strokeT: 9, dunkT: 0, kickT: 0, kx: 0, ky: -1, hop: 0, landT: 9, impact: 0.5, give: 0, giveDir: 1, swing: 0, swingV: 0,
    };
    this.slowT = TUNING.truckSlowSec;
    this.slowCd = TUNING.truckSlowSec + TUNING.slowCooldown;
    game.audio.setMusic('bgm_work');
    const tm = game.tm;
    tm.day = day;
    tm.run++;
    game.perf = { frames: 0, slow: 0, time: 0 };
    this.wall = game.platform.now();
    const s = game.save;
    this.log('run_start', { attempt: tm.count(`day${day}`), unlocked: s.day, best: s.best[day] ?? null, stamps: s.stamps[day] ?? [], gear: { ...s.gear }, bag: this.lv.cfg.bagSlots });
  }

  /** An event for the play statistics, stamped with the run's clock and how far along the route it happened. */
  private log(ev: string, d: Data = {}) {
    this.game.tm.log(ev, { ...d, p: Math.round(clamp(-this.camY / this.cfg.length, 0, 1) * 1000) / 1000 }, this.time);
  }

  /** A tap that did nothing where the game was waiting for something else (a few of each kind are logged). */
  private miss(where: string) {
    const t = this.tally;
    t.miss++;
    const n = (t.misses[where] = (t.misses[where] ?? 0) + 1);
    if (n <= 5) this.log('miss', { where });
  }

  /** The run so far: how it ended (or that it's still going), the parcels, and the counters. */
  private summary(how: string): Data {
    const orders = this.lv.orders;
    const n = (...st: Order['state'][]) => orders.filter((o) => st.includes(o.state)).length;
    const perf = this.game.perf;
    const t = this.tally;
    return {
      how, total: orders.length, delivered: n('delivered'), wrong: n('wrong'), wet: n('wet', 'float'), missed: n('missed'), left: n('pool', 'bag'),
      urgent: orders.filter((o) => o.urgent).length, urgentOnTime: orders.filter((o) => o.state === 'delivered' && o.urgent && !o.late).length,
      cod: orders.filter((o) => o.cod).length, codRight: this.stats.codRight,
      falls: this.stats.falls, jumps: this.stats.jumps, longest: Math.round(this.stats.longest), closeCalls: this.stats.closeCalls, bestTrip: this.stats.bestTrip,
      ...t, swimSec: r1(t.swimSec), warnSec: r1(t.warnSec),
      real: Math.round((this.game.platform.now() - this.wall) / 1000),
      fps: perf.time > 1 ? Math.round(perf.frames / perf.time) : null, slow: perf.slow,
      state: this.frog.state, on: this.frog.on?.kind ?? null, step: this.step,
    };
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
  /** A frog pose that may not be painted yet, standing in for it with one that is. */
  private pose(name: string, fallback: string) {
    return this.game.sprites.has(name) ? name : fallback;
  }

  // ---------------------------------------------------------------- update

  update(dt: number) {
    if (this.paused || this.leaving) return;
    this.time += dt;
    this.stepT += dt;
    this.shakeT = Math.max(0, this.shakeT - dt);
    this.honkT = Math.max(0, this.honkT - dt);
    this.smogT = Math.max(0, this.smogT - dt);
    this.dizzyT = Math.max(0, this.dizzyT - dt);
    if (this.driver && (this.driver.t += dt) > this.driver.dur) this.driver = null;
    // the swim wheel slides in while the frog is in the water
    this.wheelA = approach(this.wheelA, this.frog.state === 'swim' ? 1 : 0, 10, dt);
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
      // the convoy also eases off while it waits for the frog at the end of the round,
      // and speeds up hard when the frog runs too far ahead of it, easing back off slowly
      // once the frog is back in the middle of the screen
      const rush = this.rushK();
      this.updateRush(rush);
      const base = this.slowT > 0 || this.callT !== null ? TUNING.slowFactor : 1;
      let target = this.rushing ? 1 + (TUNING.rushMax - 1) * Math.max(TUNING.rushFloor, rush) : base;
      if (this.ended === 'done' || this.routeEnd) target = 0;
      const rate = target > this.speedK ? (this.rushing ? TUNING.rushUp : 4) : this.speedK > 1 && !this.ended && !this.routeEnd ? TUNING.rushDown : 4;
      this.speedK = approach(this.speedK, target, rate, dt);
      // The river holds still while the tutorial has the player's hands busy.
      if (!this.frozen()) this.camY -= cfg.speed * this.speedK * dt;
      this.placeTruck();
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
      updateResident(h, this.residentView(h), dt);
    }

    for (const fl of this.flights) fl.t += dt;
    this.flights = this.flights.filter((fl) => fl.t < FLY_T);
    if (this.cod) {
      this.cod.t += dt;
      if (this.cod.pick !== null && (this.cod.pickT += dt) > 1.5) this.closeCod();
    }

    this.updateFrog(dt);
    this.updateBuffer(dt);
    this.updateFloaters(dt);
    this.updateTongue(dt);
    this.tiredT = Math.max(0, this.tiredT - dt);
    if (this.aim) {
      this.aim.t += dt;
      if (this.aim.t >= FOOT_T && this.frog.state === 'stand') this.tired();
    }
    this.updateSound();

    if (!this.ended) {
      this.checkHouses();
      this.checkUrgent();
      this.checkDanger(dt);
      this.tutorial();
      this.updateRoad();
      this.updateCall(dt);
      this.updateHurry();
      this.updateIdle(dt);
      this.checkEgg();
      if (!this.routeEnd && -this.camY >= cfg.length) this.arrive();
      if (this.routeEnd) this.haulIn();
      this.checkOffwork();
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
    return this.step === 'intro' || this.step === 'pick' || this.step === 'aim' || this.step === 'deliver' || this.step === 'rescue' || !!this.cod;
  }

  /** Whether the convoy can rush at all: not while the river holds still, the day is over, or the frog is aboard. */
  private canRush() {
    const f = this.frog;
    return !this.frozen() && !this.ended && !this.routeEnd && f.state !== 'board' && !(f.state === 'stand' && f.on?.kind === 'truck');
  }

  /** The frog's height on screen, or for a jump, where it will land. */
  private frogScreenY() {
    const f = this.frog;
    return f.jump ? this.sy(f.jump.y1) : this.sy(f.y);
  }

  /**
   * 0–1: how far up into the top of the screen the frog has got (for a jump, where it will land).
   * The convoy speeds up to match, so running ahead of the truck doesn't pay.
   */
  private rushK() {
    if (!this.canRush()) return 0;
    const line = this.H * TUNING.rushLine, top = this.game.safeT + 110;
    return clamp((line - this.frogScreenY()) / (line - top), 0, 1);
  }

  /** The rush starts as soon as the frog is in the top of the screen and lasts until it's back in the middle. */
  private updateRush(rush: number) {
    if (!this.rushing && rush > 0.02) {
      this.rushing = true;
      this.tally.rush++;
      this.log('rush');
      this.game.audio.play('truck_speedup', { volume: 0.8, rate: 1.15 });
      this.game.audio.play('truck_horn', { volume: 0.4, rate: 1.3, delay: 0.15 });
      this.showHint('rush', '跑太靠前了，车队【加速】追上来！', { dur: 4, sub: '回到屏幕中间，车才会慢慢降回原速' });
    } else if (this.rushing && (!this.canRush() || this.frogScreenY() > this.H * TUNING.rushRelease)) this.rushing = false;
  }

  private setStep(step: Step) {
    if (step !== this.step) this.log('step', { from: this.step, to: step, sec: r1(this.stepT) });
    this.step = step;
    this.stepT = 0;
  }

  private placeTruck() {
    this.lv.truck.y = this.camY + this.H * TUNING.truckAnchor + Math.sin(this.time * 0.55 + 2.1) * 26;
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
    else if (f.state === 'swim' && this.step !== 'rescue' && !this.cod) this.updateSwim(dt);
    f.give = Math.max(0, f.give - dt * 2.2);
    // satchel swing spring
    f.swingV += (-60 * f.swing - 6 * f.swingV) * dt;
    f.swing += f.swingV * dt;
  }

  private updateSwim(dt: number) {
    const f = this.frog;
    f.swimT += dt;
    f.strokeT += dt;
    f.dunkT = Math.max(0, f.dunkT - dt);
    if (f.dunkT <= 0 && f.hop <= 0) {
      // the gauge comes up by itself whenever there's something in reach to leap onto
      if (this.leapTarget()) {
        this.gaugeGrace = GAUGE_GRACE;
        if (!this.gauge) {
          this.gauge = { t: 0 };
          if (this.swim) this.swim.gauges++;
          this.game.audio.play('ui_tap', { volume: 0.5 });
          if (!this.floaters.length) this.climbHint();
        } else this.gauge.t += dt;
      } else if (this.gauge && (this.gaugeGrace -= dt) <= 0) this.gauge = null;
      else if (this.gauge) this.gauge.t += dt;
    }
    if (f.hop > 0 && (f.hop -= dt) <= 0) {
      // back down where it started
      this.fx.push({ kind: 'splash', x: f.x, y: f.y, t: 0, dur: 0.45 });
      this.fx.push({ kind: 'ripple', x: f.x, y: f.y + 4, t: 0, dur: 0.6, size: 50 });
      this.game.audio.play('splash', { volume: 0.45, rate: 1.3 });
    }
    // held wheel: kick on a beat, the first one after a short wind-up
    const st = this.stick;
    const steer = st && f.dunkT <= 0 && f.hop <= 0 ? Math.hypot(st.x, st.y) : 0;
    if (steer > 0.25) {
      f.kickT -= dt;
      if (f.kickT <= 0) {
        this.kick(st!.x / steer, st!.y / steer, Math.min(1, steer));
        f.kickT = TUNING.kickT;
      }
    } else f.kickT = Math.min(Math.max(f.kickT, 0), TUNING.kickWind);
    const d = Math.exp(-TUNING.swimDrag * dt);
    f.vx *= d;
    f.vy *= d;
    f.x = clamp(f.x + f.vx * dt, TUNING.riverL + 14, TUNING.riverR - 10);
    // the current is strongest while the frog is still spluttering
    f.y += (f.vy + TUNING.swimCurrent * (f.dunkT > 0 ? 1.5 : 1)) * dt;
    this.pushOffPads();
  }

  /** One kick of the legs: a burst of speed toward (ux, uy) that the water soon takes back. */
  private kick(ux: number, uy: number, k: number) {
    const f = this.frog;
    this.tally.strokes++;
    if (this.swim) {
      this.swim.strokes++;
      this.swim.wheel ??= r1(this.time - this.swim.t);
    }
    const speed = TUNING.kickSpeed * (0.45 + 0.55 * k) * (1 - 0.03 * this.weight()) * this.gear.swim;
    // mostly a fresh push in the new direction, so turning feels immediate
    f.vx = lerp(f.vx, ux * speed, 0.8);
    f.vy = lerp(f.vy, uy * speed, 0.8);
    f.kx = ux;
    f.ky = uy;
    f.strokeT = 0;
    this.fx.push({ kind: 'ripple', x: f.x - ux * 20, y: f.y + 4 - uy * 12, t: 0, dur: 0.6, size: 46 });
    this.fx.push({ kind: 'drops', x: f.x - ux * 24, y: f.y - uy * 10, t: 0, dur: 0.4, size: 0.35, seed: Math.random() * 100 });
    this.game.audio.play('swim_stroke', { jitter: true, volume: 0.8 });
  }

  /** Pads and house rafts are in the way: the swimming frog slides round them rather than under. */
  private pushOffPads() {
    const f = this.frog;
    for (const p of this.lv.plats) {
      if (p.kind === 'log' || Math.abs(p.y - f.y) > 160) continue;
      const ax = p.rx * 0.95, ay = p.ry * 1.25;
      const dx = f.x - p.x, dy = f.y - p.y;
      const n = (dx / ax) ** 2 + (dy / ay) ** 2;
      if (n >= 1) continue;
      const r = Math.sqrt(n);
      const ux = r > 0.01 ? dx / r : 0, uy = r > 0.01 ? dy / r : ay;
      f.x = p.x + ux;
      f.y = p.y + uy;
      // lose the part of the speed that went into the pad
      const nl = Math.hypot(ux / ax ** 2, uy / ay ** 2) || 1;
      const nx = ux / ax ** 2 / nl, ny = uy / ay ** 2 / nl;
      const into = f.vx * nx + f.vy * ny;
      if (into < 0) {
        f.vx -= into * nx;
        f.vy -= into * ny;
      }
    }
  }

  /** The nearest thing the swimming frog can leap onto from where it is, and how far its edge is. */
  private leapTarget(): { p: Plat; d: number } | null {
    const f = this.frog;
    const H = this.H;
    const t = this.lv.truck;
    let best: Plat | null = null;
    let bestD = TUNING.leapR;
    // the bank on the right: the truck if it's alongside, otherwise the road
    const toBank = TUNING.riverR - f.x;
    if (toBank < bestD) {
      bestD = Math.max(0, toBank);
      best = Math.abs(f.y - t.y) < t.ry + 30 ? t : this.lv.road;
    }
    for (const p of this.lv.plats) {
      if (Math.abs(p.y - f.y) > TUNING.leapR + p.ry + 40) continue;
      const s = this.sy(p.y);
      if (s < this.game.safeT + 130 || s > H - 60) continue;
      let d: number;
      if (p.kind === 'log') {
        const c = Math.cos(-p.rot), sn = Math.sin(-p.rot);
        const lx = (f.x - p.x) * c - (f.y - p.y) * sn;
        const ly = (f.x - p.x) * sn + (f.y - p.y) * c;
        d = Math.hypot(Math.max(0, Math.abs(lx) - p.rx), Math.max(0, Math.abs(ly) - p.ry));
      } else d = Math.max(0, Math.hypot(f.x - p.x, ((f.y - p.y) * p.rx) / p.ry) - p.rx);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best ? { p: best, d: bestD } : null;
  }

  /** Where the leap gauge's needle is, 0–1, sweeping there and back from the left. Slower until the later days. */
  private gaugeNeedle(t: number) {
    const T = this.day > TUNING.gaugeLateDay ? TUNING.gaugeSweepLate : TUNING.gaugeSweep;
    // starts in the middle of the green, so a quick tap is a good tap
    const ph = frac(t / T + 0.25);
    return ph < 0.5 ? ph * 2 : 2 - ph * 2;
  }

  /** Width of the green part of the gauge: generous on the first day, a little narrower with a heavy bag. */
  private gaugeZone() {
    const base = this.cfg.tutorial ? TUNING.gaugeZoneTutorial : TUNING.gaugeZone;
    return Math.max(TUNING.gaugeZoneMin, base - TUNING.gaugeZonePerWeight * this.weight());
  }

  /** A tap in the water away from the wheel: with the gauge up (something is in reach), tries the leap. */
  private gaugeTap() {
    const f = this.frog;
    if (f.dunkT > 0 || f.hop > 0) return;
    const tgt = this.leapTarget();
    const g = this.gauge;
    if (!g) {
      this.tally.far++;
      this.reachPulse = 1;
      this.showToast('离荷叶和岸边太远，先游近一点');
      this.game.audio.play('ui_error', { volume: 0.5 });
      return;
    }
    this.gauge = null;
    const off = Math.abs(this.gaugeNeedle(g.t) - 0.5);
    const zone = this.gaugeZone();
    const ok = off <= zone / 2 && !!tgt;
    this.log('climb', { ok, off: r2(off), zone: r2(zone), w: this.weight(), on: tgt?.p.kind ?? null, d: tgt ? Math.round(tgt.d) : null, wait: r1(g.t) });
    if (ok) {
      this.tally.climbOk++;
      if (off <= CLIMB_PERFECT) this.popups.push({ text: '完美上岸！', x: f.x, y: f.y - 80, t: 0, color: P.lilyDeep });
      this.doneHint('climb');
      this.leapOut(tgt!.p);
      return;
    }
    // off the green: a bob up and straight back down
    this.tally.climbFail++;
    if (this.swim) this.swim.fails++;
    f.hop = HOP_T;
    f.vx *= 0.3;
    f.vy *= 0.3;
    this.popups.push({ text: tgt ? '没跳上去！' : '够不着！', x: f.x, y: f.y - 90, t: 0, color: P.red });
    this.fx.push({ kind: 'drops', x: f.x, y: f.y, t: 0, dur: 0.5, size: 0.6, seed: Math.random() * 100 });
    this.game.audio.play('jump_release', { volume: 0.6, rate: 1.3 });
    this.game.platform.vibrate(20);
  }

  private weight() {
    return this.bag.reduce((w, o) => w + SIZE_INFO[o.size].weight, 0);
  }
  private slotsUsed() {
    return this.bag.reduce((w, o) => w + SIZE_INFO[o.size].slots, 0);
  }
  private maxJump() {
    // the extra slots of a bigger bag don't weigh the frog down more than the day's own bag would
    const w = Math.min(this.weight(), dayConfig(this.day).bagSlots) * this.gear.weight;
    return TUNING.maxJump * this.gear.jump * (1 - TUNING.weightPenalty * w) * (this.smogT > 0 ? SMOG_REACH : 1);
  }

  /** Finds what's under a world point: the truck, a river object, the road, or null for water (and the reeds). */
  private findPlat(x: number, y: number, swimming = false): Plat | null {
    const t = this.lv.truck;
    if (Math.abs(x - t.x) <= t.rx + 14 && Math.abs(y - t.y) <= t.ry + 16) return t;
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
    if (x > TUNING.riverR - (swimming ? 8 : -2)) return this.lv.road;
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
        tx = clamp(cx, -b, -a);
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
        tx = clamp(x, TUNING.riverR + 26, 720);
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
    if (how === 'climb') this.climbGrace = CLIMB_GRACE;
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
      this.trip = 0;
      this.game.platform.vibrate(12);
      // hopping on by itself from the road keeps the convoy at its pace
      if (this.slowCd <= 0 && how !== 'auto') {
        this.slowT = TUNING.truckSlowSec;
        this.slowCd = TUNING.truckSlowSec + TUNING.slowCooldown;
        au.play('truck_slowdown', { volume: 0.7, delay: 0.1 });
      }
      this.doneHint('refill');
      if (this.step === 'refill') {
        // back at the truck: pick the next parcels, as many as the bag takes
        this.refilled = true;
        this.setStep('pick');
      }
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
    f.on = null;
    f.settle = null;
    f.jump = null;
    f.z = 0;
    const wet = f.state === 'swim';
    f.state = 'board';
    // swept off the bottom already: no time for the lasso, straight into the haul
    const lasso = yank && this.sy(y) < this.H - 60;
    f.board = { truck: t, t: lasso ? 0 : LASSO_T + TUG_T, x0: x, y0: this.sy(y), yank, said: false, wx: x, wy: y, wet, flying: !yank, caught: !lasso, trail: [] };
    this.aim = null;
    this.stopCharge();
    this.roadSpot = null;
    const au = this.game.audio;
    if (!yank) {
      this.fx.push({ kind: 'dust', x, y, t: 0, dur: 0.5, size: 0.6 });
      au.play('jump_whoosh', { volume: 0.5 });
      return;
    }
    au.play('truck_horn');
    if (lasso) {
      au.play('jump_whoosh', { volume: 0.6, rate: 0.8 });
      this.fx.push({ kind: 'say', x: 0, y: 0, t: 0, dur: LASSO_T, label: '！' });
    }
  }

  private updateBoard(dt: number) {
    const f = this.frog;
    const b = f.board!;
    b.t += dt;
    const t = b.truck;
    const tx = t.x - TUNING.truckSpotX[1], ts = this.sy(t.y) + 40;
    const au = this.game.audio;
    if (!b.yank) {
      // the leap, homing in on the bed as the truck rocks along
      const k = Math.min(1, b.t / BOARD_LEAP_T);
      f.x = lerp(b.x0, tx, k);
      f.y = this.camY + lerp(b.y0, ts, k);
      f.z = 4 * 70 * k * (1 - k);
      if (!b.said && k > 0.2) {
        b.said = true;
        this.fx.push({ kind: 'say', x: 0, y: 0, t: 0, dur: 0.8, label: '呱！' });
        au.play('frog_croak', { volume: 0.8, rate: 1.1, jitter: true });
      }
      if (k >= 1) this.standOn(t, tx, t.y + 40, 'auto');
      return;
    }
    if (!b.flying) {
      // the lasso flies out and drops over the frog, which digs its heels in and gets dragged a little
      f.x = b.wx;
      f.y = b.wy;
      f.z = 0;
      if (!b.caught && b.t >= LASSO_T) {
        b.caught = true;
        this.fx.push({ kind: 'say', x: 0, y: 0, t: 0, dur: TUG_T + 0.1, label: '呱？！' });
        this.fx.push({ kind: b.wet ? 'splash' : 'dust', x: f.x, y: f.y, t: 0, dur: 0.45, size: 0.5 });
        au.play('parcel_place', { volume: 0.8, rate: 0.7 });
        au.play('frog_croak', { volume: 0.8, rate: 1.5, delay: 0.05 });
        this.game.platform.vibrate(25);
      }
      if (b.caught) {
        const k = (b.t - LASSO_T) / TUG_T;
        f.x = b.wx + k * k * 26 + Math.sin(this.time * 55) * 3;
        if (Math.random() < dt * 9) this.fx.push({ kind: b.wet ? 'drops' : 'dust', x: f.x - 14, y: f.y, t: 0, dur: 0.35, size: 0.3, seed: Math.random() * 100 });
      }
      if (b.t < LASSO_T + TUG_T) return;
      // and off it goes
      b.flying = true;
      b.x0 = f.x;
      b.y0 = this.sy(f.y);
      if (b.wet) {
        this.fx.push({ kind: 'splash', x: f.x, y: f.y, t: 0, dur: 0.6 });
        this.fx.push({ kind: 'drops', x: f.x, y: f.y, t: 0, dur: 0.7, size: 1, seed: Math.random() * 100 });
      }
      au.play('jump_whoosh', { volume: 0.9 });
      this.game.platform.vibrate(40);
    }
    // reeled in through the air, spinning, in a big arc onto the bed
    const k = clamp((b.t - LASSO_T - TUG_T) / YANK_T, 0, 1);
    const e = 1 - (1 - k) * (1 - k);
    f.x = lerp(b.x0, tx, e);
    f.y = this.camY + lerp(b.y0, ts, e);
    f.z = 4 * 210 * k * (1 - k);
    b.trail.unshift({ x: f.x, y: this.sy(f.y) - f.z, rot: Math.PI * 2 * 2 * k });
    if (b.trail.length > 6) b.trail.pop();
    if (!b.said && k > 0.1) {
      b.said = true;
      this.fx.push({ kind: 'say', x: 0, y: 0, t: 0, dur: 0.9, label: '哇啊——' });
      au.play('frog_croak', { volume: 0.8, rate: 1.35, jitter: true });
    }
    if (k >= 1) {
      if (b.yank) this.log('haul_land', { sec: r1(this.time - this.yankAt), wet: b.wet });
      this.standOn(t, tx, t.y + 40, 'auto');
      // a hard landing on the bed, seeing stars
      f.impact = 1.15;
      t.press = 0.8;
      this.dizzyT = DIZZY_T;
      this.shakeT = 0.22;
      this.fx.push({ kind: 'dust', x: tx, y: t.y + 40, t: 0, dur: 0.6, size: 1.1 });
      this.popups.push({ text: '咚！', x: tx - 110, y: t.y - 10, t: 0, color: P.orangeDeep });
      this.fx.push({ kind: 'say', x: 0, y: 0, t: -0.35, dur: 1.1, label: '晕乎乎…' });
      au.play('land_truck', { volume: 1 });
      au.play('frog_croak', { volume: 0.6, rate: 0.75, delay: 0.3 });
      this.game.platform.vibrate(60);
    }
  }

  /**
   * On the road: ahead of its truck the frog waits for the truck to catch up and hops on by itself;
   * behind it, the road carries the frog off the bottom unless it jumps.
   */
  private updateRoad() {
    const f = this.frog;
    if (f.state !== 'stand' || f.on?.kind !== 'bank') return;
    const t = this.lv.truck;
    const s = this.sy(f.y), ts = this.sy(t.y);
    if (!this.roadSpot) {
      this.roadSpot = s > ts + t.ry ? 'behind' : 'ahead';
      this.log('road', { spot: this.roadSpot });
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
    this.tally.exhaust++;
    this.log('exhaust');
    const t = this.lv.truck;
    const dir = -1;
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
    let p = this.findPlat(x, y);
    // a landing just off the edge of a pad still counts: the frog scrabbles up onto it
    let snap = 0;
    if (!p) {
      const s = this.snapTarget(x, y);
      if (s) {
        p = s.p;
        snap = Math.round(s.d);
        x = s.x;
        y = s.y;
        this.popups.push({ text: '好险！', x: x - 40, y: y - 90, t: 0, color: P.orangeDeep });
        this.fx.push({ kind: 'drops', x, y, t: 0, dur: 0.5, size: 0.5, seed: Math.random() * 100 });
      }
    }
    const aimed = j.info?.step === 'aim' ? { target: !!p && p === this.aimTarget } : {};
    this.log('jump', { ...j.info, dist: Math.round(j.dist), on: p?.kind ?? 'water', ...(snap ? { snap } : {}), ...aimed, ...(p ? {} : this.missBy(x, y, j)) });
    if (p) {
      this.standOn(p, x, y, 'jump');
      if (p.kind !== 'bank') this.extra.far = Math.max(this.extra.far, j.dist);
      if (j.dist > 285 && p.kind !== 'bank' && j.dist > this.stats.longest) {
        this.stats.longest = j.dist;
        this.shots = this.shots.filter((s) => s.kind !== 'long');
        this.photos = this.photos.filter((s) => s.kind !== 'long');
        this.queueShot('long', `飞跃${(j.dist / 100).toFixed(1)}米！`, 5, 0.15);
      }
    } else this.fall(x, y);
  }

  /** The pad a landing at (x, y) just missed, if it missed by little enough, and where on it the frog ends up. */
  private snapTarget(x: number, y: number): { p: Plat; d: number; x: number; y: number } | null {
    const reach = (this.day >= TUNING.snapFromDay ? TUNING.snapLate : TUNING.snapEarly) * Math.max(0.7, 1 - 0.06 * this.weight());
    let best: Plat | null = null;
    let bestD = reach;
    for (const p of this.lv.plats) {
      if (p.kind !== 'lily' && p.kind !== 'house' && p.kind !== 'log') continue;
      if (Math.abs(p.y - y) > reach + p.ry + 60) continue;
      const d = this.edgeDist(p, x, y);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    if (!best) return null;
    const p = best;
    const cs = Math.cos(-p.rot), sn = Math.sin(-p.rot);
    let lx = (x - p.x) * cs - (y - p.y) * sn;
    let ly = (x - p.x) * sn + (y - p.y) * cs;
    const n = p.kind === 'log' ? Math.max(Math.abs(lx) / p.rx, Math.abs(ly) / p.ry) : Math.hypot(lx / p.rx, ly / p.ry);
    const k = n > 0.7 ? 0.7 / n : 1;
    lx *= k;
    ly *= k;
    const cr = Math.cos(p.rot), sr = Math.sin(p.rot);
    return { p, d: bestD, x: p.x + lx * cr - ly * sr, y: p.y + lx * sr + ly * cr };
  }

  /** How far (x, y) is outside a pad's edge, measured along the line from its center. */
  private edgeDist(p: Plat, x: number, y: number) {
    const c = Math.cos(-p.rot), sn = Math.sin(-p.rot);
    const lx = (x - p.x) * c - (y - p.y) * sn, ly = (x - p.x) * sn + (y - p.y) * c;
    const n = p.kind === 'log' ? Math.max(Math.abs(lx) / p.rx, Math.abs(ly) / p.ry) : Math.hypot(lx / p.rx, ly / p.ry);
    return Math.hypot(lx, ly) * Math.max(0, 1 - 1 / n);
  }

  /** For a jump into the water: how far off the nearest place to stand was, and whether the jump fell short of it or overshot. */
  private missBy(x: number, y: number, j: Jump): Data {
    let best: Plat | null = null;
    let bestD = Infinity;
    for (const p of this.lv.plats) {
      if (p === j.src || Math.abs(p.y - y) > 500) continue;
      // distance to the edge along the line from its center, in its own (possibly tilted) frame
      const c = Math.cos(-p.rot), sn = Math.sin(-p.rot);
      const lx = (x - p.x) * c - (y - p.y) * sn, ly = (x - p.x) * sn + (y - p.y) * c;
      const n = p.kind === 'log' ? Math.max(Math.abs(lx) / p.rx, Math.abs(ly) / p.ry) : Math.hypot(lx / p.rx, ly / p.ry);
      const d = Math.hypot(lx, ly) * Math.max(0, 1 - 1 / n);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    const ux = j.x1 - j.x0, uy = j.y1 - j.y0;
    const road = TUNING.riverR - x;
    if (road < bestD) return { near: Math.round(Math.max(0, road)), to: 'bank', short: ux > 0 };
    if (!best) return {};
    return { near: Math.round(Math.max(0, bestD)), to: best.kind, short: (best.x - x) * ux + (best.y - y) * uy > 0 };
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
    f.dunkT = TUNING.dunkSec;
    f.hop = 0;
    f.kickT = TUNING.kickWind;
    this.gauge = null;
    this.slowT = 0;
    this.stats.falls++;
    // the satchel spills: each parcel bobs off on its own and can still be fished out,
    // except one that's been in the river twice already, which is ruined and swept away
    const spilled = this.bag.splice(0);
    for (const o of spilled) o.dunks++;
    const gone = spilled.filter((o) => o.dunks >= DUNK_MAX);
    gone.forEach((o, i) => {
      o.state = 'wet';
      this.fx.push({ kind: 'washed', x: x + (i - (gone.length - 1) / 2) * 40, y, t: -0.1 - i * 0.1, dur: 1.6, size: o.size, urgent: o.urgent, cod: !!o.cod, seed: Math.random() * 6 });
    });
    if (gone.length) {
      this.showToast(`取件码 ${gone.map((o) => o.code).join('、')} 第${DUNK_MAX}次落水，被冲走了`);
      this.game.audio.play('parcel_soaked', { delay: 0.3 });
    }
    const floating = spilled.filter((o) => o.dunks < DUNK_MAX);
    const n = floating.length;
    this.log('fall', { n: spilled.length, gone: gone.length, fy: r2(this.sy(y) / this.H) });
    this.swim = { t: this.time, strokes: 0, fails: 0, gauges: 0, wheel: null };
    floating.forEach((o, i) => {
      o.state = 'float';
      const side = i - (n - 1) / 2;
      // flung out of the satchel, ahead and to the sides
      const a = -Math.PI / 2 + (n > 1 ? side / ((n - 1) / 2) : Math.random() - 0.5) * 0.9;
      // flung clear of the frog, mostly out of the tongue's reach; heavier ones land closer
      const v = (300 + Math.random() * 170) * [1, 0.85, 0.7][o.size];
      this.floaters.push({ o, x: x + side * 30, y: y + 6, t: 0, spin: Math.random() * 6, vx: Math.cos(a) * v, vy: Math.sin(a) * v });
    });
    this.fx.push({ kind: 'splash', x, y, t: 0, dur: 0.7 });
    this.fx.push({ kind: 'ripple', x, y, t: 0, dur: 1, size: 70 });
    this.fx.push({ kind: 'drops', x, y, t: 0, dur: 0.7, size: 1, seed: Math.random() * 100 });
    this.fx.push({ kind: 'say', x: 0, y: 0, t: -0.25, dur: 1, label: '咕噜噜…' });
    const au = this.game.audio;
    au.play('splash');
    if (n) au.play('bag_open', { volume: 0.6, delay: 0.15 });
    au.duck(true);
    this.bubbles?.stop();
    this.bubbles = au.loop('swim_bubbles', { volume: 0.5, fadeIn: 0.6 });
    this.game.platform.vibrate(70);
    this.queueShot('splash', `扑通！第${this.stats.falls}次落水`, this.stats.falls === 1 ? 8 : 6, 0.28);
    if (!this.game.save.tips.swim && this.step !== 'intro') {
      // first time in the water: once the splash settles, stop the river and show the controls
      this.lessonAt = this.time + 0.45;
    } else if (n) {
      this.showHint('rescue', '包裹掉水里了！【游过去】捞回来', { dur: 4, sub: '包裹漂进虚线圈，舌头会自动卷回来', warn: true, again: true });
    } else this.swimHint();
  }

  private swimHint() {
    this.showHint('swim', '掉水里了！按住【轮盘】游动', { dur: 5, sub: '游近荷叶或岸边会出现指针，指到绿色时点一下', warn: true, again: true });
  }

  private climbHint() {
    this.showHint('climb', '指针出来了！指到【绿色】时点一下', { dur: 5, sub: '会跳上最近的荷叶或岸边；点偏了只会原地蹦一下' });
  }

  private endRescueLesson() {
    this.game.save.tips.swim = true;
    this.game.writeSave();
    this.setStep(this.stepBefore);
    this.stepBefore = null;
  }

  /**
   * Floating parcels drift slowly downstream, the heavier ones slower, until they're swept off the
   * bottom of the screen. Any that come within the tongue's reach are licked up.
   */
  private updateFloaters(dt: number) {
    if (this.lessonAt !== null && this.time >= this.lessonAt) {
      this.lessonAt = null;
      if (this.frog.state === 'swim' && !this.routeEnd) {
        this.stepBefore = this.step;
        this.setStep('rescue');
        this.aim = null;
        this.stopCharge();
        this.hint = null;
      }
    }
    if (this.step === 'rescue') {
      if (this.frog.state !== 'swim') this.endRescueLesson();
      return;
    }
    this.reachPulse = Math.max(0, this.reachPulse - dt * 1.5);
    const f = this.frog;
    for (const fl of this.floaters) {
      if (this.tongue?.fl === fl) continue;
      fl.t += dt;
      const d = Math.exp(-1.8 * dt);
      fl.vx *= d;
      fl.vy *= d;
      // bobbing a little from side to side on the way down
      const wander = Math.sin(this.time * 0.9 + fl.spin) * 10;
      fl.x = clamp(fl.x + (fl.vx + wander) * dt, TUNING.riverL + 24, TUNING.riverR - 24);
      fl.y += (fl.vy + TUNING.floatDrift * TUNING.floatDriftK[fl.o.size]) * dt;
    }
    const canLick = (f.state === 'swim' && f.dunkT <= 0 && f.hop <= 0) || (f.state === 'stand' && !this.aim);
    for (const fl of [...this.floaters]) {
      if (this.tongue?.fl === fl || this.tongueQ.includes(fl)) continue;
      if (this.sy(fl.y) > this.H - 30) this.loseParcel(fl);
      else if (canLick && fl.t > FLOAT_SETTLE && this.inReach(fl)) this.lick(fl);
    }
  }

  /** Whether a parcel adrift is close enough for the tongue. */
  private inReach(fl: Floater) {
    const f = this.frog;
    return Math.hypot(fl.x - f.x, fl.y - f.y) <= TUNING.tongueR;
  }

  private catchParcel(fl: Floater, how: 'swim' | 'tongue') {
    const f = this.frog;
    const o = fl.o;
    this.tally.rescued++;
    this.log('rescue', { code: o.code, how, after: r1(fl.t), late: o.house.passed });
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
      if (o.dunks === DUNK_MAX - 1) this.showToast(`取件码 ${o.code} 泡过${o.dunks}次水，再掉一次就冲走了`);
    }
    if (!this.floaters.length) {
      this.doneHint('rescue');
      if (f.state === 'swim' && this.gauge) this.climbHint();
    }
  }

  private loseParcel(fl: Floater) {
    this.tally.sunk++;
    this.log('sunk', { code: fl.o.code });
    this.floaters = this.floaters.filter((x) => x !== fl);
    fl.o.state = 'wet';
    this.fx.push({ kind: 'sink', x: fl.x, y: fl.y, t: 0, dur: 1, size: fl.o.size, urgent: fl.o.urgent, cod: !!fl.o.cod });
    this.fx.push({ kind: 'ripple', x: fl.x, y: fl.y + 6, t: 0, dur: 0.9, size: 44 });
    this.game.audio.play('parcel_soaked');
    this.showToast(`取件码 ${fl.o.code} 的包裹被水冲走了……`);
    if (!this.floaters.length) {
      this.doneHint('rescue');
      if (this.frog.state === 'swim' && this.gauge) this.climbHint();
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

  /** A tap on a floating parcel: the tongue fetches it if it's in reach, otherwise the reach ring flashes. */
  private tapFloater(fl: Floater) {
    const f = this.frog;
    if (f.dunkT > 0 || f.hop > 0) return;
    if (this.inReach(fl) && f.state !== 'jump' && f.state !== 'board') this.lick(fl);
    else {
      this.tally.far++;
      this.reachPulse = 1;
      this.showToast(f.state === 'swim' ? '太远了，游近一点，进了虚线圈就能捞' : '太远了，舌头够不着');
    }
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
    this.catchParcel(tg.fl, 'tongue');
    this.game.audio.play('frog_croak', { volume: 0.4, rate: 1.3 });
    while (this.tongueQ.length) {
      const next = this.tongueQ.shift()!;
      if (this.floaters.includes(next)) {
        this.lick(next);
        break;
      }
    }
  }

  /**
   * Where the tongue starts, in world coordinates: the painted frog's mouth (frog_swim, or
   * frog_lick leaning toward the parcel as drawFrog draws it).
   */
  private mouth(): [number, number] {
    const f = this.frog;
    if (f.state === 'swim') return [f.x + f.giveDir * 1.3, f.y - 4.5];
    return [f.x + f.giveDir * 24, f.y - f.z - 63];
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

  /** Springs out of the water onto `p`, the end of every swim. */
  private leapOut(p: Plat) {
    const f = this.frog;
    let x1: number, y1: number;
    if (p.kind === 'bank') {
      x1 = TUNING.riverR + 40;
      y1 = f.y - 40;
    } else if (p.kind === 'house') {
      x1 = p.x + p.house!.porch.x;
      y1 = p.y + p.house!.porch.y;
    } else if (p.kind === 'truck') {
      x1 = p.x - TUNING.truckSpotX[1];
      y1 = p.y + 40;
    } else {
      // onto the near side of the pad, a little in from its edge
      const dx = f.x - p.x, dy = ((f.y - p.y) * p.rx) / p.ry;
      const l = Math.hypot(dx, dy) || 1;
      const r = Math.min(l, p.rx * 0.4);
      x1 = p.x + (dx / l) * r;
      y1 = p.y + ((dy / l) * r * p.ry) / p.rx;
    }
    const dist = Math.hypot(x1 - f.x, y1 - f.y);
    this.endSwim(p.kind);
    this.leaveWater();
    f.state = 'jump';
    f.on = null;
    f.hop = 0;
    f.jump = { x0: f.x, y0: f.y, x1, y1, t: 0, T: 0.3 + dist / 1100, H: 50 + dist * 0.22, dist, to: p, how: 'climb' };
    const au = this.game.audio;
    au.play('swim_climb');
    au.play('jump_whoosh', { volume: 0.5 });
    this.fx.push({ kind: 'splash', x: f.x, y: f.y, t: 0, dur: 0.5 });
    this.fx.push({ kind: 'drops', x: f.x, y: f.y, t: 0, dur: 0.6, size: 0.8, seed: Math.random() * 100 });
    this.fx.push({ kind: 'ripple', x: f.x, y: f.y + 4, t: 0, dur: 0.8, size: 60 });
    this.doneHint('swim');
  }

  /** Out of the water one way or another: the swim controls go away and the river sounds come back up. */
  private leaveWater() {
    this.stick = null;
    this.gauge = null;
    this.bubbles?.stop(0.2);
    this.bubbles = null;
    this.game.audio.duck(false);
  }

  /** Out of the water (climbed out, or hauled in by the truck): how long it took. */
  private endSwim(to: string) {
    const sw = this.swim;
    if (!sw) return;
    this.swim = null;
    const sec = this.time - sw.t;
    this.tally.swimSec += sec;
    this.log('swim_out', { sec: r1(sec), strokes: sw.strokes, fails: sw.fails, to, gauges: sw.gauges, wheel: sw.wheel, gear: this.gear.swim });
  }

  private startJump(dx: number, dy: number, held: number, x: number, y: number) {
    const f = this.frog;
    const len = Math.hypot(dx, dy);
    if (f.state !== 'stand') return;
    if (len < TUNING.deadDrag) {
      // a tap (or a nudge) where a pull was wanted: what was under the finger says what the player was after
      const n = ++this.tally.taps;
      if (n <= 20) this.log('tap', { len: Math.round(len), held: r1(held), under: this.findPlat(x, y + this.camY)?.kind ?? 'water', on: f.on?.kind ?? null, step: this.step });
      return;
    }
    const power = clamp(len / TUNING.maxDrag, 0, 1);
    const ux = -dx / len, uy = -dy / len;
    const dist = this.jumpDist(power, ux, uy);
    // coughing in exhaust, the frog jumps in slow motion
    const T = (0.34 + dist / 1000) * (this.smogT > 0 ? SMOG_SLOW : 1);
    const info: Data = { pow: r2(power), dx: Math.round(dx), dy: Math.round(dy), held: r1(held), from: f.on?.kind ?? null, w: this.weight(), fy: r2(this.sy(f.y) / this.H) };
    if (this.smogT > 0) info.smog = true;
    if (this.step) info.step = this.step;
    f.jump = { x0: f.x, y0: f.y, x1: f.x + ux * dist, y1: f.y + uy * dist, t: 0, T, H: 36 + dist * 0.3, dist, src: f.on, info };
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
        this.log('missed', { code: o.code, inBag: o.state === 'bag' });
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
        this.log('urgent_late', { code: o.code });
        this.showToast('加急件超时了，还是要送到哦');
        this.game.audio.play('urgent_late');
      }
    }
  }

  private checkDanger(dt: number) {
    const f = this.frog;
    const onTruck = (f.state === 'stand' && f.on?.kind === 'truck') || f.state === 'board';
    const s = this.sy(f.y);
    this.climbGrace = f.state === 'stand' ? Math.max(0, this.climbGrace - dt) : 0;
    if (f.state !== 'jump' && !onTruck && s > this.H + 36 && this.climbGrace <= 0) {
      // with the round already done, the waiting truck just reels the frog back in
      if (this.callT !== null) this.yank();
      else if (!this.ropeUsed && !this.routeEnd) this.yank('rope');
      else {
        this.log('thrown', { state: f.state, on: f.on?.kind ?? null, warnSec: r1(this.inWarnT) });
        this.endDay('thrown');
      }
      return;
    }
    const inWarn = f.state !== 'jump' && !onTruck && s > this.H * TUNING.warnLine;
    this.warnK = approach(this.warnK, inWarn ? 1 : 0, 6, dt);
    if (inWarn) {
      if (this.inWarnT === 0) {
        this.tally.warn++;
        this.log('warn', { state: f.state, on: f.on?.kind ?? null });
      }
      this.inWarnT += dt;
      this.tally.warnSec += dt;
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
    // day 1: with nothing in the bag and parcels still on the truck, the way back stays marked until the frog is there
    if (this.cfg.tutorial && !this.bag.length && f.state === 'stand' && !onTruck && (this.step === 'go' || this.step === null) && this.lv.orders.some((o) => o.state === 'pool')) this.setStep('refill');
    if (this.step === 'refill' && f.state === 'stand') this.showHint('refill', '跳回【运输车】，取下一个包裹', { dur: 999, sub: '车上还有包裹等着送，别忘了' });
    if (onTruck && this.truckCards().some((c) => c.order.urgent)) this.showHint('urgent', '【红标签】是加急件，倒计时内送到有奖金', { dur: 5 });
    if (onTruck && this.truckCards().some((c) => c.order.size === 2)) this.showHint('heavy', '【大件】很重，背着它跳不远', { dur: 5 });
  }

  /** Everything is handed out: the trucks wait a while for the frog, honk, then reel it in. */
  private updateCall(dt: number) {
    const f = this.frog;
    const aboard = (f.state === 'stand' && f.on?.kind === 'truck') || f.state === 'board';
    if (this.cod) return;
    if (this.callT === null) {
      if (this.step === 'intro' || this.step === 'rescue' || aboard) return;
      if (this.bag.length || this.floaters.length || this.tongue || this.lv.orders.some((o) => o.state === 'pool')) return;
      this.callT = CALL_T;
      this.lastHonk = CALL_T;
      this.log('all_out');
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
      if (left === 5) this.driverSay(dealLine(HURRY_LINES, this.linesUsed), 2.8, 'call5');
    }
    // a frog in mid-air gets to land first
    if (this.callT <= 0 && (f.state === 'stand' || f.state === 'swim')) this.yank();
  }

  /** Time's up (or swept away while the truck waits, or the route is over): the truck hauls the frog aboard. */
  private yank(why: 'call' | 'route' | 'rope' = 'call') {
    const f = this.frog;
    if (f.state === 'board') return;
    if (why === 'rope') {
      this.ropeUsed++;
      this.game.platform.vibrate(40);
    }
    this.log('yank', { state: f.state, on: f.on?.kind ?? null, why, warnSec: why === 'rope' ? r1(this.inWarnT) : undefined });
    this.yankAt = this.time;
    this.endSwim('yank');
    const t = this.lv.truck;
    if (f.state === 'swim') this.leaveWater();
    this.hint = null;
    this.showToast(why === 'route' ? '下班时间到！被运输车拽回去' : why === 'rope' ? '救命绳！运输车把你拽了回来（每天一次，扣 5 金币）' : '时间到！被运输车一把拽了回去');
    this.runToTruck(t, f.x, f.y, true);
    // the photo catches it at the top of the arc
    this.queueShot('yank', '被拽回车上！', 6, LASSO_T + TUG_T - f.board!.t + YANK_T * 0.45);
  }

  /** A lost letter lying on the road behind the truck, for whoever goes looking. */
  private spawnEgg() {
    if (this.egg) return;
    const t = this.lv.truck;
    this.egg = { x: 692, y: t.y + TUNING.truckHalfH + 110, got: false };
  }

  private checkEgg() {
    const e = this.egg, f = this.frog;
    if (!e || e.got || f.state !== 'stand' || f.on?.kind !== 'bank') return;
    if (Math.hypot(f.x - e.x, f.y - e.y) > 90) return;
    e.got = true;
    this.log('egg');
    this.hint = null;
    this.extra.letter = pick(LETTERS, Math.random);
    this.showHint('egg', '捡到一封【遗失的信】！', { dur: 5, sub: this.extra.letter });
    this.queueShot('egg', '捡到一封遗失的信！', 8, 0.1);
    this.popups.push({ text: '发现彩蛋！', x: e.x - 60, y: e.y - 60, t: 0, color: P.orangeDeep });
    this.game.audio.play('paper_flip');
    this.game.audio.play('coin', { delay: 0.2, volume: 0.7 });
  }

  /** The driver shouts something from the cab, with a honk. */
  private driverSay(text: string, dur: number, kind: 'hurry' | 'call5' | 'arrive' | 'idle_warn' | 'kick') {
    this.driver = { text, t: 0, dur };
    this.log('driver_say', { kind, text });
    this.honkT = 0.5;
    this.game.audio.play('truck_horn', { volume: 0.7, rate: 1.1 });
  }

  /** The last seconds of the route with the frog off the truck: the driver calls it back, then honks the count down. */
  private updateHurry() {
    if (this.callT !== null || this.routeEnd || this.frozen()) return;
    const f = this.frog;
    const left = (this.cfg.length + this.camY) / this.cfg.speed;
    const n = Math.ceil(left);
    const tick = n < this.hurryN;
    this.hurryN = n;
    if (left > HURRY_AT || (f.state === 'stand' && f.on?.kind === 'truck') || f.state === 'board') return;
    if (!this.hurried) {
      this.hurried = true;
      this.log('hurry', { state: f.state, on: f.on?.kind ?? null });
      this.driverSay(dealLine(HURRY_LINES, this.linesUsed), 2.8, 'hurry');
      this.showHint('call', '快到站了！【跳回运输车】', { dur: 4, sub: '到站还没上车，会被绳子拽回去', warn: true, again: true });
    } else if (tick && n >= 1 && n <= 3) {
      this.game.audio.play('truck_horn', { rate: 1 + (3 - n) * 0.06 });
      this.honkT = 0.5;
      this.game.platform.vibrate(30);
    }
  }

  /** The route is over: the river stops. Aboard, the frog drives home; anywhere else it gets hauled in first. */
  private arrive() {
    const f = this.frog;
    this.routeEnd = true;
    this.callT = null;
    this.aim = null;
    this.stopCharge();
    this.hint = null;
    this.log('route_end', { state: f.state, on: f.on?.kind ?? null });
    if (!(f.state === 'stand' && f.on?.kind === 'truck') && f.state !== 'board') this.driverSay('到站啦！拽你回来！', 2, 'arrive');
  }

  /** At the end of the route, a frog off the truck is lassoed as soon as it's on something or in the water. */
  private haulIn() {
    const f = this.frog;
    if (this.cod) return;
    if (f.state === 'swim' || (f.state === 'stand' && f.on?.kind !== 'truck')) this.yank('route');
  }

  /** Sitting on the truck too long with work left: a honk, then the driver kicks the frog onto the nearest pad. */
  private updateIdle(dt: number) {
    const f = this.frog;
    const onTruck = f.state === 'stand' && f.on?.kind === 'truck';
    const work = this.bag.length > 0 || this.cargo().length > 0;
    if (!onTruck || this.step !== null || this.frozen() || this.callT !== null || this.routeEnd || !work || this.dizzyT > 0) {
      this.idleT = 0;
      this.idleWarned = false;
      return;
    }
    // winding up a jump is getting on with it
    if (this.aim) return;
    this.idleT += dt;
    if (!this.idleWarned && this.idleT >= IDLE_WARN) {
      this.idleWarned = true;
      this.driverSay('喂，该下车干活了！', 2.2, 'idle_warn');
      this.game.platform.vibrate(30);
    }
    if (this.idleT >= IDLE_KICK) this.kickOff();
  }

  private kickOff() {
    const f = this.frog;
    this.idleT = 0;
    this.idleWarned = false;
    // the nearest pad on screen, preferably in the middle so the convoy doesn't start rushing
    const pads = this.lv.plats.filter((p) => p.kind === 'lily' && this.sy(p.y) > this.game.safeT + 170 && this.sy(p.y) < this.H * 0.75);
    const mid = pads.filter((p) => this.sy(p.y) > this.H * TUNING.rushRelease - 40);
    const pool = mid.length ? mid : pads;
    if (!pool.length) return;
    const p = pool.reduce((a, b) => (Math.hypot(a.x - f.x, a.y - f.y) <= Math.hypot(b.x - f.x, b.y - f.y) ? a : b));
    this.tally.kicked++;
    this.log('kicked', { d: Math.round(Math.hypot(p.x - f.x, p.y - f.y)) });
    this.aim = null;
    this.stopCharge();
    this.driverSay(dealLine(KICK_LINES, this.linesUsed), 3, 'kick');
    const t = f.on!;
    t.press = 0.6;
    const x1 = p.x + (Math.random() - 0.5) * p.rx * 0.4, y1 = p.y + (Math.random() - 0.5) * p.ry * 0.3;
    const dist = Math.hypot(x1 - f.x, y1 - f.y);
    f.state = 'jump';
    f.on = null;
    f.settle = null;
    f.jump = { x0: f.x, y0: f.y, x1, y1, t: 0, T: KICK_T, H: 150 + dist * 0.15, dist, to: p, how: 'jump', spin: true };
    this.fx.push({ kind: 'dust', x: f.x, y: f.y, t: 0, dur: 0.5, size: 0.8 });
    this.fx.push({ kind: 'say', x: 0, y: 0, t: 0, dur: 0.9, label: '哎哟！' });
    this.shakeT = 0.15;
    const au = this.game.audio;
    au.play('parcel_place', { volume: 0.9, rate: 0.6 });
    au.play('jump_whoosh', { volume: 0.8, delay: 0.05 });
    au.play('frog_croak', { volume: 0.8, rate: 1.5, delay: 0.1 });
    this.game.platform.vibrate(50);
    this.showHint('kick', '在车上待太久，被司机【踢下车】了！', { dur: 4.5, sub: '拿好包裹就出发，别在车上发呆' });
    this.queueShot('kick', '被司机一脚踢下车！', 7, KICK_T * 0.45);
  }

  /** Nothing left on the trucks or in the bag (or the route is over): landing on a truck ends the day. */
  private checkOffwork() {
    const f = this.frog;
    if (f.state !== 'stand' || f.on?.kind !== 'truck' || f.settle || this.step === 'intro') return;
    // hauled aboard: a moment to see stars before driving off
    if (this.dizzyT > DIZZY_T - 0.9) return;
    if (!this.routeEnd && (this.bag.length || this.floaters.length || this.tongue || this.lv.orders.some((o) => o.state === 'pool'))) return;
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
    const panX = -Math.max(0, t.x + half - 750);
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
    this.placeTruck();
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
    this.log('run_end', this.summary(this.routeEnd ? 'done' : this.ended));
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
      penalty: wrong * TUNING.wrongPenalty + wet * TUNING.wetPenalty + this.ropeUsed * TUNING.ropePenalty,
      falls: this.stats.falls,
      wrongNames: orders.filter((o) => o.state === 'wrong' && o.deliveredTo).map((o) => o.deliveredTo!.name),
      photos: this.pickPhotos(),
      codTotal: orders.filter((o) => o.cod).length,
      codRight: this.stats.codRight,
      codTips: this.stats.codTips,
      codLoss: this.stats.codLoss,
      bestTrip: this.stats.bestTrip,
      fastUrgent: this.stats.fastUrgent,
      extra: {
        jumps: this.stats.jumps, longest: this.extra.far, rescued: this.tally.rescued, letter: this.extra.letter,
        parcels: orders.map((o) => {
          const h = o.deliveredTo ?? o.house;
          return { to: h.name, owner: o.house.name, species: h.species, state: o.state as 'delivered' | 'wrong' | 'wet' | 'missed', urgent: o.urgent };
        }),
      },
    };
    this.ended = null;
    this.stopLoops();
    this.game.go(new HqScene(this.game, result), true);
  }

  // ---------------------------------------------------------------- parcels

  private truckCards(): Card[] {
    return this.cards.filter((c) => c.where === 'truck');
  }

  /** Parcels still on the truck, the ones for the nearest houses first. */
  private cargo(): Order[] {
    return this.lv.orders.filter((o) => o.state === 'pool' && !o.house.passed).sort((a, b) => b.house.plat.y - a.house.plat.y);
  }

  /** Remembers where o's card is right now, so it can slide over to its new row. */
  private fly(o: Order) {
    const c = this.cards.find((c) => c.order === o);
    this.flights = this.flights.filter((f) => f.o !== o);
    if (c) this.flights.push({ o, from: { ...c.rect }, t: 0 });
  }

  /** Where parcels come off and go back onto the cargo stack, in world coordinates. */
  private cargoSpot(): [number, number] {
    const t = this.lv.truck;
    return [t.x - 40 * K, t.y + 100 * K];
  }

  private pickup(o: Order) {
    const used = this.slotsUsed();
    if (used + SIZE_INFO[o.size].slots > this.cfg.bagSlots) {
      this.tally.bagFull++;
      this.log('bag_full', { code: o.code, size: o.size, used });
      this.shakeCard = { id: o.id, t: 0 };
      this.game.audio.play('bag_full');
      this.showToast('背包装不下了');
      if (this.bag.length) this.showHint('putBack', '点背包里的包裹，可以【放回车上】', { dur: 4.5, sub: '腾出地方，换个更急、更顺路的' });
      return;
    }
    this.fly(o);
    o.state = 'bag';
    if (!o.pickedAt) o.pickedAt = this.time;
    if (o.urgent && !o.deadline) {
      // Enough time for the house to come down to the frog, plus a margin. Kept if it's put back.
      const ahead = Math.max(0, this.H * 0.45 - this.sy(o.house.plat.y));
      o.deadline = this.time + Math.max(TUNING.urgentSeconds, ahead / this.cfg.speed + 16);
    }
    this.bag.push(o);
    this.log('pickup', { code: o.code, size: o.size, urgent: o.urgent, cod: !!o.cod, used: this.slotsUsed() });
    if (o.urgent) this.game.audio.play('urgent_alert', { delay: 0.25 });
    // off the cargo stack and into the frog's satchel
    const f = this.frog;
    const [cx, cy] = this.cargoSpot();
    this.fx.push({ kind: 'arc', x: cx, y: cy, x2: f.x - 26, y2: f.y - 36, t: 0, dur: 0.32, size: o.size, urgent: o.urgent, cod: !!o.cod });
    this.fx.push({ kind: 'dust', x: f.x - 26, y: f.y - 20, t: -0.32, dur: 0.35, size: 0.4 });
    f.swingV += 4;
    this.game.audio.play('parcel_pickup');
    if (o.cod) this.showHint('cod', '这是【到付件】，送到后要收钱找零', { dur: 5, sub: `住户会付 ${o.cod.paid} 元，算一算该找回多少` });
    if (this.step === 'pick') {
      if (this.refilled) this.setStep(null);
      else {
        this.setStep('aim');
        this.aimTarget = this.findAimTarget(o.house);
      }
    }
  }

  /** On the truck, a parcel tapped in the satchel goes back onto the cargo stack. */
  private putBack(o: Order) {
    this.tally.putBack++;
    this.log('put_back', { code: o.code, size: o.size });
    this.fly(o);
    this.bag = this.bag.filter((b) => b !== o);
    o.state = 'pool';
    const f = this.frog;
    const [cx, cy] = this.cargoSpot();
    this.fx.push({ kind: 'arc', x: f.x - 26, y: f.y - 36, x2: cx, y2: cy, t: 0, dur: 0.32, size: o.size, urgent: o.urgent, cod: !!o.cod });
    this.fx.push({ kind: 'dust', x: cx, y: cy, t: -0.32, dur: 0.35, size: 0.4 });
    f.swingV -= 4;
    this.game.audio.play('parcel_place', { volume: 0.8, rate: 1.1 });
    this.doneHint('putBack');
  }

  private deliver(o: Order, h: House) {
    this.bag = this.bag.filter((b) => b !== o);
    o.deliveredTo = h;
    const d: Data = { code: o.code, house: h.type, res: h.species, ok: o.house === h, size: o.size, urgent: o.urgent, late: o.late, cod: !!o.cod, sec: r1(this.time - o.pickedAt) };
    if (o.house !== h) {
      // what this house was waiting for, and whether it was in the bag all along (a mis-tap rather than a mix-up)
      d.want = this.lv.orders.filter((x) => x.house === h && (x.state === 'pool' || x.state === 'bag')).map((x) => x.code);
      d.hadRight = this.bag.some((b) => b.house === h);
    }
    this.log('deliver', d);
    const f = this.frog;
    const rx = h.plat.x + h.resident.x, ry = h.plat.y + h.resident.y;
    // The frog leans in and tosses it over; the resident catches it and holds it up.
    const T = 0.34;
    f.give = 1;
    f.giveDir = rx < f.x ? -1 : 1;
    f.swingV += 5;
    this.fx.push({ kind: 'arc', x: f.x + f.giveDir * 24, y: f.y - 44, x2: rx, y2: ry - 64, t: 0, dur: T, size: o.size, urgent: o.urgent, cod: !!o.cod });
    h.hold = { size: o.size, urgent: o.urgent, cod: !!o.cod, wrong: o.house !== h, t: -T };
    const au = this.game.audio;
    au.play('jump_whoosh', { volume: 0.35, rate: 1.5 });
    au.play('parcel_place', { delay: T });
    this.frogCue = { pose: o.house === h ? 'frog_salute' : 'frog_sad', from: this.time + T, until: this.time + T + 1.1 };
    if (o.house === h) {
      o.state = 'delivered';
      h.react = { kind: 'happy', t: -T };
      const amount = SIZE_INFO[o.size].pay + (o.urgent && !o.late ? TUNING.urgentBonus : 0);
      this.popups.push({ text: `+${amount}`, x: rx, y: ry - 120, t: -T - 0.1, color: P.lilyDeep });
      this.fx.push({ kind: 'heart', x: rx, y: ry - 110, t: -T, dur: 1.1 });
      this.fx.push({ kind: 'coins', x: rx, y: ry - 90, t: -T - 0.05, dur: 0.9, seed: Math.random() * 100 });
      au.play('deliver_happy', { delay: T + 0.1 });
      au.play('coin', { delay: T + 0.3, volume: 0.8 });
      this.trip++;
      this.stats.bestTrip = Math.max(this.stats.bestTrip, this.trip);
      const ch = this.cfg.challenge;
      if (o.urgent && this.time - o.pickedAt <= (ch.kind === 'urgentFast' ? ch.sec : 20)) this.stats.fastUrgent = true;
      const n = this.lv.orders.filter((x) => x.state === 'delivered').length;
      if (n === 1) this.queueShot('first', '第一单送达！', 4, T + 0.3);
      if (o.urgent && !o.late) this.queueShot('urgent', '加急件准时送达！', 5, T + 0.3);
      if (o.cod) this.openCod(o, h, T);
    } else {
      // Not blocked: the review at HQ catches it. The resident just looks puzzled.
      o.state = 'wrong';
      h.react = { kind: 'confused', t: -T };
      au.play('deliver_confused', { delay: T + 0.15 });
      this.queueShot('wrong', `${h.name}：${RESIDENT[h.species]?.huh ?? '这是我的吗？'}`, 7, T + 0.5);
    }
    const more = this.lv.orders.some((x) => x.state === 'pool');
    if (this.step === 'deliver') this.setStep(!this.bag.length && more ? 'refill' : null);
    else if (this.cfg.tutorial && !this.bag.length && more) this.showHint('refill', '送到了！跳回【运输车】取下一个', { dur: 999, sub: '车上还有包裹等着送' });
  }

  /** Cash on delivery: the resident pays up and the frog has to work out the change. */
  private openCod(o: Order, h: House, delay: number) {
    const { price, paid } = o.cod!;
    const right = paid - price;
    // near misses, plus handing back the price itself, the classic slip
    const wrong = new Set<number>();
    for (const v of [price, right + 1, right - 1, right + 2, right - 2]) if (v > 0 && v < paid && v !== right) wrong.add(v);
    const picks = shuffle([...wrong], Math.random).slice(0, 2);
    this.cod = { o, h, t: -delay - 0.25, opts: shuffle([right, ...picks], Math.random), pick: null, pickT: 0, btns: [] };
    this.aim = null;
    this.stopCharge();
    this.game.audio.play('cash_register', { delay: delay + 0.2 });
  }

  private chooseChange(i: number) {
    const c = this.cod!;
    const { price, paid } = c.o.cod!;
    const ok = c.opts[i] === paid - price;
    this.log('cod', { ok, pick: c.opts[i], right: paid - price, price, paid, sec: r1(c.t) });
    c.pick = i;
    c.pickT = 0;
    c.o.codOk = ok;
    const au = this.game.audio;
    if (ok) {
      this.stats.codRight++;
      this.stats.codTips += TUNING.codTip;
      au.play('coins_change');
      au.play('coin', { delay: 0.35 });
      this.queueShot('cod', `${c.h.name}：找得正好！`, 5, 0.1);
    } else {
      this.stats.codLoss += TUNING.codPenalty;
      au.play('coins_change', { rate: 0.85 });
      au.play('deliver_unhappy', { delay: 0.3 });
      this.game.platform.vibrate(40);
    }
  }

  private closeCod() {
    const c = this.cod!;
    this.cod = null;
    const h = c.h;
    const rx = h.plat.x + h.resident.x, ry = h.plat.y + h.resident.y;
    if (c.o.codOk) {
      this.popups.push({ text: `小费 +${TUNING.codTip}`, x: rx, y: ry - 130, t: 0, color: P.lilyDeep });
      this.fx.push({ kind: 'coins', x: rx, y: ry - 90, t: 0, dur: 0.9, seed: Math.random() * 100 });
      h.react = { kind: 'happy', t: 0 };
      this.frogCue = { pose: 'frog_cheer', from: this.time, until: this.time + 1 };
    } else {
      this.popups.push({ text: `找错了 -${TUNING.codPenalty}`, x: rx, y: ry - 130, t: 0, color: P.red });
      h.react = { kind: 'confused', t: 0 };
      this.frogCue = { pose: 'frog_sad', from: this.time, until: this.time + 1 };
    }
  }

  // ---------------------------------------------------------------- input

  down(x: number, y: number, id: number) {
    if (this.paused) {
      for (const b of this.menuBtns) if (hit(b.rect, x, y)) this.pressed = b.id;
      return;
    }
    // a long stretch without touching anything: stuck, or just riding along?
    const gap = this.time - this.lastInput;
    this.lastInput = this.time;
    if (gap >= 8 && !this.ended && !this.off && this.step !== 'intro') {
      this.tally.idle++;
      this.log('idle', { sec: r1(gap), step: this.step, state: this.frog.state, on: this.frog.on?.kind ?? null });
    }
    if (this.off) {
      // a tap brings the card up at once; on the card, it goes straight to HQ
      if (this.off.t < CARD_AT) this.off.t = CARD_AT;
      else if (this.off.t > CARD_AT + 0.3) this.finish();
      return;
    }
    if (this.ended) return;
    if (this.step === 'intro') {
      if (this.stepT > 0.4 && hit(this.introBtn, x, y, 24)) this.pressed = 'intro';
      else this.miss('intro');
      return;
    }
    if (hit(this.pauseBtn, x, y, 14)) {
      this.pressed = 'pause';
      return;
    }
    const fl = this.floaterAt(x, y);
    if (this.step === 'rescue') {
      // the lesson only lets go once the wheel is touched
      if (this.inWheel(x, y)) {
        this.endRescueLesson();
        this.grabStick(id, x, y);
      } else this.miss('rescue');
      return;
    }
    if (this.cod) {
      const c = this.cod;
      if (c.pick === null && c.t > 0.3) {
        c.btns.forEach((r, i) => hit(r, x, y, 8) && (this.pressed = `chg${i}`));
        if (!this.pressed) this.miss('cod');
      } else if (c.pick !== null && c.pickT > 0.5) this.closeCod();
      return;
    }
    // cards act when let go, so the press shows first
    if (this.trayMode !== 'bag') {
      const c = this.cards.find((c) => hit(c.rect, x, y, 4));
      if (c) {
        this.pressed = `card${c.order.id}`;
        return;
      }
    }
    // while a card is spotlighted, only the cards respond
    if (this.step === 'pick' || this.step === 'deliver') {
      this.miss(this.step);
      return;
    }
    const f = this.frog;
    if (f.state === 'swim') {
      // in the water: the wheel steers, a parcel gets licked, anywhere else is the leap gauge
      if (this.inWheel(x, y)) this.grabStick(id, x, y);
      else if (fl) this.tapFloater(fl);
      else this.gaugeTap();
      return;
    }
    if (fl && f.state === 'stand') {
      this.tapFloater(fl);
      return;
    }
    if (f.state === 'stand' && !this.aim && this.tiredT <= 0 && !this.routeEnd) {
      this.aim = { id, sx: x, sy: y, x, y, t: 0 };
      this.exhaust();
    } else if (f.state === 'jump' && !this.aim && !this.early && !this.queued && !this.routeEnd) {
      // pressed while still in the air: the pull starts as soon as the frog lands
      this.early = { id, sx: x, sy: y, x, y, t: 0 };
    }
  }

  /** Carries a press or a jump made in mid-air over to the landing. */
  private updateBuffer(dt: number) {
    const f = this.frog;
    const e = this.early;
    if (e) {
      e.t += dt;
      if (f.state === 'stand' && this.tiredT <= 0 && !this.routeEnd) {
        this.early = null;
        this.aim = e;
        this.exhaust();
      } else if (f.state !== 'jump') this.early = null;
    }
    const q = this.queued;
    if (q) {
      if (f.state === 'stand') {
        this.queued = null;
        if (this.time - q.at <= BUFFER_T) this.startJump(q.dx, q.dy, q.held, q.sx, q.sy);
      } else if (f.state !== 'jump' || this.time - q.at > BUFFER_T + 0.6) this.queued = null;
    }
  }

  move(x: number, y: number, id: number) {
    if (this.aim && this.aim.id === id) {
      this.aim.x = x;
      this.aim.y = y;
    }
    if (this.early && this.early.id === id) {
      this.early.x = x;
      this.early.y = y;
    }
    if (this.stick && this.stick.id === id) this.steer(x, y);
  }

  /** The swimming wheel, bottom right, in screen coordinates. */
  private wheel() {
    return { x: 606, y: this.trayY() - 40, r: 100 };
  }

  private inWheel(x: number, y: number) {
    const w = this.wheel();
    return Math.hypot(x - w.x, y - w.y) <= w.r * 1.4;
  }

  private grabStick(id: number, x: number, y: number) {
    this.stick = { id, x: 0, y: 0 };
    this.steer(x, y);
  }

  /** The thumb's offset from the wheel's middle, full strength a little inside its rim. */
  private steer(x: number, y: number) {
    const w = this.wheel();
    let dx = (x - w.x) / (w.r * 0.7), dy = (y - w.y) / (w.r * 0.7);
    const l = Math.hypot(dx, dy);
    if (l > 1) {
      dx /= l;
      dy /= l;
    }
    this.stick!.x = dx;
    this.stick!.y = dy;
  }

  up(x: number, y: number, id: number) {
    if (this.stick && this.stick.id === id) this.stick = null;
    if (this.paused) {
      const b = this.menuBtns.find((b) => b.id === this.pressed && hit(b.rect, x, y));
      this.pressed = null;
      if (b) this.menu(b.id);
      return;
    }
    const pressed = this.pressed;
    this.pressed = null;
    if (pressed === 'intro') {
      this.startDay();
      return;
    }
    if (pressed === 'pause') {
      if (hit(this.pauseBtn, x, y, 14) && !this.ended) {
        this.setPaused(true);
        this.game.audio.play('ui_open');
      }
      return;
    }
    if (pressed?.startsWith('chg')) {
      const i = Number(pressed.slice(3));
      const c = this.cod;
      if (c && c.pick === null && hit(c.btns[i], x, y, 8)) this.chooseChange(i);
      return;
    }
    if (pressed?.startsWith('card')) {
      const c = this.cards.find((c) => `card${c.order.id}` === pressed);
      if (!c || !hit(c.rect, x, y, 10) || this.ended) return;
      if (this.trayMode === 'pickup') {
        if (c.where === 'truck') this.pickup(c.order);
        else if (this.step !== 'pick') this.putBack(c.order);
      } else if (this.trayMode === 'deliver' && this.frog.on?.house) this.deliver(c.order, this.frog.on.house);
      return;
    }
    if (this.early && this.early.id === id) {
      // let go before the frog is down: the jump is held back for the landing
      const e = this.early;
      this.early = null;
      if (this.frog.state === 'stand') this.startJump(x - e.sx, y - e.sy, e.t, e.sx, e.sy);
      else if (this.frog.state === 'jump') this.queued = { dx: x - e.sx, dy: y - e.sy, held: e.t, sx: e.sx, sy: e.sy, at: this.time };
      return;
    }
    if (!this.aim || this.aim.id !== id) return;
    const a = this.aim;
    this.aim = null;
    if (this.frog.state === 'stand') this.startJump(x - a.sx, y - a.sy, a.t, a.sx, a.sy);
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

  /** Held the pull too long: the legs give out and the jump is called off. */
  private tired() {
    this.tally.tired++;
    this.log('tired', { step: this.step, on: this.frog.on?.kind ?? null });
    this.aim = null;
    this.stopCharge();
    this.tiredT = 0.35;
    const f = this.frog;
    f.landT = 0.1;
    f.impact = 0.5;
    this.fx.push({ kind: 'say', x: 0, y: 0, t: 0, dur: 1.2, label: '脚累了…' });
    this.showHint('tired', '蓄力太久，【脚累了】！', { dur: 3.5, sub: `按住别超过 ${FOOT_T} 秒，拉好就松手`, warn: true, again: true });
    const au = this.game.audio;
    au.play('ui_error', { volume: 0.7 });
    au.play('frog_croak', { volume: 0.6, rate: 0.7, delay: 0.1 });
    this.game.platform.vibrate(30);
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
    // the page may be closing: keep a snapshot of the run in case it never comes back
    if (!this.leaving) this.log('run_snap', this.summary('hidden'));
    if (!this.ended) this.setPaused(true);
    this.aim = null;
    this.early = null;
    this.queued = null;
    this.stick = null;
    this.stopCharge();
  }

  /** The pause menu stops everything that makes noise, music included, and picks it up again after. */
  private setPaused(on: boolean) {
    if (this.paused === on) return;
    this.paused = on;
    const au = this.game.audio;
    if (on) {
      this.tally.pauses++;
      this.log('pause');
      this.aim = null;
      this.stopLoops();
      au.pauseMusic();
    } else au.resumeMusic();
  }

  private menu(id: string) {
    this.log('menu', { id });
    if (id === 'restart' || id === 'map') this.log('run_end', this.summary(id === 'restart' ? 'restart' : 'quit'));
    this.game.audio.play(id === 'resume' ? 'ui_close' : 'ui_tap');
    if (id === 'resume') this.setPaused(false);
    else if (id === 'restart') {
      this.stopLoops();
      this.game.go(new PlayScene(this.game, this.day));
    } else if (id === 'map') {
      this.stopLoops();
      this.game.go(new MapScene(this.game, this.day));
    } else if (id === 'sound') this.game.setSound(!this.game.save.sound);
  }

  // ---------------------------------------------------------------- hints, photos

  private showHint(key: HintKey, line: string | Seg[], o: { dur?: number; sub?: string; warn?: boolean; again?: boolean } = {}) {
    if (this.hintsDone.has(key) || this.hint?.key === key) return;
    // a standing tutorial hint only gives way to emergencies
    if (this.hint && this.hint.dur > 50 && key !== 'swim' && key !== 'warn' && key !== 'wrongHouse') return;
    this.hint = { key, line: typeof line === 'string' ? segs(line) : line, sub: o.sub, t: 0, dur: o.dur ?? 5, warn: o.warn };
    if (!o.again) this.hintsDone.add(key);
    const n = (this.tally.hints[key] = (this.tally.hints[key] ?? 0) + 1);
    if (n <= 3) this.log('hint', { key });
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
      // a wide shot for the big view; the polaroid crops in around the frog
      const w = 600, h = 460;
      const fx = f.x + this.camX;
      const fy = s.thrown ? this.H - 90 : this.sy(f.y) + this.panY - f.z - 50;
      const cx = clamp(fx, w / 2, 750 - w / 2);
      const cy = clamp(fy, h / 2, this.H - h / 2);
      const ps = Math.min(sc, 2);
      const c = this.game.platform.createCanvas(w * ps, h * ps);
      c.getContext('2d')!.drawImage(src, (cx - w / 2) * sc, (cy - h / 2) * sc, w * sc, h * sc, 0, 0, c.width, c.height);
      const focus: [number, number] = [(fx - (cx - w / 2)) / w, (fy - (cy - h / 2)) / h];
      this.photos.push({ img: c, caption: s.caption, prio: s.prio, kind: s.kind, t: this.time, focus });
      if (this.photos.length > 8) {
        this.photos.sort((a, b) => b.prio - a.prio);
        this.photos.length = 8;
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
    const rushA = clamp((this.speedK - 1.15) / (TUNING.rushMax - 1.15), 0, 1);
    if (rushA > 0) this.drawStreaks(ctx, rushA);
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
      this.drawWheel(ctx);
      ctx.restore();
    }
    if (this.cod && !this.paused) this.drawCod(ctx);
    if (this.step && this.step !== 'go' && this.step !== 'refill' && !this.paused) this.drawCoach(ctx);
    if (this.off) this.drawOffCard(ctx);
    if (this.paused) this.drawPause(ctx);
  }

  private refreshTray() {
    const f = this.frog;
    const on = f.state === 'stand' ? f.on : null;
    this.trayMode = this.ended || this.cod ? 'bag' : on?.kind === 'truck' ? 'pickup' : on?.kind === 'house' && this.bag.length ? 'deliver' : 'bag';
    const y = this.trayY();
    if (this.trayMode === 'deliver') {
      this.cards = this.bag.slice(0, 4).map((order, i) => ({ order, where: 'bag', rect: { x: 146 + i * 118, y: y - 62, w: 108, h: 124 } }));
      return;
    }
    // the satchel's contents, small, beside the backpack button; on the truck, the cargo above
    this.cards = this.bag.slice(0, 4).map((order, i) => ({ order, where: 'bag', rect: { x: 146 + i * 92, y: y - 49, w: 84, h: 98 } }));
    if (this.trayMode === 'pickup') {
      const ty = this.truckRowY();
      this.cargo().slice(0, 6).forEach((order, i) => this.cards.push({ order, where: 'truck', rect: { x: 34 + i * 114, y: ty - 60, w: 104, h: 120 } }));
    }
  }

  /** Middle of the truck's row of cards, above the satchel's. */
  private truckRowY() {
    return this.trayY() - 182;
  }

  private trayY() {
    return this.H - this.game.safeB - 96;
  }

  private drawWorld(ctx: Ctx) {
    const H = this.H;
    const f = this.frog;
    type D = { y: number; draw: () => void };
    const items: D[] = [];
    this.drawReach(ctx);
    for (const p of this.lv.plats) {
      const s = this.sy(p.y) + this.panY;
      if (s < -260 || s > H + 140) continue;
      items.push({ y: p.y, draw: () => this.drawPlat(ctx, p) });
    }
    items.push({ y: this.lv.truck.y, draw: () => this.drawTruck(ctx, this.lv.truck) });
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
      {
        const t = this.lv.truck;
        const dir = 1;
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
    for (const e of this.fx) if (e.t >= 0 && e.kind !== 'ripple' && e.kind !== 'floatBox' && e.kind !== 'sink') this.drawFx(ctx, e);
    for (const p of this.popups) {
      if (p.t < 0) continue;
      const k = p.t / 1.2;
      text(ctx, p.text, p.x, this.sy(p.y) - 40 * easeOutCubic(k), 34, { color: p.color, bold: true, alpha: 1 - k * k });
    }
    this.drawPuffs(ctx);
    this.drawDizzy(ctx);
    this.drawDriver(ctx);
    this.drawLeapTarget(ctx);
    this.drawGauge(ctx);
  }

  /** While parcels are adrift: the tongue's reach round the frog, with a notch pointing at each one out of it. */
  private drawReach(ctx: Ctx) {
    const f = this.frog;
    if (!this.floaters.length || this.ended || (f.state !== 'swim' && f.state !== 'stand') || this.step === 'intro') return;
    const R = TUNING.tongueR;
    const x = f.x, y = this.sy(f.y);
    const pulse = this.reachPulse;
    ctx.save();
    ellipse(ctx, x, y, R, R * 0.82);
    ctx.fillStyle = `rgba(251,247,238,${0.08 + pulse * 0.12})`;
    ctx.fill();
    ctx.setLineDash([14, 10]);
    ctx.lineDashOffset = -this.time * 24;
    ctx.lineWidth = 3 + pulse * 3;
    ctx.strokeStyle = pulse > 0 ? P.gold : 'rgba(251,247,238,0.75)';
    ctx.stroke();
    ctx.setLineDash([]);
    for (const fl of this.floaters) {
      if (this.inReach(fl)) continue;
      const a = Math.atan2((this.sy(fl.y) - y) / 0.82, fl.x - x);
      const px = x + Math.cos(a) * R, py = y + Math.sin(a) * R * 0.82;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(a);
      ctx.beginPath();
      ctx.moveTo(14, 0);
      ctx.lineTo(-6, -11);
      ctx.lineTo(-6, 11);
      ctx.closePath();
      ctx.fillStyle = P.white;
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  /** Swimming: what a leap would land on, outlined, with a dotted arc to it (gold once the gauge is up). */
  private drawLeapTarget(ctx: Ctx) {
    const f = this.frog;
    if (f.state !== 'swim' || f.dunkT > 0 || f.hop > 0 || this.step === 'rescue') return;
    const tgt = this.leapTarget();
    if (!tgt) return;
    const p = tgt.p;
    const hot = !!this.gauge;
    const x = f.x, y = this.sy(f.y);
    let tx: number, ty: number;
    ctx.save();
    ctx.setLineDash([12, 9]);
    ctx.lineDashOffset = -this.time * 30;
    ctx.lineWidth = hot ? 5 : 3.5;
    ctx.strokeStyle = hot ? P.gold : 'rgba(251,247,238,0.85)';
    ctx.globalAlpha = 0.75 + Math.sin(this.time * 6) * 0.25;
    if (p.kind === 'bank' || p.kind === 'truck') {
      tx = TUNING.riverR + 34;
      ty = y - 30;
      roundRect(ctx, TUNING.riverR + 4, y - 110, 64, 150, 18);
      ctx.stroke();
    } else {
      tx = p.x;
      ty = this.sy(p.y);
      if (p.kind === 'log') {
        ctx.save();
        ctx.translate(p.x, ty);
        ctx.rotate(p.rot);
        roundRect(ctx, -p.rx - 12, -p.ry - 14, (p.rx + 12) * 2, (p.ry + 14) * 2, 20);
        ctx.restore();
      } else ellipse(ctx, p.x, ty, p.rx + 14, p.ry + 16);
      ctx.stroke();
    }
    // the dotted arc a leap would follow
    const mx = (x + tx) / 2, my = Math.min(y, ty) - 60;
    ctx.setLineDash([2, 12]);
    ctx.lineCap = 'round';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(x, y - 20);
    ctx.quadraticCurveTo(mx, my, tx, ty - 10);
    ctx.stroke();
    ctx.restore();
  }

  /** The leap gauge over the swimming frog once tapped up: green in the middle, a needle swinging across. */
  private drawGauge(ctx: Ctx) {
    const f = this.frog;
    const g = this.gauge;
    if (!g || f.state !== 'swim') return;
    const R = 62;
    const x = clamp(f.x, 90, 660), y = Math.max(this.game.safeT + 170, this.sy(f.y) - 118);
    const zone = this.gaugeZone();
    const reach = !!this.leapTarget();
    const ang = (v: number) => Math.PI + v * Math.PI;
    const arc = (a: number, b: number, color: string, w: number) => {
      ctx.beginPath();
      ctx.arc(x, y, R, a, b);
      ctx.strokeStyle = color;
      ctx.lineWidth = w;
      ctx.stroke();
    };
    ctx.save();
    ctx.globalAlpha = Math.min(1, g.t * 6 + 0.3);
    ctx.lineCap = 'butt';
    arc(Math.PI, 0, INK, 24);
    arc(Math.PI + 0.02, -0.02, '#F2C2B5', 18);
    arc(ang(0.5 - zone / 2), ang(0.5 + zone / 2), reach ? P.lily : P.silver, 18);
    if (reach) arc(ang(0.5 - CLIMB_PERFECT), ang(0.5 + CLIMB_PERFECT), P.lilyDeep, 18);
    const v = this.gaugeNeedle(g.t);
    const n = ang(v);
    const inside = reach && Math.abs(v - 0.5) <= zone / 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(n) * (R + 16), y + Math.sin(n) * (R + 16));
    ctx.strokeStyle = INK;
    ctx.lineWidth = 8;
    ctx.stroke();
    ctx.strokeStyle = inside ? P.gold : P.white;
    ctx.lineWidth = 4;
    ctx.stroke();
    ellipse(ctx, x, y, 10, 10);
    ctx.fillStyle = P.orange;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.stroke();
    text(ctx, !reach ? '够不着' : inside ? '点！' : '看准…', x, y + 28, 26, { bold: true, color: inside ? P.lilyDeep : P.white });
    ctx.restore();
  }

  /** The swimming wheel, bottom right: a knob that follows the thumb. */
  private drawWheel(ctx: Ctx) {
    const a = this.wheelA;
    if (a < 0.02) return;
    const w = this.wheel();
    const st = this.stick;
    const f = this.frog;
    const busy = f.dunkT > 0 || f.hop > 0;
    ctx.save();
    ctx.globalAlpha = a * (busy ? 0.55 : 1);
    ctx.translate(w.x, w.y);
    ctx.scale(0.7 + 0.3 * a, 0.7 + 0.3 * a);
    // inviting pulse until it's first used
    if (!st && !this.game.save.tips.swim) {
      const k = frac(this.time * 1.2);
      ctx.save();
      ctx.globalAlpha *= (1 - k) * 0.8;
      ellipse(ctx, 0, 0, w.r + k * 30, w.r + k * 30);
      ctx.strokeStyle = P.gold;
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.restore();
    }
    ellipse(ctx, 0, 0, w.r, w.r);
    ctx.fillStyle = 'rgba(246,238,220,0.6)';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.setLineDash([8, 8]);
    ellipse(ctx, 0, 0, w.r * 0.66, w.r * 0.66);
    ctx.strokeStyle = 'rgba(74,59,48,0.35)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.setLineDash([]);
    // arrows at the four points, the one being pushed toward lit up
    for (let i = 0; i < 4; i++) {
      const ang = (i * Math.PI) / 2;
      const ux = Math.cos(ang), uy = Math.sin(ang);
      const lit = st && st.x * ux + st.y * uy > 0.5;
      ctx.save();
      ctx.rotate(ang);
      ctx.translate(w.r * 0.84, 0);
      ctx.beginPath();
      ctx.moveTo(9, 0);
      ctx.lineTo(-6, -10);
      ctx.lineTo(-6, 10);
      ctx.closePath();
      ctx.fillStyle = lit ? P.orange : 'rgba(74,59,48,0.45)';
      ctx.fill();
      ctx.restore();
    }
    const kx = (st ? st.x : 0) * w.r * 0.58, ky = (st ? st.y : 0) * w.r * 0.58;
    ellipse(ctx, kx + 2, ky + 5, 38, 38);
    ctx.fillStyle = 'rgba(36,28,22,0.25)';
    ctx.fill();
    ellipse(ctx, kx, ky, 38, 38);
    ctx.fillStyle = busy ? P.silver : P.orange;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.stroke();
    ellipse(ctx, kx - 11, ky - 12, 11, 8);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fill();
    ctx.restore();
  }

  /** Speed lines down the river while the convoy is rushing to catch up with the frog. */
  private drawStreaks(ctx: Ctx, k: number) {
    const H = this.H;
    const { riverL, riverR } = TUNING;
    ctx.save();
    ctx.strokeStyle = P.white;
    ctx.lineCap = 'round';
    ctx.lineWidth = 4;
    for (let i = 0; i < 16; i++) {
      const x = riverL + 30 + frac(i * 0.618 + 0.13) * (riverR - riverL - 60);
      const y = ((this.time * (700 + 300 * frac(i * 0.37)) + i * 211) % (H + 240)) - 120;
      ctx.globalAlpha = k * 0.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + 70 + 50 * k);
      ctx.stroke();
    }
    ctx.restore();
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
      drawHouse(ctx, sp, h, x, y + dy, this.time);
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

  /** What a resident sees of the game: the frog, and the parcels on their way (see resident.ts). */
  private residentView(h: House): ResidentView {
    const f = this.frog;
    let pending = 0, theirs = false;
    for (const o of this.lv.orders) {
      if (o.house !== h) continue;
      if (o.state === 'pool' || o.state === 'bag' || o.state === 'float') pending++;
      if (o.state === 'bag') theirs = true;
    }
    return {
      screenY: this.sy(h.plat.y), H: this.H, pending, theirs,
      frogOn: f.state === 'stand' && f.on === h.plat, frogX: f.x, frogY: f.y,
      paying: this.cod?.h === h, riverMid: (TUNING.riverL + TUNING.riverR) / 2,
    };
  }

  /** The standing frog's pose when it isn't winding up or handing something over. */
  private standPose(): string {
    const f = this.frog;
    const c = this.frogCue;
    if (c && this.time >= c.from && this.time < c.until) return c.pose;
    const p = f.on;
    // came down near the rim of a lily pad: arms going round to keep its balance
    if (p?.kind === 'lily' && f.landT < 0.8 && Math.hypot((f.x - p.x) / p.rx, (f.y - p.y) / p.ry) > 0.72) return 'frog_wobble';
    if (this.bag.length && this.slotsUsed() >= this.cfg.bagSlots) return 'frog_heavy';
    // left standing a while: looks up the river now and then, and yawns
    const idle = Math.min(f.landT, this.time - this.lastInput) - 5;
    if (idle > 0) {
      const k = idle % 10;
      if (k < 1.8) return 'frog_yawn';
      if (k > 5 && k < 7) return 'frog_look';
    }
    return 'frog_stand';
  }

  private drawTruck(ctx: Ctx, t: Plat) {
    const sp = this.game.sprites;
    // honking makes the whole truck jitter
    const honk = this.honkT > 0 ? Math.sin(this.time * 70) * 3 * (this.honkT / 0.5) : 0;
    const x = t.x + honk, y = this.sy(t.y) + Math.sin(this.time * 13) * 0.8;
    drawTruckBase(ctx, x, y, -this.camY);
    sp.draw(ctx, 'truck_blue', x, y);
    text(ctx, '蛙趣', x, y + 173 * K + 0.5, 11, { bold: true });
    // cargo = the shared pool of parcels still waiting
    const pool = this.lv.orders.filter((o) => o.state === 'pool' && !o.house.passed).slice(0, 5);
    // stacked on the inner half of the bed, the half that's on screen
    const slots: [number, number][] = [[20, 74], [62, 80], [30, 106], [66, 140], [24, 156]];
    const dir = -1;
    const drawn = pool.map((o, i) => ({ o, s: slots[i] })).sort((a, b) => a.s[1] - b.s[1]);
    for (const { o, s } of drawn) sp.draw(ctx, boxSprite(o.size, o.urgent, o.cod), x + dir * s[0] * K, y + s[1] * K);
    if (this.honkT > 0) {
      const k = 1 - this.honkT / 0.5;
      const bx = t.x + dir * 70, by = this.sy(t.y) - 150 - k * 14;
      ctx.save();
      ctx.globalAlpha = Math.min(1, (1 - k) * 3);
      panel(ctx, bx - 58, by - 26, 116, 52, { r: 26, fill: P.gold, shadow: false });
      text(ctx, '嘀嘀！', bx, by + 1, 28, { bold: true });
      ctx.restore();
    } else if (this.speedK > 1.3 && !this.off) {
      const bx = t.x + dir * 70, by = this.sy(t.y) - 150 + Math.sin(this.time * 20) * 2;
      ctx.save();
      ctx.globalAlpha = clamp((this.speedK - 1.3) * 3, 0, 1);
      panel(ctx, bx - 58, by - 26, 116, 52, { r: 26, fill: P.orange, shadow: false });
      text(ctx, '加速！', bx, by + 1, 28, { bold: true, color: P.white });
      ctx.restore();
    }
  }

  /** The driver's shout: a bubble out of the cab window, kept on screen. */
  private drawDriver(ctx: Ctx) {
    const d = this.driver;
    if (!d) return;
    const t = this.lv.truck;
    const pop = easeOutBack(Math.min(1, d.t / 0.2));
    const a = d.t > d.dur - 0.3 ? (d.dur - d.t) / 0.3 : 1;
    ctx.save();
    ctx.font = font(30, true);
    const w = ctx.measureText(d.text).width + 44;
    const cx = t.x - 60, cy = this.sy(t.y) - 120;
    const bx = clamp(cx - w / 2 - 30, w / 2 + 12, 738 - w / 2), by = Math.max(this.game.safeT + 130, cy - 110);
    ctx.globalAlpha = Math.max(0, a);
    ctx.translate(bx, by);
    ctx.scale(pop, pop);
    // tail toward the cab
    ctx.beginPath();
    ctx.moveTo(w / 2 - 70, 20);
    ctx.lineTo(cx - bx, cy - by);
    ctx.lineTo(w / 2 - 30, 20);
    ctx.closePath();
    ctx.fillStyle = P.white;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    panel(ctx, -w / 2, -30, w, 60, { r: 26, fill: P.white, shadow: false });
    text(ctx, d.text, 0, 1, 30, { bold: true });
    // who's talking
    panel(ctx, -w / 2 - 6, -54, 76, 32, { r: 16, fill: P.blue, shadow: false });
    text(ctx, '司机', -w / 2 + 32, -37, 20, { bold: true, color: P.white });
    ctx.restore();
  }

  private drawFrog(ctx: Ctx) {
    const sp = this.game.sprites;
    const f = this.frog;
    const x = f.x, gy = this.sy(f.y);
    if (f.state === 'swim') {
      // just gone under: spluttering, spinning a little, bubbles coming up
      const dunk = f.dunkT > 0 ? f.dunkT / TUNING.dunkSec : 0;
      if (dunk > 0) {
        ctx.save();
        ctx.strokeStyle = P.white;
        ctx.lineWidth = 2.5;
        for (let i = 0; i < 4; i++) {
          const bk = frac(this.time * 1.8 + i * 0.27);
          ctx.globalAlpha = (1 - bk) * Math.min(1, dunk * 2);
          ellipse(ctx, x - 24 + i * 16 + Math.sin(this.time * 6 + i) * 4, gy - 30 - bk * 60, 5 + i * 1.5, 5 + i * 1.5);
          ctx.stroke();
        }
        ctx.restore();
      }
      // each kick shoots the frog forward: legs out straight, a stretch, and a wake behind it
      const stroke = f.strokeT < 0.3 ? 1 - f.strokeT / 0.3 : 0;
      const bob = Math.sin(this.time * 7) * 2 - stroke * 5 + dunk * 12;
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
      if (f.hop > 0) {
        // a miss on the gauge: up out of the water and straight back down
        const hz = Math.sin((1 - f.hop / HOP_T) * Math.PI) * 46;
        sp.draw(ctx, 'frog_jump', x, gy + 4 - hz, FROG_S * 0.95, FROG_S * 0.95, Math.sin(this.time * 20) * 0.08);
        return;
      }
      // leaning the way it's kicking, or toward a parcel being licked up
      const lean = this.tongue ? f.giveDir * 0.15 : clamp(f.kx * 0.5, -0.5, 0.5) * Math.min(1, v / 120);
      const flail = Math.sin(this.time * 18) * 0.35 * dunk;
      const name = dunk > 0 ? 'frog_dunk' : stroke > 0.45 ? this.pose('frog_kick', 'frog_swim') : 'frog_swim';
      sp.draw(ctx, name, x, gy + 4 + bob, FROG_S * (1 - stroke * 0.06), FROG_S * (1 + stroke * 0.14 - dunk * 0.15), lean + flail + Math.sin(this.time * 9) * 0.05 * (1 - stroke));
      return;
    }
    const b = f.board;
    // shadow stays on the surface below
    const onWood = f.state === 'stand' && f.on && (f.on.kind === 'house' || f.on.kind === 'truck' || f.on.kind === 'log');
    const sink = f.state === 'stand' ? this.padSink(f.on) : 0;
    const shrink = 1 - Math.min(0.5, f.z / 300);
    const wet = !!b && b.wet && !b.flying;
    ctx.save();
    if (wet) {
      ellipse(ctx, x, gy + 6, 56, 16);
      ctx.strokeStyle = 'rgba(251,247,238,0.7)';
      ctx.lineWidth = 3;
      ctx.stroke();
    } else {
      ctx.globalAlpha = 0.42 * shrink;
      ellipse(ctx, x + 5 + f.z * 0.08, gy + 3 + sink, 40 * shrink, 11 * shrink);
      ctx.fillStyle = f.state === 'jump' ? P.tealDeep : b || f.on?.kind === 'bank' ? P.roadDeep : onWood ? P.woodDeep : P.lilyDeep;
      ctx.fill();
    }
    ctx.restore();

    let sx = 1, sy = 1, rot = 0, ox = 0, flip = false;
    let name = this.off ? 'frog_happy' : this.smogT > 0 ? 'frog_nervous' : 'frog_stand';
    const power = this.aimPower();
    if (f.state === 'stand') {
      sy *= 1 + Math.sin(this.time * 3) * 0.015;
      if (!this.off && this.smogT <= 0) name = this.standPose();
      if (name === 'frog_wobble') rot += Math.sin(this.time * 12) * 0.09 * (1 - f.landT / 0.8);
      if (this.aim && power > 0.05) {
        name = 'frog_crouch';
        sy *= 1 - 0.13 * power;
        sx *= 1 + 0.06 * power;
        const [ux] = this.aimDir();
        rot = clamp(ux * 0.2 * power, -0.2, 0.2);
        // fully wound up: a little tremble; held too long, the legs start to shake hard
        if (power >= 0.99) ox = Math.sin(this.time * 70) * 1.6;
        const ache = this.aim.t > FOOT_WARN ? (this.aim.t - FOOT_WARN) / (FOOT_T - FOOT_WARN) : 0;
        if (ache > 0) {
          ox += Math.sin(this.time * 90) * (1.5 + ache * 3);
          name = 'frog_tired';
        }
      }
      if (f.landT < 0.36) {
        // harder landings squash further
        const k = springOut(f.landT / 0.36, 2);
        sy *= 1 - (0.08 + 0.16 * f.impact) * k;
        sx *= 1 + (0.05 + 0.1 * f.impact) * k;
        if (f.impact > 0.6 && f.landT < 0.22 && !this.aim) name = 'frog_land';
      }
      if (f.give > 0 || this.tongue) {
        // leaning in to hand a parcel over, or to lick one out of the water
        const lean = this.tongue ? 1 : Math.sin(f.give * Math.PI);
        rot += f.giveDir * 0.2 * lean;
        ox += f.giveDir * 8 * lean;
        if (this.tongue) {
          // the licking pose looks up and to the right: turn it toward the parcel
          name = 'frog_lick';
          flip = f.giveDir < 0;
        } else if (f.give > 0.15) {
          // handing over: the painted pose holds its arms out to the right
          name = 'frog_give';
          flip = f.giveDir < 0;
        }
      }
    } else if (b && !b.yank) {
      // the hop onto the bed is a flip
      const k = clamp(b.t / BOARD_LEAP_T, 0, 1);
      name = f.z > 10 ? 'frog_jump' : 'frog_crouch';
      rot = Math.PI * 2 * easeOutCubic(k);
    } else if (b && !b.caught) {
      // the lasso coming: a look up, then the shock of seeing it
      if (b.t > LASSO_T * 0.35) name = 'frog_shock';
      else if (b.wet) name = 'frog_swim';
    } else if (b && !b.flying) {
      // at the end of the rope: leaning back, heels dug in, flailing
      name = this.pose('frog_dragged', 'frog_nervous');
      rot = -0.3 + Math.sin(this.time * 30) * 0.07;
      ox = Math.sin(this.time * 55) * 3;
    } else if (b) {
      // reeled in through the air, two panicked spins, a blur of afterimages behind
      const k = clamp((b.t - LASSO_T - TUG_T) / YANK_T, 0, 1);
      name = this.pose('frog_flung', 'frog_shock');
      rot = Math.PI * 4 * k;
      ctx.save();
      for (let i = 2; i < b.trail.length; i += 2) {
        const tr = b.trail[i];
        ctx.globalAlpha = 0.22 * (1 - i / b.trail.length);
        ctx.translate(tr.x, tr.y - 50);
        ctx.rotate(tr.rot);
        sp.draw(ctx, name, 0, 50, FROG_S, FROG_S);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      }
      ctx.restore();
    } else if (f.jump) {
      const k = f.jump.t / f.jump.T;
      name = f.z > 8 ? 'frog_jump' : 'frog_crouch';
      if (k < 0.3) {
        sy *= 1.18 - (k / 0.3) * 0.18;
        sx *= 0.9 + (k / 0.3) * 0.1;
      }
      rot = ((f.jump.x1 - f.jump.x0) / Math.max(1, f.jump.dist)) * 0.22;
      // booted off the truck: tumbling backwards, all arms and legs
      if (f.jump.spin) {
        name = this.pose('frog_flung', 'frog_shock');
        rot = -Math.PI * 2 * easeOutCubic(Math.min(1, k));
      }
    }
    if (this.dizzyT > 0 && f.state === 'stand') {
      // landed hard at the end of the rope: wobbling, seeing stars
      name = this.pose('frog_dizzy', 'frog_nervous');
      rot += Math.sin(this.time * 7) * 0.12 * (this.dizzyT / DIZZY_T);
    }
    const y = gy - f.z + sink + (wet ? 6 : 0);
    ctx.save();
    // flips turn about the frog's middle rather than its feet
    const mid = b || f.jump?.spin ? 50 : 0;
    ctx.translate(x + ox, y - mid);
    ctx.rotate(rot);
    if (flip) ctx.scale(-1, 1);
    ctx.translate(0, mid);
    sp.draw(ctx, name, 0, 0, FROG_S * sx, FROG_S * sy);
    // satchel hangs from the strap and swings with the jumps
    const w = this.weight();
    const size = w <= 1 ? 0 : w <= 3 ? 1 : 2;
    const sxp = 30 * K * FROG_S * sx, syp = -40 * K * FROG_S * sy;
    sp.draw(ctx, `satchel${size}`, sxp, syp, FROG_S * (this.bag.length ? 1 : 0.9), FROG_S, clamp(f.swing * 0.1, -0.5, 0.5));
    ctx.restore();
  }

  /**
   * A parcel adrift, bobbing. Its ring says whether the tongue reaches it (green), not yet (dashed),
   * or it's about to be swept off the bottom of the screen (red).
   */
  private drawFloater(ctx: Ctx, fl: Floater) {
    const sp = this.game.sprites;
    const x = fl.x, y = this.sy(fl.y);
    const bob = Math.sin(this.time * 4 + fl.spin) * 3;
    const reeled = this.tongue?.fl === fl && this.tongue.t >= TONGUE_OUT;
    if (reeled) {
      const [tx, ty] = this.tongueTip()!;
      sp.draw(ctx, boxSprite(fl.o.size, fl.o.urgent, fl.o.cod), tx, this.sy(ty) + 24, 0.8, 0.8, Math.sin(this.time * 20) * 0.2);
      return;
    }
    const reach = this.inReach(fl);
    const low = y > this.H * TUNING.warnLine;
    ctx.save();
    ellipse(ctx, x, y + 4, 46, 18);
    ctx.fillStyle = 'rgba(63,94,120,0.22)';
    ctx.fill();
    ellipse(ctx, x, y + 4, 52, 22);
    ctx.lineWidth = 4;
    if (low) {
      ctx.strokeStyle = P.red;
      ctx.globalAlpha = 0.6 + Math.sin(this.time * 12) * 0.4;
    } else if (reach) ctx.strokeStyle = P.lily;
    else {
      ctx.strokeStyle = P.white;
      ctx.setLineDash([10, 8]);
      ctx.lineDashOffset = -this.time * 20;
    }
    ctx.stroke();
    ctx.restore();
    sp.draw(ctx, boxSprite(fl.o.size, fl.o.urgent, fl.o.cod), x, y + 8 + bob, 0.82, 0.82, Math.sin(this.time * 2 + fl.spin) * 0.2);
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
    this.drawDunks(ctx, x - 40, y - 46 + bob, fl.o.dunks);
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

  /**
   * The truck's lasso: thrown in an arc from the cab with the loop spinning, then pulled tight round
   * the frog's middle and trembling while it struggles, then reeling it in.
   */
  private drawRope(ctx: Ctx, t: Plat) {
    const f = this.frog;
    const b = f.board!;
    const ax = t.x - 30, ay = this.sy(t.y) - 70;
    // the frog's middle: lower in the water, and the turning point of the spins in flight
    const fx = f.x, fy = this.sy(f.y) - f.z - (b.wet && !b.flying ? 18 : b.flying ? 50 : 36);
    const rope = (draw: () => void, w = 4) => {
      ctx.lineWidth = w + 3;
      ctx.strokeStyle = INK;
      draw();
      ctx.stroke();
      ctx.lineWidth = w;
      ctx.strokeStyle = P.woodLight;
      draw();
      ctx.stroke();
    };
    ctx.save();
    ctx.lineCap = 'round';
    if (!b.caught) {
      // in flight: the loop arcs up from the cab and drops over the frog's head
      const k = easeOutCubic(clamp(b.t / LASSO_T, 0, 1));
      const cx = (ax + fx) / 2, cy = Math.min(ay, fy) - 170;
      const q = (p0: number, p1: number, p2: number) => (1 - k) * (1 - k) * p0 + 2 * (1 - k) * k * p1 + k * k * p2;
      const lx = q(ax, cx, fx), ly = q(ay, cy, fy - 46 + 46 * k * k);
      rope(() => {
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.quadraticCurveTo((ax + lx) / 2, (ay + ly) / 2 + 50, lx, ly);
      });
      // the loop, spinning flat over the water
      const spin = Math.abs(Math.cos(this.time * 16));
      rope(() => ellipse(ctx, lx, ly, 18 + 18 * spin, 9 + 3 * k));
    } else {
      // pulled tight, trembling while the frog digs its heels in
      const shake = b.flying ? 0 : Math.sin(this.time * 70) * 3;
      const mx = (ax + fx) / 2, my = (ay + fy) / 2;
      const l = Math.hypot(fx - ax, fy - ay) || 1;
      rope(() => {
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.quadraticCurveTo(mx + ((fy - ay) / l) * shake, my - ((fx - ax) / l) * shake, fx, fy);
      });
      rope(() => ellipse(ctx, fx, fy, 30, 10), 3.5);
    }
    // the reel on the cab
    ellipse(ctx, ax, ay, 9, 9);
    ctx.fillStyle = P.woodDeep;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.restore();
  }

  /** Stars circling the frog's head after a hard landing at the end of the rope. */
  private drawDizzy(ctx: Ctx) {
    const f = this.frog;
    if (this.dizzyT <= 0 || f.state !== 'stand') return;
    const a = Math.min(1, this.dizzyT / 0.4);
    const cx = f.x, cy = this.sy(f.y) + this.padSink(f.on) - 118;
    ctx.save();
    ctx.globalAlpha = a;
    for (let i = 0; i < 3; i++) {
      const ang = this.time * 5 + (i * Math.PI * 2) / 3;
      const x = cx + Math.cos(ang) * 40, y = cy + Math.sin(ang) * 12;
      const r = 11 + Math.sin(ang) * 2;
      ctx.beginPath();
      for (let j = 0; j < 10; j++) {
        const rr = j % 2 ? r * 0.45 : r;
        const t = -Math.PI / 2 + (j * Math.PI) / 5;
        if (j === 0) ctx.moveTo(x + Math.cos(t) * rr, y + Math.sin(t) * rr);
        else ctx.lineTo(x + Math.cos(t) * rr, y + Math.sin(t) * rr);
      }
      ctx.closePath();
      ctx.fillStyle = P.gold;
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();
  }

  /** The lost letter: an envelope with a red seal, glinting now and then. */
  private drawEgg(ctx: Ctx, x: number, y: number) {
    const sp = this.game.sprites;
    const bob = Math.sin(this.time * 3) * 2;
    ctx.save();
    ctx.translate(x, y + bob);
    ctx.rotate(-0.15);
    ctx.globalAlpha = 0.35;
    ellipse(ctx, 2, 18, 30, 7);
    ctx.fillStyle = P.roadDeep;
    ctx.fill();
    ctx.globalAlpha = 1;
    if (sp.has('letter')) sp.draw(ctx, 'letter', 0, 0);
    else this.drawEnvelope(ctx);
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

  /** The code-drawn envelope, for when there's no painted letter. */
  private drawEnvelope(ctx: Ctx) {
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
        sp.draw(ctx, boxSprite(e.size ?? 0, e.urgent, e.cod), x, fy + bob, 0.9, 0.9, Math.sin(e.t * 2 + x) * 0.2, k > 0.7 ? (1 - k) / 0.3 : 1);
        break;
      }
      case 'washed': {
        // swept off downstream, tumbling, going under
        const sd = e.seed ?? 0;
        const wx = x + Math.sin(e.t * 5 + sd) * 16, wy = y + e.t * 240 + e.t * e.t * 60;
        sp.draw(ctx, boxSprite(e.size ?? 0, e.urgent, e.cod), wx, wy, 0.82, 0.82 * (1 - k * 0.4), e.t * 4 + sd, 1 - k);
        if (k < 0.5) {
          ctx.save();
          ctx.globalAlpha = 1 - k * 2;
          text(ctx, '冲走了！', wx, wy - 80, 28, { bold: true, color: P.red });
          ctx.restore();
        }
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
        sp.draw(ctx, boxSprite(e.size ?? 0, e.urgent, e.cod), x, y + 8 + k * 26, 0.82, 0.82 * (1 - k * 0.7), Math.sin(e.t * 9) * 0.15, (1 - k) * 0.7);
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
        sp.draw(ctx, boxSprite(e.size ?? 0, e.urgent, e.cod), ax, ay + 24, 0.8, 0.8, k * 2 * Math.PI * 0.5);
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
        const pop = easeOutBack(Math.min(1, e.t / 0.18));
        const a = k > 0.75 ? (1 - k) / 0.25 : 1;
        ctx.save();
        ctx.font = font(30, true);
        const w = ctx.measureText(e.label ?? '').width + 36;
        // kept on screen when the frog is near an edge
        const bx = clamp(f.x + 54, w / 2 + 12, 738 - w / 2), by = Math.max(this.game.safeT + 130, this.sy(f.y) - f.z - 128);
        ctx.globalAlpha = a;
        ctx.translate(bx, by);
        ctx.scale(pop, pop);
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
    // held too long: an outer ring runs down to when the legs give out
    if (a.t > FOOT_WARN) {
      const k = clamp((a.t - FOOT_WARN) / (FOOT_T - FOOT_WARN), 0, 1);
      ctx.beginPath();
      ctx.arc(a.sx, a.sy, 54, -Math.PI / 2, -Math.PI / 2 + (1 - k) * Math.PI * 2);
      ctx.strokeStyle = P.red;
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.stroke();
      const f = this.frog;
      text(ctx, '脚快撑不住了！', clamp(f.x, 130, 620), this.sy(f.y) - 170, 30, { bold: true, color: P.red, alpha: 0.6 + Math.sin(this.time * 14) * 0.4 });
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
    pressIn(ctx, this.pauseBtn, this.pressed === 'pause');
    ellipse(ctx, 50, ty + 36, 21, 21);
    ctx.fillStyle = P.cream;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.fillRect(43, ty + 27, 5, 18);
    ctx.fillRect(53, ty + 27, 5, 18);
    pressOut(ctx, this.pressed === 'pause', () => ellipse(ctx, 50, ty + 36, 23, 23));
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

    if (this.callT !== null && !this.off && this.frog.state !== 'board') this.drawCall(ctx);
    // hint bubble
    if (this.hint && !this.paused && (!this.step || this.step === 'go' || this.step === 'refill')) this.drawHint(ctx);
    if (!this.off && !this.ended && this.step !== 'intro') this.drawLifeline(ctx);
    if (this.toast) {
      const a = Math.min(1, this.toast.t * 6) * (this.toast.t > 1.8 ? (2.2 - this.toast.t) / 0.4 : 1);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.font = '26px WK';
      const w = Math.max(220, ctx.measureText(this.toast.text).width + 60);
      const y = this.trayY() - (this.trayMode === 'pickup' ? 350 : this.callT !== null ? 270 : 190);
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
    if (this.trayMode === 'deliver') {
      const first = this.cards[0]?.rect ?? { x: 146, y: cy - 62, w: 108, h: 124 };
      const tw = Math.max(this.cards.length * 118 + 14, 330);
      panel(ctx, first.x - 12, first.y - 52, tw, first.h + 64, { r: 16, fill: '#EFE3C8' });
      text(ctx, `交给 ${this.frog.on!.house!.name}`, first.x + 2, first.y - 26, 24, { align: 'left', bold: true, maxWidth: tw - 30 });
    } else if (this.trayMode === 'pickup') {
      // Two rows that look different: the truck's cargo in the truck's blue, the satchel in kraft.
      const ty = this.truckRowY();
      const n = this.truckCards().length;
      const tw = Math.max(n * 114 + 14, 440);
      panel(ctx, 22, ty - 110, tw, 182, { r: 16, fill: '#DCE7EC', stitch: P.blueLight });
      this.drawCab(ctx, 54, ty - 85);
      text(ctx, n ? '车上的包裹 · 点一下装进背包' : '车上的包裹都送出去了', 88, ty - 84, 24, { align: 'left', bold: true, color: P.blue, maxWidth: tw - 80 });
      panel(ctx, 14, cy - 100, Math.max(this.bag.length * 92 + 140, 430), 162, { r: 16, fill: '#F3E4CB', stitch: P.orange });
      text(ctx, this.bag.length ? '背包里的 · 点一下放回车上' : '背包是空的', 148, cy - 72, 22, { align: 'left', bold: true, color: P.orangeDeep });
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
    // cards on the move go on top, so they're seen crossing over
    const moving = (c: Card) => this.flights.some((f) => f.o === c.order);
    for (const c of this.cards) if (!moving(c)) this.drawCard(ctx, c);
    for (const c of this.cards) if (moving(c)) this.drawCard(ctx, c);
  }

  /** A little side view of the delivery truck, for the cargo row's title. */
  private drawCab(ctx: Ctx, x: number, y: number) {
    ctx.save();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    roundRect(ctx, x - 22, y - 12, 30, 22, 4);
    ctx.fillStyle = P.blue;
    ctx.fill();
    ctx.stroke();
    roundRect(ctx, x + 8, y - 6, 16, 16, 4);
    ctx.fillStyle = P.blueLight;
    ctx.fill();
    ctx.stroke();
    for (const wx of [-12, 14]) {
      ellipse(ctx, x + wx, y + 12, 5, 5);
      ctx.fillStyle = '#5B4A3D';
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawCard(ctx: Ctx, c: Card) {
    const sp = this.game.sprites;
    const o = c.order;
    let { x, y, w, h } = c.rect;
    // sliding over from the other row: a hop up, and a shadow left on the tray
    const fl = this.flights.find((f) => f.o === o);
    if (fl) {
      const u = Math.min(1, fl.t / FLY_T);
      const k = u * u * (3 - 2 * u);
      x = lerp(fl.from.x, x, k);
      y = lerp(fl.from.y, y, k);
      w = lerp(fl.from.w, w, k);
      h = lerp(fl.from.h, h, k);
      const lift = Math.sin(k * Math.PI) * 60;
      ctx.save();
      ctx.globalAlpha = 0.25;
      roundRect(ctx, x + 6, y + 8, w, h, 12);
      ctx.fillStyle = INK;
      ctx.fill();
      ctx.restore();
      y -= lift;
    }
    if (this.shakeCard && this.shakeCard.id === o.id) x += Math.sin(this.shakeCard.t * 50) * 6 * (1 - this.shakeCard.t / 0.4);
    const spot = (this.step === 'pick' && c.where === 'truck') || (this.step === 'deliver' && this.trayMode === 'deliver');
    const down = this.pressed === `card${o.id}`;
    const pulse = down ? 0.92 : spot ? 1 + Math.sin(this.time * 6) * 0.03 : fl ? 1.06 : 1;
    ctx.save();
    if (pulse !== 1) {
      ctx.translate(x + w / 2, y + h / 2);
      ctx.scale(pulse, pulse);
      ctx.translate(-(x + w / 2), -(y + h / 2));
    }
    const full = this.trayMode === 'pickup' && c.where === 'truck' && this.slotsUsed() + SIZE_INFO[o.size].slots > this.cfg.bagSlots;
    if (full) ctx.globalAlpha = 0.55;
    panel(ctx, x, y, w, h, { r: 12, fill: c.where === 'truck' ? '#F7FAFB' : P.paper, stitch: c.where === 'truck' ? P.blueLight : undefined });
    const k = h / 124;
    sp.draw(ctx, `avatar_${o.house.species}`, x + w * 0.32, y + 34 * k, 0.86 * k);
    codeTag(ctx, x + w * 0.76, y + 30 * k, o.code, o.house.color, 1.05 * k);
    sp.draw(ctx, boxSprite(o.size, o.urgent, o.cod), x + w / 2, y + h - 10 * k, (o.size === 0 ? 1.15 : o.size === 1 ? 1 : 0.9) * k);
    if (o.urgent || o.cod) {
      const label = o.urgent ? '急' : `到付¥${o.cod!.price}`;
      ctx.font = font(18 * k, true);
      const bw = ctx.measureText(label).width + 12 * k;
      roundRect(ctx, x - 6, y + h * 0.5 - 12 * k, bw, 24 * k, 6);
      ctx.fillStyle = o.urgent ? P.red : P.gold;
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.8;
      ctx.stroke();
      text(ctx, label, x - 6 + bw / 2, y + h * 0.5 + 1, 18 * k, { color: o.urgent ? P.white : INK, bold: true });
    }
    if (o.dunks) this.drawDunks(ctx, x + 8 * k, y + h - 16 * k, o.dunks, k);
    if (down) {
      roundRect(ctx, x, y, w, h, 12);
      ctx.fillStyle = 'rgba(36,28,22,0.22)';
      ctx.fill();
    }
    ctx.restore();
  }

  /** Water drops for each time a parcel has been in the river, out of the three it can take. */
  private drawDunks(ctx: Ctx, x: number, y: number, n: number, k = 1) {
    ctx.save();
    for (let i = 0; i < DUNK_MAX - 1; i++) {
      const dx = x + i * 14 * k, r = 6 * k;
      ctx.beginPath();
      ctx.moveTo(dx, y - r * 1.6);
      ctx.quadraticCurveTo(dx + r, y - r * 0.2, dx, y + r * 0.8);
      ctx.quadraticCurveTo(dx - r, y - r * 0.2, dx, y - r * 1.6);
      ctx.fillStyle = i < n ? P.blue : 'rgba(251,247,238,0.8)';
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
    ctx.restore();
  }

  /** A small tag under the top bar: whether today's lifeline is still there. */
  private drawLifeline(ctx: Ctx) {
    const left = this.ropeUsed ? 0 : 1;
    const x = 20, y = this.game.safeT + 88, w = 168, h = 36;
    ctx.save();
    ctx.globalAlpha *= left ? 0.95 : 0.55;
    roundRect(ctx, x, y, w, h, 18);
    ctx.fillStyle = left ? P.cream : P.paperShade;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = left ? P.orangeDeep : P.inkSoft;
    ctx.stroke();
    // a coil of rope
    ctx.beginPath();
    ctx.arc(x + 20, y + h / 2, 9, 0, Math.PI * 2);
    ctx.arc(x + 20, y + h / 2, 4, 0, Math.PI * 2);
    ctx.strokeStyle = left ? P.orangeDeep : P.inkSoft;
    ctx.stroke();
    text(ctx, left ? '救命绳 ×1' : '救命绳已用', x + 100, y + h / 2 + 1, 22, { bold: true, color: left ? INK : P.inkSoft });
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
    let size = 42;
    const lw = richWidth(ctx, line, size, true);
    if (lw > 640) size = Math.floor((size * 640) / lw);
    ctx.font = font(28);
    const sw = sub ? ctx.measureText(sub).width : 0;
    const w = clamp(Math.max(richWidth(ctx, line, size, true), sw) + 80, 380, 710);
    const h = sub ? 136 : 92;
    panel(ctx, 375 - w / 2, y, w, h, { r: 22, fill: warn ? '#FBE6DE' : P.paper, stitch: warn ? P.red : P.gold });
    rich(ctx, line, 375, y + 47, size, { bold: true, color: warn ? P.red : INK, hl: warn ? P.red : P.orangeDeep });
    if (sub) text(ctx, sub, 375, y + 102, 28, { color: warn ? P.red : P.inkSoft, maxWidth: w - 40 });
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
    let hand: { kind: 'tap' | 'drag' | 'stick'; x: number; y: number } | null = null;
    if (this.step === 'pick' || this.step === 'deliver') {
      const cards = this.step === 'pick' ? this.truckCards() : this.cards;
      if (!cards.length || this.trayMode === 'bag') return;
      const c = (this.step === 'deliver' && cards.find((c) => c.order.house === f.on?.house)) || cards[0];
      const first = cards[0].rect, last = cards[cards.length - 1].rect;
      holes.push({ x: first.x - 16, y: first.y - 56, w: Math.max(last.x + last.w - first.x + 32, 340), h: first.h + 72, round: false });
      line = segs(this.step === 'pick' ? (this.refilled ? '再点【包裹】，装进背包' : '点一下【包裹】，装进背包') : '点【包裹】，交给住户');
      sub = this.step === 'pick' ? (this.refilled ? `背包有 ${this.cfg.bagSlots} 格，一次多拿几个，顺路一起送` : '卡片上的数字是取件码，房子上挂着同样的码') : '取件码和颜色要对得上';
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
      sub = `松手就往反方向跳，拉得越长跳得越远；按住超过 ${FOOT_T} 秒脚会累`;
      capY = this.game.safeT + 100;
      if (!this.aim) hand = { kind: 'drag', x: zx, y: zy };
    } else if (this.step === 'rescue') {
      // first time in the water: the wheel, and (with parcels adrift) the tongue's reach
      const w = this.wheel();
      holes.push({ x: w.x - w.r - 24, y: w.y - w.r - 24, w: (w.r + 24) * 2, h: (w.r + 24) * 2, round: true });
      const fy = this.sy(f.y);
      if (this.floaters.length) {
        const R = TUNING.tongueR + 16;
        holes.push({ x: f.x - R, y: fy - R * 0.82, w: R * 2, h: R * 1.64, round: true });
        for (const fl of this.floaters) {
          if (!this.inReach(fl)) holes.push({ x: fl.x - 66, y: this.sy(fl.y) - 80, w: 132, h: 130, round: true });
        }
        line = segs('包裹掉水里了！按住【轮盘】游过去');
        sub = '包裹漂进虚线圈，舌头会自动卷回来；重的包裹漂得慢';
      } else {
        holes.push({ x: f.x - 80, y: fy - 80, w: 160, h: 120, round: true });
        line = segs('掉水里了！按住【轮盘】游动');
        sub = '游近荷叶或岸边会出现指针，指到绿色时点一下';
      }
      capY = fy < H * 0.45 ? H * 0.52 : this.game.safeT + 100;
      hand = { kind: 'stick', x: w.x, y: w.y };
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

  private drawHand(ctx: Ctx, kind: 'tap' | 'drag' | 'stick', x: number, y: number) {
    const sp = this.game.sprites;
    ctx.save();
    if (kind === 'stick') {
      // press the wheel and push the knob round
      const cyc = (this.time % 2.4) / 2.4;
      const ang = -Math.PI / 2 - Math.PI / 4 + Math.sin(cyc * Math.PI * 2) * 0.9;
      const r = cyc < 0.1 ? (cyc / 0.1) * 50 : 50;
      sp.draw(ctx, 'hand', x + Math.cos(ang) * r, y + 14 + Math.sin(ang) * r, 1.1);
    } else if (kind === 'tap') {
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
    const ch = 150 + b.rows.length * rowH + 196;
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
      else if (icon === 'cod') {
        ctx.save();
        ctx.translate(128, ry);
        ctx.scale(0.42, 0.42);
        this.drawBill(ctx, 0, 0, this.cfg.codNote);
        ctx.restore();
      } else {
        const [dx, dy, sc] = ICONS[icon] ?? [0, 0, 0.6];
        sp.draw(ctx, icon, 128 + dx, ry + dy, sc);
      }
      rich(ctx, segs(line), 196, ry, 34, { left: true });
    });
    // the day's third stamp, so it's known before setting off
    const cy = y0 + ch - 150;
    roundRect(ctx, 90, cy - 24, 570, 48, 24);
    ctx.fillStyle = '#F3E4CB';
    ctx.fill();
    drawStamp(ctx, 122, cy, 17, false, 3);
    rich(ctx, segs(`今日挑战：【${this.cfg.challenge.label}】`), 150, cy + 1, 26, { left: true });
    this.introBtn = { x: 215, y: y0 + ch - 116, w: 320, h: 88 };
    button(ctx, 215, y0 + ch - 116, 320, 88, this.cfg.tutorial ? '开始上班' : '开工！', { primary: true, pressed: this.pressed === 'intro', size: 36 });
    ctx.restore();
  }

  /** The change-making card: who paid with what, and three amounts of change to pick from. */
  private drawCod(ctx: Ctx) {
    const c = this.cod!;
    if (c.t < 0) return;
    const sp = this.game.sprites;
    const { price, paid } = c.o.cod!;
    const right = paid - price;
    const H = this.H;
    const w = 640, h = 560, x0 = 55, y0 = H * 0.42 - h / 2;
    ctx.save();
    ctx.globalAlpha = Math.min(1, c.t * 5);
    ctx.fillStyle = 'rgba(36,28,22,0.5)';
    ctx.fillRect(0, 0, 750, H);
    const s = 0.9 + 0.1 * easeOutBack(Math.min(1, c.t * 3));
    ctx.translate(375, y0 + h / 2);
    ctx.scale(s, s);
    ctx.translate(-375, -(y0 + h / 2));
    panel(ctx, x0, y0, w, h, { r: 26 });
    text(ctx, '到付件 · 收款找零', 375, y0 + 58, 40, { bold: true });
    sp.draw(ctx, `avatar_${c.h.species}`, x0 + 92, y0 + 150, 1.15);
    text(ctx, `${c.h.name}付了`, x0 + 150, y0 + 150, 30, { align: 'left' });
    this.drawBill(ctx, x0 + 420, y0 + 150, paid);
    rich(ctx, segs(`货款【¥${price}】，要找回多少？`), 375, y0 + 238, 34, { bold: true });
    if (this.cfg.tutorial && c.pick === null) text(ctx, '找零 = 付的钱 − 货款', 375, y0 + 284, 24, { color: P.inkSoft });
    c.btns = c.opts.map((v, i) => {
      const r = { x: x0 + 34 + i * 194, y: y0 + 318, w: 178, h: 132 };
      const chosen = c.pick === i, isRight = v === right;
      const done = c.pick !== null;
      const fill = done && isRight ? '#DDEFD0' : done && chosen ? '#FBE0DA' : P.cream;
      const down = this.pressed === `chg${i}`;
      pressIn(ctx, r, down);
      panel(ctx, r.x, r.y, r.w, r.h, { r: 18, fill, stitch: done && isRight ? P.lilyDeep : done && chosen ? P.red : undefined });
      // a little stack of coins beside the amount
      for (let j = 0; j < Math.min(v, 6); j++) sp.draw(ctx, 'coin', r.x + 48, r.y + 96 - j * 10, 0.85, 0.6);
      text(ctx, `¥${v}`, r.x + 120, r.y + r.h / 2 + 2, 46, { bold: true, color: done && isRight ? P.lilyDeep : done && chosen ? P.red : INK });
      pressOut(ctx, down, () => roundRect(ctx, r.x, r.y, r.w, r.h, 18));
      return r;
    });
    if (c.pick !== null) {
      const ok = c.opts[c.pick] === right;
      const line = ok ? `找对了！${c.h.name}给了小费 +${TUNING.codTip}` : `应该找 ¥${right}（${paid} − ${price}），扣 ${TUNING.codPenalty} 元`;
      text(ctx, line, 375, y0 + 504, 28, { bold: true, color: ok ? P.lilyDeep : P.red, maxWidth: w - 40 });
    } else text(ctx, '点一下要找回的钱', 375, y0 + 504, 26, { color: P.inkSoft });
    ctx.restore();
  }

  /** A banknote: green paper, a frog-head watermark and the amount. */
  private drawBill(ctx: Ctx, x: number, y: number, v: number) {
    const sp = this.game.sprites;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.06);
    if (sp.has('bill')) {
      sp.draw(ctx, 'bill', 0, 0);
      text(ctx, `¥${v}`, 30, 2, 40, { bold: true, color: P.lilyDeep });
      ctx.restore();
      return;
    }
    roundRect(ctx, -86, -44, 172, 88, 8);
    ctx.fillStyle = '#B9D7A6';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.2;
    ctx.stroke();
    roundRect(ctx, -76, -34, 152, 68, 5);
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = P.lilyDeep;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.setLineDash([]);
    ellipse(ctx, -40, 0, 22, 18);
    ctx.fillStyle = '#9FC78A';
    ctx.fill();
    ctx.strokeStyle = P.lilyDeep;
    ctx.stroke();
    text(ctx, `¥${v}`, 26, 2, 40, { bold: true, color: P.lilyDeep });
    ctx.restore();
  }

  /** The frog's thought on the way home, big, with a countdown to HQ; a tap goes straight there. */
  private drawOffCard(ctx: Ctx) {
    const o = this.off!;
    if (o.t < CARD_AT) return;
    const k = Math.min(1, (o.t - CARD_AT) / 0.45);
    const lines = wrapText(ctx, o.line, 42, 500, true);
    const h = 150 + lines.length * 62 + 70;
    ctx.save();
    ctx.globalAlpha = k;
    ctx.translate(375, this.H * 0.42 + (1 - easeOutCubic(k)) * 70);
    ctx.rotate(-0.02);
    panel(ctx, -295, -h / 2, 590, h, { r: 24 });
    text(ctx, '“', -238, -h / 2 + 58, 96, { color: P.orange, bold: true });
    text(ctx, '”', 238, -h / 2 + 140 + (lines.length - 1) * 62, 96, { color: P.orange, bold: true });
    lines.forEach((l, i) => text(ctx, l, 0, -h / 2 + 110 + i * 62, 42, { bold: true }));
    // countdown ring with the seconds left, then the tap line
    const left = Math.max(0, OFF_END - o.t);
    const ry = h / 2 - 54, rx = -112;
    ellipse(ctx, rx, ry, 22, 22);
    ctx.fillStyle = P.cream;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(rx, ry, 22, -Math.PI / 2, -Math.PI / 2 + (left / OFF_COUNT) * Math.PI * 2);
    ctx.strokeStyle = P.orange;
    ctx.lineWidth = 5;
    ctx.stroke();
    text(ctx, String(Math.ceil(left)), rx, ry + 1, 24, { bold: true });
    text(ctx, '点一下马上回总部', rx + 36, ry + 1, 26, { align: 'left', color: P.inkSoft });
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
      ['map', '回到路线图', false],
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
