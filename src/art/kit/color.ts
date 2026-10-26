// Colour helpers for the code-drawn art: darker and lighter versions of the palette, mixes, and the
// faded look of something not earned yet. Results are '#rrggbb' strings, remembered, so calling these
// every frame doesn't make new strings every frame.

type RGB = [number, number, number];

const parsed = new Map<string, RGB>();
const made = new Map<string, string>();

/** '#rgb', '#rrggbb' or 'rgb(r,g,b)' as three 0–255 numbers. */
export function rgbOf(c: string): RGB {
  let v = parsed.get(c);
  if (v) return v;
  if (c[0] === '#') {
    const h = c.length === 4 ? c.slice(1).split('').map((d) => d + d).join('') : c.slice(1, 7);
    const n = parseInt(h, 16);
    v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  } else {
    const m = c.match(/[\d.]+/g) ?? ['0', '0', '0'];
    v = [Number(m[0]), Number(m[1]), Number(m[2])];
  }
  parsed.set(c, v);
  return v;
}

const hex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
const toHex = (r: number, g: number, b: number) => `#${hex2(r)}${hex2(g)}${hex2(b)}`;

function memo(key: string, f: () => string) {
  let v = made.get(key);
  if (v === undefined) {
    if (made.size > 2000) made.clear();
    v = f();
    made.set(key, v);
  }
  return v;
}

/** `a` blended toward `b` by t (0 = a, 1 = b). */
export function mix(a: string, b: string, t: number) {
  return memo(`m${a}${b}${t}`, () => {
    const p = rgbOf(a), q = rgbOf(b);
    return toHex(p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t);
  });
}

/**
 * Darker by k (0–1). Shadows lean a little warm and toward the ink brown rather than plain black,
 * the way a colored pencil goes over a colour a second time.
 */
export function shade(c: string, k: number) {
  return memo(`s${c}${k}`, () => {
    const [r, g, b] = rgbOf(c);
    const f = 1 - k;
    return toHex(r * f + 74 * k * 0.18, g * f + 59 * k * 0.18, b * f * 0.97 + 48 * k * 0.18);
  });
}

/** Lighter by k (0–1), toward a warm paper white. */
export const tint = (c: string, k: number) => mix(c, '#FFFBF0', k);

/** The colour with an alpha, as an rgba() string. */
export function alpha(c: string, a: number) {
  return memo(`a${c}${a}`, () => {
    const [r, g, b] = rgbOf(c);
    return `rgba(${r},${g},${b},${a})`;
  });
}

/**
 * The washed-out grey of something not earned or not open yet: the colour's lightness kept,
 * its hue dropped toward a warm stone grey.
 */
export function faded(c: string, k = 0.85) {
  return memo(`g${c}${k}`, () => {
    const [r, g, b] = rgbOf(c);
    const l = 0.3 * r + 0.55 * g + 0.15 * b;
    // squeeze the lightness toward the middle so dark inks and bright golds don't stand out
    const v = 150 + (l - 150) * 0.62;
    const grey: RGB = [v * 1.02, v * 0.99, v * 0.93];
    return toHex(r + (grey[0] - r) * k, g + (grey[1] - g) * k, b + (grey[2] - b) * k);
  });
}

/** Relative lightness 0–1, to pick ink or white text on a colour. */
export function lightness(c: string) {
  const [r, g, b] = rgbOf(c);
  return (0.3 * r + 0.55 * g + 0.15 * b) / 255;
}
