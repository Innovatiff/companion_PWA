/**
 * Forecast ingest — MULTI-SOURCE, every 6h, all four countries.
 *
 * All three providers are stored. The UI shows the MEDIAN temperature and the
 * precipitation CONSENSUS, and a RANGE where they disagree materially
 * (forecast_consensus view). A provider that fails is recorded as absent, not
 * as agreement.
 */
import { query } from "../db.mjs";
import { fetchText } from "../run-feed.mjs";

const DAYS = 3;

const PROVIDERS = [
  {
    name: "open-meteo",
    needsKey: null,
    url: (m) => `https://api.open-meteo.com/v1/forecast?latitude=${m.lat}&longitude=${m.lng}` +
      `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum` +
      `&forecast_days=${DAYS}&timezone=auto`,
    parse: (j) => (j.daily?.time ?? []).map((d, i) => ({
      date: d,
      tempMax: j.daily.temperature_2m_max?.[i],
      tempMin: j.daily.temperature_2m_min?.[i],
      precipProb: j.daily.precipitation_probability_max?.[i],
      precipMm: j.daily.precipitation_sum?.[i],
    })),
  },
  {
    name: "openweather",
    needsKey: "OPENWEATHER_KEY",
    url: (m, key) => `https://api.openweathermap.org/data/2.5/forecast/daily?lat=${m.lat}&lon=${m.lng}` +
      `&cnt=${DAYS}&units=metric&appid=${key}`,
    parse: (j) => (j.list ?? []).map((d) => ({
      date: new Date(d.dt * 1000).toISOString().slice(0, 10),
      tempMax: d.temp?.max, tempMin: d.temp?.min,
      precipProb: d.pop != null ? d.pop * 100 : null, precipMm: d.rain ?? null,
    })),
  },
  {
    name: "weatherapi",
    needsKey: "WEATHERAPI_KEY",
    url: (m, key) => `https://api.weatherapi.com/v1/forecast.json?key=${key}&q=${m.lat},${m.lng}&days=${DAYS}`,
    parse: (j) => (j.forecast?.forecastday ?? []).map((d) => ({
      date: d.date,
      tempMax: d.day?.maxtemp_c, tempMin: d.day?.mintemp_c,
      precipProb: d.day?.daily_chance_of_rain, precipMm: d.day?.totalprecip_mm,
    })),
  },
];

/** Only municipalities someone actually reads: homes plus watched towns. */
async function targetMunicipalities() {
  const { rows } = await query(
    `select distinct m.id, m.lat, m.lng, m.name, m.country
       from municipalities m
      where m.id in (select municipality_id from clients where active and municipality_id is not null)
         or m.id in (select municipality_id from client_watch_locations)
      order by m.id`);
  return rows;
}

export async function ingestForecast(ctx) {
  const { log } = ctx;
  const targets = await targetMunicipalities();
  if (!targets.length) {
    // Nothing to forecast is not a forecast that worked: no provider was
    // contacted. Partial keeps that visible, and it clears by itself once an
    // active client has a municipality to forecast.
    ctx.warnings.push("no client municipalities to forecast; no provider was contacted");
    log.warn("no_targets", { note: "no client municipalities yet" });
    return { recordsWritten: 0 };
  }

  const active = PROVIDERS.filter((p) => !p.needsKey || process.env[p.needsKey]);
  const skipped = PROVIDERS.filter((p) => p.needsKey && !process.env[p.needsKey]).map((p) => p.name);
  if (skipped.length) {
    // Fewer than three providers means there is no median, only a disagreement.
    ctx.warnings.push(`providers skipped (no key): ${skipped.join(", ")}`);
    log.warn("providers.skipped", { skipped, note: "median needs three sources" });
  }

  let written = 0, providerFailures = 0;

  for (const m of targets) {
    for (const p of active) {
      try {
        const key = p.needsKey ? process.env[p.needsKey] : null;
        const { body } = await fetchText(p.url(m, key), { timeoutMs: 20_000 });
        const days = p.parse(JSON.parse(body));
        for (const d of days) {
          if (!d.date) continue;
          await query(
            `insert into forecasts (municipality_id, provider, target_date,
                                    temp_min_c, temp_max_c, precip_prob, precip_mm)
             values ($1,$2::forecast_provider,$3,$4,$5,$6,$7)
             on conflict (municipality_id, provider, target_date) do update
               set temp_min_c = excluded.temp_min_c, temp_max_c = excluded.temp_max_c,
                   precip_prob = excluded.precip_prob, precip_mm = excluded.precip_mm,
                   fetched_at = now()`,
            [m.id, p.name, d.date, d.tempMin ?? null, d.tempMax ?? null,
             d.precipProb ?? null, d.precipMm ?? null]);
          written++;
        }
      } catch (err) {
        providerFailures++;
        ctx.warnings.push(`${p.name} @ ${m.name}: ${err.message}`);
      }
    }
  }

  if (written === 0 && providerFailures > 0) {
    const e = new Error(`every provider failed across ${targets.length} municipalities`);
    e.inconclusive = true;
    throw e;
  }

  log.info("stored", { municipalities: targets.length, providers: active.map((p) => p.name), written, providerFailures });
  return { recordsWritten: written };
}
