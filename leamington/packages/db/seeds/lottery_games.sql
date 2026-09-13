-- Lottery games and their published draw cadence.
--
-- Jamaica times are VERIFIED against the operator's published schedule and are
-- the basis for per-game scheduling. Jamaica is UTC-05:00 year round (no DST),
-- so these map to cron without a DST correction.
--
-- parser_implemented is false everywhere: the operator pages were unreachable
-- during source verification, so no scraper was written against a real page.
-- Absence of results for these games means NOT BUILT, never "no draws".

insert into lottery_games (country, operator, name, draw_times_local, draw_weekdays, timezone, results_url, parser_implemented, active)
values
  ('JM','Supreme Ventures','Cash Pot',
   '{08:30,10:30,13:00,15:00,17:00,20:25}'::time[], null,'America/Jamaica',
   'https://supremeventures.com/results/', false, true),
  ('JM','Supreme Ventures','Pick 3',
   '{08:30,10:30,13:00,17:00,20:25}'::time[], null,'America/Jamaica',
   'https://supremeventures.com/results/', false, true),
  ('JM','Supreme Ventures','Lotto',
   '{20:25}'::time[], '{3,6}'::smallint[],'America/Jamaica',
   'https://supremeventures.com/results/', false, true),

  -- Cadence UNVERIFIED for the remaining countries: sites unreachable.
  ('MX','Pronósticos','Melate',   '{20:30}'::time[],'{3,6}'::smallint[],'America/Mexico_City',
   'https://www.pronosticos.gob.mx/', false, false),
  ('HN','Lotería Electrónica','Diaria', '{}'::time[], null,'America/Tegucigalpa',
   'https://loteriahonduras.com/', false, false),
  ('GT','Lotería Santa Lucía','Lotto', '{}'::time[], null,'America/Guatemala',
   'https://www.loteriasantalucia.com/', false, false)
on conflict (country, operator, name) do nothing;
