/**
 * OpenWeather's free forecast comes in 3-hour steps; the feed stores a day only
 * when those steps cover its morning low and afternoon high, on the place's own
 * calendar.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { openWeatherDays } from "../src/feeds/forecast.mjs";

/** Steps every 3 hours from `startIso` (UTC), `count` of them. */
function steps(startIso, count, temp = (i) => 20 + i, extra = () => ({})) {
  const start = Date.parse(startIso) / 1000;
  return Array.from({ length: count }, (_, i) => ({ dt: start + i * 10_800, main: { temp_max: temp(i), temp_min: temp(i) - 1 }, ...extra(i) }));
}

test("steps become local days: high, low, rain chance and millimetres", () => {
  // Honduras is UTC-6: 06:00Z is local midnight on the 14th.
  const now = Date.parse("2026-09-14T07:00:00Z");
  const j = { city: { timezone: -21_600 }, list: steps("2026-09-14T06:00:00Z", 24, (i) => 20 + (i % 8), (i) => ({ pop: i === 5 ? 0.8 : 0.1, rain: i < 8 ? { "3h": 1.5 } : undefined })) };
  const days = openWeatherDays(j, now);
  assert.deepEqual(days.map((d) => d.date), ["2026-09-14", "2026-09-15", "2026-09-16"]);
  assert.deepEqual(days[0], { date: "2026-09-14", tempMax: 27, tempMin: 19, precipProb: 80, precipMm: 12 });
});

test("a day whose remaining steps start after the morning is not reported", () => {
  // Toronto (UTC-4) at 16:00 local: today's steps are the evening only.
  const now = Date.parse("2026-09-14T20:00:00Z");
  const j = { city: { timezone: -14_400 }, list: steps("2026-09-14T21:00:00Z", 24) };
  const days = openWeatherDays(j, now);
  assert.ok(!days.some((d) => d.date === "2026-09-14"), "the evening is not today's high");
  assert.deepEqual(days.map((d) => d.date), ["2026-09-15", "2026-09-16"]);
});

test("days beyond the third, and malformed steps, are left out", () => {
  const now = Date.parse("2026-09-14T00:30:00Z");
  const list = [...steps("2026-09-14T00:00:00Z", 40), { dt: "x", main: {} }, { main: { temp_max: 1 } }];
  const days = openWeatherDays({ city: { timezone: 0 }, list }, now);
  assert.deepEqual(days.map((d) => d.date), ["2026-09-14", "2026-09-15", "2026-09-16"]);
  assert.deepEqual(openWeatherDays({}, now), []);
});
