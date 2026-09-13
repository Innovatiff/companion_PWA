
cat > packages/db/seeds/alert_sources.sql <<'SQL'
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
  ('MX','CONAGUA / SMN','Servicio Meteorológico Nacional de México','cap',
   'https://smn.conagua.gob.mx/tools/PHP/feedsmn/cap.php', 900, 43200, false),

  -- NO CAP FOUND (live 2026-09 and in the 2023 registry). Step-3 scrape.
  -- URL unconfirmed: the site was unreachable during verification.
  ('HN','COPECO','Comisión Permanente de Contingencias (met: CENAOS)','scrape',
   'https://cenaos.copeco.gob.hn/', 900, 43200, false),

  -- NO CAP FOUND. Step-3 scrape. URL unconfirmed.
  ('GT','INSIVUMEH / CONRED','Instituto Nacional de Sismología, Vulcanología, Meteorología e Hidrología','scrape',
   'https://www.insivumeh.gob.gt/', 900, 43200, false)
on conflict (country, agency, kind) do nothing;
SQL

# --- ingest package ---
cat > services/ingest/package.json <<'JSON'
{ "name": "@leamington/ingest", "version": "0.1.0", "private": true, "type": "module",
  "scripts": { "verify": "node verify/run.mjs", "verify:publishers": "node verify/alert-publishers.mjs" } }
JSON

cat > services/ingest/README.md <<'MD'
# services/ingest

Scheduled jobs that pull from external sources and write to our Postgres.

**Client apps never call external APIs.** Everything the PWA reads was written
here first. That is a performance requirement (bad wifi) and a cost requirement
(API quota).

## Status

Only `verify/` is built. Per CLAUDE.md, the feeds are verified before the UI is
built on top of them; see `docs/SOURCE-VERIFICATION.md` for what came back.

```bash
node verify/run.mjs                     # probe every source
node verify/run.mjs --category football  # the open go/no-go
node verify/alert-publishers.mjs         # who really publishes each country feed
```

`run.mjs` exits non-zero if any probed source fails, so it can gate CI.

## Cadence, once built

| Feed | Interval |
| --- | --- |
| FX | daily |
| Sports | hourly on match days |
| Forecast | every 6h, three providers, store all three |
| **Alerts** | **every 15 min, single authoritative source per country** |
| Lottery | per game, off actual draw times (Cash Pot is 6×/day) |
| Static | weekly or manual, each row carrying `verified_at` |

## Two traps found during verification

1. **Alert Hub country feeds are geographic filters, not national sources.**
   100/100 of the most recent alerts in the `country-hn` feed were issued by
   **Belize**. Always filter by issuing source.
2. **Take alerts in the issuing agency's own language.** `mx-smn-es` is Spanish;
   the hub's country feeds are `-lang-en`, implying a translation step. Agency
   wording is passed through verbatim and never paraphrased.

## Staleness

Every run writes to `source_runs`. `alert_source_staleness` flags a source silent
longer than its threshold (12h default). **The owner is paged off this** — silent
scraper failure is the worst outcome here.
