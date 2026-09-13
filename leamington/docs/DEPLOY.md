# Deploying services/ingest

**Status: prepared, not deployed.** This session cannot reach `railway.app` (or
any host) — the container's egress policy allows only GitHub, npm and AWS S3 —
and deploying would need your account credentials, which I neither have nor
should hold. Everything below is ready to run; the deploy itself is yours.

## Why not Vercel cron

Alerts poll every 15 minutes — **96 runs/day** — and lottery scrapes are
long-running. Vercel's cron and serverless execution limits fit that badly, and
the scheduler is a long-lived process holding a Postgres pool. Railway, Fly, or
a small VPS running the container is the right shape.

## Railway: set the Root Directory first

**This repo is a monorepo and the service is not at the repo root.** Railway
must be told where the service lives, or its auto-detection (Railpack) inspects
the repository root, finds no `package.json`, and fails with:

```
Script start.sh not found
Railpack could not determine how to build the app.
```

That error means the Dockerfile was never read. `railway.json` is not read
either, because Railway looks for it in the root directory.

| Setting | Value |
| --- | --- |
| **Root Directory** | `leamington/services/ingest` |
| Branch | the branch carrying the work (not `main` unless it has been merged) |
| Builder | leave to `railway.json` — it selects `DOCKERFILE` |

With Root Directory set, Railway finds `Dockerfile` and `railway.json` beside
each other and builds the image. Nothing in the repo needs to change.

## Railway

```bash
railway login
railway init
railway up            # builds services/ingest/Dockerfile
```

Set these in the service (see `.env.example`):

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | **yes** | Supabase connection string |
| `OWNER_ALERT_WEBHOOK` | **yes** | Without it, staleness is logged and nobody is paged |
| `PORT` | no | Enables `/health`; Railway sets it automatically |
| `OPENWEATHER_KEY`, `WEATHERAPI_KEY` | no | Forecast falls to fewer providers without them |
| `ALERT_FETCH_LIMIT` | no | Default 25 documents per run |

`railway.json` already sets the healthcheck to `/health` and restart-on-failure.

### Build reproducibility

`services/ingest/package-lock.json` is committed and the image builds with
`npm ci` against it. The `COPY` has **no glob** on the lockfile: if it goes
missing the build fails loudly rather than silently falling back to an unpinned
`npm install`, and `npm ci` fails if the lock and `package.json` have drifted.

## Any VPS

```bash
docker build -t leamington-ingest services/ingest
docker run -d --restart=always \
  -e DATABASE_URL=... -e OWNER_ALERT_WEBHOOK=... -p 3000:3000 \
  leamington-ingest
```

## Before first run

```bash
cd packages/db
./test/run-migrations.sh    # 0001..0011
psql -f seeds/alert_sources.sql "$DATABASE_URL"
psql -f seeds/municipalities_jm.sql "$DATABASE_URL"
psql -f seeds/lottery_games.sql "$DATABASE_URL"
psql -f seeds/feed_expectations.sql "$DATABASE_URL"
```

Only `alerts:JM` is `active`. Turning on another country is a deliberate act.

## The health endpoint is not a liveness check

`/health` returns **503** when an alerts feed has gone quiet, and `degraded`
when any other feed has. A process that is running while every feed is dead is
exactly the failure this system exists to catch, so a green healthcheck means
the data is current — not that node is alive. If the database is unreachable it
returns `status: "unknown"`, never `ok`.

## The 7-day soak

Once deployed, leave it alone for a week, then check:

```sql
select * from feed_health_detail order by feed;
select feed, status, count(*), max(started_at)
  from source_runs where started_at > now() - interval '7 days'
 group by feed, status order by feed;
select * from owner_alerts order by opened_at desc;
```

What to expect, per `SOAK-FINDINGS.md`:

- **A scraper failing on a weekend** — `health` flipping to `stale` only on
  Sat/Sun.
- **A wrong lottery draw time** — a scheduled slot that consistently finds no
  new draw.
- **Rate limiting under real cadence** — `source_runs.http_status` 429s once
  forecast runs against all four countries.
- **Alert Hub carrying a foreign source** — the daily CI publisher check fails.

Report back with those three queries and I can work the failures.
