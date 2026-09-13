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

## Before first run — migrating a REAL database

> **Never run `packages/db/test/run-migrations.sh` against Supabase.**
> It is local-only. It `DROP DATABASE`s and recreates a throwaway database, and
> it installs stub `auth.uid()` / `auth.role()` functions. Against Supabase
> those stubs would **overwrite the real auth helpers that every RLS policy in
> your project depends on**. An earlier version of this document told you to run
> it against `$DATABASE_URL`. That was wrong.

Use `packages/db/migrate.sh`, which applies migrations to the database the URL
already points at. It never drops anything, never touches `auth`, records each
file in a `schema_migrations` ledger, runs each migration in its own
transaction, and stops on the first failure — so a failed run leaves that file
fully rolled back rather than half applied.

All three steps run from the repo root via `scripts/apply-migrations.sh`, which
reads `DATABASE_URL` from the environment — no connection details are hardcoded:

```bash
export DATABASE_URL='postgresql://...pooler.supabase.com:6543/postgres?sslmode=no-verify'
./scripts/apply-migrations.sh --preflight   # read-only check
./scripts/apply-migrations.sh --dry-run     # list pending migrations
./scripts/apply-migrations.sh               # apply them
```

`test/run-migrations.sh` now **refuses** to run when `DATABASE_URL` or `PGHOST`
points anywhere non-local, so the local-only script can no longer be aimed at a
managed database by accident.

**1. Check the instance first (read-only, changes nothing):**

```bash
./scripts/apply-migrations.sh --preflight
```

It reports the connection role and whether it is a superuser, which required
extensions are installed **and in which schema**, whether `postgis` is available
to install, whether the `extensions` and `auth` schemas exist, and whether
`auth.uid()` looks like Supabase's or like our local stub.

The schema check matters: the migrations call `extensions.ST_SetSRID()`. If
PostGIS is installed in `public` instead of `extensions`, then
`CREATE EXTENSION IF NOT EXISTS postgis` is a silent no-op and every
`extensions.*` call fails afterwards.

**2. Enable PostGIS if the preflight says it is missing.** On Supabase:
Dashboard → Database → Extensions → `postgis` → enable. Supabase installs it
into `extensions`, which is what the migrations expect. Enabling from the
dashboard avoids relying on the connection role's `CREATE EXTENSION` rights.

**3. Dry run, then apply:**

```bash
./scripts/apply-migrations.sh --dry-run   # lists pending files
./scripts/apply-migrations.sh             # applies them
```

Safe to re-run: already-applied migrations are skipped.

**4. Load the seeds:**

```bash
for f in packages/db/seeds/*.sql; do psql "$DATABASE_URL" -f "$f"; done
```

`feed_expectations.sql` is not optional — without it nothing is monitored, and
`/health` reports `unconfigured`.

Only `alerts:JM` is `active`. Turning on another country is a deliberate act.

### PostGIS schema placement — verified, no change needed

Supabase installs PostGIS into `extensions`, not `public`. The migrations are
**fully schema-qualified** — every type (`extensions.geography`), every function
(`extensions.ST_SetSRID`, `extensions.ST_Covers`, …) and every cast. There are no
unqualified references, so **no `search_path` adjustment is required**.

The only implicit resolution is the GiST indexes on geography columns, which use
the *default* operator class. That lookup is by type, not by `search_path`.
Verified empirically against PostGIS installed in `extensions` with
`search_path = public`: `gist_geography_ops` resolves and all 11 migrations apply.

## What /health returns at each stage

| Stage | HTTP | `status` | Meaning |
| --- | --- | --- | --- |
| No `DATABASE_URL` | 503 | `misconfigured` | Fatal; retrying will not help |
| DB unreachable | 503 | `unknown` | We cannot tell — never reported as healthy |
| Migrated, **not seeded** | 503 | `unconfigured` | `feed_expectations` empty: nothing is monitored |
| Seeded, no feed has run | 503 | `critical` | `alerts:JM` has never run |
| After a successful alerts run | 200 | `degraded` | Alerts current; FX/forecast/lottery still pending |
| All feeds current | 200 | `ok` | — |

**503 is the expected response until the first `alerts:JM` run completes.** That
is correct, not a failed deploy: alerts are the feed a person's safety depends
on, so the check fails while our copy of it is not current. Expect it to flip to
`degraded` within 15 minutes of a healthy start, and to stay `degraded` until FX,
forecast and lottery are also running.

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
