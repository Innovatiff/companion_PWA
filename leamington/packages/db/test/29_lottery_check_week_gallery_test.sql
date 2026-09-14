-- Round 5 (0045): ¿Salió mi número?, Tu semana and the hometown gallery.
-- The clock is pinned: 2026-09-17 16:00 UTC = Thursday 12:00 in Toronto,
-- 10:00 in Tegucigalpa, 11:00 in Kingston. The week is Monday 14 to Sunday 20.
-- Clients (all America/Toronto):
--   H  Honduras, es, team Week FC, hometown set on Tuesday
--   J  Jamaica, en, no team, no JMD rate, nothing opened
--   G  Guatemala, es
\set ON_ERROR_STOP on
begin;

insert into affiliates (id, name) values ('99990000-0000-4000-8000-000000000029', 'Week Test');
insert into leagues (country, name, source, source_league_id) values ('HN', 'Week Test League', 'test', 'week-league');
insert into teams (league_id, country, name, source, source_team_id)
select l.id, 'HN', t.name, 'test', t.sid from leagues l, (values ('Week FC', 'week-1'), ('Other FC', 'week-2')) t(name, sid)
 where l.name = 'Week Test League';

insert into clients (id, affiliate_id, code, full_name, country, language, team_id, timezone)
select v.id::uuid, '99990000-0000-4000-8000-000000000029', v.code, v.name, v.country::country_code, v.lang::ui_language,
       (select id from teams where name = v.team), 'America/Toronto'
  from (values
    ('99990000-0000-4000-8000-0000000000e1', 'PQWAAA24', 'Week Person',   'HN', 'es', 'Week FC'),
    ('99990000-0000-4000-8000-0000000000e2', 'PQWAAA22', 'Island Person', 'JM', 'en', null),
    ('99990000-0000-4000-8000-0000000000e3', 'PQWAAA23', 'Ticket Person', 'GT', 'es', null)
  ) v(id, code, name, country, lang, team);
insert into subscriptions (client_id, period_start, period_end, paid_at, kind, affiliate_id)
select id, date '2026-03-01', date '2099-01-01', '2026-03-01 15:00+00', 'sale', affiliate_id from clients where code like 'PQWAAA2_';
-- H's hometown was set on Tuesday 15 (Toronto): the pueblo badge is earned this week.
update clients set municipality_id = (select id from municipalities where country = 'HN' order by id limit 1),
                   setup_completed_at = '2026-09-15 14:00+00'
 where code = 'PQWAAA24';

-- A game with no verified format.
insert into lottery_games (country, operator, name, draw_times_local, timezone, results_url, parser_implemented, active)
values ('HN', 'Week Test Operator', 'Sin Formato', '{21:00}', 'America/Tegucigalpa', 'https://example.invalid/sin-formato', true, true);

create function pg_temp.game(p_country text, p_name text) returns bigint language sql as $$
  select id from lottery_games where country = p_country::country_code and name = p_name and active
$$;
create function pg_temp.draw(p_country text, p_name text, p_date date, p_time time, p_numbers text[]) returns void language sql as $$
  insert into lottery_results (game_id, draw_date, draw_time_local, numbers, source_url, verified_at)
  values (pg_temp.game(p_country, p_name), p_date, p_time, p_numbers, 'https://example.invalid/' || p_name, p_date + time '23:00')
$$;

-- Super Premio (set): Wednesday 16, Saturday 12, and Wednesday 9 (8 days ago, outside the window).
select pg_temp.draw('HN', 'Super Premio', '2026-09-16', '21:00', '{3,7,12,19,25,33}');
select pg_temp.draw('HN', 'Super Premio', '2026-09-12', '21:00', '{1,2,3,4,5,6}');
select pg_temp.draw('HN', 'Super Premio', '2026-09-09', '21:00', '{3,4,19,20,30,33}');
select pg_temp.draw('HN', 'Super Premio', '2026-09-13', '21:00', '{3,4}');            -- malformed: never compared
-- Jugá 3 (digits, with an any-order play).
select pg_temp.draw('HN', 'Jugá 3', '2026-09-16', '21:00', '{8,8,1}');
select pg_temp.draw('HN', 'Jugá 3', '2026-09-16', '15:00', '{1,8,8}');
-- Jamaica Lotto: newest draw 8 days old, older than its 4-day rule.
select pg_temp.draw('JM', 'Lotto', '2026-09-09', '20:25', '{3,4,19,20,30,33}');
-- Santa Lucía: three 5-digit prize tickets, leading zeros kept.
select pg_temp.draw('GT', 'Sorteo Ordinario', '2026-09-12', null, '{59251,08125,12345}');

-- ---------------------------------------------------------------------------
-- ¿Salió mi número?
-- ---------------------------------------------------------------------------
do $$
declare
  h uuid := '99990000-0000-4000-8000-0000000000e1';
  j uuid := '99990000-0000-4000-8000-0000000000e2';
  g uuid := '99990000-0000-4000-8000-0000000000e3';
  v_now timestamptz := '2026-09-17 16:00+00';
  r jsonb; d jsonb; x jsonb;
begin
  -- Set semantics: the member's numbers found among the drawn numbers, any order.
  r := app.lottery_check(h, pg_temp.game('HN', 'Super Premio'), '{33,4,19,20,30,3}', v_now);
  assert r->>'state' = 'current' and r->>'match' = 'set' and r->>'newest_draw_date' = '2026-09-16', format('%s', r);
  assert r->'window' = '{"from": "2026-09-11", "to": "2026-09-17"}'::jsonb, format('window: %s', r->'window');
  assert jsonb_array_length(r->'draws') = 2, format('the 8-day-old and the malformed draws are not compared: %s', r->'draws');
  d := r->'draws'->0;
  assert d->>'draw_date' = '2026-09-16' and d->>'draw_time' = '21:00' and d->'numbers' = '["3","7","12","19","25","33"]'::jsonb
     and d->'matched' = '[33,19,3]'::jsonb and (d->>'matched_count')::int = 3
     and d ? 'verified_at' and d->>'source_url' = 'https://example.invalid/Super Premio'
     and not d ? 'positions', format('newest draw: %s', d);
  d := r->'draws'->1;
  assert d->>'draw_date' = '2026-09-12' and d->'matched' = '[4,3]'::jsonb and (d->>'matched_count')::int = 2, format('%s', d);
  -- Results only: no key about prizes, winning, odds or buying (the game's own name may contain "Premio").
  assert not exists (select 1 from jsonb_object_keys(r) k where k ~* '(prize|premio|winner|winning|\ywon\y|ganad|ganast|odds|probab|buy|compra|jackpot|bolsa|payout)')
     and not exists (select 1 from jsonb_array_elements(r->'draws') e, jsonb_object_keys(e) k
                      where k ~* '(prize|premio|winner|winning|\ywon\y|ganad|ganast|odds|probab|buy|compra|jackpot|bolsa|payout)'), format('results only: %s', r);

  -- No match is an empty list, counted, for a draw that was compared.
  r := app.lottery_check(h, pg_temp.game('HN', 'Super Premio'), '{8,9,10,11,13,14}', v_now);
  assert r->'draws'->0->'matched' = '[]'::jsonb and (r->'draws'->0->>'matched_count')::int = 0, format('%s', r);

  -- Digit semantics: position by position; the any-order play is reported separately.
  r := app.lottery_check(h, pg_temp.game('HN', 'Jugá 3'), '{8,2,1}', v_now);
  assert r->>'match' = 'digits' and jsonb_array_length(r->'draws') = 2, format('%s', r);
  d := r->'draws'->0;
  assert d->>'draw_time' = '21:00' and d->'positions' = '[true,false,true]'::jsonb and d->'matched' = '[8,1]'::jsonb
     and (d->>'matched_count')::int = 2 and d->'same_digits_any_order' = 'false'::jsonb, format('%s', d);
  d := r->'draws'->1;
  assert d->>'draw_time' = '15:00' and d->'positions' = '[false,false,false]'::jsonb and (d->>'matched_count')::int = 0,
    format('same digits in other places do not match by position: %s', d);
  r := app.lottery_check(h, pg_temp.game('HN', 'Jugá 3'), '{1,8,8}', v_now);
  d := r->'draws'->0;
  assert d->'positions' = '[false,true,false]'::jsonb and d->'matched' = '[8]'::jsonb and d->'same_digits_any_order' = 'true'::jsonb,
    format('%s', d);
  -- Repeated digits are valid in a digit game.
  assert app.lottery_check(h, pg_temp.game('HN', 'Jugá 3'), '{8,8,1}', v_now)->'draws'->0->'positions' = '[true,true,true]'::jsonb;

  -- A ticket with a leading zero matches the stored prize "08125".
  r := app.lottery_check(g, pg_temp.game('GT', 'Sorteo Ordinario'), '{8125}', v_now);
  assert r->>'state' = 'current' and r->'draws'->0->'matched' = '[8125]'::jsonb and r->'draws'->0->>'draw_time' is null
     and not (r->'draws'->0 ? 'draw_time'), format('%s', r);

  -- Format validation, from the stored format.
  foreach x in array array['[1,2,3]', '[1,2,3,4,5,34]', '[0,1,2,3,4,5]', '[1,1,2,3,4,5]', '[]', '[1,2,3,4,5,6,7]']::jsonb[] loop
    r := app.lottery_check(h, pg_temp.game('HN', 'Super Premio'), array(select jsonb_array_elements_text(x)::int), v_now);
    assert r->>'error' = 'invalid_numbers' and r->>'message' like 'Super Premio expects 6 numbers from 1 to 33, without repeats',
      format('%s -> %s', x, r);
  end loop;
  assert app.lottery_check(h, pg_temp.game('HN', 'Super Premio'), null, v_now)->>'error' = 'invalid_numbers';
  assert app.lottery_check(h, pg_temp.game('HN', 'Super Premio'), '{1,2,3,4,5,null}', v_now)->>'error' = 'invalid_numbers';
  r := app.lottery_check(h, pg_temp.game('HN', 'Jugá 3'), '{10,1,2}', v_now);
  assert r->>'error' = 'invalid_numbers' and r->>'message' = 'Jugá 3 expects 3 digits from 0 to 9', format('%s', r);
  assert app.lottery_check(h, pg_temp.game('HN', 'Jugá 3'), '{1,2}', v_now)->>'error' = 'invalid_numbers';
  assert app.lottery_check(g, pg_temp.game('GT', 'Sorteo Ordinario'), '{100000}', v_now)->>'error' = 'invalid_numbers';

  -- Unverified formats, other countries, unknown games, inactive clients.
  r := app.lottery_check(h, pg_temp.game('HN', 'Sin Formato'), '{1}', v_now);
  assert r->>'error' = 'format_unverified' and r->>'message' like '%not been verified%' and not r ? 'draws', format('%s', r);
  r := app.lottery_check(h, pg_temp.game('JM', 'Lotto'), '{3,4,19,20,30,33}', v_now);
  assert r->>'error' = 'not_your_country' and not r ? 'draws', format('%s', r);
  assert app.lottery_check(h, -1, '{1}', v_now)->>'error' = 'unknown_game';
  assert app.lottery_check(h, (select id from lottery_games where country = 'HN' and name = 'Diaria' and not active), '{1}', v_now)->>'error' = 'unknown_game',
    'an inactive game is not checkable';

  -- Stale by the game's rule: no draws, said as stale, never "not drawn".
  r := app.lottery_check(j, pg_temp.game('JM', 'Lotto'), '{3,4,19,20,30,33}', v_now);
  assert r->>'state' = 'stale' and r->'draws' = 'null'::jsonb and r->>'newest_draw_date' = '2026-09-09', format('%s', r);
  -- Four days after Saturday's draw a Wednesday/Saturday game is still current; five is not.
  assert app.lottery_game_current(pg_temp.game('HN', 'Super Premio'), '2026-09-16 16:00+00'), 'Sat 12 + 4 days';
  assert not app.lottery_game_current(pg_temp.game('HN', 'Super Premio'), '2026-09-21 16:00+00'), 'Wed 16 + 5 days';
  -- A daily game whose newest draw is 3 days old is stale.
  r := app.lottery_check(h, pg_temp.game('HN', 'Jugá 3'), '{8,8,1}', '2026-09-19 16:00+00');
  assert r->>'state' = 'stale' and r->'draws' = 'null'::jsonb, format('%s', r);
  -- A game with no results at all is stale, not empty.
  assert app.lottery_check(h, pg_temp.game('HN', 'La Diaria'), '{7}', v_now)->>'state' = 'stale';

  -- Checkable games: their country only, active, with a parser and a verified format.
  x := app.lottery_checkable_games(h);
  assert (select jsonb_agg(e->>'game' order by e->>'game') from jsonb_array_elements(x) e) = '["Jugá 3", "La Diaria", "Super Premio"]'::jsonb,
    format('%s', x);
  select e into d from jsonb_array_elements(x) e where e->>'game' = 'Super Premio';
  assert d->>'match' = 'set' and (d->>'pick_min')::int = 6 and (d->>'pick_max')::int = 6 and (d->>'min')::int = 1
     and (d->>'max')::int = 33 and d->'draw_times' = '["21:00"]'::jsonb and d->>'rules_url' = 'https://loto.hn/?pag=super_premio'
     and d->>'format_verified_at' = '2026-09-14', format('%s', d);
  select e into d from jsonb_array_elements(x) e where e->>'game' = 'Jugá 3';
  assert d->>'match' = 'digits' and (d->>'any_order_play')::boolean, format('%s', d);
  assert (select count(*) from jsonb_array_elements(app.lottery_checkable_games(j)) e where e->>'country' <> 'JM') = 0;
  assert jsonb_array_length(app.lottery_checkable_games(j)) = 3, 'Cash Pot, Lotto, Pick 3';
  update clients set active = false where id = g;
  assert app.lottery_checkable_games(g) is null and app.lottery_check(g, pg_temp.game('GT', 'Sorteo Ordinario'), '{8125}', v_now) is null;
  update clients set active = true where id = g;

  -- Every seeded active game with a parser has a verified format.
  assert not exists (select 1 from lottery_games lg
                      where lg.active and lg.parser_implemented
                        and lg.operator in ('Supreme Ventures', 'Lotería Nacional', 'Loto Honduras', 'Lotería Santa Lucía')
                        and not exists (select 1 from lottery_game_formats f
                                         where f.country = lg.country and f.operator = lg.operator and f.game_name = lg.name)),
    'a seeded game is missing its format';
  raise notice 'PASS lottery check: set and digit semantics, formats validated, unverified and foreign games refused, stale excluded';
end $$;

-- ---------------------------------------------------------------------------
-- Tu semana
-- ---------------------------------------------------------------------------

-- Opened: Sunday 23:30 Toronto (Monday in UTC) is last week; Monday 00:30 is this
-- week; a Tuesday 22:00 home render is Wednesday in UTC; Thursday; and a view
-- after p_now does not count.
insert into page_views (client_id, page, served_at) values
  ('99990000-0000-4000-8000-0000000000e1', 'clima', '2026-09-14 03:30+00'),
  ('99990000-0000-4000-8000-0000000000e1', 'tasa',  '2026-09-14 04:30+00'),
  ('99990000-0000-4000-8000-0000000000e1', 'futbol','2026-09-17 15:00+00'),
  ('99990000-0000-4000-8000-0000000000e1', 'mas',   '2026-09-18 01:00+00');
insert into home_renders (client_id, rendered_at, local_date, served, message) values
  ('99990000-0000-4000-8000-0000000000e1', '2026-09-16 02:00+00', '2026-09-15', '{}', '{}');

-- Rates: last week's last stored day, then three days this week.
delete from fx_rates where quote in ('HNL', 'JMD');
insert into fx_rates (rate_date, quote, rate) values
  ('2026-09-10', 'HNL', 19.00), ('2026-09-11', 'HNL', 19.40),
  ('2026-09-14', 'HNL', 19.50), ('2026-09-15', 'HNL', 19.30), ('2026-09-16', 'HNL', 19.60);

-- Football: the feed ran at 15:30; a result on Monday night (Tuesday in UTC), one
-- on Sunday night last week, the next match on Saturday and one next Monday.
insert into source_runs (feed, started_at, finished_at, status, source_result)
values ('fixtures', '2026-09-17 15:30:00+00', '2026-09-17 15:30:02+00', 'ok', 'items');
insert into fixtures (league_id, home_team_id, away_team_id, kickoff_utc, status, home_score, away_score, source, source_fixture_id, fetched_at)
select l.id, (select id from teams where name = 'Week FC'), (select id from teams where name = 'Other FC'),
       v.k::timestamptz, v.s::fixture_status, v.hs::smallint, v.aws::smallint, 'test', v.sid, '2026-09-17 15:00+00'
  from leagues l,
       (values ('2026-09-15 01:00+00', 'finished', 2, 1, 'week-f1'),
               ('2026-09-14 02:00+00', 'finished', 0, 0, 'week-f0'),
               ('2026-09-19 23:00+00', 'scheduled', null, null, 'week-f2'),
               ('2026-09-21 23:00+00', 'scheduled', null, null, 'week-f3')) v(k, s, hs, aws, sid)
 where l.name = 'Week Test League';

-- Holidays: one in 3 days, one in 11.
insert into holidays (country, holiday_date, name, verified_at, source_url) values
  ('HN', '2026-09-20', 'Feriado de Prueba Semana', '2026-09-01', 'https://example.invalid/feriado'),
  ('HN', '2026-09-28', 'Feriado de Prueba Lejano', '2026-09-01', 'https://example.invalid/feriado');

-- Leamington's forecast: two providers fetched at 14:00. Yesterday and next Monday
-- are outside "the rest of the week".
delete from local_forecasts where place_id = (select id from local_places where key = 'leamington');
insert into local_forecasts (place_id, provider, target_date, temp_min_c, temp_max_c, precip_prob, fetched_at)
select lp.id, p.p::forecast_provider, v.d::date, 10, case when p.p = 'open-meteo' then v.a else v.b end, 10, '2026-09-17 14:00+00'
  from local_places lp, (values ('open-meteo'), ('weatherapi')) p(p),
       (values ('2026-09-16', 35, 35), ('2026-09-17', 20, 21), ('2026-09-18', 25, 25), ('2026-09-19', 15, 16),
               ('2026-09-20', 18, 18), ('2026-09-21', 30, 30)) v(d, a, b)
 where lp.key = 'leamington';

do $$
declare
  h uuid := '99990000-0000-4000-8000-0000000000e1';
  j uuid := '99990000-0000-4000-8000-0000000000e2';
  v_now timestamptz := '2026-09-17 16:00+00';
  w jsonb; x jsonb;
begin
  w := app.week_summary(h, v_now);
  assert w->>'week_start' = '2026-09-14' and w->>'week_end' = '2026-09-20' and w->>'today' = '2026-09-17'
     and w->>'timezone' = 'America/Toronto' and (w->>'generated_at')::timestamptz = v_now, format('%s', w);

  -- Opened: Monday (00:30, not Sunday 23:30), Tuesday (22:00, Wednesday in UTC), Thursday; the rest are to come.
  assert w->'opened' = '{"days": 3, "weekdays": [true, true, false, true, null, null, null]}'::jsonb, format('opened: %s', w->'opened');

  -- Rate: the week's stored days against the day before, and against last week's last day.
  x := w->'rate';
  assert x->>'currency' = 'HNL' and x->>'note' = 'tasa de referencia' and (x->>'current')::boolean, format('%s', x);
  assert (select jsonb_agg(p->>'dir' order by p->>'date') from jsonb_array_elements(x->'points') p) = '["up", "down", "up"]'::jsonb,
    format('points: %s', x->'points');
  assert x->'high' = '{"date": "2026-09-16", "rate": 19.60}'::jsonb and x->'low' = '{"date": "2026-09-15", "rate": 19.30}'::jsonb
     and x->'latest' = '{"date": "2026-09-16", "rate": 19.60}'::jsonb
     and x->'last_week' = '{"date": "2026-09-11", "rate": 19.40}'::jsonb
     and (x->>'change')::numeric = 0.20 and (x->>'change_pct')::numeric = 1.03, format('rate: %s', x);
  assert x::text !~* '(buy|sell|compr|vend|best|mejor|recom)', 'no advice';

  -- Team: Monday night's result (not last Sunday's), and Saturday's match (not next Monday's).
  x := w->'team';
  assert x->>'team' = 'Week FC' and jsonb_array_length(x->'results') = 1
     and (x->'results'->0->>'home_score')::int = 2 and (x->'results'->0->>'away_score')::int = 1
     and (x->'next'->>'kickoff')::timestamptz = '2026-09-19 23:00+00' and not (x->'next' ? 'home_score'), format('team: %s', x);

  -- Lottery: the newest current result per game this week; Sin Formato and La Diaria have none.
  x := w->'lottery';
  assert (select jsonb_agg(e->>'game' order by e->>'game') from jsonb_array_elements(x) e) = '["Jugá 3", "Super Premio"]'::jsonb,
    format('lottery: %s', x);
  select e into x from jsonb_array_elements(w->'lottery') e where e->>'game' = 'Jugá 3';
  assert x->>'draw_date' = '2026-09-16' and x->>'draw_time' = '21:00' and x->'numbers' = '["8","8","1"]'::jsonb
     and x ? 'verified_at' and x ? 'source_url', format('%s', x);

  -- Holidays within 7 days only.
  assert exists (select 1 from jsonb_array_elements(w->'holidays_ahead') e
                  where e->>'name' = 'Feriado de Prueba Semana' and (e->>'days_left')::int = 3), format('%s', w->'holidays_ahead');
  assert not exists (select 1 from jsonb_array_elements(w->'holidays_ahead') e where (e->>'days_left')::int > 7);

  -- Badges earned this week: pueblo (Tuesday); fundador (March) is not.
  assert exists (select 1 from jsonb_array_elements(w->'badges') b where b->>'key' = 'pueblo' and b->>'earned_at' = '2026-09-15')
     and not exists (select 1 from jsonb_array_elements(w->'badges') b
                      where b->>'key' = 'fundador' or (b->>'earned_at')::date not between '2026-09-14' and '2026-09-17'),
    format('badges: %s', w->'badges');

  -- Weather: the forecast highs from today to Sunday, medians under the 0036 rules.
  x := w->'weather';
  assert x->>'kind' = 'forecast' and x->>'label' = 'pronóstico' and (x->>'days')::int = 4
     and x->>'from' = '2026-09-17' and x->>'to' = '2026-09-20'
     and x->'highest'->>'date' = '2026-09-18' and (x->'highest'->>'temp_max')::int = 25
     and x->'lowest'->>'date' = '2026-09-19' and (x->'lowest'->>'temp_max')::int = 16, format('weather: %s', x);

  -- Six hours later the fixtures feed is not current: results stay, the next match goes.
  x := app.week_summary(h, '2026-09-17 22:00+00')->'team';
  assert jsonb_array_length(x->'results') = 1 and x->'next' = 'null'::jsonb, format('%s', x);

  -- Friday 00:00 Toronto: Thursday night's view counts; today has none yet; the forecast is 14 hours old.
  w := app.week_summary(h, '2026-09-18 04:00+00');
  assert w->'opened' = '{"days": 3, "weekdays": [true, true, false, true, false, null, null]}'::jsonb, format('%s', w->'opened');
  assert w->'weather' = 'null'::jsonb, format('stale forecast is nothing: %s', w->'weather');

  -- Sunday 23:59 is still this week; Monday 00:00 Toronto (04:00 UTC) starts a new one with nothing opened yet.
  assert app.week_summary(h, '2026-09-21 03:59+00')->>'week_start' = '2026-09-14';
  w := app.week_summary(h, '2026-09-21 04:00+00');
  assert w->>'week_start' = '2026-09-21' and w->'opened' = 'null'::jsonb and w->'badges' = 'null'::jsonb, format('%s', w);

  -- Absent data is null, never zero: J has no views, no JMD rate, no team, only a stale lottery game.
  w := app.week_summary(j, v_now);
  assert w->'opened' = 'null'::jsonb and w->'rate' = 'null'::jsonb and w->'team' = 'null'::jsonb
     and w->'lottery' = 'null'::jsonb and w->'badges' = 'null'::jsonb, format('absent: %s', w);
  assert w->'weather'->>'label' = 'forecast', format('%s', w->'weather');
  assert w->'holidays_ahead' = 'null'::jsonb
      or not exists (select 1 from jsonb_array_elements(w->'holidays_ahead') e where (e->>'days_left')::int > 7);

  update clients set active = false where id = j;
  assert app.week_summary(j, v_now) is null;
  update clients set active = true where id = j;
  raise notice 'PASS week summary: parts from real rows, null when absent, weekday flags on the member''s clock';
end $$;

-- ---------------------------------------------------------------------------
-- Hometown gallery
-- ---------------------------------------------------------------------------
do $$
declare
  m  bigint := (select id from municipalities where country = 'GT' order by id limit 1);
  m2 bigint := (select id from municipalities where country = 'GT' order by id offset 1 limit 1);
  before jsonb; g jsonb;
begin
  delete from municipality_photos where municipality_id in (m, m2);
  insert into municipality_photos (municipality_id, content_type, bytes, width, height, sha256, file_title,
                                   source_page_url, article_url, author, license, license_url)
  values (m, 'image/jpeg', '\xffd8ff01'::bytea, 480, 320, 'sha-lead', 'File:Lead.jpg',
          'https://commons.wikimedia.org/wiki/File:Lead.jpg', 'https://es.wikipedia.org/wiki/Town', 'Ana', 'CC BY-SA 4.0',
          'https://creativecommons.org/licenses/by-sa/4.0');
  before := app.town_photo(m);
  assert before = jsonb_build_object('municipality_id', m, 'author', 'Ana', 'license', 'CC BY-SA 4.0',
                                     'license_url', 'https://creativecommons.org/licenses/by-sa/4.0',
                                     'source_page_url', 'https://commons.wikimedia.org/wiki/File:Lead.jpg',
                                     'width', 480, 'height', 320), format('town_photo keeps its 0034 shape: %s', before);
  assert (select gallery_checked_at from municipality_photos where municipality_id = m) is null;

  -- Photo 1 alone.
  assert app.town_gallery(m) = jsonb_build_array(jsonb_build_object('rank', 1, 'author', 'Ana', 'license', 'CC BY-SA 4.0',
           'license_url', 'https://creativecommons.org/licenses/by-sa/4.0',
           'source_page_url', 'https://commons.wikimedia.org/wiki/File:Lead.jpg', 'width', 480, 'height', 320)),
    format('%s', app.town_gallery(m));

  -- Ranks 3 then 2: listed in rank order after photo 1.
  insert into municipality_gallery_photos (municipality_id, rank, content_type, bytes, width, height, sha256, file_title,
                                           source_page_url, article_url, author, license, license_url)
  values (m, 3, 'image/jpeg', '\xffd8ff03'::bytea, 480, 300, 'sha-3', 'File:Three.jpg', 'https://commons.wikimedia.org/wiki/File:Three.jpg',
          'https://es.wikipedia.org/wiki/Town', 'Luis', 'CC BY 4.0', null),
         (m, 2, 'image/jpeg', '\xffd8ff02'::bytea, 480, 310, 'sha-2', 'File:Two.jpg', 'https://commons.wikimedia.org/wiki/File:Two.jpg',
          'https://es.wikipedia.org/wiki/Town', 'Rosa', 'CC0', null);
  g := app.town_gallery(m);
  assert (select jsonb_agg((e->>'rank')::int) from jsonb_array_elements(g) e) = '[1, 2, 3]'::jsonb
     and g->1->>'author' = 'Rosa' and g->2->>'author' = 'Luis' and (g->2->>'height')::int = 300
     and g->2 ? 'license_url' and g->2->'license_url' = 'null'::jsonb, format('%s', g);
  assert not exists (select 1 from jsonb_array_elements(g) e
                      where (select array_agg(k order by k) from jsonb_object_keys(e) k)
                            <> array['author', 'height', 'license', 'license_url', 'rank', 'source_page_url', 'width']),
    format('credits only, no bytes: %s', g);
  assert app.town_photo(m) = before, 'town_photo is unchanged by the gallery';

  -- Refused: rank 1 or 7, a taken rank, photo 1's file or bytes, a repeated file, a town with no photo 1.
  begin
    insert into municipality_gallery_photos (municipality_id, rank, content_type, bytes, sha256, file_title, source_page_url, article_url, author, license)
    values (m, 1, 'image/jpeg', '\x01', 'sha-x1', 'File:X1.jpg', 'u', 'a', 'x', 'CC0');
    assert false, 'rank 1 accepted';
  exception when check_violation then null;
  end;
  begin
    insert into municipality_gallery_photos (municipality_id, rank, content_type, bytes, sha256, file_title, source_page_url, article_url, author, license)
    values (m, 7, 'image/jpeg', '\x01', 'sha-x7', 'File:X7.jpg', 'u', 'a', 'x', 'CC0');
    assert false, 'rank 7 accepted';
  exception when check_violation then null;
  end;
  begin
    insert into municipality_gallery_photos (municipality_id, rank, content_type, bytes, sha256, file_title, source_page_url, article_url, author, license)
    values (m, 2, 'image/jpeg', '\x01', 'sha-x2', 'File:X2.jpg', 'u', 'a', 'x', 'CC0');
    assert false, 'a taken rank accepted';
  exception when unique_violation then null;
  end;
  begin
    insert into municipality_gallery_photos (municipality_id, rank, content_type, bytes, sha256, file_title, source_page_url, article_url, author, license)
    values (m, 4, 'image/jpeg', '\x01', 'sha-x4', 'File:Lead.jpg', 'u', 'a', 'x', 'CC0');
    assert false, 'photo 1''s file accepted in the gallery';
  exception when unique_violation then null;
  end;
  begin
    insert into municipality_gallery_photos (municipality_id, rank, content_type, bytes, sha256, file_title, source_page_url, article_url, author, license)
    values (m, 4, 'image/jpeg', '\x01', 'sha-lead', 'File:Other name.jpg', 'u', 'a', 'x', 'CC0');
    assert false, 'photo 1''s bytes accepted in the gallery';
  exception when unique_violation then null;
  end;
  begin
    insert into municipality_gallery_photos (municipality_id, rank, content_type, bytes, sha256, file_title, source_page_url, article_url, author, license)
    values (m, 4, 'image/jpeg', '\x01', 'sha-x5', 'File:Two.jpg', 'u', 'a', 'x', 'CC0');
    assert false, 'a repeated file accepted';
  exception when unique_violation then null;
  end;
  begin
    insert into municipality_gallery_photos (municipality_id, rank, content_type, bytes, sha256, file_title, source_page_url, article_url, author, license)
    values (m2, 2, 'image/jpeg', '\x01', 'sha-x6', 'File:X6.jpg', 'u', 'a', 'x', 'CC0');
    assert false, 'a gallery without photo 1 accepted';
  exception when foreign_key_violation then null;
  end;
  assert app.town_gallery(m2) is null and app.town_photo(m2) is null, 'no photo: null, not []';

  -- Removing photo 1 removes the gallery.
  delete from municipality_photos where municipality_id = m;
  assert not exists (select 1 from municipality_gallery_photos where municipality_id = m) and app.town_gallery(m) is null;
  raise notice 'PASS town gallery: ranks 2-6 after photo 1, credits only, town_photo unchanged';
end $$;

rollback;
