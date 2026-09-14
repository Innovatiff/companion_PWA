/**
 * Round 4, "Tu día de trabajo" (0044): the hours ahead, sun and heat, air
 * quality and the working day in icons for Leamington, plus the clock change
 * and daylight (astronomy and timezone rules, computed, not forecast).
 *
 * Every number comes from two or more providers under 0044's rules. An hour
 * without a temperature (the providers disagreed) keeps its sky and rain but
 * gets no point; a missing flag is not a finding, so nothing here ever says
 * the day is fine; heat shows only from "caution" up; air that the providers
 * place more than one category apart is shown as a range with no needle.
 */
import type { CSSProperties } from "react";
import { formatTime12, formatWeekdayDate, localDate, type Lang } from "@leamington/shared/src/format.ts";
import { t } from "./t";
import { nowArt } from "./now";
import { smooth } from "./money";
import { Art, LEAMINGTON, daylightMinutes, localDayEnd, nextOffsetChange, offsetMinutes, sunTimes, type ArtName } from "./ui";

export type Hour = {
  hour_start: string; hour: string; local_hour: number; temp_c?: number; rain_prob?: number;
  condition?: string; label?: string; is_day?: boolean;
};
export type Hourly = {
  place: string; key: string; timezone: string; hours: Hour[]; rain_hours: string[];
  max_temp: number | null; min_temp: number | null; valid_until: string;
};
export type SunHeat = {
  date: string; uv_max?: number; uv_level?: string; uv_label?: string; uv_peak_hour?: string;
  feels_max?: number; heat_level?: string; heat_label?: string; valid_until: string;
};
export type Air =
  | { range: false; us_aqi: number; pm2_5?: number; level: string; label: string; providers: number; observed_at: string; valid_until: string }
  | { range: true; aqi_min: number; aqi_max: number; level_min: string; level_max: string; label_min: string; label_max: string;
      providers: number; observed_at: string; valid_until: string };
export type Workday = {
  day: "today" | "tomorrow"; date: string; morning_temp?: number; high?: number; rain_hours?: string[];
  uv_max?: number; uv_level?: string; uv_label?: string; feels_max?: number; heat_level?: string; heat_label?: string;
  flags: string[]; valid_until: string;
};

const hourArt = (h: Hour) => nowArt({ condition: h.condition, is_day: h.is_day });
export const HEAT_SHOWN = ["caution", "high", "extreme"];

// ---------------------------------------------------------------------------
// Por horas
// ---------------------------------------------------------------------------
/**
 * One column per hour: the temperature dot and label (only where temp_c
 * exists), the sky, a thin rain bar (only where rain_prob exists, highlighted
 * for rain hours) and the hour. The line joins consecutive hours that both have
 * a temperature; a gap stays a gap.
 */
export function HourlyChart({ h, lang }: { h: Hourly; lang: Lang }) {
  const hours = h.hours;
  const n = hours.length;
  const temps = hours.map((x) => x.temp_c).filter((v): v is number => v != null);
  const lo = Math.min(...temps), hi = Math.max(...temps);
  const span = Math.max(1, hi - lo);
  // Percent from the top of the plot: labels need room above the highest dot.
  const top = (v: number) => 34 + (1 - (v - lo) / span) * 54;
  const runs: [number, number][][] = [];
  hours.forEach((x, i) => {
    if (x.temp_c == null) return;
    const pt: [number, number] = [i * 40 + 20, top(x.temp_c)];
    const last = runs.at(-1);
    if (last && hours[i - 1]?.temp_c != null) last.push(pt); else runs.push([pt]);
  });
  const d = runs.filter((r) => r.length > 1).map((r) => smooth(r)).join("");
  return (
    <div className="hscroll">
      <div className="hgrid" style={{ "--n": n } as CSSProperties}>
        {d && (
          <svg className="hsvg" viewBox={`0 0 ${n * 40} 100`} preserveAspectRatio="none" aria-hidden="true">
            <path className="hl2" d={d} pathLength={1} />
          </svg>
        )}
        {hours.map((x) => (
          <div key={x.hour_start} className={h.rain_hours.includes(x.hour) ? "hc rh" : "hc"} data-h={x.hour_start} data-rain={x.rain_prob}>
            <span className="hp">
              {x.temp_c != null && (
                <>
                  <i className="hd" style={{ top: `${top(x.temp_c).toFixed(1)}%` }} />
                  <b className="hv" style={{ top: `${top(x.temp_c).toFixed(1)}%` }}>{`${x.temp_c}°`}</b>
                </>
              )}
            </span>
            <Art name={hourArt(x)} size={28} lazy />
            <span className="rb">{x.rain_prob != null && <i style={{ height: `${x.rain_prob}%` }} />}</span>
            <small className="rp2">{x.rain_prob != null ? `${x.rain_prob}%` : ""}</small>
            <small className="hh">{x.hour}</small>
            <span className="sr">{[x.label, x.rain_prob != null ? t(lang, `lluvia ${x.rain_prob}%`, `rain ${x.rain_prob}%`) : null].filter(Boolean).join(", ")}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Home: the next hours in Leamington as a scrollable strip, to the detail page. */
export function HoursStrip({ h }: { h: Hourly }) {
  return (
    <a className="hstrip" href="/clima/aqui">
      {h.hours.map((x) => (
        <span key={x.hour_start} className="hs" data-h={x.hour_start}>
          <small>{x.hour}</small>
          <Art name={hourArt(x)} size={34} lazy />
          {x.temp_c != null && <b>{`${x.temp_c}°`}</b>}
          {x.rain_prob != null && <small className="hsr">{`${x.rain_prob}%`}</small>}
        </span>
      ))}
    </a>
  );
}

// ---------------------------------------------------------------------------
// Gauges: a semicircle of equal category bands, the standard colours
// ---------------------------------------------------------------------------
const pt = (deg: number, r = 80) => `${(100 + r * Math.cos((deg * Math.PI) / 180)).toFixed(1)},${(100 - r * Math.sin((deg * Math.PI) / 180)).toFixed(1)}`;
const arc = (from: number, to: number) => `M${pt(from)}A80 80 0 0 1 ${pt(to)}`;

function Gauge({ colors, at, range }: { colors: string[]; at?: number; range?: [number, number] }) {
  const k = colors.length;
  const deg = (step: number) => 180 - (step * 180) / k;
  return (
    <svg className="gauge" viewBox="0 0 200 112" aria-hidden="true">
      {range && <path className="rg2" d={arc(deg(range[0]) + 1, deg(range[1] + 1) - 1)} />}
      {colors.map((c, i) => <path key={c} d={arc(deg(i) - 1, deg(i + 1) + 1)} fill="none" stroke={c} strokeWidth="18" />)}
      {at != null && (
        <g className="ndl" style={{ "--a": `${((at * 180) / k).toFixed(1)}deg` } as CSSProperties}>
          <path className="nd" d="M100 100H32" />
          <circle className="hub" cx="100" cy="100" r="8" />
        </g>
      )}
    </svg>
  );
}

// WHO UV index bands and EPA AQI categories, and where a value sits within its band.
const UV_COLORS = ["#289500", "#f7e400", "#f85900", "#d8001d", "#6b49c8"];
const UV_BANDS: [number, number][] = [[0, 2], [3, 5], [6, 7], [8, 10], [11, 15]];
const AQI_COLORS = ["#00e400", "#ffff00", "#ff7e00", "#ff0000", "#8f3f97", "#7e0023"];
const AQI_BANDS: [number, number][] = [[0, 50], [51, 100], [101, 150], [151, 200], [201, 300], [301, 500]];
const AQI_STEPS = ["good", "moderate", "sensitive", "unhealthy", "very_unhealthy", "hazardous"];
function position(bands: [number, number][], v: number): number {
  const i = Math.max(0, bands.findIndex(([a, b]) => v >= a && v <= b) === -1 ? bands.length - 1 : bands.findIndex(([a, b]) => v >= a && v <= b));
  const [a, b] = bands[i];
  return i + Math.min(0.95, Math.max(0.05, (v - a + 0.5) / (b - a + 1)));
}

/** Sol y calor: the UV gauge with its peak hour, and heat only from "caution" up. */
export function SunHeatCard({ s, lang }: { s: SunHeat; lang: Lang }) {
  const heat = s.heat_level != null && HEAT_SHOWN.includes(s.heat_level) && s.feels_max != null;
  if (s.uv_max == null && !heat) return null;
  return (
    <section className="card uvc" data-line="sun" data-until={s.valid_until}>
      <div className="ch"><Art name="sun" size={44} lazy /><h2>{t(lang, "Sol y calor", "Sun and heat")}</h2></div>
      {s.uv_max != null && s.uv_level && (
        <div className="gw" data-uv={s.uv_max} data-level={s.uv_level}>
          <Gauge colors={UV_COLORS} at={position(UV_BANDS, s.uv_max)} />
          <p className="gv"><b>{s.uv_max}</b><span>UV</span></p>
          <p className="gl">{s.uv_label}</p>
          {s.uv_peak_hour && <small>{t(lang, `Máximo a las ${s.uv_peak_hour}`, `Highest at ${s.uv_peak_hour}`)}</small>}
        </div>
      )}
      {heat && (
        <p className="heat" data-level={s.heat_level}>
          <Art name="water" size={44} lazy />
          <span><b>{t(lang, `Se siente como ${s.feels_max}°`, `Feels like ${s.feels_max}°`)}</b><span className="chip">{s.heat_label}</span></span>
        </p>
      )}
    </section>
  );
}

/** Aire: the AQI gauge with the category and PM2.5; far-apart providers show a range and no needle. */
export function AirCard({ a, lang, tz }: { a: Air; lang: Lang; tz: string }) {
  return (
    <section className="card airc" data-line="air" data-until={a.valid_until}>
      <div className="ch"><Art name="leaf" size={44} lazy /><h2>{t(lang, "Aire", "Air")}</h2></div>
      {a.range ? (
        <div className="gw" data-range={`${a.aqi_min}-${a.aqi_max}`}>
          <Gauge colors={AQI_COLORS} range={[AQI_STEPS.indexOf(a.level_min), AQI_STEPS.indexOf(a.level_max)]} />
          <p className="gv"><b>{`${a.aqi_min}–${a.aqi_max}`}</b><span>AQI</span></p>
          <p className="gl">{t(lang, `${a.label_min} a ${a.label_max}`, `${a.label_min} to ${a.label_max}`)}</p>
          <small>{t(lang, `Medido a las ${formatTime12(a.observed_at, tz)}`, `Measured at ${formatTime12(a.observed_at, tz)}`)}</small>
        </div>
      ) : (
        <div className="gw" data-aqi={a.us_aqi} data-level={a.level}>
          <Gauge colors={AQI_COLORS} at={position(AQI_BANDS, a.us_aqi)} />
          <p className="gv"><b>{a.us_aqi}</b><span>AQI</span></p>
          <p className="gl">{a.label}</p>
          <small>{[a.pm2_5 != null ? `PM2.5 ${a.pm2_5}` : null, t(lang, `medido a las ${formatTime12(a.observed_at, tz)}`, `measured at ${formatTime12(a.observed_at, tz)}`)]
            .filter(Boolean).join(" · ")}</small>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Tu día de trabajo (home)
// ---------------------------------------------------------------------------
const FLAG_ART: Record<string, ArtName> = { cold_morning: "jacket", rain: "umbrella", uv_high: "sunscreen", heat: "water" };

/**
 * The working window (6am to 6pm) in Leamington: the morning and high
 * temperatures big, then one tile per flag. No flags: just the numbers. Never a
 * word that the day is fine.
 */
export function WorkdayCard({ w, lang }: { w: Workday; lang: Lang }) {
  const flags = (w.flags ?? []).filter((f) => FLAG_ART[f]);
  if (w.morning_temp == null && w.high == null && flags.length === 0) return null;
  const tile: Record<string, [string, string]> = {
    cold_morning: [t(lang, "Frío temprano", "Cold morning"), `${w.morning_temp}°`],
    rain: [t(lang, "Lluvia", "Rain"), (w.rain_hours ?? []).join(" · ")],
    uv_high: ["UV", `${w.uv_max} · ${w.uv_label ?? ""}`],
    heat: [w.heat_label ?? t(lang, "Calor", "Heat"), t(lang, `Se siente ${w.feels_max}°`, `Feels ${w.feels_max}°`)],
  };
  return (
    <a className="work" href="/clima/aqui" data-line="workday" data-until={w.valid_until} data-day={w.day}>
      <span className="wtop2">
        <span className="lbl">{w.day === "today" ? t(lang, "Tu día de trabajo", "Your workday") : t(lang, "Mañana en el trabajo", "Tomorrow at work")}</span>
        <small>Leamington · 6am–6pm</small>
      </span>
      {(w.morning_temp != null || w.high != null) && (
        <span className="wnum">
          {w.morning_temp != null && <span><small>6–7am</small><b>{`${w.morning_temp}°`}</b></span>}
          {w.high != null && <span><small>{t(lang, "máx", "high")}</small><b>{`${w.high}°`}</b></span>}
        </span>
      )}
      {flags.length > 0 && (
        <span className="wflags">
          {flags.map((f) => (
            <span key={f} className="wf" data-flag={f}><Art name={FLAG_ART[f]} size={44} lazy /><b>{tile[f][0]}</b><small>{tile[f][1]}</small></span>
          ))}
        </span>
      )}
    </a>
  );
}

// ---------------------------------------------------------------------------
// Cambio de hora y luz (computed)
// ---------------------------------------------------------------------------
const hoursText = (n: number, lang: Lang) => (n === 1 ? t(lang, "1 hora", "1 hour") : t(lang, `${n} horas`, `${n} hours`));

/**
 * Within 14 days of Toronto's next UTC offset change (from the timezone rules,
 * never a table): which day, which way, and, when their hometown does not
 * change its clocks, what the difference with it becomes. Valid until the change.
 */
export function DstCard({ at, lang, homeTz, homeName }: { at: Date; lang: Lang; homeTz?: string | null; homeName?: string | null }) {
  const change = nextOffsetChange(LEAMINGTON.timezone, at, 30);
  if (!change || change.at.getTime() - at.getTime() > 14 * 86_400_000) return null;
  const back = change.after < change.before;
  const n = Math.abs(change.after - change.before) / 60;
  const day = formatWeekdayDate(localDate(change.at, LEAMINGTON.timezone), lang);
  let diff: string | null = null;
  if (homeTz && homeName && homeTz !== LEAMINGTON.timezone) {
    const before = offsetMinutes(homeTz, new Date(change.at.getTime() - 3_600_000));
    const after = offsetMinutes(homeTz, new Date(change.at.getTime() + 3_600_000));
    if (before === after) {
      const hrs = Math.abs(after - change.after) / 60;
      diff = hrs === 0 ? t(lang, `Con ${homeName} tendrán la misma hora`, `${homeName} will have the same time`)
        : t(lang, `La diferencia con ${homeName} será de ${hrs} h`, `The difference with ${homeName} will be ${hrs} h`);
    }
  }
  return (
    <section className="card dst" data-line="dst" data-until={change.at.toISOString()}>
      <Art name="clock" size={56} lazy />
      <span>
        <b>{t(lang, `El ${day} la hora se ${back ? "atrasa" : "adelanta"} ${hoursText(n, lang)} en Ontario`,
                    `On ${day} clocks go ${back ? "back" : "forward"} ${hoursText(n, lang)} in Ontario`)}</b>
        {diff && <small>{diff}</small>}
      </span>
    </section>
  );
}

const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Luz del día: today's daylight in Leamington against yesterday's, and tomorrow's sunrise. */
export function Daylight({ at, lang }: { at: Date; lang: Lang }) {
  const { lat, lng, timezone: tz } = LEAMINGTON;
  const today = localDate(at, tz);
  const mins = daylightMinutes(lat, lng, today);
  if (mins == null) return null;
  const prev = daylightMinutes(lat, lng, addDays(today, -1));
  const rise = sunTimes(lat, lng, addDays(today, 1))?.rise;
  const delta = prev == null ? null : mins - prev;
  return (
    <section className="card light" data-line="light" data-until={localDayEnd(at, tz)}>
      <div className="ch"><Art name="sun" size={44} lazy /><h2>{t(lang, "Luz del día", "Daylight")}</h2></div>
      <p className="gv"><b>{`${Math.floor(mins / 60)} h ${mins % 60} min`}</b></p>
      {delta != null && (
        <small>{delta === 0 ? t(lang, "Igual que ayer", "Same as yesterday")
          : t(lang, `${Math.abs(delta)} min ${delta < 0 ? "menos" : "más"} que ayer`, `${Math.abs(delta)} min ${delta < 0 ? "less" : "more"} than yesterday`)}</small>
      )}
      {rise && <p className="rise">{t(lang, "Mañana amanece a las ", "Sunrise tomorrow at ")}<b>{formatTime12(rise, tz)}</b></p>}
    </section>
  );
}
