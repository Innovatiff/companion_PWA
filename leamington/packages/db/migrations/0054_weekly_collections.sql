-- 0054_weekly_collections.sql
-- Weekly cash collection from the businesses (owner's rule, 2026-09-17).
--
-- The owner collects in person, once a week. A business keeps its commission
-- out of the $20 it took and hands over the rest (OPEN-DECISIONS 3.6a: "every
-- business owes the owner the $20 it collects, less its own commission").
--
-- The week is Sunday to Saturday on Leamington time, so a week is closed and
-- collected the same way everywhere. Cash is counted by the business that
-- physically took it (subscriptions.collected_by_affiliate_id, 0029/0031), not
-- by who earns the commission: a renewal the owner collected is the owner's
-- cash and is not in any business's week.
--
-- The ledger direction (3.4) is unchanged: a commission still accrues to the
-- business. Recording a week's collection also records that week's commission
-- as a payout of kind 'kept' — the money stayed in their hands — so
-- affiliate_earnings.owed keeps meaning "what the owner still has to hand over"
-- and does not grow forever against cash the business already holds.

-- ---------------------------------------------------------------------------
-- The business week
-- ---------------------------------------------------------------------------

-- The Sunday on or before a date. Immutable, so a check constraint and an index
-- can use it.
create or replace function app.business_week_start(p_date date)
returns date
language sql
immutable
as $$
  select p_date - extract(dow from p_date)::int
$$;

-- The week being collected now, on Leamington time.
create or replace function app.business_week()
returns date
language sql
stable
set search_path = public, app
as $$
  select app.business_week_start(app.business_today())
$$;

-- ---------------------------------------------------------------------------
-- What the owner collected, per business and week
-- ---------------------------------------------------------------------------

create table affiliate_collections (
  id            bigint generated always as identity primary key,
  affiliate_id  uuid not null references affiliates(id),
  week_start    date not null check (extract(dow from week_start) = 0),
  amount        numeric(10,2) not null check (amount > 0),
  collected_at  timestamptz not null default now(),
  method        text,
  note          text,
  recorded_by   uuid,
  voided_at     timestamptz,
  void_reason   text,
  created_at    timestamptz not null default now()
);

create index affiliate_collections_affiliate_idx on affiliate_collections (affiliate_id, week_start desc);

alter table affiliate_collections enable row level security;
create policy affiliate_collections_read on affiliate_collections
  for select using (affiliate_id = app.current_affiliate_id() or app.is_owner());
create policy affiliate_collections_owner_write on affiliate_collections
  for all using (app.is_owner()) with check (app.is_owner());

-- A payout is either cash the owner handed over ('paid') or the commission a
-- business kept out of the cash it collected in a week ('kept'), which is
-- recorded once per week when that week is collected.
alter table affiliate_payouts
  add column kind       text not null default 'paid' check (kind in ('paid', 'kept')),
  add column week_start date,
  add constraint affiliate_payouts_kept_has_week check (kind = 'paid' or week_start is not null);

create unique index affiliate_payouts_kept_week_idx on affiliate_payouts (affiliate_id, week_start)
  where kind = 'kept' and voided_at is null;

-- ---------------------------------------------------------------------------
-- The week, per business: cash taken, their share, what they owe, what they
-- handed over. A week appears once it has cash or a collection; a week with
-- neither is not a row (and is not a claim that nothing was sold).
-- ---------------------------------------------------------------------------

create view affiliate_week_collections with (security_invoker = true) as
with cash as (
  select s.collected_by_affiliate_id                                             as affiliate_id,
         app.business_week_start((s.paid_at at time zone 'America/Toronto')::date) as week_start,
         count(*) filter (where s.kind = 'sale')                                 as sales,
         count(*) filter (where s.kind = 'renewal')                              as renewals,
         sum(s.amount)                                                           as cash_collected,
         sum(s.affiliate_payout) filter (where s.affiliate_id = s.collected_by_affiliate_id) as affiliate_keeps,
         max(s.paid_at)                                                          as last_paid_at
    from subscriptions s
    join clients c on c.id = s.client_id
   where s.collected_by_affiliate_id is not null
     and s.paid_at is not null and s.voided_at is null
     and not c.is_test
   group by 1, 2
),
handed as (
  select affiliate_id, week_start,
         sum(amount)      as settled,
         count(*)         as payments,
         max(collected_at) as last_collected_at
    from affiliate_collections
   where voided_at is null
   group by 1, 2
)
select a.id                                                        as affiliate_id,
       a.name,
       a.is_test,
       a.is_house,
       w.week_start,
       (w.week_start + 6)                                          as week_end,
       coalesce(w.sales, 0)                                        as sales,
       coalesce(w.renewals, 0)                                     as renewals,
       coalesce(w.cash_collected, 0)::numeric(10,2)                as cash_collected,
       coalesce(w.affiliate_keeps, 0)::numeric(10,2)               as affiliate_keeps,
       (coalesce(w.cash_collected, 0) - coalesce(w.affiliate_keeps, 0))::numeric(10,2) as owed_to_owner,
       coalesce(w.settled, 0)::numeric(10,2)                       as settled,
       (coalesce(w.cash_collected, 0) - coalesce(w.affiliate_keeps, 0) - coalesce(w.settled, 0))::numeric(10,2) as outstanding,
       coalesce(w.payments, 0)                                     as payments,
       w.last_paid_at,
       w.last_collected_at,
       (w.week_start = app.business_week())                        as is_current
  from (select coalesce(c.affiliate_id, h.affiliate_id) as affiliate_id,
               coalesce(c.week_start, h.week_start)     as week_start,
               c.sales, c.renewals, c.cash_collected, c.affiliate_keeps, c.last_paid_at,
               h.settled, h.payments, h.last_collected_at
          from cash c
          full join handed h on h.affiliate_id = c.affiliate_id and h.week_start = c.week_start) w
  join affiliates a on a.id = w.affiliate_id
 -- A business sees only its own weeks. Its own clients' renewals collected by
 -- another business are visible to it as rows (0031), so the view must not let
 -- that become another business's weekly total.
 where a.id = app.current_affiliate_id() or app.is_owner();

-- ---------------------------------------------------------------------------
-- Recording and undoing a collection
-- ---------------------------------------------------------------------------

-- The owner records what a business handed over for one week. The week's
-- commission is recorded as kept at the same time, once per week.
create or replace function app.record_week_collection(
  p_affiliate_id uuid,
  p_week_start   date,
  p_amount       numeric,
  p_method       text,
  p_note         text,
  p_recorded_by  uuid
) returns bigint
language plpgsql
volatile
security definer
set search_path = public, app
as $$
declare
  v_id    bigint;
  v_keeps numeric;
begin
  perform app.require_owner();
  if p_week_start is null or p_week_start <> app.business_week_start(p_week_start) then
    raise exception 'a collection week starts on a Sunday' using errcode = 'check_violation';
  end if;
  if p_week_start > app.business_week() then
    raise exception 'that week has not started yet' using errcode = 'check_violation';
  end if;

  insert into affiliate_collections (affiliate_id, week_start, amount, method, note, recorded_by)
  values (p_affiliate_id, p_week_start, round(p_amount, 2),
          nullif(btrim(p_method), ''), nullif(btrim(p_note), ''), p_recorded_by)
  returning id into v_id;

  select affiliate_keeps into v_keeps
    from affiliate_week_collections
   where affiliate_id = p_affiliate_id and week_start = p_week_start;

  if coalesce(v_keeps, 0) > 0 then
    insert into affiliate_payouts (affiliate_id, amount, method, note, recorded_by, kind, week_start)
    values (p_affiliate_id, v_keeps, 'retenido',
            'Comisión de la semana del ' || to_char(p_week_start, 'DD-MM-YYYY'), p_recorded_by, 'kept', p_week_start)
    on conflict (affiliate_id, week_start) where kind = 'kept' and voided_at is null do nothing;
  end if;
  return v_id;
end $$;

-- A collection recorded by mistake. When a week has no collection left, the
-- commission it marked as kept goes back to being owed.
create or replace function app.void_week_collection(p_id bigint, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = public, app
as $$
declare
  v_affiliate uuid;
  v_week      date;
begin
  perform app.require_owner();
  update affiliate_collections
     set voided_at = now(), void_reason = nullif(btrim(p_reason), '')
   where id = p_id and voided_at is null
   returning affiliate_id, week_start into v_affiliate, v_week;
  if v_affiliate is null then
    return;
  end if;
  if not exists (select 1 from affiliate_collections
                  where affiliate_id = v_affiliate and week_start = v_week and voided_at is null) then
    update affiliate_payouts
       set voided_at = now(), void_reason = nullif(btrim(p_reason), '')
     where affiliate_id = v_affiliate and week_start = v_week and kind = 'kept' and voided_at is null;
  end if;
end $$;
