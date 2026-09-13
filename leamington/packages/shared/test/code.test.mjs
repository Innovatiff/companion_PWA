/**
 * Access codes: generated, validated and stored in one unambiguous alphabet,
 * and the app and the database agree on what that alphabet is.
 *
 *   node --test test/*.test.mjs      (Node 22.18+ runs the .ts import directly)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CODE_ALPHABET, CODE_LENGTH, generateCode, normalizeCode, isValidCode, formatCode } from "../src/code.ts";

const AMBIGUOUS = ["O", "0", "I", "1", "L", "S", "5", "B", "8", "U"];

test("the alphabet contains none of the ambiguous characters, and no duplicates", () => {
  for (const ch of AMBIGUOUS) assert.ok(!CODE_ALPHABET.includes(ch), `${ch} must not be in the alphabet`);
  assert.equal(new Set(CODE_ALPHABET).size, CODE_ALPHABET.length);
});

test("the database constrains clients.code to exactly the same alphabet and length", () => {
  const sql = readFileSync(new URL("../../db/migrations/0017_code_alphabet.sql", import.meta.url), "utf8");
  const m = /code ~ '\^\[([A-Z0-9]+)\]\{(\d+)\}\$'/.exec(sql);
  assert.ok(m, "migration 0017 must constrain clients.code with a character class");
  assert.equal(m[1], CODE_ALPHABET);
  assert.equal(Number(m[2]), CODE_LENGTH);
});

test("generated codes use only the alphabet, pass validation, and survive normalisation", () => {
  const stored = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);
  for (let i = 0; i < 5000; i++) {
    const code = generateCode();
    assert.match(code, stored);
    assert.ok(isValidCode(code));
    assert.equal(normalizeCode(code), code);
  }
});

test("a typed ambiguous character is repaired into the alphabet", () => {
  for (const ch of AMBIGUOUS) {
    const repaired = normalizeCode(`QQQQQQQ${ch}`);
    assert.ok(isValidCode(repaired), `${ch} -> ${repaired}`);
    assert.ok(CODE_ALPHABET.includes(repaired.at(-1)), `${ch} -> ${repaired}`);
  }
  assert.equal(normalizeCode("demx-hn42"), "DEMXHN42");
  assert.equal(normalizeCode("l"), "J", "a lowercase l is read as the letter L");
});

test("validation rejects the wrong length and characters that cannot be repaired", () => {
  assert.equal(isValidCode("QQQQQQQ"), false);
  assert.equal(isValidCode("QQQQQQQQQ"), false);
  assert.equal(isValidCode("QQQQQQQ9"), false, "9 is neither in the alphabet nor a known confusion");
  assert.equal(formatCode("demxhn42"), "DEMX-HN42");
});
