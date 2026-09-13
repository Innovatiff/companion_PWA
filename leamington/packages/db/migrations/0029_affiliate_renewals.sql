-- 0029_affiliate_renewals.sql
-- Renewals collected in person by any affiliate.
--
--   * ANY active affiliate can take a client's $20 renewal, looked up by the code
--     on the client's receipt: the client may have moved farms, or the original
--     shop may be closed.
--   * The commission ALWAYS goes to the affiliate who registered the client.
--   * Who physically collected is recorded separately from who earns.
--   * A renewal starts on its payment day if the client has lapsed, or where the
--     current period ends if renewed early. It extends; it never overwrites.
--   * A double tap never records two renewals (a request key per form), and a
--     second renewal within 10 minutes needs an explicit confirmation.
--   * Every renewal is a row in subscriptions: paid_at, collected_by, earning
--     affiliate, amount, commission. renewal_log reads them for the owner.
--
-- Hoy: a client whose paid period has ended sees the expiry screen (app layer),
-- and the daily engagement notification stops. Official weather warnings and
-- alert notifications continue (docs/OPEN-DECISIONS.md 3.6).

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------
alter table subscriptions
  add column collected_by_affiliate_id uuid references affiliates(id),   -- null: collected by the owner
  add column request_key               uuid,                              -- one per renewal form
  add column reactivation              boolean not null default false,    -- paid after the client had lapsed
  add column lapsed_days               integer check (lapsed_days is null or lapsed_days > 0);

create unique index subscriptions_request_key_idx on subscriptions (request_key) where request_key is not null;
create index subscriptions_collected_by_idx on subscriptions (collected_by_affiliate_id, paid_at desc);

-- A registration is collected by the affiliate who registered the client
-- (the owner's house affiliate collects nothing in person).
update subscriptions s
   set collected_by_affiliate_id = s.affiliate_id
  from affiliates a
 where a.id = s.affiliate_id and s.kind = 'sale' and not a.is_house and s.collected_by_affiliate_id is null;

create or replace function app.subscriptions_default_collector()
returns trigger
language plpgsql
as $$
begin
  if new.kind = 'sale' and new.collected_by_affiliate_id is null
     and exists (select 1 from affiliates a where a.id = new.affiliate_id and not a.is_house) then
    new.collected_by_affiliate_id := new.affiliate_id;
  end if;
  return new;
end $$;

create trigger subscriptions_default_collector
  before insert on subscriptions
  for each row execute function app.subscriptions_default_collector();

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------

-- A paid period covers today.
create or replace function app.client_has_paid_access(p_client_id uuid)
returns boolean
language sql
stable
set search_path = public, app
as $$
  select exists (select 1 from subscriptions s
                  where s.client_id = p_client_id and s.paid_at is not null and s.voided_at is null
                    and s.period_end >= app.business_today())
$$;

-- What Hoy needs to decide between the app and the expiry screen.
create or replace function app.client_access(p_client_id uuid)
returns jsonb
language sql
stable
set search_path = public, app
as $$
  select jsonb_build_object(
           'paid', cs.status in ('active', 'due'),
           'status', cs.status,
           'period_end', cs.period_end,
           'code', c.code,
           'affiliate_name', coalesce(a.business_name, a.name),
           'affiliate_is_house', a.is_house)
    from clients c
    join affiliates a on a.id = c.affiliate_id
    join client_status cs on cs.client_id = c.id
   where c.id = p_client_id and c.active
$$;

-- ---------------------------------------------------------------------------
-- Recording a renewal
-- ---------------------------------------------------------------------------

-- Internal: insert one renewal for a client, serialised per client. Not callable
-- by portal roles; app.record_renewal and app.affiliate_record_renewal check who
-- may call it.
create or replace function app.insert_renewal(p_client_id uuid, p_collected_by uuid, p_recorded_by uuid, p_request_key uuid)
returns subscriptions
language plpgsql
volatile
set search_path = public, app
as $$
declare
  v_client  clients%rowtype;
  v_aff     affiliates%rowtype;
  v_last    date;
  v_today   date := app.business_today();
  v_start   date;
  v_row     subscriptions%rowtype;
begin
  select * into v_client from clients where id = p_client_id for update;
  if not found then
    raise exception 'no client %', p_client_id using errcode = 'check_violation';
  end if;
  select * into v_aff from affiliates where id = v_client.affiliate_id;

  select max(period_end) into v_last
    from subscriptions where client_id = p_client_id and paid_at is not null and voided_at is null;
  -- Early: extend from the current end. Lapsed (or never paid): from today.
  v_start := greatest(coalesce(v_last, v_today), v_today);

  insert into subscriptions (client_id, period_start, period_end, amount, affiliate_payout, paid_at,
                             kind, affiliate_id, commission_rate, recorded_by,
                             collected_by_affiliate_id, request_key, reactivation, lapsed_days)
  values (p_client_id, v_start, (v_start + app.period_length())::date, app.price_per_period(),
          round(app.price_per_period() * v_aff.commission_rate, 2), now(),
          'renewal', v_client.affiliate_id, v_aff.commission_rate, p_recorded_by,
          p_collected_by, p_request_key,
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

-- The owner marks a renewal paid in admin (collected by the owner).
create or replace function app.record_renewal(p_client_id uuid, p_recorded_by uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, app
as $$
declare
  v_row subscriptions%rowtype;
begin
  perform app.require_owner();
  v_row := app.insert_renewal(p_client_id, null, p_recorded_by, null);
  return jsonb_build_object('client_id', p_client_id, 'period_start', v_row.period_start, 'period_end', v_row.period_end,
                            'affiliate_id', v_row.affiliate_id, 'reactivation', v_row.reactivation);
end $$;

-- The signed-in affiliate, if active; otherwise refused.
create or replace function app.require_active_affiliate()
returns uuid
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_id uuid := app.current_affiliate_id();
begin
  if v_id is null or not exists (select 1 from affiliates where id = v_id and active) then
    raise exception 'only an active affiliate can do this' using errcode = 'insufficient_privilege';
  end if;
  return v_id;
end $$;

-- Step 1: the code on the client's receipt. Any active affiliate, any client.
-- 20 codes not found in 15 minutes stops further lookups by that affiliate.
create or replace function app.renewal_lookup(p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, app
as $$
declare
  v_aff    uuid := app.require_active_affiliate();
  v_source text := 'renewal-lookup:' || v_aff::text;
  v_id     uuid;
begin
  if (select count(*) from login_attempts
       where source_hash = v_source and not succeeded and attempted_at > now() - interval '15 minutes') >= 20 then
    return jsonb_build_object('status', 'throttled');
  end if;
  select id into v_id from clients where code = upper(btrim(coalesce(p_code, '')));
  if v_id is null then
    insert into login_attempts (source_hash, succeeded, subject) values (v_source, false, 'renewal-lookup');
    return jsonb_build_object('status', 'not_found');
  end if;
  return jsonb_build_object('status', 'found', 'client_id', v_id);
end $$;

-- Step 2: what the affiliate needs to see before taking $20.
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

-- A renewal as its collector or earner sees it afterwards.
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
           'collected_by_you', s.collected_by_affiliate_id = v_aff,
           'status_now', cs.status)
    into v_result
    from subscriptions s
    join clients c on c.id = s.client_id
    join affiliates ea on ea.id = s.affiliate_id
    join client_status cs on cs.client_id = c.id
   where s.request_key = p_request_key
     and (app.is_owner() or s.collected_by_affiliate_id = v_aff or s.affiliate_id = v_aff);
  return v_result;
end $$;

-- Step 3: the affiliate has taken $20. Returns a status:
--   renewed          recorded now
--   duplicate        this form was already submitted: the same renewal, not a new one
--   recent_renewal   another renewal for this client in the last 10 minutes; resubmit with p_confirm_repeat
--   client_inactive  the owner has deactivated this client; nothing recorded
create or replace function app.affiliate_record_renewal(
  p_client_id      uuid,
  p_request_key    uuid,
  p_recorded_by    uuid,
  p_confirm_repeat boolean default false
) returns jsonb
language plpgsql
volatile
security definer
set search_path = public, app
as $$
declare
  v_aff    uuid := app.require_active_affiliate();
  v_existing subscriptions%rowtype;
  v_active boolean;
begin
  if p_request_key is null then
    raise exception 'a request key is required' using errcode = 'check_violation';
  end if;

  select active into v_active from clients where id = p_client_id for update;
  if not found then
    raise exception 'no client %', p_client_id using errcode = 'check_violation';
  end if;

  -- After the lock, so a concurrent double tap sees the first one's row.
  select * into v_existing from subscriptions where request_key = p_request_key;
  if found then
    if v_existing.client_id <> p_client_id then
      raise exception 'request key already used for another client' using errcode = 'check_violation';
    end if;
    return jsonb_build_object('status', 'duplicate', 'request_key', p_request_key);
  end if;

  if not v_active then
    return jsonb_build_object('status', 'client_inactive');
  end if;

  if not coalesce(p_confirm_repeat, false) and exists (
       select 1 from subscriptions s
        where s.client_id = p_client_id and s.kind = 'renewal' and s.voided_at is null
          and s.paid_at > now() - interval '10 minutes') then
    return jsonb_build_object('status', 'recent_renewal');
  end if;

  perform app.insert_renewal(p_client_id, v_aff, p_recorded_by, p_request_key);
  return jsonb_build_object('status', 'renewed', 'request_key', p_request_key);
end $$;

-- Renewals this affiliate collected, including for other affiliates' clients
-- (whose rows row-level security otherwise hides from them): the cash they hold.
create or replace function app.my_renewal_collections(p_limit integer default 100)
returns table (paid_at timestamptz, request_key uuid, full_name text, period_start date, period_end date,
               amount numeric, earning_affiliate text, earner_is_you boolean, reactivation boolean)
language sql
stable
security definer
set search_path = public, app
as $$
  select s.paid_at, s.request_key, c.full_name, s.period_start, s.period_end, s.amount,
         coalesce(ea.business_name, ea.name), ea.id = app.current_affiliate_id(), s.reactivation
    from subscriptions s
    join clients c on c.id = s.client_id
    join affiliates ea on ea.id = s.affiliate_id
   where s.collected_by_affiliate_id = app.current_affiliate_id()
     and s.kind = 'renewal' and s.voided_at is null
   order by s.paid_at desc
   limit least(greatest(coalesce(p_limit, 100), 1), 500)
$$;

-- ---------------------------------------------------------------------------
-- Views
-- ---------------------------------------------------------------------------

-- Earnings, now with registrations and renewals apart. New columns at the end.
create or replace view affiliate_earnings with (security_invoker = true) as
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
       coalesce(e.renewals_by_others, 0)                 as renewals_by_others,
       coalesce(e.renewals_by_others_earned, 0)::numeric(10,2) as renewals_by_others_earned
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
           count(*) filter (where s.kind = 'renewal' and s.collected_by_affiliate_id is distinct from a.id) as renewals_by_others,
           sum(s.affiliate_payout) filter (where s.kind = 'renewal' and s.collected_by_affiliate_id is distinct from a.id) as renewals_by_others_earned
      from subscriptions s
     where s.affiliate_id = a.id and s.paid_at is not null and s.voided_at is null
  ) e on true
  left join lateral (
    select sum(p.amount) as paid_out
      from affiliate_payouts p
     where p.affiliate_id = a.id and p.voided_at is null
  ) p on true;

-- Every renewal: when, for whom, who collected, who earned, how much.
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
       s.collected_by_affiliate_id is null                        as collected_by_owner,
       s.collected_by_affiliate_id is distinct from s.affiliate_id as collected_by_other,
       s.reactivation,
       s.lapsed_days,
       s.recorded_by,
       s.voided_at,
       s.void_reason
  from subscriptions s
  join clients c on c.id = s.client_id
  left join affiliates ea on ea.id = s.affiliate_id
  left join affiliates ca on ca.id = s.collected_by_affiliate_id
 where s.kind = 'renewal' and s.paid_at is not null;

-- Where money is collected vs who earns on it, per affiliate. Voided payments
-- excluded. "cash" is what the affiliate took in person and must account for.
create view renewal_collection_by_affiliate with (security_invoker = true) as
select a.id        as affiliate_id,
       a.name,
       a.active,
       a.is_test,
       a.is_house,
       count(s.id) filter (where s.collected_by_affiliate_id = a.id and s.kind = 'renewal')               as renewals_collected,
       count(s.id) filter (where s.collected_by_affiliate_id = a.id and s.kind = 'renewal'
                             and s.affiliate_id <> a.id)                                                   as collected_for_others,
       coalesce(sum(s.amount) filter (where s.collected_by_affiliate_id = a.id), 0)::numeric(10,2)        as cash_collected,
       count(s.id) filter (where s.affiliate_id = a.id and s.kind = 'renewal')                            as renewals_earned,
       count(s.id) filter (where s.affiliate_id = a.id and s.kind = 'renewal'
                             and s.collected_by_affiliate_id is distinct from a.id)                        as earned_collected_by_others,
       coalesce(sum(s.affiliate_payout) filter (where s.affiliate_id = a.id and s.kind = 'renewal'), 0)::numeric(10,2) as renewal_commission
  from affiliates a
  left join subscriptions s
         on (s.affiliate_id = a.id or s.collected_by_affiliate_id = a.id)
        and s.paid_at is not null and s.voided_at is null
 group by a.id;

-- Lapse rate per registering affiliate, real clients only:
--   came_due   clients whose first paid period has reached its end date
--   lapsed     of those, clients with no paid period covering today
--   lapse_rate lapsed / came_due (null until someone has come due)
create view affiliate_lapse_rate with (security_invoker = true) as
select a.id        as affiliate_id,
       a.name,
       a.active,
       a.is_test,
       a.is_house,
       count(*) filter (where k.first_end <= app.business_today())                                    as came_due,
       count(*) filter (where k.first_end <= app.business_today() and cs.status = 'lapsed')             as lapsed,
       count(*) filter (where k.first_end <= app.business_today() and k.renewals > 0)                   as renewed,
       count(*) filter (where k.reactivations > 0)                                                      as reactivated,
       case when count(*) filter (where k.first_end <= app.business_today()) = 0 then null
            else round(count(*) filter (where k.first_end <= app.business_today() and cs.status = 'lapsed')::numeric
                       / count(*) filter (where k.first_end <= app.business_today()), 4) end            as lapse_rate
  from affiliates a
  left join clients c on c.affiliate_id = a.id and not c.is_test
  left join client_status cs on cs.client_id = c.id
  left join lateral (
    select min(s.period_end)                                 as first_end,
           count(*) filter (where s.kind = 'renewal')        as renewals,
           count(*) filter (where s.reactivation)            as reactivations
      from subscriptions s
     where s.client_id = c.id and s.paid_at is not null and s.voided_at is null
  ) k on true
 group by a.id;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select on affiliate_earnings, renewal_log, renewal_collection_by_affiliate, affiliate_lapse_rate to authenticated;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Hoy: the expiry screen is instrumented; engagement stops when a period ends.
-- ---------------------------------------------------------------------------
alter table page_views drop constraint page_views_page_check;
alter table page_views add constraint page_views_page_check
  check (page in ('futbol', 'clima', 'mas', 'tasa', 'feriados', 'escuela', 'consulado',
                  'emergencias', 'transporte', 'loteria', 'setup', 'avisos', 'expiry'));

-- As 0021, plus: only clients with a paid period covering today. Alerts are
-- unaffected; they never pass through here.
create or replace function app.plan_engagement(p_now timestamptz default now())
returns integer
language plpgsql
volatile
set search_path = public, app
as $$
declare
  c         record;
  f         record;
  r         record;
  l         record;
  v_today   date;
  v_queued  integer := 0;
  v_result  text;
  v_cur     text;
  v_kick    timestamp;
begin
  for c in
    select cl.id, cl.language::text as lang, cl.timezone, cl.team_id, cl.country, cl.notify_hour
      from clients cl
     where cl.active
       and app.client_has_paid_access(cl.id)
       and extract(hour from p_now at time zone cl.timezone) = cl.notify_hour
       and exists (select 1 from push_subscriptions ps where ps.client_id = cl.id and ps.disabled_at is null)
       and not exists (select 1 from notifications n
                        where n.client_id = cl.id and n.channel = 'engagement'
                          and n.local_date = (p_now at time zone cl.timezone)::date)
  loop
    v_today := (p_now at time zone c.timezone)::date;

    -- 1. Their team plays today.
    select fx.id, fx.kickoff_utc, coalesce(t.short_name, t.name) as team,
           coalesce(o.short_name, o.name) as opponent
      into f
      from fixtures fx
      join teams t on t.id = c.team_id
      join teams o on o.id = case when fx.home_team_id = c.team_id then fx.away_team_id else fx.home_team_id end
     where c.team_id is not null
       and (fx.home_team_id = c.team_id or fx.away_team_id = c.team_id)
       and fx.status = 'scheduled'
       and (fx.kickoff_utc at time zone c.timezone)::date = v_today
       and fx.fetched_at >= p_now - interval '6 hours'
     order by fx.kickoff_utc
     limit 1;
    if found then
      v_kick := f.kickoff_utc at time zone c.timezone;
      v_result := app.queue_engagement_notification(c.id, v_today, 'match_day',
        case when c.lang = 'en' then format('%s play today', f.team) else format('Hoy juega %s', f.team) end,
        format('%s vs %s, %s', f.team, f.opponent,
               lower(to_char(v_kick, case when extract(minute from v_kick) = 0 then 'FMHH12AM' else 'FMHH12:MIAM' end))),
        p_now, f.id);
      if v_result in ('queued', 'replaced') then v_queued := v_queued + 1; end if;
      continue;
    end if;

    -- 2. The reference rate is at a 30-day high today.
    v_cur := case c.country::text when 'MX' then 'MXN' when 'HN' then 'HNL' when 'GT' then 'GTQ' when 'JM' then 'JMD' end;
    select x.rate, x.rate_date into r
      from fx_latest_with_context x
     where x.quote = v_cur::fx_currency and x.is_30d_high
       and x.rate_date >= v_today - 1
     order by x.rate_date desc
     limit 1;
    if found then
      v_result := app.queue_engagement_notification(c.id, v_today, 'fx_30d_high',
        case when c.lang = 'en' then 'Reference rate: highest in 30 days' else 'Tasa de referencia: la más alta en 30 días' end,
        format('1 CAD = %s %s', to_char(r.rate, 'FM999999990.00'), v_cur),
        p_now, null);
      if v_result in ('queued', 'replaced') then v_queued := v_queued + 1; end if;
      continue;
    end if;

    -- 3. A lottery draw in their country today. Results only: never odds or a buy link.
    select g.name as game, lr.numbers into l
      from lottery_results lr
      join lottery_games g on g.id = lr.game_id
     where g.country = c.country and g.active
       and lr.draw_date = v_today
     order by lr.draw_time_local desc nulls last, lr.fetched_at desc
     limit 1;
    if found then
      v_result := app.queue_engagement_notification(c.id, v_today, 'lottery',
        case when c.lang = 'en' then format('%s results', l.game) else format('Resultados de %s', l.game) end,
        array_to_string(l.numbers, ' · '),
        p_now, null);
      if v_result in ('queued', 'replaced') then v_queued := v_queued + 1; end if;
    end if;
  end loop;

  return v_queued;
end $$;
