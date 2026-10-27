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
  /** The chapter mechanics on the river today, and the ones the day introduces (they lead the briefing). */
  feats: Feats;
  teach?: Feat[];
  /** The hidden day (第0号快递), which isn't on the route and has no stamps. */
  secret?: boolean;
}

/** What the third stamp of a day asks for; checked against the day's result at HQ. */
export type Challenge =
  | { kind: 'noFall'; label: string }
  | { kind: 'urgentFast'; label: string; sec: number }
  | { kind: 'multi'; label: string; n: number }
  | { kind: 'codAll'; label: string }
  | { kind: 'clean'; label: string }
  | { kind: 'noWrong'; label: string }
  | { kind: 'all'; label: string }
  /** Every fragile, chilled and hot parcel handed over in one piece (and in time). */
  | { kind: 'intact'; label: string }
  /** Every parcel to be sent back collected and brought to the truck. */
  | { kind: 'returns'; label: string }
  /** The hibernating bear never woken. */
  | { kind: 'quiet'; label: string }
  /** No parcel carried off by a gull. */
  | { kind: 'noSnatch'; label: string }
  /** Never pecked into the river by the goose. */
  | { kind: 'noPeck'; label: string };

/**
 * A chapter's mechanics, each taught on a day of its own (see levelfeats.ts for what they do). In a
 * day's `feats` the number says how many: pads or other things on the river, parcels, or (for the
 * weather and the riders) just that it's on.
 */
export type Feat =
  | 'owl' | 'bud' | 'turtle' | 'fragile' | 'cold'
  | 'rapids' | 'dam' | 'return' | 'slip' | 'rain' | 'whirl' | 'storm'
  | 'leaf' | 'gust' | 'night' | 'bulk'
  | 'floe' | 'thin' | 'quiet' | 'warm' | 'blizzard' | 'snow'
  | 'pier' | 'ferry' | 'hook' | 'gull' | 'goose' | 'nag' | 'fireworks';
export type Feats = Partial<Record<Feat, number>>;

export const DAYS: DayConfig[] = [
  {
    day: 1, length: 5200, speed: 44, houses: 6, orders: 4, urgent: 0, sizes: [0], bagSlots: 3,
    predictDelay: 0, markTargets: true, tutorial: true, seed: 101,
    name: '入职第一天', ordered: true, cod: 1, codNote: 10,
    challenge: { kind: 'noFall', label: '一次都不落水' },
    feats: {},
    intro: '第一天上班，先熟悉跳跃和送件',
    brief: {
      title: '第1天 · 入职第一天',
      rows: [
        ['box0', '从运输车上【取包裹】'],
        ['code', '送到挂着【相同取件码】的房子'],
        ['hand', '【任意空白处】按住下拉，松手就跳'],
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
    feats: {},
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
    feats: {},
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
    feats: {},
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
    feats: { owl: 1 }, teach: ['owl'],
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

/** The seven chapters, five days each (the seventh opens after the year's end); a day's chapter is `chapterOf(day)`. */
export const CHAPTERS = [
  { title: '春 · 柳湾', tint: null },
  { title: '初夏 · 荷花塘', tint: 'rgba(120,200,120,0.16)' },
  { title: '雨季 · 急流峡', tint: 'rgba(70,100,140,0.28)' },
  { title: '秋 · 枫叶溪', tint: 'rgba(230,140,50,0.24)' },
  { title: '冬 · 冰河', tint: 'rgba(200,225,250,0.38)' },
  { title: '年末 · 港口集市', tint: 'rgba(240,170,90,0.2)' },
  { title: '早春 · 环河联运', tint: 'rgba(250,200,210,0.14)' },
] as const;
export const DAYS_PER_CHAPTER = 5;
/** A day as it's named on screen: 第12天, or the hidden 第0号快递. */
export const dayLabel = (day: number) => (day ? `第${day}天` : '第0号快递');

export const chapterOf = (day: number) => Math.max(0, Math.floor((day - 1) / DAYS_PER_CHAPTER));
/** The last day of the year: passing it plays the ending and opens the seventh chapter. */
export const YEAR_END = 30;

/** The two storm days are allowed to be failed with half the parcels. */
const HARD_DAYS = [15, 25];
/** Share of parcels that have to reach the right house for the day to count as passed. */
export const PASS_RATE = 0.6;
/** The first day is a lesson, and the storm days are hard: half the parcels is a pass. */
export const passRate = (day: number) => (day <= 1 || HARD_DAYS.includes(day) ? 0.5 : PASS_RATE);
/** The most rows a briefing card has room for on the smallest phones. */
export const BRIEF_MAX = 5;

/**
 * What each mechanic says about itself: the briefing row (with how many there are today), and the
 * owl's word the first time one comes on screen (a line and a smaller one under it).
 */
export const FEAT_INFO: Record<Feat, { brief: (n: number) => string; hint?: [string, string] }> = {
  owl: { brief: (n) => (n > 1 ? '猫头鹰经理【跟车】，会提醒下一家要什么' : '猫头鹰经理今天【亲自验收】') },
  bud: { brief: () => '粉色【花苞荷叶】站久了会沉，快跳走', hint: ['【花苞荷叶】站久了会沉下去！', '落脚后别发呆，快跳到下一片'] },
  turtle: { brief: () => '【乌龟背】会自己游，可以搭顺风车', hint: ['跳上【乌龟背】，搭个顺风车', '乌龟会横着游过河，到了对岸再跳'] },
  fragile: { brief: (n) => `【易碎件 ${n} 个】：跳太远落地会碰坏`, hint: ['背着【易碎件】，别跳太远！', '重重落地两次就碎了，近一点的跳最稳'] },
  cold: { brief: (n) => `【冷藏件 ${n} 个】：背在身上会慢慢化`, hint: ['【冷藏件】离开车就开始化', '卡片上的蓝条走完前送到；放回车上会重新冻好'] },
  rapids: { brief: () => '【急流带】里荷叶晃得厉害，水也更急', hint: ['前面是【急流带】！', '荷叶左右晃，水把你往下冲，看准了再跳'] },
  dam: { brief: () => '【水坝】闸门会定时打开，开闸时别站上去', hint: ['【水坝】的闸门会定时打开', '灯变黄就要开闸了，站在闸门上会被冲下水'] },
  return: { brief: (n) => `【退货件 ${n} 个】：去住户家收回来带上车`, hint: ['这家有【退货件】要收', '站上门口点卡片收回来，再跳回运输车交掉'] },
  slip: { brief: () => '雨天【石头】很滑，落脚会往前滑', hint: ['下雨了，【石头】很滑！', '跳得越猛滑得越远，别滑进水里'] },
  rain: { brief: () => '下雨了，河面【看不太清】' },
  whirl: { brief: () => '【漩涡】会卷着荷叶转圈，看准再跳', hint: ['小心【漩涡】！', '荷叶绕着它转；掉进去会被往中间吸'] },
  storm: { brief: () => '暴雨夜：【闪电】亮起时才看得清远处', hint: ['暴雨夜，看不清路', '等【闪电】亮起时看清远处，再计划路线'] },
  leaf: { brief: () => '【落叶】只能踩一次，跳走就漂走了', hint: ['【落叶】只能踩一次！', '跳走以后它就漂走了，别指望回头'] },
  gust: { brief: () => '【阵风】来之前有提示，风里跳会被吹偏', hint: ['要起风了！', '风里起跳会被吹偏，【顶着风】拉一点'] },
  night: { brief: () => '天黑了，【萤火虫】会照亮荷叶', hint: ['天黑了，跟着【萤火虫】走', '萤火虫停在能落脚的地方'] },
  bulk: { brief: (n) => `【${n} 户群件】一家要好几件，半路还会补货`, hint: ['【群件】：这家要好几件', '取件码一样，可以一趟一起送'] },
  floe: { brief: () => '【浮冰】会慢慢转，落脚点要看准', hint: ['【浮冰】在慢慢转', '站在上面会跟着转，起跳前看准方向'] },
  thin: { brief: () => '【薄冰】踩两次就会裂开', hint: ['那是【薄冰】！', '第二次踩上去就会裂，裂了马上跳走'] },
  quiet: { brief: () => '熊宝宝在冬眠，它家附近要【轻轻跳】', hint: ['嘘——熊宝宝在冬眠', '它家附近跳太远会吵醒它，【轻轻跳】'] },
  warm: { brief: (n) => `【保温件 ${n} 个】：背在身上会慢慢凉`, hint: ['【保温件】离开车就开始凉', '卡片上的红条走完前送到；放回车上会重新热好'] },
  blizzard: { brief: () => '暴风雪：看不远，【风向】一直在变', hint: ['暴风雪来了！', '风一阵一阵地变，看着风向标起跳'] },
  snow: { brief: () => '下雪了，河面安安静静' },
  pier: { brief: () => '港口有【栈桥】，可以放心落脚', hint: ['【栈桥】又宽又稳', '站在上面可以歇口气'] },
  ferry: { brief: () => '【渡船】在两岸之间来回开', hint: ['跳上【渡船】过河', '它会停一下再开，别在开动时跳空'] },
  hook: { brief: () => '跳上【吊钩】，它会荡着把你送过去', hint: ['起重机的【吊钩】可以抓！', '跳上去会跟着荡，荡到前面再跳下来'] },
  gull: { brief: () => '【海鸥】会来叼包裹，点它赶走或快跳开', hint: ['【海鸥】来抢包裹了！', '点一下海鸥把它赶走，或者赶紧跳开'] },
  goose: { brief: () => '【大鹅】守门时别跳过去，等它走开', hint: ['那家有【大鹅】看门！', '大鹅守在门口时跳上去会被啄下水，等它走开'] },
  nag: { brief: (n) => `【催单件 ${n} 个】送晚了，住户会出来催`, hint: ['这家在【催单】', '房子出现后快点送，晚了没有小费'] },
  fireworks: { brief: () => '除夕夜，【烟花】会照亮河面', hint: ['除夕夜，最后一班车', '烟花亮的时候看清路'] },
};

const noFall: Challenge = { kind: 'noFall', label: '一次都不落水' };
const noWet: Challenge = { kind: 'clean', label: '不错投，也不泡水' };
const noWrong: Challenge = { kind: 'noWrong', label: '一个都不错投' };
const allIn: Challenge = { kind: 'all', label: '包裹全部送达' };
const multi = (n: number): Challenge => ({ kind: 'multi', label: `一趟送出 ${n} 个包裹`, n });
const fast = (sec: number): Challenge => ({ kind: 'urgentFast', label: `加急件 ${sec} 秒内送到`, sec });
const intact = (label: string): Challenge => ({ kind: 'intact', label });
const MIX: Size[] = [0, 1, 1, 2];

/** Days 6–35, one chapter to a block: the numbers for the day, its third stamp, and its mechanics. */
interface Later {
  name: string; speed: number; houses: number; orders: number; urgent: number; cod: number; note: 10 | 20;
  sizes: Size[]; challenge: Challenge; intro: string; feats: Feats; teach?: Feat[];
}
const L = (
  name: string, speed: number, houses: number, orders: number, urgent: number, cod: number, note: 10 | 20,
  sizes: Size[], challenge: Challenge, intro: string, feats: Feats, teach?: Feat[],
): Later => ({ name, speed, houses, orders, urgent, cod, note, sizes, challenge, intro, feats, teach });
const LATER: Later[] = [
  // 初夏 · 荷花塘
  L('荷花开了', 50, 8, 8, 1, 1, 10, [0, 0, 1, 1], noFall, '花苞荷叶站久了会沉，快跳走', { bud: 7 }, ['bud']),
  L('乌龟渡河', 52, 8, 8, 1, 1, 10, [0, 0, 1], multi(3), '乌龟背会游，搭个顺风车', { bud: 4, turtle: 4 }, ['turtle']),
  L('兔小妹的婚礼', 48, 8, 7, 1, 1, 20, [1, 1, 2], intact('易碎件一个都不碎'), '婚礼用品易碎，别跳太猛', { fragile: 3, bud: 3, turtle: 2 }, ['fragile']),
  L('冰棍要化了', 56, 9, 9, 2, 1, 20, [0, 0, 1], intact('冷藏件、易碎件全部完好'), '冷藏件出了车就开始化', { cold: 3, fragile: 1, bud: 3, turtle: 2 }, ['cold']),
  L('盛夏考核', 58, 9, 10, 2, 2, 20, MIX, noWet, '考考你：这一章学的都会遇到', { owl: 1, bud: 4, turtle: 2, fragile: 2, cold: 2 }),
  // 雨季 · 急流峡
  L('峡谷入口', 54, 9, 9, 1, 1, 20, MIX, noFall, '急流带里荷叶晃得厉害', { rapids: 2 }, ['rapids']),
  L('河狸的水坝', 56, 9, 9, 1, 1, 20, MIX, { kind: 'returns', label: '退货件全部收回' }, '河狸修了水坝，还有退货要收', { dam: 2, return: 2, rapids: 1 }, ['dam', 'return']),
  L('下雨了', 58, 9, 10, 2, 1, 20, MIX, noWet, '雨天石头滑，别泡了包裹', { slip: 6, rain: 1, rapids: 1 }, ['slip']),
  L('漩涡湾', 60, 10, 10, 2, 2, 20, MIX, fast(20), '漩涡卷着荷叶转，看准再跳', { whirl: 3, slip: 3, rain: 1 }, ['whirl']),
  L('暴雨夜班', 64, 10, 10, 3, 2, 20, [1, 2, 2, 1], noWrong, '超难关：暴雨夜，送对五成就算过', { storm: 1, rain: 1, slip: 3, whirl: 1 }, ['storm']),
  // 秋 · 枫叶溪
  L('枫叶飘落', 54, 9, 9, 1, 1, 20, MIX, noFall, '落叶只能踩一次', { leaf: 8 }, ['leaf']),
  L('起风了', 56, 9, 10, 1, 1, 20, MIX, fast(18), '起风了，风里跳会被吹偏', { gust: 1, leaf: 4 }, ['gust']),
  L('猫头鹰跟车日', 54, 9, 9, 2, 2, 20, MIX, noWrong, '经理跟车，会提醒下一家要什么', { owl: 2, leaf: 4, gust: 1 }, ['owl']),
  L('萤火虫夜路', 56, 10, 10, 1, 1, 20, MIX, noFall, '天黑了，萤火虫照亮荷叶', { night: 1, leaf: 3 }, ['night']),
  L('双十一爆仓', 50, 10, 16, 3, 2, 20, [0, 0, 0, 1], allIn, '包裹堆成山，半路还会补货', { bulk: 3, gust: 1, leaf: 3 }, ['bulk']),
  // 冬 · 冰河
  L('初雪', 56, 9, 9, 1, 1, 20, MIX, noFall, '浮冰会慢慢转，落脚点要看准', { floe: 7, snow: 1 }, ['floe']),
  L('薄冰', 58, 9, 10, 1, 2, 20, MIX, noWet, '薄冰踩两次就会裂', { thin: 7, floe: 3, snow: 1 }, ['thin']),
  L('熊宝宝在冬眠', 54, 9, 9, 1, 1, 20, MIX, { kind: 'quiet', label: '没吵醒熊宝宝' }, '熊宝宝在冬眠，它家附近轻轻跳', { quiet: 1, floe: 3, thin: 2, snow: 1 }, ['quiet']),
  L('冰河急弯', 62, 10, 10, 2, 2, 20, MIX, intact('保温件全部热乎乎送到'), '保温件放久了会凉', { warm: 3, thin: 3, floe: 3, snow: 1 }, ['warm']),
  L('暴风雪', 66, 10, 10, 3, 2, 20, [1, 2, 2, 1], noWrong, '超难关：暴风雪，送对五成就算过', { blizzard: 1, snow: 1, floe: 3, thin: 2 }, ['blizzard']),
  // 年末 · 港口集市
  L('港口初到', 58, 10, 10, 1, 1, 20, MIX, noFall, '港口有栈桥和渡船', { pier: 3, ferry: 3 }, ['pier', 'ferry']),
  L('起重机', 60, 10, 10, 2, 1, 20, [1, 1, 2, 2], multi(2), '跳上吊钩荡过去', { hook: 3, pier: 2, ferry: 2 }, ['hook']),
  L('海鸥来了', 62, 10, 10, 2, 2, 20, MIX, { kind: 'noSnatch', label: '包裹没被海鸥叼走' }, '海鸥会来叼包裹，点它赶走', { gull: 1, pier: 2, ferry: 2 }, ['gull']),
  L('年货大集', 64, 10, 10, 2, 3, 20, MIX, { kind: 'noPeck', label: '没被大鹅啄下水' }, '大鹅看门，催单件别拖', { goose: 2, nag: 3, pier: 2, gull: 1 }, ['goose', 'nag']),
  L('除夕最后一单', 66, 10, 10, 3, 3, 20, [0, 1, 1, 2], allIn, '除夕夜最后一班，把包裹都送到', { fireworks: 1, ferry: 2, hook: 2, pier: 2 }, ['fireworks']),
  // 早春 · 环河联运: no new mechanics, the year's ones two by two, and everything on the last day
  L('冰河解冻', 60, 10, 10, 2, 2, 20, MIX, intact('易碎件一个都不碎'), '浮冰上送易碎件，脚下要稳', { floe: 6, thin: 2, fragile: 3 }),
  L('春风落叶', 62, 10, 10, 2, 2, 20, MIX, noFall, '阵风里踩落叶，看准风向', { gust: 1, leaf: 7, turtle: 2 }),
  L('渡口冷链', 62, 10, 11, 3, 2, 20, MIX, fast(18), '渡船来回开，冷藏件别化了', { ferry: 4, pier: 2, cold: 3, rapids: 1 }),
  L('夜雨急流', 64, 10, 10, 2, 2, 20, MIX, { kind: 'returns', label: '退货件全部收回' }, '夜里下雨，急流里收退货', { night: 1, rain: 1, rapids: 2, slip: 3, return: 2 }),
  L('环河大联运', 68, 11, 12, 3, 3, 20, MIX, allIn, '全河段大联运：一年的本事全用上', { bud: 3, turtle: 2, whirl: 1, leaf: 3, floe: 3, ferry: 2, hook: 1, fragile: 2, cold: 2, gull: 1 }),
];

for (const [i, d] of LATER.entries()) {
  const day = 6 + i;
  const c: DayConfig = {
    day, length: d.houses * 970 + 100, speed: d.speed, houses: d.houses, orders: d.orders, urgent: d.urgent, sizes: d.sizes, bagSlots: 4, predictDelay: 1.2,
    markTargets: false, tutorial: false, seed: day * 101, name: d.name, ordered: false, cod: d.cod, codNote: d.note, challenge: d.challenge, intro: d.intro,
    brief: { title: `第${day}天 · ${d.name}`, rows: [] }, feats: d.feats, teach: d.teach,
  };
  c.brief.rows = laterBrief(c, DAYS[DAYS.length - 1]);
  DAYS.push(c);
}

/**
 * The hidden day, 第0号快递: the old turtle's first letter, never sent, taken up a stretch of the
 * river no route goes, with a few parcels for the neighbours up there. It opens once all the lost
 * letters are found; the letter is what counts (see `passed`).
 */
export const SECRET: DayConfig = {
  day: 0, length: 7 * 970 + 100, speed: 50, houses: 7, orders: 7, urgent: 0, sizes: [0, 0, 1], bagSlots: 4, predictDelay: 1.2,
  markTargets: false, tutorial: false, seed: 4242, name: '第0号快递', ordered: false, cod: 0, codNote: 10,
  challenge: allIn, intro: '把乌龟爷爷的信送到上游', feats: { turtle: 3, bud: 3, leaf: 3, night: 1 }, secret: true,
  brief: {
    title: '第0号快递',
    rows: [
      ['letter', '乌龟爷爷几十年前【没寄出的信】'],
      ['code', '送到上游最远的那户人家'],
      ['lily1', '这段河道【从没人走过】'],
      ['frog_nervous', '天快亮了，萤火虫会【照亮荷叶】'],
    ],
  },
};

/**
 * The briefing rows of a day from 6 on, made from the day's own numbers so they can't promise anything
 * untrue: the parcels, a new chapter, the storm days' lower bar, the day's mechanics (the new ones
 * first), urgent and cash-on-delivery parcels, the river against the day before, and what the parcels
 * are like. When that's more than the card holds, the least important rows are left out.
 */
function laterBrief(c: DayConfig, prev: DayConfig): [string, string][] {
  const rows: { prio: number; row: [string, string] }[] = [];
  const add = (prio: number, icon: string, line: string) => rows.push({ prio, row: [icon, line] });
  add(0, 'code', `今天【${c.orders} 单】 · ${c.houses} 户人家`);
  const ch = chapterOf(c.day);
  if (ch !== chapterOf(prev.day)) add(1, 'flag', `新的一章：【${CHAPTERS[ch].title}】`);
  if (HARD_DAYS.includes(c.day)) add(1, 'frog_nervous', `超难关！送对【${'零一二三四五六七八九十'[Math.round(passRate(c.day) * 10)]}成】就算过`);
  // the day's mechanics: the new ones right after the headline, the others when there's room
  for (const [f, n] of Object.entries(c.feats) as [Feat, number][]) {
    if (!n || f === 'rain' || f === 'snow') continue;
    add(c.teach?.includes(f) ? 1.5 : 3.5, `feat:${f}`, FEAT_INFO[f].brief(n));
  }
  if (c.urgent) add(2, 'box0u', `【加急件 ${c.urgent} 个】，准时送到有奖金`);
  if (c.cod) add(3, 'cod', `【到付件 ${c.cod} 个】，住户付 ${c.codNote} 元`);
  add(4, 'lily1', c.speed > prev.speed ? '河水比昨天【更急】，别掉队！' : c.speed < prev.speed ? '河水比昨天【缓一些】' : '河水和昨天【一样快】');
  const small = c.sizes.filter((s) => s === 0).length / c.sizes.length;
  if (!small) add(5, 'box2', '全是【中大件】，占背包又重');
  else if (small >= 0.6) add(5, 'box0', '【小件】多，一趟能多背几个');
  const keep = new Set([...rows].sort((a, b) => a.prio - b.prio).slice(0, BRIEF_MAX));
  return rows.filter((r) => keep.has(r)).map((r) => r.row);
}

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
