/**
 * Air quality ("Calidad del aire") — two providers, every hour.
 *
 * A separate hourly feed rather than part of the 2-hourly "hourly" run:
 * app.air_quality shows air only from providers observed within 2 hours and
 * within 30 minutes of each other (0044). On a 2-hour cadence the stored
 * observations would pass 2 hours old before the next run lands, leaving a gap
 * every cycle; hourly keeps them fresh. Neither provider is OpenWeather, so the
 * shared OpenWeather quota is untouched (48 Open-Meteo and 48 WeatherAPI calls
 * a day for two places).
 *
 * WeatherAPI's "us-epa-index" is a 1-6 band, not an AQI. Its PM2.5 is stored as
 * given and its AQI is computed from that PM2.5 with the EPA breakpoints.
 * Open-Meteo gives a US AQI directly. A provider that fails keeps its earlier
 * row, which ages out after 2 hours.
 */
import { query } from "../db.mjs";
import { fetchText } from "../run-feed.mjs";
import { localPlaceTargets } from "./hourly.mjs";

const num = (x) => (typeof x === "number" && Number.isFinite(x) ? x : null);

/**
 * EPA PM2.5 breakpoints (µg/m³, 24-hour; revised 2024) to AQI. The
 * concentration is truncated to one decimal, then
 *   AQI = (I_hi - I_lo) / (C_hi - C_lo) x (C - C_lo) + I_lo, rounded.
 */
export const PM25_BREAKPOINTS = [
  [0.0, 9.0, 0, 50],
  [9.1, 35.4, 51, 100],
  [35.5, 55.4, 101, 150],
  [55.5, 125.4, 151, 200],
  [125.5, 225.4, 201, 300],
  [225.5, 325.4, 301, 500],
];

/** US AQI from PM2.5, or null for no reading. Above 325.4 µg/m³ the scale ends at 500. */
export function aqiFromPm25(pm) {
  const c0 = num(pm);
  if (c0 === null || c0 < 0) return null;
  const c = Math.floor(c0 * 10 + 1e-9) / 10;
  for (const [cLo, cHi, iLo, iHi] of PM25_BREAKPOINTS) {
    if (c <= cHi) return Math.round(((iHi - iLo) / (cHi - cLo)) * (c - cLo) + iLo);
  }
  return 500;
}

function airReading(r) {
  if (!(r.observedAt instanceof Date) || Number.isNaN(r.observedAt.getTime())) throw new Error("no observation time in the response");
  if (r.usAqi === null) throw new Error("no air quality in the response");
  return r;
}

export function parseAirOpenMeteo(j) {
  const c = j?.current ?? {};
  const aqi = num(c.us_aqi), pm = num(c.pm2_5);
  // current.time is UTC without a zone (timezone=UTC), at the start of the hour.
  return airReading({
    observedAt: typeof c.time === "string" ? new Date(`${c.time}Z`) : null,
    usAqi: aqi === null || aqi < 0 ? null : Math.round(aqi),
    pm25: pm === null || pm < 0 ? null : pm,
  });
}

export function parseAirWeatherApi(j) {
  const c = j?.current ?? {};
  const pm = num(c.air_quality?.pm2_5);
  return airReading({
    observedAt: typeof c.last_updated_epoch === "number" ? new Date(c.last_updated_epoch * 1000) : null,
    usAqi: aqiFromPm25(pm),
    pm25: pm === null || pm < 0 ? null : pm,
  });
}

const PROVIDERS = [
  {
    name: "open-meteo",
    needsKey: null,
    url: (m) => `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${m.lat}&longitude=${m.lng}` +
      `&current=us_aqi,pm2_5&timezone=UTC`,
    parse: parseAirOpenMeteo,
  },
  {
    name: "weatherapi",
    needsKey: "WEATHERAPI_KEY",
    url: (m, key) => `https://api.weatherapi.com/v1/current.json?key=${key}&q=${m.lat},${m.lng}&aqi=yes`,
    parse: parseAirWeatherApi,
  },
];

export async function ingestAir(ctx) {
  const { log } = ctx;
  const targets = await localPlaceTargets();
  if (!targets.length) {
    ctx.warnings.push("no active clients for air quality; no provider was contacted");
    log.warn("no_targets", { note: "no active clients yet" });
    return { recordsWritten: 0 };
  }

  const skipped = PROVIDERS.filter((p) => p.needsKey && !process.env[p.needsKey]).map((p) => p.name);
  if (skipped.length) {
    // With one provider left, no place reaches the two air quality needs.
    ctx.warnings.push(`providers skipped (no key): ${skipped.join(", ")}`);
    log.warn("providers.skipped", { skipped });
  }
  const active = PROVIDERS.filter((p) => !p.needsKey || process.env[p.needsKey]);

  let written = 0, providerFailures = 0;
  for (const m of targets) {
    for (const p of active) {
      try {
        const key = p.needsKey ? process.env[p.needsKey] : null;
        const { body } = await fetchText(p.url(m, key), { timeoutMs: 20_000 });
        const r = p.parse(JSON.parse(body));
        await query(
          `insert into local_air_quality (place_id, provider, observed_at, us_aqi, pm2_5)
           values ($1, $2::forecast_provider, $3, $4, $5)
           on conflict (place_id, provider) do update
             set observed_at = excluded.observed_at, us_aqi = excluded.us_aqi,
                 pm2_5 = excluded.pm2_5, fetched_at = now()`,
          [m.id, p.name, r.observedAt, r.usAqi, r.pm25]);
        written++;
      } catch (err) {
        providerFailures++;
        ctx.warnings.push(`${p.name} @ ${m.name}: ${err.message}`);
      }
    }
  }

  if (written === 0 && providerFailures > 0) {
    const e = new Error(`every provider failed across ${targets.length} local places`);
    e.inconclusive = true;
    throw e;
  }

  log.info("stored", { places: targets.length, providers: active.map((p) => p.name), written, providerFailures });
  return { recordsWritten: written };
}
