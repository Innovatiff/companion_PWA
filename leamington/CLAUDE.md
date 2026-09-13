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

Next.js for all three apps. Supabase (Postgres + RLS). TypeScript throughout.
Each app deploys separately from the monorepo.

- **All three apps: Pages Router with client runtime JS disabled**
  (`unstable_runtimeJS: false`), server-rendered HTML, inline CSS from
  `packages/shared/src/ui`, no Tailwind, no webfonts. Decided 2026-09-13: the
  App Router always ships the React and router runtime, and on 2 bars of metered
  prepaid data the payload is the product. The portals follow the same rule, as
  "no framework JS where avoidable".
- **Every screen follows `docs/DESIGN.md`.**

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

**Alert launch order (decided 2026-09-13, revised after verification):**

> **Jamaica → Mexico → Honduras → Guatemala**

CAP availability beats hazard exposure. Honduras-first would have meant
scraper-first with no polygons, which cannot satisfy the municipality-precision
rule. Prove the CAP path on Jamaica (`jm-jms-en`, 739-vertex polygons, English),
then Mexico, then take on the Honduras and Guatemala scrapes once the
architecture is proven and only the source is in question.

**The Alert Hub's per-country feeds are geographic filters, not national
sources.** 100/100 of the most recent alerts in the `country-hn` feed were
issued by Belize. Ingest filters every item by issuing source, and
`verify/alert-publishers.mjs` runs in CI so this cannot regress silently.

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

### Notifications — TWO separate queues

The one-per-day cap is an ENGAGEMENT rule. It was never meant for civil
protection alerts, and applying it to them drops the message that matters most.

**ALERT queue — uncapped, immediate.**

- Every **distinct CAP identifier** sends. Same-identifier resends do not.
- Never contends with engagement for a slot; an alert cannot consume the
  daily engagement notification and vice versa.
- The case this exists for:

  ```
  06:00  red hurricane warning      -> sends
  16:00  red, track shifted         -> MUST ALSO SEND
  ```

  The second message is the one that changes what a person does. A severity
  tiebreak is not enough — both are red.

**ENGAGEMENT queue — one per client per local day, at a fixed hour.**

Rotate the trigger: match day for his team, 30-day rate high, lottery.
Priority when several are eligible: match day > 30-day rate high > lottery.
Weather alerts are rejected from this queue outright.

**Over-sending engagement kills this permanently. Under-sending alerts is worse.**

### CAP message lifecycle

| msgType | Behaviour |
| --- | --- |
| `Alert` | new; send |
| `Update` | send; supersedes the messages it references |
| `Cancel` | send a cancellation; referenced messages become inactive |
| `Ack` / `Error` | ingest for the record; **never** surface to a person |

`expires` is honoured: an alert stops being active when it expires, even if no
Cancel ever arrives.

Feeds are **not ordered**. Lifecycle is applied in both directions — forward
(a new message to the alerts it references) and backward (a newly arrived alert
to Update/Cancel messages already holding a reference to it). Without the
backward pass, an Update ingested before the alert it supersedes leaves that
alert live forever.

> **A man believing a cancelled warning is still live is the mirror of a missed
> alert.** Both are SILENCE IS NEVER EVIDENCE failures.

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

## Standing rule: SILENCE IS NEVER EVIDENCE

**Absence of a signal is not a negative finding.** Any component that reports
absence MUST distinguish *confirmed absent* from *could not determine*.
`INCONCLUSIVE` is a required state and is never collapsed into a negative.

This applies to feeds, verification harnesses, and user-facing UI alike.

Three instances of this failure mode have already surfaced in this project:

| Where | The silence | What it was wrongly read as |
| --- | --- | --- |
| Verification harness | every provider unreachable | "NOT COVERED — redesign the home screen" |
| Alert Hub | `country-hn` is a geographic filter | "Honduras's national alert feed" |
| PWA (by design, prevented) | no alerts in our database | "you are safe" |

Concretely:

- A fetch that fails reports `INCONCLUSIVE`, never zero results.
- A feed returning zero rows is distinguished from a feed that did not answer.
  `source_runs.status` carries `error` for the second; a successful run with
  `records_written = 0` is a different fact.
- The UI never renders "no alerts", "no matches", or "all clear" on the basis of
  an empty query. It says when the data was last confirmed fresh, or it says
  nothing at all.
- Staleness monitoring exists precisely because a silent source and a calm
  source look identical from the database.

## Working agreements

- **Verify data sources before building UI on top of them.** A feature is only
  as real as its feed.
- Every ingested record carries provenance: where it came from, when it was
  fetched, when it was verified.
- Prefer showing **less** with confidence over **more** with false precision.
- This app is used by people making decisions about money, travel, and safety.
  Wrong-but-confident is worse than absent.
