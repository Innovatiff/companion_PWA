/** End-to-end: live Jamaica CAP feed -> Postgres -> polygon match -> notifications. */
import { runFeed } from "../src/run-feed.mjs";
import { ingestAlerts } from "../src/feeds/alerts.mjs";
import { query, closePool } from "../src/db.mjs";

const r = await runFeed("alerts:JM", ingestAlerts);
console.log("\n=== run result ===", JSON.stringify(r));

const q = async (label, sql) => {
  const { rows } = await query(sql);
  console.log(`\n=== ${label} ===`);
  for (const row of rows) console.log("  " + Object.entries(row).map(([k,v])=>`${k}=${v}`).join("  "));
};
await q("alerts stored", `select id, level, severity_raw, left(event,42) as event,
  extensions.ST_NPoints(area_geog::extensions.geometry) as vertices,
  expires_at::date as expires from weather_alerts order by id desc limit 5`);
await q("push decision", `select a.id, a.level, app.should_push(a.id) as pushes,
  left(app.alert_notification_body(a.id),64) as body from weather_alerts a order by a.id desc limit 3`);
await q("polygon matches (newest alert)", `select c.municipality, c.admin_region
  from app.clients_for_alert((select max(id) from weather_alerts)) m
  join clients c on c.id = m.client_id order by c.municipality`);
await q("notifications queued", `select n.local_date, n.trigger, left(n.body,58) as body, count(*) over () as total
  from notifications n where n.weather_alert_id is not null limit 5`);
await q("source_runs", `select feed, status, records_written, coalesce(error,'-') as error from source_runs order by id desc limit 3`);
await closePool();
