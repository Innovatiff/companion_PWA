/**
 * Signed session tokens: only ours, only for their purpose, never altered.
 *
 *   node --test test/*.test.mjs
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";

let s;
const ID = "3f2c8a1e-9b7d-4c6e-8f10-2a3b4c5d6e7f";

before(async () => {
  process.env.SESSION_SECRET = "test-secret-that-is-at-least-32-characters-long";
  s = await import("../src/server/session.ts");
});

test("a token reads back with its subject and issue time", () => {
  const token = s.makeToken("client", ID, Date.UTC(2026, 8, 13, 12, 0, 0));
  const read = s.readToken("client", token);
  assert.equal(read.subject, ID);
  assert.equal(read.issuedAt.toISOString(), "2026-09-13T12:00:00.000Z");
});

test("a token for one purpose is not valid for another", () => {
  const clientToken = s.makeToken("client", ID);
  assert.equal(s.readToken("affiliate", clientToken), null, "a client cookie cannot act as an affiliate session");
  assert.equal(s.readToken("owner", s.makeToken("affiliate", ID)), null, "an affiliate session cannot act as the owner");
});

test("an altered or foreign token is rejected", () => {
  const token = s.makeToken("owner", ID);
  assert.equal(s.readToken("owner", token.replace(ID, "00000000-0000-4000-8000-000000000000")), null);
  assert.equal(s.readToken("owner", token.slice(0, -2) + "xx"), null);
  assert.equal(s.readToken("owner", "garbage"), null);
  assert.equal(s.readToken("owner", undefined), null);
  const saved = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = "a-different-secret-also-at-least-32-characters";
  try {
    assert.equal(s.readToken("owner", token), null, "signed with another secret");
  } finally {
    process.env.SESSION_SECRET = saved;
  }
});

test("a short secret fails loudly", () => {
  const saved = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = "short";
  try {
    assert.throws(() => s.makeToken("client", ID), /SESSION_SECRET/);
  } finally {
    process.env.SESSION_SECRET = saved;
  }
});

test("cookies are HttpOnly, SameSite=Lax, and Secure when asked", () => {
  const c = s.cookieHeader("pa", "v", 60, true);
  assert.match(c, /HttpOnly/);
  assert.match(c, /SameSite=Lax/);
  assert.match(c, /Secure/);
  assert.match(c, /Max-Age=60/);
  assert.doesNotMatch(s.cookieHeader("pa", "v", 60, false), /Secure/);
  assert.equal(s.cookieValue("a=1; pa=abc.def; b=2", "pa"), "abc.def");
  assert.equal(s.cookieValue("a=1", "pa"), undefined);
});
