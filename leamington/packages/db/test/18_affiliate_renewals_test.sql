-- Renewals collected in person by any affiliate: look up by code, the original
-- affiliate always earns, the collector is recorded separately, early renewals
-- extend and lapsed ones restart today, double taps record once, and the admin
-- views see collection vs earning and lapse rate.
\set ON_ERROR_STOP on

do $$
declare r jsonb;
begin
  r := app.portal_create_owner('renew.owner');
  perform app.portal_complete_setup(r->>'setup_token', 'owner-password-1');
  perform set_config('request.jwt.claim.sub', r->>'auth_user_id', false);
  r := app.create_affiliate('Ana Renueva', 'Tienda Ana', null, 0.40, 'ana.renueva');
  perform app.portal_complete_setup(r->>'setup_token', 'ana-password-1');
  r := app.create_affiliate('Beto Cobra', 'Finca Beto', null, 0.40, 'beto.cobra');
  perform app.portal_complete_setup(r->>'setup_token', 'beto-password-1');
  r := app.create_affiliate('Cata Cerrada', null, null, 0.40, 'cata.cerrada');
  perform app.portal_complete_setup(r->>'setup_token', 'cata-password-1');
  perform set_config('request.jwt.claim.sub', '', false);
end $$;

create or replace function pg_temp.aff(p_login text) returns uuid language sql as
  $$ select affiliate_id from portal_logins where login = p_login $$;
create or replace function pg_temp.auth(p_login text) returns uuid language sql as
  $$ select auth_user_id from portal_logins where login = p_login $$;
create or replace function pg_temp.act_as(p_login text) returns void language sql as
  $$ select set_config('request.jwt.claim.sub', coalesce(pg_temp.auth(p_login)::text, ''), false) $$;
create or replace function pg_temp.client() returns uuid language sql as
  $$ select id from clients where code = 'RENEWA23' $$;

do $$
begin
  perform pg_temp.act_as('ana.renueva');
  perform app.register_client(pg_temp.aff('ana.renueva'), 'RENEWA23', 'Cliente Renovable', 'JM', 'St. James', null, pg_temp.auth('ana.renueva'));
  perform set_config('request.jwt.claim.sub', '', false);
  assert (select collected_by_affiliate_id from subscriptions where client_id = pg_temp.client()) = pg_temp.aff('ana.renueva'),
    'a registration is collected by the registering affiliate';
end $$;

-- --------------------------------------------------------------------------
-- Another affiliate looks up the code and renews early
-- --------------------------------------------------------------------------
do $$
declare r jsonb; s jsonb; v_end date; v_key uuid := 'aaaaaaaa-0000-4000-8000-000000000001'; sub subscriptions%rowtype;
begin
  perform pg_temp.act_as('beto.cobra');
  r := app.renewal_lookup(' renewa23 ');
  assert r->>'status' = 'found' and (r->>'client_id')::uuid = pg_temp.client(), format('%s', r);
  assert app.renewal_lookup('RENEWA24')->>'status' = 'not_found';

  s := app.renewal_status(pg_temp.client());
  assert s->>'full_name' = 'Cliente Renovable' and s->>'status' = 'active' and s->>'country' = 'JM', format('%s', s);
  assert s->'original_affiliate'->>'name' = 'Tienda Ana' and not (s->'original_affiliate'->>'is_you')::boolean, format('%s', s);
  v_end := (s->>'period_end')::date;
  assert (s->>'next_period_start')::date = v_end, 'an early renewal will extend from the current end';

  r := app.affiliate_record_renewal(pg_temp.client(), v_key, pg_temp.auth('beto.cobra'));
  assert r->>'status' = 'renewed', format('%s', r);
  select * into sub from subscriptions where request_key = v_key;
  assert sub.kind = 'renewal' and sub.period_start = v_end and sub.period_end = (v_end + interval '6 months')::date, format('%s', row_to_json(sub));
  assert sub.affiliate_id = pg_temp.aff('ana.renueva'), 'the original affiliate earns';
  assert sub.collected_by_affiliate_id = pg_temp.aff('beto.cobra'), 'the collector is recorded';
  assert sub.affiliate_payout = 8.00 and sub.amount = 20.00 and sub.paid_at is not null and not sub.reactivation;

  -- The same form again: nothing new.
  r := app.affiliate_record_renewal(pg_temp.client(), v_key, pg_temp.auth('beto.cobra'));
  assert r->>'status' = 'duplicate', format('%s', r);
  assert (select count(*) from subscriptions where client_id = pg_temp.client()) = 2, 'a double tap records one renewal';

  -- A different form within 10 minutes needs confirmation.
  r := app.affiliate_record_renewal(pg_temp.client(), 'aaaaaaaa-0000-4000-8000-000000000002', pg_temp.auth('beto.cobra'));
  assert r->>'status' = 'recent_renewal', format('%s', r);
  assert (select count(*) from subscriptions where client_id = pg_temp.client()) = 2;
  r := app.affiliate_record_renewal(pg_temp.client(), 'aaaaaaaa-0000-4000-8000-000000000002', pg_temp.auth('beto.cobra'), true);
  assert r->>'status' = 'renewed';
  assert (select max(period_start) from subscriptions where client_id = pg_temp.client()) = (v_end + interval '6 months')::date,
    'renewing an already-renewed account extends again';

  r := app.renewal_receipt(v_key);
  assert r->>'full_name' = 'Cliente Renovable' and (r->>'collected_by_you')::boolean
     and r->'earning_affiliate'->>'name' = 'Tienda Ana' and not (r->'earning_affiliate'->>'is_you')::boolean, format('%s', r);
  perform set_config('request.jwt.claim.sub', '', false);
  raise notice 'PASS renewals: any affiliate renews by code; the original affiliate earns; double taps record once';
end $$;

-- --------------------------------------------------------------------------
-- Visibility: the collector does not gain the client; the earner sees it all
-- --------------------------------------------------------------------------
do $$
begin
  perform pg_temp.act_as('cata.cerrada');
  assert app.renewal_receipt('aaaaaaaa-0000-4000-8000-000000000001') is null, 'an uninvolved affiliate sees no receipt';
  assert (select count(*) from app.my_renewal_collections()) = 0;
  perform pg_temp.act_as('beto.cobra');
  assert (select count(*) from app.my_renewal_collections() where earning_affiliate = 'Tienda Ana' and not earner_is_you and amount = 20.00) = 2,
    'the collector sees the cash they took for another affiliate';
end $$;

select pg_temp.act_as('beto.cobra');
set role authenticated;
do $$
begin
  assert (select count(*) from clients where code = 'RENEWA23') = 0, 'collecting a renewal does not show the client in the collector''s list';
end $$;
reset role;

select pg_temp.act_as('ana.renueva');
set role authenticated;
do $$
declare e record;
begin
  select * into e from affiliate_earnings;
  assert e.sales = 1 and e.renewals = 2 and e.sales_earned = 8.00 and e.renewals_earned = 16.00
     and e.renewals_by_others = 2 and e.renewals_by_others_earned = 16.00 and e.earned = 24.00, format('%s', row_to_json(e));
  assert (select count(*) from renewal_log where collected_by_other) = 2, 'the earner sees renewals others collected on their clients';
  raise notice 'PASS renewals: the earner sees registrations and renewals apart, including renewals others collected';
end $$;
reset role;

-- --------------------------------------------------------------------------
-- Lapsed: restarts on the payment day, reactivates at once
-- --------------------------------------------------------------------------
do $$
declare r jsonb; sub subscriptions%rowtype;
begin
  -- 900 days pass: the periods and the payments that bought them move back together.
  update subscriptions set period_start = period_start - 900, period_end = period_end - 900, paid_at = paid_at - interval '900 days'
   where client_id = pg_temp.client();
  assert (select status from client_status where client_id = pg_temp.client()) = 'lapsed';
  assert not app.client_has_paid_access(pg_temp.client());
  r := app.client_access(pg_temp.client());
  assert not (r->>'paid')::boolean and r->>'status' = 'lapsed' and r->>'code' = 'RENEWA23' and r->>'affiliate_name' = 'Tienda Ana', format('%s', r);

  perform pg_temp.act_as('cata.cerrada');
  assert (app.renewal_status(pg_temp.client())->>'next_period_start')::date = app.business_today();
  r := app.affiliate_record_renewal(pg_temp.client(), 'aaaaaaaa-0000-4000-8000-000000000003', pg_temp.auth('cata.cerrada'));
  assert r->>'status' = 'renewed', format('%s', r);
  select * into sub from subscriptions where request_key = 'aaaaaaaa-0000-4000-8000-000000000003';
  assert sub.period_start = app.business_today() and sub.reactivation and sub.lapsed_days > 0, format('%s', row_to_json(sub));
  assert app.client_has_paid_access(pg_temp.client()) and (app.client_access(pg_temp.client())->>'paid')::boolean,
    'the account is active again immediately';

  -- The original affiliate's shop closes: a renewal still earns them the commission.
  perform set_config('request.jwt.claim.sub', pg_temp.auth('renew.owner')::text, false);
  perform app.update_affiliate(pg_temp.aff('ana.renueva'), false, 0.40);
  perform pg_temp.act_as('beto.cobra');
  r := app.affiliate_record_renewal(pg_temp.client(), 'aaaaaaaa-0000-4000-8000-000000000004', pg_temp.auth('beto.cobra'), true);
  assert r->>'status' = 'renewed';
  assert (select affiliate_id from subscriptions where request_key = 'aaaaaaaa-0000-4000-8000-000000000004') = pg_temp.aff('ana.renueva');

  -- An inactive affiliate cannot collect.
  perform pg_temp.act_as('ana.renueva');
  begin
    perform app.renewal_lookup('RENEWA23');
    assert false, 'an inactive affiliate must be refused';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claim.sub', pg_temp.auth('renew.owner')::text, false);
  perform app.update_affiliate(pg_temp.aff('ana.renueva'), true, 0.40);
  perform set_config('request.jwt.claim.sub', '', false);
  raise notice 'PASS renewals: a lapsed client restarts today and is active at once; a closed shop still earns';
end $$;

-- --------------------------------------------------------------------------
-- Owner renewals follow the same dates; deactivated clients are refused
-- --------------------------------------------------------------------------
do $$
declare r jsonb;
begin
  update subscriptions set period_start = period_start - 2000, period_end = period_end - 2000 where client_id = pg_temp.client();
  perform set_config('request.jwt.claim.sub', pg_temp.auth('renew.owner')::text, false);
  r := app.record_renewal(pg_temp.client(), pg_temp.auth('renew.owner'));
  assert (r->>'period_start')::date = app.business_today() and (r->>'reactivation')::boolean, format('%s', r);
  assert (select collected_by_affiliate_id from subscriptions where client_id = pg_temp.client() order by paid_at desc limit 1) is null,
    'an owner renewal is collected by the owner';

  update clients set active = false where id = pg_temp.client();
  perform pg_temp.act_as('beto.cobra');
  r := app.affiliate_record_renewal(pg_temp.client(), 'aaaaaaaa-0000-4000-8000-000000000005', pg_temp.auth('beto.cobra'), true);
  assert r->>'status' = 'client_inactive', format('%s', r);
  update clients set active = true where id = pg_temp.client();
  perform set_config('request.jwt.claim.sub', '', false);
  raise notice 'PASS renewals: owner renewals use the same dates; a deactivated client is not renewed';
end $$;

-- --------------------------------------------------------------------------
-- Admin views, throttling, and engagement
-- --------------------------------------------------------------------------
do $$
declare c record; l record; i int; r jsonb;
begin
  perform set_config('request.jwt.claim.sub', pg_temp.auth('renew.owner')::text, false);
  select * into c from renewal_collection_by_affiliate where affiliate_id = pg_temp.aff('beto.cobra');
  assert c.renewals_collected = 3 and c.collected_for_others = 3 and c.cash_collected = 60.00 and c.renewals_earned = 0, format('%s', row_to_json(c));
  select * into c from renewal_collection_by_affiliate where affiliate_id = pg_temp.aff('ana.renueva');
  assert c.renewals_earned = 5 and c.earned_collected_by_others = 5 and c.renewal_commission = 40.00
     and c.cash_collected = 20.00, format('%s', row_to_json(c));
  assert (select count(*) from renewal_log where client_id = pg_temp.client() and reactivation) = 2;

  select * into l from affiliate_lapse_rate where affiliate_id = pg_temp.aff('ana.renueva');
  assert l.came_due = 1 and l.lapsed = 0 and l.renewed = 1 and l.reactivated = 1 and l.lapse_rate = 0, format('%s', row_to_json(l));

  perform pg_temp.act_as('cata.cerrada');
  for i in 1..20 loop perform app.renewal_lookup('QQQQQQ' || i::text); end loop;
  r := app.renewal_lookup('RENEWA23');
  assert r->>'status' = 'throttled', format('20 misses stop further lookups: %s', r);
  perform set_config('request.jwt.claim.sub', '', false);
  raise notice 'PASS renewals: admin sees collection vs earning and lapse rate; code guessing is throttled';
end $$;
