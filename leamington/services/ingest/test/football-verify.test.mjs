/**
 * verify/football.mjs never collapses "could not tell" into "not covered".
 * Three verdicts: COVERED / NOT_COVERED / INCONCLUSIVE.
 *
 *   npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COVERED, NOT_COVERED, INCONCLUSIVE, DIMENSIONS, LEAGUES,
  makeClient, readApiFootball, allowedSeasons, pickHistoricalSeason, apiFootballShared,
  probeApiFootballLeague, probeSportMonksLeague, combine, failedProbe,
} from "../verify/football.mjs";

const JM = LEAGUES.find((l) => l.key === "JM");
const TODAY = new Date("2026-09-13T19:00:00Z");
const PLAN_SEASON = { plan: "Free plans do not have access to this season, try from 2022 to 2024." };

/** Route requests by URL substring; the first matching route answers. Unrouted requests throw. */
function stubFetch(routes) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    const hit = routes.find(([match]) => url.includes(match));
    if (!hit) throw new Error(`unrouted request in test: ${url}`);
    const answer = hit[1];
    if (answer instanceof Error) throw answer;
    return new Response(JSON.stringify(answer.body ?? answer), { status: answer.status ?? 200 });
  };
  return { fetchImpl, calls };
}

const af = (routes, budget = Infinity) => {
  const { fetchImpl, calls } = stubFetch(routes);
  return { client: makeClient({ base: "https://af.test", fetchImpl, budget }), calls };
};

const JM_CATALOGUE = {
  errors: [], response: [{
    league: { id: 322, name: "Premier League", type: "League", logo: "https://img/322.png" },
    seasons: [2022, 2023, 2024, 2025, 2026].map((year) => ({
      year, current: year === 2026, coverage: { fixtures: { events: false }, standings: true },
    })),
  }],
};
const finished = (n) => Array.from({ length: n }, (_, i) => ({
  fixture: { id: i, date: "2024-10-01T20:00:00+00:00", status: { short: "FT", elapsed: 90 } },
  league: { id: 322 }, goals: { home: 1, away: 0 },
  teams: { home: { name: "Cavalier", logo: "https://img/c.png" }, away: { name: "Harbour View", logo: "https://img/h.png" } },
}));
const todayFixture = { ...finished(1)[0], fixture: { id: 99, date: "2026-09-13T20:30:00+00:00", status: { short: "NS" } } };
const NOTHING = { errors: [], response: [] };

async function probeJm(routes, { budget, shared } = {}) {
  const { client, calls } = af(routes, budget);
  const s = shared ?? await apiFootballShared(client, TODAY);
  return { row: await probeApiFootballLeague(client, JM, s), calls, used: client.used };
}

test("an API-Football plan error on HTTP 200 is INCONCLUSIVE, never NOT_COVERED", async () => {
  const { row } = await probeJm([
    ["/fixtures?date=", NOTHING], ["/fixtures?live=all", NOTHING],
    ["/leagues?country=Jamaica", JM_CATALOGUE],
    ["/fixtures?league=322&season=2026", { errors: PLAN_SEASON, response: [] }],
    ["/standings?league=322&season=2026", { errors: PLAN_SEASON, response: [] }],
    ["/teams?league=322&season=2026", { errors: PLAN_SEASON, response: [] }],
    ["/fixtures?league=322&season=2024", { errors: [], response: finished(3) }],
  ]);

  for (const d of ["fixtures", "table", "crests"]) {
    assert.equal(row[d].verdict, INCONCLUSIVE, `${d} must not read as absent`);
    assert.match(row[d].reason, /plan-gated/);
  }
  assert.equal(row.live.verdict, INCONCLUSIVE, "nothing in play proves nothing");
  assert.equal(row.historical.verdict, COVERED, "history is read from a season the plan allows");
  assert.match(row.historical.reason, /season 2024/);
  assert.deepEqual(row.planSeasons, [2022, 2024]);
  for (const d of DIMENSIONS) assert.notEqual(row[d].verdict, NOT_COVERED);
});

test("a rejected key on HTTP 200 is INCONCLUSIVE in every dimension, and counts as a failed probe", async () => {
  const badKey = { errors: { token: "Error/Missing application key." }, response: [] };
  const { row } = await probeJm([["/fixtures?date=", badKey], ["/fixtures?live=all", badKey], ["/leagues", badKey]]);
  for (const d of DIMENSIONS) {
    assert.equal(row[d].verdict, INCONCLUSIVE);
    assert.match(row[d].reason, /key rejected/);
    assert.ok(failedProbe(row[d]));
  }
});

test("an unreachable provider is INCONCLUSIVE, not NOT_COVERED", async () => {
  const down = Object.assign(new TypeError("fetch failed"), { cause: { code: "ENOTFOUND" } });
  const { row } = await probeJm([["af.test", down]]);
  for (const d of DIMENSIONS) {
    assert.equal(row[d].verdict, INCONCLUSIVE);
    assert.match(row[d].reason, /unreachable: DNS lookup failed/);
  }
});

test("a league absent from a catalogue that answered is NOT_COVERED", async () => {
  const { row } = await probeJm([
    ["/fixtures?date=", NOTHING], ["/fixtures?live=all", NOTHING],
    ["/leagues?country=Jamaica", { errors: [], response: [{ league: { id: 1, name: "JFF Cup", type: "Cup" }, seasons: [] }] }],
  ]);
  for (const d of DIMENSIONS) assert.equal(row[d].verdict, NOT_COVERED);
});

test("data that comes back is COVERED, dimension by dimension", async () => {
  const inPlay = { ...finished(1)[0], fixture: { id: 7, date: "2026-09-13T20:30:00+00:00", status: { short: "1H", elapsed: 12 } } };
  const { row } = await probeJm([
    ["/fixtures?date=", { errors: [], response: [todayFixture] }],
    ["/fixtures?live=all", { errors: [], response: [inPlay] }],
    ["/leagues?country=Jamaica", JM_CATALOGUE],
    ["/fixtures?league=322&season=2026", { errors: [], response: finished(5) }],
    ["/standings?league=322&season=2026", { errors: [], response: [{ league: { standings: [[{ rank: 1 }, { rank: 2 }]] } }] }],
    ["/teams?league=322&season=2026", { errors: [], response: [{ team: { logo: "a" } }, { team: { logo: "b" } }] }],
    ["/fixtures?league=322&season=2025", { errors: [], response: finished(2) }],
  ]);
  for (const d of DIMENSIONS) assert.equal(row[d].verdict, COVERED, `${d}: ${row[d].reason}`);
});

test("the date query rescues fixtures and crests when the season query is plan-gated", async () => {
  const { row } = await probeJm([
    ["/fixtures?date=", { errors: [], response: [todayFixture] }], ["/fixtures?live=all", NOTHING],
    ["/leagues?country=Jamaica", JM_CATALOGUE],
    ["/fixtures?league=322&season=2026", { errors: PLAN_SEASON, response: [] }],
    ["/standings?league=322&season=2026", { errors: PLAN_SEASON, response: [] }],
    ["/teams?league=322&season=2026", { errors: PLAN_SEASON, response: [] }],
    ["/fixtures?league=322&season=2024", { errors: [], response: finished(1) }],
  ]);
  assert.equal(row.fixtures.verdict, COVERED);
  assert.match(row.fixtures.reason, /date query for 2026-09-13 returned 1 fixture/);
  assert.equal(row.crests.verdict, COVERED);
  assert.equal(row.table.verdict, INCONCLUSIVE, "no date-query equivalent exists for a table");
});

test("an empty table is NOT_COVERED only when the provider itself says standings: false", async () => {
  const noStandings = structuredClone(JM_CATALOGUE);
  noStandings.response[0].seasons.at(-1).coverage.standings = false;
  const routes = (catalogue) => [
    ["/fixtures?date=", NOTHING], ["/fixtures?live=all", NOTHING], ["/leagues?country=Jamaica", catalogue],
    ["/fixtures?league=322&season=2026", NOTHING], ["/standings?league=322&season=2026", NOTHING],
    ["/teams?league=322&season=2026", NOTHING], ["/fixtures?league=322&season=2025", NOTHING],
  ];
  assert.equal((await probeJm(routes(noStandings))).row.table.verdict, NOT_COVERED);
  assert.equal((await probeJm(routes(JM_CATALOGUE))).row.table.verdict, INCONCLUSIVE);
  assert.equal((await probeJm(routes(JM_CATALOGUE))).row.fixtures.verdict, INCONCLUSIVE, "an empty season proves nothing");
});

test("a spent request budget leaves the rest INCONCLUSIVE and stops calling the provider", async () => {
  const { row, used, calls } = await probeJm([
    ["/fixtures?date=", NOTHING], ["/fixtures?live=all", NOTHING], ["/leagues?country=Jamaica", JM_CATALOGUE],
  ], { budget: 3 });
  assert.equal(used, 3);
  assert.equal(calls.length, 3, "no request past the budget");
  for (const d of ["fixtures", "table", "crests", "historical"]) {
    assert.equal(row[d].verdict, INCONCLUSIVE);
    assert.match(row[d].reason, /budget spent/);
  }
});

test("SportMonks without a key is INCONCLUSIVE everywhere", async () => {
  const row = await probeSportMonksLeague(null, JM);
  for (const d of DIMENSIONS) {
    assert.equal(row[d].verdict, INCONCLUSIVE);
    assert.match(row[d].reason, /no SPORTMONKS_KEY/);
  }
});

test("a league missing from SportMonks' plan-scoped search is INCONCLUSIVE, not NOT_COVERED", async () => {
  const { fetchImpl } = stubFetch([["/leagues/search/", { data: [{ id: 501, name: "Premiership", country: { name: "Scotland" } }] }]]);
  const row = await probeSportMonksLeague(makeClient({ base: "https://sm.test", fetchImpl }), JM);
  for (const d of DIMENSIONS) {
    assert.equal(row[d].verdict, INCONCLUSIVE);
    assert.match(row[d].reason, /only leagues on your plan/);
  }
});

test("across providers, NOT_COVERED needs every provider to say so; a skipped provider is never dropped", () => {
  const nc = { verdict: NOT_COVERED }, inc = { verdict: INCONCLUSIVE }, cov = { verdict: COVERED };
  assert.equal(combine([nc, nc, nc]), NOT_COVERED);
  assert.equal(combine([nc, inc, nc]), INCONCLUSIVE, "one provider that could not tell keeps the verdict open");
  assert.equal(combine([nc, inc, cov]), COVERED);
  assert.equal(combine([undefined, nc]), INCONCLUSIVE, "a missing row is not agreement");
  assert.equal(combine([]), INCONCLUSIVE);
});

test("readApiFootball: HTTP 200 with errors is not an answer", () => {
  assert.equal(readApiFootball({ status: 200, json: { errors: { requests: "You have reached the request limit for the day" }, response: [] } }).reason,
    "rate limited: You have reached the request limit for the day");
  assert.equal(readApiFootball({ status: 200, json: { errors: [], response: [] } }).answered, true);
  assert.equal(readApiFootball({ status: 499, json: null }).answered, false);
  assert.equal(readApiFootball({ exhausted: true }).answered, false);
});

test("allowedSeasons reads season ranges, not date ranges; history picks the latest allowed past season", () => {
  assert.deepEqual(allowedSeasons(PLAN_SEASON), [2022, 2024]);
  assert.equal(allowedSeasons({ plan: "Free plans do not have access to this date, try from 2026-09-12 to 2026-09-14." }), null);
  assert.equal(pickHistoricalSeason([2011, 2022, 2023, 2024, 2025, 2026], 2026, [2022, 2024]), 2024);
  assert.equal(pickHistoricalSeason([2011, 2025, 2026], 2026, [2022, 2024]), null);
  assert.equal(pickHistoricalSeason([2025, 2026], 2026, null), 2025);
});
