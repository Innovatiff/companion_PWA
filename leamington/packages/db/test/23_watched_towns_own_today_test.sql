-- A watched town's card stays on home while it is still today in that town,
-- even after midnight on the client's Leamington clock (0039). Uses the client
-- and "Section Watch" forecasts of test 13.
\set ON_ERROR_STOP on
begin;

-- A JSON list, or an empty one for a JSON null (home_more leaves an empty section null).
create function pg_temp.arr(j jsonb) returns jsonb language sql immutable as $$
  select case when jsonb_typeof(j) = 'array' then j else '[]'::jsonb end $$;

do $$
declare x jsonb; v_client uuid := '99990000-0000-4000-8000-0000000000b1';
begin
  update clients set timezone = 'America/Toronto' where id = v_client;
  -- Fresh enough to show at 04:30 UTC on the 14th.
  update forecasts set fetched_at = '2026-09-14 00:00:00+00'
   where municipality_id = (select id from municipalities where name = 'Section Watch');

  -- 00:30 on the 14th in Toronto, 23:30 on the 13th in Jamaica.
  x := app.home_more(v_client, '2026-09-14 04:30:00+00');
  assert exists (select 1 from jsonb_array_elements(pg_temp.arr(x->'watch_weather')) w
                  where w->>'name' = 'Section Watch' and w->'today'->>'date' = '2026-09-13'),
    format('still today in the town, so its card stays: %s; towns: %s', x->'watch_weather',
           app.weather_page(v_client, '2026-09-14 04:30:00+00')->'towns');

  -- 01:30 in Jamaica on the 14th: the 13th is over there too, and nothing for the 14th is stored.
  x := app.home_more(v_client, '2026-09-14 06:30:00+00');
  assert not exists (select 1 from jsonb_array_elements(pg_temp.arr(x->'watch_weather')) w where w->>'name' = 'Section Watch'),
    format('yesterday''s forecast is not shown as today: %s', x->'watch_weather');
end $$;

rollback;
\echo 'PASS 23 watched towns use their own today'
