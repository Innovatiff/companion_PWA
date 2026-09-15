/**
 * Warnings for the family's towns (0052), from real Meteorological Service of
 * Jamaica CAP documents (test/fixtures/jm-cap, saved from the Alert Hub archive
 * of jm-jms-en, September 2026), and the Mexico readiness parser on a saved SMN
 * sample (test/fixtures/smn).
 *
 * The Jamaican documents are used word for word. Only their clock moves: sent,
 * effective, onset and expires shift together so each message is live today
 * (an expired message rightly pushes to nobody). JMS published no Cancel in its
 * last 100 messages, so the one Cancel here is SYNTHETIC: a real Thunderstorm
 * Watch with msgType, identifier and references changed and its area removed.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { localDbUnavailable, useFreshDatabase, stubFetch } from "./helpers/local-db.mjs";
import { parseCapDocument, parseFeedIndex } from "../src/feeds/cap.mjs";
import { payloadFor } from "../src/feeds/notify.mjs";
import { areaStates, hubSources, summarise, vertexCounts } from "../scripts/alerts-readiness.mjs";

const unavailable = localDbUnavailable();
const skip = unavailable ?? false;

const FEED = "https://alert.metservice.gov.jm/capfeed.php";
const AGENCY = "Meteorological Service Jamaica";
const AFFILIATE = "fa000000-0000-4000-8000-0000000000f1";
const EAST = "fa000000-0000-4000-8000-0000000000e1";    // en: home Kingston, watches Port Maria and Montego Bay
const EAST_ES = "fa000000-0000-4000-8000-0000000000e2"; // es: home Port Maria
const NORTH = "fa000000-0000-4000-8000-0000000000a1";   // es: home Montego Bay, watches Ocho Rios and Port Antonio

const jm = (name) => readFileSync(new URL(`./fixtures/jm-cap/${name}`, import.meta.url), "utf8");
const smn = (name) => readFileSync(new URL(`./fixtures/smn/${name}`, import.meta.url), "utf8");
const tag = (xml, t) => new RegExp(`<${t}>([\\s\\S]*?)</${t}>`).exec(xml)?.[1];

/** Move a document's clock (never its words) so that `anchor`'s expiry falls 6 hours from now. */
const deltaFor = (anchor) => Date.now() + 6 * 3_600_000 - Date.parse(tag(anchor, "expires"));
const shifted = (xml, delta) => xml.replace(/<(sent|effective|onset|expires)>([^<]+)<\/\1>/g,
  (_, t, v) => `<${t}>${new Date(Date.parse(v) + delta).toISOString().replace(/\.\d+Z$/, "+00:00")}</${t}>`);

const index = (links) => `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <link href="http://alert.metservice.gov.jm/capfeed.php" rel="self"/>
  <id>http://alert.metservice.gov.jm/capfeed.php</id>
  ${links.map((l) => `<entry><id>${l}</id><title>entry</title><link href="${l}"/></entry>`).join("\n  ")}
</feed>`;

let db, runFeed, ingestAlerts;

async function ingest(docs) {
  const routes = { [FEED]: index(Object.keys(docs)) };
  Object.assign(routes, docs);
  const net = stubFetch(routes);
  try { return await runFeed("alerts:JM", ingestAlerts); } finally { net.restore(); }
}
const alertId = async (identifier) =>
  (await db.query("select id from weather_alerts where cap_identifier = $1 order by id desc limit 1", [identifier])).rows[0]?.id;
const pushes = async (id) => (await db.query(
  "select client_id, title, body, alert_towns, alert_reason from notifications where weather_alert_id = $1 and channel = 'alert' order by client_id",
  [id])).rows;
const markSent = (id) => db.query("update notifications set status = 'sent', attempts = 1, sent_at = now() where weather_alert_id = $1", [id]);

before(async () => {
  if (unavailable) return;
  useFreshDatabase("leamington_ingest_test_family");
  db = await import("../src/db.mjs");
  ({ runFeed } = await import("../src/run-feed.mjs"));
  ({ ingestAlerts } = await import("../src/feeds/alerts.mjs"));
  await db.query("insert into affiliates (id, name) values ($1, 'Family Warnings Test')", [AFFILIATE]);
  const town = async (name) => (await db.query("select id from municipalities where country = 'JM' and name = $1 order by id limit 1", [name])).rows[0].id;
  const add = (id, code, lang, home) => db.query(
    `insert into clients (id, affiliate_id, code, full_name, country, language, municipality_id, municipality, timezone)
     values ($1, $2, $3, $3, 'JM', $4, $5, $6, 'America/Toronto')`, [id, AFFILIATE, code, lang, home.id, home.name]);
  const place = async (name) => ({ id: await town(name), name });
  await add(EAST, "FAMJM234", "en", await place("Kingston"));
  await add(EAST_ES, "FAMJM236", "es", await place("Port Maria"));
  await add(NORTH, "FAMJM243", "es", await place("Montego Bay"));
  for (const [c, name] of [[EAST, "Port Maria"], [EAST, "Montego Bay"], [NORTH, "Ocho Rios"], [NORTH, "Port Antonio"]]) {
    await db.query("insert into client_watch_locations (client_id, municipality_id) values ($1, $2)", [c, await town(name)]);
  }
});

after(async () => { await db?.closePool(); });

test("real JMS Thunderstorm Watch: one push per client naming their covered towns, in the agency's words; its Cancel reaches the same people", { skip }, async () => {
  const raw = jm("thunderstorm-watch-severe.xml");
  const doc = shifted(raw, deltaFor(raw));
  const url = "https://alert.metservice.gov.jm/cap/thunderstorm-watch.xml";
  const run = await ingest({ [url]: doc });
  assert.equal(run.status, "ok", JSON.stringify(run));

  const id = await alertId(tag(raw, "identifier"));
  const { rows: [stored] } = await db.query("select level, event, headline, description, area_desc from weather_alerts where id = $1", [id]);
  assert.equal(stored.level, "orange");
  // Verbatim: exactly the agency's text. JMS writes CRLF line ends, which every
  // XML parser must read as LF (XML 1.0, section 2.11); nothing else differs.
  const xmlText = (t) => tag(raw, t).replace(/\r\n?/g, "\n").trim();
  assert.equal(stored.event, xmlText("event"));
  assert.equal(stored.description, xmlText("description"));
  assert.equal(stored.area_desc, "Kingston, Portland, St. Andrew, St. Mary, St. Thomas");
  assert.equal(stored.headline, null, "JMS publishes no <headline>; the event is the wording");

  const sent = await pushes(id);
  assert.deepEqual(sent.map((n) => [n.client_id, n.title, n.body, n.alert_towns, n.alert_reason]), [
    [EAST, `Orange · ${AGENCY}`, "Thunderstorm Watch — Kingston, Port Maria", ["Kingston", "Port Maria"], "area"],
    [EAST_ES, `Naranja · ${AGENCY}`, "Thunderstorm Watch — Port Maria", ["Port Maria"], "area"],
  ]);
  assert.ok(sent.every((n) => n.body.startsWith(tag(raw, "event"))), "the body opens with the agency's event, unchanged");

  // The same document again: nothing more is sent.
  await ingest({ [url]: doc });
  assert.equal((await pushes(id)).length, 2);

  // SYNTHETIC Cancel (see the header): no area, referencing the real watch.
  await markSent(id);
  const cancel = doc
    .replace(/<identifier>[^<]+<\/identifier>/, "<identifier>SYNTHETIC-CANCEL-OF-THUNDERSTORM-WATCH</identifier>")
    .replace("<msgType>Alert</msgType>",
      `<msgType>Cancel</msgType>\n  <references>NMCforecaster@metservice.gov.jm,${tag(raw, "identifier")},${tag(doc, "sent")}</references>`)
    .replace(/<area>[\s\S]*<\/area>/, "");
  const c = await ingest({ "https://alert.metservice.gov.jm/cap/synthetic-cancel.xml": cancel });
  assert.equal(c.status, "ok", "a Cancel without an area is not a partial run");
  const cancelled = await pushes(await alertId("SYNTHETIC-CANCEL-OF-THUNDERSTORM-WATCH"));
  assert.deepEqual(cancelled.map((n) => [n.client_id, n.title, n.body, n.alert_reason]), [
    [EAST, `Cancelled: Orange · ${AGENCY}`, "Thunderstorm Watch — Kingston, Port Maria", "lifecycle"],
    [EAST_ES, `Cancelado: Naranja · ${AGENCY}`, "Thunderstorm Watch — Port Maria", "lifecycle"],
  ]);
  const { rows: [after] } = await db.query("select cancelled_at from weather_alerts where id = $1", [id]);
  assert.ok(after.cancelled_at, "the watch is no longer active");
});

test("real JMS Alert and its Update: the watched towns are named, and the Update reaches whoever got the original", { skip }, async () => {
  const alertXml = jm("wind-waves-advisory-alert.xml");
  const updateXml = jm("wind-waves-advisory-update.xml");
  assert.ok(tag(updateXml, "references").includes(tag(alertXml, "identifier")), "the saved Update references the saved Alert");
  const delta = deltaFor(alertXml);

  await ingest({ "https://alert.metservice.gov.jm/cap/wind-alert.xml": shifted(alertXml, delta) });
  const original = await alertId(tag(alertXml, "identifier"));
  assert.deepEqual((await pushes(original)).map((n) => [n.client_id, n.title, n.body]), [
    [NORTH, `Naranja · ${AGENCY}`, "Strong Wind and Large Waves Advisory — Ocho Rios, Port Antonio"],
  ], "home Montego Bay is not inside the inshore polygon; the two watched towns are, in one push");
  await markSent(original);

  await ingest({ "https://alert.metservice.gov.jm/cap/wind-update.xml": shifted(updateXml, delta) });
  const update = await alertId(tag(updateXml, "identifier"));
  assert.deepEqual((await pushes(update)).map((n) => [n.client_id, n.title, n.body]), [
    [NORTH, `Actualizado: Naranja · ${AGENCY}`, "Strong Wind and Large Waves Advisory — Ocho Rios, Port Antonio"],
  ]);
  const { rows: [o] } = await db.query("select superseded_by_id from weather_alerts where id = $1", [original]);
  assert.equal(o.superseded_by_id, update);
});

test("real JMS Thunderstorm Advisory (Moderate, yellow) over a client's home: stored for the app, never pushed", { skip }, async () => {
  const raw = jm("thunderstorm-advisory-moderate.xml");
  await ingest({ "https://alert.metservice.gov.jm/cap/advisory.xml": shifted(raw, deltaFor(raw)) });
  const id = await alertId(tag(raw, "identifier"));
  const { rows: [a] } = await db.query("select level from weather_alerts where id = $1", [id]);
  assert.equal(a.level, "yellow");
  const { rows: [m] } = await db.query("select count(*)::int as n from app.alert_client_towns($1, $2)", [id, NORTH]);
  assert.equal(m.n, 1, "Montego Bay is inside the advisory's polygon");
  assert.equal((await pushes(id)).length, 0);
});

test("tapping an alert opens Clima's warnings focused on that message", () => {
  assert.equal(payloadFor({ id: 9, channel: "alert", title: "t", body: "b", weather_alert_id: 42 }).url, "/clima?aviso=42#avisos");
  assert.equal(payloadFor({ id: 9, channel: "alert", title: "t", body: "b", weather_alert_id: null }).url, "/clima#avisos");
});

test("Mexico readiness parser on a saved SMN sample", () => {
  const feed = parseFeedIndex(smn("feed-sample.xml"), "https://smn.conagua.gob.mx/tools/PHP/feedsmn/cap.php");
  assert.equal(feed.documents.length, 3);
  assert.equal(feed.placeholders.length, 0);

  const docs = ["avisossmn-lluvias-20260914-110537_cap.xml", "avisossmn-lluvias-20260914-105717_cap.xml"]
    .map((n) => parseCapDocument(smn(n), n));
  assert.deepEqual(docs.map((d) => [d.capIdentifier, d.capSender, d.severityRaw, d.level, d.headline, d.event, d.areaDesc]), [
    ["avisossmn-LLuvias-318", "smn.conagua.gob.mx", "Moderate", "yellow", "Canal de baja presión", "Aviso de lluvias", "DGO, GTO, JAL, MICH, NAY, ZAC"],
    ["avisossmn-LLuvias-317", "smn.conagua.gob.mx", "Moderate", "yellow", "Monzón mexicano", "Aviso de lluvias", "SIN"],
  ]);
  assert.deepEqual(docs.map((d) => vertexCounts(d.polygonWkts)), [[8, 4], [9]], "state-shaped polygons of a handful of vertices");
  assert.deepEqual(areaStates("DGO, GTO, JAL, MICH, NAY, ZAC").names, ["Durango", "Guanajuato", "Jalisco", "Michoacán", "Nayarit", "Zacatecas"]);
  assert.deepEqual(areaStates("SIN, XYZ").unknown, ["XYZ"], "an unknown code is reported, never guessed");

  const s = summarise(docs, { now: new Date("2026-09-14T12:00:00-06:00"), expectedSender: "smn.conagua.gob.mx" });
  assert.equal(s.documents, 2);
  assert.equal(s.live, 2);
  assert.deepEqual(s.levels, { yellow: 2 });
  assert.deepEqual(s.foreignSenders, []);
  assert.deepEqual(s.vertices, { polygons: 3, min: 4, median: 8, max: 9 });
  assert.equal(summarise(docs, { now: new Date("2026-09-16T00:00:00Z") }).live, 0, "expired documents are not live");

  // The hub's Mexico feed is a geographic filter: the live one carried only NOAA items.
  const hub = hubSources([
    { link: "https://cap-alerts.s3.amazonaws.com/us-noaa-nws-en/2026/a.xml" },
    { link: "https://cap-alerts.s3.amazonaws.com/mx-smn-es/2026/b.xml" },
  ], "mx-smn-es");
  assert.deepEqual(hub, { total: 2, national: 1, foreign: { "us-noaa-nws-en": 1 } });
});
