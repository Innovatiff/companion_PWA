-- LOCAL/CI ONLY. Not applied to Supabase.
-- Supabase provides the `extensions` schema and the `auth` helpers; a bare
-- Postgres does not. These shims let the real migrations run unmodified so the
-- schema is actually tested rather than assumed.

create schema if not exists extensions;
create schema if not exists auth;

-- Settable stand-ins for Supabase's request-scoped JWT helpers.
create or replace function auth.uid() returns uuid
  language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
  $$;

create or replace function auth.role() returns text
  language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon');
  $$;
