// Platform adapter: the only layer that touches browser or wx.* APIs.
// Game code depends on this interface; web.ts implements it for browsers,
// wx.ts for the WeChat mini game (built by scripts/build_wx.py).

export type Canvas = HTMLCanvasElement;
export type Ctx = CanvasRenderingContext2D;
export type ImageSource = CanvasImageSource & { width: number; height: number };

export type TouchKind = 'start' | 'move' | 'end' | 'cancel';
/** 'album': it's in the phone's photos (WeChat); 'denied': the player hasn't let the game save there. */
export type SaveResult = 'shared' | 'downloaded' | 'album' | 'longpress' | 'cancelled' | 'denied' | 'failed';
/** Pointer position in CSS pixels relative to the main canvas. */
export interface TouchPoint {
  id: number;
  x: number;
  y: number;
}

/**
 * A sound file on the system's own player (the mini game's InnerAudioContext): nothing decoded into memory, each
 * one mixed by the system. The mini game plays every sound this way (see docs/audio.md, 微信小游戏).
 */
export interface Stream {
  /** Starts, or carries on after `pause`; after `stop` (or the end) it starts over. */
  play(): void;
  pause(): void;
  /** Stops and goes back to the top. */
  stop(): void;
  /** Not making sound right now (not started yet, paused, stopped or done). */
  readonly paused: boolean;
  /** Seconds into the file. */
  readonly time: number;
  /** 0–1. */
  volume: number;
  /** Lets go of the player for good. */
  destroy(): void;
}

export interface ScreenInfo {
  /** CSS size of the main canvas. */
  width: number;
  height: number;
  /** Device pixel ratio, already capped. */
  dpr: number;
  /** Safe-area insets in CSS pixels (notch, home indicator). */
  safeTop: number;
  safeBottom: number;
}

export interface Platform {
  readonly kind: 'web' | 'wx';
  readonly canvas: Canvas;
  /** Pictures laid over the game with `showImage` can be long-pressed and saved (browsers; not the mini game). */
  readonly longPressSave: boolean;
  /** Measures the screen and sizes the main canvas to match. */
  screen(): ScreenInfo;
  onResize(cb: () => void): void;
  onTouch(cb: (kind: TouchKind, t: TouchPoint) => void): void;
  /** Mouse wheel / trackpad scroll, in screen pixels (web only). */
  onWheel?(cb: (dy: number) => void): void;
  onVisibility(cb: (visible: boolean) => void): void;
  /**
   * Every event the system counts as a user gesture (on phones that's the finger lifting, not landing),
   * so sound can be unlocked inside it.
   */
  onGesture(cb: () => void): void;

  createCanvas(w: number, h: number): Canvas;
  loadImage(src: string): Promise<ImageSource>;
  /** Reads a packaged file (audio) as bytes. */
  loadBinary(url: string): Promise<ArrayBuffer>;
  /** Reads a packaged text file (UTF-8). */
  loadText(url: string): Promise<string>;
  /** Reads and parses a packaged JSON file (manifests). */
  loadJson<T = unknown>(url: string): Promise<T>;
  /** Loads a font file and registers it under `family`. Resolves even on failure. */
  loadFont(family: string, url: string): Promise<boolean>;

  storageGet(key: string): string | null;
  /** False when it couldn't be kept (storage full, private mode). */
  storageSet(key: string, value: string): boolean;
  storageRemove(key: string): void;

  /** Web Audio compatible context, or null when audio is unavailable. */
  createAudioContext(): AudioContext | null;
  /**
   * A packaged sound file on the system's player instead of Web Audio (the mini game, where all sound goes this way:
   * WeChat's notes and the engines built for it play sound with InnerAudioContext). `onEnd` is called when a sound
   * that doesn't loop has played to its end. Not on the web.
   */
  createStream?(url: string, o: { loop: boolean; volume: number; onEnd?: () => void }): Stream;
  /** Hints that now is a good time to collect garbage (between scenes). */
  gc?(): void;
  /** The system is short of memory: let go of whatever can be fetched or drawn again. */
  onMemoryWarning?(cb: () => void): void;
  /**
   * A line for the developer's remote log (the mini game's 实时日志 in the WeChat admin: WE分析 → 性能质量 →
   * 实时日志), for problems that only show on players' phones. Keep it to a handful of lines a minute.
   */
  log?(level: 'info' | 'warn' | 'error', msg: string): void;

  vibrate(ms: number): void;
  /**
   * Hands a picture to the player to keep: the share sheet on iPhone (where "Save Image" puts it
   * in Photos), a download elsewhere. 'longpress' means this browser can't do either (WeChat's)
   * and the player should long-press the picture shown with `showImage` instead.
   */
  saveImage(canvas: Canvas, filename: string): Promise<SaveResult>;
  /** Starts encoding a picture that may be saved soon, so saving can still run inside the tap. */
  prepareImage(canvas: Canvas): void;
  /**
   * Lays a real image of `canvas` over the game at `rect` (CSS pixels from the game canvas'
   * top-left) so it can be long-pressed and saved like any picture; null takes it away.
   */
  showImage(canvas: Canvas | null, rect?: { x: number; y: number; w: number; h: number }): void;
  share(opts: { title: string; canvas?: Canvas }): void;
  /** A small JPEG of `canvas` as a data URL, for keeping photos in storage; null if it can't be made. */
  encodeImage(canvas: Canvas, quality: number): string | null;
  /** Asks the player to type a short text (the frog's name); null when cancelled. */
  promptText(title: string, value: string, maxLength: number): Promise<string | null>;

  /** Coarse, non-identifying facts for the play statistics: system, browser or host app, screen size. */
  deviceInfo(): Record<string, string | number | boolean>;
  /** POSTs a JSON body; resolves to the HTTP status, or 0 when it didn't get through. */
  postJson(url: string, body: string, headers: Record<string, string>, keepalive?: boolean): Promise<number>;
  /** Uncaught errors, for the play statistics. */
  onError(cb: (msg: string, where: string) => void): void;

  now(): number;
  requestFrame(cb: (t: number) => void): void;
}
