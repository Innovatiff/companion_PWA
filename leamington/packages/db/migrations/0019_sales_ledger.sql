-- 0019_sales_ledger.sql
-- Sales, renewals, commissions and payouts.
--
-- $20 per client per 6-month period; the affiliate earns amount x their
-- commission_rate ($8 at 0.40). A renewal keeps the client's ORIGINAL affiliate
-- permanently. Earnings accrue per paid sale or renewal; the owner records
-- payouts; amount owed = earned - paid out (docs/OPEN-DECISIONS.md 3.4, 3.5).
--
-- Every view here is security_invoker, so row-level security applies to whoever
-- reads it: an affiliate sees only their own clients and money.

create or replace function app.price_per_period() returns numeric language sql immutable as $$ select 20.00::numeric $$;
create or replace function app.period_length() returns interval language sql immutable as $$ select interval '6 months' $$;
-- Business dates are Leamington dates.
create or replace function app.business_today() returns date language sql stable as $$
  select (now() at time zone 'America/Toronto')::date
$$;

alter table subscriptions
  add column kind            text not null default 'sale' check (kind in ('sale', 'renewal')),
  add column affiliate_id    uuid references affiliates(id),
  add column commission_rate numeric(5,4),
  add column recorded_by     uuid,
  add column voided_at       timestamptz,
  add column void_reason     text;

create index subscriptions_client_period_idx on subscriptions (client_id, period_end desc);
create index subscriptions_affiliate_paid_idx on subscriptions (affiliate_id, paid_at desc);

-- Attribution is permanent: the affiliate who registered a client earns on every renewal.
create or replace function app.clients_keep_affiliate()
returns trigger
language plpgsql
as $$
begin
  if old.affiliate_id is distinct from new.affiliate_id then
    raise exception 'client % belongs to affiliate % permanently; attribution cannot change', old.id, old.affiliate_id
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger clients_keep_affiliate
  before update of affiliate_id on clients
  for each row execute function app.clients_keep_affiliate();

create table affiliate_payouts (
  id            bigint generated always as identity primary key,
  affiliate_id  uuid not null references affiliates(id),
  amount        numeric(10,2) not null check (amount > 0),
  paid_at       timestamptz not null default now(),
  method        text,
  note          text,
  recorded_by   uuid,
  voided_at     timestamptz,
  void_reason   text,
  created_at    timestamptz not null default now()
);

create index affiliate_payouts_affiliate_idx on affiliate_payouts (affiliate_id, paid_at desc);

alter table affiliate_payouts enable row level security;
create policy affiliate_payouts_read on affiliate_payouts
  for select using (affiliate_id = app.current_affiliate_id() or app.is_owner());
create policy affiliate_payouts_owner_write on affiliate_payouts
  for all using (app.is_owner()) with check (app.is_owner());

-- ---------------------------------------------------------------------------
-- Views
-- ---------------------------------------------------------------------------

-- Each client's current paid period and where it stands.
--   active  period ends in more than 30 days
--   due     period ends within 30 days
--   lapsed  period has ended with no later paid period
--   none    no paid period on record
create view client_status with (security_invoker = true) as
select c.id            as client_id,
       c.affiliate_id,
       c.full_name,
       c.code,
       c.country,
       c.language,
       c.admin_region,
       c.municipality,
       c.is_test,
       c.active,
       c.created_at,
       c.last_seen_at,
       cur.period_start,
       cur.period_end,
       cur.kind        as last_kind,
       cur.paid_at     as last_paid_at,
       case
         when cur.period_end is null                            then 'none'
         when cur.period_end < app.business_today()             then 'lapsed'
         when cur.period_end <= app.business_today() + 30       then 'due'
         else 'active'
       end             as status,
       cur.period_end - app.business_today() as days_left
  from clients c
  left join lateral (
    select s.period_start, s.period_end, s.kind, s.paid_at
      from subscriptions s
     where s.client_id = c.id and s.paid_at is not null and s.voided_at is null
     order by s.period_end desc
     limit 1
  ) cur on true;

-- What each affiliate has earned, been paid, and is owed.
create view affiliate_earnings with (security_invoker = true) as
select a.id                                              as affiliate_id,
       a.name,
       a.active,
       a.is_test,
       a.is_house,
       a.commission_rate,
       coalesce(e.sales, 0)                              as sales,
       coalesce(e.renewals, 0)                           as renewals,
       coalesce(e.earned, 0)::numeric(10,2)              as earned,
       coalesce(e.earned_this_month, 0)::numeric(10,2)   as earned_this_month,
       coalesce(p.paid_out, 0)::numeric(10,2)            as paid_out,
       (coalesce(e.earned, 0) - coalesce(p.paid_out, 0))::numeric(10,2) as owed,
       e.last_paid_at
  from affiliates a
  left join lateral (
    select count(*) filter (where s.kind = 'sale')     as sales,
           count(*) filter (where s.kind = 'renewal')  as renewals,
           sum(s.affiliate_payout)                     as earned,
           sum(s.affiliate_payout) filter (
             where date_trunc('month', s.paid_at at time zone 'America/Toronto')
                 = date_trunc('month', now() at time zone 'America/Toronto')) as earned_this_month,
           max(s.paid_at)                              as last_paid_at
      from subscriptions s
     where s.affiliate_id = a.id and s.paid_at is not null and s.voided_at is null
  ) e on true
  left join lateral (
    select sum(p.amount) as paid_out
      from affiliate_payouts p
     where p.affiliate_id = a.id and p.voided_at is null
  ) p on true;

-- Who is selling and who isn't. The owner's first number.
create view sales_per_affiliate with (security_invoker = true) as
select a.id                                   as affiliate_id,
       a.name,
       a.active,
       a.is_test,
       a.is_house,
       a.commission_rate,
       a.created_at,
       count(s.id) filter (where s.kind = 'sale' and s.paid_at >= now() - interval '7 days')     as sales_7d,
       count(s.id) filter (where s.kind = 'sale' and s.paid_at >= now() - interval '30 days')    as sales_30d,
       count(s.id) filter (where s.kind = 'sale')                                               as sales_all,
       count(s.id) filter (where s.kind = 'renewal' and s.paid_at >= now() - interval '30 days') as renewals_30d,
       count(s.id) filter (where s.kind = 'renewal')                                            as renewals_all,
       max(s.paid_at) filter (where s.kind = 'sale')                                            as last_sale_at,
       (select count(*) from client_status cs where cs.affiliate_id = a.id and cs.status in ('active', 'due')) as active_clients,
       (select count(*) from client_status cs where cs.affiliate_id = a.id and cs.status = 'due')              as due_clients,
       (select count(*) from client_status cs where cs.affiliate_id = a.id and cs.status = 'lapsed')           as lapsed_clients
  from affiliates a
  left join subscriptions s on s.affiliate_id = a.id and s.paid_at is not null and s.voided_at is null
 group by a.id;

-- Money by month, real clients only.
create view revenue_by_month with (security_invoker = true) as
select date_trunc('month', s.paid_at at time zone 'America/Toronto')::date as month,
       count(*) filter (where s.kind = 'sale')      as sales,
       count(*) filter (where s.kind = 'renewal')   as renewals,
       sum(s.amount)::numeric(10,2)                  as gross,
       sum(s.affiliate_payout)::numeric(10,2)        as affiliate_commissions,
       (sum(s.amount) - sum(s.affiliate_payout))::numeric(10,2) as net
  from subscriptions s
  join clients c on c.id = s.client_id
 where s.paid_at is not null and s.voided_at is null and not c.is_test
 group by 1;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select on client_status, affiliate_earnings, sales_per_affiliate, revenue_by_month, affiliate_payouts to authenticated;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Functions. security definer with an explicit authorisation check, called
-- inside a portal request (auth.uid() is the signed-in person).
-- ---------------------------------------------------------------------------

create or replace function app.require_owner()
returns void
language plpgsql
stable
security definer
set search_path = public, app
as $$
begin
  if not app.is_owner() then
    raise exception 'only the owner can do this' using errcode = 'insufficient_privilege';
  end if;
end $$;

-- The owner's own "direct" affiliate, for clients the owner registers: no commission.
create or replace function app.house_affiliate()
returns uuid
language plpgsql
volatile
security definer
set search_path = public, app
as $$
declare
  v_id uuid;
begin
  perform app.require_owner();
  select id into v_id from affiliates where is_house;
  if v_id is null then
    insert into affiliates (name, business_name, commission_rate, is_house)
    values ('Directo', 'Registro directo del propietario', 0, true)
    returning id into v_id;
  end if;
  return v_id;
end $$;

-- Register a client: the affiliate has taken the $20. Creates the client and the
-- first paid 6-month period. The code is generated by the app (packages/shared)
-- and checked against the alphabet by the table; a duplicate raises
-- unique_violation and the app retries with a new code.
create or replace function app.register_client(
  p_affiliate_id  uuid,
  p_code          text,
  p_full_name     text,
  p_country       country_code,
  p_admin_region  text,
  p_team_id       bigint,
  p_recorded_by   uuid
) returns jsonb
language plpgsql
volatile
security definer
set search_path = public, app
as $$
declare
  v_aff     affiliates%rowtype;
  v_client  uuid;
  v_start   date := app.business_today();
  v_end     date := (app.business_today() + app.period_length())::date;
begin
  if not (app.is_owner() or p_affiliate_id = app.current_affiliate_id()) then
    raise exception 'not allowed to register clients for affiliate %', p_affiliate_id
      using errcode = 'insufficient_privilege';
  end if;
  select * into v_aff from affiliates where id = p_affiliate_id and active;
  if not found then
    raise exception 'affiliate % is not active', p_affiliate_id using errcode = 'check_violation';
  end if;
  if btrim(coalesce(p_full_name, '')) = '' then
    raise exception 'full name is required' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from municipalities m where m.country = p_country and m.admin_region = p_admin_region) then
    raise exception 'unknown department or parish "%" for %', p_admin_region, p_country using errcode = 'check_violation';
  end if;
  if p_team_id is not null and not exists (
       select 1 from teams t join leagues l on l.id = t.league_id where t.id = p_team_id and l.country = p_country) then
    raise exception 'team % does not play in %', p_team_id, p_country using errcode = 'check_violation';
  end if;

  insert into clients (affiliate_id, code, full_name, country, language, admin_region, team_id, is_test)
  values (p_affiliate_id, p_code, btrim(p_full_name), p_country,
          case when p_country = 'JM' then 'en'::ui_language else 'es'::ui_language end,
          p_admin_region, p_team_id, v_aff.is_test)
  returning id into v_client;

  insert into subscriptions (client_id, period_start, period_end, amount, affiliate_payout, paid_at,
                             kind, affiliate_id, commission_rate, recorded_by)
  values (v_client, v_start, v_end, app.price_per_period(),
          round(app.price_per_period() * v_aff.commission_rate, 2), now(),
          'sale', p_affiliate_id, v_aff.commission_rate, p_recorded_by);

  return jsonb_build_object('client_id', v_client, 'code', p_code, 'period_start', v_start, 'period_end', v_end);
end $$;

-- A renewal, marked paid by the owner. It starts where the last period ends if
-- paid before or within 30 days after that end; otherwise on the day it is paid.
-- It always credits the client's original affiliate, at that affiliate's rate today.
create or replace function app.record_renewal(p_client_id uuid, p_recorded_by uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, app
as $$
declare
  v_client  clients%rowtype;
  v_aff     affiliates%rowtype;
  v_last    date;
  v_start   date;
  v_end     date;
  v_today   date := app.business_today();
begin
  perform app.require_owner();
  select * into v_client from clients where id = p_client_id;
  if not found then
    raise exception 'no client %', p_client_id using errcode = 'check_violation';
  end if;
  select * into v_aff from affiliates where id = v_client.affiliate_id;

  select max(period_end) into v_last
    from subscriptions where client_id = p_client_id and paid_at is not null and voided_at is null;
  v_start := case when v_last is not null and v_last >= v_today - 30 then v_last else v_today end;
  v_end := (v_start + app.period_length())::date;

  insert into subscriptions (client_id, period_start, period_end, amount, affiliate_payout, paid_at,
                             kind, affiliate_id, commission_rate, recorded_by)
  values (p_client_id, v_start, v_end, app.price_per_period(),
          round(app.price_per_period() * v_aff.commission_rate, 2), now(),
          'renewal', v_client.affiliate_id, v_aff.commission_rate, p_recorded_by);

  return jsonb_build_object('client_id', p_client_id, 'period_start', v_start, 'period_end', v_end,
                            'affiliate_id', v_client.affiliate_id);
end $$;

create or replace function app.void_subscription(p_subscription_id uuid, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = public, app
as $$
begin
  perform app.require_owner();
  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'a reason is required to void a payment' using errcode = 'check_violation';
  end if;
  update subscriptions set voided_at = now(), void_reason = btrim(p_reason)
   where id = p_subscription_id and voided_at is null;
  if not found then
    raise exception 'no payment % to void', p_subscription_id using errcode = 'check_violation';
  end if;
end $$;

create or replace function app.record_payout(p_affiliate_id uuid, p_amount numeric, p_method text, p_note text, p_recorded_by uuid)
returns bigint
language plpgsql
volatile
security definer
set search_path = public, app
as $$
declare
  v_id bigint;
begin
  perform app.require_owner();
  insert into affiliate_payouts (affiliate_id, amount, method, note, recorded_by)
  values (p_affiliate_id, round(p_amount, 2), nullif(btrim(p_method), ''), nullif(btrim(p_note), ''), p_recorded_by)
  returning id into v_id;
  return v_id;
end $$;

-- Create an affiliate with a portal login. Returns the one-time setup token.
create or replace function app.create_affiliate(
  p_name            text,
  p_business_name   text,
  p_contact         text,
  p_commission_rate numeric,
  p_login           text,
  p_language        ui_language default 'es'
) returns jsonb
language plpgsql
volatile
security definer
set search_path = public, app
as $$
declare
  v_id    uuid;
  v_login jsonb;
begin
  perform app.require_owner();
  if btrim(coalesce(p_name, '')) = '' then
    raise exception 'name is required' using errcode = 'check_violation';
  end if;
  insert into affiliates (name, business_name, contact, commission_rate)
  values (btrim(p_name), nullif(btrim(p_business_name), ''), nullif(btrim(p_contact), ''), p_commission_rate)
  returning id into v_id;
  v_login := app.portal_create_affiliate_login(v_id, p_login, p_language);
  return jsonb_build_object('affiliate_id', v_id, 'setup_token', v_login->>'setup_token');
end $$;

-- Activate or deactivate an affiliate, and set their commission. Deactivating
-- ends their open sessions; their past earnings and client attribution stay.
create or replace function app.update_affiliate(p_affiliate_id uuid, p_active boolean, p_commission_rate numeric)
returns void
language plpgsql
volatile
security definer
set search_path = public, app
as $$
begin
  perform app.require_owner();
  update affiliates set active = p_active, commission_rate = p_commission_rate where id = p_affiliate_id;
  if not found then
    raise exception 'no affiliate %', p_affiliate_id using errcode = 'check_violation';
  end if;
  if not p_active then
    update portal_logins set sessions_valid_after = now() where affiliate_id = p_affiliate_id;
  end if;
end $$;

-- A fresh setup link for an affiliate who lost their password.
create or replace function app.reset_affiliate_login(p_affiliate_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = public, app
as $$
declare
  v_auth uuid;
begin
  perform app.require_owner();
  select auth_user_id into v_auth from portal_logins where affiliate_id = p_affiliate_id;
  if v_auth is null then
    raise exception 'affiliate % has no portal login', p_affiliate_id using errcode = 'check_violation';
  end if;
  return app.portal_issue_setup(v_auth);
end $$;
