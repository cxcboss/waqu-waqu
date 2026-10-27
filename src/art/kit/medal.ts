// Achievement medals, drawn in code: two ribbon tails, a scalloped rim in bronze, silver or gold, a cream
// face with a stitched ring, and a glyph of its own for every achievement in career.ts. Not earned yet,
// the same medal comes out in washed-out greys with a dashed ring and a faint glyph.
import type { Ctx } from '../../platform/types';
import { P } from '../palette';
import { drawBaked } from './canvas';
import { faded, shade, tint } from './color';
import { inked } from './ink';
import { fi, ff, glyph, glyphOf, ln, parcelAt, sk, starPath, tickPath, twinkle, type Glyph, type IconName } from './icons';

type Tier = 'bronze' | 'silver' | 'gold';
const RIM: Record<Tier, string> = { bronze: '#D69A66', silver: '#C9D3D8', gold: P.gold };

/** A glyph is an icon from the set, or a drawing of the medal's own on the 48 grid. */
type MedalGlyph = IconName | ((g: Glyph) => void);

interface MedalStyle {
  glyph: MedalGlyph;
  tier: Tier;
  /** The two ribbon tails. */
  ribbon: [string, string];
}

// ---------------------------------------------------------------- glyphs only the medals use

const TAU = Math.PI * 2;

const parcelTick = (g: Glyph) => {
  parcelAt(g, -19, -6, 26, 21, 10);
  sk(g, () => tickPath(g.ctx, 10, 11, 0.85), P.lily, 3.6);
};
const parcels2 = (g: Glyph) => {
  parcelAt(g, -19, 2, 25, 18, 9);
  parcelAt(g, -13, -12, 18, 14, 7, P.red);
};
const parcels3 = (g: Glyph) => {
  parcelAt(g, -23, 5, 17, 15, 6);
  parcelAt(g, -3, 5, 17, 15, 6, P.red);
  parcelAt(g, -13, -10, 17, 15, 6, P.tealDeep);
  fi(g, () => twinkle(g.ctx, 16, -15, 7), P.gold, 1.5);
};
const coins = (g: Glyph) => {
  const ctx = g.ctx;
  ctx.save();
  ctx.translate(8, -8);
  ctx.scale(0.62, 0.62);
  glyph(ctx, 'coin', { lw: g.L / 0.62, faded: g.faded });
  ctx.restore();
  ctx.save();
  ctx.translate(-4, 4);
  ctx.scale(0.82, 0.82);
  glyph(ctx, 'coin', { lw: g.L / 0.82, faded: g.faded });
  ctx.restore();
};
const route = (g: Glyph) => {
  const ctx = g.ctx;
  ctx.save();
  ctx.setLineDash([4.5, 4]);
  ln(g, () => {
    ctx.beginPath();
    ctx.moveTo(-15, 18);
    ctx.bezierCurveTo(-2, 18, -12, 2, 1, 2);
    ctx.bezierCurveTo(14, 2, 4, -12, 16, -12);
  }, 3, P.inkSoft);
  ctx.restore();
  for (const [x, y, c] of [[-15, 18, P.red], [1, 2, P.gold], [16, -12, P.tealDeep]] as const) {
    fi(g, () => {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.bezierCurveTo(x - 8.5, y - 8, x - 7.5, y - 17, x, y - 17);
      ctx.bezierCurveTo(x + 7.5, y - 17, x + 8.5, y - 8, x, y);
      ctx.closePath();
    }, c, 2);
    ff(g, () => {
      ctx.beginPath();
      ctx.arc(x, y - 10.5, 2.6, 0, TAU);
    }, P.white, 0);
  }
};
const letterS = (g: Glyph) => {
  const ctx = g.ctx;
  sk(g, () => {
    ctx.beginPath();
    ctx.moveTo(11, -12);
    ctx.bezierCurveTo(5, -21, -15, -18, -12, -7);
    ctx.bezierCurveTo(-10, 0, 11, -1, 12, 8);
    ctx.bezierCurveTo(13, 20, -8, 21, -13, 12);
  }, P.red, 7);
  fi(g, () => twinkle(ctx, 16, -16, 6), P.gold, 1.2);
  fi(g, () => twinkle(ctx, -17, 17, 5), P.gold, 1);
};
const jump = (g: Glyph) => {
  const ctx = g.ctx;
  sk(g, () => {
    ctx.beginPath();
    ctx.moveTo(-22, 18);
    for (let i = 0; i < 6; i++) ctx.quadraticCurveTo(-19 + i * 8, 14 + (i % 2) * 8, -15 + i * 8, 18);
  }, P.teal, 3);
  ctx.save();
  ctx.setLineDash([4.5, 4.5]);
  ln(g, () => {
    ctx.beginPath();
    ctx.moveTo(-19, 11);
    ctx.quadraticCurveTo(-14, -14, -6, -14);
  }, 2.6, P.orangeDeep);
  ln(g, () => {
    ctx.beginPath();
    ctx.moveTo(8, -12);
    ctx.quadraticCurveTo(16, -10, 19, 9);
  }, 2.6, P.orangeDeep);
  ctx.restore();
  fi(g, () => {
    ctx.beginPath();
    ctx.moveTo(23, 13);
    ctx.lineTo(14, 6);
    ctx.lineTo(23, 3);
    ctx.closePath();
  }, P.orange, 1.5);
  // the frog at the top of its jump
  fi(g, () => {
    ctx.beginPath();
    ctx.ellipse(1, -9, 10.5, 7.5, 0, 0, TAU);
  }, P.frog, 2.5);
  for (const x of [-4.5, 6.5]) ff(g, () => {
    ctx.beginPath();
    ctx.arc(x, -16, 4.2, 0, TAU);
  }, P.frog, g.L * 0.8);
  ctx.fillStyle = g.ink;
  for (const x of [-4.5, 6.5]) {
    ctx.beginPath();
    ctx.arc(x + 0.6, -16.3, 1.7, 0, TAU);
    ctx.fill();
  }
  ln(g, () => {
    ctx.beginPath();
    ctx.arc(1, -8.5, 4.5, 0.4, Math.PI - 0.4);
  }, 1.4);
};
const tongue = (g: Glyph) => {
  const ctx = g.ctx;
  sk(g, () => {
    ctx.beginPath();
    ctx.moveTo(-9, -9);
    ctx.bezierCurveTo(4, -6, 14, -2, 9, 8);
  }, P.pink, 4.4);
  parcelAt(g, 1, 6, 15, 12, 5);
  fi(g, () => {
    ctx.beginPath();
    ctx.arc(-14, -10, 10, 0, TAU);
  }, P.frog, 2.5);
  for (const x of [-19, -10]) ff(g, () => {
    ctx.beginPath();
    ctx.arc(x, -18, 4, 0, TAU);
  }, P.frog, g.L * 0.8);
  ctx.fillStyle = g.ink;
  for (const x of [-19, -10]) {
    ctx.beginPath();
    ctx.arc(x + 0.8, -18.4, 1.6, 0, TAU);
    ctx.fill();
  }
};
const swirl = (g: Glyph) => {
  const ctx = g.ctx;
  sk(g, () => {
    ctx.beginPath();
    for (let i = 0; i <= 60; i++) {
      const a = (i / 60) * Math.PI * 4.2;
      const r = 1.5 + i * 0.27;
      const x = Math.cos(a) * r, y = Math.sin(a) * r * 0.9 + 2;
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
  }, P.blueLight, 3);
  fi(g, () => starPath(ctx, 15, -15, 7, 3), P.gold, 1.5);
  fi(g, () => starPath(ctx, -16, -12, 5, 2.3), P.gold, 1);
  fi(g, () => starPath(ctx, 16, 15, 4.5, 2), P.gold, 1);
};
const letters3 = (g: Glyph) => {
  const ctx = g.ctx;
  for (const [x, y, r] of [[-7, -7, -0.3], [7, -7, 0.3], [0, 4, 0]] as const) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(r);
    ctx.scale(0.7, 0.7);
    glyph(ctx, 'letter', { lw: g.L / 0.7, faded: g.faded });
    ctx.restore();
  }
};
const gearUp = (g: Glyph) => {
  const ctx = g.ctx;
  ctx.save();
  ctx.translate(-4, 4);
  ctx.scale(0.8, 0.8);
  glyph(ctx, 'gear', { lw: g.L / 0.8, faded: g.faded, accent: P.blueLight });
  ctx.restore();
  fi(g, () => {
    ctx.beginPath();
    ctx.moveTo(15, -22);
    ctx.lineTo(23, -11);
    ctx.lineTo(18.5, -11);
    ctx.lineTo(18.5, -1);
    ctx.lineTo(11.5, -1);
    ctx.lineTo(11.5, -11);
    ctx.lineTo(7, -11);
    ctx.closePath();
  }, P.orange, 2);
};

/** One style per achievement id in career.ts ACHIEVEMENTS. */
const MEDALS: Record<string, MedalStyle> = {
  first: { glyph: parcelTick, tier: 'bronze', ribbon: [P.orange, P.red] },
  deliver30: { glyph: parcels2, tier: 'silver', ribbon: [P.orange, P.red] },
  deliver100: { glyph: parcels3, tier: 'gold', ribbon: [P.orange, P.red] },
  urgent10: { glyph: 'bolt', tier: 'silver', ribbon: [P.red, P.gold] },
  cod10: { glyph: coins, tier: 'silver', ribbon: [P.gold, P.lilyDeep] },
  trip3: { glyph: route, tier: 'silver', ribbon: [P.tealDeep, P.blue] },
  sgrade: { glyph: letterS, tier: 'gold', ribbon: [P.red, P.gold] },
  clean5: { glyph: 'shield', tier: 'gold', ribbon: [P.lilyDeep, P.tealDeep] },
  spring: { glyph: 'flower', tier: 'gold', ribbon: [P.pink, P.lily] },
  longjump: { glyph: jump, tier: 'gold', ribbon: [P.tealDeep, P.blue] },
  fall1: { glyph: 'drop', tier: 'bronze', ribbon: [P.blueLight, P.teal] },
  fall50: { glyph: 'umbrella', tier: 'silver', ribbon: [P.blueLight, P.teal] },
  rescue1: { glyph: 'buoy', tier: 'bronze', ribbon: [P.red, P.white] },
  rescue30: { glyph: tongue, tier: 'gold', ribbon: [P.pink, P.red] },
  thrown1: { glyph: swirl, tier: 'bronze', ribbon: [P.blueLight, P.pink] },
  letter1: { glyph: 'letter', tier: 'bronze', ribbon: [P.kraft, P.red] },
  letter3: { glyph: letters3, tier: 'silver', ribbon: [P.kraft, P.red] },
  story10: { glyph: 'letter', tier: 'silver', ribbon: [P.tealDeep, P.kraft] },
  story30: { glyph: 'mailbox', tier: 'gold', ribbon: [P.tealDeep, P.kraft] },
  secret: { glyph: 'sparkle', tier: 'gold', ribbon: [P.gold, P.tealDeep] },
  year: { glyph: 'trophy', tier: 'gold', ribbon: [P.red, P.gold] },
  runs10: { glyph: 'calendar', tier: 'silver', ribbon: [P.blue, P.orange] },
  album10: { glyph: 'camera', tier: 'silver', ribbon: [P.blue, P.gold] },
  home1: { glyph: 'house', tier: 'bronze', ribbon: [P.lily, P.orange] },
  hats3: { glyph: 'hat', tier: 'silver', ribbon: [P.red, P.gold] },
  gearmax: { glyph: gearUp, tier: 'gold', ribbon: [P.orange, P.blue] },
};
const FALLBACK: MedalStyle = { glyph: 'star', tier: 'bronze', ribbon: [P.orange, P.red] };

/** Ids that have a medal of their own (anything else gets a plain star medal). */
export const MEDAL_IDS = Object.keys(MEDALS);

/** The medal on its 100x100 box around the origin. */
function drawMedal(ctx: Ctx, st: MedalStyle, earned: boolean, k: number) {
  const col = earned ? (c: string) => c : (c: string) => faded(c);
  const ink = earned ? P.ink : faded(P.ink, 0.55);
  const lw = 2.5 / k;
  // ribbon tails behind the medal
  for (const s of [-1, 1]) {
    ctx.save();
    ctx.translate(s * 7, 0);
    ctx.rotate(s * -0.36);
    const c = col(st.ribbon[s < 0 ? 0 : 1]);
    const tail = () => {
      ctx.beginPath();
      ctx.moveTo(-8, -6);
      ctx.lineTo(8, -6);
      ctx.lineTo(8, 46);
      ctx.lineTo(0, 39);
      ctx.lineTo(-8, 46);
      ctx.closePath();
    };
    inked(ctx, tail, c, { lw, band: 5, ink });
    ctx.fillStyle = col(tint(st.ribbon[s < 0 ? 0 : 1], 0.6));
    ctx.fillRect(-1.6, 18, 3.2, 20);
    ctx.restore();
  }
  // scalloped rim
  const R = 35, cy = -12, lobes = 14;
  const rim = () => {
    ctx.beginPath();
    for (let i = 0; i <= lobes * 8; i++) {
      const a = (i / (lobes * 8)) * TAU;
      const r = R * (1 + 0.065 * Math.cos(a * lobes));
      if (i) ctx.lineTo(Math.cos(a) * r, cy + Math.sin(a) * r);
      else ctx.moveTo(Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    ctx.closePath();
  };
  const rimC = earned ? RIM[st.tier] : shade(faded(RIM[st.tier]), 0.06);
  inked(ctx, rim, rimC, { lw, band: 9, ink, dark: 0.22, light: 0.55 });
  // face
  const face = () => {
    ctx.beginPath();
    ctx.arc(0, cy, R * 0.78, 0, TAU);
  };
  inked(ctx, face, earned ? tint(RIM[st.tier], 0.72) : '#EDE9DF', { lw: lw * 0.8, band: 6, ink, dark: 0.1 });
  ctx.save();
  ctx.setLineDash(earned ? [4, 3.5] : [5, 4]);
  ctx.strokeStyle = earned ? shade(RIM[st.tier], 0.25) : faded(P.ink, 0.5);
  ctx.globalAlpha = earned ? 0.8 : 0.55;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(0, cy, R * 0.7, 0, TAU);
  ctx.stroke();
  ctx.restore();
  // glyph
  ctx.save();
  ctx.translate(0, cy);
  const gs = 0.98;
  ctx.scale(gs, gs);
  ctx.globalAlpha *= earned ? 1 : 0.5;
  const glw = 2.1 / (k * gs);
  if (typeof st.glyph === 'string') glyph(ctx, st.glyph, { faded: !earned, lw: glw });
  else st.glyph(glyphOf(ctx, P.ink, P.ink, { faded: !earned, lw: glw }));
  ctx.restore();
  // a glint on the rim
  if (earned) {
    ctx.save();
    ctx.fillStyle = P.white;
    ctx.globalAlpha = 0.85;
    twinkle(ctx, -R * 0.62, cy - R * 0.62, 6);
    ctx.fill();
    ctx.restore();
  }
}

/**
 * Draws the medal for achievement `id`, centred on (x, y) and `size` units tall (rim and tails),
 * in colour when `earned` and in greys when not. Baked once per size and state.
 */
export function medal(ctx: Ctx, id: string, x: number, y: number, size: number, earned: boolean) {
  const st = MEDALS[id] ?? FALLBACK;
  const s = Math.round(size);
  const k = s / 100;
  const h = s / 2 + 3;
  drawBaked(ctx, `medal:${id}:${earned ? 1 : 0}:${s}`, x, y, [-h, -h, h, h], (c) => {
    c.scale(k, k);
    drawMedal(c, st, earned, k);
  }, size / s);
}
