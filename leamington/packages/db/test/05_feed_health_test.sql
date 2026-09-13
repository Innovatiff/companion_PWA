-- Feed health counts a run only once it has finished.
--
-- A run's row is inserted as 'ok' when it starts. Counting that placeholder made
-- a feed look healthy mid-run, and would make a run killed mid-way look like a
-- success forever. SILENCE IS NEVER EVIDENCE.
\set ON_ERROR_STOP on

insert into feed_expectations (feed, label, expected_interval)
  values ('test:inflight', 'In-flight test', interval '15 minutes') on conflict do nothing;

-- --------------------------------------------------------------------------
-- A run in progress is running, not a success
-- --------------------------------------------------------------------------
do $$
declare h record;
begin
  insert into source_runs (feed, started_at, status) values ('test:inflight', now(), 'ok');
  select * into h from feed_health_detail where feed = 'test:inflight';
  assert h.last_ok_at is null, 'an unfinished run must not count as a success';
  assert h.health = 'never_succeeded', format('expected never_succeeded, got %s', h.health);
  assert h.running_since is not null, 'an unfinished run must be visible as running';
  raise notice 'PASS feed health: an in-progress run is running, not a success';
end $$;

-- --------------------------------------------------------------------------
-- The same run, finished ok, is a success
-- --------------------------------------------------------------------------
do $$
declare h record;
begin
  update source_runs set finished_at = now() where feed = 'test:inflight';
  select * into h from feed_health_detail where feed = 'test:inflight';
  assert h.last_ok_at is not null and h.health = 'ok', format('a finished ok run is a success, got %s', h.health);
  assert h.running_since is null, 'nothing is running once the run has finished';
  raise notice 'PASS feed health: a finished ok run is a success';
end $$;

-- --------------------------------------------------------------------------
-- A run in progress does not mask the latest finished result
-- --------------------------------------------------------------------------
do $$
declare h record;
begin
  insert into source_runs (feed, started_at, finished_at, status)
    values ('test:inflight', now() + interval '1 second', now() + interval '2 seconds', 'partial');
  insert into source_runs (feed, started_at, status)
    values ('test:inflight', now() + interval '3 seconds', 'ok');
  select * into h from feed_health_detail where feed = 'test:inflight';
  assert h.latest_status = 'partial', format('latest finished status should be partial, got %s', h.latest_status);
  assert h.health = 'degraded', format('expected degraded, got %s', h.health);
  assert h.running_since is not null, 'the newer run is still in progress';
  raise notice 'PASS feed health: an in-progress run does not mask the latest finished result';
end $$;
