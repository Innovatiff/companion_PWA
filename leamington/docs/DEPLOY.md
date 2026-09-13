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

## Railway: no configuration needed

The `Dockerfile`, `.dockerignore` and `railway.json` live at the **repository
root**, not beside the service. That is deliberate.

Railway's build detection runs in the repository root unless a Root Directory is
configured, and depending on that setting cost five failed deploys. Every one
reported only:

```
Script start.sh not found
Railpack could not determine how to build the app.

The app contents that Railpack analyzed contains:
  ./
  ├── .github/
  ├── leamington/
  ├── .gitignore
  └── README.md
```

That message means detection never found anything to build — it is not a build
failure, and the Dockerfile was never read. The file listing in it is the giveaway:
it shows the repository root, so Root Directory was not in effect.

With the Dockerfile at the root, Railway finds it with **no settings at all**.
The build context is the repo root and every `COPY` is repo-root relative, so
`railway.json` is read too and selects the Dockerfile builder plus the `/health`
check.

If you would rather scope the service (Fly, plain Docker, a second Railway
service), set Root Directory to `leamington/services/ingest` and add a Dockerfile
there — but keep only one, or the two will drift.

## Railway

```bash
railway login
railway init
railway up            # builds the root Dockerfile
```

Set these in the service (see `.env.example`):

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | **yes** | Supabase connection string |
| `OWNER_ALERT_WEBHOOK` | **yes** | Without it, staleness is logged and nobody is paged |
| `PORT` | no | Enables `/health`; Railway sets it automatically |
| `OPENWEATHER_KEY`, `WEATHERAPI_KEY` | no | Forecast falls to fewer providers without them |
| `ALERT_FETCH_LIMIT` | no | Default 25 documents per run |

`railway.json` (at the repo root) already sets the healthcheck to `/health` and
restart-on-failure.

**Remember to apply staged changes.** Railway holds dashboard edits behind an
"Apply N changes" banner; until you press Deploy, builds run with the *old*
configuration. One failed deploy here was a build against stale settings.

### Build reproducibility

`leamington/services/ingest/package-lock.json` is committed and the image builds with
`npm ci` against it. The `COPY` has **no glob** on the lockfile: if it goes
missing the build fails loudly rather than silently falling back to an unpinned
`npm install`, and `npm ci` fails if the lock and `package.json` have drifted.

## Any VPS

```bash
docker build -t leamington-ingest .   # from the repo root
docker run -d --restart=always \
  -e DATABASE_URL=... -e OWNER_ALERT_WEBHOOK=... -p 3000:3000 \
  leamington-ingest
```

## Startup states

The container distinguishes three failures that used to look identical:

| State | Meaning | Behaviour |
| --- | --- | --- |
| `misconfigured` | no `DATABASE_URL` | one legible message, **exit 1** — retrying cannot help |
| `unreachable` | configured, database did not answer | health endpoint stays up reporting 503 with the reason, retries every 15s |
| `unmigrated` | connected, schema absent | prints the exact migration command, retries |
| `ready` | connected and migrated | registers 17 jobs and serves `/health` |

Previously a missing `DATABASE_URL` surfaced as
`AggregateError [ECONNREFUSED] ... 127.0.0.1:5432` repeated in a crash loop —
`pg` defaults to localhost when given nothing, so the container was refusing a
connection to itself and the real cause (an unset variable) had to be inferred
from a network error.

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
