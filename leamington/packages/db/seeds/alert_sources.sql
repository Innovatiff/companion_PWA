-- Alert sources, as verified 2026-09-13 (see docs/SOURCE-VERIFICATION.md).
--
-- Jamaica is ACTIVE: it is the alerts launch country (decided 2026-09-13).
-- The other three stay inactive. Turning one on is a deliberate act.
--
-- IMPORTANT: the Alert Hub country feeds are GEOGRAPHIC FILTERS. Ingest must
-- filter every item by issuing source -- 100/100 alerts in the Honduras feed
-- were issued by Belize. See services/ingest/verify/alert-publishers.mjs.

insert into alert_sources (country, agency, agency_full, kind, feed_url,
                           hub_feed_url, hub_source_id, push_levels, include_area_desc,
                           poll_seconds, stale_after_seconds, active)
values
  -- VERIFIED: national CAP, en-JM, 739-vertex polygons. Cleanest of the four.
  -- 739-vertex polygons: precise enough to push both red and orange.
  ('JM','Meteorological Service Jamaica','Meteorological Service of Jamaica','cap',
   'https://alert.metservice.gov.jm/capfeed.php',
   'https://cap-alerts.s3.amazonaws.com/country-jm-lang-en/rss.xml','jm-jms-en',
   '{red,orange}', false, 900, 43200, true),

  -- VERIFIED: national CAP, es-MX, verbatim Spanish. Polygons are coarse
  -- (~6 vertices spanning multiple states) -- expect some over-alerting.
  -- DECIDED 2026-09-13: ~6-vertex state-shaped polygons, so push on the highest
  -- tier only, and always show SMN's own areaDesc so the coarse area is visible.
  ('MX','CONAGUA / SMN','Servicio Meteorologico Nacional de Mexico','cap',
   'https://smn.conagua.gob.mx/tools/PHP/feedsmn/cap.php',
   'https://cap-alerts.s3.amazonaws.com/country-mx-lang-en/rss.xml','mx-smn-es',
   '{red}', true, 900, 43200, false),

  -- NO CAP FOUND (live 2026-09 and in the 2023 registry). Step-3 scrape.
  -- URL unconfirmed: the site was unreachable during verification.
  ('HN','COPECO','Comision Permanente de Contingencias (met: CENAOS)','scrape',
   'https://cenaos.copeco.gob.hn/', null, null, '{red,orange}', true, 900, 43200, false),

  -- NO CAP FOUND. Step-3 scrape. URL unconfirmed.
  ('GT','INSIVUMEH / CONRED','Instituto Nacional de Sismologia, Vulcanologia, Meteorologia e Hidrologia','scrape',
   'https://www.insivumeh.gob.gt/', null, null, '{red,orange}', true, 900, 43200, false)
on conflict (country, agency, kind) do nothing;
