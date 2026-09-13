/**
 * Push delivery against the real schema, with the push service stubbed:
 * alerts go first, each outcome is recorded on the notification in words,
 * expired subscriptions stop being used, and failures retry and then fail
 * visibly. Nothing is silently dropped.
 */
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { localDbUnavailable, useFreshDatabase } from "./helpers/local-db.mjs";

const unavailable = localDbUnavailable();
const skip = unavailable ?? false;

const AFFILIATE = "99990000-0000-4000-8000-00000000a0f1";
const WITH_PHONES = "99990000-0000-4000-8000-00000000a0c1";
const NO_PHONE = "99990000-0000-4000-8000-00000000a0c2";

let db, notify, webpush;
const vapid = () => ({ ...webpush.generateVapidKeys(), subject: "mailto:owner@example.invalid" });
const ctx = () => ({ log: { info() {}, warn() {}, error() {} }, warnings: [] });

function subscription(n) {
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.generateKeys();
  return { endpoint: `https://push.example.invalid/${n}`, p256dh: ecdh.getPublicKey("base64url"), auth: crypto.randomBytes(16).toString("base64url") };
}

const row = async (id) => (await db.query("select * from notifications where id = $1", [id])).rows[0];

async function queueAlert(clientId, identifier) {
  const { rows } = await db.query(
    `insert into notifications (client_id, local_date, channel, trigger, title, body, cap_identifier, scheduled_for)
     values ($1, current_date, 'alert', 'weather_alert', 'Flash Flood Warning', 'St. James', $2, now() - interval '1 minute')
     returning id`, [clientId, identifier]);
  return rows[0].id;
}

async function queueEngagement(clientId) {
  await db.query("select app.queue_engagement_notification($1, current_date, 'lottery', 'Resultados', '01 · 02 · 03', now() - interval '1 minute')", [clientId]);
  return (await db.query("select id from notifications where client_id = $1 and channel = 'engagement'", [clientId])).rows[0].id;
}

before(async () => {
  if (unavailable) return;
  useFreshDatabase("leamington_ingest_test_notify");
  db = await import("../src/db.mjs");
  notify = await import("../src/feeds/notify.mjs");
  webpush = await import("../src/push/webpush.mjs");
  await db.query("insert into affiliates (id, name) values ($1, 'Notify Test')", [AFFILIATE]);
  await db.query(
    `insert into clients (id, affiliate_id, code, full_name, country, language) values
       ($2, $1, 'NQTJFY23', 'Con Teléfono', 'JM', 'en'), ($3, $1, 'NQTJFY24', 'Sin Teléfono', 'JM', 'en')`,
    [AFFILIATE, WITH_PHONES, NO_PHONE]);
});

beforeEach(async () => {
  if (unavailable) return;
  await db.query("delete from notifications");
  await db.query("delete from push_subscriptions");
  for (const n of [1, 2]) {
    const s = subscription(n);
    await db.query("select app.save_push_subscription($1, $2, $3, $4, 'test')", [WITH_PHONES, s.endpoint, s.p256dh, s.auth]);
  }
});

after(async () => { if (db) await db.closePool(); });

test("a client with no working subscription: suppressed, and says why", { skip }, async () => {
  const id = await queueAlert(NO_PHONE, "NP-1");
  let calls = 0;
  await notify.sendDueNotifications(ctx(), { vapid: vapid(), send: async () => { calls++; return { ok: true }; } });
  const n = await row(id);
  assert.equal(n.status, "suppressed");
  assert.equal(n.error, "no working push subscription");
  assert.equal(calls, 0);
});

test("alerts are sent before engagement, each alert with its own tag", { skip }, async () => {
  const engagement = await queueEngagement(WITH_PHONES);
  const first = await queueAlert(WITH_PHONES, "A-1");
  const second = await queueAlert(WITH_PHONES, "A-2");
  const sent = [];
  const result = await notify.sendDueNotifications(ctx(), {
    vapid: vapid(),
    send: async (s, payload, _v, opts) => { sent.push({ payload, opts }); return { ok: true }; },
  });
  assert.equal(result.recordsWritten, 3);
  assert.deepEqual(sent.map((x) => x.payload.queue), ["alert", "alert", "alert", "alert", "engagement", "engagement"]);
  assert.equal(new Set(sent.filter((x) => x.payload.queue === "alert").map((x) => x.payload.tag)).size, 2);
  assert.equal(sent[0].opts.urgency, "high");
  assert.equal(sent[0].payload.url, "/clima");
  assert.equal(sent.at(-1).payload.url, "/mas/loteria");
  assert.equal(sent.at(-1).opts.topic, "engagement");
  for (const id of [first, second, engagement]) {
    const n = await row(id);
    assert.equal(n.status, "sent");
    assert.equal(n.delivered_count, 2);
    assert.ok(n.sent_at);
  }
});

test("an expired subscription is turned off; the notification counts the phone that got it", { skip }, async () => {
  const id = await queueAlert(WITH_PHONES, "G-1");
  await notify.sendDueNotifications(ctx(), {
    vapid: vapid(),
    send: async (s) => (s.endpoint.endsWith("/1") ? { ok: true } : { ok: false, gone: true, error: "HTTP 410" }),
  });
  const n = await row(id);
  assert.equal(n.status, "sent");
  assert.equal(n.delivered_count, 1);
  const subs = (await db.query("select endpoint, disabled_at, last_error from push_subscriptions order by endpoint")).rows;
  assert.equal(subs[0].disabled_at, null);
  assert.ok(subs[1].disabled_at);
  assert.equal(subs[1].last_error, "HTTP 410");
});

test("a failing push service retries, then fails visibly after 5 attempts", { skip }, async () => {
  const id = await queueAlert(WITH_PHONES, "F-1");
  const failing = async () => ({ ok: false, gone: false, error: "HTTP 503" });
  const c = ctx();
  await notify.sendDueNotifications(c, { vapid: vapid(), send: failing });
  let n = await row(id);
  assert.equal(n.status, "queued");
  assert.equal(n.attempts, 1);
  assert.match(n.error, /HTTP 503/);
  assert.equal(c.warnings.length, 1, "the run is recorded as partial, not ok");
  for (let i = 0; i < 4; i++) await notify.sendDueNotifications(ctx(), { vapid: vapid(), send: failing });
  n = await row(id);
  assert.equal(n.status, "failed");
  assert.equal(n.attempts, 5);
  await notify.sendDueNotifications(ctx(), { vapid: vapid(), send: async () => assert.fail("a failed notification is not claimed again") });
});

test("without VAPID keys, a deliverable notification stays queued with the reason", { skip }, async () => {
  const id = await queueAlert(WITH_PHONES, "V-1");
  const c = ctx();
  await notify.sendDueNotifications(c, { vapid: null, send: async () => assert.fail("nothing is sent") });
  const n = await row(id);
  assert.equal(n.status, "queued");
  assert.match(n.error, /VAPID keys are not set/);
  assert.equal(c.warnings.length, 1);
});
