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
 */
import { query } from "../db.mjs";
import { logger } from "../log.mjs";

const log = logger("monitor:staleness");

const RENOTIFY_AFTER_MS = Number(process.env.RENOTIFY_AFTER_MS || 6 * 60 * 60 * 1000);

/** Pluggable delivery. Default logs; wire a webhook/email in production. */
export async function defaultNotifier(alert) {
  log.error("owner.alert", {
    kind: alert.kind, feed: alert.feed, summary: alert.summary, detail: alert.detail,
  });
  const url = process.env.OWNER_ALERT_WEBHOOK;
  if (!url) return { delivered: false, reason: "no OWNER_ALERT_WEBHOOK configured" };
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(alert),
  });
  return { delivered: res.ok, status: res.status };
}

export async function checkStaleness({ notifier = defaultNotifier } = {}) {
  const { rows } = await query(
    `select feed, label, health, latest_error, since_last_ok, last_ok_at,
            expected_interval::text as expected_interval
       from feed_health_detail`);

  const unhealthy = rows.filter((r) => r.health !== "ok" && r.health !== "degraded");
  const healthy = rows.filter((r) => r.health === "ok" || r.health === "degraded");
  let opened = 0, renotified = 0, resolved = 0;

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

    const due = !row.last_notified_at ||
      Date.now() - new Date(row.last_notified_at).getTime() > RENOTIFY_AFTER_MS;

    if (row.is_new || due) {
      await notifier({ kind, feed: r.feed, summary, detail });
      await query(
        `update owner_alerts set last_notified_at = now(), notify_count = notify_count + 1 where id = $1`,
        [row.id]);
      row.is_new ? opened++ : renotified++;
    }
  }

  // Recovery: close open alerts for feeds that are healthy again.
  for (const r of healthy) {
    const { rowCount } = await query(
      `update owner_alerts set resolved_at = now()
        where feed = $1 and resolved_at is null returning id`, [r.feed]);
    if (rowCount) {
      resolved += rowCount;
      await notifier({
        kind: "recovered", feed: r.feed,
        summary: `${r.label}: recovered — successful run at ${r.last_ok_at}`,
        detail: { health: r.health },
      });
    }
  }

  log.info("checked", {
    feeds: rows.length, unhealthy: unhealthy.length, opened, renotified, resolved,
  });
  return { checked: rows.length, unhealthy: unhealthy.length, opened, renotified, resolved };
}
