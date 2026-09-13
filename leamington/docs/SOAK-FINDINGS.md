# Ingest soak — findings

**Run:** 2026-09-13, compressed soak (cycles of all five feeds with staleness
checks between), not a 7-day run. See *Why not 7 days* below.

## What the soak proved works

| Behaviour | Evidence |
| --- | --- |
| Jamaica CAP ingest | 3/3 and 5/5 cycles `ok` against the live feed |
| Deduplication | 16 alerts stored, 16 distinct; repeat cycles wrote **0** new rows |
| Polygon matching | 11 alerts with geometry, 6 matched ≥1 client, max 3 clients on one alert |
| One-per-day | 7 notifications, 7 distinct `(client, local_date)` |
| Push gating | yellow logged `alert.no_push`; orange/red queued |
| Owner alerting | opened on silence, **auto-resolved** when `alerts:JM` recovered |
| Failure is not silence | fx/forecast/lottery recorded `status=error`, never `ok` with 0 rows |

Polygon matching discriminates geographically on real data: one storm matched
Montego Bay / Negril / Savanna-la-Mar (western), another Kingston / Half Way
Tree / Port Maria (eastern), a marine advisory matched Ocho Rios / Port Antonio
(north coast), and two purely offshore polygons matched nobody.

## Bugs the soak found

**1. A red alert was suppressed by an earlier orange one.** Both carry trigger
`weather_alert`, so the one-per-day rule saw equal priority and dropped the red.
A hurricane warning would have lost to a morning wind advisory.
→ Fixed in `0007_alert_severity_tiebreak.sql`: within weather alerts, severity
breaks the tie; red replaces a queued orange, yellow does not. Still one per day.
Regression test in `test/03_notification_priority_test.sql`.

**2. The log's `level` field was being overwritten** by the alert's colour, so
lines read `"level":"orange"` and any filter on `level=error` would silently
miss them. → Reserved log keys are now protected; the alert's level is
`alertLevel`.

**3. `static` reported healthy while holding no data.** It ran, found nothing
curated, and returned `ok` — so the admin dashboard would have shown
"static: ok" with zero holidays, school calendars or consulate records.
→ Now reports `partial`, and health shows `never_succeeded`.

**4. The first soak wasn't testing matching at all.** Every alert reported
`matched=0` because no Jamaican clients existed in the rebuilt database — a
pass that tested nothing. → The soak now seeds fixture clients and warns
explicitly if no alert matches any client.

## Known-blocked, not known-broken

These recorded `error` because this environment's egress policy blocks them.
That is INCONCLUSIVE about the sources themselves:

- **fx** — `frankfurter` and `exchangerate.host` both unreachable
- **forecast** — all three providers unreachable
- **lottery** — parsers deliberately unimplemented (see below)

## Lottery parsers: deliberately not written

The operator pages were never reachable, so no scraper was written against a
real page. Guessing at an unseen DOM produces a scraper that fails silently or,
worse, extracts the wrong numbers — and a wrong lottery number is worse than no
number. Each game therefore throws an explicit *not implemented* error rather
than returning zero draws, and `lottery_games.parser_implemented` records the
distinction for the admin dashboard.

Jamaica's draw cadence **is** built and verified: Cash Pot 6×/day, Pick 3 5×/day,
Lotto Wed & Sat, scheduled per game in `America/Jamaica` (no DST).

## Why not 7 days

This session runs in an ephemeral container that is reclaimed on inactivity, so
a genuine 7-day unattended run is not possible here. To run it for real:

```bash
cd leamington/services/ingest
npm install
DATABASE_URL=... OWNER_ALERT_WEBHOOK=... node src/index.mjs
```

It will register 21 jobs (alerts every 15 min, FX daily, forecast 6-hourly,
16 per-game lottery slots, static weekly, staleness every 5 min).

What a real 7-day run should be expected to surface, and what to watch:

- **A scraper that fails on a weekend** — watch `feed_health_detail.health`
  flipping to `stale` on Saturday/Sunday only.
- **A wrong lottery draw time** — watch for runs that consistently find no new
  draw at a scheduled slot.
- **An API rate-limiting under real cadence** — watch `source_runs.http_status`
  for 429s once forecast runs against all four countries.
- **Alert Hub carrying a foreign source** — `verify/alert-publishers.mjs` runs
  daily in CI for exactly this.
