/**
 * The Jamaica calendar check separates "published", "not published" and "could
 * not tell". "Not published" is never read as "no season".
 *
 *   npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { calendarVerdict } from "../verify/jpl-calendar.mjs";

const TODAY = "2026-09-13";
const jpl = (date, name = "Tivoli Gardens vs Humble Lions") => ({ idLeague: "5075", dateEvent: date, strEvent: name });
const days = (n, fill = () => []) => Array.from({ length: n }, (_, i) => {
  const date = new Date(Date.parse(`${TODAY}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10);
  return { date, answered: true, events: fill(date, i) };
});

test("only this week's round listed, every day answered: NOT_PUBLISHED", () => {
  const swept = days(56, (date, i) => (i <= 2 ? [jpl(date)] : []));
  const r = calendarVerdict(swept, { today: TODAY });
  assert.equal(r.verdict, "NOT_PUBLISHED");
  assert.equal(r.matchesListed, 3);
  assert.equal(r.matchesAhead, 0);
});

test("a match listed weeks ahead: PUBLISHED, even if some days did not answer", () => {
  const swept = days(56, (date, i) => (i === 20 ? [jpl(date)] : []));
  swept[5] = { date: swept[5].date, answered: false, reason: "HTTP 500", events: [] };
  const r = calendarVerdict(swept, { today: TODAY });
  assert.equal(r.verdict, "PUBLISHED");
  assert.equal(r.matchesPerWeek["3"], 1);
});

test("nothing ahead and a day that did not answer: INCONCLUSIVE, not NOT_PUBLISHED", () => {
  const swept = days(56);
  swept[30] = { date: swept[30].date, answered: false, reason: "unreachable: ENOTFOUND", events: [] };
  const r = calendarVerdict(swept, { today: TODAY });
  assert.equal(r.verdict, "INCONCLUSIVE");
  assert.deepEqual(r.unansweredDays, [`${swept[30].date}: unreachable: ENOTFOUND`]);
});

test("events from another league are not Jamaica fixtures", () => {
  const swept = days(56, (date, i) => (i === 20 ? [{ idLeague: "4328", dateEvent: date, strEvent: "Arsenal vs Chelsea" }] : []));
  const r = calendarVerdict(swept, { today: TODAY });
  assert.equal(r.verdict, "NOT_PUBLISHED");
  assert.equal(r.matchesListed, 0);
});
