// Voluntary rewarded video ads. Nothing here is required to play: when the ad unit is missing,
// unapproved or fails, the game behaves exactly as it did before ads existed.
import type { Game, SaveData } from './game';
import type { RewardedAdReason } from '../platform/types';

export type AdReward = Exclude<RewardedAdReason, 'supply'>;
/** Each supply has its own stock limit, independent of the daily wage and shop gift. */
export const SUPPLY_CAP = 3;

/**
 * wage: one doubling per local day (so coins can't be farmed by replaying a day).
 * revive: NO local daily cap. WeChat caps how many rewarded videos one user can watch a day
 * (undocumented number; once it's used up the platform returns 1004 "no suitable advertisement").
 * That platform cap is the daily ceiling, and adsAvailable() hides the entrance when it's reached.
 * "One revive per run" is enforced separately by PlayScene.reviveDone.
 * gift: one free cosmetic shop item per local day. Only looks, never gear levels, coins or grades.
 */
export const AD_LIMIT: Record<AdReward, number | null> = { wage: 1, revive: null, gift: 1 };

/** The player's own calendar day, so a new day quietly gives a fresh allowance. */
export function adToday(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** How many rewarded videos of this kind are still available today; null means no local cap. */
export function adLeft(s: SaveData, kind: AdReward): number | null {
  const limit = AD_LIMIT[kind];
  if (limit === null) return null;
  if (s.adDay !== adToday()) return limit;
  const used = kind === 'wage' ? s.adWage : kind === 'gift' ? s.adGift : s.adRevive;
  return Math.max(0, limit - used);
}

/** Whether this kind of reward may still be offered. A null limit defers to WeChat's own cap. */
export function adAllowed(s: SaveData, kind: AdReward): boolean {
  const left = adLeft(s, kind);
  return left === null || left > 0;
}

/**
 * Marks one rewarded video as used. Only call once the platform has confirmed the reward.
 * adRevive is kept as a counter for statistics only; it is never used as a gate.
 */
export function adClaim(s: SaveData, kind: AdReward) {
  const today = adToday();
  if (s.adDay !== today) {
    s.adDay = today;
    s.adWage = 0;
    s.adRevive = 0;
    s.adGift = 0;
  }
  if (kind === 'wage') s.adWage++;
  else if (kind === 'gift') s.adGift++;
  else s.adRevive++;
}

/** Shows the ad with the game's own sound out of the way. Never throws, never blocks a run. */
export async function watchAd(game: Game, kind: RewardedAdReason): Promise<boolean> {
  if (!game.platform.showRewardedAd) return false;
  game.audio.suspend();
  try {
    return await game.platform.showRewardedAd(kind);
  } catch {
    return false;
  } finally {
    game.audio.resume();
  }
}
