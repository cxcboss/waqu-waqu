// The sky over a day on the river: rain and snow, the gusts of autumn and the blizzard's wind, the dark
// of the night shifts with the lights the frog can see by, lightning on the storm night and the New
// Year's Eve fireworks; plus the little things floating on each chapter's water. The play scene asks it
// how hard the wind is blowing (jumps drift with it) and hands it the lights to cut out of the dark.
import { P } from '../art/palette';
import { firework, lightning } from '../art/river';
import type { Audio } from '../engine/audio';
import { alpha3 } from '../engine/math';
import type { Canvas, Ctx } from '../platform/types';
import { TUNING, type Feats } from './config';

/** Something that shines through the dark: a point on screen and how far its light reaches. */
export interface Light { x: number; y: number; r: number; warm?: boolean }

/** Seconds of warning before a gust, how long it blows, and the quiet between gusts. */
const GUST_WARN = 1.6;
const GUST_BLOW = 3.2;
const GUST_GAP: [number, number] = [7, 11];
/** How far a full gust pushes a jump sideways, design units per second in the air. */
const GUST_PUSH = 170;
/** The blizzard's wind turns slowly between the banks: its strongest push. */
const BLIZZARD_PUSH = 130;

const rand = (a: number, b: number) => a + Math.random() * (b - a);

interface Drop { x: number; y: number; v: number; l: number }
interface Burst { x: number; y: number; t: number; color: string; seed: number }

/**
 * Soft spots for the night, each drawn once and then stamped wherever it's wanted, rather than a new gradient for
 * every light every frame (dozens of them on a night shift): the hole a light cuts in the dark, the warm glow over a
 * lamp, a firefly. Opaque in the middle, fading out to the edge of the canvas, so `globalAlpha` sets how strong.
 */
let spots: { hole: Canvas; glow: Canvas; fly: Canvas } | null = null;
/** The dark of a night shift, at half the screen's size: one canvas for every night, see `drawDark`. */
let darkC: Canvas | null = null;

function makeSpots(make: (w: number, h: number) => Canvas) {
  const spot = (size: number, inner: number, stops: [number, string][]) => {
    const c = make(size, size);
    const g = c.getContext('2d')!;
    const r = size / 2;
    const gr = g.createRadialGradient(r, r, r * inner, r, r, r);
    for (const [at, color] of stops) gr.addColorStop(at, color);
    g.fillStyle = gr;
    g.fillRect(0, 0, size, size);
    return c;
  };
  return {
    hole: spot(256, 0.15, [[0, 'rgba(0,0,0,1)'], [0.55, 'rgba(0,0,0,0.75)'], [1, 'rgba(0,0,0,0)']]),
    glow: spot(256, 0, [[0, 'rgba(246,198,106,1)'], [1, 'rgba(246,198,106,0)']]),
    fly: spot(32, 0, [[0, 'rgba(246,240,140,1)'], [1, 'rgba(246,240,140,0)']]),
  };
}

export class Weather {
  /** Rain streaks or snowflakes, in screen space. */
  private drops: Drop[] = [];
  /** Rings where rain hits the water, in screen space. */
  private rings: { x: number; y: number; t: number }[] = [];
  private ringCd = 0;
  /** The gust cycle: calm until `next`, then a warning, then the blow. */
  gust: { phase: 'calm' | 'warn' | 'blow'; t: number; dir: number; next: number } | null = null;
  /** Lightning: how bright the flash still is, the bolt, and the wait for the next. */
  flash = 0;
  private bolt: { x: number; t: number; seed: number } | null = null;
  private boltCd = rand(3, 5);
  private bursts: Burst[] = [];
  private burstCd = 1;
  private t = 0;
  /** How dark the river is (0 none): night shifts, the storm, New Year's Eve. */
  readonly darkness: number;

  constructor(private f: Feats, private chapter: number, private make: (w: number, h: number) => Canvas) {
    this.darkness = f.storm ? 0.7 : f.night ? 0.62 : f.fireworks ? 0.5 : 0;
    if (f.gust) this.gust = { phase: 'calm', t: 0, dir: 1, next: 5 };
    const n = f.storm ? 110 : f.rain ? 70 : f.blizzard ? 170 : f.snow ? 60 : 0;
    for (let i = 0; i < n; i++) this.drops.push(this.drop(true));
  }

  private get snowy() {
    return !!(this.f.snow || this.f.blizzard) && !this.f.rain;
  }

  private drop(anywhere: boolean): Drop {
    const snow = this.snowy;
    return {
      x: rand(-60, 810), y: anywhere ? rand(-40, 1500) : rand(-120, -20),
      v: snow ? rand(60, this.f.blizzard ? 220 : 120) : rand(900, 1300),
      l: snow ? rand(2.5, 5.5) : rand(26, 46),
    };
  }

  /** Sideways push on a jump right now, design units per second in the air (+ to the right). */
  wind() {
    if (this.f.blizzard) return Math.sin(this.t * 0.23) * BLIZZARD_PUSH * (0.6 + 0.4 * Math.sin(this.t * 0.71));
    const g = this.gust;
    if (!g || g.phase !== 'blow') return 0;
    // eases in and out over the blow
    const k = Math.min(1, g.t / 0.5, (GUST_BLOW - g.t) / 0.5);
    return g.dir * GUST_PUSH * Math.max(0, k);
  }

  /** -1…1 for the wind indicator, with whether a gust is only coming (blinking). */
  windSign(): { v: number; warn: boolean } | null {
    if (this.f.blizzard) return { v: this.wind() / BLIZZARD_PUSH, warn: false };
    const g = this.gust;
    if (!g) return null;
    if (g.phase === 'warn') return { v: g.dir, warn: true };
    if (g.phase === 'blow') return { v: this.wind() / GUST_PUSH, warn: false };
    return { v: 0, warn: false };
  }

  /** `running` is false while the river holds still (the briefing, the tutorial steps): the sky waits too. */
  update(dt: number, running: boolean, au: Audio, H: number) {
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt * 2.2);
    const wind = this.wind();
    for (const d of this.drops) {
      d.y += d.v * dt;
      d.x += (this.snowy ? wind * 0.9 + Math.sin(this.t * 1.3 + d.l * 3) * 18 : wind * 0.35) * dt;
      if (d.y > H + 40 || d.x < -80 || d.x > 830) Object.assign(d, this.drop(false), d.x < -80 ? { x: 820 } : d.x > 830 ? { x: -60 } : {});
    }
    if (this.f.rain || this.f.storm) {
      this.ringCd -= dt;
      while (this.ringCd <= 0) {
        this.ringCd += this.f.storm ? 0.04 : 0.08;
        this.rings.push({ x: rand(TUNING.riverL + 10, TUNING.riverR - 10), y: rand(0, H), t: 0 });
      }
    }
    for (const r of this.rings) r.t += dt;
    this.rings = this.rings.filter((r) => r.t < 0.5);
    if (!running) return;
    const g = this.gust;
    if (g) {
      g.t += dt;
      if (g.phase === 'calm' && g.t >= g.next) {
        g.phase = 'warn';
        g.t = 0;
        g.dir = Math.random() < 0.5 ? -1 : 1;
        au.play('gust', { volume: 0.5, rate: 1.1 });
      } else if (g.phase === 'warn' && g.t >= GUST_WARN) {
        g.phase = 'blow';
        g.t = 0;
        au.play('gust', { volume: 0.9 });
        au.play('leaf_rustle', { volume: 0.6, delay: 0.2 });
      } else if (g.phase === 'blow' && g.t >= GUST_BLOW) {
        g.phase = 'calm';
        g.t = 0;
        g.next = rand(...GUST_GAP);
      }
    }
    if (this.f.storm && (this.boltCd -= dt) <= 0) {
      this.boltCd = rand(4.5, 7);
      this.flash = 1;
      this.bolt = { x: rand(120, 630), t: 0, seed: Math.floor(Math.random() * 1000) };
      au.play('thunder', { delay: rand(0.25, 0.9), volume: rand(0.7, 1) });
    }
    if (this.bolt && (this.bolt.t += dt) > 0.22) this.bolt = null;
    if (this.f.fireworks && (this.burstCd -= dt) <= 0) {
      this.burstCd = rand(1.2, 2.6);
      const colors = [P.red, P.gold, P.pink, '#9FD3F0', P.lilyLight];
      this.bursts.push({ x: rand(110, 640), y: rand(H * 0.12, H * 0.42), t: 0, color: colors[Math.floor(Math.random() * colors.length)], seed: Math.floor(Math.random() * 100) });
      this.flash = Math.max(this.flash, 0.35);
      au.play('firecracker', { volume: rand(0.4, 0.7), rate: rand(0.9, 1.15), delay: 0.1 });
    }
    for (const b of this.bursts) b.t += dt;
    this.bursts = this.bursts.filter((b) => b.t < 1.4);
  }

  /**
   * On the water, under everything floating: the chapter's bits and pieces (world-anchored, so they
   * flow with the river) and the rings of the rain.
   */
  drawWater(ctx: Ctx, camY: number, H: number, tint: string | null, top = 0) {
    if (tint) {
      // `top`: how far above the screen's top the view reaches while the camera pans (see the drive home)
      ctx.save();
      ctx.fillStyle = tint;
      ctx.fillRect(-60, top - 10, 870, H + 20);
      ctx.restore();
    }
    const ch = this.chapter;
    const cell = 240;
    const k0 = Math.floor(camY / cell) - 1, k1 = Math.floor((camY + H) / cell) + 1;
    ctx.save();
    for (let k = k0; k <= k1; k++) {
      const h = (n: number) => {
        const v = Math.sin(k * 127.1 + n * 311.7) * 43758.5453;
        return v - Math.floor(v);
      };
      const x = TUNING.riverL + 30 + h(1) * (TUNING.riverR - TUNING.riverL - 60), y = k * cell + h(2) * cell - camY;
      const rot = h(3) * Math.PI * 2;
      if (ch === 1 || ch === 6) {
        // pink petals on the water
        for (let i = 0; i < 3; i++) {
          ctx.save();
          ctx.translate(x + i * 16 - 16, y + (i % 2) * 10);
          ctx.rotate(rot + i);
          ctx.fillStyle = ch === 1 ? P.pink : '#F6CBD2';
          ctx.globalAlpha = 0.8;
          ctx.beginPath();
          ctx.ellipse(0, 0, 7, 4, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      } else if (ch === 3) {
        // fallen leaves
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rot);
        ctx.fillStyle = h(4) < 0.5 ? '#D9533F' : P.gold;
        ctx.globalAlpha = 0.75;
        ctx.beginPath();
        ctx.moveTo(0, -10);
        ctx.quadraticCurveTo(9, 0, 0, 10);
        ctx.quadraticCurveTo(-9, 0, 0, -10);
        ctx.fill();
        ctx.restore();
      } else if (ch === 4) {
        // bits of ice
        ctx.fillStyle = 'rgba(240,248,252,0.75)';
        ctx.strokeStyle = 'rgba(126,160,180,0.6)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          const a = rot + (i / 5) * Math.PI * 2;
          const rr = 9 + h(5 + i) * 6;
          if (i) ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.6);
          else ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.6);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (ch === 2) {
        // flecks of foam
        ctx.fillStyle = 'rgba(251,247,238,0.6)';
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.ellipse(x + i * 12, y + i * 5, 5 - i, 2.5, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.restore();
    if (this.rings.length) {
      ctx.save();
      ctx.strokeStyle = 'rgba(251,247,238,0.7)';
      ctx.lineWidth = 1.5;
      for (const r of this.rings) {
        const k = r.t / 0.5;
        ctx.globalAlpha = 1 - k;
        ctx.beginPath();
        ctx.ellipse(r.x, r.y, 4 + k * 14, 2 + k * 6, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
    // gust: streaks blowing across the river
    const w = this.wind();
    if (Math.abs(w) > 20) {
      ctx.save();
      ctx.strokeStyle = 'rgba(251,247,238,0.55)';
      ctx.lineCap = 'round';
      ctx.lineWidth = 3;
      const dir = Math.sign(w);
      const a = Math.min(1, Math.abs(w) / GUST_PUSH);
      for (let i = 0; i < 12; i++) {
        const y = ((i * 137 + 40) % H);
        const x = ((this.t * 520 * dir + i * 211) % 900 + 900) % 900 - 75;
        ctx.globalAlpha = a * 0.7;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x - dir * 40, y - 6, x - dir * 90, y + 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  /**
   * Over the river and everything on it, under the HUD: rain or snow, the blizzard's white-out at the
   * top, the dark with its lights, the lightning and the fireworks.
   */
  drawAir(ctx: Ctx, H: number) {
    if (this.lit) this.drawDark(ctx, H, this.lit);
    for (const b of this.bursts) firework(ctx, b.x, b.y, b.t / 1.4, b.color, b.seed);
    if (this.bolt) lightning(ctx, this.bolt.x, -20, H * 0.45, this.bolt.seed, 1 - this.bolt.t / 0.22);
    if (this.drops.length) {
      ctx.save();
      ctx.lineCap = 'round';
      if (this.snowy) {
        ctx.fillStyle = P.white;
        ctx.globalAlpha = 0.85;
        for (const d of this.drops) {
          ctx.beginPath();
          ctx.arc(d.x, d.y, d.l, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        const slant = this.wind() * 0.03;
        ctx.strokeStyle = 'rgba(232,240,246,0.55)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (const d of this.drops) {
          ctx.moveTo(d.x, d.y);
          ctx.lineTo(d.x - slant * d.l - d.l * 0.12, d.y - d.l);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
    if (this.f.blizzard) {
      // white-out: the far river (the top of the screen) is lost in the snow
      const g = ctx.createLinearGradient(0, 0, 0, H * 0.5);
      g.addColorStop(0, 'rgba(244,248,250,0.82)');
      g.addColorStop(0.55, 'rgba(244,248,250,0.4)');
      g.addColorStop(1, 'rgba(244,248,250,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 750, H * 0.5);
    }
    if (this.flash > 0) {
      ctx.save();
      ctx.fillStyle = `rgba(255,252,236,${alpha3(this.flash * (this.f.storm ? 0.3 : 0.12))})`;
      ctx.fillRect(0, 0, 750, H);
      ctx.restore();
    }
  }

  /** This frame's lights, once `prepareDark` has made the dark for them (null when there's no dark to draw). */
  private lit: Light[] | null = null;

  /**
   * The dark of a night shift, at half resolution with each light cut out of it. Made before anything else is drawn
   * in the frame, so the phone isn't sent from the screen to this canvas and back in the middle of drawing it.
   */
  prepareDark(H: number, lights: Light[]) {
    this.lit = null;
    const a = this.darkness * (1 - this.flash * 0.9);
    if (a <= 0.01) return;
    const s = 0.5;
    const w = Math.ceil(750 * s), h = Math.ceil(H * s);
    spots ??= makeSpots(this.make);
    if (!darkC) darkC = this.make(w, h);
    else if (darkC.width !== w || darkC.height !== h) {
      darkC.width = w;
      darkC.height = h;
    }
    const g = darkC.getContext('2d')!;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, w, h);
    g.fillStyle = `rgba(18,24,48,${alpha3(a)})`;
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'destination-out';
    for (const l of lights) {
      const x = l.x * s, y = l.y * s, r = l.r * s;
      if (y < -r || y > h + r) continue;
      g.drawImage(spots.hole, x - r, y - r, r * 2, r * 2);
    }
    g.globalCompositeOperation = 'source-over';
    this.lit = lights;
  }

  /** The dark made by `prepareDark` over the screen, then a warm glow over the lamps and windows. */
  private drawDark(ctx: Ctx, H: number, lights: Light[]) {
    const a = this.darkness * (1 - this.flash * 0.9);
    ctx.drawImage(darkC!, 0, 0, 750, H);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = alpha3(0.22 * a);
    for (const l of lights) {
      if (!l.warm) continue;
      const r = l.r * 0.5;
      ctx.drawImage(spots!.glow, l.x - r, l.y - r, r * 2, r * 2);
    }
    ctx.restore();
  }

  /** Fireflies over a lit pad: a few soft dots drifting round it (screen coordinates). */
  fireflies(ctx: Ctx, x: number, y: number, seed: number) {
    spots ??= makeSpots(this.make);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      const ph = this.t * (0.7 + i * 0.23) + seed * 1.7 + i * 2.1;
      const fx = x + Math.cos(ph) * (26 + i * 8), fy = y - 26 + Math.sin(ph * 1.3) * 14 - i * 6;
      const on = 0.55 + 0.45 * Math.sin(this.t * 3 + seed + i * 1.9);
      ctx.globalAlpha = alpha3(0.9 * on);
      ctx.drawImage(spots.fly, fx - 12, fy - 12, 24, 24);
    }
    ctx.restore();
  }
}
