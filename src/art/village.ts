// The river-bend village on the home page, drawn in code with the 河湾手账 kit: the three buildings, the
// courier van, trees, bushes, rocks, flowers, reeds, fences, lamps, the bridge and the lily pads.
// Everything takes the hour's tokens (Tod), so the village has a morning, a day, a dusk and a night.
// Buildings and the van stand on their ground point (0, 0) and are drawn upward; nothing here keeps state.
import type { Ctx } from '../platform/types';
import { alpha, blobEllipse, boxPath, contactShadow, hatch, inked, jit, jit01, mix, polyPath, puffPath, shade, tint, windowPane, type Tod } from './kit';
import { INK, P } from './palette';

/** A fixed palette colour as it looks at this hour: a touch warmer at dusk, blue and dim at night. */
export function hue(c: string, tod: Tod) {
  if (tod.name === 'night') return mix(c, '#2C3E57', 0.44);
  if (tod.name === 'dusk') return mix(c, '#D98C6A', 0.12);
  if (tod.name === 'morning') return mix(c, '#F3D8B6', 0.06);
  return c;
}

/** Foliage greens for the hour: dark, mid and light. */
export function leaves(tod: Tod): [string, string, string] {
  return [shade(tod.grass, 0.2), tod.grass, tint(tod.grass, 0.22)];
}

const line = (ctx: Ctx, pts: readonly (readonly [number, number])[], color: string = INK, w = 2) => {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
};

const disc = (ctx: Ctx, x: number, y: number, r: number, fill: string) => {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
};

/** Rows of round roof tiles (scallops) over a box; clip to the roof first. */
function tileRows(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, color: string, row = 17, w = 24) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.7;
  ctx.globalAlpha *= 0.7;
  ctx.beginPath();
  for (let y = y0, r = 0; y < y1; y += row, r++) {
    for (let x = x0 - ((r % 2) * w) / 2; x < x1; x += w) {
      ctx.moveTo(x + w, y);
      ctx.arc(x + w / 2, y, w / 2, 0, Math.PI);
    }
  }
  ctx.stroke();
  ctx.restore();
}

/** Glass of a round window, glowing after dark, with its cross bars and a wooden ring. */
function roundWindow(ctx: Ctx, x: number, y: number, r: number, tod: Tod, ring: string) {
  if (tod.lit > 0) {
    const g = ctx.createRadialGradient(x, y, 2, x, y, r * 2.6);
    g.addColorStop(0, alpha(tod.windowGlow, 0.5 * tod.lit));
    g.addColorStop(1, alpha(tod.windowGlow, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - r * 2.6, y - r * 2.6, r * 5.2, r * 5.2);
  }
  const glass = tod.lit > 0.5 ? tod.windowGlow : tod.lit > 0 ? tint(tod.windowGlow, 0.35) : tod.window;
  inked(ctx, () => {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
  }, glass, { band: 5, lw: 2.2 });
  ctx.save();
  line(ctx, [[x - r, y], [x + r, y]], INK, 2);
  line(ctx, [[x, y - r], [x, y + r]], INK, 2);
  if (tod.lit < 0.5) line(ctx, [[x - r * 0.55, y - r * 0.1], [x - r * 0.15, y - r * 0.55]], alpha(P.white, 0.85), 2.4);
  ctx.beginPath();
  ctx.arc(x, y, r + 4, 0, Math.PI * 2);
  ctx.strokeStyle = ring;
  ctx.lineWidth = 7;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, r + 7.5, 0, Math.PI * 2);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

/** A planter box of flowers along a window sill, `w` wide, its top at y. */
function flowerBox(ctx: Ctx, x: number, y: number, w: number, tod: Tod, seed: number) {
  const [dk, md] = leaves(tod);
  for (let i = 0; i < 5; i++) {
    const fx = x + 6 + ((w - 12) * i) / 4;
    ctx.beginPath();
    ctx.ellipse(fx, y - 4, 8, 6, 0, 0, Math.PI * 2);
    ctx.fillStyle = i % 2 ? md : dk;
    ctx.fill();
  }
  const cols = [P.pink, P.red, P.white, P.gold];
  for (let i = 0; i < 4; i++) {
    const fx = x + 10 + ((w - 20) * i) / 3 + jit(seed, i) * 3;
    flower(ctx, fx, y - 9 + jit(seed, i + 9) * 2, hue(cols[(i + seed) % 4], tod), 0.8);
  }
  inked(ctx, () => boxPath(ctx, x, y, w, 12, 2, seed, 0.4), hue(P.woodDeep, tod), { band: 3, lw: 2 });
}

/** A five-petal flower; `s` 1 is about 14 across. */
export function flower(ctx: Ctx, x: number, y: number, color: string, s = 1) {
  ctx.fillStyle = color;
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 - Math.PI / 2;
    ctx.beginPath();
    ctx.ellipse(x + Math.cos(a) * 4.2 * s, y + Math.sin(a) * 3.6 * s, 3.6 * s, 3.1 * s, a, 0, Math.PI * 2);
    ctx.fill();
  }
  disc(ctx, x, y, 2.2 * s, P.mustard);
}

/** A little lantern on a wall bracket (the glass glows after dark). */
function wallLantern(ctx: Ctx, x: number, y: number, tod: Tod, dir = 1) {
  if (tod.lit > 0) {
    const g = ctx.createRadialGradient(x, y + 12, 2, x, y + 12, 46);
    g.addColorStop(0, alpha(tod.lampGlow, 0.65 * tod.lit));
    g.addColorStop(1, alpha(tod.lampGlow, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - 46, y - 34, 92, 92);
  }
  line(ctx, [[x - 14 * dir, y - 4], [x, y - 4], [x, y]], INK, 2.4);
  inked(ctx, () => polyPath(ctx, [[x - 7, y], [x + 7, y], [x + 9, y + 20], [x - 9, y + 20]], 3, 0.3, 2), tod.lit > 0 ? tod.lampGlow : P.cream, { band: 3, lw: 2 });
  inked(ctx, () => polyPath(ctx, [[x - 10, y + 1], [x, y - 7], [x + 10, y + 1]], 4, 0.2, 1), hue('#5B4A3D', tod), { shade: false, lw: 1.8 });
}

// ---------------------------------------------------------------- buildings

/** 河湾总部: the post office, a half-timbered house with a tiled roof, the owl's crest and a pillar post box. 330 wide, 310 tall. */
export function postOffice(ctx: Ctx, tod: Tod) {
  const wall = hue(P.white, tod), beam = hue(P.woodDeep, tod), roof = hue(P.orange, tod), roofDeep = hue(P.orangeDeep, tod);
  const stone = hue('#CFC4AE', tod);
  contactShadow(ctx, 0, 0, 176, 20, tod.shadow + 0.06);
  // chimney behind the roof
  inked(ctx, () => boxPath(ctx, -122, -300, 36, 110, 3, 31, 0.6), stone, { band: 6, hatch: [-122, -300, 36, 110] });
  inked(ctx, () => boxPath(ctx, -128, -308, 48, 14, 3, 32, 0.4), shade(stone, 0.12), { band: 3, lw: 2.4 });
  // the main roof: a hipped roof of round tiles
  const roofPath = () => polyPath(ctx, [[-172, -150], [-100, -270], [100, -270], [172, -150]], 33, 0.8, 6);
  inked(ctx, roofPath, roof, { band: 12, lw: 0 });
  ctx.save();
  roofPath();
  ctx.clip();
  tileRows(ctx, -180, -262, 180, -150, roofDeep);
  ctx.restore();
  inked(ctx, roofPath, roof, { shade: false, lw: 3, light: 0 });
  line(ctx, [[-100, -270], [100, -270]], roofDeep, 7);
  line(ctx, [[-102, -270], [102, -270]], INK, 2);
  // the walls, with the eaves' shadow along their top
  inked(ctx, () => boxPath(ctx, -134, -160, 268, 124, 3, 34, 0.6), wall, { band: 10, hatch: [-134, -160, 268, 124], gap: 7 });
  ctx.fillStyle = alpha(INK, 0.16);
  ctx.fillRect(-133, -158, 266, 9);
  // timber frame
  const post = (x: number, w: number) => inked(ctx, () => boxPath(ctx, x, -160, w, 124, 2, 40 + x, 0.4), beam, { band: 3, lw: 2.2 });
  post(-136, 12);
  post(124, 12);
  post(-50, 9);
  post(41, 9);
  inked(ctx, () => boxPath(ctx, -138, -164, 276, 12, 2, 36, 0.4), beam, { band: 3, lw: 2.4 });
  inked(ctx, () => boxPath(ctx, -138, -48, 276, 12, 2, 37, 0.4), beam, { band: 3, lw: 2.4 });
  // braces under the windows
  for (const sx of [-1, 1]) {
    line(ctx, [[sx * 124, -76], [sx * 100, -50]], beam, 6);
    line(ctx, [[sx * 54, -76], [sx * 78, -50]], beam, 6);
  }
  // windows with flower boxes
  windowPane(ctx, -112, -138, 50, 52, tod, 41);
  windowPane(ctx, 62, -138, 50, 52, tod, 42);
  flowerBox(ctx, -118, -84, 62, tod, 1);
  flowerBox(ctx, 56, -84, 62, tod, 2);
  // the front gable over the door, with the owl's crest
  const gable = () => polyPath(ctx, [[-86, -150], [0, -244], [86, -150]], 43, 0.6, 3);
  inked(ctx, gable, hue(P.cream, tod), { band: 9, hatch: [-86, -244, 172, 94] });
  inked(ctx, () => polyPath(ctx, [[-108, -140], [0, -266], [108, -140], [92, -136], [0, -242], [-92, -136]], 44, 0.6, 4), roof, { band: 6, lw: 2.6 });
  ctx.save();
  ctx.globalAlpha = 0.6;
  for (let i = 1; i < 6; i++) {
    const k = i / 6;
    line(ctx, [[-108 + 108 * k, -140 - 126 * k], [-92 + 92 * k, -136 - 106 * k]], roofDeep, 1.6);
    line(ctx, [[108 - 108 * k, -140 - 126 * k], [92 - 92 * k, -136 - 106 * k]], roofDeep, 1.6);
  }
  ctx.restore();
  owlCrest(ctx, 0, -186, 27, tod);
  // the door: an arched blue door under a little hood
  const door = () => {
    ctx.beginPath();
    ctx.moveTo(-28, -36);
    ctx.lineTo(-28, -94);
    ctx.arc(0, -94, 28, Math.PI, 0);
    ctx.lineTo(28, -36);
    ctx.closePath();
  };
  ctx.save();
  door();
  ctx.lineWidth = 14;
  ctx.strokeStyle = beam;
  ctx.stroke();
  ctx.restore();
  inked(ctx, door, hue(P.blue, tod), { band: 8, lw: 2.6 });
  ctx.save();
  door();
  ctx.clip();
  for (const x of [-14, 0, 14]) line(ctx, [[x, -122], [x, -36]], alpha(INK, 0.35), 1.6);
  ctx.restore();
  roundWindow(ctx, 0, -98, 9, tod, hue(P.gold, tod));
  disc(ctx, 18, -66, 3.6, hue(P.gold, tod));
  wallLantern(ctx, 46, -118, tod, -1);
  // stone footing and steps
  inked(ctx, () => boxPath(ctx, -146, -38, 292, 38, 4, 45, 0.6), stone, { band: 6 });
  ctx.save();
  ctx.strokeStyle = alpha(INK, 0.4);
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  for (let r = 0; r < 2; r++) {
    const y = -38 + r * 19;
    if (r) {
      ctx.moveTo(-144, y);
      ctx.lineTo(144, y);
    }
    for (let x = -146 + (r ? 18 : 0) + 36; x < 144; x += 36) {
      ctx.moveTo(x + jit(r, x) * 2, y + 2);
      ctx.lineTo(x + jit(r, x) * 2, y + 17);
    }
  }
  ctx.stroke();
  ctx.restore();
  inked(ctx, () => boxPath(ctx, -46, -22, 92, 14, 3, 46, 0.4), tint(stone, 0.25), { band: 3, lw: 2.2 });
  inked(ctx, () => boxPath(ctx, -56, -9, 112, 14, 3, 47, 0.4), tint(stone, 0.15), { band: 3, lw: 2.2 });
  // ivy up the left corner
  const [dk, md, lt] = leaves(tod);
  for (let i = 0; i < 14; i++) {
    const y = -40 - i * 9, x = -138 + Math.sin(i * 1.3) * 7;
    ctx.beginPath();
    ctx.ellipse(x, y, 8, 6, jit(5, i), 0, Math.PI * 2);
    ctx.fillStyle = [dk, md, lt][i % 3];
    ctx.fill();
  }
  // bushes at the base
  bush(ctx, -150, 4, 0.75, tod, 7, P.pink);
  bush(ctx, 112, 6, 0.6, tod, 8);
  pillarBox(ctx, 156, 6, tod);
}

/** The owl's crest on the post office gable: a round plaque with an owl face. */
function owlCrest(ctx: Ctx, x: number, y: number, r: number, tod: Tod) {
  inked(ctx, () => {
    ctx.beginPath();
    ctx.arc(x, y, r + 5, 0, Math.PI * 2);
  }, hue(P.woodDeep, tod), { band: 4, lw: 2.4 });
  inked(ctx, () => {
    ctx.beginPath();
    ctx.arc(x, y, r - 1, 0, Math.PI * 2);
  }, hue(P.wood, tod), { band: 6, lw: 1.8 });
  // ear tufts
  for (const s of [-1, 1]) inked(ctx, () => polyPath(ctx, [[x + s * 8, y - 14], [x + s * 18, y - 24], [x + s * 18, y - 10]], 50 + s, 0.2, 2), hue(P.woodDeep, tod), { shade: false, lw: 1.6 });
  for (const s of [-1, 1]) {
    disc(ctx, x + s * 9, y - 2, 8.5, hue(P.cream, tod));
    ctx.beginPath();
    ctx.arc(x + s * 9, y - 2, 8.5, 0, Math.PI * 2);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.8;
    ctx.stroke();
    disc(ctx, x + s * 9 + 1, y - 1, 4, INK);
    disc(ctx, x + s * 9 + 2.4, y - 3, 1.4, P.white);
  }
  inked(ctx, () => polyPath(ctx, [[x - 5, y + 6], [x + 5, y + 6], [x, y + 14]], 52, 0.2, 2), hue(P.orange, tod), { shade: false, lw: 1.6 });
}

/** A green pillar post box (邮筒) with a gold band and a slot. */
export function pillarBox(ctx: Ctx, x: number, y: number, tod: Tod) {
  contactShadow(ctx, x, y, 22, 6, tod.shadow);
  const body = () => {
    ctx.beginPath();
    ctx.moveTo(x - 17, y);
    ctx.lineTo(x - 17, y - 58);
    ctx.arc(x, y - 58, 17, Math.PI, 0);
    ctx.lineTo(x + 17, y);
    ctx.closePath();
  };
  inked(ctx, body, hue(P.lilyDeep, tod), { band: 6, lw: 2.4 });
  inked(ctx, () => boxPath(ctx, x - 18, y - 60, 36, 7, 2, 60, 0.3), hue(P.gold, tod), { band: 2, lw: 1.8 });
  ctx.fillStyle = INK;
  ctx.fillRect(x - 9, y - 46, 18, 4);
  inked(ctx, () => boxPath(ctx, x - 21, y - 6, 42, 8, 2, 61, 0.3), hue(shade(P.lilyDeep, 0.2), tod), { band: 2, lw: 1.8 });
}

/** 福利社: the hamster's market stall, striped awning, shelves of jars, a hat on the counter, crates of fruit. 300 wide, 270 tall. */
export function shopStall(ctx: Ctx, tod: Tod) {
  const wood = hue(P.wood, tod), woodLt = hue(P.woodLight, tod), woodDk = hue(P.woodDeep, tod);
  contactShadow(ctx, 0, 0, 150, 18, tod.shadow + 0.06);
  // the dark inside of the stall and its shelves
  inked(ctx, () => boxPath(ctx, -108, -200, 216, 120, 2, 70, 0.5), hue(shade(P.wood, 0.42), tod), { shade: false, lw: 2.4 });
  for (const sy of [-160, -122]) {
    inked(ctx, () => boxPath(ctx, -104, sy, 208, 7, 2, 71 + sy, 0.3), woodLt, { band: 2, lw: 1.8 });
    // jars and boxes along the shelf
    const cols = [P.gold, P.red, P.tealLight, P.pink, P.lily, P.orange, P.gold];
    for (let i = 0; i < 7; i++) {
      const jx = -92 + i * 30 + jit(sy, i) * 3;
      if ((i + (sy === -160 ? 0 : 1)) % 4 === 3) {
        // a small parcel
        inked(ctx, () => boxPath(ctx, jx - 10, sy - 18, 22, 18, 2, i + 80, 0.3), hue(P.kraft, tod), { band: 3, lw: 1.6 });
        line(ctx, [[jx + 1, sy - 18], [jx + 1, sy]], hue(P.orange, tod), 2);
      } else {
        const h = 20 + (i % 2) * 4;
        inked(ctx, () => boxPath(ctx, jx - 9, sy - h, 18, h, 5, i + 90, 0.3), hue(cols[i], tod), { band: 4, lw: 1.6 });
        inked(ctx, () => boxPath(ctx, jx - 10, sy - h - 5, 20, 6, 2, i + 95, 0.2), hue(P.white, tod), { shade: false, lw: 1.4 });
      }
    }
  }
  // posts
  for (const sx of [-1, 1]) inked(ctx, () => boxPath(ctx, sx * 118 - 7, -214, 14, 214, 3, 72 + sx, 0.4), wood, { band: 4, lw: 2.4 });
  // string lights under the awning, lit after dark
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(-114, -194);
  ctx.quadraticCurveTo(0, -172, 114, -194);
  ctx.strokeStyle = alpha(INK, 0.6);
  ctx.lineWidth = 1.4;
  ctx.stroke();
  for (let i = 0; i < 7; i++) {
    const k = (i + 0.5) / 7, bx = -114 + 228 * k, by = -194 + 22 * 4 * k * (1 - k) * 0.5 * 2 + 4;
    if (tod.lit > 0) {
      const g = ctx.createRadialGradient(bx, by, 1, bx, by, 16);
      g.addColorStop(0, alpha(tod.lampGlow, 0.8 * tod.lit));
      g.addColorStop(1, alpha(tod.lampGlow, 0));
      ctx.fillStyle = g;
      ctx.fillRect(bx - 16, by - 16, 32, 32);
    }
    disc(ctx, bx, by, 3.6, tod.lit > 0 ? '#FFF0B8' : hue([P.pink, P.gold, P.tealLight][i % 3], tod));
  }
  ctx.restore();
  // the counter
  inked(ctx, () => boxPath(ctx, -124, -90, 248, 86, 3, 74, 0.6), wood, { band: 10, hatch: [-124, -90, 248, 86] });
  ctx.save();
  ctx.globalAlpha = 0.45;
  for (let x = -100; x < 124; x += 25) line(ctx, [[x + jit(9, x), -82], [x + jit(9, x + 1), -6]], woodDk, 1.6);
  ctx.restore();
  inked(ctx, () => boxPath(ctx, -134, -100, 268, 14, 3, 75, 0.4), woodLt, { band: 3, lw: 2.4 });
  // a coin sign hung on the counter
  line(ctx, [[-22, -86], [-14, -74]], INK, 1.6);
  line(ctx, [[22, -86], [14, -74]], INK, 1.6);
  inked(ctx, () => boxPath(ctx, -32, -74, 64, 40, 6, 76, 0.4), hue(P.cream, tod), { band: 4, lw: 2.2 });
  inked(ctx, () => {
    ctx.beginPath();
    ctx.arc(0, -54, 13, 0, Math.PI * 2);
  }, hue(P.gold, tod), { band: 4, lw: 2 });
  disc(ctx, -4, -56, 2, INK);
  disc(ctx, 4, -56, 2, INK);
  ctx.beginPath();
  ctx.arc(0, -52, 5, 0.2, Math.PI - 0.2);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.6;
  ctx.stroke();
  // on the counter: a basket of apples and a straw hat on a stand
  inked(ctx, () => polyPath(ctx, [[-112, -100], [-110, -120], [-62, -120], [-64, -100]], 77, 0.4, 4), hue(P.kraftTop, tod), { band: 4, lw: 2 });
  for (let i = 0; i < 4; i++) {
    const ax = -102 + i * 12, ay = -124 - (i % 2) * 5;
    inked(ctx, () => {
      ctx.beginPath();
      ctx.arc(ax, ay, 7, 0, Math.PI * 2);
    }, hue(P.red, tod), { band: 3, lw: 1.6 });
  }
  line(ctx, [[86, -100], [86, -128]], woodDk, 3);
  inked(ctx, () => {
    ctx.beginPath();
    ctx.ellipse(86, -130, 30, 8, 0, 0, Math.PI * 2);
  }, hue(P.mustard, tod), { band: 3, lw: 2 });
  inked(ctx, () => {
    ctx.beginPath();
    ctx.ellipse(86, -138, 16, 12, 0, Math.PI, 0);
    ctx.closePath();
  }, hue(P.mustard, tod), { band: 4, lw: 2 });
  ctx.fillStyle = hue(P.red, tod);
  ctx.fillRect(70, -137, 32, 5);
  // the awning: stripes, then a scalloped edge
  const top = -248, bot = -200, n = 8;
  const awning = () => polyPath(ctx, [[-120, top], [120, top], [146, bot], [-146, bot]], 78, 0.6, 4);
  inked(ctx, awning, hue(P.white, tod), { band: 6, lw: 0 });
  ctx.save();
  awning();
  ctx.clip();
  for (let i = 0; i < n; i += 2) {
    const a0 = i / n, a1 = (i + 1) / n;
    ctx.beginPath();
    ctx.moveTo(-120 + 240 * a0, top);
    ctx.lineTo(-120 + 240 * a1, top);
    ctx.lineTo(-146 + 292 * a1, bot);
    ctx.lineTo(-146 + 292 * a0, bot);
    ctx.closePath();
    ctx.fillStyle = hue(P.orange, tod);
    ctx.fill();
  }
  ctx.restore();
  inked(ctx, awning, 'rgba(0,0,0,0)', { shade: false, lw: 2.6 });
  for (let i = 0; i < n; i++) {
    const cx = -146 + 292 * ((i + 0.5) / n), r = 292 / n / 2;
    inked(ctx, () => {
      ctx.beginPath();
      ctx.moveTo(cx - r, bot);
      ctx.arc(cx, bot, r, Math.PI, 0, true);
      ctx.closePath();
    }, hue(i % 2 ? P.white : P.orange, tod), { band: 3, lw: 2.2 });
  }
  // the board on top with a little parcel sign
  inked(ctx, () => boxPath(ctx, -56, -284, 112, 38, 6, 79, 0.5), woodLt, { band: 5, lw: 2.4 });
  inked(ctx, () => boxPath(ctx, -16, -278, 32, 26, 3, 81, 0.3), hue(P.kraft, tod), { band: 3, lw: 1.8 });
  line(ctx, [[0, -278], [0, -252]], hue(P.orange, tod), 2.6);
  line(ctx, [[-16, -266], [16, -266]], hue(P.orange, tod), 2.6);
  for (const s of [-1, 1]) disc(ctx, s * 38, -265, 4, hue(P.gold, tod));
  // crates by the side: oranges on the right, a sack on the left
  inked(ctx, () => boxPath(ctx, 120, -40, 46, 40, 3, 82, 0.5), woodLt, { band: 5, lw: 2.2 });
  line(ctx, [[120, -20], [166, -20]], alpha(INK, 0.5), 1.6);
  for (let i = 0; i < 4; i++) {
    const ox = 128 + i * 10, oy = -44 - (i % 2) * 5;
    inked(ctx, () => {
      ctx.beginPath();
      ctx.arc(ox, oy, 6.5, 0, Math.PI * 2);
    }, hue(P.orange, tod), { band: 3, lw: 1.6 });
  }
  inked(ctx, () => blobEllipse(ctx, -146, -24, 22, 26, 83, 0.08), hue(P.kraftTop, tod), { band: 6, lw: 2.2 });
  line(ctx, [[-156, -46], [-136, -46]], hue(P.woodDeep, tod), 3);
}

/** 我的家: the frog's round cottage with a lily-pad roof and a lotus on top, a round window and a red door. 290 wide, 260 tall. */
export function lilyHouse(ctx: Ctx, tod: Tod) {
  const wall = hue(P.cream, tod), stone = hue('#CFC4AE', tod);
  const [dk, md, lt] = leaves(tod);
  contactShadow(ctx, 0, 0, 140, 18, tod.shadow + 0.06);
  // clay-pot chimney behind the roof
  inked(ctx, () => polyPath(ctx, [[48, -150], [50, -232], [74, -232], [78, -150]], 101, 0.4, 3), hue(P.orangeDeep, tod), { band: 5, lw: 2.4 });
  inked(ctx, () => boxPath(ctx, 44, -244, 36, 14, 4, 102, 0.3), hue(P.orange, tod), { band: 3, lw: 2.2 });
  // round walls
  const walls = () => {
    ctx.beginPath();
    ctx.moveTo(-100, -16);
    ctx.lineTo(-100, -104);
    ctx.bezierCurveTo(-100, -160, -60, -176, 0, -176);
    ctx.bezierCurveTo(60, -176, 100, -160, 100, -104);
    ctx.lineTo(100, -16);
    ctx.closePath();
  };
  inked(ctx, walls, wall, { band: 12, hatch: [-100, -176, 200, 160], gap: 7 });
  // a few stones set in the plaster
  ctx.save();
  walls();
  ctx.clip();
  for (let i = 0; i < 9; i++) {
    const sx = -84 + jit01(104, i) * 168, sy = -150 + jit01(105, i) * 110;
    if (Math.abs(sx + 46) < 36 && Math.abs(sy + 96) < 34) continue;
    if (sx > -4 && sx < 66 && sy > -120) continue;
    ctx.beginPath();
    ctx.ellipse(sx, sy, 9, 6, jit(106, i) * 0.4, 0, Math.PI * 2);
    ctx.fillStyle = alpha(stone, 0.9);
    ctx.fill();
    ctx.strokeStyle = alpha(INK, 0.4);
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }
  ctx.restore();
  // round window and the door
  roundWindow(ctx, -48, -98, 24, tod, hue(P.wood, tod));
  flowerBox(ctx, -80, -62, 64, tod, 3);
  const door = () => {
    ctx.beginPath();
    ctx.moveTo(8, -16);
    ctx.lineTo(8, -88);
    ctx.arc(34, -88, 26, Math.PI, 0);
    ctx.lineTo(60, -16);
    ctx.closePath();
  };
  ctx.save();
  door();
  ctx.lineWidth = 13;
  ctx.strokeStyle = stone;
  ctx.stroke();
  ctx.restore();
  inked(ctx, door, hue(P.red, tod), { band: 8, lw: 2.6 });
  ctx.save();
  door();
  ctx.clip();
  for (const x of [21, 34, 47]) line(ctx, [[x, -116], [x, -16]], alpha(INK, 0.3), 1.6);
  ctx.restore();
  roundWindow(ctx, 34, -90, 8, tod, hue(P.gold, tod));
  disc(ctx, 51, -54, 3.6, hue(P.gold, tod));
  // stone footing, step and mat
  inked(ctx, () => boxPath(ctx, -108, -20, 216, 20, 5, 107, 0.6), stone, { band: 4, lw: 2.4 });
  inked(ctx, () => boxPath(ctx, 2, -8, 64, 12, 3, 108, 0.3), tint(stone, 0.3), { band: 3, lw: 2 });
  // the lily-pad roof: an underside, the pad with its notch and veins, then the lotus
  const cy = -168, rx = 146, ry = 44;
  inked(ctx, () => {
    ctx.beginPath();
    ctx.ellipse(0, cy + 10, rx - 4, ry - 2, 0, 0, Math.PI * 2);
  }, dk, { band: 6, lw: 2.6 });
  const n0 = 0.3, n1 = 0.56;
  const pad = () => {
    ctx.beginPath();
    ctx.moveTo(0, cy + 4);
    ctx.lineTo(Math.cos(n1) * rx, cy + Math.sin(n1) * ry);
    ctx.ellipse(0, cy, rx, ry, 0, n1, n0 + Math.PI * 2);
    ctx.closePath();
  };
  inked(ctx, pad, md, { band: 12, lw: 2.8, light: 0.35 });
  ctx.save();
  pad();
  ctx.clip();
  ctx.strokeStyle = alpha(lt, 0.9);
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  for (let i = 0; i < 11; i++) {
    const a = n1 + ((i + 0.5) / 11) * (Math.PI * 2 - (n1 - n0));
    ctx.moveTo(0, cy + 4);
    ctx.quadraticCurveTo(Math.cos(a) * rx * 0.5, cy + Math.sin(a) * ry * 0.5 - 4, Math.cos(a) * rx * 0.94, cy + Math.sin(a) * ry * 0.94);
  }
  ctx.stroke();
  ctx.restore();
  lotus(ctx, -30, cy - 8, 1, tod);
  // a pot of herbs by the door and the mailbox on its post
  inked(ctx, () => polyPath(ctx, [[74, -26], [102, -26], [98, 2], [78, 2]], 109, 0.3, 3), hue(P.orangeDeep, tod), { band: 4, lw: 2 });
  inked(ctx, () => puffPath(ctx, 88, -38, 20, 14, 6, 110), md, { band: 4, lw: 2 });
  flower(ctx, 82, -46, hue(P.white, tod), 0.9);
  flower(ctx, 96, -40, hue(P.pink, tod), 0.9);
  mailbox(ctx, -128, 4, tod);
}

/** A pink lotus: three pale back petals, three bright front ones and a gold heart. `s` 1 is about 60 across. */
export function lotus(ctx: Ctx, x: number, y: number, s: number, tod: Tod) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  const petal = (a: number, len: number, w: number, fill: string) => {
    ctx.save();
    ctx.rotate(a);
    inked(ctx, () => {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(-w, -len * 0.35, -w * 0.6, -len * 0.85, 0, -len);
      ctx.bezierCurveTo(w * 0.6, -len * 0.85, w, -len * 0.35, 0, 0);
      ctx.closePath();
    }, fill, { band: 4, lw: 2, light: 0.5 });
    ctx.restore();
  };
  const back = hue(tint(P.pink, 0.35), tod), front = hue(P.pink, tod);
  for (const a of [-1.1, 0, 1.1]) petal(a, 30, 13, back);
  for (const a of [-0.6, 0.6]) petal(a, 28, 13, front);
  petal(0, 24, 12, front);
  disc(ctx, 0, -4, 5, hue(P.gold, tod));
  ctx.restore();
}

/** The frog's own mailbox: a blue box with a red flag on a wooden post. */
export function mailbox(ctx: Ctx, x: number, y: number, tod: Tod) {
  contactShadow(ctx, x, y, 22, 6, tod.shadow);
  inked(ctx, () => boxPath(ctx, x - 4, y - 62, 8, 64, 2, 120, 0.3), hue(P.wood, tod), { band: 3, lw: 2 });
  inked(ctx, () => {
    ctx.beginPath();
    ctx.moveTo(x - 22, y - 56);
    ctx.lineTo(x - 22, y - 76);
    ctx.arc(x, y - 76, 22, Math.PI, 0);
    ctx.lineTo(x + 22, y - 56);
    ctx.closePath();
  }, hue(P.blue, tod), { band: 5, lw: 2.2 });
  ctx.fillStyle = INK;
  ctx.fillRect(x - 10, y - 80, 20, 4);
  line(ctx, [[x + 26, y - 60], [x + 26, y - 94]], INK, 2.4);
  inked(ctx, () => polyPath(ctx, [[x + 26, y - 94], [x + 40, y - 92], [x + 40, y - 82], [x + 26, y - 84]], 121, 0.2, 2), hue(P.red, tod), { shade: false, lw: 1.8 });
}

// ---------------------------------------------------------------- the van

/** The courier van from the side, facing right, without its wheels (see `vanWheel`). 230 wide, 170 tall. */
export function van(ctx: Ctx, tod: Tod) {
  const blue = hue(P.blue, tod), blueLt = hue(P.blueLight, tod);
  contactShadow(ctx, 0, 0, 112, 12, tod.shadow + 0.08);
  // parcels tied on the roof
  inked(ctx, () => boxPath(ctx, -86, -164, 44, 34, 3, 130, 0.5), hue(P.kraft, tod), { band: 5, lw: 2.2 });
  inked(ctx, () => boxPath(ctx, -38, -154, 34, 24, 3, 131, 0.5), hue(P.kraftTop, tod), { band: 4, lw: 2.2 });
  line(ctx, [[-64, -164], [-64, -130]], hue(P.orange, tod), 3);
  line(ctx, [[-21, -154], [-21, -130]], hue(P.orange, tod), 3);
  inked(ctx, () => boxPath(ctx, -100, -132, 108, 6, 2, 132, 0.3), hue(P.silver, tod), { band: 2, lw: 1.8 });
  // the cargo box and the cab
  const body = () => polyPath(ctx, [[-110, -126], [44, -126], [50, -112], [86, -104], [108, -66], [112, -30], [-110, -30]], 133, 0.6, 9);
  inked(ctx, body, blue, { band: 12, hatch: [-110, -126, 222, 96], light: 0.3 });
  // windshield and the side window
  const glass = tod.lit > 0.5 ? mix(tod.window, tod.windowGlow, 0.2) : tod.window;
  inked(ctx, () => polyPath(ctx, [[54, -104], [82, -98], [100, -68], [54, -68]], 134, 0.4, 5), glass, { band: 5, lw: 2.2 });
  if (tod.lit < 0.5) line(ctx, [[62, -96], [72, -78]], alpha(P.white, 0.8), 2.4);
  // door seam and handle, the stripe and the frog badge
  line(ctx, [[46, -122], [46, -34]], alpha(INK, 0.55), 1.8);
  line(ctx, [[58, -60], [70, -60]], INK, 3);
  ctx.save();
  body();
  ctx.clip();
  ctx.fillStyle = hue(P.orange, tod);
  ctx.fillRect(-120, -74, 240, 13);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.8;
  ctx.strokeRect(-121, -74, 242, 13);
  ctx.restore();
  inked(ctx, () => {
    ctx.beginPath();
    ctx.arc(-34, -94, 22, 0, Math.PI * 2);
  }, hue(P.white, tod), { band: 4, lw: 2.2 });
  frogBadge(ctx, -34, -92, 15, tod);
  // bumper, headlight, mirror and the dark sill under the body
  inked(ctx, () => boxPath(ctx, -116, -36, 232, 12, 4, 135, 0.3), hue('#5B4A3D', tod), { band: 3, lw: 2.2 });
  inked(ctx, () => boxPath(ctx, 98, -46, 20, 14, 4, 136, 0.3), hue(P.silver, tod), { band: 3, lw: 2 });
  inked(ctx, () => {
    ctx.beginPath();
    ctx.ellipse(106, -60, 6, 8, 0, 0, Math.PI * 2);
  }, tod.lit > 0 ? '#FFF2B8' : hue(P.cream, tod), { band: 2, lw: 1.8 });
  inked(ctx, () => boxPath(ctx, 44, -100, 8, 14, 2, 137, 0.2), blueLt, { band: 2, lw: 1.6 });
  inked(ctx, () => boxPath(ctx, -116, -60, 8, 12, 2, 138, 0.2), hue(P.red, tod), { band: 2, lw: 1.6 });
  // wheel arches
  for (const wx of [-62, 62]) {
    ctx.beginPath();
    ctx.arc(wx, -26, 26, Math.PI, 0);
    ctx.closePath();
    ctx.fillStyle = hue('#3E322A', tod);
    ctx.fill();
  }
}

/** The frog's face, the courier's badge: a green round face with two eye bumps. */
export function frogBadge(ctx: Ctx, x: number, y: number, r: number, tod: Tod) {
  const g = hue(P.frog, tod);
  for (const s of [-1, 1]) {
    inked(ctx, () => {
      ctx.beginPath();
      ctx.arc(x + s * r * 0.5, y - r * 0.62, r * 0.4, 0, Math.PI * 2);
    }, g, { shade: false, lw: 1.6 });
  }
  inked(ctx, () => {
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.72, 0, 0, Math.PI * 2);
  }, g, { band: 3, lw: 1.8 });
  for (const s of [-1, 1]) {
    disc(ctx, x + s * r * 0.5, y - r * 0.62, r * 0.22, P.white);
    disc(ctx, x + s * r * 0.5, y - r * 0.6, r * 0.12, INK);
  }
  ctx.beginPath();
  ctx.arc(x, y - r * 0.05, r * 0.4, 0.3, Math.PI - 0.3);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.6;
  ctx.stroke();
}

/** A van wheel turned to angle `a`. */
export function vanWheel(ctx: Ctx, x: number, y: number, r: number, a: number, tod: Tod) {
  disc(ctx, x, y, r, hue('#4A3D33', tod));
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.4;
  ctx.stroke();
  disc(ctx, x, y, r * 0.52, hue(P.silver, tod));
  ctx.save();
  ctx.strokeStyle = alpha(INK, 0.6);
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const k = a + (i * Math.PI) / 2;
    ctx.moveTo(x + Math.cos(k) * r * 0.16, y + Math.sin(k) * r * 0.16);
    ctx.lineTo(x + Math.cos(k) * r * 0.48, y + Math.sin(k) * r * 0.48);
  }
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, r * 0.52, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  disc(ctx, x, y, r * 0.14, INK);
}

// ---------------------------------------------------------------- nature

/**
 * A round leafy tree; `s` 1 is about 130 across and 170 tall. `fruit` dots its crown; `leaf` paints it in
 * another colour than the hour's green (autumn maples, spring blossom); `snow` lays snow on top.
 */
export function roundTree(ctx: Ctx, x: number, y: number, s: number, tod: Tod, seed = 1, fruit?: string, leaf?: string, snow = false) {
  const [dk, md, lt] = leaf ? [shade(leaf, 0.2), leaf, tint(leaf, 0.25)] : leaves(tod);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  contactShadow(ctx, 0, 0, 58, 12, tod.shadow);
  inked(ctx, () => polyPath(ctx, [[-11, 2], [-7, -70], [7, -70], [12, 2]], seed, 0.6, 3), hue(P.woodDeep, tod), { band: 5, lw: 2.4 });
  line(ctx, [[0, -48], [-18, -74]], hue(P.woodDeep, tod), 6);
  inked(ctx, () => puffPath(ctx, 0, -112, 64, 54, 9, seed), dk, { band: 12, lw: 2.6 });
  ctx.save();
  puffPath(ctx, 0, -112, 64, 54, 9, seed);
  ctx.clip();
  inked(ctx, () => puffPath(ctx, -8, -124, 50, 40, 7, seed + 7), md, { lw: 0, band: 10 });
  inked(ctx, () => puffPath(ctx, -18, -136, 26, 20, 5, seed + 11), lt, { lw: 0, band: 6 });
  if (snow) inked(ctx, () => puffPath(ctx, -4, -150, 54, 26, 7, seed + 13, 0.5), '#FBFCFA', { lw: 0, band: 5, dark: 0.08 });
  hatch(ctx, -64, -166, 128, 108, shade(dk, 0.3), { alpha: 0.35, fade: true, gap: 7 });
  ctx.restore();
  if (fruit) {
    for (let i = 0; i < 7; i++) {
      const fx = jit(seed, i + 30) * 48, fy = -112 + jit(seed, i + 40) * 38;
      inked(ctx, () => {
        ctx.beginPath();
        ctx.arc(fx, fy, 5.5, 0, Math.PI * 2);
      }, fruit, { band: 2, lw: 1.6 });
    }
  }
  ctx.restore();
}

/** A pine of three tiers; `s` 1 is about 110 across and 170 tall. `snow` caps each tier with snow. */
export function pine(ctx: Ctx, x: number, y: number, s: number, tod: Tod, seed = 1, snow = false) {
  const c = mix(tod.grass, tod.waterDeep, 0.45);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  contactShadow(ctx, 0, 0, 44, 10, tod.shadow);
  inked(ctx, () => boxPath(ctx, -7, -30, 14, 32, 2, seed, 0.4), hue(P.woodDeep, tod), { band: 3, lw: 2.2 });
  for (const [w, t, b, i] of [[54, -96, -22, 0], [44, -132, -62, 1], [32, -168, -100, 2]] as const) {
    inked(ctx, () => polyPath(ctx, [[-w, b], [0, t], [w, b], [w * 0.45, b + 6], [0, b + 2], [-w * 0.45, b + 6]], seed + i, 0.8, 4), shade(c, i * 0.04 - 0.04), { band: 9, lw: 2.4 });
    if (snow) {
      // snow on the tier: its top half, with a wavy lower edge
      const h = (b - t) * 0.55;
      inked(ctx, () => {
        ctx.beginPath();
        ctx.moveTo(0, t);
        ctx.lineTo(w * 0.62, t + h);
        for (let k = 1; k <= 4; k++) ctx.quadraticCurveTo(w * (0.62 - (k - 0.5) * 0.31), t + h + (k % 2 ? 8 : -2), w * (0.62 - k * 0.31), t + h - (k % 2 ? 0 : 4));
        ctx.closePath();
      }, '#FBFCFA', { band: 4, lw: 2, dark: 0.1 });
    }
  }
  ctx.restore();
}

/** A weeping willow, its long strands hanging down; `s` 1 is about 140 across and 190 tall. */
export function willow(ctx: Ctx, x: number, y: number, s: number, tod: Tod, seed = 1) {
  const [dk, md, lt] = leaves(tod);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  contactShadow(ctx, 0, 0, 56, 12, tod.shadow);
  inked(ctx, () => {
    ctx.beginPath();
    ctx.moveTo(-12, 2);
    ctx.quadraticCurveTo(-6, -50, 4, -96);
    ctx.lineTo(14, -94);
    ctx.quadraticCurveTo(6, -50, 12, 2);
    ctx.closePath();
  }, hue(P.woodDeep, tod), { band: 5, lw: 2.4 });
  inked(ctx, () => puffPath(ctx, 4, -132, 62, 40, 8, seed, 0.3), dk, { band: 10, lw: 2.4 });
  inked(ctx, () => puffPath(ctx, -4, -142, 40, 24, 6, seed + 3), md, { lw: 0, band: 6 });
  // the strands, in two greens
  ctx.lineCap = 'round';
  for (let pass = 0; pass < 2; pass++) {
    ctx.beginPath();
    for (let i = 0; i < 13; i++) {
      const sx = -56 + i * 10 + jit(seed, i) * 3, len = 70 + jit01(seed, i + 20) * 46;
      ctx.moveTo(sx, -122);
      ctx.quadraticCurveTo(sx + jit(seed, i + 40) * 6, -122 + len * 0.6, sx + jit(seed, i + 60) * 8, -122 + len);
    }
    ctx.strokeStyle = pass ? lt : alpha(INK, 0.55);
    ctx.lineWidth = pass ? 3.4 : 6;
    ctx.stroke();
    if (pass) {
      ctx.strokeStyle = md;
      ctx.lineWidth = 2.4;
      ctx.setLineDash([9, 7]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  ctx.restore();
}

/** A low round bush, optionally in flower. `s` 1 is about 90 across. */
export function bush(ctx: Ctx, x: number, y: number, s: number, tod: Tod, seed = 1, bloom?: string) {
  const [dk, md] = leaves(tod);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  contactShadow(ctx, 0, 0, 44, 9, tod.shadow);
  inked(ctx, () => puffPath(ctx, 0, -24, 46, 26, 7, seed, 0.55), mix(dk, md, 0.5), { band: 9, lw: 2.4 });
  if (bloom) for (let i = 0; i < 6; i++) flower(ctx, jit(seed, i) * 32, -28 + jit(seed, i + 8) * 12, hue(bloom, tod), 0.9);
  ctx.restore();
}

/** A smooth river stone. */
export function rock(ctx: Ctx, x: number, y: number, s: number, tod: Tod, seed = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  contactShadow(ctx, 0, 0, 26, 6, tod.shadow);
  inked(ctx, () => blobEllipse(ctx, 0, -12, 26, 16, seed, 0.12, 8), hue('#C3BBA8', tod), { band: 7, lw: 2.4, hatch: [-26, -28, 52, 32] });
  ctx.restore();
}

/** A small clump of flowers on short stems. */
export function flowerClump(ctx: Ctx, x: number, y: number, tod: Tod, seed = 1, color?: string) {
  const [dk] = leaves(tod);
  const cols = [P.pink, P.white, P.gold, P.orange];
  for (let i = 0; i < 4; i++) {
    const fx = x + jit(seed, i) * 16, fy = y - 8 - jit01(seed, i + 4) * 10;
    line(ctx, [[fx, y], [fx, fy]], dk, 1.8);
    ctx.beginPath();
    ctx.ellipse(fx + 4, fy + 6, 4, 2, 0.5, 0, Math.PI * 2);
    ctx.fillStyle = dk;
    ctx.fill();
    flower(ctx, fx, fy, hue(color ?? cols[(seed + i) % 4], tod), 0.85);
  }
}

/** Reeds and a cattail or two by the water. */
export function reeds(ctx: Ctx, x: number, y: number, s: number, tod: Tod, seed = 1) {
  const [dk, md] = leaves(tod);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.lineCap = 'round';
  for (let i = 0; i < 6; i++) {
    const bx = (i - 2.5) * 6, h = 34 + jit01(seed, i) * 30, lean = jit(seed, i + 7) * 10;
    for (const [c, w] of [[alpha(INK, 0.6), 5], [i % 2 ? md : dk, 3]] as const) {
      ctx.beginPath();
      ctx.moveTo(bx, 0);
      ctx.quadraticCurveTo(bx + lean * 0.3, -h * 0.6, bx + lean, -h);
      ctx.strokeStyle = c;
      ctx.lineWidth = w;
      ctx.stroke();
    }
    if (i % 3 === 1) {
      inked(ctx, () => {
        ctx.beginPath();
        ctx.ellipse(bx + lean * 0.9, -h + 4, 4, 9, lean * 0.02, 0, Math.PI * 2);
      }, hue(P.woodDeep, tod), { shade: false, lw: 1.6 });
    }
  }
  ctx.restore();
}

/** A street lamp; its glass is at (x, y - 112). The glow itself is drawn live (see lampGlow). */
export function lampPost(ctx: Ctx, x: number, y: number, tod: Tod) {
  contactShadow(ctx, x, y, 16, 5, tod.shadow);
  const iron = hue('#5B4A3D', tod);
  inked(ctx, () => boxPath(ctx, x - 4, y - 100, 8, 102, 2, 140, 0.3), iron, { shade: false, lw: 1.8 });
  inked(ctx, () => boxPath(ctx, x - 10, y - 8, 20, 10, 3, 141, 0.2), iron, { shade: false, lw: 1.8 });
  inked(ctx, () => polyPath(ctx, [[x - 11, y - 102], [x + 11, y - 102], [x + 14, y - 126], [x - 14, y - 126]], 142, 0.3, 2), tod.lit > 0 ? tod.lampGlow : hue(P.cream, tod), { band: 4, lw: 2 });
  inked(ctx, () => polyPath(ctx, [[x - 18, y - 124], [x, y - 138], [x + 18, y - 124]], 143, 0.2, 2), iron, { shade: false, lw: 1.8 });
}

/** A run of picket fence from (x0, y0) to (x1, y1). */
export function fence(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, tod: Tod, seed = 1) {
  const wood = hue(P.woodLight, tod);
  const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / 30));
  for (const ry of [-26, -12]) {
    inked(ctx, () => polyPath(ctx, [[x0, y0 + ry - 3], [x1, y1 + ry - 3], [x1, y1 + ry + 3], [x0, y0 + ry + 3]], seed + ry, 0.4, 2), wood, { shade: false, lw: 1.8 });
  }
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n, y = y0 + ((y1 - y0) * i) / n;
    inked(ctx, () => polyPath(ctx, [[x - 4, y + 2], [x - 4, y - 32], [x, y - 37], [x + 4, y - 32], [x + 4, y + 2]], seed + i, 0.3, 1), wood, { band: 2, lw: 1.8 });
  }
}

/** A wooden signpost with arrow boards pointing both ways. */
export function signpost(ctx: Ctx, x: number, y: number, tod: Tod) {
  contactShadow(ctx, x, y, 18, 5, tod.shadow);
  inked(ctx, () => boxPath(ctx, x - 5, y - 92, 10, 94, 2, 150, 0.4), hue(P.woodDeep, tod), { band: 3, lw: 2.2 });
  inked(ctx, () => polyPath(ctx, [[x - 6, y - 86], [x + 42, y - 86], [x + 54, y - 76], [x + 42, y - 66], [x - 6, y - 66]], 151, 0.4, 2), hue(P.woodLight, tod), { band: 3, lw: 2 });
  inked(ctx, () => polyPath(ctx, [[x + 6, y - 60], [x - 42, y - 60], [x - 54, y - 50], [x - 42, y - 40], [x + 6, y - 40]], 152, 0.4, 2), hue(P.wood, tod), { band: 3, lw: 2 });
  line(ctx, [[x + 4, y - 76], [x + 34, y - 76]], alpha(INK, 0.45), 2);
  line(ctx, [[x - 4, y - 50], [x - 34, y - 50]], alpha(INK, 0.45), 2);
}

/**
 * A wooden footbridge across water running up and down the screen: the deck from x0 to x1, arching up
 * by `rise` in the middle, with posts and rails on both sides.
 */
export function bridge(ctx: Ctx, x0: number, x1: number, y: number, rise: number, tod: Tod) {
  const wood = hue(P.wood, tod), woodLt = hue(P.woodLight, tod), woodDk = hue(P.woodDeep, tod);
  const at = (k: number) => y - rise * 4 * k * (1 - k);
  const deckW = 44;
  const rail = (off: number) => {
    const posts = 4;
    for (let i = 0; i <= posts; i++) {
      const k = i / posts, px = x0 + (x1 - x0) * k, py = at(k) + off;
      inked(ctx, () => boxPath(ctx, px - 5, py - 34, 10, 38, 2, 160 + i + off, 0.3), woodDk, { band: 3, lw: 2 });
    }
    ctx.beginPath();
    for (let i = 0; i <= 16; i++) {
      const k = i / 16, px = x0 + (x1 - x0) * k, py = at(k) + off - 30;
      if (i) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    }
    ctx.strokeStyle = INK;
    ctx.lineWidth = 9;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.strokeStyle = woodLt;
    ctx.lineWidth = 5;
    ctx.stroke();
  };
  rail(-deckW / 2);
  // the deck: planks across
  const deck = () => {
    ctx.beginPath();
    for (let i = 0; i <= 16; i++) {
      const k = i / 16;
      const px = x0 + (x1 - x0) * k, py = at(k) - deckW / 2;
      if (i) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    }
    for (let i = 16; i >= 0; i--) {
      const k = i / 16;
      ctx.lineTo(x0 + (x1 - x0) * k, at(k) + deckW / 2);
    }
    ctx.closePath();
  };
  inked(ctx, deck, wood, { band: 6, lw: 2.6 });
  ctx.save();
  deck();
  ctx.clip();
  ctx.strokeStyle = alpha(INK, 0.4);
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  for (let px = x0 + 12; px < x1; px += 13) {
    const k = (px - x0) / (x1 - x0);
    ctx.moveTo(px, at(k) - deckW / 2);
    ctx.lineTo(px + jit(7, px) * 1.5, at(k) + deckW / 2);
  }
  ctx.stroke();
  ctx.restore();
  // the near side of the deck, its edge in shade
  ctx.beginPath();
  for (let i = 0; i <= 16; i++) {
    const k = i / 16;
    const px = x0 + (x1 - x0) * k, py = at(k) + deckW / 2;
    if (i) ctx.lineTo(px, py);
    else ctx.moveTo(px, py);
  }
  ctx.strokeStyle = woodDk;
  ctx.lineWidth = 8;
  ctx.stroke();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.stroke();
  rail(deckW / 2);
}

/** A lily pad seen from a low angle, with its notch and veins; `bloom` puts a lotus on it. */
export function lilyPad(ctx: Ctx, x: number, y: number, r: number, tod: Tod, seed = 1, bloom = false) {
  const [dk, md, lt] = leaves(tod);
  const ry = r * 0.5, a0 = 0.9 + jit(seed, 1) * 0.6, gap = 0.42;
  const pad = () => {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.ellipse(x, y, r, ry, 0, a0 + gap, a0 + Math.PI * 2);
    ctx.closePath();
  };
  ctx.save();
  ctx.translate(0, 4);
  pad();
  ctx.fillStyle = alpha(shade(tod.waterDeep, 0.3), 0.45);
  ctx.fill();
  ctx.restore();
  inked(ctx, pad, mix(md, dk, 0.2), { band: Math.max(3, r * 0.18), lw: 2.2 });
  ctx.save();
  pad();
  ctx.clip();
  ctx.strokeStyle = alpha(lt, 0.8);
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  for (let i = 0; i < 7; i++) {
    const a = a0 + gap + ((i + 0.5) / 7) * (Math.PI * 2 - gap);
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * r * 0.9, y + Math.sin(a) * ry * 0.9);
  }
  ctx.stroke();
  ctx.restore();
  if (bloom) lotus(ctx, x - r * 0.15, y - ry * 0.1, r / 60, tod);
}
