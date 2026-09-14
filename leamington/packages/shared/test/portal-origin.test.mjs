// Form posts from our own pages are accepted, including the "Origin: null"
// Chrome sends under a strict referrer policy; cross-site posts are refused.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sameOrigin } from "../src/server/portal.ts";

const req = (headers) => ({ headers: { host: "admin-production-4df8.up.railway.app", ...headers } });

test("a post from our own page is accepted", () => {
  assert.equal(sameOrigin(req({ origin: "https://admin-production-4df8.up.railway.app", "sec-fetch-site": "same-origin" })), true);
});

test("Origin: null from our own page (no-referrer policy) is accepted", () => {
  assert.equal(sameOrigin(req({ origin: "null", "sec-fetch-site": "same-origin" })), true);
});

test("Origin: null without proof it is same-origin is refused", () => {
  assert.equal(sameOrigin(req({ origin: "null" })), false);
  assert.equal(sameOrigin(req({ origin: "null", "sec-fetch-site": "cross-site" })), false);
});

test("a post from another site is refused", () => {
  assert.equal(sameOrigin(req({ origin: "https://evil.example" })), false);
  assert.equal(sameOrigin(req({ origin: "https://evil.example", "sec-fetch-site": "cross-site" })), false);
  assert.equal(sameOrigin(req({ "sec-fetch-site": "cross-site" })), false);
});

test("a proxy's forwarded host is used when present", () => {
  assert.equal(sameOrigin({ headers: { host: "10.0.0.5:3000", "x-forwarded-host": "hoy-production.up.railway.app", origin: "https://hoy-production.up.railway.app" } }), true);
});

test("a non-browser client without Origin is accepted (the cookie is SameSite=Lax)", () => {
  assert.equal(sameOrigin(req({})), true);
});
