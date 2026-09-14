/**
 * Run the hometown photo feed once, by hand (the ingest service runs it daily).
 *
 *   railway run --service companion_PWA -- node scripts/fetch-town-photos.mjs
 *   node scripts/fetch-town-photos.mjs --dry-run <dir> [--cap 60] [--town MX:Michoacán:Morelia ...]
 *
 * --dry-run saves photo 1 and the gallery candidates that pass every check to
 * <dir> as COUNTRY-Town-1.jpg ... COUNTRY-Town-6.jpg, prints each file's title,
 * author, license and Commons description, and the candidates skipped with the
 * reason, and stores nothing. Look at every image before it goes live; exclude
 * a poor one under "gallery" in src/feeds/town-photo-overrides.json.
 * --cap is the download budget for the run (default 20, as the daily job).
 * Rules live in src/feeds/town-photos.mjs.
 */
import { closePool } from "../src/db.mjs";
import { ingestTownPhotos, DOWNLOAD_CAP } from "../src/feeds/town-photos.mjs";

const args = process.argv.slice(2);
const arg = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const dryDir = arg("--dry-run");
const cap = arg("--cap") ? Number(arg("--cap")) : DOWNLOAD_CAP;
const towns = [];
for (let i = 0; i < args.length; i++) if (args[i] === "--town") towns.push(args[++i]);

const r = await ingestTownPhotos({ log: { info() {} } }, { towns, dryDir, cap });
for (const line of r.lines) console.log(line);
console.log(`town photos: ${r.recordsWritten} stored, ${r.downloads} downloads of ${cap} for ${r.towns} towns${dryDir ? " (dry run, nothing stored)" : ""}`);
await closePool();
