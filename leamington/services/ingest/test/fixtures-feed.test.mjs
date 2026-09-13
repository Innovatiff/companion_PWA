/**
 * The fixtures feed stores fixtures and results from one date query, records a
 * day with no matches as confirmed_empty rather than a failure, and treats plan,
 * key and ceiling problems as no answer.
 *
 * Runs against a throwaway local Postgres (see helpers/local-db.mjs):
 *   npm test
 */
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { localDbUnavailable, useFreshDatabase, stubFetch } from "./helpers/local-db.mjs";

const unavailable = localDbUnavailable();
const skip = unavailable ?? false;

const NOW = new Date("2026-09-13T19:05:00Z");
const STATUS_URL = "https://v3.football.api-sports.io/status";
const DAY = (date) => `https://v3.football.api-sports.io/fixtures?date=${date}`;
const statusAnswer = (current) => JSON.stringify({ errors: [], response: { requests: { current, limit_day: 100 } } });

const fixture = (id, leagueId, short, home, away, goals = [null, null]) => ({
  fixture: { id, date: "2026-09-13T20:30:00+00:00", status: { short } },
  league: { id: leagueId, season: 2026, round: "Regular Season - 1" },
  teams: { home: { id: home.id, name: home.name, logo: `https://media.test/${home.id}.png` },
           away: { id: away.id, name: away.name, logo: `https://media.test/${away.id}.png` } },
  goals: { home: goals[0], away: goals[1] },
});
const CAVALIER = { id: 1, name: "Cavalier" }, DUNBEHOLDEN = { id: 2, name: "Dunbeholden" };
const TIVOLI = { id: 3, name: "Tivoli Gardens" }, HUMBLE = { id: 4, name: "Humble Lions" };
const ARSENAL = { id: 42, name: "Arsenal" }, CHELSEA = { id: 49, name: "Chelsea" };
const day = (...fixtures) => JSON.stringify({ errors: [], results: fixtures.length, response: fixtures });

let db, runFeed, ingestFixtures;

before(async () => {
  if (unavailable) return;
  useFreshDatabase("leamington_ingest_test_fixtures");
  process.env.API_FOOTBALL_KEY = "test-key";
  db = await import("../src/db.mjs");
  ({ runFeed } = await import("../src/run-feed.mjs"));
  ({ ingestFixtures } = await import("../src/feeds/fixtures.mjs"));
});

after(async () => { await db?.closePool(); });

beforeEach(async () => {
  if (!unavailable) {
    await db.query("truncate source_runs, fixtures, teams restart identity cascade");
    await db.query("update leagues set current_season = null, current_season_checked_at = null");
  }
});

async function run(routes, opts = {}) {
  const net = stubFetch(routes);
  try { await runFeed("fixtures", (ctx) => ingestFixtures(ctx, { now: NOW, ...opts })); } finally { net.restore(); }
  const { rows: [r] } = await db.query(
    `select status, source_result, records_written, error, notes from source_runs where feed = 'fixtures' order by id desc limit 1`);
  const { rows: [h] } = await db.query(`select health, latest_result from feed_health_detail where feed = 'fixtures'`);
  return { run: r, health: h, requested: net.requested };
}

test("one date query stores our leagues' fixtures and results, and ignores other leagues", { skip }, async () => {
  const { run: r, health, requested } = await run({
    [STATUS_URL]: statusAnswer(10),
    [DAY("2026-09-13")]: day(
      fixture(1001, 322, "FT", DUNBEHOLDEN, CAVALIER, [2, 1]),
      fixture(1002, 322, "NS", TIVOLI, HUMBLE),
      fixture(9001, 39, "NS", ARSENAL, CHELSEA)),
  });

  assert.deepEqual(requested, [STATUS_URL, DAY("2026-09-13")], "one date query covers every league");
  assert.equal(r.status, "ok");
  assert.equal(r.source_result, "items");
  assert.equal(r.records_written, 2);

  const { rows: stored } = await db.query(
    `select f.source_fixture_id, f.status, f.home_score, f.away_score, f.season, f.round, l.name as league
       from fixtures f join leagues l on l.id = f.league_id order by f.source_fixture_id`);
  assert.deepEqual(stored.map((s) => [s.source_fixture_id, s.status, s.home_score, s.away_score, s.league]), [
    ["1001", "finished", 2, 1, "Jamaica Premier League"],
    ["1002", "scheduled", null, null, "Jamaica Premier League"],
  ]);
  assert.equal(stored[0].season, "2026");

  const { rows: [jm] } = await db.query(`select current_season from leagues where source_league_id = '322'`);
  assert.equal(jm.current_season, "2026", "the provider's current season is recorded");
  const { rows: teams } = await db.query(`select name, crest_source_url from teams order by name`);
  assert.equal(teams.length, 4, "no team from a league we do not follow");
  assert.ok(teams.every((t) => t.crest_source_url), "crest source recorded for later copying into storage");

  assert.equal(health.health, "ok");
  assert.equal(health.latest_result, "items");
});

test("a later run updates a fixture in place, never duplicating it", { skip }, async () => {
  await run({ [STATUS_URL]: statusAnswer(10), [DAY("2026-09-13")]: day(fixture(1002, 322, "NS", TIVOLI, HUMBLE)) });
  await run({ [STATUS_URL]: statusAnswer(11), [DAY("2026-09-13")]: day(fixture(1002, 322, "FT", TIVOLI, HUMBLE, [0, 0])) });
  const { rows } = await db.query(`select status, home_score, away_score from fixtures`);
  assert.deepEqual(rows, [{ status: "finished", home_score: 0, away_score: 0 }]);
});

test("a day when none of our leagues play is confirmed_empty, not a failure", { skip }, async () => {
  const { run: r, health } = await run({
    [STATUS_URL]: statusAnswer(10),
    [DAY("2026-09-13")]: day(fixture(9001, 39, "NS", ARSENAL, CHELSEA)),
  });
  assert.equal(r.status, "ok");
  assert.equal(r.source_result, "confirmed_empty");
  assert.equal(r.records_written, 0);
  assert.equal(health.health, "ok");
});

test("a plan error on HTTP 200 is no answer, never an empty day", { skip }, async () => {
  const { run: r, health } = await run({
    [STATUS_URL]: statusAnswer(10),
    [DAY("2026-09-13")]: JSON.stringify({ errors: { plan: "Free plans do not have access to this date, try from 2026-09-12 to 2026-09-14." }, response: [] }),
  });
  assert.equal(r.status, "error");
  assert.equal(r.source_result, "no_answer");
  assert.match(r.error, /plan-gated/);
  assert.notEqual(health.health, "ok");
});

test("the daily ceiling stops the date query before it is made", { skip }, async () => {
  const { run: r, requested } = await run({ [STATUS_URL]: statusAnswer(50) });
  assert.deepEqual(requested, [STATUS_URL], "no fixtures request once the ceiling is reached");
  assert.equal(r.status, "error");
  assert.equal(r.source_result, "no_answer");
  assert.match(r.error, /daily ceiling reached: 50 of 50/);
});

test("the yesterday and tomorrow runs query those UTC dates", { skip }, async () => {
  const y = await run({ [STATUS_URL]: statusAnswer(10), [DAY("2026-09-12")]: day() }, { offsetDays: -1 });
  assert.deepEqual(y.requested, [STATUS_URL, DAY("2026-09-12")]);
  const t = await run({ [STATUS_URL]: statusAnswer(10), [DAY("2026-09-14")]: day() }, { offsetDays: 1 });
  assert.deepEqual(t.requested, [STATUS_URL, DAY("2026-09-14")]);
});

test("an unrecognised fixture status is stored as nothing and marks the run partial", { skip }, async () => {
  const { run: r } = await run({
    [STATUS_URL]: statusAnswer(10),
    [DAY("2026-09-13")]: day(fixture(1003, 322, "XYZ", TIVOLI, HUMBLE), fixture(1004, 322, "NS", CAVALIER, DUNBEHOLDEN)),
  });
  assert.equal(r.status, "partial");
  assert.equal(r.records_written, 1);
  assert.match(JSON.stringify(r.notes), /unrecognised status XYZ/);
});
