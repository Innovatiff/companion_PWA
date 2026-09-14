/**
 * Hourly outlook ("Hora por hora") — MULTI-SOURCE, every 2 hours.
 *
 * For the local places (Leamington, Windsor) while any client is active. Each
 * provider's hours are stored as that provider gave them; app.hourly_outlook
 * shows an hour only where two or more providers gave it, the median where they
 * agree (0044). OpenWeather's free forecast has 3-hour steps and no UV index:
 * each step is stored at its own hour and UV is left empty, never filled in.
 *
 * Only the next 30 hours are kept, and a place's hours older than 6 hours are
 * deleted. A provider that fails keeps its earlier rows, which age out of the
 * outlook after 5 hours: they are never refreshed as if it had answered.
 */
import { query } from "../db.mjs";
import { fetchText } from "../run-feed.mjs";
import {
  conditionFromWmo, conditionFromWeatherApi, conditionFromOpenWeather, HOURLY_OPENWEATHER_MAX_PLACES,
} from "./current.mjs";

const HOUR_MS = 3_600_000;
export const KEEP_AHEAD_HOURS = 30;
export const KEEP_PAST_HOURS = 6;

/** A finite number, or null. A missing reading is never zero. */
const num = (x) => (typeof x === "number" && Number.isFinite(x) ? x : null);
const bool01 = (x) => (x === 1 ? true : x === 0 ? false : null);
const percent = (x) => { const n = num(x); return n === null || n < 0 || n > 100 ? null : n; };
const nonNegative = (x) => { const n = num(x); return n === null || n < 0 ? null : n; };

/** One provider hour, or null when it has no hour on the hour or no temperature. */
function hourRow(r) {
  if (!(r.hourStart instanceof Date) || Number.isNaN(r.hourStart.getTime()) || r.hourStart.getTime() % HOUR_MS !== 0) return null;
  if (r.tempC === null) return null;
  return r;
}

/** Throws when nothing usable came back: that provider did not answer for this place. */
function hours(rows) {
  const out = rows.map(hourRow).filter(Boolean);
  if (!out.length) throw new Error("no hours in the response");
  return out;
}

export function parseHourlyOpenMeteo(j) {
  const h = j?.hourly ?? {};
  const times = Array.isArray(h.time) ? h.time : [];
  // hourly.time is UTC without a zone (timezone=UTC).
  return hours(times.map((t, i) => ({
    hourStart: typeof t === "string" ? new Date(`${t}Z`) : null,
    tempC: num(h.temperature_2m?.[i]), feelsLikeC: num(h.apparent_temperature?.[i]),
    precipProb: percent(h.precipitation_probability?.[i]), uvIndex: nonNegative(h.uv_index?.[i]),
    condition: conditionFromWmo(h.weather_code?.[i]), isDay: bool01(h.is_day?.[i]),
  })));
}

export function parseHourlyWeatherApi(j) {
  const all = (j?.forecast?.forecastday ?? []).flatMap((d) => (Array.isArray(d?.hour) ? d.hour : []));
  return hours(all.map((x) => ({
    hourStart: typeof x?.time_epoch === "number" ? new Date(x.time_epoch * 1000) : null,
    tempC: num(x?.temp_c), feelsLikeC: num(x?.feelslike_c),
    precipProb: percent(x?.chance_of_rain), uvIndex: nonNegative(x?.uv),
    condition: conditionFromWeatherApi(x?.condition?.code), isDay: bool01(x?.is_day),
  })));
}

/** 3-hour steps, each at its own hour. pop is 0-1; there is no UV index. */
export function parseHourlyOpenWeather(j) {
  return hours((j?.list ?? []).map((s) => {
    const pop = num(s?.pop);
    return {
      hourStart: typeof s?.dt === "number" ? new Date(s.dt * 1000) : null,
      tempC: num(s?.main?.temp), feelsLikeC: num(s?.main?.feels_like),
      precipProb: pop === null || pop < 0 || pop > 1 ? null : Math.round(pop * 100),
      uvIndex: null,
      condition: conditionFromOpenWeather(s?.weather?.[0]?.id),
      isDay: s?.sys?.pod === "d" ? true : s?.sys?.pod === "n" ? false : null,
    };
  }));
}

/** The hours worth keeping: from the start of the current hour to 30 hours ahead. */
export function withinWindow(rows, now) {
  const from = Math.floor(now.getTime() / HOUR_MS) * HOUR_MS;
  const to = now.getTime() + KEEP_AHEAD_HOURS * HOUR_MS;
  return rows.filter((r) => r.hourStart.getTime() >= from && r.hourStart.getTime() <= to);
}

const PROVIDERS = [
  {
    name: "open-meteo",
    needsKey: null,
    url: (m) => `https://api.open-meteo.com/v1/forecast?latitude=${m.lat}&longitude=${m.lng}` +
      `&hourly=temperature_2m,apparent_temperature,precipitation_probability,uv_index,weather_code,is_day` +
      `&forecast_days=2&timezone=UTC`,
    parse: parseHourlyOpenMeteo,
  },
  {
    name: "openweather",
    needsKey: "OPENWEATHER_KEY",
    // 11 steps of 3 hours cover the 30 hours kept; the call counts the same.
    url: (m, key) => `https://api.openweathermap.org/data/2.5/forecast?lat=${m.lat}&lon=${m.lng}` +
      `&units=metric&cnt=11&appid=${key}`,
    parse: parseHourlyOpenWeather,
  },
  {
    name: "weatherapi",
    needsKey: "WEATHERAPI_KEY",
    url: (m, key) => `https://api.weatherapi.com/v1/forecast.json?key=${key}&q=${m.lat},${m.lng}&days=2&aqi=no&alerts=no`,
    parse: parseHourlyWeatherApi,
  },
];

/** Active local places, only while any client is active. Shared with the air feed. */
export async function localPlaceTargets() {
  const { rows } = await query(
    `select lp.id, lp.key, lp.name, lp.lat, lp.lng from local_places lp
      where lp.active and exists (select 1 from clients where active)
      order by lp.sort, lp.id`);
  return rows;
}

export async function ingestHourly(ctx, { now = new Date() } = {}) {
  const { log } = ctx;
  const targets = await localPlaceTargets();
  if (!targets.length) {
    ctx.warnings.push("no active clients for the hourly outlook; no provider was contacted");
    log.warn("no_targets", { note: "no active clients yet" });
    return { recordsWritten: 0 };
  }

  const skipped = PROVIDERS.filter((p) => p.needsKey && !process.env[p.needsKey]).map((p) => p.name);
  if (skipped.length) {
    ctx.warnings.push(`providers skipped (no key): ${skipped.join(", ")}`);
    log.warn("providers.skipped", { skipped });
  }
  const openWeatherAllowed = targets.length <= HOURLY_OPENWEATHER_MAX_PLACES;
  if (!openWeatherAllowed && !skipped.includes("openweather")) {
    ctx.warnings.push(`openweather skipped: ${targets.length} local places exceed ${HOURLY_OPENWEATHER_MAX_PLACES} (free quota of 1,000 calls a day)`);
  }
  const active = PROVIDERS.filter((p) => (!p.needsKey || process.env[p.needsKey]) && (p.name !== "openweather" || openWeatherAllowed));

  let written = 0, providerFailures = 0;

  for (const m of targets) {
    await query(`delete from local_hourly where place_id = $1 and hour_start < $2`,
      [m.id, new Date(now.getTime() - KEEP_PAST_HOURS * HOUR_MS)]);
    for (const p of active) {
      try {
        const key = p.needsKey ? process.env[p.needsKey] : null;
        const { body } = await fetchText(p.url(m, key), { timeoutMs: 20_000 });
        const rows = withinWindow(p.parse(JSON.parse(body)), now);
        if (!rows.length) throw new Error(`no hours in the next ${KEEP_AHEAD_HOURS} hours`);
        await query(
          `insert into local_hourly (place_id, provider, hour_start, temp_c, feels_like_c, precip_prob,
                                     uv_index, condition, is_day)
           select $1, $2::forecast_provider, r.hour_start, r.temp_c, r.feels_like_c, r.precip_prob,
                  r.uv_index, r.condition, r.is_day
             from jsonb_to_recordset($3::jsonb) as r(hour_start timestamptz, temp_c numeric, feels_like_c numeric,
                                                    precip_prob numeric, uv_index numeric, condition text, is_day boolean)
           on conflict (place_id, provider, hour_start) do update
             set temp_c = excluded.temp_c, feels_like_c = excluded.feels_like_c,
                 precip_prob = excluded.precip_prob, uv_index = excluded.uv_index,
                 condition = excluded.condition, is_day = excluded.is_day, fetched_at = now()`,
          [m.id, p.name, JSON.stringify(rows.map((r) => ({
            hour_start: r.hourStart.toISOString(), temp_c: r.tempC, feels_like_c: r.feelsLikeC,
            precip_prob: r.precipProb, uv_index: r.uvIndex, condition: r.condition, is_day: r.isDay })))]);
        written += rows.length;
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
