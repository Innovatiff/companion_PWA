-- Sales, renewals, commissions and payouts: registration rules, permanent
-- attribution, row-level security on the money views, renewal dates, and test
-- data kept out of the numbers.
\set ON_ERROR_STOP on

-- Owner and two affiliates, created the way admin does it.
do $$
declare r jsonb;
begin
  r := app.portal_create_owner('ledger.owner');
  perform app.portal_complete_setup(r->>'setup_token', 'owner-password-1');
  perform set_config('request.jwt.claim.sub', r->>'auth_user_id', false);

  r := app.create_affiliate('Ana Ledger', 'Tienda Ana', null, 0.40, 'ana.ledger');
  perform app.portal_complete_setup(r->>'setup_token', 'ana-password-1');
  r := app.create_affiliate('Beto Ledger', null, null, 0.40, 'beto.ledger');
  perform app.portal_complete_setup(r->>'setup_token', 'beto-password-1');
  perform set_config('request.jwt.claim.sub', '', false);
end $$;

create or replace function pg_temp.aff(p_login text) returns uuid language sql as
  $$ select affiliate_id from portal_logins where login = p_login $$;
create or replace function pg_temp.auth(p_login text) returns uuid language sql as
  $$ select auth_user_id from portal_logins where login = p_login $$;
create or replace function pg_temp.act_as(p_login text) returns void language sql as
  $$ select set_config('request.jwt.claim.sub', coalesce(pg_temp.auth(p_login)::text, ''), false) $$;

-- --------------------------------------------------------------------------
-- An affiliate registers a client: a paid sale, $8 of $20
-- --------------------------------------------------------------------------
do $$
declare r jsonb; s subscriptions%rowtype;
begin
  perform pg_temp.act_as('ana.ledger');
  r := app.register_client(pg_temp.aff('ana.ledger'), 'ACDEFG23', 'Cliente Ana Uno', 'JM', 'St. James', null, pg_temp.auth('ana.ledger'));
  select * into s from subscriptions where client_id = (r->>'client_id')::uuid;
  assert s.kind = 'sale' and s.amount = 20.00 and s.affiliate_payout = 8.00 and s.paid_at is not null, format('%s', row_to_json(s));
  assert s.affiliate_id = pg_temp.aff('ana.ledger') and s.commission_rate = 0.40;
  assert s.period_start = app.business_today() and s.period_end = (app.business_today() + interval '6 months')::date;
  assert (select language from clients where id = (r->>'client_id')::uuid) = 'en', 'a Jamaican client reads English';
  raise notice 'PASS ledger: registration is a paid sale, $8 of $20, six months';
end $$;

do $$
declare ok boolean;
begin
  perform pg_temp.act_as('ana.ledger');
  begin
    perform app.register_client(pg_temp.aff('beto.ledger'), 'ACDEFG24', 'Robado', 'JM', 'St. James', null, null);
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'an affiliate cannot register clients for another affiliate';

  begin
    perform app.register_client(pg_temp.aff('ana.ledger'), 'ACDEFG25', 'Sin parroquia', 'JM', 'Nowhere Parish', null, null);
    ok := false;
  exception when check_violation then ok := true;
  end;
  assert ok, 'an unknown parish is refused';

  begin
    perform app.register_client(pg_temp.aff('ana.ledger'), 'ACDEFG01', 'Codigo malo', 'JM', 'St. James', null, null);
    ok := false;
  exception when check_violation then ok := true;
  end;
  assert ok, 'a code outside the alphabet is refused by the table';

  begin
    update clients set affiliate_id = pg_temp.aff('beto.ledger') where code = 'ACDEFG23';
    ok := false;
  exception when check_violation then ok := true;
  end;
  assert ok, 'attribution cannot be moved to another affiliate';
  perform set_config('request.jwt.claim.sub', '', false);
  raise notice 'PASS ledger: registration is authorised, validated, and attribution is permanent';
end $$;

do $$
begin
  perform pg_temp.act_as('beto.ledger');
  perform app.register_client(pg_temp.aff('beto.ledger'), 'ACDEFG26', 'Cliente Beto', 'JM', 'St. Ann', null, pg_temp.auth('beto.ledger'));
  perform set_config('request.jwt.claim.sub', '', false);
end $$;

-- --------------------------------------------------------------------------
-- Row-level security on the money views: Ana sees only Ana
-- --------------------------------------------------------------------------
-- Resolve Ana's id BEFORE switching role: `authenticated` cannot read accounts.
select pg_temp.act_as('ana.ledger');
set role authenticated;
do $$
declare n int; e affiliate_earnings%rowtype;
begin
  select count(*) into n from client_status;
  assert n = 1, format('Ana should see 1 client, saw %s', n);
  select count(*) into n from affiliate_earnings;
  assert n = 1, format('Ana should see only her own earnings row, saw %s', n);
  select * into e from affiliate_earnings;
  assert e.name = 'Ana Ledger' and e.earned = 8.00 and e.owed = 8.00 and e.sales = 1, format('%s', row_to_json(e));
  select count(*) into n from sales_per_affiliate;
  assert n = 1, format('Ana sees only her own sales row, saw %s', n);
  select count(*) into n from subscriptions;
  assert n = 1, format('Ana sees only her client''s payments, saw %s', n);
  raise notice 'PASS ledger: an affiliate sees only their own clients, earnings and payments';
end $$;
reset role;

-- --------------------------------------------------------------------------
-- Renewals: owner only, original affiliate, start date rules
-- --------------------------------------------------------------------------
do $$
declare r jsonb; ok boolean; v_client uuid := (select id from clients where code = 'ACDEFG23'); v_end date;
begin
  perform pg_temp.act_as('ana.ledger');
  begin
    perform app.record_renewal(v_client, null);
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'only the owner records renewals';

  perform pg_temp.act_as('ledger.owner');
  v_end := (select max(period_end) from subscriptions where client_id = v_client);
  r := app.record_renewal(v_client, pg_temp.auth('ledger.owner'));
  assert (r->>'period_start')::date = v_end, 'an early renewal starts where the current period ends';
  -- Whoever collects a renewal earns it (0031); the owner is not a business.
  assert (r->>'affiliate_id')::uuid = app.house_affiliate(), 'an owner renewal credits no business';

  -- Lapsed long ago: the renewal starts today.
  -- Shift every period 500 days back: each keeps its own start (one period per
  -- start date, 0002), and the latest now ended long ago.
  update subscriptions set period_start = period_start - 500, period_end = period_end - 500
   where client_id = v_client;
  r := app.record_renewal(v_client, pg_temp.auth('ledger.owner'));
  assert (r->>'period_start')::date = app.business_today(), 'a renewal after a long lapse starts on the day it is paid';

  -- A new commission applies to later payments only. Ana collects this renewal herself.
  perform app.update_affiliate(pg_temp.aff('ana.ledger'), true, 0.50);
  perform pg_temp.act_as('ana.ledger');
  r := app.affiliate_record_renewal(v_client, 'bbbbbbbb-0000-4000-8000-000000000010', pg_temp.auth('ana.ledger'), true);
  assert r->>'status' = 'renewed', format('%s', r);
  perform pg_temp.act_as('ledger.owner');
  assert (select array_agg(affiliate_payout order by paid_at, period_start) from subscriptions where client_id = v_client)
         = array[8.00, 0.00, 0.00, 10.00]::numeric[], 'earlier payments keep the commission they were made at';
  perform app.update_affiliate(pg_temp.aff('ana.ledger'), true, 0.40);
  raise notice 'PASS ledger: owner renewals earn no business, collectors earn at their rate, and dates are right';
end $$;

-- --------------------------------------------------------------------------
-- Payouts, voids and amount owed
-- --------------------------------------------------------------------------
do $$
declare e affiliate_earnings%rowtype; ok boolean; v_last uuid;
begin
  perform pg_temp.act_as('ledger.owner');
  perform app.record_payout(pg_temp.aff('ana.ledger'), 5.00, 'efectivo', 'septiembre', pg_temp.auth('ledger.owner'));
  select * into e from affiliate_earnings where affiliate_id = pg_temp.aff('ana.ledger');
  assert e.earned = 18.00 and e.paid_out = 5.00 and e.owed = 13.00, format('%s', row_to_json(e));

  select id into v_last from subscriptions where client_id = (select id from clients where code = 'ACDEFG23')
   order by affiliate_payout desc limit 1;
  begin
    perform app.void_subscription(v_last, '  ');
    ok := false;
  exception when check_violation then ok := true;
  end;
  assert ok, 'voiding needs a reason';
  perform app.void_subscription(v_last, 'registrado dos veces');
  select * into e from affiliate_earnings where affiliate_id = pg_temp.aff('ana.ledger');
  assert e.earned = 8.00 and e.owed = 3.00, format('a voided payment earns nothing: %s', row_to_json(e));
  raise notice 'PASS ledger: payouts and voids give the right amount owed';
end $$;

-- --------------------------------------------------------------------------
-- Test data never counts; the house affiliate earns nothing
-- --------------------------------------------------------------------------
do $$
declare v_test uuid; v_house uuid; before_gross numeric; after_gross numeric;
begin
  perform pg_temp.act_as('ledger.owner');
  select coalesce(sum(gross), 0) into before_gross from revenue_by_month;
  insert into affiliates (name, commission_rate, is_test) values ('Prueba Ledger', 0.40, true) returning id into v_test;
  perform app.register_client(v_test, 'ACDEFG32', 'Cliente de prueba', 'JM', 'St. James', null, null);
  select coalesce(sum(gross), 0) into after_gross from revenue_by_month;
  assert (select is_test from clients where code = 'ACDEFG32'), 'a test affiliate''s client is a test client';
  assert after_gross = before_gross, 'test clients are not revenue';

  v_house := app.house_affiliate();
  assert app.house_affiliate() = v_house, 'there is one house affiliate';
  perform app.register_client(v_house, 'ACDEFG33', 'Cliente directo', 'JM', 'Kingston', null, pg_temp.auth('ledger.owner'));
  assert (select affiliate_payout from subscriptions s join clients c on c.id = s.client_id where c.code = 'ACDEFG33') = 0.00;
  perform set_config('request.jwt.claim.sub', '', false);
  raise notice 'PASS ledger: test clients are excluded from revenue; direct sales carry no commission';
end $$;

-- --------------------------------------------------------------------------
-- Client status: active, due, lapsed, none
-- --------------------------------------------------------------------------
do $$
declare v_beto uuid := (select id from clients where code = 'ACDEFG26');
begin
  assert (select status from client_status where client_id = v_beto) = 'active';
  update subscriptions set period_start = app.business_today() - 170, period_end = app.business_today() + 10 where client_id = v_beto;
  assert (select status from client_status where client_id = v_beto) = 'due';
  update subscriptions set period_start = app.business_today() - 200, period_end = app.business_today() - 1 where client_id = v_beto;
  assert (select status from client_status where client_id = v_beto) = 'lapsed';
  update subscriptions set voided_at = now(), void_reason = 'test' where client_id = v_beto;
  assert (select status from client_status where client_id = v_beto) = 'none';
  raise notice 'PASS ledger: client status is active, due, lapsed or none';
end $$;
