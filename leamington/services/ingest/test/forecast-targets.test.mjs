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

let db, runFeed, ingestForecast, targetMunicipalities;

before(async () => {
  if (unavailable) return;
  useFreshDatabase("leamington_ingest_test_forecast");
  db = await import("../src/db.mjs");
  ({ runFeed } = await import("../src/run-feed.mjs"));
  ({ ingestForecast, targetMunicipalities } = await import("../src/feeds/forecast.mjs"));
});

after(async () => { await db?.closePool(); });

beforeEach(async () => {
  process.env.OPENWEATHER_KEY = "test-openweather";
  process.env.WEATHERAPI_KEY = "test-weatherapi";
  if (!unavailable) {
    await db.query("truncate source_runs, forecasts, local_forecasts, client_watch_locations, affiliate_previews restart identity cascade");
    await db.query("delete from clients");
    await db.query("delete from affiliates");
  }
});

/** Three days from each provider, in each provider's own response shape. */
function providersAnswer() {
  // Today and the next two days (UTC), because OpenWeather's steps are kept only from today on.
  const today = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  const days = [0, 1, 2].map((i) => new Date(today + i * 86_400_000).toISOString().slice(0, 10));
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const host = new URL(url).hostname;
    const json =
      host === "api.open-meteo.com" ? { daily: { time: days, temperature_2m_max: [31, 30, 29],
        temperature_2m_min: [24, 23, 23], precipitation_probability_max: [40, 60, 20], precipitation_sum: [1, 5, 0] } }
      : host === "api.openweathermap.org" ? { city: { timezone: 0 }, list: Array.from({ length: 24 }, (_, i) => ({
        dt: today / 1000 + i * 10_800, main: { temp_max: 30, temp_min: 23 }, pop: 0.5, rain: { "3h": 0.25 } })) }
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
            'FCZT2346', 'Forecast Client', 'JM', m.id, m.name, m.lat, m.lng, m.timezone
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
  // The client's town, plus Leamington and Windsor (0036): three days from each of three providers.
  assert.equal(run.records_written, 27, "3 places x 3 providers x 3 days");
  assert.equal((await db.query("select count(*)::int as n from forecasts")).rows[0].n, 9, "the client's town");
  assert.equal((await db.query("select count(*)::int as n from local_forecasts")).rows[0].n, 18, "Leamington and Windsor");
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

// ---------------------------------------------------------------------------
// Towns shown in Vista previa (0051): fetched for 14 days, at most 15, most recent first.

const PREVIEW_AFFILIATE = "77777777-7777-7777-7777-777777777777";

/** One anonymous preview count of a town, `daysAgo` days ago (fractions allowed). */
async function preview(municipalityId, daysAgo, affiliateId = PREVIEW_AFFILIATE) {
  await db.query("insert into affiliates (id, name) values ($1, 'Preview Test') on conflict do nothing", [affiliateId]);
  await db.query(
    "insert into affiliate_previews (affiliate_id, municipality_id, created_at) values ($1, $2, now() - $3::numeric * interval '1 day')",
    [affiliateId, municipalityId, daysAgo]);
}
const towns = async (country, n) =>
  (await db.query("select id::text from municipalities where country = $1 order by id limit $2", [country, n])).rows.map((r) => r.id);
const municipalityIds = (targets) => targets.filter((t) => t.kind === "municipality").map((t) => String(t.id));

test("a town previewed in the last 14 days is a target with no client at all, and the forecast fetches it", { skip }, async () => {
  const [town] = await towns("HN", 1);
  await preview(town, 1);
  const targets = await targetMunicipalities();
  assert.deepEqual(municipalityIds(targets), [town]);
  assert.equal(targets.filter((t) => t.kind === "local").length, 0, "Leamington and Windsor only while a client is active");
  const { run } = await runForecast();
  assert.equal(run.status, "ok");
  assert.equal((await db.query("select count(*)::int as n from forecasts where municipality_id = $1", [town])).rows[0].n, 9, "3 providers x 3 days");
});

test("a preview older than 14 days is not a target", { skip }, async () => {
  const [recent, old] = await towns("MX", 2);
  await preview(recent, 13.9);
  await preview(old, 14.1);
  assert.deepEqual(municipalityIds(await targetMunicipalities()), [recent]);
});

test("at most 15 distinct previewed towns, the most recent first; a town previewed twice counts once", { skip }, async () => {
  const ids = await towns("MX", 20);
  for (const [i, id] of ids.entries()) await preview(id, 0.01 + i * 0.1);   // ids[0] most recent
  await preview(ids[19], 0.001);                                           // the oldest, previewed again just now
  await preview(ids[0], 5);                                                // an older repeat changes nothing
  assert.deepEqual(municipalityIds(await targetMunicipalities()), [ids[19], ...ids.slice(0, 14)]);
});

test("a deactivated affiliate's previews and an inactive client's town still count; a client town previewed too appears once", { skip }, async () => {
  await addClientInJamaica();
  const { rows: [{ id: clientTown }] } = await db.query("select municipality_id::text as id from clients where code = 'FCZT2346'");
  const [shown] = await towns("GT", 1);
  const gone = "88888888-8888-8888-8888-888888888888";
  await db.query("insert into affiliates (id, name, active) values ($1, 'Deactivated', false)", [gone]);
  await preview(shown, 1, gone);
  await preview(clientTown, 2);

  let targets = await targetMunicipalities();
  assert.deepEqual(municipalityIds(targets), [clientTown, shown], "client towns first, then previewed ones");
  assert.equal(targets.filter((t) => t.kind === "local").length, 2);

  await db.query("update clients set active = false");
  targets = await targetMunicipalities();
  assert.deepEqual(municipalityIds(targets), [shown, clientTown], "only previewed now, the most recent first");
  assert.equal(targets.filter((t) => t.kind === "local").length, 0);
});

test("OpenWeather stays within 950 calls a day at every count the thresholds allow, preview towns included", async () => {
  const { openWeatherCallsPerDay, OPENWEATHER_DAILY_BUDGET, HOURLY_OPENWEATHER_MAX_PLACES } = await import("../src/feeds/current.mjs");
  const { PREVIEW_TOWNS_MAX, PREVIEW_TOWN_DAYS } = await import("../src/feeds/forecast.mjs");
  assert.equal(PREVIEW_TOWNS_MAX, 15);
  assert.equal(PREVIEW_TOWN_DAYS, 14);
  for (let n = 1; n <= 222; n++) {
    const calls = openWeatherCallsPerDay(n, Math.min(n, HOURLY_OPENWEATHER_MAX_PLACES));
    assert.ok(calls <= OPENWEATHER_DAILY_BUDGET, `${n} places: ${calls} calls`);
  }
  assert.equal(openWeatherCallsPerDay(17, 5), 944, "the every-run worst case in current.mjs");
  assert.equal(openWeatherCallsPerDay(30, 5), 900, "the hourly worst case in current.mjs");
  assert.ok(openWeatherCallsPerDay(223, 5) > OPENWEATHER_DAILY_BUDGET, "the forecast-only ceiling current.mjs documents");
});
