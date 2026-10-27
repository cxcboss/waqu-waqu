// Scenery pieces every outdoor scene shares, coloured by the time-of-day tokens: sky, sun or moon,
// clouds, rolling hills, grass tufts, water glints, lit windows, lamp glow, stars and fireflies.
// The still ones belong in a baked layer; tufts, glints, clouds and fireflies move a little each frame.
import type { Ctx } from '../../platform/types';
import { P } from '../palette';
import { alpha, shade, tint } from './color';
import { crescentPath } from './icons';
import { inked, jit, jit01, LW, polyPath, puffPath } from './ink';
import type { Tod } from './tod';

/** Sky: a vertical gradient between the hour's two sky colours. */
export function sky(ctx: Ctx, x: number, y: number, w: number, h: number, tod: Tod) {
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, tod.skyTop);
  g.addColorStop(1, tod.skyBot);
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
}

/** The sun (day, morning, dusk) or a crescent moon (night), with a soft halo. */
export function sunMoon(ctx: Ctx, x: number, y: number, r: number, tod: Tod) {
  ctx.save();
  const g = ctx.createRadialGradient(x, y, r * 0.6, x, y, r * 2.6);
  g.addColorStop(0, alpha(tod.halo, 0.75));
  g.addColorStop(1, alpha(tod.halo, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r * 2.6, 0, Math.PI * 2);
  ctx.fill();
  if (tod.stars) crescentPath(ctx, x, y, r, r * 0.55, -r * 0.4, r * 0.85);
  else {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
  }
  ctx.fillStyle = tod.sun;
  ctx.fill();
  ctx.strokeStyle = alpha(P.ink, tod.stars ? 0.25 : 0.3);
  ctx.lineWidth = LW.detail;
  ctx.stroke();
  ctx.restore();
}

/** A storybook cloud: puffy top, flat base, a pale outline. `s` scales it (1 is about 120 wide). */
export function cloud(ctx: Ctx, x: number, y: number, s: number, tod: Tod, seed = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  const path = () => puffPath(ctx, 0, 0, 56, 22, 6, seed, 0.75);
  path();
  ctx.fillStyle = tod.cloud;
  ctx.globalAlpha = tod.stars ? 0.7 : 0.95;
  ctx.fill();
  // a shade along the base
  ctx.save();
  ctx.clip();
  ctx.fillStyle = shade(tod.cloud, 0.08);
  ctx.fillRect(-70, 6, 140, 30);
  ctx.restore();
  if (tod.cloudInk > 0) {
    ctx.globalAlpha = tod.cloudInk;
    ctx.strokeStyle = P.ink;
    ctx.lineWidth = 2 / s;
    ctx.lineJoin = 'round';
    path();
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * A row of rolling hills from x to x+w, their tops around `y`, filled down to `bottom`. Seeded, so the
 * same seed is the same skyline.
 */
export function hills(ctx: Ctx, x: number, w: number, y: number, bottom: number, amp: number, color: string, seed = 1, ink = 0.35) {
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(x, bottom);
    ctx.lineTo(x, y + jit(seed, 0) * 6);
    let px = x, i = 1;
    while (px < x + w) {
      const nx = px + 90 + jit01(seed, i) * 110;
      ctx.quadraticCurveTo((px + nx) / 2, y - amp * (0.55 + jit01(seed, i + 50)), nx, y + jit(seed, i + 100) * 8);
      px = nx;
      i++;
    }
    ctx.lineTo(px, bottom);
    ctx.closePath();
  };
  path();
  ctx.fillStyle = color;
  ctx.fill();
  // lighter crests where the light catches
  ctx.save();
  ctx.clip();
  ctx.translate(3, 7);
  ctx.strokeStyle = tint(color, 0.25);
  ctx.globalAlpha = 0.6;
  ctx.lineWidth = 8;
  path();
  ctx.stroke();
  ctx.restore();
  if (ink > 0) {
    ctx.save();
    ctx.globalAlpha = ink;
    ctx.strokeStyle = P.ink;
    ctx.lineWidth = 2.2;
    ctx.lineJoin = 'round';
    path();
    ctx.stroke();
    ctx.restore();
  }
}

/** A tuft of three grass blades swaying in the breeze: an ink under-stroke and a colour stroke on top. */
export function tuft(ctx: Ctx, x: number, y: number, t: number, s = 1, color: string = P.lily) {
  ctx.save();
  ctx.lineCap = 'round';
  for (let pass = 0; pass < 2; pass++) {
    ctx.beginPath();
    for (const [dx, h, b] of BLADES) {
      const sw = Math.sin(t * 1.8 + x * 0.05 + dx) * 3 * s;
      ctx.moveTo(x + dx * s, y);
      ctx.quadraticCurveTo(x + (dx + b * 0.4) * s, y - h * 0.6 * s, x + (dx + b) * s + sw, y - h * s);
    }
    ctx.lineWidth = (pass ? 3 : 5.4) * s;
    ctx.strokeStyle = pass ? color : alpha(P.ink, 0.55);
    ctx.stroke();
  }
  ctx.restore();
}
const BLADES = [[-6, 22, -6], [0, 30, 2], [7, 20, 7]] as const;

/** White dashes drifting along a stroke path (call with the water's centre-line path built). */
export function glints(ctx: Ctx, path: () => void, t: number, tod: Tod, width = 3) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = tod.glint;
  ctx.globalAlpha = 0.85;
  path();
  ctx.setLineDash([16, 38]);
  ctx.lineDashOffset = -t * 30;
  ctx.lineWidth = width;
  ctx.stroke();
  ctx.setLineDash([4, 60]);
  ctx.lineDashOffset = -t * 18 + 20;
  ctx.lineWidth = width * 1.6;
  ctx.stroke();
  ctx.restore();
}

/** A window pane: glass in the hour's colour, glowing at dusk and night, a cross bar, a glint by day. */
export function windowPane(ctx: Ctx, x: number, y: number, w: number, h: number, tod: Tod, seed = 1) {
  if (tod.lit > 0) {
    ctx.save();
    const g = ctx.createRadialGradient(x + w / 2, y + h / 2, 2, x + w / 2, y + h / 2, Math.max(w, h) * 1.1);
    g.addColorStop(0, alpha(tod.windowGlow, 0.55 * tod.lit));
    g.addColorStop(1, alpha(tod.windowGlow, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - w * 0.7, y - h * 0.7, w * 2.4, h * 2.4);
    ctx.restore();
  }
  const glass = tod.lit > 0.5 ? tod.windowGlow : tod.lit > 0 ? tint(tod.windowGlow, 0.35) : tod.window;
  const path = () => polyPath(ctx, [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], seed, 0.5, 3);
  inked(ctx, path, glass, { band: 5, lw: 2.4 });
  ctx.save();
  ctx.strokeStyle = P.ink;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + w / 2, y + 1);
  ctx.lineTo(x + w / 2, y + h - 1);
  ctx.moveTo(x + 1, y + h / 2);
  ctx.lineTo(x + w - 1, y + h / 2);
  ctx.stroke();
  if (tod.lit < 0.5) {
    ctx.strokeStyle = alpha(P.white, 0.8);
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.14, y + h * 0.36);
    ctx.lineTo(x + w * 0.3, y + h * 0.14);
    ctx.stroke();
  }
  ctx.restore();
}

/** Warm glow around a lamp, breathing slowly; nothing in full daylight. */
export function lampGlow(ctx: Ctx, x: number, y: number, r: number, tod: Tod, t = 0) {
  if (tod.lit <= 0) return;
  const k = tod.lit * (0.9 + Math.sin(t * 2.2) * 0.1);
  ctx.save();
  const g = ctx.createRadialGradient(x, y, r * 0.1, x, y, r);
  g.addColorStop(0, alpha(tod.lampGlow, 0.7 * k));
  g.addColorStop(0.4, alpha(tod.lampGlow, 0.25 * k));
  g.addColorStop(1, alpha(tod.lampGlow, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.restore();
}

/** Twinkling stars over a box (night only). */
export function stars(ctx: Ctx, x: number, y: number, w: number, h: number, t: number, n = 40, seed = 3) {
  ctx.save();
  ctx.fillStyle = '#FFF4C8';
  for (let i = 0; i < n; i++) {
    const sx = x + jit01(seed, i) * w, sy = y + jit01(seed, i + 500) * h;
    const r = 1 + jit01(seed, i + 900) * 1.8;
    ctx.globalAlpha = 0.45 + 0.45 * Math.sin(t * (1.2 + jit01(seed, i + 77)) + i);
    if (r > 2.4) {
      // the brighter ones are little four-point stars
      ctx.beginPath();
      ctx.moveTo(sx, sy - r * 2);
      ctx.quadraticCurveTo(sx, sy, sx + r * 2, sy);
      ctx.quadraticCurveTo(sx, sy, sx, sy + r * 2);
      ctx.quadraticCurveTo(sx, sy, sx - r * 2, sy);
      ctx.quadraticCurveTo(sx, sy, sx, sy - r * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** Fireflies drifting over a box (night only). */
export function fireflies(ctx: Ctx, x: number, y: number, w: number, h: number, t: number, n = 8) {
  ctx.save();
  for (let i = 0; i < n; i++) {
    const fx = x + (Math.sin(t * 0.37 + i * 1.7) * 0.5 + 0.5) * w;
    const fy = y + (Math.sin(t * 0.53 + i * 2.3) * 0.5 + 0.5) * h;
    const a = 0.5 + 0.5 * Math.sin(t * 3.1 + i * 1.3);
    ctx.globalAlpha = a * 0.35;
    ctx.fillStyle = '#FFE69A';
    ctx.beginPath();
    ctx.arc(fx, fy, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = a;
    ctx.beginPath();
    ctx.arc(fx, fy, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
