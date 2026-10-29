import type { Platform } from '../platform/types';
import { StreamAudio } from './audio-streams';

/**
 * How a sound is mixed (see docs/audio.md): music and ambience beds, ordinary effects, interface clicks,
 * character voices, warnings, and jingles, which duck the music and never play over each other.
 */
export type SoundKind = 'music' | 'amb' | 'sfx' | 'ui' | 'voice' | 'warn' | 'jingle';

/** One entry of public/audio/manifest.json (written by tools/audio/build.py). */
export interface SoundDef {
  file: string;
  /** Plays another entry's file with its own volume, rate and filter: a variant that costs no download. */
  of?: string;
  kind?: SoundKind;
  loop: boolean;
  volume: number;
  variants?: string[];
  duration?: number;
  /** Loop region in seconds, counted from the first sound in the file (music and ambience). */
  loopAt?: [number, number];
  /** Where a track starts the first time it plays, if not at its loop region (an intro). */
  from?: number;
  rate?: number;
  /** Low-pass corner in Hz (muffled variants). */
  lowpass?: number;
  /** Decoded right after loading; everything else is fetched the first time it's asked for. */
  preload?: boolean;
  /** The same id again sooner than this (seconds) is skipped. */
  gap?: number;
  /** At most this many copies at once; the oldest makes room. */
  voices?: number;
  /** Ambience: one-shots dropped in at random while this bed plays, every `every` seconds. */
  spots?: { ids: string[]; every: [number, number]; volume?: number };
}

export interface LoopHandle {
  stop(fade?: number): void;
  setRate(rate: number): void;
}

/** A one-shot that can still be cut short. */
export interface SoundHandle {
  stop(fade?: number): void;
}

export interface AudioSettings {
  music: boolean;
  sfx: boolean;
  /** 0–1 on top of the switches. */
  musicVolume: number;
  sfxVolume: number;
}

export type PlayOptions = { rate?: number; volume?: number; jitter?: boolean; delay?: number };
export type BabbleOptions = { pitch?: number; pace?: number; count?: number; bend?: number; volume?: number; delay?: number };
export type LoopOptions = { volume?: number; rate?: number; fadeIn?: number; once?: boolean };

/**
 * What the game asks of its sound. In a browser that's Web Audio (`WebAudio` below); in the mini game every sound
 * goes through the system's own players instead (`StreamAudio`, see docs/audio.md, 微信小游戏).
 */
export interface Audio {
  readonly settings: Readonly<AudioSettings>;
  /** Gets ready to play, without fetching anything (so the first tap can already unlock it). */
  init(): void;
  /** Fetches the manifest (and decodes the effects marked `preload`, on Web Audio). Never throws. */
  load(base?: string): Promise<void>;
  /** Gets sounds a scene is about to need ready. */
  preload(ids: string[]): void;
  /** Short of memory: lets go of whatever can be fetched again. */
  trim(): void;
  /** From inside a touch handler. */
  unlock(): void;
  /** Off to the background, or the system has taken the sound. */
  suspend(): void;
  resume(): void;
  /** Starts the wanted music and ambience if they aren't playing. */
  kick(): void;
  /** One line for the game's heartbeat in the remote log. */
  diag(): string;
  /** Every frame. */
  update(dt: number): void;
  configure(s: Partial<AudioSettings>): void;
  play(id: string, o?: PlayOptions): SoundHandle | null;
  loop(id: string, o?: LoopOptions): LoopHandle | null;
  babble(ids: string[], o?: BabbleOptions): void;
  tone(volume?: number): { setPitch(hz: number): void; stop(): void } | null;
  setMusic(id: string | null, o?: { restart?: boolean; fade?: number }): void;
  pauseMusic(): void;
  resumeMusic(): void;
  underwater(on: boolean): void;
  setAmbience(ids: string[] | string | null): void;
}

/** The sound for this platform: the system's players where it has them (the mini game), Web Audio elsewhere. */
export function createAudio(platform: Platform): Audio {
  return platform.createStream ? new StreamAudio(platform) : new WebAudio(platform);
}

/** A playing source and what it needs to be stopped, counted and let go of. */
interface Voice {
  id: string;
  src: AudioBufferSourceNode;
  gain: GainNode;
  /** Context time when it's done (sooner once stopped): its nodes are disconnected after that. */
  end: number;
  stopped: boolean;
}

/** The background track that is playing or fading out. */
interface Track {
  id: string;
  /** The entry whose file it plays (itself, or the one it's a variant `of`). */
  file: string;
  src: AudioBufferSourceNode;
  gain: GainNode;
  filter: BiquadFilterNode | null;
  /** Context time at which the loop region (or the intro) started, to work out the position. */
  start: number;
  from: number;
  loop: [number, number];
  rate: number;
  /** Context time when a fading track has finished fading (Infinity while it plays). */
  end: number;
}

/** Same id within this long is one sound (two copies at once just sound louder, and can clip). */
const GAP = 0.04;
const VOICES = 4;
const MAX_VOICES = 28;
/** Decoded tracks kept: the one playing and the one before it, so going back and forth doesn't decode again. */
const KEEP_MUSIC = 2;
const KEEP_AMB = 4;
/** A sound that only just got decoded on first use still plays if it's no later than this. */
const LATE = 0.18;
/** Music level while a jingle plays over it. */
const DUCK_JINGLE = 0.35;
const DUCK_ON = 0.4;
const MAX_RATE = 2;

/**
 * Manifest-driven sound player on Web Audio (the browser's AudioContext). Only the effects marked `preload` are
 * decoded up front; everything else, music and ambience included, is fetched when a scene first asks for it, and
 * only the last couple of tracks stay decoded.
 *
 * Mix: effects → sfx bus; ambience → amb bus; music → music bus → duck; music and ambience then share the
 * underwater low-pass; everything ends in a limiter so stacked sounds can't clip. Works without AudioParam
 * automation too: fades are then stepped from `update()` each frame. Every source is disconnected once it has
 * finished. (The mini game doesn't use this: see `StreamAudio`.)
 */
export class WebAudio implements Audio {
  private set: AudioSettings = { music: true, sfx: true, musicVolume: 1, sfxVolume: 1 };
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private ambBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private duckGain: GainNode | null = null;
  private under: BiquadFilterNode | null = null;
  /** setTargetAtTime and friends work; when false, fades run in `update()`. */
  private auto = true;
  private ramps = new Map<AudioParam, { to: number; tc: number }>();
  private defs: Record<string, SoundDef> = {};
  private buffers = new Map<string, AudioBuffer>();
  private loading = new Map<string, Promise<AudioBuffer | null>>();
  /** Most recently used last, for dropping old music and ambience. */
  private used: string[] = [];
  private voices: Voice[] = [];
  private lastPlay = new Map<string, number>();
  private base = 'audio/';
  private ready = false;
  /** The game is in the background (or the system took the sound): nothing plays. */
  private hidden = false;
  /** resume() has gone through at least once on this context. */
  private woke = false;
  /** How many times resume() has been asked for. */
  private wakes = 0;
  /** Lines for the remote log about failed decodes, so a bad file can't fill it. */
  private failNotes = 0;
  /** Sources started and not yet disconnected (for the remote log: it should stay small). */
  private alive = 0;
  /** Loops and tracks that have been told to stop: their nodes are let go of after `at` (context time). */
  private trash: { at: number; nodes: AudioNode[] }[] = [];

  private music: Track | null = null;
  private fading: Track[] = [];
  private wantMusic: string | null = null;
  /** When the wanted track was asked for, so the old one doesn't hang on forever if the new one never loads. */
  private wantAt = 0;
  /** Where each track was when it last stopped, to carry on from there next time. */
  private pos = new Map<string, number>();
  /** Where the track stopped when the game was paused, to pick up from there. */
  private paused: { id: string; at: number } | null = null;
  /** Jingles playing or queued: the next one waits for the last to end. */
  private jingles: Voice[] = [];
  private ducked = false;
  private wet = false;

  private amb = new Map<string, { loop: LoopHandle; next: number; def: SoundDef }>();
  private wantAmb: string[] = [];

  constructor(private platform: Platform) {}

  /** Back-compat: true while either music or effects are on. */
  get enabled() {
    return this.set.music || this.set.sfx;
  }
  set enabled(on: boolean) {
    this.configure({ music: on, sfx: on });
  }

  get settings(): Readonly<AudioSettings> {
    return this.set;
  }

  /** Creates the context and the mix, without fetching anything (so the first tap can already unlock it). */
  init() {
    if (this.ctx) return;
    const ctx = (this.ctx = this.platform.createAudioContext());
    if (!ctx) return;
    this.woke = false;
    this.note('info', `context ${ctx.state} ${ctx.sampleRate}Hz`);
    const probe = ctx.createGain();
    try {
      this.auto = typeof probe.gain.setTargetAtTime === 'function' && typeof probe.gain.cancelScheduledValues === 'function';
      if (this.auto) probe.gain.setTargetAtTime(1, ctx.currentTime, 0.1);
    } catch {
      this.auto = false;
    }
    this.master = ctx.createGain();
    // a limiter at the end: two loud sounds landing together turn down instead of clipping
    let out: AudioNode = ctx.destination;
    try {
      if (typeof ctx.createDynamicsCompressor === 'function') {
        const lim = ctx.createDynamicsCompressor();
        lim.threshold.value = -8;
        lim.knee.value = 6;
        lim.ratio.value = 12;
        lim.attack.value = 0.003;
        lim.release.value = 0.2;
        lim.connect(ctx.destination);
        out = lim;
        // the compressor adds its own make-up gain (about +4.5 dB with these settings); take it back off
        this.master.gain.value = 0.6;
      }
    } catch {
      out = ctx.destination;
    }
    this.master.connect(out);
    this.sfxBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.musicBus = ctx.createGain();
    this.duckGain = ctx.createGain();
    this.ambBus = ctx.createGain();
    this.musicBus.connect(this.duckGain);
    // music and ambience go through the underwater low-pass (wide open on land) if the context has filters
    let world: AudioNode = this.master;
    try {
      if (typeof ctx.createBiquadFilter === 'function') {
        this.under = ctx.createBiquadFilter();
        this.under.type = 'lowpass';
        this.under.frequency.value = this.wet ? 650 : 20000;
        this.under.Q.value = 0.5;
        this.under.connect(this.master);
        world = this.under;
      }
    } catch {
      this.under = null;
    }
    this.duckGain.connect(world);
    this.ambBus.connect(world);
    this.applySettings(true);
  }

  /** Fetches the manifest and decodes the effects marked `preload`. Never throws. */
  async load(base = 'audio/') {
    this.base = base;
    this.init();
    if (!this.ctx) return;
    // a bad connection can fail the download: keep trying for a while
    for (let i = 0; ; i++) {
      try {
        const json = await this.platform.loadJson<{ sounds: Record<string, SoundDef> }>(base + 'manifest.json');
        this.defs = json.sounds;
        break;
      } catch (e) {
        this.note('warn', `manifest failed ${errText(e)}`);
        if (i >= 5) return;
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
    this.ready = true;
    // the scene on screen may already want its music and ambience
    if (this.wantMusic) this.setMusic(this.wantMusic);
    if (this.wantAmb.length) this.setAmbience(this.wantAmb);
    await this.decodeAll(Object.keys(this.defs).filter((id) => this.defs[id].preload));
  }

  /** Decodes these sounds a few at a time, so they don't crowd out the pictures still being fetched. */
  private async decodeAll(ids: string[]) {
    for (let i = 0; i < ids.length; i += 3) await Promise.all(ids.slice(i, i + 3).map((id) => this.buffer(id)));
  }

  /** Starts fetching sounds a scene is about to need (a track for the next screen, a shop's effects). */
  preload(ids: string[]) {
    for (const id of ids) void this.buffer(id);
  }

  /**
   * Short of memory: forgets every decoded sound that isn't marked preload or playing right now (it's fetched again
   * the next time it's asked for), and lets go of finished sources.
   */
  trim() {
    const busy = new Set([this.music?.file, ...this.fading.map((t) => t.file), ...[...this.amb.keys()].map((k) => this.fileOf(k))]);
    let n = 0;
    for (const k of [...this.buffers.keys()]) {
      if (this.defs[k]?.preload || busy.has(k)) continue;
      this.buffers.delete(k);
      n++;
    }
    this.used = this.used.filter((k) => this.buffers.has(k));
    if (this.ctx) this.sweep(this.ctx.currentTime);
    this.note('warn', `trim ${n} -> bufs${this.buffers.size} alive${this.alive}`);
  }

  /** The entry whose file an id plays: itself, or the one it's a variant of. */
  private fileOf(id: string) {
    return this.defs[id]?.of ?? id;
  }

  private buffer(id: string): Promise<AudioBuffer | null> {
    const key = this.fileOf(id);
    const have = this.buffers.get(key);
    if (have) {
      this.touch(key);
      return Promise.resolve(have);
    }
    const pending = this.loading.get(key);
    if (pending) return pending;
    const def = this.defs[key];
    if (!def || !this.ctx) return Promise.resolve(null);
    const ctx = this.ctx;
    const p = this.platform
      .loadBinary(this.base + def.file)
      .then((data) => decode(ctx, data))
      .then((buf) => {
        this.buffers.set(key, buf);
        this.loading.delete(key);
        this.touch(key);
        return buf;
      })
      .catch((e) => {
        if (this.failNotes++ < 10) this.note('warn', `failed ${key} ${errText(e)}`);
        this.loading.delete(key);
        return null;
      });
    this.loading.set(key, p);
    return p;
  }

  /** Marks a decoded file as just used, and lets go of music and ambience nobody has used for a while. */
  private touch(key: string) {
    const i = this.used.indexOf(key);
    if (i >= 0) this.used.splice(i, 1);
    this.used.push(key);
    const kind = this.defs[key]?.kind;
    if (kind !== 'music' && kind !== 'amb') return;
    const keep = kind === 'music' ? KEEP_MUSIC : KEEP_AMB;
    const same = this.used.filter((k) => this.defs[k]?.kind === kind);
    const busy = new Set([this.music?.file, ...this.fading.map((t) => t.file), ...[...this.amb.keys()].map((k) => this.fileOf(k))]);
    for (const k of same.slice(0, Math.max(0, same.length - keep))) {
      if (busy.has(k)) continue;
      this.buffers.delete(k);
      this.used.splice(this.used.indexOf(k), 1);
    }
  }

  // ---------------------------------------------------------------- context state

  /** Runs inside a touch handler (both press and release: phones only count the release as a gesture). */
  unlock() {
    this.init();
    const ctx = this.ctx;
    if (!ctx || (ctx.state === 'running' && this.woke)) return;
    this.wake();
  }

  /** Off to the background, or the system has taken the sound (a call, an alarm). */
  suspend() {
    this.hidden = true;
    try {
      void this.ctx?.suspend()?.catch(() => undefined);
    } catch {
      /* closed */
    }
  }

  /** Back from the background, a phone call or Siri ('interrupted' on iPhone). */
  resume() {
    this.hidden = false;
    if (this.ctx && this.ctx.state !== 'running') this.wake();
  }

  /** Asks the context to run, then starts what was waiting for it. */
  private wake() {
    const ctx = this.ctx;
    if (!ctx) return;
    const n = ++this.wakes;
    const before = ctx.state;
    const done = () => {
      if (ctx !== this.ctx) return;
      if (n <= 12) this.note('info', `resume #${n} ${before} -> ${ctx.state}`);
      this.woke = true;
      this.kick();
    };
    try {
      const r = ctx.resume() as Promise<void> | undefined;
      if (r && typeof r.then === 'function') r.then(done, (e) => this.note('warn', `resume #${n} failed ${errText(e)}`));
      else done();
    } catch (e) {
      this.note('warn', `resume #${n} threw ${errText(e)}`);
    }
  }

  /** Console (and the platform's remote log, if it has one). */
  private note(level: 'info' | 'warn', msg: string) {
    console[level]('[audio] ' + msg);
    this.platform.log?.(level, 'audio ' + msg);
  }

  /** A one-line state of the sound, for the game's heartbeat in the remote log. */
  diag() {
    const ctx = this.ctx;
    if (!ctx) return 'audio none';
    const t = ctx.currentTime;
    return `audio ${ctx.state} t${Number.isFinite(t) ? t.toFixed(1) : t} ready${+this.ready} voices${this.voices.length} alive${this.alive} bufs${this.buffers.size} music:${this.music?.id ?? '-'} amb${this.amb.size} ramps${this.ramps.size}${this.hidden ? ' hidden' : ''}`;
  }

  private get live() {
    const ctx = this.ctx;
    if (!ctx || !this.ready || this.hidden) return false;
    return ctx.state === 'running';
  }

  /** Steps the fades when the context can't automate them, and drops ambience one-shots in. Call every frame. */
  update(dt: number) {
    if (!this.auto && this.ramps.size) {
      const k = (tc: number) => 1 - Math.exp(-dt / Math.max(0.001, tc));
      for (const [param, r] of this.ramps) {
        const v = param.value + (r.to - param.value) * k(r.tc);
        if (Math.abs(r.to - v) < 1e-4) {
          param.value = r.to;
          this.ramps.delete(param);
        } else param.value = v;
      }
    }
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    // the new track never arrived: let the old one go rather than play the wrong music forever
    if (this.wantMusic !== (this.music?.id ?? null) && this.music && now - this.wantAt > 3) this.fadeOutMusic(0.4);
    this.sweep(now);
    if (this.jingles.length) {
      this.jingles = this.jingles.filter((v) => !v.stopped && v.end > now);
      if (!this.jingles.length) this.applyDuck();
    }
    for (const a of this.amb.values()) {
      const s = a.def.spots;
      if (!s || now < a.next) continue;
      a.next = now + s.every[0] + Math.random() * (s.every[1] - s.every[0]);
      this.play(s.ids[Math.floor(Math.random() * s.ids.length)], { volume: (s.volume ?? 1) * (0.6 + Math.random() * 0.4), jitter: true });
    }
  }

  /** Lets go of finished voices, faded tracks and stopped loops: disconnected, so the engine stops carrying them. */
  private sweep(now: number) {
    if (this.fading.length) this.fading = this.fading.filter((t) => t.end > now || this.release(t.src, t.gain, t.filter));
    if (this.voices.length) this.voices = this.voices.filter((v) => v.end + 0.05 > now || this.release(v.src, v.gain));
    if (this.trash.length) this.trash = this.trash.filter((x) => x.at > now || this.release(...x.nodes));
  }

  /** Disconnects the nodes of one finished source (the source first); false, for use in a filter. */
  private release(...nodes: (AudioNode | null)[]): false {
    this.alive--;
    for (const n of nodes) {
      try {
        n?.disconnect();
      } catch {
        /* already disconnected */
      }
    }
    return false;
  }

  /** Moves a parameter smoothly to `to` (time constant `tc` seconds), with or without automation. */
  private ramp(param: AudioParam, to: number, tc: number) {
    // a bad number would make the automation throw and switch every later fade to the fallback: ignore it
    if (!Number.isFinite(to) || !Number.isFinite(tc)) return;
    // a time constant of 0 is a jump, which some contexts' setTargetAtTime gets wrong (NaN): just set it
    if (this.auto && this.ctx && tc > 0) {
      const now = this.ctx.currentTime;
      try {
        param.cancelScheduledValues(now);
        param.setValueAtTime(param.value, now);
        param.setTargetAtTime(to, now, tc);
        return;
      } catch {
        this.auto = false;
      }
    }
    if (tc <= 0) {
      if (this.auto && this.ctx) {
        try {
          param.cancelScheduledValues(this.ctx.currentTime);
        } catch {
          /* nothing scheduled */
        }
      }
      param.value = to;
      this.ramps.delete(param);
    } else this.ramps.set(param, { to, tc });
  }

  // ---------------------------------------------------------------- settings

  /** Music and effects switches and volumes (ambience counts as effects). */
  configure(s: Partial<AudioSettings>) {
    const was = { ...this.set };
    Object.assign(this.set, s);
    this.applySettings(false);
    // switched off: stop (and stop fetching); switched back on: carry on where it was
    if (was.music && !this.set.music) this.fadeOutMusic(0.1);
    if (was.sfx !== this.set.sfx) this.setAmbience(this.wantAmb);
    if (!was.music && this.set.music) this.kick();
  }

  /** Old single switch: both at once. */
  setEnabled(on: boolean) {
    this.configure({ music: on, sfx: on });
  }

  private applySettings(now: boolean) {
    const { music, sfx, musicVolume, sfxVolume } = this.set;
    const tc = now ? 0 : 0.05;
    if (this.musicBus) this.ramp(this.musicBus.gain, music ? clamp01(musicVolume) : 0, tc);
    if (this.sfxBus) this.ramp(this.sfxBus.gain, sfx ? clamp01(sfxVolume) : 0, tc);
    if (this.ambBus) this.ramp(this.ambBus.gain, sfx ? clamp01(sfxVolume) : 0, tc);
  }

  // ---------------------------------------------------------------- effects

  /**
   * Plays a one-shot effect. Variants rotate at random; `jitter` adds a little pitch spread. The same id
   * again within a few hundredths of a second is skipped, and each id has a cap on copies at once.
   * Jingles (manifest kind 'jingle') duck the music and wait for the previous jingle to finish.
   */
  play(id: string, o: { rate?: number; volume?: number; jitter?: boolean; delay?: number } = {}): SoundHandle | null {
    return this.playAs(id, o, false);
  }

  /** A short musical sting over the current track (day start, chapter clear …): ducks the music like a jingle. */
  stinger(id: string, o: { volume?: number; delay?: number } = {}): SoundHandle | null {
    return this.playAs(id, o, true);
  }

  private playAs(id: string, o: { rate?: number; volume?: number; jitter?: boolean; delay?: number }, sting: boolean): SoundHandle | null {
    const ctx = this.ctx;
    if (!ctx || !this.live || !this.set.sfx) return null;
    const def = this.defs[id];
    if (!def) return null;
    const now = ctx.currentTime;
    const at = now + (o.delay ?? 0);
    const last = this.lastPlay.get(id);
    if (last !== undefined && Math.abs(at - last) < (def.gap ?? GAP)) return null;
    this.lastPlay.set(id, at);
    const pool = [id, ...(def.variants || [])];
    const pickId = pool[Math.floor(Math.random() * pool.length)];
    const buf = this.buffers.get(this.fileOf(pickId)) ?? this.buffers.get(this.fileOf(id));
    if (!buf) {
      // not fetched yet: fetch it now and play it if it's still in time
      void this.buffer(pickId).then((b) => {
        if (b && this.live && ctx.currentTime - at < LATE) {
          this.lastPlay.delete(id);
          this.playAs(id, { ...o, delay: Math.max(0, at - ctx.currentTime) }, sting);
        }
      });
      return null;
    }
    const pdef = this.defs[pickId] ?? def;
    const rate = (o.rate ?? 1) * (pdef.rate ?? 1) * (o.jitter ? 0.94 + Math.random() * 0.12 : 1);
    const vol = pdef.volume * (o.volume ?? 1);
    if (sting || def.kind === 'jingle') return this.jingle(id, buf, at, rate, vol);
    return this.handle(this.start(id, buf, at, rate, vol, def.voices ?? VOICES));
  }

  private start(id: string, buf: AudioBuffer, at: number, rate: number, vol: number, cap: number, bus = this.sfxBus!): Voice {
    const ctx = this.ctx!;
    const on = this.voices.filter((v) => !v.stopped);
    const same = on.filter((v) => v.id === id);
    if (same.length >= cap) this.stopVoice(same[0], 0.03);
    if (on.length >= MAX_VOICES) this.stopVoice(on[0], 0.03);
    const src = ctx.createBufferSource();
    this.alive++;
    src.buffer = buf;
    setRate(src, rate);
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(g);
    g.connect(bus);
    src.start(at);
    const v: Voice = { id, src, gain: g, end: at + buf.duration / clampRate(rate), stopped: false };
    this.voices.push(v);
    return v;
  }

  private stopVoice(v: Voice, fade = 0.06) {
    if (v.stopped || !this.ctx) return;
    v.stopped = true;
    this.ramp(v.gain.gain, 0, fade / 3);
    const at = this.ctx.currentTime + fade + 0.02;
    v.end = Math.min(v.end, at);
    try {
      v.src.stop(at);
    } catch {
      /* already stopped */
    }
  }

  private handle(v: Voice): SoundHandle {
    return { stop: (fade = 0.06) => this.stopVoice(v, fade) };
  }

  /** A jingle (fanfare, chime, stinger): ducks the music while it plays and queues after the one before. */
  private jingle(id: string, buf: AudioBuffer, at: number, rate: number, vol: number): SoundHandle | null {
    const now = this.ctx!.currentTime;
    const busy = this.jingles.reduce((m, v) => Math.max(m, v.end), 0);
    // two in a row play one after the other instead of over each other (but don't wait for ever)
    const when = Math.max(at, busy - 0.08);
    if (when - now > 3) return null;
    const v = this.start(id, buf, when, rate, vol, Infinity);
    this.jingles.push(v);
    this.applyDuck();
    return this.handle(v);
  }

  /** Stops a jingle that's still ringing (a new track is starting; tapping on past the day's end card). */
  private cutJingles(fade = 0.3) {
    for (const v of this.jingles) this.stopVoice(v, fade);
    this.jingles = [];
    this.applyDuck();
  }

  /**
   * Starts a sound that can be stopped early: loops (ambience) or, with `once`, a one-shot like the
   * charge-up. Returns null while the sound isn't loaded yet (asking starts the download; ask again).
   */
  loop(id: string, o: { volume?: number; rate?: number; fadeIn?: number; once?: boolean } = {}): LoopHandle | null {
    const ctx = this.ctx;
    const def = this.defs[id];
    if (!ctx || !def || !this.live) return null;
    const buf = this.buffers.get(this.fileOf(id));
    if (!buf) {
      void this.buffer(id);
      return null;
    }
    const src = ctx.createBufferSource();
    this.alive++;
    src.buffer = buf;
    src.loop = !o.once;
    const [a, b] = loopRegion(buf, def).loop;
    src.loopStart = a;
    src.loopEnd = b;
    const rate = clampRate((o.rate ?? 1) * (def.rate ?? 1));
    setRate(src, rate);
    const g = ctx.createGain();
    const vol = def.volume * (o.volume ?? 1);
    g.gain.value = o.fadeIn ? 0 : vol;
    if (o.fadeIn) this.ramp(g.gain, vol, o.fadeIn / 3);
    src.connect(g);
    g.connect(def.kind === 'amb' ? this.ambBus! : this.sfxBus!);
    // start somewhere inside a long bed, so a scene change doesn't always restart the same birdsong
    const from = o.once ? 0 : def.kind === 'amb' ? a + Math.random() * (b - a) : a;
    src.start(ctx.currentTime, from);
    let stopped = false;
    // a one-shot is let go of when it's done even if nobody stops it
    const done = { at: o.once ? ctx.currentTime + buf.duration / rate + 0.1 : Infinity, nodes: [src, g] };
    this.trash.push(done);
    return {
      stop: (fade = 0.08) => {
        if (stopped) return;
        stopped = true;
        this.ramp(g.gain, 0, fade / 3);
        const at = ctx.currentTime + fade + 0.05;
        done.at = Math.min(done.at, at + 0.05);
        try {
          src.stop(at);
        } catch {
          /* already stopped */
        }
      },
      setRate: (r: number) => {
        if (stopped) return;
        if (this.auto) {
          try {
            src.playbackRate.setTargetAtTime(clampRate(r), ctx.currentTime, 0.03);
            return;
          } catch {
            /* fall through */
          }
        }
        setRate(src, r);
      },
    };
  }

  /**
   * Says something in a character's babble ("animalese"): `count` short syllables picked from `ids`, at a
   * pitch and pace that make the character (see VOICES in game/sound.ts). `bend` raises (or lowers) the
   * pitch toward the end, like a question or a happy lilt.
   */
  babble(ids: string[], o: { pitch?: number; pace?: number; count?: number; bend?: number; volume?: number; delay?: number } = {}) {
    if (!ids.length) return;
    const n = Math.max(1, o.count ?? 3);
    const pitch = o.pitch ?? 1;
    const step = 0.11 / (o.pace ?? 1);
    let prev = -1;
    for (let i = 0; i < n; i++) {
      let k = Math.floor(Math.random() * ids.length);
      if (k === prev && ids.length > 1) k = (k + 1) % ids.length;
      prev = k;
      const lift = n > 1 ? (o.bend ?? 0) * (i / (n - 1)) ** 2 : 0;
      const r = pitch * (1 + lift) * (0.96 + Math.random() * 0.08);
      // each syllable is its own id play, so give it a gap of zero by playing through `start`
      this.syllable(ids[k], (o.delay ?? 0) + i * step * (0.85 + Math.random() * 0.3), r, (o.volume ?? 1) * (i === n - 1 ? 1 : 0.85));
    }
  }

  private syllable(id: string, delay: number, rate: number, volume: number) {
    const ctx = this.ctx;
    const def = this.defs[id];
    if (!ctx || !def || !this.live || !this.set.sfx) return;
    const buf = this.buffers.get(this.fileOf(id));
    if (!buf) {
      void this.buffer(id);
      return;
    }
    this.start(id, buf, ctx.currentTime + delay, rate, def.volume * volume, 6);
  }

  /**
   * A synthesized hum whose pitch follows the caller, like the charge-up in 跳一跳: the longer the
   * pull, the higher it goes, so you can hear how far the jump will be.
   */
  tone(volume = 0.06): { setPitch(hz: number): void; stop(): void } | null {
    const ctx = this.ctx;
    if (!ctx || !this.live || !this.sfxBus || !this.set.sfx) return null;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    const g = ctx.createGain();
    g.gain.value = 0;
    this.ramp(g.gain, volume, 0.03);
    const g2 = ctx.createGain();
    g2.gain.value = 0.5;
    osc.connect(g);
    sub.connect(g2);
    g2.connect(g);
    g.connect(this.sfxBus);
    osc.start(now);
    sub.start(now);
    let stopped = false;
    return {
      setPitch: (hz: number) => {
        if (stopped) return;
        this.ramp(osc.frequency, hz, 0.02);
        this.ramp(sub.frequency, hz / 2, 0.02);
      },
      stop: () => {
        if (stopped) return;
        stopped = true;
        this.ramp(g.gain, 0, 0.03);
        try {
          osc.stop(ctx.currentTime + 0.2);
          sub.stop(ctx.currentTime + 0.2);
        } catch {
          /* its context has been replaced */
        }
      },
    };
  }

  // ---------------------------------------------------------------- music

  /**
   * Switches the background track (null = silence). The old track keeps playing until the new one is
   * decoded, then they crossfade; each track carries on from where it last stopped (`restart` starts it
   * over). A variant of the same file (bgm_hq → bgm_hq_low) morphs in place. A jingle still ringing from
   * the scene before fades out as the new track comes in.
   */
  setMusic(id: string | null, o: { restart?: boolean; fade?: number } = {}) {
    if (this.wantMusic !== id) this.wantAt = this.ctx?.currentTime ?? 0;
    this.wantMusic = id;
    this.paused = null;
    if (o.restart && id) this.pos.delete(this.fileOf(id));
    if (this.music?.id === id) return;
    if (!this.ready || !this.ctx) return;
    if (!id || !this.set.music) {
      this.fadeOutMusic(o.fade ?? 0.6);
      return;
    }
    void this.buffer(id).then((buf) => {
      if (!buf || this.wantMusic !== id || this.music?.id === id || !this.live || !this.set.music) return;
      const old = this.music;
      // a variant of the same file goes on from the same spot (unless asked to start over)
      const at = !o.restart && old && old.file === this.fileOf(id) ? this.position(old) : undefined;
      this.cutJingles(0.3);
      this.fadeOutMusic(o.fade ?? 0.8);
      this.startMusic(id, buf, at, o.fade ?? 0.8);
    });
  }

  /** Decodes a track ahead of time (the next scene's), so switching to it is instant. */
  prefetch(id: string) {
    if (this.defs[id] && this.set.music) void this.buffer(id);
  }

  /** Retries the wanted track (and ambience) once the first tap has unlocked audio. */
  kick() {
    if (this.wantMusic && !this.music && !this.paused && !this.loading.has(this.fileOf(this.wantMusic))) this.setMusic(this.wantMusic);
    if (this.wantAmb.some((id) => !this.amb.has(id))) this.setAmbience(this.wantAmb);
  }

  /** Stops the music (and the ambience beds) where they are (pause menu); `resumeMusic` carries on. */
  pauseMusic() {
    const m = this.music;
    for (const a of this.amb.values()) a.loop.stop(0.1);
    this.amb.clear();
    if (!m || !this.ctx) return;
    this.paused = { id: m.id, at: this.position(m) };
    this.fadeOutMusic(0.08);
  }

  resumeMusic() {
    const p = this.paused;
    this.paused = null;
    if (this.wantAmb.length) this.setAmbience(this.wantAmb);
    if (!p || this.wantMusic !== p.id) return;
    const buf = this.buffers.get(this.fileOf(p.id));
    if (buf && this.live && this.set.music) this.startMusic(p.id, buf, p.at, 0.3);
    else this.setMusic(p.id);
  }

  /** Seconds into the file where a track is now. */
  private position(t: Track) {
    const played = (this.ctx!.currentTime - t.start) * t.rate;
    const [a, b] = t.loop;
    if (t.from + played < b) return t.from + Math.max(0, played);
    return a + ((t.from + played - a) % (b - a));
  }

  private startMusic(id: string, buf: AudioBuffer, at: number | undefined, fade: number) {
    const ctx = this.ctx!;
    if (!this.live) return;
    const def = this.defs[id];
    const file = this.fileOf(id);
    const fdef = this.defs[file] ?? def;
    const src = ctx.createBufferSource();
    this.alive++;
    src.buffer = buf;
    src.loop = true;
    const { loop, lead } = loopRegion(buf, fdef);
    src.loopStart = loop[0];
    src.loopEnd = loop[1];
    const rate = clampRate(def.rate ?? 1);
    setRate(src, rate);
    const g = ctx.createGain();
    g.gain.value = 0;
    this.ramp(g.gain, def.volume, fade / 3);
    let filter: BiquadFilterNode | null = null;
    if (def.lowpass && typeof ctx.createBiquadFilter === 'function') {
      filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = def.lowpass;
      filter.Q.value = 0.6;
      src.connect(filter);
      filter.connect(g);
    } else src.connect(g);
    g.connect(this.musicBus!);
    // where it left off last time, else its intro (`from`), else the top of the loop
    let from = at ?? this.pos.get(file) ?? (fdef.from !== undefined ? lead + fdef.from : loop[0]);
    if (!(from >= 0 && from < loop[1])) from = loop[0];
    src.start(ctx.currentTime, from);
    this.music = { id, file, src, gain: g, filter, start: ctx.currentTime, from, loop, rate, end: Infinity };
  }

  private fadeOutMusic(fade = 0.6) {
    const m = this.music;
    if (!m || !this.ctx) return;
    this.pos.set(m.file, this.position(m));
    this.ramp(m.gain.gain, 0, fade / 3);
    m.end = this.ctx.currentTime + fade * 1.6 + 0.05;
    try {
      m.src.stop(m.end);
    } catch {
      /* already stopped */
    }
    this.fading.push(m);
    this.music = null;
  }

  /** Lowers the music a little (a generic duck; the river uses `underwater`). */
  duck(on: boolean) {
    this.ducked = on;
    this.applyDuck();
  }

  /** Under the river: music and ambience go muffled and a little quieter; effects stay clear. */
  underwater(on: boolean) {
    this.wet = on;
    if (this.under) this.ramp(this.under.frequency, on ? 650 : 20000, on ? 0.08 : 0.25);
    this.applyDuck();
  }

  private applyDuck() {
    if (!this.duckGain) return;
    let g = 1;
    if (this.ducked) g = Math.min(g, DUCK_ON);
    if (this.wet) g = Math.min(g, this.under ? 0.7 : DUCK_ON);
    if (this.jingles.length) g = Math.min(g, DUCK_JINGLE);
    this.ramp(this.duckGain.gain, g, this.jingles.length ? 0.05 : 0.2);
  }

  // ---------------------------------------------------------------- ambience

  /**
   * The ambience beds for the scene (see game/sound.ts), crossfading from the last set. Beds with
   * `spots` in the manifest drop their one-shots in by themselves (thunder in the rain, gulls by the sea).
   */
  setAmbience(ids: string[] | string | null) {
    const list = ids === null ? [] : typeof ids === 'string' ? [ids] : ids;
    const want = this.ready ? list.filter((id) => this.defs[id]) : list;
    this.wantAmb = want;
    if (!this.ready || !this.ctx) return;
    for (const [id, a] of this.amb) {
      if (want.includes(id) && this.set.sfx) continue;
      a.loop.stop(1.5);
      this.amb.delete(id);
    }
    if (!this.set.sfx) return;
    for (const id of want) {
      if (this.amb.has(id)) continue;
      void this.buffer(id).then(() => {
        if (!this.wantAmb.includes(id) || this.amb.has(id) || !this.set.sfx) return;
        const loop = this.loop(id, { fadeIn: 2 });
        const def = this.defs[id];
        if (loop) this.amb.set(id, { loop, def, next: this.ctx!.currentTime + (def.spots ? def.spots.every[0] * Math.random() : 0) });
      });
    }
  }
}

const errText = (e: unknown) => String((e as { errMsg?: string; message?: string })?.errMsg ?? (e as { message?: string })?.message ?? e).slice(0, 120);

function decode(ctx: AudioContext, data: ArrayBuffer): Promise<AudioBuffer> {
  // Callback form for older Safari and the wx WebAudio context.
  return new Promise((resolve, reject) => {
    const r = ctx.decodeAudioData(data, resolve, reject);
    if (r && typeof (r as Promise<AudioBuffer>).then === 'function') (r as Promise<AudioBuffer>).then(resolve, reject);
  });
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const clampRate = (r: number) => Math.max(0.1, Math.min(MAX_RATE, r || 1));

/** Sets a source's speed, also where playbackRate is a plain number rather than an AudioParam. */
function setRate(src: AudioBufferSourceNode, r: number) {
  const pr = src.playbackRate as AudioParam | number;
  if (typeof pr === 'object' && pr) pr.value = clampRate(r);
  else (src as unknown as { playbackRate: number }).playbackRate = clampRate(r);
}

/**
 * Loop region of a decoded file: the manifest's `loopAt` counted from the first sample that isn't the
 * encoder's silent padding (`lead`), or else the whole file with the padding cut off both ends, so loops
 * don't click.
 */
function loopRegion(buf: AudioBuffer, def: SoundDef | undefined): { loop: [number, number]; lead: number } {
  const [a, b] = soundEdges(buf);
  const lead = a / buf.sampleRate;
  if (def?.loopAt) {
    const end = Math.min(buf.duration, lead + def.loopAt[1]);
    return { loop: [Math.min(end - 0.05, lead + def.loopAt[0]), end], lead };
  }
  return { loop: [lead, (b + 1) / buf.sampleRate], lead };
}

const edges = new WeakMap<AudioBuffer, [number, number]>();
/** How far the encoder's padding reaches into each end of a file. */
const EDGE = 1 << 15;

/**
 * First and last sample that aren't the encoder's silent padding: worked out once per buffer, and only from its two
 * ends (WeChat's getChannelData copies the whole track out of its engine every time it's asked).
 */
function soundEdges(buf: AudioBuffer): [number, number] {
  let e = edges.get(buf);
  if (e) return e;
  const n = buf.length;
  const k = Math.min(n, EDGE);
  const head = new Float32Array(k);
  const tail = new Float32Array(k);
  try {
    buf.copyFromChannel(head, 0, 0);
    buf.copyFromChannel(tail, 0, n - k);
  } catch {
    const d = buf.getChannelData(0);
    head.set(d.subarray(0, k));
    tail.set(d.subarray(n - k));
  }
  let a = 0;
  while (a < k - 1 && Math.abs(head[a]) < 1e-4) a++;
  let b = k - 1;
  while (b > 0 && Math.abs(tail[b]) < 1e-4) b--;
  e = [a, Math.max(a, n - k + b)];
  edges.set(buf, e);
  return e;
}
