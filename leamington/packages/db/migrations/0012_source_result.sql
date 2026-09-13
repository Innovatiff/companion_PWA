-- 0012_source_result.sql
-- What the source said, recorded separately from how the run went.
--
-- A run's status could not tell three different facts apart. An 'ok' run with
-- records_written = 0 covered both "the source listed alerts we already hold"
-- and "the source said nothing is active", and an 'error' run means "the source
-- did not answer". SILENCE IS NEVER EVIDENCE: these are three states, and
-- feed_health_detail shows which one the latest run was.

create type source_result as enum ('items', 'confirmed_empty', 'no_answer');

alter table source_runs add column source_result source_result;

-- An errored run never got an answer, by definition of 'error'.
update source_runs set source_result = 'no_answer' where status = 'error';

-- Columns may only be appended to a replaced view, so latest_result goes last.
create or replace view feed_health as
select
  feed,
  max(started_at) filter (where status = 'ok')            as last_ok_at,
  max(started_at)                                         as last_attempt_at,
  now() - max(started_at) filter (where status = 'ok')     as since_last_ok,
  (array_agg(status order by started_at desc))[1]          as latest_status,
  (array_agg(error  order by started_at desc) filter (where error is not null))[1]
                                                           as latest_error,
  count(*) filter (where status <> 'ok'
                     and started_at > now() - interval '24 hours')
                                                           as failures_24h,
  (array_agg(source_result order by started_at desc))[1]   as latest_result
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
  h.latest_result
from feed_expectations e
left join feed_health h on h.feed = e.feed
where e.active;
