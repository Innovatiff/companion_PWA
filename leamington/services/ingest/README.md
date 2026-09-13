# services/ingest

Scheduled jobs that pull from external sources and write to our Postgres.

**Client apps never call external APIs.** Everything the PWA reads was written
here first. That is a performance requirement (bad wifi) and a cost requirement
(API quota).

## Status

Only `verify/` is built. Per CLAUDE.md, feeds are verified before UI is built on
top of them; see `docs/SOURCE-VERIFICATION.md` for what came back.

```bash
node verify/run.mjs                      # probe every source
node verify/run.mjs --category football   # the open go/no-go
node verify/alert-publishers.mjs          # who really publishes each country feed
```

`run.mjs` exits non-zero if any probed source fails, so it can gate CI.

## Cadence, once built

| Feed | Interval |
| --- | --- |
| FX | daily |
| Sports | hourly on match days |
| Forecast | every 6h, three providers, store all three |
| **Alerts** | **every 15 min, single authoritative source per country** |
| Lottery | per game, off actual draw times (Cash Pot is 6x/day) |
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
