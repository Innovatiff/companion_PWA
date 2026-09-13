-- Alert sources, as verified 2026-09-13 (see docs/SOURCE-VERIFICATION.md).
--
-- `active` is false everywhere: alerts launch in ONE country only, and turning
-- one on is a deliberate act, not a deploy side effect.
--
-- IMPORTANT: the Alert Hub country feeds are GEOGRAPHIC FILTERS. Ingest must
-- filter every item by issuing source -- 100/100 alerts in the Honduras feed
-- were issued by Belize. See services/ingest/verify/alert-publishers.mjs.

insert into alert_sources (country, agency, agency_full, kind, feed_url, poll_seconds, stale_after_seconds, active)
values
  -- VERIFIED: national CAP, en-JM, 739-vertex polygons. Cleanest of the four.
  ('JM','Meteorological Service Jamaica','Meteorological Service of Jamaica','cap',
   'https://alert.metservice.gov.jm/capfeed.php', 900, 43200, false),

  -- VERIFIED: national CAP, es-MX, verbatim Spanish. Polygons are coarse
  -- (~6 vertices spanning multiple states) -- expect some over-alerting.
  ('MX','CONAGUA / SMN','Servicio Meteorologico Nacional de Mexico','cap',
   'https://smn.conagua.gob.mx/tools/PHP/feedsmn/cap.php', 900, 43200, false),

  -- NO CAP FOUND (live 2026-09 and in the 2023 registry). Step-3 scrape.
  -- URL unconfirmed: the site was unreachable during verification.
  ('HN','COPECO','Comision Permanente de Contingencias (met: CENAOS)','scrape',
   'https://cenaos.copeco.gob.hn/', 900, 43200, false),

  -- NO CAP FOUND. Step-3 scrape. URL unconfirmed.
  ('GT','INSIVUMEH / CONRED','Instituto Nacional de Sismologia, Vulcanologia, Meteorologia e Hidrologia','scrape',
   'https://www.insivumeh.gob.gt/', 900, 43200, false)
on conflict (country, agency, kind) do nothing;
