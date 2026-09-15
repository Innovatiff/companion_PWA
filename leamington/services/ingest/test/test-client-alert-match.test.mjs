/**
 * The alert -> client matching path, end to end, for the seeded test client in
 * Montego Bay (packages/db/fixtures/test_client.sql).
 *
 * A synthetic Jamaican CAP alert whose polygon contains Montego Bay is served
 * from the agency feed. The run must store it, match the test client by
 * coordinates, and queue an alert notification for them. A polygon elsewhere
 * must match nobody.
 *
 *   npm test
 */
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { localDbUnavailable, useFreshDatabase, stubFetch } from "./helpers/local-db.mjs";

const unavailable = localDbUnavailable();
const skip = unavailable ?? false;

const FEED = "https://alert.metservice.gov.jm/capfeed.php";
const DOC = "https://alert.metservice.gov.jm/cap/SYNTHETIC-1.xml";
const TEST_CLIENT = "7e57c000-0000-4000-8000-000000000001";
const FIXTURE = fileURLToPath(new URL("../../../packages/db/fixtures/test_client.sql", import.meta.url));

const index = (link) => `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <link href="http://alert.metservice.gov.jm/capfeed.php" rel="self"/>
  <id>http://alert.metservice.gov.jm/capfeed.php</id>
  <entry><id>${link}</id><title>Synthetic advisory</title><link href="${link}"/></entry>
</feed>`;

// CAP polygons are "lat,lon" pairs, latitude first.
const cap = (identifier, polygon) => `<?xml version="1.0" encoding="UTF-8"?>
<alert xmlns="urn:oasis:names:tc:emergency:cap:1.2">
  <identifier>${identifier}</identifier><sender>synthetic@test.invalid</sender>
  <sent>${new Date().toISOString().replace(/\.\d+Z$/, "+00:00")}</sent>
  <status>Actual</status><msgType>Alert</msgType><scope>Public</scope>
  <info>
    <language>en</language><category>Met</category><event>Synthetic Flash Flood Warning</event>
    <urgency>Immediate</urgency><severity>Severe</severity><certainty>Likely</certainty>
    <expires>${new Date(Date.now() + 86_400_000).toISOString().replace(/\.\d+Z$/, "+00:00")}</expires>
    <area><areaDesc>Synthetic area</areaDesc><polygon>${polygon}</polygon></area>
  </info>
</alert>`;

// Around Montego Bay (18.4762, -77.8939).
const AROUND_MONTEGO_BAY = "18.60,-78.05 18.60,-77.75 18.35,-77.75 18.35,-78.05 18.60,-78.05";
// Around Port Antonio, on the other end of the island.
const AROUND_PORT_ANTONIO = "18.25,-76.55 18.25,-76.35 18.10,-76.35 18.10,-76.55 18.25,-76.55";

let db, runFeed, ingestAlerts;

before(async () => {
  if (unavailable) return;
  useFreshDatabase("leamington_ingest_test_match");
  execFileSync("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-q", "-f", FIXTURE], { env: process.env, stdio: "pipe" });
  db = await import("../src/db.mjs");
  ({ runFeed } = await import("../src/run-feed.mjs"));
  ({ ingestAlerts } = await import("../src/feeds/alerts.mjs"));
});

after(async () => { await db?.closePool(); });

beforeEach(async () => {
  if (!unavailable) await db.query("truncate source_runs, weather_alerts restart identity cascade");
});

async function ingest(identifier, polygon) {
  const net = stubFetch({ [FEED]: index(DOC), [DOC]: cap(identifier, polygon) });
  try { await runFeed("alerts:JM", ingestAlerts); } finally { net.restore(); }
  const { rows: [alert] } = await db.query("select id, level from weather_alerts where cap_identifier = $1", [identifier]);
  return alert;
}

test("the test client is a real coastal town with a departure date, flagged as test", { skip }, async () => {
  const { rows: [c] } = await db.query(
    `select c.country, c.municipality, c.municipality_lat, c.municipality_lng, c.departure_date, c.is_test, a.is_test as affiliate_is_test
       from clients c join affiliates a on a.id = c.affiliate_id where c.id = $1`, [TEST_CLIENT]);
  assert.deepEqual(
    [c.country, c.municipality, c.municipality_lat, c.municipality_lng, c.is_test, c.affiliate_is_test],
    ["JM", "Montego Bay", 18.4762, -77.8939, true, true]);
  assert.ok(c.departure_date, "departure_date is set");
});

test("a CAP polygon containing the test client's coordinates matches them and queues an alert", { skip }, async () => {
  const alert = await ingest("SYNTHETIC-MOBAY-1", AROUND_MONTEGO_BAY);
  assert.ok(alert, "the alert is stored");
  assert.equal(alert.level, "orange");

  const { rows: matches } = await db.query("select client_id from app.clients_for_alert($1)", [alert.id]);
  assert.ok(matches.some((m) => m.client_id === TEST_CLIENT), "matched by coordinates inside the polygon");

  const { rows: [n] } = await db.query(
    `select channel, status, title, body, alert_towns from notifications where client_id = $1 and weather_alert_id = $2`, [TEST_CLIENT, alert.id]);
  assert.ok(n, "an alert notification is queued for the test client");
  assert.equal(n.channel, "alert");
  assert.equal(n.status, "queued");
  // 0052 copy: "{Level} · {agency}", then the agency's event verbatim and the towns (English client).
  assert.equal(n.title, "Orange · Meteorological Service Jamaica");
  assert.equal(n.body, "Synthetic Flash Flood Warning — Montego Bay");
  assert.deepEqual(n.alert_towns, ["Montego Bay"]);
});

test("a polygon on the other side of the island matches nobody", { skip }, async () => {
  const alert = await ingest("SYNTHETIC-PORTANTONIO-1", AROUND_PORT_ANTONIO);
  assert.ok(alert, "the alert is stored");
  const { rows: matches } = await db.query("select client_id from app.clients_for_alert($1)", [alert.id]);
  assert.equal(matches.length, 0);
  const { rows: [{ n }] } = await db.query("select count(*)::int as n from notifications where weather_alert_id = $1", [alert.id]);
  assert.equal(n, 0);
});
