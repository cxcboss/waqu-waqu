// Tiny SVG string builders used to draw the placeholder art.
// Ported from the concept-art source so the game matches the concept images.
import { INK, P } from './palette';

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const r1 = (n: number) => Math.round(n * 10) / 10;

type Attrs = Record<string, string | number | undefined | null | false>;

export function E(tag: string, attrs: Attrs = {}, inner = ''): string {
  const a = Object.entries(attrs)
    .filter(([, v]) => v !== undefined && v !== null && v !== false)
    .map(([k, v]) => `${k}="${typeof v === 'number' ? r1(v) : v}"`)
    .join(' ');
  return `<${tag} ${a}>${inner}</${tag}>`;
}
export const S = (sw = 3, extra: Attrs = {}): Attrs => ({ stroke: INK, 'stroke-width': sw, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', ...extra });
export const ell = (cx: number, cy: number, rx: number, ry: number, fill: string, sw = 3, extra: Attrs = {}) => E('ellipse', { cx, cy, rx, ry, fill, ...(sw ? S(sw) : {}), ...extra });
export const circ = (cx: number, cy: number, r: number, fill: string, sw = 3, extra: Attrs = {}) => E('circle', { cx, cy, r, fill, ...(sw ? S(sw) : {}), ...extra });
export const rr = (x: number, y: number, w: number, h: number, r: number, fill: string, sw = 3, extra: Attrs = {}) => E('rect', { x, y, width: w, height: h, rx: r, fill, ...(sw ? S(sw) : {}), ...extra });
export const path = (d: string, fill: string, sw = 3, extra: Attrs = {}) => E('path', { d, fill, ...(sw ? S(sw) : {}), ...extra });
export const line = (x1: number, y1: number, x2: number, y2: number, stroke: string, sw = 3, extra: Attrs = {}) => E('line', { x1, y1, x2, y2, stroke, 'stroke-width': sw, 'stroke-linecap': 'round', ...extra });
export const g = (inner: string, extra: Attrs = {}) => E('g', extra, inner);
/** An outlined tube: ink edge with a colored core (handles, spouts, straps). */
export const tube = (d: string, color: string, w: number, extra: Attrs = {}) =>
  path(d, 'none', 0, { stroke: INK, 'stroke-width': w + 6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', ...extra }) +
  path(d, 'none', 0, { stroke: color, 'stroke-width': w, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', ...extra });

export function defs(): string {
  return `<defs>
  <filter id="wobble" x="-10%" y="-10%" width="120%" height="120%">
    <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="2" seed="4" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="4.5" xChannelSelector="R" yChannelSelector="G"/>
  </filter>
  <filter id="wobbleSoft" x="-5%" y="-5%" width="110%" height="110%">
    <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="2" seed="9" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="3" xChannelSelector="R" yChannelSelector="G"/>
  </filter>
  <filter id="grain" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="11" stitchTiles="stitch" result="n"/>
    <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.29  0 0 0 0 0.23  0 0 0 0 0.19  0.55 0 0 0 -0.22"/>
  </filter>
  <filter id="mottle" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.006 0.01" numOctaves="3" seed="21" stitchTiles="stitch" result="n"/>
    <feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 0.98  0 0 0 0 0.92  0.9 0 0 0 -0.38"/>
  </filter>
  <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="6"/></filter>
  </defs>`;
}

/** Paper grain + watercolor mottling laid over a whole picture. */
export const overlays = (x: number, y: number, w: number, h: number) =>
  E('rect', { x, y, width: w, height: h, filter: 'url(#mottle)', opacity: 0.55, style: 'mix-blend-mode:soft-light' }) +
  E('rect', { x, y, width: w, height: h, filter: 'url(#grain)', opacity: 0.9, style: 'mix-blend-mode:multiply' });

export { P, INK };
