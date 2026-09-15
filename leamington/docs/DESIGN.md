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

Measured 2026-09-14 after Noticias (local, demo clients with real stories; the
fullest home is DEMXMX42's at 10,927). Every warm page keeps at least 1 KB under
its budget:

| Hoy page | Bytes |
| --- | --- |
| Cold: sign-in plus home (redirect, login, sign-in, home, sw.js, manifest, open ping) | 22,727 |
| Home (warm; DEMXHN42 10,859, DEMXMX42 10,927) | 10,927 |
| Tasa, Mes | 10,616 |
| Noticias, the fullest section (national, HN) | 10,378 |
| Clima | 9,954 |
| Hoy en Leamington | 9,598 |
| Tu semana | 9,391 |
| Feriados | 8,917 |
| Miembro | 8,761 |
| Fútbol (with two video strips, DEMXMX42) | 10,160 |
| Videos (/futbol/videos, the league tab, DEMXMX42) | 8,925 |
| Lotería | 8,573 |
| Más | 8,496 |
| Transporte | 8,382 |
| Consulado | 8,373 |
| Emergencias | 8,071 |
| Setup step | 7,704 |
| Notificaciones | 7,456 |
| Escuela | 7,353 |
| Illustrations, largest | 523 gzipped (badge-temporada.svg); first load of the 37 used: about 39,000 |

Pictures on Noticias are outside the page budget and cached for 30 days: at most
one lead picture (at most 45 KB) is loaded eagerly; every thumb (at most 10 KB)
is lazy. The home card's picture is lazy.

To keep home's margin with the news card, the dark rules follow the member's
theme (only the copy they can use), and rules only other pages use (rows in a
card, the error box, tap-to-call rows, picture rows, setup choices) moved to
those pages' own CSS.

Our inline JavaScript: home 1,676 bytes (the open script and the expiry
script), the other kept pages 338 bytes (the expiry script): within the 2 KB
budget.

Offline copies drop what is over: every hour column and next-hours cell expires
at the end of its hour, and the hourly line with the first hour (dots and
labels stay in their own columns).

Round 5 polish:

- **Lotería results.** The latest draw of each game is its card, with its
  source link and verified time. The earlier draws of the two days fold under
  "Sorteos anteriores" as one short row each (balls, date and time, its own
  verified time).
- **Extra result fields.** A result's extra fields show only under the
  operator's own name, as a small labelled ball: "Más 1" (Loto Honduras),
  "Adicional" (Melate), "Bonus Ball" (Lotto). The operator's draw number shows
  as "Concurso 4102" or "Draw 40112". Prize-rule flags (megaBall,
  multiplicador, reintegros), "tipo" and unknown keys are not shown. A raw
  field key is never printed.
- **Tu semana early in the week.** With fewer than 3 stored rate days this
  week, the rate card is "Tasa · últimos 7 días" from fx_history, with its
  dates, circles, high and low; it is never called this week. With no official
  result this week, "Lotería · últimos resultados" shows each current game's
  latest result, dated and verified. With no data, the part is absent.

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
- **Base size:** 16 px, line height 1.5. Bold headings, few words (owner's
  direction 2026-09-14, from his iPhone: the type was too big).
- **Scale:**

| Use | Size |
| --- | --- |
| Greeting (hero) | 1.55 rem, 800 |
| Tab page title | 1.55 rem |
| Page title (with back) | 1.2 rem |
| Big number in a row (temperature, rate, days) | 1.75 rem, 800 |
| Clima "Ahora" temperature | 2.8 rem (1.9 rem inside a Canada card) |
| Rate on Tasa, gauge value | 2.7 rem, 2.45 rem |
| Row line | 1.02 rem, 700 |
| Section title | 1.05 rem, 750, sentence case |
| Body | 1 rem |
| Small | 0.82 rem |
| Access code | 1.75 rem, letter-spaced |

### Narrow screens: nothing tight, nothing out of its box

- **Vertical when tight.** Two or three boxes side by side stack into one
  column unless each holds only a short label or number: the Canada cards, the
  home Emergencias and Consulado cards (each full width, horizontal inside), Allá
  y aquí (one row per place), the Más menu (one row per section), and settings
  (Tema and Tamaño de letra are full-width option rows: a preview, the name and
  a short hint, a check on the current one; the whole row is the button).
- **Rows wrap instead of squeezing.** Flex rows give their text a real basis and
  wrap (the number moves under the picture) rather than shrinking text to
  nothing; flex and grid children carry `min-width:0`.
- **Never out of the box.** Words wrap at word boundaries (`hyphens:auto` on
  titles and labels, `overflow-wrap` everywhere). Only numbers that must not
  break (temperatures, times, money, phone numbers) are `nowrap`, and they get
  the room. Credits are shown whole, never clamped.
- **Checked, not assumed.** `apps/app/scripts/layout-audit.mjs` opens every page
  at 320, 360, 375, 390 and 430 px, normal and Letra grande, light and dark, and
  with a wide-font stress (Verdana, standing in for iOS's wider glyphs), and
  fails on a page that scrolls sideways, anything past its box, anything wider
  inside than out (other than the listed horizontal scrollers) and text clipped
  by overflow. It must end with zero failures.

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
118.75% and body text to 19 px (every rem size grows with it, so it stays
clearly larger than the 16 px normal), darkens and thickens muted text, drops
row chevrons, shrinks previews and gaps so words keep their room, makes targets
at least 56 px, and keeps every page within a 320 px screen (the layout audit
checks it).

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
    labelled "máx"; "Ahora 9:48am" sits on its own small line under the number.
    The forecast version is also in the markup (`.fc`) and
    appears if "Ahora" expires on a cached copy. Watched towns show their
    "Ahora" temperature the same way.
- **Letra grande.** Más has a "Tamaño de letra" card with two big previews,
  "Aa Normal" and "Aa Grande", the current one marked. It posts to
  `/api/text-size` (same-origin and session checks as setup; only "normal" or
  "large"), which saves `clients.text_size` and returns to Más.
- **Tú eres Hoy (round 2, 0041).** Every value comes from `app.member_card`,
  `app.member_badges`, `app.season_progress` and `app.home_more`; nothing is
  estimated (`apps/app/lib/member.tsx`).
  - **Member card** (`/mas/miembro`, opened by the "✦ Miembro" pill): a deep
    indigo-to-violet card with a fine diagonal pattern and a shine that sweeps
    once. The "Hoy ✦ Miembro" mark, the crown, a gold "★ Fundador 2026" pill only
    for founders, the full name, "Miembro #412" only when there is a number, the
    code large and letter-spaced, "Desde" and "Vigente hasta" (or a status
    chip). Below: who registered them (when a business did), renewals (when
    any), and one line: renewal works at any Hoy business. No payment prompts.
  - **Badges:** a two-column grid of eight medals, each its own animated
    picture, popping in staggered. Earned: full colour, the name, "Ganada {día}"
    when the day is on record. Locked: grey, a small n/of ring where 0041 counts
    progress, and a how-to line that says exactly what is counted ("Abre 5
    secciones distintas", "Abre Hoy 7 días distintos", "Agrega otro
    municipio"). Home has one row: a crown, "3 de 8", a thin bar.
  - **Season ring** (home, replacing the countdown line): an indigo gradient
    card. season: the percentage huge and a thick white ring with the days
    left. countdown: the days big, an empty ring with a plane (no arrival on
    record, so no share of the season is claimed) and "Anota tu llegada".
    trip: a plane and the days. Days are never negative; a past date is said
    in words.
  - **Arrival date:** "Llegué a Canadá el…" on Más, for seasonal members only,
    posting to `/api/arrival` (same-origin and session checks; empty clears
    it). A refused date says why and changes nothing.
  - **Welcome, once:** after setup, before home, never over the expiry screen.
    The hometown photo full-bleed with its full credit (or the live sky), a
    white rounded card with a waving hand, "Te damos la bienvenida a Hoy,
    {nombre}" (neutral in gender), "Miembro #412 · Fundador", and a big round
    arrow with an outer ring; the arrow and "Saltar" post to `/api/welcome`.
    No script.
  - **Allá y aquí** (home): the hometown and Leamington side by side, each with
    its local time, a sun or moon from sunrise and sunset there, and its
    temperature only with "Ahora"; the difference between them ("Allá: 2 h
    menos", "Misma hora"). The clocks are the render time, so the card holds 15
    minutes.
- **Tu dinero (round 3, 0042).** FX stays descriptive (CLAUDE.md): "tasa de
  referencia", never a provider, a ranking, a forecast or advice, and no colour
  that says good or bad (charts and chips are indigo and lilac only).
  - **Tasa** (`/mas/tasa`, after the reference's Analytics screen): a round back
    button, the centred title, and a bell to #avisame. The rate big with its
    unit, "1 CAD · tasa de referencia", and the date on the right; a rate that
    is not current says plainly whose date it is and that it is not today's.
    Semana / Mes / 3 meses as pill links (?r=7, 30, 90).
  - **Chart** (server-rendered inline SVG, `apps/app/lib/money.tsx`): 7 and 30
    days are bars, one per real stored day (MXN has no weekend quotes, and no
    bar is drawn for them), lilac with the latest solid indigo, growing from the
    bottom, staggered; 90 days is a smooth indigo line that draws on, with a soft
    area and dots at the high and low. Under it: "Más alta" and "Más baja" with
    dates, and the change as a neutral chip ("+2.62% desde el 16 ago"). Every
    stored day stays readable in a "Todos los días" table.
  - **Semana de la tasa:** seven circles, one per real stored day, the weekday
    above: up is solid indigo with ↑, down outlined with ↓, same outlined with =,
    unknown dashed; the caption is only the counts ("7 subidas · 0 bajadas").
    Home's rate row shows the same week as seven dots.
  - **Calculadora:** $50 / $100 / $200 / $500 chips, another amount in a small
    GET form, and the other direction ({moneda} → CAD) with that currency's own
    round chips. "{monto} CAD ≈ {x} {moneda}" at the reference rate (whole JMD,
    cents otherwise), and the line "Con la tasa de referencia del {fecha}. Cada
    servicio de envío usa su propia tasa y cobra su comisión." Anything but a
    plain amount up to 10,000 CAD is ignored and the form shows again.
  - **Avísame** (#avisame): a bell with an arrow; without a reminder, a number
    prefilled 1% above the latest rate; with one, the target big, a bar from the
    rate on the day it was set, "¡Llegó!" (with its validity) when reached, and
    "Quitar aviso". Posts to `/api/rate-reminder` (set or clear; same-origin and
    session checks). Refusals say why ("Elige un número cerca de la tasa de
    hoy", "Todavía no hay tasa"). Without notifications on, one line links to
    Notificaciones: the reminder arrives as a notification.
- **Feriados aquí y allá** (`/mas/feriados`): Ontario's public holidays and
  the home country's, merged by date, each with a date block, 🇨🇦 Ontario or the
  home flag, a countdown chip and "Verificado"; pills filter Todos / Ontario /
  {País}; the home country's full 12 months, with sources, stay in a
  `<details>`. Home's "Próximo feriado" is the next of either, with its flag.
- **Tu día de trabajo (round 4, 0044).** Every number from two or more
  providers under 0044's rules; nothing renders without its data, and each block
  carries its own `data-until` (dropped on an open or restored page).
  - **Hoy en Leamington** (`/clima/aqui`, from Clima's Leamington card and
    home's workday card): Ahora, the clock change when near, Por horas, Sol y
    calor, Aire, and Luz del día (`apps/app/lib/workday.tsx`).
  - **Por horas:** one column per hour the providers gave (up to 12): a smooth
    indigo line with a dot and the value only where the hour has a
    temperature (an hour the providers disagree on is a gap, never a guess),
    the sky's picture, a thin blue rain bar where there is a rain chance
    (solid for rain hours, 50% or more), and the hour. The line draws on, dots
    pop, bars grow; the row scrolls sideways when it does not fit.
  - **Sol y calor:** a UV semicircle with the WHO bands in their standard
    colours, the needle sweeping once to uv_max, the number big, the category,
    and "Máximo a las {hora}". Heat appears only from "Precaución" up, as "Se
    siente como 34°" with its category; below that nothing is said.
  - **Aire:** an AQI semicircle with the EPA category colours, the AQI big, the
    category, PM2.5 and the time measured. When the providers are more than one
    category apart: both numbers, "Buena a Dañina a la salud", the span
    outlined, and no needle.
  - **Tu día de trabajo** (home): "Tu día de trabajo" (or "Mañana en el
    trabajo" after 6pm) for 6am–6pm in Leamington: the 6–7am and high
    temperatures big, then one tile per flag and only for flags present: a
    jacket (cold morning), an umbrella and the rain hours, sunscreen and the UV
    category, a water bottle and "Se siente 34°". A missing flag is not a
    finding, so there is never a word that the day is fine.
  - **Próximas horas** (home): Leamington's next 6 hours as a horizontal strip
    with scroll-snap: the hour, the sky, the temperature where there is one.
  - **Cambio de hora:** within 14 days of Toronto's next UTC offset change,
    computed from the timezone rules (never a table): "El domingo 1 de
    noviembre la hora se atrasa 1 hora en Ontario", and when their hometown
    does not change its clocks, "La diferencia con Morelia será de 1 h". On home
    and the detail page, valid until the change.
  - **Luz del día:** today's daylight in Leamington from sunrise and sunset
    ("12 h 20 min", "3 min menos que ayer") and tomorrow's sunrise.
- **Siempre contigo (round 5, 0045, 0046).**
  - **¿Salió mi número?** (`/mas/loteria`): for each game of their country with
    a verified pick format, a small GET form sized by the game's picks and range
    (a 5-digit ticket keeps its leading zeros). Their numbers against the
    official results of the last 7 days (`app.lottery_check`): every draw with
    its official balls dropping in, the matching ones ringed in indigo with a
    check (by position for digit games), "Coinciden 3 números", "the same
    digits in another order" where the operator sells that play, "Verificado"
    and the source. Results only (CLAUDE.md): never "ganaste", a prize, odds,
    "hot numbers" or a link to buy. A game whose results are not up to date says
    so and is not compared; a refusal says what the game takes.
  - **Tu semana** (`/mas/semana`, from Más and home's teaser): "Semana del 14 al
    20 de septiembre"; seven circles for the days they opened Hoy (filled),
    missed (outlined) and to come (dashed); the reference rate's week with its
    high, low and neutral change; then, each only when real: badges earned,
    holidays ahead, the latest official lottery results, their team's results,
    and Leamington's forecast highest and lowest, labelled "pronóstico".
  - **Galería:** photos 2-6 of each town (`/photo/{id}/{rank}`, exactly the
    headers of `/photo/{id}`) as a scroll-snap strip under the town's photo on
    Clima, lazy with fixed sizes, each with its own credit. The home photo opens
    the town on Clima.
  - **Sin internet:** the service worker keeps the latest copy of Inicio, Clima,
    Hoy en Leamington, Tasa, Miembro and Tu semana (network first). Offline it
    serves the kept copy and reveals the page's own hidden line "Sin conexión ·
    guardado a las 10:32am"; the pages' inline script still drops everything past
    its `data-until` (Ahora, hours, air, clocks, warnings, forecasts). Opening
    the sign-in page, or signing in, clears every kept page. Our inline JS: home
    1,676 bytes, Clima and the other kept pages 338 bytes.
  - **Modo noche:** dark tokens (deep navy ground, dark indigo cards, light text
    at AA, the primary kept readable, links brightened, photos slightly dimmed;
    the sky hero, gauges and charts keep their colours) under
    `prefers-color-scheme: dark` unless the member chose "Claro" (`html.light`),
    and always with "Oscuro" (`html.dark`). Tema in Más offers Automático / Claro
    / Oscuro with previews (`/api/theme`). Combines with `html.big`.
- **Page-only rules leave APP_CSS:** Más's grid and settings, login and expiry,
  setup choices and Clima's gallery are inlined by those pages alone.
- **Feriados, shorter:** the next 8 of the chosen filter, the rest under "Ver
  más feriados".
- **Tasa at 3 meses:** no day table (the line, high and low show the window);
  the table stays for Semana and Mes.
- **Clima's today, once.** A town's forecast card is today; the three-day strip
  under it starts with tomorrow.
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

### Noticias (0047)

The owner asked for news of the member's country and municipio, on a page of
its own, with pictures. The copyright stance is decided (OPEN-DECISIONS 3.24):
Hoy shows the headline, the publisher's own short summary (at most 300
characters), our small cached copy of the publisher's picture credited
"Imagen: {source}", the source and the time, and "Leer en {source} ↗" to the
full story on the publisher's site (a new tab, `rel="noopener"`, no JavaScript).
Nothing suggests the whole article is in Hoy.

- **/noticias.** A back button, "Noticias" and the newspaper illustration; the
  last update ("Actualizado a las 10:30am"). Section pills as links: the
  municipio (stories naming their towns), the state or department (regional
  outlets) and the country; only sections with stories get a pill, and the
  first with stories opens. The lead story is the section's first with a
  picture: the picture in a fixed 16:9 box (no layout shift), source and time
  ("hace 2 h", or the date and time after a day), the title (never clamped, never hyphenated), the
  summary, "Leer en {source} ↗" and the credit. The rest are compact cards: an
  80 px thumb on the left (lazy) or no picture at all, source and time, the title
  as the publisher's link (↗), "📍 {town}" chips on local stories, and the
  summary folded under "Resumen". Ten stories per section. The sources, linked to
  their homepages, close the page.
- **No graphic pictures.** Stories about death or violence arrive without a
  picture on purpose; they get the text layout, never a placeholder.
- **Stale, never empty.** When the feed has not answered within 3 hours: "Actualizado
  a las …. La lista puede no estar al día." Never "no hay noticias": an empty
  section has no pill, and with nothing at all only the update line and the
  sources show.
- **Home.** "Noticias" after "Útil para ti": the lead story's picture (lazy),
  source and time, title and credit, then two more headlines as links. "Ver todo"
  opens /noticias. Absent when app.news_home is null. "hace X" is computed at
  render; the page's own update time is already on home.
- **Pictures.** `/news-image/{id}/thumb|lead` serves our cached JPEG with the
  photo headers (30 days immutable, ETag, 304, nosniff; 404 otherwise).
- **Offline.** /noticias is one of the pages sw.js keeps.

### Videos (0049)

The owner asked for "videos links and their thumbnail on the sport page,
highlights of their team". The stance is decided (OPEN-DECISIONS 3.25): links to
official channels' uploads on YouTube, our small cached thumbnail, "YouTube ·
{channel}", the time and the views. **Never an embedded player** (a player would
make the phone call YouTube), and every list of videos says plainly "Se abre en
YouTube · usa muchos datos".

- **Fútbol.** Right after the team hero: "Videos de {team}" and "Resúmenes de
  la liga", each a horizontal scroll-snap strip of cards (a 16:9 lazy thumbnail
  with a play mark and a "Resumen" badge on highlights, the title in up to 3
  lines, "YouTube · channel · hace X", the views in words: "705 mil vistas",
  "1.2 millones de vistas"). The whole
  card is the YouTube link (new tab, `rel="noopener"`). "Ver todo" opens
  /futbol/videos. A list without videos is not rendered; never "no hay videos".
- **/futbol/videos.** Back to Fútbol, "Videos", the update line (stale: "La
  lista puede no estar al día"), tabs for the team and the league (only with
  videos), the note, one column of big cards, and "Canales:" linking to the
  channels. Kept offline by sw.js.
- **No thumbnail yet:** the card has no picture (the badge moves beside the
  title), never a broken image.
- **Pictures.** `/video-thumb/{id}` serves our cached JPEG (at most 14 KB) with
  the photo headers; 404 for an unknown video or one without a thumbnail.
- **The strip title's 3-line clamp** is the one intentional clamp: the full title
  is the card link's `title` and is whole on /futbol/videos (the layout audit
  lists it, like the horizontal scrollers).
- **Home:** no video row. Home's fullest page is 10,927 bytes, and a thumbnail
  row would take its 1 KB margin.

### Fútbol v2 (0050)

The owner asked for "more videos" while the football provider is suspended, so
Fútbol is rich from videos and news (OPEN-DECISIONS 3.26; stance of 3.25
unchanged). After the hero: section jump pills (Videos · Cortos · Selección ·
Noticias · Resultados, only those present); one data note; "Lo mejor de {team}"
(the newest highlight or goals video as a big card, then a strip); Cortos
(vertical 9:16 Shorts linking to /shorts/, "Cortos · usan menos datos");
"Resúmenes de la liga"; "Tu selección" with the flag, and "Selección femenil"
separately only when there are videos; "Noticias de {team}" (compact news cards
with "Leer en…"); then the results. Category badges: Resumen, Goles, Entrevista,
Previa, Corto. Strips hold 4; /futbol/videos has tabs (team · Liga · Cortos ·
Selección · Femenil), category filters in the team tab, big cards and a
two-column Shorts grid.

To keep Fútbol within budget, home-only rules (the sky, the hometown photo row,
the season ring, the workday card, the next hours, the rate's dots, Allá y aquí,
the news card's headlines) moved from APP_CSS to HOME_CSS, inlined by home only;
every other page is about 1.2 KB lighter.

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

### Affiliate preview: "Vista previa" (2026-09-15)

A page of the affiliate portal (`/vista-previa`) for showing a prospect, across
the counter, what Hoy would show them today. It follows this section's frame,
plus a phone-shaped panel for the preview itself.

- **Choices are GET steps, with no JavaScript:**
  - One form holds the country and the town (`app.search_municipalities`).
  - When exactly one town matches, or exactly one has the typed name, its
    preview opens at once. Otherwise the matching towns are listed as links.
  - The team is optional and chosen on the preview.
- **Budget:** the preview pages inline a lighter copy of the portal CSS
  (`apps/affiliate/lib/lite-css.ts`: no tables, stat cards or print rules),
  about 0.9 KB less per page. Measured cold:
  - 19,280 bytes for sign-in, dashboard, form and a one-match preview
  - 23,084 bytes when picking from a list
  - Warm is 5,412 bytes.
- **Weather for a newly previewed town:**
  - The weather feeds fetch towns previewed in the last 14 days, at most 15.
  - Until their next run, the portal (never the phone) says the weather will
    be ready in a few minutes. It says so only when "Ahora" and the forecast are
    both absent.
- **The phone speaks the prospect's language:** Spanish, English for Jamaica.
  - The type is large (2.1 rem values) and the hometown photo leads, with its
    credit.
  - The page chrome stays in the affiliate's language.
- **Every part is from `app.prospect_preview` (0051) and shows its date or time:**
  - "Ahora", or today's forecast labelled as a forecast
  - local time and the difference from Leamington
  - the reference rate with its date
  - the team's newest highlight, or the league's, labelled as such
  - the latest result
  - the next holiday with "Verificado"
  - up to two local stories
- **An absent part is not drawn.** There is no placeholder, no sample and no
  "sin datos".
  - Official warnings are listed among "Además, en Hoy" only while
    `alerts_active` is true (a monitored source, checked within 45 minutes).
- **Pictures come from the portal's own routes** (`/api/preview/photo`, `crest`,
  `video-thumb`, `news-thumb`).
  - They use the same headers as Hoy's routes, and sit outside the page budget
    as Hoy's photos do.
- **"Registrar a esta persona"** opens the register form with the country, the
  department or parish, and the team already chosen.
- **Nothing about the prospect is saved.** One anonymous count (affiliate,
  country, time) records that a preview was opened.
