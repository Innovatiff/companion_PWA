/**
 * Run the hometown photo feed once, by hand (the ingest service runs it daily).
 *
 *   railway run --service companion_PWA -- node scripts/fetch-town-photos.mjs
 *   node scripts/fetch-town-photos.mjs --dry-run <dir> [--town MX:Michoacán:Morelia ...]
 *
 * --dry-run saves the chosen photos to <dir> for review and stores nothing.
 * Rules live in src/feeds/town-photos.mjs; a person's choices in
 * src/feeds/town-photo-overrides.json.
 */
import { closePool } from "../src/db.mjs";
import { ingestTownPhotos } from "../src/feeds/town-photos.mjs";

const args = process.argv.slice(2);
const dryIdx = args.indexOf("--dry-run");
const dryDir = dryIdx >= 0 ? args[dryIdx + 1] : null;
const towns = [];
for (let i = 0; i < args.length; i++) if (args[i] === "--town") towns.push(args[++i]);

const r = await ingestTownPhotos({ log: { info() {} } }, { towns, dryDir });
for (const line of r.lines) console.log(line);
console.log(`town photos: ${r.recordsWritten} stored of ${r.towns}${dryDir ? " (dry run, nothing stored)" : ""}`);
await closePool();
