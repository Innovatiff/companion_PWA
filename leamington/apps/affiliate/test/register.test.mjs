/**
 * Registering a client: the four fields, the round trip back to the form, and
 * the retry when a generated code collides.
 *
 *   node --test test/*.test.mjs      (Node 22.18+ runs the .ts imports directly)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  readRegisterInput, validateRegister, registerFormUrl, teamIdFor, withFreshCode, CodeExhaustedError, NO_TEAM, NAME_MAX,
} from "../lib/register.ts";
import { generateCode, formatCode } from "../../../packages/shared/src/code.ts";

const REGIONS = ["Kingston", "St. James"];

test("form values are trimmed, and the name's inner spaces collapsed", () => {
  assert.deepEqual(readRegisterInput({ country: " jm ", name: "  Ana   María  Pérez ", region: " St. James ", team: "" }),
    { country: "JM", name: "Ana María Pérez", region: "St. James", team: "" });
  assert.deepEqual(readRegisterInput(null), { country: "", name: "", region: "", team: "" });
  assert.equal(readRegisterInput({ name: ["Uno", "Dos"] }).name, "Uno", "a repeated query key uses the first");
  assert.equal(readRegisterInput({ name: 42 }).name, "", "a non-string is empty");
});

test("validation reports the first problem in field order", () => {
  const ok = { country: "JM", name: "Ana Pérez", region: "St. James", team: "" };
  assert.equal(validateRegister(ok, REGIONS, []), null);
  assert.equal(validateRegister({ ...ok, country: "CA" }, REGIONS, []), "country");
  assert.equal(validateRegister({ ...ok, name: "", region: "Nowhere" }, REGIONS, []), "name");
  assert.equal(validateRegister({ ...ok, name: "A" }, REGIONS, []), "name");
  assert.equal(validateRegister({ ...ok, name: "x".repeat(NAME_MAX + 1) }, REGIONS, []), "name");
  assert.equal(validateRegister({ ...ok, region: "Nowhere" }, REGIONS, []), "region");
  assert.equal(validateRegister({ ...ok, region: "st. james" }, REGIONS, []), "region", "regions match exactly, as the database does");
});

test("a team is required when the country has teams, and 'none' is an answer", () => {
  const mx = { country: "MX", name: "Luis Gómez", region: "Jalisco", team: "" };
  const regions = ["Jalisco"];
  assert.equal(validateRegister(mx, regions, ["7", "9"]), "team");
  assert.equal(validateRegister({ ...mx, team: "8" }, regions, ["7", "9"]), "team", "a team from another country is refused");
  assert.equal(validateRegister({ ...mx, team: "9" }, regions, ["7", "9"]), null);
  assert.equal(validateRegister({ ...mx, team: NO_TEAM }, regions, ["7", "9"]), null);
  assert.equal(validateRegister(mx, regions, []), null, "no teams in the country: nothing required");
  assert.equal(validateRegister({ ...mx, team: "9" }, regions, []), "team");
  assert.equal(teamIdFor({ ...mx, team: "9" }), 9);
  assert.equal(teamIdFor({ ...mx, team: NO_TEAM }), null);
  assert.equal(teamIdFor(mx), null);
});

test("an error returns to step 2 with what was typed", () => {
  const url = registerFormUrl({ country: "MX", name: "José Ñúñez & Hijos", region: "Baja California Sur", team: "none" }, "region");
  const q = new URL(url, "http://x").searchParams;
  assert.equal(new URL(url, "http://x").pathname, "/register");
  assert.equal(q.get("country"), "MX");
  assert.equal(q.get("name"), "José Ñúñez & Hijos");
  assert.equal(q.get("region"), "Baja California Sur");
  assert.equal(q.get("team"), "none");
  assert.equal(q.get("e"), "region");
  assert.deepEqual(readRegisterInput(Object.fromEntries(q)), { country: "MX", name: "José Ñúñez & Hijos", region: "Baja California Sur", team: "none" },
    "the register page reads back exactly what was sent");
  assert.equal(registerFormUrl({ country: "XX", name: "", region: "", team: "" }, "country"), "/register?e=country");
});

test("a collided code is retried with a new one, each attempt separately", async () => {
  const codes = ["AAAAAAAA", "CCCCCCCC", "DDDDDDDD"];
  const tried = [];
  const result = await withFreshCode(async (code) => {
    tried.push(code);
    if (tried.length < 3) throw Object.assign(new Error("duplicate key"), { code: "23505" });
    return `client-for-${code}`;
  }, () => codes.shift());
  assert.deepEqual(tried, ["AAAAAAAA", "CCCCCCCC", "DDDDDDDD"]);
  assert.equal(result, "client-for-DDDDDDDD");
});

test("after 5 collisions it gives up; any other error is thrown at once", async () => {
  let n = 0;
  await assert.rejects(
    withFreshCode(async () => { n++; throw Object.assign(new Error("dup"), { code: "23505" }); }, generateCode),
    (err) => err instanceof CodeExhaustedError && err.attempts === 5);
  assert.equal(n, 5);

  n = 0;
  await assert.rejects(
    withFreshCode(async () => { n++; throw Object.assign(new Error("check"), { code: "23514" }); }, generateCode),
    /check/);
  assert.equal(n, 1, "a check_violation is not a collision");
});

test("the code page shows codes grouped 4 + 4 from the unambiguous alphabet", () => {
  for (let i = 0; i < 200; i++) {
    assert.match(formatCode(generateCode()), /^[ACDEFGHJKMNPQRTVWXYZ2346]{4}-[ACDEFGHJKMNPQRTVWXYZ2346]{4}$/);
  }
  assert.equal(formatCode("ACDE2346"), "ACDE-2346");
});
