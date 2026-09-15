-- LOCAL ONLY. Two affiliate accounts for running apps/affiliate against a
-- throwaway database built by packages/db/test/run-migrations.sh plus the seeds.
-- Never run this against Supabase.
--
--   psql -At -F ' ' -f apps/affiliate/scripts/local-accounts.sql <local database>
--
-- Prints "<login> <setup token>" for `ana` (Spanish) and `beto` (English). Run it
-- again for fresh setup tokens: that clears their passwords, as a reset does.
\set ON_ERROR_STOP on
\o /dev/null

-- Supabase grants table access to `authenticated` by default and row-level
-- security does the filtering. A bare local Postgres has no such default, so
-- mirror it here, keeping portal_logins closed as 0018 does.
grant usage on schema public, app, extensions, auth to authenticated;
grant select on all tables in schema public to authenticated;
revoke all on table portal_logins from authenticated;
-- The preview counter (0051) is the one table an affiliate inserts into directly.
grant insert on affiliate_previews to authenticated;

-- The owner, created the way 10_sales_ledger_test.sql does it.
select app.portal_create_owner('owner.local')
 where not exists (select 1 from portal_logins where login = 'owner.local');
select set_config('request.jwt.claim.sub', (select auth_user_id::text from portal_logins where login = 'owner.local'), false);

-- Two Liga MX teams, so the team field has something to offer for Mexico.
insert into teams (league_id, country, name, source, source_team_id)
select l.id, 'MX', t.name, 'local-affiliate', t.sid
  from leagues l, (values ('Club América', 'la-1'), ('Guadalajara', 'la-2')) t(name, sid)
 where l.name = 'Liga MX'
on conflict do nothing;
-- And two Honduran clubs, so the preview's team choice has something for Honduras.
insert into teams (league_id, country, name, source, source_team_id)
select l.id, 'HN', t.name, 'local-affiliate', t.sid
  from leagues l, (values ('CD Olimpia', 'la-3'), ('CD Motagua', 'la-4')) t(name, sid)
 where l.country = 'HN'
on conflict do nothing;

select app.create_affiliate(a.name, a.business, null, 0.40, a.login, a.lang::ui_language)
  from (values ('Ana', 'Tienda', 'ana', 'es'), ('Beto', null, 'beto', 'en')) a(name, business, login, lang)
 where not exists (select 1 from portal_logins p where p.login = a.login);

-- One payout to Ana, so the payout history has a row.
select app.record_payout((select affiliate_id from portal_logins where login = 'ana'), 8.00, 'efectivo', 'pago local de prueba',
                         (select auth_user_id from portal_logins where login = 'owner.local'))
 where not exists (select 1 from affiliate_payouts where affiliate_id = (select affiliate_id from portal_logins where login = 'ana'));

\o
select p.login, app.reset_affiliate_login(p.affiliate_id)
  from portal_logins p where p.login in ('ana', 'beto') order by p.login;

select set_config('request.jwt.claim.sub', '', false) \g /dev/null
