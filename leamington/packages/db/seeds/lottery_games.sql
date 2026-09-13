-- Lottery games and their published draw cadence.
--
-- Verified 2026-09-13 against each operator's own site. The parsers in
-- services/ingest/src/feeds/lottery/ are built against real responses saved in
-- services/ingest/test/fixtures/lottery/ (README there lists URLs and dates).
--
-- parser_implemented = true, active = true ONLY where a parser is confirmed
-- against a real response. results_url is the page or endpoint that parser reads.
--
-- This seed already ran in production with `do nothing`; it now `do update`s the
-- schedule, url, parser flag and active flag so re-running applies corrections.
-- Rows that turned out to name the wrong operator or a game the operator does
-- not run are kept (results may reference them) but switched off.

insert into lottery_games (country, operator, name, draw_times_local, draw_weekdays, timezone, results_url, parser_implemented, active)
values
  -- Jamaica -- Supreme Ventures. No DST (UTC-05:00 all year).
  -- Schedule: supremeventures.com/game/cash-pot, /game/pick-3, /game/lotto
  -- ("every day except Christmas Day and Good Friday"). Source: the operator's
  -- results API behind its site widget.
  ('JM','Supreme Ventures','Cash Pot',
   '{08:30,10:30,13:00,15:00,17:00,20:25}'::time[], null, 'America/Jamaica',
   'https://test-results.supremeventures.com/public/game/result/gameId/1/no/12', true, true),
  ('JM','Supreme Ventures','Pick 3',
   '{08:30,10:30,13:00,17:00,20:25}'::time[], null, 'America/Jamaica',
   'https://test-results.supremeventures.com/public/game/result/gameId/7/no/10', true, true),
  ('JM','Supreme Ventures','Lotto',
   '{20:25}'::time[], '{3,6}'::smallint[], 'America/Jamaica',
   'https://test-results.supremeventures.com/public/game/result/gameId/5/no/4', true, true),

  -- Mexico -- Lotería Nacional (pronosticos.gob.mx redirects here). Mexico City
  -- has had no DST since 2022. Schedule: loterianacional.gob.mx/Melate/Melate
  -- ("miércoles, viernes y domingos ... a las 21:00 h"), /Chispazo/Chispazo
  -- (15:00 and 21:00 daily), /Tris/Tris (13:00, 15:00, 17:00, 19:00, 21:00).
  ('MX','Lotería Nacional','Melate',
   '{21:00}'::time[], '{0,3,5}'::smallint[], 'America/Mexico_City',
   'https://www.loterianacional.gob.mx/Melate/Resultados', true, true),
  ('MX','Lotería Nacional','Chispazo',
   '{15:00,21:00}'::time[], null, 'America/Mexico_City',
   'https://www.loterianacional.gob.mx/Chispazo/Resultados', true, true),
  ('MX','Lotería Nacional','Tris',
   '{13:00,15:00,17:00,19:00,21:00}'::time[], null, 'America/Mexico_City',
   'https://www.loterianacional.gob.mx/Tris/Resultados', true, true),
  -- Superseded: the operator is Lotería Nacional, and Melate draws at 21:00 on
  -- Wed/Fri/Sun, not 20:30 Wed/Sat.
  ('MX','Pronósticos','Melate',
   '{21:00}'::time[], '{0,3,5}'::smallint[], 'America/Mexico_City',
   'https://www.loterianacional.gob.mx/Melate/Resultados', false, false),

  -- Honduras -- LOTO Honduras (loto.hn). No DST. Schedule: loto.hn/?pag=diaria,
  -- ?pag=juga3 (11:00, 15:00, 21:00, every day) and ?pag=super_premio
  -- (Wednesday and Saturday, 21:00). Source: the operator's /api/ endpoints.
  ('HN','Loto Honduras','La Diaria',
   '{11:00,15:00,21:00}'::time[], null, 'America/Tegucigalpa',
   'https://loto.hn/?pag=diaria', true, true),
  ('HN','Loto Honduras','Jugá 3',
   '{11:00,15:00,21:00}'::time[], null, 'America/Tegucigalpa',
   'https://loto.hn/?pag=juga3', true, true),
  ('HN','Loto Honduras','Super Premio',
   '{21:00}'::time[], '{3,6}'::smallint[], 'America/Tegucigalpa',
   'https://loto.hn/?pag=super_premio', true, true),
  -- Superseded: loteriahonduras.com does not resolve; the operator is LOTO
  -- Honduras and its game is "La Diaria".
  ('HN','Lotería Electrónica','Diaria',
   '{11:00,15:00,21:00}'::time[], null, 'America/Tegucigalpa',
   'https://loto.hn/?pag=diaria', false, false),

  -- Guatemala -- Lotería Santa Lucía (Benemérito Comité Pro Ciegos y Sordos).
  -- No DST. NO DRAW TIME IS PUBLISHED, so draw_times_local is empty: these games
  -- get no cron of their own and are checked on every lottery run.
  -- Schedule: prociegosysordos.org.gt/DivisionLoteriaSantaLucia.php "Calendario
  -- 2026" and /resultados/: Ordinario weekly on Saturday (30/12/2026 is a
  -- Wednesday); Extraordinario about monthly, usually Saturday (No. 413 was Sunday
  -- 19/07/2026).
  ('GT','Lotería Santa Lucía','Sorteo Ordinario',
   '{}'::time[], '{6}'::smallint[], 'America/Guatemala',
   'https://prociegosysordos.org.gt/resultados/', true, true),
  ('GT','Lotería Santa Lucía','Sorteo Extraordinario',
   '{}'::time[], '{0,6}'::smallint[], 'America/Guatemala',
   'https://prociegosysordos.org.gt/resultados/', true, true),
  -- Superseded: loteriasantalucia.com does not resolve and the operator runs no
  -- game called "Lotto".
  ('GT','Lotería Santa Lucía','Lotto',
   '{}'::time[], null, 'America/Guatemala',
   'https://prociegosysordos.org.gt/resultados/', false, false)
on conflict (country, operator, name) do update
  set draw_times_local   = excluded.draw_times_local,
      draw_weekdays      = excluded.draw_weekdays,
      timezone           = excluded.timezone,
      results_url        = excluded.results_url,
      parser_implemented = excluded.parser_implemented,
      active             = excluded.active;
