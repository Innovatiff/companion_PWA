-- 0042_fx_history_reminders_holidays.sql
-- "Tu dinero" (round 3): the reference-rate chart and week, the member's rate
-- reminder (one push when the reference rate reaches their number), and Ontario
-- public holidays next to the home country's.
--
-- FX stays descriptive: "tasa de referencia" only, never a provider, a ranking,
-- a forecast or advice. Nothing here fills a missing day: a day no source
-- quoted stays missing.

-- ---------------------------------------------------------------------------
-- The "current" rule, shared. It is the rule rate_page (0023) and home_message
-- (0016) already apply: a rate is current while its date is no more than three
-- days before the client's local today, i.e. until local midnight at the start
-- of rate_date + 4 (the home line's valid_until).
-- ---------------------------------------------------------------------------
create or replace function app.fx_currency_for(p_country country_code)
returns fx_currency
language sql
immutable
as $$
  select case p_country::text when 'MX' then 'MXN' when 'HN' then 'HNL'
                              when 'GT' then 'GTQ' when 'JM' then 'JMD' end::fx_currency;
$$;

-- ---------------------------------------------------------------------------
-- Rate history for the chart (7, 30 or 90 days) and the week of the rate.
-- The window ends at the latest stored day, as rate_page's 30 days do, so a
-- stale rate still shows its history; `current` says whether it is current.
-- ---------------------------------------------------------------------------
create or replace function app.fx_history(p_client_id uuid, p_days int, p_now timestamptz default now())
returns jsonb
language plpgsql
stable
set search_path = public, app
as $$
declare
  v_c        clients%rowtype;
  v_today    date;
  v_currency fx_currency;
  v_latest   record;
  v_points   jsonb;
  v_first    numeric;
  v_high     jsonb;
  v_low      jsonb;
  v_up       int;
  v_down     int;
  v_week     jsonb;
begin
  if p_days is null or p_days not in (7, 30, 90) then
    raise exception 'p_days must be 7, 30 or 90, got %', p_days using errcode = 'invalid_parameter_value';
  end if;

  select * into v_c from clients where id = p_client_id and active;
  if not found then
    return null;
  end if;
  v_today := (p_now at time zone v_c.timezone)::date;
  v_currency := app.fx_currency_for(v_c.country);

  select fr.rate_date, fr.rate into v_latest
    from fx_rates fr where fr.quote = v_currency order by fr.rate_date desc limit 1;
  if not found then
    -- Nothing stored: not "no change". Said as absent, with no numbers.
    return jsonb_build_object('language', v_c.language, 'currency', v_currency, 'days', p_days,
      'note', case when v_c.language::text = 'en' then 'reference rate' else 'tasa de referencia' end,
      'current', false, 'latest', null, 'valid_until', null, 'points', '[]'::jsonb,
      'high', null, 'low', null, 'change_pct', null, 'days_up', null, 'days_down', null, 'week', '[]'::jsonb);
  end if;

  -- Only real stored days in the window, with each one's previous stored day.
  -- Day-over-day moves are counted between stored days inside the window: the
  -- first point's own move is outside it.
  select coalesce(jsonb_agg(jsonb_build_object('date', w.rate_date, 'rate', w.rate) order by w.rate_date), '[]'::jsonb),
         (array_agg(w.rate order by w.rate_date))[1],
         count(*) filter (where w.rate > w.prev),
         count(*) filter (where w.rate < w.prev)
    into v_points, v_first, v_up, v_down
    from (select fr.rate_date, fr.rate, lag(fr.rate) over (order by fr.rate_date) as prev
            from fx_rates fr
           where fr.quote = v_currency and fr.rate_date <= v_latest.rate_date
             and fr.rate_date > v_latest.rate_date - p_days) w;

  -- Ties: the most recent day.
  select jsonb_build_object('date', fr.rate_date, 'rate', fr.rate) into v_high
    from fx_rates fr
   where fr.quote = v_currency and fr.rate_date <= v_latest.rate_date and fr.rate_date > v_latest.rate_date - p_days
   order by fr.rate desc, fr.rate_date desc limit 1;
  select jsonb_build_object('date', fr.rate_date, 'rate', fr.rate) into v_low
    from fx_rates fr
   where fr.quote = v_currency and fr.rate_date <= v_latest.rate_date and fr.rate_date > v_latest.rate_date - p_days
   order by fr.rate asc, fr.rate_date desc limit 1;

  -- The last 7 real days, each against the stored day before it (which may be
  -- several calendar days earlier). No stored day before: dir is null.
  select coalesce(jsonb_agg(jsonb_build_object('date', x.rate_date, 'rate', x.rate,
            'dir', case when x.prev is null then null when x.rate > x.prev then 'up'
                        when x.rate < x.prev then 'down' else 'same' end) order by x.rate_date), '[]'::jsonb)
    into v_week
    from (select fr.rate_date, fr.rate, lag(fr.rate) over (order by fr.rate_date) as prev
            from fx_rates fr where fr.quote = v_currency and fr.rate_date <= v_latest.rate_date
           order by fr.rate_date desc limit 7) x;

  return jsonb_build_object(
    'language', v_c.language,
    'currency', v_currency,
    'days', p_days,
    'note', case when v_c.language::text = 'en' then 'reference rate' else 'tasa de referencia' end,
    'current', v_latest.rate_date >= v_today - 3,
    'latest', jsonb_build_object('date', v_latest.rate_date, 'rate', v_latest.rate,
                                 'stale', v_latest.rate_date < v_today - 3),
    'valid_until', (v_latest.rate_date + 4)::timestamp at time zone v_c.timezone,
    'points', v_points,
    'high', v_high,
    'low', v_low,
    'change_pct', case when jsonb_array_length(v_points) < 2 or v_first is null then null
                       else round((v_latest.rate - v_first) / v_first * 100, 2) end,
    'days_up', v_up,
    'days_down', v_down,
    'week', v_week);
end $$;

-- ---------------------------------------------------------------------------
-- Rate reminders: "Avísame cuando suba". One open reminder per client.
-- ---------------------------------------------------------------------------
alter type notification_trigger add value if not exists 'rate_reminder' after 'match_day';

create table rate_reminders (
  id              bigint generated always as identity primary key,
  client_id       uuid not null references clients(id) on delete cascade,
  currency        fx_currency not null,
  target          numeric(18,6) not null check (target > 0),
  created_at      timestamptz not null default now(),
  -- The engagement notification that carries it, once queued. triggered_at is
  -- set when that notification is sent, so the reminder fires once.
  notification_id bigint references notifications(id) on delete set null,
  triggered_at    timestamptz,
  cleared_at      timestamptz
);

create unique index rate_reminders_one_open_idx on rate_reminders (client_id)
  where triggered_at is null and cleared_at is null;
create index rate_reminders_notification_idx on rate_reminders (notification_id) where notification_id is not null;

-- Client-owned, like push_subscriptions: written through app functions by the
-- server, readable by the owner in the portal. No affiliate reads it.
alter table rate_reminders enable row level security;
create policy rate_reminders_owner_read on rate_reminders for select using (app.is_owner());

-- Priority when several engagement triggers are eligible. Lower wins. The
-- member's own reminder ranks just below match day and above the 30-day high
-- (docs/OPEN-DECISIONS.md 3.23). Compared as text: the new enum value cannot be
-- used as a literal in the transaction that adds it.
create or replace function app.trigger_priority(t notification_trigger)
returns smallint language sql immutable as $$
  select case t::text
    when 'weather_alert' then 1
    when 'match_day'     then 2
    when 'rate_reminder' then 3
    when 'fx_30d_high'   then 4
    when 'lottery'       then 5
    else 6
  end::smallint;
$$;

-- The open reminder, with the latest reference rate. reached is null when the
-- rate is not current: a stale rate cannot say either way.
create or replace function app.rate_reminder(p_client_id uuid, p_now timestamptz default now())
returns jsonb
language plpgsql
stable
set search_path = public, app
as $$
declare
  v_c     clients%rowtype;
  v_r     rate_reminders%rowtype;
  v_date  date;
  v_rate  numeric;
  v_cur   boolean;
begin
  select * into v_c from clients where id = p_client_id and active;
  if not found then
    return null;
  end if;
  select * into v_r from rate_reminders
   where client_id = p_client_id and triggered_at is null and cleared_at is null;
  if not found then
    return null;
  end if;
  select fr.rate_date, fr.rate into v_date, v_rate
    from fx_rates fr where fr.quote = v_r.currency order by fr.rate_date desc limit 1;
  v_cur := coalesce(v_date >= (p_now at time zone v_c.timezone)::date - 3, false);
  return jsonb_build_object(
    'target', v_r.target,
    'currency', v_r.currency,
    'created_at', v_r.created_at,
    'latest_rate', v_rate,
    'latest_date', v_date,
    'current', v_cur,
    'reached', case when v_cur then v_rate >= v_r.target end);
end $$;

-- Replaces any open reminder. A target more than 25% from the latest reference
-- rate is refused as a likely typo. No active client: insufficient_privilege.
create or replace function app.set_rate_reminder(p_client_id uuid, p_target numeric)
returns jsonb
language plpgsql
volatile
set search_path = public, app
as $$
declare
  v_c     clients%rowtype;
  v_cur   fx_currency;
  v_rate  numeric;
begin
  select * into v_c from clients where id = p_client_id and active for update;
  if not found then
    raise exception 'no active client' using errcode = 'insufficient_privilege';
  end if;
  if p_target is null or p_target <= 0 then
    raise exception 'the target must be greater than zero' using errcode = 'check_violation';
  end if;
  v_cur := app.fx_currency_for(v_c.country);
  select fr.rate into v_rate from fx_rates fr where fr.quote = v_cur order by fr.rate_date desc limit 1;
  if v_rate is null then
    raise exception 'no reference rate for % yet', v_cur using errcode = 'no_data_found';
  end if;
  if abs(p_target - v_rate) > v_rate * 0.25 then
    raise exception 'target % is more than 25%% away from the reference rate %', p_target, v_rate
      using errcode = 'check_violation';
  end if;

  perform app.clear_rate_reminder(p_client_id);
  insert into rate_reminders (client_id, currency, target) values (p_client_id, v_cur, round(p_target, 6));
  return app.rate_reminder(p_client_id);
end $$;

-- Clears the open reminder. A notification for it still waiting to be sent is
-- withdrawn, so a cleared reminder never arrives.
create or replace function app.clear_rate_reminder(p_client_id uuid)
returns void
language plpgsql
volatile
set search_path = public, app
as $$
declare
  v_ids bigint[];
begin
  if not exists (select 1 from clients where id = p_client_id and active) then
    raise exception 'no active client' using errcode = 'insufficient_privilege';
  end if;
  with cleared as (
    update rate_reminders set cleared_at = now()
     where client_id = p_client_id and triggered_at is null and cleared_at is null
    returning notification_id)
  select array_agg(notification_id) filter (where notification_id is not null) into v_ids from cleared;
  if v_ids is not null then
    update notifications set status = 'suppressed', error = 'the member cleared the rate reminder'
     where id = any(v_ids) and status = 'queued';
  end if;
end $$;

-- A sent reminder notification marks its reminder triggered: it fires once.
create or replace function app.rate_reminder_sent()
returns trigger
language plpgsql
set search_path = public, app
as $$
begin
  update rate_reminders
     set triggered_at = coalesce(new.sent_at, now())
   where notification_id = new.id and triggered_at is null;
  return new;
end $$;

create trigger notifications_rate_reminder_sent
  after update of status on notifications
  for each row when (new.status = 'sent' and old.status <> 'sent' and new.channel = 'engagement')
  execute function app.rate_reminder_sent();

-- ---------------------------------------------------------------------------
-- The daily engagement planner. As 0029, plus the member's rate reminder after
-- match day. Still one engagement notification per client per local day, at
-- their notify_hour, push only; alerts never pass through here.
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
  m         record;
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
       and app.client_has_paid_access(cl.id)
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

    v_cur := case c.country::text when 'MX' then 'MXN' when 'HN' then 'HNL' when 'GT' then 'GTQ' when 'JM' then 'JMD' end;

    -- 2. The member's rate reminder: the latest CURRENT reference rate is at or
    -- above their number. Not while an earlier notification for it is still
    -- waiting; again after one that could not be delivered.
    select rr.id as reminder_id, fr.rate, fr.rate_date into m
      from rate_reminders rr
      join lateral (select x.rate, x.rate_date from fx_rates x
                     where x.quote = rr.currency order by x.rate_date desc limit 1) fr on true
     where rr.client_id = c.id and rr.triggered_at is null and rr.cleared_at is null
       and rr.currency = v_cur::fx_currency
       and fr.rate_date >= v_today - 3
       and fr.rate >= rr.target
       and not exists (select 1 from notifications n
                        where n.id = rr.notification_id and n.status in ('queued', 'sent'));
    if found then
      v_result := app.queue_engagement_notification(c.id, v_today, 'rate_reminder'::text::notification_trigger,
        case when c.lang = 'en' then 'Reference rate' else 'Tasa de referencia' end,
        case when c.lang = 'en'
             then format('The reference rate reached %s %s per 1 CAD.', to_char(m.rate, 'FM999999990.00'), v_cur)
             else format('La tasa de referencia llegó a %s %s por 1 CAD.', to_char(m.rate, 'FM999999990.00'), v_cur) end,
        p_now, null);
      if v_result in ('queued', 'replaced') then
        v_queued := v_queued + 1;
        update rate_reminders
           set notification_id = (select n.id from notifications n
                                   where n.client_id = c.id and n.local_date = v_today
                                     and n.channel = 'engagement' and n.status = 'queued'
                                   order by n.id desc limit 1)
         where id = m.reminder_id;
      end if;
      continue;
    end if;

    -- 3. The reference rate is at a 30-day high today.
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

    -- 4. A lottery draw in their country today. Results only: never odds or a buy link.
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

-- ---------------------------------------------------------------------------
-- Ontario public holidays (Employment Standards Act), beside the home
-- country's national holidays. A separate table: `holidays.country` is the
-- home-country enum and its functions (home_extras, the Feriados page) stay
-- untouched.
-- ---------------------------------------------------------------------------
create table provincial_holidays (
  id                bigint generated always as identity primary key,
  province          text not null check (province in ('ON')),
  holiday_date      date not null,
  name              text not null,        -- English, as the source names it
  name_es           text not null,
  -- Only ESA public holidays are published; the column keeps a day that is
  -- widely observed but not a public holiday from ever passing for one.
  is_public_holiday boolean not null default true,
  verified_at       date not null,
  source_url        text not null,
  unique (province, holiday_date, name)
);
create index provincial_holidays_date_idx on provincial_holidays (province, holiday_date);

alter table provincial_holidays enable row level security;
create policy provincial_holidays_read on provincial_holidays
  for select using (auth.role() in ('authenticated', 'service_role'));

-- Upcoming holidays in Ontario and at home, merged by date. Names in the
-- client's language for Ontario; home names as the home source gives them.
create or replace function app.holidays_here_and_there(p_client_id uuid, p_now timestamptz default now(), p_limit int default 6)
returns jsonb
language plpgsql
stable
set search_path = public, app
as $$
declare
  v_c     clients%rowtype;
  v_today date;
begin
  if p_limit is null or p_limit < 1 or p_limit > 50 then
    raise exception 'p_limit must be between 1 and 50, got %', p_limit using errcode = 'invalid_parameter_value';
  end if;
  select * into v_c from clients where id = p_client_id and active;
  if not found then
    return null;
  end if;
  v_today := (p_now at time zone v_c.timezone)::date;

  return (
    select coalesce(jsonb_agg(jsonb_build_object('date', u.d, 'name', u.name, 'where', u.place,
                                                 'days_left', u.d - v_today, 'verified_at', u.verified_at)
                              order by u.d, u.sort, u.name), '[]'::jsonb)
      from (select * from (
              select p.holiday_date as d, case when v_c.language::text = 'en' then p.name else p.name_es end as name,
                     p.province as place, 0 as sort, p.verified_at
                from provincial_holidays p
               where p.province = 'ON' and p.is_public_holiday and p.holiday_date >= v_today
              union all
              select h.holiday_date, h.name, h.country::text, 1, h.verified_at
                from holidays h
               where h.country = v_c.country and h.holiday_date >= v_today) a
             order by a.d, a.sort, a.name
             limit p_limit) u);
end $$;
