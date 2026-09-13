-- The four leagues v1 follows, with their API-Football ids (verified 2026-09-13).
-- current_season is filled in by the fixtures feed from the provider; it stays
-- null, meaning unknown, until then.
insert into leagues (country, name, source, source_league_id, active) values
  ('MX', 'Liga MX',                    'api-football', '262', true),
  ('HN', 'Liga Nacional de Honduras',  'api-football', '234', true),
  ('GT', 'Liga Nacional de Guatemala', 'api-football', '339', true),
  ('JM', 'Jamaica Premier League',     'api-football', '322', true)
on conflict (country, name) do update
  set source = excluded.source, source_league_id = excluded.source_league_id, active = excluded.active;
