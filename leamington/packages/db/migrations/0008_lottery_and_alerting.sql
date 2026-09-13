-- 0008_lottery_and_alerting.sql

alter table lottery_games
  add column results_url text,
  -- Recorded so the admin feed-health view can show which games are merely
  -- unbuilt versus genuinely failing. Absence of results must never read as
  -- "there were no draws".
  add column parser_implemented boolean not null default false;

-- ---------------------------------------------------------------------------
-- Owner alerting. Staleness is detected in the DB; delivery is recorded here so
-- the owner is not paged every 15 minutes for the same silent source.
-- ---------------------------------------------------------------------------

create type owner_alert_kind as enum ('feed_stale','feed_error','parser_missing');

create table owner_alerts (
  id            bigint generated always as identity primary key,
  kind          owner_alert_kind not null,
  feed          text not null,
  summary       text not null,
  detail        jsonb,
  opened_at     timestamptz not null default now(),
  -- Set when the feed recovers, so the owner also learns it came back.
  resolved_at   timestamptz,
  last_notified_at timestamptz,
  notify_count  integer not null default 0
);

-- One OPEN alert per feed per kind. Re-detecting the same silence updates the
-- existing row instead of opening a second one.
create unique index owner_alerts_open_idx
  on owner_alerts (feed, kind) where resolved_at is null;

create index owner_alerts_recent_idx on owner_alerts (opened_at desc);

alter table owner_alerts enable row level security;
create policy owner_alerts_owner_read on owner_alerts
  for select using (app.is_owner());

-- ---------------------------------------------------------------------------
-- Feed health, extended for apps/admin.
--
-- Distinguishes, for every feed we EXPECT to run:
--   never_run  — no attempt on record (not the same as "no data")
--   stale      — last success older than the feed's expected interval
--   failing    — last attempt errored
-- so the dashboard can never render silence as health.
-- ---------------------------------------------------------------------------

create table feed_expectations (
  feed              text primary key,
  label             text not null,
  expected_interval interval not null,
  -- Grace before we call it stale; a 15-min feed should not page at 15:01.
  grace             interval not null default interval '10 minutes',
  active            boolean not null default true
);

create or replace view feed_health_detail as
select
  e.feed,
  e.label,
  e.expected_interval,
  h.last_ok_at,
  h.last_attempt_at,
  h.latest_status,
  h.latest_error,
  h.failures_24h,
  case
    when h.last_attempt_at is null then 'never_run'
    when h.last_ok_at is null      then 'never_succeeded'
    when h.last_ok_at < now() - (e.expected_interval + e.grace) then 'stale'
    when h.latest_status = 'error' then 'failing'
    when h.latest_status = 'partial' then 'degraded'
    else 'ok'
  end as health,
  now() - h.last_ok_at as since_last_ok
from feed_expectations e
left join feed_health h on h.feed = e.feed
where e.active;

alter table feed_expectations enable row level security;
create policy feed_expectations_read on feed_expectations
  for select using (auth.role() in ('authenticated','service_role'));
