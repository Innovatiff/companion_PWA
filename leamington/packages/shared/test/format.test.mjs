/**
 * Dates, times and money in the forms docs/DESIGN.md specifies.
 *
 *   node --test test/*.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatDate, formatWeekdayDate, formatTime12, localDate, formatMoney } from "../src/format.ts";

test("calendar dates read as people write them", () => {
  assert.equal(formatDate("2026-03-03", "es"), "3 de marzo");
  assert.equal(formatDate("2026-03-03", "en"), "3 March");
  assert.equal(formatDate("2026-12-24", "es", true), "24 de diciembre de 2026");
  assert.equal(formatWeekdayDate("2026-09-13", "es"), "domingo 13 de septiembre");
  assert.equal(formatWeekdayDate("2026-09-13", "en"), "Sunday 13 September");
});

test("times read as 7pm or 7:30pm in the given timezone", () => {
  assert.equal(formatTime12("2026-09-13T23:00:00Z", "America/Toronto"), "7pm");
  assert.equal(formatTime12("2026-09-13T23:30:00Z", "America/Toronto"), "7:30pm");
  assert.equal(formatTime12("2026-09-13T13:05:00Z", "America/Jamaica"), "8:05am");
});

test("a moment's calendar date depends on the timezone", () => {
  assert.equal(localDate("2026-09-14T02:00:00Z", "America/Toronto"), "2026-09-13");
  assert.equal(localDate("2026-09-14T02:00:00Z", "UTC"), "2026-09-14");
});

test("money is CAD with two decimals", () => {
  assert.equal(formatMoney(20), "$20.00");
  assert.equal(formatMoney("8"), "$8.00");
  assert.equal(formatMoney(-4.5), "-$4.50");
  assert.equal(formatMoney(null), "$0.00");
});
