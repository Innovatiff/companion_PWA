#!/usr/bin/env node
/**
 * Alert readiness, DRY RUN. Nothing is written and nothing is activated.
 *
 *   DATABASE_URL=<local database> node scripts/alerts-readiness.mjs --country MX [--limit 50]
 *
 * For a country whose warnings are not launched yet, answers "what would happen
 * if the owner switched it on":
 *   1. the live CAP feed: does it answer, how many documents, do they parse
 *   2. issuing source: every document from the national sender; and the Alert
 *      Hub country feed filtered to the national source (foreign items counted)
 *   3. polygon quality: vertex counts, polygons per document, and which states
 *      the polygons cover (from our municipality catalog), next to the agency's
 *      own areaDesc
 *   4. how many Hoy client towns (home and watched) the live documents would
 *      match, and how many would push under the source's push levels
 *   5. the push copy under OPEN-DECISIONS 1 (Mexico: highest tier only, with
 *      SMN's areaDesc verbatim), rendered by the database's own
 *      app.alert_push_text so it is exactly what the queue would write
 *
 * Every database query runs inside a READ ONLY transaction that is rolled back.
 * A feed that does not answer is reported INCONCLUSIVE, never as "no alerts".
 */
import { pathToFileURL } from "node:url";
import pg from "pg";
import { resolveDbConfig } from "../src/db.mjs";
import { fetchText } from "../src/run-feed.mjs";
import { extractFeedLinks, parseCapDocument, parseFeedIndex, sourceIdFromUrl } from "../src/feeds/cap.mjs";

/** SMN's areaDesc abbreviations. An abbreviation not listed is reported, never guessed. */
export const MX_STATES = {
  AGS: "Aguascalientes", BC: "Baja California", BCS: "Baja California Sur", CAMP: "Campeche", CHIS: "Chiapas",
  CHIH: "Chihuahua", CDMX: "Ciudad de México", COAH: "Coahuila", COL: "Colima", DGO: "Durango", GTO: "Guanajuato",
  GRO: "Guerrero", HGO: "Hidalgo", JAL: "Jalisco", MEX: "México", EDOMEX: "México", MICH: "Michoacán", MOR: "Morelos",
  NAY: "Nayarit", NL: "Nuevo León", OAX: "Oaxaca", PUE: "Puebla", QRO: "Querétaro", QROO: "Quintana Roo",
  SLP: "San Luis Potosí", SIN: "Sinaloa", SON: "Sonora", TAB: "Tabasco", TAMPS: "Tamaulipas", TLAX: "Tlaxcala",
  VER: "Veracruz", YUC: "Yucatán", ZAC: "Zacatecas",
};

export function parseArgs(argv) {
  const out = { country: null, limit: null, concurrency: 6 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--country") out.country = String(argv[++i] ?? "").toUpperCase();
    else if (argv[i] === "--limit") out.limit = Number(argv[++i]);
    else if (argv[i] === "--concurrency") out.concurrency = Number(argv[++i]);
  }
  return out;
}

/** Vertices per polygon (a closed WKT ring repeats its first point; not counted twice). */
export function vertexCounts(polygonWkts) {
  return polygonWkts.map((w) => {
    const pts = /\(\((.*)\)\)/.exec(w)?.[1].split(",").map((p) => p.trim()) ?? [];
    return pts.length > 1 && pts[0] === pts[pts.length - 1] ? pts.length - 1 : pts.length;
  });
}

/** The agency's areaDesc as state names: "DGO, GTO" -> Durango, Guanajuato. */
export function areaStates(areaDesc) {
  const codes = String(areaDesc ?? "").split(/[;,]/).map((s) => s.trim().toUpperCase().replace(/\.$/, "")).filter(Boolean);
  return {
    codes,
    names: [...new Set(codes.filter((c) => MX_STATES[c]).map((c) => MX_STATES[c]))],
    unknown: codes.filter((c) => !MX_STATES[c]),
  };
}

/** Alert Hub country feed: how many items the national source issued, and who issued the rest. */
export function hubSources(links, hubSourceId) {
  const foreign = {};
  let national = 0;
  for (const l of links) {
    const id = sourceIdFromUrl(l.link) ?? "(unrecognised url)";
    if (id === hubSourceId) national++;
    else foreign[id] = (foreign[id] ?? 0) + 1;
  }
  return { total: links.length, national, foreign };
}

const tally = (xs) => xs.reduce((m, x) => ((m[x ?? "(none)"] = (m[x ?? "(none)"] ?? 0) + 1), m), {});
const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

/** Everything about a set of parsed CAP documents that needs no database. */
export function summarise(docs, { now = new Date(), expectedSender = null } = {}) {
  const live = (d) => ["Alert", "Update"].includes(d.msgType) && (!d.expiresAt || new Date(d.expiresAt) > now);
  const vertices = docs.flatMap((d) => vertexCounts(d.polygonWkts));
  const polys = docs.map((d) => d.polygonWkts.length);
  const ids = tally(docs.map((d) => d.capIdentifier));
  return {
    documents: docs.length,
    live: docs.filter(live).length,
    expired: docs.filter((d) => d.expiresAt && new Date(d.expiresAt) <= now).length,
    identifiers: Object.keys(ids).length,
    repeatedIdentifiers: Object.entries(ids).filter(([, n]) => n > 1).map(([id, n]) => `${id} x${n}`),
    msgTypes: tally(docs.map((d) => d.msgType)),
    withReferences: docs.filter((d) => d.referencedIdentifiers.length).length,
    severities: tally(docs.map((d) => d.severityRaw)),
    levels: tally(docs.map((d) => d.level)),
    senders: tally(docs.map((d) => d.capSender)),
    foreignSenders: expectedSender ? docs.filter((d) => d.capSender !== expectedSender).map((d) => d.capSender) : [],
    languages: tally(docs.map((d) => d.language)),
    noGeometry: docs.filter((d) => !d.polygonWkts.length && !d.centerWkt).length,
    polygonsPerDocument: { min: polys.length ? Math.min(...polys) : null, max: polys.length ? Math.max(...polys) : null },
    vertices: { polygons: vertices.length, min: vertices.length ? Math.min(...vertices) : null, median: median(vertices), max: vertices.length ? Math.max(...vertices) : null },
    areaDescStates: tally(docs.flatMap((d) => areaStates(d.areaDesc).names)),
    unknownAreaCodes: [...new Set(docs.flatMap((d) => areaStates(d.areaDesc).unknown))],
    isLive: live,
  };
}

async function mapLimit(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.max(1, n) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
  }));
  return out;
}

const COVER_SQL = `
  with g as (
    select extensions.ST_Multi(extensions.ST_Collect(array(
             select extensions.ST_GeomFromText(w, 4326) from unnest($1::text[]) w)))::extensions.geography as area
  ), covered as (
    select m.id, m.admin_region from municipalities m, g
     where m.country = $2::country_code and extensions.ST_Covers(g.area, m.geog)
  ), hit as (
    select c.id as cid, c.municipality_id as mid from clients c join covered cv on cv.id = c.municipality_id
     where c.active and c.country = $2::country_code
    union
    select w.client_id, w.municipality_id from client_watch_locations w
      join covered cv on cv.id = w.municipality_id join clients c on c.id = w.client_id
     where c.active and c.country = $2::country_code
  )
  select (select count(*)::int from covered) as catalog_towns,
         (select coalesce(array_agg(distinct admin_region order by admin_region), '{}') from covered) as states,
         (select coalesce(array_agg(distinct cid), '{}') from hit) as clients,
         (select count(distinct mid)::int from hit) as client_towns`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.country) { console.error("usage: alerts-readiness.mjs --country MX [--limit N]"); process.exit(2); }
  const db = new pg.Client(resolveDbConfig());
  await db.connect();
  await db.query("begin transaction read only");
  const say = (s = "") => console.log(s);
  try {
    const { rows: [src] } = await db.query(
      `select id, country, agency, kind, feed_url, hub_feed_url, hub_source_id, push_levels::text[] as push_levels,
              include_area_desc, active from alert_sources where country = $1 order by (kind = 'cap') desc limit 1`, [args.country]);
    if (!src) { say(`INCONCLUSIVE: no alert source configured for ${args.country}`); process.exitCode = 2; return; }
    const { rows: [exp] } = await db.query(
      "select active, expected_interval::text as every from feed_expectations where feed = $1", [`alerts:${args.country}`]);
    const { rows: [catalog] } = await db.query(
      `select (select count(*)::int from municipalities where country = $1) as towns,
              (select count(*)::int from clients where active and country = $1) as clients,
              (select count(*)::int from clients where active and country = $1 and municipality_id is not null) as with_home,
              (select count(*)::int from client_watch_locations w join clients c on c.id = w.client_id
                where c.active and c.country = $1) as watched`, [args.country]);

    say(`ALERT READINESS (dry run) — ${src.country} · ${src.agency} · ${new Date().toISOString()}`);
    say(`Source: kind=${src.kind} active=${src.active} push_levels={${src.push_levels}} include_area_desc=${src.include_area_desc}`);
    say(`Staleness expectation alerts:${args.country}: ${exp ? `active=${exp.active}, every ${exp.every}` : "none configured"}`);
    say(`Catalog: ${catalog.towns} towns · Hoy clients: ${catalog.clients} active (${catalog.with_home} with a home town, ${catalog.watched} watched towns)`);
    if (src.kind !== "cap") { say("Not a CAP source: nothing to dry-run."); return; }

    // 1. The agency's feed.
    say("\n1. Agency CAP feed");
    let index;
    try {
      index = parseFeedIndex((await fetchText(src.feed_url, { timeoutMs: 40_000 })).body, src.feed_url);
    } catch (err) {
      say(`   INCONCLUSIVE: ${src.feed_url} did not answer (${err.message}). This is not "no alerts".`);
      process.exitCode = 2;
      return;
    }
    const links = args.limit ? index.documents.slice(0, args.limit) : index.documents;
    say(`   ${src.feed_url} answered: ${index.documents.length} document links, ${index.placeholders.length} placeholder entries; fetching ${links.length}`);
    const failures = [];
    const parsed = await mapLimit(links, args.concurrency, async (l) => {
      try {
        const d = parseCapDocument((await fetchText(l.link, { timeoutMs: 30_000 })).body, l.link);
        if (!d?.capIdentifier) failures.push(`${l.link}: unparseable`);
        return d?.capIdentifier ? d : null;
      } catch (err) { failures.push(`${l.link}: ${err.message}`); return null; }
    });
    const docs = parsed.filter(Boolean);
    const expectedSender = docs.length ? Object.entries(tally(docs.map((d) => d.capSender))).sort((a, b) => b[1] - a[1])[0][0] : null;
    const s = summarise(docs, { expectedSender });
    say(`   parsed ${docs.length}; failed ${failures.length}${failures.length ? " (INCONCLUSIVE for those: " + failures.slice(0, 3).join("; ") + ")" : ""}`);
    say(`   msgType ${JSON.stringify(s.msgTypes)} · with <references> ${s.withReferences} · distinct identifiers ${s.identifiers}${s.repeatedIdentifiers.length ? ` (repeated: ${s.repeatedIdentifiers.slice(0, 3).join(", ")})` : ""}`);
    say(`   severity ${JSON.stringify(s.severities)} -> level ${JSON.stringify(s.levels)}`);
    say(`   live now (Alert/Update, not expired) ${s.live} · expired ${s.expired} · language ${JSON.stringify(s.languages)}`);

    // 2. Issuing source.
    say("\n2. Issuing source");
    say(`   senders on the agency route: ${JSON.stringify(s.senders)}${s.foreignSenders.length ? ` — ${s.foreignSenders.length} NOT from ${expectedSender}` : " — all from one national sender"}`);
    if (src.hub_feed_url) {
      try {
        const hub = hubSources(extractFeedLinks((await fetchText(src.hub_feed_url, { timeoutMs: 30_000 })).body), src.hub_source_id);
        say(`   Alert Hub ${src.hub_feed_url}: ${hub.total} items, ${hub.national} issued by ${src.hub_source_id}, discarded as foreign: ${JSON.stringify(hub.foreign)}`);
      } catch (err) {
        say(`   Alert Hub fallback: INCONCLUSIVE (${err.message})`);
      }
    }

    // 3. Polygon quality.
    say("\n3. Polygons");
    say(`   documents without geometry ${s.noGeometry} · polygons per document ${s.polygonsPerDocument.min}–${s.polygonsPerDocument.max}`);
    say(`   vertices per polygon: ${s.vertices.polygons} polygons, min ${s.vertices.min}, median ${s.vertices.median}, max ${s.vertices.max} (Jamaica's parish polygons: 68–739)`);
    say(`   states named in areaDesc: ${JSON.stringify(s.areaDescStates)}${s.unknownAreaCodes.length ? ` · unrecognised codes: ${s.unknownAreaCodes.join(", ")}` : ""}`);

    // 4. What the polygons cover, and Hoy clients they would match.
    const covers = await mapLimit(docs, 1, async (d) =>
      d.polygonWkts.length ? (await db.query(COVER_SQL, [d.polygonWkts, args.country])).rows[0] : null);
    let widest = null;
    const extraStates = [];
    docs.forEach((d, i) => {
      const c = covers[i];
      if (!c) return;
      if (!widest || c.catalog_towns > widest.c.catalog_towns) widest = { d, c };
      const named = new Set(areaStates(d.areaDesc).names);
      const outside = c.states.filter((st) => !named.has(st));
      if (outside.length) extraStates.push(`${d.capIdentifier}: ${outside.join(", ")}`);
    });
    const liveIdx = docs.map((d, i) => (s.isLive(d) ? i : -1)).filter((i) => i >= 0);
    const pushIdx = liveIdx.filter((i) => src.push_levels.includes(docs[i].level));
    const clientsOf = (idx) => new Set(idx.flatMap((i) => covers[i]?.clients ?? []));
    say("\n4. Coverage and Hoy clients");
    say(`   catalog towns inside a polygon: median ${median(covers.filter(Boolean).map((c) => c.catalog_towns))}, widest ${widest ? `${widest.c.catalog_towns} towns in ${widest.c.states.length} states (${widest.d.areaDesc})` : "n/a"}`);
    say(`   polygons reaching catalog towns in states their areaDesc does not name: ${extraStates.length}${extraStates.length ? " e.g. " + extraStates.slice(0, 3).join(" | ") : ""}`);
    say(`   live documents ${liveIdx.length}: would match ${clientsOf(liveIdx).size} Hoy clients (${liveIdx.reduce((n, i) => n + (covers[i]?.client_towns ?? 0), 0)} client-town matches)`);
    say(`   at the push tier {${src.push_levels}}: ${pushIdx.length} live documents -> would push to ${clientsOf(pushIdx).size} clients (one push per client per identifier)`);

    // 5. Push copy under the source's policy.
    say("\n5. Push copy (app.alert_push_text; OPEN-DECISIONS 1)");
    const copy = async (d, lang) => (await db.query(
      "select title, body from app.alert_push_text($1, $2::alert_level, $3, $4, $5, $6, $7, $8, $9, '{}')",
      [d.msgType, d.level, d.severityRaw, src.agency, d.headline, d.event, d.areaDesc, src.include_area_desc, lang])).rows[0];
    const tier = docs.filter((d) => src.push_levels.includes(d.level));
    if (tier.length) {
      say(`   ${tier.length} fetched documents are at the push tier; the most recent:`);
      for (const d of tier.slice(0, 3)) { const c = await copy(d, "es"); say(`   [${d.capIdentifier}] ${c.title}\n     ${c.body}`); }
    } else {
      say(`   0 of ${docs.length} fetched documents are at the push tier {${src.push_levels}}: under the decided policy none of these would push.`);
      say("   Format, shown with each document's OWN level (these would NOT be sent):");
    }
    for (const d of (tier.length ? [] : docs.slice(0, 3))) {
      const c = await copy(d, "es");
      say(`   [${d.capIdentifier}, ${d.severityRaw}] ${c.title}\n     ${c.body}`);
    }

    say(`\nNothing was written. alert_sources.active for ${args.country} is ${src.active}; switching it on is the owner's decision.`);
  } finally {
    await db.query("rollback").catch(() => {});
    await db.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => { console.error(`INCONCLUSIVE: ${err.message}`); process.exit(2); });
}
