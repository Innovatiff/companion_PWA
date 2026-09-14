/**
 * Round 4 feeds: the hourly outlook (3 providers, every 2 hours) and air
 * quality (2 providers, every hour) for the local places. Parsers for each
 * provider's shape, the EPA PM2.5 to AQI formula at its breakpoints, the shared
 * OpenWeather quota, and runs that store, prune, go partial on a failure and
 * inconclusive when nothing answers.
 *
 * The run tests use a throwaway local Postgres (see helpers/local-db.mjs).
 */
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { localDbUnavailable, useFreshDatabase } from "./helpers/local-db.mjs";
import {
  parseHourlyOpenMeteo, parseHourlyWeatherApi, parseHourlyOpenWeather, withinWindow,
} from "../src/feeds/hourly.mjs";
import { aqiFromPm25, parseAirOpenMeteo, parseAirWeatherApi } from "../src/feeds/air.mjs";
import {
  openWeatherCallsPerDay, OPENWEATHER_DAILY_BUDGET, HOURLY_OPENWEATHER_MAX_PLACES,
} from "../src/feeds/current.mjs";

const unavailable = localDbUnavailable();
const skip = unavailable ?? false;

let db, runFeed, ingestHourly, ingestAir;

before(async () => {
  if (unavailable) return;
  useFreshDatabase("leamington_ingest_test_hourly");
  db = await import("../src/db.mjs");
  ({ runFeed } = await import("../src/run-feed.mjs"));
  ({ ingestHourly } = await import("../src/feeds/hourly.mjs"));
  ({ ingestAir } = await import("../src/feeds/air.mjs"));
});

after(async () => { await db?.closePool(); });

beforeEach(async () => {
  process.env.OPENWEATHER_KEY = "test-openweather";
  process.env.WEATHERAPI_KEY = "test-weatherapi";
  if (!unavailable) {
    await db.query("truncate source_runs, local_hourly, local_air_quality, client_watch_locations restart identity cascade");
    await db.query("delete from clients");
  }
});

const H = 3_600_000;
const NOW = new Date("2026-09-14T12:05:00Z");

// Each provider's shape: Open-Meteo from a live answer, the others from their documentation.
function openMeteoHourly(startIso = "2026-09-14T00:00", count = 48) {
  const start = Date.parse(`${startIso}Z`);
  const idx = [...Array(count).keys()];
  return { hourly: {
    time: idx.map((i) => new Date(start + i * H).toISOString().slice(0, 16)),
    temperature_2m: idx.map((i) => 14 + (i % 10)), apparent_temperature: idx.map((i) => 13 + (i % 10)),
    precipitation_probability: idx.map((i) => (i === 5 ? null : i % 100)), uv_index: idx.map((i) => (i % 24) / 4),
    weather_code: idx.map(() => 61), is_day: idx.map((i) => (i % 24 >= 11 && i % 24 < 23 ? 1 : 0)),
  } };
}
function weatherApiHourly() {
  const dayStart = Date.parse("2026-09-14T04:00:00Z") / 1000;   // Toronto midnight
  const day = (d) => ({ date: `2026-09-1${4 + d}`, hour: [...Array(24).keys()].map((h) => ({
    time_epoch: dayStart + (d * 24 + h) * 3600, temp_c: 15.5, feelslike_c: 15.0, chance_of_rain: 40, uv: 3.0,
    is_day: h >= 7 && h < 19 ? 1 : 0, condition: { text: "Patchy rain nearby", code: 1063 } })) });
  return { forecast: { forecastday: [day(0), day(1)] } };
}
function openWeather3h() {
  const start = Date.parse("2026-09-14T12:00:00Z") / 1000;
  return { city: { timezone: -14400 }, list: [...Array(11).keys()].map((i) => ({
    dt: start + i * 10800, main: { temp: 16.2, feels_like: 15.9 }, pop: 0.27,
    weather: [{ id: 500, main: "Rain" }], sys: { pod: i % 8 < 3 ? "d" : "n" } })) };
}
const AIR_OPEN_METEO = { current: { time: "2026-09-14T12:00", interval: 3600, us_aqi: 31, pm2_5: 1.6 } };
const AIR_WEATHERAPI = { current: { last_updated_epoch: Date.parse("2026-09-14T11:45:00Z") / 1000, temp_c: 15,
  air_quality: { co: 200.1, pm2_5: 9.1, pm10: 12.3, "us-epa-index": 1, "gb-defra-index": 1 } } };

test("Open-Meteo hourly: UTC hours without a zone, each reading or null", () => {
  const rows = parseHourlyOpenMeteo(openMeteoHourly());
  assert.equal(rows.length, 48);
  assert.deepEqual(rows[14], { hourStart: new Date("2026-09-14T14:00:00Z"), tempC: 18, feelsLikeC: 17, precipProb: 14,
                               uvIndex: 3.5, condition: "rain", isDay: true });
  assert.equal(rows[5].precipProb, null, "a missing rain chance stays missing");
  assert.throws(() => parseHourlyOpenMeteo({ hourly: { time: ["2026-09-14T00:00"], temperature_2m: [null] } }), /no hours/);
  assert.throws(() => parseHourlyOpenMeteo({}), /no hours/);
});

test("WeatherAPI hourly: every forecast day's hours by epoch, with UV", () => {
  const rows = parseHourlyWeatherApi(weatherApiHourly());
  assert.equal(rows.length, 48);
  assert.deepEqual(rows[10], { hourStart: new Date("2026-09-14T14:00:00Z"), tempC: 15.5, feelsLikeC: 15, precipProb: 40,
                               uvIndex: 3, condition: "rain", isDay: true });
});

test("OpenWeather 3-hour steps: each at its own hour, rain chance from 0-1, no UV, day from pod", () => {
  const rows = parseHourlyOpenWeather(openWeather3h());
  assert.equal(rows.length, 11);
  assert.deepEqual(rows[1], { hourStart: new Date("2026-09-14T15:00:00Z"), tempC: 16.2, feelsLikeC: 15.9, precipProb: 27,
                              uvIndex: null, condition: "rain", isDay: true });
  assert.equal(rows[3].isDay, false);
  // Off the hour, or without a temperature, a step is dropped rather than rounded or zeroed.
  const odd = parseHourlyOpenWeather({ list: [{ dt: 1789388100, main: { temp: 3 } }, { dt: 1789387200, main: {} },
                                              { dt: 1789387200, main: { temp: 4 }, pop: 1.7 }] });
  assert.deepEqual(odd.map((r) => [r.tempC, r.precipProb]), [[4, null]]);
});

test("the window keeps the current hour through 30 hours ahead", () => {
  const rows = withinWindow(parseHourlyOpenMeteo(openMeteoHourly()), NOW);
  assert.equal(rows[0].hourStart.toISOString(), "2026-09-14T12:00:00.000Z");
  assert.equal(rows.at(-1).hourStart.toISOString(), "2026-09-15T18:00:00.000Z");
  assert.equal(rows.length, 31);
});

test("PM2.5 to US AQI at the EPA breakpoints (truncated to one decimal)", () => {
  const cases = [[0, 0], [9.0, 50], [9.05, 50], [9.1, 51], [35.4, 100], [35.5, 101], [55.4, 150], [55.5, 151],
                 [125.4, 200], [125.5, 201], [225.4, 300], [225.5, 301], [325.4, 500], [400, 500], [12.0, 56], [1.6, 9]];
  for (const [pm, aqi] of cases) assert.equal(aqiFromPm25(pm), aqi, `PM2.5 ${pm}`);
  assert.equal(aqiFromPm25(null), null);
  assert.equal(aqiFromPm25(-1), null);
  assert.equal(aqiFromPm25("12"), null);
});

test("air parsers: Open-Meteo's AQI as given; WeatherAPI's AQI from its PM2.5, not its 1-6 band", () => {
  assert.deepEqual(parseAirOpenMeteo(AIR_OPEN_METEO), { observedAt: new Date("2026-09-14T12:00:00Z"), usAqi: 31, pm25: 1.6 });
  assert.deepEqual(parseAirWeatherApi(AIR_WEATHERAPI), { observedAt: new Date("2026-09-14T11:45:00Z"), usAqi: 51, pm25: 9.1 });
  assert.throws(() => parseAirOpenMeteo({ current: { time: "2026-09-14T12:00", us_aqi: null } }), /no air quality/);
  assert.throws(() => parseAirWeatherApi({ current: { last_updated_epoch: 1789388100, air_quality: { "us-epa-index": 1 } } }),
    /no air quality/);
  assert.throws(() => parseAirWeatherApi({}), /no observation time/);
});

test("OpenWeather stays within 950 calls a day across current, forecast and hourly", () => {
  assert.equal(OPENWEATHER_DAILY_BUDGET, 950);
  assert.equal(openWeatherCallsPerDay(17, 2), 17 * (48 + 4) + 2 * 12);   // 908
  assert.equal(openWeatherCallsPerDay(30, 2), 30 * (24 + 4) + 2 * 12);   // 864
  assert.equal(openWeatherCallsPerDay(17, 5), 944);
  assert.equal(openWeatherCallsPerDay(17, 6), 884, "hourly stops calling it above 5 local places");
  for (let places = 1; places <= 30; places++) {
    for (let local = 0; local <= Math.min(places, HOURLY_OPENWEATHER_MAX_PLACES + 2); local++) {
      assert.ok(openWeatherCallsPerDay(places, local) <= OPENWEATHER_DAILY_BUDGET, `${places} places, ${local} local`);
    }
  }
});

/** Every provider answers by host and path, except those listed in `failing`. */
function providersAnswer({ failing = [] } = {}) {
  const requested = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = new URL(url);
    const route = `${u.hostname}${u.pathname}`;
    requested.push(route);
    if (failing.includes(u.hostname) || failing.includes(route)) return new Response("down", { status: 503 });
    const json = {
      "api.open-meteo.com/v1/forecast": openMeteoHourly(),
      "api.openweathermap.org/data/2.5/forecast": openWeather3h(),
      "api.weatherapi.com/v1/forecast.json": weatherApiHourly(),
      "air-quality-api.open-meteo.com/v1/air-quality": AIR_OPEN_METEO,
      "api.weatherapi.com/v1/current.json": AIR_WEATHERAPI,
    }[route];
    if (!json) throw new Error(`unexpected fetch in test: ${route}`);
    return new Response(JSON.stringify(json), { status: 200 });
  };
  return { requested, restore: () => { globalThis.fetch = original; } };
}

async function run(feed, fn, { failing } = {}) {
  const stub = providersAnswer({ failing });
  try { await runFeed(feed, fn); } finally { stub.restore(); }
  const { rows: [r] } = await db.query(
    `select status, records_written, notes, error from source_runs where feed = $1 order by id desc limit 1`, [feed]);
  return { run: r, requested: stub.requested };
}
const runHourly = (opts) => run("hourly", (ctx) => ingestHourly(ctx, { now: NOW }), opts);
const runAir = (opts) => run("air", (ctx) => ingestAir(ctx), opts);

async function addActiveClient() {
  await db.query(`insert into affiliates (id, name)
                  values ('66666666-6666-6666-6666-666666666666', 'Hourly Test') on conflict do nothing`);
  await db.query(
    `insert into clients (id, affiliate_id, code, full_name, country, municipality_id,
                          municipality, municipality_lat, municipality_lng, timezone)
     select 'eeee5555-0000-0000-0000-00000000000e', '66666666-6666-6666-6666-666666666666',
            'FCZT2346', 'Hourly Client', 'JM', m.id, m.name, m.lat, m.lng, m.timezone
       from municipalities m where m.country = 'JM' order by m.id limit 1`);
}

test("with no active client neither feed contacts a provider", { skip }, async () => {
  const h = await runHourly();
  assert.equal(h.run.status, "partial");
  assert.deepEqual(h.run.notes.warnings, ["no active clients for the hourly outlook; no provider was contacted"]);
  const a = await runAir();
  assert.equal(a.run.status, "partial");
  assert.equal(h.requested.length + a.requested.length, 0);
});

test("the hourly run stores three providers' next 30 hours for both places and prunes old hours", { skip }, async () => {
  await addActiveClient();
  const { rows: [leam] } = await db.query(`select id from local_places where key = 'leamington'`);
  await db.query(
    `insert into local_hourly (place_id, provider, hour_start, temp_c) values
       ($1, 'open-meteo', $2, 1), ($1, 'weatherapi', $3, 2)`,
    [leam.id, new Date(NOW.getTime() - 7 * H - 5 * 60_000), new Date(NOW.getTime() - 5 * H - 5 * 60_000)]);

  const { run: r, requested } = await runHourly();
  assert.equal(r.status, "ok");
  assert.equal(r.records_written, 2 * (31 + 31 + 11), "Leamington and Windsor x (31 + 31 + 11 OpenWeather steps)");
  assert.equal(requested.filter((x) => x.startsWith("api.openweathermap.org")).length, 2, "one OpenWeather call per place");
  const { rows } = await db.query(
    `select provider::text, count(*)::int as n, min(hour_start) as first, max(hour_start) as last,
            count(uv_index)::int as uv
       from local_hourly where place_id = $1 group by provider order by provider`, [leam.id]);
  assert.deepEqual(rows.map((x) => [x.provider, x.n, x.uv]),
    [["open-meteo", 31, 31], ["openweather", 11, 0], ["weatherapi", 32, 31]],
    "the 5-hour-old WeatherAPI row stays; OpenWeather has no UV");
  assert.equal(rows[0].first.toISOString(), "2026-09-14T12:00:00.000Z");
  assert.equal(rows[0].last.toISOString(), "2026-09-15T18:00:00.000Z");
  assert.equal((await db.query(`select count(*)::int as n from local_hourly where hour_start < $1`,
    [new Date(NOW.getTime() - 6 * H)])).rows[0].n, 0, "hours older than 6 hours are deleted");

  // A second run replaces rather than adds.
  await runHourly();
  assert.equal((await db.query(`select count(*)::int as n from local_hourly`)).rows[0].n, 2 * 73 + 1);
});

test("one hourly provider failing is partial; all failing is inconclusive", { skip }, async () => {
  await addActiveClient();
  const partial = await runHourly({ failing: ["api.openweathermap.org"] });
  assert.equal(partial.run.status, "partial");
  assert.equal(partial.run.records_written, 2 * 62);
  assert.equal(partial.run.notes.warnings.length, 2);
  assert.ok(partial.run.notes.warnings.every((w) => w.startsWith("openweather @ ") && w.includes("HTTP 503")));

  const { run: r } = await runHourly({ failing: ["api.open-meteo.com", "api.openweathermap.org", "api.weatherapi.com"] });
  assert.equal(r.status, "error");
  assert.match(r.error, /every provider failed across 2 local places/);
});

test("the air run stores both providers per place, WeatherAPI's AQI from PM2.5", { skip }, async () => {
  await addActiveClient();
  const { run: r, requested } = await runAir();
  assert.equal(r.status, "ok");
  assert.equal(r.records_written, 4);
  assert.ok(!requested.some((x) => x.startsWith("api.openweathermap.org")), "air never uses the OpenWeather quota");
  const { rows } = await db.query(
    `select provider::text, us_aqi, pm2_5::float, observed_at from local_air_quality aq
       join local_places lp on lp.id = aq.place_id where lp.key = 'windsor' order by provider`);
  assert.deepEqual(rows.map((x) => [x.provider, x.us_aqi, x.pm2_5, x.observed_at.toISOString()]),
    [["open-meteo", 31, 1.6, "2026-09-14T12:00:00.000Z"], ["weatherapi", 51, 9.1, "2026-09-14T11:45:00.000Z"]]);

  await runAir();
  assert.equal((await db.query(`select count(*)::int as n from local_air_quality`)).rows[0].n, 4, "one row per place and provider");

  const partial = await runAir({ failing: ["api.weatherapi.com/v1/current.json"] });
  assert.equal(partial.run.status, "partial");
  assert.equal(partial.run.records_written, 2);
  const { run: none } = await runAir({ failing: ["air-quality-api.open-meteo.com", "api.weatherapi.com"] });
  assert.equal(none.status, "error");
});
