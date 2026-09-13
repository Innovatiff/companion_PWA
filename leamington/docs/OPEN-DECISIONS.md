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

## 2. Football coverage — unverified, blocking home screen design

**Status:** could not be run. See `SOURCE-VERIFICATION.md`.

`verify/football.mjs` is built and reports the full matrix (fixtures, live
scores, table, crests, historical, season depth) per league per provider. It
needs a network that can reach the providers, plus optionally
`API_FOOTBALL_KEY` / `SPORTMONKS_KEY`.

The decision it gates: **if Jamaica Premier League is uncovered, the Jamaican
home screen needs a different anchor** — Jamaica is now the alerts launch
country, so its home screen is the first one built.
