#!/usr/bin/env node
/**
 * Football coverage matrix: per provider, per league, per dimension.
 *
 *   fixtures | live | table | crests | historical | seasons
 *
 * Coverage is not binary: a provider that returns fixtures but no table changes
 * what the home screen can say. And every cell is one of THREE verdicts, never
 * collapsed into two:
 *
 *   COVERED       the provider returned the data, for this league
 *   NOT_COVERED   the provider answered, without restriction, that it lacks it
 *   INCONCLUSIVE  we could not tell: unreachable, key rejected, plan-gated,
 *                 rate-limited, no key, request budget spent, nothing in play,
 *                 an empty answer that proves nothing, or data about something else
 *
 * API-Football reports plan and key problems as HTTP 200 with an `errors`
 * object and an empty `response`. The previous version read only the status,
 * so "your plan cannot see this season" printed as "NOT FOUND in provider
 * catalogue", and catalogue flags printed as coverage. SILENCE IS NEVER
 * EVIDENCE, and neither is a response about a different league.
 *
 * Run:
 *   API_FOOTBALL_KEY=... [SPORTMONKS_KEY=...] node verify/football.mjs [--budget 30] [--json]
 *
 * --budget caps API-Football requests (free plan: 100/day, 10/minute). Cells the
 * budget does not reach are INCONCLUSIVE, not skipped.
 */
import { pathToFileURL } from "node:url";

export const COVERED = "COVERED";
export const NOT_COVERED = "NOT_COVERED";
export const INCONCLUSIVE = "INCONCLUSIVE";

export const DIMENSIONS = ["fixtures", "live", "table", "crests", "historical", "seasons"];

export const LEAGUES = [
  { key: "MX", label: "Liga MX", country: "Mexico",
    apiFootball: /^liga mx$/i, sportmonks: /^liga mx$/i, theSportsDb: /liga mx/i, search: "Liga MX" },
  { key: "HN", label: "Liga Nacional de Honduras", country: "Honduras",
    apiFootball: /^liga nacional$/i, sportmonks: /^liga nacional$/i, theSportsDb: /liga nacional/i, search: "Liga Nacional" },
  { key: "GT", label: "Liga Nacional de Guatemala", country: "Guatemala",
    apiFootball: /^liga nacional$/i, sportmonks: /^liga nacional$/i, theSportsDb: /liga nacional/i, search: "Liga Nacional" },
  { key: "JM", label: "Jamaica Premier League", country: "Jamaica",
    apiFootball: /^premier league$/i, sportmonks: /^premier league$/i, theSportsDb: /premier league/i, search: "Premier League" },
];

const FINISHED = ["FT", "AET", "PEN"];

export const cell = (verdict, reason, evidence) => (evidence === undefined ? { verdict, reason } : { verdict, reason, evidence });

function fill(row, c) {
  for (const d of DIMENSIONS) row[d] = c;
  return row;
}

/* ------------------------------------------------------------------ */
/* HTTP                                                                */
/* ------------------------------------------------------------------ */

export function describeNetworkError(err) {
  const code = err?.cause?.code || err?.code;
  const msg = String(err?.cause?.message || err?.message || err);
  if (err?.name === "AbortError" || err?.name === "TimeoutError") return "timeout";
  if (code === "ENOTFOUND") return "DNS lookup failed";
  if (code === "ECONNREFUSED") return "connection refused";
  if (/403|proxy/i.test(msg)) return "blocked by proxy (egress policy)";
  if (code) return `${code}: ${msg}`;
  return `network unreachable or blocked by egress policy (${msg})`;
}

async function request(url, { headers = {}, fetchImpl = globalThis.fetch, timeoutMs = 20_000 } = {}) {
  try {
    const res = await fetchImpl(url, {
      headers: { "user-agent": "leamington-verify/0.2", accept: "application/json", ...headers },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* judged below */ }
    return { status: res.status, json, empty: text.trim() === "" };
  } catch (err) {
    return { status: 0, unreachable: describeNetworkError(err) };
  }
}

/**
 * A rate-limited client with a request budget. Past the budget it does not call
 * the provider at all, and the caller records INCONCLUSIVE.
 */
export function makeClient({ base, headers = {}, query = "", fetchImpl, budget = Infinity, minIntervalMs = 0,
                             sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  let used = 0;
  let last = 0;
  return {
    get used() { return used; },
    async get(path) {
      if (used >= budget) return { exhausted: true };
      const wait = last + minIntervalMs - Date.now();
      if (used > 0 && wait > 0) await sleep(wait);
      used++;
      last = Date.now();
      const sep = path.includes("?") ? "&" : "?";
      return request(`${base}${path}${query ? sep + query : ""}`, { headers, fetchImpl });
    },
  };
}

function notAnswered(r) {
  if (r.exhausted) return "request budget spent; not probed";
  if (r.unreachable) return `unreachable: ${r.unreachable}`;
  if (r.status === 429) return "rate limited (HTTP 429)";
  return null;
}

/* ------------------------------------------------------------------ */
/* API-Football                                                        */
/* ------------------------------------------------------------------ */

/** What an API-Football response actually said. HTTP 200 is not an answer by itself. */
export function readApiFootball(r) {
  const no = notAnswered(r);
  if (no) return { answered: false, reason: no };
  if (r.status !== 200) return { answered: false, reason: `HTTP ${r.status}` };
  if (!r.json) return { answered: false, reason: "response was not JSON" };

  const e = r.json.errors;
  const errors = Array.isArray(e) ? (e.length ? { ...e } : null) : (e && Object.keys(e).length ? e : null);
  if (errors) {
    const keys = Object.keys(errors);
    const kind = keys.includes("plan") ? "plan-gated"
      : keys.some((k) => /token|key/i.test(k)) ? "key rejected"
      : keys.some((k) => /rate|requests/i.test(k)) ? "rate limited"
      : "provider error";
    return { answered: false, kind, errors, reason: `${kind}: ${Object.values(errors).join("; ")}` };
  }
  return { answered: true, rows: Array.isArray(r.json.response) ? r.json.response : [] };
}

/** "try from 2022 to 2024" -> [2022, 2024]. Date ranges ("2026-09-12 to ...") do not match. */
export function allowedSeasons(errors) {
  const m = /from (\d{4}) to (\d{4})(?!-)/.exec(Object.values(errors ?? {}).join(" "));
  return m ? [Number(m[1]), Number(m[2])] : null;
}

export function pickHistoricalSeason(years, currentYear, allowed) {
  const past = years.filter((y) => y < currentYear && (!allowed || (y >= allowed[0] && y <= allowed[1])));
  return past.length ? Math.max(...past) : null;
}

/** The two calls every league shares: today's fixtures by date, and matches in play. */
export async function apiFootballShared(client, today = new Date()) {
  const date = today.toISOString().slice(0, 10);
  return {
    date,
    today: readApiFootball(await client.get(`/fixtures?date=${date}`)),
    live: readApiFootball(await client.get(`/fixtures?live=all`)),
  };
}

export async function probeApiFootballLeague(client, L, shared) {
  const row = { league: L.label };

  const cat = readApiFootball(await client.get(`/leagues?country=${encodeURIComponent(L.country)}`));
  if (!cat.answered) return fill(row, cell(INCONCLUSIVE, `catalogue: ${cat.reason}`));
  const hit = cat.rows.find((i) => L.apiFootball.test(i?.league?.name ?? "") && i?.league?.type === "League");
  if (!hit) {
    // API-Football's catalogue is not plan-scoped: a free key lists every league.
    return fill(row, cell(NOT_COVERED, `not in the ${L.country} catalogue`,
      { catalogue: cat.rows.map((i) => i?.league?.name) }));
  }

  const id = hit.league.id;
  const seasons = [...(hit.seasons ?? [])].sort((a, b) => a.year - b.year);
  const current = seasons.find((s) => s.current) ?? seasons.at(-1);
  const flags = current?.coverage ?? {};
  row.provider = { id, name: hit.league.name, currentSeason: current?.year ?? null };
  let allowed = null;

  row.seasons = seasons.length
    ? cell(COVERED, `${seasons.length} seasons listed (${seasons[0].year}–${seasons.at(-1).year})`)
    : cell(INCONCLUSIVE, "catalogue lists no seasons");
  if (!current) {
    for (const d of ["fixtures", "table", "crests", "historical"]) row[d] = cell(INCONCLUSIVE, "no current season listed");
    row.live = cell(INCONCLUSIVE, "no current season listed");
    return row;
  }

  const todays = shared.today.answered ? shared.today.rows.filter((f) => f?.league?.id === id) : null;

  // fixtures
  const fx = readApiFootball(await client.get(`/fixtures?league=${id}&season=${current.year}`));
  if (fx.answered) {
    row.fixtures = fx.rows.length
      ? cell(COVERED, `${fx.rows.length} fixtures in season ${current.year}`)
      : cell(INCONCLUSIVE, `season ${current.year} returned no fixtures; an empty season proves nothing`);
  } else {
    allowed = allowedSeasons(fx.errors) ?? allowed;
    row.fixtures = todays?.length
      ? cell(COVERED, `season query ${fx.reason}; the date query for ${shared.date} returned ${todays.length} fixture(s)`,
          todays.map((f) => `${f.fixture.date} ${f.teams.home.name} v ${f.teams.away.name} [${f.fixture.status.short}]`))
      : cell(INCONCLUSIVE, `season ${current.year}: ${fx.reason}; date query: ${shared.today.answered ? `no fixture on ${shared.date}` : shared.today.reason}`);
  }

  // live
  if (!shared.live.answered) row.live = cell(INCONCLUSIVE, `live query: ${shared.live.reason}`);
  else {
    const inPlay = shared.live.rows.filter((f) => f?.league?.id === id);
    row.live = inPlay.length
      ? cell(COVERED, `${inPlay.length} match(es) in play`,
          inPlay.map((f) => `${f.teams.home.name} ${f.goals.home}-${f.goals.away} ${f.teams.away.name} ${f.fixture.status.elapsed}'`))
      : cell(INCONCLUSIVE, "no match in play at probe time", { providerFlagEvents: flags?.fixtures?.events ?? null });
  }

  // table
  const st = readApiFootball(await client.get(`/standings?league=${id}&season=${current.year}`));
  if (!st.answered) {
    allowed = allowedSeasons(st.errors) ?? allowed;
    row.table = cell(INCONCLUSIVE, `season ${current.year}: ${st.reason}`, { providerFlagStandings: flags.standings ?? null });
  } else {
    const rows = (st.rows[0]?.league?.standings ?? []).flat();
    row.table = rows.length ? cell(COVERED, `${rows.length} table rows for season ${current.year}`)
      : flags.standings === false ? cell(NOT_COVERED, `no table for season ${current.year}, and the provider's coverage says standings: false`)
      : cell(INCONCLUSIVE, `season ${current.year} returned no table rows`);
  }

  // crests: team logos, not the league logo
  const tm = readApiFootball(await client.get(`/teams?league=${id}&season=${current.year}`));
  if (tm.answered && tm.rows.length) {
    const withLogo = tm.rows.filter((t) => t?.team?.logo).length;
    row.crests = withLogo === 0
      ? cell(NOT_COVERED, `none of ${tm.rows.length} teams has a crest`)
      : cell(COVERED, `${withLogo}/${tm.rows.length} teams have a crest`);
  } else {
    if (!tm.answered) allowed = allowedSeasons(tm.errors) ?? allowed;
    const logos = (todays ?? []).flatMap((f) => [f.teams.home.logo, f.teams.away.logo]).filter(Boolean);
    row.crests = logos.length
      ? cell(COVERED, `team query ${tm.answered ? "returned no teams" : tm.reason}; today's fixtures carry ${logos.length} team crest(s)`)
      : cell(INCONCLUSIVE, tm.answered ? `season ${current.year} returned no teams` : `season ${current.year}: ${tm.reason}`);
  }

  // historical results, from a past season the plan can actually read
  const past = pickHistoricalSeason(seasons.map((s) => s.year), current.year, allowed);
  if (!past) {
    row.historical = cell(INCONCLUSIVE, allowed ? `no past season inside the plan's range ${allowed.join("–")}` : "no past season listed");
  } else {
    const h = readApiFootball(await client.get(`/fixtures?league=${id}&season=${past}`));
    if (!h.answered) row.historical = cell(INCONCLUSIVE, `season ${past}: ${h.reason}`);
    else {
      const ft = h.rows.filter((f) => FINISHED.includes(f?.fixture?.status?.short) && f?.goals?.home != null);
      row.historical = ft.length ? cell(COVERED, `${ft.length} finished results with scores in season ${past}`)
        : cell(INCONCLUSIVE, `season ${past} returned no finished results`);
    }
  }

  if (allowed) row.planSeasons = allowed;
  return row;
}

/* ------------------------------------------------------------------ */
/* SportMonks                                                          */
/* ------------------------------------------------------------------ */
/**
 * SportMonks' /leagues endpoints return only "leagues accessible within your
 * subscription", so a league missing from a search is not on this plan, which is
 * not the same as missing from SportMonks. This probe therefore never returns
 * NOT_COVERED: only COVERED or INCONCLUSIVE.
 *
 * Endpoint paths follow the SportMonks v3 docs and have not been exercised with a
 * live key; any unexpected response reads INCONCLUSIVE.
 */
export function readSportMonks(r) {
  const no = notAnswered(r);
  if (no) return { answered: false, reason: no };
  if (r.status === 401) return { answered: false, reason: "key rejected (HTTP 401)" };
  if (r.status === 403) return { answered: false, reason: "not on this plan (HTTP 403)" };
  if (r.status !== 200) return { answered: false, reason: `HTTP ${r.status}` };
  if (!r.json) return { answered: false, reason: "response was not JSON" };
  if (r.json.data == null) return { answered: false, reason: `no data: ${r.json.message ?? "empty response"}` };
  return { answered: true, rows: Array.isArray(r.json.data) ? r.json.data : [r.json.data] };
}

export async function probeSportMonksLeague(client, L, today = new Date()) {
  const row = { league: L.label };
  if (!client) return fill(row, cell(INCONCLUSIVE, "no SPORTMONKS_KEY; not probed"));

  const s = readSportMonks(await client.get(`/leagues/search/${encodeURIComponent(L.search)}?include=country;currentSeason`));
  if (!s.answered) return fill(row, cell(INCONCLUSIVE, `league search: ${s.reason}`));
  const hit = s.rows.find((l) => L.sportmonks.test(l?.name ?? "") && (l?.country?.name ?? "").toLowerCase() === L.country.toLowerCase());
  if (!hit) {
    return fill(row, cell(INCONCLUSIVE,
      "not in this plan's league list; SportMonks lists only leagues on your plan, so this is not absence from its catalogue"));
  }

  const id = hit.id;
  const seasonId = hit.currentseason?.id ?? hit.currentSeason?.id ?? hit.current_season_id ?? null;
  row.provider = { id, name: hit.name, currentSeasonId: seasonId };
  const rowsOrWhy = (res, what) => (res.answered
    ? (res.rows.length ? null : `${what} returned no data`)
    : `${what}: ${res.reason}`);

  const from = today.toISOString().slice(0, 10);
  const to = new Date(today.getTime() + 14 * 86_400_000).toISOString().slice(0, 10);
  const fx = readSportMonks(await client.get(`/fixtures/between/${from}/${to}?filters=fixtureLeagues:${id}`));
  row.fixtures = rowsOrWhy(fx, "fixtures") ? cell(INCONCLUSIVE, rowsOrWhy(fx, "fixtures"))
    : cell(COVERED, `${fx.rows.length} fixtures between ${from} and ${to}`);

  const lv = readSportMonks(await client.get(`/livescores/inplay?filters=fixtureLeagues:${id}`));
  row.live = lv.answered && lv.rows.length ? cell(COVERED, `${lv.rows.length} match(es) in play`)
    : cell(INCONCLUSIVE, lv.answered ? "no match in play at probe time" : `livescores: ${lv.reason}`);

  if (!seasonId) {
    row.table = row.crests = cell(INCONCLUSIVE, "no current season id in the league record");
  } else {
    const st = readSportMonks(await client.get(`/standings/seasons/${seasonId}`));
    row.table = rowsOrWhy(st, "standings") ? cell(INCONCLUSIVE, rowsOrWhy(st, "standings"))
      : cell(COVERED, `${st.rows.length} table rows`);
    const tm = readSportMonks(await client.get(`/teams/seasons/${seasonId}`));
    if (rowsOrWhy(tm, "teams")) row.crests = cell(INCONCLUSIVE, rowsOrWhy(tm, "teams"));
    else {
      const withImage = tm.rows.filter((t) => t?.image_path).length;
      row.crests = withImage ? cell(COVERED, `${withImage}/${tm.rows.length} teams have a crest`)
        : cell(INCONCLUSIVE, `${tm.rows.length} teams returned without images`);
    }
  }

  const ss = readSportMonks(await client.get(`/seasons?filters=seasonLeagues:${id}`));
  if (rowsOrWhy(ss, "seasons")) {
    row.seasons = row.historical = cell(INCONCLUSIVE, rowsOrWhy(ss, "seasons"));
  } else {
    row.seasons = cell(COVERED, `${ss.rows.length} seasons readable on this plan`);
    const prev = ss.rows.filter((x) => x?.id !== seasonId && x?.is_current !== true)
      .sort((a, b) => String(b?.name).localeCompare(String(a?.name)))[0];
    if (!prev) row.historical = cell(INCONCLUSIVE, "no past season readable on this plan");
    else {
      const h = readSportMonks(await client.get(`/fixtures?filters=fixtureSeasons:${prev.id}`));
      row.historical = rowsOrWhy(h, `season ${prev.name}`) ? cell(INCONCLUSIVE, rowsOrWhy(h, `season ${prev.name}`))
        : cell(COVERED, `${h.rows.length} fixtures in season ${prev.name}`);
    }
  }
  return row;
}

/* ------------------------------------------------------------------ */
/* TheSportsDB                                                         */
/* ------------------------------------------------------------------ */
/**
 * The free key ("3") answers every endpoint, but not always about the league
 * asked for. Observed 2026-09-13:
 *   - lookup_all_teams returns the same 24 English League 1 teams for any league
 *   - lookuptable returns at most 5 rows
 *   - eventsnextleague and eventspastleague return one event
 *   - a league with no table answers HTTP 200 with an empty body
 * So a row counts only if it belongs to the requested league, and a free-key
 * table of 5 rows or fewer does not show that a full table exists.
 */
export function readTheSportsDb(r, field) {
  const no = notAnswered(r);
  if (no) return { answered: false, reason: no };
  if (r.status !== 200) return { answered: false, reason: `HTTP ${r.status}` };
  if (r.empty) return { answered: true, rows: [] };
  if (!r.json) return { answered: false, reason: "response was not JSON" };
  const rows = r.json[field];
  return { answered: true, rows: Array.isArray(rows) ? rows : [] };
}

export async function probeTheSportsDbLeague(client, L,
  { freeKey = !process.env.THESPORTSDB_KEY || process.env.THESPORTSDB_KEY === "3" } = {}) {
  const row = { league: L.label };
  const s = readTheSportsDb(await client.get(`/search_all_leagues.php?c=${encodeURIComponent(L.country)}&s=Soccer`), "countries");
  if (!s.answered) return fill(row, cell(INCONCLUSIVE, `league search: ${s.reason}`));
  const hit = s.rows.find((l) => L.theSportsDb.test(l?.strLeague ?? ""));
  if (!hit) return fill(row, cell(NOT_COVERED, `not among ${L.country}'s soccer leagues`, { leagues: s.rows.map((l) => l?.strLeague) }));

  const id = String(hit.idLeague);
  row.provider = { id, name: hit.strLeague, currentSeason: hit.strCurrentSeason ?? null, freeKey };

  /** Rows about another league are not evidence about this one. */
  const own = (res, what) => {
    if (!res.answered) return { why: `${what}: ${res.reason}` };
    if (!res.rows.length) return { why: `${what} returned nothing${freeKey ? "; on the free key an empty list proves nothing" : ""}` };
    const mine = res.rows.filter((x) => String(x?.idLeague) === id);
    if (!mine.length) {
      const other = [...new Set(res.rows.map((x) => x?.strLeague).filter(Boolean))].join(", ") || "another league";
      return { why: `${what} returned rows for ${other}, not this league` };
    }
    return { rows: mine };
  };

  const next = own(readTheSportsDb(await client.get(`/eventsnextleague.php?id=${id}`), "events"), "next events");
  row.fixtures = next.rows ? cell(COVERED, `${next.rows.length} upcoming event(s) for this league`) : cell(INCONCLUSIVE, next.why);

  row.live = cell(INCONCLUSIVE, freeKey ? "the free key has no livescore endpoint; not probed" : "livescores not probed");

  if (!hit.strCurrentSeason) row.table = cell(INCONCLUSIVE, "no current season in the league record");
  else {
    const t = own(readTheSportsDb(await client.get(`/lookuptable.php?l=${id}&s=${encodeURIComponent(hit.strCurrentSeason)}`), "table"), "table");
    row.table = !t.rows ? cell(INCONCLUSIVE, t.why)
      : freeKey && t.rows.length <= 5
        ? cell(INCONCLUSIVE, `${t.rows.length} table rows; the free key returns at most 5, so a full table is not shown to exist`)
        : cell(COVERED, `${t.rows.length} table rows for ${hit.strCurrentSeason}`);
  }

  const tm = own(readTheSportsDb(await client.get(`/lookup_all_teams.php?id=${id}`), "teams"), "teams");
  if (!tm.rows) row.crests = cell(INCONCLUSIVE, tm.why);
  else {
    const badges = tm.rows.filter((t) => t?.strBadge || t?.strTeamBadge).length;
    row.crests = badges ? cell(COVERED, `${badges}/${tm.rows.length} teams have a crest`)
      : cell(NOT_COVERED, `none of ${tm.rows.length} teams has a crest`);
  }

  const past = own(readTheSportsDb(await client.get(`/eventspastleague.php?id=${id}`), "events"), "past events");
  row.historical = past.rows ? cell(COVERED, `${past.rows.length} past result(s) for this league`) : cell(INCONCLUSIVE, past.why);

  const ss = readTheSportsDb(await client.get(`/search_all_seasons.php?id=${id}`), "seasons");
  row.seasons = !ss.answered ? cell(INCONCLUSIVE, `seasons: ${ss.reason}`)
    : ss.rows.length ? cell(COVERED, `${ss.rows.length} seasons listed${freeKey ? " (the free key may truncate this list)" : ""}`)
    : cell(INCONCLUSIVE, "seasons returned nothing");
  return row;
}

/* ------------------------------------------------------------------ */
/* Verdicts and report                                                 */
/* ------------------------------------------------------------------ */

/**
 * Across providers: COVERED if any provider covers it; NOT_COVERED only when
 * every provider answered that it does not; anything else is INCONCLUSIVE.
 * A provider that was skipped or unreachable is counted, never dropped.
 */
export function combine(cells) {
  if (cells.some((c) => c?.verdict === COVERED)) return COVERED;
  if (cells.length && cells.every((c) => c?.verdict === NOT_COVERED)) return NOT_COVERED;
  return INCONCLUSIVE;
}

/** A probe that failed outright (not a plan gate, a quiet moment, or an empty answer). */
export function failedProbe(c) {
  return c?.verdict === INCONCLUSIVE && /(^|: )(unreachable|key rejected|HTTP [45]\d\d|response was not JSON)/.test(c.reason ?? "");
}

const SHORT = { [COVERED]: "COVERED", [NOT_COVERED]: "NOT COVERED", [INCONCLUSIVE]: "INCONCLUSIVE" };

function render(results) {
  for (const [provider, rows] of Object.entries(results)) {
    console.log(`\n=== ${provider} ===`);
    console.log(`  ${"league".padEnd(28)}${DIMENSIONS.map((d) => d.padEnd(14)).join("")}`);
    for (const r of rows) {
      console.log(`  ${r.league.padEnd(28)}${DIMENSIONS.map((d) => SHORT[r[d].verdict].padEnd(14)).join("")}`);
      if (r.provider) console.log(`  ${" ".repeat(28)}provider: ${JSON.stringify(r.provider)}${r.planSeasons ? `  plan seasons: ${r.planSeasons.join("–")}` : ""}`);
      for (const d of DIMENSIONS) console.log(`  ${" ".repeat(28)}${d.padEnd(11)} ${r[d].reason}`);
    }
  }

  console.log("\n=== Per league, across providers ===");
  for (const L of LEAGUES) {
    const cellsFor = (d) => Object.values(results).map((rows) => rows.find((r) => r.league === L.label)?.[d]);
    console.log(`  ${L.label.padEnd(28)}${DIMENSIONS.map((d) => SHORT[combine(cellsFor(d))].padEnd(14)).join("")}`);
  }

  const jm = Object.values(results).map((rows) => rows.find((r) => /Jamaica/.test(r.league))?.fixtures);
  const verdict = combine(jm);
  console.log(`\n=== Jamaica Premier League fixtures: ${SHORT[verdict]} ===`);
  if (verdict === INCONCLUSIVE) console.log("  Not a design input yet. Resolve the INCONCLUSIVE cells before deciding the Jamaican home screen.");
  if (verdict === NOT_COVERED) console.log("  Every provider answered that it lacks Jamaica. Jamaica needs a different home-screen anchor: escalate.");
}

async function main() {
  const args = process.argv.slice(2);
  const budgetArg = args.indexOf("--budget");
  const budget = budgetArg >= 0 ? Number(args[budgetArg + 1]) : 30;
  const env = process.env;
  const results = {};

  if (env.API_FOOTBALL_KEY) {
    const client = makeClient({ base: "https://v3.football.api-sports.io", headers: { "x-apisports-key": env.API_FOOTBALL_KEY },
      budget, minIntervalMs: 6_500 });
    const shared = await apiFootballShared(client);
    results["API-Football"] = [];
    for (const L of LEAGUES) results["API-Football"].push(await probeApiFootballLeague(client, L, shared));
    console.log(`API-Football requests used: ${client.used} of budget ${budget}`);
  } else {
    results["API-Football"] = LEAGUES.map((L) => fill({ league: L.label }, cell(INCONCLUSIVE, "no API_FOOTBALL_KEY; not probed")));
  }

  const sm = env.SPORTMONKS_KEY
    ? makeClient({ base: "https://api.sportmonks.com/v3/football", query: `api_token=${encodeURIComponent(env.SPORTMONKS_KEY)}`, minIntervalMs: 300 })
    : null;
  results["SportMonks"] = [];
  for (const L of LEAGUES) results["SportMonks"].push(await probeSportMonksLeague(sm, L));

  const tsdb = makeClient({ base: `https://www.thesportsdb.com/api/v1/json/${env.THESPORTSDB_KEY || "3"}`, minIntervalMs: 2_200 });
  results["TheSportsDB"] = [];
  for (const L of LEAGUES) results["TheSportsDB"].push(await probeTheSportsDbLeague(tsdb, L));

  if (args.includes("--json")) console.log(JSON.stringify(results, null, 2));
  else render(results);

  // Non-zero when a probe failed outright, so CI cannot read a dead key or a
  // blocked network as a finished survey.
  const failed = Object.values(results).flat().flatMap((r) => DIMENSIONS.map((d) => r[d])).filter(failedProbe);
  if (failed.length) console.log(`\n${failed.length} cell(s) INCONCLUSIVE because a probe failed outright.`);
  process.exit(failed.length ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
