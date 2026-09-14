/**
 * Run the crest feed once, by hand (the ingest service runs it daily).
 *
 *   railway run --service companion_PWA -- node scripts/fetch-crests.mjs
 *
 * Rules live in src/feeds/crests.mjs.
 */
import { closePool } from "../src/db.mjs";
import { ingestCrests } from "../src/feeds/crests.mjs";

const r = await ingestCrests({ log: { info() {} } });
console.log(`crests: ${r.recordsWritten} stored, ${r.skipped.length} skipped of ${r.teams}, ${r.removed} removed as stock or oversized images`);
for (const s of r.skipped) console.log(`  skipped ${s}`);
await closePool();
