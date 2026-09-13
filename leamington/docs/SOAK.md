# Ingest soak — running state

The unattended soak of `services/ingest` on Railway. This file holds what a
report needs, so producing one does not depend on any session staying open.

## Current soak

- **Started:** 2026-09-13 19:22 UTC, on commit `9c83ec7`, once `alerts:JM` had
  stopped flapping.
- **Rule:** no intervention unless something is destructive.
- **Deploys restart the window.** A push to `main` redeploys the service. The
  football work was pushed after the start, and the fixtures feed will be
  pushed again. Measure the window from the **latest successful deployment**,
  not the original start.

## Producing the report

```bash
# 1. Window start = the newest SUCCESS deployment
railway deployment list --json \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const d=JSON.parse(s).find(x=>x.status==="SUCCESS");console.log(d.createdAt, d.meta?.commitHash?.slice(0,7))})'

# 2. The report, read-only
psql "$DATABASE_URL" -v since='<createdAt from step 1>' -f leamington/packages/db/soak-report.sql

# 3. What the service says about itself
curl -s https://companionpwa-production.up.railway.app/health
railway logs --deployment --lines 500 --json   # scan level=error, job.threw, owner.alert.delivery_failed
```

Report on three things:

- **What broke:** runs that were not ok, errors, unfinished runs, HTTP 429s, and
  failures only on weekends.
- **What went stale:** owner alerts opened, re-sent or resolved.
- **What fired:** Telegram deliveries, delivered versus failed.

Keep INCONCLUSIVE distinct from negative throughout.

## What the first day should contain

| Feed | Expected | Notes |
| --- | --- | --- |
| `alerts:JM` | `ok` every 15 min | `confirmed_empty` while Jamaica has no active alerts |
| `fx` | first run 06:15 Toronto | "has never run" is re-sent every 6h until then |
| `static` | Mondays 05:30 Toronto | same |
| `lottery` | per draw time | same, until the first draw slot |
| `forecast` | every 6h, `partial` | no client municipalities exist, so no provider is contacted. Goes stale and pages every 6h until clients exist |
| `fixtures` | hourly at :05 UTC | `items` on match days, `confirmed_empty` on days none of the four leagues play |
