/**
 * The clients list and code page helpers, and the strings table.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { splitClients, statusLabel, isUuid, isCountry, countryName, regionLabel, clientInstruction, COUNTRIES } from "../lib/clients.ts";
import { STRINGS, strings, monthLabel } from "../lib/strings.ts";

const row = (over) => ({
  id: "3f2c8a1e-9b7d-4c6e-8f10-2a3b4c5d6e7f", fullName: "X", code: "ACDEFG23", country: "MX", adminRegion: "Jalisco",
  status: "active", daysLeft: 100, periodEnd: "2027-03-13", isTest: false, active: true, createdAt: "2026-09-01T12:00:00.000Z",
  ...over,
});

test("renewals due soon come first, soonest first; everyone else newest first", () => {
  const rows = [
    row({ fullName: "Old active", createdAt: "2026-01-01T00:00:00.000Z" }),
    row({ fullName: "Due in 20", status: "due", daysLeft: 20, createdAt: "2026-03-01T00:00:00.000Z" }),
    row({ fullName: "Due in 3", status: "due", daysLeft: 3, createdAt: "2026-02-01T00:00:00.000Z" }),
    row({ fullName: "Lapsed", status: "lapsed", daysLeft: -4, createdAt: "2026-09-10T00:00:00.000Z" }),
  ];
  const { due, all } = splitClients(rows);
  assert.deepEqual(due.map((r) => r.fullName), ["Due in 3", "Due in 20"]);
  assert.deepEqual(all.map((r) => r.fullName), ["Lapsed", "Due in 20", "Due in 3", "Old active"]);
  assert.equal(rows[0].fullName, "Old active", "the input is not reordered in place");
  assert.deepEqual(splitClients([]), { due: [], all: [] });
});

test("status chips are words in both languages", () => {
  const es = strings("es"), en = strings("en");
  assert.deepEqual(["active", "due", "lapsed", "none"].map((s) => statusLabel(s, es)), ["Activo", "Renovar pronto", "Vencido", "Sin pago"]);
  assert.deepEqual(["active", "due", "lapsed", "none"].map((s) => statusLabel(s, en)), ["Active", "Renew soon", "Lapsed", "Not paid"]);
  assert.equal(es.daysLeft(0), "Vence hoy");
  assert.equal(es.daysLeft(1), "1 día");
  assert.equal(es.daysLeft(12), "12 días");
});

test("only a real uuid reaches the database as a client id", () => {
  assert.ok(isUuid("3f2c8a1e-9b7d-4c6e-8f10-2a3b4c5d6e7f"));
  for (const bad of ["", "1", "3f2c8a1e-9b7d-4c6e-8f10-2a3b4c5d6e7", "' or 1=1 --", undefined, ["3f2c8a1e-9b7d-4c6e-8f10-2a3b4c5d6e7f"]]) {
    assert.equal(isUuid(bad), false, String(bad));
  }
});

test("the four countries, in client-volume order, with their region names", () => {
  assert.deepEqual([...COUNTRIES], ["MX", "GT", "HN", "JM"]);
  assert.ok(isCountry("JM"));
  assert.equal(isCountry("jm"), false);
  assert.equal(isCountry("CA"), false);
  assert.equal(countryName("MX", "es"), "México");
  assert.equal(countryName("MX", "en"), "Mexico");
  assert.equal(regionLabel("JM", "es"), "Parroquia");
  assert.equal(regionLabel("HN", "en"), "Department");
});

test("the printed instruction is in the client's language", () => {
  assert.match(clientInstruction("en", null), /^Open Hoy on your phone/);
  assert.match(clientInstruction("es", null), /^Abre Hoy en tu teléfono/);
  assert.match(clientInstruction("es", "hoy.example.com"), /^Abre Hoy hoy\.example\.com en tu teléfono/);
});

test("Spanish and English have exactly the same strings", () => {
  const es = STRINGS.es, en = STRINGS.en;
  assert.deepEqual(Object.keys(en).sort(), Object.keys(es).sort());
  for (const k of Object.keys(es)) {
    assert.equal(typeof en[k], typeof es[k], k);
    if (typeof es[k] === "string") assert.ok(es[k].length > 0 && en[k].length > 0, k);
  }
  assert.equal(strings(undefined), es, "Spanish by default");
  assert.equal(strings("fr"), es);
});

test("the month label names the month in Leamington time", () => {
  // 03:30 UTC on 1 October is still 30 September in Toronto.
  assert.equal(monthLabel(new Date("2026-10-01T03:30:00Z"), "es"), "septiembre de 2026");
  assert.equal(monthLabel(new Date("2026-10-01T03:30:00Z"), "en"), "September 2026");
});
