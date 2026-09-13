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
import { startHealthServer } from "./health.mjs";
import { preflight } from "./preflight.mjs";

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

/**
 * Preflight before scheduling anything. A fatal misconfiguration exits with one
 * legible message instead of a repeating pg stack trace; a recoverable problem
 * keeps the health endpoint up (reporting 503 with the reason) and retries, so
 * the platform shows a red check with an explanation rather than a crash loop.
 */
let check = await preflight();
if (!check.ok) {
  process.stderr.write(`\n[preflight:${check.state}] ${check.detail}\n\n`);
  if (check.fatal) process.exit(1);

  const health = startHealthServer();
  const retryMs = Number(process.env.PREFLIGHT_RETRY_MS || 15_000);
  log.warn("preflight.retrying", { state: check.state, retryMs,
    note: "health endpoint is up and reporting the problem" });
  while (!check.ok) {
    await new Promise((r) => setTimeout(r, retryMs));
    check = await preflight();
    if (!check.ok) log.warn("preflight.still_failing", { state: check.state });
  }
  log.info("preflight.recovered", check.detail);
  health?.close();
}

const { jobs } = await startScheduler({ dryRun: args.includes("--dry-run") });
if (args.includes("--dry-run")) { log.info("dry_run.complete", { jobs: jobs.length }); await closePool(); process.exit(0); }

const health = startHealthServer();
log.info("started", { jobs: jobs.length, health: health ? `:${process.env.PORT}/health` : "disabled" });
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, async () => {
    log.info("shutdown", { signal: sig });
    health?.close();
    await closePool();
    process.exit(0);
  });
}
