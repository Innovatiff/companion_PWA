/**
 * Shared helpers for lottery parsers.
 *
 * Every parser validates what it extracts and throws a LotteryParseError on
 * anything it cannot confirm. A parser never returns partial or zeroed data:
 * a wrong-but-confident lottery number is worse than no number.
 */

export class LotteryParseError extends Error {
  constructor(message) {
    super(message);
    this.name = "LotteryParseError";
    this.inconclusive = true;
  }
}

export function check(condition, message) {
  if (!condition) throw new LotteryParseError(message);
}

/** Operator sites are fetched as a normal browser would fetch them. */
export const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const pad2 = (n) => String(n).padStart(2, "0");

/** A real calendar date as YYYY-MM-DD, or throw. */
export function isoDate(y, m, d, what = "date") {
  const dt = new Date(Date.UTC(y, m - 1, d));
  check(Number.isInteger(y) && y >= 2000 && y <= 2100 &&
        dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d,
        `${what}: ${y}-${m}-${d} is not a calendar date`);
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

export function parseIsoDate(s, what = "date") {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s ?? ""));
  check(m, `${what}: "${s}" is not YYYY-MM-DD`);
  return isoDate(+m[1], +m[2], +m[3], what);
}

/** dd/mm/yyyy */
export function parseDmy(s, what = "date") {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(s ?? "").trim());
  check(m, `${what}: "${s}" is not dd/mm/yyyy`);
  return isoDate(+m[3], +m[2], +m[1], what);
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
  "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** "12 de septiembre de 2026" */
export function parseSpanishDate(s, what = "date") {
  const m = /^(\d{1,2}) de ([a-záéíóú]+) de (\d{4})$/i.exec(String(s ?? "").trim());
  check(m, `${what}: "${s}" is not "d de mes de aaaa"`);
  const month = MESES.indexOf(m[2].toLowerCase()) + 1;
  check(month > 0, `${what}: unknown month "${m[2]}"`);
  return isoDate(+m[3], month, +m[1], what);
}

export function addDays(date, n) {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

/** 0 = Sunday, matching lottery_games.draw_weekdays. */
export function weekdayOf(date) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export const minutesOf = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/** The wall-clock date and time at `now` in an IANA timezone. */
export function localNow(now, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(now).map((p) => [p.type, p.value]));
  const time = `${parts.hour}:${parts.minute}`;
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time, minutes: minutesOf(time) };
}

/**
 * lottery_games.draw_times_local as ["HH:MM", ...], sorted. node-pg may hand a
 * time[] over as an array or as its "{08:30:00,...}" literal.
 */
export function normalizeTimes(value) {
  if (value == null) return [];
  const list = Array.isArray(value)
    ? value
    : String(value).replace(/^\{|\}$/g, "").split(",").filter(Boolean);
  return list.map((t) => String(t).trim().slice(0, 5)).sort();
}

/**
 * The parser encodes the operator's published schedule; the seed carries the
 * same schedule for the scheduler. If they disagree one of them is wrong, and
 * slot labels derived from it cannot be trusted.
 */
export function assertSchedule(game, times) {
  const seeded = normalizeTimes(game.draw_times_local);
  const published = [...times].sort();
  check(seeded.join(",") === published.join(","),
    `${game.name}: seeded draw_times_local {${seeded}} disagrees with the ` +
    `operator's published schedule {${published}}`);
}

/**
 * Ball numbers as canonical integer strings ("05" -> "5"), validated for count,
 * range and (optionally) distinctness.
 */
export function balls(parts, { count, min, max, distinct = true, what }) {
  check(Array.isArray(parts) && parts.length === count,
    `${what}: expected ${count} numbers, got ${Array.isArray(parts) ? parts.length : 0} (${JSON.stringify(parts)})`);
  const out = parts.map((p) => {
    const s = String(p ?? "").trim();
    check(/^\d{1,2}$/.test(s), `${what}: "${s}" is not a number`);
    const n = Number(s);
    check(n >= min && n <= max, `${what}: ${n} is outside ${min}-${max}`);
    return String(n);
  });
  if (distinct) check(new Set(out).size === out.length, `${what}: repeated number in ${out.join(" ")}`);
  return out;
}

/** A digit game ("881") as ["8","8","1"]. */
export function digits(value, length, what) {
  const s = String(value ?? "").trim();
  check(new RegExp(`^\\d{${length}}$`).test(s), `${what}: "${s}" is not ${length} digits`);
  return s.split("");
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** Tag-free, entity-decoded, whitespace-collapsed text. */
export function text(html) {
  return String(html ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/\s+/g, " ")
    .trim();
}

export function parseJson(body, what) {
  try {
    return JSON.parse(body);
  } catch {
    throw new LotteryParseError(`${what}: response is not JSON (${String(body).slice(0, 80)})`);
  }
}
