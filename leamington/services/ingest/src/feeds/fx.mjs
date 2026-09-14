/**
 * FX ingest — daily. CAD -> MXN, HNL, GTQ, JMD.
 *
 * Stored daily (not just latest) so the UI can say "más alto en 12 días".
 * Labelled "tasa de referencia" in the UI: never a provider name, never a
 * ranking, never a prediction.
 */
import { query } from "../db.mjs";
import { fetchText } from "../run-feed.mjs";

export const CURRENCIES = ["MXN", "HNL", "GTQ", "JMD"];

// Shared with scripts/backfill-fx.mjs (src/feeds/fx-backfill.mjs): the same
// sources, URLs and parsing, so a backfilled day is stored exactly as a daily one.
export const FRANKFURTER = "https://api.frankfurter.app";
/** `tag` is "latest" or a YYYY-MM-DD version of the dataset. */
export const currencyApiUrl = (tag) => `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${tag}/v1/currencies/cad.json`;
export const currencyApiMirrorUrl = (tag) => `https://${tag}.currency-api.pages.dev/v1/currencies/cad.json`;

export const isRateDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d ?? ""));
/** A usable rate, or null. */
export function validRate(value) {
  const v = Number(value);
  return Number.isFinite(v) && v > 0 ? v : null;
}

const PROVIDERS = [
  {
    name: "frankfurter",
    url: `${FRANKFURTER}/latest?from=CAD&to=${CURRENCIES.join(",")}`,
    parse: (j) => ({ date: j.date, rates: j.rates ?? {} }),
  },
  // Frankfurter is ECB-derived and does not quote HNL, GTQ or JMD. The fallback
  // is the open-licensed (CC0) daily currency dataset, with its mirror. No key,
  // no attribution, so the UI still never names a provider. (exchangerate.host
  // now requires a paid key and was removed.)
  {
    name: "currency-api",
    url: currencyApiUrl("latest"),
    parse: parseCurrencyApi,
  },
  {
    name: "currency-api-mirror",
    url: currencyApiMirrorUrl("latest"),
    parse: parseCurrencyApi,
  },
];

export function parseCurrencyApi(j) {
  const rates = {};
  for (const [code, value] of Object.entries(j?.cad ?? {})) rates[code.toUpperCase()] = value;
  return { date: j?.date, rates };
}

/** A Frankfurter time series: one { date, rates } per day the source published. */
export function parseFrankfurterSeries(j) {
  return Object.entries(j?.rates ?? {})
    .filter(([date]) => isRateDate(date))
    .map(([date, rates]) => ({ date, rates: rates ?? {} }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function ingestFx(ctx) {
  const { log } = ctx;
  // Each currency keeps the date its own source published it under: sources
  // publish on different days (the ECB not at weekends).
  const collected = {};
  const failures = [];

  for (const p of PROVIDERS) {
    const missing = CURRENCIES.filter((c) => collected[c] == null);
    if (!missing.length) break;

    try {
      const { body } = await fetchText(p.url);
      const { date, rates } = p.parse(JSON.parse(body));
      if (!isRateDate(date)) throw new Error(`no rate date in the response`);
      let added = 0;
      for (const c of missing) {
        const v = validRate(rates[c]);
        if (v != null) { collected[c] = { rate: v, date }; added++; }
      }
      log.info("provider.ok", { provider: p.name, added, stillMissing: CURRENCIES.filter((c) => collected[c] == null) });
    } catch (err) {
      failures.push(`${p.name}: ${err.message}`);
      log.warn("provider.failed", { provider: p.name, error: err.message });
    }
  }

  const missing = CURRENCIES.filter((c) => collected[c] == null);

  // No provider answered at all -> INCONCLUSIVE. Not "no rates today".
  if (failures.length === PROVIDERS.length) {
    const e = new Error(`no FX provider answered (${failures.join("; ")})`);
    e.inconclusive = true;
    throw e;
  }
  if (missing.length) ctx.warnings.push(`no provider quoted: ${missing.join(", ")}`);

  let written = 0;
  for (const [quote, { rate, date }] of Object.entries(collected)) {
    await query(
      `insert into fx_rates (rate_date, base, quote, rate)
       values ($1,'CAD',$2::fx_currency,$3)
       on conflict (rate_date, quote) do update set rate = excluded.rate, fetched_at = now()`,
      [date, quote, rate],
    );
    written++;
  }
  log.info("stored", { dates: Object.fromEntries(Object.entries(collected).map(([q, v]) => [q, v.date])), written, missing });
  return { recordsWritten: written };
}
