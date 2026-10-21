-- 蛙趣蛙趣 · 试玩数据表。在 Supabase 的 SQL Editor 里整段粘贴、点 Run 即可（重复运行也没关系）。
-- One row per game event. The game (anonymous publishable key) can add rows and read them back.

create table if not exists public.events (
  id   text primary key,               -- "<sid>-<seq>", made on the device; repeats are ignored
  at   timestamptz not null default now(),
  pid  text not null,                  -- random player id kept on the device
  sid  text not null,                  -- one page load
  v    text,                           -- build: "<commit>.<MMDD>"
  ev   text not null,                  -- event name, see docs/telemetry.md
  day  smallint,
  run  smallint,                       -- which play of a day within the page load
  t    real,                           -- seconds into the run (pauses excluded)
  ts   integer,                        -- ms since the page opened
  d    jsonb not null default '{}'::jsonb,
  constraint events_size check (
    char_length(id) <= 64 and char_length(pid) <= 32 and char_length(sid) <= 32
    and char_length(ev) <= 32 and char_length(coalesce(v, '')) <= 32 and pg_column_size(d) <= 4000
  )
);

create index if not exists events_at on public.events (at);
create index if not exists events_pid on public.events (pid, sid, ts);
create index if not exists events_ev on public.events (ev);

alter table public.events enable row level security;

-- adding and reading only: with no policy for changing or removing rows, the API can't do either
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'events' and policyname = 'game adds events') then
    create policy "game adds events" on public.events for insert to anon with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'events' and policyname = 'anyone reads events') then
    create policy "anyone reads events" on public.events for select to anon using (true);
  end if;
end $$;

grant select, insert on public.events to anon;

select 'ok: events table ready' as result;
