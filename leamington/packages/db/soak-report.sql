-- Soak report for the ingest service. Read-only.
--
--   psql "$DATABASE_URL" -v since='<window start>' -f packages/db/soak-report.sql
--
-- The window starts at the latest successful Railway deployment of main (a
-- deploy restarts the service). See docs/SOAK.md for how to find it.
\set ON_ERROR_STOP on
\pset null '·'

\echo '=== window ==='
select :'since'::timestamptz as since, now() as until, now() - :'since'::timestamptz as elapsed;

\echo ''
\echo '=== health now ==='
select feed, health, latest_status, latest_result, last_ok_at, since_last_ok, running_since,
       failures_24h, alert_delivery_failures_24h
  from feed_health_detail order by feed;
select * from owner_alert_delivery_health;

\echo ''
\echo '=== runs per feed, by outcome ==='
select feed, status, source_result, count(*) as runs, sum(records_written) as records,
       min(started_at) as first, max(started_at) as last
  from source_runs where started_at >= :'since'
 group by feed, status, source_result order by feed, status, source_result;

\echo ''
\echo '=== what broke: runs that were not ok ==='
select feed, status, count(*) as runs, min(started_at) as first, max(started_at) as last,
       coalesce(error, notes::text) as reason
  from source_runs where started_at >= :'since' and status <> 'ok'
 group by feed, status, coalesce(error, notes::text) order by feed, last desc;

\echo ''
\echo '=== runs that never finished (started > 10 min ago) ==='
select id, feed, started_at from source_runs
 where started_at >= :'since' and finished_at is null and started_at < now() - interval '10 minutes'
 order by started_at;

\echo ''
\echo '=== rate limiting and HTTP errors ==='
select feed, http_status, count(*) from source_runs
 where started_at >= :'since' and (http_status >= 400 or notes::text ~ '(429|HTTP 4|HTTP 5)' or error ~ '(429|rate limited|ceiling)')
 group by feed, http_status order by feed;

\echo ''
\echo '=== weekday vs weekend failures (scrapers failing Sat/Sun) ==='
select feed, extract(isodow from started_at at time zone 'America/Toronto') in (6,7) as weekend,
       count(*) filter (where status <> 'ok') as not_ok, count(*) as runs
  from source_runs where started_at >= :'since'
 group by 1, 2 order by 1, 2;

\echo ''
\echo '=== lottery: scheduled runs that found no new draw ==='
select date_trunc('hour', started_at at time zone 'America/Jamaica') as slot_local_hour,
       status, source_result, records_written, coalesce(error, notes::text) as reason
  from source_runs where feed = 'lottery' and started_at >= :'since' order by started_at;

\echo ''
\echo '=== what went stale / what fired: owner alerts ==='
select id, feed, kind, summary, opened_at, resolved_at, last_notified_at, notify_count
  from owner_alerts where opened_at >= :'since' or resolved_at >= :'since' or resolved_at is null
 order by opened_at;

\echo ''
\echo '=== owner alert deliveries ==='
select feed, kind, delivered, http_status, error, count(*) as attempts,
       min(attempted_at) as first, max(attempted_at) as last
  from owner_alert_deliveries where attempted_at >= :'since'
 group by feed, kind, delivered, http_status, error order by feed, kind, delivered;

\echo ''
\echo '=== weather alerts ingested ==='
select msg_type, level, count(*) as alerts,
       count(*) filter (where superseded_by_id is null and cancelled_at is null) as not_superseded,
       count(*) filter (where area_geog is null and center_geog is null) as no_geometry
  from weather_alerts where fetched_at >= :'since'
 group by msg_type, level order by msg_type, level;

\echo ''
\echo '=== football fixtures stored ==='
select l.name as league, f.status, count(*) as fixtures, min(f.kickoff_utc) as first_kickoff,
       max(f.kickoff_utc) as last_kickoff, max(f.fetched_at) as last_fetched
  from fixtures f join leagues l on l.id = f.league_id
 where f.fetched_at >= :'since'
 group by l.name, f.status order by l.name, f.status;
