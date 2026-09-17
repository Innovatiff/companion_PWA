-- Weekly cash collection (0054): the Sunday week, what each business owes for a
-- week, recording and undoing a collection, and the commission it marks as kept.
\set ON_ERROR_STOP on

do $$
declare r jsonb;
begin
  r := app.portal_create_owner('week.owner');
  perform app.portal_complete_setup(r->>'setup_token', 'owner-password-1');
  perform set_config('request.jwt.claim.sub', r->>'auth_user_id', false);
  r := app.create_affiliate('Ana Semana', 'Tienda Ana', null, 0.40, 'ana.week');
  perform app.portal_complete_setup(r->>'setup_token', 'ana-password-1');
  r := app.create_affiliate('Beto Semana', null, null, 0.40, 'beto.week');
  perform app.portal_complete_setup(r->>'setup_token', 'beto-password-1');
  perform set_config('request.jwt.claim.sub', '', false);
end $$;

create or replace function pg_temp.waff(p_login text) returns uuid language sql as
  $$ select affiliate_id from portal_logins where login = p_login $$;
create or replace function pg_temp.wauth(p_login text) returns uuid language sql as
  $$ select auth_user_id from portal_logins where login = p_login $$;
create or replace function pg_temp.wact(p_login text) returns void language sql as
  $$ select set_config('request.jwt.claim.sub', coalesce(pg_temp.wauth(p_login)::text, ''), false) $$;
create or replace function pg_temp.wk(p_affiliate uuid, p_week date) returns affiliate_week_collections language sql as
  $$ select * from affiliate_week_collections where affiliate_id = p_affiliate and week_start = p_week $$;

-- --------------------------------------------------------------------------
-- The week runs Sunday to Saturday
-- --------------------------------------------------------------------------
do $$
begin
  assert app.business_week_start(date '2026-09-17') = date '2026-09-13', 'a Thursday belongs to its Sunday';
  assert app.business_week_start(date '2026-09-13') = date '2026-09-13', 'a Sunday is its own week start';
  assert app.business_week_start(date '2026-09-19') = date '2026-09-13', 'a Saturday closes the week';
  assert app.business_week_start(date '2026-09-20') = date '2026-09-20', 'the next Sunday opens the next week';
  assert app.business_week() = app.business_week_start(app.business_today()), 'this week is today''s week';
  raise notice 'PASS week: Sunday to Saturday, on Leamington time';
end $$;

-- --------------------------------------------------------------------------
-- What a business owes for a week is the cash it took, less its commission
-- --------------------------------------------------------------------------
do $$
declare r jsonb; w affiliate_week_collections; v_week date := app.business_week();
begin
  perform pg_temp.wact('ana.week');
  r := app.register_client(pg_temp.waff('ana.week'), 'WKVENTA2', 'Cliente Semana Uno', 'JM', 'St. James', null, pg_temp.wauth('ana.week'));
  perform app.register_client(pg_temp.waff('ana.week'), 'WKVENTA3', 'Cliente Semana Dos', 'JM', 'St. James', null, pg_temp.wauth('ana.week'));

  w := pg_temp.wk(pg_temp.waff('ana.week'), v_week);
  assert w.sales = 2 and w.cash_collected = 40.00 and w.affiliate_keeps = 16.00 and w.owed_to_owner = 24.00,
    format('two sales: %s', row_to_json(w));
  assert w.settled = 0 and w.outstanding = 24.00 and w.payments = 0, format('nothing collected yet: %s', row_to_json(w));
  assert w.is_current, 'this week is the current week';

  -- A renewal the owner collects is the owner's cash, not the business's week.
  perform set_config('request.jwt.claim.sub', pg_temp.wauth('week.owner')::text, false);
  perform app.record_renewal((r->>'client_id')::uuid, pg_temp.wauth('week.owner'));
  w := pg_temp.wk(pg_temp.waff('ana.week'), v_week);
  assert w.cash_collected = 40.00, format('an owner renewal is not the business''s cash: %s', row_to_json(w));

  -- A renewal the business collects is its cash, and its commission.
  perform pg_temp.wact('beto.week');
  perform app.affiliate_record_renewal((r->>'client_id')::uuid, gen_random_uuid(), pg_temp.wauth('beto.week'), true);
  w := pg_temp.wk(pg_temp.waff('beto.week'), v_week);
  assert w.renewals = 1 and w.cash_collected = 20.00 and w.affiliate_keeps = 8.00 and w.owed_to_owner = 12.00,
    format('a collected renewal: %s', row_to_json(w));
  raise notice 'PASS week: cash is counted for the business that took it, less its commission';
end $$;

-- --------------------------------------------------------------------------
-- Recording a collection: what is left, and the commission marked as kept
-- --------------------------------------------------------------------------
do $$
declare w affiliate_week_collections; v_week date := app.business_week(); v_id bigint; ok boolean; v_owed numeric;
begin
  perform set_config('request.jwt.claim.sub', pg_temp.wauth('week.owner')::text, false);
  v_owed := (select owed from affiliate_earnings where affiliate_id = pg_temp.waff('ana.week'));
  assert v_owed = 16.00, format('before collecting, the books owe the business its commission: %s', v_owed);

  v_id := app.record_week_collection(pg_temp.waff('ana.week'), v_week, 10.00, 'efectivo', 'parte', pg_temp.wauth('week.owner'));
  w := pg_temp.wk(pg_temp.waff('ana.week'), v_week);
  assert w.settled = 10.00 and w.outstanding = 14.00 and w.payments = 1, format('a part payment: %s', row_to_json(w));

  perform app.record_week_collection(pg_temp.waff('ana.week'), v_week, 14.00, 'efectivo', null, pg_temp.wauth('week.owner'));
  w := pg_temp.wk(pg_temp.waff('ana.week'), v_week);
  assert w.settled = 24.00 and w.outstanding = 0.00 and w.payments = 2, format('the week is settled: %s', row_to_json(w));

  -- The commission stayed in the business's hands: recorded once, however many payments.
  assert (select count(*) from affiliate_payouts
           where affiliate_id = pg_temp.waff('ana.week') and kind = 'kept' and voided_at is null) = 1,
    'the commission is marked kept exactly once for the week';
  assert (select owed from affiliate_earnings where affiliate_id = pg_temp.waff('ana.week')) = 0.00,
    'the owner no longer owes a commission the business already kept';

  -- A week that has not started, and a day that is not a Sunday, are refused.
  begin
    perform app.record_week_collection(pg_temp.waff('ana.week'), v_week + 7, 12.00, 'efectivo', null, pg_temp.wauth('week.owner'));
    ok := false;
  exception when check_violation then ok := true;
  end;
  assert ok, 'a week that has not started is refused';
  begin
    perform app.record_week_collection(pg_temp.waff('ana.week'), v_week + 3, 12.00, 'efectivo', null, pg_temp.wauth('week.owner'));
    ok := false;
  exception when check_violation then ok := true;
  end;
  assert ok, 'a week that does not start on a Sunday is refused';
  raise notice 'PASS week: collections add up, and the kept commission is recorded once';
end $$;

-- --------------------------------------------------------------------------
-- Undoing a collection, and who may record one
-- --------------------------------------------------------------------------
do $$
declare w affiliate_week_collections; v_week date := app.business_week(); ok boolean;
begin
  perform set_config('request.jwt.claim.sub', pg_temp.wauth('week.owner')::text, false);
  perform app.void_week_collection((select max(id) from affiliate_collections
                                     where affiliate_id = pg_temp.waff('ana.week') and voided_at is null), 'me equivoqué');
  w := pg_temp.wk(pg_temp.waff('ana.week'), v_week);
  assert w.settled = 10.00 and w.outstanding = 14.00, format('the voided payment is gone: %s', row_to_json(w));
  assert (select owed from affiliate_earnings where affiliate_id = pg_temp.waff('ana.week')) = 0.00,
    'a week with a payment left keeps its commission marked kept';

  perform app.void_week_collection((select max(id) from affiliate_collections
                                     where affiliate_id = pg_temp.waff('ana.week') and voided_at is null), 'me equivoqué');
  w := pg_temp.wk(pg_temp.waff('ana.week'), v_week);
  assert w.settled = 0.00 and w.outstanding = 24.00, format('nothing is collected for the week: %s', row_to_json(w));
  assert (select owed from affiliate_earnings where affiliate_id = pg_temp.waff('ana.week')) = 16.00,
    'with the week uncollected, the commission is owed again';

  -- An affiliate cannot record or undo a collection, and sees only its own weeks.
  perform pg_temp.wact('ana.week');
  begin
    perform app.record_week_collection(pg_temp.waff('ana.week'), v_week, 24.00, 'efectivo', null, pg_temp.wauth('ana.week'));
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'an affiliate cannot record its own collection';
  assert (select count(*) from affiliate_week_collections where affiliate_id <> pg_temp.waff('ana.week')) = 0,
    'an affiliate sees only its own weeks';
  assert (select count(*) from affiliate_collections where affiliate_id <> pg_temp.waff('ana.week')) = 0,
    'an affiliate sees only its own collections';
  perform set_config('request.jwt.claim.sub', '', false);
  raise notice 'PASS week: only the owner records or undoes a collection, and each business sees only its own';
end $$;
