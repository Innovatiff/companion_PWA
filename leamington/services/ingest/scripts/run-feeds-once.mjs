/**
 * Run named feeds once, now, recorded in source_runs exactly like a scheduled
 * run. For filling a database before the ingest service has run a feed (for
 * example the daily FX job, or reference data added after the last deploy).
 *
 *   railway run --service companion_PWA -- node scripts/run-feeds-once.mjs static fx forecast lottery
 *
 * The connection comes from DATABASE_URL (railway run provides it; it is never
 * printed). Each feed's own rules apply: unverified static records are refused,
 * a provider that does not answer is recorded as an error.
 */
import { runFeed } from "../src/run-feed.mjs";
import { closePool } from "../src/db.mjs";
import { ingestStatic } from "../src/feeds/static.mjs";
import { ingestFx } from "../src/feeds/fx.mjs";
import { ingestForecast } from "../src/feeds/forecast.mjs";
import { ingestCurrent } from "../src/feeds/current.mjs";
import { ingestLottery } from "../src/feeds/lottery.mjs";
import { ingestFixtures } from "../src/feeds/fixtures.mjs";
import { ingestHourly } from "../src/feeds/hourly.mjs";
import { ingestAir } from "../src/feeds/air.mjs";

const FEEDS = {
  static: ingestStatic,
  fx: ingestFx,
  forecast: ingestForecast,
  current: ingestCurrent,
  hourly: ingestHourly,
  air: ingestAir,
  lottery: ingestLottery,
  fixtures: (ctx) => ingestFixtures(ctx, { offsetDays: 0 }),
};

const names = process.argv.slice(2);
const unknown = names.filter((n) => !FEEDS[n]);
if (!names.length || unknown.length) {
  console.error(`usage: node scripts/run-feeds-once.mjs <${Object.keys(FEEDS).join("|")}> ...`);
  process.exit(2);
}

let failed = 0;
for (const name of names) {
  const r = await runFeed(name, FEEDS[name]);
  console.log(`${name}: ${r.status}${r.recordsWritten != null ? `, ${r.recordsWritten} records` : ""}${r.error ? ` (${r.error})` : ""}`);
  if (r.status === "error") failed++;
}
await closePool();
process.exit(failed ? 1 : 0);
