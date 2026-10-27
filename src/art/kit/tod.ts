// Time of day. A scene swaps to the token set for the hour instead of laying a tint over everything
// (a full-screen tint muddies the painted characters): sky, hills, ground, water, and how brightly
// windows and lamps are lit. Hours: morning 5–9, day 9–17, dusk 17–19, night 19–5.

export type TodName = 'morning' | 'day' | 'dusk' | 'night';
export const TOD_NAMES: readonly TodName[] = ['morning', 'day', 'dusk', 'night'];

export interface Tod {
  name: TodName;
  /** Chinese label, for debug pages. */
  label: string;
  skyTop: string;
  skyBot: string;
  /** Sun or moon disc, and its soft halo. */
  sun: string;
  halo: string;
  cloud: string;
  /** How strongly clouds are outlined (0–1); night clouds are only shapes. */
  cloudInk: number;
  hillFar: string;
  hillNear: string;
  ground: string;
  /** Darker ground for patches, path edges and tufts' shadow side. */
  groundDeep: string;
  grass: string;
  water: string;
  waterDeep: string;
  /** Glints on the water. */
  glint: string;
  /** Glass of a window: unlit colour, and the warm colour it glows. */
  window: string;
  windowGlow: string;
  lampGlow: string;
  /** How lit windows and lamps are, 0 (daylight) to 1 (night). */
  lit: number;
  /** Stars and fireflies come out. */
  stars: boolean;
  /** Contact shadows: strength at this hour. */
  shadow: number;
}

export const TOD: Record<TodName, Tod> = {
  morning: {
    name: 'morning', label: '清晨',
    skyTop: '#B9D8E3', skyBot: '#FBE3C6', sun: '#FFE7AE', halo: '#FFF3D6', cloud: '#FFF6EA', cloudInk: 0.3,
    hillFar: '#AFC4B4', hillNear: '#97BB80', ground: '#CEDDA4', groundDeep: '#B3C98A', grass: '#86B46A',
    water: '#9AD0C6', waterDeep: '#6FB2AA', glint: '#FFF8E8',
    window: '#CDE6E0', windowGlow: '#FFE2A6', lampGlow: '#FFE7B0', lit: 0.25, stars: false, shadow: 0.2,
  },
  day: {
    name: 'day', label: '白天',
    skyTop: '#BFE3E6', skyBot: '#F4EBCF', sun: '#FBEBB0', halo: '#FFF6D8', cloud: '#FFFDF6', cloudInk: 0.35,
    hillFar: '#A9C79A', hillNear: '#93B86C', ground: '#C9DB9C', groundDeep: '#AFC67E', grass: '#7FB069',
    water: '#8FC9BE', waterDeep: '#5FA9A3', glint: '#FBF7EE',
    window: '#BFE1D7', windowGlow: '#FFD98A', lampGlow: '#FFE29A', lit: 0, stars: false, shadow: 0.24,
  },
  dusk: {
    name: 'dusk', label: '黄昏',
    skyTop: '#EFA88C', skyBot: '#F8DDB0', sun: '#F9C77E', halo: '#FCE3B8', cloud: '#FBE2CC', cloudInk: 0.3,
    hillFar: '#B5A38F', hillNear: '#9AA26C', ground: '#C9C38C', groundDeep: '#ADA66F', grass: '#8EA25E',
    water: '#94B6B2', waterDeep: '#6E9592', glint: '#FFE3B8',
    window: '#E9D3A6', windowGlow: '#FFD27F', lampGlow: '#FFD98C', lit: 0.65, stars: false, shadow: 0.2,
  },
  night: {
    name: 'night', label: '夜晚',
    skyTop: '#2B3F57', skyBot: '#5A6F8E', sun: '#FFF1C2', halo: '#8C9AB4', cloud: '#6C7F9A', cloudInk: 0,
    hillFar: '#3F5368', hillNear: '#4A6252', ground: '#66795C', groundDeep: '#55684D', grass: '#5E7D52',
    water: '#4C7682', waterDeep: '#3A5E6A', glint: '#D6E6F0',
    window: '#56687A', windowGlow: '#FFD98A', lampGlow: '#FFE29A', lit: 1, stars: true, shadow: 0.16,
  },
};

/** Which part of the day it is at `d` (now by default). */
export function todName(d: Date = new Date()): TodName {
  const h = d.getHours() + d.getMinutes() / 60;
  if (h >= 5 && h < 9) return 'morning';
  if (h >= 9 && h < 17) return 'day';
  if (h >= 17 && h < 19) return 'dusk';
  return 'night';
}

/** The token set for `d` (now by default). */
export const todAt = (d?: Date): Tod => TOD[todName(d)];
