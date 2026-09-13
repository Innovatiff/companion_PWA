/**
 * Dates, times and money the way docs/DESIGN.md writes them.
 *   Hoy:      "3 de marzo" / "3 March", "7pm" / "7:30pm"
 *   Portals:  "3 mar 2026, 14:05", "$20.00"
 */
export type Lang = "es" | "en";

const MONTHS: Record<Lang, string[]> = {
  es: ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
};
const WEEKDAYS: Record<Lang, string[]> = {
  es: ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"],
  en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
};

/** A calendar date ("YYYY-MM-DD" or a Date at UTC midnight) as "3 de marzo". */
export function formatDate(value: string | Date, lang: Lang, withYear = false): string {
  const iso = typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
  const [y, m, d] = iso.split("-").map(Number);
  const day = String(d);
  const month = MONTHS[lang][m - 1];
  if (lang === "en") return withYear ? `${day} ${month} ${y}` : `${day} ${month}`;
  return withYear ? `${day} de ${month} de ${y}` : `${day} de ${month}`;
}

/** "sábado 3 de marzo" / "Saturday 3 March". */
export function formatWeekdayDate(value: string, lang: Lang): string {
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  const weekday = WEEKDAYS[lang][new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${weekday} ${formatDate(value, lang)}`;
}

function parts(value: Date | string, timeZone: string) {
  const out: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "numeric", minute: "2-digit", hour12: true,
  }).formatToParts(new Date(value))) out[p.type] = p.value;
  return out;
}

/** A moment as "7pm" or "7:30pm" in the given timezone. */
export function formatTime12(value: Date | string, timeZone: string): string {
  const p = parts(value, timeZone);
  const minutes = p.minute === "00" ? "" : `:${p.minute}`;
  return `${p.hour}${minutes}${(p.dayPeriod ?? "").toLowerCase()}`;
}

/** The calendar date of a moment in a timezone, "YYYY-MM-DD". */
export function localDate(value: Date | string, timeZone: string): string {
  const p = parts(value, timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Portals: "3 mar 2026, 14:05" / "3 Mar 2026, 14:05" in Leamington time. */
export function formatDateTime(value: Date | string | null | undefined, lang: Lang, timeZone = "America/Toronto"): string {
  if (!value) return "";
  const f = new Intl.DateTimeFormat(lang === "en" ? "en-CA" : "es-MX", {
    timeZone, day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  });
  return f.format(new Date(value));
}

export function formatMoney(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  return `${n < 0 ? "-" : ""}$${Math.abs(n).toFixed(2)}`;
}
