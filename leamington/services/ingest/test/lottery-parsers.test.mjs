/**
 * Lottery parsers against real operator responses (test/fixtures/lottery/).
 * Pure: no network, no database.
 *   node --test test/lottery*.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { parseSupremeVentures } from "../src/feeds/lottery/jamaica.mjs";
import { parseLoteriaNacional } from "../src/feeds/lottery/mexico.mjs";
import { parseSantaLuciaIndex, parseSantaLuciaDraw } from "../src/feeds/lottery/guatemala.mjs";
import { parseLotoHonduras, datesToFetch } from "../src/feeds/lottery/honduras.mjs";

const fixture = (name) => readFileSync(new URL(`./fixtures/lottery/${name}`, import.meta.url), "utf8");
// Roughly when the fixtures were fetched: 15:50 in Mexico City and Tegucigalpa.
const NOW = new Date("2026-09-13T21:50:00Z");
const game = (country, name) => ({ country, name });
const throwsParse = (fn, re) => assert.throws(fn, (err) => err.inconclusive === true && (!re || re.test(err.message)));

// ---------------------------------------------------------------- Jamaica

test("Cash Pot: twelve draws with slot times from the operator's labels", () => {
  const draws = parseSupremeVentures(fixture("jm-svl-cash-pot.json"), game("JM", "Cash Pot"));
  assert.equal(draws.length, 12);
  assert.deepEqual(draws[0], {
    drawDate: "2026-09-13", drawTimeLocal: "15:00", numbers: ["34"],
    extras: { drawNumber: "38354", megaBall: false },
  });
  assert.deepEqual(draws.find((d) => d.drawDate === "2026-09-12" && d.drawTimeLocal === "20:25"), {
    drawDate: "2026-09-12", drawTimeLocal: "20:25", numbers: ["15"],
    extras: { drawNumber: "38350", megaBall: true },
  });
  assert.deepEqual(draws.filter((d) => d.drawDate === "2026-09-12").map((d) => d.drawTimeLocal),
    ["20:25", "17:00", "15:00", "13:00", "10:30", "08:30"]);
});

test("Cash Pot: out-of-range, missing or unscheduled results throw", () => {
  const mutate = (fn) => { const j = JSON.parse(fixture("jm-svl-cash-pot.json")); fn(j["Cash Pot"]); return JSON.stringify(j); };
  const g = game("JM", "Cash Pot");
  throwsParse(() => parseSupremeVentures(mutate((l) => { l[0].gameResult.winNumber = "37"; }), g), /outside 1-36/);
  throwsParse(() => parseSupremeVentures(mutate((l) => { l[0].gameResult.winNumber = ""; }), g), /expected 1 numbers/);
  throwsParse(() => parseSupremeVentures(mutate((l) => { delete l[0].gameResult.winNumber; }), g), /no winNumber/);
  throwsParse(() => parseSupremeVentures(mutate((l) => { l[0].gameTime = "Late Night (11:00 PM)"; }), g), /not in the published schedule/);
  throwsParse(() => parseSupremeVentures(mutate((l) => { l[1].gameTime = l[0].gameTime; l[1].gameDate = l[0].gameDate; }), g), /appears twice/);
  throwsParse(() => parseSupremeVentures(mutate((l) => { l[0].gameDate = "2026-02-30"; }), g), /not a calendar date/);
  throwsParse(() => parseSupremeVentures(JSON.stringify({ "Cash Pot": [] }), g), /no draws/);
  throwsParse(() => parseSupremeVentures(fixture("jm-svl-pick-3.json"), g), /keyed "Cash Pot"/);
  throwsParse(() => parseSupremeVentures("<html>maintenance</html>", g), /not JSON/);
});

test("Pick 3: digits, five daily slots", () => {
  const draws = parseSupremeVentures(fixture("jm-svl-pick-3.json"), game("JM", "Pick 3"));
  assert.equal(draws.length, 10);
  assert.deepEqual(draws[0], { drawDate: "2026-09-13", drawTimeLocal: "13:00", numbers: ["8", "8", "1"],
    extras: { drawNumber: "31515", megaBall: false } });
  assert.deepEqual(draws.find((d) => d.drawDate === "2026-09-12" && d.drawTimeLocal === "20:25").numbers, ["3", "5", "1"]);
  const j = JSON.parse(fixture("jm-svl-pick-3.json"));
  j["Pick 3"][0].gameResult.winNumber = " 88";
  throwsParse(() => parseSupremeVentures(JSON.stringify(j), game("JM", "Pick 3")), /not 3 digits/);
});

test("Lotto: six numbers and the bonus ball; wrong count or repeats throw", () => {
  const draws = parseSupremeVentures(fixture("jm-svl-lotto.json"), game("JM", "Lotto"));
  assert.equal(draws.length, 4);
  assert.deepEqual(draws[0], { drawDate: "2026-09-12", drawTimeLocal: "20:25",
    numbers: ["2", "4", "7", "18", "25", "29"], extras: { drawNumber: "2337", bonusBall: "35" } });
  assert.equal(draws[1].drawDate, "2026-09-09");
  assert.ok(!("next_jackpot" in draws[0].extras) && !("match3Payout" in draws[0].extras), "no payouts or jackpots");

  const mutate = (fn) => { const j = JSON.parse(fixture("jm-svl-lotto.json")); fn(j.Lotto[0].gameResult); return JSON.stringify(j); };
  throwsParse(() => parseSupremeVentures(mutate((r) => { r.winNumber = " 2 4 7 18 25"; }), game("JM", "Lotto")), /expected 6/);
  throwsParse(() => parseSupremeVentures(mutate((r) => { r.winNumber = " 2 2 7 18 25 29"; }), game("JM", "Lotto")), /repeated/);
  throwsParse(() => parseSupremeVentures(mutate((r) => { delete r.bonusBall; }), game("JM", "Lotto")), /bonus ball/);
  throwsParse(() => parseSupremeVentures(fixture("jm-svl-lotto.json"), game("JM", "Pick 4")), /no parser/);
});

// ---------------------------------------------------------------- Mexico

test("Melate: fifteen draws at 21:00 with the adicional", () => {
  const draws = parseLoteriaNacional(fixture("mx-melate-resultados.html"), game("MX", "Melate"), { now: NOW });
  assert.equal(draws.length, 15);
  assert.deepEqual(draws[0], { drawDate: "2026-09-11", drawTimeLocal: "21:00",
    numbers: ["5", "10", "12", "24", "31", "34"], extras: { concurso: "4264", adicional: "53" } });
  // Cross-checked against the operator's Melate.csv historic download: 4263,13,24,28,35,48,51,7,...,09/09/2026
  assert.deepEqual(draws[1], { drawDate: "2026-09-09", drawTimeLocal: "21:00",
    numbers: ["13", "24", "28", "35", "48", "51"], extras: { concurso: "4263", adicional: "7" } });
  assert.ok(draws.every((d) => d.drawTimeLocal === "21:00"));
});

test("Melate: a short combination, a missing table or the wrong page throws", () => {
  const html = fixture("mx-melate-resultados.html");
  const g = game("MX", "Melate");
  throwsParse(() => parseLoteriaNacional(html.replace("05 10 12 24 31 34-53</td>", "05 10 12 24 31-53</td>"), g, { now: NOW }), /six numbers/);
  throwsParse(() => parseLoteriaNacional(html.replace('id="tblResultados"', 'id="other"'), g, { now: NOW }), /history table/);
  throwsParse(() => parseLoteriaNacional(html.replace("05 10 12 24 31 34-53</td>", "05 10 12 24 31 57-53</td>"), g, { now: NOW }), /outside 1-56/);
  throwsParse(() => parseLoteriaNacional(fixture("mx-tris-resultados.html"), g, { now: NOW }), /not the Melate results page/);
});

test("Chispazo: two daily slots placed by sorteo order", () => {
  const draws = parseLoteriaNacional(fixture("mx-chispazo-resultados.html"), game("MX", "Chispazo"), { now: NOW });
  assert.equal(draws.length, 15);
  const at = (c) => draws.find((d) => d.extras.concurso === c);
  assert.deepEqual(at("12249"), { drawDate: "2026-09-13", drawTimeLocal: "15:00",
    numbers: ["4", "6", "17", "19", "21"], extras: { concurso: "12249" } });
  // Chispazo.csv: 12248,1,4,6,23,25,12/09/2026 and 12247,5,6,8,16,25,12/09/2026
  assert.deepEqual(at("12248"), { drawDate: "2026-09-12", drawTimeLocal: "21:00",
    numbers: ["1", "4", "6", "23", "25"], extras: { concurso: "12248" } });
  assert.equal(at("12247").drawTimeLocal, "15:00");
});

test("Chispazo: a gap in sorteo numbers, a bad number, or a draw not yet held throws", () => {
  const html = fixture("mx-chispazo-resultados.html");
  const g = game("MX", "Chispazo");
  const gap = html.replace(/<tr>\s*<td class="text-center">12246<\/td>[\s\S]*?<\/tr>/, "");
  throwsParse(() => parseLoteriaNacional(gap, g, { now: NOW }), /jump from 12247 to 12245/);
  throwsParse(() => parseLoteriaNacional(html.replaceAll("04 06 17 19 21", "04 06 17 19 29"), g, { now: NOW }), /outside 1-28/);
  throwsParse(() => parseLoteriaNacional(html.replace("<h3>04 06 17 19 21</h3>", "<h3>04 06 17 19 22</h3>"), g, { now: NOW }), /differs between/);
  throwsParse(() => parseLoteriaNacional(html, g, { now: new Date("2026-09-13T19:00:00Z") }), /has not happened yet/);
});

test("Tris: five slots, today's labelled draws agree, oldest day placed at its end", () => {
  const draws = parseLoteriaNacional(fixture("mx-tris-resultados.html"), game("MX", "Tris"), { now: NOW });
  assert.equal(draws.length, 15);
  const at = (c) => draws.find((d) => d.extras.concurso === c);
  assert.deepEqual(at("36629"), { drawDate: "2026-09-13", drawTimeLocal: "15:00",
    numbers: ["5", "8", "9", "7", "4"], extras: { concurso: "36629", multiplicador: true } });
  assert.equal(at("36628").drawTimeLocal, "13:00");
  // Tris.csv: 60,36627,7,5,7,8,7,12/09/2026,SI
  assert.deepEqual(at("36627"), { drawDate: "2026-09-12", drawTimeLocal: "21:00",
    numbers: ["7", "5", "7", "8", "7"], extras: { concurso: "36627", multiplicador: true } });
  assert.equal(at("36623").drawTimeLocal, "13:00");
  // Only three 10/09 draws fit in the 15-row window: they are that day's last three slots.
  assert.deepEqual(draws.filter((d) => d.drawDate === "2026-09-10").map((d) => d.drawTimeLocal), ["17:00", "19:00", "21:00"]);
});

test("Tris: a label that disagrees with the slot, or a 4-digit combination, throws", () => {
  const html = fixture("mx-tris-resultados.html");
  const g = game("MX", "Tris");
  throwsParse(() => parseLoteriaNacional(html.replace("<td>De las Tres</td>", "<td>De las Siete</td>"), g, { now: NOW }), /labelled 19:00/);
  throwsParse(() => parseLoteriaNacional(html.replace("<td>De las Tres</td>", "<td>Nocturno</td>"), g, { now: NOW }), /unknown draw type/);
  throwsParse(() => parseLoteriaNacional(html.replaceAll(">58974<", ">5897<"), g, { now: NOW }), /not 5 digits/);
  throwsParse(() => parseLoteriaNacional(html.replace("<td>SI</td>", "<td>2X</td>"), g, { now: NOW }), /multiplicador/);
});

// ---------------------------------------------------------------- Guatemala

test("Santa Lucía index: every listed draw with its type and date", () => {
  const index = parseSantaLuciaIndex(fixture("gt-resultados-index.html"));
  assert.equal(index.length, 26);
  assert.deepEqual(index[0], { sorteo: "3136", tipo: "ordinario", drawDate: "2026-09-12",
    url: "https://prociegosysordos.org.gt/resultados/ordinario/3136/" });
  assert.deepEqual(index.find((d) => d.tipo === "extraordinario"), { sorteo: "414", tipo: "extraordinario",
    drawDate: "2026-08-15", url: "https://prociegosysordos.org.gt/resultados/extraordinario/414/" });
  throwsParse(() => parseSantaLuciaIndex(fixture("gt-resultados-index.html").replace('data-draw="3135" data-type="ordinario"', 'data-type="ordinario" data-draw="3135"')), /only 25 could be read/);
  throwsParse(() => parseSantaLuciaIndex("<html></html>"), /no draw cards/);
});

test("Santa Lucía draw pages: the three main prizes and reintegros", () => {
  const index = parseSantaLuciaIndex(fixture("gt-resultados-index.html"));
  const ord = parseSantaLuciaDraw(fixture("gt-ordinario-3136.html"), index[0]);
  assert.deepEqual(ord, { drawDate: "2026-09-12", drawTimeLocal: null, numbers: ["59251", "36106", "64532"],
    extras: { sorteo: "3136", tipo: "ordinario", reintegros: ["1", "6", "2"] },
    sourceUrl: "https://prociegosysordos.org.gt/resultados/ordinario/3136/" });
  const ext = parseSantaLuciaDraw(fixture("gt-extraordinario-414.html"), index.find((d) => d.sorteo === "414"));
  assert.deepEqual(ext.numbers, ["08125", "69132", "44813"]);
  assert.deepEqual(ext.extras, { sorteo: "414", tipo: "extraordinario", reintegros: ["2", "3"] });
});

test("Santa Lucía draw pages: a missing prize, the wrong draw or date, or a short number throws", () => {
  const index = parseSantaLuciaIndex(fixture("gt-resultados-index.html"));
  const html = fixture("gt-ordinario-3136.html");
  const noThird = html.replace(/<article class="major-card">\s*<p>Tercer premio<\/p>[\s\S]*?<\/article>/, "");
  throwsParse(() => parseSantaLuciaDraw(noThird, index[0]), /expected 3 main prizes, found 2/);
  throwsParse(() => parseSantaLuciaDraw(html, index[1]), /page is for Ordinario 3136/);
  throwsParse(() => parseSantaLuciaDraw(html, { ...index[0], drawDate: "2026-09-05" }), /disagrees with index date/);
  throwsParse(() => parseSantaLuciaDraw(html.replace("<strong>59251</strong>", "<strong>5925</strong>"), index[0]), /5-digit/);
  throwsParse(() => parseSantaLuciaDraw(html.replace("Reintegros: 1, 6 y 2", "Reintegros: uno"), index[0]), /reintegros/);
});

// ---------------------------------------------------------------- Honduras

test("La Diaria: three slots with Más 1; an unpublished slot today is skipped, never zero", () => {
  const g = game("HN", "La Diaria");
  assert.deepEqual(parseLotoHonduras(fixture("hn-diaria-2026-09-12.json"), g, { date: "2026-09-12", now: NOW }), [
    { drawDate: "2026-09-12", drawTimeLocal: "11:00", numbers: ["21"], extras: { mas1: "9" } },
    { drawDate: "2026-09-12", drawTimeLocal: "15:00", numbers: ["93"], extras: { mas1: "8" } },
    { drawDate: "2026-09-12", drawTimeLocal: "21:00", numbers: ["46"], extras: { mas1: "7" } },
  ]);
  const today = parseLotoHonduras(fixture("hn-diaria-2026-09-13.json"), g, { date: "2026-09-13", now: NOW });
  assert.deepEqual(today.map((d) => [d.drawTimeLocal, d.numbers[0], d.extras.mas1]), [["11:00", "11", "7"], ["15:00", "24", "0"]]);
});

test("La Diaria: a missing slot on a past day, a bad number or a moved slot throws", () => {
  const g = game("HN", "La Diaria");
  const past = fixture("hn-diaria-2026-09-13.json");
  throwsParse(() => parseLotoHonduras(past, g, { date: "2026-09-13", now: new Date("2026-09-14T12:00:00Z") }), /day that has passed/);
  const mutate = (fn) => { const j = JSON.parse(fixture("hn-diaria-2026-09-12.json")); fn(j); return JSON.stringify(j); };
  throwsParse(() => parseLotoHonduras(mutate((j) => { j["11"].diaria.par1 = "7"; }), g, { date: "2026-09-12", now: NOW }), /not 00-99/);
  throwsParse(() => parseLotoHonduras(mutate((j) => { delete j["11"].mas1; }), g, { date: "2026-09-12", now: NOW }), /missing diaria or mas1/);
  throwsParse(() => parseLotoHonduras(mutate((j) => { j["15"].diaria.hora = "18:58:00.0000000"; }), g, { date: "2026-09-12", now: NOW }), /not the 15:00 draw/);
  throwsParse(() => parseLotoHonduras(mutate((j) => { delete j["21"]; }), g, { date: "2026-09-12", now: NOW }), /expected slots/);
  throwsParse(() => parseLotoHonduras(fixture("hn-diaria-2026-09-12.json"), g, { date: "2026-09-14", now: NOW }), /future/);
});

test("Jugá 3: three digits per slot", () => {
  const g = game("HN", "Jugá 3");
  assert.deepEqual(parseLotoHonduras(fixture("hn-juga3-2026-09-12.json"), g, { date: "2026-09-12", now: NOW }).map((d) => [d.drawTimeLocal, d.numbers]),
    [["11:00", ["7", "7", "0"]], ["15:00", ["4", "2", "1"]], ["21:00", ["9", "1", "3"]]]);
  assert.equal(parseLotoHonduras(fixture("hn-juga3-2026-09-13.json"), g, { date: "2026-09-13", now: NOW }).length, 2);
  const j = JSON.parse(fixture("hn-juga3-2026-09-12.json"));
  j["11"].par1 = "77";
  throwsParse(() => parseLotoHonduras(JSON.stringify(j), g, { date: "2026-09-12", now: NOW }), /not 3 digits/);
});

test("Super Premio: six numbers on Wednesday and Saturday; an empty past draw day throws", () => {
  const g = game("HN", "Super Premio");
  assert.deepEqual(parseLotoHonduras(fixture("hn-superpremio-2026-09-12.json"), g, { date: "2026-09-12", now: NOW }), [
    { drawDate: "2026-09-12", drawTimeLocal: "21:00", numbers: ["6", "13", "14", "21", "25", "33"], extras: {} },
  ]);
  assert.deepEqual(parseLotoHonduras(fixture("hn-superpremio-2026-09-09.json"), g, { date: "2026-09-09", now: NOW })[0].numbers,
    ["1", "2", "8", "23", "24", "25"]);
  // The real [] answer: before a draw is published it is "not yet", after the day it is unexpected.
  const empty = fixture("hn-superpremio-2026-09-13.json");
  assert.deepEqual(parseLotoHonduras(empty, g, { date: "2026-09-16", now: new Date("2026-09-16T20:00:00Z") }), []);
  throwsParse(() => parseLotoHonduras(empty, g, { date: "2026-09-12", now: NOW }), /past draw day/);
  throwsParse(() => parseLotoHonduras(empty, g, { date: "2026-09-13", now: NOW }), /not a Super Premio draw day/);
  const j = JSON.parse(fixture("hn-superpremio-2026-09-12.json"));
  delete j.par6;
  throwsParse(() => parseLotoHonduras(JSON.stringify(j), g, { date: "2026-09-12", now: NOW }), /unexpected fields/);
  throwsParse(() => parseLotoHonduras(JSON.stringify({ ...JSON.parse(fixture("hn-superpremio-2026-09-12.json")), par6: "34" }), g, { date: "2026-09-12", now: NOW }), /outside 1-33/);
});

test("Honduras asks for the last two days, or the last two Super Premio draw days", () => {
  assert.deepEqual(datesToFetch(game("HN", "La Diaria"), NOW), ["2026-09-12", "2026-09-13"]);
  assert.deepEqual(datesToFetch(game("HN", "Super Premio"), NOW), ["2026-09-09", "2026-09-12"]);
});
