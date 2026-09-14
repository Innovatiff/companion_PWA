/**
 * Small server-rendered visuals for Hoy: inline SVG icons and art, team crests
 * from our own domain (or the team's initials), lottery balls, date blocks and
 * flags. No client JS, no third-party assets, nothing downloaded but crests.
 */
import type { CSSProperties } from "react";
import { localDate, type Lang } from "@leamington/shared/src/format.ts";

// Stroke icons on a 24px grid, drawn in currentColor.
export const ICON = {
  ball: '<circle cx="12" cy="12" r="9"/><path d="m12 7 4 3-1.5 4.5h-5L8 10z"/>',
  rain: '<path d="M7 15h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 8a3.5 3.5 0 0 0 1 7zM8 18l-1 3M12 18l-1 3M16 18l-1 3"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  swap: '<path d="M4 8h13l-3-3M20 16H7l3 3"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  alert: '<path d="M12 3 2 20h20zM12 10v4M12 17v.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.5"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  building: '<path d="M3 21h18M5 21V10l7-5 7 5v11M9 21v-5h6v5"/>',
  book: '<path d="M4 5h6a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H4zM20 5h-6a2 2 0 0 0-2 2v13a2 2 0 0 1 2-2h6z"/>',
  bus: '<rect x="4" y="3" width="16" height="14" rx="3"/><path d="M4 11h16M8 21v-4M16 21v-4"/>',
  star: '<path d="m12 3 2.6 5.6 6 .6-4.5 4 1.3 6L12 16.2l-5.4 3 1.3-6-4.5-4 6-.6z"/>',
  bell: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>',
  sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M16 7l3 3"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  drop: '<path d="M12 3.5s6 6.3 6 10.7a6 6 0 0 1-12 0C6 9.8 12 3.5 12 3.5z"/>',
  wind: '<path d="M3 9h11a3 3 0 1 0-3-3M3 13h15a3 3 0 1 1-3 3M3 17h6"/>',
  thermo: '<path d="M10 14.5V5a2 2 0 0 1 4 0v9.5a4 4 0 1 1-4 0z"/><path d="M12 11v5"/>',
} as const;
export type IconName = keyof typeof ICON;

export function Icon({ name }: { name: IconName }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICON[name] }} />;
}

// ---------------------------------------------------------------------------
// Illustrations: small animated SVG files in public/art, each under 1.5 KB
// gzipped, served with a 30-day immutable cache. Their motion lives inside each
// file and stops under prefers-reduced-motion. Decorative: alt="" always, the
// words beside them carry the meaning. Bump ART_V when any file changes.
// ---------------------------------------------------------------------------
export const ART_V = 1;
export const ART_NAMES = [
  "sun", "moon", "partly-day", "partly-night", "cloud", "fog", "drizzle", "rain", "storm", "snow",
  "football", "money", "calendar", "school", "consulate", "phone", "bus", "lottery", "bell", "crown",
  "plane", "warning", "settings", "clock", "pin",
  "badge-fundador", "badge-pueblo", "badge-avisos", "badge-vigia", "badge-explorador", "badge-fiel", "badge-renovo", "badge-temporada",
  "globe", "wave", "chart", "calculator", "bell-reminder", "canada",
  "jacket", "umbrella", "sunscreen", "water", "leaf", "week", "news",
] as const;
export type ArtName = (typeof ART_NAMES)[number];

export function Art({ name, size, lazy = false, className }: { name: ArtName; size: number; lazy?: boolean; className?: string }) {
  return (
    <img className={className ? `art ${className}` : "art"} src={`/art/${name}.svg?v=${ART_V}`} width={size} height={size} alt=""
         loading={lazy ? "lazy" : undefined} decoding="async" />
  );
}

/** A picture on a rounded lavender tile, the row's lead. */
export function Pic({ name, lazy }: { name: ArtName; lazy?: boolean }) {
  return <span className="pic"><Art name={name} size={40} lazy={lazy} /></span>;
}

/**
 * A forecast day's picture. The forecast says only whether rain is expected, so
 * a day without rain gets the modest partly-cloudy picture, never a promise of
 * sun. Current conditions (coming) will pick the exact sky.
 */
export const dayArt = (d: { rain?: boolean | null }): ArtName => (d.rain ? "rain" : "partly-day");

/**
 * A whole number that counts up from zero as the page opens (CSS @property,
 * no JS). The number itself is in the text for screen readers and copies; the
 * animated copy is decorative. Anything else renders as the plain value.
 */
export function Num({ value, className }: { value: string; className?: string }) {
  const m = /^(-?\d{1,4})(°?)$/.exec(value.trim());
  if (!m) return <b className={className}>{value}</b>;
  return (
    <b className={className}>
      <span className="cu" style={{ "--n": Number(m[1]) } as CSSProperties} aria-hidden="true">{m[2]}</span>
      <span className="sr">{value}</span>
    </b>
  );
}

/** A thick ring filled to a percentage from our data, with the value and a unit inside. */
export function Ring({ pct, unit, tone }: { pct: number; unit: string; tone?: "rain" | "brand" }) {
  const p = Math.min(100, Math.max(0, Math.round(pct)));
  return (
    <span className={`ring${tone === "rain" ? " rn" : ""}`} style={{ "--p": p } as CSSProperties}>
      <span><b>{`${p}%`}</b><small>{unit}</small></span>
    </span>
  );
}

// A team's initials, e.g. "Montego Bay United" -> "MBU", "Motagua" -> "MOT".
const FILLER = /^(c\.?d\.?|f\.?c\.?|c\.?f\.?|c\.?s\.?d\.?|a\.?c\.?|s\.?c\.?|club|deportivo|the)$/i;
export function initials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  const kept = words.filter((w) => !FILLER.test(w));
  const list = kept.length ? kept : words;
  return (list.length === 1 ? list[0].slice(0, 3) : list.slice(0, 3).map((w) => w[0]).join("")).toUpperCase();
}

function hue(name: string): number {
  let h = 7;
  for (const ch of name) h = (h * 31 + (ch.codePointAt(0) ?? 0)) % 360;
  return h;
}

/**
 * A team crest served from our own domain when we hold one; otherwise the
 * team's initials in a coloured circle (the team's name, styled, not a
 * placeholder). The name itself is always written next to it.
 */
export function Crest({ id, name, has, size }: { id?: number | string | null; name: string; has?: boolean | null; size: number }) {
  if (has && id != null) {
    return <img className="cr" src={`/crest/${id}`} width={size} height={size} alt="" loading="lazy" decoding="async" />;
  }
  const h = hue(name);
  return (
    <span className="cr" aria-hidden="true"
          style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.3)), background: `hsl(${h} 70% 92%)`, color: `hsl(${h} 55% 30%)` }}>
      {initials(name)}
    </span>
  );
}

export function Balls({ numbers }: { numbers: string[] }) {
  return <span className="balls">{numbers.map((n, i) => <b key={i}>{n}</b>)}</span>;
}

const MON: Record<Lang, string[]> = {
  es: ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"],
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
};

/** A calendar date as a block: the day number big, the month small. */
export function DateBlock({ date, lang }: { date: string; lang: Lang }) {
  const [, m, d] = date.slice(0, 10).split("-").map(Number);
  return <time className="dt" dateTime={date.slice(0, 10)}><b>{d}</b>{MON[lang][m - 1]}</time>;
}

export const FLAG: Record<string, string> = { CA: "🇨🇦", MX: "🇲🇽", GT: "🇬🇹", HN: "🇭🇳", JM: "🇯🇲" };

/** A tap-to-call link for the first number in a phone field ("(416) 598-3008 / 2639"). */
export const tel = (n: string) => `tel:${n.split("/")[0].replace(/[^\d+]/g, "")}`;

/** A draw time "21:00:00" as "9pm", in the operator's own time. */
export function drawTime(value: string): string {
  const [h, m] = value.split(":").map(Number);
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`;
}

/** A town photo's credit, from app.town_photo (0034). */
export type Photo = {
  municipality_id: number; author: string; license: string; license_url: string | null;
  source_page_url: string; width: number | null; height: number | null;
};

/** A town photo from our own domain. The page must also render its <Credit>. */
export function TownPhoto({ p, lazy = true, className }: { p: Photo; lazy?: boolean; className?: string }) {
  return (
    <img className={className} src={`/photo/${p.municipality_id}`} width={p.width ?? 560} height={p.height ?? 373} alt=""
         loading={lazy ? "lazy" : undefined} decoding="async" />
  );
}

/**
 * "Foto: {author} · {license}", linked to the file's page and the license.
 * `licenseFirst` ("CC BY-SA 4.0 · Foto: {author}") keeps the license visible
 * where the line is clamped to one line.
 */
export function Credit({ p, lang, place, licenseFirst, photoKey }: { p: Photo; lang: Lang; place?: string; licenseFirst?: boolean; photoKey?: string }) {
  const license = p.license_url ? <a href={p.license_url} rel="noopener">{p.license}</a> : p.license;
  const author = <a href={p.source_page_url} rel="noopener">{p.author}</a>;
  const word = `${place ? `${place}. ` : ""}${lang === "en" ? "Photo" : "Foto"}: `;
  return (
    <small className="credit" data-photo={photoKey ?? p.municipality_id}>
      {licenseFirst ? <>{license}{` · ${word}`}{author}</> : <>{word}{author}{" · "}{license}</>}
    </small>
  );
}

/**
 * The next local midnight in a timezone, as an ISO string: when a day-bound
 * line stops being true. The UTC offset is the one in force at that midnight,
 * so a clock change that day is accounted for.
 */
export function localDayEnd(now: Date, timeZone: string): string {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", timeZoneName: "longOffset" });
  const parts = (d: Date) => Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  const offset = (d: Date) => (parts(d).timeZoneName ?? "GMT").replace("GMT", "") || "Z";
  const p = parts(now);
  const next = new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day) + 1)).toISOString().slice(0, 10);
  const guess = new Date(`${next}T00:00:00${offset(now)}`);
  return new Date(`${next}T00:00:00${offset(guess)}`).toISOString();
}

// ---------------------------------------------------------------------------
// Sky: sunrise, sunset and the moon's phase are astronomy, computed from a
// place's coordinates and the date (the standard sunrise equation, accurate to
// a minute or two). Not a forecast.
// ---------------------------------------------------------------------------
const RAD = Math.PI / 180;

/** Sunrise and sunset on a local calendar date ("YYYY-MM-DD") at lat/lng; null in polar day or night. */
export function sunTimes(lat: number, lng: number, date: string): { rise: Date; set: Date } | null {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  const julian = Date.UTC(y, m - 1, d, 12) / 86_400_000 + 2440587.5;
  const n = Math.round(julian - 2451545.0 + 0.0008);
  const jStar = n - lng / 360;
  const M = (357.5291 + 0.98560028 * jStar) % 360;
  const C = 1.9148 * Math.sin(M * RAD) + 0.02 * Math.sin(2 * M * RAD) + 0.0003 * Math.sin(3 * M * RAD);
  const lambda = (M + C + 180 + 102.9372) % 360;
  const transit = 2451545.0 + jStar + 0.0053 * Math.sin(M * RAD) - 0.0069 * Math.sin(2 * lambda * RAD);
  const sinDec = Math.sin(lambda * RAD) * Math.sin(23.4397 * RAD);
  const cosDec = Math.cos(Math.asin(sinDec));
  const cosH = (Math.sin(-0.833 * RAD) - Math.sin(lat * RAD) * sinDec) / (Math.cos(lat * RAD) * cosDec);
  if (!Number.isFinite(cosH) || cosH < -1 || cosH > 1) return null;
  const h = Math.acos(cosH) / RAD / 360;
  const toDate = (j: number) => new Date((j - 2440587.5) * 86_400_000);
  return { rise: toDate(transit - h), set: toDate(transit + h) };
}

/** The moon's phase at a moment: an index 0-7 (new, waxing crescent, first quarter, ..., waning crescent). */
export function moonPhase(at: Date): number {
  const synodic = 29.530588853;
  const age = ((at.getTime() / 86_400_000 + 2440587.5 - 2451550.1) % synodic + synodic) % synodic;
  return Math.floor((age / synodic) * 8 + 0.5) % 8;
}

// ---------------------------------------------------------------------------
// Timezone rules (Intl, no tables)
// ---------------------------------------------------------------------------
const OFFSET_FORMAT = new Map<string, Intl.DateTimeFormat>();

/** A timezone's UTC offset in minutes at a moment. */
export function offsetMinutes(timeZone: string, at: Date): number {
  let f = OFFSET_FORMAT.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" });
    OFFSET_FORMAT.set(timeZone, f);
  }
  const name = f.formatToParts(at).find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const m = /GMT([+-])(\d{2}):?(\d{2})?/.exec(name);
  return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0)) : 0;
}

/**
 * The next moment a timezone's UTC offset changes (daylight saving), within
 * `days` of `from`, to the minute; null when there is none. From the
 * timezone rules the runtime carries, never a table of dates.
 */
export function nextOffsetChange(timeZone: string, from: Date, days = 400): { at: Date; before: number; after: number } | null {
  const before = offsetMinutes(timeZone, from);
  for (let h = 1; h <= days * 24; h++) {
    const t = from.getTime() + h * 3_600_000;
    if (offsetMinutes(timeZone, new Date(t)) !== before) {
      let a = t - 3_600_000, b = t;
      while (b - a > 60_000) {
        const mid = Math.floor((a + b) / 2);
        if (offsetMinutes(timeZone, new Date(mid)) === before) a = mid; else b = mid;
      }
      return { at: new Date(b), before, after: offsetMinutes(timeZone, new Date(b)) };
    }
  }
  return null;
}

/** Minutes of daylight (sunrise to sunset) on a local date at a place; null in polar day or night. */
export function daylightMinutes(lat: number, lng: number, date: string): number | null {
  const s = sunTimes(lat, lng, date);
  return s ? Math.round((s.set.getTime() - s.rise.getTime()) / 60_000) : null;
}

/** Leamington, Ontario: where the members are. */
export const LEAMINGTON = { lat: 42.0531, lng: -82.5998, timezone: "America/Toronto" } as const;

export const SKY_PHASES = ["dawn", "day", "dusk", "night"] as const;
export type SkyPhase = (typeof SKY_PHASES)[number];

/**
 * The sky at a place right now, from sunrise and sunset (astronomy, not a
 * forecast): dawn and dusk are the 45 minutes either side of sunrise and sunset.
 */
export function skyPhase(at: Date, place: { lat: number; lng: number; timezone: string } = LEAMINGTON): SkyPhase {
  const s = sunTimes(place.lat, place.lng, localDate(at, place.timezone));
  if (!s) return "day";
  const t = at.getTime();
  const edge = 45 * 60_000;
  if (Math.abs(t - s.rise.getTime()) <= edge) return "dawn";
  if (Math.abs(t - s.set.getTime()) <= edge) return "dusk";
  return t > s.rise.getTime() && t < s.set.getTime() ? "day" : "night";
}

export const MOON: Record<Lang, string[]> = {
  es: ["Luna nueva", "Luna creciente", "Cuarto creciente", "Gibosa creciente", "Luna llena", "Gibosa menguante", "Cuarto menguante", "Luna menguante"],
  en: ["New moon", "Waxing crescent", "First quarter", "Waxing gibbous", "Full moon", "Waning gibbous", "Last quarter", "Waning crescent"],
};

/** A league logo from our own domain, only when we hold one. */
export function LeagueLogo({ id, has, size }: { id?: number | null; has?: boolean | null; size: number }) {
  return has && id != null
    ? <img className="lgo" src={`/league-crest/${id}`} width={size} height={size} alt="" loading="lazy" decoding="async" />
    : null;
}

/**
 * "Regular Season - 8" as "Jornada 8" / "Matchday 8", and "Apertura - 8" as
 * "Apertura · Jornada 8"; other rounds as the provider wrote them.
 */
export function roundName(round: string | null | undefined, lang: Lang): string | null {
  if (!round) return null;
  const m = /^(Regular Season|Apertura|Clausura)\s*-\s*(\d+)$/i.exec(round.trim());
  if (!m) return round;
  const day = `${lang === "en" ? "Matchday" : "Jornada"} ${m[2]}`;
  return /^regular season$/i.test(m[1]) ? day : `${m[1]} · ${day}`;
}

/** Whole days from one "YYYY-MM-DD" to another. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to.slice(0, 10)) - Date.parse(from.slice(0, 10))) / 86_400_000);
}
