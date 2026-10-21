// Platform adapter: the only layer that touches browser or wx.* APIs.
// Game code depends on this interface; web.ts implements it for browsers,
// and a wx.ts implementation will be added for the WeChat mini game build.

export type Canvas = HTMLCanvasElement;
export type Ctx = CanvasRenderingContext2D;
export type ImageSource = CanvasImageSource & { width: number; height: number };

export type TouchKind = 'start' | 'move' | 'end' | 'cancel';
export type SaveResult = 'shared' | 'downloaded' | 'longpress' | 'cancelled' | 'failed';
/** Pointer position in CSS pixels relative to the main canvas. */
export interface TouchPoint {
  id: number;
  x: number;
  y: number;
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
  /** Measures the screen and sizes the main canvas to match. */
  screen(): ScreenInfo;
  onResize(cb: () => void): void;
  onTouch(cb: (kind: TouchKind, t: TouchPoint) => void): void;
  onVisibility(cb: (visible: boolean) => void): void;

  createCanvas(w: number, h: number): Canvas;
  loadImage(src: string): Promise<ImageSource>;
  /** Reads a packaged file (audio, json) as bytes. */
  loadBinary(url: string): Promise<ArrayBuffer>;
  /** Loads a font file and registers it under `family`. Resolves even on failure. */
  loadFont(family: string, url: string): Promise<boolean>;

  storageGet(key: string): string | null;
  storageSet(key: string, value: string): void;

  /** Web Audio compatible context, or null when audio is unavailable. */
  createAudioContext(): AudioContext | null;

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

  /** Coarse, non-identifying facts for the play statistics: system, browser or host app, screen size. */
  deviceInfo(): Record<string, string | number | boolean>;
  /** POSTs a JSON body; resolves to the HTTP status, or 0 when it didn't get through. */
  postJson(url: string, body: string, headers: Record<string, string>, keepalive?: boolean): Promise<number>;
  /** Uncaught errors, for the play statistics. */
  onError(cb: (msg: string, where: string) => void): void;

  now(): number;
  requestFrame(cb: (t: number) => void): void;
}
