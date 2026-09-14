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
    // The free plan's 5-day, 3-hour forecast. The daily endpoint needs a paid
    // plan and answers HTTP 401, which read as a rejected key.
    url: (m, key) => `https://api.openweathermap.org/data/2.5/forecast?lat=${m.lat}&lon=${m.lng}` +
      `&units=metric&appid=${key}`,
    parse: (j) => openWeatherDays(j),
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

/**
 * OpenWeather's 3-hour steps as the place's own calendar days, today and the
 * next DAYS-1. A day is reported only when its steps reach from the early
 * morning low (a step at or before 06:00) to the afternoon high (one at or
 * after 15:00): later in the day the remaining steps would pass the evening
 * off as the day's high, so the row from an earlier run stands instead.
 * Exported for tests.
 */
export function openWeatherDays(j, now = Date.now()) {
  const offsetMs = (Number(j?.city?.timezone) || 0) * 1000;
  const localIso = (ms) => new Date(ms + offsetMs).toISOString();
  const today = localIso(now).slice(0, 10);
  const last = new Date(Date.parse(`${today}T00:00:00Z`) + (DAYS - 1) * 86_400_000).toISOString().slice(0, 10);
  const days = new Map();
  for (const step of j?.list ?? []) {
    const hi = step.main?.temp_max ?? step.main?.temp, lo = step.main?.temp_min ?? step.main?.temp;
    if (typeof step.dt !== "number" || typeof hi !== "number" || typeof lo !== "number") continue;
    const iso = localIso(step.dt * 1000);
    const date = iso.slice(0, 10), hour = Number(iso.slice(11, 13));
    if (date < today || date > last) continue;
    let d = days.get(date);
    if (!d) days.set(date, d = { date, first: hour, lastHour: hour, max: hi, min: lo, pop: 0, mm: 0 });
    d.first = Math.min(d.first, hour);
    d.lastHour = Math.max(d.lastHour, hour);
    d.max = Math.max(d.max, hi);
    d.min = Math.min(d.min, lo);
    d.pop = Math.max(d.pop, step.pop ?? 0);
    d.mm += step.rain?.["3h"] ?? 0;
  }
  return [...days.values()]
    .filter((d) => d.first <= 6 && d.lastHour >= 15)
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((d) => ({ date: d.date, tempMax: d.max, tempMin: d.min,
                   precipProb: Math.round(d.pop * 100), precipMm: Math.round(d.mm * 100) / 100 }));
}

/**
 * Only places someone actually reads: clients' homes and watched towns, plus
 * the local places where clients work (Leamington, Windsor; 0036). Shared with
 * the current-conditions feed.
 */
export async function targetMunicipalities() {
  const { rows } = await query(
    `select distinct m.id, m.lat, m.lng, m.name, m.country::text, 'municipality' as kind
       from municipalities m
      where m.id in (select municipality_id from clients where active and municipality_id is not null)
         or m.id in (select municipality_id from client_watch_locations)
     union all
     select lp.id, lp.lat, lp.lng, lp.name, 'CA', 'local' from local_places lp
      where lp.active and exists (select 1 from clients where active)
      order by kind, id`);
  return rows;
}

const FORECAST_TABLE = { municipality: ["forecasts", "municipality_id"], local: ["local_forecasts", "place_id"] };

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
        const [table, keyColumn] = FORECAST_TABLE[m.kind] ?? FORECAST_TABLE.municipality;
        for (const d of days) {
          if (!d.date) continue;
          await query(
            `insert into ${table} (${keyColumn}, provider, target_date,
                                    temp_min_c, temp_max_c, precip_prob, precip_mm)
             values ($1,$2::forecast_provider,$3,$4,$5,$6,$7)
             on conflict (${keyColumn}, provider, target_date) do update
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
