import { P } from '../art/palette';
import { SpriteBank } from '../art/sprites';
import { ellipse, panel, roundRect, text } from '../art/ui';
import { Audio } from '../engine/audio';
import { Telemetry, type TelemetryOptions } from '../engine/telemetry';
import type { Ctx, Platform } from '../platform/types';
import { Album } from './album';
import { upgradeSave, type Achievement, type AlbumPhoto, type Career, type DayLog, type Entry, type Note, type Room, type Wear } from './career';
import { item, type GearId } from './catalog';
import { DAYS } from './config';
import { Loader } from './loading';

export interface Scene {
  /** Short name for the play statistics. */
  readonly id: string;
  update(dt: number): void;
  render(ctx: Ctx): void;
  down?(x: number, y: number, id: number): void;
  move?(x: number, y: number, id: number): void;
  up?(x: number, y: number, id: number): void;
  /** Wheel scroll in design pixels. */
  wheelBy?(dy: number): void;
  /** Called when the app goes to the background. */
  blur?(): void;
}

export interface SaveData {
  /** Highest day unlocked. */
  day: number;
  coins: number;
  best: Record<number, string>;
  /** Music and sound effects (ambience included) switched on; `sound` is the old single switch, kept as "either is on". */
  music: boolean;
  sfx: boolean;
  sound: boolean;
  /** One-time lessons already shown, e.g. how to rescue parcels from the river. */
  tips: Record<string, boolean>;
  /** The three stamps earned so far on each day (准时下班, 干得漂亮, 今日挑战). */
  stamps: Record<number, boolean[]>;
  // ---- the frog's life outside work (save v2; older saves are filled in by upgradeSave)
  name: string;
  /** When this save was started, for the staff card. */
  since: number;
  gear: Record<GearId, number>;
  /** Shop items owned (hats, furniture, frames). */
  owned: string[];
  wear: Wear;
  room: Room;
  career: Career;
  /** Work log, newest first. */
  log: DayLog[];
  /** River news, newest first. */
  notes: Note[];
  /** Money book, newest first. */
  ledger: Entry[];
  /** Achievements reached, with when. */
  ach: Record<string, number>;
  album: AlbumPhoto[];
  /** Lost letters found, by their text. */
  letters: string[];
  /** What's been looked at already, for the red dots. */
  seen: { notes: number; letters: number; ach: number };
  /** Counter for note and photo ids. */
  seq: number;
}

const SAVE_KEY = 'waqu.save.v1';

/** Saves from before the separate music and effects switches take both from the old `sound`. */
function audioPrefs(s: SaveData) {
  const old = s.sound !== false;
  if (typeof s.music !== 'boolean') s.music = old;
  if (typeof s.sfx !== 'boolean') s.sfx = old;
  s.sound = s.music || s.sfx;
}
const STEP = 1 / 60;
const FADE = 0.5;
const MEDAL_T = 3;

export class Game {
  readonly W = 750;
  H = 1334;
  /** Canvas pixels per design unit. */
  scale = 1;
  safeT = 0;
  safeB = 0;
  ctx: Ctx;
  sprites: SpriteBank;
  audio: Audio;
  /** Anonymous play statistics (see docs/telemetry.md). */
  tm: Telemetry;
  /** Frames drawn, slow ones (over 50 ms) and seconds on screen since the last reset, to spot devices that stutter. */
  perf = { frames: 0, slow: 0, time: 0 };
  save: SaveData;
  album: Album;
  scene: Scene | null = null;
  /** Achievements just reached, shown one after another over whatever screen is up. */
  private medals: { a: Achievement; t: number; d: number }[] = [];
  ready = false;
  private acc = 0;
  private last = 0;
  private loadDone = 0;
  private loadTotal = 1;
  private firstScene: (() => Scene) | null = null;
  private loader: Loader;
  /** Cap on canvas pixels per CSS pixel; comes down by itself on a device that can't keep up. */
  private dprCap = 2;
  private frameMs = 0.016;
  private capAt = 0;
  /** Fade through black between scenes: out over the old one, then in over the new one. */
  private fade: { next: Scene | null; t: number } | null = null;

  constructor(readonly platform: Platform, tm: TelemetryOptions = {}) {
    const self = this;
    this.ctx = platform.canvas.getContext('2d')!;
    this.sprites = new SpriteBank(platform);
    this.audio = new Audio(platform);
    this.save = this.readSave();
    this.album = new Album(this);
    audioPrefs(this.save);
    this.audio.configure({ music: this.save.music, sfx: this.save.sfx });
    this.tm = new Telemetry(platform, tm);
    this.loader = new Loader({
      get H() {
        return self.H;
      },
      get safeT() {
        return self.safeT;
      },
      get safeB() {
        return self.safeB;
      },
      progress: () => Math.min(0.97, this.loadDone / Math.max(1, this.loadTotal)),
      vibrate: (ms) => this.platform.vibrate(ms),
      enter: () => this.enter(),
    });
  }

  /** Leaves the loading screen for the first scene. */
  private enter() {
    if (this.ready || !this.firstScene) return;
    this.ready = true;
    this.go(this.firstScene());
  }

  async start(first: () => Scene, entry: Record<string, unknown> = {}) {
    const t0 = this.platform.now();
    const s = this.save;
    this.tm.log('open', {
      ...this.platform.deviceInfo(), ...entry, visit: this.tm.visits,
      unlocked: s.day, coins: s.coins, sound: s.sound, stamps: Object.values(s.stamps).flat().filter(Boolean).length,
    });
    this.platform.onError((msg, where) => {
      this.tm.log('error', { msg, where, scene: this.scene?.id ?? null });
      this.tm.soon();
    });
    this.resize();
    this.platform.onResize(() => this.resize());
    // the sound system exists from the start, so the first tap (even on the loading screen) unlocks it
    this.audio.init();
    this.platform.onGesture(() => this.audio.unlock());
    this.platform.onTouch((kind, t) => {
      const x = t.x * (this.W / this.cssW);
      const y = t.y * (this.W / this.cssW);
      if (this.fade) return;
      if (!this.ready) {
        // still on the loading screen: the snake game gets the touches
        if (kind === 'start') {
          this.audio.unlock();
          this.loader.down(x, y, t.id);
        } else if (kind === 'move') this.loader.move(x, y, t.id);
        else this.loader.up(x, y, t.id);
        return;
      }
      if (kind === 'start') {
        this.audio.unlock();
        this.audio.kick();
        this.scene?.down?.(x, y, t.id);
      } else if (kind === 'move') this.scene?.move?.(x, y, t.id);
      else this.scene?.up?.(x, y, t.id);
    });
    this.platform.onWheel?.((dy) => {
      if (this.ready && !this.fade) this.scene?.wheelBy?.(dy * (this.W / this.cssW));
    });
    this.platform.onVisibility((v) => {
      if (v) this.audio.resume();
      else {
        this.audio.suspend();
        this.scene?.blur?.();
      }
      this.tm.log(v ? 'show' : 'hide', { scene: this.scene?.id ?? 'loading' });
      if (!v) this.tm.hide();
      this.last = this.platform.now();
    });
    this.last = this.platform.now();
    this.platform.requestFrame(this.frame);

    const fonts = Promise.all([
      this.platform.loadFont('WK', 'fonts/wk-regular.woff2'),
      this.platform.loadFont('WKB', 'fonts/wk-bold.woff2'),
    ]);
    await this.sprites.load(Math.max(1, this.scale), (d, t) => {
      this.loadDone = d;
      this.loadTotal = t;
    });
    await fonts;
    // building the first scene asks for its own art (the hub's background and buildings); wait for that so the player doesn't see placeholders
    const scene = first();
    this.firstScene = () => scene;
    await this.sprites.idle();
    this.tm.log('loaded', { ms: Math.round(this.platform.now() - t0) });
    this.loader.finish();
    // the first screen is ready to go; the rest of the art and the sound arrive while the player is on it (gameplay art first)
    this.sprites.startBackground();
    void this.audio.load('audio/');
  }

  private cssW = 375;

  /** CSS pixels per design unit, for placing page elements over the canvas. */
  get cssScale() {
    return this.cssW / this.W;
  }

  resize() {
    const s = this.platform.screen();
    const c = this.platform.canvas;
    const dpr = Math.min(s.dpr, this.dprCap);
    c.width = Math.round(s.width * dpr);
    c.height = Math.round(s.height * dpr);
    this.cssW = s.width;
    this.scale = c.width / this.W;
    this.H = c.height / this.scale;
    this.safeT = s.safeTop * (this.W / s.width);
    this.safeB = s.safeBottom * (this.W / s.width);
  }

  /** A scene waiting for its art: shown as a small "loading" card over what's on screen until it's in. */
  private waiting: { scene: Scene; fade: boolean } | null = null;

  go(scene: Scene, fade = false, ready = false) {
    // the hub's art is loaded first; every other screen waits here if its art is still on the way
    if (!ready && scene.id !== 'hub' && this.sprites.waiting > 0) {
      const w = { scene, fade };
      this.waiting = w;
      void this.sprites.whenReady(scene.id === 'play').then(() => {
        if (this.waiting !== w) return;
        this.waiting = null;
        this.go(scene, fade, true);
      });
      return;
    }
    this.waiting = null;
    // a photo laid over the game for long-press saving belongs to the screen being left
    this.platform.showImage(null);
    if (fade && this.scene) this.fade = { next: scene, t: 0 };
    else this.scene = scene;
  }

  private stepFade(dt: number) {
    const f = this.fade;
    if (!f) return;
    f.t += dt;
    if (f.next && f.t >= FADE) {
      this.scene = f.next;
      f.next = null;
      f.t = 0;
    } else if (!f.next && f.t >= FADE) this.fade = null;
  }

  private frame = (t: number) => {
    let dt = (t - this.last) / 1000;
    this.last = t;
    if (dt > 0 && dt < 1) {
      this.perf.frames++;
      this.perf.time += dt;
      if (dt > 0.05) this.perf.slow++;
    }
    this.tm.tick();
    this.audio.update(dt > 0 && dt < 0.25 ? dt : STEP);
    // a device that stays under about 30 fps gets a smaller canvas, which is the cheapest way to win time back
    if (this.ready && dt > 0 && dt < 0.25) {
      this.frameMs += (dt - this.frameMs) * 0.04;
      if (this.frameMs > 0.034 && this.dprCap > 1 && t - this.capAt > 4000) {
        this.capAt = t;
        this.dprCap = Math.max(1, this.dprCap - 0.25);
        this.frameMs = 0.017;
        this.tm.log('dpr_cap', { cap: this.dprCap });
        this.resize();
      }
    }
    if (!(dt >= 0) || dt > 0.25) dt = STEP; // tab switches, hiccups
    this.acc += dt;
    let steps = 0;
    while (this.acc >= STEP && steps < 5) {
      this.stepFade(STEP);
      if (this.ready) this.scene?.update(STEP);
      else this.loader.update(STEP);
      this.stepMedals(STEP);
      this.acc -= STEP;
      steps++;
    }
    if (steps === 5) this.acc = 0;
    const ctx = this.ctx;
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    if (this.ready && this.scene) this.scene.render(ctx);
    else this.loader.render(ctx);
    this.renderMedals(ctx);
    if (this.waiting) this.renderWaiting(ctx);
    if (this.fade) {
      const k = Math.min(1, this.fade.t / FADE);
      ctx.fillStyle = `rgba(28,22,18,${this.fade.next ? k : 1 - k})`;
      ctx.fillRect(0, 0, this.W, this.H);
    }
    this.platform.requestFrame(this.frame);
  };

  private renderWaiting(ctx: Ctx) {
    ctx.fillStyle = 'rgba(28,22,18,0.35)';
    ctx.fillRect(0, 0, this.W, this.H);
    const w = 320, h = 120, x = (this.W - w) / 2, y = (this.H - h) / 2;
    roundRect(ctx, x, y, w, h, 28);
    ctx.fillStyle = '#F6EEDC';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#4A3B30';
    ctx.stroke();
    text(ctx, '加载中' + '.'.repeat(1 + (Math.floor(this.platform.now() / 400) % 3)), this.W / 2, y + h / 2, 38, { color: '#4A3B30', align: 'center', baseline: 'middle', bold: true });
  }

  readSave(): SaveData {
    const base = { day: 1, coins: 0, best: {}, sound: true, tips: {}, stamps: {} } as unknown as SaveData;
    try {
      const raw = this.platform.storageGet(SAVE_KEY);
      if (raw) return upgradeSave({ ...base, ...JSON.parse(raw) });
    } catch {
      /* corrupted save: start fresh */
    }
    return upgradeSave(base);
  }

  writeSave() {
    this.platform.storageSet(SAVE_KEY, JSON.stringify(this.save));
  }

  /** Shows a ribbon for each newly reached achievement. */
  celebrate(list: Achievement[]) {
    for (const a of list) {
      this.medals.push({ a, t: this.medals.length ? -0.2 : 0, d: MEDAL_T });
      this.tm.log('ach', { id: a.id, scene: this.scene?.id ?? null });
    }
    if (list.length) this.medalSound(false);
  }

  /** The chime for an achievement ribbon (softer for the ones queued after the first); a promotion gets its own fanfare. */
  medalSound(next: boolean, rankUp = false) {
    if (rankUp) this.audio.play('rank_up');
    else if (next) this.audio.play('achievement', { volume: 0.6 });
    else this.audio.play('achievement', { delay: 0.1 });
  }

  private stepMedals(dt: number) {
    const m = this.medals[0];
    // a queue of several goes by quicker
    if (m && this.medals.length > 2) m.d = Math.min(m.d, 1.8);
    if (m && (m.t += dt) > m.d) {
      this.medals.shift();
      if (this.medals.length) this.medalSound(true);
    }
  }

  private renderMedals(ctx: Ctx) {
    const m = this.medals[0];
    if (!m || m.t < 0) return;
    const a = m.a;
    const k = Math.min(1, m.t / 0.3) * Math.min(1, (m.d - m.t) / 0.3);
    const w = 470, h = 104;
    const x = 750 - (w + 16) * (1 - Math.pow(1 - k, 3)) + (1 - k) * 40, y = this.safeT + 196;
    ctx.save();
    panel(ctx, x, y, w, h, { r: 20, fill: '#FDF3D2', stitch: P.gold });
    ellipse(ctx, x + 56, y + h / 2, 34, 34);
    ctx.fillStyle = P.gold;
    ctx.fill();
    ctx.strokeStyle = P.ink;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    text(ctx, '★', x + 56, y + h / 2 + 2, 36, { color: P.white, bold: true });
    text(ctx, '成就达成', x + 104, y + 28, 20, { align: 'left', color: P.orangeDeep, bold: true });
    text(ctx, a.name, x + 104, y + 58, 32, { align: 'left', bold: true, maxWidth: w - 120 });
    const reward = [`+${a.coins} 金币`, a.reward ? item(a.reward)?.name : ''].filter(Boolean).join(' · ');
    text(ctx, reward, x + 104, y + 86, 20, { align: 'left', color: P.inkSoft, maxWidth: w - 120 });
    ctx.restore();
  }

  /** The old single sound switch: music and effects together. */
  setSound(on: boolean) {
    this.setAudio({ music: on, sfx: on });
  }

  /** Music and effects switches, each on its own (kept in the save). Switching effects on clicks, so it's heard. */
  setAudio(o: { music?: boolean; sfx?: boolean }) {
    const s = this.save;
    const sfxWas = s.sfx;
    if (o.music !== undefined) s.music = o.music;
    if (o.sfx !== undefined) s.sfx = o.sfx;
    s.sound = s.music || s.sfx;
    this.tm.log('sound', { on: s.sound, scene: this.scene?.id ?? null });
    this.audio.configure({ music: s.music, sfx: s.sfx });
    if (s.sfx && !sfxWas) this.audio.play('ui_confirm', { volume: 0.7 });
    this.writeSave();
  }

  get lastDay() {
    return DAYS.length;
  }
}
