// 全解锁版开关：只在用 WAQU_UNLOCK_ALL=1 构建的网页版里生效（vite.config.ts 注入）。
// 小游戏构建走 main.wx.ts，不引用这里；普通网页构建该开关为 false，行为不变。
import { DAYS } from './config';
import { GEAR, ITEMS, gearMax, type GearId } from './catalog';
import { SUPPLY_CAP } from './ads';
import type { SaveData } from './game';

declare const __UNLOCK_ALL__: boolean;
/** 构建期开关（typeof 守卫让没注入该宏的构建也能安全编译运行）。 */
export const UNLOCK_ALL = typeof __UNLOCK_ALL__ !== 'undefined' && __UNLOCK_ALL__;

/** Open the catalog and all routes. Reports, stamps and achievements are earned on the river. */
export function applyUnlockAll(s: SaveData) {
  s.day = DAYS.length;
  s.gear = Object.fromEntries(GEAR.map((g) => [g.id, gearMax(g.id)])) as Record<GearId, number>;
  s.owned = ITEMS.map((i) => i.id);
  s.supplies = { rope: SUPPLY_CAP, wrap: SUPPLY_CAP, whistle: SUPPLY_CAP };
  s.secret = Math.max(1, s.secret);
}
