// Data tables: everything that tunes a day lives here, so difficulty changes don't touch code.

export type Species = 'duck' | 'rabbit' | 'hedgehog';
export type HouseType = 'teapot' | 'boot' | 'can';
export type Size = 0 | 1 | 2; // small / medium / large

export interface DayConfig {
  day: number;
  /** Route length in design units; the day ends when the trucks have driven this far. */
  length: number;
  /** River scroll speed in design units per second. */
  speed: number;
  houses: number;
  orders: number;
  urgent: number;
  /** Parcel sizes drawn from this list (repeats weight the odds). */
  sizes: Size[];
  bagSlots: number;
  /** Seconds of aiming before the dotted trajectory shows. */
  predictDelay: number;
  /** Mark target houses with a bobbing arrow (first day only). */
  markTargets: boolean;
  tutorial: boolean;
  seed: number;
  intro: string;
  /** Briefing card before the day starts: a sprite name and a line per row, 【】 marks a highlight. */
  brief: { title: string; rows: [string, string][] };
}

export const DAYS: DayConfig[] = [
  {
    day: 1, length: 5200, speed: 44, houses: 6, orders: 4, urgent: 0, sizes: [0], bagSlots: 3,
    predictDelay: 0, markTargets: true, tutorial: true, seed: 101,
    intro: '第一天上班，先熟悉跳跃和送件',
    brief: {
      title: '第1天 · 入职第一天',
      rows: [
        ['box0', '从运输车上【取包裹】'],
        ['code', '送到挂着【相同取件码】的房子'],
        ['hand', '【任意空白处】按住往下拉，松手就跳'],
        ['frog_swim', '别掉进河里，也别被冲出屏幕'],
      ],
    },
  },
  {
    day: 2, length: 6200, speed: 52, houses: 7, orders: 6, urgent: 1, sizes: [0, 0, 1], bagSlots: 4,
    predictDelay: 0.5, markTargets: false, tutorial: false, seed: 202,
    intro: '新业务：加急件，按时送到有奖金',
    brief: {
      title: '第2天 · 新业务',
      rows: [
        ['box0u', '【红标签】是加急件，有倒计时'],
        ['coin', '加急件准时送到，有【奖金】'],
        ['box1', '【中件】占 2 格背包，也更重'],
      ],
    },
  },
  {
    day: 3, length: 7200, speed: 60, houses: 8, orders: 8, urgent: 2, sizes: [0, 1, 1, 2], bagSlots: 4,
    predictDelay: 1, markTargets: false, tutorial: false, seed: 303,
    intro: '大件包裹更重，跳不远，挑着拿',
    brief: {
      title: '第3天 · 大件来了',
      rows: [
        ['box2', '【大件】占 3 格背包，最重'],
        ['satchel2', '背包越重跳得越近，【挑着拿】'],
        ['lily1', '河水更急了，别掉队！'],
      ],
    },
  },
];

/** Who lives in each kind of house. Houses of the same kind take the names in turn. */
export const RESIDENTS: Record<HouseType, { species: Species; names: string[] }> = {
  teapot: { species: 'duck', names: ['鸭太太', '鸭奶奶', '鸭小弟'] },
  can: { species: 'rabbit', names: ['兔小妹', '兔阿姨', '兔爷爷'] },
  boot: { species: 'hedgehog', names: ['刺猬大叔', '刺猬婆婆', '刺猬小胖'] },
};

export const SIZE_INFO: { slots: number; weight: number; pay: number; label: string }[] = [
  { slots: 1, weight: 1, pay: 10, label: '小件' },
  { slots: 2, weight: 2, pay: 15, label: '中件' },
  { slots: 3, weight: 3, pay: 20, label: '大件' },
];

export const TUNING = {
  // Layout (design units, 750 wide)
  riverL: 125,
  riverR: 625,
  /** Trucks drive half off-screen at the edges, leaving the middle to the river. */
  truckX: [18, 732] as const,
  /** Where the frog stands on a truck bed: inward offset from the truck center, so it stays on screen. */
  truckSpotX: [30, 48] as const,
  /** Truck anchor as a fraction of screen height: left truck lower, right truck higher. */
  truckAnchor: [0.6, 0.34] as const,
  truckHalfW: 74,
  truckHalfH: 128,

  // Jump
  minJump: 50,
  maxJump: 330,
  /** Lost jump distance per unit of carried weight. */
  weightPenalty: 0.05,
  maxDrag: 190,
  deadDrag: 22,

  // Slow-down when landing on a truck (capped) or on a house with parcels to hand over
  truckSlowSec: 3,
  houseSlowSec: 2.5,
  slowFactor: 0.4,
  slowCooldown: 5,

  // Water
  current: 26,
  swimImpulse: 105,
  swimMax: 250,
  swimDrag: 2.6,

  // Bottom warning zone (fraction of screen height)
  warnLine: 0.8,

  // Money
  wrongPenalty: 5,
  wetPenalty: 5,
  urgentBonus: 10,
  urgentSeconds: 32,
};
