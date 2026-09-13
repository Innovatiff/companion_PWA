#!/usr/bin/env node
/**
 * Football coverage matrix.
 *
 * "Coverage is not binary — a provider that returns fixtures but no table
 * changes what the home screen can say." So this does not ask "is the league
 * present"; it asks, per league per provider, which of six capabilities exist:
 *
 *   fixtures | live scores | league table | team crests | historical | seasons
 *
 * Run:
 *   API_FOOTBALL_KEY=... node football.mjs
 *   SPORTMONKS_KEY=...  node football.mjs
 *   node football.mjs                 # TheSportsDB free tier only
 *
 * Providers needing an absent key are skipped, not failed.
 */

const LEAGUES = [
  { key: "MX", label: "Liga MX",                      country: "Mexico",    match: /liga\s*mx|primera\s*divisi[oó]n/i },
  { key: "HN", label: "Liga Nacional de Honduras",    country: "Honduras",  match: /liga\s*nacional|primera\s*divisi[oó]n/i },
  { key: "GT", label: "Liga Nacional de Guatemala",   country: "Guatemala", match: /liga\s*nacional|primera\s*divisi[oó]n/i },
  { key: "JM", label: "Jamaica Premier League",       country: "Jamaica",   match: /premier\s*league|national\s*premier/i },
];

const DIMENSIONS = ["fixtures", "live", "table", "crests", "historical"];

const TIMEOUT = 20000;

/**
 * `fetch` collapses every transport failure into a bare TypeError. Surface the
 * real cause, so "blocked by an egress proxy" is never read as "the provider
 * does not carry this league".
 */
function describeNetworkError(err) {
  const code = err?.cause?.code || err?.code;
  const msg = String(err?.cause?.message || err?.message || err);
  if (err?.name === "AbortError") return "timeout";
  if (code === "ENOTFOUND") return "DNS lookup failed";
  if (code === "ECONNREFUSED") return "connection refused";
  if (/403|proxy/i.test(msg)) return "blocked by proxy (egress policy)";
  if (code) return `${code}: ${msg}`;
  return `network unreachable or blocked by egress policy (${msg})`;
}

async function getJson(url, headers = {}) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), TIMEOUT);
  try {
    const res = await fetch(url, {
      headers: { "user-agent": "leamington-verify/0.1", accept: "application/json", ...headers },
      signal: ac.signal,
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* provider returned non-JSON */ }
    return { ok: res.ok, status: res.status, json, text };
  } catch (err) {
    return { ok: false, status: 0, error: describeNetworkError(err), unreachable: true };
  } finally {
    clearTimeout(t);
  }
}

/* ------------------------------------------------------------------ */
/* API-Football                                                        */
/* ------------------------------------------------------------------ */
/**
 * API-Football is the only one of the three that SELF-REPORTS coverage: each
 * season in /leagues carries a `coverage` object saying whether standings,
 * events, players etc. are available for that season. We read it rather than
 * inferring from a sample response.
 */
async function probeApiFootball(key) {
  const base = "https://v3.football.api-sports.io";
  const headers = { "x-apisports-key": key };
  const rows = [];

  for (const L of LEAGUES) {
    const r = await getJson(`${base}/leagues?country=${encodeURIComponent(L.country)}`, headers);
    if (!r.ok) { rows.push({ league: L.label, error: r.error || `HTTP ${r.status}` }); continue; }

    const items = r.json?.response ?? [];
    // Prefer a top-flight league whose name matches; fall back to the first.
    const hit = items.find((i) => L.match.test(i?.league?.name || "")) || items[0];
    if (!hit) { rows.push({ league: L.label, found: false }); continue; }

    const seasons = hit.seasons ?? [];
    const latest = seasons[seasons.length - 1];
    const cov = latest?.coverage ?? {};
    const years = seasons.map((s) => s.year).filter(Number.isFinite);

    rows.push({
      league: L.label,
      found: true,
      providerName: hit.league?.name,
      leagueId: hit.league?.id,
      fixtures: seasons.length > 0,
      // Live scores: API-Football exposes in-play via /fixtures?live=all; the
      // per-season `events` flag is what makes that useful rather than bare.
      live: Boolean(cov?.fixtures?.events),
      table: Boolean(cov?.standings),
      crests: Boolean(hit.league?.logo),
      historical: years.length > 1,
      seasons: years.length,
      earliest: years.length ? Math.min(...years) : null,
      latest: latest?.year ?? null,
      current: seasons.find((s) => s.current)?.year ?? null,
    });
  }
  return rows;
}

/* ------------------------------------------------------------------ */
/* SportMonks                                                          */
/* ------------------------------------------------------------------ */
/**
 * SportMonks gates leagues by PLAN, so a league can exist in the catalogue and
 * still 403 on your subscription. We record both: present-in-catalogue, and
 * readable-on-this-plan. Only the second one is usable.
 */
async function probeSportMonks(key) {
  const base = "https://api.sportmonks.com/v3/football";
  const auth = `api_token=${encodeURIComponent(key)}`;
  const rows = [];

  for (const L of LEAGUES) {
    const r = await getJson(`${base}/leagues/search/${encodeURIComponent(L.country)}?${auth}`);
    if (!r.ok) { rows.push({ league: L.label, error: r.error || `HTTP ${r.status}` }); continue; }

    const items = r.json?.data ?? [];
    const hit = items.find((i) => L.match.test(i?.name || "")) || items[0];
    if (!hit) { rows.push({ league: L.label, found: false }); continue; }

    const id = hit.id;
    // Probe each capability separately; a 403 here means "not on your plan".
    const [seasons, standings, teams] = await Promise.all([
      getJson(`${base}/seasons?filters=seasonLeagues:${id}&${auth}`),
      getJson(`${base}/standings/live/leagues/${id}?${auth}`),
      getJson(`${base}/teams/seasons/${hit.current_season_id ?? ""}?${auth}`),
    ]);

    const teamList = teams.json?.data ?? [];
    const seasonList = seasons.json?.data ?? [];

    rows.push({
      league: L.label,
      found: true,
      providerName: hit.name,
      leagueId: id,
      planBlocked: [seasons, standings, teams].some((x) => x.status === 403),
      fixtures: seasonList.length > 0,
      live: standings.ok,           // live standings endpoint responding implies in-play data
      table: standings.ok,
      crests: teamList.some((t) => t.image_path),
      historical: seasonList.length > 1,
      seasons: seasonList.length,
    });
  }
  return rows;
}

/* ------------------------------------------------------------------ */
/* TheSportsDB (free)                                                  */
/* ------------------------------------------------------------------ */
async function probeTheSportsDb(key = "3") {
  const base = `https://www.thesportsdb.com/api/v1/json/${key}`;
  const all = await getJson(`${base}/all_leagues.php`);
  if (!all.ok) return LEAGUES.map((L) => ({ league: L.label, error: all.error || `HTTP ${all.status}` }));

  const leagues = (all.json?.leagues ?? []).filter((l) => /soccer/i.test(l.strSport || ""));
  const rows = [];

  for (const L of LEAGUES) {
    // TheSportsDB has no country filter on all_leagues, so match on name.
    const hit = leagues.find((l) => new RegExp(L.country, "i").test(l.strLeague || "")) ||
                leagues.find((l) => L.match.test(l.strLeague || "") && new RegExp(L.country, "i").test(l.strLeague || ""));
    if (!hit) { rows.push({ league: L.label, found: false }); continue; }

    const id = hit.idLeague;
    const [teams, next, table] = await Promise.all([
      getJson(`${base}/lookup_all_teams.php?id=${id}`),
      getJson(`${base}/eventsnextleague.php?id=${id}`),
      getJson(`${base}/lookuptable.php?l=${id}&s=${new Date().getFullYear()}`),
    ]);

    const teamList = teams.json?.teams ?? [];
    rows.push({
      league: L.label,
      found: true,
      providerName: hit.strLeague,
      leagueId: id,
      fixtures: Array.isArray(next.json?.events) && next.json.events.length > 0,
      live: false,                   // free tier has no livescore endpoint
      table: Array.isArray(table.json?.table) && table.json.table.length > 0,
      crests: teamList.some((t) => t.strBadge || t.strTeamBadge),
      historical: Boolean(hit.intFormedYear),
      seasons: null,
    });
  }
  return rows;
}

/* ------------------------------------------------------------------ */
/* Report                                                              */
/* ------------------------------------------------------------------ */
const tick = (v) => (v === true ? "yes" : v === false ? " - " : " ? ");

function render(provider, rows) {
  console.log(`\n=== ${provider} ===`);
  if (!rows.length) { console.log("  (no results)"); return; }
  console.log(
    `  ${"league".padEnd(30)} ${DIMENSIONS.map((d) => d.padEnd(11)).join("")}seasons`,
  );
  for (const r of rows) {
    if (r.error) { console.log(`  ${r.league.padEnd(30)} ERROR: ${r.error}`); continue; }
    if (!r.found) { console.log(`  ${r.league.padEnd(30)} NOT FOUND in provider catalogue`); continue; }
    const cells = DIMENSIONS.map((d) => tick(r[d]).padEnd(11)).join("");
    const seasons = r.seasons != null ? `${r.seasons}${r.earliest ? ` (from ${r.earliest})` : ""}` : "-";
    console.log(`  ${r.league.padEnd(30)} ${cells}${seasons}`);
    if (r.planBlocked) console.log(`  ${" ".repeat(30)} ! some endpoints returned 403 — not on this plan`);
    if (r.providerName && r.providerName !== r.league)
      console.log(`  ${" ".repeat(30)} provider name: "${r.providerName}" (id ${r.leagueId})`);
  }
}

const env = process.env;
const results = {};

if (env.API_FOOTBALL_KEY) results["API-Football"] = await probeApiFootball(env.API_FOOTBALL_KEY);
else console.log("skip API-Football — set API_FOOTBALL_KEY");

if (env.SPORTMONKS_KEY) results["SportMonks"] = await probeSportMonks(env.SPORTMONKS_KEY);
else console.log("skip SportMonks — set SPORTMONKS_KEY");

results["TheSportsDB (free)"] = await probeTheSportsDb(env.THESPORTSDB_KEY || "3");

for (const [name, rows] of Object.entries(results)) render(name, rows);

// The one finding that changes a design decision rather than an implementation.
console.log("\n=== Jamaica Premier League — go/no-go ===");
const jm = Object.entries(results).map(([p, rows]) => [p, rows.find((r) => /Jamaica/.test(r.league))]);

// A provider that could not be reached has told us NOTHING. Counting it as
// "not covered" would turn a DNS failure into a design decision -- the same
// mistake as showing "no alerts" as reassurance. Absence of an answer is not
// an answer.
const reachable = jm.filter(([, r]) => r && !r.error);
const unreachable = jm.filter(([, r]) => r?.error);
const covered = reachable.filter(([, r]) => r.found && r.fixtures);

if (reachable.length === 0) {
  console.log("  INCONCLUSIVE — no provider could be reached.");
  for (const [p, r] of unreachable) console.log(`    ${p}: ${r.error}`);
  console.log("  => This says nothing about coverage. Re-run from a network that can");
  console.log("     reach these providers before drawing any conclusion.");
} else if (covered.length) {
  for (const [p, r] of covered) {
    console.log(`  COVERED by ${p}: fixtures=${tick(r.fixtures)} live=${tick(r.live)} table=${tick(r.table)} crests=${tick(r.crests)}`);
  }
  console.log("  => Jamaican home screen can use a fútbol anchor.");
  if (unreachable.length) console.log(`  (note: ${unreachable.length} provider(s) unreachable and not counted)`);
} else {
  console.log(`  NOT COVERED by any of the ${reachable.length} provider(s) that answered.`);
  for (const [p, r] of reachable) console.log(`    ${p}: ${r.found ? "league present but no fixtures" : "not in catalogue"}`);
  if (unreachable.length) {
    console.log(`  CAUTION: ${unreachable.length} provider(s) could not be reached:`);
    for (const [p, r] of unreachable) console.log(`    ${p}: ${r.error}`);
    console.log("  => Verdict is provisional until those answer.");
  } else {
    console.log("  => Jamaica is the alerts launch country, so the Jamaican home screen");
    console.log("     needs a different anchor. That is a DESIGN decision — stop and escalate.");
  }
}

const anyError = Object.values(results).flat().some((r) => r.error);
process.exit(anyError ? 1 : 0);  // non-zero on any failed probe, so CI cannot read silence as success
