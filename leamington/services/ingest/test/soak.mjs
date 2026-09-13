#!/usr/bin/env node
/**
 * Compressed soak test.
 *
 * Runs every feed repeatedly on an accelerated cadence and reports what broke.
 * A real 7-day run needs a persistent host; this exercises the same code paths
 * in minutes so the obvious failures surface first.
 *
 *   node test/soak.mjs --cycles 6 --interval 15
 */
import { runFeed } from "../src/run-feed.mjs";
import { checkStaleness } from "../src/monitor/staleness.mjs";
import { query, closePool } from "../src/db.mjs";
import { ingestAlerts } from "../src/feeds/alerts.mjs";
import { ingestFx } from "../src/feeds/fx.mjs";
import { ingestForecast } from "../src/feeds/forecast.mjs";
import { ingestLottery } from "../src/feeds/lottery.mjs";
import { ingestStatic } from "../src/feeds/static.mjs";

const args = process.argv.slice(2);
const num = (f, d) => { const i = args.indexOf(f); return i >= 0 ? Number(args[i + 1]) : d; };
const CYCLES = num("--cycles", 5);
const INTERVAL_S = num("--interval", 12);

const FEEDS = [
  ["alerts:JM", ingestAlerts],
  ["fx", ingestFx],
  ["forecast", ingestForecast],
  ["lottery", ingestLottery],
  ["static", ingestStatic],
];

/**
 * Fixture clients across Jamaica. Without these the soak runs alert matching
 * against an empty client set and every alert reports matched=0 -- which looks
 * like a pass while testing nothing.
 */
await query(`insert into affiliates (id, name) values
  ('33333333-3333-3333-3333-333333333333','Soak Affiliate') on conflict do nothing`);
const { rowCount: seeded } = await query(
  `insert into clients (affiliate_id, code, full_name, country, language, municipality_id,
                        admin_region, municipality, municipality_lat, municipality_lng, timezone)
   select '33333333-3333-3333-3333-333333333333', upper(substr(md5(m.name),1,8)),
          'Soak '||m.name,'JM','en',m.id,m.admin_region,m.name,m.lat,m.lng,'America/Jamaica'
     from municipalities m where m.country='JM'
   on conflict (code) do nothing`);
process.stderr.write(`soak: ${seeded} Jamaican fixture clients present\n`);

const results = [];
const started = Date.now();

for (let c = 1; c <= CYCLES; c++) {
  process.stderr.write(`\n--- cycle ${c}/${CYCLES} ---\n`);
  for (const [feed, fn] of FEEDS) {
    const r = await runFeed(feed, fn);
    results.push({ cycle: c, feed, ...r });
  }
  await checkStaleness();
  if (c < CYCLES) await new Promise((r) => setTimeout(r, INTERVAL_S * 1000));
}

// ---- report ----
const byFeed = {};
for (const r of results) {
  (byFeed[r.feed] ??= { ok: 0, error: 0, partial: 0, written: 0, errors: new Set() });
  byFeed[r.feed][r.status]++;
  byFeed[r.feed].written += r.recordsWritten ?? 0;
  if (r.error) byFeed[r.feed].errors.add(r.error);
}

console.log(`\n=== SOAK REPORT — ${CYCLES} cycles over ${Math.round((Date.now()-started)/1000)}s ===\n`);
console.log(`${"feed".padEnd(12)} ${"ok".padStart(3)} ${"part".padStart(5)} ${"err".padStart(4)} ${"rows".padStart(6)}  failure`);
for (const [feed, s] of Object.entries(byFeed)) {
  console.log(`${feed.padEnd(12)} ${String(s.ok).padStart(3)} ${String(s.partial).padStart(5)} ${String(s.error).padStart(4)} ${String(s.written).padStart(6)}  ${[...s.errors][0] ?? ""}`);
}

const { rows: health } = await query(`select feed, health, failures_24h from feed_health_detail order by feed`);
console.log(`\n--- feed health ---`);
for (const h of health) console.log(`  ${h.feed.padEnd(12)} ${h.health.padEnd(16)} failures24h=${h.failures_24h ?? 0}`);

const { rows: alerts } = await query(
  `select kind, feed, notify_count, resolved_at is null as open from owner_alerts order by feed`);
console.log(`\n--- owner alerts ---`);
for (const a of alerts) console.log(`  ${a.feed.padEnd(12)} ${a.kind.padEnd(12)} notified=${a.notify_count} ${a.open ? "OPEN" : "resolved"}`);

const { rows: [dup] } = await query(
  `select count(*)::int as total,
          count(distinct (source_id, cap_identifier, cap_sent))::int as distinct_alerts
     from weather_alerts`);
console.log(`\n--- dedupe ---\n  weather_alerts rows=${dup.total} distinct=${dup.distinct_alerts} ${dup.total===dup.distinct_alerts?"(no duplicates)":"DUPLICATES PRESENT"}`);

const { rows: [match] } = await query(
  `select count(*) filter (where matched > 0)::int as alerts_matching,
          count(*)::int as alerts_with_geometry,
          coalesce(max(matched),0)::int as max_clients_matched
     from (select a.id, (select count(*) from app.clients_for_alert(a.id)) as matched
             from weather_alerts a where a.area_geog is not null) t`);
console.log(`\n--- polygon matching ---`);
console.log(`  alerts with geometry=${match.alerts_with_geometry} matching >=1 client=${match.alerts_matching} max clients on one alert=${match.max_clients_matched}`);
if (match.alerts_with_geometry > 0 && match.alerts_matching === 0)
  console.log(`  WARNING: no alert matched any client — matching may be untested, not necessarily correct`);

const { rows: [n] } = await query(
  `select count(*)::int as total,
          count(distinct (client_id, local_date))::int as distinct_days from notifications`);
console.log(`  notifications rows=${n.total} distinct(client,day)=${n.distinct_days} ${n.total===n.distinct_days?"(one-per-day holds)":"ONE-PER-DAY VIOLATED"}`);

await closePool();
