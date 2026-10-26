// How a finished day counts toward progress: whether it's passed, and which of its three stamps it earned.
import { passRate, type DayConfig } from './config';
import type { DayResult } from './hq';

/** The three stamps of every day: done on time, done well, and the day's own challenge. */
export const STAMP_NAMES = ['准时下班', '干得漂亮', '今日挑战'] as const;
export const STAMP_GLYPHS = ['准', '优', '挑'] as const;

export function stampRules(cfg: DayConfig): string[] {
  return [`送对${Math.round(passRate(cfg.day) * 10)}成以上，没被甩出去`, '猫头鹰评级 A 或 S', cfg.challenge.label];
}

/** Passing unlocks the next day: not thrown off, and enough parcels to the right house. */
export function passed(r: DayResult) {
  return !r.thrown && r.delivered >= Math.ceil(r.total * passRate(r.day));
}

export function earnedStamps(cfg: DayConfig, r: DayResult, grade: string): [boolean, boolean, boolean] {
  const ok = passed(r);
  const ch = cfg.challenge;
  let third = false;
  if (ch.kind === 'noFall') third = r.falls === 0;
  else if (ch.kind === 'urgentFast') third = r.fastUrgent;
  else if (ch.kind === 'multi') third = r.bestTrip >= ch.n;
  else if (ch.kind === 'codAll') third = r.codOrders > 0 && r.codRight === r.codOrders;
  else if (ch.kind === 'noWrong') third = r.wrong === 0;
  else if (ch.kind === 'all') third = r.delivered === r.total;
  else third = r.wrong === 0 && r.wet === 0;
  // the extra stamps only count on a day that was finished properly
  return [ok, ok && (grade === 'S' || grade === 'A'), ok && third];
}
