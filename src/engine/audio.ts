import type { Platform } from '../platform/types';

/** One entry of public/audio/manifest.json (made by the sound thread). */
interface SoundDef {
  file: string;
  group?: string;
  loop: boolean;
  volume: number;
  variants?: string[];
}

export interface LoopHandle {
  stop(fade?: number): void;
  setRate(rate: number): void;
}

/**
 * Manifest-driven sound player on Web Audio (browser AudioContext, or
 * wx.createWebAudioContext in the mini game). Effects are decoded up front;
 * music is decoded when first needed and only the current tracks are kept.
 */
export class Audio {
  enabled = true;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private defs: Record<string, SoundDef> = {};
  private buffers = new Map<string, AudioBuffer>();
  private loading = new Map<string, Promise<AudioBuffer | null>>();
  private music: { id: string; src: AudioBufferSourceNode; gain: GainNode; start: number; loop: [number, number] } | null = null;
  private wantMusic: string | null = null;
  /** Where the track stopped when the game was paused, to pick up from there. */
  private paused: { id: string; at: number } | null = null;
  private base = 'audio/';

  constructor(private platform: Platform) {}

  /** Fetches the manifest and decodes all effects and ambience. Never throws. */
  async load(base = 'audio/') {
    this.base = base;
    this.ctx = this.platform.createAudioContext();
    if (!this.ctx) return;
    this.master = this.ctx.createGain();
    this.master.gain.value = this.enabled ? 1 : 0;
    this.master.connect(this.ctx.destination);
    this.sfxBus = this.ctx.createGain();
    this.sfxBus.connect(this.master);
    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = 0.6;
    this.musicBus.connect(this.master);
    try {
      const raw = await this.platform.loadBinary(base + 'manifest.json');
      const json = JSON.parse(new TextDecoder().decode(raw));
      this.defs = json.sounds;
    } catch (e) {
      console.warn('audio manifest failed', e);
      return;
    }
    const ids = Object.keys(this.defs).filter((id) => !id.startsWith('bgm_'));
    for (let i = 0; i < ids.length; i += 8) await Promise.all(ids.slice(i, i + 8).map((id) => this.buffer(id)));
  }

  private buffer(id: string): Promise<AudioBuffer | null> {
    const have = this.buffers.get(id);
    if (have) return Promise.resolve(have);
    const pending = this.loading.get(id);
    if (pending) return pending;
    const def = this.defs[id];
    if (!def || !this.ctx) return Promise.resolve(null);
    const p = this.platform
      .loadBinary(this.base + def.file)
      .then((data) => decode(this.ctx!, data))
      .then((buf) => {
        this.buffers.set(id, buf);
        this.loading.delete(id);
        return buf;
      })
      .catch((e) => {
        console.warn('audio failed', id, e);
        this.loading.delete(id);
        return null;
      });
    this.loading.set(id, p);
    return p;
  }

  /** Must run inside a touch handler: browsers only start audio after a gesture. */
  unlock() {
    if (this.ctx && this.ctx.state !== 'running') {
      this.ctx.resume().then(() => this.kick(), () => undefined);
    }
  }

  suspend() {
    this.ctx?.suspend().catch(() => undefined);
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => undefined);
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.05);
  }

  /** Plays a one-shot effect. Variants rotate at random; `jitter` adds a little pitch spread. */
  play(id: string, o: { rate?: number; volume?: number; jitter?: boolean; delay?: number } = {}) {
    if (!this.ctx || !this.enabled || this.ctx.state !== 'running') return;
    const def = this.defs[id];
    if (!def) return;
    const pool = [id, ...(def.variants || [])];
    const pickId = pool[Math.floor(Math.random() * pool.length)];
    const buf = this.buffers.get(pickId) || this.buffers.get(id);
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = (o.rate ?? 1) * (o.jitter ? 0.94 + Math.random() * 0.12 : 1);
    const g = this.ctx.createGain();
    g.gain.value = (this.defs[pickId]?.volume ?? def.volume) * (o.volume ?? 1);
    src.connect(g).connect(this.sfxBus!);
    src.start(this.ctx.currentTime + (o.delay ?? 0));
  }

  /**
   * Starts a sound that can be stopped early: loops (ambience) or, with `once`,
   * a one-shot like the charge-up. Returns null while audio isn't ready yet.
   */
  loop(id: string, o: { volume?: number; rate?: number; fadeIn?: number; once?: boolean } = {}): LoopHandle | null {
    const ctx = this.ctx;
    const buf = this.buffers.get(id);
    const def = this.defs[id];
    if (!ctx || !buf || !def || ctx.state !== 'running') return null;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = !o.once;
    const [a, b] = loopPoints(buf);
    src.loopStart = a;
    src.loopEnd = b;
    src.playbackRate.value = o.rate ?? 1;
    const g = ctx.createGain();
    const vol = def.volume * (o.volume ?? 1);
    g.gain.value = o.fadeIn ? 0.0001 : vol;
    if (o.fadeIn) g.gain.setTargetAtTime(vol, ctx.currentTime, o.fadeIn / 3);
    src.connect(g).connect(this.sfxBus!);
    src.start(ctx.currentTime, o.once ? 0 : a);
    let stopped = false;
    return {
      stop: (fade = 0.08) => {
        if (stopped) return;
        stopped = true;
        g.gain.setTargetAtTime(0.0001, ctx.currentTime, fade / 3);
        src.stop(ctx.currentTime + fade + 0.05);
      },
      setRate: (r: number) => {
        if (!stopped) src.playbackRate.setTargetAtTime(r, ctx.currentTime, 0.03);
      },
    };
  }

  /** Switches the background track (null = silence), crossfading. */
  setMusic(id: string | null) {
    this.wantMusic = id;
    this.paused = null;
    if (this.music?.id === id) return;
    this.fadeOutMusic();
    if (!id || !this.ctx) return;
    void this.buffer(id).then((buf) => {
      if (!buf || this.wantMusic !== id || this.music?.id === id) return;
      this.startMusic(id, buf);
      // keep memory low: drop music buffers that aren't playing
      for (const key of [...this.buffers.keys()]) if (key.startsWith('bgm_') && key !== id) this.buffers.delete(key);
    });
  }

  /** Retries the wanted track after the first tap unlocks audio. */
  kick() {
    if (this.wantMusic && !this.music && !this.paused) this.setMusic(this.wantMusic);
  }

  /** Stops the music where it is (pause menu); `resumeMusic` carries on from the same spot. */
  pauseMusic() {
    const m = this.music;
    if (!m || !this.ctx) return;
    const [a, b] = m.loop;
    const played = (this.ctx.currentTime - m.start) % (b - a);
    this.paused = { id: m.id, at: a + Math.max(0, played) };
    this.fadeOutMusic(0.08);
  }

  resumeMusic() {
    const p = this.paused;
    this.paused = null;
    if (!p || this.wantMusic !== p.id) return;
    const buf = this.buffers.get(p.id);
    if (buf) this.startMusic(p.id, buf, p.at);
    else this.setMusic(p.id);
  }

  private startMusic(id: string, buf: AudioBuffer, at?: number) {
    const ctx = this.ctx!;
    if (ctx.state !== 'running') return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const [a, b] = loopPoints(buf);
    src.loopStart = a;
    src.loopEnd = b;
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    g.gain.setTargetAtTime(this.defs[id]?.volume ?? 0.6, ctx.currentTime, at === undefined ? 0.4 : 0.1);
    src.connect(g).connect(this.musicBus!);
    const from = at ?? a;
    src.start(ctx.currentTime, from);
    // `start` is when the loop region began, so the play position can be worked out later
    this.music = { id, src, gain: g, start: ctx.currentTime - (from - a), loop: [a, b] };
  }

  private fadeOutMusic(fade = 0.25) {
    if (!this.music || !this.ctx) return;
    const { src, gain } = this.music;
    gain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, fade);
    src.stop(this.ctx.currentTime + fade * 4.8);
    this.music = null;
  }

  /** Lowers the music, e.g. while the frog is in the water. */
  duck(on: boolean) {
    if (this.musicBus && this.ctx) this.musicBus.gain.setTargetAtTime(on ? 0.25 : 0.6, this.ctx.currentTime, 0.15);
  }
}

function decode(ctx: AudioContext, data: ArrayBuffer): Promise<AudioBuffer> {
  // Callback form for older Safari and the wx WebAudio context.
  return new Promise((resolve, reject) => {
    const r = ctx.decodeAudioData(data, resolve, reject);
    if (r && typeof (r as Promise<AudioBuffer>).then === 'function') (r as Promise<AudioBuffer>).then(resolve, reject);
  });
}

/** Skips the encoder's silent padding so loops don't click (see the audio README). */
function loopPoints(buf: AudioBuffer): [number, number] {
  const d = buf.getChannelData(0);
  let a = 0;
  let b = d.length - 1;
  while (a < b && Math.abs(d[a]) < 1e-4) a++;
  while (b > a && Math.abs(d[b]) < 1e-4) b--;
  return [a / buf.sampleRate, (b + 1) / buf.sampleRate];
}
