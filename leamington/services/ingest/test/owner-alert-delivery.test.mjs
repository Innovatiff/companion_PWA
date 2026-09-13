/**
 * An owner alert counts only if it reached the owner. A failed delivery is
 * recorded, logged at error, counted in feed health, and fails /health.
 *
 * Runs against a throwaway local Postgres (see helpers/local-db.mjs):
 *   npm test
 */
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { localDbUnavailable, useFreshDatabase, stubFetch } from "./helpers/local-db.mjs";

const unavailable = localDbUnavailable();
const skip = unavailable ?? false;
const WEBHOOK = "https://hooks.example.invalid/owner";

let db, checkStaleness, snapshot;

before(async () => {
  if (unavailable) return;
  useFreshDatabase("leamington_ingest_test_delivery");
  db = await import("../src/db.mjs");
  ({ checkStaleness } = await import("../src/monitor/staleness.mjs"));
  ({ snapshot } = await import("../src/health.mjs"));
});

after(async () => { await db?.closePool(); });

beforeEach(async () => {
  process.env.OWNER_ALERT_WEBHOOK = WEBHOOK;
  if (!unavailable) {
    await db.query("truncate owner_alert_deliveries, owner_alerts, source_runs restart identity cascade");
  }
});

/** Every active feed has a fresh successful run, except `staleFeed` (if any). */
async function allHealthyExcept(staleFeed) {
  await db.query(
    `insert into source_runs (feed, status)
     select feed, 'ok' from feed_expectations where active and feed is distinct from $1`, [staleFeed]);
}

/** Run one staleness check with the webhook answering `route`; capture stderr. */
async function check(route) {
  const net = stubFetch({ [WEBHOOK]: route });
  const lines = [];
  const write = process.stderr.write;
  process.stderr.write = (chunk, ...rest) => { lines.push(String(chunk)); return write.call(process.stderr, chunk, ...rest); };
  try {
    const result = await checkStaleness();
    return { result, logs: lines.flatMap((l) => l.split("\n")).filter(Boolean).map((l) => JSON.parse(l)) };
  } finally {
    process.stderr.write = write;
    net.restore();
  }
}

const lastDelivery = async () =>
  (await db.query(`select feed, kind, delivered, http_status, error
                     from owner_alert_deliveries order by id desc limit 1`)).rows[0];
const ownerAlert = async (feed) =>
  (await db.query(`select notify_count, last_notified_at, resolved_at from owner_alerts where feed = $1`, [feed])).rows[0];

test("a rejected webhook is not counted as notified, is logged, and fails /health", { skip }, async () => {
  await allHealthyExcept("fx");
  const { result, logs } = await check({ status: 500, body: "nope" });

  assert.equal(result.deliveryFailures, 1);
  const alert = await ownerAlert("fx");
  assert.equal(alert.notify_count, 0, "a rejected delivery must not count as notified");
  assert.equal(alert.last_notified_at, null);
  assert.deepEqual(await lastDelivery(),
    { feed: "fx", kind: "feed_stale", delivered: false, http_status: 500, error: "HTTP 500" });

  assert.ok(logs.some((l) => l.level === "error" && l.msg === "owner.alert.delivery_failed" && l.feed === "monitor:staleness"),
    "a failed delivery must produce an error log line");

  const { rows: [fx] } = await db.query(
    `select alert_delivery_failures_24h from feed_health_detail where feed = 'fx'`);
  assert.equal(fx.alert_delivery_failures_24h, 1);

  // fx alone would be "degraded"; the failed delivery is what makes it critical.
  const health = await snapshot();
  assert.equal(health.ownerAlertDelivery.status, "failing");
  assert.equal(health.status, "critical");
});

test("a webhook that throws is a failed delivery, not a crashed monitor", { skip }, async () => {
  await allHealthyExcept("fx");
  const { result } = await check(Object.assign(new Error("getaddrinfo ENOTFOUND hooks.example.invalid"), { code: "ENOTFOUND" }));

  assert.equal(result.deliveryFailures, 1);
  assert.deepEqual(await lastDelivery(),
    { feed: "fx", kind: "feed_stale", delivered: false, http_status: null, error: "DNS lookup failed" });
});

test("no webhook configured is a failed delivery", { skip }, async () => {
  await allHealthyExcept("fx");
  delete process.env.OWNER_ALERT_WEBHOOK;
  await check({ status: 200 });

  const d = await lastDelivery();
  assert.equal(d.delivered, false);
  assert.equal(d.error, "no OWNER_ALERT_WEBHOOK configured");
  assert.equal((await snapshot()).status, "critical");
});

test("a failed delivery is retried on the next check and cleared once it gets through", { skip }, async () => {
  await allHealthyExcept("fx");
  await check({ status: 502 });
  const { result } = await check({ status: 200 });

  assert.equal(result.opened + result.renotified, 1);
  assert.equal((await ownerAlert("fx")).notify_count, 1);
  assert.equal((await lastDelivery()).delivered, true);

  const health = await snapshot();
  assert.equal(health.ownerAlertDelivery.status, "ok");
  assert.equal(health.status, "degraded", "fx is still never_run; delivery no longer makes it critical");
});

test("a recovery is not resolved until the owner has been told", { skip }, async () => {
  await allHealthyExcept("fx");
  await check({ status: 200 });                                   // fx stale: owner told
  await db.query(`insert into source_runs (feed, status) values ('fx', 'ok')`);

  await check({ status: 500 });                                   // recovered, but not delivered
  assert.equal((await ownerAlert("fx")).resolved_at, null, "must stay open while the owner has not been told");
  assert.deepEqual(await lastDelivery(),
    { feed: "fx", kind: "recovered", delivered: false, http_status: 500, error: "HTTP 500" });

  await check({ status: 200 });                                   // retried and delivered
  assert.notEqual((await ownerAlert("fx")).resolved_at, null);
  assert.equal((await lastDelivery()).delivered, true);
});

test("before any delivery the path is untested, which is not ok", { skip }, async () => {
  await allHealthyExcept(null);
  const health = await snapshot();
  assert.equal(health.ownerAlertDelivery.status, "untested");
  assert.equal(health.status, "degraded");
});
