/**
 * Guatemala -- Lotería Santa Lucía, run by the Benemérito Comité Pro Ciegos y
 * Sordos de Guatemala.
 *
 * Source: the Comité's own results site, https://prociegosysordos.org.gt/resultados/
 * (linked from its Lotería Santa Lucía division page). The lottery's own domain,
 * www.loteria.org.gt, answered HTTP 403 with a Cloudflare "Attention Required"
 * challenge on 2026-09-13 and is used by the Comité only for online sales.
 *
 * Verified 2026-09-13 against real pages (test/fixtures/lottery/gt-*.html).
 * The index lists every draw still claimable (6 months) with its number, type
 * and date; each draw page has the three main prizes and the reintegro endings.
 *
 * Schedule (DivisionLoteriaSantaLucia.php, "Calendario 2026", and the index):
 * Sorteo Ordinario weekly on Saturdays (the 2026 calendar has one on Wednesday
 * 30/12); Sorteo Extraordinario roughly monthly, usually a Saturday (No. 413 was
 * Sunday 19/07/2026). NO DRAW TIME IS PUBLISHED, so drawTimeLocal is null.
 *
 * Stored: numbers = [primer premio, segundo premio, tercer premio] (5-digit
 * ticket numbers, in that order); extras = sorteo number, type, reintegro
 * endings. Not stored: prize amounts, sellers' names, the full prize list.
 */
import { check, parseSpanishDate, text } from "./common.mjs";

export const ORIGIN = "https://prociegosysordos.org.gt";
export const INDEX_URL = `${ORIGIN}/resultados/`;

export const GAMES = {
  "Sorteo Ordinario": "ordinario",
  "Sorteo Extraordinario": "extraordinario",
};

/** The draw list on /resultados/. */
export function parseSantaLuciaIndex(html) {
  const what = "Lotería Santa Lucía index";
  const cardCount = (html.match(/<article class="draw-card/g) ?? []).length;
  const cards = [...html.matchAll(
    /<article class="draw-card[^"]*" data-draw="(\d+)" data-type="(ordinario|extraordinario)">([\s\S]*?)<\/article>/g)];
  check(cards.length > 0, `${what}: no draw cards found`);
  check(cards.length === cardCount, `${what}: ${cardCount} draw cards but only ${cards.length} could be read`);

  return cards.map(([, sorteo, tipo, inner]) => {
    const at = `${what} sorteo ${sorteo}`;
    const h3 = /<h3>Sorteo No\. (\d+)<\/h3>/.exec(inner);
    check(h3 && h3[1] === sorteo, `${at}: heading does not match data-draw`);
    const fecha = /<dt>Fecha del sorteo<\/dt>\s*<dd>([^<]+)<\/dd>/.exec(inner);
    check(fecha, `${at}: no "Fecha del sorteo"`);
    const path = `/resultados/${tipo}/${sorteo}/`;
    check(inner.includes(`href="${path}"`), `${at}: no link to ${path}`);
    return { sorteo, tipo, drawDate: parseSpanishDate(text(fecha[1]), at), url: `${ORIGIN}${path}` };
  });
}

const PRIZES = ["Primer premio", "Segundo premio", "Tercer premio"];

/** One draw page, checked against the index entry that led to it. */
export function parseSantaLuciaDraw(html, ref) {
  const what = `Lotería Santa Lucía ${ref.tipo} ${ref.sorteo}`;
  const h1 = /<h1>Resultados Sorteo (Ordinario|Extraordinario) No\. (\d+)<\/h1>/.exec(html);
  check(h1, `${what}: no results heading`);
  check(h1[1].toLowerCase() === ref.tipo && h1[2] === ref.sorteo,
    `${what}: page is for ${h1[1]} ${h1[2]}`);

  const realizado = /Realizado el ([^<]+)<\/p>/.exec(html);
  check(realizado, `${what}: no draw date`);
  const drawDate = parseSpanishDate(text(realizado[1]), what);
  check(drawDate === ref.drawDate, `${what}: page date ${drawDate} disagrees with index date ${ref.drawDate}`);

  const grid = /<div class="major-grid">([\s\S]*?)<\/div>\s*<p class="prize-general-note">/.exec(html);
  check(grid, `${what}: main prizes block not found`);
  const cards = [...grid[1].matchAll(/<article class="major-card">\s*<p>([^<]+)<\/p>\s*<strong>([^<]*)<\/strong>/g)];
  check(cards.length === PRIZES.length, `${what}: expected ${PRIZES.length} main prizes, found ${cards.length}`);
  const numbers = cards.map(([, label, number], i) => {
    check(text(label) === PRIZES[i], `${what}: prize ${i + 1} is "${text(label)}", expected "${PRIZES[i]}"`);
    const n = text(number);
    check(/^\d{5}$/.test(n), `${what}: ${PRIZES[i]} "${n}" is not a 5-digit ticket number`);
    return n;
  });
  check(new Set(numbers).size === numbers.length, `${what}: repeated prize number ${numbers.join(" ")}`);

  const extras = { sorteo: ref.sorteo, tipo: ref.tipo };
  const reintegros = /<strong>Reintegros:\s*([^<]+)<\/strong>/.exec(html);
  if (reintegros) {
    const endings = text(reintegros[1]).split(/\s*(?:,|\by\b)\s*/).filter(Boolean);
    check(endings.length > 0 && endings.every((e) => /^\d$/.test(e)),
      `${what}: reintegros "${text(reintegros[1])}" are not single digits`);
    extras.reintegros = endings;
  }
  return { drawDate, drawTimeLocal: null, numbers, extras, sourceUrl: ref.url };
}

export const santaLucia = {
  games: Object.keys(GAMES),
  async draws(game, { get }) {
    const tipo = GAMES[game.name];
    const index = parseSantaLuciaIndex(await get(INDEX_URL));
    const ofType = index.filter((d) => d.tipo === tipo);
    check(ofType.length > 0, `Lotería Santa Lucía: no ${tipo} draw listed in the index`);
    const latest = ofType.reduce((a, b) => (Number(b.sorteo) > Number(a.sorteo) ? b : a));
    return [parseSantaLuciaDraw(await get(latest.url), latest)];
  },
};
