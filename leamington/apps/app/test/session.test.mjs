/**
 * The session cookie is the account's key: only a cookie we signed, for a real
 * client id, unaltered, is accepted.
 *
 *   node --test test/*.test.mjs      (Node 22.18+ runs the .ts import directly)
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";

let s;
before(async () => {
  process.env.SESSION_SECRET = "test-secret-that-is-at-least-32-characters-long";
  s = await import("../lib/session.ts");
});

const ID = "3f2c8a1e-9b7d-4c6e-8f10-2a3b4c5d6e7f";

test("a cookie we signed reads back as the client id", () => {
  assert.equal(s.readSession(s.makeSession(ID)), ID);
});

test("an altered cookie is rejected", () => {
  const cookie = s.makeSession(ID);
  const otherId = cookie.replace(ID, "00000000-0000-4000-8000-000000000000");
  assert.equal(s.readSession(otherId), null, "a swapped client id must not verify");
  assert.equal(s.readSession(cookie.slice(0, -2) + "xx"), null, "a changed signature must not verify");
  assert.equal(s.readSession("garbage"), null);
  assert.equal(s.readSession(undefined), null);
});

test("a cookie signed with another secret is rejected", async () => {
  const cookie = s.makeSession(ID);
  process.env.SESSION_SECRET = "a-different-secret-also-at-least-32-characters";
  try {
    assert.equal(s.readSession(cookie), null);
  } finally {
    process.env.SESSION_SECRET = "test-secret-that-is-at-least-32-characters-long";
  }
});

test("a missing or short secret fails loudly instead of signing weakly", () => {
  const saved = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = "short";
  try {
    assert.throws(() => s.makeSession(ID), /SESSION_SECRET/);
  } finally {
    process.env.SESSION_SECRET = saved;
  }
});

test("the cookie is HttpOnly, SameSite=Lax, and Secure when asked", () => {
  const c = s.sessionCookie("v", true);
  assert.match(c, /HttpOnly/);
  assert.match(c, /SameSite=Lax/);
  assert.match(c, /Secure/);
  assert.doesNotMatch(s.sessionCookie("v", false), /Secure/);
});

test("cookieValue finds our cookie among others", () => {
  assert.equal(s.cookieValue("a=1; lc=abc.def; b=2"), "abc.def");
  assert.equal(s.cookieValue("a=1"), undefined);
});
