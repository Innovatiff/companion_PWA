/**
 * FX backfill: fill missing daily reference rates for the rate chart (7, 30 and
 * 90 days), from the same sources as the daily feed (fx.mjs), the same way:
 *
 *   - Frankfurter's time series, one request, for the currencies it quotes;
 *   - the currency dataset's dated files, one per missing day, for the rest,
 *     with its mirror when the CDN does not give the file.
 *
 * Each rate is stored under the date its source says. A day no source published
 * stays missing: nothing is interpolated. Stored rows are never overwritten
 * (the daily feed owns them), so running it twice changes nothing.
 *
 * A day that could not be fetched is reported as no answer, apart from a day the
 * source answered it does not have: silence is not "no rate that day".
 */
import { query } from "../db.mjs";
import { fetchText, describeError } from "../run-feed.mjs";
import {
  CURRENCIES, FRANKFURTER, currencyApiUrl, currencyApiMirrorUrl,
  isRateDate, validRate, parseCurrencyApi, parseFrankfurterSeries,
} from "./fx.mjs";

const DAY = 86_400_000;
const addDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

/** Both the CDN and the mirror, for one dated file. */
async function fetchDated(date, count) {
  const errors = [];
  for (const [source, url] of [["cdn", currencyApiUrl(date)], ["mirror", currencyApiMirrorUrl(date)]]) {
    count[source]++;
    try {
      const parsed = parseCurrencyApi(JSON.parse((await fetchText(url)).body));
      if (!isRateDate(parsed.date)) throw new Error("no rate date in the response");
      return { ok: true, ...parsed };
    } catch (err) {
      errors.push({ source, notFound: err.httpStatus === 404, error: describeError(err) });
    }
  }
  return { ok: false, notPublished: errors.some((e) => e.notFound), errors };
}

async function pool(items, size, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i]); }
  }));
  return out;
}

/**
 * @param {object} o
 * @param {number} o.days     days back from `today`, today included (1..366)
 * @param {boolean} o.dryRun  fetch and report, write nothing
 * @param {string} o.today    YYYY-MM-DD (UTC today by default)
 */
export async function backfillFx({ days = 120, dryRun = false, today = new Date().toISOString().slice(0, 10), log, concurrency = 4 } = {}) {
  if (!Number.isInteger(days) || days < 1 || days > 366) throw new Error(`--days must be a whole number from 1 to 366, got ${days}`);
  if (!isRateDate(today)) throw new Error(`today must be YYYY-MM-DD, got ${today}`);
  const say = log ?? { info() {}, warn() {} };
  const start = addDays(today, -(days - 1));

  const stored = new Set((await query(
    `select quote::text || ' ' || to_char(rate_date, 'YYYY-MM-DD') as k from fx_rates where rate_date between $1 and $2`,
    // A series can start at the business day before `start` (a weekend start).
    [addDays(start, -10), today])).rows.map((r) => r.k));
  const has = (quote, date) => stored.has(`${quote} ${date}`);

  const requests = { frankfurter: 0, cdn: 0, mirror: 0 };
  const candidates = new Map();   // "QUOTE date" -> { quote, date, rate, source }
  const add = (quote, date, rate, source) => {
    const key = `${quote} ${date}`;
    if (rate != null && !has(quote, date) && !candidates.has(key)) candidates.set(key, { quote, date, rate, source });
  };

  // 1. Frankfurter: the currencies it quotes come from it alone, as in the daily feed.
  let frankfurter = { answered: false, quoted: [], days: 0, error: null };
  requests.frankfurter++;
  try {
    const url = `${FRANKFURTER}/${start}..${today}?from=CAD&to=${CURRENCIES.join(",")}`;
    const series = parseFrankfurterSeries(JSON.parse((await fetchText(url)).body));
    const quoted = new Set();
    for (const { date, rates } of series) {
      for (const c of CURRENCIES) {
        const v = validRate(rates[c]);
        if (v != null) { quoted.add(c); add(c, date, v, "frankfurter"); }
      }
    }
    frankfurter = { answered: true, quoted: CURRENCIES.filter((c) => quoted.has(c)), days: series.length, error: null };
  } catch (err) {
    frankfurter.error = describeError(err);
    say.warn("frankfurter.failed", { error: frankfurter.error });
  }

  // 2. The dataset's dated files, only for days a remaining currency is missing.
  const rest = CURRENCIES.filter((c) => !frankfurter.quoted.includes(c));
  const dates = [];
  for (let d = start; d <= today; d = addDays(d, 1)) {
    if (rest.some((c) => !has(c, d))) dates.push(d);
  }
  const results = await pool(dates, concurrency, (d) => fetchDated(d, requests));
  const notPublished = [];
  const noAnswer = [];
  results.forEach((r, i) => {
    if (r.ok) { for (const c of rest) add(c, r.date, validRate(r.rates[c]), "currency-api"); }
    else if (r.notPublished) notPublished.push(dates[i]);
    else noAnswer.push({ date: dates[i], errors: r.errors.map((e) => `${e.source}: ${e.error}`) });
  });

  const rows = [...candidates.values()].sort((a, b) => a.date.localeCompare(b.date) || a.quote.localeCompare(b.quote));
  const summary = {
    range: { start, end: today, days },
    dryRun,
    requests,
    frankfurter,
    datasetDates: { requested: dates.length, answered: results.filter((r) => r.ok).length, notPublished, noAnswer },
    found: rows.length,
    inserted: 0,
    byCurrency: Object.fromEntries(CURRENCIES.map((c) => [c, rows.filter((r) => r.quote === c).length])),
  };

  // Nothing answered at all: INCONCLUSIVE, never "no missing rates".
  if (!frankfurter.answered && dates.length > 0 && noAnswer.length === dates.length) {
    const e = new Error("no FX source answered the backfill");
    e.inconclusive = true;
    e.summary = summary;
    throw e;
  }

  if (!dryRun) {
    for (const r of rows) {
      const { rowCount } = await query(
        `insert into fx_rates (rate_date, base, quote, rate)
         values ($1,'CAD',$2::fx_currency,$3)
         on conflict (rate_date, quote) do nothing`,
        [r.date, r.quote, r.rate]);
      summary.inserted += rowCount;
    }
  }
  say.info("fx.backfill", { found: summary.found, inserted: summary.inserted, requests, noAnswer: noAnswer.length });
  return summary;
}
