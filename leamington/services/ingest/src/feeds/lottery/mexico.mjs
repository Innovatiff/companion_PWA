/**
 * Mexico -- Lotería Nacional (which absorbed Pronósticos para la Asistencia
 * Pública; pronosticos.gob.mx now redirects to loterianacional.gob.mx).
 *
 * Source: the server-rendered results pages
 *   https://www.loterianacional.gob.mx/{Melate,Chispazo,Tris}/Resultados
 * Each carries a "Histórico - Últimos 15 sorteos" table (sorteo, fecha,
 * combinación) and a latest-draw table above it.
 *
 * Verified 2026-09-13 against real pages (test/fixtures/lottery/mx-*-resultados.html).
 * Schedules from the operator's game pages (/Melate/Melate, /Chispazo/Chispazo, /Tris/Tris):
 *   Melate    miércoles, viernes y domingo a las 21:00 h
 *   Chispazo  dos veces al día: de las Tres 15:00, Clásico 21:00
 *   Tris      Medio día 13:00, de las Tres 15:00, Extra 17:00, de las Siete 19:00, Clásico 21:00
 *
 * DRAW TIME CAVEAT: the history table has no draw time. Chispazo and Tris draw
 * several times a day, so the slot is derived from the sorteo number's position
 * within its day: sorteo numbers are consecutive (checked) and draws happen in
 * schedule order, so within one date the lowest number is the earliest slot.
 * Only the newest date may be short (the day is in progress: its draws are the
 * first slots) and only the oldest date may be short (cut off by the 15-row
 * window: its draws are the last slots). Any other short day, a gap in the
 * numbers, or a slot later than the current Mexico City time throws. For Tris
 * the page also labels today's draws by type ("Medio Día", "De las Tres"), and
 * those labels are checked against the derived slot. Only "Medio Día" and "De
 * las Tres" were observed; the other three labels are matched by keyword.
 *
 * Stored: numbers, sorteo number, Melate's adicional, Tris's multiplicador flag.
 * Not stored: prize tables, bolsa.
 */
import {
  assertSchedule, balls, check, digits, localNow, minutesOf, parseDmy, text,
} from "./common.mjs";

const BASE = "https://www.loterianacional.gob.mx";
const TZ = "America/Mexico_City";
/** A published draw may appear this long before its nominal slot (clock skew). */
const EARLY_TOLERANCE_MIN = 15;

export const GAMES = {
  Melate:   { path: "/Melate/Resultados",   logo: "MelateRR.svg", times: ["21:00"] },
  Chispazo: { path: "/Chispazo/Resultados", logo: "Chispazo.svg", times: ["15:00", "21:00"] },
  Tris:     { path: "/Tris/Resultados",     logo: "Tris.svg",
              times: ["13:00", "15:00", "17:00", "19:00", "21:00"] },
};

export const resultsUrl = (name) => `${BASE}${GAMES[name].path}`;

const TRIS_LABELS = [
  [/medio dia/, "13:00"], [/de las tres/, "15:00"], [/extra/, "17:00"],
  [/de las siete/, "19:00"], [/clasico/, "21:00"],
];
const fold = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function combination(game, raw, what) {
  const s = raw.trim();
  if (game.name === "Melate") {
    const m = /^(\d{2}(?: \d{2}){5})-(\d{2})$/.exec(s);
    check(m, `${what}: "${s}" is not six numbers and an adicional`);
    const numbers = balls(m[1].split(" "), { count: 6, min: 1, max: 56, what });
    const [adicional] = balls([m[2]], { count: 1, min: 1, max: 56, what: `${what} adicional` });
    check(!numbers.includes(adicional), `${what}: adicional ${adicional} repeats a natural number`);
    return { numbers, extras: { adicional } };
  }
  if (game.name === "Chispazo") {
    check(/^\d{2}(?: \d{2}){4}$/.test(s), `${what}: "${s}" is not five numbers`);
    return { numbers: balls(s.split(" "), { count: 5, min: 1, max: 28, what }), extras: {} };
  }
  return { numbers: digits(s, 5, what), extras: {} };
}

function multiplier(raw, what) {
  const s = raw.trim();
  check(s === "SI" || s === "NO", `${what}: multiplicador "${s}" is not SI/NO`);
  return s === "SI";
}

function cells(rowHtml) {
  return [...rowHtml.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((m) => text(m[1]));
}

function parseHistory(html, game, what) {
  // The Melate page repeats the history block (and its id) for Revancha and
  // Revanchita; read only the section headed for this game.
  const heading = (game.name === "Melate" ? /<h3>Histórico Melate<\/h3>/ : /<h3>Histórico\s*<\/h3>/).exec(html);
  check(heading, `${what}: history section heading not found`);
  const from = heading.index + heading[0].length;
  const next = html.indexOf("<h3>", from);
  const section = html.slice(from, next < 0 ? undefined : next);
  const table = /<table id="tblResultados"[^>]*>([\s\S]*?)<\/table>/.exec(section);
  check(table, `${what}: history table (tblResultados) not found`);
  const head = /<thead>([\s\S]*?)<\/thead>/.exec(table[1]);
  const body = /<tbody>([\s\S]*?)<\/tbody>/.exec(table[1]);
  check(head && body, `${what}: history table has no thead/tbody`);

  const expected = ["Sorteo", "Fecha", "Combinación Ganadora", ...(game.name === "Tris" ? ["Multiplicador"] : [])];
  const header = cells(head[1]);
  check(header.join("|") === expected.join("|"),
    `${what}: history columns ${JSON.stringify(header)} are not ${JSON.stringify(expected)}`);

  const rows = [...body[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => cells(m[1]));
  check(rows.length > 0, `${what}: history table has no rows`);
  check(rows.length <= 15, `${what}: history table has ${rows.length} rows, expected at most 15`);

  return rows.map((c, i) => {
    const at = `${what} history row ${i + 1}`;
    check(c.length === expected.length, `${at}: ${c.length} cells, expected ${expected.length}`);
    check(/^\d+$/.test(c[0]), `${at}: sorteo "${c[0]}" is not numeric`);
    const { numbers, extras } = combination(game, c[2], at);
    if (game.name === "Tris") extras.multiplicador = multiplier(c[3], at);
    return { concurso: Number(c[0]), drawDate: parseDmy(c[1], at), numbers, extras };
  });
}

/** The latest-draw table(s) above the history, when present. */
function parseLatest(html, game, what) {
  if (game.name === "Tris") {
    const t = /Fecha\s+(\d{2}\/\d{2}\/\d{4})[^<]*<br\s*\/?>\s*Combinaciones ganadoras([\s\S]*?)<\/table>/.exec(html);
    if (!t) return [];
    const date = parseDmy(t[1], `${what} latest`);
    return [...t[2].matchAll(/<tr class="text-center">([\s\S]*?)<\/tr>/g)].map((m, i) => {
      const at = `${what} latest row ${i + 1}`;
      const c = cells(m[1]);
      check(c.length === 4 && /^\d+$/.test(c[0]), `${at}: unexpected cells ${JSON.stringify(c)}`);
      const label = TRIS_LABELS.find(([re]) => re.test(fold(c[1])));
      check(label, `${at}: unknown draw type "${c[1]}"`);
      const { numbers, extras } = combination(game, c[2], at);
      extras.multiplicador = multiplier(c[3], at);
      return { concurso: Number(c[0]), drawDate: date, numbers, extras, labelTime: label[1] };
    });
  }
  let scope = html;
  if (game.name === "Melate") {
    const seg = /<h3>Melate<\/h3>([\s\S]*?)<h3>Revancha<\/h3>/.exec(html);
    if (!seg) return [];
    scope = seg[1];
  }
  const t = /Sorteo:\s*(\d+)\s*<br\s*\/?>\s*Fecha\s+(\d{2}\/\d{2}\/\d{4})\s*<br\s*\/?>\s*Combinaci\S*n ganadora[\s\S]*?<h3>([^<]+)<\/h3>/.exec(scope);
  if (!t) return [];
  const at = `${what} latest`;
  return [{ concurso: Number(t[1]), drawDate: parseDmy(t[2], at), ...combination(game, text(t[3]), at) }];
}

function sameDraw(a, b) {
  return a.drawDate === b.drawDate && a.numbers.join(" ") === b.numbers.join(" ") &&
    JSON.stringify(a.extras) === JSON.stringify(b.extras);
}

/** Parse one game's /Resultados page. `now` bounds which slots can exist. */
export function parseLoteriaNacional(html, game, { now = new Date() } = {}) {
  const spec = GAMES[game.name];
  check(spec, `Lotería Nacional: no parser for game "${game.name}"`);
  const what = `Lotería Nacional ${game.name}`;
  check(html.includes(`/Imagenes/Productos_btn/${spec.logo}`),
    `${what}: page is not the ${game.name} results page (no ${spec.logo})`);

  const byConcurso = new Map(parseHistory(html, game, what).map((r) => [r.concurso, r]));
  const latest = parseLatest(html, game, what);
  for (const l of latest) {
    const h = byConcurso.get(l.concurso);
    if (h) {
      check(sameDraw(h, l), `${what}: sorteo ${l.concurso} differs between the latest table and the history`);
      if (l.labelTime) h.labelTime = l.labelTime;
    } else {
      byConcurso.set(l.concurso, l);
    }
  }

  const rows = [...byConcurso.values()].sort((a, b) => b.concurso - a.concurso);
  for (let i = 1; i < rows.length; i++) {
    check(rows[i].concurso === rows[i - 1].concurso - 1,
      `${what}: sorteo numbers jump from ${rows[i - 1].concurso} to ${rows[i].concurso}`);
    check(rows[i].drawDate <= rows[i - 1].drawDate,
      `${what}: sorteo ${rows[i].concurso} is dated after ${rows[i - 1].concurso}`);
  }

  const groups = [];
  for (const r of rows) {
    const g = groups.at(-1);
    if (g && g.date === r.drawDate) g.rows.push(r);
    else groups.push({ date: r.drawDate, rows: [r] });
  }

  const times = spec.times;
  const local = localNow(now, TZ);
  const draws = [];
  groups.forEach((g, i) => {
    const asc = [...g.rows].reverse();
    const at = `${what} ${g.date}`;
    check(asc.length <= times.length, `${at}: ${asc.length} draws, the schedule has ${times.length}`);
    let offset = 0;
    if (asc.length < times.length) {
      const newest = i === 0, oldest = i === groups.length - 1;
      check(newest !== oldest, `${at}: ${asc.length} of ${times.length} draws and no way to place them`);
      offset = newest ? 0 : times.length - asc.length;
    }
    asc.forEach((r, j) => {
      const drawTimeLocal = times[offset + j];
      if (r.labelTime) {
        check(r.labelTime === drawTimeLocal,
          `${at}: sorteo ${r.concurso} is labelled ${r.labelTime} but sits in the ${drawTimeLocal} slot`);
      }
      check(r.drawDate < local.date ||
            (r.drawDate === local.date && minutesOf(drawTimeLocal) <= local.minutes + EARLY_TOLERANCE_MIN),
        `${at}: sorteo ${r.concurso} would be the ${drawTimeLocal} draw, which has not happened yet ` +
        `(Mexico City now ${local.date} ${local.time})`);
      draws.push({
        drawDate: r.drawDate, drawTimeLocal, numbers: r.numbers,
        extras: { concurso: String(r.concurso), ...r.extras },
      });
    });
  });
  return draws;
}

export const loteriaNacional = {
  games: Object.keys(GAMES),
  async draws(game, { get, now }) {
    assertSchedule(game, GAMES[game.name].times);
    const url = resultsUrl(game.name);
    const html = await get(url);
    return parseLoteriaNacional(html, game, { now }).map((d) => ({ ...d, sourceUrl: url }));
  },
};
