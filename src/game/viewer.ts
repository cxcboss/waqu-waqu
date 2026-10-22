// Full-screen photo viewer: one photo big as a keepsake card, swipe or tap the arrows for the next,
// and a row of actions under it (save to the phone, keep in the album, hang at home…).
import { INK, P } from '../art/palette';
import { button, ellipse, hit, pressIn, pressOut, text, type Rect } from '../art/ui';
import { approach, clamp, easeOutBack, easeOutCubic } from '../engine/math';
import type { Canvas, Ctx, ImageSource, Platform, SaveResult } from '../platform/types';
import type { Game } from './game';

export interface ViewerPhoto {
  /** Identifies the photo for caching its card. */
  key: string;
  img: () => ImageSource | null;
  caption: string;
  footer: string;
}

export interface ViewerAction {
  id: string;
  label: string;
  primary?: boolean;
}

export const SAVED: Record<SaveResult, string> = {
  shared: '搞定！',
  downloaded: '图片已保存',
  longpress: '长按图片，选「保存图片」',
  cancelled: '',
  failed: '没存上，试试长按图片保存',
};

/** The photo as a keepsake: polaroid border, the caption and a footer line. Shown big and saved as is. */
export function photoCard(pl: Platform, img: ImageSource, caption: string, footer: string): Canvas {
  const iw = img.width, ih = img.height;
  const u = iw / 600;
  const pad = Math.round(26 * u), capH = Math.round(124 * u);
  const c = pl.createCanvas(iw + pad * 2, ih + pad + capH);
  const g = c.getContext('2d')!;
  g.fillStyle = '#FFFDF7';
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(img, pad, pad);
  g.strokeStyle = INK;
  g.lineWidth = 2 * u;
  g.strokeRect(pad, pad, iw, ih);
  text(g, caption, c.width / 2, pad + ih + 54 * u, 40 * u, { bold: true, maxWidth: iw - 20 * u });
  text(g, footer, c.width / 2, pad + ih + 100 * u, 22 * u, { color: P.inkSoft });
  g.lineWidth = 3 * u;
  g.strokeRect(1.5 * u, 1.5 * u, c.width - 3 * u, c.height - 3 * u);
  return c;
}

export class PhotoViewer {
  t = 0;
  private dx = 0;
  private swipe: { x: number; moved: boolean } | null = null;
  private btns: { id: string; rect: Rect }[] = [];
  private pressed: string | null = null;
  private cardRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private cards = new Map<string, Canvas>();

  constructor(
    private game: Game,
    private photos: ViewerPhoto[],
    public i: number,
    private actions: (p: ViewerPhoto, i: number) => ViewerAction[],
    private onAction: (id: string, i: number) => void,
    private title = '照片',
  ) {
    game.audio.play('ui_open');
  }

  get current() {
    return this.photos[this.i];
  }

  /** The keepsake card of a photo, once its picture is loaded. */
  card(p: ViewerPhoto): Canvas | null {
    const have = this.cards.get(p.key);
    if (have) return have;
    const img = p.img();
    if (!img) return null;
    const c = photoCard(this.game.platform, img, p.caption, p.footer);
    this.cards.set(p.key, c);
    this.game.platform.prepareImage(c);
    return c;
  }

  /** Lets go of the long-press picture laid over the game. */
  close() {
    this.game.platform.showImage(null);
  }

  /** The list changed (a photo was taken out): keep showing a neighbour. */
  setPhotos(list: ViewerPhoto[]) {
    this.photos = list;
    this.i = clamp(this.i, 0, list.length - 1);
  }

  update(dt: number) {
    this.t += dt;
    if (!this.swipe) this.dx = approach(this.dx, 0, 16, dt);
  }

  down(x: number, y: number) {
    this.pressed = null;
    for (const b of this.btns) if (hit(b.rect, x, y, 8)) this.pressed = b.id;
    if (!this.pressed) this.swipe = { x, moved: false };
  }

  move(x: number) {
    const sw = this.swipe;
    if (!sw) return;
    const dx = x - sw.x;
    if (Math.abs(dx) > 12) sw.moved = true;
    this.dx = this.photos.length > 1 ? dx : dx * 0.25;
  }

  up(x: number, y: number) {
    const id = this.pressed;
    this.pressed = null;
    const sw = this.swipe;
    this.swipe = null;
    if (id) {
      const b = this.btns.find((b) => b.id === id);
      if (!b || !hit(b.rect, x, y, 8)) return;
      if (id === 'prev') this.flip(-1);
      else if (id === 'next') this.flip(1);
      else this.onAction(id, this.i);
    } else if (sw && sw.moved && Math.abs(this.dx) > 80) this.flip(this.dx < 0 ? 1 : -1);
    else if (sw && !sw.moved && !hit(this.cardRect, x, y)) this.onAction('close', this.i);
  }

  private flip(d: number) {
    const n = this.photos.length;
    if (n < 2) return;
    this.i = (this.i + d + n) % n;
    this.dx = d * 750 + this.dx;
    this.game.audio.play('paper_flip', { volume: 0.7 });
  }

  /** Saves the current card to the phone; resolves to the message to show. */
  async save(name: string): Promise<string> {
    const c = this.card(this.current);
    if (!c) return '照片还没准备好';
    const res = await this.game.platform.saveImage(c, name);
    if (res === 'shared' || res === 'downloaded') this.game.audio.play('photo_shutter', { volume: 0.6 });
    return SAVED[res];
  }

  render(ctx: Ctx) {
    const g = this.game;
    const H = g.H;
    const p = this.photos[this.i];
    if (!p) return;
    const a = easeOutCubic(clamp(this.t / 0.25, 0, 1));
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(28,22,18,0.9)';
    ctx.fillRect(0, 0, 750, H);
    ctx.restore();

    const acts = this.actions(p, this.i);
    const rows = acts.length > 2 ? 2 : 1;
    const top = g.safeT + 96;
    const btnY = H - g.safeB - 30 - 84 * rows - 16 * (rows - 1);
    const maxW = 690, maxH = btnY - 150 - top;
    const card = this.card(p);
    let cw = 600, ch = 560;
    if (card) {
      cw = card.width;
      ch = card.height;
    }
    const s = Math.min(maxW / cw, maxH / ch);
    const pop = 0.88 + 0.12 * easeOutBack(clamp(this.t / 0.3, 0, 1));
    const w = cw * s * pop, h = ch * s * pop;
    const x = 375 - w / 2 + this.dx, y = top + (maxH - h) / 2;
    this.cardRect = { x, y, w, h };
    ctx.save();
    ctx.globalAlpha = 0.35 * a;
    ctx.fillStyle = '#000';
    ctx.fillRect(x + 8, y + 12, w, h);
    ctx.restore();
    if (card) {
      ctx.drawImage(card, x, y, w, h);
      const k = g.cssScale;
      g.platform.showImage(card, { x: x * k, y: y * k, w: w * k, h: h * k });
    } else {
      ctx.fillStyle = '#FFFDF7';
      ctx.fillRect(x, y, w, h);
      text(ctx, '照片加载中…', x + w / 2, y + h / 2, 28, { color: P.inkSoft });
      g.platform.showImage(null);
    }
    text(ctx, this.title, 375, g.safeT + 48, 34, { bold: true, color: P.cream, alpha: a });

    this.btns = [];
    const ry = y + h + 50;
    const n = this.photos.length;
    if (n > 1) {
      text(ctx, `${this.i + 1} / ${n}`, 375, ry, 30, { bold: true, color: P.cream, alpha: a });
      for (const [id, cx, dir] of [['prev', 245, -1], ['next', 505, 1]] as const) {
        const r = { x: cx - 36, y: ry - 36, w: 72, h: 72 };
        this.btns.push({ id, rect: r });
        const down = this.pressed === id;
        pressIn(ctx, r, down);
        ctx.save();
        ctx.globalAlpha = a;
        ellipse(ctx, cx, ry, 32, 32);
        ctx.fillStyle = P.paper;
        ctx.fill();
        ctx.strokeStyle = INK;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(cx - dir * 5, ry - 12);
        ctx.lineTo(cx + dir * 7, ry);
        ctx.lineTo(cx - dir * 5, ry + 12);
        ctx.stroke();
        ctx.restore();
        pressOut(ctx, down, () => ellipse(ctx, cx, ry, 32, 32));
      }
    }
    text(ctx, n > 1 ? '左右滑动换一张 · 长按图片也能保存' : '长按图片也能保存', 375, btnY - 34, 24, { color: P.cream, alpha: 0.7 * a });
    ctx.save();
    ctx.globalAlpha = a;
    // one or two rows of buttons, as wide as they can be
    const perRow = Math.ceil(acts.length / rows);
    acts.forEach((b, k) => {
      const row = Math.floor(k / perRow), col = k % perRow;
      const inRow = Math.min(perRow, acts.length - row * perRow);
      const gap = 20, bw = (670 - gap * (inRow - 1)) / inRow;
      const bx = 40 + col * (bw + gap), by = btnY + row * 100;
      this.btns.push({ id: b.id, rect: { x: bx, y: by, w: bw, h: 84 } });
      button(ctx, bx, by, bw, 84, b.label, { primary: b.primary, pressed: this.pressed === b.id, size: 30 });
    });
    ctx.restore();
  }
}
