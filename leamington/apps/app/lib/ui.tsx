/**
 * Small server-rendered visuals for Hoy: inline SVG icons and art, team crests
 * from our own domain (or the team's initials), lottery balls, date blocks and
 * flags. No client JS, no third-party assets, nothing downloaded but crests.
 */
import type { Lang } from "@leamington/shared/src/format.ts";

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
} as const;
export type IconName = keyof typeof ICON;

export function Icon({ name }: { name: IconName }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICON[name] }} />;
}

// Coloured art. Each is well under 600 bytes.
const ART = {
  morning: '<circle cx="32" cy="32" r="12" fill="#ffd166"/><path d="M32 8v7M32 49v7M8 32h7M49 32h7M15 15l5 5M44 44l5 5M15 49l5-5M44 20l5-5" stroke="#ffd166" stroke-width="4" stroke-linecap="round"/>',
  afternoon: '<circle cx="25" cy="24" r="11" fill="#ffd166"/><path d="M25 5v5M6 24h5M11.5 10.5l3.5 3.5M38.5 10.5 35 14" stroke="#ffd166" stroke-width="4" stroke-linecap="round"/><path d="M22 53h26a9 9 0 0 0 1.5-17.9A13 13 0 0 0 25 38a7.5 7.5 0 0 0-3 15z" fill="#fff"/>',
  night: '<path d="M38 9a21 21 0 1 0 17 31A17 17 0 0 1 38 9z" fill="#ffe8a3"/><path d="M50 12l1.2 3 3 1.2-3 1.2L50 20.5l-1.2-3-3-1.2 3-1.2zM16 10l.9 2.1 2.1.9-2.1.9L16 16l-.9-2.1L13 13l2.1-.9z" fill="#fff"/><circle cx="56" cy="30" r="1.6" fill="#fff"/>',
  sunny: '<circle cx="24" cy="24" r="9" fill="#fdb813"/><path d="M24 5v5M24 38v5M5 24h5M38 24h5M10.6 10.6l3.5 3.5M33.9 33.9l3.5 3.5M10.6 37.4l3.5-3.5M33.9 14.1l3.5-3.5" stroke="#fdb813" stroke-width="3.5" stroke-linecap="round"/>',
  rainy: '<path d="M13 31h22a7.5 7.5 0 0 0 1-14.9A11 11 0 0 0 15 19a6 6 0 0 0-2 12z" fill="#a9c1ee"/><path d="M17 36l-2 5M25 36l-2 5M33 36l-2 5" stroke="#2f6fde" stroke-width="3" stroke-linecap="round"/>',
  cloudy: '<circle cx="18" cy="18" r="7" fill="#fdb813"/><path d="M15 36h20a7 7 0 0 0 1-13.9A10 10 0 0 0 17 25a5.5 5.5 0 0 0-2 11z" fill="#c3d2ee"/>',
} as const;

export function Art({ name, size }: { name: keyof typeof ART; size: number }) {
  const box = name === "morning" || name === "afternoon" || name === "night" ? 64 : 48;
  return (
    <svg className="art" viewBox={`0 0 ${box} ${box}`} width={size} height={size} aria-hidden="true"
         dangerouslySetInnerHTML={{ __html: ART[name] }} />
  );
}

/** Which greeting art goes with the greeting's own words. */
export function greetingArt(text: string): "morning" | "afternoon" | "night" {
  if (/Buenos días|Good morning/i.test(text)) return "morning";
  if (/Buenas tardes|Good afternoon/i.test(text)) return "afternoon";
  return "night";
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
          style={{ width: size, height: size, fontSize: Math.round(size * 0.3), background: `hsl(${h} 70% 92%)`, color: `hsl(${h} 55% 30%)` }}>
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

/** Whole days from one "YYYY-MM-DD" to another. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to.slice(0, 10)) - Date.parse(from.slice(0, 10))) / 86_400_000);
}
