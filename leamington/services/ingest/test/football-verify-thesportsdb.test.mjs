/**
 * TheSportsDB's free key answers every endpoint, but not always about the league
 * asked for. A response about another league, or a capped sample, is not
 * coverage.
 *
 *   npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { COVERED, INCONCLUSIVE, LEAGUES, makeClient, probeTheSportsDbLeague, failedProbe } from "../verify/football.mjs";

const JM = LEAGUES.find((l) => l.key === "JM");

function stubClient(routes) {
  const fetchImpl = async (url) => {
    const hit = routes.find(([match]) => url.includes(match));
    if (!hit) throw new Error(`unrouted request in test: ${url}`);
    const body = hit[1];
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status: 200 });
  };
  return makeClient({ base: "https://tsdb.test", fetchImpl });
}

const SEARCH = { countries: [{ idLeague: "5075", strLeague: "Jamaican Premier League", strCurrentSeason: "2026-2027" }] };
const JM_EVENT = { events: [{ idLeague: "5075", strLeague: "Jamaican Premier League", strEvent: "Dunbeholden vs Cavalier" }] };
const SEASONS = { seasons: [{ strSeason: "2024-2025" }] };
const rows = (n, idLeague = "5075", extra = {}) =>
  Array.from({ length: n }, (_, i) => ({ idLeague, strLeague: idLeague === "5075" ? "Jamaican Premier League" : "English League 1", intRank: i + 1, ...extra }));

// What the free key actually returned for Jamaica on 2026-09-13.
const FREE_KEY_ROUTES = [
  ["/search_all_leagues.php", SEARCH],
  ["/eventsnextleague.php", JM_EVENT],
  ["/lookuptable.php", { table: rows(5) }],
  ["/lookup_all_teams.php", { teams: rows(24, "4396", { strBadge: "https://badge" }) }],
  ["/eventspastleague.php", JM_EVENT],
  ["/search_all_seasons.php", SEASONS],
];

test("teams belonging to another league are not crests for this one", async () => {
  const row = await probeTheSportsDbLeague(stubClient(FREE_KEY_ROUTES), JM, { freeKey: true });
  assert.equal(row.crests.verdict, INCONCLUSIVE);
  assert.match(row.crests.reason, /rows for English League 1, not this league/);
});

test("a free-key table of five rows does not show that a full table exists", async () => {
  const row = await probeTheSportsDbLeague(stubClient(FREE_KEY_ROUTES), JM, { freeKey: true });
  assert.equal(row.table.verdict, INCONCLUSIVE);
  assert.match(row.table.reason, /at most 5/);
  assert.equal(row.fixtures.verdict, COVERED, "a real upcoming event for this league does show fixtures exist");
});

test("an empty body is an empty answer, not a failed probe", async () => {
  const routes = FREE_KEY_ROUTES.map(([m, b]) => [m, m === "/lookuptable.php" ? "" : b]);
  const row = await probeTheSportsDbLeague(stubClient(routes), JM, { freeKey: true });
  assert.equal(row.table.verdict, INCONCLUSIVE);
  assert.match(row.table.reason, /returned nothing/);
  assert.equal(failedProbe(row.table), false);
});

test("with a full key, rows that belong to the league count", async () => {
  const routes = FREE_KEY_ROUTES.map(([m, b]) =>
    [m, m === "/lookuptable.php" ? { table: rows(14) } : m === "/lookup_all_teams.php" ? { teams: rows(14, "5075", { strBadge: "https://badge" }) } : b]);
  const row = await probeTheSportsDbLeague(stubClient(routes), JM, { freeKey: false });
  assert.equal(row.table.verdict, COVERED);
  assert.equal(row.crests.verdict, COVERED);
  assert.match(row.crests.reason, /14\/14/);
});
