-- 0041_member_season_badges.sql
-- Hoy round 2, "Tú eres Hoy": the member card, badges earned from real rows,
-- the season ring (arrival to departure, or a countdown), the one-time welcome
-- screen, and the extra home fields for "Allá y aquí".
--
-- Every value here is read from rows we hold. Where a fact cannot be decided
-- from those rows the field is null (or the badge stays locked with no
-- progress); nothing is estimated.

alter table clients
  add column arrival_date date,          -- the day they arrived in Canada this season; set by the member
  add column welcomed_at  timestamptz;   -- the welcome screen was shown (first value kept)

-- The member number counts non-test clients in registration order.
create index clients_member_order_idx on clients (created_at, id) where not is_test;

-- ---------------------------------------------------------------------------
-- Member since: the first paid, unvoided period's payment day, else the day
-- the client row was created. Dates are the client's own calendar day.
-- ---------------------------------------------------------------------------
create or replace function app.member_since(p_client_id uuid)
returns date
language sql
stable
set search_path = public, app
as $$
  select (coalesce((select min(s.paid_at) from subscriptions s
                     where s.client_id = c.id and s.paid_at is not null and s.voided_at is null),
                   c.created_at) at time zone c.timezone)::date
    from clients c
   where c.id = p_client_id
$$;

-- ---------------------------------------------------------------------------
-- Member card. Null unless the client is active.
--   status and valid_until follow client_status's rule (latest paid, unvoided
--   period; business day in Toronto), evaluated at p_now; valid_until is null
--   unless status is active or due.
--   business is the affiliate that registered the client, null for the house.
--   member_number is the client's place in registration order among non-test
--   clients (null for a test client).
-- ---------------------------------------------------------------------------
create or replace function app.member_card(p_client_id uuid, p_now timestamptz default now())
returns jsonb
language plpgsql
stable
set search_path = public, app
as $$
declare
  v_c       clients%rowtype;
  v_bday    date := (p_now at time zone 'America/Toronto')::date;
  v_end     date;
  v_status  text;
  v_since   date;
  v_aff     affiliates%rowtype;
begin
  select * into v_c from clients where id = p_client_id and active;
  if not found then
    return null;
  end if;

  select s.period_end into v_end
    from subscriptions s
   where s.client_id = p_client_id and s.paid_at is not null and s.voided_at is null
   order by s.period_end desc
   limit 1;
  v_status := case
                when v_end is null          then 'none'
                when v_end < v_bday         then 'lapsed'
                when v_end <= v_bday + 30   then 'due'
                else 'active'
              end;

  v_since := app.member_since(p_client_id);

  select a.* into v_aff
    from affiliates a
   where a.id = coalesce((select s.registered_by_affiliate_id from subscriptions s
                           where s.client_id = p_client_id and s.voided_at is null
                           order by s.paid_at nulls last, s.created_at limit 1),
                         v_c.affiliate_id);

  return jsonb_build_object(
    'full_name', v_c.full_name,
    'first_name', split_part(regexp_replace(btrim(v_c.full_name), '\s+', ' ', 'g'), ' ', 1),
    'code', v_c.code,
    'member_since', v_since,
    'valid_until', case when v_status in ('active', 'due') then v_end end,
    'status', v_status,
    'business', case when v_aff.id is not null and not v_aff.is_house then coalesce(v_aff.business_name, v_aff.name) end,
    'country', v_c.country,
    'municipality', coalesce((select m.name from municipalities m where m.id = v_c.municipality_id), v_c.municipality),
    'language', v_c.language,
    'member_number', case when not v_c.is_test then
       (select count(*) from clients o where not o.is_test and (o.created_at, o.id) <= (v_c.created_at, v_c.id)) end,
    'renewals', (select count(*) from subscriptions s
                  where s.client_id = p_client_id and s.kind = 'renewal'
                    and s.paid_at is not null and s.voided_at is null and s.paid_at <= p_now),
    'founder', v_since < date '2026-11-01');
end $$;

-- ---------------------------------------------------------------------------
-- Season progress, with "today" on the client's clock.
--   season     seasonal, arrival and departure set, arrival <= today, arrival <= departure
--   countdown  seasonal with a departure date otherwise
--   trip       settled with a next-trip date
--   null       anything else
-- days_left never goes below 0; pct is a whole number from 0 to 100, reaching
-- 100 only on or after the departure day. past: today is after the date.
-- ---------------------------------------------------------------------------
create or replace function app.season_progress(p_client_id uuid, p_now timestamptz default now())
returns jsonb
language plpgsql
stable
set search_path = public, app
as $$
declare
  v_c     clients%rowtype;
  v_today date;
  v_total integer;
  v_done  integer;
begin
  select * into v_c from clients where id = p_client_id and active;
  if not found then
    return null;
  end if;
  v_today := (p_now at time zone v_c.timezone)::date;

  if v_c.segment = 'seasonal' and v_c.departure_date is not null then
    if v_c.arrival_date is not null and v_c.arrival_date <= v_today and v_c.arrival_date <= v_c.departure_date then
      v_total := v_c.departure_date - v_c.arrival_date;
      v_done  := least(v_today - v_c.arrival_date, v_total);
      return jsonb_build_object(
        'kind', 'season',
        'arrival', v_c.arrival_date,
        'departure', v_c.departure_date,
        'days_total', v_total,
        'days_done', v_done,
        'days_left', greatest(v_c.departure_date - v_today, 0),
        'pct', case when v_total = 0 then 100 else least(100, (v_done * 100) / v_total) end,
        'past', v_today > v_c.departure_date);
    end if;
    return jsonb_build_object(
      'kind', 'countdown',
      'departure', v_c.departure_date,
      'days_left', greatest(v_c.departure_date - v_today, 0),
      'past', v_today > v_c.departure_date);
  end if;

  if v_c.segment = 'settled' and v_c.next_trip_date is not null then
    return jsonb_build_object(
      'kind', 'trip',
      'next_trip', v_c.next_trip_date,
      'days_left', greatest(v_c.next_trip_date - v_today, 0),
      'past', v_today > v_c.next_trip_date);
  end if;

  return null;
end $$;

-- ---------------------------------------------------------------------------
-- Badges. Each item: {key, earned, earned_at, progress}. Earned first by
-- earned_at (an earned badge whose day is not on record comes after the dated
-- ones), then locked, each group in the order below. Rows after p_now do not
-- count. Null unless the client is active.
-- ---------------------------------------------------------------------------
create or replace function app.member_badges(p_client_id uuid, p_now timestamptz default now())
returns jsonb
language plpgsql
stable
set search_path = public, app
as $$
declare
  v_c      clients%rowtype;
  v_items  jsonb := '[]'::jsonb;
  v_since  date;
  v_n      integer;
  v_at     timestamptz;
  v_day    date;
  v_sp     jsonb;
  v_earned boolean;
begin
  select * into v_c from clients where id = p_client_id and active;
  if not found then
    return null;
  end if;

  -- fundador: a member of the first season (member since before 2026-11-01).
  v_since := app.member_since(p_client_id);
  v_earned := v_since < date '2026-11-01';
  v_items := v_items || jsonb_build_object('key', 'fundador', 'earned', v_earned,
               'earned_at', case when v_earned then v_since end, 'progress', null);

  -- pueblo: their hometown is set. The day is setup's completion, when recorded.
  v_earned := v_c.municipality_id is not null;
  v_items := v_items || jsonb_build_object('key', 'pueblo', 'earned', v_earned,
               'earned_at', case when v_earned then (v_c.setup_completed_at at time zone v_c.timezone)::date end,
               'progress', null);

  -- avisos: a phone of theirs receives notifications now.
  select count(*), min(ps.created_at) into v_n, v_at
    from push_subscriptions ps
   where ps.client_id = p_client_id and ps.disabled_at is null and ps.created_at <= p_now;
  v_items := v_items || jsonb_build_object('key', 'avisos', 'earned', v_n > 0,
               'earned_at', case when v_n > 0 then (v_at at time zone v_c.timezone)::date end, 'progress', null);

  -- vigia: watches at least one more town. No day: saving the list replaces its
  -- rows, so their created_at is the last save, not when the badge was earned.
  select count(*) into v_n from client_watch_locations w where w.client_id = p_client_id;
  v_items := v_items || jsonb_build_object('key', 'vigia', 'earned', v_n >= 1, 'earned_at', null,
               'progress', jsonb_build_object('n', least(v_n, 1), 'of', 1));

  -- explorador: 5 different section pages opened (setup and the expiry screen are not sections).
  select count(*), (array_agg(f.first_at order by f.first_at))[5] into v_n, v_at
    from (select pv.page, min(pv.served_at) as first_at
            from page_views pv
           where pv.client_id = p_client_id and pv.served_at <= p_now and pv.page not in ('setup', 'expiry')
           group by pv.page) f;
  v_items := v_items || jsonb_build_object('key', 'explorador', 'earned', v_n >= 5,
               'earned_at', case when v_n >= 5 then (v_at at time zone v_c.timezone)::date end,
               'progress', jsonb_build_object('n', least(v_n, 5), 'of', 5));

  -- fiel: Hoy opened on 7 different days on the client's clock (home renders and section pages).
  select count(*), (array_agg(d.day order by d.day))[7] into v_n, v_day
    from (select distinct (t.at at time zone v_c.timezone)::date as day
            from (select pv.served_at as at from page_views pv
                   where pv.client_id = p_client_id and pv.served_at <= p_now
                  union all
                  select hr.rendered_at from home_renders hr
                   where hr.client_id = p_client_id and hr.rendered_at <= p_now) t) d;
  v_items := v_items || jsonb_build_object('key', 'fiel', 'earned', v_n >= 7,
               'earned_at', case when v_n >= 7 then v_day end,
               'progress', jsonb_build_object('n', least(v_n, 7), 'of', 7));

  -- renovo: at least one paid, unvoided renewal.
  select min(s.paid_at) into v_at
    from subscriptions s
   where s.client_id = p_client_id and s.kind = 'renewal' and s.paid_at is not null
     and s.voided_at is null and s.paid_at <= p_now;
  v_items := v_items || jsonb_build_object('key', 'renovo', 'earned', v_at is not null,
               'earned_at', (v_at at time zone v_c.timezone)::date, 'progress', null);

  -- temporada: this season reached its departure day while a paid, unvoided
  -- period covered that day. Only decidable with arrival and departure on
  -- record (season_progress kind "season"); otherwise locked with no progress.
  v_sp := app.season_progress(p_client_id, p_now);
  if v_sp->>'kind' = 'season' then
    v_earned := (v_sp->>'pct')::int = 100 and (v_sp->>'days_total')::int > 0
                and exists (select 1 from subscriptions s
                             where s.client_id = p_client_id and s.paid_at is not null and s.voided_at is null
                               and s.paid_at <= p_now
                               and s.period_start <= (v_sp->>'departure')::date
                               and s.period_end >= (v_sp->>'departure')::date);
    v_items := v_items || jsonb_build_object('key', 'temporada', 'earned', v_earned,
                 'earned_at', case when v_earned then (v_sp->>'departure')::date end,
                 'progress', jsonb_build_object('n', (v_sp->>'days_done')::int, 'of', (v_sp->>'days_total')::int));
  else
    v_items := v_items || jsonb_build_object('key', 'temporada', 'earned', false, 'earned_at', null, 'progress', null);
  end if;

  return (select jsonb_agg(x.e order by (x.e->>'earned')::boolean desc, (x.e->>'earned_at')::date nulls last, x.n)
            from jsonb_array_elements(v_items) with ordinality as x(e, n));
end $$;

-- ---------------------------------------------------------------------------
-- Setters
-- ---------------------------------------------------------------------------

-- The member's arrival day this season; null clears it. Refused: more than 400
-- days from today (either way), or after their departure date. Returns what is
-- stored. No active client: insufficient_privilege.
create or replace function app.set_arrival_date(p_client_id uuid, p_date date)
returns date
language plpgsql
volatile
set search_path = public, app
as $$
declare
  v_c     clients%rowtype;
  v_today date;
  v_date  date;
begin
  select * into v_c from clients where id = p_client_id and active for update;
  if not found then
    raise exception 'no active client' using errcode = 'insufficient_privilege';
  end if;
  v_today := (now() at time zone v_c.timezone)::date;
  if p_date is not null then
    if p_date < v_today - 400 or p_date > v_today + 400 then
      raise exception 'arrival date % is more than 400 days from today', p_date using errcode = 'check_violation';
    end if;
    if v_c.departure_date is not null and p_date > v_c.departure_date then
      raise exception 'arrival date % is after the departure date %', p_date, v_c.departure_date using errcode = 'check_violation';
    end if;
  end if;
  update clients set arrival_date = p_date where id = p_client_id
  returning arrival_date into v_date;
  return v_date;
end $$;

-- 3. Seasonal with a departure date, or settled with their own next-trip date
-- (0020), plus: a departure before the recorded arrival day is refused.
create or replace function app.setup_set_segment(p_client_id uuid, p_segment client_segment, p_date date)
returns void
language plpgsql
volatile
set search_path = public, app
as $$
begin
  if p_date is not null and p_date < (select (now() at time zone c.timezone)::date from clients c where c.id = p_client_id) then
    raise exception 'the date must be today or later' using errcode = 'check_violation';
  end if;
  if p_segment = 'seasonal' and p_date is not null
     and p_date < (select c.arrival_date from clients c where c.id = p_client_id) then
    raise exception 'the departure date must not be before the arrival date' using errcode = 'check_violation';
  end if;
  update clients
     set segment = p_segment,
         departure_date = case when p_segment = 'seasonal' then p_date end,
         next_trip_date = case when p_segment = 'settled' then p_date end
   where id = p_client_id;
  perform app.setup_mark(p_client_id, 'segment', 'done');
end $$;

-- The welcome screen was shown. Keeps the first time; null when there is no
-- active client with that id.
create or replace function app.mark_welcomed(p_client_id uuid)
returns timestamptz
language plpgsql
volatile
set search_path = public, app
as $$
declare
  v_at timestamptz;
begin
  update clients set welcomed_at = now()
   where id = p_client_id and active and welcomed_at is null;
  select welcomed_at into v_at from clients where id = p_client_id and active;
  return v_at;
end $$;

-- ---------------------------------------------------------------------------
-- Home: plus the member card, season, badge counts, the welcome flag and the
-- hometown's time zone (0040 otherwise unchanged)
-- ---------------------------------------------------------------------------
create or replace function app.home_more(p_client_id uuid, p_now timestamptz default now())
returns jsonb
language plpgsql
stable
set search_path = public, app
as $$
declare
  v_c     clients%rowtype;
  v_today date;
  v_f     jsonb;
  v_w     jsonb;
  v_b     jsonb;
begin
  select * into v_c from clients where id = p_client_id and active;
  if not found then
    return null;
  end if;
  v_today := (p_now at time zone v_c.timezone)::date;
  v_f := app.football_page(p_client_id, p_now);
  v_w := app.weather_page(p_client_id, p_now);
  v_b := app.member_badges(p_client_id, p_now);

  return jsonb_build_object(
    'home_photo', app.town_photo(v_c.municipality_id),
    'home_town', v_c.municipality,

    -- Their team's next match, while the fixtures feed is current (football_page's rules).
    'next_match', case when jsonb_typeof(v_f->'upcoming') = 'array' and jsonb_array_length(v_f->'upcoming') > 0 then v_f->'upcoming'->0 end,
    'league', v_f->>'league',
    'league_today', case when jsonb_typeof(v_f->'league_today') = 'array' and jsonb_array_length(v_f->'league_today') > 0 then
       (select jsonb_agg(m) from (select m from jsonb_array_elements(v_f->'league_today') m limit 3) s) end,
    -- The schedule is shown only while the feed is current (checked within 3 hours).
    'football_valid_until', case when v_f->>'fixtures_confirmed_at' is not null
       then (v_f->>'fixtures_confirmed_at')::timestamptz + interval '3 hours' end,

    -- The weather now, at home and in Leamington, under current_summary's rules
    -- (null below two fresh providers; each carries its own valid_until).
    'home_now', case when v_c.municipality_id is not null
       then app.current_summary(v_c.municipality_id, null, p_now, v_c.language::text) end,
    'leamington_now', (select app.current_summary(null, lp.id, p_now, v_c.language::text)
                         from local_places lp where lp.key = 'leamington'),

    -- Today's forecast for the towns they watch (not their home, which has its own
    -- line), where "today" is the town's own calendar day.
    'watch_weather', (
       select jsonb_agg(jsonb_build_object('id', (t->>'id')::bigint, 'name', t->>'name',
                                           'photo', app.town_photo((t->>'id')::bigint) is not null,
                                           'today', t->'days'->0,
                                           'now', t->'now'))
         from jsonb_array_elements(case when jsonb_typeof(v_w->'towns') = 'array' then v_w->'towns' else '[]'::jsonb end) t
        where not (t->>'is_home')::boolean
          and jsonb_typeof(t->'days') = 'array' and jsonb_array_length(t->'days') > 0
          and (t->'days'->0->>'date')::date = (p_now at time zone coalesce(t->>'timezone', v_c.timezone))::date),
    'weather_valid_until', p_now + interval '3 hours',

    -- Official warnings: only for a country whose warnings we read. Never "no alerts":
    -- current gives when we checked, and any warning for their towns; stale says so.
    'alerts', case when v_w->>'alerts_state' in ('current', 'stale') then jsonb_build_object(
       'state', v_w->>'alerts_state',
       'checked_at', v_w->'alerts_checked_at',
       'valid_until', case when v_w->>'alerts_state' = 'current' and v_w->>'alerts_checked_at' is not null
                           then (v_w->>'alerts_checked_at')::timestamptz + interval '45 minutes'
                           else p_now + interval '45 minutes' end,
       'agency', v_w->>'agency',
       'agency_url', v_w->>'agency_url',
       'here', (select jsonb_agg(jsonb_build_object('id', a->'id', 'level', a->>'level', 'event', a->>'event',
                                                    'headline', a->>'headline', 'area_desc', a->>'area_desc',
                                                    'issued_at', a->'issued_at', 'expires_at', a->'expires_at'))
                  from (select a from jsonb_array_elements(case when jsonb_typeof(v_w->'alerts_here') = 'array' then v_w->'alerts_here' else '[]'::jsonb end) a limit 2) s)) end,

    -- Their paid period.
    'plan', (select jsonb_build_object('period_end', cs.period_end, 'days_left', cs.days_left, 'status', cs.status)
               from client_status cs where cs.client_id = p_client_id and cs.status in ('active', 'due')),

    -- Whether any phone of theirs receives notifications.
    'push_subscriptions', (select count(*) from push_subscriptions ps where ps.client_id = p_client_id and ps.disabled_at is null),

    -- For parents: the next national school calendar event.
    'school_next', case when v_c.has_kids then (
       select jsonb_build_object('event_name', s.event_name, 'start_date', s.start_date, 'end_date', s.end_date,
                                 'verified_at', s.verified_at)
         from school_calendar s
        where s.country = v_c.country and coalesce(s.end_date, s.start_date) >= v_today
        order by s.start_date, s.event_name limit 1) end,

    -- Round 2: the member card, the season ring, badges, the welcome screen, and
    -- the hometown clock's time zone (null until a hometown is set).
    'member', app.member_card(p_client_id, p_now),
    'season', app.season_progress(p_client_id, p_now),
    'badges_earned', (select count(*) from jsonb_array_elements(coalesce(v_b, '[]'::jsonb)) b where (b->>'earned')::boolean),
    'badges_total', jsonb_array_length(coalesce(v_b, '[]'::jsonb)),
    'welcomed', v_c.welcomed_at is not null,
    'home_timezone', (select m.timezone from municipalities m where m.id = v_c.municipality_id));
end $$;
