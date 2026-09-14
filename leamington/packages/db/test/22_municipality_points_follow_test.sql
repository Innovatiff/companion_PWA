-- Moving a municipality's point moves the clients' copies (and so their alert
-- matching point) and removes forecasts made for the old point (0038).
-- Uses the client of test 13.
\set ON_ERROR_STOP on
begin;

do $$
declare
  v_c   uuid := '99990000-0000-4000-8000-0000000000b1';
  v_m   bigint;
  v_lat double precision;
  v_lng double precision;
begin
  select m.id, m.lat, m.lng into v_m, v_lat, v_lng
    from municipalities m join clients c on c.country = m.country
   where c.id = v_c order by m.id limit 1;
  assert v_m is not null, 'test 13 client and a municipality in its country';
  update clients set municipality_id = v_m, municipality_lat = v_lat, municipality_lng = v_lng where id = v_c;
  insert into forecasts (municipality_id, provider, target_date, temp_min_c, temp_max_c)
  values (v_m, 'open-meteo', current_date, 18, 27);

  update municipalities set population = population where id = v_m;
  assert exists (select 1 from forecasts where municipality_id = v_m), 'an update that does not move the point keeps forecasts';

  update municipalities set lat = lat where id = v_m;
  assert exists (select 1 from forecasts where municipality_id = v_m), 'setting the same point is not a move';

  update municipalities set lat = lat + 0.1, lng = lng - 0.05 where id = v_m;
  assert (select municipality_lat from clients where id = v_c) = v_lat + 0.1
     and (select municipality_lng from clients where id = v_c) = v_lng - 0.05, 'the client copy follows';
  assert extensions.ST_Distance((select municipality_geog from clients where id = v_c),
                                (select geog from municipalities where id = v_m)) < 1,
    'so alert matching uses the new point';
  assert not exists (select 1 from forecasts where municipality_id = v_m), 'forecasts for the old point are gone';
end $$;

rollback;
\echo 'PASS 22 municipality points follow'
