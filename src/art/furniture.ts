// The frog's furniture and the 16 room decorations, drawn in code with the 河湾手账 kit. Each one is
// registered as a code sprite under the name the painted picture had (see codeart.ts), with the same
// bounds, so the room and the shop place them exactly where the paintings went. Units are design units;
// most stand on their ground point (0, 0).
import type { Ctx } from '../platform/types';
import { alpha, blobEllipse, boxPath, contactShadow, inked, jit, polyPath, puffPath, shade, tint, type Tod } from './kit';
import { INK, P } from './palette';
import { flower, lilyPad, lotus } from './village';

export const disc = (ctx: Ctx, x: number, y: number, r: number, fill: string) => {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
};
export const stroke = (ctx: Ctx, color: string = INK, w = 2) => {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
};
export const seg = (ctx: Ctx, pts: readonly (readonly [number, number])[], color: string = INK, w = 2) => {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  stroke(ctx, color, w);
};
export const box = (ctx: Ctx, x: number, y: number, w: number, h: number, fill: string, o: { r?: number; seed?: number; band?: number; lw?: number; hatch?: boolean } = {}) =>
  inked(ctx, () => boxPath(ctx, x, y, w, h, o.r ?? 3, o.seed ?? Math.round(x * 3 + y), 0.5), fill, { band: o.band ?? Math.min(8, Math.min(w, h) * 0.25), lw: o.lw ?? 2.2, hatch: o.hatch ? [x, y, w, h] : undefined });
export const ell = (ctx: Ctx, x: number, y: number, rx: number, ry: number, fill: string, o: { band?: number; lw?: number } = {}) =>
  inked(ctx, () => {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  }, fill, { band: o.band ?? Math.min(6, ry * 0.4), lw: o.lw ?? 2 });
/** Wood grain: a few faint wavy lines across a box. */
export function grain(ctx: Ctx, x: number, y: number, w: number, h: number, color: string, gap = 12) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.strokeStyle = alpha(color, 0.45);
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  for (let yy = y + gap / 2, i = 0; yy < y + h; yy += gap, i++) {
    ctx.moveTo(x, yy);
    ctx.bezierCurveTo(x + w * 0.3, yy + jit(i, 1) * 3, x + w * 0.7, yy + jit(i, 2) * 3, x + w, yy + jit(i, 3) * 2);
  }
  ctx.stroke();
  ctx.restore();
}
/** A five-point star centred on (x, y). */
export function starPath(ctx: Ctx, x: number, y: number, R: number, r = R * 0.48) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, k = i % 2 ? r : R;
    if (i) ctx.lineTo(x + Math.cos(a) * k, y + Math.sin(a) * k);
    else ctx.moveTo(x + Math.cos(a) * k, y + Math.sin(a) * k);
  }
  ctx.closePath();
}

// ---------------------------------------------------------------- furniture

/** The frog's bed, side on: headboard on the left with a carved pad, a green leaf-print quilt. Bounds [-122, -157, 118, 14]. */
export function bed(ctx: Ctx) {
  const wood = P.wood, woodDk = P.woodDeep;
  contactShadow(ctx, 0, 10, 124, 10, 0.24);
  // headboard and footboard
  inked(ctx, () => {
    ctx.beginPath();
    ctx.moveTo(-118, 8);
    ctx.lineTo(-118, -118);
    ctx.quadraticCurveTo(-118, -152, -100, -152);
    ctx.quadraticCurveTo(-84, -152, -84, -118);
    ctx.lineTo(-84, 8);
    ctx.closePath();
  }, wood, { band: 8 });
  inked(ctx, () => blobEllipse(ctx, -101, -118, 11, 13, 3, 0.05), P.lily, { band: 3, lw: 1.8 });
  box(ctx, 92, -96, 24, 104, wood, { r: 6 });
  // the frame and mattress
  box(ctx, -88, -36, 184, 22, woodDk, { r: 4 });
  box(ctx, -84, -66, 178, 32, P.white, { r: 10 });
  // pillow
  inked(ctx, () => blobEllipse(ctx, -58, -76, 26, 14, 5, 0.06), P.cream, { band: 5, lw: 2 });
  // quilt: a leaf print, folded back at the top
  const quilt = () => {
    ctx.beginPath();
    ctx.moveTo(-36, -84);
    ctx.quadraticCurveTo(30, -92, 96, -82);
    ctx.lineTo(102, -24);
    ctx.quadraticCurveTo(30, -12, -40, -26);
    ctx.closePath();
  };
  inked(ctx, quilt, P.lily, { band: 10, hatch: [-40, -92, 142, 80] });
  ctx.save();
  quilt();
  ctx.clip();
  for (let i = 0; i < 9; i++) {
    const lx = -26 + (i % 5) * 28 + (Math.floor(i / 5) % 2) * 14, ly = -70 + Math.floor(i / 5) * 26;
    ctx.save();
    ctx.translate(lx, ly);
    ctx.rotate(0.6);
    ctx.beginPath();
    ctx.ellipse(0, 0, 7, 3.6, 0, 0, Math.PI * 2);
    ctx.fillStyle = P.lilyLight;
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
  inked(ctx, () => boxPath(ctx, -38, -88, 136, 12, 5, 7, 0.5), P.lilyLight, { band: 3, lw: 2 });
  for (const lx of [-82, 88]) box(ctx, lx - 5, -16, 10, 26, woodDk, { r: 2, band: 2 });
}

/** The writing desk: drawers on the right, the work ledger open on the left, the letter tray on the right. Bounds [-111, -158, 111, 12.5]. */
export function desk(ctx: Ctx) {
  const wood = P.wood, woodDk = P.woodDeep, woodLt = P.woodLight;
  contactShadow(ctx, 0, 8, 110, 9, 0.24);
  // legs and the drawer column
  box(ctx, -100, -100, 12, 108, woodDk, { r: 2, band: 3 });
  box(ctx, 34, -100, 70, 106, wood, { r: 3, band: 6 });
  for (const dy of [-92, -60, -28]) {
    box(ctx, 40, dy, 58, 26, woodLt, { r: 3, band: 3, lw: 1.8 });
    disc(ctx, 69, dy + 13, 3.6, P.gold);
  }
  // the top
  box(ctx, -110, -114, 220, 16, woodLt, { r: 4, band: 4 });
  grain(ctx, -110, -114, 220, 16, woodDk, 6);
  // the ledger, open
  ledgerOpen(ctx, -50, -116, 0.62);
  // inkwell and quill
  ell(ctx, -6, -122, 9, 7, P.blue);
  seg(ctx, [[-4, -128], [8, -152]], INK, 2.4);
  inked(ctx, () => {
    ctx.beginPath();
    ctx.moveTo(8, -152);
    ctx.quadraticCurveTo(20, -150, 14, -132);
    ctx.quadraticCurveTo(4, -140, 8, -152);
    ctx.closePath();
  }, P.white, { band: 3, lw: 1.6 });
  // the letter tray with an envelope sticking up
  box(ctx, 34, -128, 64, 14, P.kraft, { r: 3, band: 3 });
  inked(ctx, () => polyPath(ctx, [[42, -128], [46, -150], [88, -146], [86, -128]], 9, 0.3, 2), P.white, { band: 3, lw: 1.8 });
  seg(ctx, [[46, -149], [66, -136], [88, -146]], alpha(INK, 0.6), 1.6);
  disc(ctx, 66, -137, 4, P.red);
}

/** An open book seen from the front, its pages lined. `s` 1 is about 200 wide. */
function ledgerOpen(ctx: Ctx, x: number, y: number, s: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  inked(ctx, () => {
    ctx.beginPath();
    ctx.moveTo(-100, 0);
    ctx.lineTo(-96, -34);
    ctx.quadraticCurveTo(-48, -44, 0, -30);
    ctx.quadraticCurveTo(48, -44, 96, -34);
    ctx.lineTo(100, 0);
    ctx.closePath();
  }, P.orangeDeep, { band: 4, lw: 2.2 });
  for (const d of [-1, 1]) {
    inked(ctx, () => {
      ctx.beginPath();
      ctx.moveTo(0, -4);
      ctx.quadraticCurveTo(d * 46, -16, d * 92, -8);
      ctx.lineTo(d * 88, -36);
      ctx.quadraticCurveTo(d * 46, -46, 0, -32);
      ctx.closePath();
    }, P.white, { band: 4, lw: 2 });
    ctx.save();
    ctx.strokeStyle = alpha(P.blue, 0.45);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const yy = -28 + i * 6;
      ctx.moveTo(d * 12, yy - 2 + i * 0.6);
      ctx.quadraticCurveTo(d * 46, yy - 8 + i * 1.2, d * 78, yy - 2 + i * 0.6);
    }
    ctx.stroke();
    ctx.restore();
  }
  seg(ctx, [[30, -36], [34, 4]], P.red, 3.4);
  ctx.restore();
}

/** The records ledger, on its own (the records card). Bounds [-69, -104, 69, 0]. */
export function ledger(ctx: Ctx) {
  contactShadow(ctx, 0, -2, 68, 8, 0.2);
  // two closed books lying flat, the open ledger on top
  box(ctx, -62, -26, 124, 24, P.blue, { r: 4, band: 5, seed: 141 });
  box(ctx, 34, -22, 22, 16, P.cream, { r: 2, band: 0, lw: 1.4, seed: 142 });
  box(ctx, -54, -48, 110, 22, P.lily, { r: 4, band: 4, seed: 143 });
  box(ctx, 30, -44, 20, 14, P.cream, { r: 2, band: 0, lw: 1.4, seed: 144 });
  ledgerOpen(ctx, 0, -46, 0.66);
  // a pencil across the pages
  ctx.save();
  ctx.translate(-14, -76);
  ctx.rotate(-0.35);
  box(ctx, -34, -4, 60, 8, P.gold, { r: 2, band: 2, lw: 1.6, seed: 145 });
  inked(ctx, () => polyPath(ctx, [[26, -4], [38, 0], [26, 4]], 146, 0.1, 1), P.kraftTop, { band: 0, lw: 1.6 });
  box(ctx, -40, -4, 8, 8, P.pink, { r: 2, band: 0, lw: 1.6, seed: 147 });
  ctx.restore();
}

/** The tall wardrobe with two doors and a carved crown, the frog's cap on top. Bounds [-82, -306, 82, 12.5]. */
export function wardrobe(ctx: Ctx) {
  const wood = P.wood, woodDk = P.woodDeep, woodLt = P.woodLight;
  contactShadow(ctx, 0, 8, 84, 9, 0.24);
  for (const lx of [-68, 60]) box(ctx, lx, -12, 10, 20, woodDk, { r: 2, band: 2 });
  box(ctx, -78, -250, 156, 242, wood, { r: 6, band: 10, hatch: true });
  // crown
  inked(ctx, () => {
    ctx.beginPath();
    ctx.moveTo(-82, -244);
    ctx.lineTo(-82, -258);
    ctx.quadraticCurveTo(-40, -262, -18, -270);
    ctx.quadraticCurveTo(0, -284, 18, -270);
    ctx.quadraticCurveTo(40, -262, 82, -258);
    ctx.lineTo(82, -244);
    ctx.closePath();
  }, woodLt, { band: 5 });
  inked(ctx, () => blobEllipse(ctx, 0, -262, 9, 9, 5, 0.04), P.lily, { band: 3, lw: 1.8 });
  // doors with inset panels and knobs
  for (const d of [-1, 1]) {
    const x = d < 0 ? -70 : 3;
    box(ctx, x, -238, 67, 206, woodLt, { r: 4, band: 6, lw: 2 });
    for (const [py, ph] of [[-226, 92], [-124, 82]] as const) {
      ctx.save();
      inked(ctx, () => boxPath(ctx, x + 10, py, 47, ph, 8, 20 + py, 0.4), wood, { band: 5, lw: 1.6 });
      ctx.restore();
    }
    disc(ctx, d * 10, -132, 5, P.gold);
    ctx.beginPath();
    ctx.arc(d * 10, -132, 5, 0, Math.PI * 2);
    stroke(ctx, INK, 1.6);
  }
  box(ctx, -80, -30, 160, 22, woodDk, { r: 4, band: 4 });
  // the courier cap on top
  inked(ctx, () => {
    ctx.beginPath();
    ctx.moveTo(18, -276);
    ctx.quadraticCurveTo(20, -300, 42, -300);
    ctx.quadraticCurveTo(62, -300, 64, -276);
    ctx.closePath();
  }, P.red, { band: 5, lw: 2 });
  inked(ctx, () => {
    ctx.beginPath();
    ctx.ellipse(54, -276, 24, 5, 0, 0, Math.PI * 2);
  }, shade(P.red, 0.15), { band: 2, lw: 1.8 });
  disc(ctx, 40, -290, 4, P.white);
}

/** The wardrobe standing open, hats and scarves inside. Bounds [-82, -303, 82, 0]. */
export function wardrobeOpen(ctx: Ctx) {
  const wood = P.wood, woodDk = P.woodDeep, woodLt = P.woodLight;
  contactShadow(ctx, 0, -2, 84, 8, 0.24);
  box(ctx, -66, -252, 132, 246, wood, { r: 6, band: 8 });
  box(ctx, -58, -240, 116, 214, shade(P.wood, 0.35), { r: 3, band: 4, lw: 1.8 });
  // the rail and what hangs on it
  seg(ctx, [[-56, -222], [56, -222]], P.silver, 4);
  const hang = (x: number, color: string, kind: 0 | 1 | 2) => {
    seg(ctx, [[x, -222], [x, -212]], INK, 1.6);
    if (kind === 0) {
      // a scarf
      inked(ctx, () => polyPath(ctx, [[x - 10, -212], [x + 10, -212], [x + 12, -150], [x + 2, -146], [x - 2, -170], [x - 8, -144], [x - 12, -150]], 3, 0.4, 3), color, { band: 4, lw: 1.8 });
    } else if (kind === 1) {
      // a coat
      inked(ctx, () => polyPath(ctx, [[x - 6, -212], [x + 6, -212], [x + 20, -200], [x + 18, -128], [x - 18, -128], [x - 20, -200]], 4, 0.4, 5), color, { band: 5, lw: 1.8 });
      seg(ctx, [[x, -208], [x, -132]], alpha(INK, 0.4), 1.4);
    } else {
      inked(ctx, () => polyPath(ctx, [[x - 8, -212], [x + 8, -212], [x + 14, -170], [x - 14, -170]], 5, 0.4, 3), color, { band: 4, lw: 1.8 });
    }
  };
  hang(-36, P.red, 0);
  hang(-4, P.blueLight, 1);
  hang(32, P.mustard, 2);
  // a shelf of hats
  box(ctx, -58, -104, 116, 8, P.woodLight, { r: 2, band: 2, lw: 1.6 });
  ell(ctx, -28, -110, 22, 6, P.mustard);
  inked(ctx, () => {
    ctx.beginPath();
    ctx.ellipse(-28, -114, 12, 10, 0, Math.PI, 0);
    ctx.closePath();
  }, P.mustard, { band: 3, lw: 1.6 });
  inked(ctx, () => blobEllipse(ctx, 22, -116, 18, 12, 6, 0.05), P.blue, { band: 3, lw: 1.6 });
  disc(ctx, 22, -130, 4, P.red);
  // a drawer and the open doors at the sides
  box(ctx, -58, -60, 116, 40, woodLt, { r: 3, band: 4, lw: 1.8 });
  disc(ctx, 0, -40, 4, P.gold);
  for (const d of [-1, 1]) {
    inked(ctx, () => polyPath(ctx, [[d * 66, -250], [d * 82, -262], [d * 82, -20], [d * 66, -8]], 7 + d, 0.4, 3), woodLt, { band: 3, lw: 2 });
  }
  box(ctx, -70, -266, 140, 16, woodDk, { r: 4, band: 3 });
}

/** The mailbox by the door: a little house on a post, the red flag up. Bounds [-52, -150, 62, 4]. */
export function homeMailbox(ctx: Ctx) {
  contactShadow(ctx, 0, -2, 38, 6, 0.22);
  box(ctx, -6, -76, 12, 74, P.wood, { r: 2, band: 3 });
  box(ctx, -24, -6, 48, 8, P.woodDeep, { r: 3, band: 2 });
  // a vine up the post
  ctx.beginPath();
  ctx.moveTo(-2, -4);
  ctx.bezierCurveTo(10, -24, -10, -40, 4, -70);
  stroke(ctx, P.lilyDeep, 2);
  for (const [lx, ly, a] of [[4, -18, 0.6], [-5, -34, -0.7], [5, -50, 0.6], [-2, -64, -0.5]] as const) {
    ctx.save();
    ctx.translate(lx, ly);
    ctx.rotate(a);
    inked(ctx, () => {
      ctx.beginPath();
      ctx.ellipse(0, 0, 6, 3.2, 0, 0, Math.PI * 2);
    }, P.lily, { band: 0, lw: 1.2 });
    ctx.restore();
  }
  flower(ctx, -14, -6, P.pink, 0.9);
  flower(ctx, 14, -4, P.white, 0.8);
  // the box: a little cottage with a red roof
  inked(ctx, () => polyPath(ctx, [[-38, -76], [38, -76], [38, -118], [0, -140], [-38, -118]], 11, 0.5, 4), P.cream, { band: 7 });
  inked(ctx, () => polyPath(ctx, [[-46, -114], [0, -146], [46, -114], [40, -108], [0, -136], [-40, -108]], 12, 0.4, 3), P.red, { band: 3, lw: 2 });
  box(ctx, -20, -108, 40, 8, INK, { r: 3, band: 0, lw: 0 });
  // a letter waiting in the slot
  ctx.save();
  ctx.translate(4, -108);
  ctx.rotate(-0.12);
  box(ctx, -14, -16, 28, 18, P.white, { r: 2, band: 0, lw: 1.6, seed: 151 });
  seg(ctx, [[-13, -15], [0, -6], [13, -15]], INK, 1.3);
  disc(ctx, 0, -6, 2.6, P.red);
  ctx.restore();
  inked(ctx, () => blobEllipse(ctx, 0, -88, 10, 6, 13, 0.05), P.lily, { band: 2, lw: 1.6 });
  seg(ctx, [[42, -82], [42, -130]], INK, 2.6);
  inked(ctx, () => polyPath(ctx, [[42, -130], [58, -128], [58, -116], [42, -118]], 14, 0.2, 2), P.red, { band: 2, lw: 1.6 });
}

/** The window seen from the room: an arched frame with shutters, the hour outside, a pot on the sill. Bounds [-104, -125, 104, 125]. */
export function homeWindow(ctx: Ctx, tod: Tod) {
  const wood = P.wood, woodDk = P.woodDeep;
  const gx = -62, gy = -100, gw = 124, gh = 196;
  const arch = () => {
    ctx.beginPath();
    ctx.moveTo(gx, gy + gh);
    ctx.lineTo(gx, gy + 62);
    ctx.arc(0, gy + 62, 62, Math.PI, 0);
    ctx.lineTo(gx + gw, gy + gh);
    ctx.closePath();
  };
  // shutters, open
  for (const d of [-1, 1]) {
    inked(ctx, () => polyPath(ctx, [[d * 66, -60], [d * 104, -54], [d * 104, 92], [d * 66, 98]], 20 + d, 0.4, 4), P.tealDeep, { band: 6 });
    ctx.save();
    ctx.strokeStyle = alpha(INK, 0.4);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let y = -44; y < 90; y += 12) {
      ctx.moveTo(d * 72, y);
      ctx.lineTo(d * 98, y + 1);
    }
    ctx.stroke();
    ctx.restore();
  }
  // the view: sky, hills, the river
  ctx.save();
  arch();
  ctx.clip();
  const g = ctx.createLinearGradient(0, gy, 0, gy + gh);
  g.addColorStop(0, tod.skyTop);
  g.addColorStop(0.55, tod.skyBot);
  ctx.fillStyle = g;
  ctx.fillRect(gx, gy, gw, gh);
  if (tod.stars) {
    ctx.fillStyle = '#FFF4C8';
    for (let i = 0; i < 12; i++) disc(ctx, gx + 8 + ((i * 47) % (gw - 16)), gy + 10 + ((i * 29) % 80), 1.6, '#FFF4C8');
    ctx.beginPath();
    ctx.arc(26, gy + 36, 13, 0, Math.PI * 2);
    ctx.fillStyle = tod.sun;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(32, gy + 31, 11, 0, Math.PI * 2);
    ctx.fillStyle = tod.skyTop;
    ctx.fill();
  } else disc(ctx, 28, gy + 40, 14, tod.sun);
  ctx.fillStyle = tod.hillFar;
  ctx.beginPath();
  ctx.moveTo(gx, gy + 120);
  ctx.quadraticCurveTo(-20, gy + 86, 20, gy + 112);
  ctx.quadraticCurveTo(50, gy + 90, gx + gw, gy + 110);
  ctx.lineTo(gx + gw, gy + gh);
  ctx.lineTo(gx, gy + gh);
  ctx.fill();
  ctx.fillStyle = tod.hillNear;
  ctx.beginPath();
  ctx.moveTo(gx, gy + 140);
  ctx.quadraticCurveTo(0, gy + 118, gx + gw, gy + 138);
  ctx.lineTo(gx + gw, gy + gh);
  ctx.lineTo(gx, gy + gh);
  ctx.fill();
  ctx.fillStyle = tod.water;
  ctx.beginPath();
  ctx.moveTo(gx, gy + 160);
  ctx.quadraticCurveTo(0, gy + 150, gx + gw, gy + 164);
  ctx.lineTo(gx + gw, gy + gh);
  ctx.lineTo(gx, gy + gh);
  ctx.fill();
  seg(ctx, [[-30, gy + 168], [-4, gy + 168]], alpha(tod.glint, 0.9), 2);
  seg(ctx, [[14, gy + 176], [40, gy + 176]], alpha(tod.glint, 0.9), 2);
  if (tod.lit > 0) {
    ctx.fillStyle = alpha(tod.windowGlow, 0.18 * tod.lit);
    ctx.fillRect(gx, gy, gw, gh);
  }
  ctx.restore();
  // glass shine, mullions and the frame
  if (!tod.stars) seg(ctx, [[gx + 14, gy + 70], [gx + 34, gy + 44]], alpha(P.white, 0.75), 3);
  arch();
  stroke(ctx, INK, 2);
  ctx.save();
  arch();
  ctx.lineWidth = 12;
  ctx.strokeStyle = wood;
  ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.translate(0, 0);
  ctx.beginPath();
  ctx.moveTo(gx - 6, gy + gh);
  ctx.lineTo(gx - 6, gy + 62);
  ctx.arc(0, gy + 62, 68, Math.PI, 0);
  ctx.lineTo(gx + gw + 6, gy + gh);
  stroke(ctx, INK, 2);
  ctx.restore();
  seg(ctx, [[0, gy + 4], [0, gy + gh]], wood, 6);
  seg(ctx, [[gx, gy + 92], [gx + gw, gy + 92]], wood, 6);
  // the sill and a pot of flowers
  box(ctx, -86, 92, 172, 16, P.woodLight, { r: 4, band: 4 });
  box(ctx, -80, 106, 160, 8, woodDk, { r: 3, band: 2, lw: 1.8 });
  inked(ctx, () => polyPath(ctx, [[-30, 92], [-6, 92], [-9, 74], [-27, 74]], 21, 0.3, 2), P.orangeDeep, { band: 3, lw: 1.8 });
  inked(ctx, () => puffPath(ctx, -18, 66, 16, 10, 6, 22), P.lily, { band: 3, lw: 1.8 });
  flower(ctx, -24, 62, P.white, 0.9);
  flower(ctx, -10, 66, P.pink, 0.9);
}

// ---------------------------------------------------------------- decorations

/** 荷叶地毯: a lily-pad rug on the floor. Bounds [-139, -50, 139, 50]. */
export function rug(ctx: Ctx, tod: Tod) {
  ctx.save();
  ctx.scale(1, 0.72);
  lilyPad(ctx, 0, 6, 132, tod, 4);
  ctx.restore();
  ctx.save();
  ctx.setLineDash([7, 6]);
  ctx.beginPath();
  ctx.ellipse(0, 4, 112, 28, 0, 0, Math.PI * 2);
  stroke(ctx, alpha(P.lilyLight, 0.9), 2);
  ctx.restore();
}

/** 小盆栽: a terracotta pot with broad leaves. Bounds [-44, -99, 44, 4]. */
export function plant(ctx: Ctx, tod: Tod) {
  contactShadow(ctx, 0, 2, 30, 6, 0.22);
  const leaf = (a: number, len: number, w: number, fill: string) => {
    ctx.save();
    ctx.translate(0, -38);
    ctx.rotate(a);
    inked(ctx, () => {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(-w, -len * 0.3, -w * 0.8, -len * 0.85, 0, -len);
      ctx.bezierCurveTo(w * 0.8, -len * 0.85, w, -len * 0.3, 0, 0);
      ctx.closePath();
    }, fill, { band: 4, lw: 1.8 });
    seg(ctx, [[0, -4], [0, -len * 0.85]], alpha(P.lilyDeep, 0.6), 1.4);
    ctx.restore();
  };
  const g = tod.grass;
  leaf(-1.0, 46, 16, shade(g, 0.12));
  leaf(1.0, 46, 16, shade(g, 0.12));
  leaf(-0.45, 56, 17, g);
  leaf(0.45, 56, 17, g);
  leaf(0, 60, 16, tint(g, 0.15));
  inked(ctx, () => polyPath(ctx, [[-28, -40], [28, -40], [22, 2], [-22, 2]], 31, 0.4, 3), P.orangeDeep, { band: 6 });
  box(ctx, -32, -46, 64, 12, P.orange, { r: 3, band: 3 });
}

/** 布谷钟: a cuckoo clock with pine-cone weights; the swing pivot is at (0, 0). Bounds [-43, -101, 43, 37.5]. */
export function cuckoo(ctx: Ctx) {
  // chains and weights
  for (const dx of [-12, 12]) {
    seg(ctx, [[dx, -8], [dx, dx < 0 ? 18 : 10]], alpha(INK, 0.7), 1.4);
    inked(ctx, () => blobEllipse(ctx, dx, dx < 0 ? 26 : 18, 5, 9, 4, 0.04), P.woodDeep, { band: 2, lw: 1.4 });
  }
  seg(ctx, [[0, -8], [0, 22]], alpha(INK, 0.8), 1.4);
  disc(ctx, 0, 24, 6, P.gold);
  // body, roof and face
  box(ctx, -30, -66, 60, 60, P.wood, { r: 4, band: 6 });
  inked(ctx, () => polyPath(ctx, [[-42, -60], [0, -100], [42, -60], [36, -56], [0, -90], [-36, -56]], 33, 0.4, 3), P.woodDeep, { band: 3, lw: 2 });
  inked(ctx, () => polyPath(ctx, [[-30, -62], [0, -90], [30, -62]], 34, 0.3, 2), P.woodLight, { band: 4, lw: 1.8 });
  // the bird's little door
  box(ctx, -7, -84, 14, 14, shade(P.wood, 0.4), { r: 6, band: 0, lw: 1.6 });
  disc(ctx, 0, -77, 3, P.gold);
  ell(ctx, 0, -32, 20, 20, P.cream, { band: 4 });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    disc(ctx, Math.cos(a) * 15, -32 + Math.sin(a) * 15, i % 3 ? 1.1 : 1.8, INK);
  }
  seg(ctx, [[0, -32], [0, -44]], INK, 2.2);
  seg(ctx, [[0, -32], [8, -28]], INK, 2.2);
  // leaves carved along the bottom
  for (const d of [-1, 1]) inked(ctx, () => blobEllipse(ctx, d * 22, -8, 10, 5, 35 + d, 0.05), P.lily, { band: 2, lw: 1.4 });
}

/** 星星串灯: a string of star lights sagging between two pins. Bounds [-178, -4, 178, 37.5]. */
export function lights(ctx: Ctx) {
  const n = 10;
  const at = (k: number) => [-172 + 344 * k, 2 + 18 * 4 * k * (1 - k)] as const;
  ctx.beginPath();
  for (let i = 0; i <= 30; i++) {
    const [x, y] = at(i / 30);
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  stroke(ctx, alpha(INK, 0.8), 2);
  for (const k of [0, 1]) disc(ctx, at(k)[0], at(k)[1], 3, P.red);
  const cols = [P.gold, P.pink, '#FFF4C8', P.tealLight];
  for (let i = 1; i < n; i++) {
    const [x, y] = at(i / n);
    ctx.save();
    ctx.translate(x, y + 9);
    ctx.rotate(jit(i, 2) * 0.3);
    const g = ctx.createRadialGradient(0, 0, 1, 0, 0, 22);
    g.addColorStop(0, alpha('#FFF0B8', 0.75));
    g.addColorStop(1, alpha('#FFF0B8', 0));
    ctx.fillStyle = g;
    ctx.fillRect(-22, -22, 44, 44);
    seg(ctx, [[0, -14], [0, -9]], INK, 2);
    inked(ctx, () => starPath(ctx, 0, 2, 12.5), cols[i % 4], { band: 3, lw: 1.8 });
    disc(ctx, -3, -1, 2.2, alpha(P.white, 0.85));
    ctx.restore();
  }
}

/** 蘑菇台灯: a toadstool lamp, glowing under its cap. Bounds [-50, -107, 50, 5.5]. */
export function mushroomLamp(ctx: Ctx) {
  contactShadow(ctx, 0, 3, 30, 5, 0.2);
  const g = ctx.createRadialGradient(0, -52, 4, 0, -52, 56);
  g.addColorStop(0, alpha('#FFE7A0', 0.7));
  g.addColorStop(1, alpha('#FFE7A0', 0));
  ctx.fillStyle = g;
  ctx.fillRect(-56, -108, 112, 112);
  ell(ctx, 0, -2, 24, 6, P.woodDeep);
  inked(ctx, () => polyPath(ctx, [[-10, -2], [-8, -54], [8, -54], [12, -2]], 36, 0.3, 4), P.cream, { band: 4, lw: 2 });
  inked(ctx, () => {
    ctx.beginPath();
    ctx.moveTo(-46, -50);
    ctx.quadraticCurveTo(-48, -104, 0, -104);
    ctx.quadraticCurveTo(48, -104, 46, -50);
    ctx.quadraticCurveTo(0, -42, -46, -50);
    ctx.closePath();
  }, P.red, { band: 8, lw: 2.2 });
  for (const [x, y, r] of [[-22, -80, 7], [8, -90, 6], [26, -68, 6], [-4, -66, 5], [-34, -60, 4]] as const) {
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.8, 0, 0, Math.PI * 2);
    ctx.fillStyle = P.white;
    ctx.fill();
  }
  ctx.beginPath();
  ctx.ellipse(0, -49, 40, 6, 0, 0, Math.PI);
  ctx.fillStyle = '#FFF0B8';
  ctx.fill();
}

/** 小鱼缸: a round fishbowl with one quiet orange fish. Bounds [-39, -75, 39, 5.5]. */
export function fishbowl(ctx: Ctx) {
  contactShadow(ctx, 0, 3, 30, 5, 0.2);
  const bowl = () => {
    ctx.beginPath();
    ctx.arc(0, -36, 36, -Math.PI * 0.32, Math.PI + Math.PI * 0.32);
    ctx.closePath();
  };
  ctx.save();
  bowl();
  ctx.clip();
  ctx.fillStyle = alpha(P.tealLight, 0.55);
  ctx.fillRect(-40, -80, 80, 90);
  ctx.fillStyle = alpha(P.teal, 0.85);
  ctx.fillRect(-40, -54, 80, 64);
  for (let i = 0; i < 7; i++) disc(ctx, -24 + i * 8, -4 - (i % 2) * 3, 4, [P.silver, P.kraft, P.pink][i % 3]);
  ctx.strokeStyle = P.lilyDeep;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(18, -4);
  ctx.quadraticCurveTo(26, -24, 16, -40);
  ctx.moveTo(22, -4);
  ctx.quadraticCurveTo(14, -20, 24, -32);
  ctx.stroke();
  // the fish
  inked(ctx, () => {
    ctx.beginPath();
    ctx.ellipse(-6, -30, 12, 8, 0, 0, Math.PI * 2);
  }, P.orange, { band: 3, lw: 1.6 });
  inked(ctx, () => polyPath(ctx, [[5, -30], [16, -38], [16, -22]], 37, 0.2, 2), P.orange, { band: 2, lw: 1.6 });
  disc(ctx, -12, -32, 2, INK);
  disc(ctx, -24, -44, 2.4, alpha(P.white, 0.9));
  disc(ctx, -20, -52, 1.6, alpha(P.white, 0.9));
  ctx.restore();
  bowl();
  stroke(ctx, INK, 2.2);
  ell(ctx, 0, -66, 19, 4, alpha(P.tealLight, 0.8), { band: 0, lw: 2 });
  seg(ctx, [[-26, -50], [-20, -62]], alpha(P.white, 0.9), 3);
}

/** 书架: a shelf on the wall with books, a plant and a jar. Bounds [-92, -83, 92, 19.4]. */
export function shelf(ctx: Ctx) {
  const books: [number, number, string][] = [[-82, 64, P.blue], [-70, 72, P.red], [-58, 58, P.lily], [-46, 70, P.mustard], [-34, 62, P.tealDeep], [-22, 74, P.orange], [-10, 56, P.pink]];
  for (const [x, h, c] of books) {
    box(ctx, x, -h, 12, h, c, { r: 2, band: 3, lw: 1.6 });
    seg(ctx, [[x + 2, -h + 10], [x + 10, -h + 10]], alpha(P.white, 0.6), 1.4);
  }
  // one leaning
  ctx.save();
  ctx.translate(6, 0);
  ctx.rotate(0.28);
  box(ctx, 0, -60, 12, 60, P.blueLight, { r: 2, band: 3, lw: 1.6 });
  ctx.restore();
  // a little plant and a honey jar
  inked(ctx, () => polyPath(ctx, [[34, 0], [54, 0], [52, -18], [36, -18]], 38, 0.3, 2), P.orangeDeep, { band: 3, lw: 1.6 });
  inked(ctx, () => puffPath(ctx, 44, -28, 14, 12, 6, 39), P.lily, { band: 3, lw: 1.6 });
  box(ctx, 64, -24, 20, 24, P.gold, { r: 6, band: 3, lw: 1.6 });
  box(ctx, 62, -30, 24, 7, P.white, { r: 2, band: 1, lw: 1.4 });
  // the plank and its brackets
  box(ctx, -90, 0, 180, 10, P.woodLight, { r: 3, band: 3 });
  for (const x of [-70, 70]) inked(ctx, () => polyPath(ctx, [[x - 4, 10], [x + 4, 10], [x + 4, 19], [x - 12, 10]], 40 + x, 0.2, 1), P.woodDeep, { band: 2, lw: 1.6 });
}

/** 唱片机: a gramophone with a brass horn. Bounds [-60, -135, 60, 11]. */
export function gramophone(ctx: Ctx) {
  contactShadow(ctx, 0, 8, 54, 7, 0.22);
  box(ctx, -48, -42, 96, 46, P.wood, { r: 4, band: 6, hatch: true });
  box(ctx, -40, -32, 80, 28, P.woodLight, { r: 3, band: 3, lw: 1.6 });
  for (const lx of [-42, 34]) box(ctx, lx, 2, 8, 9, P.woodDeep, { r: 2, band: 1, lw: 1.4 });
  ell(ctx, -4, -46, 40, 8, INK, { band: 0, lw: 1.8 });
  ell(ctx, -4, -46, 10, 2.6, P.red, { band: 0, lw: 1 });
  // the arm and horn
  seg(ctx, [[30, -46], [30, -64], [14, -78]], P.gold, 5);
  seg(ctx, [[30, -46], [30, -64], [14, -78]], INK, 1.2);
  inked(ctx, () => {
    ctx.beginPath();
    ctx.moveTo(10, -76);
    ctx.quadraticCurveTo(-4, -92, -18, -128);
    ctx.quadraticCurveTo(-46, -136, -58, -110);
    ctx.quadraticCurveTo(-30, -96, 18, -70);
    ctx.closePath();
  }, P.gold, { band: 6, lw: 2.2 });
  inked(ctx, () => {
    ctx.beginPath();
    ctx.ellipse(-38, -120, 22, 10, -0.5, 0, Math.PI * 2);
  }, shade(P.gold, 0.35), { band: 3, lw: 2 });
  seg(ctx, [[-14, -116], [8, -80]], alpha(P.white, 0.6), 2);
}

/** 碎花窗帘: floral curtains tied back on a rod, framing the window. Bounds [-104, -264, 104, 0]. */
export function curtains(ctx: Ctx) {
  const fab = P.pink;
  for (const d of [-1, 1]) {
    const panel = () => {
      ctx.beginPath();
      ctx.moveTo(d * 102, -250);
      ctx.lineTo(d * 52, -250);
      ctx.quadraticCurveTo(d * 70, -160, d * 82, -130);
      ctx.quadraticCurveTo(d * 70, -80, d * 76, -10);
      ctx.lineTo(d * 104, -6);
      ctx.closePath();
    };
    inked(ctx, panel, fab, { band: 8, lw: 2.2 });
    ctx.save();
    panel();
    ctx.clip();
    for (let i = 0; i < 14; i++) flower(ctx, d * (60 + (i % 3) * 16), -238 + i * 17, i % 2 ? P.white : P.red, 0.7);
    ctx.strokeStyle = alpha(shade(fab, 0.25), 0.7);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let k = 0; k < 3; k++) {
      ctx.moveTo(d * (66 + k * 12), -248);
      ctx.quadraticCurveTo(d * (80 + k * 8), -170, d * (90 + k * 4), -134);
    }
    ctx.stroke();
    ctx.restore();
    // tie-back
    box(ctx, d > 0 ? 70 : -94, -136, 24, 10, P.gold, { r: 4, band: 2, lw: 1.6 });
  }
  // rod and a scalloped valance
  seg(ctx, [[-106, -256], [106, -256]], P.woodDeep, 6);
  seg(ctx, [[-106, -256], [106, -256]], INK, 1.4);
  for (const d of [-1, 1]) disc(ctx, d * 108, -256, 6, P.gold);
  inked(ctx, () => {
    ctx.beginPath();
    ctx.moveTo(-100, -254);
    ctx.lineTo(100, -254);
    for (let i = 6; i >= 0; i--) {
      const x = -100 + (200 * i) / 6;
      if (i < 6) ctx.quadraticCurveTo(x + 200 / 12, -222, x, -236);
      else ctx.lineTo(x, -236);
    }
    ctx.closePath();
  }, tint(fab, 0.2), { band: 4, lw: 2 });
}

/** 荷叶坐垫: a round floor cushion like a lily pad, with a lotus pinned on. Bounds [-52, -83, 52, 0]. */
export function cushion(ctx: Ctx, tod: Tod) {
  contactShadow(ctx, 0, -4, 48, 7, 0.22);
  inked(ctx, () => {
    ctx.beginPath();
    ctx.moveTo(-50, -38);
    ctx.quadraticCurveTo(-52, -6, 0, -4);
    ctx.quadraticCurveTo(52, -6, 50, -38);
    ctx.closePath();
  }, shade(P.lily, 0.15), { band: 6, lw: 2.2 });
  ctx.save();
  ctx.scale(1, 0.8);
  lilyPad(ctx, 0, -50, 50, tod, 8);
  ctx.restore();
  lotus(ctx, 4, -50, 0.62, tod);
}

/** 河湾旗: a pennant with an embroidered lotus on a little stand. Bounds [-45, -160, 45, 0]. */
export function pennant(ctx: Ctx, tod: Tod) {
  contactShadow(ctx, 0, -4, 24, 5, 0.2);
  ell(ctx, 0, -6, 20, 6, P.woodDeep);
  seg(ctx, [[-30, -150], [-30, -8]], INK, 6);
  seg(ctx, [[-30, -150], [-30, -8]], P.woodLight, 3);
  inked(ctx, () => {
    ctx.beginPath();
    ctx.moveTo(-28, -150);
    ctx.quadraticCurveTo(10, -140, 44, -122);
    ctx.quadraticCurveTo(10, -104, -28, -94);
    ctx.closePath();
  }, P.tealDeep, { band: 6, lw: 2.2 });
  ctx.save();
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(-24, -144);
  ctx.quadraticCurveTo(8, -134, 34, -122);
  ctx.quadraticCurveTo(8, -110, -24, -100);
  stroke(ctx, alpha(P.white, 0.8), 1.4);
  ctx.restore();
  lotus(ctx, -6, -114, 0.42, tod);
  disc(ctx, -30, -154, 5, P.gold);
}

/** 河湾日落: a framed painting of the sun going down over the river. Bounds [-59, -139, 59, 0]. */
export function painting(ctx: Ctx) {
  const x = -54, y = -134, w = 108, h = 128;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x + 10, y + 10, w - 20, h - 20);
  ctx.clip();
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, '#EFA88C');
  g.addColorStop(0.55, '#F8DDB0');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  disc(ctx, 6, y + 66, 18, '#F9C77E');
  ctx.fillStyle = '#B5A38F';
  ctx.beginPath();
  ctx.moveTo(x, y + 78);
  ctx.quadraticCurveTo(-20, y + 56, 10, y + 74);
  ctx.quadraticCurveTo(34, y + 60, x + w, y + 76);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.fill();
  ctx.fillStyle = '#94B6B2';
  ctx.fillRect(x, y + 86, w, h);
  for (const [sx, sy, sw] of [[-14, 94, 30], [-4, 102, 24], [2, 110, 16]] as const) seg(ctx, [[sx, y + sy], [sx + sw, y + sy]], alpha('#FFE3B8', 0.9), 2.4);
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.ellipse(-26, y + 98, 8, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // the frame, carved
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.rect(x + 10, y + 10, w - 20, h - 20);
  ctx.fillStyle = P.gold;
  ctx.fill('evenodd');
  ctx.restore();
  inked(ctx, () => {
    ctx.beginPath();
    ctx.rect(x, y, w, h);
  }, 'rgba(0,0,0,0)', { shade: false, lw: 2.4 });
  ctx.beginPath();
  ctx.rect(x + 10, y + 10, w - 20, h - 20);
  stroke(ctx, INK, 1.8);
  ctx.save();
  ctx.setLineDash([3, 4]);
  ctx.beginPath();
  ctx.rect(x + 4.5, y + 4.5, w - 9, h - 9);
  stroke(ctx, shade(P.gold, 0.3), 1.4);
  ctx.restore();
}

/** 地球仪: a globe that is nearly all river, on a stand. Bounds [-52, -139, 52, 0]. */
export function globe(ctx: Ctx) {
  contactShadow(ctx, 0, -4, 34, 6, 0.2);
  ell(ctx, 0, -8, 28, 7, P.woodDeep);
  box(ctx, -4, -40, 8, 34, P.woodDeep, { r: 2, band: 2, lw: 1.6 });
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, -84, 42, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = P.teal;
  ctx.fillRect(-44, -128, 88, 88);
  ctx.fillStyle = P.lily;
  for (const [x, y, rx, ry] of [[-18, -100, 16, 10], [16, -76, 14, 18], [-20, -66, 9, 6], [24, -112, 8, 5]] as const) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = alpha(P.white, 0.7);
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(-40, -92);
  ctx.bezierCurveTo(-10, -70, 4, -110, 40, -86);
  ctx.stroke();
  ctx.restore();
  inked(ctx, () => {
    ctx.beginPath();
    ctx.arc(0, -84, 42, 0, Math.PI * 2);
  }, 'rgba(0,0,0,0)', { shade: false, lw: 2.2 });
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, -84, 50, Math.PI * 0.6, Math.PI * 2.4);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 7;
  ctx.stroke();
  ctx.strokeStyle = P.gold;
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.restore();
  seg(ctx, [[-16, -112], [-26, -100]], alpha(P.white, 0.9), 3);
}

/** 小茶几: a round tea table with a teapot, cups and biscuits. Bounds [-80, -139, 80, 0]. */
export function teaTable(ctx: Ctx) {
  contactShadow(ctx, 0, -4, 66, 7, 0.22);
  for (const [x, a] of [[-48, -0.12], [48, 0.12], [-16, -0.04], [16, 0.04]] as const) {
    ctx.save();
    ctx.translate(x, -76);
    ctx.rotate(a);
    box(ctx, -4, 0, 8, 72, P.woodDeep, { r: 2, band: 2, lw: 1.6 });
    ctx.restore();
  }
  ell(ctx, 0, -78, 76, 16, P.woodLight, { band: 5 });
  ell(ctx, 0, -82, 70, 12, P.wood, { band: 3, lw: 1.6 });
  // teapot
  inked(ctx, () => blobEllipse(ctx, -14, -104, 24, 20, 41, 0.03), P.white, { band: 5, lw: 2 });
  inked(ctx, () => {
    ctx.beginPath();
    ctx.moveTo(8, -104);
    ctx.quadraticCurveTo(24, -108, 30, -122);
    ctx.lineTo(34, -120);
    ctx.quadraticCurveTo(28, -98, 8, -96);
    ctx.closePath();
  }, P.white, { band: 2, lw: 1.8 });
  ctx.beginPath();
  ctx.arc(-38, -104, 10, Math.PI * 0.5, Math.PI * 1.5);
  stroke(ctx, INK, 3);
  ell(ctx, -14, -124, 12, 4, P.tealLight, { band: 0, lw: 1.6 });
  disc(ctx, -14, -130, 4, P.teal);
  flower(ctx, -14, -104, P.pink, 0.9);
  seg(ctx, [[-8, -134], [-12, -144], [-6, -150]], alpha(P.white, 0.8), 2);
  // cups and biscuits
  for (const x of [34, 54]) {
    inked(ctx, () => polyPath(ctx, [[x - 8, -96], [x + 8, -96], [x + 6, -84], [x - 6, -84]], 42 + x, 0.2, 2), P.white, { band: 2, lw: 1.6 });
  }
  ell(ctx, 40, -82, 22, 4, P.cream, { band: 0, lw: 1.4 });
  for (const x of [-52, -40]) ell(ctx, x, -88, 7, 3.4, P.kraftTop, { band: 1, lw: 1.4 });
}

/** 吊床: a striped hammock slung between two posts. Bounds [-118, -139, 118, 0]. */
export function hammock(ctx: Ctx) {
  contactShadow(ctx, 0, -4, 110, 8, 0.2);
  for (const d of [-1, 1]) {
    box(ctx, d * 108 - 6, -134, 12, 132, P.woodDeep, { r: 3, band: 3 });
    ell(ctx, d * 108, -4, 16, 5, P.wood, { band: 1, lw: 1.6 });
  }
  // ropes from the posts to the cloth
  for (const d of [-1, 1]) seg(ctx, [[d * 104, -118], [d * 76, -96]], INK, 2);
  const cloth = () => {
    ctx.beginPath();
    ctx.moveTo(-78, -100);
    ctx.quadraticCurveTo(0, -12, 78, -100);
    ctx.quadraticCurveTo(0, -40, -78, -100);
    ctx.closePath();
  };
  inked(ctx, cloth, P.cream, { band: 6, lw: 2.2 });
  ctx.save();
  cloth();
  ctx.clip();
  for (let i = -4; i <= 4; i += 2) {
    ctx.beginPath();
    ctx.moveTo(-80, -100 + i * 4);
    ctx.quadraticCurveTo(0, -16 + i * 4, 80, -100 + i * 4);
    stroke(ctx, P.orange, 5);
  }
  ctx.restore();
  cloth();
  stroke(ctx, INK, 2.2);
  // a pillow
  inked(ctx, () => blobEllipse(ctx, -52, -84, 18, 11, 43, 0.05), P.lilyLight, { band: 3, lw: 1.8 });
}

/** 奖杯架: a two-tier display shelf of little trophies. Bounds [-69, -167, 69, 0]. */
export function trophyShelf(ctx: Ctx) {
  contactShadow(ctx, 0, -4, 64, 7, 0.22);
  box(ctx, -66, -164, 132, 162, P.wood, { r: 5, band: 8 });
  box(ctx, -58, -152, 116, 64, shade(P.wood, 0.35), { r: 3, band: 3, lw: 1.6 });
  box(ctx, -58, -80, 116, 64, shade(P.wood, 0.35), { r: 3, band: 3, lw: 1.6 });
  for (const sy of [-88, -16]) box(ctx, -62, sy, 124, 8, P.woodLight, { r: 2, band: 2, lw: 1.6 });
  const cup = (x: number, y: number, s: number, c: string) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    box(ctx, -10, -8, 20, 8, P.woodDeep, { r: 2, band: 1, lw: 1.4 });
    box(ctx, -3, -18, 6, 10, c, { r: 1, band: 1, lw: 1.4 });
    inked(ctx, () => {
      ctx.beginPath();
      ctx.moveTo(-14, -44);
      ctx.lineTo(14, -44);
      ctx.quadraticCurveTo(14, -18, 0, -18);
      ctx.quadraticCurveTo(-14, -18, -14, -44);
      ctx.closePath();
    }, c, { band: 4, lw: 1.6 });
    for (const d of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(d * 15, -36, 6, d < 0 ? Math.PI * 0.5 : -Math.PI * 0.5, d < 0 ? Math.PI * 1.5 : Math.PI * 0.5);
      stroke(ctx, INK, 1.6);
    }
    starPath(ctx, 0, -32, 5);
    ctx.fillStyle = alpha(P.white, 0.8);
    ctx.fill();
    ctx.restore();
  };
  cup(-30, -88, 0.9, P.gold);
  cup(8, -88, 1.1, P.gold);
  cup(40, -88, 0.8, P.silver);
  cup(-26, -16, 0.8, '#D9A15A');
  // a ribbon medal hanging on the lower shelf
  seg(ctx, [[22, -78], [16, -54]], P.red, 4);
  seg(ctx, [[30, -78], [36, -54]], P.blue, 4);
  ell(ctx, 26, -48, 10, 10, P.gold);
  starPath(ctx, 26, -48, 5);
  ctx.fillStyle = alpha(P.white, 0.8);
  ctx.fill();
}

