-- 0016_home_screen.sql
-- The PWA home screen: one morning message, computed here, plus the
-- instrumentation that shows which line brings a person back each day.
--
-- The app reads through its own server with the service role (see
-- 0005_rls.sql). Every function below takes the client id the server resolved
-- from the session cookie, never one supplied by the browser.
--
-- A line with no current, trustworthy data is ABSENT, with a recorded reason.
-- Never stale, never a placeholder.

-- ---------------------------------------------------------------------------
-- Login throttling. A code is 8 symbols from a 24-letter alphabet; that is only
-- unguessable if attempts are limited. The source is stored hashed.
-- ---------------------------------------------------------------------------

create table login_attempts (
  id            bigint generated always as identity primary key,
  attempted_at  timestamptz not null default now(),
  source_hash   text not null,
  succeeded     boolean not null
);

create index login_attempts_source_idx on login_attempts (source_hash, attempted_at desc);
alter table login_attempts enable row level security;   -- server only: no policies

create or replace function app.login_with_code(p_code text, p_source_hash text)
returns jsonb
language plpgsql
volatile
set search_path = public, app
as $$
declare
  v_failures integer;
  v_client   record;
begin
  select count(*) into v_failures
    from login_attempts
   where source_hash = p_source_hash and not succeeded
     and attempted_at > now() - interval '15 minutes';
  if v_failures >= 10 then
    return jsonb_build_object('status', 'throttled');
  end if;

  select id, active, language into v_client from clients where code = p_code;
  if not found then
    insert into login_attempts (source_hash, succeeded) values (p_source_hash, false);
    return jsonb_build_object('status', 'invalid');
  end if;

  insert into login_attempts (source_hash, succeeded) values (p_source_hash, v_client.active);
  if not v_client.active then
    return jsonb_build_object('status', 'inactive');
  end if;
  return jsonb_build_object('status', 'ok', 'client_id', v_client.id, 'language', v_client.language);
end $$;

-- ---------------------------------------------------------------------------
-- The home screen message.
--
-- Returns the greeting and whichever of fixture / weather / rate / countdown
-- have current data, in that order. Each line carries valid_until, so a copy
-- served from the phone's offline cache can drop a line that has expired
-- instead of showing it stale. Each missing line has a reason in "absent".
-- ---------------------------------------------------------------------------

create or replace function app.home_message(p_client_id uuid, p_now timestamptz default now())
returns jsonb
language plpgsql
stable
set search_path = public, app
as $$
declare
  c              record;
  f              record;
  w              record;
  r              record;
  v_lang         text;
  v_local        timestamp;
  v_today        date;
  v_day_end      timestamptz;
  v_hour         integer;
  v_lines        jsonb := '[]'::jsonb;
  v_absent       jsonb := '{}'::jsonb;
  v_kick         timestamp;
  v_fixtures_ok  timestamptz;
  v_temp         text;
  v_date         date;
  v_currency     text;
  v_prev         numeric;
  v_since        date;
  v_days         integer;
  v_arrow        text;
begin
  select cl.id, cl.full_name, cl.country, cl.language, cl.timezone, cl.team_id,
         cl.municipality_id, coalesce(cl.municipality, m.name) as town, m.timezone as town_tz,
         cl.segment, cl.departure_date, cl.next_trip_date
    into c
    from clients cl
    left join municipalities m on m.id = cl.municipality_id
   where cl.id = p_client_id and cl.active;
  if not found then
    return null;
  end if;

  v_lang    := c.language::text;
  v_local   := p_now at time zone c.timezone;
  v_today   := v_local::date;
  v_day_end := (v_today + 1)::timestamp at time zone c.timezone;
  v_hour    := extract(hour from v_local);

  -- Greeting: valid until the greeting itself would change.
  v_lines := v_lines || jsonb_build_object(
    'key', 'greeting',
    'text', format('%s, %s',
      case when v_lang = 'en' then
        case when v_hour < 12 then 'Good morning' when v_hour < 19 then 'Good afternoon' else 'Good evening' end
      else
        case when v_hour < 12 then 'Buenos días' when v_hour < 19 then 'Buenas tardes' else 'Buenas noches' end
      end,
      split_part(btrim(c.full_name), ' ', 1)),
    'valid_until', case
      when v_hour < 12 then (v_today + time '12:00') at time zone c.timezone
      when v_hour < 19 then (v_today + time '19:00') at time zone c.timezone
      else v_day_end end);

  -- Fixture: only when the user's team plays today (their local day) and the
  -- fixture was confirmed recently enough to trust the kickoff time.
  if c.team_id is null then
    v_absent := v_absent || jsonb_build_object('fixture', 'no_team');
  else
    select fx.kickoff_utc, fx.fetched_at, coalesce(t.short_name, t.name) as team_name
      into f
      from fixtures fx
      join teams t on t.id = c.team_id
     where (fx.home_team_id = c.team_id or fx.away_team_id = c.team_id)
       and fx.status in ('scheduled', 'live')
       and (fx.kickoff_utc at time zone c.timezone)::date = v_today
     order by fx.kickoff_utc
     limit 1;
    if found and f.fetched_at >= p_now - interval '6 hours' then
      v_kick := f.kickoff_utc at time zone c.timezone;
      v_lines := v_lines || jsonb_build_object(
        'key', 'fixture',
        'text', format(case when v_lang = 'en' then '%s play today %s' else '%s juega hoy %s' end,
                       f.team_name,
                       lower(to_char(v_kick, case when extract(minute from v_kick) = 0
                                                   then 'FMHH12AM' else 'FMHH12:MIAM' end))),
        'valid_until', v_day_end);
    elsif found then
      v_absent := v_absent || jsonb_build_object('fixture', 'fixture_data_stale');
    else
      -- Nothing stored for today. Record whether that is a fact or a quiet feed.
      select h.last_ok_at into v_fixtures_ok from feed_health h where h.feed = 'fixtures';
      v_absent := v_absent || jsonb_build_object('fixture',
        case when v_fixtures_ok is null or v_fixtures_ok < p_now - interval '3 hours'
             then 'fixture_feed_stale' else 'no_fixture_today' end);
    end if;
  end if;

  -- Weather in their home town, for that town's today. Median of at least two
  -- providers; a range where they disagree by more than 2 degrees. Rain only
  -- when most providers expect it. Never "no rain".
  if c.municipality_id is null then
    v_absent := v_absent || jsonb_build_object('weather', 'no_municipality');
  else
    v_date := (p_now at time zone c.town_tz)::date;
    select count(*)::int as providers,
           percentile_cont(0.5) within group (order by fc.temp_max_c) as t_median,
           min(fc.temp_max_c) as t_min,
           max(fc.temp_max_c) as t_max,
           count(*) filter (where fc.precip_prob >= 50)::int as rainy,
           max(fc.fetched_at) as newest
      into w
      from forecasts fc
     where fc.municipality_id = c.municipality_id
       and fc.target_date = v_date
       and fc.temp_max_c is not null;
    if w.providers = 0 then
      v_absent := v_absent || jsonb_build_object('weather', 'no_forecast');
    elsif w.newest < p_now - interval '12 hours' then
      v_absent := v_absent || jsonb_build_object('weather', 'forecast_stale');
    elsif w.providers < 2 then
      v_absent := v_absent || jsonb_build_object('weather', 'single_source');
    else
      v_temp := case when round(w.t_max) - round(w.t_min) <= 2
                     then format('%s°', round(w.t_median::numeric))
                     else format('%s–%s°', round(w.t_min), round(w.t_max)) end;
      v_lines := v_lines || jsonb_build_object(
        'key', 'weather',
        'text', format('%s: %s%s', c.town, v_temp,
                       case when w.rainy * 2 > w.providers
                            then case when v_lang = 'en' then ', rain' else ', lluvia' end
                            else '' end),
        'valid_until', (v_date + 1)::timestamp at time zone c.town_tz);
    end if;
  end if;

  -- Reference rate, CAD to the home currency. Labelled a reference rate; never
  -- a provider name, a ranking or a prediction.
  v_currency := case c.country::text when 'MX' then 'MXN' when 'HN' then 'HNL'
                                     when 'GT' then 'GTQ' when 'JM' then 'JMD' end;
  select fr.rate_date, fr.rate into r
    from fx_rates fr
   where fr.quote = v_currency::fx_currency
   order by fr.rate_date desc
   limit 1;
  if not found then
    v_absent := v_absent || jsonb_build_object('rate', 'no_rate');
  elsif r.rate_date < v_today - 3 then
    v_absent := v_absent || jsonb_build_object('rate', 'rate_stale');
  else
    select fr.rate into v_prev
      from fx_rates fr
     where fr.quote = v_currency::fx_currency and fr.rate_date < r.rate_date
     order by fr.rate_date desc
     limit 1;
    v_arrow := case when v_prev is null or r.rate = v_prev then ''
                    when r.rate > v_prev then ' ↑' else ' ↓' end;
    -- Days since the rate was last at least this high, within the data we hold.
    select max(fr.rate_date) into v_since
      from fx_rates fr
     where fr.quote = v_currency::fx_currency and fr.rate_date < r.rate_date and fr.rate >= r.rate;
    if v_since is null then
      select min(fr.rate_date) into v_since from fx_rates fr where fr.quote = v_currency::fx_currency;
    end if;
    v_days := r.rate_date - v_since;
    v_lines := v_lines || jsonb_build_object(
      'key', 'rate',
      'text', format('1 CAD = %s %s%s%s', to_char(r.rate, 'FM999999990.00'), v_currency, v_arrow,
        case when v_days >= 7
             then format(case when v_lang = 'en' then ' (highest in %s days)' else ' (más alto en %s días)' end, v_days)
             else '' end),
      'note', case when v_lang = 'en' then 'reference rate' else 'tasa de referencia' end,
      'valid_until', (r.rate_date + 4)::timestamp at time zone c.timezone);
  end if;

  -- Countdown: departure for seasonal users, their own next-trip date for settled.
  v_date := case when c.segment = 'seasonal' then c.departure_date else c.next_trip_date end;
  if v_date is null then
    v_absent := v_absent || jsonb_build_object('countdown', 'no_date');
  elsif v_date < v_today then
    v_absent := v_absent || jsonb_build_object('countdown', 'date_passed');
  else
    v_days := v_date - v_today;
    v_lines := v_lines || jsonb_build_object(
      'key', 'countdown',
      'text', case
        when v_days = 0 then case when v_lang = 'en' then 'It''s today' else 'Es hoy' end
        when v_days = 1 then case when v_lang = 'en' then '1 day to go' else 'Falta 1 día' end
        else format(case when v_lang = 'en' then '%s days to go' else 'Faltan %s días' end, v_days) end,
      'valid_until', v_day_end);
  end if;

  return jsonb_build_object(
    'client_id', c.id, 'language', v_lang, 'local_date', v_today,
    'lines', v_lines, 'absent', v_absent);
end $$;

-- ---------------------------------------------------------------------------
-- Instrumentation: which line drives the daily open. Cannot be reconstructed
-- later, so every render and every open is recorded from day one.
-- ---------------------------------------------------------------------------

-- Every home screen the server rendered, with what it showed and why each
-- missing line was left out.
create table home_renders (
  render_id    uuid primary key default extensions.gen_random_uuid(),
  client_id    uuid not null references clients(id) on delete cascade,
  rendered_at  timestamptz not null default now(),
  local_date   date not null,
  served       text[] not null,
  absent       jsonb not null default '{}'::jsonb,
  message      jsonb not null
);

create index home_renders_client_idx on home_renders (client_id, rendered_at desc);

-- Every time a home screen was on the phone's screen: fresh from the server,
-- or from the offline cache (reported when the phone is next online). "shown"
-- is what was visible after expired lines were dropped.
create table home_opens (
  id           bigint generated always as identity primary key,
  render_id    uuid not null references home_renders(render_id) on delete cascade,
  client_id    uuid not null references clients(id) on delete cascade,
  opened_at    timestamptz not null,
  received_at  timestamptz not null default now(),
  from_cache   boolean not null,
  shown        text[] not null,
  unique (render_id, opened_at)            -- a re-sent queue entry is not a second open
);

create index home_opens_client_idx on home_opens (client_id, opened_at desc);

alter table home_renders enable row level security;
alter table home_opens   enable row level security;
create policy home_renders_owner_read on home_renders for select using (app.is_owner());
create policy home_opens_owner_read   on home_opens   for select using (app.is_owner());

create or replace function app.render_home(p_client_id uuid)
returns jsonb
language plpgsql
volatile
set search_path = public, app
as $$
declare
  v_msg     jsonb;
  v_render  uuid;
  v_at      timestamptz;
begin
  v_msg := app.home_message(p_client_id, now());
  if v_msg is null then
    return null;
  end if;

  insert into home_renders (client_id, local_date, served, absent, message)
  values (p_client_id, (v_msg->>'local_date')::date,
          array(select l.value->>'key' from jsonb_array_elements(v_msg->'lines') with ordinality l order by l.ordinality),
          v_msg->'absent', v_msg)
  returning render_id, rendered_at into v_render, v_at;

  update clients set last_seen_at = now() where id = p_client_id;
  return v_msg || jsonb_build_object('render_id', v_render, 'rendered_at', v_at);
end $$;

-- Opens reported by the phone. Only renders that belong to this client count;
-- an unknown line name is dropped; a repeated report is ignored.
create or replace function app.record_home_opens(p_client_id uuid, p_opens jsonb)
returns integer
language plpgsql
volatile
set search_path = public, app
as $$
declare
  v_count integer;
begin
  insert into home_opens (render_id, client_id, opened_at, from_cache, shown)
  select hr.render_id, p_client_id, x.opened_at, coalesce(x.from_cache, false),
         array(select k from jsonb_array_elements_text(coalesce(x.shown, '[]'::jsonb)) k
                where k in ('greeting', 'fixture', 'weather', 'rate', 'countdown'))
    from jsonb_to_recordset(p_opens) as x(render_id uuid, opened_at timestamptz, from_cache boolean, shown jsonb)
    join home_renders hr on hr.render_id = x.render_id and hr.client_id = p_client_id
   where x.opened_at is not null
     and x.opened_at between hr.rendered_at - interval '1 hour' and now() + interval '1 hour'
  on conflict (render_id, opened_at) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Per client, per local day: how often they opened, and which lines were on
-- screen when they did. Compare against home_renders.served for the days a line
-- was available but the person did not open.
create view daily_opens as
select o.client_id,
       (o.opened_at at time zone c.timezone)::date   as local_date,
       count(*)                                      as opens,
       min(o.opened_at)                              as first_open_at,
       count(*) filter (where o.from_cache)          as opens_from_cache,
       bool_or('fixture'   = any(o.shown))           as saw_fixture,
       bool_or('weather'   = any(o.shown))           as saw_weather,
       bool_or('rate'      = any(o.shown))           as saw_rate,
       bool_or('countdown' = any(o.shown))           as saw_countdown
  from home_opens o
  join clients c on c.id = o.client_id
 group by o.client_id, (o.opened_at at time zone c.timezone)::date;
