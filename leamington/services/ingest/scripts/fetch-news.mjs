/**
 * Read every active news outlet once and write NOTHING to the database.
 *
 *   PGHOST=/tmp PGPORT=55433 PGUSER=postgres PGDATABASE=leamington_main \
 *     node scripts/fetch-news.mjs --dry-run <dir> [--image-cap N] [--page-cap N]
 *
 * Outlets and the municipality catalogue are READ from the database the PG
 * environment points at (a local, seeded one). Each story's lead and thumb
 * JPEGs are saved in <dir>, with mentions.json and stats.json. It prints, per
 * outlet: items, stored, with image, image failures, average thumb and lead
 * bytes; then the mentions found for the review towns below; then the headlines
 * matched to clubs (news/teams.mjs), per club, with the rule. Clubs: one per
 * entry of videos/team-aliases.json in its country's league (a local database
 * does not hold the fixtures provider's teams), or the database's (--teams db).
 */
import { writeFileSync } from "node:fs";
import { query, closePool } from "../src/db.mjs";
import { ingestNews, dryStore } from "../src/feeds/news.mjs";
import { ALIAS_DATA } from "../src/feeds/videos/teams.mjs";

const REVIEW_TEAMS = ["mx-america", "hn-motagua", "gt-comunicaciones", "jm-montego-bay-united"];

const REVIEW_TOWNS = [
  ["HN", "Cortés", "San Pedro Sula"], ["HN", "Atlántida", "La Ceiba"],
  ["MX", "Michoacán", "Morelia"], ["MX", "Michoacán", "Uruapan"], ["MX", "Michoacán", "Zamora"], ["MX", "Chiapas", "Tapachula"],
  ["GT", "Huehuetenango", "Huehuetenango"], ["GT", "Quetzaltenango", "Quetzaltenango"],
  ["JM", "St. James", "Montego Bay"], ["JM", "Kingston", "Kingston"],
];

const args = process.argv.slice(2);
const at = args.indexOf("--dry-run");
const dir = at >= 0 ? args[at + 1] : null;
if (!dir) {
  console.error("usage: node scripts/fetch-news.mjs --dry-run <dir> [--image-cap N] [--page-cap N]\n(real runs go through the scheduler or scripts/run-feeds-once.mjs news)");
  process.exit(2);
}
const num = (flag, dflt) => (args.includes(flag) ? Number(args[args.indexOf(flag) + 1]) : dflt);

const sources = (await query(`select id, key, name, country::text, admin_region, feed_url, homepage_url, show_images from news_sources where active order by country, id`)).rows;
const catalogue = (await query(`select id, name, country::text, admin_region from municipalities`)).rows;
const leagues = (await query(`select id, country::text from leagues where active order by id`)).rows;
let teams;
if (args.includes("--teams") && args[args.indexOf("--teams") + 1] === "db") {
  teams = (await query(`select id, league_id, country::text, name, short_name from teams`)).rows;
} else {
  const leagueOf = Object.fromEntries(leagues.map((l) => [l.country, l.id]).reverse());
  teams = ALIAS_DATA.clubs.map((c, i) => ({ id: 100000 + i, league_id: leagueOf[c.country], country: c.country, name: c.names[0], short_name: null, key: c.key }));
}
const towns = REVIEW_TOWNS.map(([c, r, n]) => catalogue.find((m) => m.country === c && m.admin_region === r && m.name === n)).filter(Boolean);
await closePool();

const ctx = { warnings: [], log: { info() {}, warn() {} } };
const t0 = Date.now();
const r = await ingestNews(ctx, {
  store: dryStore(dir, { sources, towns, catalogue, teams }),
  imageCap: num("--image-cap", 2000), pageCap: num("--page-cap", 2000),
});

const avg = (a) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : "-");
console.log(`\n${sources.length} outlets, ${r.recordsWritten} stories, ${r.imagesUsed} pictures tried, ${r.pagesUsed} pages read, ${Math.round((Date.now() - t0) / 1000)} s\n`);
console.log("country | outlet | items | stored | with image | image failures | pictures suppressed | avg thumb B | avg lead B | max thumb B | max lead B");
for (const s of r.stats) {
  console.log([s.country, s.key, s.items, s.stored, s.withImage, s.imageFailures, s.suppressed + (s.picturesOff ? ` (+${s.picturesOff} outlet off)` : ""), avg(s.thumbBytes), avg(s.leadBytes),
    s.thumbBytes.length ? Math.max(...s.thumbBytes) : "-", s.leadBytes.length ? Math.max(...s.leadBytes) : "-"].join(" | ")
    + (s.error ? ` | FAILED: ${s.error}` : ""));
}
for (const s of r.stats) for (const f of s.failures.slice(0, 3)) console.log(`  image failure ${s.key}: ${f}`);
const byTerm = {};
for (const x of r.suppressed) byTerm[x.term] = (byTerm[x.term] ?? 0) + 1;
console.log(`\nPictures suppressed (graphic): ${r.suppressed.length} of ${r.recordsWritten} stories; by term ${JSON.stringify(byTerm)}`);
for (const x of r.suppressed) console.log(`  SUPPRESSED [${x.term}] ${x.source}: ${x.title.slice(0, 110)}`);
// Stories kept WITH a picture whose words come close to the list: the place to look for misses.
const near = /muert|mori|asesin|homicid|cadaver|cuerpo|restos|masacr|balac|balea|tirote|ejecut|decapit|fosa|feminic|sicari|armad|vida|kill|murder|dead|death|corpse|shoot|shot|massacr|homicide|stab|gun/i;
const plainFold = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
for (const x of r.pictured.filter((p) => near.test(plainFold(p.title)))) console.log(`  ALLOWED ${x.source}: ${x.title.slice(0, 110)}`);
writeFileSync(`${dir}/suppressed.json`, JSON.stringify(r.suppressed, null, 2));
console.log(`\nwarnings: ${ctx.warnings.length ? ctx.warnings.join("; ") : "none"}\n\nMentions:`);
for (const t of towns) {
  const hits = r.mentions.filter((m) => m.municipalityId === t.id);
  console.log(`${t.name} (${t.admin_region}): ${hits.length}`);
  for (const m of hits) console.log(`  [${m.rule}: ${m.matched}] ${m.source}: ${m.title.slice(0, 110)}`);
}
console.log(`\nClubs (${r.teams.length} matches):`);
const byTeam = new Map();
for (const m of r.teams) byTeam.set(m.teamId, [...(byTeam.get(m.teamId) ?? []), m]);
for (const t of teams.filter((t) => byTeam.has(t.id) || REVIEW_TEAMS.includes(t.key))) {
  const hits = byTeam.get(t.id) ?? [];
  console.log(`${t.name} (${t.country}): ${hits.length}`);
  for (const m of hits) console.log(`  [${m.rule}: ${m.matched}]${m.graphic ? ` GRAPHIC(${m.graphic})` : ""} ${m.source}: ${m.title.slice(0, 110)}`);
}
writeFileSync(`${dir}/teams.json`, JSON.stringify(r.teams.map((m) => ({ ...m, team: teams.find((t) => t.id === m.teamId)?.name })), null, 2));
writeFileSync(`${dir}/mentions.json`, JSON.stringify(r.mentions, null, 2));
writeFileSync(`${dir}/stats.json`, JSON.stringify(r.stats, null, 2));
