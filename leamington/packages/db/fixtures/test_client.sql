-- The test client.
--
-- A real coastal Jamaican town (Montego Bay, St. James: 18.4762, -77.8939) with
-- a departure date, flagged as test, so the alert -> client matching path and
-- the forecast feed have a real person to work for. Flagged is_test on both the
-- client and its affiliate: never counted as a sale, in revenue, in payouts or
-- in the renewal pipeline, and labelled "Prueba" in the portals.
--
-- Not a seed: packages/db/test/run-tests.sh loads every seed before the tests,
-- and the RLS tests count clients. Apply it deliberately:
--   psql "$DATABASE_URL" -f packages/db/fixtures/test_client.sql
\set ON_ERROR_STOP on

insert into affiliates (id, name, business_name, commission_rate, active, is_test)
values ('7e57a000-0000-4000-8000-000000000001', 'Prueba', 'Test affiliate (not a real seller)', 0.40, true, true)
on conflict (id) do update set is_test = true;

insert into clients (id, affiliate_id, code, full_name, country, language,
                     municipality_id, admin_region, municipality, municipality_lat, municipality_lng,
                     segment, departure_date, timezone, is_test, setup_state, setup_completed_at)
select '7e57c000-0000-4000-8000-000000000001', '7e57a000-0000-4000-8000-000000000001',
       'TEZTJM24', 'Test Client (Montego Bay)', 'JM', 'en',
       m.id, m.admin_region, m.name, m.lat, m.lng,
       'seasonal', date '2026-11-20', 'America/Toronto', true,
       '{"municipality": "done", "watch": "skipped", "segment": "done", "kids": "skipped", "corridor": "skipped"}'::jsonb,
       now()
  from municipalities m
 where m.country = 'JM' and m.admin_region = 'St. James' and m.name = 'Montego Bay'
on conflict (id) do update
  set municipality_id = excluded.municipality_id, admin_region = excluded.admin_region,
      municipality = excluded.municipality, municipality_lat = excluded.municipality_lat,
      municipality_lng = excluded.municipality_lng, departure_date = excluded.departure_date,
      is_test = true, active = true;

do $$
begin
  if not exists (select 1 from clients where id = '7e57c000-0000-4000-8000-000000000001' and municipality_id is not null) then
    raise exception 'test client not created: Montego Bay (St. James) is missing from municipalities';
  end if;
end $$;

-- A paid (test) period, so the test client uses Hoy like any paying client
-- rather than seeing the expiry screen. is_test keeps it out of every number.
insert into subscriptions (client_id, period_start, period_end, amount, affiliate_payout, paid_at,
                           kind, affiliate_id, commission_rate)
values ('7e57c000-0000-4000-8000-000000000001', date '2026-09-13', date '2027-03-13', 20.00, 8.00, now(),
        'sale', '7e57a000-0000-4000-8000-000000000001', 0.40)
on conflict (client_id, period_start) where voided_at is null do nothing;
