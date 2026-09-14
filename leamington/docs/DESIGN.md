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
  JavaScript, no webfonts, no icon fonts, no images except team crests.
- **One glance.** The client home screen is a morning message, not a dashboard.
- **Big targets.** Every tappable thing is at least 48 px tall.

### Budgets (compressed bytes on the wire, including headers)

| Surface | Cold page | Warm page | JavaScript |
| --- | --- | --- | --- |
| Hoy | ≤ 15 KB | ≤ 5 KB | ≤ 2 KB of our own, inline; zero framework |
| Affiliate portal | ≤ 25 KB | ≤ 10 KB | none |
| Admin | ≤ 40 KB | ≤ 20 KB | none |

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
- **Verbatim for agencies.** Alert text is shown exactly as the agency wrote
  it: agency name, severity, place, issue time, and a link to the source. It is
  never rewritten, summarised, translated or paraphrased.
- **Verified dates.** Every static record shows "Verificado: 3 de marzo".

## 3. Tokens

Inline CSS only. The canonical values live in `packages/shared/src/ui/tokens.ts`.

### Colour

Hoy (owner's direction, 2026-09-13): white rounded cards with soft shadows on
a pale ground, with the same indigo accent as the portals. Each home line is a
card with an icon, a small label and the sentence; Más is a two-column grid of
tiles; the greeting sits in a gradient box. `APP_CSS` in
`packages/shared/src/ui/css.ts` holds the canonical values.

| Token | Value | Use |
| --- | --- | --- |
| `--ink` | `#1b1f3b` | Text |
| `--paper` | `#f1f3f9` | Page background |
| `--card` | `#ffffff` | Cards, inputs, tab bar |
| `--muted` | `#5d6382` | Secondary text and labels (AA on paper and card) |
| `--line` | `#e4e7f0` | Dividers |
| `--brand` / `--brand-2` | `#3533cd` / `#5b5bf0` | Primary buttons, current tab, links |
| `--danger` | `#b42318` | Errors, the red alert level |
| `--warn` | `#9a4a00` | The orange alert level |
| `--caution` | `#7a5f00` | The yellow alert level |
| `--ok` | `#0f7a55` | Confirmations |
| `--focus` | `#1a56db` | Focus outline |

Colour is never the only signal. An alert level is written in words ("Rojo",
"Naranja", "Amarillo"), and the colour only reinforces it.

### Type

- **Font:** `system-ui, -apple-system, Roboto, "Segoe UI", sans-serif`, and
  `ui-monospace, "Roboto Mono", monospace` for codes. Nothing is downloaded.
- **Base size:** 18 px, line height 1.45.
- **Scale:**

| Use | Size |
| --- | --- |
| Morning-message greeting | 1.55 rem |
| Home lines | 1.2 rem |
| Section title | 1.3 rem |
| Body | 1 rem |
| Small | 0.85 rem |
| Access code | 2.4 rem, letter-spaced |

### Space and shape

- **Spacing:** steps of 0.25 rem. Page gutter 1 rem. The client column is at
  most 34 rem wide; portals are at most 64 rem.
- **Shape:** radius 0.5 rem; 2 px borders on inputs.
- **Targets:** tappable targets are at least 48 px tall.

## 4. Components

- **Morning line (Hoy home).** One sentence per line, large type, no icons.
  The greeting is an `h1`; each other line is a `p` with `data-line` and
  `data-until`. Supporting notes (e.g. "tasa de referencia") are `small`.
- **Tab bar (Hoy).**
  - Fixed to the bottom, with 4 items in this order: Inicio · Fútbol · Clima ·
    Más (English: Home · Football · Weather · More).
  - Each item is an inline SVG icon (24 px, `currentColor`, stroke 2) above a
    text label. There are no icon-only items.
  - Items are plain `<a>` links; the current page is marked with
    `aria-current="page"` and a top bar.
  - The bar respects `env(safe-area-inset-bottom)`, and the page gets matching
    bottom padding so nothing hides behind it.
- **Section page.** An `h1` title, then short sections with `h2` headings. Rows
  are list items: the main text, then a secondary line in `small`.
- **Alert card.**
  - A bordered block with a level word and colour bar, then the agency's
    headline or event, verbatim.
  - The place (`areaDesc`, verbatim), the issued and expires times, and a
    "Fuente: {agency}" link to `source_url`.
  - For Mexico, SMN's `areaDesc` is always shown.
- **Setup question.**
  - One question per screen: a large label, then the input, then a primary
    button ("Siguiente").
  - A "Saltar" link, and "Paso 2 de 5" as small text.
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
- **Buttons.** Primary: ink background, white text, full width on phones.
  Secondary: an ink-coloured link-style button. Destructive actions in the
  portals need a second confirming step.
- **Forms (portals).** A label above each field, one column, 48 px inputs, and
  error text directly under the field, in words.
- **Access code.**
  - Monospace at 2.4 rem, grouped 4 + 4 (`ACDE-FG34`), inside a bordered box.
  - Beneath it, a line saying which letters and digits are never used.
  - A print button uses `window.print()` from a tiny inline handler; the print
    stylesheet shows only the code and the client's name.
- **Tables (portals).** A real `<table>` with a `<caption>`, inside an
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
  7:02".
- **Portals:** no offline mode. A portal page that cannot load must fail
  visibly, never show old numbers.

## 7. Accessibility

- Semantic HTML, a `lang` attribute on `<html>`, labels on every input, and a
  visible 3 px focus outline in `--focus`.
- Text contrast is at least WCAG AA; the muted colour passes on the paper
  background.
- Links read as what they do ("Ver aviso de ODPEM", not "aquí").

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
