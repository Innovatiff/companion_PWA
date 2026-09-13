/**
 * The forecast feed is partial while there is nothing to forecast, and becomes
 * ok on its own once an active client has a municipality -- so the warning
 * cannot become a permanent one that is learned and ignored.
 *
 * Runs against a throwaway local Postgres (see helpers/local-db.mjs):
 *   npm test
 */
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { localDbUnavailable, useFreshDatabase } from "./helpers/local-db.mjs";

const unavailable = localDbUnavailable();
const skip = unavailable ?? false;

let db, runFeed, ingestForecast;

before(async () => {
  if (unavailable) return;
  useFreshDatabase("leamington_ingest_test_forecast");
  db = await import("../src/db.mjs");
  ({ runFeed } = await import("../src/run-feed.mjs"));
  ({ ingestForecast } = await import("../src/feeds/forecast.mjs"));
});

after(async () => { await db?.closePool(); });

beforeEach(async () => {
  process.env.OPENWEATHER_KEY = "test-openweather";
  process.env.WEATHERAPI_KEY = "test-weatherapi";
  if (!unavailable) {
    await db.query("truncate source_runs, forecasts, client_watch_locations restart identity cascade");
    await db.query("delete from clients");
  }
});

/** Three days from each provider, in each provider's own response shape. */
function providersAnswer() {
  const days = ["2026-09-14", "2026-09-15", "2026-09-16"];
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const host = new URL(url).hostname;
    const json =
      host === "api.open-meteo.com" ? { daily: { time: days, temperature_2m_max: [31, 30, 29],
        temperature_2m_min: [24, 23, 23], precipitation_probability_max: [40, 60, 20], precipitation_sum: [1, 5, 0] } }
      : host === "api.openweathermap.org" ? { list: days.map((d, i) => ({
        dt: Date.parse(`${d}T12:00:00Z`) / 1000, temp: { max: 30 + i, min: 23 }, pop: 0.5, rain: 2 })) }
      : host === "api.weatherapi.com" ? { forecast: { forecastday: days.map((d) => ({
        date: d, day: { maxtemp_c: 30, mintemp_c: 23, daily_chance_of_rain: 50, totalprecip_mm: 2 } })) } }
      : null;
    if (!json) throw new Error(`unexpected fetch in test: ${host}`);
    return new Response(JSON.stringify(json), { status: 200 });
  };
  return () => { globalThis.fetch = original; };
}

async function runForecast() {
  const restore = providersAnswer();
  try { await runFeed("forecast", ingestForecast); } finally { restore(); }
  const { rows: [run] } = await db.query(
    `select status, records_written, notes from source_runs where feed = 'forecast' order by id desc limit 1`);
  const { rows: [health] } = await db.query(`select health from feed_health_detail where feed = 'forecast'`);
  return { run, health: health.health };
}

async function addClientInJamaica() {
  await db.query(`insert into affiliates (id, name)
                  values ('66666666-6666-6666-6666-666666666666', 'Forecast Test') on conflict do nothing`);
  await db.query(
    `insert into clients (id, affiliate_id, code, full_name, country, municipality_id,
                          municipality, municipality_lat, municipality_lng, timezone)
     select 'eeee5555-0000-0000-0000-00000000000e', '66666666-6666-6666-6666-666666666666',
            'FCST0001', 'Forecast Client', 'JM', m.id, m.name, m.lat, m.lng, m.timezone
       from municipalities m where m.country = 'JM' order by m.id limit 1`);
}

test("with no client municipalities the run is partial and says why", { skip }, async () => {
  const { run, health } = await runForecast();
  assert.equal(run.status, "partial");
  assert.equal(run.records_written, 0);
  assert.deepEqual(run.notes.warnings, ["no client municipalities to forecast; no provider was contacted"]);
  assert.notEqual(health, "ok");
});

test("the same feed is ok once an active client has a municipality", { skip }, async () => {
  assert.equal((await runForecast()).run.status, "partial");

  await addClientInJamaica();
  const { run, health } = await runForecast();
  assert.equal(run.status, "ok");
  assert.equal(run.records_written, 9, "three days from each of three providers");
  assert.equal(run.notes, null);
  assert.equal(health, "ok");
});

test("without every provider key it stays partial even with clients", { skip }, async () => {
  await addClientInJamaica();
  delete process.env.OPENWEATHER_KEY;
  const { run } = await runForecast();
  assert.equal(run.status, "partial");
  assert.deepEqual(run.notes.warnings, ["providers skipped (no key): openweather"]);
});
