#!/usr/bin/env node
/**
 * Fill missing daily reference rates (CAD -> MXN, HNL, GTQ, JMD) for the rate
 * chart, from the daily feed's own sources. Never overwrites a stored rate and
 * never fills a day no source published. Safe to run again.
 *
 *   node scripts/backfill-fx.mjs --days 120 [--dry-run]
 *
 * Requests: 1 to Frankfurter (the time series), plus one dated file per day that
 * still lacks HNL, GTQ or JMD (up to --days), each retried once on the mirror.
 */
import { backfillFx } from "../src/feeds/fx-backfill.mjs";
import { closePool } from "../src/db.mjs";
import { logger } from "../src/log.mjs";

function parseArgs(argv) {
  const out = { days: 120, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--days") out.days = Number(argv[++i]);
    else if (a.startsWith("--days=")) out.days = Number(a.slice(7));
    else throw new Error(`unknown argument: ${a}`);
  }
  return out;
}

let code = 0;
try {
  const args = parseArgs(process.argv.slice(2));
  const summary = await backfillFx({ ...args, log: logger("fx:backfill") });
  console.log(JSON.stringify(summary, null, 2));
  if (summary.datasetDates.noAnswer.length || !summary.frankfurter.answered) code = 2;   // partial: some days could not be checked
} catch (err) {
  console.error(err.message);
  if (err.summary) console.error(JSON.stringify(err.summary, null, 2));
  code = 1;
} finally {
  await closePool();
}
process.exit(code);
