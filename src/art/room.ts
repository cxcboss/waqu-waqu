// The indoor rooms, drawn in code with the 河湾手账 kit: the frog's room (wallpaper, wainscot, a plank
// floor in perspective, the window's light on the floor), the HQ office behind the owl (pigeonholes, the
// wall clock, the window with its curtains, the counter), the shop (plank wall, bunting, shelves of jars,
// the counter and till), the gift box handed over after a purchase, and the staff cards for each rank.
// Rooms with a window take the hour's tokens (Tod); everything else is the same all day.
import type { Ctx } from '../platform/types';
import { alpha, blobEllipse, boxPath, contactShadow, grainRect, inked, jit, jit01, mix, polyPath, puffPath, shade, tint, type Tod } from './kit';
import { INK, P } from './palette';
import { box, disc, ell, grain, seg, starPath, stroke } from './furniture';
import { flower } from './village';

const TAU = Math.PI * 2;

// ---------------------------------------------------------------- shared pieces

/** A little wallpaper sprig: a curved stem with leaves, and a flower on top for the frog's room. */
function sprig(ctx: Ctx, x: number, y: number, s: number, leaf: string, bloom?: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.strokeStyle = leaf;
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, 12);
  ctx.quadraticCurveTo(2, 0, 0, -12);
  ctx.stroke();
  ctx.fillStyle = leaf;
  for (const [lx, ly, a] of [[-5, 2, -0.7], [5, -3, 0.7], [-4, -8, -0.5]] as const) {
    ctx.save();
    ctx.translate(lx, ly);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.ellipse(0, 0, 5.5, 2.6, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  if (bloom) {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU;
      disc(ctx, Math.cos(a) * 2.6, -14 + Math.sin(a) * 2.6, 2.2, bloom);
    }
    disc(ctx, 0, -14, 1.4, alpha(P.gold, 0.9));
  }
  ctx.restore();
}

/** Wallpaper over a box: 'stripe' (soft stripes with flower sprigs, the frog's room) or 'sprig' (sage sprigs on cream, HQ). */
function wallpaper(ctx: Ctx, x: number, y: number, w: number, h: number, base: string, kind: 'stripe' | 'sprig') {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = base;
  ctx.fillRect(x, y, w, h);
  if (kind === 'stripe') {
    const band = alpha(shade(base, 0.3), 0.1), pin = alpha(shade(base, 0.35), 0.28);
    for (let sx = x - 20; sx < x + w; sx += 84) {
      ctx.fillStyle = band;
      ctx.fillRect(sx, y, 34, h);
      ctx.fillStyle = pin;
      ctx.fillRect(sx - 4, y, 1.4, h);
      ctx.fillRect(sx + 38, y, 1.4, h);
    }
    const leaf = alpha(mix(P.lily, base, 0.45), 0.75), bloom = alpha(mix(P.pink, base, 0.25), 0.85);
    for (let r = 0, yy = y + 40; yy < y + h + 40; yy += 92, r++) {
      for (let sx = x + 22 + (r % 2) * 42; sx < x + w + 40; sx += 84) sprig(ctx, sx, yy, 1, leaf, bloom);
    }
  } else {
    const leaf = alpha(mix(P.lily, base, 0.4), 0.6);
    for (let r = 0, yy = y + 30; yy < y + h + 40; yy += 76, r++) {
      for (let sx = x + 30 + (r % 2) * 48; sx < x + w + 40; sx += 96) {
        ctx.save();
        ctx.translate(sx, yy);
        ctx.rotate(jit(r * 31 + sx, 1) * 0.35);
        sprig(ctx, 0, 0, 1.1, leaf);
        ctx.restore();
      }
    }
  }
  grainRect(ctx, x, y, w, h, 0.5);
  ctx.restore();
}

/** Vertical tongue-and-groove boards over a box, with a few nail heads. */
function boards(ctx: Ctx, x: number, y: number, w: number, h: number, wood: string, bw = 46, seed = 1) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = wood;
  ctx.fillRect(x, y, w, h);
  for (let i = 0, bx = x; bx < x + w; bx += bw, i++) {
    // each board a shade apart, lit a little on its left edge
    ctx.fillStyle = jit(seed, i) > 0 ? alpha(tint(wood, 0.3), 0.18 * jit01(seed, i + 9)) : alpha(shade(wood, 0.3), 0.16 * jit01(seed, i + 9));
    ctx.fillRect(bx, y, bw, h);
    ctx.fillStyle = alpha(tint(wood, 0.5), 0.35);
    ctx.fillRect(bx + 2, y, 3, h);
    ctx.fillStyle = alpha(INK, 0.38);
    ctx.fillRect(bx - 1, y, 2, h);
    grain(ctx, bx + 6, y, bw - 10, h, shade(wood, 0.3), 26 + (i % 3) * 6);
  }
  ctx.restore();
}

/** A plank floor running away from the viewer: boards fanning out from a vanishing point above the room. */
function floor(ctx: Ctx, y0: number, y1: number, wood: string, seed = 5) {
  const vy = y0 - 900, cx = 375, bw = 54;
  const xAt = (x0: number, y: number) => cx + (x0 - cx) * ((y - vy) / (y0 - vy));
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, y0, 750, y1 - y0);
  ctx.clip();
  ctx.fillStyle = wood;
  ctx.fillRect(0, y0, 750, y1 - y0);
  for (let i = -9; i <= 8; i++) {
    const xa = cx + i * bw, xb = xa + bw;
    const quad = () => {
      ctx.beginPath();
      ctx.moveTo(xa, y0);
      ctx.lineTo(xb, y0);
      ctx.lineTo(xAt(xb, y1), y1);
      ctx.lineTo(xAt(xa, y1), y1);
      ctx.closePath();
    };
    quad();
    const v = jit(seed, i + 20);
    ctx.fillStyle = v > 0 ? alpha(tint(wood, 0.35), 0.22 * v) : alpha(shade(wood, 0.25), -0.3 * v);
    ctx.fill();
    // the seam, and a highlight along the board's lit edge
    ctx.beginPath();
    ctx.moveTo(xa, y0);
    ctx.lineTo(xAt(xa, y1), y1);
    ctx.strokeStyle = alpha(INK, 0.4);
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(xa + 3, y0);
    ctx.lineTo(xAt(xa + 3, y1), y1);
    ctx.strokeStyle = alpha(tint(wood, 0.5), 0.35);
    ctx.lineWidth = 2;
    ctx.stroke();
    // butt joints further down each board, and the nails beside them; spaced wider toward the viewer
    for (let k = 0, y = y0 + 40 + jit01(seed, i + 40) * 160; y < y1; k++) {
      const l = xAt(xa, y), r = xAt(xb, y);
      ctx.beginPath();
      ctx.moveTo(l, y);
      ctx.lineTo(r, y);
      ctx.strokeStyle = alpha(INK, 0.35);
      ctx.lineWidth = 1.6;
      ctx.stroke();
      const s = (y - vy) / (y0 - vy);
      for (const f of [0.25, 0.75]) {
        disc(ctx, l + (r - l) * f, y - 5 * s, 1.5 * s, alpha(INK, 0.4));
        disc(ctx, l + (r - l) * f, y + 5 * s, 1.5 * s, alpha(INK, 0.4));
      }
      y += (260 + jit01(seed, i * 7 + k) * 240) * s;
    }
    // a little grain along the board
    ctx.beginPath();
    for (let g = 0; g < 2; g++) {
      const f = 0.3 + g * 0.38 + jit(seed, i * 3 + g) * 0.08;
      ctx.moveTo(xa + bw * f, y0);
      ctx.lineTo(xAt(xa + bw * f, y1), y1);
    }
    ctx.strokeStyle = alpha(shade(wood, 0.3), 0.25);
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
  // deeper in the room is darker
  const g = ctx.createLinearGradient(0, y0, 0, y0 + 140);
  g.addColorStop(0, alpha(INK, 0.22));
  g.addColorStop(1, alpha(INK, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, y0, 750, 140);
  grainRect(ctx, 0, y0, 750, y1 - y0, 0.4);
  ctx.restore();
}

/** Light through a four-pane window, lying on the floor as a skewed patch: A B along the wall, C D nearer the viewer. */
function lightPatch(ctx: Ctx, quad: readonly [number, number][], color: string, a: number) {
  const [A, B, C, D] = quad;
  const at = (u: number, v: number): [number, number] => {
    const tx = A[0] + (B[0] - A[0]) * u, ty = A[1] + (B[1] - A[1]) * u;
    const bx = D[0] + (C[0] - D[0]) * u, by = D[1] + (C[1] - D[1]) * u;
    return [tx + (bx - tx) * v, ty + (by - ty) * v];
  };
  ctx.save();
  const g = ctx.createLinearGradient(0, A[1], 0, D[1]);
  g.addColorStop(0, alpha(color, a));
  g.addColorStop(1, alpha(color, a * 0.25));
  ctx.fillStyle = g;
  for (const [u0, u1] of [[0, 0.47], [0.53, 1]]) {
    for (const [v0, v1] of [[0, 0.46], [0.54, 1]]) {
      const p = [at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1)];
      ctx.beginPath();
      ctx.moveTo(p[0][0], p[0][1]);
      for (let i = 1; i < 4; i++) ctx.lineTo(p[i][0], p[i][1]);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
}

/** A view out of a window: the hour's sky, hills, the river and a sail. Clip to the glass first. */
function view(ctx: Ctx, x: number, y: number, w: number, h: number, tod: Tod) {
  const g = ctx.createLinearGradient(0, y, 0, y + h * 0.6);
  g.addColorStop(0, tod.skyTop);
  g.addColorStop(1, tod.skyBot);
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  if (tod.stars) {
    for (let i = 0; i < 18; i++) disc(ctx, x + 8 + ((i * 53) % (w - 16)), y + 8 + ((i * 37) % (h * 0.4)), 1.3 + (i % 3) * 0.4, '#FFF4C8');
    disc(ctx, x + w * 0.72, y + h * 0.18, 15, tod.sun);
    disc(ctx, x + w * 0.72 + 7, y + h * 0.18 - 5, 13, tod.skyTop);
  } else {
    disc(ctx, x + w * 0.74, y + h * (tod.name === 'dusk' ? 0.42 : 0.2), 30, alpha(tod.halo, 0.7));
    disc(ctx, x + w * 0.74, y + h * (tod.name === 'dusk' ? 0.42 : 0.2), 19, tod.sun);
    // a cloud
    ctx.fillStyle = tod.cloud;
    puffPath(ctx, x + w * 0.3, y + h * 0.16, 34, 11, 5, 3, 0.4);
    ctx.fill();
  }
  const hill = (yy: number, amp: number, color: string, seed: number) => {
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    ctx.lineTo(x, yy);
    for (let i = 0; i <= 6; i++) ctx.quadraticCurveTo(x + (i - 0.5) * (w / 6), yy - amp * (0.5 + jit01(seed, i)), x + i * (w / 6), yy - amp * 0.2 * jit(seed, i + 9));
    ctx.lineTo(x + w, y + h);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  };
  hill(y + h * 0.5, 26, tod.hillFar, 4);
  hill(y + h * 0.62, 18, tod.hillNear, 7);
  // trees on the near hill
  for (let i = 0; i < 5; i++) {
    const tx = x + 14 + i * (w / 5) + jit(i, 3) * 8;
    ctx.fillStyle = shade(tod.grass, 0.15);
    puffPath(ctx, tx, y + h * 0.6, 9, 11, 5, i + 2, 0.2);
    ctx.fill();
  }
  ctx.fillStyle = tod.water;
  ctx.fillRect(x, y + h * 0.72, w, h * 0.3);
  ctx.fillStyle = tod.waterDeep;
  ctx.fillRect(x, y + h * 0.86, w, h * 0.2);
  ctx.strokeStyle = alpha(tod.glint, 0.85);
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const gx = x + 10 + ((i * 61) % (w - 40)), gy = y + h * 0.76 + (i % 3) * 9;
    ctx.moveTo(gx, gy);
    ctx.lineTo(gx + 18, gy);
  }
  ctx.stroke();
  // a little sail on the river
  const sx = x + w * 0.32, sy = y + h * 0.78;
  ctx.fillStyle = shade(P.wood, tod.stars ? 0.4 : 0.1);
  ctx.beginPath();
  ctx.moveTo(sx - 14, sy);
  ctx.lineTo(sx + 14, sy);
  ctx.lineTo(sx + 9, sy + 6);
  ctx.lineTo(sx - 9, sy + 6);
  ctx.fill();
  ctx.fillStyle = tod.stars ? '#B9C2CF' : P.white;
  ctx.beginPath();
  ctx.moveTo(sx, sy - 24);
  ctx.lineTo(sx + 12, sy - 2);
  ctx.lineTo(sx, sy - 2);
  ctx.fill();
  if (tod.lit > 0) {
    ctx.fillStyle = alpha(tod.windowGlow, 0.12 * tod.lit);
    ctx.fillRect(x, y, w, h);
  }
}

/** How the room's own light looks at this hour: nothing by day, warm at dusk, lamplit at night. */
function roomLight(ctx: Ctx, tod: Tod, w: number, h: number, lamp: [number, number]) {
  if (tod.name === 'dusk') {
    ctx.fillStyle = alpha('#E79A6A', 0.07);
    ctx.fillRect(0, 0, w, h);
  } else if (tod.name === 'night') {
    ctx.fillStyle = alpha('#2C3E57', 0.16);
    ctx.fillRect(0, 0, w, h);
    const g = ctx.createRadialGradient(lamp[0], lamp[1], 20, lamp[0], lamp[1], 520);
    g.addColorStop(0, alpha(tod.lampGlow, 0.22));
    g.addColorStop(1, alpha(tod.lampGlow, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
}

const SUN_PATCH: Record<string, [string, number]> = {
  morning: ['#FFE3B0', 0.42], day: ['#FFF4D2', 0.36], dusk: ['#FFBE78', 0.36], night: ['#CFE0F4', 0],
};

// ---------------------------------------------------------------- the frog's room

/**
 * The frog's room from the top of the screen to `h`: striped wallpaper, a wainscot and skirting, the
 * floor below `floorY`, and the window's light (centred at `winX`, its sill at `sillY`) on the floor.
 */
export function homeRoom(ctx: Ctx, tod: Tod, floorY: number, h: number, winX: number, sillY: number) {
  const wall = tod.name === 'night' ? '#E9D9B8' : tod.name === 'dusk' ? '#F4E2C4' : '#F4E8CC';
  wallpaper(ctx, 0, 0, 750, floorY, wall, 'stripe');
  // a soft shadow under the ceiling
  const cg = ctx.createLinearGradient(0, 0, 0, 160);
  cg.addColorStop(0, alpha(INK, 0.16));
  cg.addColorStop(1, alpha(INK, 0));
  ctx.fillStyle = cg;
  ctx.fillRect(0, 0, 750, 160);
  // wainscot: boards under a chair rail
  const wy = floorY - 128;
  boards(ctx, 0, wy, 750, 128, '#D7AE80', 50, 3);
  ctx.fillStyle = alpha(INK, 0.16);
  ctx.fillRect(0, wy, 750, 10);
  box(ctx, -10, wy - 16, 770, 18, P.woodLight, { r: 3, band: 5, lw: 2.2, seed: 4 });
  ctx.fillStyle = alpha(INK, 0.14);
  ctx.fillRect(0, wy + 2, 750, 5);
  // the floor and the skirting board
  floor(ctx, floorY, h, '#CF9E6C');
  box(ctx, -10, floorY - 18, 770, 22, P.woodDeep, { r: 2, band: 5, lw: 2.2, seed: 6 });
  ctx.fillStyle = alpha(INK, 0.2);
  ctx.fillRect(0, floorY + 4, 750, 6);
  // the window's light on the floor by day, longer and lower at dusk
  const [c, a] = SUN_PATCH[tod.name];
  if (tod.stars) {
    roomLight(ctx, tod, 750, h, [375, floorY - 200]);
    return;
  }
  const reach = tod.name === 'dusk' ? 330 : tod.name === 'morning' ? 290 : 240;
  const lean = tod.name === 'dusk' ? 250 : 170;
  lightPatch(ctx, [[winX - 72, floorY + 14], [winX + 64, floorY + 14], [winX + 64 - lean * 0.45, floorY + reach], [winX - 72 - lean, floorY + reach]], c, a);
  // and a little glow on the wall under the sill
  const g = ctx.createRadialGradient(winX, sillY, 10, winX, sillY, 200);
  g.addColorStop(0, alpha(c, a * 0.5));
  g.addColorStop(1, alpha(c, 0));
  ctx.fillStyle = g;
  ctx.fillRect(winX - 200, sillY - 200, 400, 400);
  roomLight(ctx, tod, 750, h, [375, floorY - 200]);
}

// ---------------------------------------------------------------- HQ

/** The HQ room's height, and how much of it shows above the counter in the report scene (the sign's area). */
export const HQ_ROOM = { h: 900, contentH: 555 };
/** Where the HQ wall clock hangs in the room (room units), so the scene can draw its hands. */
export const HQ_CLOCK = { x: 350, y: 560, r: 54 };

/** One cubby's contents in the pigeonhole shelf. */
function cubby(ctx: Ctx, x: number, y: number, w: number, h: number, kind: number, seed: number) {
  const fy = y + h;
  if (kind === 0) {
    // letters standing in a row
    for (let i = 0; i < 4; i++) {
      ctx.save();
      ctx.translate(x + 14 + i * 14, fy);
      ctx.rotate(-0.12 + i * 0.07 + jit(seed, i) * 0.05);
      inked(ctx, () => boxPath(ctx, -4, -h * 0.72, 30, h * 0.72, 2, seed + i, 0.3), i % 2 ? P.white : P.cream, { band: 3, lw: 1.6 });
      if (i === 3) box(ctx, 14, -h * 0.72 + 6, 8, 9, P.red, { r: 1, band: 0, lw: 1.2 });
      ctx.restore();
    }
  } else if (kind === 1) {
    // a parcel with tape and a label
    const bw = w * 0.66, bh = h * 0.62, bx = x + (w - bw) / 2;
    inked(ctx, () => boxPath(ctx, bx, fy - bh, bw, bh, 3, seed, 0.4), P.kraft, { band: 6, lw: 2 });
    ctx.fillStyle = alpha(P.kraftTop, 0.9);
    ctx.fillRect(bx + bw / 2 - 5, fy - bh + 1, 10, bh - 2);
    box(ctx, bx + 8, fy - bh * 0.5, bw * 0.34, bh * 0.28, P.white, { r: 1, band: 0, lw: 1.4 });
    disc(ctx, bx + bw - 12, fy - bh + 10, 4, P.red);
  } else if (kind === 2) {
    // a blue tin
    const bw = w * 0.6, bh = h * 0.44, bx = x + (w - bw) / 2;
    box(ctx, bx, fy - bh, bw, bh, P.blue, { r: 4, band: 5, lw: 2 });
    box(ctx, bx - 3, fy - bh - 8, bw + 6, 10, P.blueLight, { r: 3, band: 2, lw: 1.8 });
    flower(ctx, bx + bw / 2, fy - bh / 2, P.white, 0.8);
  } else if (kind === 3) {
    // a stack of forms
    for (let i = 0; i < 5; i++) box(ctx, x + 10 + jit(seed, i) * 3, fy - 7 - i * 7, w - 20, 7, i % 2 ? P.white : P.cream, { r: 1, band: 0, lw: 1.3, seed: seed + i });
  } else if (kind === 4) {
    // rolled papers tied with string
    for (let i = 0; i < 3; i++) {
      const ry = fy - 9 - i * 15 + (i === 2 ? 2 : 0), rx = x + 10 + (i === 2 ? 10 : 0);
      inked(ctx, () => boxPath(ctx, rx, ry - 8, w - 26, 16, 7, seed + i, 0.2), P.white, { band: 3, lw: 1.6 });
      ell(ctx, rx + w - 26, ry, 4, 7, P.cream, { band: 1, lw: 1.4 });
    }
    seg(ctx, [[x + w / 2, fy - 2], [x + w / 2, fy - 44]], P.red, 2);
  } else if (kind === 5) {
    // two small parcels
    inked(ctx, () => boxPath(ctx, x + 8, fy - 34, 42, 34, 3, seed, 0.4), P.kraftTop, { band: 4, lw: 1.8 });
    inked(ctx, () => boxPath(ctx, x + 30, fy - 56, 32, 24, 3, seed + 1, 0.4), P.kraft, { band: 4, lw: 1.8 });
    seg(ctx, [[x + 46, fy - 56], [x + 46, fy - 32]], P.red, 3);
  }
}

/** The pigeonhole shelf behind the counter, 3 × 4 cubbies. */
function pigeonholes(ctx: Ctx, x: number, y: number, w: number, h: number) {
  const wood = '#9C6E46';
  contactShadow(ctx, x + w / 2, y + h + 4, w * 0.5, 8, 0.2);
  ctx.fillStyle = alpha(INK, 0.18);
  ctx.fillRect(x + 8, y + 10, w, h);
  box(ctx, x, y, w, h, wood, { r: 4, band: 8, lw: 2.6, seed: 31 });
  const cols = 3, rows = 4, t = 9;
  const cw = (w - t * (cols + 1)) / cols, ch = (h - t * (rows + 1)) / rows;
  const kinds = [0, 1, 3, 2, 0, 4, 5, 3, 1, 0, 2, 0];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = x + t + c * (cw + t), cy = y + t + r * (ch + t);
      // the inside of the cubby, darker at the back and top
      ctx.fillStyle = shade(wood, 0.42);
      ctx.fillRect(cx, cy, cw, ch);
      ctx.fillStyle = alpha(shade(wood, 0.2), 0.9);
      ctx.fillRect(cx + 5, cy + 6, cw - 5, ch - 6);
      cubby(ctx, cx, cy, cw, ch, kinds[r * cols + c], r * 3 + c + 40);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.6;
      ctx.strokeRect(cx, cy, cw, ch);
    }
  }
  // a brass label plate on each row
  for (let r = 0; r < rows; r++) {
    const ly = y + t + r * (ch + t) + ch + 1;
    box(ctx, x + w / 2 - 16, ly, 32, 7, P.gold, { r: 1, band: 0, lw: 1.2, seed: r });
  }
}

/** The HQ wall clock's case and face; the hands are drawn live (`clockHands`). */
function wallClock(ctx: Ctx, x: number, y: number, r: number) {
  ctx.fillStyle = alpha(INK, 0.18);
  ctx.beginPath();
  ctx.arc(x + 6, y + 8, r + 12, 0, TAU);
  ctx.fill();
  ell(ctx, x, y, r + 12, r + 12, P.woodDeep, { band: 6, lw: 2.6 });
  ell(ctx, x, y, r, r, P.white, { band: 5, lw: 2 });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU, big = i % 3 === 0;
    const r0 = r - (big ? 13 : 8), r1 = r - 4;
    seg(ctx, [[x + Math.cos(a) * r0, y + Math.sin(a) * r0], [x + Math.cos(a) * r1, y + Math.sin(a) * r1]], INK, big ? 3 : 1.8);
  }
  // a little frog on the face
  const fy = y - r * 0.42;
  ell(ctx, x, fy + 2, 10, 7, P.frog, { band: 2, lw: 1.4 });
  for (const s of [-1, 1]) {
    ell(ctx, x + s * 5, fy - 4, 3.6, 3.6, P.frog, { band: 0, lw: 1.2 });
    disc(ctx, x + s * 5, fy - 4, 1.4, INK);
  }
}

/** The clock's hands for the time `d`, centred on (x, y). */
export function clockHands(ctx: Ctx, x: number, y: number, r: number, d: Date) {
  const m = d.getMinutes() + d.getSeconds() / 60, hr = (d.getHours() % 12) + m / 60;
  const hand = (a: number, len: number, w: number) => {
    a = a * TAU - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(x - Math.cos(a) * 6, y - Math.sin(a) * 6);
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.strokeStyle = INK;
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
    ctx.stroke();
  };
  hand(hr / 12, r * 0.5, 5);
  hand(m / 60, r * 0.76, 3.4);
  const sa = (d.getSeconds() / 60) * TAU - Math.PI / 2;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + Math.cos(sa) * r * 0.8, y + Math.sin(sa) * r * 0.8);
  ctx.strokeStyle = P.red;
  ctx.lineWidth = 1.6;
  ctx.stroke();
  disc(ctx, x, y, 5, P.gold);
  ctx.beginPath();
  ctx.arc(x, y, 5, 0, TAU);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

/** A tied-back curtain hanging from the rod at (x, top) to `bottom`; `d` = 1 hangs to the right of x. */
function curtain(ctx: Ctx, x: number, top: number, bottom: number, d: number, color: string) {
  const tie = top + (bottom - top) * 0.58;
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x + d * 74, top);
    ctx.quadraticCurveTo(x + d * 40, tie - 60, x + d * 18, tie);
    ctx.quadraticCurveTo(x + d * 30, tie + 60, x + d * 46, bottom);
    ctx.lineTo(x - d * 4, bottom);
    ctx.closePath();
  };
  inked(ctx, path, color, { band: 12, lw: 2.4 });
  ctx.save();
  path();
  ctx.clip();
  // polka dots and the folds
  for (let i = 0; i < 40; i++) {
    const px = x + d * (6 + (i % 5) * 16 + (Math.floor(i / 5) % 2) * 8), py = top + 14 + Math.floor(i / 5) * ((bottom - top) / 8);
    disc(ctx, px, py, 3.4, alpha(P.white, 0.85));
  }
  ctx.strokeStyle = alpha(shade(color, 0.35), 0.6);
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (const f of [0.3, 0.6]) {
    ctx.moveTo(x + d * 74 * f, top + 4);
    ctx.quadraticCurveTo(x + d * (40 * f + 4), tie - 30, x + d * 16, tie);
    ctx.moveTo(x + d * 16, tie + 4);
    ctx.quadraticCurveTo(x + d * 24 * (1 + f), tie + 60, x + d * 46 * f, bottom);
  }
  ctx.stroke();
  ctx.restore();
  // the tie-back
  inked(ctx, () => boxPath(ctx, x + d * 8 - 12, tie - 7, 24 + d * 6, 14, 6, 3, 0.3), P.gold, { band: 3, lw: 2 });
}

/** A framed map of the river on the wall, with the route dotted along it. */
function riverMap(ctx: Ctx, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = alpha(INK, 0.16);
  ctx.fillRect(x + 6, y + 8, w, h);
  box(ctx, x, y, w, h, P.woodDeep, { r: 3, band: 5, lw: 2.4, seed: 51 });
  const b = 12;
  box(ctx, x + b, y + b, w - b * 2, h - b * 2, '#F1E3C2', { r: 1, band: 4, lw: 1.6, seed: 52 });
  ctx.save();
  ctx.beginPath();
  ctx.rect(x + b, y + b, w - b * 2, h - b * 2);
  ctx.clip();
  // banks and the river winding down the map
  ctx.fillStyle = alpha(P.lilyLight, 0.6);
  blobEllipse(ctx, x + w * 0.25, y + h * 0.3, w * 0.22, h * 0.18, 4, 0.1);
  ctx.fill();
  blobEllipse(ctx, x + w * 0.78, y + h * 0.72, w * 0.2, h * 0.16, 5, 0.1);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x + w * 0.6, y);
  ctx.bezierCurveTo(x + w * 0.2, y + h * 0.3, x + w * 0.85, y + h * 0.55, x + w * 0.4, y + h);
  ctx.strokeStyle = P.teal;
  ctx.lineWidth = 16;
  ctx.stroke();
  ctx.strokeStyle = alpha(P.tealDeep, 0.6);
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.setLineDash([5, 6]);
  ctx.beginPath();
  ctx.moveTo(x + w * 0.62, y + 6);
  ctx.bezierCurveTo(x + w * 0.24, y + h * 0.3, x + w * 0.88, y + h * 0.55, x + w * 0.42, y + h - 6);
  ctx.strokeStyle = P.red;
  ctx.lineWidth = 2.4;
  ctx.stroke();
  ctx.setLineDash([]);
  for (const [px, py] of [[0.5, 0.18], [0.56, 0.48], [0.58, 0.78]]) {
    disc(ctx, x + w * px, y + h * py, 5, P.red);
  }
  ctx.restore();
  // pinned at the top
  disc(ctx, x + w / 2, y + 4, 5, P.red);
}

/** A wall calendar with a ring binding and the month's grid. */
function calendar(ctx: Ctx, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = alpha(INK, 0.16);
  ctx.fillRect(x + 5, y + 7, w, h);
  box(ctx, x, y, w, h, P.white, { r: 3, band: 5, lw: 2.2, seed: 61 });
  box(ctx, x, y, w, 34, P.red, { r: 3, band: 4, lw: 2.2, seed: 62 });
  for (let i = 0; i < 4; i++) {
    const rx = x + 16 + i * ((w - 32) / 3);
    ctx.beginPath();
    ctx.arc(rx, y + 2, 5, Math.PI, 0);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.fillStyle = alpha(INK, 0.35);
  for (let r = 0; r < 5; r++) for (let c = 0; c < 6; c++) ctx.fillRect(x + 12 + c * ((w - 24) / 6), y + 48 + r * ((h - 60) / 5), 7, 6);
  // today circled
  ctx.beginPath();
  ctx.ellipse(x + 12 + 3 * ((w - 24) / 6) + 3.5, y + 48 + 2 * ((h - 60) / 5) + 3, 9, 8, 0, 0, TAU);
  ctx.strokeStyle = P.red;
  ctx.lineWidth = 2;
  ctx.stroke();
  disc(ctx, x + w / 2, y - 8, 4, '#9C998F');
  seg(ctx, [[x + 14, y + 2], [x + w / 2, y - 8], [x + w - 14, y + 2]], INK, 1.6);
}

/**
 * The HQ office behind the counter (750 × 900 and 300 more of wall above, origin top left): sprig wallpaper, the river map and a
 * calendar up high, the pigeonhole shelf on the left, the wall clock, and the window with its curtains.
 * The sign hangs live in front (woodSign) and the counter is its own sprite.
 */
export function hqRoom(ctx: Ctx, tod: Tod) {
  const wall = tod.name === 'night' ? '#E6D6B4' : '#F1E4C4';
  // the wall runs on above the room's top for tall screens
  wallpaper(ctx, 0, -300, 750, 1200, wall, 'sprig');
  // a picture rail high up and a dado rail lower down
  box(ctx, -10, 118, 770, 12, P.woodLight, { r: 2, band: 3, lw: 2, seed: 71 });
  ctx.fillStyle = alpha(INK, 0.12);
  ctx.fillRect(0, 130, 750, 5);
  riverMap(ctx, 44, 170, 150, 168);
  calendar(ctx, 586, 188, 118, 136);
  pigeonholes(ctx, 16, 476, 266, 380);
  wallClock(ctx, HQ_CLOCK.x, HQ_CLOCK.y, HQ_CLOCK.r);
  // the window: four panes with the hour outside, a sill, curtains from a rod
  const wx = 494, wy = 496, ww = 226, wh = 330;
  const sp = [P.woodLight];
  ctx.fillStyle = alpha(INK, 0.16);
  ctx.fillRect(wx - 6, wy - 4, ww + 24, wh + 14);
  box(ctx, wx - 14, wy - 14, ww + 28, wh + 28, sp[0], { r: 4, band: 6, lw: 2.6, seed: 72 });
  ctx.save();
  ctx.beginPath();
  ctx.rect(wx, wy, ww, wh);
  ctx.clip();
  view(ctx, wx, wy, ww, wh, tod);
  ctx.restore();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.strokeRect(wx, wy, ww, wh);
  ctx.fillStyle = P.woodLight;
  ctx.fillRect(wx + ww / 2 - 5, wy, 10, wh);
  ctx.fillRect(wx, wy + wh * 0.45 - 5, ww, 10);
  ctx.strokeRect(wx + ww / 2 - 5, wy, 10, wh);
  ctx.strokeRect(wx, wy + wh * 0.45 - 5, ww, 10);
  if (!tod.stars) {
    seg(ctx, [[wx + 16, wy + 70], [wx + 44, wy + 36]], alpha(P.white, 0.7), 3);
    seg(ctx, [[wx + ww / 2 + 16, wy + wh * 0.45 + 60], [wx + ww / 2 + 40, wy + wh * 0.45 + 30]], alpha(P.white, 0.6), 3);
  }
  // rod and curtains
  seg(ctx, [[wx - 34, wy - 26], [wx + ww + 34, wy - 26]], INK, 7);
  seg(ctx, [[wx - 34, wy - 26], [wx + ww + 34, wy - 26]], P.woodDeep, 4);
  for (const ex of [wx - 36, wx + ww + 36]) disc(ctx, ex, wy - 26, 7, P.gold);
  curtain(ctx, wx - 24, wy - 24, wy + wh + 10, 1, P.red);
  curtain(ctx, wx + ww + 24, wy - 24, wy + wh + 10, -1, P.red);
  ctx.save();
  ctx.translate(0, -300);
  roomLight(ctx, tod, 750, 1200, [375, 900]);
  ctx.restore();
}

/** The HQ counter (origin at its left end, top surface at y 0): a long top, panelled front, letters, a plant, the ink pad. */
export function hqCounter(ctx: Ctx) {
  const wood = '#C79A6B';
  // front, with recessed panels
  box(ctx, -14, 4, 778, 166, shade(wood, 0.06), { r: 2, band: 10, lw: 2.6, seed: 81 });
  for (let i = 0; i < 4; i++) {
    const px = 18 + i * 186;
    box(ctx, px, 30, 158, 110, shade(wood, 0.14), { r: 4, band: 8, lw: 1.8, seed: 82 + i });
    grain(ctx, px + 8, 36, 142, 98, shade(wood, 0.35), 20);
  }
  // the top, with its front edge catching the light
  box(ctx, -14, -12, 778, 20, P.woodLight, { r: 4, band: 5, lw: 2.6, seed: 86 });
  ctx.fillStyle = alpha(INK, 0.22);
  ctx.fillRect(-14, 9, 778, 6);
  // a stack of letters tied with string
  for (let i = 0; i < 5; i++) box(ctx, 206 + jit(9, i) * 3, -20 - i * 8, 64, 8, i % 2 ? P.white : P.cream, { r: 1, band: 0, lw: 1.4, seed: i + 87 });
  seg(ctx, [[238, -10], [238, -54]], P.red, 2);
  // a potted plant
  contactShadow(ctx, 318, -10, 24, 4, 0.2);
  inked(ctx, () => polyPath(ctx, [[298, -48], [338, -48], [332, -10], [304, -10]], 88, 0.3, 3), P.orangeDeep, { band: 5, lw: 2 });
  box(ctx, 294, -54, 48, 10, P.orange, { r: 3, band: 2, lw: 1.8, seed: 89 });
  for (const [lx, ly, a] of [[-14, -72, -0.6], [12, -76, 0.5], [0, -86, 0], [-22, -60, -1], [22, -62, 1]] as const) {
    ctx.save();
    ctx.translate(318 + lx, ly);
    ctx.rotate(a);
    inked(ctx, () => {
      ctx.beginPath();
      ctx.ellipse(0, 0, 8, 17, 0, 0, TAU);
    }, P.lily, { band: 3, lw: 1.6 });
    ctx.restore();
  }
  // the ink pad and a rubber stamp
  box(ctx, 650, -24, 74, 16, P.blue, { r: 4, band: 3, lw: 2, seed: 90 });
  box(ctx, 656, -30, 62, 8, P.red, { r: 3, band: 2, lw: 1.6, seed: 91 });
  box(ctx, 590, -26, 28, 16, P.red, { r: 2, band: 2, lw: 1.8, seed: 92 });
  box(ctx, 598, -52, 12, 28, P.woodDeep, { r: 3, band: 2, lw: 1.8, seed: 93 });
  ell(ctx, 604, -56, 11, 8, P.wood, { band: 3, lw: 1.8 });
}

// ---------------------------------------------------------------- the shop

type Goods = (ctx: Ctx, x: number, y: number, seed: number) => number;

/** A glass jar of sweets with a cloth lid tied on: returns its width. */
const jar = (fill: string, lid: string): Goods => (ctx, x, y, seed) => {
  const w = 46 + (seed % 3) * 4, h = 52 + (seed % 2) * 10;
  const body = () => boxPath(ctx, x, y - h, w, h, 10, seed, 0.3);
  // the sweets, then the glass over them
  ctx.save();
  body();
  ctx.clip();
  ctx.fillStyle = tint(P.tealLight, 0.5);
  ctx.fillRect(x, y - h, w, h);
  for (let i = 0; i < 14; i++) {
    const cx = x + 7 + ((i * 13 + seed * 5) % (w - 12)), cy = y - 6 - (i % 4) * 9 - jit01(seed, i) * 4;
    disc(ctx, cx, cy, 5.2, i % 3 ? fill : tint(fill, 0.4));
    ctx.beginPath();
    ctx.arc(cx, cy, 5.2, 0, TAU);
    ctx.strokeStyle = alpha(shade(fill, 0.4), 0.7);
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.restore();
  inked(ctx, body, alpha(P.white, 0.18), { band: 4, lw: 2, light: 0.8 });
  seg(ctx, [[x + 8, y - h + 14], [x + 8, y - 16]], alpha(P.white, 0.75), 3);
  // cloth lid and string
  inked(ctx, () => polyPath(ctx, [[x - 4, y - h + 2], [x + w / 2, y - h - 12], [x + w + 4, y - h + 2], [x + w - 2, y - h + 10], [x + 2, y - h + 10]], seed + 3, 0.5, 4), lid, { band: 3, lw: 1.8 });
  ctx.save();
  ctx.globalAlpha = 0.5;
  for (let i = 0; i < 4; i++) disc(ctx, x + 6 + i * (w / 4), y - h + 2, 2, P.white);
  ctx.restore();
  seg(ctx, [[x + 1, y - h + 8], [x + w - 1, y - h + 8]], INK, 1.6);
  // a paper label
  box(ctx, x + w / 2 - 12, y - h * 0.55, 24, 16, P.cream, { r: 2, band: 0, lw: 1.3, seed: seed + 5 });
  return w;
};

/** A round tin with a flower printed on: returns its width. */
const tin = (color: string): Goods => (ctx, x, y, seed) => {
  const w = 52, h = 40;
  box(ctx, x, y - h, w, h, color, { r: 4, band: 6, lw: 2, seed });
  box(ctx, x - 3, y - h - 10, w + 6, 12, shade(color, 0.12), { r: 4, band: 2, lw: 1.8, seed: seed + 1 });
  flower(ctx, x + w / 2, y - h / 2, P.white, 0.9);
  return w;
};

/** A stoppered bottle: returns its width. */
const bottle = (color: string): Goods => (ctx, x, y, seed) => {
  const w = 30, h = 74;
  inked(ctx, () => {
    ctx.beginPath();
    ctx.moveTo(x + 10, y - h + 10);
    ctx.lineTo(x + 10, y - h * 0.62);
    ctx.quadraticCurveTo(x, y - h * 0.55, x, y - h * 0.4);
    ctx.lineTo(x, y - 3);
    ctx.quadraticCurveTo(x, y, x + 4, y);
    ctx.lineTo(x + w - 4, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y - 3);
    ctx.lineTo(x + w, y - h * 0.4);
    ctx.quadraticCurveTo(x + w, y - h * 0.55, x + w - 10, y - h * 0.62);
    ctx.lineTo(x + w - 10, y - h + 10);
    ctx.closePath();
  }, color, { band: 5, lw: 2 });
  box(ctx, x + 8, y - h, 14, 12, P.woodLight, { r: 2, band: 2, lw: 1.6, seed });
  box(ctx, x + 4, y - h * 0.34, w - 8, 16, P.cream, { r: 1, band: 0, lw: 1.3, seed: seed + 2 });
  seg(ctx, [[x + 6, y - h * 0.4], [x + 6, y - 8]], alpha(P.white, 0.6), 2.4);
  return w;
};

/** Folded scarves in a pile: returns its width. */
const scarves: Goods = (ctx, x, y, seed) => {
  const cols = [P.red, P.gold, P.tealDeep, P.pink];
  for (let i = 0; i < 4; i++) {
    const yy = y - 12 - i * 12;
    box(ctx, x + jit(seed, i) * 3, yy, 66, 13, cols[i], { r: 5, band: 3, lw: 1.7, seed: seed + i });
    if (i === 1) for (let k = 0; k < 4; k++) disc(ctx, x + 10 + k * 15, yy + 6.5, 2, alpha(P.white, 0.8));
  }
  return 68;
};

/** A straw hat on a little stand: returns its width. */
const hatStand: Goods = (ctx, x, y, seed) => {
  box(ctx, x + 32, y - 40, 8, 40, P.woodDeep, { r: 2, band: 2, lw: 1.6, seed });
  box(ctx, x + 18, y - 6, 36, 8, P.woodDeep, { r: 2, band: 2, lw: 1.6, seed: seed + 1 });
  ell(ctx, x + 36, y - 44, 40, 10, '#E6C77D', { band: 3, lw: 2 });
  inked(ctx, () => {
    ctx.beginPath();
    ctx.moveTo(x + 16, y - 46);
    ctx.quadraticCurveTo(x + 18, y - 74, x + 36, y - 74);
    ctx.quadraticCurveTo(x + 54, y - 74, x + 56, y - 46);
    ctx.closePath();
  }, '#E6C77D', { band: 4, lw: 2 });
  seg(ctx, [[x + 17, y - 52], [x + 55, y - 52]], P.red, 5);
  return 76;
};

/** A potted succulent: returns its width. */
const succulent: Goods = (ctx, x, y, seed) => {
  inked(ctx, () => polyPath(ctx, [[x + 2, y - 28], [x + 38, y - 28], [x + 33, y], [x + 7, y]], seed, 0.3, 3), P.orangeDeep, { band: 4, lw: 1.8 });
  for (const [lx, a, l] of [[20, 0, 22], [12, -0.7, 18], [28, 0.7, 18], [6, -1.2, 14], [34, 1.2, 14]] as const) {
    ctx.save();
    ctx.translate(x + lx, y - 30);
    ctx.rotate(a);
    inked(ctx, () => {
      ctx.beginPath();
      ctx.ellipse(0, -l / 2, 6, l / 2, 0, 0, TAU);
    }, P.lilyLight, { band: 3, lw: 1.5 });
    ctx.restore();
  }
  return 40;
};

/** A shelf board on two brackets across the wall at y (its top surface). */
function shelfBoard(ctx: Ctx, y: number) {
  ctx.fillStyle = alpha(INK, 0.2);
  ctx.fillRect(0, y + 14, 750, 10);
  for (const bx of [70, 375, 680]) {
    inked(ctx, () => polyPath(ctx, [[bx - 6, y + 12], [bx + 6, y + 12], [bx + 6, y + 44], [bx - 6, y + 22]], bx, 0.2, 2), P.woodDeep, { band: 3, lw: 1.8 });
  }
  box(ctx, -10, y, 770, 16, P.woodLight, { r: 3, band: 4, lw: 2.2, seed: Math.round(y) });
}

/**
 * The shop's back wall (origin at the top of the shop window, y0): planks, a bunting garland, and two
 * shelves of goods at y 128 and 238. Bounds [0, -220, 750, 420].
 */
export function shopBack(ctx: Ctx) {
  boards(ctx, 0, -220, 750, 640, '#C3925F', 58, 11);
  // the wall is darker toward the top
  const g = ctx.createLinearGradient(0, -220, 0, 120);
  g.addColorStop(0, alpha(INK, 0.3));
  g.addColorStop(1, alpha(INK, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, -220, 750, 340);
  // bunting
  ctx.beginPath();
  ctx.moveTo(-10, 2);
  ctx.quadraticCurveTo(375, 46, 760, 2);
  stroke(ctx, INK, 2);
  const flags = [P.red, P.gold, P.tealDeep, P.pink, P.lily, P.orange, P.blueLight];
  for (let i = 0; i < 15; i++) {
    const t = (i + 0.5) / 15, fx = -10 + 770 * t, fy = 2 + 2 * t * (1 - t) * 44;
    inked(ctx, () => {
      ctx.beginPath();
      ctx.moveTo(fx - 18, fy - 1);
      ctx.lineTo(fx + 18, fy + 1);
      ctx.lineTo(fx + 1, fy + 32);
      ctx.closePath();
    }, flags[i % flags.length], { band: 4, lw: 1.8 });
  }
  // two shelves of goods
  const top: Goods[] = [jar(P.gold, P.red), tin(P.tealDeep), jar(P.pink, P.lily), bottle(P.blueLight), jar(P.lily, P.gold), hatStand, jar(P.red, P.blue), tin(P.orange), jar(P.blueLight, P.pink), bottle(P.lilyLight), succulent];
  const low: Goods[] = [scarves, jar(P.orange, P.tealDeep), tin(P.red), jar(P.lilyLight, P.red), bottle(P.pink), jar(P.gold, P.blue), tin(P.blue), succulent, jar(P.pink, P.gold), bottle(P.teal), jar(P.tealDeep, P.orange)];
  for (const [y, row, x0] of [[128, top, 220], [238, low, 26]] as const) {
    let x = x0;
    row.forEach((f, i) => {
      if (x > 720) return;
      x += f(ctx, x, y, i * 7 + y) + 14 + (i % 3) * 3;
    });
    shelfBoard(ctx, y);
  }
}

/** The shop counter (origin at its left end, top surface at y 0) with the till on the right and a jar of lollipops. Bounds [0, -96, 750, 150]. */
export function shopCounter(ctx: Ctx) {
  const wood = '#B98457';
  box(ctx, -12, 6, 774, 150, wood, { r: 2, band: 10, lw: 2.6, seed: 101 });
  boards(ctx, 0, 14, 750, 136, wood, 62, 13);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.6;
  ctx.strokeRect(-12, 6, 774, 150);
  box(ctx, -12, -10, 774, 20, P.woodLight, { r: 4, band: 5, lw: 2.6, seed: 102 });
  ctx.fillStyle = alpha(INK, 0.22);
  ctx.fillRect(0, 11, 750, 6);
  // the till
  const tx = 640;
  box(ctx, tx, -60, 92, 52, P.blue, { r: 6, band: 6, lw: 2.2, seed: 103 });
  inked(ctx, () => polyPath(ctx, [[tx + 10, -60], [tx + 82, -60], [tx + 74, -92], [tx + 18, -92]], 104, 0.3, 3), P.blueLight, { band: 4, lw: 2 });
  box(ctx, tx + 26, -88, 40, 18, P.tealLight, { r: 2, band: 0, lw: 1.6, seed: 105 });
  for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) box(ctx, tx + 12 + c * 18, -50 + r * 14, 12, 9, P.cream, { r: 2, band: 0, lw: 1.2, seed: 106 + r * 4 + c });
  box(ctx, tx - 4, -14, 100, 8, shade(P.blue, 0.2), { r: 2, band: 0, lw: 1.8, seed: 115 });
  // a jar of lollipops
  const jx = 404;
  for (const [a, c] of [[-0.35, P.red], [0, P.gold], [0.3, P.pink], [0.15, P.lily]] as const) {
    ctx.save();
    ctx.translate(jx + 22, -36);
    ctx.rotate(a);
    seg(ctx, [[0, 0], [0, -40]], P.white, 3);
    ell(ctx, 0, -46, 11, 11, c, { band: 3, lw: 1.8 });
    ctx.beginPath();
    ctx.arc(0, -46, 5, 0, TAU * 0.75);
    ctx.strokeStyle = alpha(P.white, 0.8);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }
  inked(ctx, () => boxPath(ctx, jx, -44, 44, 36, 8, 116, 0.3), alpha(P.white, 0.35), { band: 3, lw: 2, light: 0.8 });
  // a little bell
  ell(ctx, 300, -12, 22, 5, P.woodDeep, { band: 2, lw: 1.6 });
  inked(ctx, () => {
    ctx.beginPath();
    ctx.moveTo(284, -14);
    ctx.quadraticCurveTo(286, -42, 300, -42);
    ctx.quadraticCurveTo(314, -42, 316, -14);
    ctx.closePath();
  }, P.gold, { band: 4, lw: 1.8 });
  disc(ctx, 300, -45, 4, P.gold);
}

/** The gift box handed over the counter: kraft paper, a red ribbon, a bow. Bounds [-56, -111, 56, 0]. */
export function giftBox(ctx: Ctx) {
  contactShadow(ctx, 0, -2, 48, 6, 0.24);
  inked(ctx, () => boxPath(ctx, -46, -66, 92, 64, 4, 121, 0.4), P.kraft, { band: 9, hatch: [-46, -66, 92, 64] });
  inked(ctx, () => boxPath(ctx, -52, -80, 104, 20, 4, 122, 0.4), P.kraftTop, { band: 5 });
  ctx.fillStyle = P.red;
  ctx.fillRect(-8, -79, 16, 76);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.8;
  ctx.strokeRect(-8, -79, 16, 76);
  for (const d of [-1, 1]) {
    inked(ctx, () => {
      ctx.beginPath();
      ctx.moveTo(0, -84);
      ctx.bezierCurveTo(d * 18, -112, d * 46, -104, d * 30, -86);
      ctx.quadraticCurveTo(d * 18, -78, 0, -84);
      ctx.closePath();
    }, P.red, { band: 4, lw: 2 });
    inked(ctx, () => polyPath(ctx, [[0, -82], [d * 10, -58], [d * 18, -64], [d * 4, -84]], 123 + d, 0.2, 2), shade(P.red, 0.1), { band: 2, lw: 1.6 });
  }
  ell(ctx, 0, -84, 8, 7, shade(P.red, 0.08), { band: 2, lw: 1.8 });
  box(ctx, 16, -48, 24, 18, P.white, { r: 2, band: 0, lw: 1.4, seed: 124 });
  starPath(ctx, 28, -39, 5);
  ctx.fillStyle = P.gold;
  ctx.fill();
}

// ---------------------------------------------------------------- staff cards

/** Card and lanyard colours for each rank, 实习 to 快递之王. */
const RANK_LOOK: [band: string, strap: string][] = [
  [P.kraft, P.kraftTop], [P.lily, P.lilyDeep], [P.tealDeep, P.teal], [P.blue, P.blueLight],
  [P.gold, P.red], [P.orange, P.gold], [P.red, P.gold],
];

/** The staff card for rank `i` on its lanyard: the frog's photo, the band in the rank's colour, a star per rank. Bounds [-125, -80, 125, 80]. */
export function rankBadge(ctx: Ctx, i: number) {
  const [band, strap] = RANK_LOOK[Math.max(0, Math.min(RANK_LOOK.length - 1, i))];
  // the lanyard rising from the clip
  for (const d of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(d * 10, -44);
    ctx.bezierCurveTo(d * 30, -68, d * 80, -78, d * 116, -60);
    ctx.lineCap = 'round';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 15;
    ctx.stroke();
    ctx.strokeStyle = strap;
    ctx.lineWidth = 10.5;
    ctx.stroke();
    ctx.setLineDash([3, 6]);
    ctx.strokeStyle = alpha(P.white, 0.75);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.setLineDash([]);
  }
  box(ctx, -12, -50, 24, 16, '#B8B4A8', { r: 3, band: 2, lw: 1.8, seed: 131 });
  // the card
  const w = 200, h = 120, x = -100, y = -38;
  ctx.fillStyle = alpha(INK, 0.2);
  ctx.fillRect(x + 5, y + 7, w, h);
  box(ctx, x, y, w, h, P.white, { r: 10, band: 6, lw: 2.4, seed: 132 + i });
  ctx.save();
  boxPath(ctx, x, y, w, h, 10, 132 + i, 0.8);
  ctx.clip();
  ctx.fillStyle = band;
  ctx.fillRect(x, y, w, 30);
  ctx.fillStyle = alpha(shade(band, 0.3), 0.6);
  ctx.fillRect(x, y + 28, w, 3);
  ctx.restore();
  box(ctx, -16, y + 6, 32, 7, P.white, { r: 3, band: 0, lw: 1.4, seed: 133 });
  // the stars for this rank across the band
  for (let s = 0; s < i; s++) {
    starPath(ctx, x + w - 16 - s * 13, y + 16, 5.5);
    ctx.fillStyle = i >= 4 ? P.white : P.gold;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
  // the frog's photo
  const px = x + 14, py = y + 40, pw = 62, ph = 68;
  box(ctx, px, py, pw, ph, P.tealLight, { r: 4, band: 0, lw: 1.8, seed: 134 });
  ctx.save();
  ctx.beginPath();
  ctx.rect(px, py, pw, ph);
  ctx.clip();
  ell(ctx, px + pw / 2, py + ph + 6, 28, 26, P.blue, { band: 3, lw: 1.6 });
  ell(ctx, px + pw / 2, py + ph * 0.62, 24, 18, P.frog, { band: 4, lw: 1.8 });
  for (const d of [-1, 1]) {
    ell(ctx, px + pw / 2 + d * 11, py + ph * 0.4, 8, 8, P.frog, { band: 2, lw: 1.6 });
    disc(ctx, px + pw / 2 + d * 11, py + ph * 0.4, 5, P.white);
    disc(ctx, px + pw / 2 + d * 11, py + ph * 0.41, 2.6, INK);
  }
  ctx.beginPath();
  ctx.arc(px + pw / 2, py + ph * 0.6, 8, 0.2, Math.PI - 0.2);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.6;
  ctx.stroke();
  for (const d of [-1, 1]) disc(ctx, px + pw / 2 + d * 16, py + ph * 0.66, 3.4, alpha(P.pink, 0.8));
  // the cap
  inked(ctx, () => {
    ctx.beginPath();
    ctx.moveTo(px + pw / 2 - 18, py + ph * 0.28);
    ctx.quadraticCurveTo(px + pw / 2, py + 2, px + pw / 2 + 18, py + ph * 0.28);
    ctx.closePath();
  }, P.orange, { band: 2, lw: 1.6 });
  ctx.restore();
  // name lines and a postmark
  ctx.fillStyle = alpha(INK, 0.6);
  ctx.fillRect(x + 90, y + 48, 78, 6);
  ctx.fillStyle = alpha(INK, 0.3);
  ctx.fillRect(x + 90, y + 64, 92, 4);
  ctx.fillRect(x + 90, y + 76, 66, 4);
  ctx.save();
  ctx.translate(x + 150, y + 96);
  ctx.rotate(-0.2);
  ctx.beginPath();
  ctx.arc(0, 0, 15, 0, TAU);
  ctx.strokeStyle = alpha(P.red, 0.75);
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, 10, 0, TAU);
  ctx.stroke();
  starPath(ctx, 0, 0, 5);
  ctx.fillStyle = alpha(P.red, 0.75);
  ctx.fill();
  ctx.restore();
  // the top ranks get a gold seal or a crown
  if (i >= 4) {
    ell(ctx, x + w - 20, y + h - 18, 13, 13, P.gold, { band: 3, lw: 1.8 });
    starPath(ctx, x + w - 20, y + h - 18, 7);
    ctx.fillStyle = P.white;
    ctx.fill();
  }
  if (i === RANK_LOOK.length - 1) {
    inked(ctx, () => polyPath(ctx, [[px + 8, py - 2], [px + 14, py - 18], [px + 24, py - 8], [px + 31, py - 22], [px + 38, py - 8], [px + 48, py - 18], [px + 54, py - 2]], 135, 0.2, 2), P.gold, { band: 3, lw: 1.8 });
  }
}

/** The plain rag rug the room starts with: an oval braided in rings of red, cream and teal. Bounds [-130, -40, 130, 40]. */
export function ragRug(ctx: Ctx) {
  const rings = [P.red, P.cream, P.tealDeep, P.kraftTop, P.orange, P.cream, P.lily];
  ctx.fillStyle = alpha(INK, 0.18);
  ctx.beginPath();
  ctx.ellipse(4, 6, 124, 32, 0, 0, TAU);
  ctx.fill();
  for (let i = 0; i < rings.length; i++) {
    const k = 1 - i / rings.length;
    ctx.beginPath();
    ctx.ellipse(0, 0, 122 * k, 31 * k, 0, 0, TAU);
    ctx.fillStyle = rings[i];
    ctx.fill();
    // the braid: little ticks around each ring
    ctx.save();
    ctx.strokeStyle = alpha(shade(rings[i], 0.3), 0.5);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    const n = Math.round(40 * k) + 6;
    for (let j = 0; j < n; j++) {
      const a = (j / n) * TAU, rx = 122 * k - 4, ry = 31 * k - 2;
      ctx.moveTo(Math.cos(a) * rx - 2, Math.sin(a) * ry - 1);
      ctx.lineTo(Math.cos(a) * rx + 2, Math.sin(a) * ry + 1);
    }
    ctx.stroke();
    ctx.restore();
  }
  ctx.beginPath();
  ctx.ellipse(0, 0, 122, 31, 0, 0, TAU);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.2;
  ctx.stroke();
}
