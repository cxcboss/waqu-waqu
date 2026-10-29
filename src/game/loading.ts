// The wait for the first load: a progress bar, and a tiny snake game with a frog to pass the time.
// Everything here is drawn with plain shapes, since none of the art has arrived yet. It is made
// to look unlike the real game (dashed board, "loading" ribbon) so nobody takes it for the day's work.
import { TOD, drawBaked, grainRect } from '../art/kit';
import { P, INK } from '../art/palette';
import { button, ellipse, panel, roundRect, text } from '../art/ui';
import { lilyPad, reeds } from '../art/village';
import type { Ctx } from '../platform/types';

const CELL = 54;
const COLS = 11;
const STEP_T = 0.2;
const MIN_STEP = 0.11;
const BOARD_TOP = 410;
/** The mini game keeps the health notice up at least this long before going in by itself. */
const NOTICE_SEC = 3;
const HEALTH_NOTICE = ['抵制不良游戏，拒绝盗版游戏。注意自我保护，谨防受骗上当。', '适度游戏益脑，沉迷游戏伤身。合理安排时间，享受健康生活。'];

type Dir = { x: number; y: number };
interface Cell {
  x: number;
  y: number;
}

export interface LoaderHost {
  readonly H: number;
  readonly safeT: number;
  readonly safeB: number;
  /** 0–1 */
  progress(): number;
  /**
   * Running as the WeChat mini game: the health notice and age rating every game in China shows before
   * it starts go along the bottom, and there's no page to reload.
   */
  readonly mini: boolean;
  vibrate(ms: number): void;
  /** The load is over and the player has said they're ready: go to the game. */
  enter(): void;
}

export class Loader {
  private t = 0;
  private rows = 11;
  private snake: Cell[] = [];
  private dir: Dir = { x: 1, y: 0 };
  private queue: Dir[] = [];
  private food: Cell = { x: 0, y: 0 };
  private tick = 0;
  private score = 0;
  private best = 0;
  private dead = 0;
  private tongue = 0;
  private started = false;
  private touched = false;
  private finished = 0;
  private entering = false;
  private pressedGo = false;
  private start: { id: number; x: number; y: number; t: number; used: boolean } | null = null;
  private goRect = { x: 0, y: 0, w: 0, h: 0 };
  private shownP = 0;

  constructor(private host: LoaderHost) {
    this.reset();
  }

  /** The assets are all in. */
  finish() {
    this.finished = this.t;
  }

  private reset() {
    this.snake = [{ x: 4, y: 5 }, { x: 3, y: 5 }, { x: 2, y: 5 }];
    this.dir = { x: 1, y: 0 };
    this.queue = [];
    this.score = 0;
    this.tick = 0;
    this.dead = 0;
    this.started = false;
    this.placeFood();
  }

  private placeFood() {
    for (let i = 0; i < 60; i++) {
      const c = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * this.rows) };
      if (!this.snake.some((s) => s.x === c.x && s.y === c.y)) {
        this.food = c;
        return;
      }
    }
  }

  update(dt: number) {
    this.t += dt;
    this.shownP += (this.host.progress() - this.shownP) * Math.min(1, dt * 6);
    this.tongue = Math.max(0, this.tongue - dt);
    if (this.finished && !this.entering) {
      // nobody was playing: straight in after a beat; otherwise wait for the button
      if (!this.touched && this.t - this.finished > 1.1 && (!this.host.mini || this.t > NOTICE_SEC)) this.go();
    }
    if (this.dead > 0) {
      this.dead -= dt;
      if (this.dead <= 0) this.reset();
      return;
    }
    if (!this.started) return;
    this.tick += dt;
    const every = Math.max(MIN_STEP, STEP_T - this.score * 0.004);
    while (this.tick >= every) {
      this.tick -= every;
      this.step();
      if (this.dead > 0) break;
    }
  }

  private go() {
    if (this.entering) return;
    this.entering = true;
    this.host.enter();
  }

  private turn(d: Dir) {
    const last = this.queue.length ? this.queue[this.queue.length - 1] : this.dir;
    if (d.x === -last.x && d.y === -last.y) return;
    if (d.x === last.x && d.y === last.y) return;
    if (this.queue.length < 2) this.queue.push(d);
    this.started = true;
  }

  private step() {
    if (this.queue.length) this.dir = this.queue.shift()!;
    const h = this.snake[0];
    const n = { x: h.x + this.dir.x, y: h.y + this.dir.y };
    const eating = n.x === this.food.x && n.y === this.food.y;
    const body = eating ? this.snake : this.snake.slice(0, -1);
    if (n.x < 0 || n.y < 0 || n.x >= COLS || n.y >= this.rows || body.some((s) => s.x === n.x && s.y === n.y)) {
      this.best = Math.max(this.best, this.score);
      this.dead = 1.1;
      this.host.vibrate(30);
      return;
    }
    this.snake.unshift(n);
    if (eating) {
      this.score++;
      this.tongue = 0.18;
      this.host.vibrate(8);
      this.placeFood();
    } else this.snake.pop();
  }

  down(x: number, y: number, id: number) {
    this.touched = true;
    if (this.finished && this.hitGo(x, y)) {
      this.pressedGo = true;
      return;
    }
    this.start = { id, x, y, t: this.t, used: false };
  }

  move(x: number, y: number, id: number) {
    const s = this.start;
    if (!s || s.id !== id || s.used) return;
    const dx = x - s.x, dy = y - s.y;
    if (Math.hypot(dx, dy) < 26) return;
    s.used = true;
    this.turn(Math.abs(dx) > Math.abs(dy) ? { x: Math.sign(dx), y: 0 } : { x: 0, y: Math.sign(dy) });
    // keep swiping from where this one ended
    this.start = { id, x, y, t: this.t, used: false };
  }

  up(x: number, y: number, id: number) {
    if (this.pressedGo) {
      this.pressedGo = false;
      if (this.hitGo(x, y)) this.go();
      return;
    }
    const s = this.start;
    this.start = null;
    if (!s || s.id !== id || s.used) return;
    // a tap steers toward where it landed, relative to the head
    const head = this.cellXY(this.snake[0]);
    const dx = x - head.x, dy = y - head.y;
    if (Math.hypot(dx, dy) < 20) return;
    const horiz = this.dir.x !== 0;
    // heading sideways, a tap above or below turns; heading up or down, a tap to a side turns
    if (horiz) this.turn({ x: 0, y: dy < 0 ? -1 : 1 });
    else this.turn({ x: dx < 0 ? -1 : 1, y: 0 });
  }

  private hitGo(x: number, y: number) {
    const r = this.goRect;
    return x >= r.x - 10 && x <= r.x + r.w + 10 && y >= r.y - 10 && y <= r.y + r.h + 10;
  }

  private board() {
    return { x: (750 - COLS * CELL) / 2, y: this.host.safeT + BOARD_TOP };
  }

  private cellXY(c: Cell) {
    const b = this.board();
    return { x: b.x + c.x * CELL + CELL / 2, y: b.y + c.y * CELL + CELL / 2 };
  }

  render(ctx: Ctx) {
    const H = this.host.H;
    const top = this.host.safeT;
    ctx.fillStyle = P.paper;
    ctx.fillRect(0, 0, 750, H);
    grainRect(ctx, 0, 0, 750, H, 0.5);
    // how many rows fit under the header
    const room = H - this.host.safeB - (top + BOARD_TOP) - 150;
    const rows = Math.max(7, Math.min(13, Math.floor(room / CELL)));
    if (rows !== this.rows) {
      this.rows = rows;
      this.reset();
    }

    // the title and the bar come first: this is a loading screen
    const dots = '.'.repeat(1 + (Math.floor(this.t * 2.5) % 3));
    text(ctx, this.finished ? '加载完成' : `加载中${dots}`, 375, top + 70, 56, { bold: true, color: this.finished ? P.lilyDeep : INK });
    const secs = this.t;
    const slow = this.host.mini ? '网络有点慢，等不及可以退出再进' : '网络有点慢，等不及可以刷新页面再试';
    const note = this.finished ? '加载完成！' : secs > 60 ? slow : secs > 18 ? '网络有点慢，再等一下就好' : '第一次进来要多等一会儿，下次就快了';
    text(ctx, note, 375, top + 124, 26, { color: this.finished ? P.lilyDeep : P.inkSoft, bold: !!this.finished });

    const bx = 75, bw = 600, by = top + 160, bh = 40;
    const p = Math.max(0.02, this.finished ? 1 : this.shownP);
    roundRect(ctx, bx, by, bw, bh, bh / 2);
    ctx.fillStyle = P.paperShade;
    ctx.fill();
    ctx.save();
    roundRect(ctx, bx, by, bw, bh, bh / 2);
    ctx.clip();
    ctx.fillStyle = P.orange;
    ctx.fillRect(bx, by, bw * p, bh);
    // moving stripes so it never looks stuck
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    for (let x = bx - 60 + ((this.t * 40) % 60); x < bx + bw * p; x += 60) {
      ctx.beginPath();
      ctx.moveTo(x, by + bh);
      ctx.lineTo(x + 24, by);
      ctx.lineTo(x + 48, by);
      ctx.lineTo(x + 24, by + bh);
      ctx.fill();
    }
    ctx.restore();
    roundRect(ctx, bx, by, bw, bh, bh / 2);
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK;
    ctx.stroke();
    text(ctx, `${Math.round(p * 100)}%`, bx + bw / 2, by + bh / 2 + 1, 26, { bold: true, color: p > 0.5 ? P.white : INK });

    // the label that says what the thing below is
    const ty = top + 240;
    roundRect(ctx, 105, ty, 540, 56, 28);
    ctx.fillStyle = '#FBE6CF';
    ctx.fill();
    ctx.setLineDash([10, 8]);
    ctx.lineWidth = 3;
    ctx.strokeStyle = P.orangeDeep;
    ctx.stroke();
    ctx.setLineDash([]);
    text(ctx, '下面是加载小游戏，不是正式游戏', 375, ty + 29, 28, { bold: true, color: P.orangeDeep });
    text(ctx, '贪吃蛙：滑动屏幕转向，吃苍蝇涨分', 375, ty + 94, 26, { color: INK });
    text(ctx, `得分 ${this.score}${this.best ? `　最高 ${this.best}` : ''}`, 375, ty + 130, 26, { color: P.inkSoft });

    this.drawBoard(ctx);
    // a strip of the river along the bottom, if there's room under the board
    const foot = H - 156;
    if (this.host.mini) this.drawNotice(ctx);
    else if (foot > this.board().y + this.rows * CELL + 40) drawBaked(ctx, 'loadfoot', 0, foot, [0, -60, 750, 260], (c) => river(c));

    // done: say so, loudly
    if (this.finished && this.touched) {
      const w = 420, h = 200, x = 375 - w / 2, y = top + BOARD_TOP + (this.rows * CELL) / 2 - h / 2;
      panel(ctx, x, y, w, h, { r: 26, stitch: P.gold });
      text(ctx, '加载完成！', 375, y + 56, 46, { bold: true, color: P.lilyDeep });
      this.goRect = { x: x + 50, y: y + 96, w: w - 100, h: 80 };
      button(ctx, this.goRect.x, this.goRect.y, this.goRect.w, this.goRect.h, '进入游戏', { primary: true, pressed: this.pressedGo, size: 36 });
    }
  }

  /** 健康游戏忠告 along the bottom and the age rating up in the corner. */
  private drawNotice(ctx: Ctx) {
    const y = this.host.H - this.host.safeB - 124;
    text(ctx, '健康游戏忠告', 375, y, 24, { bold: true, color: INK });
    HEALTH_NOTICE.forEach((line, i) => text(ctx, line, 375, y + 38 + i * 34, 22, { color: P.inkSoft }));
    const top = this.host.safeT;
    roundRect(ctx, 28, top + 22, 92, 40, 10);
    ctx.fillStyle = P.lilyDeep;
    ctx.fill();
    text(ctx, '8+', 74, top + 43, 26, { bold: true, color: P.white });
    text(ctx, '适龄提示', 74, top + 82, 18, { color: P.inkSoft });
  }

  private drawBoard(ctx: Ctx) {
    const b = this.board();
    const w = COLS * CELL, h = this.rows * CELL;
    ctx.save();
    roundRect(ctx, b.x - 6, b.y - 6, w + 12, h + 12, 20);
    ctx.fillStyle = '#E9E1C6';
    ctx.fill();
    ctx.setLineDash([12, 9]);
    ctx.lineWidth = 3;
    ctx.strokeStyle = P.inkSoft;
    ctx.stroke();
    ctx.setLineDash([]);
    // pond tiles
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < COLS; x++) {
        if ((x + y) % 2) continue;
        ctx.fillStyle = 'rgba(143,201,190,0.22)';
        ctx.fillRect(b.x + x * CELL, b.y + y * CELL, CELL, CELL);
      }
    }
    // the fly
    const f = this.cellXY(this.food);
    const wing = Math.sin(this.t * 40) * 0.25;
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.5;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(f.x + s * 11, f.y - 12 + Math.sin(this.t * 3) * 3, 11, 6 + wing * 8, s * 0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ellipse(ctx, f.x, f.y + Math.sin(this.t * 3) * 3, 10, 12);
    ctx.fillStyle = INK;
    ctx.fill();

    // the snake: a frog's head and a chain of green dots
    const n = this.snake.length;
    const dead = this.dead > 0 && Math.floor(this.t * 10) % 2 === 0;
    for (let i = n - 1; i >= 0; i--) {
      const c = this.cellXY(this.snake[i]);
      const r = i === 0 ? 27 : Math.max(14, 23 - i * 0.5);
      ellipse(ctx, c.x, c.y, r, r);
      ctx.fillStyle = dead ? P.pink : i % 2 ? P.frog : P.lilyLight;
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = INK;
      ctx.stroke();
    }
    const h0 = this.cellXY(this.snake[0]);
    const d = this.dir;
    const px = -d.y, py = d.x;
    for (const s of [-1, 1]) {
      const ex = h0.x + d.x * 8 + px * s * 14, ey = h0.y + d.y * 8 + py * s * 14;
      ellipse(ctx, ex, ey, 9, 9);
      ctx.fillStyle = P.white;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.stroke();
      ellipse(ctx, ex + d.x * 3, ey + d.y * 3, 4, 4);
      ctx.fillStyle = INK;
      ctx.fill();
    }
    if (this.tongue > 0) {
      ctx.strokeStyle = P.red;
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(h0.x + d.x * 22, h0.y + d.y * 22);
      ctx.lineTo(h0.x + d.x * (22 + this.tongue * 160), h0.y + d.y * (22 + this.tongue * 160));
      ctx.stroke();
    }
    if (!this.started && this.dead <= 0) {
      const a = 0.6 + Math.sin(this.t * 5) * 0.3;
      ctx.globalAlpha = a;
      text(ctx, '滑一下开始', 375, b.y + h / 2 + 80, 34, { bold: true, color: INK });
    }
    if (this.dead > 0) text(ctx, '咕！撞到了，马上重来', 375, b.y + h / 2, 34, { bold: true, color: P.red });
    ctx.restore();
  }
}

/** The river along the bottom of the loading screen: water with a wavy bank, lily pads and reeds. */
function river(ctx: Ctx) {
  const tod = TOD.day;
  ctx.beginPath();
  ctx.moveTo(0, 260);
  ctx.lineTo(0, 10);
  for (let x = 0; x <= 750; x += 75) ctx.quadraticCurveTo(x + 37, x % 150 ? 0 : 20, x + 75, 10);
  ctx.lineTo(750, 260);
  ctx.closePath();
  ctx.fillStyle = tod.water;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.4;
  ctx.stroke();
  ctx.fillStyle = tod.waterDeep;
  ctx.fillRect(0, 128, 750, 140);
  ctx.strokeStyle = tod.glint;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const [x, y] of [[90, 70], [300, 104], [560, 64], [660, 150], [200, 170]]) {
    ctx.moveTo(x, y);
    ctx.lineTo(x + 34, y);
  }
  ctx.stroke();
  lilyPad(ctx, 150, 92, 52, tod, 3, true);
  lilyPad(ctx, 430, 104, 40, tod, 5);
  lilyPad(ctx, 610, 96, 36, tod, 7);
  reeds(ctx, 30, 30, 1, tod, 2);
  reeds(ctx, 718, 26, 0.9, tod, 4);
}
