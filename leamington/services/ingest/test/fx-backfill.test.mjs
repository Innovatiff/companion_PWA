/**
 * FX backfill: the same sources and parsing as the daily feed, each rate under
 * its source's date, missing days left missing, stored rows never overwritten,
 * a second run changes nothing, and nothing answering is an error.
 */
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { localDbUnavailable, useFreshDatabase, stubFetch } from "./helpers/local-db.mjs";

const unavailable = localDbUnavailable();
const skip = unavailable ?? false;

const SERIES = "https://api.frankfurter.app/2026-09-12..2026-09-14?from=CAD&to=MXN,HNL,GTQ,JMD";
const cdn = (d) => `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${d}/v1/currencies/cad.json`;
const mirror = (d) => `https://${d}.currency-api.pages.dev/v1/currencies/cad.json`;

let db, backfillFx, fx;
before(async () => {
  if (unavailable) return;
  useFreshDatabase("leamington_ingest_test_fx_backfill");
  db = await import("../src/db.mjs");
  ({ backfillFx } = await import("../src/feeds/fx-backfill.mjs"));
  fx = await import("../src/feeds/fx.mjs");
});
beforeEach(async () => { if (db) await db.query("delete from fx_rates"); });
after(async () => { if (db) await db.closePool(); });

const stored = async () => (await db.query(
  "select quote::text || ' ' || to_char(rate_date, 'YYYY-MM-DD') || ' ' || rate::float as r from fx_rates order by rate_date, quote::text")).rows.map((x) => x.r);

/** The daily feed already stored 14 Sept for the dataset's currencies. */
const dailyFeedRows = () => db.query(
  `insert into fx_rates (rate_date, quote, rate) values ('2026-09-14','HNL',19.99), ('2026-09-14','GTQ',5.51), ('2026-09-14','JMD',114)`);

function sources(overrides = {}) {
  return {
    // A weekend start: the series begins at the business day before (as the live API does).
    [SERIES]: JSON.stringify({ amount: 1, base: "CAD", start_date: "2026-09-11", end_date: "2026-09-11",
      rates: { "2026-09-11": { MXN: 12.2509 }, "not-a-date": { MXN: 1 } } }),
    [cdn("2026-09-12")]: new Error("ECONNRESET"),
    [mirror("2026-09-12")]: { status: 404, body: "not found" },
    [cdn("2026-09-13")]: JSON.stringify({ date: "2026-09-13", cad: { mxn: 12.2, hnl: 19.4, gtq: 5.5, jmd: 113.86, eur: 0.6 } }),
    ...overrides,
  };
}

test("the series parser keeps real dates, in order", { skip }, () => {
  assert.deepEqual(fx.parseFrankfurterSeries({ rates: { "2026-09-11": { MXN: 12.25 }, "2026-09-10": { MXN: 12.26 }, bad: {} } }),
    [{ date: "2026-09-10", rates: { MXN: 12.26 } }, { date: "2026-09-11", rates: { MXN: 12.25 } }]);
  assert.deepEqual(fx.parseFrankfurterSeries({}), []);
  assert.equal(fx.validRate("0"), null);
  assert.equal(fx.validRate("abc"), null);
  assert.equal(fx.validRate(19.4), 19.4);
  assert.equal(fx.currencyApiMirrorUrl("latest"), "https://latest.currency-api.pages.dev/v1/currencies/cad.json", "the daily feed's URL is unchanged");
});

test("fills missing days from each currency's own source, under the source's date", { skip }, async () => {
  await dailyFeedRows();
  const f = stubFetch(sources());
  try {
    const s = await backfillFx({ days: 3, today: "2026-09-14" });
    assert.deepEqual(s.frankfurter.quoted, ["MXN"]);
    assert.deepEqual(s.requests, { frankfurter: 1, cdn: 2, mirror: 1 });
    assert.ok(!f.requested.includes(cdn("2026-09-14")), "a day already complete is not fetched");
    assert.ok(!f.requested.includes(mirror("2026-09-13")), "the mirror only when the CDN does not give the file");
    assert.deepEqual(s.datasetDates.notPublished, ["2026-09-12"]);
    assert.equal(s.inserted, 4);
    assert.deepEqual(await stored(), [
      "MXN 2026-09-11 12.2509",
      "GTQ 2026-09-13 5.5", "HNL 2026-09-13 19.4", "JMD 2026-09-13 113.86",
      "GTQ 2026-09-14 5.51", "HNL 2026-09-14 19.99", "JMD 2026-09-14 114",
    ], "MXN from the series only; 12 Sept stays missing; the daily feed's 19.99 is kept");
  } finally { f.restore(); }
});

test("a second run changes nothing", { skip }, async () => {
  await dailyFeedRows();
  let f = stubFetch(sources());
  try { await backfillFx({ days: 3, today: "2026-09-14" }); } finally { f.restore(); }
  const first = await stored();
  f = stubFetch(sources());
  try {
    const s = await backfillFx({ days: 3, today: "2026-09-14" });
    assert.equal(s.inserted, 0);
    assert.ok(!f.requested.includes(cdn("2026-09-13")), "a filled day is not fetched again");
    assert.deepEqual(await stored(), first);
  } finally { f.restore(); }
});

test("a dry run writes nothing", { skip }, async () => {
  const f = stubFetch(sources({ [cdn("2026-09-14")]: { status: 404 }, [mirror("2026-09-14")]: { status: 404 } }));
  try {
    const s = await backfillFx({ days: 3, today: "2026-09-14", dryRun: true });
    assert.equal(s.found, 4);
    assert.equal(s.inserted, 0);
    assert.deepEqual(await stored(), []);
  } finally { f.restore(); }
});

test("without Frankfurter the dataset covers MXN too; nothing answering is an error", { skip }, async () => {
  let f = stubFetch({
    "https://api.frankfurter.app/2026-09-13..2026-09-13?from=CAD&to=MXN,HNL,GTQ,JMD": new Error("ENOTFOUND"),
    [cdn("2026-09-13")]: JSON.stringify({ date: "2026-09-13", cad: { mxn: 12.2, hnl: 19.4, gtq: 5.5, jmd: 113.86 } }),
  });
  try {
    const s = await backfillFx({ days: 1, today: "2026-09-13" });
    assert.equal(s.frankfurter.answered, false);
    assert.equal(s.inserted, 4);
  } finally { f.restore(); }

  f = stubFetch({
    "https://api.frankfurter.app/2026-09-15..2026-09-15?from=CAD&to=MXN,HNL,GTQ,JMD": new Error("ENOTFOUND"),
    [cdn("2026-09-15")]: new Error("ENOTFOUND"),
    [mirror("2026-09-15")]: new Error("ENOTFOUND"),
  });
  try {
    await assert.rejects(backfillFx({ days: 1, today: "2026-09-15" }), (e) => e.inconclusive === true);
  } finally { f.restore(); }
  await assert.rejects(backfillFx({ days: 0 }), /--days/);
});
