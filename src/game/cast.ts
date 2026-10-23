// Who lives on the river and what they live in. Residents and houses are picked separately,
// so any resident can turn up in any house. Positions are in concept units (see sprites.ts K)
// relative to the raft center, like the art.

/** What a resident can be drawn doing: one painted frame each, tweened in code (see resident.ts). */
export const POSES = ['idle', 'wait', 'wave', 'reach', 'cheer', 'puzzled', 'sad', 'walk', 'back'] as const;
export type Pose = (typeof POSES)[number];

/** How a resident gets about: bobbing walk, hops, a side-to-side waddle, sideways, or a slow glide. */
export type Gait = 'walk' | 'hop' | 'waddle' | 'scuttle' | 'glide';

export interface ResidentDef {
  id: string;
  name: string;
  /** One line about them, for the design notes and the HQ records. */
  blurb: string;
  /** Height of the top of the head, and where raised hands hold a parcel up (if not just over the head), concept units. */
  top: number;
  hold?: number;
  /** Walking speed multiplier, and extra seconds before they come to the door. */
  pace: number;
  gait: Gait;
  slow?: number;
  /** Said when the right parcel arrives, and when it's someone else's. */
  thanks: string;
  huh: string;
}

export const RESIDENT_DEFS: ResidentDef[] = [
  { id: 'duck', top: 85, name: '鸭太太', blurb: '爱喝下午茶，围着蓝色小方巾', pace: 0.9, gait: 'waddle', thanks: '正好配下午茶！', huh: '这是我的吗？' },
  { id: 'rabbit', top: 84, name: '兔小妹', blurb: '橙色围巾，蹦蹦跳跳，最爱拆快递', pace: 1.2, gait: 'hop', thanks: '哇！终于到啦！', huh: '咦，我没买这个呀' },
  { id: 'hedgehog', top: 66, name: '刺猬大叔', blurb: '热心肠，老远就挥手打招呼', pace: 1, gait: 'walk', thanks: '辛苦了小青蛙！', huh: '是不是送错啦？' },
  { id: 'turtle', top: 81, name: '乌龟爷爷', blurb: '戴圆眼镜拄拐杖，走得慢，出门要好久', pace: 0.45, gait: 'walk', slow: 1.2, thanks: '好孩子，慢慢来', huh: '老花眼……这不是我的吧' },
  { id: 'otter', top: 89, name: '水獭小哥', blurb: '穿海魂衫，闲不住，在家门口转圈圈', pace: 1.3, gait: 'walk', thanks: '太棒啦，谢谢！', huh: '这个不是我的耶' },
  { id: 'beaver', top: 82, name: '河狸师傅', blurb: '木匠，耳朵上夹铅笔，腰上挂工具', pace: 1, gait: 'walk', thanks: '工具到了，开工！', huh: '尺寸不对啊' },
  { id: 'egret', top: 149, hold: 100, name: '白鹭小姐', blurb: '高高瘦瘦，戴珍珠项链，很讲究', pace: 1.1, gait: 'walk', thanks: '包装很完整，谢谢', huh: '这可不是我订的' },
  { id: 'squirrel', top: 75, name: '松鼠妹妹', blurb: '大尾巴比自己还高，挎着橡果小包', pace: 1.3, gait: 'hop', thanks: '是我的松果！', huh: '里面没有松果吧？' },
  { id: 'raccoon', top: 85, name: '浣熊阿姨', blurb: '系粉围裙，爱干净，收到东西先擦一擦', pace: 1, gait: 'walk', thanks: '擦一擦，真新！', huh: '哎呀，拿错了吧' },
  { id: 'bear', top: 89, name: '熊宝宝', blurb: '穿睡衣戴睡帽，总是刚睡醒', pace: 0.7, gait: 'walk', slow: 0.8, thanks: '哈欠……谢谢你～', huh: '嗯？不是我的……' },
  { id: 'swan', top: 132, hold: 72, name: '天鹅姐姐', blurb: '优雅，戴小金冠，说话轻声细语', pace: 0.9, gait: 'glide', thanks: '真是体贴呢', huh: '恐怕是送错了' },
  { id: 'crab', top: 60, name: '螃蟹老板', blurb: '开杂货铺，戴小草帽，横着走', pace: 1.1, gait: 'scuttle', thanks: '货到了，开张！', huh: '这批货不对！' },
  { id: 'mouse', top: 56, name: '鼠小弟', blurb: '个子最小，背带裤，包裹常比他还大', pace: 1.5, gait: 'walk', thanks: '好、好大的包裹！', huh: '这么大，不是我的吧' },
  { id: 'fox', top: 90, name: '狐狸先生', blurb: '绿马甲、圆眼镜、领结，彬彬有礼', pace: 1, gait: 'walk', thanks: '非常感谢，辛苦了', huh: '恐怕弄错了收件人' },
  { id: 'pig', top: 84, name: '猪奶奶', blurb: '包着碎花头巾，系围裙，总想留你吃饭', pace: 0.75, gait: 'waddle', thanks: '乖孩子，吃个包子再走', huh: '奶奶没买这个呀' },
  { id: 'sheep', top: 81, name: '绵羊阿姨', blurb: '毛茸茸，脖子上挂小铃铛', pace: 0.9, gait: 'walk', thanks: '咩～谢谢你！', huh: '咩？不是我的' },
  { id: 'mole', top: 76, name: '鼹鼠博士', blurb: '怕光戴墨镜，头顶矿灯，挖地道做研究', pace: 0.9, gait: 'walk', thanks: '实验材料到了！', huh: '这个样本不对' },
  { id: 'snail', top: 72, name: '蜗牛婆婆', blurb: '披针织披肩，慢慢悠悠，从不着急', pace: 0.3, gait: 'glide', slow: 1.5, thanks: '不急不急，谢谢呀', huh: '慢着……不是我的' },
  { id: 'pelican', top: 84, name: '鹈鹕大叔', blurb: '退休水手，集邮迷，嘴巴里能装很多东西', pace: 0.9, gait: 'waddle', thanks: '这张邮票我没有！', huh: '哦？地址不对呀' },
  { id: 'cat', top: 85, name: '猫姐姐', blurb: '网购达人，耳朵上系粉蝴蝶结', pace: 1.1, gait: 'walk', thanks: '又到一个，开心！', huh: '我买的不是这个～' },
];

export const RESIDENT: Record<string, ResidentDef> = Object.fromEntries(RESIDENT_DEFS.map((r) => [r.id, r]));

/** Every resident sprite shares this frame (concept units, origin at the feet), so poses line up. */
export const RES_FRAME: [number, number, number, number] = [-84, -196, 84, 20];

export interface HouseDef {
  id: string;
  name: string;
  /** Tall houses hide more of the river above them. */
  tall?: boolean;
  /** Raft half-axes. */
  rx: number;
  ry: number;
  /** Sprite bounds. */
  b: [number, number, number, number];
  /** The front door: center x, bottom y, width, height (arched top). */
  door: { x: number; y: number; w: number; h: number };
  /** Door color, for the door swinging open before there's painted art of it. */
  doorColor: string;
  /** Where the resident waits, where the frog stands to hand over, and the code-tag post. */
  spot: [number, number];
  porch: [number, number];
  plate: [number, number];
  /** Highest point of the roof above the raft center, for keeping lily pads out from behind it. */
  top: number;
}

const NORMAL: HouseDef['b'] = [-176, -264, 176, 100];
const TALL: HouseDef['b'] = [-176, -396, 176, 100];

/**
 * A standard house: raft 140 x 60, the door just off center on the `side` the resident waits,
 * the frog on the other side, and the code post behind the frog.
 */
function house(id: string, name: string, side: 1 | -1, doorColor: string, o: { tall?: boolean; door?: Partial<HouseDef['door']>; top?: number } = {}): HouseDef {
  const door = { x: side * 30, y: -2, w: 52, h: 76, ...o.door };
  return {
    id, name, tall: o.tall, rx: 140, ry: 60, b: o.tall ? TALL : NORMAL, door, doorColor,
    spot: [side * 100, 16], porch: [-side * 50, 30], plate: [-side * 112, -46],
    top: o.top ?? (o.tall ? 370 : 240),
  };
}

export const HOUSE_DEFS: HouseDef[] = [
  // The first three were painted before houses had doors that open; their doors are where the art has them.
  // The rest: door = the leaf inside the frame, measured on the painted art (x center, y bottom, width, height).
  {
    id: 'teapot', name: '茶壶屋', rx: 150, ry: 64, b: [-170, -222, 182, 106], door: { x: 0, y: -2, w: 56, h: 74 }, doorColor: '#3F5E78',
    spot: [-96, -6], porch: [44, 30], plate: [107, -48], top: 210,
  },
  {
    id: 'boot', name: '靴子屋', rx: 128, ry: 56, b: [-150, -306, 150, 96], door: { x: 46, y: -10, w: 44, h: 56 }, doorColor: '#E9824E',
    spot: [96, 12], porch: [-40, 28], plate: [-119, -46], top: 300,
  },
  {
    id: 'can', name: '罐头屋', rx: 120, ry: 52, b: [-160, -236, 160, 96], door: { x: -40, y: -6, w: 36, h: 58 }, doorColor: '#3F5E78',
    spot: [-88, 8], porch: [36, 28], plate: [95, -44], top: 230,
  },
  house('pumpkin', '南瓜屋', -1, '#94683F', { door: { x: -20, y: -4, w: 40, h: 63 } }),
  house('mushroom', '蘑菇屋', 1, '#C19468', { top: 250, door: { x: 27, y: -2, w: 52, h: 72 } }),
  house('stump', '树桩屋', -1, '#7FB069', { door: { x: -17, y: -4, w: 46, h: 65 } }),
  house('acorn', '橡果屋', 1, '#E9824E', { door: { x: 36, y: 2, w: 43, h: 63 } }),
  house('barrel', '木桶屋', -1, '#3F5E78', { door: { x: -20, y: 3, w: 42, h: 66 } }),
  house('milk', '牛奶盒屋', 1, '#E9824E', { tall: true, top: 330, door: { x: 37, y: 4, w: 43, h: 60 } }),
  house('shell', '海螺屋', -1, '#5FA9A3', { door: { x: -23, y: -3, w: 40, h: 58 } }),
  house('strawberry', '草莓屋', 1, '#F4E9C8', { door: { x: 38, y: -1, w: 55, h: 68 } }),
  house('lantern', '灯笼屋', -1, '#E8B74A', { door: { x: -25, y: -6, w: 52, h: 64 } }),
  house('beehive', '蜂巢屋', 1, '#94683F', { door: { x: 30, y: -1, w: 45, h: 69 } }),
  house('mailbox', '邮筒屋', -1, '#E8B74A', { tall: true, top: 340, door: { x: -27, y: -5, w: 54, h: 75 } }),
  house('basket', '野餐篮屋', 1, '#D9534F', { door: { x: 33, y: 2, w: 45, h: 62 } }),
  house('gourd', '葫芦屋', -1, '#94683F', { tall: true, top: 370, door: { x: -21, y: -1, w: 55, h: 71 } }),
  house('lighthouse', '灯塔屋', 1, '#3F5E78', { tall: true, top: 380, door: { x: 23, y: -5, w: 39, h: 54 } }),
  house('clock', '闹钟屋', -1, '#3F5E78', { door: { x: -25, y: -8, w: 40, h: 53 } }),
  house('spool', '线轴屋', 1, '#E9824E', { door: { x: 34, y: -9, w: 43, h: 57 } }),
  house('books', '书堆屋', -1, '#4F8A4B', { tall: true, top: 320, door: { x: -25, y: 4, w: 45, h: 59 } }),
];

export const HOUSE: Record<string, HouseDef> = Object.fromEntries(HOUSE_DEFS.map((h) => [h.id, h]));
