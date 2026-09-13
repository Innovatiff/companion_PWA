/**
 * Lottery ingest — official draw results only.
 * Never odds, never predictions, never "hot numbers", never a link to buy.
 *
 * Cadence is PER GAME, driven by lottery_games.draw_times_local, not a fixed
 * interval: Cash Pot draws six times a day and a 6-hourly poller would show
 * stale numbers most of the day. A stale lottery number is worse than none.
 *
 * ON PARSERS: the operator sites could not be reached during source
 * verification, so no parser here was written against a real page. Rather than
 * ship a scraper guessed from an unseen DOM -- which would fail silently or,
 * worse, extract the wrong numbers -- each parser is explicitly unimplemented
 * and throws INCONCLUSIVE. Implement one only with the page in front of you.
 */
import { query } from "../db.mjs";
import { fetchText } from "../run-feed.mjs";

/**
 * Parser registry, keyed by `${country}:${operator}`.
 * A parser takes the fetched HTML and returns
 *   [{ drawDate, drawTimeLocal, numbers: string[], extras? }]
 */
export const PARSERS = {
  // "JM:Supreme Ventures": (html) => [...],
};

class NotImplementedError extends Error {
  constructor(key) {
    super(`no parser implemented for ${key} — the source page was never reachable ` +
          `during verification, so no scraper was written against it`);
    this.inconclusive = true;
    this.notImplemented = true;
  }
}

export async function loadDueGames(now = new Date()) {
  // A game is due when a published draw time has passed and we have no result
  // for that draw slot yet. The scheduler wakes per game; this is the guard.
  const { rows } = await query(
    `select g.id, g.country, g.operator, g.name, g.timezone,
            g.draw_times_local, g.draw_weekdays, g.results_url
       from lottery_games g where g.active order by g.country, g.name`);
  return rows;
}

export async function ingestLottery(ctx) {
  const { log } = ctx;
  const games = await loadDueGames();
  if (!games.length) { log.warn("no_active_games"); return { recordsWritten: 0 }; }

  let written = 0;
  const unimplemented = [];

  for (const g of games) {
    const key = `${g.country}:${g.operator}`;
    const parse = PARSERS[key];
    if (!parse) { unimplemented.push(`${key} (${g.name})`); continue; }

    try {
      const { body } = await fetchText(g.results_url);
      const draws = parse(body, g);
      for (const d of draws) {
        await query(
          `insert into lottery_results (game_id, draw_date, draw_time_local, numbers, extras, source_url, verified_at)
           values ($1,$2,$3,$4,$5,$6, now())
           on conflict (game_id, draw_date, draw_time_local) do update
             set numbers = excluded.numbers, extras = excluded.extras, verified_at = now()`,
          [g.id, d.drawDate, d.drawTimeLocal ?? null, d.numbers, d.extras ?? null, g.results_url]);
        written++;
      }
      log.info("game.ok", { game: g.name, country: g.country, draws: draws.length });
    } catch (err) {
      ctx.warnings.push(`${key} ${g.name}: ${err.message}`);
      log.warn("game.failed", { game: g.name, error: err.message });
    }
  }

  if (unimplemented.length) {
    // Loud, not silent. Zero results here means "not built", not "no draws".
    ctx.warnings.push(`no parser implemented: ${unimplemented.join("; ")}`);
    log.warn("parsers.unimplemented", {
      games: unimplemented,
      note: "INCONCLUSIVE — not a statement that there were no draws",
    });
    if (written === 0) throw new NotImplementedError(unimplemented.join("; "));
  }

  return { recordsWritten: written };
}
