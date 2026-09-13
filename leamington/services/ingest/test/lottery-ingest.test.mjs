/**
 * The lottery ingest loop: an unimplemented game makes the run INCONCLUSIVE, a
 * failing parser is a warning (never zero rows presented as success), and each
 * distinct results URL is fetched once per run.
 *
 * Pure tests use injected games, fetch and store. The last test runs the real
 * seed and upserts against a throwaway local Postgres (helpers/local-db.mjs) and
 * is skipped when none is running.
 *   node --test test/lottery*.test.mjs
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { ingestLottery, parserFor, expectedLatestSlot } from "../src/feeds/lottery.mjs";
import { API_KEY } from "../src/feeds/lottery/jamaica.mjs";
import { localDbUnavailable, useFreshDatabase, stubFetch } from "./helpers/local-db.mjs";

const fixture = (name) => readFileSync(new URL(`./fixtures/lottery/${name}`, import.meta.url), "utf8");
const NOW = new Date("2026-09-13T21:50:00Z");

const SVL = "https://test-results.supremeventures.com/public/game/result/gameId";
const GT = "https://prociegosysordos.org.gt/resultados";
const HN = "https://loto.hn/api";
const MX = "https://www.loterianacional.gob.mx";

/** Every URL the seeded active games read on NOW, mapped to its real response. */
const ROUTES = {
  [`${SVL}/1/no/12`]: fixture("jm-svl-cash-pot.json"),
  [`${SVL}/7/no/10`]: fixture("jm-svl-pick-3.json"),
  [`${SVL}/5/no/4`]: fixture("jm-svl-lotto.json"),
  [`${MX}/Melate/Resultados`]: fixture("mx-melate-resultados.html"),
  [`${MX}/Chispazo/Resultados`]: fixture("mx-chispazo-resultados.html"),
  [`${MX}/Tris/Resultados`]: fixture("mx-tris-resultados.html"),
  [`${GT}/`]: fixture("gt-resultados-index.html"),
  [`${GT}/ordinario/3136/`]: fixture("gt-ordinario-3136.html"),
  [`${GT}/extraordinario/414/`]: fixture("gt-extraordinario-414.html"),
  [`${HN}/resultados_diaria_por_fecha.php?fecha=2026-09-12`]: fixture("hn-diaria-2026-09-12.json"),
  [`${HN}/resultados_diaria_por_fecha.php?fecha=2026-09-13`]: fixture("hn-diaria-2026-09-13.json"),
  [`${HN}/resultados_juga3_por_fecha.php?fecha=2026-09-12`]: fixture("hn-juga3-2026-09-12.json"),
  [`${HN}/resultados_juga3_por_fecha.php?fecha=2026-09-13`]: fixture("hn-juga3-2026-09-13.json"),
  [`${HN}/resultados_superpremio_por_fecha.php?fecha=2026-09-09`]: fixture("hn-superpremio-2026-09-09.json"),
  [`${HN}/resultados_superpremio_por_fecha.php?fecha=2026-09-12`]: fixture("hn-superpremio-2026-09-12.json"),
};

const G = {
  cashPot: { id: 1, country: "JM", operator: "Supreme Ventures", name: "Cash Pot", timezone: "America/Jamaica",
    draw_times_local: ["08:30:00", "10:30:00", "13:00:00", "15:00:00", "17:00:00", "20:25:00"], draw_weekdays: null },
  lotto: { id: 2, country: "JM", operator: "Supreme Ventures", name: "Lotto", timezone: "America/Jamaica",
    draw_times_local: "{20:25:00}", draw_weekdays: [3, 6] },
  pick4: { id: 3, country: "JM", operator: "Supreme Ventures", name: "Pick 4", timezone: "America/Jamaica",
    draw_times_local: [], draw_weekdays: null },
  ordinario: { id: 4, country: "GT", operator: "Lotería Santa Lucía", name: "Sorteo Ordinario",
    timezone: "America/Guatemala", draw_times_local: [], draw_weekdays: [6] },
  extraordinario: { id: 5, country: "GT", operator: "Lotería Santa Lucía", name: "Sorteo Extraordinario",
    timezone: "America/Guatemala", draw_times_local: [], draw_weekdays: [0, 6] },
  unknownOperator: { id: 6, country: "HN", operator: "Lotería Electrónica", name: "Diaria",
    timezone: "America/Tegucigalpa", draw_times_local: ["11:00:00"], draw_weekdays: null },
};

function harness(routes = ROUTES) {
  const requests = [];
  const stored = [];
  const ctx = { log: { info() {}, warn() {}, error() {}, debug() {} }, warnings: [] };
  const fetchImpl = async (url, { headers }) => {
    requests.push({ url, headers });
    const route = routes[url];
    if (route === undefined) throw new Error(`unexpected fetch in test: ${url}`);
    if (route instanceof Error) throw route;
    return { body: route, status: 200 };
  };
  const run = (games, now = NOW) => ingestLottery(ctx, {
    now, loadGames: async () => games, store: async (g, d) => { stored.push({ game: g.name, ...d }); }, fetchImpl,
  });
  return { ctx, requests, stored, run };
}

test("a game with no parser makes the run throw INCONCLUSIVE, never an empty success", async () => {
  const h = harness();
  await assert.rejects(h.run([G.unknownOperator, G.pick4]), (err) => err.inconclusive && err.notImplemented &&
    /Lotería Electrónica \(Diaria\)/.test(err.message) && /Pick 4/.test(err.message));
  assert.equal(h.requests.length, 0);
  assert.match(h.ctx.warnings.join("\n"), /no parser implemented/);
});

test("an unimplemented game alongside a working one is still reported", async () => {
  const h = harness();
  const result = await h.run([G.cashPot, G.pick4]);
  assert.equal(result.recordsWritten, 12);
  assert.match(h.ctx.warnings.join("\n"), /no parser implemented: JM:Supreme Ventures \(Pick 4\)/);
});

test("one game's parser failing is a warning; the others are still stored", async () => {
  const broken = JSON.parse(fixture("jm-svl-lotto.json"));
  broken.Lotto[0].gameResult.winNumber = " 2 4 7";
  const h = harness({ ...ROUTES, [`${SVL}/5/no/4`]: JSON.stringify(broken) });
  const result = await h.run([G.cashPot, G.lotto]);
  assert.equal(result.recordsWritten, 12);
  assert.ok(h.stored.every((d) => d.game === "Cash Pot"), "nothing from the broken game is stored");
  assert.equal(h.ctx.warnings.length, 1);
  assert.match(h.ctx.warnings[0], /JM:Supreme Ventures Lotto: .*expected 6 numbers/);
});

test("when every game with a parser fails the run throws, not zero rows reported as success", async () => {
  const blocked = Object.assign(new Error("HTTP 403"), { httpStatus: 403 });
  const h = harness({ ...ROUTES, [`${SVL}/1/no/12`]: blocked, [`${SVL}/5/no/4`]: "[]" });
  await assert.rejects(h.run([G.cashPot, G.lotto]), (err) => err.inconclusive &&
    /every lottery game with a parser failed/.test(err.message) && /HTTP 403/.test(err.message));
  assert.equal(h.stored.length, 0);
  assert.equal(h.ctx.warnings.length, 2);
});

test("a shared results page is fetched once per run; SVL gets its bearer key; all with a browser UA", async () => {
  const h = harness();
  const result = await h.run([G.cashPot, G.ordinario, G.extraordinario]);
  assert.equal(result.recordsWritten, 14);
  assert.deepEqual(h.requests.map((r) => r.url), [`${SVL}/1/no/12`, `${GT}/`, `${GT}/ordinario/3136/`, `${GT}/extraordinario/414/`]);
  assert.equal(h.requests[0].headers.authorization, `Bearer ${API_KEY}`);
  assert.ok(h.requests.every((r) => /Mozilla\/5\.0/.test(r.headers["user-agent"])));
  const gt = h.stored.filter((d) => d.game.startsWith("Sorteo"));
  assert.deepEqual(gt.map((d) => [d.game, d.drawDate, d.drawTimeLocal, d.numbers[0]]),
    [["Sorteo Ordinario", "2026-09-12", null, "59251"], ["Sorteo Extraordinario", "2026-08-15", null, "08125"]]);
  assert.equal(gt[0].sourceUrl, `${GT}/ordinario/3136/`);
});

test("a source still answering with old draws is flagged as stale", async () => {
  const h = harness();
  const result = await h.run([G.cashPot], new Date("2026-09-15T14:00:00Z"));
  assert.equal(result.recordsWritten, 12, "the draws it did publish are still true");
  // 09:00 in Kingston, minus the two-hour publication grace: the last slot due is 20:25 the day before.
  assert.match(h.ctx.warnings.join("\n"), /newest published draw is 2026-09-13 15:00; the 2026-09-14 20:25 draw should be out/);
});

test("a seeded schedule that disagrees with the operator's is a failure, not mislabelled slots", async () => {
  const h = harness();
  await assert.rejects(h.run([{ ...G.cashPot, draw_times_local: ["08:30:00", "20:30:00"] }]), /disagrees with the operator's published schedule/);
});

test("the next expected slot follows weekdays and the publication grace", () => {
  assert.equal(expectedLatestSlot(G.lotto, NOW), "2026-09-12 20:25");
  assert.equal(expectedLatestSlot(G.cashPot, NOW), "2026-09-13 13:00");
  assert.equal(expectedLatestSlot(G.ordinario, NOW), null);
  assert.equal(parserFor(G.pick4), null);
  assert.ok(parserFor(G.extraordinario));
});

// ------------------------------------------------------- against real Postgres

const unavailable = localDbUnavailable();
let db, runFeed, storeDraw;

before(async () => {
  if (unavailable) return;
  useFreshDatabase("leamington_ingest_test_lottery");
  db = await import("../src/db.mjs");
  ({ runFeed } = await import("../src/run-feed.mjs"));
  ({ storeDraw } = await import("../src/feeds/lottery.mjs"));
});
after(async () => { await db?.closePool(); });

test("seeded games ingest end to end, and a second run updates in place (null draw times included)", { skip: unavailable ?? false }, async () => {
  const { rows: seeded } = await db.query(
    `select country, operator, name, parser_implemented, active from lottery_games order by country, operator, name`);
  assert.ok(seeded.every((g) => g.active === g.parser_implemented), "active only where a parser is confirmed");
  assert.equal(seeded.filter((g) => g.active).length, 11);

  const once = async () => {
    const net = stubFetch(ROUTES);
    try {
      return await runFeed("lottery", (ctx) => ingestLottery(ctx, { now: NOW }));
    } finally { net.restore(); }
  };
  const first = await once();
  const { rows: [firstRun] } = await db.query(`select notes from source_runs where feed = 'lottery' order by id desc limit 1`);
  assert.equal(first.status, "ok", JSON.stringify({ first, notes: firstRun.notes }));
  const second = await once();
  assert.equal(second.status, "ok");
  assert.equal(second.recordsWritten, first.recordsWritten);

  const { rows: [{ n }] } = await db.query(`select count(*)::int as n from lottery_results`);
  assert.equal(n, first.recordsWritten, "re-running never duplicates a draw");
  const { rows: gt } = await db.query(
    `select g.name, r.draw_date::text, r.draw_time_local, r.numbers, r.extras, r.source_url
       from lottery_results r join lottery_games g on g.id = r.game_id where g.country = 'GT' order by g.name`);
  assert.deepEqual(gt.map((r) => [r.name, r.draw_date, r.draw_time_local, r.numbers]), [
    ["Sorteo Extraordinario", "2026-08-15", null, ["08125", "69132", "44813"]],
    ["Sorteo Ordinario", "2026-09-12", null, ["59251", "36106", "64532"]],
  ]);
  const { rows: [tris] } = await db.query(
    `select r.draw_time_local::text, r.numbers, r.extras from lottery_results r join lottery_games g on g.id = r.game_id
      where g.name = 'Tris' and r.draw_date = '2026-09-13' and r.draw_time_local = '15:00'`);
  assert.deepEqual(tris, { draw_time_local: "15:00:00", numbers: ["5", "8", "9", "7", "4"],
    extras: { concurso: "36629", multiplicador: true } });

  // Storing a null-time draw with changed numbers updates the row, not a second one.
  const { rows: [ord] } = await db.query(`select * from lottery_games where name = 'Sorteo Ordinario'`);
  await storeDraw(ord, { drawDate: "2026-09-12", drawTimeLocal: null, numbers: ["11111", "22222", "33333"], extras: {} });
  const { rows: after } = await db.query(`select numbers from lottery_results where game_id = $1`, [ord.id]);
  assert.deepEqual(after, [{ numbers: ["11111", "22222", "33333"] }]);
});
