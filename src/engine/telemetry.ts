// Anonymous play statistics for the test build: what testers actually do, so the game can be tuned
// without asking them to describe it. Nothing personal is collected: a random id kept on the device,
// a few coarse device facts (system, browser, screen size) and game events. See docs/telemetry.md.
//
// Events wait in storage until they're accepted by the server, so a dropped connection, a closed tab
// or a build without a server just sends them later. Every row has its own id and the server ignores
// repeats, so sending twice is harmless.

import type { Platform } from '../platform/types';

/** Supabase project the events go to (the publishable key is meant to sit in client code). Empty: keep events on the device. */
const ENDPOINT: string = 'https://oitbtkfwybkuqddqggsg.supabase.co';
const KEY: string = 'sb_publishable_iUroq94LRRYbyfo0EKXsWw_2nb8yCt9';
const TABLE = 'events';
const SENDING = !!(ENDPOINT && KEY);

declare const __BUILD__: string;
const BUILD = typeof __BUILD__ === 'string' ? __BUILD__ : 'dev';

const STATE_KEY = 'waqu.tm.v1';
const QUEUE_KEY = 'waqu.tmq.v1';
/** Rows kept on the device while they can't be sent; past this, new ones are dropped (the first plays matter most). */
const QUEUE_MAX = 1500;
const BATCH = 200;
/** keepalive requests (sent as the page goes away) are capped at 64 KB by browsers. */
const KEEPALIVE_BYTES = 60000;
const FLUSH_SEC = 5;
/** With nowhere to send to, the backlog is only saved now and then. */
const HOLD_SEC = 30;
/** Writing the backlog to storage stalls a phone for a moment, so it's done rarely; leaving the page always saves. */
const SAVE_SEC = 30;

export type Data = Record<string, unknown>;

interface Row {
  id: string;
  pid: string;
  sid: string;
  v: string;
  ev: string;
  day: number | null;
  run: number;
  /** Seconds into the run (play time, pauses excluded), for events during a day. */
  t: number | null;
  /** Milliseconds since the page opened. */
  ts: number;
  d: Data;
}

interface State {
  pid: string;
  visits: number;
  /** Per-device counters, e.g. how many times each day was started. */
  n: Record<string, number>;
  off?: boolean;
}

function rid(n: number) {
  const a = 'abcdefghijkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < n; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
}

export interface TelemetryOptions {
  /** 'off' stops collecting on this device for good, 'on' starts again (e.g. from ?tm=off / ?tm=on). */
  toggle?: 'on' | 'off' | null;
  /** Local development: nothing is collected unless toggled on. */
  dev?: boolean;
}

export class Telemetry {
  readonly sid = rid(10);
  readonly enabled: boolean;
  /** The day being played and which play of this page it is, stamped on every row. */
  day: number | null = null;
  run = 0;
  private st: State;
  private seq = 0;
  private q: Row[] = [];
  /** Rows in the request that's out right now. */
  private out = 0;
  private dirty = false;
  private next = 0;
  private nextSave = 0;
  private backoff = FLUSH_SEC;
  /** Rows per request; halved while the server refuses a batch, to find the one row it won't take. */
  private batch = BATCH;
  private t0: number;

  constructor(private platform: Platform, opts: TelemetryOptions = {}) {
    this.t0 = platform.now();
    let st: State | null = null;
    try {
      st = JSON.parse(platform.storageGet(STATE_KEY) ?? 'null');
    } catch {
      /* start over */
    }
    if (!st || typeof st.pid !== 'string') st = { pid: rid(12), visits: 0, n: {} };
    st.n ??= {};
    st.visits++;
    if (opts.toggle === 'off') st.off = true;
    if (opts.toggle === 'on') delete st.off;
    this.st = st;
    this.enabled = !st.off && (!opts.dev || opts.toggle === 'on');
    platform.storageSet(STATE_KEY, JSON.stringify(st));
    if (!this.enabled) return;
    try {
      const old = JSON.parse(platform.storageGet(QUEUE_KEY) ?? '[]');
      if (Array.isArray(old)) this.q = old.slice(0, QUEUE_MAX);
    } catch {
      /* ignore */
    }
  }

  get pid() {
    return this.st.pid;
  }
  get visits() {
    return this.st.visits;
  }

  /** Bumps a per-device counter and returns the new count (e.g. attempts at a day). */
  count(key: string) {
    const n = (this.st.n[key] ?? 0) + 1;
    this.st.n[key] = n;
    this.platform.storageSet(STATE_KEY, JSON.stringify(this.st));
    return n;
  }

  log(ev: string, d: Data = {}, t: number | null = null) {
    if (!this.enabled || this.q.length >= QUEUE_MAX) return;
    this.q.push({
      id: `${this.sid}-${this.seq++}`,
      pid: this.st.pid,
      sid: this.sid,
      v: BUILD,
      ev,
      day: this.day,
      run: this.run,
      t: t === null ? null : Math.round(t * 10) / 10,
      ts: Math.round(this.platform.now() - this.t0),
      d,
    });
    this.dirty = true;
  }

  /** Called every frame: saves new rows now and then and sends them in batches. */
  tick() {
    if (!this.enabled) return;
    const now = this.platform.now();
    // every few seconds, or straight away while there's a backlog and the server is answering
    const backlog = SENDING && !this.out && this.backoff === FLUSH_SEC && this.q.length >= 50;
    if (now < this.next && !backlog) return;
    this.next = now + (SENDING ? this.backoff : HOLD_SEC) * 1000;
    if (now >= this.nextSave) {
      this.nextSave = now + SAVE_SEC * 1000;
      this.save();
    }
    void this.send(false);
  }

  /** The page is going away (or to the background): keep everything and try one last send. */
  hide() {
    if (!this.enabled) return;
    this.save();
    void this.send(true);
  }

  /** Something important just happened (an error): send it soon. */
  soon() {
    this.next = Math.min(this.next, this.platform.now() + 500);
  }

  private save() {
    if (!this.dirty) return;
    this.dirty = false;
    this.platform.storageSet(QUEUE_KEY, JSON.stringify(this.q));
  }

  private async send(keepalive: boolean) {
    if (!SENDING || this.out || !this.q.length) return;
    let rows = this.q.slice(0, this.batch);
    let body = JSON.stringify(rows);
    while (keepalive && body.length > KEEPALIVE_BYTES && rows.length > 1) {
      rows = rows.slice(0, Math.ceil(rows.length / 2));
      body = JSON.stringify(rows);
    }
    this.out = rows.length;
    const headers: Record<string, string> = { apikey: KEY, Prefer: 'return=minimal,resolution=ignore-duplicates' };
    // legacy anon keys are JWTs and go in Authorization too; the newer sb_publishable_ keys don't
    if (KEY.startsWith('eyJ')) headers.Authorization = `Bearer ${KEY}`;
    const status = await this.platform.postJson(`${ENDPOINT}/rest/v1/${TABLE}?on_conflict=id`, body, headers, keepalive);
    this.out = 0;
    if (status >= 200 && status < 300) {
      const sent = new Set(rows.map((r) => r.id));
      this.q = this.q.filter((r) => !sent.has(r.id));
      this.dirty = true;
      this.backoff = FLUSH_SEC;
      this.batch = BATCH;
    } else if (status === 400 || status === 409 || status === 413 || status === 422) {
      // the server refuses something in this batch as it is: narrow it down, and drop a single row it won't take
      // (a wrong key or a missing table answers 401/404 instead, and those rows wait for the fix)
      if (rows.length > 1) this.batch = Math.ceil(rows.length / 2);
      else {
        this.q = this.q.filter((r) => r.id !== rows[0].id);
        this.dirty = true;
        this.save();
        this.batch = BATCH;
      }
    } else this.backoff = Math.min(60, this.backoff * 2);
  }
}
