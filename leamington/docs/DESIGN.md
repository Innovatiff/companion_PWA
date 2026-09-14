# Design system

For all three surfaces: **Hoy** (the client PWA, `apps/app`), the affiliate
portal (`apps/affiliate`) and the owner portal (`apps/admin`). Every screen
inherits this file. When a screen needs something this file does not cover,
add it here first.

---

## 1. The device is the brief

A cheap Android phone, 2 bars of bunkhouse wifi, metered prepaid data. The
affiliate portal is used at a counter with a line waiting. So:

- **Payload is the product.** Server-rendered HTML, inline CSS, no framework
  JavaScript, no webfonts, no icon fonts. Images only from our own domain:
  team crests, league logos, town photos, and Hoy's illustrations (small cached
  SVG files, section 4).
- **One glance.** The client home screen is a morning message, not a dashboard.
- **Big targets.** Every tappable thing is at least 48 px tall.

### Budgets (compressed bytes on the wire, including headers)

| Surface | Cold page | Warm page | JavaScript |
| --- | --- | --- | --- |
| Hoy | ≤ 25 KB, sign-in plus home | ≤ 12 KB, each page | ≤ 2 KB of our own, inline; zero framework |
| Hoy illustrations | ≤ 1.5 KB gzipped each, cached 30 days, outside the page budgets | | none |
| Affiliate portal | ≤ 25 KB | ≤ 10 KB | none |
| Admin | ≤ 40 KB | ≤ 20 KB | none |

Hoy's budgets were raised on 2026-09-14 (from 15 KB cold and 5 KB warm) for the
round-1 look the owner asked for: pictures, motion and bigger type cost about
1.5 KB more CSS and markup per page, while the pictures themselves are cached files.

Measured 2026-09-14 after round 1 step 2 ("Ahora", Letra grande; local, demo
client DEMXHN42, the fullest home):

| Hoy page | Bytes |
| --- | --- |
| Cold: sign-in plus home (redirect, login, sign-in, home, sw.js, manifest, open ping) | 19,813 |
| Home (warm) | 9,320 |
| Clima | 9,272 |
| Fútbol | 7,750 |
| Tasa | 7,518 |
| Transporte | 7,475 |
| Consulado | 7,436 |
| Emergencias | 7,140 |
| Feriados | 7,002 |
| Más | 6,991 |
| Lotería | 6,751 |
| Setup step | 6,744 |
| Notificaciones | 6,625 |
| Escuela | 6,451 |
| Illustrations, largest | 498 gzipped (crown.svg); first load of the 18 used: 18,228 |

Every page is measured with `scripts/measure.mjs` and the numbers are reported.

## 2. Truth before tidiness

The standing rule, **SILENCE IS NEVER EVIDENCE**, drives the UI more than any
visual choice.

Every piece of data is in one of three states, and they are never collapsed:

| State | Meaning | What the client sees | What the portals see |
| --- | --- | --- | --- |
| **present** | Current data, from our database, within its freshness window | The line | The value |
| **confirmed-absent** | The source answered that there is nothing | Nothing (the line is absent) | "None", with when it was confirmed |
| **inconclusive** | We could not tell: stale, unreachable, unverified | Nothing (the line is absent) | The reason, verbatim from the database |

- **Absent means absent.** No skeleton, no spinner, no "cargando", no empty
  shell, no placeholder text, no stale value with a small grey date.
- **Never reassurance from silence.** No screen ever says "no alerts", "all
  clear", "sin avisos" or "no matches" on the strength of an empty query.
  - The weather-alerts section says when the official source was last checked:
    "Revisamos los avisos de ODPEM a las 7:02".
  - If that check is stale, it says so: "No hemos podido revisar los avisos
    desde las 3:15", and links to the agency's own page.
  - A picture never implies calm either: no check marks or shields beside
    "we checked"; that row shows a clock.
- **Verbatim for agencies.** Alert text is shown exactly as the agency wrote
  it: agency name, severity, place, issue time, and a link to the source. It is
  never rewritten, summarised, translated or paraphrased.
- **Verified dates.** Every static record shows "Verificado: 3 de marzo".

## 3. Tokens

Inline CSS only. `APP_CSS` (with its parts `TOKENS` and `BASE`) in
`packages/shared/src/ui/css.ts` holds Hoy's canonical values; `PORTAL_CSS`
holds the portals' (section 9).

### Colour

Hoy (owner's direction, 2026-09-14, after a reference fitness app): a soft
lavender ground, pure white cards with a large radius and diffuse shadows, and
one strong blue-violet primary for the current tab, primary buttons and
highlights. Warm sun yellow and rain blue appear only in pictures and weather.

| Token | Value | Use |
| --- | --- | --- |
| `--ink` | `#1b1f3b` | Text |
| `--paper` | `#eef0fb` | Page ground (lavender) |
| `--card` | `#ffffff` | Cards, inputs, tab bar |
| `--tile` | `#eceefd` | Picture tiles, ring and bar tracks |
| `--muted` | `#5a6080` | Secondary text and labels (AA on paper, tile and card) |
| `--line` | `#e6e8f5` | Dividers |
| `--brand` / `--brand-2` | `#4f5bd5` / `#5d69e0` | Primary buttons, the centre tab, pills, rings (white text passes AA on both) |
| `--brand-ink` | `#3f4bc4` | Links and indigo text on white |
| `--rain` | `#2f74d0` | Rain rings and bars |
| `--danger` | `#b42318` | Errors, the red alert level |
| `--warn` | `#9a4a00` | The orange alert level |
| `--caution` | `#7a5f00` | The yellow alert level |
| `--ok` | `#0f7a55` | Confirmations, tap-to-call |
| `--focus` | `#1a56db` | Focus outline |

The home hero follows Leamington's sky (section 4); every gradient keeps white
text at AA, and small text on photos sits on a dark layer.

Colour is never the only signal. An alert level is written in words ("Rojo",
"Naranja", "Amarillo"), and the colour only reinforces it.

### Type

- **Font:** `system-ui, -apple-system, Roboto, "Segoe UI", sans-serif`, and
  `ui-monospace, "Roboto Mono", monospace` for codes. Nothing is downloaded.
- **Base size:** 17 px, line height 1.5. Bold headings, few words.
- **Scale:**

| Use | Size |
| --- | --- |
| Greeting (hero) | 1.8 rem, 800 |
| Tab page title | 1.8 rem |
| Big number in a row (temperature, rate, days) | 2.1 rem, 800 |
| Clima temperature | 3 rem |
| Row line | 1.15 rem, 700 |
| Section title | 1.12 rem, 750, sentence case |
| Body | 1 rem |
| Small | 0.85 rem |
| Access code | 2.1 rem, letter-spaced |

### Space and shape

- **Spacing:** steps of 0.25 rem. Page gutter 1 rem. The client column is at
  most 34 rem wide; portals are at most 64 rem.
- **Shape:** cards 20 px radius, hero 24 px, picture tiles 16 px, buttons,
  chips and segmented controls fully rounded. Soft diffuse shadows, no borders
  on cards.
- **Targets:** tappable targets are at least 48 px tall.

### Letra grande

`<html class="big">` (set by `_document` from `req.appTextSize`, which
`loadClient` and home set from `clients.text_size`) raises the root size to
125% and body text to 20 px, darkens and thickens muted text, stacks Más and
paired cards into one column, drops row chevrons, makes targets at least 56 px,
and keeps every page within a 360 px screen.

## 4. Components

- **Home top row.** The member's initials in a round avatar; a centre indigo
  pill "✦ Miembro" (links to Más; the member card comes in round 2); a round
  white bell linking to `/clima#avisos`. The bell shows a red dot only while
  our current copy of the official warnings lists at least one for their town;
  the dot carries its own `data-until`. Without that it is just a bell, never a
  sign of calm.
- **Hero (home greeting, login, expiry, error pages).** An indigo gradient card
  with a subtle diagonal light: a small label pill, the big white heading, and
  a picture on the right.
  - **Live sky (home).** The hero's colours follow Leamington's sky right now,
    computed on the server from sunrise and sunset (`skyPhase` in
    `lib/ui.tsx`, 42.0531, -82.5998, America/Toronto): dawn and dusk (45 min
    either side of sunrise and sunset) are warm gradients, day is indigo to
    sky blue with a sun, night is deep indigo with twinkling stars and a moon.
    `HOY_SKY_PREVIEW=1` (local only; production never sets it) lets `?sky=`
    force a phase for screenshots.
  - **Hometown photo.** When we hold one, it sits in the hero as a rounded
    thumbnail with the town's name and its full credit.
  - **Hometown credit.** In the hero the credit is one line with an ellipsis,
    license first ("CC BY-SA 4.0 · Foto: {author}"), both linked, so the
    license always shows.
- **Rows (home lines and cards).** A white card: a picture on a lavender
  rounded tile (or a crest or date block), a short label, then the line, with
  its number pulled out large where the line has one ("La Ceiba / 31°",
  "18.51 HNL ↑ / 1 CAD · Más alto en 12 días", "75 días"). A linked row ends in
  a round chevron button. Each still carries `data-line` and `data-until`.
  Supporting truths ("tasa de referencia", verified dates, credits) stay.
- **Ahora (current conditions, 0040).** The weather right now: the median of at
  least two providers observed within 90 minutes (`app.current_summary`).
  - Shown only with a temperature and an observation time, and only until its
    `valid_until`. Every "Ahora" element carries `data-line`/`data-until` (plus
    `data-temp`, `data-at`, `data-cond`, `data-day` for the smoke test); home's
    open script and Clima's small expiry script drop it once past, also on a
    page restored from the back/forward cache. No data, no block: never a
    placeholder.
  - The temperature is shown as the data wrote it, so a range ("12–15°") stays
    a range; `temp_c` is never shown alone.
  - The picture follows the reported sky: clear is sun or moon, partly cloudy
    is partly-day or partly-night, cloudy or no reported sky is a plain cloud,
    and fog, drizzle, rain, storm and snow have their own.
  - **Clima:** an "Ahora" card first under each town's photo, and inside each
    Canada card: the picture, the temperature big, its word, "a las 8:45am" in
    the place's own timezone, and chips for feeling, humidity and wind (each
    only when two providers gave it). The day's forecast is secondary: ↑high
    and ↓low chips and the rain ring.
  - **Home:** the hometown and Leamington rows lead with "Ahora" and the time,
    with the forecast's ↑↓ beside it; without it they show the forecast high
    labelled "máx". The forecast version is also in the markup (`.fc`) and
    appears if "Ahora" expires on a cached copy. Watched towns show their
    "Ahora" temperature the same way.
- **Letra grande.** Más has a "Tamaño de letra" card with two big previews,
  "Aa Normal" and "Aa Grande", the current one marked. It posts to
  `/api/text-size` (same-origin and session checks as setup; only "normal" or
  "large"), which saves `clients.text_size` and returns to Más.
- **Section header.** A bold title, and an indigo "Ver todo" link on the right
  where the section has its own page.
- **Section page header.** Tab pages (Clima, Tasa, Más): the title on the left
  and the page's picture on the right. Pages under Más: a round white back
  button, the centred title, and the picture.
- **Ring.** A thick circle filled to a real percentage (Clima and home: chance
  of rain) with the number and unit inside. **Bars:** thin rounded bars (rain
  chance, temperature range, setup progress, where today's rate sits in its
  30-day range).
- **Segmented pills.** A white pill track with rounded pill links (Clima's
  jump links to warnings, Canada and each town); a current one is solid indigo.
- **Illustrations.** Small animated SVG files in `apps/app/public/art`, drawn
  in one flat style (indigo and lavender, warm sun yellow and orange, rain
  blue):
  - sky and weather: sun, moon, partly-day, partly-night, cloud, fog, drizzle,
    rain, storm, snow;
  - sections: football, money, calendar, school, consulate, phone, bus,
    lottery, bell, crown, plane, warning, settings, clock, pin.
  - Each is at most 1.5 KB gzipped, used as
    `<img src="/art/x.svg?v=N" width height alt="">` (decorative; the words
    carry the meaning), served with `public, max-age=2592000, immutable`, and
    cached by the service worker. Bump `ART_V` in `lib/ui.tsx` when a file
    changes.
  - Motion lives inside each file as CSS keyframes (rays turning, clouds
    drifting, rain falling, lightning, stars twinkling, a plane floating;
    section pictures move a few times and rest) and stops under
    `prefers-reduced-motion: reduce`.
  - A forecast day without rain gets the partly-cloudy picture, never a promise
    of sun; current conditions will pick the exact sky.
- **Motion (pages).** CSS only, transform and opacity only, sizes reserved so
  nothing shifts: cards fade and rise in, staggered; bars and rings fill from
  zero; whole numbers count up (`@property --n` with `counter()`, the real
  number in the text for screen readers); the bell dot pulses three times.
  Nothing in the page loops except the illustrations and the night stars.
  Everything stops under `prefers-reduced-motion: reduce`.
- **Quick cards (Hoy home, "Útil para ti").** Below the lines, from
  `app.home_extras`: the next holiday (date block, "En 2 días"), Ontario's 911
  (tap to call, red card), their consulate (city, tap to call the first number),
  the latest official draw (numbers as balls). Each renders only when its record
  exists and shows its verified date; time-bound ones carry `data-line` and
  `data-until` like the lines.
- **Crests.** `<img src="/crest/{teamId}">` from our own domain, only when
  `team_crests` holds one; otherwise the team's initials in a coloured circle.
  Each crest at most 50 KB, cached 30 days.
- **Page-only CSS.** Rules used by one or two pages (tables, match and forecast
  cards, the rate chart) live in `apps/app/lib/page-css.ts` and are inlined by
  those pages only, so the home screen does not carry them.
- **Tab bar (Hoy).**
  - Fixed to the bottom: a white bar with rounded top corners and 5 items in
    this order: Inicio · Fútbol · Clima · Tasa · Más (English: Home · Football
    · Weather · Rate · More). Clima is a raised round indigo button in the
    centre, with a soft glow ring and its label under it.
  - Each item is an inline outline SVG icon (`currentColor`) above a text
    label. There are no icon-only items. The current item is indigo, on a soft
    pill.
  - Items are plain `<a>` links (`apps/app/lib/frame.tsx`); the current page is
    marked with `aria-current="page"`. Tasa links to `/mas/tasa`.
  - The bar respects `env(safe-area-inset-bottom)`, and the page gets matching
    bottom padding so nothing hides behind it.
- **Section page.** The page header, then short sections with `h2` headings.
  Rows are list items or picture rows: the main text, then a secondary line in
  `small`.
- **Alert card.**
  - A white card with a level word in a coloured pill and a colour bar, then
    the agency's headline or event, verbatim.
  - The place (`areaDesc`, verbatim), the issued and expires times, and a
    "Fuente: {agency}" link to `source_url`.
  - For Mexico, SMN's `areaDesc` is always shown.
- **Setup question.**
  - One question per screen: a progress bar with "Paso 2 de 5", the step's
    picture, a large label, then the input, then a primary button
    ("Siguiente").
  - A "Saltar" link.
  - Progress is saved on the server on every step, so a closed browser resumes
    where it left off.
- **Search.** A plain GET form. Results are server-rendered links showing the
  place and its department, e.g. "La Ceiba — Atlántida". Matching is
  accent-insensitive and partial.
- **Once-a-day prompt (home).**
  - A single line at the top slot's position, e.g. "Elige tu municipio para ver
    el clima →".
  - Shown at most once per local day. It is never modal and never blocks the
    rest of the screen.
- **Buttons.** Hoy: primary is a full-width indigo gradient pill with white
  text; secondary is a white pill with indigo text. Portals: section 9.
  Destructive actions in the portals need a second confirming step.
- **Forms (portals).** A label above each field, one column, 48 px inputs, and
  error text directly under the field, in words.
- **Access code.**
  - Monospace, grouped 4 + 4 (`ACDE-FG34`), inside a dashed box.
  - Beneath it, a line saying which letters and digits are never used.
  - A print button uses `window.print()` from a tiny inline handler; the print
    stylesheet shows only the code and the client's name.
- **Tables.** A real `<table>` with a `<caption>`, inside an
  `overflow-x: auto` wrapper. Numbers are right-aligned with
  `font-variant-numeric: tabular-nums`. On phones, the key column comes first.
- **Stat (portals).** A big number, a label, and the period it covers, e.g.
  "$96.00 — ganado este período". A number without its period is not shown.
- **Status chips (portals).** Words, not colour alone: "Activo", "Vence en 12
  días", "Vencido", "Prueba".

## 5. Language

- Spanish is the default everywhere. Hoy uses English when the client's country
  is JM (`clients.language = 'en'`).
- The portals use the signed-in person's language setting (Spanish by default).
- Use informal "tú" in Hoy, matching the existing login copy. The portals use
  neutral imperatives ("Registrar cliente").
- **Dates:** "3 de marzo", "3 March". **Times:** "7pm" / "7:30pm" in Hoy; 24 h
  in the portals.
- **Money:** CAD, `$20.00`.
- **FX:** labelled "tasa de referencia" / "reference rate"; never a provider
  name, a ranking or a prediction.

## 6. Offline and caching

- **Hoy:** the service worker fetches pages network-first with a 4-second
  fallback to the last cached copy. Every time-bound line carries its own
  expiry, and the page drops expired lines. A cached page says "Actualizado
  7:02". Illustrations are cached cache-first (their URLs are versioned).
- **Portals:** no offline mode. A portal page that cannot load must fail
  visibly, never show old numbers.

## 7. Accessibility

- Semantic HTML, a `lang` attribute on `<html>`, labels on every input, and a
  visible 3 px focus outline in `--focus`.
- Text contrast is at least WCAG AA; the muted colour passes on the paper
  background.
- Links read as what they do ("Ver aviso de ODPEM", not "aquí").
- Pictures are decorative (`alt=""`); icon-only controls (back, bell) carry an
  `aria-label`.
- All motion respects `prefers-reduced-motion`.

## 8. Data rules the UI must never break

1. The client never calls an external API. Every page renders from our
   Postgres.
2. Affiliates see only their own clients, enforced by row-level security in
   the database, not just by the page.
3. No lottery odds, predictions, "hot numbers" or buy links.
4. Never show a league table from a previous season as current.
5. Test clients and test affiliates are marked "Prueba" in the portals and
   excluded from sales, revenue and payouts.

## 9. Portal look: the dashboard frame (owner's direction, 2026-09-13)

The affiliate portal and admin share one dashboard look: `PORTAL_CSS` in
`packages/shared/src/ui/css.ts` and the components in
`packages/shared/src/ui/Portal.tsx`. It replaces the portal parts of section 3
(the ink header bar and paper background). Hoy keeps its own look.

- **Frame (`Shell`).**
  - A white sidebar with the brand ("Hoy" plus "Admin" or "Afiliados"),
    icon + label links, and a count badge where a real count exists.
  - Secondary links sit below a divider; the signed-in person and a sign-out
    icon button sit at the bottom.
  - On phones the sidebar becomes a top card whose links wrap onto as many rows
    of links.
- **Header band (`Hero`).**
  - A blue gradient band with the page title, one line of context, and the
    page's main action as a white button (`HeroAction`).
  - When a page has headline numbers, `StatCard`s overlap the bottom of the
    band: icon, label, big number, and its period in small text. The period
    rule from section 4 still holds.
- **Content.** White rounded `Card`s with a title and an optional "Ver todos"
  link.
  - Tables inside cards: uppercase column headers, row hover, and a caption
    kept for screen readers (`.sr`) when the card title already says it.
  - `.list` rows for short lists, `.pipeline` for counts across stages, and
    `.grid` for a main column plus a side column.
- **Controls.**
  - Primary buttons: indigo gradient. Secondary buttons: white with a border.
  - `.pill` for small in-row actions ("Ver", "Renovar").
  - Chips are soft pills in words: good, warn, bad, test.
- **Sign-in pages (`AuthLayout`).** A single centred card on a soft gradient.
- **Unchanged rules:** system fonts, no framework JavaScript, inline icons (no
  icon font), 44 px targets, every number with its period, absent means absent,
  and the byte budgets in section 1.
