-- RLS tenancy tests: an affiliate must see ONLY their own clients.
-- Superusers bypass RLS, so these run as a non-superuser `authenticated` role.
-- NOTE: settings here are session-scoped (`set role`, set_config(...,false)).
-- SET LOCAL / set_config(...,true) are transaction-scoped, and psql autocommits
-- each statement, so those silently revert and the test would run as superuser
-- with RLS bypassed -- i.e. it would pass while testing nothing.
\set ON_ERROR_STOP on

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end $$;

grant usage on schema public, app, extensions to authenticated;
grant select on all tables in schema public to authenticated;
grant execute on all functions in schema app to authenticated;

-- --------------------------------------------------------------------------
-- Affiliate A sees only their own client.
-- --------------------------------------------------------------------------
set role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-0000-0000-0000-000000000001', false);
select set_config('request.jwt.claim.role','authenticated', false);

do $$
declare n int; nm text;
begin
  select count(*) into n from clients;
  assert n = 1, format('affiliate A should see exactly 1 client, saw %s', n);
  select full_name into nm from clients;
  assert nm = 'Cliente Uno', format('affiliate A saw the wrong client: %s', nm);
  raise notice 'PASS rls: affiliate A sees only their own client (%)', nm;
end $$;

-- --------------------------------------------------------------------------
-- Affiliate B sees only theirs. Cross-tenant read returns zero rows.
-- --------------------------------------------------------------------------
select set_config('request.jwt.claim.sub','bbbbbbbb-0000-0000-0000-000000000002', false);

do $$
declare n int; nm text;
begin
  select count(*) into n from clients;
  assert n = 1, format('affiliate B should see exactly 1 client, saw %s', n);
  select full_name into nm from clients;
  assert nm = 'Cliente Dos', format('affiliate B saw the wrong client: %s', nm);
  raise notice 'PASS rls: affiliate B sees only their own client (%)', nm;
end $$;

-- --------------------------------------------------------------------------
-- Subscriptions inherit the boundary.
-- --------------------------------------------------------------------------
reset role;
insert into subscriptions (client_id, period_start, period_end)
values ('aaaa1111-0000-0000-0000-00000000000a','2026-09-01','2027-03-01');

set role authenticated;
select set_config('request.jwt.claim.sub','bbbbbbbb-0000-0000-0000-000000000002', false);

do $$
declare n int;
begin
  select count(*) into n from subscriptions;
  assert n = 0, format('affiliate B must not see affiliate A subscriptions, saw %s', n);
  raise notice 'PASS rls: subscriptions do not leak across affiliates';
end $$;

-- --------------------------------------------------------------------------
-- Notification bodies are owner-only.
-- --------------------------------------------------------------------------
do $$
declare n int;
begin
  select count(*) into n from notifications;
  assert n = 0, format('affiliates must not read notification bodies, saw %s', n);
  raise notice 'PASS rls: alert delivery log is owner-only';
end $$;

-- --------------------------------------------------------------------------
-- Owner sees everything.
-- --------------------------------------------------------------------------
reset role;
insert into owners (auth_user_id) values ('cccccccc-0000-0000-0000-000000000003');

set role authenticated;
select set_config('request.jwt.claim.sub','cccccccc-0000-0000-0000-000000000003', false);

do $$
declare n int; s int;
begin
  select count(*) into n from clients;
  select count(*) into s from subscriptions;
  assert n = 2, format('owner should see all 2 clients, saw %s', n);
  assert s = 1, format('owner should see the subscription, saw %s', s);
  raise notice 'PASS rls: owner reads all (% clients, % subscriptions)', n, s;
end $$;

-- --------------------------------------------------------------------------
-- Feed tables are readable (no PII) but not writable by portal users.
-- --------------------------------------------------------------------------
do $$
declare n int;
begin
  select count(*) into n from fx_rates;
  assert n > 0, 'feed tables must be readable by authenticated portal users';
  begin
    insert into fx_rates (rate_date, quote, rate) values ('2030-01-01','HNL',1.0);
    raise exception 'FAIL: authenticated user was able to write a feed table';
  exception when insufficient_privilege then
    raise notice 'PASS rls: feed tables are read-only to portal users (ingest writes via service role)';
  end;
end $$;

reset role;
