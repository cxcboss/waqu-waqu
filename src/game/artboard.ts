// Dev-only art board (open the game with ?art=1 on a dev server): every piece of the 河湾手账 kit on one
// scrolling page, under the time of day picked at the top, with the painted frog, owl and hamster
// placed beside it as the style reference. Not reachable in a release build.
import * as Kit from '../art/kit';
import type { IconName } from '../art/kit';
import { INK, P } from '../art/palette';
import { button, panel, roundRect, tape, text, type ButtonKind } from '../art/ui';
import { codeSprite } from '../art/sprites';
import type { Ctx } from '../platform/types';
import { ACHIEVEMENTS } from './career';
import type { Game, Scene } from './game';
import { Scroller, Taps, Toast, coinPill, dialog, header, iconButton, pill, tabs } from './menu';

const X0 = 24, CW = 702;

// A code sprite as an example: the riverside mailbox, baked once per hour (`art_mailbox:night` …), with its lamp lit after dark.
codeSprite('art_mailbox', [-70, -196, 76, 18], (c, v) => {
  const tod = Kit.TOD[v as Kit.TodName] ?? Kit.TOD.day;
  Kit.contactShadow(c, 0, 4, 48, 9, tod.shadow);
  if (tod.lit > 0) Kit.lampGlow(c, 0, -172, 64, tod);
  // the post and the lamp on it
  Kit.inked(c, () => Kit.boxPath(c, -8, -158, 16, 162, 3, 2, 0.4), P.wood, { band: 5, lw: 2.4 });
  Kit.inked(c, () => Kit.boxPath(c, -12, -188, 24, 26, 6, 4, 0.5), tod.lit > 0 ? tod.lampGlow : P.cream, { band: 4, lw: 2.2 });
  // the box: a rounded top, a slot and the red flag
  Kit.inked(c, () => {
    c.beginPath();
    c.moveTo(-44, -60);
    c.lineTo(-44, -100);
    c.arc(0, -100, 44, Math.PI, 0);
    c.lineTo(44, -60);
    c.closePath();
  }, P.blue, { band: 10, lw: 2.6, hatch: [-46, -146, 92, 88] });
  c.fillStyle = INK;
  roundRect(c, -22, -104, 44, 8, 4);
  c.fill();
  c.strokeStyle = INK;
  c.lineWidth = 3;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(52, -66);
  c.lineTo(52, -136);
  c.stroke();
  Kit.inked(c, () => Kit.polyPath(c, [[52, -136], [74, -134], [74, -114], [52, -116]], 3, 0.4, 2), P.red, { band: 4, lw: 2 });
});

export class ArtboardScene implements Scene {
  readonly id = 'artboard';
  private t = 0;
  /** Taps on the fixed top bar; `ctaps` are the scrolling content's (in content coordinates). */
  private taps = new Taps();
  private ctaps = new Taps();
  /** Widgets that register taps the board doesn't want (the header's back button). */
  private junk = new Taps();
  private toast = new Toast();
  private demo = new Toast();
  readonly scroll = new Scroller();
  tod: Kit.TodName;
  private hallTab = 0;
  private shopTab = 2;

  constructor(private game: Game, tod?: string | null) {
    this.tod = Kit.TOD_NAMES.includes(tod as Kit.TodName) ? (tod as Kit.TodName) : Kit.todName();
    void game.sprites.ensure(['owl_read', 'shop_hamster_happy']);
    this.demo.show('包裹已送达', 'parcel', Infinity);
  }

  update(dt: number) {
    this.t += dt;
    this.scroll.update(dt);
    this.toast.update(dt);
    this.demo.update(dt);
  }

  down(x: number, y: number) {
    if (!this.taps.down(x, y) && y > this.scroll.view.y) this.ctaps.down(x, y + this.scroll.y);
    this.scroll.down(x, y);
  }
  move(x: number, y: number) {
    this.taps.move(x, y);
    this.ctaps.move(x, y + this.scroll.y);
    this.scroll.move(x, y);
  }
  up(x: number, y: number) {
    const id = this.taps.up(x, y) ?? this.ctaps.up(x, y + this.scroll.y);
    this.scroll.up();
    if (id?.startsWith('tod')) this.tod = Kit.TOD_NAMES[Number(id.slice(3))];
    else if (id?.startsWith('htab')) this.hallTab = Number(id.slice(4));
    else if (id?.startsWith('stab')) this.shopTab = Number(id.slice(4));
    else if (id) this.toast.show(`点了 ${id}`, 'check');
  }
  wheelBy(dy: number) {
    this.scroll.y = Math.max(0, Math.min(this.scroll.max, this.scroll.y + dy));
  }

  render(ctx: Ctx) {
    const g = this.game;
    const H = g.H, top = g.safeT;
    const tod = Kit.TOD[this.tod];
    this.taps.clear();
    this.ctaps.clear();
    this.junk.clear();
    Kit.screenExact(false);
    // the page: the hour's sky fading into its meadow, with paper grain over it
    const grd = ctx.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, tod.skyTop);
    grd.addColorStop(0.35, tod.skyBot);
    grd.addColorStop(0.36, tod.ground);
    grd.addColorStop(1, Kit.shade(tod.ground, 0.08));
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 750, H);
    Kit.grainRect(ctx, 0, 0, 750, H, 0.5);

    const barH = 96;
    this.scroll.view = { x: 0, y: top + barH, w: 750, h: H - top - barH };
    this.scroll.begin(ctx);
    let y = top + barH + 16;
    y = this.sectionScenes(ctx, y);
    y = this.sectionOutdoors(ctx, y);
    y = this.sectionCode(ctx, y);
    y = this.sectionButtons(ctx, y);
    y = this.sectionHeader(ctx, y);
    y = this.sectionDialog(ctx, y);
    y = this.sectionSigns(ctx, y);
    y = this.sectionLabels(ctx, y);
    y = this.sectionEmpty(ctx, y);
    y = this.sectionInk(ctx, y);
    y = this.sectionIcons(ctx, y);
    y = this.sectionMedals(ctx, y);
    y = this.sectionFrames(ctx, y);
    this.scroll.end(ctx);
    this.scroll.setContent(y - (top + barH) + 40);

    // top bar: title and the time-of-day switch
    ctx.fillStyle = P.paper;
    ctx.fillRect(0, 0, 750, top + barH);
    Kit.grainRect(ctx, 0, 0, 750, top + barH, 0.5);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(0, top + barH);
    ctx.lineTo(750, top + barH);
    ctx.stroke();
    text(ctx, '河湾手账 · 美术板', 24, top + 48, 30, { bold: true, align: 'left' });
    Kit.TOD_NAMES.forEach((n, i) => {
      const on = n === this.tod;
      pill(ctx, this.taps, `tod${i}`, 330 + i * 102, top + 22, 94, 52, Kit.TOD[n].label, { size: 22, fill: on ? P.orange : P.cream, color: on ? P.white : INK });
    });
    this.toast.render(ctx, top + barH + 20);
    Kit.screenExact(true);
  }

  /** Section title on its own little paper strip. */
  private heading(ctx: Ctx, y: number, title: string, sub = '') {
    // a paper strip taped to the page, so the title reads on any hour's background
    const strip = () => Kit.wobbleRect(ctx, X0 - 8, y + 2, CW + 16, 50, 14, title.length * 7, 0.5);
    ctx.save();
    ctx.globalAlpha = 0.94;
    Kit.inked(ctx, strip, P.paper, { lw: 2, band: 5, dark: 0.05, light: 0 });
    ctx.restore();
    ctx.save();
    strip();
    Kit.grainFill(ctx, 0.4);
    ctx.restore();
    tape(ctx, X0 + 30, y + 2, 76, undefined, -0.08);
    text(ctx, title, X0 + 12, y + 28, 30, { bold: true, align: 'left' });
    if (sub) text(ctx, sub, X0 + CW - 6, y + 29, 22, { align: 'right', color: P.inkSoft, maxWidth: CW - 230 });
    return y + 68;
  }

  /** A paper card behind a section's content. */
  private card(ctx: Ctx, y: number, h: number) {
    Kit.inked(ctx, () => Kit.wobbleRect(ctx, X0 - 8, y, CW + 16, h, 18, Math.round(h)), P.paper, { lw: 2.2, band: 8, dark: 0.06 });
    ctx.save();
    Kit.wobbleRect(ctx, X0 - 8, y, CW + 16, h, 18, Math.round(h));
    Kit.grainFill(ctx, 0.5);
    ctx.restore();
  }

  // ---------------------------------------------------------------- time of day

  private sectionScenes(ctx: Ctx, y: number) {
    y = this.heading(ctx, y, '时段色板', '清晨 5–9 · 白天 9–17 · 黄昏 17–19 · 夜晚 19–5');
    const w = 345, h = 300;
    Kit.TOD_NAMES.forEach((n, i) => {
      const x = X0 + (i % 2) * (w + 12), yy = y + Math.floor(i / 2) * (h + 12);
      this.vignette(ctx, x, yy, w, h, Kit.TOD[n], i);
    });
    return y + (h + 12) * 2 + 20;
  }

  /** A little river-bend scene in one token set, with the painted frog standing in it. */
  private vignette(ctx: Ctx, x: number, y: number, w: number, h: number, tod: Kit.Tod, i: number) {
    const t = this.t;
    ctx.save();
    Kit.wobbleRect(ctx, x, y, w, h, 16, i + 3, 0.6);
    ctx.clip();
    Kit.sky(ctx, x, y, w, h * 0.5, tod);
    if (tod.stars) Kit.stars(ctx, x, y, w, h * 0.4, t, 26, i + 3);
    Kit.sunMoon(ctx, x + w * 0.78, y + h * 0.17, 17, tod);
    Kit.cloud(ctx, x + ((t * 8 + 60) % (w + 120)) - 60, y + 42, 0.62, tod, 2);
    Kit.hills(ctx, x - 10, w + 20, y + h * 0.36, y + h, 26, tod.hillFar, 4 + i);
    Kit.hills(ctx, x - 10, w + 20, y + h * 0.46, y + h, 18, tod.hillNear, 9 + i);
    ctx.fillStyle = tod.ground;
    ctx.fillRect(x, y + h * 0.54, w, h * 0.46);
    // the creek
    const cy = y + h * 0.7;
    const creek = () => {
      ctx.beginPath();
      ctx.moveTo(x - 20, cy + 14);
      ctx.bezierCurveTo(x + w * 0.3, cy - 18, x + w * 0.6, cy + 30, x + w + 20, cy);
    };
    ctx.save();
    ctx.lineCap = 'round';
    creek();
    ctx.strokeStyle = Kit.alpha(INK, 0.45);
    ctx.lineWidth = 44;
    ctx.stroke();
    creek();
    ctx.strokeStyle = tod.water;
    ctx.lineWidth = 40;
    ctx.stroke();
    creek();
    ctx.strokeStyle = Kit.alpha(tod.waterDeep, 0.5);
    ctx.lineWidth = 14;
    ctx.stroke();
    ctx.restore();
    Kit.glints(ctx, creek, t, tod, 2.4);
    // a little house with a lit window and a lamp post
    const hx = x + 70, hy = y + h * 0.58;
    Kit.contactShadow(ctx, hx, hy, 56, 9, tod.shadow);
    Kit.inked(ctx, () => Kit.polyPath(ctx, [[hx - 44, hy - 70], [hx + 44, hy - 71], [hx + 45, hy], [hx - 45, hy + 1]], 5 + i, 0.8, 3), P.cream, { band: 8, lw: 2.6, hatch: [hx - 45, hy - 72, 90, 74] });
    Kit.windowPane(ctx, hx - 32, hy - 56, 26, 24, tod, i);
    Kit.inked(ctx, () => {
      ctx.beginPath();
      ctx.moveTo(hx + 6, hy);
      ctx.lineTo(hx + 6, hy - 38);
      ctx.quadraticCurveTo(hx + 20, hy - 54, hx + 34, hy - 38);
      ctx.lineTo(hx + 34, hy);
      ctx.closePath();
    }, P.blue, { band: 6, lw: 2.4 });
    Kit.inked(ctx, () => Kit.polyPath(ctx, [[hx - 58, hy - 64], [hx, hy - 112], [hx + 58, hy - 64]], 8 + i, 0.8, 5), P.orange, { band: 12, lw: 2.8, hatch: [hx - 58, hy - 112, 116, 50] });
    const lx = x + 176, ly = y + h * 0.6;
    Kit.lampGlow(ctx, lx, ly - 64, 60, tod, t);
    ctx.fillStyle = INK;
    ctx.fillRect(lx - 2.5, ly - 62, 5, 62);
    Kit.inked(ctx, () => Kit.boxPath(ctx, lx - 10, ly - 80, 20, 20, 4, 3), tod.lit > 0 ? tod.lampGlow : P.cream, { band: 4, lw: 2.2 });
    for (let k = 0; k < 6; k++) Kit.tuft(ctx, x + 20 + k * 58 + (k % 2) * 14, y + h - 18 - (k % 3) * 14, t, 0.8, k % 2 ? tod.grass : Kit.shade(tod.grass, 0.15));
    // the painted frog on the bank
    const sp = this.game.sprites;
    Kit.contactShadow(ctx, x + w - 82, y + h * 0.6, 34, 8, tod.shadow);
    sp.draw(ctx, 'frog_stand', x + w - 82, y + h * 0.6, 0.62);
    if (tod.stars) Kit.fireflies(ctx, x, y + h * 0.45, w, h * 0.5, t, 5);
    Kit.grainRect(ctx, x, y, w, h, 0.45);
    ctx.restore();
    ctx.save();
    Kit.wobbleRect(ctx, x, y, w, h, 16, i + 3, 0.6);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.4;
    ctx.stroke();
    ctx.restore();
    text(ctx, tod.label, x + 16, y + 26, 24, { bold: true, align: 'left', color: tod.stars ? P.white : INK });
  }

  /** A button that presses while held (taps land in the content's own tap list). */
  private btn(ctx: Ctx, id: string, x: number, y: number, w: number, h: number, label: string, o: Parameters<typeof button>[6] = {}) {
    const down = this.ctaps.add(id, { x, y, w, h }, 4);
    button(ctx, x, y, w, h, label, { ...o, pressed: down });
  }

  // ---------------------------------------------------------------- straight on the scenery

  private sectionOutdoors(ctx: Ctx, y: number) {
    y = this.heading(ctx, y, '直接放在景上', '不垫纸卡，看各时段是否都读得清');
    const tod = Kit.TOD[this.tod];
    const sp = this.game.sprites;
    // a signpost on the bank, the frog beside it saying where we're off to
    Kit.woodSign(ctx, X0 + 140, y + 96, 250, 96, '河湾邮局', '第 3 天 · 晴', { post: 170, glow: tod.lit, seed: 4 });
    const fx = X0 + 360, fy = y + 344;
    Kit.contactShadow(ctx, fx, fy, 62, 12, tod.shadow);
    sp.draw(ctx, 'frog_stand', fx, fy, 0.82);
    Kit.say(ctx, X0 + 450, y + 6, 252, '今天有 3 个包裹，出发吧！', fx + 50, y + 120);
    this.btn(ctx, 'go', X0 + 470, y + 172, 220, 84, '出发', { primary: true, icon: 'truck' });
    coinPill(ctx, sp, X0 + 500, y + 288, 1280);
    return y + 380;
  }

  // ---------------------------------------------------------------- buttons, pills, coins

  private sectionButtons(ctx: Ctx, y: number) {
    y = this.heading(ctx, y, '按钮', 'primary · secondary · ghost · 按下 · 禁用');
    const h = 650;
    this.card(ctx, y, h);
    const kinds: ButtonKind[] = ['primary', 'secondary', 'ghost'];
    const bw = 216, bh = 84, gap = 15;
    const icons: IconName[] = ['parcel', 'bag', 'map'];
    kinds.forEach((k, i) => {
      const x = X0 + 10 + i * (bw + gap);
      this.btn(ctx, `b-${k}`, x, y + 28, bw, bh, ['出发', '再来一次', '算了'][i], { kind: k });
      this.btn(ctx, `bi-${k}`, x, y + 134, bw, bh, ['送包裹', '小卖部', '路线图'][i], { kind: k, icon: icons[i] });
    });
    const ry = y + 240;
    button(ctx, X0 + 10, ry, bw, bh, '按下', { primary: true, pressed: true });
    button(ctx, X0 + 10 + bw + gap, ry, bw, bh, '金币不够', { primary: true, disabled: true });
    button(ctx, X0 + 10 + 2 * (bw + gap), ry, bw, bh, '未解锁', { disabled: true, icon: 'lock' });
    text(ctx, '按下 · 禁用（变灰而不是变透明）· 禁用带图标', X0 + CW / 2, ry + 112, 22, { color: P.inkSoft });
    // round pictogram buttons: the tap area is at least 88 across
    const ib: IconName[] = ['speaker', 'music', 'pause', 'close', 'gear', 'map', 'lock'];
    ib.forEach((n, i) => iconButton(ctx, this.ctaps, `i-${n}`, X0 + 50 + i * 100, y + 434, 76, n, { dot: n === 'map', disabled: n === 'lock' }));
    // pills
    const py = y + 500;
    pill(ctx, this.ctaps, 'p-gear', X0 + 10, py, 150, 56, '设置', { icon: 'gear' });
    pill(ctx, this.ctaps, 'p-help', X0 + 176, py, 120, 56, '帮助');
    pill(ctx, this.ctaps, 'p-on', X0 + 312, py, 120, 56, '已选', { fill: P.orange, color: P.white });
    pill(ctx, this.ctaps, 'p-off', X0 + 448, py, 120, 56, '已满', { disabled: true });
    pill(ctx, this.ctaps, 'p-snd', X0 + 584, py, 112, 56, '', { icon: 'speaker' });
    // the coin pill: three digits, six digits, and grown to the left for a big number
    const cy = y + 572;
    coinPill(ctx, this.game.sprites, X0 + 10, cy, 860);
    coinPill(ctx, this.game.sprites, X0 + 176, cy, 123456);
    coinPill(ctx, this.game.sprites, X0 + CW - 10, cy, 98765432, 0, { right: true });
    return y + h + 30;
  }

  // ---------------------------------------------------------------- header and tabs

  private sectionHeader(ctx: Ctx, y: number) {
    y = this.heading(ctx, y, '顶栏与页签', '选中的页签和下面的纸连成一张');
    const g = this.game;
    ctx.save();
    ctx.translate(0, y - 10 - g.safeT);
    header(ctx, g, this.junk, '荣誉室', { icon: 'trophy' });
    ctx.restore();
    ctx.save();
    ctx.translate(0, y + 86 - g.safeT);
    header(ctx, g, this.junk, '小卖部', { back: '返回' });
    ctx.restore();
    y += 196;
    const sh = 168;
    tabs(ctx, this.ctaps, 'htab', 24, y, 702, ['送单', '日志', '相册', '荣誉', '动态'], this.hallTab, [false, false, false, false, true],
      { names: ['tab_record', 'tab_log', 'tab_album', 'tab_honour', 'tab_news'] }, { sheet: { h: sh } });
    this.sheetRows(ctx, y + 58, ['第 1 天 · 晨雾渡口', '第 2 天 · 芦苇湾', '第 3 天 · 老磨坊']);
    y += 58 + sh + 84;
    tabs(ctx, this.ctaps, 'stab', 24, y, 702, ['装备', '衣帽', '家居', '相框'], this.shopTab, [false, true, false, false],
      { names: ['cat_gear', 'cat_hat', 'cat_deco', 'cat_frame'] }, { sheet: { h: sh, fill: P.cream } });
    this.sheetRows(ctx, y + 58, ['草帽', '毛线帽', '贝雷帽'], true);
    return y + 58 + sh + 40;
  }

  /** A few list rows on a tab sheet, so the joined tab is seen above real-looking content. */
  private sheetRows(ctx: Ctx, y: number, rows: string[], shop = false) {
    rows.forEach((s, i) => {
      const ry = y + 22 + i * 46;
      if (shop) {
        Kit.icon(ctx, 'hat', X0 + 40, ry + 18, 38, { faded: i === 2 });
        text(ctx, s, X0 + 76, ry + 19, 26, { align: 'left', color: i === 2 ? P.inkSoft : INK });
        Kit.pips(ctx, X0 + 300, ry + 19, 3 - i, 3, { r: 9 });
        Kit.priceTag(ctx, X0 + 560, ry + 19, [120, 260, 900][i], { size: 22, rot: 0 });
      } else {
        Kit.icon(ctx, 'stamp', X0 + 40, ry + 18, 38);
        text(ctx, s, X0 + 76, ry + 19, 26, { align: 'left' });
        text(ctx, ['S', 'A', 'B'][i], X0 + 640, ry + 19, 30, { bold: true, color: [P.gold, P.teal, P.inkSoft][i] });
      }
      if (i < rows.length - 1) {
        ctx.save();
        ctx.strokeStyle = Kit.alpha(INK, 0.25);
        ctx.setLineDash([5, 5]);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(X0 + 16, ry + 42);
        ctx.lineTo(X0 + CW - 16, ry + 42);
        ctx.stroke();
        ctx.restore();
      }
    });
  }

  // ---------------------------------------------------------------- dialog and toast

  private sectionDialog(ctx: Ctx, y: number) {
    y = this.heading(ctx, y, '对话框与提示', 'dialog（标题绸带）· toast');
    const bh = 560;
    ctx.save();
    roundRect(ctx, X0 - 8, y, CW + 16, bh, 18);
    ctx.clip();
    // whatever screen is behind it
    this.vignette(ctx, X0 - 8, y, CW + 16, bh, Kit.TOD[this.tod], 1);
    ctx.translate(0, y);
    const fake = { H: bh, safeT: 0 } as unknown as Game;
    const r = dialog(ctx, fake, this.junk, 'dlg', 560, 420, 1, { title: '今日结算' });
    Kit.medal(ctx, 'sgrade', 375, r.y + 120, 110, true);
    text(ctx, '全部准时送达，评级 S', 375, r.y + 210, 28, { bold: true });
    Kit.icon(ctx, 'coin', 330, r.y + 262, 40);
    text(ctx, '+ 120', 392, r.y + 263, 30, { bold: true, color: P.orangeDeep });
    button(ctx, r.x + 40, r.y + 316, 220, 80, '再送一次', { kind: 'ghost' });
    button(ctx, r.x + r.w - 260, r.y + 316, 220, 80, '好的', { primary: true });
    ctx.restore();
    ctx.save();
    roundRect(ctx, X0 - 8, y, CW + 16, bh, 18);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.4;
    ctx.stroke();
    ctx.restore();
    this.demo.render(ctx, y + bh + 22);
    return y + bh + 110;
  }

  // ---------------------------------------------------------------- signs, banners, speech

  private sectionSigns(ctx: Ctx, y: number) {
    y = this.heading(ctx, y, '招牌与对话', 'woodSign · ribbon · say · chalkboard');
    const h = 700;
    this.card(ctx, y, h);
    const sp = this.game.sprites;
    Kit.woodSign(ctx, X0 + 180, y + 120, 300, 100, '小卖部', '每天 8 点开门', { hang: 56, seed: 9, wood: P.wood });
    Kit.ribbon(ctx, X0 + 520, y + 70, 250, '今日任务');
    Kit.ribbon(ctx, X0 + 520, y + 160, 200, '新纪录！', { color: P.teal, h: 48 });
    // the owl hands out the route
    const ox = X0 + 110, oy = y + 470;
    Kit.contactShadow(ctx, ox, oy - 2, 60, 10);
    if (sp.has('owl_read')) sp.draw(ctx, 'owl_read', ox, oy, 0.92);
    Kit.say(ctx, X0 + 196, y + 236, 206, '咕咕，明天的路线我画好了。', ox + 50, oy - 160);
    // the hamster at the day's chalkboard
    const inner = Kit.chalkboard(ctx, X0 + 420, y + 268, 270, 190, { hang: 34, seed: 5 });
    Kit.chalkText(ctx, '今日特价', inner.x + inner.w / 2, inner.y + 34, 30, { bold: true });
    Kit.chalkText(ctx, '草帽 八折', inner.x + inner.w / 2, inner.y + 84, 26);
    Kit.chalkText(ctx, '先到先得', inner.x + inner.w / 2, inner.y + 126, 22, { color: '#F6D68A' });
    const hx = X0 + 600, hy = y + 660;
    Kit.contactShadow(ctx, hx, hy - 2, 52, 9);
    if (sp.has('shop_hamster_happy')) sp.draw(ctx, 'shop_hamster_happy', hx, hy, 1.15);
    Kit.say(ctx, X0 + 40, y + 540, 400, '欢迎光临！草帽今天打八折哦。', hx - 50, hy - 100, { fill: P.cream });
    return y + h + 30;
  }

  // ---------------------------------------------------------------- tags, pips, stamps

  private sectionLabels(ctx: Ctx, y: number) {
    y = this.heading(ctx, y, '标签与印章', 'priceTag · pips · 已拥有 · NEW');
    const h = 330;
    this.card(ctx, y, h);
    Kit.priceTag(ctx, X0 + 110, y + 60, 120);
    Kit.priceTag(ctx, X0 + 300, y + 60, 12800, { rot: 0.04 });
    Kit.priceTag(ctx, X0 + 500, y + 60, '免费', { coin: false, color: P.lily });
    Kit.pips(ctx, X0 + 30, y + 140, 3, 5);
    Kit.pips(ctx, X0 + 250, y + 140, 5, 5);
    Kit.pips(ctx, X0 + 470, y + 140, 0, 4, { color: P.teal });
    // shop item cards: owned (stamped) and new
    const cw = 150, ch = 130;
    ['hat', 'scarf', 'sofa', 'frame'].forEach((n, i) => {
      const x = X0 + 20 + i * (cw + 24), cy = y + 180;
      panel(ctx, x, cy, cw, ch, { r: 16, grain: true, fill: P.cream });
      Kit.icon(ctx, n as IconName, x + cw / 2, cy + ch / 2 - 6, 64);
      if (i === 0) Kit.postmark(ctx, x + cw - 40, cy + ch - 36, '已拥有', { r: 40 });
      if (i === 2) Kit.cornerRibbon(ctx, x, cy, cw, ch, 'NEW', { r: 16 });
      if (i === 3) Kit.cornerRibbon(ctx, x, cy, cw, ch, '限定', { r: 16, color: P.teal, corner: 'tl' });
    });
    return y + h + 30;
  }

  // ---------------------------------------------------------------- empty states

  private sectionEmpty(ctx: Ctx, y: number) {
    y = this.heading(ctx, y, '空状态', '空列表时的小插图');
    const h = 720;
    this.card(ctx, y, h);
    const items: [Kit.EmptyKind, string, string][] = [
      ['boat', '河面静悄悄', '今天还没有包裹'],
      ['album', '相册还空着', '送货时拍下的照片会放在这里'],
      ['letters', '还没有来信', '送满 3 天会收到第一封'],
      ['log', '日志还是空的', '送完一天就会记下一页'],
      ['news', '今天没有新消息', '明天再来看看'],
    ];
    items.forEach(([k, a, b], i) => {
      const cx = i === 4 ? X0 + CW / 2 : X0 + (i % 2 ? 530 : 180), yy = y + 26 + Math.floor(i / 2) * 230;
      Kit.emptyState(ctx, cx, yy, k, a, b, { size: 160 });
    });
    return y + h + 30;
  }

  // ---------------------------------------------------------------- ink, fills, paper, colour

  private sectionInk(ctx: Ctx, y: number) {
    y = this.heading(ctx, y, '笔触与填色', 'polyPath · blobPath · inked() · 纸纹');
    const h = 700;
    this.card(ctx, y, h);
    // the fill recipe, step by step
    const steps = ['平涂', '+暗部', '+高光', '+排线', '+墨线'];
    steps.forEach((s, i) => {
      const cx = X0 + 70 + i * 140, cy = y + 90;
      const path = () => Kit.polyPath(ctx, [[cx - 50, cy - 46], [cx + 50, cy - 47], [cx + 51, cy + 44], [cx - 51, cy + 45]], 21, 0.8, 6);
      if (i === 0) Kit.inked(ctx, path, P.orange, { lw: 0, shade: false });
      else if (i === 1) Kit.inked(ctx, path, P.orange, { lw: 0, light: 0 });
      else if (i === 2) Kit.inked(ctx, path, P.orange, { lw: 0 });
      else if (i === 3) Kit.inked(ctx, path, P.orange, { lw: 0, hatch: [cx - 52, cy - 48, 104, 94] });
      else Kit.inked(ctx, path, P.orange, { hatch: [cx - 52, cy - 48, 104, 94] });
      text(ctx, s, cx, cy + 74, 22, { color: P.inkSoft });
    });
    // shapes: box, blob, puff, contact shadows
    const sy = y + 280;
    Kit.contactShadow(ctx, X0 + 80, sy + 48, 60, 10);
    Kit.inked(ctx, () => Kit.polyPath(ctx, [[X0 + 30, sy - 50], [X0 + 130, sy - 52], [X0 + 132, sy + 46], [X0 + 28, sy + 48]], 4, 0.9, 5), P.kraft, { hatch: [X0 + 26, sy - 54, 110, 104] });
    text(ctx, 'polyPath', X0 + 80, sy + 82, 22, { color: P.inkSoft });
    Kit.contactShadow(ctx, X0 + 250, sy + 46, 58, 10);
    Kit.inked(ctx, () => Kit.blobEllipse(ctx, X0 + 250, sy, 62, 44, 7, 0.08, 9), P.lily, { band: 12 });
    text(ctx, 'blobPath', X0 + 250, sy + 82, 22, { color: P.inkSoft });
    Kit.contactShadow(ctx, X0 + 420, sy + 46, 64, 10);
    Kit.inked(ctx, () => Kit.puffPath(ctx, X0 + 420, sy - 4, 58, 42, 8, 5), P.lilyDeep, { band: 14, hatch: [X0 + 356, sy - 60, 130, 110] });
    text(ctx, 'puffPath', X0 + 420, sy + 82, 22, { color: P.inkSoft });
    ctx.save();
    Kit.wobbleRect(ctx, X0 + 520, sy - 56, 160, 104, 12, 6, 0.5);
    ctx.clip();
    Kit.sky(ctx, X0 + 520, sy - 56, 160, 104, Kit.TOD.day);
    Kit.cloud(ctx, X0 + 600, sy - 4, 0.9, Kit.TOD.day, 4);
    ctx.restore();
    Kit.wobbleRect(ctx, X0 + 520, sy - 56, 160, 104, 12, 6, 0.5);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.stroke();
    text(ctx, 'cloud', X0 + 600, sy + 82, 22, { color: P.inkSoft });
    // colour helpers
    const cy = y + 430;
    const base = [P.orange, P.teal, P.lily, P.gold, P.kraft, P.blue];
    base.forEach((c, i) => {
      const x = X0 + 20 + i * 114;
      [Kit.shade(c, 0.25), c, Kit.tint(c, 0.4), Kit.faded(c)].forEach((cc, k) => {
        Kit.inked(ctx, () => Kit.boxPath(ctx, x + k * 24, cy, 22, 44, 4, i * 4 + k, 0.4), cc, { lw: 1.6, band: 4 });
      });
    });
    text(ctx, 'shade · 原色 · tint · faded', X0 + CW / 2, cy + 74, 22, { color: P.inkSoft });
    // the paper grain tile, laid as a pattern at three strengths
    const gy = y + 548;
    [0, 0.45, 1].forEach((a, i) => {
      const x = X0 + 20 + i * 230;
      ctx.save();
      Kit.wobbleRect(ctx, x, gy, 200, 96, 12, 40 + i, 0.5);
      ctx.fillStyle = [P.paper, P.cream, P.kraftTop][i];
      ctx.fill();
      if (a) Kit.grainFill(ctx, a);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
      text(ctx, `纸纹 ${a}`, x + 100, gy + 124, 22, { color: P.inkSoft });
    });
    return y + h + 30;
  }

  // ---------------------------------------------------------------- codeSprite

  private sectionCode(ctx: Ctx, y: number) {
    y = this.heading(ctx, y, 'codeSprite', '画一次烘焙成图，按变体（时段）各烘一张');
    const h = 290;
    this.card(ctx, y, h);
    const sp = this.game.sprites;
    Kit.TOD_NAMES.forEach((n, i) => {
      const x = X0 + 30 + i * 172, w = 150;
      ctx.save();
      Kit.wobbleRect(ctx, x, y + 20, w, 210, 14, 50 + i, 0.5);
      ctx.clip();
      Kit.sky(ctx, x, y + 20, w, 150, Kit.TOD[n]);
      ctx.fillStyle = Kit.TOD[n].ground;
      ctx.fillRect(x, y + 170, w, 60);
      sp.draw(ctx, `art_mailbox:${n}`, x + w / 2, y + 212, 0.82);
      ctx.restore();
      Kit.wobbleRect(ctx, x, y + 20, w, 210, 14, 50 + i, 0.5);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2.2;
      ctx.stroke();
      text(ctx, `:${n}`, x + w / 2, y + 258, 22, { color: P.inkSoft });
    });
    return y + h + 30;
  }

  // ---------------------------------------------------------------- icons

  private sectionIcons(ctx: Ctx, y: number) {
    const names = Kit.ICON_NAMES;
    y = this.heading(ctx, y, '图标', `${names.length} 个 · 44 单位`);
    const cols = 6, cell = CW / cols, rowH = 104;
    const rows = Math.ceil(names.length / cols);
    const h = rows * rowH + 270;
    this.card(ctx, y, h);
    names.forEach((n, i) => {
      const cx = X0 + cell * (i % cols) + cell / 2, cy = y + 44 + Math.floor(i / cols) * rowH;
      Kit.icon(ctx, n, cx, cy, 44);
      text(ctx, n, cx, cy + 44, 18, { color: P.inkSoft, maxWidth: cell - 6 });
    });
    // sizes and the faded look
    const sy = y + rows * rowH + 60;
    const sizes = [32, 44, 64, 96];
    let x = X0 + 40;
    for (const n of ['parcel', 'clipboard', 'medalless'] as const) {
      if (n === 'medalless') break;
      for (const s of sizes) {
        Kit.icon(ctx, n, x + s / 2, sy + 30, s);
        x += s + 18;
      }
      x += 20;
    }
    let fx = X0 + 40;
    for (const n of ['lock', 'hat', 'sofa', 'frame', 'camera', 'gift', 'trophy', 'bag'] as const) {
      Kit.icon(ctx, n, fx, sy + 128, 52, { faded: true });
      fx += 82;
    }
    text(ctx, 'faded：未解锁 / 未拥有', X0 + CW - 10, sy + 184, 22, { align: 'right', color: P.inkSoft });
    return y + h + 30;
  }

  // ---------------------------------------------------------------- medals

  private sectionMedals(ctx: Ctx, y: number) {
    y = this.heading(ctx, y, '成就勋章', `${ACHIEVEMENTS.length} 枚 · 已得 / 未得`);
    const cols = 4, cell = CW / cols, rowH = 150;
    const rows = Math.ceil(ACHIEVEMENTS.length / 2);
    const h = rows * rowH + 20;
    this.card(ctx, y, h);
    ACHIEVEMENTS.forEach((a, i) => {
      const col = (i % 2) * 2, row = Math.floor(i / 2);
      for (const earned of [true, false]) {
        const cx = X0 + cell * (col + (earned ? 0 : 1)) + cell / 2, cy = y + 64 + row * rowH;
        Kit.medal(ctx, a.id, cx, cy, 84, earned);
        text(ctx, a.name, cx, cy + 58, 22, { color: earned ? INK : P.inkSoft, bold: earned, maxWidth: cell - 8 });
      }
    });
    return y + h + 30;
  }

  // ---------------------------------------------------------------- frames

  private sectionFrames(ctx: Ctx, y: number) {
    y = this.heading(ctx, y, '相框', '任意比例 · 先画照片再画框');
    const h = 640;
    this.card(ctx, y, h);
    Kit.FRAME_KINDS.forEach((k, i) => {
      // landscape, as on the wall
      const x = X0 + 20 + (i % 2) * 350, yy = y + 30 + Math.floor(i / 2) * 200;
      const o = Kit.frameOpening(k, x, yy, 200, 160);
      this.photo(ctx, o.x, o.y, o.w, o.h, i);
      Kit.frame(ctx, k, x, yy, 200, 160);
      // portrait and the tiny picker size
      const px = x + 230, py = yy + 6;
      const op = Kit.frameOpening(k, px, py, 96, 124);
      this.photo(ctx, op.x, op.y, op.w, op.h, i + 2);
      Kit.frame(ctx, k, px, py, 96, 124);
      Kit.frame(ctx, k, px + 26, py + 134, 44, 38);
    });
    // a wide one
    const wy = y + 450;
    const o = Kit.frameOpening('gold', X0 + 160, wy, 380, 150);
    this.photo(ctx, o.x, o.y, o.w, o.h, 1);
    Kit.frame(ctx, 'gold', X0 + 160, wy, 380, 150);
    return y + h + 30;
  }

  /** A stand-in photo: a bit of riverbank. */
  private photo(ctx: Ctx, x: number, y: number, w: number, h: number, i: number) {
    const tod = Kit.TOD[Kit.TOD_NAMES[i % 4]];
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    Kit.sky(ctx, x, y, w, h, tod);
    Kit.sunMoon(ctx, x + w * 0.72, y + h * 0.3, Math.min(w, h) * 0.1, tod);
    Kit.hills(ctx, x - 10, w + 20, y + h * 0.62, y + h, h * 0.12, tod.hillNear, i + 2, 0.25);
    ctx.fillStyle = tod.water;
    ctx.fillRect(x, y + h * 0.8, w, h * 0.2);
    ctx.restore();
  }
}
