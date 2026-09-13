-- Behavioural tests for the non-negotiable rules in CLAUDE.md.
-- These assert behaviour, not just that the DDL parses.
\set ON_ERROR_STOP on

-- --------------------------------------------------------------------------
-- Fixtures
-- --------------------------------------------------------------------------
insert into affiliates (id, name, auth_user_id) values
  ('11111111-1111-1111-1111-111111111111','Affiliate A','aaaaaaaa-0000-0000-0000-000000000001'),
  ('22222222-2222-2222-2222-222222222222','Affiliate B','bbbbbbbb-0000-0000-0000-000000000002');

-- Two municipalities in Cortés, Honduras: one in the storm's path, one in a
-- dry corner ~100km away.
insert into municipalities (country, admin_region, name, lat, lng, timezone) values
  ('HN','Cortés','San Pedro Sula', 15.5042, -88.0250,'America/Tegucigalpa'),
  ('HN','Cortés','Dry Corner',     15.5042, -87.0000,'America/Tegucigalpa');

insert into clients (id, affiliate_id, code, full_name, country, municipality_id,
                     admin_region, municipality, municipality_lat, municipality_lng)
select 'aaaa1111-0000-0000-0000-00000000000a','11111111-1111-1111-1111-111111111111',
       'ACDE2346','Cliente Uno','HN', m.id,'Cortés','San Pedro Sula',15.5042,-88.0250
from municipalities m where m.country='HN' and m.name='San Pedro Sula';

insert into clients (id, affiliate_id, code, full_name, country, municipality_id,
                     admin_region, municipality, municipality_lat, municipality_lng)
select 'bbbb2222-0000-0000-0000-00000000000b','22222222-2222-2222-2222-222222222222',
       'EFGH2346','Cliente Dos','HN', m.id,'Cortés','Dry Corner',15.5042,-87.0000
from municipalities m where m.country='HN' and m.name='Dry Corner';

-- Distinct agency name so this fixture never collides with seeds/alert_sources.sql.
insert into alert_sources (country, agency, kind, feed_url, active)
values ('HN','TEST-COPECO','scrape','https://example.invalid/feed', true);

-- An alert polygon covering only the San Pedro Sula corner of Cortés.
insert into weather_alerts (source_id, country, cap_identifier, event, severity_raw,
                            level, issued_at, area_geog, source_url)
select s.id,'HN','HN-TEST-1','Aviso por lluvias','Severe','red', now(),
   extensions.ST_Multi(extensions.ST_GeomFromText(
     'POLYGON((-88.3 15.3, -87.8 15.3, -87.8 15.7, -88.3 15.7, -88.3 15.3))',4326))::extensions.geography,
   'https://example.invalid/alert/1'
from alert_sources s where s.agency='TEST-COPECO';

-- Resolve the fixture ids by natural key for the assertions below.
create temp view t_alert as
  select id from weather_alerts where cap_identifier='HN-TEST-1';
create temp view t_muni_sps as
  select id from municipalities where country='HN' and name='San Pedro Sula';

-- --------------------------------------------------------------------------
-- RULE: match by polygon, not by department name.
-- Both clients are in "Cortés". Only the covered one must match.
-- --------------------------------------------------------------------------
do $$
declare n int; who uuid;
begin
  select count(*) into n from app.clients_for_alert((select id from t_alert));
  assert n = 1, format('expected exactly 1 client covered, got %s', n);

  select client_id into who from app.clients_for_alert((select id from t_alert));
  assert who = 'aaaa1111-0000-0000-0000-00000000000a',
    'wrong client matched: the dry corner of Cortés must NOT be alerted';
  raise notice 'PASS polygon matching: 1/2 Cortés clients alerted (dry corner excluded)';
end $$;

-- --------------------------------------------------------------------------
-- RULE: additional watched towns are also matched.
-- --------------------------------------------------------------------------
insert into client_watch_locations (client_id, municipality_id)
select 'bbbb2222-0000-0000-0000-00000000000b', id from t_muni_sps;

do $$
declare n int;
begin
  select count(*) into n from app.clients_for_alert((select id from t_alert));
  assert n = 2, format('watch location should add a match, got %s', n);
  raise notice 'PASS watch locations: client watching San Pedro Sula now matches';
end $$;

-- --------------------------------------------------------------------------
-- RULE: push only red/orange. Yellow is in-app only.
-- --------------------------------------------------------------------------
insert into weather_alerts (source_id, country, cap_identifier, event, level,
                            issued_at, source_url)
select s.id, 'HN', v.ident, v.ev, v.lvl::alert_level, now(), v.url
from alert_sources s,
     (values ('HN-TEST-2','Aviso amarillo','yellow','https://example.invalid/a/2'),
             ('HN-TEST-3','Aviso naranja','orange','https://example.invalid/a/3'))
       as v(ident, ev, lvl, url)
where s.agency='TEST-COPECO';

do $$
declare r record;
begin
  for r in select level, push_eligible from weather_alerts order by level::text loop
    case r.level
      when 'red'    then assert r.push_eligible, 'red must push';
      when 'orange' then assert r.push_eligible, 'orange must push';
      when 'yellow' then assert not r.push_eligible, 'yellow must NOT push';
      else null;
    end case;
  end loop;
  raise notice 'PASS push gating: red/orange push, yellow in-app only';
end $$;

-- --------------------------------------------------------------------------
-- RULE: ONE notification per client per local day.
-- --------------------------------------------------------------------------
-- ENGAGEMENT channel only. Alerts are uncapped and live in their own queue
-- (see 03_notification_queues_test.sql).
insert into notifications (client_id, local_date, channel, trigger, title, body, scheduled_for)
values ('aaaa1111-0000-0000-0000-00000000000a','2026-09-13','engagement','fx_30d_high',
        'Tasa','texto', now());

do $$
begin
  begin
    insert into notifications (client_id, local_date, channel, trigger, title, body, scheduled_for)
    values ('aaaa1111-0000-0000-0000-00000000000a','2026-09-13','engagement','lottery',
            'Loto','texto', now());
    raise exception 'FAIL: a second engagement notification on the same local day was allowed';
  exception when unique_violation then
    raise notice 'PASS engagement one-per-day: second same-day engagement notification rejected by the schema';
  end;
end $$;

-- Priority ordering: weather alert beats match day beats lottery.
do $$
begin
  assert app.trigger_priority('weather_alert') < app.trigger_priority('match_day'),
    'weather alert must outrank match day';
  assert app.trigger_priority('match_day') < app.trigger_priority('lottery'),
    'match day must outrank lottery';
  raise notice 'PASS notification priority: alert > match day > lottery';
end $$;

-- --------------------------------------------------------------------------
-- RULE: FX 30-day high / direction.
-- --------------------------------------------------------------------------
insert into fx_rates (rate_date, quote, rate)
select d::date, 'HNL', 18.00 + (row_number() over (order by d)) * 0.05
from generate_series('2026-08-20'::date,'2026-09-13'::date,'1 day') d;

do $$
declare v record;
begin
  select * into v from fx_latest_with_context
   where quote='HNL' order by rate_date desc limit 1;
  assert v.direction = 'up', format('expected rising direction, got %s', v.direction);
  assert v.is_30d_high, 'latest rate should be a 30-day high in this series';
  raise notice 'PASS fx context: direction=% high_30d=% is_30d_high=%',
    v.direction, v.high_30d, v.is_30d_high;
end $$;

-- --------------------------------------------------------------------------
-- RULE: forecast median + spread across three providers.
-- --------------------------------------------------------------------------
insert into forecasts (municipality_id, provider, target_date, temp_max_c, precip_prob)
select m.id, v.p::forecast_provider, '2026-09-14', v.t, v.pp
from t_muni_sps m,
     (values ('open-meteo',28.0,80),('openweather',31.0,20),('weatherapi',29.0,60))
       as v(p,t,pp);

do $$
declare c record;
begin
  select * into c from forecast_consensus
   where municipality_id=(select id from t_muni_sps) and target_date='2026-09-14';
  assert c.provider_count = 3, 'expected 3 providers';
  assert c.temp_max_median = 29.0, format('median should be 29.0, got %s', c.temp_max_median);
  assert c.temp_max_spread = 3.0, format('spread should be 3.0, got %s', c.temp_max_spread);
  raise notice 'PASS forecast consensus: median=%, spread=% (UI shows a range when spread is material)',
    c.temp_max_median, c.temp_max_spread;
end $$;

-- --------------------------------------------------------------------------
-- RULE: staleness detection for alert sources.
-- --------------------------------------------------------------------------
insert into source_runs (feed, started_at, finished_at, status) values
  ('alerts:HN', now() - interval '20 hours', now() - interval '20 hours' + interval '2 seconds', 'ok');

do $$
declare s record;
begin
  select * into s from alert_source_staleness where country='HN';
  assert s.is_stale, 'a source silent for 20h must be flagged stale (threshold 12h)';
  raise notice 'PASS staleness: HN alert source flagged stale after %', s.since_last_ok;
end $$;
