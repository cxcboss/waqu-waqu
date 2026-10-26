// The icon set: small pictograms in two colours plus ink, drawn on a 48x48 grid centred on the origin
// and readable down to 44 design units (about 22 CSS px). Each is baked once per size and colour, then
// copied. `icon(ctx, 'parcel', x, y, 44)` draws one centred on (x, y).
import type { Ctx } from '../../platform/types';
import { P } from '../palette';
import { drawBaked } from './canvas';
import { faded, shade, tint } from './color';
import { inked, LW } from './ink';

export type IconName =
  | 'coin' | 'star' | 'stamp' | 'parcel' | 'truck' | 'house' | 'map' | 'bag' | 'shoe' | 'fin' | 'hat' | 'scarf'
  | 'sofa' | 'frame' | 'logbook' | 'album' | 'camera' | 'trophy' | 'newspaper' | 'letter' | 'mailbox' | 'wardrobe'
  | 'chart' | 'clipboard' | 'speaker' | 'mute' | 'music' | 'musicOff' | 'pause' | 'play' | 'close' | 'back'
  | 'lock' | 'check' | 'gift' | 'sun' | 'moon' | 'rain' | 'leaf' | 'snowflake' | 'sparkle' | 'gear'
  | 'bolt' | 'flower' | 'drop' | 'buoy' | 'calendar' | 'shield' | 'umbrella' | 'heart';

export interface IconOpts {
  /** Main and accent colour (each icon has its own defaults). */
  color?: string;
  accent?: string;
  ink?: string;
  /** Washed-out grey: locked, not owned yet. */
  faded?: boolean;
  alpha?: number;
}

/** What an icon's drawing gets: the context, its two colours, ink, and the line width on the 48 grid. */
export interface Glyph {
  ctx: Ctx;
  c: string;
  a: string;
  ink: string;
  /** Contour width in grid units. */
  L: number;
  /** Whether this is the faded (locked) look, and the colour map that makes it. */
  faded: boolean;
  col(c: string): string;
}

const TAU = Math.PI * 2;

// ---------------------------------------------------------------- drawing helpers (48 grid)

/** Fill with the kit's recipe and an ink contour. */
export function fi(g: Glyph, path: () => void, fill: string, band = 3.5) {
  inked(g.ctx, path, g.col(fill), { lw: g.L, band, ink: g.ink });
}

/** A flat fill with an ink contour, no shading (small parts). */
export function ff(g: Glyph, path: () => void, fill: string, lw = g.L) {
  const ctx = g.ctx;
  path();
  ctx.fillStyle = g.col(fill);
  ctx.fill();
  if (lw > 0) {
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = g.ink;
    ctx.lineWidth = lw;
    ctx.stroke();
  }
}

/** A stroke with an ink edge on both sides (ticks, straps, waves): ink underneath, colour on top. */
export function sk(g: Glyph, path: () => void, color: string, w: number) {
  const ctx = g.ctx;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  path();
  ctx.strokeStyle = g.ink;
  ctx.lineWidth = w + g.L * 2;
  ctx.stroke();
  ctx.strokeStyle = g.col(color);
  ctx.lineWidth = w;
  ctx.stroke();
}

/** A plain stroke (ink by default) for details. */
export function ln(g: Glyph, path: () => void, w = g.L, color?: string, a = 1) {
  const ctx = g.ctx;
  ctx.save();
  ctx.globalAlpha *= a;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  path();
  ctx.strokeStyle = color ? g.col(color) : g.ink;
  ctx.lineWidth = w;
  ctx.stroke();
  ctx.restore();
}

export const rr = (ctx: Ctx, x: number, y: number, w: number, h: number, r: number) => {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};
const circ = (ctx: Ctx, x: number, y: number, r: number) => {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
};
const poly = (ctx: Ctx, pts: number[]) => {
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
};
/** A five-point star path. */
export const starPath = (ctx: Ctx, x: number, y: number, R: number, r: number) => {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, k = i % 2 ? r : R;
    if (i) ctx.lineTo(x + Math.cos(a) * k, y + Math.sin(a) * k);
    else ctx.moveTo(x + Math.cos(a) * k, y + Math.sin(a) * k);
  }
  ctx.closePath();
};
/** A four-point twinkle. */
export const twinkle = (ctx: Ctx, x: number, y: number, r: number, k = 0.22) => {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x + r * k, y - r * k, x + r, y);
  ctx.quadraticCurveTo(x + r * k, y + r * k, x, y + r);
  ctx.quadraticCurveTo(x - r * k, y + r * k, x - r, y);
  ctx.quadraticCurveTo(x - r * k, y - r * k, x, y - r);
  ctx.closePath();
};
/** An arc of the circle (cx, cy, r) from angle a0 to a1, going the way that passes angle `via`. */
function arcVia(ctx: Ctx, cx: number, cy: number, r: number, a0: number, a1: number, via: number) {
  const norm = (a: number) => ((a % TAU) + TAU) % TAU;
  const span = norm(a1 - a0), at = norm(via - a0);
  ctx.arc(cx, cy, r, a0, a1, !(at <= span));
}
/** A crescent: the disc (x, y, R) with the disc (x + dx, y + dy, r) bitten out of it. */
export function crescentPath(ctx: Ctx, x: number, y: number, R: number, dx: number, dy: number, r: number) {
  const d = Math.hypot(dx, dy), ux = dx / d, uy = dy / d;
  const a = (R * R - r * r + d * d) / (2 * d), h = Math.sqrt(Math.max(0, R * R - a * a));
  const mx = x + ux * a, my = y + uy * a;
  const p1x = mx - uy * h, p1y = my + ux * h, p2x = mx + uy * h, p2y = my - ux * h;
  const away = Math.atan2(-uy, -ux);
  ctx.beginPath();
  arcVia(ctx, x, y, R, Math.atan2(p1y - y, p1x - x), Math.atan2(p2y - y, p2x - x), away);
  arcVia(ctx, x + dx, y + dy, r, Math.atan2(p2y - y - dy, p2x - x - dx), Math.atan2(p1y - y - dy, p1x - x - dx), away);
  ctx.closePath();
}
/** A tick. */
export const tickPath = (ctx: Ctx, x: number, y: number, s: number) => {
  ctx.beginPath();
  ctx.moveTo(x - 9 * s, y);
  ctx.lineTo(x - 3 * s, y + 6.5 * s);
  ctx.lineTo(x + 10 * s, y - 8 * s);
};
/** A parcel in 3/4 view, front face [x, y, w, h], top and side `d` deep. */
export function parcelAt(g: Glyph, x: number, y: number, w: number, h: number, d: number, tape: string = P.orange) {
  const ctx = g.ctx;
  const kr = P.kraft;
  ff(g, () => poly(ctx, [x + w, y, x + w + d, y - d * 0.7, x + w + d, y + h - d * 0.7, x + w, y + h]), shade(kr, 0.16));
  ff(g, () => poly(ctx, [x, y, x + d, y - d * 0.7, x + w + d, y - d * 0.7, x + w, y]), P.kraftTop);
  fi(g, () => poly(ctx, [x, y, x + w, y, x + w, y + h, x, y + h]), kr, Math.max(2.5, w * 0.12));
  // tape over the lid and down the front
  ctx.save();
  ctx.globalAlpha = 0.9;
  const tx = x + w * 0.5;
  ctx.fillStyle = g.col(tape);
  poly(ctx, [tx - w * 0.09, y, tx + w * 0.09, y, tx + w * 0.09 + d, y - d * 0.7, tx - w * 0.09 + d, y - d * 0.7]);
  ctx.fill();
  ctx.fillRect(tx - w * 0.09, y, w * 0.18, h * 0.42);
  ctx.restore();
  ln(g, () => {
    ctx.beginPath();
    ctx.rect(x, y, w, h);
  }, g.L);
}

// ---------------------------------------------------------------- the icons

type Draw = (g: Glyph) => void;
const D: Record<IconName, [Draw, string, string]> = {} as Record<IconName, [Draw, string, string]>;
const icon_ = (name: IconName, color: string, accent: string, draw: Draw) => (D[name] = [draw, color, accent]);

icon_('coin', P.gold, P.frog, (g) => {
  const ctx = g.ctx;
  fi(g, () => circ(ctx, 0, 0, 20), g.c, 4);
  ff(g, () => circ(ctx, 0, 0, 14.5), tint(g.c, 0.3), g.L * 0.7);
  // the frog on the coin
  ff(g, () => {
    ctx.beginPath();
    ctx.ellipse(0, 3.5, 9, 6, 0, 0, TAU);
  }, g.a, g.L * 0.7);
  ff(g, () => circ(ctx, -4.6, -2.4, 3.4), g.a, g.L * 0.7);
  ff(g, () => circ(ctx, 4.6, -2.4, 3.4), g.a, g.L * 0.7);
  ctx.fillStyle = g.ink;
  circ(ctx, -4.4, -2.6, 1.3);
  ctx.fill();
  circ(ctx, 4.8, -2.6, 1.3);
  ctx.fill();
  ln(g, () => {
    ctx.beginPath();
    ctx.arc(0, 3.6, 3.6, 0.3, Math.PI - 0.3);
  }, 1.4);
});

icon_('star', P.gold, P.orange, (g) => {
  fi(g, () => starPath(g.ctx, 0, 1.5, 22, 10), g.c, 4.5);
});

icon_('stamp', P.red, P.wood, (g) => {
  const ctx = g.ctx;
  fi(g, () => rr(ctx, -4.5, -12, 9, 11, 2), g.a, 2);
  fi(g, () => circ(ctx, 0, -15, 7.5), g.a, 3);
  fi(g, () => poly(ctx, [-14, -2, 14, -2, 17, 9, -17, 9]), g.c, 3);
  ff(g, () => rr(ctx, -19, 9, 38, 7, 2), shade(g.c, 0.3));
  // the print it leaves
  ln(g, () => {
    ctx.beginPath();
    ctx.moveTo(-14, 21);
    ctx.lineTo(14, 21);
  }, 2.2, g.c, 0.7);
});

icon_('parcel', P.kraft, P.orange, (g) => parcelAt(g, -19, -5, 27, 23, 11, g.a));

icon_('truck', P.blue, P.kraft, (g) => {
  const ctx = g.ctx;
  fi(g, () => rr(ctx, -22, -15, 28, 23, 3), g.a, 3);
  ln(g, () => {
    ctx.beginPath();
    for (const x of [-13, -4]) {
      ctx.moveTo(x, -13);
      ctx.lineTo(x, 6);
    }
  }, 1.4, undefined, 0.5);
  fi(g, () => poly(ctx, [6, -9, 15, -9, 22, 0, 22, 8, 6, 8]), g.c, 3);
  ff(g, () => poly(ctx, [9, -6, 14, -6, 18, -0.5, 9, -0.5]), tint(g.c, 0.6), g.L * 0.8);
  ff(g, () => rr(ctx, -22, 7, 44, 4, 1.5), shade(g.c, 0.3));
  for (const x of [-12, 12]) {
    ff(g, () => circ(ctx, x, 13, 5.8), '#3A3A3A');
    ff(g, () => circ(ctx, x, 13, 2.2), P.silver, 0);
  }
});

icon_('house', P.orange, P.blue, (g) => {
  const ctx = g.ctx;
  fi(g, () => rr(ctx, 8, -19, 6, 11, 1), P.woodLight, 2);
  fi(g, () => poly(ctx, [-15, -4, 15, -4, 15, 20, -15, 20]), P.cream, 3);
  fi(g, () => poly(ctx, [-22, -2, 0, -21, 22, -2]), g.c, 4);
  fi(g, () => {
    ctx.beginPath();
    ctx.moveTo(-10, 20);
    ctx.lineTo(-10, 9);
    ctx.arc(-4, 9, 6, Math.PI, 0);
    ctx.lineTo(2, 20);
    ctx.closePath();
  }, g.a, 2.5);
  ff(g, () => rr(ctx, 6, 3, 7, 7, 1), tint(g.a, 0.6), g.L * 0.8);
});

icon_('map', P.tealLight, P.red, (g) => {
  const ctx = g.ctx;
  ff(g, () => poly(ctx, [-21, -15, -7, -19, 7, -15, 21, -19, 21, 16, 7, 20, -7, 16, -21, 20]), g.c);
  ctx.save();
  ctx.fillStyle = g.col(shade(g.c, 0.12));
  poly(ctx, [-7, -19, 7, -15, 7, 20, -7, 16]);
  ctx.fill();
  ctx.restore();
  ln(g, () => {
    ctx.beginPath();
    ctx.moveTo(-7, -19);
    ctx.lineTo(-7, 16);
    ctx.moveTo(7, -15);
    ctx.lineTo(7, 20);
  }, g.L * 0.8);
  ln(g, () => poly(ctx, [-21, -15, -7, -19, 7, -15, 21, -19, 21, 16, 7, 20, -7, 16, -21, 20]));
  ctx.save();
  ctx.setLineDash([3.5, 3.5]);
  ln(g, () => {
    ctx.beginPath();
    ctx.moveTo(-16, 12);
    ctx.bezierCurveTo(-8, 2, 0, 14, 12, -4);
  }, 2.2, g.a);
  ctx.restore();
  fi(g, () => {
    ctx.beginPath();
    ctx.moveTo(13, -1);
    ctx.bezierCurveTo(7, -7, 7, -15, 13, -15);
    ctx.bezierCurveTo(19, -15, 19, -7, 13, -1);
    ctx.closePath();
  }, g.a, 2);
  ff(g, () => circ(ctx, 13, -10.5, 2), P.white, 0);
});

icon_('bag', P.lily, P.kraft, (g) => {
  const ctx = g.ctx;
  sk(g, () => {
    ctx.beginPath();
    ctx.moveTo(-14, -4);
    ctx.bezierCurveTo(-14, -26, 14, -26, 14, -4);
  }, g.a, 3.6);
  fi(g, () => rr(ctx, -20, -6, 40, 25, 6), g.c, 4);
  fi(g, () => {
    ctx.beginPath();
    ctx.moveTo(-20, -2);
    ctx.quadraticCurveTo(-20, -6, -15, -6);
    ctx.lineTo(15, -6);
    ctx.quadraticCurveTo(20, -6, 20, -2);
    ctx.lineTo(20, 4);
    ctx.quadraticCurveTo(20, 9, 14, 9);
    ctx.lineTo(-14, 9);
    ctx.quadraticCurveTo(-20, 9, -20, 4);
    ctx.closePath();
  }, g.a, 3);
  ff(g, () => rr(ctx, -3.5, 5, 7, 7, 1.5), P.gold, g.L * 0.8);
});

icon_('shoe', P.orange, P.cream, (g) => {
  const ctx = g.ctx;
  // spring under the sole
  ln(g, () => {
    ctx.beginPath();
    ctx.moveTo(-8, 10);
    for (let i = 0; i < 4; i++) {
      ctx.lineTo(8, 12 + i * 2.6);
      ctx.lineTo(-8, 13.3 + i * 2.6);
    }
  }, 2.2, P.silver);
  ln(g, () => {
    ctx.beginPath();
    ctx.moveTo(-8, 10);
    for (let i = 0; i < 4; i++) {
      ctx.lineTo(8, 12 + i * 2.6);
      ctx.lineTo(-8, 13.3 + i * 2.6);
    }
  }, 0.9);
  ff(g, () => rr(ctx, -12, 21, 24, 3.5, 1.5), P.silver);
  fi(g, () => {
    ctx.beginPath();
    ctx.moveTo(-19, 4);
    ctx.lineTo(-19, -12);
    ctx.quadraticCurveTo(-19, -17, -14, -17);
    ctx.lineTo(-6, -17);
    ctx.quadraticCurveTo(-5, -9, 4, -7);
    ctx.lineTo(13, -4);
    ctx.quadraticCurveTo(22, -1, 22, 4);
    ctx.closePath();
  }, g.c, 4);
  fi(g, () => rr(ctx, -20, 3, 43, 7, 3), g.a, 2);
  ln(g, () => {
    ctx.beginPath();
    ctx.moveTo(-6, -11);
    ctx.lineTo(-1, -12.5);
    ctx.moveTo(-3, -7);
    ctx.lineTo(2, -8.5);
  }, 1.8, P.white);
});

icon_('fin', P.teal, P.orange, (g) => {
  const ctx = g.ctx;
  // a flipper from the side: the foot pocket on the left, the long blade fanning out to the right
  fi(g, () => {
    ctx.beginPath();
    ctx.moveTo(-9, -6);
    ctx.bezierCurveTo(2, -9, 13, -15, 23, -20);
    ctx.quadraticCurveTo(18, -4, 24, 12);
    ctx.bezierCurveTo(13, 9, 2, 8, -9, 9);
    ctx.closePath();
  }, g.c, 4);
  ln(g, () => {
    ctx.beginPath();
    ctx.moveTo(-5, -3);
    ctx.quadraticCurveTo(8, -6, 20, -14);
    ctx.moveTo(-5, 5);
    ctx.quadraticCurveTo(8, 5, 20, 8);
  }, 1.8, shade(g.c, 0.35));
  fi(g, () => {
    ctx.beginPath();
    ctx.moveTo(-6, -9);
    ctx.lineTo(-6, 12);
    ctx.lineTo(-17, 12);
    ctx.quadraticCurveTo(-24, 12, -24, 5);
    ctx.lineTo(-24, -1);
    ctx.quadraticCurveTo(-24, -9, -16, -9);
    ctx.closePath();
  }, shade(g.c, 0.22), 3);
  fi(g, () => rr(ctx, -17, -12, 6, 26, 2.5), g.a, 1.5);
});

icon_('hat', '#EBCB7E', P.red, (g) => {
  const ctx = g.ctx;
  fi(g, () => {
    ctx.beginPath();
    ctx.ellipse(0, 9, 23, 8, 0, 0, TAU);
  }, g.c, 3);
  fi(g, () => {
    ctx.beginPath();
    ctx.moveTo(-13, 9);
    ctx.bezierCurveTo(-14, -16, 14, -16, 13, 9);
    ctx.quadraticCurveTo(0, 13, -13, 9);
    ctx.closePath();
  }, g.c, 3.5);
  fi(g, () => {
    ctx.beginPath();
    ctx.moveTo(-13.4, 1);
    ctx.quadraticCurveTo(0, 5, 13.4, 1);
    ctx.lineTo(13, 8.5);
    ctx.quadraticCurveTo(0, 12.5, -13, 8.5);
    ctx.closePath();
  }, g.a, 2);
  // the weave
  ln(g, () => {
    ctx.beginPath();
    ctx.moveTo(-6, -8);
    ctx.lineTo(-4, -2);
    ctx.moveTo(2, -10);
    ctx.lineTo(3, -3);
    ctx.moveTo(-18, 12);
    ctx.lineTo(-14, 13);
    ctx.moveTo(16, 12);
    ctx.lineTo(19, 11);
  }, 1.2, shade(g.c, 0.35));
  fi(g, () => {
    ctx.beginPath();
    ctx.ellipse(10, 4.5, 4, 3, -0.5, 0, TAU);
  }, g.a, 1.5);
});

icon_('scarf', P.red, P.cream, (g) => {
  const ctx = g.ctx;
  fi(g, () => poly(ctx, [11, -6, 20, -8, 21, 15, 12, 17]), shade(g.c, 0.1), 3);
  fi(g, () => {
    ctx.beginPath();
    ctx.moveTo(-21, -13);
    ctx.quadraticCurveTo(0, -3, 21, -13);
    ctx.lineTo(21, -3);
    ctx.quadraticCurveTo(0, 7, -21, -3);
    ctx.closePath();
  }, g.c, 3);
  fi(g, () => poly(ctx, [3, -2, 13, -4, 15, 19, 5, 20]), g.c, 3);
  ctx.save();
  ctx.fillStyle = g.col(g.a);
  poly(ctx, [3.6, 5, 13.6, 3.5, 13.9, 7.5, 3.9, 9]);
  ctx.fill();
  poly(ctx, [4.2, 12, 14.2, 10.5, 14.5, 14, 4.5, 15.5]);
  ctx.fill();
  ctx.restore();
  ln(g, () => {
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      ctx.moveTo(6 + i * 2.8, 20 - i * 0.3);
      ctx.lineTo(6 + i * 2.8, 23.5 - i * 0.3);
    }
  }, 1.6);
});

icon_('sofa', P.orange, P.cream, (g) => {
  const ctx = g.ctx;
  fi(g, () => rr(ctx, -17, -15, 34, 22, 7), g.c, 3.5);
  fi(g, () => rr(ctx, -14, 2, 28, 10, 3), g.a, 2.5);
  fi(g, () => rr(ctx, -23, -4, 10, 19, 4.5), shade(g.c, 0.06), 3);
  fi(g, () => rr(ctx, 13, -4, 10, 19, 4.5), shade(g.c, 0.06), 3);
  ff(g, () => rr(ctx, -15, 14, 30, 4, 1.5), shade(g.c, 0.3));
  ln(g, () => {
    ctx.beginPath();
    ctx.moveTo(-17, 18);
    ctx.lineTo(-18, 22);
    ctx.moveTo(17, 18);
    ctx.lineTo(18, 22);
  }, g.L * 1.2);
  ln(g, () => {
    ctx.beginPath();
    ctx.moveTo(0, -12);
    ctx.lineTo(0, 1);
  }, 1.3, undefined, 0.5);
});

icon_('frame', P.gold, P.tealLight, (g) => {
  const ctx = g.ctx;
  ln(g, () => {
    ctx.beginPath();
    ctx.moveTo(-9, -15);
    ctx.lineTo(0, -23);
    ctx.lineTo(9, -15);
  }, 1.6);
  fi(g, () => rr(ctx, -21, -16, 42, 34, 3), g.c, 3.5);
  ff(g, () => rr(ctx, -14, -9, 28, 20, 1), g.a, g.L * 0.8);
  ctx.save();
  rr(ctx, -14, -9, 28, 20, 1);
  ctx.clip();
  ctx.fillStyle = g.col(P.lily);
  ctx.beginPath();
  ctx.moveTo(-15, 12);
  ctx.lineTo(-5, 1);
  ctx.lineTo(1, 6);
  ctx.lineTo(7, 0);
  ctx.lineTo(15, 8);
  ctx.lineTo(15, 12);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = g.col(P.white);
  circ(ctx, 7, -3.5, 3);
  ctx.fill();
  ctx.restore();
  ln(g, () => rr(ctx, -14, -9, 28, 20, 1), g.L * 0.8);
  ff(g, () => circ(ctx, 0, -23, 1.8), P.silver, g.L * 0.6);
});

icon_('logbook', P.white, P.blue, (g) => {
  const ctx = g.ctx;
  fi(g, () => {
    ctx.beginPath();
    ctx.moveTo(-23, -12);
    ctx.lineTo(0, -10);
    ctx.lineTo(23, -12);
    ctx.lineTo(23, 17);
    ctx.lineTo(0, 19);
    ctx.lineTo(-23, 17);
    ctx.closePath();
  }, g.a, 3);
  for (const s of [-1, 1]) {
    fi(g, () => {
      ctx.beginPath();
      ctx.moveTo(0, -11);
      ctx.quadraticCurveTo(s * 10, -17, s * 21, -15);
      ctx.lineTo(s * 21, 14);
      ctx.quadraticCurveTo(s * 10, 12, 0, 17);
      ctx.closePath();
    }, g.c, 2.5);
    ln(g, () => {
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const y = -8 + i * 5.5;
        ctx.moveTo(s * 5, y - 1);
        ctx.quadraticCurveTo(s * 11, y - 3.5, s * 17, y - 2.5);
      }
    }, 1.3, undefined, 0.45);
  }
  fi(g, () => poly(ctx, [-2.5, 15, 2.5, 15, 2.5, 24, 0, 21.5, -2.5, 24]), P.red, 1.5);
});

icon_('album', P.lilyDeep, P.gold, (g) => {
  const ctx = g.ctx;
  fi(g, () => rr(ctx, -16, -21, 35, 42, 4), shade(g.c, 0.15), 3);
  fi(g, () => rr(ctx, -19, -21, 35, 42, 4), g.c, 4);
  ff(g, () => rr(ctx, -19, -21, 6, 42, 3), shade(g.c, 0.25));
  ctx.save();
  ctx.translate(2, -1);
  ctx.rotate(-0.08);
  ff(g, () => rr(ctx, -10, -11, 20, 18, 1), P.white, g.L * 0.8);
  ctx.save();
  rr(ctx, -7, -8, 14, 10, 0.5);
  ctx.clip();
  ctx.fillStyle = g.col(P.tealLight);
  ctx.fillRect(-7, -8, 14, 10);
  ctx.fillStyle = g.col(g.a);
  circ(ctx, 3, -4, 2.6);
  ctx.fill();
  ctx.fillStyle = g.col(P.lily);
  poly(ctx, [-8, 3, -2, -3, 3, 1, 8, -2, 8, 3]);
  ctx.fill();
  ctx.restore();
  ctx.restore();
  ln(g, () => {
    ctx.beginPath();
    ctx.moveTo(-8, 15);
    ctx.lineTo(10, 15);
  }, 1.6, P.white, 0.8);
});

icon_('camera', P.blue, P.cream, (g) => {
  const ctx = g.ctx;
  fi(g, () => rr(ctx, -9, -17, 18, 9, 3), shade(g.c, 0.1), 2);
  fi(g, () => rr(ctx, -22, -11, 44, 29, 5), g.c, 4);
  ff(g, () => rr(ctx, -22, -3, 44, 4, 0), shade(g.c, 0.25), 0);
  ff(g, () => circ(ctx, 0, 3, 11.5), g.a);
  ff(g, () => circ(ctx, 0, 3, 7), shade(g.c, 0.35));
  ff(g, () => circ(ctx, -2.4, 0.6, 2.2), P.white, 0);
  ff(g, () => rr(ctx, 13, -8, 6, 4, 1), P.gold, g.L * 0.7);
});

icon_('trophy', P.gold, P.wood, (g) => {
  const ctx = g.ctx;
  for (const s of [-1, 1]) {
    sk(g, () => {
      ctx.beginPath();
      ctx.moveTo(s * 13, -14);
      ctx.bezierCurveTo(s * 23, -14, s * 22, 2, s * 9, 2);
    }, g.c, 3);
  }
  fi(g, () => {
    ctx.beginPath();
    ctx.moveTo(-14, -19);
    ctx.lineTo(14, -19);
    ctx.lineTo(14, -9);
    ctx.bezierCurveTo(14, 4, 6, 8, 0, 8);
    ctx.bezierCurveTo(-6, 8, -14, 4, -14, -9);
    ctx.closePath();
  }, g.c, 4.5);
  fi(g, () => rr(ctx, -3, 7, 6, 6, 0.5), g.c, 1.5);
  fi(g, () => rr(ctx, -12, 12, 24, 9, 2.5), g.a, 2.5);
  ff(g, () => starPath(ctx, 0, -7, 6, 2.8), tint(g.c, 0.6), g.L * 0.6);
});

icon_('newspaper', P.white, P.red, (g) => {
  const ctx = g.ctx;
  ctx.save();
  ctx.rotate(0.08);
  fi(g, () => rr(ctx, -15, -20, 34, 40, 2), shade(g.c, 0.08), 2);
  ctx.restore();
  fi(g, () => rr(ctx, -20, -18, 35, 39, 2), g.c, 3);
  ff(g, () => rr(ctx, -16, -14, 27, 7, 1), g.a, g.L * 0.7);
  ff(g, () => rr(ctx, -16, -3, 11, 11, 1), tint(g.a, 0.55), g.L * 0.7);
  ln(g, () => {
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      ctx.moveTo(-2, -1.5 + i * 4.5);
      ctx.lineTo(11, -1.5 + i * 4.5);
    }
    for (let i = 0; i < 2; i++) {
      ctx.moveTo(-16, 12.5 + i * 4.5);
      ctx.lineTo(11, 12.5 + i * 4.5);
    }
  }, 1.5, undefined, 0.6);
});

icon_('letter', P.white, P.red, (g) => {
  const ctx = g.ctx;
  fi(g, () => rr(ctx, -22, -14, 44, 30, 3), g.c, 3);
  ln(g, () => {
    ctx.beginPath();
    ctx.moveTo(-21, 15);
    ctx.lineTo(-5, 2);
    ctx.moveTo(21, 15);
    ctx.lineTo(5, 2);
  }, 1.4, undefined, 0.5);
  ff(g, () => {
    ctx.beginPath();
    ctx.moveTo(-21, -13);
    ctx.lineTo(0, 4);
    ctx.lineTo(21, -13);
    ctx.closePath();
  }, shade(g.c, 0.06));
  ff(g, () => circ(ctx, 0, 4, 6.5), g.a);
  ff(g, () => {
    ctx.beginPath();
    ctx.moveTo(0, 7);
    ctx.bezierCurveTo(-5, 3.5, -2.5, -0.5, 0, 1.8);
    ctx.bezierCurveTo(2.5, -0.5, 5, 3.5, 0, 7);
  }, tint(g.a, 0.55), 0);
});

icon_('mailbox', P.blue, P.red, (g) => {
  const ctx = g.ctx;
  fi(g, () => rr(ctx, -3.5, 8, 7, 16, 1), P.wood, 2);
  // the flag, raised
  ln(g, () => {
    ctx.beginPath();
    ctx.moveTo(15, 4);
    ctx.lineTo(15, -19);
  }, 2.2);
  fi(g, () => poly(ctx, [15, -19, 24, -16, 15, -12]), g.a, 1.5);
  fi(g, () => {
    ctx.beginPath();
    ctx.moveTo(-14, 11);
    ctx.lineTo(-14, -5);
    ctx.arc(0, -5, 14, Math.PI, 0);
    ctx.lineTo(14, 11);
    ctx.closePath();
  }, g.c, 4);
  ff(g, () => rr(ctx, -8, -6, 16, 4, 2), g.ink, 0);
  ln(g, () => {
    ctx.beginPath();
    ctx.moveTo(-14, 4);
    ctx.lineTo(14, 4);
  }, 1.4, undefined, 0.5);
});

icon_('wardrobe', P.wood, P.gold, (g) => {
  const ctx = g.ctx;
  fi(g, () => rr(ctx, -17, -19, 34, 39, 2), g.c, 4);
  fi(g, () => rr(ctx, -20, -23, 40, 6, 2), shade(g.c, 0.12), 2);
  for (const s of [-1, 1]) {
    ff(g, () => rr(ctx, s < 0 ? -13 : 3, -14, 10, 26, 3), tint(g.c, 0.2), g.L * 0.7);
    ff(g, () => circ(ctx, s * 2.6, 0, 1.8), g.a, g.L * 0.6);
  }
  ln(g, () => {
    ctx.beginPath();
    ctx.moveTo(0, -17);
    ctx.lineTo(0, 18);
    ctx.moveTo(-14, 20);
    ctx.lineTo(-14, 23);
    ctx.moveTo(14, 20);
    ctx.lineTo(14, 23);
  }, g.L);
});

icon_('chart', P.teal, P.orange, (g) => {
  const ctx = g.ctx;
  fi(g, () => rr(ctx, -17, 6, 8, 13, 1.5), g.c, 2);
  fi(g, () => rr(ctx, -5, -2, 8, 21, 1.5), g.c, 2);
  fi(g, () => rr(ctx, 7, -10, 8, 29, 1.5), g.a, 2);
  ln(g, () => {
    ctx.beginPath();
    ctx.moveTo(-22, 19.5);
    ctx.lineTo(22, 19.5);
  }, g.L * 1.1);
  sk(g, () => {
    ctx.beginPath();
    ctx.moveTo(-19, -4);
    ctx.lineTo(-9, -11);
    ctx.lineTo(-1, -7);
    ctx.lineTo(12, -19);
  }, P.gold, 2.6);
  fi(g, () => poly(ctx, [8, -21, 17, -23, 15, -14]), P.gold, 1.5);
});

icon_('clipboard', P.woodLight, P.blue, (g) => {
  const ctx = g.ctx;
  fi(g, () => rr(ctx, -17, -19, 34, 41, 5), g.c, 3.5);
  ff(g, () => rr(ctx, -12.5, -12, 25, 29, 2), P.white, g.L * 0.8);
  fi(g, () => rr(ctx, -8, -23, 16, 9, 3), g.a, 2);
  sk(g, () => tickPath(ctx, 0, 3, 0.9), P.lily, 3);
});

/** The speaker shape shared by speaker and mute. */
const speakerBody = (g: Glyph) => {
  const ctx = g.ctx;
  fi(g, () => poly(ctx, [-20, -7, -11, -7, -1, -16, -1, 16, -11, 7, -20, 7]), g.c, 3);
};
icon_('speaker', P.orange, P.ink, (g) => {
  const ctx = g.ctx;
  speakerBody(g);
  ln(g, () => {
    ctx.beginPath();
    ctx.arc(1, 0, 9, -0.75, 0.75);
    ctx.moveTo(1 + Math.cos(-0.85) * 16, Math.sin(-0.85) * 16);
    ctx.arc(1, 0, 16, -0.85, 0.85);
  }, 3.2, g.a);
});
icon_('mute', P.orange, P.red, (g) => {
  const ctx = g.ctx;
  speakerBody(g);
  sk(g, () => {
    ctx.beginPath();
    ctx.moveTo(7, -7);
    ctx.lineTo(20, 7);
    ctx.moveTo(20, -7);
    ctx.lineTo(7, 7);
  }, g.a, 3.2);
});

const notes = (g: Glyph) => {
  const ctx = g.ctx;
  sk(g, () => {
    ctx.beginPath();
    ctx.moveTo(-7, 13);
    ctx.lineTo(-7, -13);
    ctx.lineTo(15, -18);
    ctx.lineTo(15, 8);
  }, g.c, 2.6);
  fi(g, () => poly(ctx, [-7, -13, 15, -18, 15, -11, -7, -6]), g.c, 1.5);
  for (const [x, y] of [[-12, 14], [10, 9]]) {
    fi(g, () => {
      ctx.beginPath();
      ctx.ellipse(x, y, 6.5, 5, -0.4, 0, TAU);
    }, g.c, 2);
  }
};
icon_('music', P.blue, P.red, notes);
icon_('musicOff', P.blue, P.red, (g) => {
  const ctx = g.ctx;
  notes(g);
  sk(g, () => {
    ctx.beginPath();
    ctx.moveTo(-19, -19);
    ctx.lineTo(20, 20);
  }, g.a, 3.4);
});

icon_('pause', P.orange, P.cream, (g) => {
  fi(g, () => rr(g.ctx, -15, -17, 11, 34, 4), g.c, 3);
  fi(g, () => rr(g.ctx, 4, -17, 11, 34, 4), g.c, 3);
});
icon_('play', P.lily, P.cream, (g) => {
  const ctx = g.ctx;
  fi(g, () => {
    ctx.beginPath();
    ctx.moveTo(-11, -16);
    ctx.quadraticCurveTo(-13, -19, -9, -18);
    ctx.lineTo(18, -2.5);
    ctx.quadraticCurveTo(20, 0, 18, 2.5);
    ctx.lineTo(-9, 18);
    ctx.quadraticCurveTo(-13, 19, -11, 16);
    ctx.closePath();
  }, g.c, 4);
});
icon_('close', P.ink, P.cream, (g) => {
  ln(g, () => {
    g.ctx.beginPath();
    g.ctx.moveTo(-12, -12);
    g.ctx.lineTo(12, 12);
    g.ctx.moveTo(12, -12);
    g.ctx.lineTo(-12, 12);
  }, 5.5, g.c);
});
icon_('back', P.ink, P.cream, (g) => {
  ln(g, () => {
    g.ctx.beginPath();
    g.ctx.moveTo(5, -14);
    g.ctx.lineTo(-8, 0);
    g.ctx.lineTo(5, 14);
  }, 5.5, g.c);
});
icon_('check', P.lily, P.white, (g) => sk(g, () => tickPath(g.ctx, 0, 1, 1.45), g.c, 5));

icon_('lock', P.gold, P.silver, (g) => {
  const ctx = g.ctx;
  sk(g, () => {
    ctx.beginPath();
    ctx.moveTo(-9, -2);
    ctx.lineTo(-9, -9);
    ctx.arc(0, -9, 9, Math.PI, 0);
    ctx.lineTo(9, -2);
  }, g.a, 3.4);
  fi(g, () => rr(ctx, -16, -3, 32, 24, 4), g.c, 4);
  ff(g, () => {
    ctx.beginPath();
    ctx.arc(0, 6, 3.4, 0, TAU);
    ctx.moveTo(-1.6, 7);
    ctx.lineTo(-2.4, 14);
    ctx.lineTo(2.4, 14);
    ctx.lineTo(1.6, 7);
    ctx.closePath();
  }, g.ink, 0);
});

icon_('gift', P.red, P.gold, (g) => {
  const ctx = g.ctx;
  for (const s of [-1, 1]) {
    fi(g, () => {
      ctx.beginPath();
      ctx.moveTo(0, -10);
      ctx.bezierCurveTo(s * 4, -22, s * 18, -22, s * 13, -13);
      ctx.quadraticCurveTo(s * 10, -9, 0, -10);
      ctx.closePath();
    }, g.a, 2);
  }
  fi(g, () => rr(ctx, -17, -3, 34, 23, 2), g.c, 4);
  fi(g, () => rr(ctx, -20, -11, 40, 9, 2), tint(g.c, 0.12), 3);
  ff(g, () => rr(ctx, -3.5, -11, 7, 31, 0), g.a);
  ff(g, () => circ(ctx, 0, -11, 3), g.a);
});

icon_('sun', P.gold, P.orange, (g) => {
  const ctx = g.ctx;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    ctx.save();
    ctx.rotate(a);
    fi(g, () => poly(ctx, [-3.6, -15, 0, -23, 3.6, -15]), g.a, 1.5);
    ctx.restore();
  }
  fi(g, () => circ(ctx, 0, 0, 12.5), g.c, 4);
});

icon_('moon', '#F6E3A0', P.gold, (g) => {
  const ctx = g.ctx;
  fi(g, () => crescentPath(ctx, -3, 3, 19, 10, -8, 15.5), g.c, 4);
  fi(g, () => twinkle(ctx, 14, -12, 7), g.a, 1.5);
  fi(g, () => twinkle(ctx, 18, 8, 4), g.a, 1);
});

icon_('rain', P.white, P.blueLight, (g) => {
  const ctx = g.ctx;
  for (const x of [-11, 0, 11]) {
    fi(g, () => {
      ctx.beginPath();
      ctx.moveTo(x - 2, 10);
      ctx.quadraticCurveTo(x - 6, 17, x - 2.5, 20);
      ctx.quadraticCurveTo(x + 1.5, 21, x + 1, 16);
      ctx.closePath();
    }, g.a, 1.5);
  }
  fi(g, () => {
    ctx.beginPath();
    ctx.moveTo(-15, 8);
    ctx.bezierCurveTo(-25, 8, -24, -6, -14, -5);
    ctx.bezierCurveTo(-13, -16, 4, -19, 7, -9);
    ctx.bezierCurveTo(15, -12, 23, -5, 19, 2);
    ctx.bezierCurveTo(23, 6, 19, 8, 15, 8);
    ctx.closePath();
  }, g.c, 4);
});

icon_('leaf', P.lily, P.lilyDeep, (g) => {
  const ctx = g.ctx;
  ln(g, () => {
    ctx.beginPath();
    ctx.moveTo(-6, 6);
    ctx.quadraticCurveTo(-14, 14, -20, 21);
  }, 2.6);
  fi(g, () => {
    ctx.beginPath();
    ctx.moveTo(-10, 10);
    ctx.bezierCurveTo(-16, -6, 0, -20, 20, -20);
    ctx.bezierCurveTo(20, 0, 6, 16, -10, 10);
    ctx.closePath();
  }, g.c, 4);
  ln(g, () => {
    ctx.beginPath();
    ctx.moveTo(-8, 8);
    ctx.quadraticCurveTo(4, -2, 15, -15);
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -9);
    ctx.moveTo(6, -6);
    ctx.lineTo(10, -2);
  }, 1.6, g.a);
});

icon_('snowflake', P.tealLight, P.white, (g) => {
  const ctx = g.ctx;
  sk(g, () => {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU - Math.PI / 2;
      const c = Math.cos(a), s = Math.sin(a);
      ctx.moveTo(0, 0);
      ctx.lineTo(c * 20, s * 20);
      for (const [d, l] of [[9, 6], [15, 4.5]]) {
        for (const t of [-0.7, 0.7]) {
          ctx.moveTo(c * d, s * d);
          ctx.lineTo(c * d + Math.cos(a + t) * l, s * d + Math.sin(a + t) * l);
        }
      }
    }
  }, g.c, 2.6);
});

icon_('sparkle', P.gold, P.tealLight, (g) => {
  const ctx = g.ctx;
  fi(g, () => twinkle(ctx, -3, 2, 19), g.c, 3.5);
  fi(g, () => twinkle(ctx, 14, -14, 8), g.a, 1.5);
  fi(g, () => twinkle(ctx, 15, 14, 5), g.a, 1);
});

icon_('gear', P.silver, P.blueLight, (g) => {
  const ctx = g.ctx;
  const teeth = 8;
  fi(g, () => {
    ctx.beginPath();
    for (let i = 0; i < teeth; i++) {
      const a = (i / teeth) * TAU;
      const w = TAU / teeth;
      const pts = [[a - w * 0.5, 15], [a - w * 0.28, 15], [a - w * 0.18, 21.5], [a + w * 0.18, 21.5], [a + w * 0.28, 15]];
      for (const [aa, r] of pts) {
        if (i === 0 && aa === pts[0][0]) ctx.moveTo(Math.cos(aa) * r, Math.sin(aa) * r);
        else ctx.lineTo(Math.cos(aa) * r, Math.sin(aa) * r);
      }
    }
    ctx.closePath();
    ctx.moveTo(6.5, 0);
    ctx.arc(0, 0, 6.5, 0, TAU, true);
  }, g.c, 4);
  ff(g, () => {
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, TAU);
    ctx.moveTo(6.5, 0);
    ctx.arc(0, 0, 6.5, 0, TAU, true);
  }, g.a, g.L * 0.7);
});

icon_('bolt', P.gold, P.orange, (g) => {
  fi(g, () => poly(g.ctx, [4, -23, -14, 3, -2, 3, -6, 23, 14, -5, 2, -5, 8, -23]), g.c, 4);
});

icon_('flower', P.pink, P.gold, (g) => {
  const ctx = g.ctx;
  for (let i = 0; i < 5; i++) {
    ctx.save();
    ctx.rotate((i / 5) * TAU);
    fi(g, () => {
      ctx.beginPath();
      ctx.moveTo(0, -2);
      ctx.bezierCurveTo(-11, -9, -8, -22, 0, -20);
      ctx.bezierCurveTo(8, -22, 11, -9, 0, -2);
      ctx.closePath();
    }, g.c, 3);
    ctx.restore();
  }
  fi(g, () => circ(ctx, 0, 0, 6.5), g.a, 2);
});

icon_('drop', P.teal, P.white, (g) => {
  const ctx = g.ctx;
  fi(g, () => {
    ctx.beginPath();
    ctx.moveTo(0, -22);
    ctx.bezierCurveTo(6, -12, 16, -2, 16, 7);
    ctx.bezierCurveTo(16, 16, 9, 21, 0, 21);
    ctx.bezierCurveTo(-9, 21, -16, 16, -16, 7);
    ctx.bezierCurveTo(-16, -2, -6, -12, 0, -22);
    ctx.closePath();
  }, g.c, 4.5);
  ln(g, () => {
    ctx.beginPath();
    ctx.arc(0, 7, 10, Math.PI * 0.95, Math.PI * 1.35);
  }, 2.6, g.a, 0.9);
});

icon_('buoy', P.white, P.red, (g) => {
  const ctx = g.ctx;
  const ring = () => {
    ctx.beginPath();
    ctx.arc(0, 0, 20, 0, TAU);
    ctx.moveTo(9, 0);
    ctx.arc(0, 0, 9, 0, TAU, true);
  };
  fi(g, ring, g.c, 4);
  ctx.save();
  ring();
  ctx.clip('evenodd');
  ctx.fillStyle = g.col(g.a);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 22, a - 0.36, a + 0.36);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  ln(g, ring, g.L);
});

icon_('calendar', P.white, P.red, (g) => {
  const ctx = g.ctx;
  fi(g, () => rr(ctx, -19, -15, 38, 36, 4), g.c, 3);
  ctx.save();
  rr(ctx, -19, -15, 38, 36, 4);
  ctx.clip();
  ctx.fillStyle = g.col(g.a);
  ctx.fillRect(-19, -15, 38, 10);
  ctx.restore();
  ln(g, () => rr(ctx, -19, -15, 38, 36, 4));
  ln(g, () => {
    ctx.beginPath();
    ctx.moveTo(-19, -5);
    ctx.lineTo(19, -5);
  }, g.L * 0.8);
  for (const x of [-9, 9]) fi(g, () => rr(ctx, x - 2.4, -21, 4.8, 10, 2.4), P.silver, 1);
  ctx.fillStyle = g.ink;
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
    if (r === 2 && c > 1) continue;
    circ(ctx, -12 + c * 8, 2 + r * 6.5, 1.7);
    ctx.fill();
  }
  sk(g, () => tickPath(ctx, 8.5, 12.5, 0.5), P.lily, 2);
});

icon_('shield', P.teal, P.white, (g) => {
  const ctx = g.ctx;
  fi(g, () => {
    ctx.beginPath();
    ctx.moveTo(0, -22);
    ctx.quadraticCurveTo(10, -16, 19, -16);
    ctx.bezierCurveTo(19, 2, 13, 15, 0, 22);
    ctx.bezierCurveTo(-13, 15, -19, 2, -19, -16);
    ctx.quadraticCurveTo(-10, -16, 0, -22);
    ctx.closePath();
  }, g.c, 4.5);
  sk(g, () => tickPath(ctx, 0, 0, 1), g.a, 3.4);
});

icon_('umbrella', P.blueLight, P.white, (g) => {
  const ctx = g.ctx;
  sk(g, () => {
    ctx.beginPath();
    ctx.moveTo(0, -4);
    ctx.lineTo(0, 15);
    ctx.quadraticCurveTo(0, 21, 5, 21);
    ctx.quadraticCurveTo(9, 21, 9, 17);
  }, P.wood, 2.4);
  fi(g, () => {
    ctx.beginPath();
    ctx.moveTo(-22, -2);
    ctx.bezierCurveTo(-21, -24, 21, -24, 22, -2);
    ctx.quadraticCurveTo(18, -6, 14.6, -2);
    ctx.quadraticCurveTo(11, -6, 7.3, -2);
    ctx.quadraticCurveTo(3.6, -6, 0, -2);
    ctx.quadraticCurveTo(-3.6, -6, -7.3, -2);
    ctx.quadraticCurveTo(-11, -6, -14.6, -2);
    ctx.quadraticCurveTo(-18, -6, -22, -2);
    ctx.closePath();
  }, g.c, 4);
  ln(g, () => {
    ctx.beginPath();
    ctx.moveTo(0, -18);
    ctx.quadraticCurveTo(-5, -10, -7.3, -2);
    ctx.moveTo(0, -18);
    ctx.quadraticCurveTo(5, -10, 7.3, -2);
  }, 1.4, undefined, 0.55);
  ff(g, () => circ(ctx, 0, -19, 1.8), g.a, g.L * 0.6);
});

icon_('heart', P.red, P.pink, (g) => {
  const ctx = g.ctx;
  fi(g, () => {
    ctx.beginPath();
    ctx.moveTo(0, 19);
    ctx.bezierCurveTo(-26, 2, -16, -22, 0, -9);
    ctx.bezierCurveTo(16, -22, 26, 2, 0, 19);
    ctx.closePath();
  }, g.c, 4.5);
});

/** Every icon name, in the order they're defined. */
export const ICON_NAMES = Object.keys(D) as IconName[];

/** A drawing context for glyphs on the 48 grid (also used by the medals for their own glyphs). */
export function glyphOf(ctx: Ctx, color: string, accent: string, o: { ink?: string; faded?: boolean; lw?: number } = {}): Glyph {
  const isFaded = !!o.faded;
  const col = isFaded ? (c: string) => faded(c) : (c: string) => c;
  return { ctx, c: color, a: accent, ink: o.ink ?? (isFaded ? faded(P.ink, 0.55) : P.ink), L: o.lw ?? LW.ui, faded: isFaded, col };
}

/** Draws an icon's glyph on the 48 grid at the current transform (for medals and other composites). */
export function glyph(ctx: Ctx, name: IconName, o: IconOpts & { lw?: number } = {}) {
  const d = D[name];
  const g = glyphOf(ctx, o.color ?? d[1], o.accent ?? d[2], o);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  d[0](g);
  ctx.restore();
}

/** Contour width on the 48 grid that comes out at the kit's weight for an icon `size` units across. */
const gridLw = (size: number) => Math.min(3, Math.max(LW.small, size * 0.05)) * (48 / size);

/**
 * Draws an icon centred on (x, y), `size` design units across (44 is the smallest that reads well on a
 * phone). Baked once per size, colours and state.
 */
export function icon(ctx: Ctx, name: IconName, x: number, y: number, size: number, o: IconOpts = {}) {
  if (!D[name]) return;
  const s = Math.round(size);
  const key = `icon:${name}:${s}:${o.color ?? ''}:${o.accent ?? ''}:${o.ink ?? ''}:${o.faded ? 1 : 0}`;
  const half = s / 2 + 3;
  ctx.save();
  if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha;
  drawBaked(ctx, key, x, y, [-half, -half, half, half], (c) => {
    c.scale(s / 48, s / 48);
    glyph(c, name, { ...o, lw: gridLw(s) });
  }, size / s);
  ctx.restore();
}
