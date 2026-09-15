/**
 * Read every active video channel once and write NOTHING to the database.
 *
 *   PGHOST=/tmp PGPORT=55433 PGUSER=postgres PGDATABASE=<a local, seeded database> \
 *     node scripts/fetch-videos.mjs --dry-run <dir> [--thumb-cap N] [--teams db|catalogue]
 *
 * Channels and leagues are READ from the database the PG environment points at.
 * Teams: the database's teams (--teams db), or, by default, one team per club of
 * videos/team-aliases.json in its country's league (--teams catalogue), since a
 * local database does not hold the fixtures provider's teams. Thumbnails are
 * saved in <dir>, with matches.json, nations.json and stats.json. It prints, per
 * channel: feed entries, Shorts in the feed, videos kept, Shorts kept and
 * skipped, the categories, thumbnails and their bytes; then, per review team and
 * per national team (men's and women's), the titles matched and the rule; then
 * the Shorts skipped.
 */
import { writeFileSync } from "node:fs";
import { query, closePool } from "../src/db.mjs";
import { ingestVideos, dryStore } from "../src/feeds/videos.mjs";
import { ALIAS_DATA } from "../src/feeds/videos/teams.mjs";

const REVIEW = ["mx-america", "hn-motagua", "gt-comunicaciones", "jm-montego-bay-united"];

const args = process.argv.slice(2);
const at = args.indexOf("--dry-run");
const dir = at >= 0 ? args[at + 1] : null;
if (!dir) {
  console.error("usage: node scripts/fetch-videos.mjs --dry-run <dir> [--thumb-cap N] [--teams db|catalogue]\n(real runs go through the scheduler or scripts/run-feeds-once.mjs videos)");
  process.exit(2);
}
const opt = (flag, dflt) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : dflt);

const channels = (await query(
  `select id, key, name, youtube_channel_id, country::text, league_id, team_id, club_key, kind, women from video_channels where active order by country nulls last, id`)).rows;
const leagues = (await query(`select id, country::text from leagues where active order by id`)).rows;
let teams;
if (opt("--teams", "catalogue") === "db") {
  teams = (await query(`select id, league_id, country::text, name, short_name from teams`)).rows;
} else {
  const leagueOf = Object.fromEntries(leagues.map((l) => [l.country, l.id]).reverse());
  teams = ALIAS_DATA.clubs.map((c, i) => ({ id: 100000 + i, league_id: leagueOf[c.country], country: c.country, name: c.names[0], short_name: null, key: c.key }));
}
await closePool();

const ctx = { warnings: [], log: { info() {}, warn() {} } };
const t0 = Date.now();
const r = await ingestVideos(ctx, { store: dryStore(dir, { channels, teams }), thumbCap: Number(opt("--thumb-cap", 2000)) });

const avg = (a) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : "-");
const max = (a) => (a.length ? Math.max(...a) : "-");
console.log(`\n${channels.length} channels, ${r.recordsWritten} videos (${r.stats.reduce((n, s) => n + s.storedShorts, 0)} Shorts), ${r.skippedShorts.length} Shorts skipped, ${r.thumbsUsed} thumbnails tried, ${Math.round((Date.now() - t0) / 1000)} s\n`);
console.log("country | channel | kind | feed entries | feed shorts | kept (60 d) | shorts kept | shorts skipped | highlight/goals/interview/preview/other | with thumb | thumb failures | avg/max thumb B | avg/max short thumb B");
for (const s of r.stats) {
  const c = s.categories;
  console.log([s.country ?? "--", s.key, s.kind, s.entries, s.shorts, s.stored, s.storedShorts, s.skippedShorts, `${c.highlight}/${c.goals}/${c.interview}/${c.preview}/${c.other}`,
    s.withThumb, s.thumbFailures, `${avg(s.thumbBytes)}/${max(s.thumbBytes)}`, `${avg(s.shortThumbBytes)}/${max(s.shortThumbBytes)}`].join(" | ") + (s.error ? ` | FAILED: ${s.error}` : ""));
}
for (const s of r.stats) for (const f of s.failures.slice(0, 2)) console.log(`  thumb failure ${s.key}: ${f}`);
for (const [label, key] of [["thumb", "thumbBytes"], ["short thumb", "shortThumbBytes"]]) {
  const all = r.stats.flatMap((s) => s[key]).sort((a, b) => a - b);
  if (all.length) console.log(`${label} bytes: n ${all.length}, min ${all[0]}, median ${all[Math.floor(all.length / 2)]}, avg ${avg(all)}, p95 ${all[Math.floor(all.length * 0.95)]}, max ${all.at(-1)}`);
}
console.log(`\nwarnings: ${ctx.warnings.length ? ctx.warnings.join("; ") : "none"}\n\nMatches per team:`);
const byTeam = new Map();
for (const m of r.matches) byTeam.set(m.teamId, [...(byTeam.get(m.teamId) ?? []), m]);
const reviewIds = teams.filter((t) => REVIEW.includes(t.key)).map((t) => t.id);
const onlyReview = !args.includes("--all-teams");
for (const t of teams.filter((t) => (onlyReview ? reviewIds.includes(t.id) : byTeam.has(t.id) || reviewIds.includes(t.id)))) {
  const hits = byTeam.get(t.id) ?? [];
  console.log(`${t.name} (${t.country}): ${hits.length}`);
  for (const m of hits) console.log(`  [${m.rule}: ${m.matched}] ${m.category}${m.short ? " SHORT" : ""} ${m.channel}: ${m.title.slice(0, 110)}`);
}
if (onlyReview) console.log(`(other teams: ${[...byTeam.keys()].filter((id) => !reviewIds.includes(id)).length} with matches; --all-teams lists them)`);
console.log("\nNational teams:");
for (const country of ["MX", "HN", "GT", "JM"]) {
  for (const women of [false, true]) {
    const hits = r.nations.filter((n) => n.country === country && n.women === women);
    if (women && !hits.length) continue;
    console.log(`${country} ${women ? "women" : "men"}: ${hits.length}`);
    for (const n of hits) console.log(`  [${n.rule}: ${n.matched}] ${n.category}${n.short ? " SHORT" : ""} ${n.channel}: ${n.title.slice(0, 110)}`);
  }
}
console.log("\nShorts skipped (category 'other', or not about a club or national team):");
for (const s of r.skippedShorts) console.log(`  ${s.category} ${s.channel}: ${s.title.slice(0, 110)}`);
writeFileSync(`${dir}/matches.json`, JSON.stringify(r.matches.map((m) => ({ ...m, team: teams.find((t) => t.id === m.teamId)?.name })), null, 2));
writeFileSync(`${dir}/nations.json`, JSON.stringify(r.nations, null, 2));
writeFileSync(`${dir}/stats.json`, JSON.stringify(r.stats, null, 2));
