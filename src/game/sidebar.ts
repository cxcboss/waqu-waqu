// Douyin's 侧边栏复访 ("come back through Douyin's home side bar") is a mandatory capability there:
// the version upload check greps the bundle for tt.navigateToScene, and a reviewer looks for the
// gift entry on the game's home screen. This module holds the gift's bookkeeping — a handful of
// coins, once per local day, only for players who actually arrive from the side bar.
//
// The platform half lives in src/platform/tt.ts (sidebarAvailable / openSidebar / fromSidebar);
// on WeChat and the web those methods are absent, so nothing here ever runs.
import { adToday } from './ads';
import { addEntry } from './career';
import type { Game } from './game';

/** Coins handed over once a day. Small: it's a nudge back into the game, not an economy. */
export const SIDEBAR_GIFT = 66;

/** Whether today's side bar gift is still there for the taking. */
export function sidebarGiftLeft(s: { sideDay: string }): boolean {
  return s.sideDay !== adToday();
}

/** Hands over today's gift if it's due; null when it isn't. */
export function sidebarClaim(game: Game): number | null {
  const s = game.save;
  if (!sidebarGiftLeft(s)) return null;
  s.sideDay = adToday();
  s.sideGift = (s.sideGift ?? 0) + 1;
  s.coins += SIDEBAR_GIFT;
  addEntry(s, '抖音侧边栏礼包', SIDEBAR_GIFT);
  game.writeSave();
  game.tm.log('sidebar_gift', { coins: s.coins });
  return SIDEBAR_GIFT;
}
