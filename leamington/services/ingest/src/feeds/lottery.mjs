/**
 * Lottery ingest — official draw results only.
 * Never odds, never predictions, never "hot numbers", never a link to buy.
 *
 * Cadence is PER GAME, driven by lottery_games.draw_times_local, not a fixed
 * interval: Cash Pot draws six times a day and a 6-hourly poller would show
 * stale numbers most of the day. A stale lottery number is worse than none.
 *
 * ON PARSERS: each operator module under ./lottery/ was written against real
 * responses from the operator's own site, saved under
 * test/fixtures/lottery/ (see the README there). A game whose operator has no
 * module, or whose name the module does not know, is UNIMPLEMENTED: it is
 * reported loudly and, if nothing else was written, the run throws
 * INCONCLUSIVE. It never reads as "no draws".
 */
import { query, withTransaction } from "../db.mjs";
import { fetchText } from "../run-feed.mjs";
import {
  addDays, BROWSER_UA, LotteryParseError, localNow, minutesOf, normalizeTimes, weekdayOf,
} from "./lottery/common.mjs";
import { supremeVentures } from "./lottery/jamaica.mjs";
import { loteriaNacional } from "./lottery/mexico.mjs";
import { santaLucia } from "./lottery/guatemala.mjs";
import { lotoHonduras } from "./lottery/honduras.mjs";

/**
 * Operator registry, keyed by `${country}:${operator}`. Each operator exposes
 *   games: the lottery_games.name values it has a confirmed parser for
 *   draws(game, { get, now }) -> [{ drawDate, drawTimeLocal, numbers: string[], extras, sourceUrl }]
 * where `get(url, { headers })` is the run's cached fetch.
 */
export const PARSERS = {
  "JM:Supreme Ventures": supremeVentures,
  "MX:Lotería Nacional": loteriaNacional,
  "GT:Lotería Santa Lucía": santaLucia,
  "HN:Loto Honduras": lotoHonduras,
};

/** A draw is expected this long after its slot before its absence is flagged. */
const PUBLISH_GRACE_MIN = 120;
/** A draw may be dated this far ahead of the local clock (skew) before it is rejected. */
const FUTURE_TOLERANCE_MIN = 15;

export function parserFor(game) {
  const op = PARSERS[`${game.country}:${game.operator}`.normalize("NFC")];
  return op && op.games.includes(game.name.normalize("NFC")) ? op : null;
}

class NotImplementedError extends Error {
  constructor(key) {
    super(`no parser implemented for ${key} — no scraper has been confirmed against ` +
          `a real response from the operator's source`);
    this.inconclusive = true;
    this.notImplemented = true;
  }
}

class NoGameAnsweredError extends Error {
  constructor(failures) {
    super(`every lottery game with a parser failed — INCONCLUSIVE, not "no draws": ${failures.join("; ")}`);
    this.inconclusive = true;
  }
}

/**
 * One fetch per distinct URL per run. Games that share a results page (the
 * Santa Lucía index serves both of its games) reuse the same response, or the
 * same failure.
 */
export function makeCachedGet(fetchImpl = fetchText) {
  const cache = new Map();
  const get = (url, { headers = {} } = {}) => {
    if (!cache.has(url)) {
      const pending = fetchImpl(url, { headers: { "user-agent": BROWSER_UA, ...headers } }).then((r) => r.body);
      pending.catch(() => {});   // observed by every caller; avoid an unhandled-rejection report
      cache.set(url, pending);
    }
    return cache.get(url);
  };
  get.urls = () => [...cache.keys()];
  return get;
}

export async function loadDueGames() {
  // Every active game is checked on every lottery run; upserts make repeats
  // harmless, and a run fired for one game's draw also catches late
  // publications for the others.
  const { rows } = await query(
    `select g.id, g.country, g.operator, g.name, g.timezone,
            g.draw_times_local, g.draw_weekdays, g.results_url
       from lottery_games g where g.active order by g.country, g.name`);
  return rows;
}

/** Shape checks every parser's output must pass, whatever the operator. */
export function validateDraws(game, draws, now) {
  const what = `${game.country}:${game.operator} ${game.name}`;
  if (!Array.isArray(draws) || draws.length === 0) {
    throw new LotteryParseError(`${what}: parser returned no draws`);
  }
  const multiDaily = normalizeTimes(game.draw_times_local).length > 1;
  const local = localNow(now, game.timezone);
  for (const d of draws) {
    const ok = /^\d{4}-\d{2}-\d{2}$/.test(d?.drawDate) &&
      (d.drawTimeLocal == null || /^\d{2}:\d{2}$/.test(d.drawTimeLocal)) &&
      Array.isArray(d.numbers) && d.numbers.length > 0 &&
      d.numbers.every((n) => typeof n === "string" && /^\d+$/.test(n));
    if (!ok) throw new LotteryParseError(`${what}: malformed draw ${JSON.stringify(d)}`);
    if (multiDaily && !d.drawTimeLocal) {
      throw new LotteryParseError(`${what}: draws several times a day but ${d.drawDate} has no draw time`);
    }
    const future = d.drawDate > local.date || (d.drawDate === local.date && d.drawTimeLocal &&
      minutesOf(d.drawTimeLocal) > local.minutes + FUTURE_TOLERANCE_MIN);
    if (future) {
      throw new LotteryParseError(
        `${what}: draw ${d.drawDate} ${d.drawTimeLocal ?? ""} is in the future (local now ${local.date} ${local.time})`);
    }
  }
}

/**
 * The most recent draw slot that should be published by now, from the game's
 * schedule. null when the game has no published draw times.
 */
export function expectedLatestSlot(game, now) {
  const times = normalizeTimes(game.draw_times_local);
  if (!times.length) return null;
  const weekdays = game.draw_weekdays?.length ? game.draw_weekdays.map(Number) : null;
  const local = localNow(new Date(now.getTime() - PUBLISH_GRACE_MIN * 60_000), game.timezone);
  for (let back = 0; back <= 8; back++) {
    const date = addDays(local.date, -back);
    if (weekdays && !weekdays.includes(weekdayOf(date))) continue;
    const due = times.filter((t) => back > 0 || minutesOf(t) <= local.minutes);
    if (due.length) return `${date} ${due.at(-1)}`;
  }
  return null;
}

/**
 * A source that keeps answering with old draws looks healthy from the run
 * status alone. Flag it: the newest draw must not be older than the slot that
 * should already be out.
 */
export function stalenessWarning(game, draws, now) {
  const expected = expectedLatestSlot(game, now);
  if (!expected) return null;
  const newest = draws.map((d) => `${d.drawDate} ${d.drawTimeLocal ?? "00:00"}`).sort().at(-1);
  return newest < expected
    ? `newest published draw is ${newest}; the ${expected} draw should be out by now`
    : null;
}

export async function storeDraw(game, d) {
  const params = [game.id, d.drawDate, d.drawTimeLocal ?? null, d.numbers, d.extras ?? null,
    d.sourceUrl ?? game.results_url];
  if (d.drawTimeLocal) {
    await query(
      `insert into lottery_results (game_id, draw_date, draw_time_local, numbers, extras, source_url, verified_at)
       values ($1,$2,$3,$4,$5,$6, now())
       on conflict (game_id, draw_date, draw_time_local) do update
         set numbers = excluded.numbers, extras = excluded.extras,
             source_url = excluded.source_url, verified_at = now(), fetched_at = now()`,
      params);
    return;
  }
  // unique (game_id, draw_date, draw_time_local) treats NULL times as distinct,
  // so ON CONFLICT never fires for a game with no published draw time. Update
  // in place under a per-draw lock instead of inserting a duplicate every run.
  await withTransaction(async (client) => {
    await client.query(`select pg_advisory_xact_lock(hashtext('lottery_results:' || $1 || ':' || $2))`,
      [String(game.id), d.drawDate]);
    const { rowCount } = await client.query(
      `update lottery_results
          set numbers = $4, extras = $5, source_url = $6, verified_at = now(), fetched_at = now()
        where game_id = $1 and draw_date = $2 and draw_time_local is not distinct from $3`,
      params);
    if (rowCount === 0) {
      await client.query(
        `insert into lottery_results (game_id, draw_date, draw_time_local, numbers, extras, source_url, verified_at)
         values ($1,$2,$3,$4,$5,$6, now())`,
        params);
    }
  });
}

export async function ingestLottery(ctx, {
  now = new Date(), loadGames = loadDueGames, store = storeDraw, fetchImpl = fetchText,
} = {}) {
  const { log } = ctx;
  const games = await loadGames(now);
  if (!games.length) { log.warn("no_active_games"); return { recordsWritten: 0 }; }

  const get = makeCachedGet(fetchImpl);
  let written = 0;
  let attempted = 0;
  let succeeded = 0;
  const unimplemented = [];
  const failures = [];

  for (const g of games) {
    const key = `${g.country}:${g.operator}`;
    const op = parserFor(g);
    if (!op) { unimplemented.push(`${key} (${g.name})`); continue; }

    attempted++;
    try {
      const draws = await op.draws(g, { get, now });
      validateDraws(g, draws, now);
      for (const d of draws) {
        await store(g, d);
        written++;
      }
      succeeded++;
      const stale = stalenessWarning(g, draws, now);
      if (stale) {
        ctx.warnings.push(`${key} ${g.name}: ${stale}`);
        log.warn("game.stale", { game: g.name, country: g.country, note: stale });
      }
      log.info("game.ok", { game: g.name, country: g.country, draws: draws.length });
    } catch (err) {
      failures.push(`${key} ${g.name}: ${err.message}`);
      ctx.warnings.push(`${key} ${g.name}: ${err.message}`);
      log.warn("game.failed", { game: g.name, error: err.message, httpStatus: err.httpStatus });
    }
  }
  log.info("fetch.summary", { distinctUrls: get.urls().length });

  if (unimplemented.length) {
    // Loud, not silent. Zero results here means "not built", not "no draws".
    ctx.warnings.push(`no parser implemented: ${unimplemented.join("; ")}`);
    log.warn("parsers.unimplemented", {
      games: unimplemented,
      note: "INCONCLUSIVE — not a statement that there were no draws",
    });
    if (written === 0) throw new NotImplementedError(unimplemented.join("; "));
  }
  if (attempted > 0 && succeeded === 0) throw new NoGameAnsweredError(failures);

  return { recordsWritten: written };
}
