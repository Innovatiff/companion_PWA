/**
 * The registry of every external source this product depends on.
 *
 * CLAUDE.md gates UI work on verifying these. This file is the checklist in
 * executable form: `node verify/run.mjs` probes every entry and reports what is
 * actually reachable, in what format, and whether it carries what we need.
 *
 * `needsKey` sources are skipped (not failed) when the env var is absent, so the
 * harness is useful before anyone has signed up for anything.
 */

export const CATEGORIES = ["alerts", "football", "forecast", "fx", "lottery"];

export const SOURCES = [
  // ---------------------------------------------------------------------
  // WEATHER ALERTS — the decision that determines the launch country.
  // Checked in CLAUDE.md's required order: CAP -> WMO/IFRC hub -> scrape.
  // ---------------------------------------------------------------------
  {
    id: "alerts:hub:feed-registry",
    category: "alerts",
    country: "*",
    step: 2,
    label: "IFRC/WMO Alert Hub — registry of CAP feeds worldwide",
    url: "https://alert-hub.s3.amazonaws.com/cap-feeds.html",
    expect: "html",
    why: "Authoritative live list of which national agencies publish CAP. Decides steps 1 and 2 for every country at once.",
  },
  {
    id: "alerts:hub:registry-json",
    category: "alerts",
    country: "*",
    step: 2,
    label: "IFRC Alert Hub — aggregator feed list (JSON)",
    url: "https://raw.githubusercontent.com/IFRC-Alert-Hub/alert-hub-cap-aggregator/main/cap_feed/feeds.json",
    expect: "json",
    why: "Machine-readable snapshot of registered CAP sources. NOTE: this repo is dormant (last commit 2023-08); treat as a lower bound, confirm against the live registry above.",
  },
  {
    id: "alerts:MX:conagua-cap",
    category: "alerts",
    country: "MX",
    step: 1,
    label: "Mexico — CONAGUA/SMN CAP feed",
    url: "https://smn.conagua.gob.mx/tools/PHP/feedsmn/cap.php",
    expect: "cap",
    why: "Registered CAP (Atom). If live, Mexico is a step-1 country: structured and geocoded.",
  },
  {
    id: "alerts:JM:metservice-cap",
    category: "alerts",
    country: "JM",
    step: 1,
    label: "Jamaica — Meteorological Service CAP feed",
    url: "https://alert.metservice.gov.jm/capfeed.php",
    expect: "cap",
    why: "Registered CAP (Atom). If live, Jamaica is a step-1 country.",
  },
  {
    id: "alerts:HN:copeco",
    category: "alerts",
    country: "HN",
    step: 3,
    label: "Honduras — COPECO (civil protection)",
    url: "https://copeco.gob.hn/",
    expect: "html",
    why: "LAUNCH COUNTRY per the brief. No CAP feed is registered, so this is a step-3 scrape unless a feed is found here.",
  },
  {
    id: "alerts:HN:cenaos",
    category: "alerts",
    country: "HN",
    step: 3,
    label: "Honduras — CENAOS (met office inside COPECO)",
    url: "https://cenaos.copeco.gob.hn/",
    expect: "html",
    why: "The meteorological half of COPECO; the likeliest place a CAP or RSS feed would appear.",
  },
  {
    id: "alerts:GT:insivumeh",
    category: "alerts",
    country: "GT",
    step: 3,
    label: "Guatemala — INSIVUMEH (forecast authority)",
    url: "https://www.insivumeh.gob.gt/",
    expect: "html",
    why: "No CAP registered. Step-3 scrape candidate.",
  },
  {
    id: "alerts:GT:conred",
    category: "alerts",
    country: "GT",
    step: 3,
    label: "Guatemala — CONRED (civil protection)",
    url: "https://conred.gob.gt/",
    expect: "html",
    why: "Issues the alert levels (rojo/naranja/amarillo/verde) the UI would display.",
  },

  // ---------------------------------------------------------------------
  // FOOTBALL — viability of the whole fútbol feature.
  // ---------------------------------------------------------------------
  {
    id: "football:api-football:leagues",
    category: "football",
    country: "*",
    label: "API-Football — league coverage",
    url: "https://v3.football.api-sports.io/leagues",
    headers: (env) => ({ "x-apisports-key": env.API_FOOTBALL_KEY }),
    needsKey: "API_FOOTBALL_KEY",
    expect: "json",
    inspect: "footballLeagues",
    why: "Liga MX is universally covered. Honduras, Guatemala and Jamaica decide whether fútbol ships for three of four countries.",
  },
  {
    id: "football:sportmonks:leagues",
    category: "football",
    country: "*",
    label: "SportMonks — league coverage",
    url: "https://api.sportmonks.com/v3/football/leagues?per_page=1000",
    headers: (env) => ({ Authorization: env.SPORTMONKS_KEY }),
    needsKey: "SPORTMONKS_KEY",
    expect: "json",
    inspect: "footballLeagues",
    why: "Second opinion on the same four leagues; plan tiers cap how many leagues you may actually read.",
  },
  {
    id: "football:thesportsdb:leagues",
    category: "football",
    country: "*",
    label: "TheSportsDB — league list (free tier)",
    url: "https://www.thesportsdb.com/api/v1/json/3/all_leagues.php",
    expect: "json",
    inspect: "footballLeagues",
    why: "Free fallback. Worth knowing whether it carries the three minor leagues before paying for a tier that does.",
  },

  // ---------------------------------------------------------------------
  // FORECAST — multi-source by design. All four countries at launch.
  // ---------------------------------------------------------------------
  {
    id: "forecast:open-meteo",
    category: "forecast",
    country: "*",
    label: "Open-Meteo forecast (no key)",
    url: "https://api.open-meteo.com/v1/forecast?latitude=15.5042&longitude=-88.0250&daily=temperature_2m_max,precipitation_probability_max&timezone=auto",
    expect: "json",
    why: "The no-key leg of the three-source median. If this works, forecast ships regardless of the other two.",
  },
  {
    id: "forecast:openweather",
    category: "forecast",
    country: "*",
    label: "OpenWeather forecast",
    url: "https://api.openweathermap.org/data/2.5/forecast?lat=15.5042&lon=-88.0250&appid={OPENWEATHER_KEY}&units=metric",
    needsKey: "OPENWEATHER_KEY",
    expect: "json",
    why: "Second leg of the median.",
  },
  {
    id: "forecast:weatherapi",
    category: "forecast",
    country: "*",
    label: "WeatherAPI forecast",
    url: "https://api.weatherapi.com/v1/forecast.json?key={WEATHERAPI_KEY}&q=15.5042,-88.0250&days=3",
    needsKey: "WEATHERAPI_KEY",
    expect: "json",
    why: "Third leg of the median. With only two sources there is no median, only a disagreement.",
  },

  // ---------------------------------------------------------------------
  // FX — daily. Label as "tasa de referencia" only.
  // ---------------------------------------------------------------------
  {
    id: "fx:frankfurter",
    category: "fx",
    country: "*",
    label: "Frankfurter CAD -> MXN/HNL/GTQ/JMD",
    url: "https://api.frankfurter.app/latest?from=CAD&to=MXN,HNL,GTQ,JMD",
    expect: "json",
    inspect: "fxCurrencies",
    why: "Primary FX source. Frankfurter is ECB-derived and may not quote HNL, GTQ or JMD — that is the thing to check.",
  },
  {
    id: "fx:exchangerate-host",
    category: "fx",
    country: "*",
    label: "exchangerate.host CAD -> MXN/HNL/GTQ/JMD",
    url: "https://api.exchangerate.host/latest?base=CAD&symbols=MXN,HNL,GTQ,JMD",
    expect: "json",
    inspect: "fxCurrencies",
    why: "Fallback that historically covers the smaller currencies Frankfurter omits.",
  },

  // ---------------------------------------------------------------------
  // LOTTERY — official results only. Almost certainly scrapes.
  // ---------------------------------------------------------------------
  {
    id: "lottery:HN:loto",
    category: "lottery",
    country: "HN",
    label: "Honduras — Lotería Electrónica (Diaria, La Grande)",
    url: "https://loteriahonduras.com/",
    expect: "html",
    why: "Results page. Confirm draw days and whether results are server-rendered or injected by JS.",
  },
  {
    id: "lottery:GT:santalucia",
    category: "lottery",
    country: "GT",
    label: "Guatemala — Lotería Santa Lucía",
    url: "https://www.loteriasantalucia.com/",
    expect: "html",
    why: "Results page.",
  },
  {
    id: "lottery:MX:pronosticos",
    category: "lottery",
    country: "MX",
    label: "Mexico — Pronósticos (Melate, Chispazo, Tris)",
    url: "https://www.pronosticos.gob.mx/",
    expect: "html",
    why: "Government operator; most likely of the four to expose structured data.",
  },
  {
    id: "lottery:MX:loterianacional",
    category: "lottery",
    country: "MX",
    label: "Mexico — Lotería Nacional",
    url: "https://www.loterianacional.gob.mx/",
    expect: "html",
    why: "Separate operator from Pronósticos; different games.",
  },
  {
    id: "lottery:JM:supremeventures",
    category: "lottery",
    country: "JM",
    label: "Jamaica — Supreme Ventures (Cash Pot, Lotto, Pick 2/3/4)",
    url: "https://supremeventures.com/results/",
    expect: "html",
    why: "Cash Pot draws 6x daily; ingest cadence must follow the published draw times, not a fixed interval.",
  },
];

/**
 * Published Jamaican draw times, for building per-game ingest cadence.
 * Jamaica is UTC-05:00 year round (no DST), so these map to cron directly.
 * Re-confirm against the operator before relying on them.
 */
export const JM_DRAW_TIMES = {
  timezone: "America/Jamaica",
  utcOffset: "-05:00",
  games: {
    "Cash Pot": ["08:30", "10:30", "13:00", "15:00", "17:00", "20:25"],
    "Pick 3": ["08:30", "10:30", "13:00", "17:00", "20:25"],
    Lotto: ["20:25"], // Wednesdays and Saturdays
  },
};

export const REQUIRED_LEAGUES = [
  { country: "MX", match: /liga\s*mx|primera\s*divisi[oó]n.*m[eé]xico/i, label: "Liga MX" },
  { country: "HN", match: /honduras/i, label: "Liga Nacional de Honduras" },
  { country: "GT", match: /guatemala/i, label: "Liga Nacional de Guatemala" },
  { country: "JM", match: /jamaica/i, label: "Jamaica Premier League" },
];

export const REQUIRED_CURRENCIES = ["MXN", "HNL", "GTQ", "JMD"];
