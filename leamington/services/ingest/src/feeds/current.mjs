/**
 * Current conditions ("Ahora") — MULTI-SOURCE, every 30 minutes.
 *
 * The same places and the same three providers as the forecast. Each provider's
 * latest observation is stored per place; app.current_summary shows it only
 * while two or more providers observed within 90 minutes, as the median with a
 * range where they disagree. A provider that fails leaves its earlier row to
 * age out: it is never written as a reading it did not give.
 */
import { query } from "../db.mjs";
import { fetchText } from "../run-feed.mjs";
import { targetMunicipalities } from "./forecast.mjs";

/** A finite number, or null. A missing reading is never zero. */
const num = (x) => (typeof x === "number" && Number.isFinite(x) ? x : null);

// WMO weather interpretation codes (Open-Meteo). Mainly clear (1) reads as clear.
const WMO = new Map([
  ...[0, 1].map((c) => [c, "clear"]), [2, "partly_cloudy"], [3, "cloudy"],
  ...[45, 48].map((c) => [c, "fog"]),
  ...[51, 53, 55, 56, 57].map((c) => [c, "drizzle"]),
  ...[61, 63, 65, 66, 67, 80, 81, 82].map((c) => [c, "rain"]),
  ...[71, 73, 75, 77, 85, 86].map((c) => [c, "snow"]),
  ...[95, 96, 99].map((c) => [c, "storm"]),
]);

// WeatherAPI condition codes. Sleet and ice pellets read as snow; any thunder as storm.
const WEATHERAPI = new Map([
  [1000, "clear"], [1003, "partly_cloudy"], [1006, "cloudy"], [1009, "cloudy"],
  ...[1030, 1135, 1147].map((c) => [c, "fog"]),
  ...[1072, 1150, 1153, 1168, 1171].map((c) => [c, "drizzle"]),
  ...[1063, 1180, 1183, 1186, 1189, 1192, 1195, 1198, 1201, 1240, 1243, 1246].map((c) => [c, "rain"]),
  ...[1066, 1069, 1114, 1117, 1204, 1207, 1210, 1213, 1216, 1219, 1222, 1225, 1237,
      1249, 1252, 1255, 1258, 1261, 1264].map((c) => [c, "snow"]),
  ...[1087, 1273, 1276, 1279, 1282].map((c) => [c, "storm"]),
]);

export function conditionFromWmo(code) { return WMO.get(code) ?? null; }
export function conditionFromWeatherApi(code) { return WEATHERAPI.get(code) ?? null; }

/**
 * OpenWeather condition ids by group. Of the 7xx "atmosphere" ids only mist and
 * fog are fog, and squalls and tornadoes storm; smoke, haze, dust and ash have
 * no word in our set, so they give no sky rather than a wrong one.
 */
export function conditionFromOpenWeather(id) {
  if (typeof id !== "number") return null;
  if (id >= 200 && id < 300) return "storm";
  if (id >= 300 && id < 400) return "drizzle";
  if (id >= 500 && id < 600) return "rain";
  if (id >= 600 && id < 700) return "snow";
  if (id === 701 || id === 741) return "fog";
  if (id === 771 || id === 781) return "storm";
  if (id === 800) return "clear";
  if (id === 801 || id === 802) return "partly_cloudy";
  if (id === 803 || id === 804) return "cloudy";
  return null;
}

/** Throws when a response has no usable time or temperature: that provider did not answer for this place. */
function reading(r) {
  if (!(r.observedAt instanceof Date) || Number.isNaN(r.observedAt.getTime())) throw new Error("no observation time in the response");
  if (r.tempC === null) throw new Error("no temperature in the response");
  return r;
}

export function parseOpenMeteo(j) {
  const c = j?.current ?? {};
  // current.time is UTC without a zone (timezone=UTC), at the start of a 15-minute step.
  return reading({
    observedAt: typeof c.time === "string" ? new Date(`${c.time}Z`) : null,
    tempC: num(c.temperature_2m), feelsLikeC: num(c.apparent_temperature),
    humidity: num(c.relative_humidity_2m), windKph: num(c.wind_speed_10m),
    condition: conditionFromWmo(c.weather_code),
    isDay: c.is_day === 1 ? true : c.is_day === 0 ? false : null,
  });
}

export function parseWeatherApi(j) {
  const c = j?.current ?? {};
  return reading({
    observedAt: typeof c.last_updated_epoch === "number" ? new Date(c.last_updated_epoch * 1000) : null,
    tempC: num(c.temp_c), feelsLikeC: num(c.feelslike_c),
    humidity: num(c.humidity), windKph: num(c.wind_kph),
    condition: conditionFromWeatherApi(c.condition?.code),
    isDay: c.is_day === 1 ? true : c.is_day === 0 ? false : null,
  });
}

export function parseOpenWeather(j) {
  const speed = num(j?.wind?.speed);   // metres per second with units=metric
  const { sunrise, sunset } = j?.sys ?? {};
  return reading({
    observedAt: typeof j?.dt === "number" ? new Date(j.dt * 1000) : null,
    tempC: num(j?.main?.temp), feelsLikeC: num(j?.main?.feels_like),
    humidity: num(j?.main?.humidity),
    windKph: speed === null ? null : Math.round(speed * 3.6 * 10) / 10,
    condition: conditionFromOpenWeather(j?.weather?.[0]?.id),
    isDay: typeof sunrise === "number" && typeof sunset === "number" && typeof j?.dt === "number"
      ? j.dt >= sunrise && j.dt < sunset : null,
  });
}

const PROVIDERS = [
  {
    name: "open-meteo",
    needsKey: null,
    url: (m) => `https://api.open-meteo.com/v1/forecast?latitude=${m.lat}&longitude=${m.lng}` +
      `&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,is_day` +
      `&wind_speed_unit=kmh&timezone=UTC`,
    parse: parseOpenMeteo,
  },
  {
    name: "openweather",
    needsKey: "OPENWEATHER_KEY",
    url: (m, key) => `https://api.openweathermap.org/data/2.5/weather?lat=${m.lat}&lon=${m.lng}&units=metric&appid=${key}`,
    parse: parseOpenWeather,
  },
  {
    name: "weatherapi",
    needsKey: "WEATHERAPI_KEY",
    url: (m, key) => `https://api.weatherapi.com/v1/current.json?key=${key}&q=${m.lat},${m.lng}`,
    parse: parseWeatherApi,
  },
];

/**
 * OpenWeather's free plan allows 1,000 calls a day, shared with the forecast
 * feed (4 runs a day per place). Current conditions call it once an hour, on
 * the run that starts in minutes 0-14, and not at all above 30 places:
 * 30 x (24 + 4) = 840 calls. Its hourly row stays inside the 90-minute window
 * between calls. Exported for tests.
 */
export const OPENWEATHER_MAX_TARGETS = 30;

export function openWeatherThisRun(now, targetCount) {
  if (now.getUTCMinutes() >= 15) return { call: false, warning: null };   // the hourly run calls it
  if (targetCount > OPENWEATHER_MAX_TARGETS) {
    return { call: false,
             warning: `openweather skipped: ${targetCount} places exceed ${OPENWEATHER_MAX_TARGETS} (free quota of 1,000 calls a day)` };
  }
  return { call: true, warning: null };
}

const TARGET = { municipality: "municipality_id", local: "place_id" };

export async function ingestCurrent(ctx, { now = new Date() } = {}) {
  const { log } = ctx;
  const targets = await targetMunicipalities();
  if (!targets.length) {
    ctx.warnings.push("no client municipalities for current conditions; no provider was contacted");
    log.warn("no_targets", { note: "no client municipalities yet" });
    return { recordsWritten: 0 };
  }

  const skipped = PROVIDERS.filter((p) => p.needsKey && !process.env[p.needsKey]).map((p) => p.name);
  if (skipped.length) {
    // Fewer providers means fewer places reach the two "now" needs.
    ctx.warnings.push(`providers skipped (no key): ${skipped.join(", ")}`);
    log.warn("providers.skipped", { skipped });
  }
  const ow = openWeatherThisRun(now, targets.length);
  if (ow.warning && !skipped.includes("openweather")) ctx.warnings.push(ow.warning);
  const active = PROVIDERS.filter((p) => (!p.needsKey || process.env[p.needsKey]) && (p.name !== "openweather" || ow.call));

  let written = 0, providerFailures = 0;

  for (const m of targets) {
    const keyColumn = TARGET[m.kind] ?? TARGET.municipality;
    for (const p of active) {
      try {
        const key = p.needsKey ? process.env[p.needsKey] : null;
        const { body } = await fetchText(p.url(m, key), { timeoutMs: 20_000 });
        const r = p.parse(JSON.parse(body));
        await query(
          `insert into current_conditions (${keyColumn}, provider, observed_at, temp_c, feels_like_c,
                                           humidity, wind_kph, condition, is_day)
           values ($1,$2::forecast_provider,$3,$4,$5,$6,$7,$8,$9)
           on conflict (${keyColumn}, provider) where ${keyColumn} is not null do update
             set observed_at = excluded.observed_at, temp_c = excluded.temp_c,
                 feels_like_c = excluded.feels_like_c, humidity = excluded.humidity,
                 wind_kph = excluded.wind_kph, condition = excluded.condition,
                 is_day = excluded.is_day, fetched_at = now()`,
          [m.id, p.name, r.observedAt, r.tempC, r.feelsLikeC, r.humidity, r.windKph, r.condition, r.isDay]);
        written++;
      } catch (err) {
        providerFailures++;
        ctx.warnings.push(`${p.name} @ ${m.name}: ${err.message}`);
      }
    }
  }

  if (written === 0 && providerFailures > 0) {
    const e = new Error(`every provider failed across ${targets.length} places`);
    e.inconclusive = true;
    throw e;
  }

  log.info("stored", { places: targets.length, providers: active.map((p) => p.name), written, providerFailures });
  return { recordsWritten: written };
}
