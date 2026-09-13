-- 0031_commission_follows_collector.sql
-- A renewal's commission goes to the business that collects it.
--
-- Owner's rule (2026-09-13): every client can renew at any business running the
-- affiliate portal. The business that registers a client earns the
-- registration commission. Whoever collects a renewal earns that renewal's
-- commission: a client who started at Domcub and renews elsewhere pays that
-- other business. This replaces 0029's "always the original affiliate" for
-- renewals.
--
--   * clients.affiliate_id stays the registering business, permanently: it is
--     whose client list the client is in, and who registered them.
--   * Each payment records the registering business at the time
--     (registered_by_affiliate_id), so earnings and admin views can say "your
--     own client" vs "a client from another business" without reading clients
--     the collector cannot see.
--   * A renewal the owner marks paid in admin was collected by no business: it
--     is credited to the house affiliate at no commission.
--   * Applies to renewals recorded from now on. Production had no renewals when
--     this was applied, so nothing is re-credited.

alter table subscriptions add column registered_by_affiliate_id uuid references affiliates(id);
update subscriptions s set registered_by_affiliate_id = c.affiliate_id
  from clients c where c.id = s.client_id and s.registered_by_affiliate_id is null;

create or replace function app.subscriptions_default_collector()
returns trigger
language plpgsql
as $$
begin
  if new.registered_by_affiliate_id is null then
    select c.affiliate_id into new.registered_by_affiliate_id from clients c where c.id = new.client_id;
  end if;
  if new.kind = 'sale' and new.collected_by_affiliate_id is null
     and exists (select 1 from affiliates a where a.id = new.affiliate_id and not a.is_house) then
    new.collected_by_affiliate_id := new.affiliate_id;
  end if;
  return new;
end $$;

alter table subscriptions alter column registered_by_affiliate_id set not null;
create index subscriptions_registered_by_idx on subscriptions (registered_by_affiliate_id, paid_at desc);

-- A business sees the payments of clients it registered, and the payments it
-- collected or earned on (a walk-in renewal of another business's client). It
-- still does not see that client's record.
drop policy subscriptions_affiliate_read on subscriptions;
create policy subscriptions_affiliate_read on subscriptions
  for select using (
    app.is_owner()
    or subscriptions.affiliate_id = app.current_affiliate_id()
    or subscriptions.collected_by_affiliate_id = app.current_affiliate_id()
    or exists (select 1 from clients c
                where c.id = subscriptions.client_id and c.affiliate_id = app.current_affiliate_id())
  );

-- ---------------------------------------------------------------------------
-- Recording
-- ---------------------------------------------------------------------------
create or replace function app.insert_renewal(p_client_id uuid, p_collected_by uuid, p_recorded_by uuid, p_request_key uuid)
returns subscriptions
language plpgsql
volatile
set search_path = public, app
as $$
declare
  v_client  clients%rowtype;
  v_earner_id uuid;
  v_earner  affiliates%rowtype;
  v_last    date;
  v_today   date := app.business_today();
  v_start   date;
  v_row     subscriptions%rowtype;
begin
  select * into v_client from clients where id = p_client_id for update;
  if not found then
    raise exception 'no client %', p_client_id using errcode = 'check_violation';
  end if;
  -- The collecting business earns; the owner's own collection earns nobody.
  -- The house id is resolved first: house_affiliate() may create the row, and a
  -- query calling it in its own WHERE would not see that row.
  v_earner_id := coalesce(p_collected_by, app.house_affiliate());
  select * into v_earner from affiliates where id = v_earner_id;

  select max(period_end) into v_last
    from subscriptions where client_id = p_client_id and paid_at is not null and voided_at is null;
  v_start := greatest(coalesce(v_last, v_today), v_today);

  insert into subscriptions (client_id, period_start, period_end, amount, affiliate_payout, paid_at,
                             kind, affiliate_id, commission_rate, recorded_by,
                             collected_by_affiliate_id, registered_by_affiliate_id, request_key, reactivation, lapsed_days)
  values (p_client_id, v_start, (v_start + app.period_length())::date, app.price_per_period(),
          round(app.price_per_period() * v_earner.commission_rate, 2), now(),
          'renewal', v_earner.id, v_earner.commission_rate, p_recorded_by,
          p_collected_by, v_client.affiliate_id, p_request_key,
          v_last is null or v_last < v_today,
          case when v_last < v_today then v_today - v_last end)
  returning * into v_row;
  return v_row;
end $$;

revoke execute on function app.insert_renewal(uuid, uuid, uuid, uuid) from public;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke execute on function app.insert_renewal(uuid, uuid, uuid, uuid) from %I', r);
    end if;
  end loop;
end $$;

-- Status before taking $20: now also what this business earns on it.
create or replace function app.renewal_status(p_client_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_aff    uuid := app.require_active_affiliate();
  v_today  date := app.business_today();
  v_result jsonb;
begin
  select jsonb_build_object(
           'client_id', c.id, 'full_name', c.full_name, 'code', c.code, 'country', c.country,
           'client_active', c.active, 'is_test', c.is_test,
           'status', cs.status, 'period_start', cs.period_start, 'period_end', cs.period_end, 'days_left', cs.days_left,
           'original_affiliate', jsonb_build_object(
              'name', coalesce(a.business_name, a.name), 'is_you', a.id = v_aff, 'is_house', a.is_house, 'active', a.active),
           'amount', app.price_per_period(),
           'your_commission', (select round(app.price_per_period() * me.commission_rate, 2) from affiliates me where me.id = v_aff),
           'next_period_start', greatest(coalesce(cs.period_end, v_today), v_today),
           'next_period_end', (greatest(coalesce(cs.period_end, v_today), v_today) + app.period_length())::date,
           'recent_renewal', (
              select jsonb_build_object('paid_at', s.paid_at, 'period_end', s.period_end,
                                        'collected_by_you', s.collected_by_affiliate_id = v_aff)
                from subscriptions s
               where s.client_id = c.id and s.kind = 'renewal' and s.voided_at is null
                 and s.paid_at > now() - interval '10 minutes'
               order by s.paid_at desc limit 1))
    into v_result
    from clients c
    join affiliates a on a.id = c.affiliate_id
    join client_status cs on cs.client_id = c.id
   where c.id = p_client_id;
  return v_result;
end $$;

create or replace function app.renewal_receipt(p_request_key uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_aff uuid := app.current_affiliate_id();
  v_result jsonb;
begin
  select jsonb_build_object(
           'subscription_id', s.id, 'request_key', s.request_key, 'paid_at', s.paid_at,
           'client_id', c.id, 'full_name', c.full_name, 'code', c.code, 'country', c.country,
           'period_start', s.period_start, 'period_end', s.period_end,
           'amount', s.amount, 'commission', s.affiliate_payout, 'reactivation', s.reactivation,
           'voided', s.voided_at is not null,
           'earning_affiliate', jsonb_build_object('name', coalesce(ea.business_name, ea.name), 'is_you', ea.id = v_aff),
           'registered_by', jsonb_build_object('name', coalesce(ra.business_name, ra.name), 'is_you', ra.id = v_aff, 'is_house', ra.is_house),
           'collected_by_you', s.collected_by_affiliate_id = v_aff,
           'status_now', cs.status)
    into v_result
    from subscriptions s
    join clients c on c.id = s.client_id
    join affiliates ea on ea.id = s.affiliate_id
    join affiliates ra on ra.id = s.registered_by_affiliate_id
    join client_status cs on cs.client_id = c.id
   where s.request_key = p_request_key
     and (app.is_owner() or s.collected_by_affiliate_id = v_aff or s.affiliate_id = v_aff);
  return v_result;
end $$;

-- Renewals this business collected, with the client's name even when another
-- business registered them.
drop function app.my_renewal_collections(integer);
create function app.my_renewal_collections(p_limit integer default 100)
returns table (paid_at timestamptz, request_key uuid, full_name text, period_start date, period_end date,
               amount numeric, commission numeric, registered_by text, registered_by_you boolean, reactivation boolean)
language sql
stable
security definer
set search_path = public, app
as $$
  select s.paid_at, s.request_key, c.full_name, s.period_start, s.period_end, s.amount, s.affiliate_payout,
         coalesce(ra.business_name, ra.name), ra.id = app.current_affiliate_id(), s.reactivation
    from subscriptions s
    join clients c on c.id = s.client_id
    join affiliates ra on ra.id = s.registered_by_affiliate_id
   where s.collected_by_affiliate_id = app.current_affiliate_id()
     and s.kind = 'renewal' and s.voided_at is null
   order by s.paid_at desc
   limit least(greatest(coalesce(p_limit, 100), 1), 500)
$$;

-- ---------------------------------------------------------------------------
-- Views, rebuilt around "own client" vs "another business's client"
-- ---------------------------------------------------------------------------
drop view affiliate_earnings;
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
       e.last_paid_at,
       coalesce(e.sales_earned, 0)::numeric(10,2)        as sales_earned,
       coalesce(e.renewals_earned, 0)::numeric(10,2)     as renewals_earned,
       coalesce(e.renewals_own_clients, 0)               as renewals_own_clients,
       coalesce(e.renewals_other_clients, 0)             as renewals_other_clients,
       coalesce(e.renewals_other_clients_earned, 0)::numeric(10,2) as renewals_other_clients_earned,
       coalesce(x.own_clients_renewed_elsewhere, 0)      as own_clients_renewed_elsewhere
  from affiliates a
  left join lateral (
    select count(*) filter (where s.kind = 'sale')     as sales,
           count(*) filter (where s.kind = 'renewal')  as renewals,
           sum(s.affiliate_payout)                     as earned,
           sum(s.affiliate_payout) filter (
             where date_trunc('month', s.paid_at at time zone 'America/Toronto')
                 = date_trunc('month', now() at time zone 'America/Toronto')) as earned_this_month,
           max(s.paid_at)                              as last_paid_at,
           sum(s.affiliate_payout) filter (where s.kind = 'sale')    as sales_earned,
           sum(s.affiliate_payout) filter (where s.kind = 'renewal') as renewals_earned,
           count(*) filter (where s.kind = 'renewal' and s.registered_by_affiliate_id = a.id)  as renewals_own_clients,
           count(*) filter (where s.kind = 'renewal' and s.registered_by_affiliate_id <> a.id) as renewals_other_clients,
           sum(s.affiliate_payout) filter (where s.kind = 'renewal' and s.registered_by_affiliate_id <> a.id) as renewals_other_clients_earned
      from subscriptions s
     where s.affiliate_id = a.id and s.paid_at is not null and s.voided_at is null
  ) e on true
  left join lateral (
    select count(*) as own_clients_renewed_elsewhere
      from subscriptions s
     where s.registered_by_affiliate_id = a.id and s.kind = 'renewal'
       and s.affiliate_id <> a.id and s.paid_at is not null and s.voided_at is null
  ) x on true
  left join lateral (
    select sum(p.amount) as paid_out
      from affiliate_payouts p
     where p.affiliate_id = a.id and p.voided_at is null
  ) p on true;

drop view renewal_log;
create view renewal_log with (security_invoker = true) as
select s.id                         as subscription_id,
       s.paid_at,
       s.client_id,
       c.full_name,
       c.code,
       c.is_test,
       s.period_start,
       s.period_end,
       s.amount,
       s.affiliate_payout           as commission,
       s.affiliate_id               as earning_affiliate_id,
       ea.name                      as earning_affiliate,
       s.collected_by_affiliate_id,
       ca.name                      as collecting_affiliate,
       s.collected_by_affiliate_id is null                                      as collected_by_owner,
       s.registered_by_affiliate_id,
       ra.name                      as registered_by_affiliate,
       s.collected_by_affiliate_id is not null
         and s.collected_by_affiliate_id <> s.registered_by_affiliate_id        as renewed_elsewhere,
       s.reactivation,
       s.lapsed_days,
       s.recorded_by,
       s.voided_at,
       s.void_reason
  from subscriptions s
  join clients c on c.id = s.client_id
  left join affiliates ea on ea.id = s.affiliate_id
  left join affiliates ca on ca.id = s.collected_by_affiliate_id
  left join affiliates ra on ra.id = s.registered_by_affiliate_id
 where s.kind = 'renewal' and s.paid_at is not null;

drop view renewal_collection_by_affiliate;
create view renewal_collection_by_affiliate with (security_invoker = true) as
select a.id        as affiliate_id,
       a.name,
       a.active,
       a.is_test,
       a.is_house,
       count(s.id) filter (where s.kind = 'renewal' and s.collected_by_affiliate_id = a.id)                          as renewals_collected,
       count(s.id) filter (where s.kind = 'renewal' and s.collected_by_affiliate_id = a.id
                             and s.registered_by_affiliate_id = a.id)                                                  as renewals_own_clients,
       count(s.id) filter (where s.kind = 'renewal' and s.collected_by_affiliate_id = a.id
                             and s.registered_by_affiliate_id <> a.id)                                                 as renewals_other_clients,
       count(s.id) filter (where s.kind = 'renewal' and s.registered_by_affiliate_id = a.id
                             and s.collected_by_affiliate_id is not null and s.collected_by_affiliate_id <> a.id)      as own_clients_renewed_elsewhere,
       count(s.id) filter (where s.kind = 'renewal' and s.registered_by_affiliate_id = a.id
                             and s.collected_by_affiliate_id is null)                                                  as own_clients_renewed_by_owner,
       coalesce(sum(s.amount) filter (where s.collected_by_affiliate_id = a.id), 0)::numeric(10,2)                   as cash_collected,
       coalesce(sum(s.affiliate_payout) filter (where s.kind = 'renewal' and s.affiliate_id = a.id), 0)::numeric(10,2) as renewal_commission
  from affiliates a
  left join subscriptions s
         on (s.affiliate_id = a.id or s.collected_by_affiliate_id = a.id or s.registered_by_affiliate_id = a.id)
        and s.paid_at is not null and s.voided_at is null
 group by a.id;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select on affiliate_earnings, renewal_log, renewal_collection_by_affiliate to authenticated;
  end if;
end $$;
