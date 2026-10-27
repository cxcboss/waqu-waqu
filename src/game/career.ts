// The frog's working life outside a single day: career totals, the work log, river news, the money
// book, ranks and achievements. Everything here is worked out from finished days and kept in the save.
import { GEAR, STARTER_ITEMS, gearMax, item, type GearId } from './catalog';
import { DAYS, YEAR_END, dayLabel } from './config';
import type { SaveData } from './game';
import type { DayResult } from './hq';
import { letterId, letterText } from './lines';
import { mixupLine, openedLine, soakedLine } from './stories';
import { rng, shuffle } from '../engine/math';

export interface Career {
  /** Days worked: every run that reached HQ. */
  runs: number;
  delivered: number;
  wrong: number;
  wet: number;
  missed: number;
  urgent: number;
  urgentOnTime: number;
  cod: number;
  codRight: number;
  falls: number;
  thrown: number;
  jumps: number;
  /** Farthest jump in design units (100 = 1 m). */
  longest: number;
  rescued: number;
  bestTrip: number;
  sGrades: number;
  /** Days with every parcel delivered right and nothing soaked. */
  cleanDays: number;
  earned: number;
  spent: number;
  /** Parcels delivered to each resident, by name. */
  byResident: Record<string, { n: number; species: string }>;
}

/** One page of the work log, written at HQ after every day. */
export interface DayLog {
  n: number;
  day: number;
  at: number;
  grade: string;
  pass: boolean;
  thrown: boolean;
  delivered: number;
  total: number;
  wrong: number;
  wet: number;
  missed: number;
  falls: number;
  income: number;
  stamps: boolean[];
  /** Caption of the day's best photo. */
  photo: string | null;
  owl: string;
  story: string | null;
}

export type NoteKind = 'story' | 'mixup' | 'soaked' | 'letter' | 'stamp' | 'rank' | 'ach';
/** A line of river news (河湾动态). */
export interface Note {
  id: number;
  at: number;
  day: number | null;
  kind: NoteKind;
  text: string;
}

/** A line in the money book. */
export interface Entry {
  at: number;
  text: string;
  amount: number;
}

/** A photo kept in the album; its picture lives in storage under its own key. */
export interface AlbumPhoto {
  id: string;
  caption: string;
  day: number;
  kind: string;
  at: number;
}

export interface Wear {
  hat: string | null;
  neck: string | null;
}

/** The photo wall at home (one entry per frame hook) and furniture put away. */
export interface Room {
  frames: ({ photo: string; frame: string } | null)[];
  hidden: string[];
}

export const FRAME_HOOKS = 6;
const LOG_KEEP = 60;
const NOTES_KEEP = 80;
const LEDGER_KEEP = 80;

export const emptyCareer = (): Career => ({
  runs: 0, delivered: 0, wrong: 0, wet: 0, missed: 0, urgent: 0, urgentOnTime: 0, cod: 0, codRight: 0,
  falls: 0, thrown: 0, jumps: 0, longest: 0, rescued: 0, bestTrip: 0, sGrades: 0, cleanDays: 0, earned: 0, spent: 0,
  byResident: {},
});

/** Days the frog has worked: each day finished at least once (a retry of a day is not another day). */
export const daysWorked = (s: SaveData) => Object.keys(s.best).length;

/** Nothing played yet: no day finished, no stamp, nothing in the work log (old saves may only have some of these). */
export const firstDay = (s: SaveData) => !s.log.length && !Object.keys(s.best).length && !Object.keys(s.stamps).length;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
/** A whole number between lo and hi, or `d` for anything else. */
const int = (v: unknown, d: number, lo = 0, hi = Number.MAX_SAFE_INTEGER) => (isNum(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
/** Keys of a by-day record that are real days. */
const dayKeys = (v: unknown) => (isObj(v) ? Object.keys(v).filter((k) => /^\d+$/.test(k) && +k >= 1 && +k <= DAYS.length) : []);
const GRADE_LETTERS = 'SABCD';
const NOTE_KINDS: NoteKind[] = ['story', 'mixup', 'soaked', 'letter', 'stamp', 'rank', 'ach'];

/**
 * Turns whatever was in storage into a save the game can trust: fills in what older saves don't have
 * yet (v1 saves only knew days, coins and stamps) and repairs anything broken or out of range, so a
 * bad value can't crash a screen or open days that don't exist.
 */
export function upgradeSave(raw: unknown): SaveData {
  const o: Obj = isObj(raw) ? raw : {};
  const s = o as unknown as SaveData;
  s.day = int(o.day, 1, 1, DAYS.length);
  s.coins = int(o.coins, 0);
  s.sound = typeof o.sound === 'boolean' ? o.sound : true;
  s.tips = Object.fromEntries(Object.entries(isObj(o.tips) ? o.tips : {}).filter(([, v]) => typeof v === 'boolean')) as Record<string, boolean>;
  const oldBest = isObj(o.best) ? o.best : {};
  s.best = Object.fromEntries(dayKeys(oldBest).filter((k) => isStr(oldBest[k]) && GRADE_LETTERS.includes(oldBest[k] as string) && (oldBest[k] as string).length === 1).map((k) => [+k, oldBest[k]])) as Record<number, string>;
  const hadStamps = isObj(o.stamps);
  const oldStamps = hadStamps ? (o.stamps as Obj) : {};
  s.stamps = Object.fromEntries(dayKeys(oldStamps).filter((k) => Array.isArray(oldStamps[k])).map((k) => {
    const a = oldStamps[k] as unknown[];
    return [+k, [0, 1, 2].map((i) => a[i] === true)];
  })) as Record<number, boolean[]>;

  s.name = isStr(o.name) && o.name.trim() ? o.name.trim() : '小呱';
  s.since = isNum(o.since) && o.since > 0 ? o.since : Date.now();
  const gear = isObj(o.gear) ? o.gear : {};
  s.gear = Object.fromEntries(GEAR.map((g) => [g.id, int(gear[g.id], 1, 1, gearMax(g.id))])) as Record<GearId, number>;
  s.owned = [...new Set(list(o.owned).filter((id): id is string => isStr(id) && !!item(id)))];
  for (const id of STARTER_ITEMS) if (!s.owned.includes(id)) s.owned.push(id);
  const wear = isObj(o.wear) ? o.wear : {};
  const worn = (v: unknown, kind: string) => (isStr(v) && s.owned.includes(v) && item(v)?.kind === kind ? v : null);
  s.wear = { hat: worn(wear.hat, 'hat'), neck: worn(wear.neck, 'neck') };

  s.album = list(o.album).filter((a): a is AlbumPhoto => isObj(a) && isStr(a.id) && isStr(a.caption) && isNum(a.day) && isStr(a.kind) && isNum(a.at));
  const photos = new Set(s.album.map((a) => a.id));
  const room = isObj(o.room) ? o.room : {};
  const frames = list(room.frames);
  s.room = {
    // a frame holds a photo still in the album, in a frame the frog owns
    frames: Array.from({ length: FRAME_HOOKS }, (_, i) => {
      const f = frames[i];
      if (!isObj(f) || !isStr(f.photo) || !photos.has(f.photo)) return null;
      return { photo: f.photo, frame: isStr(f.frame) && item(f.frame)?.kind === 'frame' && s.owned.includes(f.frame) ? f.frame : STARTER_ITEMS[0] };
    }),
    hidden: list(room.hidden).filter((id): id is string => isStr(id) && !!item(id)),
  };

  const career = isObj(o.career) ? o.career : {};
  const k = emptyCareer();
  for (const key of Object.keys(k) as (keyof Career)[]) if (key !== 'byResident') (k[key] as number) = isNum(career[key]) ? Math.max(0, career[key] as number) : 0;
  const byRes = isObj(career.byResident) ? career.byResident : {};
  for (const [name, e] of Object.entries(byRes)) if (isObj(e) && isNum(e.n) && isStr(e.species)) k.byResident[name] = { n: Math.max(0, e.n), species: e.species };
  s.career = k;
  s.log = list(o.log).filter((e): e is DayLog => isObj(e) && isNum(e.day) && isNum(e.n) && isNum(e.at) && isStr(e.grade) && Array.isArray(e.stamps)).slice(0, LOG_KEEP);
  s.notes = list(o.notes).filter((n): n is Note => isObj(n) && isNum(n.id) && isNum(n.at) && isStr(n.text) && NOTE_KINDS.includes(n.kind as NoteKind)).slice(0, NOTES_KEEP);
  s.ledger = list(o.ledger).filter((e): e is Entry => isObj(e) && isNum(e.at) && isStr(e.text) && isNum(e.amount)).slice(0, LEDGER_KEEP);
  const ach = isObj(o.ach) ? o.ach : {};
  s.ach = Object.fromEntries(Object.entries(ach).filter(([id, at]) => isNum(at) && ACHIEVEMENTS.some((a) => a.id === id))) as Record<string, number>;
  // letters are kept by id; older saves kept their words, and anything that isn't a letter goes
  s.letters = [...new Set(list(o.letters).filter(isStr).map(letterId).filter((id): id is string => !!id))];
  const seen = isObj(o.seen) ? o.seen : {};
  s.seen = { notes: int(seen.notes, 0), letters: int(seen.letters, 0), story: 0, ach: int(seen.ach, 0), map: 1 };
  // note and photo ids come from this counter: never hand out one that's already taken
  const used = [...s.notes.map((n) => n.id), ...s.album.map((a) => Number(a.id.replace(/^p/, '')) || 0)];
  s.seq = Math.max(int(o.seq, 0), ...used, 0);

  // a day passed before later days existed (or before the unlock was saved) still opens the next one
  for (let d = DAYS.length - 1; d >= 1; d--) if (s.stamps[d]?.[0]) { s.day = Math.max(s.day, d + 1); break; }
  // the very first saves had no stamps: a grade there meant the day was finished, which opened the next
  if (!hadStamps) for (const d of Object.keys(s.best).map(Number)) s.day = Math.max(s.day, Math.min(d + 1, DAYS.length));
  s.cleared = o.cleared === true || !!s.stamps[DAYS.length]?.[0];
  // the furthest stop the route map has shown opening; older saves have seen what they have
  s.seen.map = int(seen.map, s.day, 1, s.day);

  const fails = isObj(o.fails) ? o.fails : {};
  s.fails = Object.fromEntries(dayKeys(fails).map((k) => [+k, int(fails[k], 0, 0, 99)]).filter(([, n]) => n > 0)) as Record<number, number>;
  const assist = isObj(o.assist) ? o.assist : {};
  s.assist = Object.fromEntries(dayKeys(assist).filter((k) => assist[k] === true).map((k) => [+k, true])) as Record<number, boolean>;
  const days = (v: unknown, max: number) => [...new Set(list(v).filter((d): d is number => isNum(d) && Number.isInteger(d) && d >= 1 && d <= max))].sort((a, b) => a - b);
  s.skipped = days(o.skipped, DAYS.length).filter((d) => !s.stamps[d]?.[0]);
  s.story = days(o.story, YEAR_END);
  s.seen.story = int(seen.story, 0, 0, s.story.length);
  s.secret = int(o.secret, 0, 0, 2);
  if (s.story.length >= YEAR_END && !s.secret) s.secret = 1;
  // (a save that got past the year's end before there was an ending sees it after its next day at HQ)
  s.ending = o.ending === true;
  return s;
}

// ---------------------------------------------------------------- ranks

export interface Rank {
  name: string;
  /** Stamps needed. */
  need: number;
  perk: string;
  /** Extra share of the day's base pay. */
  pay: number;
}

/**
 * Every rank has its own staff card (badge_rank0…6, shown in the hall). The pay share is the total
 * for that rank, not on top of the last one, and the perk line says what changes. The top rank
 * takes every stamp there is.
 */
export const RANKS: Rank[] = [
  { name: '实习快递员', need: 0, perk: '', pay: 0 },
  { name: '正式快递员', need: 8, perk: '换上正式工牌', pay: 0 },
  { name: '熟练快递员', need: 20, perk: '底薪 +10%', pay: 0.1 },
  { name: '优秀快递员', need: 35, perk: '底薪 +15%', pay: 0.15 },
  { name: '金牌快递员', need: 55, perk: '底薪 +20%，金色工牌', pay: 0.2 },
  { name: '河湾传奇', need: 75, perk: '底薪 +25%', pay: 0.25 },
  { name: '快递之王', need: DAYS.length * 3, perk: '底薪 +30%', pay: 0.3 },
];

export const stampCount = (s: SaveData) => Object.values(s.stamps).flat().filter(Boolean).length;
export const stampsPossible = () => DAYS.length * 3;

export function rankIndex(stamps: number) {
  let i = 0;
  while (i + 1 < RANKS.length && stamps >= RANKS[i + 1].need) i++;
  return i;
}
export const rankOf = (s: SaveData) => RANKS[rankIndex(stampCount(s))];

// ---------------------------------------------------------------- achievements

export interface Achievement {
  id: string;
  name: string;
  desc: string;
  goal: number;
  value(s: SaveData): number;
  coins: number;
  /** An item that can't be bought anywhere else. */
  reward?: string;
}

const c = (s: SaveData) => s.career;
const hats = (s: SaveData) => s.owned.filter((id) => item(id)?.kind === 'hat').length;
const decos = (s: SaveData) => s.owned.filter((id) => item(id)?.kind === 'deco').length;
const maxedGear = (s: SaveData) => GEAR.filter((g) => (s.gear[g.id] ?? 1) >= gearMax(g.id)).length;

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first', name: '第一单', desc: '第一次把包裹送到对的人手里', goal: 1, value: (s) => c(s).delivered, coins: 20 },
  { id: 'deliver30', name: '小有名气', desc: '累计正确送达 30 单', goal: 30, value: (s) => c(s).delivered, coins: 40 },
  { id: 'deliver100', name: '百单快递员', desc: '累计正确送达 100 单', goal: 100, value: (s) => c(s).delivered, coins: 100 },
  { id: 'urgent10', name: '风火轮', desc: '加急件准时送到 10 次', goal: 10, value: (s) => c(s).urgentOnTime, coins: 50 },
  { id: 'cod10', name: '找零高手', desc: '到付件找零正确 10 次', goal: 10, value: (s) => c(s).codRight, coins: 50 },
  { id: 'trip3', name: '顺路达人', desc: '一趟送出 3 个包裹', goal: 3, value: (s) => c(s).bestTrip, coins: 40 },
  { id: 'sgrade', name: '完美的一天', desc: '猫头鹰评级拿到 S', goal: 1, value: (s) => c(s).sGrades, coins: 60 },
  { id: 'clean5', name: '零失误', desc: '5 天不错投、不泡水、全部送完', goal: 5, value: (s) => c(s).cleanDays, coins: 80 },
  { id: 'spring', name: '春天全勤', desc: '第一章 15 枚好评章全部集齐', goal: 15, value: (s) => DAYS.slice(0, 5).reduce((m, d) => m + (s.stamps[d.day] ?? []).filter(Boolean).length, 0), coins: 100, reward: 'hat_gold' },
  { id: 'longjump', name: '河湾飞人', desc: '一跳超过 3.2 米', goal: 320, value: (s) => Math.round(c(s).longest), coins: 50, reward: 'hat_pilot' },
  { id: 'fall1', name: '湿身入职', desc: '第一次掉进河里', goal: 1, value: (s) => c(s).falls, coins: 10 },
  { id: 'fall50', name: '落汤蛙', desc: '累计落水 50 次', goal: 50, value: (s) => c(s).falls, coins: 50, reward: 'hat_swim' },
  { id: 'rescue1', name: '抢救成功', desc: '从河里救回 1 个包裹', goal: 1, value: (s) => c(s).rescued, coins: 20 },
  { id: 'rescue30', name: '舌头神功', desc: '从河里救回 30 个包裹', goal: 30, value: (s) => c(s).rescued, coins: 80 },
  { id: 'thrown1', name: '坐稳了', desc: '被甩出屏幕一次（也算一种经历）', goal: 1, value: (s) => c(s).thrown, coins: 10 },
  { id: 'letter1', name: '拾信人', desc: '捡到一封遗失的信', goal: 1, value: (s) => s.letters.length, coins: 30 },
  { id: 'letter3', name: '信使', desc: '集齐 3 封不一样的遗失的信', goal: 3, value: (s) => s.letters.length, coins: 60 },
  { id: 'runs10', name: '老员工', desc: '上班满 10 天', goal: 10, value: (s) => daysWorked(s), coins: 50 },
  { id: 'album10', name: '摄影师', desc: '相册里收藏 10 张照片', goal: 10, value: (s) => s.album.length, coins: 50, reward: 'neck_camera' },
  { id: 'home1', name: '安家落户', desc: '家里摆上第一件家具', goal: 1, value: decos, coins: 20 },
  { id: 'hats3', name: '时髦青蛙', desc: '拥有 3 顶帽子', goal: 3, value: hats, coins: 40 },
  { id: 'gearmax', name: '全副武装', desc: '任意一件装备升到满级', goal: 1, value: maxedGear, coins: 100 },
];

/** Gives every achievement that's newly reached (with its coins and item) and returns them. */
export function checkAchievements(s: SaveData, now = Date.now()): Achievement[] {
  const out: Achievement[] = [];
  // a reward can push another one over (a hat for 时髦青蛙), so go round until nothing changes
  for (let round = 0; round < 3; round++) {
    let any = false;
    for (const a of ACHIEVEMENTS) {
      if (s.ach[a.id] || a.value(s) < a.goal) continue;
      s.ach[a.id] = now;
      s.coins += a.coins;
      addEntry(s, `成就「${a.name}」`, a.coins, now);
      if (a.reward && !s.owned.includes(a.reward)) s.owned.push(a.reward);
      addNote(s, 'ach', `解锁成就「${a.name}」：${a.desc}${a.reward ? `，奖励${item(a.reward)!.name}` : ''}。`, null, now);
      out.push(a);
      any = true;
    }
    if (!any) break;
  }
  return out;
}

// ---------------------------------------------------------------- book-keeping

export function addNote(s: SaveData, kind: NoteKind, text: string, day: number | null, now = Date.now()) {
  s.seq++;
  s.notes.unshift({ id: s.seq, at: now, day, kind, text });
  if (s.notes.length > NOTES_KEEP) s.notes.length = NOTES_KEEP;
}

export function addEntry(s: SaveData, text: string, amount: number, now = Date.now()) {
  s.ledger.unshift({ at: now, text, amount });
  if (s.ledger.length > LEDGER_KEEP) s.ledger.length = LEDGER_KEEP;
}

export const unreadNotes = (s: SaveData) => s.notes.filter((n) => n.id > s.seen.notes).length;

/** Letters in the mailbox not read yet: lost ones from the road, or the old turtle's from the river. */
export const newMail = (s: SaveData) => s.letters.length > s.seen.letters || s.story.length > s.seen.story;

/** Coins for each stamp earned for the first time. */
export const FIRST_STAMP_COINS = 10;

export interface DayRecord {
  /** Extra coins on top of the day's pay: first stamps, rank bonus, achievements. */
  stampCoins: number;
  rankCoins: number;
  rankUp: Rank | null;
  unlocked: Achievement[];
  notes: Note[];
}

/**
 * Writes a finished day into the career: totals, a work-log page, river news, the money book,
 * and any rank or achievement it brings. `income` is the day's pay as shown on the report.
 */
export function recordDay(
  s: SaveData, r: DayResult,
  o: { grade: string; stamps: boolean[]; fresh: boolean[]; income: number; rankCoins: number; owl: string; pass: boolean },
  now = Date.now(),
): DayRecord {
  const before = rankIndex(stampCount(s) - o.fresh.filter(Boolean).length);
  const after = rankIndex(stampCount(s));
  const k = s.career;
  const ex = r.extra;
  k.runs++;
  k.delivered += r.delivered;
  k.wrong += r.wrong;
  k.wet += r.wet;
  k.missed += r.missed;
  k.urgent += r.urgentTotal;
  k.urgentOnTime += r.urgentOnTime;
  k.cod += r.codTotal;
  k.codRight += r.codRight;
  k.falls += r.falls;
  if (r.thrown) k.thrown++;
  k.bestTrip = Math.max(k.bestTrip, r.bestTrip);
  if (o.grade === 'S') k.sGrades++;
  if (!r.thrown && r.total > 0 && r.delivered === r.total) k.cleanDays++;
  if (ex) {
    k.jumps += ex.jumps;
    k.longest = Math.max(k.longest, ex.longest);
    k.rescued += ex.rescued;
    for (const p of ex.parcels) {
      if (p.state !== 'delivered') continue;
      const e = (k.byResident[p.to] ??= { n: 0, species: p.species });
      e.n++;
    }
    if (ex.letter && letterText(ex.letter) && !s.letters.includes(ex.letter)) s.letters.push(ex.letter);
    if (ex.story && !s.story.includes(ex.story)) {
      s.story = [...s.story, ex.story].sort((a, b) => a - b);
      addNote(s, 'letter', `在河上捡到乌龟爷爷写给阿灰的第 ${ex.story} 封信，放进了家里的信箱。`, r.day, now);
      if (s.story.length >= YEAR_END && !s.secret) {
        s.secret = 1;
        addNote(s, 'letter', '乌龟爷爷的三十封信都找齐了。最后一封说，请把第一封信送到上游——第0号快递开放了，去信箱看看。', r.day, now);
      }
    }
  }

  const stampCoins = o.fresh.filter(Boolean).length * FIRST_STAMP_COINS;
  const total = o.income + stampCoins + o.rankCoins;
  if (total > 0) k.earned += total;
  s.coins = Math.max(0, s.coins + total);
  const name = r.day ? DAYS[r.day - 1]?.name ?? '' : '';
  addEntry(s, `${dayLabel(r.day)}${r.day ? '工资' : ''}${name ? ` · ${name}` : ''}`, o.income + o.rankCoins, now);
  if (stampCoins) addEntry(s, '新好评章奖励', stampCoins, now);

  // river news: a couple of parcels opened, a mix-up, a soaked box, the letter
  const seq0 = s.seq;
  const rand = rng((k.runs * 7919 + r.day * 31) >>> 0);
  let story: string | null = null;
  if (ex) {
    const opened = ex.parcels.filter((p) => p.state === 'delivered');
    const shown = new Set<string>();
    for (const p of shuffle(opened, rand)) {
      if (shown.size >= 2 || shown.has(p.to)) continue;
      shown.add(p.to);
      const line = openedLine(p.to, p.species, rand);
      story ??= line;
      addNote(s, 'story', line, r.day, now);
    }
    const wrong = ex.parcels.find((p) => p.state === 'wrong');
    if (wrong) addNote(s, 'mixup', mixupLine(wrong.to, rand), r.day, now);
    const wet = ex.parcels.find((p) => p.state === 'wet');
    if (wet) addNote(s, 'soaked', soakedLine(wet.owner, rand), r.day, now);
    if (ex.letter && letterText(ex.letter)) addNote(s, 'letter', `在路边捡到一封遗失的信：${letterText(ex.letter)}`, r.day, now);
  }
  const names = ['准时下班', '干得漂亮', '今日挑战'];
  const got = o.fresh.map((f, i) => (f ? names[i] : '')).filter(Boolean);
  if (got.length) addNote(s, 'stamp', `${dayLabel(r.day)}拿到新的好评章：${got.join('、')}。`, r.day, now);
  const rankUp = after > before ? RANKS[after] : null;
  if (rankUp) addNote(s, 'rank', `升职啦！现在是「${rankUp.name}」${rankUp.perk ? `，${rankUp.perk}` : ''}。`, r.day, now);

  s.log.unshift({
    n: k.runs, day: r.day, at: now, grade: o.grade, pass: o.pass, thrown: r.thrown,
    delivered: r.delivered, total: r.total, wrong: r.wrong, wet: r.wet, missed: r.missed, falls: r.falls,
    income: total, stamps: o.stamps, photo: r.photos[0]?.caption ?? null, owl: o.owl, story,
  });
  if (s.log.length > LOG_KEEP) s.log.length = LOG_KEEP;

  const unlocked = checkAchievements(s, now);
  const notes = s.notes.filter((n) => n.id > seq0);
  return { stampCoins, rankCoins: o.rankCoins, rankUp, unlocked, notes };
}

/** Buying something in the shop: coins out, a line in the book, and any achievement it brings. */
export function spend(s: SaveData, text: string, price: number, now = Date.now()) {
  s.coins -= price;
  s.career.spent += price;
  addEntry(s, text, -price, now);
}

export function gearLevel(s: SaveData, id: GearId) {
  return s.gear[id] ?? 1;
}
