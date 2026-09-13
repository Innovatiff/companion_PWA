-- 0027_hoy_views_and_push.sql
-- Instrumentation for Hoy's section pages, and saving a phone's push
-- subscription.
--
-- Home already records renders and opens (0016). Sections record one row per
-- page served, with what it showed and what it left out and why: for example
-- {"fixtures_current": false} or {"alerts_state": "stale"}. That is what tells
-- us whether a section is empty because the person has nothing, or because a
-- feed let them down.

create table page_views (
  id         bigint generated always as identity primary key,
  client_id  uuid not null references clients(id) on delete cascade,
  page       text not null check (page in ('futbol', 'clima', 'mas', 'tasa', 'feriados', 'escuela', 'consulado',
                                           'emergencias', 'transporte', 'loteria', 'setup', 'avisos')),
  served_at  timestamptz not null default now(),
  states     jsonb not null default '{}'::jsonb
);

create index page_views_client_idx on page_views (client_id, served_at desc);
create index page_views_page_idx on page_views (page, served_at desc);

alter table page_views enable row level security;
create policy page_views_owner_read on page_views for select using (app.is_owner());

create or replace function app.record_page_view(p_client_id uuid, p_page text, p_states jsonb)
returns void
language sql
volatile
set search_path = public, app
as $$
  insert into page_views (client_id, page, states)
  select c.id, p_page, coalesce(p_states, '{}'::jsonb)
    from clients c where c.id = p_client_id and c.active
$$;

-- A phone's push subscription. The same endpoint signed in with another code
-- (a shared or handed-down phone) now belongs to that client only.
create or replace function app.save_push_subscription(
  p_client_id uuid, p_endpoint text, p_p256dh text, p_auth text, p_user_agent text
) returns void
language plpgsql
volatile
set search_path = public, app
as $$
begin
  if not exists (select 1 from clients where id = p_client_id and active) then
    raise exception 'no active client' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(p_endpoint, '') !~ '^https://' or length(p_endpoint) > 1024
     or coalesce(p_p256dh, '') !~ '^[A-Za-z0-9_-]{80,100}$'
     or coalesce(p_auth, '') !~ '^[A-Za-z0-9_-]{16,32}$' then
    raise exception 'not a push subscription' using errcode = 'check_violation';
  end if;
  insert into push_subscriptions (client_id, endpoint, p256dh, auth, user_agent)
  values (p_client_id, p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update
     set client_id = excluded.client_id, p256dh = excluded.p256dh, auth = excluded.auth,
         user_agent = excluded.user_agent, disabled_at = null, failures = 0, last_error = null;
end $$;

-- Turning notifications off on this phone.
create or replace function app.remove_push_subscription(p_client_id uuid, p_endpoint text)
returns void
language sql
volatile
set search_path = public, app
as $$
  update push_subscriptions set disabled_at = now(), last_error = 'turned off by the client'
   where client_id = p_client_id and endpoint = p_endpoint and disabled_at is null
$$;

-- Whether this client can receive a push at all, for the Más page.
create or replace function app.push_status(p_client_id uuid)
returns jsonb
language sql
stable
set search_path = public, app
as $$
  select jsonb_build_object(
           'subscriptions', count(*) filter (where disabled_at is null),
           'last_success_at', max(last_success_at))
    from push_subscriptions where client_id = p_client_id
$$;
