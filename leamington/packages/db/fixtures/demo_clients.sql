-- Sales demo accounts: one per country, for affiliates to show Hoy to buyers.
--
-- Real towns, real teams, real forecasts and rates (whatever the feeds hold);
-- only the people are demo. Everything is flagged is_test, on the client and on
-- its affiliate, so none of it counts as a sale, revenue, payout or renewal, and
-- the portals label it "Prueba".
--
--   VENTAMX2  México    Morelia, Michoacán (watching Uruapan, Zamora), Club America
--   VENTAGT2  Guatemala Huehuetenango (watching Quetzaltenango), Comunicaciones
--   VENTAHN2  Honduras  San Pedro Sula, Cortés (watching La Ceiba), CD Motagua
--   VENTAJM2  Jamaica   Montego Bay, St. James (watching Kingston), Montego Bay United
--
-- Not a seed. Apply deliberately: psql "$DATABASE_URL" -f packages/db/fixtures/demo_clients.sql
-- Safe to re-run.
\set ON_ERROR_STOP on

insert into affiliates (id, name, business_name, commission_rate, active, is_test)
values ('7e57a000-0000-4000-8000-00000000de30', 'Demo Hoy', 'Cuentas de demostración', 0.40, true, true)
on conflict (id) do update set is_test = true, active = true;

with d(id, code, full_name, country, lang, region, town, team, segment, departure, next_trip, kids) as (
  values
    ('7e57c000-0000-4000-8000-00000000de31'::uuid, 'VENTAMX2', 'María Hernández', 'MX', 'es', 'Michoacán', 'Morelia', 'Club America', 'seasonal', date '2026-11-28', null::date, true),
    ('7e57c000-0000-4000-8000-00000000de32'::uuid, 'VENTAGT2', 'José Ramírez', 'GT', 'es', 'Huehuetenango', 'Huehuetenango', 'Comunicaciones', 'seasonal', date '2026-11-21', null::date, true),
    ('7e57c000-0000-4000-8000-00000000de33'::uuid, 'VENTAHN2', 'Carlos Mejía', 'HN', 'es', 'Cortés', 'San Pedro Sula', 'CD Motagua', 'settled', null::date, date '2026-12-18', false),
    ('7e57c000-0000-4000-8000-00000000de34'::uuid, 'VENTAJM2', 'Andre Campbell', 'JM', 'en', 'St. James', 'Montego Bay', 'Montego Bay United', 'seasonal', date '2026-11-30', null::date, false)
)
insert into clients (id, affiliate_id, code, full_name, country, language,
                     municipality_id, admin_region, municipality, municipality_lat, municipality_lng,
                     team_id, segment, departure_date, next_trip_date, has_kids, timezone, is_test,
                     setup_state, setup_completed_at, corridor_confirmed_at)
select d.id, '7e57a000-0000-4000-8000-00000000de30', d.code, d.full_name, d.country::country_code, d.lang::ui_language,
       m.id, m.admin_region, m.name, m.lat, m.lng,
       (select t.id from teams t join leagues l on l.id = t.league_id where l.country = d.country::country_code and t.name = d.team limit 1),
       d.segment::client_segment, d.departure, d.next_trip, d.kids, 'America/Toronto', true,
       '{"municipality": "done", "watch": "done", "segment": "done", "kids": "done", "corridor": "done"}'::jsonb, now(), now()
  from d
  join municipalities m on m.country = d.country::country_code and m.admin_region = d.region and m.name = d.town
on conflict (id) do update
  set team_id = excluded.team_id, municipality_id = excluded.municipality_id, admin_region = excluded.admin_region,
      municipality = excluded.municipality, municipality_lat = excluded.municipality_lat, municipality_lng = excluded.municipality_lng,
      segment = excluded.segment, departure_date = excluded.departure_date, next_trip_date = excluded.next_trip_date,
      has_kids = excluded.has_kids, is_test = true, active = true, setup_state = excluded.setup_state;

-- Towns they also watch.
insert into client_watch_locations (client_id, municipality_id)
select w.client_id, m.id
  from (values
    ('7e57c000-0000-4000-8000-00000000de31'::uuid, 'MX', 'Michoacán', 'Uruapan'),
    ('7e57c000-0000-4000-8000-00000000de31'::uuid, 'MX', 'Michoacán', 'Zamora'),
    ('7e57c000-0000-4000-8000-00000000de32'::uuid, 'GT', 'Quetzaltenango', 'Quetzaltenango'),
    ('7e57c000-0000-4000-8000-00000000de33'::uuid, 'HN', 'Atlántida', 'La Ceiba'),
    ('7e57c000-0000-4000-8000-00000000de34'::uuid, 'JM', 'Kingston', 'Kingston')
  ) w(client_id, country, region, town)
  join municipalities m on m.country = w.country::country_code and m.admin_region = w.region and m.name = w.town
on conflict do nothing;

-- A paid (test) period, so they use Hoy like paying clients.
insert into subscriptions (client_id, period_start, period_end, amount, affiliate_payout, paid_at, kind, affiliate_id, commission_rate)
select id, date '2026-09-13', date '2027-03-13', 20.00, 8.00, now(), 'sale', affiliate_id, 0.40
  from clients where affiliate_id = '7e57a000-0000-4000-8000-00000000de30'
on conflict (client_id, period_start) where voided_at is null do nothing;

do $$
declare n int;
begin
  select count(*) into n from clients where affiliate_id = '7e57a000-0000-4000-8000-00000000de30' and municipality_id is not null;
  if n <> 4 then
    raise exception 'expected 4 demo clients with a town, found %: a municipality is missing', n;
  end if;
end $$;

select code, country, municipality, (select name from teams where id = team_id) as team,
       (select count(*) from client_watch_locations w where w.client_id = c.id) as watching
  from clients c where affiliate_id = '7e57a000-0000-4000-8000-00000000de30' order by code;
