/**
 * Health endpoint for the platform's health check.
 *
 * Deliberately NOT a bare 200. A process that is running while every feed is
 * dead is the exact failure this system is built to notice, so the endpoint
 * reports per-feed health and returns 503 when a feed the product depends on
 * has gone quiet. A green healthcheck must mean the data is current, not merely
 * that node is alive.
 */
import { createServer } from "node:http";
import { query } from "./db.mjs";
import { logger } from "./log.mjs";

const log = logger("health");

async function snapshot() {
  const { rows } = await query(
    `select feed, label, health, since_last_ok::text as since_last_ok,
            failures_24h, latest_error
       from feed_health_detail order by feed`);

  const degraded = rows.filter((r) => ["stale", "failing", "never_succeeded", "never_run"].includes(r.health));
  // Alerts are the feed a person's safety depends on; it alone can fail the check.
  const alertsDown = degraded.some((r) => r.feed.startsWith("alerts:"));

  return {
    status: alertsDown ? "critical" : degraded.length ? "degraded" : "ok",
    checkedAt: new Date().toISOString(),
    feeds: rows,
    note: "health reflects whether our copy of each feed is current; it is not a statement about the world",
  };
}

export function startHealthServer(port = Number(process.env.PORT || 0)) {
  if (!port) return null;

  const server = createServer(async (req, res) => {
    if (!req.url?.startsWith("/health")) {
      res.writeHead(404).end();
      return;
    }
    try {
      const body = await snapshot();
      // 503 on critical so the platform restarts / pages rather than showing green.
      res.writeHead(body.status === "critical" ? 503 : 200, { "content-type": "application/json" });
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
