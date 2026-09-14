-- 0039_watched_towns_own_today.sql
-- Home's watched towns use each town's own "today", as Clima does.
--
-- home_more (0034, 0035) kept a watched town only when its first forecast day
-- was the client's today. Clients live on Leamington's clock and their towns do
-- not: from midnight in Toronto until midnight in Mexico or Central America,
-- Uruapan's first day was still "yesterday" for the client, so the card
-- vanished from home while Clima showed the same forecast as "Hoy". A town's
-- first day now counts when it is today in that town.

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
begin
  select * into v_c from clients where id = p_client_id and active;
  if not found then
    return null;
  end if;
  v_today := (p_now at time zone v_c.timezone)::date;
  v_f := app.football_page(p_client_id, p_now);
  v_w := app.weather_page(p_client_id, p_now);

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

    -- Today's forecast for the towns they watch (not their home, which has its own
    -- line), where "today" is the town's own calendar day.
    'watch_weather', (
       select jsonb_agg(jsonb_build_object('id', (t->>'id')::bigint, 'name', t->>'name',
                                           'photo', app.town_photo((t->>'id')::bigint) is not null,
                                           'today', t->'days'->0))
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
        order by s.start_date, s.event_name limit 1) end);
end $$;
