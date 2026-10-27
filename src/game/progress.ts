// How a finished day counts toward progress: whether it's passed, and which of its three stamps it earned.
import { passRate, type DayConfig } from './config';
import type { DayResult } from './hq';

/** The three stamps of every day: done on time, done well, and the day's own challenge. */
export const STAMP_NAMES = ['准时下班', '干得漂亮', '今日挑战'] as const;
export const STAMP_GLYPHS = ['准', '优', '挑'] as const;

export function stampRules(cfg: DayConfig): string[] {
  return [`送对${Math.round(passRate(cfg.day) * 10)}成以上，没被甩出去`, '猫头鹰评级 A 或 S', cfg.challenge.label];
}

/** Passing unlocks the next day: not thrown off, and enough parcels to the right house. On 第0号快递 it's the letter that counts. */
export function passed(r: DayResult) {
  if (r.day === 0) return !!r.oldLetter;
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
  else if (ch.kind === 'clean') third = r.wrong === 0 && r.wet === 0;
  else {
    // the chapters' challenges, from the mechanics' tallies
    const f = r.feats;
    if (!f) third = false;
    else if (ch.kind === 'intact') third = f.careful > 0 && f.careOk === f.careful;
    else if (ch.kind === 'returns') third = f.returns > 0 && f.returned === f.returns;
    else if (ch.kind === 'quiet') third = f.woke === 0;
    else if (ch.kind === 'noSnatch') third = f.snatched === 0;
    else third = f.pecked === 0;
  }
  // the extra stamps only count on a day that was finished properly
  return [ok, ok && (grade === 'S' || grade === 'A'), ok && third];
}
