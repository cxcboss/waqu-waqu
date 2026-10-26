// Everything the 福利社 (staff shop) sells, and what the frog's gear does on the river.
// Only gear changes how the game plays; hats, room furniture and photo frames are just for looks.

export type GearId = 'bag' | 'shoe' | 'fin';

export interface GearDef {
  id: GearId;
  name: string;
  sprite: string;
  /** What it looks like at each level, from level 1. */
  looks: string[];
  /** Coins to go from level n to n + 1 (index 0 buys level 2). */
  prices: number[];
  desc: string;
  effect(lv: number): string;
}

export const GEAR: GearDef[] = [
  {
    id: 'bag', name: '邮差包', sprite: 'gear_bag',
    looks: ['帆布小挎包', '双扣邮差包', '大号皮包', '反光条专业包', '金扣大邮包'],
    prices: [60, 150, 300, 500],
    desc: '包越大，一趟能装越多；最后两级背着更轻',
    effect: (lv) => {
      const more = bagSlots(lv), light = bagLight(lv);
      if (!more) return '背包格数和当天一样';
      return light ? `背包多 ${more} 格，负重影响 −${Math.round(light * 100)}%` : `背包多 ${more} 格（最多 ${MAX_SLOTS} 格）`;
    },
  },
  {
    id: 'shoe', name: '弹力鞋', sprite: 'gear_shoe',
    looks: ['光脚', '草编鞋', '帆布球鞋', '气垫鞋', '弹簧鞋'],
    prices: [80, 180, 350, 600],
    desc: '跳得更远，背着重包也不太吃力',
    effect: (lv) => (lv > 1 ? `最远跳跃 +${5 * (lv - 1)}%，负重影响 −${10 * (lv - 1)}%` : '没有加成'),
  },
  {
    id: 'fin', name: '脚蹼', sprite: 'gear_fin',
    looks: ['光脚', '橡胶脚蹼', '长脚蹼', '鸭掌蹼', '螺旋桨脚蹼'],
    prices: [50, 120, 240, 400],
    desc: '掉进河里游得更快，只在游泳时露出来',
    effect: (lv) => (lv > 1 ? `游泳推力 +${10 * (lv - 1)}%` : '没有加成'),
  },
];

export const gearDef = (id: GearId) => GEAR.find((g) => g.id === id)!;
export const gearMax = (id: GearId) => gearDef(id).prices.length + 1;

/** What the frog's gear adds up to on the river. */
export interface GearEffects {
  /** Extra bag slots on top of the day's own. */
  slots: number;
  /** Multipliers: farthest jump, how much a heavy bag shortens it, swim push. */
  jump: number;
  weight: number;
  swim: number;
}

export function gearEffects(gear: Partial<Record<GearId, number>> = {}): GearEffects {
  const lv = (id: GearId) => Math.max(1, Math.min(gearMax(id), gear[id] ?? 1)) - 1;
  const bag = lv('bag') + 1;
  return { slots: bagSlots(bag), jump: 1 + 0.05 * lv('shoe'), weight: (1 - 0.1 * lv('shoe')) * (1 - bagLight(bag)), swim: 1 + 0.1 * lv('fin') };
}

/**
 * The satchel: levels 2 and 3 add a slot each (the day's four plus two fill the six cards the
 * satchel row holds), levels 4 and 5 make a full bag weigh on the jump less.
 */
function bagSlots(lv: number) {
  return Math.min(2, lv - 1);
}
function bagLight(lv: number) {
  return lv >= 5 ? 0.4 : lv >= 4 ? 0.2 : 0;
}

/** Bags top out here whatever the day starts with: six cards is all the satchel row on screen holds. */
export const MAX_SLOTS = 6;

export type ItemKind = 'hat' | 'neck' | 'deco' | 'frame';

export interface Item {
  id: string;
  kind: ItemKind;
  name: string;
  /** Coins, or null for things that can't be bought (achievement rewards). */
  price: number | null;
  desc: string;
  /** How to get it when it isn't for sale. */
  from?: string;
}

export const ITEMS: Item[] = [
  // hats sit over the courier cap; the flower pin goes on it
  { id: 'hat_straw', kind: 'hat', name: '草帽', price: 120, desc: '夏天送件不怕晒' },
  { id: 'hat_flower', kind: 'hat', name: '荷花发卡', price: 100, desc: '别在帽子上的一朵小荷花' },
  { id: 'hat_beanie', kind: 'hat', name: '毛线帽', price: 160, desc: '耳朵（假装有）不怕冷' },
  { id: 'hat_beret', kind: 'hat', name: '贝雷帽', price: 200, desc: '看起来很有艺术细胞' },
  { id: 'hat_top', kind: 'hat', name: '小礼帽', price: 300, desc: '送请柬的时候戴上它' },
  { id: 'hat_pilot', kind: 'hat', name: '飞行员帽', price: null, desc: '跳得像飞一样的证明', from: '成就「河湾飞人」' },
  { id: 'hat_swim', kind: 'hat', name: '黄色泳帽', price: null, desc: '落水五十次的光荣勋章', from: '成就「落汤蛙」' },
  { id: 'hat_gold', kind: 'hat', name: '金色邮差帽', price: null, desc: '春天的好评章一枚不落', from: '成就「春天全勤」' },
  { id: 'neck_scarf', kind: 'neck', name: '红围巾', price: 150, desc: '风一吹就飘起来' },
  { id: 'neck_bow', kind: 'neck', name: '小领结', price: 120, desc: '正式场合必备' },
  { id: 'neck_camera', kind: 'neck', name: '胸前小相机', price: null, desc: '随时抓拍精彩瞬间', from: '成就「摄影师」' },
  // the frog's room
  { id: 'deco_rug', kind: 'deco', name: '荷叶地毯', price: 80, desc: '踩上去软软的' },
  { id: 'deco_plant', kind: 'deco', name: '小盆栽', price: 60, desc: '每天记得浇水' },
  { id: 'deco_clock', kind: 'deco', name: '布谷钟', price: 90, desc: '整点会叫，提醒你别迟到' },
  { id: 'deco_lights', kind: 'deco', name: '星星串灯', price: 100, desc: '挂在照片墙上，晚上亮晶晶' },
  { id: 'deco_lamp', kind: 'deco', name: '蘑菇台灯', price: 120, desc: '写工作日志时用' },
  { id: 'deco_fish', kind: 'deco', name: '小鱼缸', price: 150, desc: '里面住着一条不爱说话的鱼' },
  { id: 'deco_shelf', kind: 'deco', name: '书架', price: 180, desc: '《如何快速游泳》第三版' },
  { id: 'deco_record', kind: 'deco', name: '唱片机', price: 220, desc: '放一首河湾小调' },
  { id: 'deco_curtain', kind: 'deco', name: '碎花窗帘', price: 110, desc: '拉开是风景，拉上是午睡' },
  { id: 'deco_cushion', kind: 'deco', name: '荷叶坐垫', price: 80, desc: '坐上去会不自觉地呱一声' },
  { id: 'deco_flag', kind: 'deco', name: '河湾旗', price: 90, desc: '绣着荷花的小三角旗' },
  { id: 'deco_painting', kind: 'deco', name: '河湾日落', price: 140, desc: '一幅挂在墙上的风景画' },
  { id: 'deco_globe', kind: 'deco', name: '地球仪', price: 170, desc: '转一圈，全是河' },
  { id: 'deco_teatable', kind: 'deco', name: '小茶几', price: 160, desc: '茶刚好，饼干刚出炉' },
  { id: 'deco_hammock', kind: 'deco', name: '吊床', price: 260, desc: '送完最后一单就躺上去' },
  { id: 'deco_trophy', kind: 'deco', name: '奖杯架', price: 300, desc: '放你拿到的每一座小奖杯' },
  // frames for the photo wall at home
  { id: 'frame_wood', kind: 'frame', name: '木相框', price: 0, desc: '最朴素的木框' },
  { id: 'frame_lily', kind: 'frame', name: '荷叶相框', price: 80, desc: '四角各有一片小荷叶' },
  { id: 'frame_shell', kind: 'frame', name: '贝壳相框', price: 120, desc: '从河底捡来的小贝壳' },
  { id: 'frame_gold', kind: 'frame', name: '金相框', price: 250, desc: '最得意的照片放这里' },
];

export const item = (id: string) => ITEMS.find((i) => i.id === id);

/** Owned from the first day. */
export const STARTER_ITEMS = ['frame_wood'];

/** Which day of the year it is (local time), for the shop's daily deal. */
export function dayStamp(now = Date.now()) {
  const d = new Date(now);
  return d.getFullYear() * 1000 + Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 1).getTime()) / 86400000);
}

/** Today's deal: one item for sale at 20% off, different every day. */
export function dailyDeal(now = Date.now()): string {
  const forSale = ITEMS.filter((i) => i.price);
  let h = dayStamp(now) * 2654435761;
  h = (h ^ (h >>> 13)) >>> 0;
  return forSale[h % forSale.length].id;
}

export const DEAL_OFF = 0.8;

export function priceOf(it: Item, now = Date.now()) {
  if (!it.price) return it.price;
  return it.id === dailyDeal(now) ? Math.round(it.price * DEAL_OFF) : it.price;
}
