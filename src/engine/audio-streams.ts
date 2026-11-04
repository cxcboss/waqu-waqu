import type { Platform, Stream } from '../platform/types';
import type { Audio, AudioSettings, BabbleOptions, LoopHandle, LoopOptions, PlayOptions, SoundDef, SoundHandle } from './audio';

/** Overall level: every sound is its own player, mixed by the system with no limiter after it. */
const MASTER = 0.7;
/** Same id within this long is one sound (two copies at once just sound louder). */
const GAP = 0.04;
/** Android plays at most ten sounds at once (WeChat's audio notes): beds and effects together stay under that. */
const MAX_PLAYING = 9;
/** Effects at once, at most (fewer while many beds play). */
const MAX_SHOTS = 5;
/** Effect players kept for reuse, playing or not: the least recently used idle one goes first. */
const KEEP_SHOTS = 16;
/** Copies of one effect at once (the manifest's `voices`, up to this). */
const SAME = 3;
/** Beds (music, ambience, loops) kept paused for next time, besides the ones playing. */
const KEEP_BEDS = 4;
/** Ambience beds at once: the third (frogs in early summer) is left out. */
const MAX_AMB = 2;
/** Music level while a jingle plays over it, and under water (there's no low-pass here). */
const DUCK_JINGLE = 0.35;
const DUCK_WET = 0.4;
/** While a level moves, a player's volume is set at most this often (seconds): each set is a call into the system. */
const VOLUME_EVERY = 0.08;
/** Least time between two attempts to restart a bed the system has paused by itself. */
const HEAL_EVERY = 3;

/** A looping sound (music, an ambience bed, the truck's engine) on its own player, faded by its volume. */
interface Bed {
  id: string;
  file: string;
  kind: 'music' | 'amb' | 'loop';
  def: SoundDef;
  s: Stream;
  /** Its volume now (before the switches, duck and master), where it's heading, and how fast (time constant, s). */
  level: number;
  to: number;
  tc: number;
  /** The volume last handed to the player, and when. */
  sent: number;
  sentAt: number;
  /** Playing or fading; false once faded out and paused (it carries on from there if it's wanted again). */
  on: boolean;
  /** When play() was last asked for, and when it went quiet. */
  playAt: number;
  idleAt: number;
  /** Where its player was at the last touch (see `unlock`). */
  seen: number;
  /** Bumped each time the bed is taken again, so an old handle can't stop the new use. */
  gen: number;
  /** Ambience: when its next one-shot (`spots`) drops in. */
  next: number;
}

/** A player for one effect file, reused for the next play once it's done. */
interface Shot {
  file: string;
  s: Stream;
  busy: boolean;
  jingle: boolean;
  /** When it was started, and when it's taken to be done even if the player never says so. */
  at: number;
  end: number;
  gen: number;
}

/**
 * The mini game's sound (see docs/audio.md, 微信小游戏): every sound plays on the system's own player
 * (`platform.createStream`, InnerAudioContext), as WeChat's audio notes advise for music and as the engines built
 * for WeChat do for all of it, instead of Web Audio, which broke up on Android phones. Nothing is decoded into memory.
 *
 * Music, ambience and loops are beds: one looping player per file, faded by stepping its volume from `update()`,
 * paused when faded out and kept for next time, so going back to a track carries on where it was. Effects reuse a
 * small pool of players per file. The system mixes them all; there are no filters or pitch changes (rate, jitter
 * and a character's voice pitch are left out), and no more than MAX_PLAYING sound at once.
 */
export class StreamAudio implements Audio {
  private set: AudioSettings = { music: true, sfx: true, musicVolume: 1, sfxVolume: 1 };
  private defs: Record<string, SoundDef> = {};
  private base = 'audio/';
  private ready = false;
  /** In the background, or the system has taken the sound. */
  private hidden = false;
  private beds: Bed[] = [];
  private shots: Shot[] = [];
  private music: Bed | null = null;
  private wantMusic: string | null = null;
  /** The track stopped by the pause menu, to pick up again. */
  private paused: string | null = null;
  private amb = new Map<string, Bed>();
  private wantAmb: string[] = [];
  private lastPlay = new Map<string, number>();
  private timers = new Set<ReturnType<typeof setTimeout>>();
  /** When the last queued jingle ends, and how many times jingles have been cut (queued ones from before don't play). */
  private jingleUntil = 0;
  private cuts = 0;
  private wet = false;
  /** The music duck now, eased toward what it should be. */
  private duck = 1;
  private healAt = -1e9;

  constructor(private platform: Platform) {}

  get settings(): Readonly<AudioSettings> {
    return this.set;
  }

  private get now() {
    return this.platform.now() / 1000;
  }

  init() {
    // players are made when a sound is first asked for
  }

  async load(base = 'audio/') {
    this.base = base;
    // a bad connection can fail the download (the sound is a subpackage): keep trying for a while
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
    this.note('info', `streams ready ${Object.keys(this.defs).length} sounds`);
    this.kick();
  }

  preload() {
    // nothing to decode: a file is opened by its player the first time it plays
  }

  /** Lets go of every player that isn't playing (a new one is made when the sound is next asked for). */
  trim() {
    const shots = this.shots.filter((s) => !s.busy);
    for (const s of shots) this.dropShot(s);
    const beds = this.beds.filter((b) => !b.on);
    for (const b of beds) this.dropBed(b);
    this.note('warn', `trim ${shots.length}+${beds.length} -> shots${this.shots.length} beds${this.beds.length}`);
  }

  private fileOf(id: string) {
    return this.defs[id]?.of ?? id;
  }

  // ---------------------------------------------------------------- lifecycle

  /**
   * A touch: a bed the system has paused by itself (a call, another app's sound) is started again. It has to say
   * it's paused and not have moved since the touch before (at least HEAL_EVERY earlier).
   */
  unlock() {
    const now = this.now;
    if (!this.ready || this.hidden || now - this.healAt < HEAL_EVERY) return;
    this.healAt = now;
    const stuck: Bed[] = [];
    for (const b of this.beds) {
      if (!b.on) continue;
      const t = b.s.time;
      if (b.s.paused && t === b.seen && now - b.playAt > 1.5) stuck.push(b);
      b.seen = t;
    }
    for (const b of stuck) this.playBed(b);
    if (stuck.length) this.note('info', `restarted ${stuck.map((b) => b.id).join(',')}`);
  }

  suspend() {
    this.hidden = true;
    for (const b of this.beds) if (b.on) b.s.pause();
    for (const s of this.shots) this.finish(s);
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }

  /** Back from the background or an interruption: WeChat's notes say to play() again on every return. */
  resume() {
    this.hidden = false;
    for (const b of this.beds) if (b.on) this.playBed(b);
    this.kick();
  }

  /** Brings the music and ambience in line with what the scene wants. */
  kick() {
    if (!this.ready) return;
    if (!this.paused && (this.music?.id ?? null) !== this.wantMusic) this.setMusic(this.wantMusic);
    if (!this.paused) this.setAmbience(this.wantAmb);
  }

  private note(level: 'info' | 'warn', msg: string) {
    console[level]('[audio] ' + msg);
    this.platform.log?.(level, 'audio ' + msg);
  }

  diag() {
    const m = this.music;
    const music = m ? `${m.id}@${m.s.time.toFixed(0)}s v${m.sent.toFixed(2)}${m.s.paused ? ' paused' : ''}` : '-';
    const on = this.beds.filter((b) => b.on).length;
    const busy = this.shots.filter((s) => s.busy).length;
    return `audio streams ready${+this.ready} music:${music} amb:${[...this.amb.keys()].join(',') || '-'} beds${on}/${this.beds.length} shots${busy}/${this.shots.length}${this.hidden ? ' hidden' : ''}`;
  }

  /** Eases the beds' levels into their players' volumes, lets go of finished effects, drops ambience one-shots in. */
  update(dt: number) {
    const now = this.now;
    const k = (tc: number) => 1 - Math.exp(-dt / Math.max(0.001, tc));
    const jingle = now < this.jingleUntil;
    const duck = Math.min(jingle ? DUCK_JINGLE : 1, this.wet ? DUCK_WET : 1);
    this.duck += (duck - this.duck) * k(jingle ? 0.05 : 0.2);
    if (Math.abs(duck - this.duck) < 1e-3) this.duck = duck;
    for (const b of this.beds) {
      if (!b.on) continue;
      b.level += (b.to - b.level) * k(b.tc);
      if (Math.abs(b.to - b.level) < 1e-3) b.level = b.to;
      this.send(b, now, b.level === b.to && (b.kind !== 'music' || this.duck === duck));
      if (b.to === 0 && b.level === 0) this.rest(b, now);
    }
    for (const s of this.shots) if (s.busy && now > s.end) this.finish(s);
    if (this.hidden) return;
    for (const b of this.amb.values()) {
      const sp = b.def.spots;
      if (!sp || now < b.next) continue;
      b.next = now + sp.every[0] + Math.random() * (sp.every[1] - sp.every[0]);
      this.play(sp.ids[Math.floor(Math.random() * sp.ids.length)], { volume: (sp.volume ?? 1) * (0.6 + Math.random() * 0.4) });
    }
  }

  /** Hands a bed's volume to its player: while it moves, only every VOLUME_EVERY and by a step worth hearing. */
  private send(b: Bed, now: number, settled: boolean) {
    const bus = b.kind === 'music' ? this.bus('music') * this.duck : this.bus('sfx');
    const v = clamp01(b.level * bus * MASTER);
    if (v === b.sent) return;
    if (!settled && (now - b.sentAt < VOLUME_EVERY || Math.abs(v - b.sent) < 0.02)) return;
    b.s.volume = v;
    b.sent = v;
    b.sentAt = now;
  }

  private bus(which: 'music' | 'sfx') {
    const { music, sfx, musicVolume, sfxVolume } = this.set;
    return which === 'music' ? (music ? clamp01(musicVolume) : 0) : sfx ? clamp01(sfxVolume) : 0;
  }

  // ---------------------------------------------------------------- settings

  configure(s: Partial<AudioSettings>) {
    const was = { ...this.set };
    Object.assign(this.set, s);
    // volumes reach the beds on the next update; switched off: stop; switched back on: carry on where it was
    if (was.music && !this.set.music) {
      this.fadeOut(this.music, 0.1);
      this.music = null;
    }
    if (was.sfx !== this.set.sfx) this.setAmbience(this.wantAmb);
    if (!was.music && this.set.music) this.kick();
  }

  // ---------------------------------------------------------------- beds

  /**
   * Gets the bed for a sound's file going, fading in to `level` over `fade` seconds: the one already there if
   * there is one (still fading out, or paused where it was last time), or a new player.
   */
  private take(id: string, kind: Bed['kind'], level: number, fade: number): Bed | null {
    const def = this.defs[id];
    if (!def) return null;
    const file = this.fileOf(id);
    let b = this.beds.find((x) => x.file === file);
    if (!b) {
      const s = this.platform.createStream!(this.base + (this.defs[file] ?? def).file, { loop: true, volume: 0 });
      b = { id, file, kind, def, s, level: 0, to: 0, tc: 0.1, sent: 0, sentAt: -1, on: false, playAt: 0, idleAt: 0, seen: -1, gen: 0, next: 0 };
      this.beds.push(b);
    }
    Object.assign(b, { id, kind, def, to: level, tc: Math.max(0.01, fade / 3) });
    b.gen++;
    if (!b.on) {
      b.on = true;
      if (fade <= 0) b.level = level;
      this.send(b, this.now, true);
      if (!this.hidden) this.playBed(b);
    }
    return b;
  }

  private playBed(b: Bed) {
    b.playAt = this.now;
    b.s.play();
  }

  private fadeOut(b: Bed | null, fade: number) {
    if (!b) return;
    b.to = 0;
    b.tc = Math.max(0.01, fade / 3);
  }

  /** A bed that has faded out: paused where it is and kept, and the oldest quiet ones let go of. */
  private rest(b: Bed, now: number) {
    b.on = false;
    b.idleAt = now;
    b.s.pause();
    const idle = this.beds.filter((x) => !x.on).sort((x, y) => x.idleAt - y.idleAt);
    for (const x of idle.slice(0, Math.max(0, idle.length - KEEP_BEDS))) this.dropBed(x);
  }

  private dropBed(b: Bed) {
    b.s.destroy();
    this.beds.splice(this.beds.indexOf(b), 1);
  }

  // ---------------------------------------------------------------- effects

  /**
   * Plays a one-shot effect (a variant at random). The same id again within its `gap` is skipped. Jingles duck
   * the music and wait for the jingle before them to finish.
   */
  play(id: string, o: PlayOptions = {}): SoundHandle | null {
    if (!this.ready || this.hidden || !this.set.sfx) return null;
    const def = this.defs[id];
    if (!def) return null;
    const now = this.now;
    const at = now + Math.max(0, o.delay ?? 0);
    const last = this.lastPlay.get(id);
    if (last !== undefined && Math.abs(at - last) < (def.gap ?? GAP)) return null;
    this.lastPlay.set(id, at);
    const pool = [id, ...(def.variants || [])];
    const pick = pool[Math.floor(Math.random() * pool.length)];
    const pdef = this.defs[pick] ?? def;
    const vol = pdef.volume * (o.volume ?? 1);
    const jingle = def.kind === 'jingle';
    let when = at;
    if (jingle) {
      // two in a row play one after the other instead of over each other (but don't wait for ever)
      when = Math.max(at, this.jingleUntil - 0.08);
      if (when - now > 3) return null;
      this.jingleUntil = when + (pdef.duration ?? 1.5);
    }
    let cut = false;
    let shot: Shot | null = null;
    let gen = 0;
    const cuts = this.cuts;
    const go = () => {
      if (cut || this.hidden || !this.set.sfx || (jingle && this.cuts !== cuts)) return;
      shot = this.start(pick, vol, def.voices, jingle);
      gen = shot?.gen ?? 0;
    };
    if (when - now > 0.01) this.later(when - now, go);
    else go();
    return {
      stop: () => {
        cut = true;
        const s = shot as Shot | null;
        if (s && s.gen === gen) this.finish(s);
      },
    };
  }

  /** Starts an effect file on an idle player of its own (a new one if there's room), making room among the rest. */
  private start(id: string, vol: number, voices: number | undefined, jingle: boolean): Shot | null {
    const file = this.fileOf(id);
    const fdef = this.defs[file] ?? this.defs[id];
    if (!fdef) return null;
    const mine = this.shots.filter((s) => s.file === file);
    let s = mine.find((x) => !x.busy) ?? null;
    if (!s) {
      // every copy is still playing: one more is skipped rather than cut in on
      if (mine.length >= Math.max(1, Math.min(SAME, voices ?? 2))) return null;
      s = this.newShot(file, fdef);
      if (!s) return null;
    }
    const busy = this.shots.filter((x) => x.busy);
    const room = Math.max(1, Math.min(MAX_SHOTS, MAX_PLAYING - this.beds.filter((b) => b.on).length));
    if (busy.length >= room) {
      const old = busy.filter((x) => !x.jingle).sort((a, b) => a.at - b.at)[0];
      if (!old) return null;
      this.finish(old);
    }
    const now = this.now;
    Object.assign(s, { busy: true, jingle, at: now, end: now + (fdef.duration ?? 2) + 0.5 });
    s.gen++;
    s.s.volume = clamp01(vol * this.bus('sfx') * MASTER);
    s.s.play();
    return s;
  }

  private newShot(file: string, def: SoundDef): Shot | null {
    if (this.shots.length >= KEEP_SHOTS) {
      const idle = this.shots.filter((x) => !x.busy).sort((a, b) => a.at - b.at)[0];
      if (!idle) return null;
      this.dropShot(idle);
    }
    const shot: Shot = { file, s: null as unknown as Stream, busy: false, jingle: false, at: 0, end: 0, gen: 0 };
    shot.s = this.platform.createStream!(this.base + def.file, { loop: false, volume: 0, onEnd: () => this.finish(shot) });
    this.shots.push(shot);
    return shot;
  }

  /** An effect is done (or cut short): its player goes back to the top, ready for the next play. */
  private finish(s: Shot) {
    if (!s.busy) return;
    s.busy = false;
    s.s.stop();
  }

  private dropShot(s: Shot) {
    s.s.destroy();
    this.shots.splice(this.shots.indexOf(s), 1);
  }

  private later(sec: number, f: () => void) {
    const t = setTimeout(() => {
      this.timers.delete(t);
      f();
    }, sec * 1000);
    this.timers.add(t);
  }

  /** A looping effect that's stopped by hand (the truck's engine, bubbles under water); `once` plays it through. */
  loop(id: string, o: LoopOptions = {}): LoopHandle | null {
    const def = this.defs[id];
    if (!def || !this.ready || !this.set.sfx) return null;
    if (o.once) {
      const h = this.play(id, { volume: o.volume });
      return h && { stop: () => h.stop(), setRate: () => undefined };
    }
    const b = this.take(id, 'loop', def.volume * (o.volume ?? 1), o.fadeIn ?? 0);
    if (!b) return null;
    const gen = b.gen;
    return {
      stop: (fade = 0.08) => {
        if (b.gen === gen) this.fadeOut(b, fade);
      },
      // the system's player only takes a few speeds, and changing it doesn't change the pitch: left as it is
      setRate: () => undefined,
    };
  }

  /** A character's babble: its syllables one after another, at its pace (its pitch can't be changed here). */
  babble(ids: string[], o: BabbleOptions = {}) {
    if (!ids.length) return;
    const n = Math.max(1, o.count ?? 3);
    const step = 0.11 / (o.pace ?? 1);
    let prev = -1;
    for (let i = 0; i < n; i++) {
      let k = Math.floor(Math.random() * ids.length);
      if (k === prev && ids.length > 1) k = (k + 1) % ids.length;
      prev = k;
      this.play(ids[k], { delay: (o.delay ?? 0) + i * step * (0.85 + Math.random() * 0.3), volume: (o.volume ?? 1) * (i === n - 1 ? 1 : 0.85) });
    }
  }

  /** No synthesized sound here (it needs Web Audio). */
  tone() {
    return null;
  }

  // ---------------------------------------------------------------- music

  /**
   * Switches the background track (null = silence), crossfading. A track carries on from where it last stopped
   * while its player is still kept; a variant of the same file (bgm_hq → bgm_hq_low) only changes the level.
   */
  setMusic(id: string | null, o: { restart?: boolean; fade?: number } = {}) {
    this.wantMusic = id;
    this.paused = null;
    if (!this.ready) return;
    const cur = this.music;
    if (cur && cur.id === id) return;
    const def = id ? this.defs[id] : undefined;
    if (!id || !def || !this.set.music) {
      this.fadeOut(cur, o.fade ?? 0.6);
      this.music = null;
      return;
    }
    const fade = o.fade ?? 0.8;
    if (cur && cur.file === this.fileOf(id)) {
      Object.assign(cur, { id, def, to: def.volume, tc: Math.max(0.01, fade / 3) });
      return;
    }
    this.cutJingles();
    this.fadeOut(cur, fade);
    const b = this.take(id, 'music', def.volume, fade);
    if (b && o.restart) {
      b.s.stop();
      if (!this.hidden) this.playBed(b);
    }
    this.music = b;
  }

  /** Stops a jingle that's still ringing or queued (a new track is starting). */
  private cutJingles() {
    this.cuts++;
    this.jingleUntil = 0;
    for (const s of this.shots) if (s.jingle) this.finish(s);
  }

  /** Stops the music (and the ambience) where it is, for the pause menu; `resumeMusic` carries on. */
  pauseMusic() {
    for (const b of this.amb.values()) this.fadeOut(b, 0.1);
    this.amb.clear();
    if (!this.music) return;
    this.paused = this.music.id;
    this.fadeOut(this.music, 0.08);
    this.music = null;
  }

  resumeMusic() {
    const p = this.paused;
    this.paused = null;
    this.setAmbience(this.wantAmb);
    if (p && this.wantMusic === p) this.setMusic(p, { fade: 0.3 });
  }

  /** Under the river: the music goes quieter (there's no low-pass to muffle it). */
  underwater(on: boolean) {
    this.wet = on;
  }

  // ---------------------------------------------------------------- ambience

  /** The ambience beds for the scene (the first MAX_AMB of them), crossfading from the last set. */
  setAmbience(ids: string[] | string | null) {
    const list = ids === null ? [] : typeof ids === 'string' ? [ids] : ids;
    this.wantAmb = this.ready ? list.filter((id) => this.defs[id]) : list;
    if (!this.ready) return;
    const on = this.set.sfx ? this.wantAmb.slice(0, MAX_AMB) : [];
    for (const [id, b] of this.amb) {
      if (on.includes(id)) continue;
      this.fadeOut(b, 1.5);
      this.amb.delete(id);
    }
    const now = this.now;
    for (const id of on) {
      if (this.amb.has(id)) continue;
      const def = this.defs[id];
      const b = this.take(id, 'amb', def.volume, 2);
      if (!b) continue;
      b.next = now + (def.spots ? def.spots.every[0] * Math.random() : 0);
      this.amb.set(id, b);
    }
  }
}

const errText = (e: unknown) => String((e as { errMsg?: string; message?: string })?.errMsg ?? (e as { message?: string })?.message ?? e).slice(0, 120);
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
