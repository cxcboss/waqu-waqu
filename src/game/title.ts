import { INK, P } from '../art/palette';
import { K, TILE_H } from '../art/sprites';
import { button, ellipse, hit, panel, pressIn, pressOut, roundRect, text, type Rect } from '../art/ui';
import type { Ctx } from '../platform/types';
import { TUNING } from './config';
import type { Game, Scene } from './game';
import { MapScene } from './map';
import { drawTruckBase } from './play';

const TILE = TILE_H * K;

export class TitleScene implements Scene {
  readonly id = 'title';
  private t = 0;
  private cam = 0;
  private btns: { id: string; rect: Rect }[] = [];
  private pressed: string | null = null;
  private pads = [
    { x: 300, y: 260, r: 62, v: 0 }, { x: 470, y: 640, r: 54, v: 1 }, { x: 250, y: 980, r: 70, v: 3 },
    { x: 460, y: 1260, r: 58, v: 2 }, { x: 320, y: 1560, r: 64, v: 0 }, { x: 480, y: 1880, r: 50, v: 1 },
  ];

  constructor(private game: Game) {
    game.audio.setMusic('bgm_title');
    game.tm.day = null;
  }

  update(dt: number) {
    this.t += dt;
    this.cam -= 22 * dt;
  }

  down(x: number, y: number) {
    for (const b of this.btns) if (hit(b.rect, x, y)) this.pressed = b.id;
  }

  up(x: number, y: number) {
    const b = this.btns.find((b) => b.id === this.pressed && hit(b.rect, x, y));
    this.pressed = null;
    if (!b) return;
    this.game.audio.play(b.id === 'sound' ? 'ui_tap' : 'ui_confirm');
    if (b.id === 'start') this.game.go(new MapScene(this.game));
    else if (b.id === 'sound') this.game.setSound(!this.game.save.sound);
  }

  render(ctx: Ctx) {
    const H = this.game.H;
    const sp = this.game.sprites;
    const k0 = Math.floor(this.cam / TILE);
    for (let k = k0; k * TILE - this.cam < H; k++) ctx.drawImage(sp.get('river').img, 0, k * TILE - this.cam, 750, TILE + 1);
    // drifting lily pads, wrapping around
    const span = 2100;
    for (const p of this.pads) {
      const y = ((((p.y - this.cam) % span) + span) % span) - 150;
      sp.draw(ctx, `lily${p.v}`, p.x, y, p.r / (100 * K));
    }
    // the truck idling on the road
    const yy = H * 0.3 + Math.sin(this.t * 13) * 0.8;
    drawTruckBase(ctx, TUNING.truckX, yy, this.t * 60);
    sp.draw(ctx, 'truck_blue', TUNING.truckX, yy);

    // title card
    const cy = H * 0.36;
    ctx.save();
    ctx.translate(375, cy);
    ctx.rotate(-0.025);
    panel(ctx, -290, -170, 580, 330, { r: 26 });
    text(ctx, '蛙趣蛙趣', 4, -62, 108, { bold: true, color: P.lilyDeep });
    text(ctx, '蛙趣蛙趣', 0, -68, 108, { bold: true, color: P.frog });
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    text(ctx, '青蛙快递 · 河湾线', 0, 26, 32, { color: P.inkSoft });
    // postmark "试玩版"
    ctx.save();
    ctx.translate(200, 92);
    ctx.rotate(-0.25);
    ctx.strokeStyle = P.red;
    ctx.lineWidth = 3;
    ellipse(ctx, 0, 0, 46, 46);
    ctx.stroke();
    ellipse(ctx, 0, 0, 36, 36);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    text(ctx, '试玩版', 0, 1, 22, { color: P.red, bold: true });
    ctx.restore();
    ctx.restore();
    // the courier himself, hopping in place
    const hop = Math.max(0, Math.sin(this.t * 3.2)) * 18;
    ctx.save();
    ctx.globalAlpha = 0.4;
    ellipse(ctx, 375, cy + 268, 42 - hop * 0.6, 12);
    ctx.fillStyle = P.tealDeep;
    ctx.fill();
    ctx.restore();
    sp.draw(ctx, 'lily1', 375, cy + 268, 1.05);
    sp.draw(ctx, hop > 2 ? 'frog_jump' : 'frog_happy', 375, cy + 262 - hop, 1.1, 1.1);
    sp.draw(ctx, 'satchel0', 375 + 30 * K * 1.1, cy + 262 - hop - 40 * K * 1.1, 1.1);

    // buttons
    const day = this.game.save.day;
    const by = H - this.game.safeB - 270;
    this.btns = [{ id: 'start', rect: { x: 165, y: by, w: 420, h: 96 } }];
    button(ctx, 165, by, 420, 96, day > 1 ? `继续上班 · 第${day}天` : '开始上班', { primary: true, pressed: this.pressed === 'start', size: 36 });
    text(ctx, '在路线图上选择要跑的一天', 375, by + 130, 24, { color: P.ink, alpha: 0.7 });
    const st = this.game.safeT + 24;
    const sr = { x: 600, y: st, w: 126, h: 56 };
    this.btns.push({ id: 'sound', rect: sr });
    pressIn(ctx, sr, this.pressed === 'sound');
    panel(ctx, 600, st, 126, 56, { r: 28, shadow: false });
    text(ctx, this.game.save.sound ? '音效 开' : '音效 关', 663, st + 29, 24, { bold: true });
    pressOut(ctx, this.pressed === 'sound', () => roundRect(ctx, 600, st, 126, 56, 28));
    if (this.game.save.coins > 0) {
      panel(ctx, 24, st, 170, 56, { r: 28, shadow: false });
      sp.draw(ctx, 'coin', 58, st + 28, 0.7);
      text(ctx, String(this.game.save.coins), 140, st + 29, 26, { bold: true });
    }
    const fy = H - this.game.safeB - 40;
    ctx.save();
    ctx.globalAlpha = 0.8;
    roundRect(ctx, 175, fy - 20, 400, 40, 20);
    ctx.fillStyle = P.paper;
    ctx.fill();
    ctx.restore();
    text(ctx, '占位美术为代码绘制，正式美术制作中', 375, fy, 22, { color: P.ink, alpha: 0.75 });
  }
}
