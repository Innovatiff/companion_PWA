/**
 * alerts:JM records what the agency said -- listed alerts, confirmed nothing is
 * active, or did not answer -- as three states, never collapsed into two.
 *
 * Runs against a throwaway local Postgres (see helpers/local-db.mjs):
 *   npm test
 */
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { localDbUnavailable, useFreshDatabase, stubFetch } from "./helpers/local-db.mjs";

const unavailable = localDbUnavailable();
const skip = unavailable ?? false;

// URLs as seeded in packages/db/seeds/alert_sources.sql.
const FEED = "https://alert.metservice.gov.jm/capfeed.php";
const HUB = "https://cap-alerts.s3.amazonaws.com/country-jm-lang-en/rss.xml";

// The real feed, captured 2026-09-13, while Jamaica had nothing active.
const NO_ACTIVE = readFileSync(new URL("./fixtures/jm-capfeed-no-active.xml", import.meta.url), "utf8");

// Synthetic, test-only: the same index listing one CAP document.
const DOC = "https://alert.metservice.gov.jm/cap/TEST-JM-1.xml";
const FEED_WITH_ALERT = NO_ACTIVE.replace(/<entry>[\s\S]*<\/entry>/,
  `<entry><id>${DOC}</id><title>Flash Flood Warning</title><link href='${DOC}'/></entry>`);
const CAP = `<?xml version="1.0" encoding="UTF-8"?>
<alert xmlns="urn:oasis:names:tc:emergency:cap:1.2">
  <identifier>TEST-JM-1</identifier><sender>test@example.invalid</sender>
  <sent>2026-09-13T12:00:00-05:00</sent><status>Actual</status><msgType>Alert</msgType><scope>Public</scope>
  <info>
    <language>en</language><category>Met</category><event>Flash Flood Warning</event>
    <urgency>Immediate</urgency><severity>Severe</severity><certainty>Likely</certainty>
    <expires>2099-01-01T00:00:00-05:00</expires>
    <area><areaDesc>Test Parish</areaDesc>
      <polygon>18.0,-77.0 18.0,-76.8 17.9,-76.8 17.9,-77.0 18.0,-77.0</polygon></area>
  </info>
</alert>`;

let db, runFeed, ingestAlerts;

before(async () => {
  if (unavailable) return;
  useFreshDatabase("leamington_ingest_test");
  db = await import("../src/db.mjs");
  ({ runFeed } = await import("../src/run-feed.mjs"));
  ({ ingestAlerts } = await import("../src/feeds/alerts.mjs"));
});

after(async () => { await db?.closePool(); });

beforeEach(async () => {
  if (!unavailable) await db.query("truncate source_runs, weather_alerts restart identity cascade");
});

async function runWith(routes) {
  const net = stubFetch(routes);
  try { await runFeed("alerts:JM", ingestAlerts); } finally { net.restore(); }
  const { rows: [run] } = await db.query(
    `select status, records_written, source_result, notes
       from source_runs where feed = 'alerts:JM' order by id desc limit 1`);
  const { rows: [health] } = await db.query(
    `select health, latest_result from feed_health_detail where feed = 'alerts:JM'`);
  const { rows: [{ n }] } = await db.query(`select count(*)::int as n from weather_alerts`);
  return { requested: net.requested, run, health, alerts: n };
}

test("the no-active-alerts placeholder is confirmed_empty and never an alert record", { skip }, async () => {
  const { requested, run, health, alerts } = await runWith({ [FEED]: NO_ACTIVE });

  assert.deepEqual(requested, [FEED],
    "the placeholder links back to the feed and must not be fetched as a CAP document");
  assert.equal(alerts, 0, "a placeholder entry must never become a weather_alerts row");
  assert.equal(run.status, "ok");
  assert.equal(run.source_result, "confirmed_empty");
  assert.equal(run.records_written, 0);
  assert.equal(run.notes, null, "a confirmed-empty run carries no warnings");
  assert.equal(health.latest_result, "confirmed_empty");
  assert.equal(health.health, "ok");
});

test("a listed CAP document is items, and is stored", { skip }, async () => {
  const { requested, run, health, alerts } = await runWith({ [FEED]: FEED_WITH_ALERT, [DOC]: CAP });

  assert.deepEqual(requested, [FEED, DOC]);
  assert.equal(alerts, 1);
  assert.equal(run.status, "ok");
  assert.equal(run.source_result, "items");
  assert.equal(run.records_written, 1);
  assert.equal(health.latest_result, "items");
  assert.equal(health.health, "ok");
});

test("an unreachable agency and hub is no_answer, never confirmed_empty", { skip }, async () => {
  const { run, health, alerts } = await runWith({
    [FEED]: new Error("connect ECONNREFUSED"),
    [HUB]: new Error("connect ECONNREFUSED"),
  });

  assert.equal(alerts, 0);
  assert.equal(run.status, "error");
  assert.equal(run.source_result, "no_answer");
  assert.equal(health.latest_result, "no_answer");
  assert.notEqual(health.health, "ok", "silence from the source must never read as healthy");
});
