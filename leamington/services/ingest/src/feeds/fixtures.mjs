/**
 * Football fixtures and results: hourly, all four leagues, by date query.
 *
 * On API-Football's free plan (docs/OPEN-DECISIONS.md #2) one date query returns
 * every fixture that day, so one request covers all four leagues. League+season
 * queries are locked to 2022-2024, and date queries reach only yesterday to
 * tomorrow. There is no live polling: a score stored mid-match can be up to an
 * hour old, and the UI must not present it as live.
 *
 * Schedule, UTC: today every hour, yesterday once (kickoffs late in the UTC day
 * finish after midnight), tomorrow once. 26 requests/day, under a ceiling of 50
 * shared with verify/football.mjs, checked against API-Football's own count
 * before each query.
 *
 * source_result:
 *   items            the provider answered and at least one of our leagues plays that day
 *   confirmed_empty  the provider answered and none of them play: not a failure
 *   no_answer        plan, key, quota, ceiling or network (the run errors)
 */
import { query, withTransaction } from "../db.mjs";
import { apiFootball, requestsUsedToday, DAILY_CEILING, ApiFootballError } from "./apifootball.mjs";

const STATUS = {
  TBD: "scheduled", NS: "scheduled",
  "1H": "live", HT: "live", "2H": "live", ET: "live", BT: "live", P: "live", LIVE: "live", SUSP: "live", INT: "live",
  FT: "finished", AET: "finished", PEN: "finished", AWD: "finished", WO: "finished",
  PST: "postponed",
  CANC: "cancelled", ABD: "cancelled",
};

export const fixtureStatus = (short) => STATUS[short] ?? null;

export const utcDate = (offsetDays = 0, now = new Date()) =>
  new Date(now.getTime() + offsetDays * 86_400_000).toISOString().slice(0, 10);

async function upsertTeam(client, leagueId, team) {
  const { rows: [row] } = await client.query(
    `insert into teams (league_id, country, name, source, source_team_id, crest_source_url)
     select l.id, l.country, $2, 'api-football', $3, $4 from leagues l where l.id = $1
     on conflict (league_id, name) do update
       set source_team_id = excluded.source_team_id,
           crest_source_url = coalesce(excluded.crest_source_url, teams.crest_source_url)
     returning id`,
    [leagueId, team.name, String(team.id), team.logo ?? null]);
  return row.id;
}

export async function ingestFixtures(ctx, { offsetDays = 0, now = new Date() } = {}) {
  const { log } = ctx;

  const { rows: leagues } = await query(
    `select id, name, source_league_id from leagues
      where active and source = 'api-football' and source_league_id is not null`);
  if (!leagues.length) {
    throw new ApiFootballError("no active api-football leagues configured (load packages/db/seeds/leagues.sql)", "config");
  }

  // The ceiling is checked before asking, so a day of heavy harness use stops
  // this feed visibly (the run errors and the feed goes stale) rather than
  // silently spending the last of the quota.
  const used = await requestsUsedToday();
  if (used == null) ctx.warnings.push("API-Football did not report today's request count; ceiling not checked");
  else if (used >= DAILY_CEILING) {
    throw new ApiFootballError(`daily ceiling reached: ${used} of ${DAILY_CEILING} API-Football requests used today`, "ceiling");
  }

  const date = utcDate(offsetDays, now);
  const json = await apiFootball(`/fixtures?date=${date}`);
  const byProviderId = new Map(leagues.map((l) => [String(l.source_league_id), l.id]));
  const ours = (json.response ?? []).filter((f) => byProviderId.has(String(f?.league?.id)));

  log.info("date.query", { date, offsetDays, allFixtures: json.response?.length ?? 0, ourFixtures: ours.length, requestsUsedBefore: used });

  if (!ours.length) {
    log.info("confirmed_empty", { date, note: "the provider answered; none of our leagues play on this date" });
    return { recordsWritten: 0, sourceResult: "confirmed_empty" };
  }

  let written = 0;
  for (const f of ours) {
    const leagueId = byProviderId.get(String(f.league.id));
    const status = fixtureStatus(f.fixture?.status?.short);
    if (!status) {
      ctx.warnings.push(`fixture ${f.fixture?.id}: unrecognised status ${f.fixture?.status?.short}`);
      continue;
    }
    const season = f.league?.season != null ? String(f.league.season) : null;
    try {
      await withTransaction(async (client) => {
        const home = await upsertTeam(client, leagueId, f.teams.home);
        const away = await upsertTeam(client, leagueId, f.teams.away);
        await client.query(
          `insert into fixtures (league_id, home_team_id, away_team_id, kickoff_utc, status,
                                 home_score, away_score, source, source_fixture_id, season, round, fetched_at)
           values ($1, $2, $3, $4, $5::fixture_status, $6, $7, 'api-football', $8, $9, $10, now())
           on conflict (source, source_fixture_id) do update
             set home_team_id = excluded.home_team_id, away_team_id = excluded.away_team_id,
                 kickoff_utc = excluded.kickoff_utc, status = excluded.status,
                 home_score = excluded.home_score, away_score = excluded.away_score,
                 season = excluded.season, round = excluded.round, fetched_at = now()`,
          [leagueId, home, away, f.fixture.date, status, f.goals?.home ?? null, f.goals?.away ?? null,
           String(f.fixture.id), season, f.league?.round ?? null]);
        // The provider's current season, as seen on a live date query.
        if (season) {
          await client.query(
            `update leagues set current_season = $2, current_season_checked_at = now() where id = $1`,
            [leagueId, season]);
        }
      });
      written++;
    } catch (err) {
      ctx.warnings.push(`fixture ${f.fixture?.id}: ${err.message}`);
      log.warn("fixture.failed", { fixture: f.fixture?.id, error: err.message });
    }
  }

  log.info("stored", { date, written, warnings: ctx.warnings.length });
  return { recordsWritten: written, sourceResult: "items" };
}
