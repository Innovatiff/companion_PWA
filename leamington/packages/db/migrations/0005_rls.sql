-- 0005_rls.sql — Row Level Security.
--
-- Affiliates read only rows where affiliate_id = their id. Owner role reads all.
--
-- Client (PWA) access is NOT modelled here. The code is the account, so clients
-- have no Supabase auth identity; the PWA reads through a server route that
-- resolves the code and queries with the service role. Service role bypasses
-- RLS by design -- which is exactly why that route must scope every query by
-- the resolved client_id and must never accept a client_id from the browser.

-- ---------------------------------------------------------------------------
-- Auth predicates
-- ---------------------------------------------------------------------------

create or replace function app.current_affiliate_id()
returns uuid language sql stable security definer set search_path = public, app as $$
  select id from affiliates where auth_user_id = auth.uid();
$$;

create or replace function app.is_owner()
returns boolean language sql stable security definer set search_path = public, app as $$
  select exists (select 1 from owners where auth_user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- Core tables
-- ---------------------------------------------------------------------------

alter table affiliates            enable row level security;
alter table owners                enable row level security;
alter table clients               enable row level security;
alter table subscriptions         enable row level security;
alter table client_watch_locations enable row level security;
alter table client_kids           enable row level security;
alter table client_preferences    enable row level security;
alter table notifications         enable row level security;

-- affiliates: an affiliate sees only their own row; owner sees all.
create policy affiliates_self_read on affiliates
  for select using (auth_user_id = auth.uid() or app.is_owner());

create policy affiliates_owner_write on affiliates
  for all using (app.is_owner()) with check (app.is_owner());

-- owners: only owners can see the owner list.
create policy owners_read on owners
  for select using (app.is_owner());

-- clients: the core tenancy boundary.
create policy clients_affiliate_read on clients
  for select using (affiliate_id = app.current_affiliate_id() or app.is_owner());

create policy clients_affiliate_insert on clients
  for insert with check (affiliate_id = app.current_affiliate_id() or app.is_owner());

create policy clients_affiliate_update on clients
  for update using (affiliate_id = app.current_affiliate_id() or app.is_owner())
           with check (affiliate_id = app.current_affiliate_id() or app.is_owner());

-- subscriptions: reachable only through a client the affiliate owns.
create policy subscriptions_affiliate_read on subscriptions
  for select using (
    app.is_owner() or exists (
      select 1 from clients c
      where c.id = subscriptions.client_id
        and c.affiliate_id = app.current_affiliate_id()
    )
  );

create policy subscriptions_owner_write on subscriptions
  for all using (app.is_owner()) with check (app.is_owner());

-- Client-owned child tables inherit the same boundary.
create policy watch_locations_affiliate on client_watch_locations
  for select using (
    app.is_owner() or exists (
      select 1 from clients c
      where c.id = client_watch_locations.client_id
        and c.affiliate_id = app.current_affiliate_id()
    )
  );

create policy client_kids_affiliate on client_kids
  for select using (
    app.is_owner() or exists (
      select 1 from clients c
      where c.id = client_kids.client_id
        and c.affiliate_id = app.current_affiliate_id()
    )
  );

create policy client_prefs_affiliate on client_preferences
  for select using (
    app.is_owner() or exists (
      select 1 from clients c
      where c.id = client_preferences.client_id
        and c.affiliate_id = app.current_affiliate_id()
    )
  );

-- Alert delivery log: owner-only. Affiliates have no reason to read message
-- bodies sent to a client's phone.
create policy notifications_owner_read on notifications
  for select using (app.is_owner());

-- ---------------------------------------------------------------------------
-- Feed tables: no PII, readable by any authenticated portal user.
-- RLS is enabled explicitly so "public read" is a decision on the record
-- rather than a table someone forgot to protect.
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'municipalities','leagues','teams','fixtures','fx_rates','forecasts',
    'alert_sources','weather_alerts','holidays','school_calendar','consulates',
    'lottery_games','lottery_results'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I on %I for select using (auth.role() in (''authenticated'',''service_role''))',
      t || '_read', t);
  end loop;
end $$;

-- Feed writes are ingest-only (service role, which bypasses RLS). No write
-- policies are granted to authenticated users on feed tables.

-- source_runs / feed health: owner-only.
alter table source_runs enable row level security;
create policy source_runs_owner_read on source_runs
  for select using (app.is_owner());
