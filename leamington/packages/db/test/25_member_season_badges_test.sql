-- "Tú eres Hoy" (0041): the member card, badges from real rows, season progress,
-- the arrival-date setter, the one-time welcome and the new home fields. Uses
-- its own clients, created inside the transaction:
--   A  registered by a business, seasonal, hometown in Mexico City's time zone
--   B  registered by the house, joined after the first season, no payment
\set ON_ERROR_STOP on
begin;

insert into affiliates (id, name, business_name) values
  ('99990000-0000-4000-8000-000000000025', 'Member Test', 'Abarrotes Prueba');
do $$
begin
  if not exists (select 1 from affiliates where is_house) then
    insert into affiliates (name, business_name, commission_rate, is_house) values ('Directo', 'Registro directo', 0, true);
  end if;
end $$;
insert into municipalities (country, admin_region, name, lat, lng, population, timezone) values
  ('MX', 'Member State', 'Member Home',  19.40, -99.10, 100, 'America/Mexico_City'),
  ('MX', 'Member State', 'Member Watch', 19.50, -99.20, 100, 'America/Mexico_City');

insert into clients (id, affiliate_id, code, full_name, country, language, municipality_id, municipality, timezone,
                     segment, setup_completed_at, created_at)
select '99990000-0000-4000-8000-0000000000a5', '99990000-0000-4000-8000-000000000025', 'MMCARD2A',
       '  María  José Pérez ', 'MX', 'es', m.id, m.name, 'America/Toronto', 'seasonal',
       '2026-09-21 15:00+00', '2026-09-20 14:00+00'
  from municipalities m where m.name = 'Member Home';
insert into clients (id, affiliate_id, code, full_name, country, language, timezone, segment, created_at)
select '99990000-0000-4000-8000-0000000000b5', a.id, 'MMCARD3A', 'Juan López', 'GT', 'es', 'America/Toronto', 'settled',
       '2026-11-05 15:00+00'
  from affiliates a where a.is_house;
insert into clients (id, affiliate_id, code, full_name, country, language, timezone, is_test)
values ('99990000-0000-4000-8000-0000000000c5', '99990000-0000-4000-8000-000000000025', 'MMCARD4A', 'Test Person', 'HN', 'es',
        'America/Toronto', true);

-- A: a voided sale, then the real sale.
insert into subscriptions (client_id, period_start, period_end, paid_at, kind, affiliate_id, voided_at, void_reason) values
  ('99990000-0000-4000-8000-0000000000a5', '2026-09-15', '2027-03-15', '2026-09-15 14:00+00', 'sale',
   '99990000-0000-4000-8000-000000000025', '2026-09-16 14:00+00', 'test');
insert into subscriptions (client_id, period_start, period_end, paid_at, kind, affiliate_id) values
  ('99990000-0000-4000-8000-0000000000a5', '2026-09-20', '2027-03-20', '2026-09-20 14:00+00', 'sale',
   '99990000-0000-4000-8000-000000000025');

-- ---------------------------------------------------------------------------
-- Member card
-- ---------------------------------------------------------------------------
do $$
declare m jsonb; b jsonb; t jsonb;
  v_a uuid := '99990000-0000-4000-8000-0000000000a5'; v_b uuid := '99990000-0000-4000-8000-0000000000b5';
begin
  m := app.member_card(v_a, '2026-10-15 16:00+00');
  assert m->>'full_name' = '  María  José Pérez ' and m->>'first_name' = 'María' and m->>'code' = 'MMCARD2A', format('%s', m);
  assert m->>'member_since' = '2026-09-20', format('the voided sale does not count: %s', m);
  assert m->>'valid_until' = '2027-03-20' and m->>'status' = 'active', format('%s', m);
  assert m->>'business' = 'Abarrotes Prueba', format('the registering business: %s', m);
  assert m->>'country' = 'MX' and m->>'municipality' = 'Member Home' and m->>'language' = 'es', format('%s', m);
  assert (m->>'renewals')::int = 0 and (m->>'founder')::boolean, format('%s', m);

  b := app.member_card(v_b, '2026-11-10 16:00+00');
  assert b->>'business' is null and b ? 'business', format('the house is not shown as a business: %s', b);
  assert b->>'member_since' = '2026-11-05' and not (b->>'founder')::boolean, format('joined after the first season: %s', b);
  assert b->>'valid_until' is null and b->>'status' = 'none', format('never paid: %s', b);
  assert b->>'municipality' is null, format('%s', b);
  assert (b->>'member_number')::int > (m->>'member_number')::int, format('registration order: %s / %s', m, b);

  t := app.member_card('99990000-0000-4000-8000-0000000000c5', '2026-11-10 16:00+00');
  assert t->>'member_number' is null, format('a test client has no member number: %s', t);
  assert app.member_card('99990000-0000-4000-8000-00000000ffff') is null;

  -- A period that ended: lapsed, nothing valid; first paid before 2026-11-01, so a founder.
  insert into subscriptions (client_id, period_start, period_end, paid_at, kind, affiliate_id)
  select v_b, '2025-11-05', '2026-05-05', '2025-11-05 15:00+00', 'sale', affiliate_id from clients where id = v_b;
  b := app.member_card(v_b, '2026-11-10 16:00+00');
  assert b->>'status' = 'lapsed' and b->>'valid_until' is null, format('lapsed: %s', b);
  assert b->>'member_since' = '2025-11-05' and (b->>'founder')::boolean, format('%s', b);
  -- Due: within 30 days of the end, still valid.
  m := app.member_card(v_a, '2027-03-01 16:00+00');
  assert m->>'status' = 'due' and m->>'valid_until' = '2027-03-20', format('due: %s', m);
  delete from subscriptions where client_id = v_b;
end $$;

-- ---------------------------------------------------------------------------
-- Badges
-- ---------------------------------------------------------------------------
create function pg_temp.badge(p_client uuid, p_now timestamptz, p_key text) returns jsonb language sql stable as $$
  select e from jsonb_array_elements(app.member_badges(p_client, p_now)) e where e->>'key' = p_key $$;

do $$
declare x jsonb; keys text;
  v_a uuid := '99990000-0000-4000-8000-0000000000a5'; v_b uuid := '99990000-0000-4000-8000-0000000000b5';
  v_now timestamptz := '2026-10-15 16:00+00';
begin
  -- B: nothing earned, all locked, in the defined order.
  x := app.member_badges(v_b, '2026-11-10 16:00+00');
  select string_agg(e->>'key', ',' order by n) into keys from jsonb_array_elements(x) with ordinality as t(e, n);
  assert keys = 'fundador,pueblo,avisos,vigia,explorador,fiel,renovo,temporada', format('locked order: %s', x);
  assert not exists (select 1 from jsonb_array_elements(x) e where (e->>'earned')::boolean or e->>'earned_at' is not null), format('%s', x);
  assert x @> '[{"key": "vigia", "progress": {"n": 0, "of": 1}}, {"key": "explorador", "progress": {"n": 0, "of": 5}},
               {"key": "fiel", "progress": {"n": 0, "of": 7}}, {"key": "temporada", "progress": null}]', format('%s', x);

  -- fundador and pueblo from A's rows.
  x := pg_temp.badge(v_a, v_now, 'fundador');
  assert (x->>'earned')::boolean and x->>'earned_at' = '2026-09-20', format('%s', x);
  x := pg_temp.badge(v_a, v_now, 'pueblo');
  assert (x->>'earned')::boolean and x->>'earned_at' = '2026-09-21', format('%s', x);

  -- avisos: a disabled phone does not count; the active one's day does.
  insert into push_subscriptions (client_id, endpoint, p256dh, auth, created_at, disabled_at) values
    (v_a, 'https://push.test/member-a-old', 'k', 'a', '2026-09-19 14:00+00', '2026-09-20 14:00+00');
  x := pg_temp.badge(v_a, v_now, 'avisos');
  assert not (x->>'earned')::boolean and x->>'earned_at' is null, format('only a disabled phone: %s', x);
  insert into push_subscriptions (client_id, endpoint, p256dh, auth, created_at) values
    (v_a, 'https://push.test/member-a-new', 'k', 'a', '2026-09-22 14:00+00');
  x := pg_temp.badge(v_a, v_now, 'avisos');
  assert (x->>'earned')::boolean and x->>'earned_at' = '2026-09-22', format('%s', x);

  -- vigia
  x := pg_temp.badge(v_a, v_now, 'vigia');
  assert not (x->>'earned')::boolean and x->'progress' = '{"n": 0, "of": 1}', format('%s', x);
  insert into client_watch_locations (client_id, municipality_id) select v_a, id from municipalities where name = 'Member Watch';
  x := pg_temp.badge(v_a, v_now, 'vigia');
  assert (x->>'earned')::boolean and x->>'earned_at' is null and x->'progress' = '{"n": 1, "of": 1}', format('%s', x);

  -- Section pages, Toronto clock. 03:30 UTC on the 23rd is still the 22nd in Toronto.
  insert into page_views (client_id, page, served_at) values
    (v_a, 'setup',    '2026-09-21 15:00+00'),   -- 09-21, not a section
    (v_a, 'futbol',   '2026-09-23 03:30+00'),   -- 09-22
    (v_a, 'clima',    '2026-09-23 04:30+00'),   -- 09-23
    (v_a, 'tasa',     '2026-09-24 15:00+00'),   -- 09-24
    (v_a, 'feriados', '2026-09-25 15:00+00'),   -- 09-25
    (v_a, 'futbol',   '2026-09-26 15:00+00');   -- 09-26, a page already seen
  x := pg_temp.badge(v_a, v_now, 'explorador');
  assert not (x->>'earned')::boolean and x->'progress' = '{"n": 4, "of": 5}', format('4 sections, setup excluded: %s', x);
  x := pg_temp.badge(v_a, v_now, 'fiel');
  assert not (x->>'earned')::boolean and x->'progress' = '{"n": 6, "of": 7}', format('6 Toronto days (5 in UTC): %s', x);

  -- A home render at 02:00 UTC on the 27th is still the 26th in Toronto: no new day.
  insert into home_renders (client_id, rendered_at, local_date, served, message)
  values (v_a, '2026-09-27 02:00+00', '2026-09-26', '{}', '{}');
  x := pg_temp.badge(v_a, v_now, 'fiel');
  assert x->'progress' = '{"n": 6, "of": 7}', format('same Toronto day: %s', x);
  insert into home_renders (client_id, rendered_at, local_date, served, message)
  values (v_a, '2026-09-28 01:00+00', '2026-09-27', '{}', '{}');
  x := pg_temp.badge(v_a, v_now, 'fiel');
  assert (x->>'earned')::boolean and x->>'earned_at' = '2026-09-27' and x->'progress' = '{"n": 7, "of": 7}', format('7th day: %s', x);

  insert into page_views (client_id, page, served_at) values (v_a, 'loteria', '2026-10-01 15:00+00');
  x := pg_temp.badge(v_a, v_now, 'explorador');
  assert (x->>'earned')::boolean and x->>'earned_at' = '2026-10-01' and x->'progress' = '{"n": 5, "of": 5}', format('%s', x);
  x := pg_temp.badge(v_a, v_now, 'fiel');
  assert x->>'earned_at' = '2026-09-27' and x->'progress' = '{"n": 7, "of": 7}', format('an 8th day keeps the 7th as the day: %s', x);
  -- Rows after p_now do not count.
  x := pg_temp.badge(v_a, '2026-09-30 12:00+00', 'explorador');
  assert not (x->>'earned')::boolean and x->'progress' = '{"n": 4, "of": 5}', format('as of p_now: %s', x);

  -- renovo: a voided renewal does not count.
  insert into subscriptions (client_id, period_start, period_end, paid_at, kind, affiliate_id, voided_at, void_reason) values
    (v_a, '2027-03-21', '2027-09-21', '2026-10-05 14:00+00', 'renewal', '99990000-0000-4000-8000-000000000025', '2026-10-06 14:00+00', 'test');
  x := pg_temp.badge(v_a, v_now, 'renovo');
  assert not (x->>'earned')::boolean, format('voided renewal: %s', x);
  insert into subscriptions (client_id, period_start, period_end, paid_at, kind, affiliate_id) values
    (v_a, '2027-03-20', '2027-09-20', '2026-10-10 14:00+00', 'renewal', '99990000-0000-4000-8000-000000000025');
  x := pg_temp.badge(v_a, v_now, 'renovo');
  assert (x->>'earned')::boolean and x->>'earned_at' = '2026-10-10', format('%s', x);
  assert (app.member_card(v_a, v_now)->>'renewals')::int = 1 and app.member_card(v_a, v_now)->>'valid_until' = '2027-09-20',
    format('%s', app.member_card(v_a, v_now));

  -- temporada: no arrival on record, so undecidable: locked, no progress.
  update clients set departure_date = '2026-10-10' where id = v_a;
  x := pg_temp.badge(v_a, v_now, 'temporada');
  assert not (x->>'earned')::boolean and x->'progress' = 'null'::jsonb, format('countdown only: %s', x);
  -- Season in progress: locked with days.
  update clients set arrival_date = '2026-05-01' where id = v_a;
  x := pg_temp.badge(v_a, '2026-07-01 16:00+00', 'temporada');
  assert not (x->>'earned')::boolean and x->'progress' = '{"n": 61, "of": 162}', format('in season: %s', x);
  -- Departure day passed, but no paid period covered it (the voided sale did not count).
  update clients set departure_date = '2026-09-19' where id = v_a;
  x := pg_temp.badge(v_a, v_now, 'temporada');
  assert not (x->>'earned')::boolean and x->'progress' = '{"n": 141, "of": 141}', format('not paid on departure: %s', x);
  -- Covered by the real sale.
  update clients set departure_date = '2026-10-10' where id = v_a;
  x := pg_temp.badge(v_a, v_now, 'temporada');
  assert (x->>'earned')::boolean and x->>'earned_at' = '2026-10-10', format('%s', x);

  -- Earned order: by day, a tie in the defined order, an undated earned badge last.
  x := app.member_badges(v_a, v_now);
  select string_agg(e->>'key', ',' order by n) into keys from jsonb_array_elements(x) with ordinality as t(e, n);
  assert keys = 'fundador,pueblo,avisos,fiel,explorador,renovo,temporada,vigia', format('earned order: %s', x);
  assert app.member_badges('99990000-0000-4000-8000-00000000ffff') is null;
end $$;

-- ---------------------------------------------------------------------------
-- Season progress
-- ---------------------------------------------------------------------------
do $$
declare s jsonb;
  v_a uuid := '99990000-0000-4000-8000-0000000000a5'; v_b uuid := '99990000-0000-4000-8000-0000000000b5';
begin
  -- A: arrived 2026-05-01, leaves 2026-10-10 (162 days).
  s := app.season_progress(v_a, '2026-07-01 16:00+00');
  assert s = '{"kind": "season", "arrival": "2026-05-01", "departure": "2026-10-10", "days_total": 162,
               "days_done": 61, "days_left": 101, "pct": 37, "past": false}', format('in season: %s', s);
  -- 03:00 UTC on the 10th is still the 9th in Toronto.
  s := app.season_progress(v_a, '2026-10-10 03:00+00');
  assert (s->>'days_left')::int = 1 and (s->>'pct')::int = 99 and (s->>'days_done')::int = 161, format('client clock: %s', s);
  s := app.season_progress(v_a, '2026-10-10 16:00+00');
  assert (s->>'days_left')::int = 0 and (s->>'pct')::int = 100 and not (s->>'past')::boolean, format('departure day: %s', s);
  s := app.season_progress(v_a, '2026-10-15 16:00+00');
  assert (s->>'days_left')::int = 0 and (s->>'pct')::int = 100 and (s->>'days_done')::int = 162 and (s->>'past')::boolean,
    format('past departure, capped: %s', s);

  -- Arrival still ahead: a countdown.
  s := app.season_progress(v_a, '2026-04-20 16:00+00');
  assert s = '{"kind": "countdown", "departure": "2026-10-10", "days_left": 173, "past": false}', format('before arrival: %s', s);
  update clients set arrival_date = null where id = v_a;
  s := app.season_progress(v_a, '2026-10-01 16:00+00');
  assert s = '{"kind": "countdown", "departure": "2026-10-10", "days_left": 9, "past": false}', format('departure only: %s', s);
  s := app.season_progress(v_a, '2026-10-12 16:00+00');
  assert (s->>'days_left')::int = 0 and (s->>'past')::boolean, format('%s', s);

  -- Seasonal with nothing on record.
  update clients set departure_date = null, arrival_date = '2026-05-01' where id = v_a;
  assert app.season_progress(v_a, '2026-10-01 16:00+00') is null;

  -- B: settled.
  assert app.season_progress(v_b, '2026-11-10 16:00+00') is null;
  update clients set next_trip_date = '2026-12-24' where id = v_b;
  s := app.season_progress(v_b, '2026-11-10 16:00+00');
  assert s = '{"kind": "trip", "next_trip": "2026-12-24", "days_left": 44, "past": false}', format('trip: %s', s);
  s := app.season_progress(v_b, '2027-01-01 16:00+00');
  assert (s->>'days_left')::int = 0 and (s->>'past')::boolean, format('past trip: %s', s);
  -- A settled client's arrival and departure do not make a season.
  update clients set arrival_date = '2026-05-01' where id = v_b;
  assert app.season_progress(v_b, '2026-11-10 16:00+00')->>'kind' = 'trip';
  assert app.season_progress('99990000-0000-4000-8000-00000000ffff') is null;
end $$;

-- ---------------------------------------------------------------------------
-- set_arrival_date and the departure check in setup_set_segment
-- ---------------------------------------------------------------------------
do $$
declare v_a uuid := '99990000-0000-4000-8000-0000000000a5';
  v_today date := (now() at time zone 'America/Toronto')::date;
  d date;
begin
  update clients set arrival_date = null, departure_date = v_today + 30 where id = v_a;

  begin
    perform app.set_arrival_date(v_a, v_today - 401);
    raise exception 'accepted an arrival 401 days ago';
  exception when check_violation then null;
  end;
  begin
    perform app.set_arrival_date(v_a, v_today + 401);
    raise exception 'accepted an arrival 401 days ahead';
  exception when check_violation then null;
  end;
  begin
    perform app.set_arrival_date(v_a, v_today + 31);
    raise exception 'accepted an arrival after departure';
  exception when check_violation then null;
  end;
  assert (select arrival_date from clients where id = v_a) is null, 'refused dates are not stored';

  d := app.set_arrival_date(v_a, v_today + 30);
  assert d = v_today + 30, format('arrival on the departure day is allowed: %s', d);
  d := app.set_arrival_date(v_a, v_today - 400);
  assert d = v_today - 400 and (select arrival_date from clients where id = v_a) = v_today - 400, format('%s', d);
  d := app.set_arrival_date(v_a, null);
  assert d is null and (select arrival_date from clients where id = v_a) is null, 'null clears';

  -- Without a departure date, a future arrival within 400 days is fine.
  update clients set departure_date = null where id = v_a;
  assert app.set_arrival_date(v_a, v_today + 60) = v_today + 60;

  begin
    perform app.set_arrival_date('99990000-0000-4000-8000-00000000ffff', v_today);
    raise exception 'accepted an unknown client';
  exception when insufficient_privilege then null;
  end;

  -- A departure before the arrival day is refused; on or after it is stored.
  begin
    perform app.setup_set_segment(v_a, 'seasonal', v_today + 59);
    raise exception 'accepted a departure before arrival';
  exception when check_violation then null;
  end;
  perform app.setup_set_segment(v_a, 'seasonal', v_today + 90);
  assert (select departure_date from clients where id = v_a) = v_today + 90;
  -- Settled with a next trip is unaffected by the arrival day.
  perform app.setup_set_segment('99990000-0000-4000-8000-0000000000b5', 'settled', v_today + 5);
  assert (select next_trip_date from clients where id = '99990000-0000-4000-8000-0000000000b5') = v_today + 5;
end $$;

-- ---------------------------------------------------------------------------
-- Welcome and home
-- ---------------------------------------------------------------------------
do $$
declare x jsonb; t timestamptz;
  v_a uuid := '99990000-0000-4000-8000-0000000000a5'; v_b uuid := '99990000-0000-4000-8000-0000000000b5';
  v_now timestamptz := '2026-10-15 16:00+00';
begin
  x := app.home_more(v_b, v_now);
  assert not (x->>'welcomed')::boolean and x ? 'home_timezone' and x->>'home_timezone' is null, format('%s', x);
  assert (x->>'badges_earned')::int = 0 and (x->>'badges_total')::int = 8, format('%s', x);

  t := app.mark_welcomed(v_b);
  assert t is not null and (app.home_more(v_b, v_now)->>'welcomed')::boolean;
  update clients set welcomed_at = '2026-09-01 12:00+00' where id = v_b;
  assert app.mark_welcomed(v_b) = '2026-09-01 12:00+00', 'the first time is kept';
  assert app.mark_welcomed('99990000-0000-4000-8000-00000000ffff') is null;

  -- A at 2026-10-15, with the season from the badge test restored.
  update clients set arrival_date = '2026-05-01', departure_date = '2026-10-10' where id = v_a;
  x := app.home_more(v_a, v_now);
  assert x->'member' = app.member_card(v_a, v_now) and x->'member'->>'code' = 'MMCARD2A', format('%s', x->'member');
  assert x->'season' = app.season_progress(v_a, v_now) and x->'season'->>'kind' = 'season', format('%s', x->'season');
  assert (x->>'badges_earned')::int = 8 and (x->>'badges_total')::int = 8, format('%s', app.member_badges(v_a, v_now));
  assert not (x->>'welcomed')::boolean and x->>'home_timezone' = 'America/Mexico_City', format('%s', x);
  -- Unchanged fields are still there.
  assert x ? 'leamington_now' and x ? 'home_now' and x ? 'plan' and x->>'home_town' = 'Member Home', format('%s', x);
end $$;

rollback;
\echo 'PASS 25 member card, badges and season'
