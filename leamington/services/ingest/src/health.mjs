/**
 * Health endpoint for the platform's health check.
 *
 * Deliberately NOT a bare 200. A process that is running while every feed is
 * dead is the exact failure this system is built to notice, so the endpoint
 * reports per-feed health and returns 503 when a feed the product depends on
 * has gone quiet. A green healthcheck must mean the data is current, not merely
 * that node is alive.
 *
 * It also reports whether owner alerts are reaching the owner. If they are not,
 * the next feed to go quiet would do so unnoticed, so that alone is critical.
 */
import { createServer } from "node:http";
import { query } from "./db.mjs";
import { logger } from "./log.mjs";

const log = logger("health");

export async function snapshot() {
  const { rows } = await query(
    `select feed, label, health, since_last_ok::text as since_last_ok,
            failures_24h, latest_error, latest_result, alert_delivery_failures_24h
       from feed_health_detail order by feed`);

  // ZERO monitored feeds is not health -- it means feed_expectations has not
  // been seeded, so nothing is being watched at all. Reporting "ok" here would
  // be the exact failure this endpoint exists to catch: silence reading as fine.
  if (rows.length === 0) {
    return {
      status: "unconfigured",
      checkedAt: new Date().toISOString(),
      feeds: [],
      detail:
        "No feeds are being monitored: feed_expectations is empty. Migrations are " +
        "applied but the seeds have not been loaded, so nothing would be noticed " +
        "if every feed went silent.",
      remedy: "psql \"$DATABASE_URL\" -f packages/db/seeds/feed_expectations.sql",
      note: "this is NOT healthy; an empty monitoring table is monitoring nothing",
    };
  }

  const { rows: [delivery] } = await query(
    `select status, last_attempt_at, last_delivered_at, last_failure_error, failures_24h
       from owner_alert_delivery_health`);

  const degraded = rows.filter((r) => ["stale", "failing", "never_succeeded", "never_run"].includes(r.health));
  // Alerts are the feed a person's safety depends on; it alone can fail the check.
  const alertsDown = degraded.some((r) => r.feed.startsWith("alerts:"));
  // An owner alert that cannot be delivered is the same as no owner alert.
  const ownerUnreachable = delivery.status === "failing";

  return {
    status: alertsDown || ownerUnreachable ? "critical"
      : degraded.length || delivery.status === "untested" ? "degraded"
      : "ok",
    checkedAt: new Date().toISOString(),
    feeds: rows,
    ownerAlertDelivery: {
      ...delivery,
      note: "untested: no owner alert has been sent yet; failing: the latest one did not get through",
    },
    note: "health reflects whether our copy of each feed is current; it is not a statement about the world",
  };
}

/**
 * When preflight cannot pass, the health endpoint reports THAT rather than
 * querying a database we know is unusable.
 */
let fatalState = null;
export function setHealthFatal(state, detail) { fatalState = { state, detail }; }

export function startHealthServer(port = Number(process.env.PORT || 0)) {
  if (!port) return null;

  const server = createServer(async (req, res) => {
    if (!req.url?.startsWith("/health")) {
      res.writeHead(404).end();
      return;
    }
    if (fatalState) {
      res.writeHead(503, { "content-type": "application/json" });
      res.end(JSON.stringify({
        status: "misconfigured",
        state: fatalState.state,
        detail: fatalState.detail,
        note: "the service is running but cannot start work until this is fixed; restarting will not help",
      }, null, 2));
      return;
    }
    try {
      const body = await snapshot();
      // 503 on critical so the platform restarts / pages rather than showing green.
      const failing = body.status === "critical" || body.status === "unconfigured";
      res.writeHead(failing ? 503 : 200, { "content-type": "application/json" });
      res.end(JSON.stringify(body, null, 2));
    } catch (err) {
      // Cannot reach the database -> we do not know. Never report healthy.
      res.writeHead(503, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "unknown", error: String(err?.message ?? err) }));
    }
  });

  server.listen(port, () => log.info("listening", { port, path: "/health" }));
  return server;
}
