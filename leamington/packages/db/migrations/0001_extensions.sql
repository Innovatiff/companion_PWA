-- 0001_extensions.sql
-- PostGIS is load-bearing, not optional.
--
-- Alert polygons are geographic. CLAUDE.md: "Match alerts to clients by
-- municipality coordinates inside the alert polygon. Department-level matching
-- produces false positives." That requires real spatial predicates
-- (ST_Covers / ST_DWithin), so the geometry lives in the database as geography,
-- never as a name string we try to match on.

create extension if not exists postgis      with schema extensions;
create extension if not exists pgcrypto     with schema extensions;  -- gen_random_uuid, code entropy
create extension if not exists unaccent     with schema extensions;  -- municipality search, accent-insensitive
create extension if not exists pg_trgm      with schema extensions;  -- fuzzy municipality picker

-- Helper schema for auth predicates used by RLS.
create schema if not exists app;

-- unaccent() is STABLE (it depends on a text-search dictionary), so Postgres
-- refuses it in an index expression. Pinning the dictionary explicitly makes
-- the call deterministic, which lets us mark the wrapper IMMUTABLE and index on
-- it. This is what powers accent-insensitive municipality search.
create or replace function app.immutable_unaccent(text)
returns text
language sql
immutable
strict
parallel safe
as $$
  select extensions.unaccent('extensions.unaccent'::regdictionary, $1)
$$;
