// The staff shop (福利社), run by a hamster whose cheeks are always full. Gear upgrades that help on
// the river, hats and scarves, furniture for the frog's room and frames for the photo wall.
import { INK, P } from '../art/palette';
import { button, ellipse, roundRect, text, wrapText, type Rect } from '../art/ui';
import { clamp } from '../engine/math';
import type { Ctx } from '../platform/types';
import { ACHIEVEMENTS, checkAchievements, spend } from './career';
import { GEAR, ITEMS, dailyDeal, gearDef, gearMax, item, priceOf, type GearId, type Item, type ItemKind } from './catalog';
import type { Game, Scene } from './game';
import { itemIcon } from './home';
import { HubScene } from './hub';
import { Scroller, Taps, Toast, dialog, drawDressedFrog, header, iconAt, pill, tabs } from './menu';
import { SCENE_MUSIC } from './sound';

const TABS = ['装备', '衣帽', '家居', '相框'];
const TAB_ICONS = ['cat_gear', 'cat_hat', 'cat_deco', 'cat_frame'];
const HAMSTER = ['happy', 'give', 'think', 'bow'].map((k) => `shop_hamster_${k}`);
/** A gear icon for its level: the painted ones start at level 2, level 1 keeps the plain icon. */
const gearIcon = (id: GearId, lv: number, plain: string) => (lv >= 2 ? `gear_${id}_lv${lv}` : plain);
const KINDS: ItemKind[][] = [[], ['hat', 'neck'], ['deco'], ['frame']];
const HELLO = ['欢迎光临福利社！', '随便看看，不买也行～', '今天也辛苦啦！'];

type Pick = { gear: GearId } | { item: string };

export class ShopScene implements Scene {
  readonly id = 'shop';
  private t = 0;
  private tab: number;
  private taps = new Taps();
  private scroll = new Scroller();
  private toast = new Toast();
  private pick: (Pick & { t: number }) | null = null;
  private line: { text: string; t: number };
  private flash = 0;
  /** A hat being looked at, shown on the frog at the counter. */
  private tryOn: string | null = null;
  private cheer = 0;
  /** Seconds left of the hamster's worried look (not enough coins) and of the parcel on the counter. */
  private think = 0;
  private gift = 0;

  constructor(private game: Game, tab = 0) {
    this.tab = tab;
    const deal = item(dailyDeal())!;
    this.line = { text: Math.random() < 0.6 ? `今日特价：${deal.name}，打八折！` : HELLO[Math.floor(Math.random() * HELLO.length)], t: 0 };
    game.audio.setMusic(SCENE_MUSIC.shop);
    game.audio.setAmbience(null);
    game.audio.play('ui_open');
    game.audio.play('hamster_hi', { delay: 0.45 });
    void game.sprites.ensure([...TAB_ICONS, ...HAMSTER, 'shop_counter', 'shop_dealboard', 'shop_gift', 'shop_shelf_jars', ...GEAR.flatMap((g) => [2, 3, 4, 5].map((l) => `gear_${g.id}_lv${l}`))]);
    game.tm.log('shop', { tab, coins: game.save.coins });
  }

  update(dt: number) {
    this.t += dt;
    this.line.t += dt;
    this.scroll.update(dt);
    this.toast.update(dt);
    if (this.pick) this.pick.t += dt;
    this.flash = Math.max(0, this.flash - dt * 2);
    this.cheer = Math.max(0, this.cheer - dt);
    this.think = Math.max(0, this.think - dt);
    this.gift = Math.max(0, this.gift - dt);
  }

  private say(s: string) {
    this.line = { text: s, t: 0 };
  }

  down(x: number, y: number) {
    this.taps.down(x, y);
    if (!this.pick) this.scroll.down(x, y);
  }
  move(x: number, y: number) {
    this.taps.move(x, y);
    this.scroll.move(x, y);
  }
  up(x: number, y: number) {
    this.scroll.up();
    const id = this.taps.up(x, y);
    if (!id) return;
    const au = this.game.audio;
    if (this.pick) {
      if (id === 'buy') this.buy();
      else if (id === 'wear') this.wear();
      else if (id === 'pickOut' || id === 'close') {
        au.play('ui_close');
        this.pick = null;
        this.tryOn = null;
      }
      return;
    }
    if (id === 'back') {
      au.play('ui_back');
      this.game.go(new HubScene(this.game), true);
    } else if (id.startsWith('tab')) {
      const i = Number(id.slice(3));
      if (i === this.tab) return;
      au.play('tab_switch');
      this.tab = i;
      this.scroll.reset();
      this.game.tm.log('shop_tab', { tab: TABS[i] });
    } else if (id.startsWith('g_')) {
      au.play('ui_tap');
      this.pick = { gear: id.slice(2) as GearId, t: 0 };
    } else if (id.startsWith('i_')) {
      const it = item(id.slice(2))!;
      au.play('ui_tap');
      this.pick = { item: it.id, t: 0 };
      if (it.kind === 'hat' || it.kind === 'neck') this.tryOn = it.id;
    }
  }

  /** What the open card costs, or null when it can't be bought (maxed, owned, not for sale). */
  private cost(p: Pick): number | null {
    const s = this.game.save;
    if ('gear' in p) {
      const lv = s.gear[p.gear] ?? 1;
      return lv >= gearMax(p.gear) ? null : gearDef(p.gear).prices[lv - 1];
    }
    const it = item(p.item)!;
    if (s.owned.includes(it.id)) return null;
    return priceOf(it);
  }

  private buy() {
    const p = this.pick!;
    const g = this.game;
    const s = g.save;
    const price = this.cost(p);
    if (price === null) return;
    if (s.coins < price) {
      g.audio.play('ui_error');
      g.audio.play('hamster_hmm', { delay: 0.2 });
      this.say(`还差 ${price - s.coins} 金币哦，多送几单再来！`);
      this.think = 2.2;
      return;
    }
    if ('gear' in p) {
      const lv = (s.gear[p.gear] ?? 1) + 1;
      s.gear[p.gear] = lv;
      const d = gearDef(p.gear);
      spend(s, `升级${d.name}（${d.looks[lv - 1]}）`, price);
      g.audio.play('upgrade', { delay: 0.15 });
      this.toast.show(`${d.name}升级了：${d.effect(lv)}`);
    } else {
      const it = item(p.item)!;
      s.owned.push(it.id);
      spend(s, `买了${it.name}`, price);
      if (it.kind === 'hat' || it.kind === 'neck') {
        s.wear[it.kind] = it.id;
        this.toast.show('已经戴上啦，回家的衣柜里可以换');
      } else if (it.kind === 'deco') this.toast.show('已经摆进你家了');
      else this.toast.show('回家挂照片时就能选这个相框');
    }
    g.audio.play('purchase');
    g.audio.play('hamster_thanks', { delay: 0.5 });
    g.tm.log('shop_buy', { what: 'gear' in p ? `${p.gear}${s.gear[p.gear]}` : p.item, price, coins: s.coins });
    this.flash = 1;
    this.cheer = 0.8;
    this.gift = 1.1;
    this.say(['谢谢惠顾！', '眼光真好！', '这个超适合你！'][Math.floor(Math.random() * 3)]);
    g.celebrate(checkAchievements(s));
    g.writeSave();
    if ('item' in p) this.pick = null;
    this.tryOn = null;
  }

  private wear() {
    const p = this.pick;
    if (!p || !('item' in p)) return;
    const it = item(p.item)!;
    if (it.kind !== 'hat' && it.kind !== 'neck') return;
    const s = this.game.save;
    s.wear[it.kind] = s.wear[it.kind] === it.id ? null : it.id;
    this.game.writeSave();
    this.game.audio.play('equip');
    this.cheer = 0.6;
  }

  // ---------------------------------------------------------------- drawing

  render(ctx: Ctx) {
    const g = this.game;
    const H = g.H, top = g.safeT, bot = H - g.safeB;
    this.taps.clear();
    const bannerTop = top + 96, bannerBot = bannerTop + 330;
    this.drawCounter(ctx, bannerTop, bannerBot);

    const sheetTop = bannerBot + 70;
    tabs(ctx, this.taps, 'tab', 24, sheetTop - 58, 702, TABS, this.tab, [], { sp: this.game.sprites, names: TAB_ICONS });
    roundRect(ctx, 16, sheetTop, 718, bot - 16 - sheetTop, 18);
    ctx.fillStyle = P.paper;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.2;
    ctx.stroke();
    this.scroll.view = { x: 16, y: sheetTop + 6, w: 718, h: bot - 28 - sheetTop };
    this.scroll.begin(ctx);
    const end = this.tab === 0 ? this.drawGear(ctx, sheetTop + 24) : this.drawItems(ctx, sheetTop + 24, KINDS[this.tab]);
    this.scroll.end(ctx);
    this.scroll.setContent(end - sheetTop + 10);

    header(ctx, g, this.taps, '福利社', { flash: this.flash });
    if (this.pick) this.drawPick(ctx);
    this.toast.render(ctx, top + 110);
  }

  /** The shop window: shelves behind, the hamster at the till, the frog on this side. */
  private drawCounter(ctx: Ctx, y0: number, y1: number) {
    const g = this.game;
    const sp = g.sprites;
    const s = g.save;
    if (sp.has('shop_room')) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, 750, y1 + 80);
      ctx.clip();
      const bg = sp.get('shop_room');
      sp.draw(ctx, 'shop_room', 0, y1 + 80 - bg.h);
      ctx.restore();
    } else {
      ctx.fillStyle = '#B98A5E';
      ctx.fillRect(0, 0, 750, y1 + 80);
      ctx.fillStyle = 'rgba(148,104,63,0.35)';
      for (let x = 0; x < 750; x += 46) ctx.fillRect(x, 0, 3, y1 + 80);
      if (sp.has('shop_shelf_jars')) sp.draw(ctx, 'shop_shelf_jars', 0, y0 + 12, 750 / 620);
      // shelves of goods
      else for (const [sy, n] of [[y0 + 70, 0], [y0 + 170, 1]] as const) {
        ctx.fillStyle = P.woodDeep;
        ctx.fillRect(20, sy, 710, 14);
        ctx.strokeStyle = INK;
        ctx.lineWidth = 2;
        ctx.strokeRect(20, sy, 710, 14);
        for (let i = 0; i < 12; i++) {
          const x = 44 + i * 58, h = 30 + ((i * 7 + n * 3) % 4) * 8;
          roundRect(ctx, x, sy - h, 40, h, 6);
          ctx.fillStyle = [P.gold, P.tealLight, P.pink, P.lilyLight, P.orange, P.blueLight, P.kraftTop][(i + n * 3) % 7];
          ctx.fill();
          ctx.strokeStyle = INK;
          ctx.lineWidth = 1.8;
          ctx.stroke();
        }
      }
    }
    // the counter top
    const cy = y1 - 30;
    const paintedCounter = sp.has('shop_counter');
    if (paintedCounter) sp.draw(ctx, 'shop_counter', 0, cy - 36);
    else {
    ctx.fillStyle = P.wood;
    ctx.fillRect(0, cy, 750, y1 + 80 - cy);
    ctx.strokeStyle = 'rgba(148,104,63,0.6)';
    ctx.lineWidth = 2;
    for (let y = cy + 26; y < y1 + 80; y += 26) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(750, y);
      ctx.stroke();
    }
    ctx.fillStyle = P.woodLight;
    ctx.fillRect(0, cy - 14, 750, 18);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.5;
    ctx.strokeRect(-2, cy - 14, 754, 18);
    }
    // hamster behind the counter, bobbing more when happy
    const hop = this.cheer > 0 ? Math.abs(Math.sin(this.cheer * 12)) * 14 : Math.sin(this.t * 2.2) * 2;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, 750, cy - 12);
    ctx.clip();
    const pose = this.think > 0 ? 'think' : this.cheer > 0.4 ? 'give' : this.cheer > 0 ? 'happy' : this.t < 1.4 ? 'bow' : 'happy';
    const hamster = sp.has(`shop_hamster_${pose}`) ? `shop_hamster_${pose}` : 'shop_hamster';
    sp.draw(ctx, hamster, 560, cy + 40 - hop, 1.15);
    ctx.restore();
    if (!paintedCounter) {
      text(ctx, '店长 · 仓鼠阿圆', 560, cy + 22, 20, { color: INK, bold: true, alpha: 0.75 });
      // a till on the counter
      roundRect(ctx, 650, cy - 66, 76, 54, 8);
      ctx.fillStyle = P.blue;
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.stroke();
      roundRect(ctx, 660, cy - 58, 56, 18, 4);
      ctx.fillStyle = P.tealLight;
      ctx.fill();
    }
    // the daily deal on a chalkboard, and the parcel handed over after a purchase
    if (sp.has('shop_dealboard')) {
      const deal = item(dailyDeal())!;
      iconAt(ctx, sp, 'shop_dealboard', 106, y0 + 100, 190);
      text(ctx, '今日特价', 106, y0 + 86, 19, { color: P.cream, bold: true });
      text(ctx, deal.name, 106, y0 + 112, 24, { color: P.white, bold: true, maxWidth: 140 });
      text(ctx, `${priceOf(deal)} 金币`, 106, y0 + 138, 19, { color: P.gold, bold: true });
    }
    if (this.gift > 0 && sp.has('shop_gift')) {
      const k = 1 - this.gift / 1.1;
      iconAt(ctx, sp, 'shop_gift', 470 - k * 230, cy - 62 - Math.sin(k * Math.PI) * 50, 90, Math.min(1, this.gift * 4));
    }
    // the frog, trying on whatever's being looked at
    const wear = { ...s.wear };
    const tryIt = this.tryOn ? item(this.tryOn) : null;
    if (tryIt && (tryIt.kind === 'hat' || tryIt.kind === 'neck')) wear[tryIt.kind] = tryIt.id;
    const fz = this.cheer > 0 ? Math.sin((1 - this.cheer / 0.8) * Math.PI) * 30 : 0;
    drawDressedFrog(ctx, sp, wear, this.cheer > 0 || tryIt ? 'frog_happy' : 'frog_stand', 170, cy + 14 - fz, 1.05);
    // speech bubble
    const lt = this.line.t;
    const chars = Math.floor(clamp(lt * 16, 0, this.line.text.length));
    if (chars > 0) {
      const bx = 455, by = y0 + 52, w = 420, h = 70;
      roundRect(ctx, bx - w / 2, by - h / 2, w, h, 22);
      ctx.fillStyle = P.white;
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2.2;
      ctx.stroke();
      // the tail, toward the hamster
      ctx.beginPath();
      ctx.moveTo(530, by + h / 2 - 1);
      ctx.lineTo(556, by + h / 2 + 26);
      ctx.lineTo(566, by + h / 2 - 1);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(530, by + h / 2);
      ctx.lineTo(556, by + h / 2 + 26);
      ctx.lineTo(566, by + h / 2);
      ctx.stroke();
      text(ctx, this.line.text.slice(0, chars), bx, by + 1, 26, { bold: true, maxWidth: w - 30 });
    }
  }

  private drawGear(ctx: Ctx, y: number) {
    const s = this.game.save;
    text(ctx, '装备会穿在身上，每升一级都更好用', 375, y + 10, 22, { color: P.inkSoft });
    y += 40;
    for (const gd of GEAR) {
      const lv = s.gear[gd.id] ?? 1, max = gearMax(gd.id);
      const r = { x: 40, y, w: 670, h: 214 };
      const sr = this.scroll.screen(r);
      const down = !!sr && this.taps.add(`g_${gd.id}`, sr);
      ctx.save();
      if (down) ctx.globalAlpha = 0.75;
      roundRect(ctx, r.x, r.y, r.w, r.h, 18);
      ctx.fillStyle = P.white;
      ctx.fill();
      ctx.strokeStyle = P.kraft;
      ctx.lineWidth = 2;
      ctx.stroke();
      roundRect(ctx, r.x + 20, r.y + 20, 150, 150, 16);
      ctx.fillStyle = P.cream;
      ctx.fill();
      const gi = gearIcon(gd.id, lv, gd.sprite);
      if (gi === gd.sprite) this.game.sprites.draw(ctx, gd.sprite, r.x + 95, r.y + 95, 1.1 + 0.05 * lv);
      else iconAt(ctx, this.game.sprites, gi, r.x + 95, r.y + 95, 138);
      text(ctx, gd.name, r.x + 196, r.y + 42, 32, { align: 'left', bold: true });
      text(ctx, `${lv} 级 · ${gd.looks[lv - 1]}`, r.x + 196, r.y + 82, 24, { align: 'left', color: P.orangeDeep, bold: true });
      text(ctx, gd.effect(lv), r.x + 196, r.y + 118, 22, { align: 'left', color: P.inkSoft, maxWidth: 450 });
      for (let i = 0; i < max; i++) {
        ellipse(ctx, r.x + 206 + i * 32, r.y + 160, 11, 11);
        ctx.fillStyle = i < lv ? P.gold : P.paperShade;
        ctx.fill();
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1.8;
        ctx.stroke();
      }
      const price = lv < max ? gd.prices[lv - 1] : null;
      const bx = r.x + r.w - 196, by = r.y + 136;
      if (price === null) text(ctx, '已满级', bx + 88, by + 30, 26, { bold: true, color: P.lilyDeep });
      else {
        roundRect(ctx, bx, by, 176, 60, 30);
        ctx.fillStyle = s.coins >= price ? P.orange : P.paperShade;
        ctx.fill();
        ctx.strokeStyle = INK;
        ctx.lineWidth = 2;
        ctx.stroke();
        this.game.sprites.draw(ctx, 'coin', bx + 34, by + 30, 0.55);
        text(ctx, `${price} 升级`, bx + 108, by + 31, 24, { bold: true, color: s.coins >= price ? P.white : P.inkSoft });
      }
      ctx.restore();
      y += 230;
    }
    text(ctx, '衣服、帽子和家具只换样子，不影响送件', 375, y + 16, 20, { color: P.inkSoft });
    return y + 50;
  }

  private drawItems(ctx: Ctx, y: number, kinds: ItemKind[]) {
    const s = this.game.save;
    const deal = dailyDeal();
    // things for sale first, then ones earned elsewhere
    const list = ITEMS.filter((i) => kinds.includes(i.kind)).sort((a, b) => Number(a.price === null) - Number(b.price === null));
    const cw = 324, ch = 268;
    list.forEach((it, i) => {
      const cx = 40 + (i % 2) * (cw + 22), cy = y + Math.floor(i / 2) * (ch + 20);
      const r = { x: cx, y: cy, w: cw, h: ch };
      const sr = this.scroll.screen(r);
      const down = !!sr && this.taps.add(`i_${it.id}`, sr);
      this.card(ctx, it, r, down, it.id === deal && !s.owned.includes(it.id));
    });
    return y + Math.ceil(list.length / 2) * (ch + 20) + 10;
  }

  private card(ctx: Ctx, it: Item, r: Rect, down: boolean, isDeal: boolean) {
    const s = this.game.save;
    const own = s.owned.includes(it.id);
    const worn = s.wear.hat === it.id || s.wear.neck === it.id;
    ctx.save();
    if (down) ctx.globalAlpha = 0.75;
    roundRect(ctx, r.x, r.y, r.w, r.h, 18);
    ctx.fillStyle = own ? '#F3F0DE' : P.white;
    ctx.fill();
    ctx.strokeStyle = isDeal ? P.red : P.kraft;
    ctx.lineWidth = isDeal ? 3 : 2;
    ctx.stroke();
    roundRect(ctx, r.x + 16, r.y + 16, r.w - 32, 150, 14);
    ctx.fillStyle = P.cream;
    ctx.fill();
    itemIcon(ctx, this.game, it.id, r.x + r.w / 2, r.y + 91, 130);
    text(ctx, it.name, r.x + r.w / 2, r.y + 194, 28, { bold: true, maxWidth: r.w - 30 });
    const price = priceOf(it);
    if (own) text(ctx, worn ? '戴着呢' : it.kind === 'deco' ? '摆在家里' : '已拥有', r.x + r.w / 2, r.y + 236, 24, { bold: true, color: P.lilyDeep });
    else if (price === null) text(ctx, it.from ?? '买不到', r.x + r.w / 2, r.y + 236, 20, { color: P.orangeDeep, bold: true, maxWidth: r.w - 30 });
    else {
      this.game.sprites.draw(ctx, 'coin', r.x + r.w / 2 - 50, r.y + 236, 0.5);
      text(ctx, String(price), r.x + r.w / 2 - 22, r.y + 237, 28, { bold: true, align: 'left', color: s.coins >= price ? INK : P.red });
      if (isDeal) {
        // the old price, crossed out
        const ox = r.x + r.w / 2 + 62;
        text(ctx, String(it.price), ox, r.y + 238, 20, { color: P.inkSoft, align: 'left' });
        ctx.strokeStyle = P.inkSoft;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(ox - 2, r.y + 238);
        ctx.lineTo(ox + String(it.price).length * 11 + 2, r.y + 238);
        ctx.stroke();
      }
    }
    if (isDeal) {
      ctx.save();
      ctx.translate(r.x + r.w - 46, r.y + 30);
      ctx.rotate(0.18);
      roundRect(ctx, -40, -16, 80, 32, 8);
      ctx.fillStyle = P.red;
      ctx.fill();
      text(ctx, '今日特价', 0, 1, 18, { bold: true, color: P.white });
      ctx.restore();
    }
    ctx.restore();
  }

  /** The card for one thing: picture, what it does, and the button to buy it. */
  private drawPick(ctx: Ctx) {
    const p = this.pick!;
    const g = this.game;
    const s = g.save;
    ctx.save();
    const d = dialog(ctx, g, this.taps, 'pick', 640, 640, p.t);
    pill(ctx, this.taps, 'close', d.x + d.w - 84, d.y + 18, 64, 56, '✕', { size: 28 });
    const cost = this.cost(p);
    let name: string, lines: string[], status = '';
    roundRect(ctx, d.x + 40, d.y + 90, d.w - 80, 220, 18);
    ctx.fillStyle = P.cream;
    ctx.fill();
    if ('gear' in p) {
      const gd = gearDef(p.gear);
      const lv = s.gear[p.gear] ?? 1;
      name = gd.name;
      if (lv < gearMax(p.gear)) {
        // what it looks like now and after the upgrade
        const cur = gearIcon(gd.id, lv, gd.sprite), nxt = gearIcon(gd.id, lv + 1, gd.sprite);
        if (cur === gd.sprite) g.sprites.draw(ctx, gd.sprite, 375 - 130, d.y + 200, 1.3);
        else iconAt(ctx, g.sprites, cur, 375 - 130, d.y + 200, 150);
        iconAt(ctx, g.sprites, nxt, 375 + 130, d.y + 200, 170);
        text(ctx, '→', 375, d.y + 200, 44, { color: P.orangeDeep, bold: true });
        text(ctx, '现在', 375 - 130, d.y + 288, 20, { color: P.inkSoft });
        text(ctx, '升级后', 375 + 130, d.y + 288, 20, { color: P.orangeDeep, bold: true });
      } else iconAt(ctx, g.sprites, gearIcon(gd.id, lv, gd.sprite), 375, d.y + 200, 190) || g.sprites.draw(ctx, gd.sprite, 375, d.y + 200, 1.6);
      lines = [gd.desc, `现在：${lv} 级 · ${gd.looks[lv - 1]} · ${gd.effect(lv)}`];
      if (lv < gearMax(p.gear)) lines.push(`升级后：${lv + 1} 级 · ${gd.looks[lv]} · ${gd.effect(lv + 1)}`);
      else status = '已经满级了';
    } else {
      const it = item(p.item)!;
      name = it.name;
      if (it.kind === 'hat' || it.kind === 'neck') {
        drawDressedFrog(ctx, g.sprites, { ...s.wear, [it.kind]: it.id }, 'frog_happy', 375, d.y + 296, 0.95);
      } else itemIcon(ctx, g, it.id, 375, d.y + 200, 190);
      lines = [it.desc, { hat: '帽子 · 只换样子', neck: '戴在脖子上 · 只换样子', deco: '家具 · 摆在你的房间里', frame: '相框 · 照片墙上用' }[it.kind]];
      if (s.owned.includes(it.id)) status = it.kind === 'hat' || it.kind === 'neck' ? (s.wear[it.kind] === it.id ? '正戴着' : '已拥有') : '已拥有';
      else if (it.price === null) {
        const a = ACHIEVEMENTS.find((a) => a.reward === it.id);
        status = `${it.from}${a ? `（${Math.min(a.goal, a.value(s))} / ${a.goal}）` : ''}`;
      }
    }
    text(ctx, name, 375, d.y + 50, 36, { bold: true });
    let y = d.y + 350;
    for (const l of lines) {
      for (const w of wrapText(ctx, l, 24, d.w - 90)) {
        text(ctx, w, 375, y, 24, { color: y === d.y + 350 ? INK : P.inkSoft });
        y += 36;
      }
    }
    const by = d.y + d.h - 110;
    if (cost !== null) {
      const enough = s.coins >= cost;
      const down = this.taps.add('buy', { x: 375 - 170, y: by, w: 340, h: 88 });
      button(ctx, 375 - 170, by, 340, 88, enough ? `${cost} 金币 · ${'gear' in p ? '升级' : '买下'}` : `还差 ${cost - s.coins} 金币`, { primary: enough, pressed: down, size: 30 });
    } else {
      text(ctx, status, 375, by - 10, 26, { bold: true, color: P.lilyDeep, maxWidth: d.w - 60 });
      if ('item' in p && s.owned.includes(p.item) && ['hat', 'neck'].includes(item(p.item)!.kind)) {
        const on = s.wear[item(p.item)!.kind as 'hat' | 'neck'] === p.item;
        const down = this.taps.add('wear', { x: 375 - 140, y: by + 20, w: 280, h: 76 });
        button(ctx, 375 - 140, by + 20, 280, 76, on ? '摘下来' : '戴上', { primary: !on, pressed: down, size: 30 });
      }
    }
    ctx.restore();
  }
}
