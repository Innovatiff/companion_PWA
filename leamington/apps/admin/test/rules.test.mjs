/**
 * The owner portal's pure rules.
 *
 *   node --test test/*.test.mjs      (Node 22.18+ runs the .ts import directly)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as r from "../lib/rules.ts";

test("commission percentages become exact rates, and anything else is refused", () => {
  assert.equal(r.parsePercent("40"), "0.4000");
  assert.equal(r.parsePercent(" 40% "), "0.4000");
  assert.equal(r.parsePercent("37.5"), "0.3750");
  assert.equal(r.parsePercent("12,25"), "0.1225");
  assert.equal(r.parsePercent("0"), "0.0000");
  assert.equal(r.parsePercent("100"), "1.0000");
  for (const bad of ["", "101", "-5", "40.123", "abc", "4 0", "1e2"]) assert.equal(r.parsePercent(bad), null, bad);
  assert.equal(r.percentLabel("0.4000"), "40%");
  assert.equal(r.percentLabel("0.3750"), "37.5%");
  assert.equal(r.percentLabel("0.1225"), "12.25%");
  assert.equal(r.percentInput("0.4000"), "40");
});

test("amounts parse to cents-exact strings; zero, negatives and thousands separators are refused", () => {
  assert.equal(r.parseAmount("24"), "24.00");
  assert.equal(r.parseAmount("$24.5"), "24.50");
  assert.equal(r.parseAmount("24,50"), "24.50");
  assert.equal(r.parseAmount("0.01"), "0.01");
  for (const bad of ["0", "0.00", "-3", "1,000.00", "1.000,00", "24.555", "", "abc"]) assert.equal(r.parseAmount(bad), null, bad);
  assert.equal(r.toCents("8.00"), 800);
  assert.equal(r.toCents("0.1") + r.toCents("0.2"), 30, "no float drift");
  assert.equal(r.centsToString(-1205), "-12.05");
});

test("login names follow the database rule", () => {
  assert.equal(r.normalizeLogin("  Ana.Tienda "), "ana.tienda");
  assert.equal(r.normalizeLogin("ab"), null);
  assert.equal(r.normalizeLogin("ana tienda"), null);
  assert.equal(r.normalizeLogin("x".repeat(41)), null);
});

const aff = (name, o = {}) => ({
  affiliate_id: name, name, active: true, is_test: false, is_house: false,
  sales_7d: 0, sales_30d: 0, sales_all: 0, last_sale_at: null, ...o,
});

test("sales sort puts busy affiliates first and quiet ones at the bottom of the real group", () => {
  const rows = [
    aff("Quiet", { sales_all: 30, last_sale_at: "2026-01-01T00:00:00Z" }),
    aff("Test", { is_test: true, sales_30d: 99 }),
    aff("House", { is_house: true, sales_30d: 50 }),
    aff("Busy", { sales_7d: 3, sales_30d: 9 }),
    aff("Steady", { sales_7d: 0, sales_30d: 9 }),
    aff("Gone", { active: false, sales_30d: 4 }),
    aff("Never"),
  ];
  assert.deepEqual(r.sortSales(rows).map((x) => x.name), ["Busy", "Steady", "Quiet", "Never", "House", "Gone", "Test"]);
  assert.equal(r.isQuiet(rows[0]), true);
  assert.equal(r.isQuiet(rows[2]), false, "the house affiliate is not an affiliate who stopped selling");
  assert.equal(r.isQuiet(rows[5]), false, "an inactive affiliate is marked inactive, not quiet");
});

test("renewals: who collected and earns, in words, and a lapse rate that is never a false 0%", () => {
  assert.equal(r.collectorLabel({ collected_by_owner: true, collecting_affiliate: null }, "Dueño — sin comisión"), "Dueño — sin comisión");
  assert.equal(r.collectorLabel({ collected_by_owner: false, collecting_affiliate: "Beto" }, "Dueño — sin comisión"), "Beto");
  assert.equal(r.lapseRateLabel(null), null, "nobody has come due: no percentage at all");
  assert.equal(r.lapseRateLabel(undefined), null);
  assert.equal(r.lapseRateLabel("0.0000"), "0%", "someone came due and nobody lapsed: a real 0%");
  assert.equal(r.lapseRateLabel("0.3333"), "33.33%");
  assert.equal(r.lapseRateLabel("1.0000"), "100%");
  const rows = [aff("Zeta Test", { is_test: true }), aff("Directo", { is_house: true }), aff("Gone", { active: false }), aff("Bea"), aff("Al")];
  assert.deepEqual(r.sortAffiliateGroups(rows).map((x) => x.name), ["Al", "Bea", "Directo", "Gone", "Zeta Test"]);
});

test("feed health: ok, stale and error stay distinct; anything undetermined is never ok", () => {
  assert.equal(r.feedState("ok"), "ok");
  assert.equal(r.feedState("stale"), "stale");
  assert.equal(r.feedState("failing"), "error");
  assert.equal(r.feedState("never_succeeded"), "error");
  assert.equal(r.feedState("degraded"), "error");
  for (const x of ["never_run", null, undefined, "", "something_new"]) assert.equal(r.feedState(x), "unknown", String(x));

  const rows = [
    { feed: "fx", health: "ok", last_ok_at: "2026-09-13T10:00:00Z" },
    { feed: "lottery", health: "never_run", last_ok_at: null },
    { feed: "forecast", health: "stale", last_ok_at: "2026-09-12T00:00:00Z" },
    { feed: "fixtures", health: "failing", last_ok_at: "2026-09-13T09:00:00Z" },
    { feed: "alerts:JM", health: "stale", last_ok_at: "2026-09-13T01:00:00Z" },
    { feed: "static", health: "weird", last_ok_at: null },
  ];
  assert.deepEqual(r.sortFeeds(rows).map((x) => x.feed), ["fixtures", "alerts:JM", "forecast", "lottery", "static", "fx"]);
});

test("sorting survives full ties on pg Date timestamps as well as ISO strings", () => {
  const older = new Date("2026-08-01T00:00:00Z"), newer = new Date("2026-09-01T00:00:00Z");
  const sales = [aff("B", { sales_30d: 2, last_sale_at: older }), aff("A", { sales_30d: 2, last_sale_at: newer }), aff("C", { sales_30d: 2, last_sale_at: null })];
  assert.deepEqual(r.sortSales(sales).map((x) => x.name), ["A", "B", "C"]);
  const feeds = [
    { feed: "fx", health: "ok", last_ok_at: newer },
    { feed: "forecast", health: "ok", last_ok_at: older },
    { feed: "static", health: "ok", last_ok_at: "2026-07-01T00:00:00.000Z" },
  ];
  assert.deepEqual(r.sortFeeds(feeds).map((x) => x.feed), ["static", "forecast", "fx"]);
  assert.equal(r.stamp(null), "");
});

test("revenue merges months with payouts only, newest first, and totals in cents", () => {
  const { lines, totals } = r.mergeRevenue(
    [
      { month: "2026-08", sales: 2, renewals: 0, gross: "40.00", affiliate_commissions: "16.00", net: "24.00" },
      { month: "2026-09", sales: 1, renewals: 1, gross: "40.00", affiliate_commissions: "8.00", net: "32.00" },
    ],
    [{ month: "2026-10", paid_out: "10.10" }, { month: "2026-09", paid_out: "16.00" }]);
  assert.deepEqual(lines.map((l) => l.month), ["2026-10", "2026-09", "2026-08"]);
  assert.equal(lines[0].gross, 0);
  assert.equal(lines[0].paidOut, 1010);
  assert.deepEqual(totals, { sales: 3, renewals: 1, gross: 8000, commissions: 2400, net: 5600, paidOut: 2610 });
});

test("labels: months and feed intervals", () => {
  assert.equal(r.monthLabel("2026-09", "es"), "septiembre 2026");
  assert.equal(r.monthLabel("2026-01", "en"), "January 2026");
  assert.equal(r.durationLabel(900, "es"), "15 min");
  assert.equal(r.durationLabel(21600, "en"), "6 h");
  assert.equal(r.durationLabel(86400, "es"), "1 día");
  assert.equal(r.durationLabel(604800, "en"), "7 days");
});

test("redirect targets, query strings and LIKE patterns are safe", () => {
  assert.equal(r.safeBack("/renewals"), "/renewals");
  assert.equal(r.safeBack("/clients/3f2c8a1e-9b7d-4c6e-8f10-2a3b4c5d6e7f"), "/clients/3f2c8a1e-9b7d-4c6e-8f10-2a3b4c5d6e7f");
  for (const bad of ["https://evil.example", "//evil.example", "/clients/x", "/clients/3f2c8a1e-9b7d-4c6e-8f10-2a3b4c5d6e7f/../../x", ""]) {
    assert.equal(r.safeBack(bad), "/renewals", bad);
  }
  assert.equal(r.qs({ a: "1", b: "", c: null, d: "x y" }), "?a=1&d=x+y");
  assert.equal(r.qs({}), "");
  assert.equal(r.containsPattern("50%_a\\b"), "%50\\%\\_a\\\\b%");
});

test("the setup token is shown only to the page of the affiliate it was issued for", () => {
  const id = "3f2c8a1e-9b7d-4c6e-8f10-2a3b4c5d6e7f";
  const token = "a".repeat(48);
  const v = r.encodeFlash(id, token);
  assert.equal(r.readFlash(v, id), token);
  assert.equal(r.readFlash(v, "00000000-0000-4000-8000-000000000000"), null);
  assert.equal(r.readFlash(`${id}.<script>`, id), null);
  assert.equal(r.readFlash(undefined, id), null);
  assert.equal(r.setupLink("https://afiliados.example/", token), `https://afiliados.example/setup?token=${token}`);
});

test("ids and enums are checked before they reach SQL", () => {
  assert.equal(r.isUuid("3f2c8a1e-9b7d-4c6e-8f10-2a3b4c5d6e7f"), true);
  assert.equal(r.isUuid("3f2c8a1e"), false);
  assert.equal(r.isCountry("JM"), true);
  assert.equal(r.isCountry("CA"), false);
  assert.equal(r.isClientStatus("due"), true);
  assert.equal(r.isClientStatus("paid"), false);
});
