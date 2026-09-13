/**
 * Staleness monitoring — the owner's early warning.
 *
 * A silent source and a calm source look identical from the database. This is
 * the component that tells them apart, so "no alerts today" is never inferred
 * from a scraper that died on Friday night.
 *
 * Opens one owner_alert per (feed, kind), re-notifies on a backoff rather than
 * every cycle, and RESOLVES the alert when the feed recovers so the owner also
 * learns it came back.
 *
 * Delivery is part of the alert. Every attempt is recorded in
 * owner_alert_deliveries. An alert counts as notified only when delivery got
 * through, and a recovery is resolved only once the owner has been told;
 * otherwise the next check tries again. A failed delivery is logged at error
 * and fails /health: an owner alert that cannot be delivered is no alert.
 */
import { query } from "../db.mjs";
import { logger } from "../log.mjs";
import { describeError } from "../run-feed.mjs";

const log = logger("monitor:staleness");

const RENOTIFY_AFTER_MS = Number(process.env.RENOTIFY_AFTER_MS || 6 * 60 * 60 * 1000);
const DELIVERY_TIMEOUT_MS = 15_000;

/**
 * Pluggable delivery. Returns { delivered, status?, error? }.
 *
 * The timeout matters: the monitor job is overlap-protected, so a webhook call
 * that hangs would silently stop every later check.
 */
export async function defaultNotifier(alert) {
  log.error("owner.alert", {
    kind: alert.kind, feed: alert.feed, summary: alert.summary, detail: alert.detail,
  });
  const url = process.env.OWNER_ALERT_WEBHOOK;
  if (!url) return { delivered: false, error: "no OWNER_ALERT_WEBHOOK configured" };
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(alert),
    signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
  });
  return { delivered: res.ok, status: res.status, error: res.ok ? null : `HTTP ${res.status}` };
}

/**
 * Send one owner alert and record the attempt. Never throws: a notifier that
 * throws is a failed delivery, not a crashed monitor.
 */
async function deliver(notifier, alert, ownerAlertId) {
  let outcome;
  try {
    outcome = (await notifier(alert)) ?? {};
  } catch (err) {
    outcome = { delivered: false, error: err?.name === "TimeoutError" ? "timeout" : describeError(err) };
  }
  const delivered = outcome.delivered === true;
  const error = delivered ? null : (outcome.error ?? outcome.reason ?? "delivery not confirmed");

  await query(
    `insert into owner_alert_deliveries (owner_alert_id, feed, kind, delivered, http_status, error)
     values ($1, $2, $3, $4, $5, $6)`,
    [ownerAlertId, alert.feed, alert.kind, delivered, outcome.status ?? null, error]);

  if (!delivered) {
    log.error("owner.alert.delivery_failed", {
      feed: alert.feed, kind: alert.kind, httpStatus: outcome.status ?? null, error,
      note: "the owner was NOT told; /health reports critical until a delivery gets through",
    });
  }
  return delivered;
}

export async function checkStaleness({ notifier = defaultNotifier } = {}) {
  const { rows } = await query(
    `select feed, label, health, latest_error, since_last_ok, last_ok_at,
            expected_interval::text as expected_interval
       from feed_health_detail`);

  const unhealthy = rows.filter((r) => r.health !== "ok" && r.health !== "degraded");
  const healthy = rows.filter((r) => r.health === "ok" || r.health === "degraded");
  let opened = 0, renotified = 0, resolved = 0, deliveryFailures = 0;

  for (const r of unhealthy) {
    const kind = r.health === "failing" ? "feed_error" : "feed_stale";
    const summary =
      r.health === "never_run"       ? `${r.label}: has never run`
      : r.health === "never_succeeded" ? `${r.label}: has never succeeded`
      : r.health === "failing"         ? `${r.label}: last attempt failed — ${r.latest_error ?? "unknown error"}`
      : `${r.label}: no successful run for ${r.since_last_ok ?? "unknown"} (expected every ${r.expected_interval})`;

    const detail = {
      health: r.health, lastOkAt: r.last_ok_at, sinceLastOk: r.since_last_ok,
      expectedInterval: r.expected_interval, latestError: r.latest_error,
      // Stated explicitly: this is about OUR pipeline, not about the world.
      meaning: "our copy of this feed is not current; it is NOT a statement that no events occurred",
    };

    const { rows: [row] } = await query(
      `insert into owner_alerts (kind, feed, summary, detail)
       values ($1::owner_alert_kind,$2,$3,$4)
       on conflict (feed, kind) where resolved_at is null
       do update set summary = excluded.summary, detail = excluded.detail
       returning id, last_notified_at, notify_count, (xmax = 0) as is_new`,
      [kind, r.feed, summary, JSON.stringify(detail)]);

    // Never delivered means last_notified_at is still null, so it stays due.
    const due = !row.last_notified_at ||
      Date.now() - new Date(row.last_notified_at).getTime() > RENOTIFY_AFTER_MS;

    if (row.is_new || due) {
      if (await deliver(notifier, { kind, feed: r.feed, summary, detail }, row.id)) {
        await query(
          `update owner_alerts set last_notified_at = now(), notify_count = notify_count + 1 where id = $1`,
          [row.id]);
        row.is_new ? opened++ : renotified++;
      } else {
        deliveryFailures++;
      }
    }
  }

  // Recovery: tell the owner the feed came back, and close its open alerts only
  // once that message got through.
  for (const r of healthy) {
    const { rows: open } = await query(
      `select id from owner_alerts where feed = $1 and resolved_at is null order by id`, [r.feed]);
    if (!open.length) continue;

    const told = await deliver(notifier, {
      kind: "recovered", feed: r.feed,
      summary: `${r.label}: recovered — successful run at ${r.last_ok_at}`,
      detail: { health: r.health },
    }, open[0].id);
    if (!told) { deliveryFailures++; continue; }

    const { rowCount } = await query(
      `update owner_alerts set resolved_at = now()
        where id = any($1::bigint[]) and resolved_at is null`, [open.map((o) => o.id)]);
    resolved += rowCount;
  }

  log.info("checked", {
    feeds: rows.length, unhealthy: unhealthy.length, opened, renotified, resolved, deliveryFailures,
  });
  return { checked: rows.length, unhealthy: unhealthy.length, opened, renotified, resolved, deliveryFailures };
}
