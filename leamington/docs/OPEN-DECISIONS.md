# Open decisions

Decisions that need a human call. Each states the tradeoff rather than a
recommendation dressed as a finding.

---

## 1. Mexico CAP push policy — geometry is state-shaped

**Status: DECIDED 2026-09-13 — option (b) plus the areaDesc modifier.**

> - Push Mexican CAP alerts on the **highest severity tier only**.
> - Every Mexican alert notification includes SMN's own `areaDesc` **verbatim**
>   (e.g. "CHIS, OAX"), so the coarse coverage area is visible to the user
>   rather than implied to be their municipality.
> - Lower tiers display in-app, no push.
>
> **(c) rejected:** intersecting a 6-vertex polygon with municipal boundaries
> produces municipality-precise output from state-coarse input. That adds
> confidence without adding information — the exact failure the
> corner-of-Cortés rule exists to prevent. Revisit only if SMN tightens its
> geometry, or if a geocoded municipal boundary set with real verification
> value becomes available.

The analysis behind the decision is kept below.

### The problem

`mx-smn-es` publishes real CAP with real polygons, but they are coarse: the
sample inspected had **2 polygons of ~6 vertices** with `areaDesc` = `"CHIS, OAX"`
— two entire states — and **zero geocodes**.

Jamaica's feed, by contrast, carries 739-vertex polygons. The same
point-in-polygon code runs against both; only the input precision differs.

At Mexican client volume (the largest of the four countries) a 6-vertex blob
over two states reintroduces exactly the false positive the corner-of-Cortés
rule exists to prevent — except now at national scale.

### Options

**(a) In-app display only, no push, until geometry tightens**

- ✅ Zero false pushes. Cannot damage push trust.
- ✅ Cheapest to build; nothing beyond what Jamaica already needs.
- ✅ Fully reversible — turn push on later with no re-architecture.
- ❌ The **largest** client group gets the weakest alert experience.
- ❌ A genuine red alert for a user's actual town never reaches their phone. In
  a system where "absence is not safety", this is the option that most relies
  on the user opening the app unprompted.

**(b) Push only on the highest severity tier**

- ✅ Preserves push for genuine emergencies, where a false positive is most
  forgivable and a miss is least.
- ✅ Nearly free to build: `push_eligible` already keys off `level`; Mexico
  becomes a threshold of `red` rather than `red|orange`.
- ✅ Extreme/red alerts are rare, so the absolute number of false pushes stays
  low even with coarse geometry.
- ❌ Severity does not fix geography. A red polygon over Chiapas + Oaxaca still
  pushes to everyone in both states.
- ❌ The people who receive a false red alert are the most likely to disable
  notifications permanently.

**(c) Intersect the CAP polygon with a municipality boundary set**

- ✅ The only option that could yield true municipality precision.
- ✅ The boundary set would be reusable for the Honduras and Guatemala scrapes,
  which will likely emit department-level *text* and need boundaries anyway.
- ❌ Needs a licensed municipal boundary dataset for Mexico (~2,475 municipios;
  INEGI marco geoestadístico or similar), plus storage and PostGIS work.
- ❌ **It does not add information.** Intersecting a 6-vertex blob with
  municipal boundaries returns "every municipio inside the blob". The output
  *looks* municipality-precise while being exactly as coarse as the input.
  That is false precision, which CLAUDE.md rules out. It would only genuinely
  help if SMN also published geocodes or a more specific `areaDesc` to
  intersect against — and the sample had neither.

### A modifier worth applying to whichever is chosen

**Name the area in the notification itself.** Because agency wording passes
through verbatim, the push can carry SMN's own `areaDesc` ("CHIS, OAX") rather
than implying "your town". A user who reads the area and decides it is not
about them has been informed, not misled — and the trust cost of a
geographically broad alert drops sharply when the alert says how broad it is.
This is cheap and composes with (a), (b) or (c).

### If it helps

(b) plus the modifier is the lowest-regret starting position: it keeps push
alive for real emergencies, is a one-line threshold change, and is reversible
to (a) if red-alert volume turns out higher than expected. (c) should not be
built as a geometry-laundering step — only if paired with something that adds
real information.

**Not picking this unilaterally. It trades a safety risk against a trust risk,
and that is a business call.**

---

## 2. Football — ship on API-Football free, upgrade at 5–10 active clients

**Status: DECIDED 2026-09-13.**

> - Stay on **API-Football's free plan** until **5–10 active clients** exist.
> - **Upgrade trigger:** `select count(*) from clients where active` reaches
>   **5**. The upgrade is made by the time it reaches **10**.
> - **Stay under 50 requests/day** on the free plan (cap: 100/day, 10/minute),
>   leaving headroom for retries and `verify/football.mjs`.

### v1 scope on the free plan

| | Scope | Why |
| --- | --- | --- |
| **IN** | Fixtures and results **by date query**, all four leagues, current season | The free plan answers date queries for the current season |
| **OUT** | Current league tables | League+season queries are locked to 2022–2024 on the free plan |
| **OUT** | Live in-match scores | 5-minute polling is ~120 requests/day, over the 100 cap |
| **OUT** | Fixtures more than one day ahead | Date queries only reach **yesterday to tomorrow**; the "next N fixtures" parameter is also locked |

**Budget:** one date query per hour covers all four leagues: **24 requests/day**.

### Hard rule

**Never display 2022–2024 standings as current.** When the current-season table
is unavailable, the section shows nothing but an honest label. Not stale data,
and not an empty shell that implies it is loading. Same rule as everywhere else
in this project.

The table is built into the schema now and gated on **data availability**, not
on a flag, so the upgrade is a configuration change rather than a rebuild.

### Evidence (probed 2026-09-13 with the free key)

- **League+season queries for 2025–2026:** `"Free plans do not have access to
  this season, try from 2022 to 2024."`
- **Date queries:** `"Free plans do not have access to this date, try from
  2026-09-12 to 2026-09-14."`
- **Data depth:** 2022 and 2024 returned fixtures with scores, tables, a crest
  for every team, and match events for all four leagues. Live `live=all` showed
  a Guatemala match in play.
- **Provider self-reported coverage for 2026:**
  - Guatemala: `standings: false`
  - Jamaica: `events: false`, `lineups: false`

### Jamaica — real league, schedule not yet published (probed 2026-09-13)

API-Football lists Jamaica's 2026 season as Sep 13–15. That is not a placeholder
league, but it is all that has been published.

- **Round 1 is real, in three independent sources, with the same clubs:**
  API-Football (5 fixtures, "Regular Season - 1"), TheSportsDB (5) and
  Soccerway (6), on Sep 13–15.
- **Nothing after round 1 is published in any of them:**
  - a TheSportsDB date query for every day from Sep 13 to Nov 8 (57 of 57
    answered) found matches only on Sep 13–15
  - its full 2026-2027 season list holds the same 5 matches
  - Soccerway lists only round 1
  - API-Football's free plan cannot look past tomorrow
- **Last season for comparison:** 2024-25 had 283 fixtures from September to
  May, including 16 in September and 30 in October.

**Verdict: INCONCLUSIVE beyond round 1.** "Not published" is not "no matches":
the league may release fixtures a round at a time.

Consequence for the home screen: on most days there will be no Jamaican fixture
to show. The UI must say nothing, or say when the schedule was last checked. It
must never say "no match" as a fact.

Re-check weekly with the free TheSportsDB date sweep, which costs no
API-Football quota.

### Not resolved by this decision
- **SportMonks** was not probed: no key. Its free plan covers only the Danish
  Superliga and Scottish Premiership, and its `/leagues` endpoint lists only
  leagues on the caller's plan, so absence there is not absence from its
  catalogue.
