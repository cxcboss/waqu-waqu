// Data tables: everything that tunes a day lives here, so difficulty changes don't touch code.

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
  | { kind: 'clean'; label: string }
  | { kind: 'noWrong'; label: string }
  | { kind: 'all'; label: string };

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
        ['frog_swim', '别掉进河里；每天有【一次救命绳】'],
        ['frog_nervous', '按住别太久，【5 秒】不松手脚会累'],
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

/** The six chapters, five days each; a day's chapter is `chapterOf(day)`. */
export const CHAPTERS = [
  { title: '春 · 柳湾', tint: null },
  { title: '初夏 · 荷花塘', tint: 'rgba(120,200,120,0.16)' },
  { title: '雨季 · 急流峡', tint: 'rgba(70,100,140,0.28)' },
  { title: '秋 · 枫叶溪', tint: 'rgba(230,140,50,0.24)' },
  { title: '冬 · 冰河', tint: 'rgba(200,225,250,0.38)' },
  { title: '年末 · 港口集市', tint: 'rgba(240,170,90,0.2)' },
] as const;
export const DAYS_PER_CHAPTER = 5;
export const chapterOf = (day: number) => Math.floor((day - 1) / DAYS_PER_CHAPTER);

/** The two storm days are allowed to be failed with half the parcels. */
const HARD_DAYS = [15, 25];

// Days 6–30: [name, speed, houses, orders, urgent, cod, codNote, sizes, predictDelay, challenge, intro].
type Row = [string, number, number, number, number, number, 10 | 20, Size[], number, Challenge, string];
const noFall: Challenge = { kind: 'noFall', label: '一次都不落水' };
const noWet: Challenge = { kind: 'clean', label: '不错投，也不泡水' };
const noWrong: Challenge = { kind: 'noWrong', label: '一个都不错投' };
const allIn: Challenge = { kind: 'all', label: '包裹全部送达' };
const codAll: Challenge = { kind: 'codAll', label: '到付件找零全部正确' };
const multi = (n: number): Challenge => ({ kind: 'multi', label: `一趟送出 ${n} 个包裹`, n });
const fast = (sec: number): Challenge => ({ kind: 'urgentFast', label: `加急件 ${sec} 秒内送到`, sec });
const MIX: Size[] = [0, 1, 1, 2];
const LATER: Row[] = [
  // 初夏 · 荷花塘
  ['荷花开了', 50, 8, 8, 1, 1, 10, [0, 0, 1, 1], 1.2, noFall, '进入荷花塘，房子更多了'],
  ['乌龟爷爷', 52, 8, 8, 1, 1, 10, [0, 1, 1], 1.2, multi(3), '多背几件一起送，路线要规划'],
  ['兔小妹的婚礼', 48, 8, 7, 1, 1, 20, [1, 1, 2], 1.2, noWrong, '婚礼用品都是中大件，看准码牌'],
  ['冰棍要化了', 56, 9, 9, 2, 1, 20, [0, 0, 1], 1.2, fast(18), '加急件变多，倒计时不等人'],
  ['盛夏考核', 58, 9, 10, 2, 2, 20, MIX, 1.2, noWet, '夏天的考核：什么都会遇到'],
  // 雨季 · 急流峡
  ['峡谷入口', 54, 9, 9, 1, 1, 20, MIX, 1.2, noFall, '河水变急了，车开得更快'],
  ['河狸的水坝', 56, 9, 9, 1, 2, 20, MIX, 1.2, codAll, '到付件变多，算好找零'],
  ['下雨了', 58, 9, 10, 2, 1, 20, MIX, 1.2, noWet, '雨天路滑，别泡了包裹'],
  ['漩涡湾', 60, 10, 10, 2, 2, 20, MIX, 1.2, multi(3), '房子更密，一趟多送几件'],
  ['暴雨夜班', 64, 10, 10, 3, 2, 20, [1, 2, 2, 1], 1.2, noFall, '超难关：大件多、车速快，送对五成就算过'],
  // 秋 · 枫叶溪
  ['枫叶飘落', 54, 9, 9, 1, 1, 20, MIX, 1.2, noWrong, '秋天来了，节奏稍缓，认真看码牌'],
  ['起风了', 56, 9, 10, 1, 1, 20, MIX, 1.2, fast(18), '风起了，加急件要赶'],
  ['猫头鹰跟车日', 54, 9, 9, 2, 2, 20, MIX, 1.2, codAll, '经理盯着，到付件别找错钱'],
  ['萤火虫夜路', 56, 10, 10, 1, 1, 20, MIX, 1.2, noFall, '夜路难行，一步一步来'],
  ['双十一爆仓', 50, 10, 10, 3, 2, 20, [0, 0, 0, 1], 1.2, allIn, '包裹堆成山，小件多，争取全送达'],
  // 冬 · 冰河
  ['初雪', 56, 9, 9, 1, 1, 20, MIX, 1.2, noFall, '下雪了，河面更安静'],
  ['薄冰', 58, 9, 10, 1, 2, 20, MIX, 1.2, noWet, '别掉进冰冷的河里'],
  ['熊宝宝在冬眠', 54, 9, 9, 1, 1, 20, MIX, 1.2, noWrong, '慢慢送，别送错'],
  ['冰河急弯', 62, 10, 10, 2, 2, 20, MIX, 1.2, multi(3), '车速加快，一趟多送'],
  ['暴风雪', 66, 10, 10, 3, 2, 20, [1, 2, 2, 1], 1.2, noWet, '超难关：风雪夜行，送对五成就算过'],
  // 年末 · 港口集市
  ['港口初到', 58, 10, 10, 1, 1, 20, MIX, 1.2, noFall, '到了港口，房子又多又密'],
  ['起重机', 60, 10, 10, 2, 1, 20, [1, 1, 2, 2], 1.2, multi(3), '大件偏多，挑着背'],
  ['海鸥来了', 62, 10, 10, 2, 2, 20, MIX, 1.2, noWrong, '动作要快，别磨蹭'],
  ['年货大集', 64, 10, 10, 2, 3, 20, MIX, 1.2, codAll, '年货到付件特别多'],
  ['除夕最后一单', 66, 10, 10, 3, 3, 20, [0, 1, 1, 2], 1.2, allIn, '最后一天：把所有包裹都送到'],
];

DAYS.push(
  ...LATER.map(([name, speed, houses, orders, urgent, cod, codNote, sizes, predictDelay, challenge, intro], i): DayConfig => {
    const day = 6 + i;
    const rows: [string, string][] = [
      ['code', `今天【${orders} 单】，共【${houses} 户】`],
    ];
    if (urgent) rows.push(['box0u', `【加急件 ${urgent} 个】有奖金`]);
    if (cod) rows.push(['cod', `【到付 ${cod} 个】，给 ${codNote} 元`]);
    rows.push(['lily1', `河水【更急】，别掉队！`]);
    return {
      day, length: houses * 970 + 100, speed, houses, orders, urgent, sizes, bagSlots: 4, predictDelay,
      markTargets: false, tutorial: false, seed: day * 101, name, ordered: false, cod, codNote, challenge, intro,
      brief: { title: `第${day}天 · ${name}`, rows },
    };
  }),
);

/** Share of parcels that have to reach the right house for the day to count as passed. */
export const PASS_RATE = 0.6;
/** The first day is a lesson: half the parcels is a pass. */
export const passRate = (day: number) => (day <= 1 || HARD_DAYS.includes(day) ? 0.5 : PASS_RATE);

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
  swimCurrent: 38,
  swimDrag: 2.6,
  /** Swimming is a run of kicks while the wheel is held: speed of each kick, time between them, and the wind-up before the first. */
  kickSpeed: 270,
  kickT: 0.4,
  kickWind: 0.08,
  /** Seconds spluttering after a fall, before the frog can swim. */
  dunkSec: 0.35,
  /** Parcels adrift are carried downstream this fast, heavier ones slower (by size). */
  floatDrift: 24,
  floatDriftK: [1, 0.7, 0.45] as const,
  /** How far the tongue reaches for a parcel in the water, from a pad or swimming. */
  tongueR: 165,
  /** From the water, the frog can leap onto anything within this distance of its edge. */
  leapR: 250,
  /** Leap gauge: one sweep there and back (slower until gaugeLateDay), and the green zone's width. */
  gaugeSweep: 2,
  gaugeSweepLate: 1.2,
  gaugeLateDay: 10,
  gaugeZone: 0.52,
  gaugeZoneTutorial: 0.56,
  gaugeZoneMin: 0.4,
  gaugeZonePerWeight: 0.02,

  // Rushing ahead: above rushLine (fraction of the screen) the convoy speeds up hard, to at least
  // rushFloor of the way to rushMax, and keeps it up until the frog is back below rushRelease;
  // then it eases off slowly (rushDown) rather than at the usual rate.
  rushLine: 0.34,
  rushRelease: 0.48,
  rushMax: 3.6,
  rushFloor: 0.5,
  rushUp: 6,
  rushDown: 0.8,

  // Bottom warning zone (fraction of screen height)
  warnLine: 0.8,

  // Money
  wrongPenalty: 5,
  wetPenalty: 5,
  /** The lifeline costs a little: the truck's tow isn't free. */
  ropePenalty: 5,
  /** A landing this close to a pad's edge (design units) counts as on it; less on later days and with a heavy bag. */
  snapEarly: 50,
  snapLate: 30,
  snapFromDay: 3,
  urgentBonus: 10,
  urgentSeconds: 32,
  /** Right change on a cash-on-delivery parcel earns a tip; wrong change costs the difference. */
  codTip: 5,
  codPenalty: 5,
};
