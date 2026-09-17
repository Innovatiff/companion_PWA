/**
 * Round 3, "Tu dinero" (0042): the reference-rate chart, the week of the rate,
 * and the calculator's arithmetic.
 *
 * FX stays descriptive (CLAUDE.md): "tasa de referencia", never a provider, a
 * ranking, a forecast or advice, and no colour that says good or bad. Nothing
 * fills a missing day: one bar, or one line point, per real stored day.
 */
import type { CSSProperties } from "react";
import type { Lang } from "@leamington/shared/src/format.ts";
import { t } from "./t";

export type FxPoint = { date: string; rate: number };
export type WeekPoint = { date: string; rate: number; dir: "up" | "down" | "same" | null };
export type FxHistory = {
  currency: string; days: 7 | 30 | 90; note: string; current: boolean;
  latest: { date: string; rate: number; stale: boolean } | null; valid_until: string | null;
  points: FxPoint[]; high: FxPoint | null; low: FxPoint | null; change_pct: number | null;
  days_up: number | null; days_down: number | null; week: WeekPoint[]; language: Lang;
};
export type Reminder = {
  target: number; currency: string; created_at: string; latest_rate: number | null; latest_date: string | null;
  current: boolean; reached: boolean | null;
};

const MON: Record<Lang, string[]> = {
  es: ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"],
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
};
const WD: Record<Lang, string[]> = {
  es: ["Do", "Lu", "Ma", "Mi", "Ju", "Vi", "Sá"],
  en: ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"],
};

/** "2 sep" / "2 Sep". */
export const shortDate = (date: string, lang: Lang) => `${Number(date.slice(8, 10))} ${MON[lang][Number(date.slice(5, 7)) - 1]}`;
/** "Lu" / "Mo". */
export const weekday = (date: string, lang: Lang) => WD[lang][new Date(`${date.slice(0, 10)}T12:00:00Z`).getUTCDay()];

/** A number with grouping and fixed decimals, e.g. 1,851.00. */
export const num = (n: number, decimals: number, lang: Lang) =>
  new Intl.NumberFormat(lang === "en" ? "en-CA" : "es-MX", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n);
/** A reference rate as shown everywhere in Hoy: two decimals. */
export const rateText = (n: number) => Number(n).toFixed(2);

// ---------------------------------------------------------------------------
// Chart: bars for 7 and 30 days, a smooth line for 90
// ---------------------------------------------------------------------------
const W = 320, TOP = 12, BOT = 118, TICK = 136;
const f1 = (n: number) => n.toFixed(1);

/** Catmull-Rom through the points, as cubic Béziers (one C per step); `whole` rounds to integers to save bytes. */
export function smooth(p: [number, number][], whole = false): string {
  const f1 = whole ? (n: number) => String(Math.round(n)) : (n: number) => n.toFixed(1);
  let d = `M${f1(p[0][0])},${f1(p[0][1])}`;
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] ?? p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] ?? p2;
    d += `C${f1(p1[0] + (p2[0] - p0[0]) / 6)},${f1(p1[1] + (p2[1] - p0[1]) / 6)} ${f1(p2[0] - (p3[0] - p1[0]) / 6)},${f1(p2[1] - (p3[1] - p1[1]) / 6)} ${f1(p2[0])},${f1(p2[1])}`;
  }
  return d;
}

export function RateChart({ h, lang }: { h: FxHistory; lang: Lang }) {
  const pts = h.points;
  if (pts.length === 0) return null;
  const rates = pts.map((p) => Number(p.rate));
  const lo = Math.min(...rates), hi = Math.max(...rates);
  const pad = (hi - lo) * 0.18 || hi * 0.004;
  const y0 = lo - pad, y1 = hi + pad;
  const y = (r: number) => BOT - ((r - y0) / (y1 - y0)) * (BOT - TOP);
  const n = pts.length;
  const label = t(lang, `Tasa de referencia, ${n} días con dato`, `Reference rate, ${n} days with a quote`);
  // Ticks: every day's weekday for a week; otherwise the first, middle and last dates.
  const tickAt = n <= 8 ? pts.map((_, i) => i) : [0, Math.floor((n - 1) / 2), n - 1];

  if (h.days <= 30) {
    const slot = W / n;
    const bw = Math.max(3, Math.min(26, slot * 0.62));
    return (
      <svg className="chart" viewBox={`0 0 ${W} 144`} role="img" aria-label={label} data-kind="bars" data-n={n}>
        <path className="g" d={`M0 ${f1(y(hi))}H${W}M0 ${f1(y(lo))}H${W}`} />
        {pts.map((p, i) => (
          <rect key={p.date} className={i === n - 1 ? "b on" : "b"} data-d={p.date} x={f1(i * slot + (slot - bw) / 2)} y={f1(y(Number(p.rate)))}
                width={f1(bw)} height={f1(BOT - y(Number(p.rate)))} rx="3"
                style={{ animationDelay: `${Math.min(i * 0.03, 0.9).toFixed(2)}s` } as CSSProperties} />
        ))}
        {tickAt.map((i) => (
          <text key={i} className="tk" x={f1(Math.min(W - 14, Math.max(14, i * slot + slot / 2)))} y={TICK} textAnchor="middle">
            {n <= 8 ? weekday(pts[i].date, lang) : shortDate(pts[i].date, lang)}
          </text>
        ))}
      </svg>
    );
  }

  const step = n > 1 ? (W - 16) / (n - 1) : 0;
  const xy = pts.map((p, i) => [8 + i * step, y(Number(p.rate))] as [number, number]);
  const line = n > 1 ? smooth(xy, true) : "";
  const hiI = pts.findIndex((p) => p.date === h.high?.date);
  const loI = pts.findIndex((p) => p.date === h.low?.date);
  return (
    <svg className="chart" viewBox={`0 0 ${W} 144`} role="img" aria-label={label} data-kind="line" data-n={n}>
      {n > 1 && <path className="ar" d={`${line}L${Math.round(xy[n - 1][0])},${BOT}L${Math.round(xy[0][0])},${BOT}Z`} />}
      {n > 1 && <path className="ln" d={line} pathLength={1} />}
      {[hiI, loI].filter((i, k, a) => i >= 0 && a.indexOf(i) === k).map((i) => (
        <circle key={i} className="dt2" cx={f1(xy[i][0])} cy={f1(xy[i][1])} r="5" />
      ))}
      {tickAt.map((i) => (
        <text key={i} className="tk" x={f1(Math.min(W - 16, Math.max(16, xy[i][0])))} y={TICK} textAnchor="middle">{shortDate(pts[i].date, lang)}</text>
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Week of the rate: seven real stored days, each against the stored day before
// ---------------------------------------------------------------------------
const SYMBOL = { up: "↑", down: "↓", same: "=" } as const;

/** "4 subidas · 3 bajadas" (and "· 1 igual" when any): counts only, no judgment. */
export function weekCaption(week: WeekPoint[], lang: Lang): string {
  const up = week.filter((p) => p.dir === "up").length;
  const down = week.filter((p) => p.dir === "down").length;
  const same = week.filter((p) => p.dir === "same").length;
  const parts = [
    t(lang, `${up} ${up === 1 ? "subida" : "subidas"}`, `${up} up`),
    t(lang, `${down} ${down === 1 ? "bajada" : "bajadas"}`, `${down} down`),
    same ? t(lang, `${same} ${same === 1 ? "igual" : "iguales"}`, `${same} same`) : null,
  ];
  return parts.filter(Boolean).join(" · ");
}

export function WeekCircles({ week, lang }: { week: WeekPoint[]; lang: Lang }) {
  const word = { up: t(lang, "subió", "up"), down: t(lang, "bajó", "down"), same: t(lang, "igual", "same") };
  return (
    <>
      <ol className="wkc">
        {week.map((p) => (
          <li key={p.date} className={`wc ${p.dir ?? "nd"}`} data-dir={p.dir ?? ""} data-d={p.date}>
            <small>{weekday(p.date, lang)}</small>
            <span className="o" aria-hidden="true">{p.dir ? SYMBOL[p.dir] : ""}</span>
            <span className="sr">{`${shortDate(p.date, lang)}: ${rateText(p.rate)}${p.dir ? `, ${word[p.dir]}` : ""}`}</span>
          </li>
        ))}
      </ol>
      <small className="wcap">{weekCaption(week, lang)}</small>
    </>
  );
}

/** Home's rate row: the same seven days as dots. */
export function WeekDots({ week, lang }: { week: WeekPoint[]; lang: Lang }) {
  return (
    <span className="wd" role="img" aria-label={weekCaption(week, lang)}>
      {week.map((p) => <i key={p.date} className={p.dir ?? "nd"} />)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Calculator
// ---------------------------------------------------------------------------
/** Amount chips for going the other way, in each currency's own round numbers. */
export const LOCAL_CHIPS: Record<string, number[]> = {
  MXN: [500, 1000, 2000, 5000], HNL: [1000, 2000, 5000, 10000], GTQ: [500, 1000, 2000, 5000], JMD: [10000, 20000, 50000, 100000],
};
export const CAD_CHIPS = [50, 100, 200, 500];
export const CAD_MAX = 10000;

/** Decimals for an amount in a currency: whole Jamaican dollars, cents otherwise. */
export const decimalsFor = (currency: string) => (currency === "JMD" ? 0 : 2);

/**
 * An amount from the query string: a plain positive number with at most two
 * decimals, up to the cap. Anything else is ignored (null).
 */
export function parseAmount(raw: string | undefined, cap: number): number | null {
  if (raw == null || !/^\d{1,9}(\.\d{1,2})?$/.test(raw)) return null;
  const n = Number(raw);
  return n > 0 && n <= cap ? n : null;
}

/**
 * What sending money usually pays, as a rough estimate: about 2% under the
 * reference rate (owner's direction, 2026-09-17). Transfer services pay under
 * the reference rate and charge a fee, so the reference rate alone reads as
 * more than arrives.
 *
 * This never replaces the reference rate and is never presented as one: the
 * reference rate stays exactly what the sources say, this line is always
 * labelled an estimate, and no service is named or quoted (CLAUDE.md, FX).
 */
export const SEND_SPREAD = 0.02;
export const sendingRate = (rate: number) => rate * (1 - SEND_SPREAD);

/** At the reference rate, rounded to the target currency's decimals. */
export function convert(amount: number, rate: number, toLocal: boolean, currency: string): number {
  const d = toLocal ? decimalsFor(currency) : 2;
  const raw = toLocal ? amount * rate : amount / rate;
  return Math.round(raw * 10 ** d) / 10 ** d;
}
