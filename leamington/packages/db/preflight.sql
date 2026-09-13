-- Read-only Supabase readiness check. Run this BEFORE migrating.
--   psql "$DATABASE_URL" -f packages/db/preflight.sql
-- Changes nothing.

\echo '--- connection ---'
select current_database() as database, current_user as role,
       version() as server;

\echo ''
\echo '--- am I a superuser? (Supabase: expected false) ---'
select rolsuper as is_superuser, rolcreatedb as can_create_db,
       rolcreaterole as can_create_role
  from pg_roles where rolname = current_user;

\echo ''
\echo '--- required extensions: installed, and IN WHICH SCHEMA? ---'
-- Schema matters: the migrations call extensions.ST_SetSRID(), so postgis must
-- live in `extensions`. If it is installed in `public`, CREATE EXTENSION
-- IF NOT EXISTS is a silent no-op and every extensions.* call then fails.
select e.extname,
       n.nspname as installed_in,
       case when n.nspname = 'extensions' then 'ok'
            else 'WRONG SCHEMA — migrations reference extensions.*' end as verdict
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace
 where e.extname in ('postgis','pgcrypto','unaccent','pg_trgm')
 order by e.extname;

\echo ''
\echo '--- missing extensions (must be enabled before migrating) ---'
select x.name as missing
  from (values ('postgis'),('pgcrypto'),('unaccent'),('pg_trgm')) x(name)
 where not exists (select 1 from pg_extension where extname = x.name);

\echo ''
\echo '--- is postgis available to install at all? ---'
select name, default_version, installed_version
  from pg_available_extensions where name = 'postgis';

\echo ''
\echo '--- the extensions schema must already exist ---'
select exists(select 1 from pg_namespace where nspname='extensions') as extensions_schema_exists,
       exists(select 1 from pg_namespace where nspname='auth')       as auth_schema_exists;

\echo ''
\echo '--- Supabase auth helpers must be PRESENT and NOT ours ---'
select p.proname,
       pg_get_functiondef(p.oid) like '%request.jwt.claim.sub%' as looks_like_local_stub
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'auth' and p.proname in ('uid','role');

\echo ''
\echo '--- has anything been applied already? ---'
select count(*) as leamington_tables
  from information_schema.tables
 where table_schema='public'
   and table_name in ('clients','affiliates','weather_alerts','source_runs','feed_expectations');
