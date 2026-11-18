import { icon, type IconName } from '../art/kit';
import { P } from '../art/palette';
import { roundRect, text } from '../art/ui';
import type { Ctx } from '../platform/types';
import { SUPPLY_CAP, watchAd } from './ads';
import type { Game } from './game';
import { dialog, pill, Taps } from './menu';

export type SupplyId = 'rope' | 'wrap' | 'whistle';

const SUPPLIES: { id: SupplyId; name: string; effect: string; icon: IconName }[] = [
  { id: 'rope', name: '救命绳', effect: '冲走时拉回车上一次，免扣金币', icon: 'buoy' },
  { id: 'wrap', name: '防水袋', effect: '落水时护住背包里的包裹一次', icon: 'parcel' },
  { id: 'whistle', name: '缓流哨', effect: '开工时选用，车队减速 15%', icon: 'truck' },
];

function canWatch(game: Game): boolean {
  return !!game.platform.showRewardedAd && !!game.platform.adsAvailable?.();
}

export function canShowSupplies(game: Game): boolean {
  return game.demo || canWatch(game) || Object.values(game.save.supplies).some((count) => count > 0);
}

export function useSupply(game: Game, id: SupplyId): boolean {
  const stock = game.save.supplies;
  if (stock[id] === 0) return false;
  stock[id]--;
  game.writeSave();
  game.tm.log('supply_use', { kind: id, day: game.tm.day });
  return true;
}

export class SupplyPanel {
  private taps = new Taps();
  private pending: SupplyId | null = null;
  private notice = '';

  constructor(private game: Game, private onClose: () => void, private whistle?: { selected: () => boolean; toggle: () => void }) {}

  down(x: number, y: number) {
    this.taps.down(x, y);
  }

  up(x: number, y: number) {
    this.taps.move(x, y);
    const action = this.taps.up(x, y);
    if (action === 'close' || action === 'suppliesOut') this.escape();
    else if (action === 'selectWhistle' && this.game.save.supplies.whistle > 0) {
      this.whistle?.toggle();
      this.game.audio.play('ui_tap');
    } else {
      const supply = SUPPLIES.find((s) => s.id === action);
      if (supply) void this.claim(supply);
    }
  }

  escape() {
    this.game.audio.play('ui_close');
    this.onClose();
  }

  private async claim({ id, name }: (typeof SUPPLIES)[number]) {
    const g = this.game;
    if (this.pending || g.save.supplies[id] >= SUPPLY_CAP) return;
    if (g.demo) {
      g.save.supplies[id]++;
      g.writeSave();
      g.audio.play('gift_open');
      this.notice = `${name} +1`;
      return;
    }
    if (!canWatch(g)) return;
    this.pending = id;
    this.notice = '';
    g.audio.play('ui_tap');
    const day = g.tm.day ?? g.save.day;
    g.tm.log('ad_show', { where: id, day });
    const watched = await watchAd(g, 'supply');
    this.pending = null;
    const ok = watched && g.save.supplies[id] < SUPPLY_CAP;
    if (ok) {
      g.save.supplies[id]++;
      g.writeSave();
      g.audio.play('gift_open');
    }
    this.notice = ok ? `${name} +1` : '本次未领取';
    g.tm.log('ad_done', { where: id, day, ok });
  }

  render(ctx: Ctx) {
    const g = this.game, stock = g.save.supplies;
    const ads = canWatch(g);
    this.taps.clear();
    ctx.save();
    const d = dialog(ctx, g, this.taps, 'supplies', 674, 452, 1, { title: '送件补给' });
    const x = d.x + 22, w = d.w - 44;
    SUPPLIES.forEach(({ id, name, effect, icon: glyph }, i) => {
      const y = d.y + 47 + i * 103;
      roundRect(ctx, x, y, w, 94, 16);
      ctx.fillStyle = P.white;
      ctx.fill();
      ctx.strokeStyle = P.kraft;
      ctx.lineWidth = 2;
      ctx.stroke();
      icon(ctx, glyph, x + 40, y + 47, 51);
      text(ctx, name, x + 80, y + 27, 30, { align: 'left', bold: true });
      text(ctx, `库存 ${stock[id]}/${SUPPLY_CAP}`, x + 194, y + 29, 22, { align: 'left', color: P.inkSoft });
      text(ctx, effect, x + 80, y + 65, 22, { align: 'left', maxWidth: w - 286 });
      const bx = x + w - 193;
      if (this.pending === id) text(ctx, '广告加载中…', bx + 90, y + 47, 23, { color: P.inkSoft });
      else if (!this.pending && (ads || g.demo) && stock[id] < SUPPLY_CAP) {
        pill(ctx, this.taps, id, bx, y + 18, 178, 57, g.demo ? '领取' : '看广告领1件', { size: 23, fill: P.kraftTop });
      }
    });
    const by = d.y + d.h - 77;
    const selection = stock.whistle > 0 ? this.whistle : undefined;
    if (selection) {
      const on = selection.selected();
      pill(ctx, this.taps, 'selectWhistle', x + 2, by, 220, 56, on ? '已选缓流哨' : '本趟用缓流哨', { size: 23, icon: on ? 'check' : undefined, fill: on ? P.lilyLight : P.cream });
    }
    if (this.notice) text(ctx, this.notice, x + (selection ? 243 : 12), by + 29, 22, { align: 'left', color: P.inkSoft });
    pill(ctx, this.taps, 'close', x + w - 142, by, 140, 56, '返回', { size: 26 });
    ctx.restore();
  }
}
