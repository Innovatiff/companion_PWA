-- 0018_portal_accounts.sql
-- Sign-in for the affiliate and owner portals, separate from client codes.
--
-- A login name and a password, stored here and hashed with bcrypt (pgcrypto).
-- There is no email, SMS or external auth service: the owner creates an account
-- and hands over a one-time setup link.
--
-- A portal request then runs as the database role `authenticated` with the
-- person's auth_user_id as the JWT subject (see packages/shared/src/server/db.ts),
-- so the row-level-security policies from 0005 decide what an affiliate can
-- read. The functions below run with the server's own connection; they are not
-- callable by `authenticated`.

-- `authenticated` exists on Supabase; a bare local Postgres only has it once the
-- RLS tests create it.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant usage on schema app to authenticated;
  end if;
end $$;

-- Flags used across the build.
alter table affiliates
  add column is_test  boolean not null default false,   -- test data: never a real sale
  add column is_house boolean not null default false;   -- the owner's own "direct" registrations
create unique index affiliates_one_house_idx on affiliates (is_house) where is_house;

alter table clients add column is_test boolean not null default false;

-- Throttle portal sign-in per source and per login name.
alter table login_attempts add column subject text;
create index login_attempts_subject_idx on login_attempts (subject, attempted_at desc) where subject is not null;

create table portal_logins (
  auth_user_id          uuid primary key default extensions.gen_random_uuid(),
  login                 text not null unique check (login ~ '^[a-z0-9._-]{3,40}$'),
  role                  text not null check (role in ('affiliate', 'owner')),
  affiliate_id          uuid unique references affiliates(id) on delete cascade,
  language              ui_language not null default 'es',
  password_hash         text,                       -- bcrypt; null until the setup link is used
  setup_token_hash      text unique,                -- sha256 of the one-time setup token
  setup_expires_at      timestamptz,
  sessions_valid_after  timestamptz not null default now(),
  active                boolean not null default true,
  created_at            timestamptz not null default now(),
  last_login_at         timestamptz,
  check ((role = 'affiliate') = (affiliate_id is not null))
);

alter table portal_logins enable row level security;   -- server only: no policies

-- A new one-time setup token for an account. Returned once, stored only as a
-- hash, valid 72 hours. It clears any existing password and ends open sessions.
create or replace function app.portal_issue_setup(p_auth_user_id uuid)
returns text
language plpgsql
volatile
set search_path = public, app, extensions
as $$
declare
  v_token text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  update portal_logins
     set setup_token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex'),
         setup_expires_at = now() + interval '72 hours',
         password_hash = null,
         sessions_valid_after = now()
   where auth_user_id = p_auth_user_id;
  if not found then
    raise exception 'no portal login %', p_auth_user_id;
  end if;
  return v_token;
end $$;

create or replace function app.portal_create_owner(p_login text, p_language ui_language default 'es')
returns jsonb
language plpgsql
volatile
set search_path = public, app, extensions
as $$
declare
  v_id uuid;
begin
  insert into portal_logins (login, role, language)
  values (lower(btrim(p_login)), 'owner', p_language)
  returning auth_user_id into v_id;
  insert into owners (auth_user_id, note) values (v_id, 'portal login ' || lower(btrim(p_login)));
  return jsonb_build_object('auth_user_id', v_id, 'setup_token', app.portal_issue_setup(v_id));
end $$;

create or replace function app.portal_create_affiliate_login(p_affiliate_id uuid, p_login text, p_language ui_language default 'es')
returns jsonb
language plpgsql
volatile
set search_path = public, app, extensions
as $$
declare
  v_id uuid;
begin
  insert into portal_logins (login, role, affiliate_id, language)
  values (lower(btrim(p_login)), 'affiliate', p_affiliate_id, p_language)
  returning auth_user_id into v_id;
  update affiliates set auth_user_id = v_id where id = p_affiliate_id;
  return jsonb_build_object('auth_user_id', v_id, 'setup_token', app.portal_issue_setup(v_id));
end $$;

-- Setting the password with the one-time token.
create or replace function app.portal_complete_setup(p_token text, p_password text)
returns jsonb
language plpgsql
volatile
set search_path = public, app, extensions
as $$
declare
  v_row portal_logins%rowtype;
begin
  if length(coalesce(p_password, '')) < 10 then
    return jsonb_build_object('status', 'weak_password');
  end if;
  select * into v_row from portal_logins
   where setup_token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
  if not found then
    return jsonb_build_object('status', 'invalid_token');
  end if;
  if v_row.setup_expires_at < now() then
    return jsonb_build_object('status', 'expired');
  end if;
  update portal_logins
     set password_hash = extensions.crypt(p_password, extensions.gen_salt('bf', 12)),
         setup_token_hash = null, setup_expires_at = null, sessions_valid_after = now()
   where auth_user_id = v_row.auth_user_id;
  return jsonb_build_object('status', 'ok', 'login', v_row.login, 'role', v_row.role);
end $$;

-- Sign-in. Throttled per source and per login name: 10 failures in 15 minutes
-- blocks further attempts, even with the right password.
create or replace function app.portal_sign_in(p_login text, p_password text, p_source_hash text)
returns jsonb
language plpgsql
volatile
set search_path = public, app, extensions
as $$
declare
  v_login  text := lower(btrim(coalesce(p_login, '')));
  v_row    portal_logins%rowtype;
  v_ok     boolean;
begin
  if (select count(*) filter (where source_hash = p_source_hash) >= 10
          or count(*) filter (where subject = v_login) >= 10
        from login_attempts
       where not succeeded and attempted_at > now() - interval '15 minutes'
         and (source_hash = p_source_hash or subject = v_login)) then
    return jsonb_build_object('status', 'throttled');
  end if;

  select * into v_row from portal_logins where login = v_login;
  if not found then
    insert into login_attempts (source_hash, succeeded, subject) values (p_source_hash, false, v_login);
    return jsonb_build_object('status', 'invalid');
  end if;
  if v_row.password_hash is null then
    return jsonb_build_object('status', 'setup_required');
  end if;

  v_ok := v_row.password_hash = extensions.crypt(coalesce(p_password, ''), v_row.password_hash);
  insert into login_attempts (source_hash, succeeded, subject) values (p_source_hash, v_ok and v_row.active, v_login);
  if not v_ok then
    return jsonb_build_object('status', 'invalid');
  end if;
  if not v_row.active
     or (v_row.role = 'affiliate' and not exists (select 1 from affiliates a where a.id = v_row.affiliate_id and a.active)) then
    return jsonb_build_object('status', 'inactive');
  end if;

  update portal_logins set last_login_at = now() where auth_user_id = v_row.auth_user_id;
  return jsonb_build_object('status', 'ok', 'auth_user_id', v_row.auth_user_id, 'role', v_row.role,
                            'affiliate_id', v_row.affiliate_id, 'language', v_row.language);
end $$;

-- Is this session still valid? Checked on every portal request: a deactivated
-- account, a deactivated affiliate, or a password reset since the session was
-- issued all end it.
create or replace function app.portal_session(p_auth_user_id uuid, p_issued_at timestamptz)
returns jsonb
language sql
stable
set search_path = public, app
as $$
  select jsonb_build_object(
           'auth_user_id', l.auth_user_id, 'login', l.login, 'role', l.role,
           'affiliate_id', l.affiliate_id, 'language', l.language,
           'affiliate_name', a.name, 'is_test', coalesce(a.is_test, false))
    from portal_logins l
    left join affiliates a on a.id = l.affiliate_id
   where l.auth_user_id = p_auth_user_id
     and l.active
     and l.password_hash is not null
     and p_issued_at >= date_trunc('second', l.sessions_valid_after)
     and (l.role = 'owner' or a.active)
$$;

-- None of the account functions are for `authenticated` or `anon`.
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on table portal_logins from %I', r);
      execute format('revoke execute on function app.portal_issue_setup(uuid), app.portal_create_owner(text, ui_language), '
                  || 'app.portal_create_affiliate_login(uuid, text, ui_language), app.portal_complete_setup(text, text), '
                  || 'app.portal_sign_in(text, text, text), app.portal_session(uuid, timestamptz) from %I', r);
    end if;
  end loop;
end $$;
revoke execute on function app.portal_issue_setup(uuid), app.portal_create_owner(text, ui_language),
  app.portal_create_affiliate_login(uuid, text, ui_language), app.portal_complete_setup(text, text),
  app.portal_sign_in(text, text, text), app.portal_session(uuid, timestamptz) from public;
