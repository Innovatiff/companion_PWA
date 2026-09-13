-- 0014_unfinished_runs.sql
-- A run counts only once it has finished.
--
-- runFeed inserts a source_runs row with status 'ok' when a run STARTS and sets
-- the real status when it finishes. feed_health counted that placeholder as a
-- success, so for the second or so a run was in flight its feed read as
-- healthy. In production the staleness check at :00/:15/:30/:45 saw alerts:JM
-- "recover" mid-run and reopened it at the next check, every 15 minutes. And a
-- run killed before it finished would have stayed 'ok' forever: a crash
-- reading as a success.
--
-- Health now uses finished runs only. last_attempt_at still includes a run in
-- progress (it is an attempt), and running_since shows it, so a run that never
-- finishes is visible rather than silent.

-- Columns may only be appended to a replaced view, so running_since goes last.
create or replace view feed_health as
select
  feed,
  max(started_at) filter (where status = 'ok' and finished_at is not null)        as last_ok_at,
  max(started_at)                                                                 as last_attempt_at,
  now() - max(started_at) filter (where status = 'ok' and finished_at is not null) as since_last_ok,
  (array_agg(status order by started_at desc) filter (where finished_at is not null))[1]
                                                                                  as latest_status,
  (array_agg(error  order by started_at desc) filter (where error is not null))[1]
                                                                                  as latest_error,
  count(*) filter (where status <> 'ok' and finished_at is not null
                     and started_at > now() - interval '24 hours')                as failures_24h,
  (array_agg(source_result order by started_at desc) filter (where finished_at is not null))[1]
                                                                                  as latest_result,
  max(started_at) filter (where finished_at is null)                              as running_since
from source_runs
group by feed;

create or replace view feed_health_detail as
select
  e.feed,
  e.label,
  e.expected_interval,
  h.last_ok_at,
  h.last_attempt_at,
  h.latest_status,
  h.latest_error,
  h.failures_24h,
  case
    when h.last_attempt_at is null then 'never_run'
    when h.last_ok_at is null      then 'never_succeeded'
    when h.last_ok_at < now() - (e.expected_interval + e.grace) then 'stale'
    when h.latest_status = 'error' then 'failing'
    when h.latest_status = 'partial' then 'degraded'
    else 'ok'
  end as health,
  now() - h.last_ok_at as since_last_ok,
  -- items | confirmed_empty | no_answer; null for feeds that do not report it.
  h.latest_result,
  -- Owner alerts about this feed that did not reach the owner.
  (select count(*) from owner_alert_deliveries d
    where d.feed = e.feed and not d.delivered
      and d.attempted_at > now() - interval '24 hours') as alert_delivery_failures_24h,
  -- Start of the newest run that has not finished; null when nothing is running.
  h.running_since
from feed_expectations e
left join feed_health h on h.feed = e.feed
where e.active;
