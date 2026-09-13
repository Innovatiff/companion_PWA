/**
 * Collecting a renewal in person: reading the typed code, where each database
 * answer sends the affiliate, and the words on the status, receipt and earnings.
 *
 *   node --test test/*.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  lookupCode, lookupRedirect, recordRedirect, renewStatusLabel, periodPlacement, registeredByLabel, collectedByLabel,
  commissionOf, slipLang, ticked, isRenewError, refusedAffiliate,
} from "../lib/renew.ts";
import { strings } from "../lib/strings.ts";

const ID = "3f2c8a1e-9b7d-4c6e-8f10-2a3b4c5d6e7f";
const KEY = "aaaaaaaa-0000-4000-8000-000000000001";

test("a typed code is normalised; anything that cannot be a code is refused before the database", () => {
  assert.equal(lookupCode("ACDE-FG34"), "ACDEFG34");
  assert.equal(lookupCode(" acde fg34 "), "ACDEFG34");
  assert.equal(lookupCode("0CDE-FG34"), "QCDEFG34", "a 0 read aloud for Q still finds the client");
  for (const bad of ["", "ACDE", "ACDE-FG345", "ACDE-FG3!", "BBBBBBBBB", "x".repeat(200)]) {
    assert.equal(lookupCode(bad), null, bad);
  }
});

test("lookup answers: found goes to the client, the rest back to /renew with a reason and no code", () => {
  assert.equal(lookupRedirect({ status: "found", client_id: ID }), `/renew/${ID}`);
  assert.equal(lookupRedirect({ status: "not_found" }), "/renew?e=not_found");
  assert.equal(lookupRedirect({ status: "throttled" }), "/renew?e=throttled");
  assert.throws(() => lookupRedirect({ status: "found", client_id: "../admin" }), /unexpected/);
  assert.throws(() => lookupRedirect(null), /unexpected/, "no answer is a fault, never 'not found'");
});

test("record answers: renewed and duplicate show the same receipt; recent and inactive go back", () => {
  assert.equal(recordRedirect({ status: "renewed", request_key: KEY }, ID), `/renew/done/${KEY}`);
  assert.equal(recordRedirect({ status: "duplicate", request_key: KEY }, ID), `/renew/done/${KEY}`);
  assert.equal(recordRedirect({ status: "recent_renewal" }, ID), `/renew/${ID}?recent=1`);
  assert.equal(recordRedirect({ status: "client_inactive" }, ID), `/renew/${ID}?e=inactive`);
  assert.throws(() => recordRedirect({ status: "renewed" }, ID), /unexpected/);
  assert.throws(() => recordRedirect(undefined, ID), /unexpected/);
});

test("the status chip is words, with days left when due", () => {
  const es = strings("es"), en = strings("en");
  assert.equal(renewStatusLabel("active", 120, es), "Activo");
  assert.equal(renewStatusLabel("due", 12, es), "Vence en 12 días");
  assert.equal(renewStatusLabel("due", 1, es), "Vence en 1 día");
  assert.equal(renewStatusLabel("due", 0, es), "Vence hoy");
  assert.equal(renewStatusLabel("lapsed", -40, es), "Vencido");
  assert.equal(renewStatusLabel("none", null, es), "Sin periodo pagado");
  assert.equal(renewStatusLabel("due", 3, en), "Ends in 3 days");
});

test("a lapsed or never-paid client starts today; anyone else extends from the current end", () => {
  assert.equal(periodPlacement("lapsed"), "lapsed");
  assert.equal(periodPlacement("none"), "none");
  assert.equal(periodPlacement("due"), "extends");
  assert.equal(periodPlacement("active"), "extends");
});

test("who registered the client, and who collected a renewal", () => {
  const es = strings("es");
  assert.equal(registeredByLabel({ name: "Tienda Ana", is_you: false, is_house: false, active: true }, es), "Registrado por: Tienda Ana");
  assert.equal(registeredByLabel({ name: "Tienda Ana", is_you: true, is_house: false, active: true }, es), "Registrado por: ti");
  assert.equal(registeredByLabel({ name: "Registro directo del propietario", is_you: false, is_house: true, active: true }, es),
    "Registrado por: Hoy (registro directo)");
  assert.equal(collectedByLabel({ collected_by_owner: false, collected_by_other: false }, es), "ti");
  assert.equal(collectedByLabel({ collected_by_owner: false, collected_by_other: true }, es), "otro afiliado");
  assert.equal(collectedByLabel({ collected_by_owner: true, collected_by_other: true }, es), "Hoy");
});

test("commission is price times rate, to the cent", () => {
  assert.equal(commissionOf("20.00", "0.4000"), "8.00");
  assert.equal(commissionOf(20, 0.35), "7.00");
  assert.equal(commissionOf("20.00", "0.333"), "6.66");
  assert.equal(commissionOf("20.00", "0"), "0.00");
});

test("the earnings lines count renewals others collected, in both languages", () => {
  assert.equal(strings("es").renewalsByOthers(3, "$24.00"), "3 renovaciones de tus clientes las cobró otro afiliado u Hoy — igual ganaste $24.00.");
  assert.equal(strings("es").renewalsByOthers(1, "$8.00"), "1 renovación de tus clientes la cobró otro afiliado u Hoy — igual ganaste $8.00.");
  assert.match(strings("en").renewalsByOthers(2, "$16.00"), /^2 renewals of your clients were collected/);
  assert.equal(strings("es").collectButton("$20.00"), "Cobré $20.00 — renovar");
});

test("small things: slip language, checkbox, error names, refused affiliate", () => {
  assert.equal(slipLang("JM"), "en");
  assert.equal(slipLang("HN"), "es");
  assert.ok(ticked("1") && ticked("on"));
  assert.ok(!ticked("") && !ticked(undefined) && !ticked("0"));
  assert.ok(isRenewError("not_found") && isRenewError("inactive"));
  assert.ok(!isRenewError("found") && !isRenewError(["invalid"]));
  assert.ok(refusedAffiliate({ code: "42501" }));
  assert.ok(!refusedAffiliate(new Error("x")) && !refusedAffiliate(null));
});
