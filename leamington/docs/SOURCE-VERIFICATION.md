# Source verification — findings

**Date:** 2026-09-13
**Status:** weather alerts **verified against live feeds**. Football, FX, forecast
and most lottery sources **not verified** — blocked by this environment's network
policy. See *Method and limits* before treating anything here as settled.

---

## TL;DR

1. **The launch plan is inverted.** Honduras — the chosen first country for
   alerts — is the *only* one of the four with **no national CAP feed**. Jamaica
   and Mexico both publish proper geocoded CAP today. Honduras and Guatemala
   would each require a scraper.
2. **There is a trap in the obvious Honduras feed.** The Alert Hub publishes a
   `country-hn` feed. It is a *geographic filter*, not a national source.
   **100 of the 100 most recent alerts in it were issued by Belize.** Shipping it
   as "Honduran alerts" would push Belizean marine advisories to workers'
   families in Honduras.
3. **Football coverage is still unverified** and remains a genuine go/no-go for
   three of the four countries. `npm run verify:sources -- --category football`
   with an API key answers it in about a minute.

---

## Method and limits

Every check below was run from this session. The environment's egress policy
allows GitHub, npm and AWS S3, and blocks everything else — including
`api-football.com`, `open-meteo.com`, `frankfurter.app`, and all four national
weather agencies and lottery operators.

So the findings are in two classes, and they are **not** the same strength:

| Class | Meaning |
| --- | --- |
| **VERIFIED** | Fetched the live feed in this session and inspected the bytes. |
| **RESEARCHED** | Web search only. Indicative. **Re-run the probe before relying on it.** |
| **BLOCKED** | Could not be reached at all. Unknown. |

Everything blocked is encoded in `services/ingest/verify/` so it can be
answered for real from an unrestricted network:

```bash
node services/ingest/verify/run.mjs                      # everything
node services/ingest/verify/run.mjs --category football   # the open go/no-go
node services/ingest/verify/alert-publishers.mjs          # who really publishes
```

---

## 1. Weather alerts — VERIFIED

Checked in CLAUDE.md's required order: CAP → WMO/IFRC hub → scrape.

The IFRC/WMO **Filtered Alert Hub** (`alert-hub-subscriptions.s3.amazonaws.com/json`,
2,416 subscriptions) exposes one aggregated feed per country. All four of our
countries have one, and all four return 100 live alerts. **That is misleading**,
and the attribution below is the actual finding.

### Who actually issues the alerts in each country feed

Verified 2026-09-13 across the 100 most recent alerts per feed:

| Country | Publishers seen | National source? |
| --- | --- | --- |
| **Honduras** | `bz-nms-en` ×100 — **Belize** | ❌ **none** |
| **Guatemala** | `bz-nms-en` ×95, `mx-smn-es` ×5 | ❌ **none** |
| **Mexico** | `us-noaa-nws-en` ×81, `us-noaa-mzus-en` ×9, `int-gdacs-en` ×4, `bz-nms-en` ×3, **`mx-smn-es` ×3** | ✅ CONAGUA/SMN |
| **Jamaica** | **`jm-jms-en` ×100** | ✅ Met Service |

Mexico's feed is dominated by US NWS alerts because the country polygon catches
the border. **Any ingest MUST filter by issuing source**, not merely subscribe to
the country feed. `alert-publishers.mjs` exists to keep that honest.

### The two working national CAP sources, inspected

Both carry real geometry, which is what makes CLAUDE.md's polygon rule possible:

**Jamaica — `jm-jms-en`**
- Sender `NMCforecaster@metservice.gov.jm`, language `en-JM`
- Event: *Strong Wind and Large Waves Advisory*; Severity `Severe`
- **2 polygons, 739 vertices** — high resolution
- ✅ Correct language for Jamaican users with no translation layer

**Mexico — `mx-smn-es`**
- Sender `smn.conagua.gob.mx`, language **`es-MX`**
- Event: *Aviso de lluvias*; headline *"Circulación ciclónica en altura."*
- **2 polygons, 6 vertices**; `areaDesc` = `"CHIS, OAX"`
- ✅ Spanish, verbatim — satisfies "never paraphrase"
- ⚠️ **Coarse geometry.** A 6-vertex polygon spanning two states is close to
  state-level. The "dry corner of Cortés" problem is reduced but not eliminated;
  expect some over-alerting in Mexico and say so in the UI copy.

Note `mx-smn-es` is Spanish while the hub's country feeds are `-lang-en`. Take
alerts from the **issuing source in its original language** — the English country
feed implies a translation step, and translated agency wording violates the
verbatim rule.

### Honduras and Guatemala

No CAP, no hub coverage → **step 3, scrape**, per CLAUDE.md. Both agency sites
were unreachable from here, so the scrape targets are unconfirmed:

| Country | Target | Status |
| --- | --- | --- |
| Honduras | COPECO `copeco.gob.hn`, CENAOS `cenaos.copeco.gob.hn` | BLOCKED — confirm a feed exists before committing |
| Guatemala | INSIVUMEH `insivumeh.gob.gt`, CONRED `conred.gob.gt` | BLOCKED |

Corroboration: the dormant IFRC aggregator registry (snapshot 2023-08, 169
sources / 112 countries) also lists **zero** sources for HND and GTM, and lists
exactly the two we verified live for MEX and JAM. Two independent snapshots three
years apart agree. Costa Rica has 4 registered sources, so this is a genuine
per-country gap, not regional absence.

### Recommendation on launch order

The brief's rationale — *"Honduras is in the hurricane corridor, so the pipeline
gets stress-tested where alerts actually fire"* — is sound, and this finding does
not refute it. But it changes the cost:

- **Honduras first** means building the **scraper** first: no polygons (so
  polygon matching degrades to department-level, the thing CLAUDE.md forbids), no
  structured severity, and fragile parsing — in the country where a missed alert
  matters most.
- **Jamaica first** means a national CAP feed with 739-vertex polygons, correct
  language, structured severity, and a real `expires`. It is also in the
  hurricane corridor. The pipeline gets stress-tested *and* the first build is
  the clean one.

**Suggested order: Jamaica → Mexico → Honduras → Guatemala.** Build the CAP path
first on Jamaica, prove polygon matching and staleness monitoring against a real
storm season, then take on scraping for Honduras with a proven downstream.

This is a business call, not mine — Honduras may be worth the cost for client
volume. But Honduras-first should be chosen knowing it means *scraper-first*,
and that polygon matching (the rule the brief was most emphatic about) cannot
be satisfied from a COPECO scrape unless COPECO publishes geometry, which is
still unconfirmed.

---

## 2. Football — NOT VERIFIED (blocked)

This remains a real go/no-go. Liga MX is universally covered; the other three
decide whether fútbol ships for three of four countries.

| Provider | Status |
| --- | --- |
| API-Football | BLOCKED — needs `API_FOOTBALL_KEY` |
| SportMonks | BLOCKED — needs `SPORTMONKS_KEY`; plan tiers cap readable leagues (Starter 5, Growth 30, Pro 120) |
| TheSportsDB | BLOCKED — free tier, worth checking before paying |

RESEARCHED only, low confidence: search results suggest API-Football carries the
Honduran and Guatemalan Liga Nacional, and were silent on the Jamaica Premier
League. Treat as a hypothesis. The harness checks all four names against each
provider's league list and prints exactly which are missing.

**Do not build the fútbol UI until this returns.** If Jamaica Premier League is
missing, that section needs a different design for Jamaican users rather than an
empty state.

---

## 3. Lottery — PARTIALLY VERIFIED

Draw cadence (RESEARCHED, and the thing the brief asked to confirm):

| Game | Draws | Times (America/Jamaica, UTC−05:00, no DST) |
| --- | --- | --- |
| Cash Pot | 6×/day | 08:30, 10:30, 13:00, 15:00, 17:00, 20:25 |
| Pick 3 | 5×/day | 08:30, 10:30, 13:00, 17:00, 20:25 |
| Lotto | Wed & Sat | 20:25 |

Encoded in `verify/sources.mjs` as `JM_DRAW_TIMES` and modelled in
`lottery_games.draw_times_local`, so ingest is scheduled per game off actual
draw times rather than a fixed interval. **Re-confirm against the operator
before launch** — this is search-derived.

All operator sites (Honduras, Guatemala, Pronósticos, Lotería Nacional, Supreme
Ventures) were BLOCKED. The harness reports, per site, whether results are
server-rendered or need a headless browser.

---

## 4. FX and forecast — BLOCKED

Neither is a go/no-go (both have free no-key options), but both are unverified:

- **Frankfurter** is ECB-derived and may not quote **HNL, GTQ or JMD**. The
  harness checks all four currencies explicitly and names the missing ones; if
  Frankfurter is short, exchangerate.host is the fallback.
- **Open-Meteo** needs no key and is the leg the three-source median depends on
  most. With only two providers reporting there is no median, only a
  disagreement — worth deciding what the UI shows in that case.

---

## What to do next

1. Run `node services/ingest/verify/run.mjs --category football` with a key.
   **This is the only remaining true go/no-go.**
2. Decide launch country for alerts with the Honduras/Jamaica trade-off above on
   the table.
3. Run the full harness from an unrestricted network and commit the report.
4. Confirm Honduras/Guatemala scrape targets actually exist before budgeting for
   them.

Only then is it safe to build the UI.
