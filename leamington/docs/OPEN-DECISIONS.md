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

### Jamaica — DECIDED 2026-09-13: the football slot is conditional, not country-specific

> - The home-screen football line **renders when the user's team has a fixture
>   and is absent when it does not**. That is already how it behaves for every
>   user on most days (Motagua does not play daily either), so there is **no
>   Jamaica-specific layout** and nothing to wait for.
> - When the Jamaica Premier League publishes fixtures beyond round 1, Jamaican
>   users see them with **zero code change**.
> - The daily calendar re-check (`.github/workflows/jpl-calendar.yml`) stays
>   running.
>
> This is not an open question and does not gate `apps/app`.

The finding behind it is kept below.

#### Finding: real season, calendar NOT PUBLISHED beyond round 1 (probed 2026-09-13)

API-Football lists Jamaica's 2026 season as Sep 13–15. That is round 1 of a
real season, and it is all that has been published.

- **The season is not Sep 13–15.** The 2026–27 format is 14 clubs, 39 matches
  each and 247 matches, running September 2026 to May 2027 (Wikipedia).
- **Round 1 is real, in four independent sources, with the same clubs:**
  - API-Football: "Regular Season - 1"
  - TheSportsDB
  - Soccerway
  - TNT Sports: matchday 1 on Sep 13 and matchday 2 on Sep 14, including
    Portmore United v Waterhouse with no kickoff time yet. That is all 14 clubs.
- **Nothing after round 1 is published in any of them:**
  - `verify/jpl-calendar.mjs` swept TheSportsDB one day at a time for 56 days,
    and all 56 answered: 5 matches, all on Sep 13–15. Verdict
    **NOT_PUBLISHED**.
  - Soccerway and TNT Sports list round 1 only.
  - API-Football's free plan cannot look past tomorrow.
- **Last season for comparison:** 2024-25 had 283 fixtures from September to
  May, including 16 in September and 30 in October.

**So Jamaica has a season but no published calendar.** Under the decision above,
the conditional football line is simply absent for Jamaican users until
fixtures are published. It never says "no match" as a fact.

**Re-check, independent of any session:** `.github/workflows/jpl-calendar.yml`
runs the sweep daily at 11:40 UTC. It fails until a match more than 3 days
ahead is listed, and the run summary gives the verdict. It costs no
API-Football quota.

### Not resolved by this decision
- **SportMonks** was not probed: no key. Its free plan covers only the Danish
  Superliga and Scottish Premiership, and its `/leagues` endpoint lists only
  leagues on the caller's plan, so absence there is not absence from its
  catalogue.

---

## 3. Decisions made on the owner's behalf during the full build (2026-09-13)

Each was the reasonable default for something the brief did not specify. Each
says how to reverse it.

### 3.1 Deploy without restarting the soak

The brief says "push when each surface is working"; the soak says any push to
`main` restarts it.

- **Chosen:** push each surface to a feature branch, not `main`. Deploy the
  three new Railway services from the local tree with `railway up`, so the
  ingest service never redeploys. Merge to `main` after the 24-hour soak report,
  then connect the services to GitHub deploys.
- **Reverse:** merge now and accept a restarted soak window.

### 3.2 All three surfaces are zero-JS server-rendered pages

The Hoy decision extends to the portals ("no framework JS where avoidable").
Pages Router with runtime JS disabled, inline CSS from `packages/shared/src/ui`,
no Tailwind.

### 3.3 Portal sign-in

"Real credentials", separate from client codes.

- **Chosen:** a login name and password stored in our own Postgres (bcrypt,
  cost 12, via pgcrypto), with sign-in throttled: 10 failures in 15 minutes per
  source and per login name.
- **Sessions:** a signed cookie bound to its portal, valid for 12 hours, and
  re-checked against the account on every request, so a deactivation or
  password reset ends it at once.
- **Account creation:** the owner creates each affiliate in admin and gets a
  one-time setup link (valid 72 hours) to hand over. There is no email or SMS
  infrastructure, and no Supabase Auth dependency.
- **Enforcement:** each request runs in a transaction as the database role
  `authenticated`, with the person's id as the JWT subject. The existing
  row-level-security policies therefore decide what an affiliate can read; the
  page code is not trusted to filter.
- **The first owner account** is created by a script that prints a one-time
  setup link. Nobody but the owner ever sees the password.
- **Reverse:** move to Supabase Auth. The `auth_user_id` columns already fit it.

### 3.4 Money: the ledger direction

- **Chosen:** each paid sale or renewal accrues the affiliate's commission
  (`amount × commission_rate` at the time: $8 of $20). Payouts are recorded by
  the owner in admin. **Amount owed = earned − paid out.**
- If affiliates in practice keep $8 of the cash they collect, the owner records
  that as a payout at the same time and the ledger still balances.
- **Reverse:** a single change in the earnings view if the owner collects
  nothing and affiliates remit $12 instead.

### 3.5 Registration is a paid sale

- **Chosen:** the affiliate registers a client after collecting the $20.
  Registration creates the first 6-month period, starting that day, as paid.
- **Renewal dates (owner's rule, 2026-09-13):** a renewal paid early starts
  where the current period ends, so it extends and never overwrites. A renewal
  paid after the period ended starts on the day it is paid. The earlier 30-day
  back-dating is gone (0029).
- Attribution stays with the client's original affiliate permanently: the
  database refuses to change `clients.affiliate_id` once set.

### 3.6 What a lapsed client keeps

The owner's renewal brief settles the screen: when a paid period ends, Hoy shows
an expiry screen with the code, the affiliate who registered them, and that any
Hoy affiliate can reactivate it. It does not say what happens to the safety
features, so:

- **Chosen:** the expiry screen replaces home, Fútbol, Más and setup at the
  moment the period ends, with no grace period.
  - The official weather warnings page stays open, one tap from the expiry
    screen.
  - Alert notifications continue, and so do the notification settings.
  - The daily engagement notification stops.
- **Why:** cutting off a civil-protection warning over $20 should be a
  deliberate choice, not a default.
- **Reverse:** drop `allowUnpaid` on `/clima`, and filter
  `app.queue_alert_notification` by `app.client_has_paid_access`.
- A client the owner deactivated is different: they cannot sign in at all.

### 3.6a Renewals at any business (0029, 0031)

- **Owner's rule (2026-09-13, replacing "always the original affiliate"):**
  every client can renew at any business running the affiliate portal. The
  business that registers a client earns the registration commission. Whoever
  collects a renewal earns that renewal's commission, at its own rate. A client
  who started at Domcub and renews elsewhere pays the other business.
  - The client stays registered to the first business (their client list and
    "registered by"); each payment records the registering business at the
    time.
  - The collector does not gain the client in their list. Their renewals, with
    each client's name and "registrado por", are on their earnings page.
  - The registering business sees when its client renewed elsewhere, as
    information rather than money.
- **Owner renewals:** a renewal the owner marks paid in admin was collected by
  no business, so it earns no commission (house affiliate, $0). Businesses earn
  renewals by collecting them in their own portal.
- **Cash:** every business owes the owner the $20 it collects, less its own
  commission under 3.4. Admin shows cash collected against commission per
  business, so the owner can reconcile.
- **Double taps:** each renewal form carries a request key, so a resubmitted
  form returns the same renewal. A different form for the same client within
  10 minutes must be confirmed ("ya se renovó hace un momento"), so paying for a
  further 6 months is always deliberate.
- **Code guessing:** 20 codes not found in 15 minutes stops that affiliate's
  lookups.
- **Deactivated clients** are not renewed from the affiliate portal; the owner
  decides in admin.
- **Lapse rate:** clients currently lapsed ÷ clients whose first paid period has
  reached its end date. Real clients only.

### 3.7 Reference data checked by Claude, labelled as such

Holidays, school calendars, consulates, emergency numbers and transit are
curated from official sources by an automated check, not by a person.

- `verified_by` records `claude-code (checked against source_url)`.
- The app still shows "Verificado: {date}" per CLAUDE.md.
- **Recommended:** the owner spot-checks the consulate and emergency records
  before real users rely on them.
- **Reverse:** set `needs_verification: true` on any record, and the loader
  refuses to publish it.

### 3.8 Municipality catalog from GeoNames

- Honduras, Guatemala and Mexico municipios, and Jamaican towns, come from
  GeoNames (CC BY 4.0).
- The attribution appears on the Más page.

### 3.9 Web push keys

Push notifications use VAPID keys generated for this project and stored as
Railway variables. The ingest service sends them; no third-party push service
account is needed.

- **No dependency:** signing and encryption use node:crypto (RFC 8291/8292),
  tested by decrypting exactly as a browser does.
- **Without keys:** Hoy hides the "turn on" button and says notifications are
  not available yet. Any notification that could be delivered stays queued with
  the reason "VAPID keys are not set", and the push delivery feed shows as
  degraded. Nothing is dropped silently.
- **Rotating the keys** invalidates every phone's subscription; each person
  would have to turn notifications on again.
- **Sign-out** in either portal ends every session for that login on every
  device (0028).

### 3.10 Test data is flagged

- The seeded test client and its affiliate carry `is_test = true`.
- Portals label them "Prueba", and they are excluded from sales, revenue,
  payouts and the renewal pipeline.

### 3.11 Portal language

- Spanish by default; each portal login has a language setting (es/en).
- Hoy follows the client's `language`, which is English for Jamaica.

### 3.11a Deployment (2026-09-13)

- **Services:** `hoy`, `affiliate` and `admin` in the same Railway project as
  ingest, each built from `apps/Dockerfile` (`APP` selects the app) and
  deployed with `railway up` from a clean `git archive` of the committed tree.
  The ingest service was not redeployed; its deployment id is unchanged.
- **Database URL:** each web service uses `${{companion_PWA.DATABASE_URL}}`,
  the ingest service's own variable, so there is one connection string to
  rotate. Each web service has its own `SESSION_SECRET`.
- **Push keys:** VAPID keys were generated locally and never printed. The public
  key is on `hoy`; the private key and subject are on the ingest service with
  deploys skipped. `VAPID_SUBJECT` is Hoy's https address rather than a
  personal email, which push services would receive.
- **Held back until ingest redeploys after the soak:** the running ingest is
  the pre-build commit, so push delivery (`notify:send`, `notify:plan`) and the
  new lottery parsers are not running in production yet. Their seeds
  (`feed_expectations` rows for `notify:*`, `lottery_games`) are not applied:
  applied now, the monitor would report never-run feeds and alert the owner
  during the soak. **After the soak:** merge to `main`, then apply both seeds.
- **Owner account:** login `owner`, created with a one-time setup link (72
  hours). The owner sets the password; it is never seen by anyone else.

### 3.12 Lottery sources

All 11 v1 games parse from the operator's own published results; none from a
third-party aggregator.

- **Jamaica:** the JSON API behind supremeventures.com's results page. The
  public bearer key it needs is read from the homepage on each run, the same way
  a browser gets it. If Supreme Ventures changes that, the parser throws and
  /health shows the lottery feed failing, rather than going quiet.
- **Guatemala:** Lotería Santa Lucía results as published by Pro Ciegos y
  Sordos, the lottery's operator. It publishes no draw time, so results are
  unique per game and date (0024).
- **Reverse:** a game is shown only while `parser_implemented` is true; set it
  false to withdraw a game without a deploy.

### 3.13 Offline: only the home screen is cached

- **Chosen:** the service worker caches the home screen, whose every line
  carries its own expiry. Section pages are never cached. Offline they show
  "Sin conexión" and a link home, because an old warning list shown as the list
  is exactly what CLAUDE.md forbids.
- **Reverse:** add per-item expiry to a section, then cache it the way home is.

### 3.14 Setup starts at sign-in

- **Chosen:** after typing the code, a person with unanswered setup steps goes
  straight to the first one; every step has "Saltar". Once each step is answered
  or skipped, sign-in goes home, and a skipped municipality is offered at most
  once a day on the home screen.
- The school calendar is listed in Más for everyone; answering "yes" to the kids
  question moves it to the top.

### 3.15 A country whose warnings we do not ingest yet

- **Chosen:** Clima says "Hoy todavía no recibe los avisos de COPECO" (or the
  relevant agency) and links to the agency's own page. It never shows an empty
  list. The notifications page says we do not send weather warnings for that
  country yet.

### 3.16 Direct registrations by the owner

- **Chosen:** clients the owner registers in admin belong to a single house
  affiliate that earns no commission, so every client still has exactly one
  permanent affiliate and sales-per-affiliate stays honest.

### 3.17 Transit

- Listed: LTGO on-demand transit in Leamington, Transit Windsor, and its
  Amherstburg 605 route.
- There is no Leamington–Windsor bus to list: LTW Transit was discontinued
  effective 30 April 2026, according to leamington.ca. The page says nothing in
  its place rather than implying a route exists.

### 3.18 Consulates with gaps

- **Guatemala:** no record. Every minex.gob.gt page returned HTTP 403, and
  search snippets were not accepted as a source. The Consulado page is empty
  for Guatemalan clients until the record is curated from the official page.
- **Mexico:** contact details only. The fee, requirements and booking pages
  sit behind a bot challenge and could not be read.
- **Honduras:** the record is the Embassy in Ottawa, which runs passport
  services; which office covers southwestern Ontario is not stated.
- **Owner action:** a person can fill these in from a normal browser; the
  loader publishes any record that carries `verified_at` and `verified_by`.

### 3.19 Launch-eve data fill (2026-09-13)

The owner asked for Hoy to be full before sales start. Everything added is real;
nothing is sample data.

- **Reference data loaded into production:** holidays, school calendars,
  consulates, emergency numbers and transit. Exchange rates, forecasts and
  lottery results were run once, with the ingest service's own settings, via
  `railway run`. Ingest was not redeployed. The runs are recorded in
  `source_runs` like scheduled runs, so the soak report will count them.
- **Team crests** are fetched server-side into `team_crests` and served from
  Hoy's own domain.
- **Sales demo accounts,** flagged as test: `VENTAMX2`, `VENTAGT2`, `VENTAHN2`,
  `VENTAJM2` (`packages/db/fixtures/demo_clients.sql`).
- **FX source for HNL, GTQ and JMD.** The ECB source does not quote them, and
  exchangerate.host now needs a paid key.
  - **Chosen:** the CC0 daily currency dataset (fawazahmed0 currency-api, via
    jsDelivr, with its own mirror), after Frankfurter. It needs no key and no
    attribution, so the UI still never names a provider.
  - **Reverse:** remove it from `PROVIDERS` in `services/ingest/src/feeds/fx.mjs`.
- **OpenWeather key rejected (HTTP 401) — OWNER ACTION.** The `OPENWEATHER_KEY`
  variable on the ingest service is refused by OpenWeather. Forecasts still
  show, because Open-Meteo and WeatherAPI agree, but with two providers
  instead of three, and the forecast feed reads "partial".
  - **Fix:** a valid key (new keys can take a few hours to activate).

### 3.20 Real images in Hoy (owner's choice, 2026-09-13)

The owner chose hometown photos. Pictures never stand in for data; they only
show the real place or team.

- **Hometown photos:** one photo per town a client lives in or watches, from
  Wikimedia Commons.
  - Taken only from the town's own Wikipedia article, whose coordinates must be
    within 25 km of our town: the lead image, or a photo named after the town.
  - Must be a landscape JPEG with a free license (CC0, public domain, CC BY,
    CC BY-SA) and a named author.
  - Hoy shows "Foto: author · license" linking to the file's page.
  - Stored in our database at 480 px (about 15–35 KB, at most 120 KB) and
    served from Hoy's own domain.
- **Crests:** from the football provider's media host, at most 50 KB. The
  provider's stock "logo soon" image, and any image shared by several teams, is
  never stored; those teams show their initials.
- **A person can choose a better photo** for a town in
  `services/ingest/src/feeds/town-photo-overrides.json` (San Pedro Sula's
  first automatic pick was a construction site). The chosen file still passes
  every check.
- **Daily jobs** (`photos`, `crests`, 5:40 and 5:45 Toronto) fetch only what is
  missing, so new clients' towns and newly seen teams get pictures the next
  morning. Both are monitored with a one-day interval.
- **Budgets:** the pictures are cached for 30 days, so they cost data once
  per phone.
