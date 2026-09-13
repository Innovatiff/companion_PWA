-- 0021_push_delivery.sql
-- Delivering notifications as Web Push, and planning the daily engagement one.
--
-- The two queues from 0009 stay exactly as they are:
--   ALERT       uncapped, immediate, civil protection only
--   ENGAGEMENT  at most one per client per local day, at their notify_hour
-- This adds where to send (push subscriptions), how the sender claims work,
-- and the planner that picks the day's engagement trigger.

create table push_subscriptions (
  id               bigint generated always as identity primary key,
  client_id        uuid not null references clients(id) on delete cascade,
  endpoint         text not null unique,
  p256dh           text not null,
  auth             text not null,
  user_agent       text,
  created_at       timestamptz not null default now(),
  last_success_at  timestamptz,
  last_failure_at  timestamptz,
  last_error       text,
  failures         integer not null default 0,
  disabled_at      timestamptz          -- the push service said the subscription is gone
);

create index push_subscriptions_client_idx on push_subscriptions (client_id) where disabled_at is null;

alter table push_subscriptions enable row level security;
create policy push_subscriptions_owner_read on push_subscriptions for select using (app.is_owner());

alter table notifications
  add column attempts        integer not null default 0,
  add column delivered_count integer not null default 0;

-- Claim due notifications for sending: alerts first, then oldest. Rows are
-- locked so two senders never deliver the same one. After 5 failed attempts a
-- notification stops being claimed and stays 'queued' with its error, visible.
create or replace function app.claim_due_notifications(p_limit integer default 50)
returns setof notifications
language sql
volatile
set search_path = public, app
as $$
  update notifications n
     set attempts = n.attempts + 1
   where n.id in (
     select x.id from notifications x
      where x.status = 'queued' and x.scheduled_for <= now() and x.attempts < 5
      order by (x.channel = 'alert') desc, x.scheduled_for
      limit p_limit
      for update skip locked)
  returning n.*
$$;

-- Record what happened. 'suppressed' is used when the client has no working
-- push subscription: the notification was never shown, and says why.
create or replace function app.finish_notification(p_id bigint, p_status notification_status, p_delivered integer, p_error text)
returns void
language sql
volatile
set search_path = public, app
as $$
  update notifications
     set status = p_status,
         delivered_count = coalesce(p_delivered, 0),
         error = p_error,
         sent_at = case when p_status = 'sent' then now() else sent_at end
   where id = p_id
$$;

-- ---------------------------------------------------------------------------
-- The daily engagement planner.
--
-- For each active client with a working push subscription whose local hour is
-- their notify_hour, queue at most one engagement notification, choosing by
-- priority (0003 app.trigger_priority): match day for their team, then a 30-day
-- FX high, then a lottery draw in their country. queue_engagement_notification
-- keeps it to one per local day. Alerts never pass through here.
-- ---------------------------------------------------------------------------
create or replace function app.plan_engagement(p_now timestamptz default now())
returns integer
language plpgsql
volatile
set search_path = public, app
as $$
declare
  c         record;
  f         record;
  r         record;
  l         record;
  v_today   date;
  v_queued  integer := 0;
  v_result  text;
  v_cur     text;
  v_kick    timestamp;
begin
  for c in
    select cl.id, cl.language::text as lang, cl.timezone, cl.team_id, cl.country, cl.notify_hour
      from clients cl
     where cl.active
       and extract(hour from p_now at time zone cl.timezone) = cl.notify_hour
       and exists (select 1 from push_subscriptions ps where ps.client_id = cl.id and ps.disabled_at is null)
       and not exists (select 1 from notifications n
                        where n.client_id = cl.id and n.channel = 'engagement'
                          and n.local_date = (p_now at time zone cl.timezone)::date)
  loop
    v_today := (p_now at time zone c.timezone)::date;

    -- 1. Their team plays today.
    select fx.id, fx.kickoff_utc, coalesce(t.short_name, t.name) as team,
           coalesce(o.short_name, o.name) as opponent
      into f
      from fixtures fx
      join teams t on t.id = c.team_id
      join teams o on o.id = case when fx.home_team_id = c.team_id then fx.away_team_id else fx.home_team_id end
     where c.team_id is not null
       and (fx.home_team_id = c.team_id or fx.away_team_id = c.team_id)
       and fx.status = 'scheduled'
       and (fx.kickoff_utc at time zone c.timezone)::date = v_today
       and fx.fetched_at >= p_now - interval '6 hours'
     order by fx.kickoff_utc
     limit 1;
    if found then
      v_kick := f.kickoff_utc at time zone c.timezone;
      v_result := app.queue_engagement_notification(c.id, v_today, 'match_day',
        case when c.lang = 'en' then format('%s play today', f.team) else format('Hoy juega %s', f.team) end,
        format('%s vs %s, %s', f.team, f.opponent,
               lower(to_char(v_kick, case when extract(minute from v_kick) = 0 then 'FMHH12AM' else 'FMHH12:MIAM' end))),
        p_now, f.id);
      if v_result in ('queued', 'replaced') then v_queued := v_queued + 1; end if;
      continue;
    end if;

    -- 2. The reference rate is at a 30-day high today.
    v_cur := case c.country::text when 'MX' then 'MXN' when 'HN' then 'HNL' when 'GT' then 'GTQ' when 'JM' then 'JMD' end;
    select x.rate, x.rate_date into r
      from fx_latest_with_context x
     where x.quote = v_cur::fx_currency and x.is_30d_high
       and x.rate_date >= v_today - 1
     order by x.rate_date desc
     limit 1;
    if found then
      v_result := app.queue_engagement_notification(c.id, v_today, 'fx_30d_high',
        case when c.lang = 'en' then 'Reference rate: highest in 30 days' else 'Tasa de referencia: la más alta en 30 días' end,
        format('1 CAD = %s %s', to_char(r.rate, 'FM999999990.00'), v_cur),
        p_now, null);
      if v_result in ('queued', 'replaced') then v_queued := v_queued + 1; end if;
      continue;
    end if;

    -- 3. A lottery draw in their country today. Results only: never odds or a buy link.
    select g.name as game, lr.numbers into l
      from lottery_results lr
      join lottery_games g on g.id = lr.game_id
     where g.country = c.country and g.active
       and lr.draw_date = v_today
     order by lr.draw_time_local desc nulls last, lr.fetched_at desc
     limit 1;
    if found then
      v_result := app.queue_engagement_notification(c.id, v_today, 'lottery',
        case when c.lang = 'en' then format('%s results', l.game) else format('Resultados de %s', l.game) end,
        array_to_string(l.numbers, ' · '),
        p_now, null);
      if v_result in ('queued', 'replaced') then v_queued := v_queued + 1; end if;
    end if;
  end loop;

  return v_queued;
end $$;
