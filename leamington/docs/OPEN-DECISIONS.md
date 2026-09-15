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
- **OpenWeather "401" — resolved 2026-09-14, not a key problem.** The key is
  valid: current weather and the 5-day, 3-hour forecast both answer 200. The
  daily endpoint the feed used needs a paid plan. The feed now uses the free
  3-hour forecast (3.22), so forecasts have three providers again.

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
- **League logos** (0036, 0037): one per league, from the same media host, at
  most 150 KB (the provider's are 110–135 KB). There are only four, shown on
  Fútbol only, and each is cached for 30 days. The provider's second stock
  picture, a grey camera reading "image not available" (90,381 bytes), is
  refused by fingerprint, as is "logo soon".
- **Local places** (0036): Leamington and Windsor are forecast like client
  towns, so Clima can show "Aquí en Canadá" beside home.

### 3.21 Football provider account suspended — OWNER ACTION (2026-09-13)

API-Football's `/status` answers "Your account is suspended, check on
https://dashboard.api-football.com." The fixtures feed fails on every run.

- **What clients see:** results already stored stay. Upcoming schedules stop
  showing 3 hours after the last good fetch, because a stale kickoff time is
  worse than none. Fútbol then shows the team's recent form and results,
  and when fixtures were last confirmed. It never says "no matches".
- **Fix:** reactivate the account in the API-Football dashboard, or choose
  another provider (a paid decision). Nothing in the apps changes either way.

### 3.22 Weather precision: town points at the town, three providers (2026-09-14)

The owner reported that the weather did not look precise. Checking each
provider live for every client town showed why.

- **Town points were in the hills.** The municipality seeds used GeoNames' ADM2
  point, which can fall anywhere in the municipio. La Ceiba's was 10 km from
  the city and 1,200 m up Pico Bonito, and San Pedro Sula's was also at
  1,200 m. Forecasts there ran about 6–7° cold, around 26° instead of 31–33°.
  - **Chosen:** each municipio's point is now its seat (cabecera): the GeoNames
    seat inside the municipio, else a town with the municipio's name inside it
    or within 25 km. The ADM2 point is kept only where no town is found (154 of
    3,109).
  - **Result:** names and regions are unchanged. Points moved 3–4 km on median.
  - **Follow-on (0038):** clients' copied points, which alert matching uses,
    follow the correction. Forecasts made for the old point are deleted, so
    a town shows no forecast until the next run rather than a wrong one.
  - **Reverse:** regenerate the seeds from the ADM2 points (the generator's
    `seatFor`).
- **OpenWeather** is back as the third provider through its free 3-hour
  forecast. A day is stored only when the steps cover its early morning and
  afternoon, so an evening-only "today" never passes for the day's high.
- **Clima labels the big number "máxima".** It is the day's high, not the
  temperature right now; unlabelled, it read as wrong at night. Hoy does not
  show a current temperature.

### 3.23 Rate reminder in the engagement queue (2026-09-14, round 3)

CLAUDE.md orders engagement triggers as match day > 30-day rate high > lottery.
Round 3 adds the member's own rate reminder ("Avísame cuando suba").

- **Rule:** match day > rate reminder > 30-day rate high > lottery
  (`app.trigger_priority`, `app.plan_engagement`, 0042).
  - Eligible when the reminder is open and the latest current reference rate
    (dated within 3 days, the Tasa page's rule) is at or above the number.
  - Still one engagement message per client per local day, at the notify hour,
    push only. Alerts never pass through it.
  - It fires once: `triggered_at` is set when the notification is sent. A
    message that was not delivered leaves the reminder open for a later day. A
    reminder that loses to match day waits for the next day.
  - The text is descriptive: "La tasa de referencia llegó a 18.60 HNL por
    1 CAD." There is no advice.
- **Why:** the member asked for this number. A generic 30-day high is our
  suggestion; his own request outranks it. Match day stays first because it
  expires the same day, while a reached rate is usually still there tomorrow.
- **Reverse:** in `app.trigger_priority`, swap `rate_reminder` and
  `fx_30d_high`, and move step 2 below step 3 in `app.plan_engagement`. To
  switch reminders off, remove step 2; stored reminders stay and can be cleared.
- **Related, same migration:**
  - Ontario ESA public holidays live in their own `provincial_holidays` table,
    so `holidays.country` and its functions are unchanged.
  - The FX backfill (`scripts/backfill-fx.mjs`) never overwrites a stored rate
    and never fills a day no source published.

### 3.24 Noticias: headlines, the outlet's own summary, a small picture, a link (2026-09-14)

The owner asked for news of the member's country and of their municipio or
parish, on a page of its own, with pictures.

- **Copyright stance (decided):** Hoy shows each story's headline, the
  publisher's OWN short summary from its feed (plain text, at most 300
  characters, cut at a word with "…"), a small cached copy of the publisher's
  picture credited "Imagen: {source}", the source name and the publish time,
  and links to the full article on the publisher's site.
  - Hoy never stores or shows full article text (`content:encoded` is never
    read).
  - Only the **publisher's own RSS/Atom feed, served from its own domain**,
    whether or not its pages link to it (revised 2026-09-14, coordinator's
    decision). The first version required the feed to be advertised on the
    outlet's pages, which left 11 working feeds unused, including both big
    Honduran papers. The rule's purpose was always no scraping and no
    third-party aggregators, and a feed on the publisher's own domain meets
    it. An outlet stays active only while its feed answers with fresh, dated
    items. **Reverse:** `update news_sources set active = false where key = …`
    (and the same in the seed).
  - Pictures only from the item's own feed tags or the article's `og:image`
    (one page read per new story, at most 40 per run). Never hotlinked:
    ingest keeps a thumb (160 px, ≤ 10 KB) and a lead (480 px, ≤ 45 KB) JPEG.
  - A story stored while a run's picture budget was spent gets its picture on a
    later run, while its outlet still lists it (`news_items.image_checked_at`).
    A picture that failed is not tried again.
- **Sources (all re-verified live 2026-09-14, `seeds/news_sources.sql`):** 27
  active, none inactive.
  - **Mexico, national:** El Financiero, SDPnoticias, Infobae México, El
    Universal, La Jornada.
  - **Michoacán:** La Voz de Michoacán, Quadratín Michoacán (both Morelia).
  - **Chiapas:** El Orbe and Diario del Sur (Tapachula); Alerta Chiapas and
    El Heraldo de Chiapas (Tuxtla Gutiérrez).
  - **Guatemala, national:** Prensa Libre, La Hora, Publinews, República,
    Emisoras Unidas.
  - **Honduras, national:** La Prensa, El Heraldo, Proceso Digital, HCH,
    Hondudiario, Criterio.
    - La Prensa is based in San Pedro Sula but national in scope. It has no
      San Pedro Sula feed (`rss/san-pedro-sula` and `rss/zona-norte` are 404),
      so mentions carry the city.
  - **Francisco Morazán:** El Heraldo's own Tegucigalpa section feed
    (`rss/tegucigalpa`).
  - **Jamaica, national:** The Gleaner, Jamaica Observer (news and Western),
    JIS.
  - No Guatemalan regional outlet, and no Honduran one outside Tegucigalpa,
    has a working feed.
- **No graphic pictures** (`news/graphic.mjs`; members open Hoy every morning,
  and crime pictures showed covered bodies):
  - When a story's title or summary speaks of death or violence, the story is
    kept, but its picture is never fetched and never shown.
    `news_items.image_suppressed` holds the term that matched.
  - Matching covers Spanish and English terms (muerto, asesinato, homicidio,
    cadáver, sin vida, balacera, ejecutado, fosa, feminicidio, sicario, ataque
    armado, a balazos; killed, murder, dead body, shooting, stabbed and more),
    accent- and case-insensitive, whole words.
  - Figurative uses are removed first: "Día de Muertos", "muertos de risa",
    "punto muerto", "tiempo muerto", "restos del huracán", "shooting star",
    and "ejecutado" said of work or money ("operativos ejecutados por la
    Alcaldía").
  - "murió" and "murieron" are not terms: in the dry run they marked
    obituaries, history and "¿De qué murió…?". "muere" and "mueren" are
    terms, since they are mostly current accidents.
  - Erring toward no picture is cheap: the headline and summary still show.
  - `news_sources.show_images = false` switches off one outlet's pictures
    without losing its stories. It applies at once to stories already stored
    (`app.news_page` and `app.news_image` check it). Ingest skips those
    pictures, and switching back on backfills stories the outlet still lists.
  - **Reverse:** `update news_sources set show_images = true where key = …`;
    for the terms, edit `GRAPHIC_TERMS` / `NOT_GRAPHIC`. Already suppressed
    stories keep no picture, because it was never fetched.
- **Rules:**
  - **Sections** (`app.news_page`):
    - local: stories naming the hometown or a watched town, 7 days
    - region: regional outlets of the hometown's region, 3 days
    - national: 48 hours
    - Each story appears once. Outlets are mixed round-robin so one busy
      outlet cannot fill a list.
  - **Home:** `app.news_home` gives one lead story with a picture (the
    member's towns first) and two more headlines; `home_more.news`.
  - **Freshness:** `updated_at` is the last run that finished `ok` or
    `partial`. `feed_health.last_ok_at` counts only `ok`, and with 15 outlets
    one is often down. Beyond 3 hours the stories are still returned with
    `stale: true`, never "no news".
  - **Failures:** a run where no outlet answered is an error, recorded
    inconclusive.
  - **Retention:** stories older than 30 days and unused pictures are pruned
    each run.
- **Local matching** (`news/mentions.mjs`, stored in `news_mentions` with
  what matched and the rule):
  - Only outlets of the town's country; title and summary; accent-, case- and
    word-exact.
  - An ambiguous name (a word, surname, saint, a name several of our towns
    share, a famous place elsewhere) needs its region named too, or a
    regional outlet of that region.
  - Jamaica: the town or its parish.
  - A dateline naming a big newsroom city does not count: Kingston,
    Tegucigalpa, San Pedro Sula, Ciudad de México, Guatemala, Morelia. It says
    where the story was filed, not what it is about. The dry runs found
    "KINGSTON, Jamaica —" on nearly every Observer story (13 Kingston matches
    became 5), "San Pedro Sula, Honduras." on La Prensa's national stories,
    and "MORELIA, Mich., …" on Quadratín's statewide ones. Other towns'
    datelines ("URUAPAN, Mich.", "Tapachula, Chiapas;", "MONTEGO BAY, St
    James —") are local reporting and count.
  - "Xelajú" is not an alias of Quetzaltenango (it was only ever the football
    club).
- **Pictures in pure JavaScript** (jpeg-js, pngjs; no native build in the
  node:22-slim image):
  - WebP and AVIF have no reliable pure-JS decoder, so those stories have no
    picture (most of Criterio, some of HCH and Hondudiario).
  - The Gleaner's article pages drop Node's connections, so its stories have
    no picture yet.
- **Reverse:**
  - Stop reading an outlet: `update news_sources set active = false where key = …`,
    and seed the change. Its stored stories are no longer shown.
  - Drop pictures: skip `fetchPicture` in `news.mjs`; stories stay and pages
    show text only.
  - Stop the feature: remove the `news` job from `scheduler.mjs` and set
    `feed_expectations.active = false`. The stored stories age out in 30 days.

### 3.25 Football videos: YouTube links and a small thumbnail, never a player (2026-09-14)

The owner asked: "Add videos links and their thumbnail on the sport page.
Highlights of their team and all that."

- **Stance (decided):** videos come only from the **public upload feeds of
  verified official channels** (`https://www.youtube.com/feeds/videos.xml?channel_id=UC…`:
  Atom, no API key, the latest 15 uploads).
  - Hoy stores the title, the channel, the publish time, the video id, the view
    count and a small cached copy of YouTube's thumbnail. It links to
    `https://www.youtube.com/watch?v=…`, credited "YouTube · {channel}".
  - **Hoy never embeds a player:** a player would make the phone call YouTube.
    The page must say that watching opens YouTube and uses a lot of data.
  - Thumbnails are fetched by ingest from `i.ytimg.com` only (`mqdefault.jpg`,
    else the feed's own `hqdefault.jpg` with its letterbox bars cropped). Each
    is re-encoded to one JPEG of at most 14 KB, 320 x 180 (288 x 162 when a
    busy picture does not fit). At most 60 per run; a video whose thumbnail
    fails is stored without one. Never hotlinked.
  - Shorts (links `/shorts/…`, about half of some feeds) are skipped. Videos
    are kept 60 days.
- **Tables (0049):** `video_channels` (seed `seeds/video_channels.sql`),
  `videos`, and `video_teams`, precomputed at ingest with the name that matched
  and the rule. Feed `videos` runs hourly at :22 (`feed_expectations`: 1 hour,
  1 hour grace).
  - A channel that does not answer makes the run partial. No channel answering
    is an error, never "no videos".
- **Channels (all verified live 2026-09-14; each id taken from the channel's
  own page, where the canonical link and externalId agreed):**
  - **Active:** 37 (21 Mexico, 6 Honduras, 3 Guatemala, 7 Jamaica).
  - **Mexico:** the league's LIGA BBVA MX (every match summary, "SANTOS 2-1
    JUÁREZ J8 AP26"); TUDN México, ESPN MX, TV Azteca Deportes; 17 official
    club channels.
  - **Honduras:** Liga Hondubet (the league's own; full matches); Deportes TVC
    (Televicentro: "Marathón 1 - 0 Olimpia | Jornada 7"); Motagua, Olimpia,
    Real España, Victoria.
  - **Guatemala:** Guatefutbol TV and FOX Deportes Guatemala (goals and
    summaries of every round); Comunicaciones.
    - Guatefutbol is a sports outlet, not a rights holder. It is the only
      Guatemalan channel found posting Liga Nacional highlights. **Owner
      review:** keep it, or switch it off
      (`update video_channels set active = false where key = 'gt-guatefutbol-tv'`).
  - **Jamaica:** Jamaica Premier League TV (full matches live, no highlights);
    Montego Bay United, Mount Pleasant, Waterhouse, Humble Lion, Portmore
    United, Harbour View.
  - **Seeded inactive (answer, not worth reading):** FOX Sports MX and ESPN
    Deportes (0 highlights in 11, talk shows), Todo Deportes TV and FOX Deportes
    Honduras (0 highlights), Mazatlán FC (farewell video 2026-04-30, replaced by
    Atlante), Arnett Gardens (quiet since 2025-12), Molynes United (since 2024).
  - **Not seeded:**
    - SportsMax TV: no uploads since 2025-07.
    - JFF: national teams only, none in 30 days.
    - Tigo Sports Guatemala: quiet since 2023.
    - Tigo Sports Honduras: no channel found.
    - Lobos UPNFM: 2020. Antigua GFC: 2025.
    - Municipal: fan and Shorts-only channels.
    - "C.D. Platense | Canal Gallo" and "Deportes Canal 4": El Salvador.
    - "TVC Deportes" (@tvc.deportes): Mexico's, talk only.
    - Television Jamaica, HCH, Azteca Guate: general channels.
    - Search found no channel for Atlante, Marathón, Xelajú, Cavalier or
      Arnett Gardens (active).
- **is_highlight (`videos/highlight.mjs`), from the title:**
  - **Yes:** a highlight word (resumen, highlights, goles, gol, golazo, lo
    mejor, all goals, extended highlights…), or a result line "X 2-1 Y" (how
    the league channels title summaries).
  - **Never:** press conferences, podcasts, interviews, "exclusiva", analysis,
    named talk shows (Futbol Picante, Línea de 4, Cuadro Titular, La Última
    Palabra…), boxing and baseball.
  - **Not unless a highlight word is there too:** "EN VIVO" / "LIVE", full
    matches, previews, reactions.
- **Team matching (`videos/teams.mjs`, names in `videos/team-aliases.json`):**
  - Only teams of the channel's country. A club's own channel counts for its
    club.
  - An alias ("Motagua", "Cruz Azul", "Chivas", "Cremas") counts anywhere.
  - A guarded name counts only from a channel of that country and league, and
    only with another club of the league across "vs" / "-" / a score, or both
    clubs of a stored fixture within 4 days. Guarded names: "América",
    "Municipal", "Olimpia", "Real España", "Marathón", "Platense", "Victoria",
    "Vida", "Harbour View", "Portmore", "Mount Pleasant", "Arnett Gardens",
    "Cavalier", every single-word name.
  - Phrases that are not the club are removed first ("Copa América", "Real
    Madrid", "Olimpia Paraguay", "América de Cali"…).
  - **Women's, youth, reserve and Expansión sides never count** ("Femenil",
    "FEM", "Sub-19", "Sub-21", "Cruz Azul Hidalgo"): the teams table is the
    first team. The dry run found them on club channels every week.
- **What the Fútbol page gets (`app.football_videos`, and
  `football_page.videos` with 6 of each):**
  - **team:** their team's videos, 30 days, highlights first. Other videos
    only from their club's own channel or the league's, so a broadcaster's talk
    show or another club's press conference is never "their team's video".
  - **league:** 7 days of highlights from the league's channel, or from a
    broadcaster when two clubs of the league are named. A video already in
    team is not repeated.
  - Channels are mixed round-robin, so one channel cannot fill the list.
  - A member without a team gets their country's league.
  - `stale` is true after 3 hours without an ok or partial run.
- **Dry run 2026-09-14 (`scripts/fetch-videos.mjs --dry-run`):** 37 channels,
  329 videos, 57 highlights, 329 thumbnails, 0 failures. Thumbnails: median
  13,104 B, maximum 13,982 B.
- **Reverse:**
  - Stop reading a channel: `update video_channels set active = false where key = …`,
    and seed the change. Its stored videos are no longer shown.
  - Wrong match: add the phrase to `not` or `squads`, or move the name to
    `guarded`, in `team-aliases.json`.
  - Stop the feature: remove the `videos` job from `scheduler.mjs` and set
    `feed_expectations.active = false`. Stored videos age out in 60 days.

### 3.26 Fútbol v2: national teams, Shorts, video categories, team news (2026-09-15)

The owner asked: "improve the sports page. More videos please." The football
data provider's account is suspended (no fixtures, standings or live scores),
so the page is made rich from verified videos and news until that is fixed.
Stance of 3.24 and 3.25 unchanged: links, small cached thumbnails, never a
player, never full text.

- **Migration 0050_futbol_v2.sql.**
  - `video_channels.kind` gains `national` (a federation's channel) and
    `confederation` (Concacaf, no country); `women` marks a women's
    national team's own channel (none found).
  - `videos.is_short`, `videos.category` (`highlight | goals | interview |
    preview | other`), `videos.classified_at`. `is_highlight` stays for 0049
    pages and writers: a trigger keeps it equal to `category in (highlight,
    goals)`.
  - `video_nations(video_id, country, women, matched, rule)` and
    `news_teams(item_id, team_id, matched, rule)`, precomputed at ingest;
    `news_items.teams_checked_at`.
- **Channels (verified live 2026-09-15; canonical link and externalId agreed,
  feed answered with the same id).**
  - **Active, national:** Selección Nacional de México (FMF), FFH + (Honduras),
    JFFLIVE (Jamaica, quiet since 2026-07-22).
    - FMF and JFF post the men's and the women's teams on one channel. There
      is no separate official women's channel.
  - **Active, broadcasters:** TUDN USA, Multicable TV (Honduras), Tiki Taka de
    Guatemala, Television Jamaica (TVJ Sports clips); plus Concacaf
    (confederation).
    - **Owner review:** Multicable (no channel description) and Tiki Taka
      (a radio show, like Guatefutbol).
  - **Seeded inactive:**
    - FEDEFUT Guatemala: official, last upload 2022-12. Guatemala's national
      team reaches members only through other channels' titles.
    - Nuestro Diario: general-news Shorts.
    - FOX Sports MX: rechecked, talk only.
  - **Not seeded:**
    - Talk only: Claro Sports.
    - Entertainment: ViX. The @vixdeportes handle does not exist.
    - Interviews and fan clips only: Diario Diez.
    - General news: La Prensa HN, El Heraldo, HCH, TV Azteca Honduras, Prensa
      Libre, Emisoras Unidas, Soy502, Gleaner, Observer.
    - Dead: SportsMax (2025-07), Tigo Sports GT (2023), DXTV Guatevisión
      (2020), old FENAFUTH and JFF channels.
    - Not ours: "cvm_sports" (kabaddi), JFootballTV (a Japanese vlogger).
    - Personal or unofficial channels.
    - Not found: Tigo Sports Honduras.
    - Betting, refused: CalienteBooksMx, Betcris.
- **Shorts (`scripts/fetch-videos.mjs --dry-run`).**
  - The only sign in the feed is the `/shorts/` link; `media:thumbnail` is the
    same 480 x 360 `hqdefault.jpg`.
  - Stored with their `/shorts/` url and a 180 x 320 thumbnail cut from
    hqdefault's centre 9:16 band, at most 14 KB.
  - **Kept only when worth the data:** highlights or goals of a league or
    national channel, or highlights, goals, interviews or previews naming a
    club or national team (or on its own channel). Every `other` Short
    (tunnels, POV, sponsor clips, reactions) is skipped.
- **Categories (`videos/highlight.mjs classifyVideo`), from the title.**
  - Named talk shows, other sports, podcasts, analysis, training and betting
    words: other.
  - Press conferences and statements ("expresa", "speaks", "#LaReacción"):
    interview.
  - Summary words or a result line: highlight.
  - Goal words ("gol", "GOOOL", "anotación", "opens the account"): goals.
  - Previa, se viene, ahead of: preview.
  - Live and full matches: other.
  - A women's, youth or reserve side's video is `other`, never a highlight of
    the men's league, unless it is the women's national team.
- **National teams (`videos/nations.mjs`, names in `nation-aliases.json`).**
  - **Aliases count anywhere:** "Selección Mexicana", "El Tri", "Selección de
    Honduras", "Reggae Boyz".
  - **Guarded names count only in a match line against another national
    team:** "México", "Honduras", "Guatemala", "Jamaica", "La H", "Bicolor",
    "Catrachos", "Chapines". Places, leagues and clubs named like a country
    are removed first ("Ciudad de México", "Liga Nacional de Guatemala",
    "Honduras Progreso", "Jamaica College").
  - **A federation channel's title counts only when it names the team.** The
    dry run found the Reggae Girlz' coach under nameless titles, and FFH's
    referee analysis. Youth, Olympic, beach and esports sides count for no one.
  - **The women's team is stored with `women = true`:** "Femenil", "Women",
    "Reggae Girlz".
- **Team news (`news/teams.mjs`, rules in `team-aliases.json` → `news`).**
  - Clubs of the outlet's country only.
  - An alias counts with a football word in the title or summary, or with
    another club of its league named.
  - A guarded name ("América", "Municipal", "Olimpia", "Victoria") also needs
    a match line or "el/del/al" right before it.
  - Removed first: "río Motagua", "Los Tigres del Norte", "México-Toluca",
    "Policía Municipal", "Ministerio de Comunicaciones".
  - Football words inside "partido político" or "equipo técnico" do not count.
  - A story is matched at ingest; stored stories are backfilled (2,000 per
    run). A country with no clubs in `teams` leaves its stories unchecked,
    never "about no club".
- **Pages.**
  - `app.football_videos` (default 24 per list):
    - `team_videos`: 45 days. Highlights and goals first, then interviews and
      previews (not another club's), then the club's and league's other
      videos.
    - `league_videos`: 14 days, highlights and goals only.
    - `shorts`: 14 days, the team's, then the league's, then the national
      team's.
    - `national` and `national_women`: 30 days; `other` only from the
      federation.
  - `app.team_news`: 7 days, news_page's item shape. A graphic story is never
    first; a list of only graphic stories is empty.
  - `football_page.videos`: team 10, league 10, shorts 10, national 8.
  - `football_page.team_news`: 4.
- **Dry run 2026-09-15.**
  - **Videos:** 45 channels, 441 videos (19 Shorts), 104 Shorts skipped, 0
    thumbnail failures. Thumbnails: median 13,167 B, max 13,982. Short
    thumbnails: median 12,729, max 13,895.
  - **News:** 25 club matches over 27 outlets, none wrong on review.
- **Reverse:**
  - Switch a channel off:
    `update video_channels set active = false where key = …`.
  - Wrong national match: `nation-aliases.json`.
  - Wrong news match: `team-aliases.json` → `news.not`.
  - Stop Shorts: skip them again in `videos.mjs` `assess`; stored ones age
    out in 60 days.
