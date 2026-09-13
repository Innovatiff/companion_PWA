# Hoy — the client PWA (apps/app)

Two routes: `/login` (the code) and `/` (the home screen). Nothing else yet.

## Why it is built this way

The person using this has a cheap Android on 2 bars of bunkhouse wifi and
metered prepaid data. So:

- **Pages Router with client runtime JS disabled** (`unstable_runtimeJS: false`
  on every page). The browser gets server-rendered HTML with inline CSS. No React
  or Next.js runtime is shipped.
- **One inline script**, about 1 KB (`lib/open-script.ts`). It drops expired
  lines from an offline copy, logs the open and registers the service worker.
- **A service worker** (`public/sw.js`) fetches the home screen network-first and
  falls back to the last cached copy after 4 seconds or offline.
- **Every line is computed in Postgres** by `app.render_home`
  (`packages/db/migrations/0016_home_screen.sql`). It decides what is current
  enough to show. A line without current data is **absent**: never stale, never
  a placeholder.
- **The client never calls an external API.** It reads only our database,
  through this server.

## Instrumentation

- `home_renders`: what each render showed, and why each missing line was left
  out.
- `home_opens`: every time the screen was actually opened, including offline
  opens reported later, with the lines on screen.
- `daily_opens`: per client and day, the opens and which of fixture, weather,
  rate and countdown were visible.

## Run locally

```bash
npm install                       # from leamington/
npm run icons -w apps/app
DATABASE_URL=... SESSION_SECRET=... npm run build -w apps/app
DATABASE_URL=... SESSION_SECRET=... npm run start -w apps/app   # http://localhost:3100
```
