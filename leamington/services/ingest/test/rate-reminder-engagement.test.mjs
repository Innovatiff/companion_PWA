/**
 * The member's rate reminder in the daily engagement planner (0042): eligible
 * when the current reference rate reaches the number, below match day and
 * above the 30-day high, one engagement message per client per local day,
 * alerts untouched, and it fires once: sent marks it triggered.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { localDbUnavailable, useFreshDatabase } from "./helpers/local-db.mjs";

const unavailable = localDbUnavailable();
const skip = unavailable ?? false;

const AFFILIATE = "99990000-0000-4000-8000-00000000b0f1";
const A = "99990000-0000-4000-8000-00000000b0c1";   // HN, reminder reached
const B = "99990000-0000-4000-8000-00000000b0c2";   // HN, reminder reached, team plays today
const C = "99990000-0000-4000-8000-00000000b0c3";   // MX, reminder reached, MXN at a 30-day high
const TZ = "America/Toronto";

let db, notify;
const ctx = () => ({ log: { info() {}, warn() {}, error() {} }, warnings: [] });
const engagement = async (id, day = 0) => (await db.query(
  `select id, trigger::text, title, body, status from notifications
    where client_id = $1 and channel = 'engagement' and local_date = (now() at time zone $2)::date + $3::int`, [id, TZ, day])).rows;

/** Plan at the clients' notify hour: set it to the current Toronto hour first. */
async function planNow() {
  for (let i = 0; i < 2; i++) {
    const hour = async () => (await db.query("select extract(hour from now() at time zone $1)::int as h", [TZ])).rows[0].h;
    const h = await hour();
    await db.query("update clients set notify_hour = $1", [h]);
    const r = await notify.planEngagement();
    if ((await hour()) === h) return r;
  }
  throw new Error("the hour changed twice while planning");
}

before(async () => {
  if (unavailable) return;
  useFreshDatabase("leamington_ingest_test_rate_reminder");
  db = await import("../src/db.mjs");
  notify = await import("../src/feeds/notify.mjs");
  await db.query("insert into affiliates (id, name) values ($1, 'Reminder Test')", [AFFILIATE]);
  await db.query("insert into leagues (country, name, source, source_league_id) values ('HN', 'Reminder League', 'test', 'rem-league')");
  await db.query(`insert into teams (league_id, country, name, source, source_team_id)
                  select l.id, 'HN', t.n, 'test', t.s from leagues l, (values ('Reminder FC', 'rem-1'), ('Other FC', 'rem-2')) t(n, s)
                   where l.name = 'Reminder League'`);
  await db.query(
    `insert into clients (id, affiliate_id, code, full_name, country, language, team_id, timezone) values
       ($2, $1, 'RMQTJF23', 'Uno', 'HN', 'es', null, $5),
       ($3, $1, 'RMQTJF24', 'Dos', 'HN', 'es', (select id from teams where name = 'Reminder FC'), $5),
       ($4, $1, 'RMQTJF26', 'Tres', 'MX', 'es', null, $5)`, [AFFILIATE, A, B, C, TZ]);
  await db.query(`insert into push_subscriptions (client_id, endpoint, p256dh, auth)
                  select id, 'https://push.example.invalid/' || code, 'key', 'auth' from clients`);
  await db.query(`insert into subscriptions (client_id, period_start, period_end, paid_at, kind, affiliate_id)
                  select id, date '2026-01-01', date '2099-01-01', now(), 'sale', affiliate_id from clients`);
  // Kickoff later "today" in Toronto, confirmed just now.
  await db.query(
    `insert into fixtures (league_id, home_team_id, away_team_id, kickoff_utc, status, source, source_fixture_id, fetched_at)
     select l.id, h.id, o.id, ((now() at time zone $1)::date + time '20:00') at time zone $1, 'scheduled', 'test', 'rem-fx-1', now()
       from leagues l join teams h on h.name = 'Reminder FC' join teams o on o.name = 'Other FC'
      where l.name = 'Reminder League'`, [TZ]);
  await db.query(
    `insert into fx_rates (rate_date, quote, rate)
     select (now() at time zone $1)::date + d, q::fx_currency, r
       from (values (-2, 'HNL', 19.60), (0, 'HNL', 19.50), (-1, 'MXN', 12.00), (0, 'MXN', 12.30)) v(d, q, r)`, [TZ]);
  for (const [id, target] of [[A, 19.4], [B, 19.4], [C, 12.2]]) {
    await db.query("select app.set_rate_reminder($1, $2)", [id, target]);
  }
  // A red alert for A today: it lives in its own queue.
  await db.query(
    `insert into notifications (client_id, local_date, channel, trigger, title, body, cap_identifier, scheduled_for)
     values ($1, (now() at time zone $2)::date, 'alert', 'weather_alert', 'Aviso rojo', 'Cortés', 'REM-CAP-1', now() - interval '1 minute')`, [A, TZ]);
});

after(async () => { if (db) await db.closePool(); });

test("a reached reminder is planned, below match day and above the 30-day high", { skip }, async () => {
  const r = await planNow();
  assert.equal(r.recordsWritten, 3);
  const [a] = await engagement(A);
  assert.equal(a.trigger, "rate_reminder");
  assert.equal(a.title, "Tasa de referencia");
  assert.equal(a.body, "La tasa de referencia llegó a 19.50 HNL por 1 CAD.");
  assert.doesNotMatch(a.body, /envi|momento|compr|vend/i, "descriptive, never advice");
  assert.equal((await engagement(B))[0].trigger, "match_day");
  assert.equal((await engagement(C))[0].trigger, "rate_reminder");
  const alert = (await db.query("select status from notifications where cap_identifier = 'REM-CAP-1'")).rows[0];
  assert.equal(alert.status, "queued", "the alert is not replaced or consumed");
});

test("still one engagement message per client per day", { skip }, async () => {
  const r = await planNow();
  assert.equal(r.recordsWritten, 0);
  for (const id of [A, B, C]) assert.equal((await engagement(id)).length, 1);
});

test("sent once, it does not fire again; the reminder that lost to match day goes the next day", { skip }, async () => {
  const sent = [];
  await notify.sendDueNotifications(ctx(), {
    vapid: { subject: "mailto:owner@example.invalid" },
    send: async (_s, payload) => { sent.push(payload); return { ok: true }; },
  });
  assert.equal(sent[0].queue, "alert", "alerts first");
  assert.ok(sent.some((p) => p.queue === "engagement" && p.url === "/mas/tasa" && p.body.startsWith("La tasa de referencia")));

  const triggered = (await db.query("select client_id::text from rate_reminders where triggered_at is not null order by client_id")).rows.map((x) => x.client_id);
  assert.deepEqual(triggered, [A, C]);

  await db.query("select app.plan_engagement(now() + interval '1 day')");
  assert.equal((await engagement(A, 1)).length, 0, "A's reminder fired once");
  assert.equal((await engagement(C, 1))[0]?.trigger, "fx_30d_high", "C falls back to the 30-day high");
  assert.equal((await engagement(B, 1))[0]?.trigger, "rate_reminder", "B's reminder waited for a day without a match");
});
