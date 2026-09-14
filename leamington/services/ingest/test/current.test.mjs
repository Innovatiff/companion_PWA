/**
 * Current conditions: each provider's response read into one reading with a
 * sky from our set, OpenWeather called hourly within its quota, and a run that
 * stores every provider per place, is partial when one fails, and inconclusive
 * when none answers.
 *
 * The run tests use a throwaway local Postgres (see helpers/local-db.mjs):
 *   npm test
 */
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { localDbUnavailable, useFreshDatabase } from "./helpers/local-db.mjs";
import {
  parseOpenMeteo, parseWeatherApi, parseOpenWeather,
  conditionFromWmo, conditionFromWeatherApi, conditionFromOpenWeather, openWeatherThisRun,
} from "../src/feeds/current.mjs";

const unavailable = localDbUnavailable();
const skip = unavailable ?? false;

let db, runFeed, ingestCurrent;

before(async () => {
  if (unavailable) return;
  useFreshDatabase("leamington_ingest_test_current");
  db = await import("../src/db.mjs");
  ({ runFeed } = await import("../src/run-feed.mjs"));
  ({ ingestCurrent } = await import("../src/feeds/current.mjs"));
});

after(async () => { await db?.closePool(); });

beforeEach(async () => {
  process.env.OPENWEATHER_KEY = "test-openweather";
  process.env.WEATHERAPI_KEY = "test-weatherapi";
  if (!unavailable) {
    await db.query("truncate source_runs, current_conditions, client_watch_locations restart identity cascade");
    await db.query("delete from clients");
  }
});

// Each provider's own response shape, from their documentation and a live Open-Meteo answer.
const OPEN_METEO = { current: { time: "2026-09-14T12:15", interval: 900, temperature_2m: 12.0, apparent_temperature: 10.8,
                                relative_humidity_2m: 84, wind_speed_10m: 7.4, weather_code: 61, is_day: 1 } };
const WEATHERAPI = { current: { last_updated_epoch: 1789388100, temp_c: 13.1, feelslike_c: 12.0, humidity: 82,
                                wind_kph: 9.0, is_day: 0, condition: { text: "Light rain", code: 1183 } } };
const OPENWEATHER = { dt: 1789389000, main: { temp: 12.6, feels_like: 11.9, humidity: 88 }, wind: { speed: 2.5 },
                      weather: [{ id: 803, main: "Clouds" }], sys: { sunrise: 1789383600, sunset: 1789429200 } };

test("Open-Meteo: UTC time without a zone, km/h wind, WMO code", () => {
  assert.deepEqual(parseOpenMeteo(OPEN_METEO), {
    observedAt: new Date("2026-09-14T12:15:00Z"), tempC: 12, feelsLikeC: 10.8, humidity: 84, windKph: 7.4,
    condition: "rain", isDay: true });
});

test("WeatherAPI: epoch observation time and condition code", () => {
  const r = parseWeatherApi(WEATHERAPI);
  assert.equal(r.observedAt.getTime(), 1789388100 * 1000);
  assert.deepEqual({ ...r, observedAt: undefined },
    { observedAt: undefined, tempC: 13.1, feelsLikeC: 12, humidity: 82, windKph: 9, condition: "rain", isDay: false });
});

test("OpenWeather: m/s wind becomes km/h, day from sunrise and sunset", () => {
  const r = parseOpenWeather(OPENWEATHER);
  assert.equal(r.observedAt.getTime(), 1789389000 * 1000);
  assert.equal(r.windKph, 9);
  assert.equal(r.condition, "cloudy");
  assert.equal(r.isDay, true);
  assert.equal(parseOpenWeather({ ...OPENWEATHER, dt: 1789430000 }).isDay, false, "after sunset");
});

test("a response without a temperature or time is a failure, never a zero", () => {
  assert.throws(() => parseOpenMeteo({ current: { ...OPEN_METEO.current, temperature_2m: null } }), /no temperature/);
  assert.throws(() => parseWeatherApi({}), /no observation time/);
  assert.throws(() => parseOpenWeather({ ...OPENWEATHER, main: {} }), /no temperature/);
  // A missing optional reading stays missing.
  const r = parseOpenWeather({ ...OPENWEATHER, wind: {}, main: { temp: 20 } });
  assert.equal(r.windKph, null);
  assert.equal(r.humidity, null);
});

test("condition codes map to our set; unknown codes give no sky", () => {
  assert.deepEqual([0, 1, 2, 3, 45, 53, 65, 81, 75, 95, 42].map(conditionFromWmo),
    ["clear", "clear", "partly_cloudy", "cloudy", "fog", "drizzle", "rain", "rain", "snow", "storm", null]);
  assert.deepEqual([1000, 1003, 1009, 1135, 1153, 1063, 1195, 1225, 1207, 1087, 1276, 9999].map(conditionFromWeatherApi),
    ["clear", "partly_cloudy", "cloudy", "fog", "drizzle", "rain", "rain", "snow", "snow", "storm", "storm", null]);
  assert.deepEqual([211, 301, 502, 601, 701, 741, 781, 711, 800, 802, 804, undefined].map(conditionFromOpenWeather),
    ["storm", "drizzle", "rain", "snow", "fog", "fog", "storm", null, "clear", "partly_cloudy", "cloudy", null]);
});

test("OpenWeather is called every run up to 17 places, hourly up to 30, and not above", () => {
  const at = (min) => new Date(`2026-09-14T12:${String(min).padStart(2, "0")}:00Z`);
  assert.deepEqual(openWeatherThisRun(at(30), 17), { call: true, warning: null }, "few places: every run");
  assert.deepEqual(openWeatherThisRun(at(0), 10), { call: true, warning: null });
  assert.deepEqual(openWeatherThisRun(at(14), 30), { call: true, warning: null });
  assert.deepEqual(openWeatherThisRun(at(15), 18), { call: false, warning: null }, "more places: the half-hour run leaves it out");
  assert.deepEqual(openWeatherThisRun(at(30), 31), { call: false, warning: null });
  const over = openWeatherThisRun(at(2), 31);
  assert.equal(over.call, false);
  assert.match(over.warning, /31 places exceed 30/);
});

/** Every provider answers, except hosts listed in `failing`. */
function providersAnswer({ failing = [] } = {}) {
  const requested = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const host = new URL(url).hostname;
    requested.push(host);
    if (failing.includes(host)) return new Response("down", { status: 503 });
    const json = host === "api.open-meteo.com" ? OPEN_METEO
      : host === "api.openweathermap.org" ? OPENWEATHER
      : host === "api.weatherapi.com" ? WEATHERAPI : null;
    if (!json) throw new Error(`unexpected fetch in test: ${host}`);
    return new Response(JSON.stringify(json), { status: 200 });
  };
  return { requested, restore: () => { globalThis.fetch = original; } };
}

async function runCurrent({ minute = 5, failing } = {}) {
  const stub = providersAnswer({ failing });
  const now = new Date(`2026-09-14T12:${String(minute).padStart(2, "0")}:00Z`);
  try { await runFeed("current", (ctx) => ingestCurrent(ctx, { now })); } finally { stub.restore(); }
  const { rows: [run] } = await db.query(
    `select status, records_written, notes, error from source_runs where feed = 'current' order by id desc limit 1`);
  return { run, requested: stub.requested };
}

async function addClientInJamaica() {
  await db.query(`insert into affiliates (id, name)
                  values ('66666666-6666-6666-6666-666666666666', 'Current Test') on conflict do nothing`);
  await db.query(
    `insert into clients (id, affiliate_id, code, full_name, country, municipality_id,
                          municipality, municipality_lat, municipality_lng, timezone)
     select 'eeee5555-0000-0000-0000-00000000000e', '66666666-6666-6666-6666-666666666666',
            'FCZT2346', 'Current Client', 'JM', m.id, m.name, m.lat, m.lng, m.timezone
       from municipalities m where m.country = 'JM' order by m.id limit 1`);
}

test("with no client municipalities the run is partial and contacts no provider", { skip }, async () => {
  const { run, requested } = await runCurrent();
  assert.equal(run.status, "partial");
  assert.deepEqual(run.notes.warnings, ["no client municipalities for current conditions; no provider was contacted"]);
  assert.equal(requested.length, 0);
});

test("the hourly run stores all three providers for every place", { skip }, async () => {
  await addClientInJamaica();
  const { run } = await runCurrent({ minute: 5 });
  assert.equal(run.status, "ok");
  assert.equal(run.records_written, 9, "the client's town, Leamington and Windsor x 3 providers");
  const { rows } = await db.query(
    `select count(*) filter (where municipality_id is not null)::int as towns,
            count(*) filter (where place_id is not null)::int as local,
            count(distinct provider)::int as providers,
            bool_and(temp_c is not null) as temps
       from current_conditions`);
  assert.deepEqual(rows[0], { towns: 3, local: 6, providers: 3, temps: true });
  const { rows: [ow] } = await db.query(
    `select wind_kph::float, condition, observed_at from current_conditions where provider = 'openweather' limit 1`);
  assert.equal(ow.wind_kph, 9);
  assert.equal(ow.condition, "cloudy");
  assert.equal(ow.observed_at.getTime(), 1789389000 * 1000);

  // A second run replaces each provider's row rather than adding one.
  await runCurrent({ minute: 7 });
  assert.equal((await db.query("select count(*)::int as n from current_conditions")).rows[0].n, 9);
});

test("with few places the half-hour run calls OpenWeather too, so its reading is as recent", { skip }, async () => {
  await addClientInJamaica();
  const { run, requested } = await runCurrent({ minute: 35 });
  assert.equal(run.status, "ok");
  assert.equal(run.records_written, 9);
  assert.ok(requested.includes("api.openweathermap.org"));
});

test("one provider failing makes the run partial and writes the others", { skip }, async () => {
  await addClientInJamaica();
  const { run } = await runCurrent({ failing: ["api.weatherapi.com"] });
  assert.equal(run.status, "partial");
  assert.equal(run.records_written, 6);
  assert.equal(run.notes.warnings.length, 3);
  assert.ok(run.notes.warnings.every((w) => w.startsWith("weatherapi @ ") && w.includes("HTTP 503")));
  assert.equal((await db.query("select count(*)::int as n from current_conditions where provider = 'weatherapi'")).rows[0].n, 0);
});

test("a missing key is a warning, and every provider failing is inconclusive", { skip }, async () => {
  await addClientInJamaica();
  delete process.env.OPENWEATHER_KEY;
  const partial = await runCurrent();
  assert.equal(partial.run.status, "partial");
  assert.deepEqual(partial.run.notes.warnings, ["providers skipped (no key): openweather"]);

  const { run } = await runCurrent({ failing: ["api.open-meteo.com", "api.weatherapi.com"] });
  assert.equal(run.status, "error");
  assert.match(run.error, /every provider failed across 3 places/);
});
