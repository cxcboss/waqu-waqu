// Which music and ambience each place and day gets, and how each character sounds when they talk.
// Every id here is an entry of public/audio/manifest.json (built by tools/audio/build.py; see docs/audio.md).
import type { Audio } from '../engine/audio';
import { chapterOf } from './config';

/** One work track per chapter (chapter 7 is the bonus early-spring run). */
const CHAPTER_MUSIC = ['bgm_work', 'bgm_summer', 'bgm_rain', 'bgm_autumn', 'bgm_winter', 'bgm_harbor', 'bgm_spring'];
/** The chapter's weather, laid over the river that runs under every day. */
const CHAPTER_AMB = ['amb_birds', 'amb_cicadas', 'amb_rain', 'amb_wind', 'amb_winter', 'amb_harbor', 'amb_birds'];

export const SCENE_MUSIC = {
  hub: 'bgm_title',
  map: 'bgm_title',
  hall: 'bgm_hq',
  hq: 'bgm_hq',
  /** The report after a day that wasn't passed: the same track, softer and muffled. */
  hqLow: 'bgm_hq_low',
  shop: 'bgm_shop',
  home: 'bgm_home',
  ending: 'bgm_ending',
} as const;

const chapterIndex = (day: number) => Math.max(0, Math.min(CHAPTER_MUSIC.length - 1, chapterOf(Math.max(1, day))));

/** The work track for a day: the chapter's, or the storm version on the two storm days. */
export function musicForDay(day: number): string {
  if (day === 15) return 'bgm_storm';
  if (day === 25) return 'bgm_blizzard';
  return CHAPTER_MUSIC[chapterIndex(day)];
}

/** The ambience beds for a day on the river (the river itself is always there). */
export function ambienceForDay(day: number): string[] {
  const special: Record<number, string> = { 15: 'amb_storm', 19: 'amb_crickets', 25: 'amb_blizzard', 30: 'amb_newyear' };
  const bed = special[day] ?? CHAPTER_AMB[chapterIndex(day)];
  // early summer has frogs croaking in the lotus pond too
  return chapterIndex(day) === 1 ? ['amb_river', bed, 'amb_frogs'] : ['amb_river', bed];
}

/** Birds by day, crickets and frogs at night, around the hub. */
export function hubAmbience(night: boolean): string[] {
  return night ? ['amb_crickets', 'amb_frogs'] : ['amb_birds'];
}

/** Effects a day on the river uses all the time: fetched when the day starts so the first of each isn't late. */
export const PLAY_SOUNDS = ['tongue_thwip', 'slurp', 'perfect_sparkle', 'aww_missed', 'warn_pulse', 'warn_pop', 'lasso_whirl', 'rope_snap', 'exhaust_puff', 'door_open', 'door_close', 'day_start', 'day_complete', 'day_fail', 'driver_call', 'driver_cheer', 'driver_grumble', 'phone_ring',
  'gull', 'gust', 'ice_crack', 'leaf_rustle', 'thunder', 'firecracker', 'owl_hoot', 'owl_hoot_2', 'owl_hmm', 'letter_open', 'deliver_unhappy'];

type SylSet = 'soft' | 'beak' | 'bleat' | 'click';
const SYL: Record<SylSet, string[]> = {
  soft: ['syl_soft_1', 'syl_soft_2', 'syl_soft_3', 'syl_soft_4', 'syl_soft_5'],
  beak: ['syl_beak_1', 'syl_beak_2', 'syl_beak_3', 'syl_beak_4'],
  bleat: ['syl_bleat_1', 'syl_bleat_2', 'syl_bleat_3'],
  click: ['syl_click_1', 'syl_click_2', 'syl_click_3'],
};

/** How each resident babbles: which syllables, how high and how fast (keyed by the species ids in cast.ts). */
export const VOICES: Record<string, { set: SylSet; pitch: number; pace: number }> = {
  duck: { set: 'beak', pitch: 1.15, pace: 1 },
  rabbit: { set: 'soft', pitch: 1.35, pace: 1.25 },
  hedgehog: { set: 'soft', pitch: 0.95, pace: 1.1 },
  turtle: { set: 'soft', pitch: 0.72, pace: 0.6 },
  otter: { set: 'soft', pitch: 1.15, pace: 1.3 },
  beaver: { set: 'click', pitch: 0.9, pace: 1 },
  egret: { set: 'beak', pitch: 1.25, pace: 0.9 },
  squirrel: { set: 'click', pitch: 1.45, pace: 1.4 },
  raccoon: { set: 'soft', pitch: 1.05, pace: 1 },
  bear: { set: 'soft', pitch: 0.76, pace: 0.7 },
  swan: { set: 'beak', pitch: 1.05, pace: 0.8 },
  crab: { set: 'click', pitch: 1.1, pace: 1.3 },
  mouse: { set: 'click', pitch: 1.6, pace: 1.5 },
  fox: { set: 'soft', pitch: 1, pace: 0.95 },
  pig: { set: 'soft', pitch: 0.86, pace: 0.85 },
  sheep: { set: 'bleat', pitch: 1, pace: 0.9 },
  mole: { set: 'click', pitch: 0.85, pace: 1 },
  snail: { set: 'soft', pitch: 0.9, pace: 0.5 },
  pelican: { set: 'beak', pitch: 0.8, pace: 0.9 },
  cat: { set: 'soft', pitch: 1.3, pace: 1.1 },
};

export type Mood = 'happy' | 'huh' | 'sad' | 'plain';

/** A resident says something: a few syllables of their own babble, lifted at the end when happy or asking. */
export function say(audio: Audio, species: string, mood: Mood = 'plain', o: { count?: number; delay?: number; volume?: number } = {}) {
  const v = VOICES[species] ?? VOICES.fox;
  const bend = mood === 'happy' ? 0.18 : mood === 'huh' ? 0.35 : mood === 'sad' ? -0.16 : 0;
  audio.babble(SYL[v.set], { pitch: v.pitch, pace: v.pace, bend, count: o.count ?? (mood === 'huh' ? 2 : 3), delay: o.delay, volume: o.volume });
}
