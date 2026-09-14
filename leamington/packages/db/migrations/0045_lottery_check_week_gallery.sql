-- 0045_lottery_check_week_gallery.sql
-- Round 5, "Siempre contigo" (data side).
--
--   * ¿Salió mi número? (feature 21): app.lottery_check compares a member's
--     numbers with the OFFICIAL stored results of one game of their country
--     from the last 7 days. It says only which numbers match: never a prize, a
--     "you won", odds or a buy link. Each game's pick format lives in
--     lottery_game_formats, read from the operator's own rules page (URL and
--     quote kept); a game with no verified format cannot be checked.
--   * Tu semana (feature 22, replaces Quiniela Hoy: the football provider
--     account is suspended, so a picks game would have nothing to show):
--     app.week_summary, a recap of the member's local Monday-Sunday week from
--     real rows only. Every part is null when its data is absent.
--   * Hometown gallery (feature 23): up to 6 photos per town. Photo 1 stays in
--     municipality_photos (app.town_photo and /api/photo are unchanged); photos
--     2-6 live in municipality_gallery_photos. app.town_gallery lists all of them.

-- ---------------------------------------------------------------------------
-- 1. Lottery: per-game pick formats and the number check
-- ---------------------------------------------------------------------------

-- Keyed by the game's (country, operator, name), not its id: lottery_games rows
-- come from seeds/lottery_games.sql, which runs after migrations on a fresh
-- database. A format row whose game does not exist is simply unused.
--
--   match_kind  'set'     any order: the member's numbers that are among the
--                         drawn numbers (Lotto, Melate, Chispazo, Super Premio,
--                         and one-number games: Cash Pot, La Diaria, Santa Lucía
--                         tickets against the three main prizes)
--               'digits'  one digit per position, compared position by position
--                         (Pick 3, Jugá 3, Tris)
--   pick_min/pick_max  how many numbers (or digits) the member enters
--   min_value/max_value  the range of each
--   draw_count  how many numbers an official stored result has; a stored draw of
--               another shape is never compared
--   any_order_play  the operator also sells an any-order play of the same digits
--               (Pick 3 "Mix", Jugá 3 "Mixeá Tres"), so the check also says
--               whether the same digits came out in another order
--   stale_days  a game's results count only while its newest stored draw is at
--               most this many local days old: 2 for daily games (as
--               app.lottery_page), otherwise the longest gap in its schedule
--               (see seeds/lottery_games.sql for each schedule's source)
create table lottery_game_formats (
  country         country_code not null,
  operator        text not null,
  game_name       text not null,
  match_kind      text not null check (match_kind in ('set', 'digits')),
  pick_min        smallint not null check (pick_min >= 1),
  pick_max        smallint not null,
  min_value       integer not null,
  max_value       integer not null,
  distinct_picks  boolean not null,
  draw_count      smallint not null check (draw_count >= 1),
  any_order_play  boolean not null default false,
  stale_days      smallint not null check (stale_days between 1 and 60),
  rules_url       text not null,
  rules_quote     text not null,          -- the operator's own words the format was read from
  verified_at     date not null,
  primary key (country, operator, game_name),
  check (pick_max >= pick_min and max_value > min_value),
  check (match_kind = 'set' or (min_value = 0 and max_value = 9 and pick_min = pick_max and pick_min = draw_count
                                and not distinct_picks))
);
alter table lottery_game_formats enable row level security;
create policy lottery_game_formats_read on lottery_game_formats for select using (auth.role() in ('authenticated', 'service_role'));

-- Verified 2026-09-14 on each operator's rules page. Games not listed here have
-- no verified format and cannot be checked.
insert into lottery_game_formats (country, operator, game_name, match_kind, pick_min, pick_max, min_value, max_value,
                                  distinct_picks, draw_count, any_order_play, stale_days, rules_url, rules_quote, verified_at)
values
  -- Jamaica, Supreme Ventures. Daily except Christmas Day and Good Friday; Lotto Wed and Sat.
  ('JM', 'Supreme Ventures', 'Cash Pot', 'set', 1, 36, 1, 36, true, 1, false, 2,
   'https://supremeventures.com/game/cash-pot',
   'Select your favourite number(s) from a range of 1 to 36.', '2026-09-14'),
  ('JM', 'Supreme Ventures', 'Pick 3', 'digits', 3, 3, 0, 9, false, 3, true, 2,
   'https://supremeventures.com/game/pick-3',
   'Choose three numbers from 0 to 9. Straight: must appear in the exact order for you to win. Mix: drawn in any order.', '2026-09-14'),
  -- The bonus ball is drawn, not picked, as far as the page says; it is not compared.
  ('JM', 'Supreme Ventures', 'Lotto', 'set', 6, 6, 1, 38, true, 6, false, 4,
   'https://supremeventures.com/game/lotto/',
   'Choose six numbers from a field of 38, ranging from 1 to 38.', '2026-09-14'),
  -- Mexico, Lotería Nacional. Melate Wed, Fri and Sun (longest gap 3 days); the adicional is not picked.
  ('MX', 'Lotería Nacional', 'Melate', 'set', 6, 10, 1, 56, true, 6, false, 3,
   'https://www.loterianacional.gob.mx/Melate/Melate',
   'escogiendo 6, 7, 8, 9, o hasta 10 números ... de un conjunto entre 1 al 56', '2026-09-14'),
  ('MX', 'Lotería Nacional', 'Chispazo', 'set', 5, 7, 1, 28, true, 5, false, 2,
   'https://www.loterianacional.gob.mx/Chispazo/Chispazo',
   'combinación posible de 5, 6, o hasta 7 números ... del 1 al 28', '2026-09-14'),
  -- Tris: the full 5-digit number; Directa 4/3, Par and Número bets are positions of it.
  ('MX', 'Lotería Nacional', 'Tris', 'digits', 5, 5, 0, 9, false, 5, false, 2,
   'https://www.loterianacional.gob.mx/Tris/Tris',
   'una cifra de 5 dígitos que, al coincidir con los números de tu boleto ... en estricto orden', '2026-09-14'),
  -- Honduras, LOTO Honduras. Super Premio Wed and Sat.
  ('HN', 'Loto Honduras', 'La Diaria', 'set', 1, 1, 0, 99, true, 1, false, 2,
   'https://loto.hn/?pag=diaria',
   'Seleccioná 1 número de dos dígitos del 00 al 99', '2026-09-14'),
  ('HN', 'Loto Honduras', 'Jugá 3', 'digits', 3, 3, 0, 9, false, 3, true, 2,
   'https://loto.hn/?pag=juga3',
   'Elegí un número del 000 y 999. Ordená Tres: en el orden correcto. Mixeá Tres: en cualquier orden.', '2026-09-14'),
  ('HN', 'Loto Honduras', 'Super Premio', 'set', 6, 6, 1, 33, true, 6, false, 4,
   'https://loto.hn/?pag=super_premio',
   'Seleccioná seis números del 01 al 33 de forma manual o al azar', '2026-09-14'),
  -- Guatemala, Lotería Santa Lucía: a printed 5-digit ticket against the three
  -- main prizes (the stored numbers). The emission's upper limit is not published,
  -- so any 5-digit number is accepted, as the results page itself does.
  -- Ordinario weekly (7 days); Extraordinario about monthly (35 days).
  ('GT', 'Lotería Santa Lucía', 'Sorteo Ordinario', 'set', 1, 1, 0, 99999, true, 3, false, 7,
   'https://prociegosysordos.org.gt/resultados/ordinario/3136/',
   'Ingresa los 5 dígitos del billete. Los ceros al inicio son válidos.', '2026-09-14'),
  ('GT', 'Lotería Santa Lucía', 'Sorteo Extraordinario', 'set', 1, 1, 0, 99999, true, 3, false, 35,
   'https://prociegosysordos.org.gt/resultados/extraordinario/414/',
   'Ingresa los 5 dígitos del billete. Los ceros al inicio son válidos.', '2026-09-14');

-- Whether a game's stored results are current by its stale rule: its newest
-- stored draw is at most stale_days old on the game's own clock.
create or replace function app.lottery_game_current(p_game_id bigint, p_now timestamptz)
returns boolean language sql stable set search_path = public, app as $$
  select coalesce((select max(r.draw_date) from lottery_results r
                    where r.game_id = g.id and r.draw_date <= (p_now at time zone g.timezone)::date)
                  >= (p_now at time zone g.timezone)::date - f.stale_days, false)
    from lottery_games g
    join lottery_game_formats f on f.country = g.country and f.operator = g.operator and f.game_name = g.name
   where g.id = p_game_id
$$;

-- The games a member can check: their country's active games with a parser and
-- a verified format. [] when none; null when the client is not active.
create or replace function app.lottery_checkable_games(p_client_id uuid)
returns jsonb
language plpgsql
stable
set search_path = public, app
as $$
declare
  v_country country_code;
  v_lang    text;
begin
  select cl.country, cl.language::text into v_country, v_lang from clients cl where cl.id = p_client_id and cl.active;
  if not found then
    return null;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'game_id', g.id, 'game', g.name, 'operator', g.operator, 'country', g.country,
             'match', f.match_kind, 'pick_min', f.pick_min, 'pick_max', f.pick_max,
             'min', f.min_value, 'max', f.max_value, 'distinct', f.distinct_picks,
             'any_order_play', f.any_order_play,
             'draw_times', (select coalesce(jsonb_agg(to_char(t, 'HH24:MI') order by t), '[]'::jsonb) from unnest(g.draw_times_local) t),
             'rules_url', f.rules_url, 'format_verified_at', f.verified_at)
           order by g.name)
      from lottery_games g
      join lottery_game_formats f on f.country = g.country and f.operator = g.operator and f.game_name = g.name
     where g.country = v_country and g.active and g.parser_implemented), '[]'::jsonb);
end $$;

-- A member's numbers against one game's official results of the last 7 days
-- (the game's local today and the 6 days before). Refusals are returned, not
-- raised, so a page can say what is wrong:
--   {"error": "unknown_game" | "not_your_country" | "format_unverified" | "invalid_numbers", "message": ...}
-- A game whose results are stale by its rule returns state "stale" and no
-- draws: comparing with an incomplete week would read as "not drawn".
create or replace function app.lottery_check(p_client_id uuid, p_game_id bigint, p_numbers int[], p_now timestamptz default now())
returns jsonb
language plpgsql
stable
set search_path = public, app
as $$
declare
  v_c      clients%rowtype;
  v_g      lottery_games%rowtype;
  v_f      lottery_game_formats%rowtype;
  v_today  date;
  v_n      int;
  v_newest date;
  v_draws  jsonb;
begin
  select * into v_c from clients where id = p_client_id and active;
  if not found then
    return null;
  end if;

  select * into v_g from lottery_games where id = p_game_id and active and parser_implemented;
  if not found then
    return jsonb_build_object('error', 'unknown_game', 'message', 'no active lottery game with this id', 'game_id', p_game_id);
  end if;
  if v_g.country <> v_c.country then
    return jsonb_build_object('error', 'not_your_country', 'message', 'only games of the member''s country can be checked',
                              'game_id', p_game_id);
  end if;
  select * into v_f from lottery_game_formats f
   where f.country = v_g.country and f.operator = v_g.operator and f.game_name = v_g.name;
  if not found then
    return jsonb_build_object('error', 'format_unverified', 'game_id', p_game_id, 'game', v_g.name,
      'message', 'this game''s pick format has not been verified from the operator''s rules, so it cannot be checked');
  end if;

  v_n := coalesce(cardinality(p_numbers), 0);
  if v_n < v_f.pick_min or v_n > v_f.pick_max
     or exists (select 1 from unnest(p_numbers) x where x is null or x < v_f.min_value or x > v_f.max_value)
     or (v_f.distinct_picks and (select count(distinct x) from unnest(p_numbers) x) <> v_n) then
    return jsonb_build_object('error', 'invalid_numbers', 'game_id', p_game_id, 'game', v_g.name,
      'message', format('%s expects %s %s from %s to %s%s', v_g.name,
                        case when v_f.pick_min = v_f.pick_max then v_f.pick_min::text else v_f.pick_min || '-' || v_f.pick_max end,
                        case when v_f.match_kind = 'digits' then 'digits' else 'numbers' end,
                        v_f.min_value, v_f.max_value, case when v_f.distinct_picks then ', without repeats' else '' end),
      'match', v_f.match_kind, 'pick_min', v_f.pick_min, 'pick_max', v_f.pick_max, 'min', v_f.min_value, 'max', v_f.max_value);
  end if;

  v_today := (p_now at time zone v_g.timezone)::date;
  select max(r.draw_date) into v_newest from lottery_results r where r.game_id = v_g.id and r.draw_date <= v_today;

  if not app.lottery_game_current(v_g.id, p_now) then
    return jsonb_build_object(
      'game_id', v_g.id, 'game', v_g.name, 'operator', v_g.operator, 'match', v_f.match_kind,
      'numbers', to_jsonb(p_numbers), 'state', 'stale', 'newest_draw_date', v_newest,
      'window', jsonb_build_object('from', v_today - 6, 'to', v_today),
      'draws', null, 'rules_url', v_f.rules_url, 'checked_at', p_now);
  end if;

  select coalesce(jsonb_agg(d.j order by d.draw_date desc, d.draw_time_local desc nulls last), '[]'::jsonb) into v_draws
    from (select r.draw_date, r.draw_time_local,
                 jsonb_strip_nulls(jsonb_build_object(
                   'draw_date', r.draw_date,
                   'draw_time', to_char(r.draw_time_local, 'HH24:MI'),
                   'numbers', to_jsonb(r.numbers),
                   'matched', to_jsonb(m.matched),
                   'matched_count', cardinality(m.matched),
                   'positions', case when v_f.match_kind = 'digits' then to_jsonb(m.positions) end,
                   'same_digits_any_order', case when v_f.match_kind = 'digits' and v_f.any_order_play then m.any_order end,
                   'verified_at', r.verified_at,
                   'source_url', r.source_url)) as j
            from lottery_results r
            cross join lateral (select array(select x::int from unnest(r.numbers) x) as official) o
            cross join lateral (
              select case when v_f.match_kind = 'set'
                          then array(select p.x from unnest(p_numbers) with ordinality p(x, i)
                                      where p.x = any(o.official) order by p.i)
                          else array(select p_numbers[i] from generate_series(1, v_n) i
                                      where p_numbers[i] = o.official[i] order by i) end as matched,
                     array(select p_numbers[i] = o.official[i] from generate_series(1, v_n) i order by i) as positions,
                     (select array_agg(x order by x) from unnest(p_numbers) x)
                       = (select array_agg(x order by x) from unnest(o.official) x) as any_order
            ) m
           where r.game_id = v_g.id
             and r.draw_date between v_today - 6 and v_today
             and cardinality(r.numbers) = v_f.draw_count
             and not exists (select 1 from unnest(r.numbers) x where x !~ '^\d+$')) d;

  return jsonb_build_object(
    'game_id', v_g.id, 'game', v_g.name, 'operator', v_g.operator, 'match', v_f.match_kind,
    'numbers', to_jsonb(p_numbers), 'state', 'current', 'newest_draw_date', v_newest,
    'window', jsonb_build_object('from', v_today - 6, 'to', v_today),
    'draws', v_draws, 'rules_url', v_f.rules_url, 'checked_at', p_now);
end $$;

-- ---------------------------------------------------------------------------
-- 2. Tu semana
-- ---------------------------------------------------------------------------

-- The member's local week (Monday to Sunday) so far, and what is ahead in it.
-- Every part is null when there is nothing real to show: never "0 results".
--   opened          distinct local days with a page view or home render (as the
--                   fiel badge counts), and 7 weekday flags, null for days to come
--   rate            this week's stored reference-rate days, high and low, and the
--                   change from last week's last stored day
--   team            their team's finished matches this week, and the next match
--                   this week only while the fixtures feed is current
--                   (football_page's rules)
--   lottery         each game of their country: the newest official result this
--                   week, only while the game is current by its stale rule
--   holidays_ahead  Ontario and home holidays within the next 7 days
--   badges          badges earned this week
--   weather         Leamington's highest and lowest forecast daily high from
--                   today to Sunday (the 0036 summary rules), labelled a forecast
create or replace function app.week_summary(p_client_id uuid, p_now timestamptz default now())
returns jsonb
language plpgsql
stable
set search_path = public, app
as $$
declare
  v_c        clients%rowtype;
  v_lang     text;
  v_today    date;
  v_start    date;
  v_end      date;
  v_days     date[];
  v_opened   jsonb;
  v_currency fx_currency;
  v_rate     jsonb;
  v_team     jsonb;
  v_f        jsonb;
  v_results  jsonb;
  v_next     jsonb;
  v_lottery  jsonb;
  v_hol      jsonb;
  v_badges   jsonb;
  v_weather  jsonb;
begin
  select * into v_c from clients where id = p_client_id and active;
  if not found then
    return null;
  end if;
  v_lang := v_c.language::text;
  v_today := (p_now at time zone v_c.timezone)::date;
  v_start := v_today - (extract(isodow from v_today)::int - 1);
  v_end := v_start + 6;

  -- Opened: days of this week with a page view or a home render, on the member's clock.
  select array_agg(distinct (t.at at time zone v_c.timezone)::date) into v_days
    from (select pv.served_at as at from page_views pv
           where pv.client_id = p_client_id and pv.served_at <= p_now
             and pv.served_at >= (v_start::timestamp at time zone v_c.timezone)
          union all
          select hr.rendered_at from home_renders hr
           where hr.client_id = p_client_id and hr.rendered_at <= p_now
             and hr.rendered_at >= (v_start::timestamp at time zone v_c.timezone)) t;
  if v_days is not null then
    v_opened := jsonb_build_object(
      'days', cardinality(v_days),
      'weekdays', (select jsonb_agg(case when d > v_today then null else d = any(v_days) end order by d)
                     from generate_series(v_start, v_end, interval '1 day') g(dd), lateral (select g.dd::date as d) x));
  end if;

  -- Rate: the week's stored days, each against the stored day before it.
  v_currency := app.fx_currency_for(v_c.country);
  select jsonb_build_object(
           'currency', v_currency,
           'note', case when v_lang = 'en' then 'reference rate' else 'tasa de referencia' end,
           'points', jsonb_agg(jsonb_build_object('date', w.rate_date, 'rate', w.rate,
                        'dir', case when w.prev is null then null when w.rate > w.prev then 'up'
                                    when w.rate < w.prev then 'down' else 'same' end) order by w.rate_date),
           'high', (array_agg(jsonb_build_object('date', w.rate_date, 'rate', w.rate) order by w.rate desc, w.rate_date desc))[1],
           'low', (array_agg(jsonb_build_object('date', w.rate_date, 'rate', w.rate) order by w.rate asc, w.rate_date desc))[1],
           'latest', (array_agg(jsonb_build_object('date', w.rate_date, 'rate', w.rate) order by w.rate_date desc))[1],
           'current', max(w.rate_date) >= v_today - 3,
           'last_week', (array_agg(case when w.prev_date < v_start then jsonb_build_object('date', w.prev_date, 'rate', w.prev) end
                                   order by w.rate_date))[1],
           'change', (array_agg(case when w.lw is not null then round(w.rate - w.lw, 4) end order by w.rate_date desc))[1],
           'change_pct', (array_agg(case when w.lw is not null then round((w.rate - w.lw) / w.lw * 100, 2) end order by w.rate_date desc))[1])
    into v_rate
    from (select fr.rate_date, fr.rate,
                 lag(fr.rate) over (order by fr.rate_date) as prev,
                 lag(fr.rate_date) over (order by fr.rate_date) as prev_date,
                 (select l.rate from fx_rates l where l.quote = v_currency and l.rate_date < v_start
                   order by l.rate_date desc limit 1) as lw
            from fx_rates fr
           where fr.quote = v_currency and fr.rate_date <= v_today
             and fr.rate_date >= coalesce((select max(l.rate_date) from fx_rates l where l.quote = v_currency and l.rate_date < v_start), v_start)
         ) w
   where w.rate_date between v_start and v_today
  having count(*) > 0;

  -- Team: finished matches this week, and the next one while the feed is current.
  if v_c.team_id is not null then
    select jsonb_agg(app.fixture_json(f.id, v_c.timezone, v_today) order by f.kickoff_utc) into v_results
      from fixtures f
     where (f.home_team_id = v_c.team_id or f.away_team_id = v_c.team_id)
       and f.status = 'finished' and f.home_score is not null and f.away_score is not null
       and f.kickoff_utc <= p_now
       and (f.kickoff_utc at time zone v_c.timezone)::date between v_start and v_today;
    v_f := app.football_page(p_client_id, p_now);
    if jsonb_typeof(v_f->'upcoming') = 'array' then
      select u into v_next
        from jsonb_array_elements(v_f->'upcoming') u
       where u->>'status' = 'scheduled' and (u->>'kickoff')::timestamptz > p_now
         and ((u->>'kickoff')::timestamptz at time zone v_c.timezone)::date <= v_end
       order by (u->>'kickoff')::timestamptz limit 1;
    end if;
    if v_results is not null or v_next is not null then
      v_team := jsonb_build_object('team', v_f->>'team', 'team_id', v_c.team_id, 'results', v_results, 'next', v_next,
                                   'fixtures_confirmed_at', v_f->'fixtures_confirmed_at');
    end if;
  end if;

  -- Lottery: the newest official result per game this week, while the game is current.
  select jsonb_agg(jsonb_build_object('game_id', g.id, 'game', g.name, 'operator', g.operator,
                                      'draw_date', r.draw_date, 'draw_time', to_char(r.draw_time_local, 'HH24:MI'),
                                      'numbers', to_jsonb(r.numbers), 'verified_at', r.verified_at, 'source_url', r.source_url)
                   order by g.name)
    into v_lottery
    from lottery_games g
    cross join lateral (select * from lottery_results lr
                         where lr.game_id = g.id and lr.draw_date between v_start and v_today
                           and lr.draw_date <= (p_now at time zone g.timezone)::date
                         order by lr.draw_date desc, lr.draw_time_local desc nulls last limit 1) r
   where g.country = v_c.country and g.active and g.parser_implemented
     and coalesce(app.lottery_game_current(g.id, p_now),
                  -- a game with no verified format: lottery_page's 2-day rule
                  r.draw_date >= (p_now at time zone g.timezone)::date - 2);

  -- Holidays in the next 7 days.
  select jsonb_agg(h order by (h->>'date')::date) into v_hol
    from jsonb_array_elements(coalesce(app.holidays_here_and_there(p_client_id, p_now, 50), '[]'::jsonb)) h
   where (h->>'days_left')::int between 0 and 7;

  -- Badges earned this week.
  select jsonb_agg(b order by (b->>'earned_at')::date, b->>'key') into v_badges
    from jsonb_array_elements(coalesce(app.member_badges(p_client_id, p_now), '[]'::jsonb)) b
   where (b->>'earned')::boolean and (b->>'earned_at')::date between v_start and v_today;

  -- Leamington's forecast highs for the rest of the week.
  select case when count(*) > 0 then jsonb_build_object(
           'place', 'Leamington',
           'kind', 'forecast',
           'label', case when v_lang = 'en' then 'forecast' else 'pronóstico' end,
           'from', min(s.dt), 'to', max(s.dt), 'days', count(*),
           'highest', (array_agg(jsonb_build_object('date', s.dt, 'temp_max', (s.s->>'temp_max')::int, 'text', s.s->>'text')
                                 order by (s.s->>'temp_max')::numeric desc, s.dt))[1],
           'lowest', (array_agg(jsonb_build_object('date', s.dt, 'temp_max', (s.s->>'temp_max')::int, 'text', s.s->>'text')
                                order by (s.s->>'temp_max')::numeric asc, s.dt))[1]) end
    into v_weather
    from local_places lp
    cross join lateral (select g::date as dt, app.local_forecast_summary(lp.id, g::date, p_now, v_lang) as s
                          from generate_series((p_now at time zone lp.timezone)::date, v_end, interval '1 day') g) s
   where lp.key = 'leamington' and lp.active and s.s is not null;

  return jsonb_build_object(
    'language', v_lang,
    'timezone', v_c.timezone,
    'week_start', v_start,
    'week_end', v_end,
    'today', v_today,
    'opened', v_opened,
    'rate', v_rate,
    'team', v_team,
    'lottery', v_lottery,
    'holidays_ahead', v_hol,
    'badges', v_badges,
    'weather', v_weather,
    'generated_at', p_now);
end $$;

-- ---------------------------------------------------------------------------
-- 3. Hometown gallery
-- ---------------------------------------------------------------------------

-- Photos 2-6 of a town, under the same rules as photo 1 (0034), fetched by the
-- daily photos job (services/ingest/src/feeds/town-photos.mjs). A gallery needs
-- a photo 1: removing it removes the gallery.
create table municipality_gallery_photos (
  municipality_id bigint not null references municipality_photos(municipality_id) on delete cascade,
  rank            smallint not null check (rank between 2 and 6),
  content_type    text not null check (content_type in ('image/jpeg', 'image/webp')),
  bytes           bytea not null check (octet_length(bytes) between 1 and 120000),
  width           integer,
  height          integer,
  sha256          text not null,
  file_title      text not null,          -- "File:..." on Wikimedia Commons
  source_page_url text not null,
  article_url     text not null,
  author          text not null,
  license         text not null,
  license_url     text,
  fetched_at      timestamptz not null default now(),
  primary key (municipality_id, rank),
  unique (municipality_id, file_title),
  unique (municipality_id, sha256)
);
alter table municipality_gallery_photos enable row level security;
create policy municipality_gallery_photos_read on municipality_gallery_photos
  for select using (auth.role() in ('authenticated', 'service_role'));

-- When the job last looked at every gallery candidate of a town, so a town with
-- fewer than 6 usable photos is not asked of Wikimedia every day.
alter table municipality_photos add column gallery_checked_at timestamptz;

-- A gallery photo is never photo 1 again.
create or replace function app.gallery_photo_not_lead()
returns trigger language plpgsql set search_path = public, app as $$
begin
  if exists (select 1 from municipality_photos p
              where p.municipality_id = new.municipality_id
                and (p.file_title = new.file_title or p.sha256 = new.sha256)) then
    raise exception 'gallery photo % is the town''s photo 1', new.file_title using errcode = 'unique_violation';
  end if;
  return new;
end $$;
create trigger municipality_gallery_photos_not_lead
  before insert or update on municipality_gallery_photos
  for each row execute function app.gallery_photo_not_lead();

-- The town's photos in order: photo 1, then the gallery. Credits only; the bytes
-- are served by a route. Null when the town has no photo.
create or replace function app.town_gallery(p_municipality_id bigint)
returns jsonb language sql stable set search_path = public, app as $$
  select jsonb_agg(x.j order by x.rank)
    from (select 1 as rank, jsonb_build_object('rank', 1, 'author', p.author, 'license', p.license, 'license_url', p.license_url,
                                              'source_page_url', p.source_page_url, 'width', p.width, 'height', p.height) as j
            from municipality_photos p where p.municipality_id = p_municipality_id
          union all
          select g.rank, jsonb_build_object('rank', g.rank, 'author', g.author, 'license', g.license, 'license_url', g.license_url,
                                            'source_page_url', g.source_page_url, 'width', g.width, 'height', g.height)
            from municipality_gallery_photos g where g.municipality_id = p_municipality_id) x
$$;
