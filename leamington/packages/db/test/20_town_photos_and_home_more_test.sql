-- home_more builds from real data only: watched towns' forecast, warnings for
-- their towns with when they were checked, the next match while fixtures are
-- current, the paid period, push status, school calendar for parents, and the
-- hometown photo only when stored. Uses the Jamaican client from test 13
-- (ZECTJM23), with the clock pinned at 2026-09-13 14:00 UTC.
\set ON_ERROR_STOP on

do $$
declare x jsonb; v_client uuid := '99990000-0000-4000-8000-0000000000b1';
begin
  x := app.home_more(v_client, '2026-09-13 14:00:00+00');
  assert x->'home_photo' = 'null'::jsonb, 'no photo stored yet';
  assert exists (select 1 from jsonb_array_elements(x->'watch_weather') w where w->>'name' = 'Section Watch' and w->'today'->>'temp' = '26–31°'),
    format('watched town with today''s forecast: %s', x->'watch_weather');
  assert x->'alerts'->>'state' = 'current' and x->'alerts'->'here'->0->>'event' = 'Flash Flood Warning'
     and x->'alerts'->>'valid_until' is not null, format('%s', x->'alerts');
  assert x->'next_match' <> 'null'::jsonb and x->>'football_valid_until' is not null, format('%s', x->'next_match');
  assert x->'plan' = 'null'::jsonb, 'no paid period, no plan card';
  assert (x->>'push_subscriptions')::int = 0;
  assert x->'school_next' = 'null'::jsonb, 'not a parent';

  -- Later the same day the fixtures feed is quiet and the warnings check is old.
  x := app.home_more(v_client, '2026-09-13 20:00:00+00');
  assert x->'next_match' = 'null'::jsonb and x->'league_today' = 'null'::jsonb, 'a quiet fixtures feed hides the schedule';
  assert x->'alerts'->>'state' = 'stale' and x->'alerts'->'here' = 'null'::jsonb, format('a stale check lists no warnings: %s', x->'alerts');
  assert (x->'alerts'->>'valid_until')::timestamptz > '2026-09-13 20:00:00+00',
    'the stale message is not already expired when shown (0035)';

  insert into subscriptions (client_id, period_start, period_end, paid_at, kind, affiliate_id)
  select id, date '2026-09-01', date '2027-03-01', now(), 'sale', affiliate_id from clients where id = v_client
  on conflict (client_id, period_start) where voided_at is null do nothing;
  update clients set has_kids = true where id = v_client;
  insert into school_calendar (country, school_year, event_name, start_date, end_date, verified_at)
  values ('JM', '2026-2027', 'Mid-term break', '2026-10-22', '2026-10-23', '2026-09-13') on conflict do nothing;
  insert into municipality_photos (municipality_id, content_type, bytes, width, height, sha256, file_title, source_page_url, article_url, author, license, license_url)
  select municipality_id, 'image/jpeg', decode('ffd8ffe0', 'hex'), 640, 427, 'test', 'File:Test.jpg',
         'https://commons.wikimedia.org/wiki/File:Test.jpg', 'https://en.wikipedia.org/wiki/Test', 'A. Photographer', 'CC BY-SA 4.0',
         'https://creativecommons.org/licenses/by-sa/4.0/'
    from clients where id = v_client;

  x := app.home_more(v_client, '2026-09-13 14:00:00+00');
  assert x->'plan'->>'period_end' = '2027-03-01', format('%s', x->'plan');
  assert x->'school_next'->>'event_name' = 'Mid-term break', format('%s', x->'school_next');
  assert x->'home_photo'->>'author' = 'A. Photographer' and x->'home_photo'->>'license' = 'CC BY-SA 4.0', format('%s', x->'home_photo');

  -- A country whose warnings we do not read gets no alerts section on home.
  assert app.home_more('99990000-0000-4000-8000-0000000000b2', '2026-09-13 14:00:00+00')->'alerts' = 'null'::jsonb;
  raise notice 'PASS home more: every section is real data with its validity, or absent; photos carry their credit';
end $$;
