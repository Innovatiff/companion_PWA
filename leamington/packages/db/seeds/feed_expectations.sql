-- What each feed is expected to do, so the admin dashboard can tell a quiet
-- feed from a dead one. A feed missing from here is invisible to health checks.
insert into feed_expectations (feed, label, expected_interval, grace, active) values
  ('alerts:JM',   'Jamaica weather alerts (CAP)', interval '15 minutes', interval '10 minutes', true),
  ('alerts:MX',   'Mexico weather alerts (CAP)',  interval '15 minutes', interval '10 minutes', false),
  ('alerts:HN',   'Honduras weather alerts',      interval '15 minutes', interval '10 minutes', false),
  ('alerts:GT',   'Guatemala weather alerts',     interval '15 minutes', interval '10 minutes', false),
  ('fx',          'FX reference rates',           interval '1 day',      interval '6 hours',    true),
  ('forecast',    'Forecast (3 providers)',       interval '6 hours',    interval '1 hour',     true),
  ('current',     'Current conditions (3 providers)', interval '30 minutes', interval '15 minutes', true),
  ('hourly',      'Hourly outlook, Leamington and Windsor (3 providers)', interval '2 hours', interval '1 hour', true),
  ('air',         'Air quality, Leamington and Windsor (2 providers)',    interval '1 hour',  interval '30 minutes', true),
  ('lottery',     'Lottery draw results',         interval '1 hour',     interval '30 minutes', true),
  ('static',      'Static records',               interval '7 days',     interval '1 day',      true),
  ('fixtures',    'Football fixtures',            interval '1 hour',     interval '20 minutes', true),
  -- Push delivery: if the sender stops, alerts stop reaching phones.
  ('notify:send', 'Push delivery',                interval '1 minute',   interval '10 minutes', true),
  ('notify:plan', 'Engagement planner',           interval '15 minutes', interval '15 minutes', true),
  -- Pictures: not safety-critical, but a quiet job still shows.
  ('photos',      'Hometown photos',              interval '1 day',      interval '1 day',      true),
  ('crests',      'Team crests',                  interval '1 day',      interval '1 day',      true),
  ('news',        'News (national and regional outlets)', interval '30 minutes', interval '30 minutes', true),
  ('videos',      'Football videos (YouTube channel feeds)', interval '1 hour', interval '1 hour', true)
on conflict (feed) do update
  set label = excluded.label, expected_interval = excluded.expected_interval,
      grace = excluded.grace, active = excluded.active;
