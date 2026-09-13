/**
 * FX ingest — daily. CAD -> MXN, HNL, GTQ, JMD.
 *
 * Stored daily (not just latest) so the UI can say "más alto en 12 días".
 * Labelled "tasa de referencia" in the UI: never a provider name, never a
 * ranking, never a prediction.
 */
import { query } from "../db.mjs";
import { fetchText } from "../run-feed.mjs";

const CURRENCIES = ["MXN", "HNL", "GTQ", "JMD"];

const PROVIDERS = [
  {
    name: "frankfurter",
    url: `https://api.frankfurter.app/latest?from=CAD&to=${CURRENCIES.join(",")}`,
    parse: (j) => ({ date: j.date, rates: j.rates ?? {} }),
  },
  {
    // Fallback: Frankfurter is ECB-derived and may not quote HNL/GTQ/JMD.
    name: "exchangerate.host",
    url: `https://api.exchangerate.host/latest?base=CAD&symbols=${CURRENCIES.join(",")}`,
    parse: (j) => ({ date: j.date, rates: j.rates ?? {} }),
  },
];

export async function ingestFx(ctx) {
  const { log } = ctx;
  const collected = {};
  let rateDate = null;
  const failures = [];

  for (const p of PROVIDERS) {
    const missing = CURRENCIES.filter((c) => collected[c] == null);
    if (!missing.length) break;

    try {
      const { body } = await fetchText(p.url);
      const { date, rates } = p.parse(JSON.parse(body));
      rateDate = rateDate || date;
      let added = 0;
      for (const c of missing) {
        const v = Number(rates[c]);
        if (Number.isFinite(v) && v > 0) { collected[c] = v; added++; }
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

  const day = rateDate || new Date().toISOString().slice(0, 10);
  let written = 0;
  for (const [quote, rate] of Object.entries(collected)) {
    await query(
      `insert into fx_rates (rate_date, base, quote, rate)
       values ($1,'CAD',$2::fx_currency,$3)
       on conflict (rate_date, quote) do update set rate = excluded.rate, fetched_at = now()`,
      [day, quote, rate],
    );
    written++;
  }
  log.info("stored", { rateDate: day, written, missing });
  return { recordsWritten: written };
}
