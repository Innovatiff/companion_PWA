# Leamington — seasonal worker companion app

Monorepo. Three surfaces, one database.

---

## Business model

- **$20 per client per 6-month period.** Affiliate keeps $8, owner keeps $12.
- Affiliates register clients **in person**, generate a code, and install the PWA
  on the client's phone.
- **The code IS the account.** No email, no password, no SMS.
- Affiliates see only their own clients. Owner sees everything.

## Who this is for

Spanish-speaking agricultural and warehouse workers in Windsor-Essex, Ontario,
from **Honduras, Guatemala, Mexico and Jamaica**.

Design for the real device and the real network:

- Cheap Android phones.
- Poor wifi, 2 bars, metered prepaid data.
- **Spanish-first UI.** English for Jamaican users.

Two segments:

- `seasonal` — leaves each November.
- `settled` — year-round.

---

## Repo structure

```
leamington/
  apps/app/         PWA, client-facing
  apps/affiliate/   affiliate portal
  apps/admin/       owner portal
  packages/db/      schema + migrations, single source of truth
  packages/shared/  types, auth, code generation
  services/ingest/  scheduled jobs writing to our own DB
```

## Stack

Next.js (App Router) for all three apps. Supabase (Postgres + RLS).
TypeScript throughout. Tailwind. Each app deploys separately from the monorepo.

---

## Non-negotiable architecture rule

> **Client apps NEVER call external APIs.**
> `services/ingest` pulls on a schedule and writes to our Postgres.
> The PWA reads only from our DB.

This is a **performance** requirement (bad wifi) and a **cost** requirement
(API quota). There is no exception for "just this one small call".

---

## Country scope

Client volume order: **Mexico, Guatemala, Honduras, Jamaica.**

| Feature | Launch scope |
| --- | --- |
| Sports, FX, holidays, school calendars, consulates, lottery | **All four** |
| Weather **forecast** (non-alert) | **All four** — low risk |
| Weather **ALERTS** | **One country, alone**, through one full storm season |

Alerts are deliberately **not** launched in all four. One reliable pipeline
beats four half-working ones. See `docs/` for the source-verification findings
that determine which country goes first and why.

Intended order after the first country: Guatemala, Jamaica, Mexico —
**subject to the verification findings**, because a country without a
machine-readable feed is a fundamentally different (and more fragile) build
than one with CAP.

---

## Data sources and their rules

### FX (daily)

Frankfurter or exchangerate.host. Free, no key. CAD → MXN, HNL, GTQ, JMD.

Store **daily** so we can compute 30-day high/low and day-over-day direction.

- Label in the UI as **"tasa de referencia"** only.
- **Never** name a provider.
- **Never** rank providers, **never** predict, **never** advise.

### Sports (hourly on match days)

Liga MX, Liga Nacional de Honduras, Liga Nacional de Guatemala,
Jamaica Premier League.

Coverage of the three non-Mexican leagues decides whether this feature is
viable at all. Verify before building UI.

### Weather forecast (every 6h) — MULTI-SOURCE

Pull the same municipality from **three** free APIs: Open-Meteo (no key),
OpenWeather, WeatherAPI. **Store all three.**

- Display the **median** for temperature.
- Display the **consensus** for precipitation.
- Where they disagree materially, show a **range** rather than false precision.

### Weather alerts (every 15 min) — SINGLE AUTHORITATIVE SOURCE

**Do NOT cross-confirm alerts across commercial weather APIs.** They do not
issue alerts for these countries. Alerts come from the national authority only:

| Country | Authority |
| --- | --- |
| Honduras | COPECO (met: CENAOS) |
| Guatemala | INSIVUMEH (forecast) / CONRED (civil protection) |
| Mexico | CONAGUA / SMN |
| Jamaica | Meteorological Service / ODPEM |

**Before writing a scraper, check in this order:**

1. Does the agency publish **CAP** (Common Alerting Protocol)? If yes, use it —
   structured, geocoded, machine-readable.
2. Is the agency carried by the **WMO Severe Weather Information Centre** /
   IFRC Alert Hub? Aggregated official warnings, far better than scraping.
3. **Only if neither:** scrape, and treat it as fragile.

#### Alert rules — all of these are non-negotiable

- **Match by polygon, not by name.** Match alerts to clients using municipality
  **coordinates inside the alert polygon**. Department-level matching produces
  false positives — a man in a dry corner of Cortés does not need a Cortés alert.
- **Push only red/orange equivalents.** Yellow displays in-app with **no**
  notification. Rainy-season yellow alerts every third day train people to
  ignore everything.
- **Never rewrite, summarize, or AI-paraphrase agency wording.** Pass it through
  **verbatim**, with the agency name, the level, the place, the issue time, and
  a link to the source.
- **Never display "no alerts" as reassurance.** Absence in our app is not safety.
- **Staleness monitoring is part of the feature, not a nice-to-have.** Alert the
  OWNER if a source has not updated in 12h during storm season.
  **Silent scraper failure is the worst outcome here.**

### Static / slow (weekly or manual)

National holidays, national school calendars (**NOT** department-level — that
data does not exist as a feed), consulate info (address, hours, service costs,
required documents, booking link).

- Every static record carries a `verified_at` date, displayed in the UI as
  **"Verificado: 3 de marzo"**.
- **Do NOT** build consulate appointment booking or availability scraping.

### Lottery — v1

**Official draw results only.** Never odds, never predictions, never
"hot numbers", never a link to buy. **Results display only.**

| Country | Games |
| --- | --- |
| Honduras | Loto Honduras (Diaria, La Grande) |
| Guatemala | Lotería Santa Lucía / Lotto Guatemala |
| Mexico | Lotería Nacional / Pronósticos (Melate, Chispazo, Tris) |
| Jamaica | Supreme Ventures (Cash Pot, Lotto, Pick 2/3/4) |

These are almost certainly **scrapes, not APIs**. Verify source availability
before building.

Cash Pot draws **multiple times daily** — build ingest cadence around the
**actual draw times per game**, not a fixed interval.

Show the draw date and a `verified_at` on every result.
**A stale lottery number is worse than no number.**

---

## The PWA (`apps/app`)

**Login:** enter code. That's it. Recoverable on a new phone by re-entry.

**First-run setup** — the *user* does this, not the affiliate:
municipality picker, additional towns to watch, banks/pickup preference,
kids' ages if applicable, departure date if seasonal.

**Home screen — ONE screen that reads like a morning message, not a dashboard:**

```
Buenos días, {name}
{team} juega hoy 7pm
{municipality}: 28°, lluvia en la tarde
1 CAD = 18.51 HNL ↑  (más alto en 12 días)
Faltan 127 días
```

Settled users: replace the countdown with a user-set next-trip date.

**Sections:** fútbol, clima, tasa, feriados, calendario escolar, consulado,
emergencias, transporte local.

### Notifications — ONE per day maximum, at a fixed hour

Rotate the trigger: match day for his team, weather alert for his town,
30-day rate high, lottery.

**Priority when several are eligible on the same day:**

1. **Weather alert** — always wins.
2. **Match day** for the user's team.
3. Everything else (30-day rate high, lottery).

Lottery results are eligible for the daily push but **never** override a
weather alert or a match-day notification.

**Over-sending kills this permanently.**

### PWA requirements

Installable via Chrome "add to home screen", service worker, offline cache of
last-known data, aggressively light payloads. Assume 2 bars and metered prepaid
data.

---

## The affiliate portal (`apps/affiliate`) — four screens

Register client (name, country, department, team — **4 fields, 90 seconds**),
generate code, my clients, my earnings.

## The admin portal (`apps/admin`) — owner

Everything the affiliate portal has, across all affiliates, plus:
sales per affiliate (who is actually selling vs. who isn't), feed health
dashboard, alert delivery log, renewal pipeline.

---

## Database rules

RLS: affiliates read only rows where `affiliate_id` = their id. Owner role
reads all.

Store municipality as **name AND lat/lng**. Alert polygons are geographic and
**name matching fails on accents and duplicate place names**.

---

## Working agreements

- **Verify data sources before building UI on top of them.** A feature is only
  as real as its feed.
- Every ingested record carries provenance: where it came from, when it was
  fetched, when it was verified.
- Prefer showing **less** with confidence over **more** with false precision.
- This app is used by people making decisions about money, travel, and safety.
  Wrong-but-confident is worse than absent.
