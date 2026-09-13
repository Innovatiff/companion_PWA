/**
 * Jamaica -- Supreme Ventures Ltd (operator).
 *
 * Source: the JSON API behind the results widget on https://supremeventures.com/.
 * The site's WordPress plugin (vwp-svl-results) embeds `ivr_api_url` and
 * `ivr_api_key` in the page and calls
 *   GET {ivr_api_url}/game/result/gameId/{id}/no/{count}
 * with `Authorization: Bearer {ivr_api_key}`. We call the same endpoint. The key
 * is the public one the operator ships to every browser; if it is rotated the
 * API answers HTTP 500 and the run reports the game as failed.
 *
 * The host the live site uses is `test-results.supremeventures.com`
 * (`results.supremeventures.com` answered identically on 2026-09-13).
 *
 * Verified 2026-09-13 against real responses (test/fixtures/lottery/jm-svl-*.json).
 * Schedules from the operator's game pages (supremeventures.com/game/...):
 *   Cash Pot  8:30 AM | 10:30 AM | 1:00 PM | 3:00 PM | 5:00 PM | 8:25 PM daily
 *   Pick 3    8:30 AM | 10:30 AM | 1:00 PM | 5:00 PM | 8:25 PM daily
 *   Lotto     Wednesdays and Saturdays at 8:25 PM
 *   (every day except Christmas Day and Good Friday)
 *
 * Stored: winning numbers, the operator's draw number, Lotto's bonus ball, and
 * the MEGA flag the widget renders for Cash Pot / Pick 3. Not stored: winner
 * counts, payouts, next jackpot.
 */
import { assertSchedule, balls, check, digits, parseIsoDate, parseJson } from "./common.mjs";

export const API_BASE = "https://test-results.supremeventures.com/public";
export const API_KEY = "dMRwmGYPbpe28zts2z8rGdCjbIWU8FSTcMsoTQoT";

export const GAMES = {
  "Cash Pot": { gameId: 1, count: 12, times: ["08:30", "10:30", "13:00", "15:00", "17:00", "20:25"] },
  "Pick 3":   { gameId: 7, count: 10, times: ["08:30", "10:30", "13:00", "17:00", "20:25"] },
  "Lotto":    { gameId: 5, count: 4,  times: ["20:25"] },
};

export const resultsUrl = (name) =>
  `${API_BASE}/game/result/gameId/${GAMES[name].gameId}/no/${GAMES[name].count}`;

/** "Mid Afternoon (3:00 PM)" -> "15:00" */
function labelTime(label, what) {
  const m = /^[A-Za-z ]+ \((\d{1,2}):(\d{2}) ?(AM|PM)\)$/.exec(String(label ?? "").trim());
  check(m, `${what}: draw label "${label}" has no recognisable time`);
  let h = Number(m[1]);
  const min = Number(m[2]);
  check(h >= 1 && h <= 12 && min < 60, `${what}: "${label}" is not a clock time`);
  if (m[3] === "AM" && h === 12) h = 0;
  if (m[3] === "PM" && h !== 12) h += 12;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

function megaFlag(value, what) {
  check(value === "0" || value === "1", `${what}: megaBall "${value}" is not 0 or 1`);
  return value === "1";
}

/** Parse /game/result/gameId/{id}/no/{n} for one game. */
export function parseSupremeVentures(body, game) {
  const spec = GAMES[game.name];
  check(spec, `Supreme Ventures: no parser for game "${game.name}"`);
  const what = `Supreme Ventures ${game.name}`;

  const data = parseJson(body, what);
  check(data && typeof data === "object" && !Array.isArray(data), `${what}: response is not an object`);
  const keys = Object.keys(data);
  check(keys.length === 1 && keys[0] === game.name,
    `${what}: expected one list keyed "${game.name}", got ${JSON.stringify(keys)}`);
  const list = data[game.name];
  check(Array.isArray(list) && list.length > 0, `${what}: no draws in the response`);
  check(list.length <= spec.count, `${what}: asked for ${spec.count} draws, got ${list.length}`);

  const seen = new Set();
  return list.map((item, i) => {
    const at = `${what} [${i}]`;
    const drawDate = parseIsoDate(item?.gameDate, at);
    const drawTimeLocal = labelTime(item?.gameTime, at);
    check(spec.times.includes(drawTimeLocal),
      `${at}: draw time ${drawTimeLocal} ("${item.gameTime}") is not in the published schedule`);
    const slot = `${drawDate} ${drawTimeLocal}`;
    check(!seen.has(slot), `${at}: draw ${slot} appears twice`);
    seen.add(slot);

    const r = item.gameResult;
    check(r && typeof r === "object", `${at}: no gameResult`);
    check(/^\d+$/.test(String(r.drawNumber ?? "")), `${at}: drawNumber "${r.drawNumber}" is not numeric`);
    check(typeof r.winNumber === "string", `${at}: no winNumber`);
    const parts = r.winNumber.trim().split(/\s+/).filter(Boolean);
    const extras = { drawNumber: r.drawNumber };
    let numbers;

    if (game.name === "Cash Pot") {
      numbers = balls(parts, { count: 1, min: 1, max: 36, what: at });
      if ("megaBall" in r) extras.megaBall = megaFlag(r.megaBall, at);
    } else if (game.name === "Pick 3") {
      check(parts.length === 1, `${at}: winNumber "${r.winNumber}" is not one 3-digit number`);
      numbers = digits(parts[0], 3, at);
      if ("megaBall" in r) extras.megaBall = megaFlag(r.megaBall, at);
    } else {
      numbers = balls(parts, { count: 6, min: 1, max: 38, what: at });
      const [bonus] = balls([r.bonusBall], { count: 1, min: 1, max: 38, what: `${at} bonus ball` });
      check(!numbers.includes(bonus), `${at}: bonus ball ${bonus} repeats a main number`);
      extras.bonusBall = bonus;
    }
    return { drawDate, drawTimeLocal, numbers, extras };
  });
}

export const supremeVentures = {
  games: Object.keys(GAMES),
  async draws(game, { get }) {
    assertSchedule(game, GAMES[game.name].times);
    const url = resultsUrl(game.name);
    const body = await get(url, { headers: { authorization: `Bearer ${API_KEY}` } });
    return parseSupremeVentures(body, game).map((d) => ({ ...d, sourceUrl: url }));
  },
};
