/**
 * Honduras -- LOTO Honduras (Lotería Electrónica de Honduras), https://loto.hn/.
 *
 * Source: the JSON endpoints the operator's game pages call for their
 * "resultados anteriores" calendar:
 *   /api/resultados_diaria_por_fecha.php?fecha=YYYY-MM-DD
 *   /api/resultados_juga3_por_fecha.php?fecha=YYYY-MM-DD
 *   /api/resultados_superpremio_por_fecha.php?fecha=YYYY-MM-DD
 *
 * Verified 2026-09-13 against real responses (test/fixtures/lottery/hn-*.json).
 * Schedule from the operator's pages (?pag=diaria, ?pag=juga3, ?pag=super_premio):
 * La Diaria and Jugá 3 draw daily at 11:00 a.m., 3:00 p.m. and 9:00 p.m.
 * ("LOS 365 DÍAS DEL AÑO"); Loto Super Premio draws Wednesday and Saturday at
 * 9:00 p.m.
 *
 * Response shapes. Diaria / Jugá 3: {"11": slot|null, "15": slot|null, "21": slot|null},
 * where null is a draw not yet published (the page itself paints it as 0 -- we
 * never do). Super Premio: {"par1".."par6"} or [] when there is no result.
 * A null slot or [] for a date that has fully passed is unexpected and throws.
 * NOTE: an unparseable fecha also yields all-null slots, so a future change to
 * the date format would read as "not yet drawn" today and throw from tomorrow.
 *
 * Stored: La Diaria's 2-digit number with its "Más 1" digit; Jugá 3's three
 * digits; Super Premio's six numbers. The CLAUDE.md name "La Grande" does not
 * appear anywhere on loto.hn; Loto Super Premio is the operator's lotto.
 */
import {
  addDays, assertSchedule, balls, check, digits, localNow, parseJson, weekdayOf,
} from "./common.mjs";

export const API_BASE = "https://loto.hn/api";
const TZ = "America/Tegucigalpa";
const SLOTS = { 11: "11:00", 15: "15:00", 21: "21:00" };
/** The API reports the real draw moment ("10:58:00"); allow this much drift from the slot. */
const DRIFT_MIN = 30;

export const GAMES = {
  "La Diaria":    { endpoint: "resultados_diaria_por_fecha.php", times: ["11:00", "15:00", "21:00"], weekdays: null },
  "Jugá 3":       { endpoint: "resultados_juga3_por_fecha.php", times: ["11:00", "15:00", "21:00"], weekdays: null },
  "Super Premio": { endpoint: "resultados_superpremio_por_fecha.php", times: ["21:00"], weekdays: [3, 6] },
};

export const resultsUrl = (name, date) => `${API_BASE}/${GAMES[name].endpoint}?fecha=${date}`;

function checkHora(hora, slot, what) {
  const m = /^(\d{2}):(\d{2}):/.exec(String(hora ?? ""));
  check(m, `${what}: hora "${hora}" is not a time`);
  const [h, mm] = slot.split(":").map(Number);
  const drift = Math.abs(Number(m[1]) * 60 + Number(m[2]) - (h * 60 + mm));
  check(drift <= DRIFT_MIN, `${what}: hora ${m[1]}:${m[2]} is not the ${slot} draw`);
}

/**
 * Parse one date's response for one game. `date` is the fecha requested;
 * `now` decides whether a missing result is "not yet" or unexpected.
 */
export function parseLotoHonduras(body, game, { date, now = new Date() }) {
  const spec = GAMES[game.name];
  check(spec, `Loto Honduras: no parser for game "${game.name}"`);
  const what = `Loto Honduras ${game.name} ${date}`;
  const today = localNow(now, TZ).date;
  check(date <= today, `${what}: date is in the future (Tegucigalpa today ${today})`);
  const dayOver = date < today;
  const data = parseJson(body, what);

  if (game.name === "Super Premio") {
    check(spec.weekdays.includes(weekdayOf(date)), `${what}: not a Super Premio draw day`);
    if (Array.isArray(data)) {
      check(data.length === 0, `${what}: unexpected array response`);
      check(!dayOver, `${what}: no result published for a past draw day`);
      return [];
    }
    check(data && typeof data === "object", `${what}: response is not an object`);
    const keys = Object.keys(data).sort();
    check(keys.join() === "par1,par2,par3,par4,par5,par6", `${what}: unexpected fields ${JSON.stringify(keys)}`);
    const parts = keys.map((k) => data[k]);
    check(parts.every((p) => /^\d{2}$/.test(String(p))), `${what}: numbers ${JSON.stringify(parts)} are not 2-digit`);
    return [{ drawDate: date, drawTimeLocal: "21:00",
              numbers: balls(parts, { count: 6, min: 1, max: 33, what }), extras: {} }];
  }

  check(data && typeof data === "object" && !Array.isArray(data), `${what}: response is not an object`);
  check(Object.keys(data).sort().join() === "11,15,21",
    `${what}: expected slots 11, 15, 21, got ${JSON.stringify(Object.keys(data))}`);

  const draws = [];
  for (const [key, drawTimeLocal] of Object.entries(SLOTS)) {
    const slot = data[key];
    const at = `${what} ${drawTimeLocal}`;
    if (slot === null) {
      check(!dayOver, `${at}: no result published for a day that has passed`);
      continue;
    }
    check(slot && typeof slot === "object", `${at}: slot is not an object`);
    if (game.name === "La Diaria") {
      check(slot.diaria && slot.mas1, `${at}: missing diaria or mas1`);
      checkHora(slot.diaria.hora, drawTimeLocal, at);
      const n = String(slot.diaria.par1 ?? "");
      check(/^\d{2}$/.test(n), `${at}: diaria "${n}" is not 00-99`);
      const mas1 = String(slot.mas1.par1 ?? "");
      check(/^\d$/.test(mas1), `${at}: más 1 "${mas1}" is not a single digit`);
      draws.push({ drawDate: date, drawTimeLocal, numbers: [n], extras: { mas1 } });
    } else {
      checkHora(slot.hora, drawTimeLocal, at);
      draws.push({ drawDate: date, drawTimeLocal, numbers: digits(slot.par1, 3, at), extras: {} });
    }
  }
  return draws;
}

/** The dates to ask for: the last two days, or the last two draw days. */
export function datesToFetch(game, now) {
  const spec = GAMES[game.name];
  const today = localNow(now, TZ).date;
  const dates = [];
  for (let back = 0; dates.length < 2 && back < 14; back++) {
    const d = addDays(today, -back);
    if (!spec.weekdays || spec.weekdays.includes(weekdayOf(d))) dates.push(d);
  }
  return dates.reverse();
}

export const lotoHonduras = {
  games: Object.keys(GAMES),
  async draws(game, { get, now }) {
    assertSchedule(game, GAMES[game.name].times);
    const out = [];
    for (const date of datesToFetch(game, now)) {
      const url = resultsUrl(game.name, date);
      for (const d of parseLotoHonduras(await get(url), game, { date, now })) out.push({ ...d, sourceUrl: url });
    }
    return out;
  },
};
