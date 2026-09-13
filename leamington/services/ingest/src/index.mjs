#!/usr/bin/env node
/**
 * Ingest entrypoint.
 *
 *   node src/index.mjs                 # start the scheduler and stay up
 *   node src/index.mjs --once <feed>   # run one feed immediately and exit
 *   node src/index.mjs --dry-run       # print the schedule without running
 */
import { startScheduler, FIXED_JOBS, lotteryJobs } from "./scheduler.mjs";
import { runFeed } from "./run-feed.mjs";
import { checkStaleness } from "./monitor/staleness.mjs";
import { closePool } from "./db.mjs";
import { logger } from "./log.mjs";

const log = logger("ingest");
const args = process.argv.slice(2);
const arg = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };

if (args.includes("--once")) {
  const feed = arg("--once");
  const all = [...FIXED_JOBS, ...(await lotteryJobs())];
  if (feed === "staleness") { console.log(JSON.stringify(await checkStaleness(), null, 2)); }
  else {
    const job = all.find((j) => j.feed === feed);
    if (!job) { log.error("unknown_feed", { feed, known: [...new Set(all.map((j) => j.feed))] }); process.exit(2); }
    const r = await runFeed(job.feed, job.fn);
    console.log(JSON.stringify(r, null, 2));
  }
  await closePool();
  process.exit(0);
}

const { jobs } = await startScheduler({ dryRun: args.includes("--dry-run") });
if (args.includes("--dry-run")) { log.info("dry_run.complete", { jobs: jobs.length }); await closePool(); process.exit(0); }

log.info("started", { jobs: jobs.length });
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, async () => { log.info("shutdown", { signal: sig }); await closePool(); process.exit(0); });
}
