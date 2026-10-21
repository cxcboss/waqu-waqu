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
  /** Name of the stop on the route map. */
  name: string;
  /** Pickup codes follow the order the houses come up (1, 2, 3…); off from day 4 on. */
  ordered: boolean;
  /** Cash-on-delivery parcels: the resident pays with a `codNote` bill and the frog gives change. */
  cod: number;
  codNote: 10 | 20;
  /** The day's third stamp. */
  challenge: Challenge;
}

/** What the third stamp of a day asks for; checked against the day's result at HQ. */
export type Challenge =
  | { kind: 'noFall'; label: string }
  | { kind: 'urgentFast'; label: string; sec: number }
  | { kind: 'multi'; label: string; n: number }
  | { kind: 'codAll'; label: string }
  | { kind: 'clean'; label: string };

export const DAYS: DayConfig[] = [
  {
    day: 1, length: 5200, speed: 44, houses: 6, orders: 4, urgent: 0, sizes: [0], bagSlots: 3,
    predictDelay: 0, markTargets: true, tutorial: true, seed: 101,
    name: '入职第一天', ordered: true, cod: 1, codNote: 10,
    challenge: { kind: 'noFall', label: '一次都不落水' },
    intro: '第一天上班，先熟悉跳跃和送件',
    brief: {
      title: '第1天 · 入职第一天',
      rows: [
        ['box0', '从运输车上【取包裹】'],
        ['code', '送到挂着【相同取件码】的房子'],
        ['hand', '【任意空白处】按住往下拉，松手就跳'],
        ['frog_swim', '别掉进河里，也别被冲出屏幕'],
        ['frog_nervous', '按住别太久，【3 秒】不松手脚会累'],
      ],
    },
  },
  {
    day: 2, length: 6200, speed: 48, houses: 7, orders: 6, urgent: 1, sizes: [0, 0, 1], bagSlots: 4,
    predictDelay: 0.5, markTargets: false, tutorial: false, seed: 202,
    name: '加急件', ordered: true, cod: 1, codNote: 10,
    challenge: { kind: 'urgentFast', label: '加急件 20 秒内送到', sec: 20 },
    intro: '新业务：加急件，按时送到有奖金',
    brief: {
      title: '第2天 · 加急件',
      rows: [
        ['box0u', '【红标签】是加急件，有倒计时'],
        ['coin', '加急件准时送到，有【奖金】'],
        ['box1', '【中件】占 2 格背包，也更重'],
      ],
    },
  },
  {
    day: 3, length: 7200, speed: 52, houses: 7, orders: 7, urgent: 1, sizes: [0, 1, 1, 2], bagSlots: 4,
    predictDelay: 1, markTargets: false, tutorial: false, seed: 303,
    name: '大件来了', ordered: true, cod: 1, codNote: 10,
    challenge: { kind: 'multi', label: '一趟送出 2 个包裹', n: 2 },
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
  {
    day: 4, length: 7400, speed: 52, houses: 8, orders: 7, urgent: 1, sizes: [0, 0, 1, 2], bagSlots: 4,
    predictDelay: 1, markTargets: false, tutorial: false, seed: 404,
    name: '取件码乱了', ordered: false, cod: 2, codNote: 20,
    challenge: { kind: 'codAll', label: '到付件找零全部正确' },
    intro: '取件码不按顺序了，到付件收 20 元',
    brief: {
      title: '第4天 · 取件码乱了',
      rows: [
        ['code', '从今天起取件码【不按顺序】了'],
        ['cod', '【到付件】住户给 20 元，算好找零'],
        ['box1', '背包装不下时，可以【放回车上】'],
      ],
    },
  },
  {
    day: 5, length: 7800, speed: 56, houses: 8, orders: 8, urgent: 2, sizes: [0, 1, 1, 2], bagSlots: 4,
    predictDelay: 1.2, markTargets: false, tutorial: false, seed: 505,
    name: '入职考核', ordered: false, cod: 2, codNote: 20,
    challenge: { kind: 'clean', label: '不错投，也不泡水' },
    intro: '入职考核：前几天学的全都用上',
    brief: {
      title: '第5天 · 入职考核',
      rows: [
        ['owl', '猫头鹰经理今天【亲自验收】'],
        ['box0u', '加急件、到付件、大件【全都有】'],
        ['frog_swim', '落水爬上岸，要【看准时机】'],
      ],
    },
  },
];

/** Share of parcels that have to reach the right house for the day to count as passed. */
export const PASS_RATE = 0.6;

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
  /** One road on the right; the river takes the rest, out to a strip of reeds on the left. */
  riverL: 56,
  riverR: 625,
  /** The truck drives half off-screen on the right edge. */
  truckX: 732,
  /** Where the frog stands on the truck bed: inward offset from the truck center, so it stays on screen. */
  truckSpotX: [30, 48] as const,
  /** Truck anchor as a fraction of screen height. */
  truckAnchor: 0.46,
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
  /** The current pulls a swimming frog harder than the floating things around it. */
  swimCurrent: 46,
  swimImpulse: 100,
  swimMax: 240,
  swimDrag: 2.6,
  /** Seconds spluttering after a fall, before the frog can swim. */
  dunkSec: 0.8,

  // Rushing ahead: above this fraction of the screen the convoy speeds up, up to rushMax times.
  rushLine: 0.3,
  rushMax: 2.6,

  // Bottom warning zone (fraction of screen height)
  warnLine: 0.8,

  // Money
  wrongPenalty: 5,
  wetPenalty: 5,
  urgentBonus: 10,
  urgentSeconds: 32,
  /** Right change on a cash-on-delivery parcel earns a tip; wrong change costs the difference. */
  codTip: 5,
  codPenalty: 5,
};
