/**
 * FX: the ECB source covers MXN; the open dataset fills HNL, GTQ and JMD. A
 * currency no provider quotes is reported, and no answer at all is an error,
 * never "no rates today".
 */
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { localDbUnavailable, useFreshDatabase, stubFetch } from "./helpers/local-db.mjs";

const unavailable = localDbUnavailable();
const skip = unavailable ?? false;

const FRANKFURTER = "https://api.frankfurter.app/latest?from=CAD&to=MXN,HNL,GTQ,JMD";
const CURRENCY_API = "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/cad.json";
const MIRROR = "https://latest.currency-api.pages.dev/v1/currencies/cad.json";

let db, runFeed, ingestFx, parseCurrencyApi;
before(async () => {
  if (unavailable) return;
  useFreshDatabase("leamington_ingest_test_fx");
  db = await import("../src/db.mjs");
  ({ runFeed } = await import("../src/run-feed.mjs"));
  ({ ingestFx, parseCurrencyApi } = await import("../src/feeds/fx.mjs"));
});
beforeEach(async () => { if (db) await db.query("delete from fx_rates"); });
after(async () => { if (db) await db.closePool(); });

const rates = async () => Object.fromEntries((await db.query("select quote::text, rate::float from fx_rates order by quote")).rows.map((r) => [r.quote, r.rate]));

test("the open dataset parses to upper-case currency codes", { skip }, () => {
  assert.deepEqual(parseCurrencyApi({ date: "2026-09-13", cad: { hnl: 19.4, jmd: 113.86 } }), { date: "2026-09-13", rates: { HNL: 19.4, JMD: 113.86 } });
});

test("ECB covers MXN and the open dataset fills the rest", { skip }, async () => {
  const f = stubFetch({
    [FRANKFURTER]: JSON.stringify({ date: "2026-09-11", rates: { MXN: 12.2509 } }),
    [CURRENCY_API]: JSON.stringify({ date: "2026-09-13", cad: { mxn: 12.2373, hnl: 19.3974, gtq: 5.5004, jmd: 113.8601 } }),
  });
  try {
    const r = await runFeed("fx", ingestFx);
    assert.equal(r.status, "ok");
    assert.equal(r.recordsWritten, 4);
    const got = await rates();
    assert.equal(got.MXN, 12.2509, "the first source's MXN is kept");
    assert.equal(got.HNL, 19.3974);
    assert.equal(got.GTQ, 5.5004);
    assert.equal(got.JMD, 113.8601);
    const dates = Object.fromEntries((await db.query("select quote::text, to_char(rate_date, 'YYYY-MM-DD') as d from fx_rates")).rows.map((r) => [r.quote, r.d]));
    assert.deepEqual(dates, { MXN: "2026-09-11", HNL: "2026-09-13", GTQ: "2026-09-13", JMD: "2026-09-13" },
      "each currency is stored under the date its own source published");
    assert.ok(!f.requested.includes(MIRROR), "the mirror is not called when not needed");
  } finally { f.restore(); }
});

test("the mirror is used when the CDN does not answer", { skip }, async () => {
  const f = stubFetch({
    [FRANKFURTER]: JSON.stringify({ date: "2026-09-11", rates: { MXN: 12.25 } }),
    [CURRENCY_API]: new Error("ECONNRESET"),
    [MIRROR]: JSON.stringify({ date: "2026-09-13", cad: { hnl: 19.39, gtq: 5.5, jmd: 113.86 } }),
  });
  try {
    const r = await runFeed("fx", ingestFx);
    assert.equal(r.recordsWritten, 4);
  } finally { f.restore(); }
});

test("a currency nobody quotes is reported, and nothing answering is an error", { skip }, async () => {
  let f = stubFetch({
    [FRANKFURTER]: JSON.stringify({ date: "2026-09-11", rates: { MXN: 12.25 } }),
    [CURRENCY_API]: new Error("ECONNRESET"),
    [MIRROR]: new Error("ECONNRESET"),
  });
  try {
    const r = await runFeed("fx", ingestFx);
    assert.equal(r.status, "partial", "a missing currency is not a clean run");
    assert.equal(r.recordsWritten, 1);
  } finally { f.restore(); }
  f = stubFetch({ [FRANKFURTER]: new Error("ENOTFOUND"), [CURRENCY_API]: new Error("ENOTFOUND"), [MIRROR]: new Error("ENOTFOUND") });
  try {
    const r = await runFeed("fx", ingestFx);
    assert.equal(r.status, "error");
  } finally { f.restore(); }
});
