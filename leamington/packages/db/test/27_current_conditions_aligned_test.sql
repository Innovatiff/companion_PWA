-- "Ahora" combines readings of the same moment, and one outlier does not make a
-- range (0043). The production cases that prompted it, on test 13's "Section
-- Home" town, with the clock pinned at 2026-09-14 13:40 UTC.
\set ON_ERROR_STOP on
begin;

create function pg_temp.readings(p_rows jsonb) returns void language sql as $$
  delete from current_conditions where municipality_id = (select id from municipalities where name = 'Section Home');
  insert into current_conditions (municipality_id, provider, observed_at, temp_c, fetched_at)
  select (select id from municipalities where name = 'Section Home'), (r->>'p')::forecast_provider,
         (r->>'obs')::timestamptz, (r->>'t')::numeric, (r->>'obs')::timestamptz + interval '5 minutes'
    from jsonb_array_elements(p_rows) r;
$$;

do $$
declare s jsonb; v_home bigint := (select id from municipalities where name = 'Section Home');
  v_now timestamptz := '2026-09-14 13:40+00';
begin
  -- Leamington's first morning: the 13:00 reading is 30 minutes older than the newest.
  perform pg_temp.readings('[{"p":"open-meteo","obs":"2026-09-14 13:30+00","t":15.6},
                             {"p":"weatherapi","obs":"2026-09-14 13:15+00","t":13.5},
                             {"p":"openweather","obs":"2026-09-14 13:00+00","t":11.05}]');
  s := app.current_summary(v_home, null, v_now, 'es');
  assert (s->>'providers')::int = 2 and s->>'temp' = '15°' and (s->>'observed_at')::timestamptz = '2026-09-14 13:15+00',
    format('the warm-up half an hour earlier is not a disagreement: %s', s);

  -- Morelia: two agree, one is off.
  perform pg_temp.readings('[{"p":"open-meteo","obs":"2026-09-14 13:30+00","t":14.5},
                             {"p":"openweather","obs":"2026-09-14 13:28+00","t":14.8},
                             {"p":"weatherapi","obs":"2026-09-14 13:15+00","t":11.4}]');
  s := app.current_summary(v_home, null, v_now, 'es');
  assert (s->>'providers')::int = 3 and s->>'temp' = '15°' and (s->>'temp_c')::int = 15,
    format('one outlier does not move the median off the two that agree: %s', s);

  -- No two agree: a range.
  perform pg_temp.readings('[{"p":"open-meteo","obs":"2026-09-14 13:30+00","t":10},
                             {"p":"openweather","obs":"2026-09-14 13:28+00","t":14},
                             {"p":"weatherapi","obs":"2026-09-14 13:20+00","t":18}]');
  s := app.current_summary(v_home, null, v_now, 'es');
  assert s->>'temp' = '10–18°', format('three that all disagree show the range: %s', s);

  -- Two that disagree: still a range, as before.
  perform pg_temp.readings('[{"p":"open-meteo","obs":"2026-09-14 13:30+00","t":21},
                             {"p":"weatherapi","obs":"2026-09-14 13:25+00","t":25}]');
  s := app.current_summary(v_home, null, v_now, 'es');
  assert s->>'temp' = '21–25°', format('%s', s);

  -- Only one reading of this moment is not "now", even with an older one still fresh.
  perform pg_temp.readings('[{"p":"open-meteo","obs":"2026-09-14 13:30+00","t":21},
                             {"p":"weatherapi","obs":"2026-09-14 12:40+00","t":20}]');
  assert app.current_summary(v_home, null, v_now, 'es') is null, 'one reading of the same moment is not enough';

  raise notice 'PASS current conditions aligned: same moment, two that agree give the median';
end $$;

rollback;
