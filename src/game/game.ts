import { P } from '../art/palette';
import { SpriteBank } from '../art/sprites';
import { text } from '../art/ui';
import { Audio } from '../engine/audio';
import type { Ctx, Platform } from '../platform/types';
import { DAYS } from './config';

export interface Scene {
  update(dt: number): void;
  render(ctx: Ctx): void;
  down?(x: number, y: number, id: number): void;
  move?(x: number, y: number, id: number): void;
  up?(x: number, y: number, id: number): void;
  /** Called when the app goes to the background. */
  blur?(): void;
}

export interface SaveData {
  /** Highest day unlocked. */
  day: number;
  coins: number;
  best: Record<number, string>;
  sound: boolean;
}

const SAVE_KEY = 'waqu.save.v1';
const STEP = 1 / 60;

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
  save: SaveData;
  scene: Scene | null = null;
  ready = false;
  private acc = 0;
  private last = 0;
  private loadDone = 0;
  private loadTotal = 1;

  constructor(readonly platform: Platform) {
    this.ctx = platform.canvas.getContext('2d')!;
    this.sprites = new SpriteBank(platform);
    this.audio = new Audio(platform);
    this.save = this.readSave();
    this.audio.enabled = this.save.sound;
  }

  async start(first: () => Scene) {
    this.resize();
    this.platform.onResize(() => this.resize());
    this.platform.onTouch((kind, t) => {
      const x = t.x * (this.W / this.cssW);
      const y = t.y * (this.W / this.cssW);
      if (kind === 'start') {
        this.audio.unlock();
        this.audio.kick();
        this.scene?.down?.(x, y, t.id);
      } else if (kind === 'move') this.scene?.move?.(x, y, t.id);
      else this.scene?.up?.(x, y, t.id);
    });
    this.platform.onVisibility((v) => {
      if (v) this.audio.resume();
      else {
        this.audio.suspend();
        this.scene?.blur?.();
      }
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
    void this.audio.load('audio/');
    this.ready = true;
    this.go(first());
  }

  private cssW = 375;

  resize() {
    const s = this.platform.screen();
    const c = this.platform.canvas;
    c.width = Math.round(s.width * s.dpr);
    c.height = Math.round(s.height * s.dpr);
    this.cssW = s.width;
    this.scale = c.width / this.W;
    this.H = c.height / this.scale;
    this.safeT = s.safeTop * (this.W / s.width);
    this.safeB = s.safeBottom * (this.W / s.width);
  }

  go(scene: Scene) {
    this.scene = scene;
  }

  private frame = (t: number) => {
    let dt = (t - this.last) / 1000;
    this.last = t;
    if (!(dt >= 0) || dt > 0.25) dt = STEP; // tab switches, hiccups
    this.acc += dt;
    let steps = 0;
    while (this.acc >= STEP && steps < 5) {
      this.scene?.update(STEP);
      this.acc -= STEP;
      steps++;
    }
    if (steps === 5) this.acc = 0;
    const ctx = this.ctx;
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    if (this.ready && this.scene) this.scene.render(ctx);
    else this.renderLoading(ctx);
    this.platform.requestFrame(this.frame);
  };

  private renderLoading(ctx: Ctx) {
    ctx.fillStyle = P.paper;
    ctx.fillRect(0, 0, this.W, this.H);
    const y = this.H * 0.48;
    text(ctx, '蛙趣快递 · 正在备货', this.W / 2, y - 40, 30, { color: P.ink });
    ctx.fillStyle = P.paperShade;
    ctx.fillRect(175, y, 400, 14);
    ctx.fillStyle = P.orange;
    ctx.fillRect(175, y, (400 * this.loadDone) / this.loadTotal, 14);
    ctx.strokeStyle = P.ink;
    ctx.lineWidth = 2;
    ctx.strokeRect(175, y, 400, 14);
  }

  readSave(): SaveData {
    const base: SaveData = { day: 1, coins: 0, best: {}, sound: true };
    try {
      const raw = this.platform.storageGet(SAVE_KEY);
      if (raw) return { ...base, ...JSON.parse(raw) };
    } catch {
      /* corrupted save: start fresh */
    }
    return base;
  }

  writeSave() {
    this.platform.storageSet(SAVE_KEY, JSON.stringify(this.save));
  }

  setSound(on: boolean) {
    this.save.sound = on;
    this.audio.setEnabled(on);
    this.writeSave();
  }

  get lastDay() {
    return DAYS.length;
  }
}
