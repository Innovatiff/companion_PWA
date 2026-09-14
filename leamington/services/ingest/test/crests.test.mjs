/**
 * What may be stored as a team's crest: an image, within Hoy's 50 KB budget,
 * and never the provider's stock "logo soon" picture.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { crestRejection, MAX_CREST_BYTES, MAX_LEAGUE_LOGO_BYTES, PLACEHOLDER_SHA256 } from "../src/feeds/crests.mjs";

test("league logos have their own larger limit; the stock image is refused there too", () => {
  const logo = Buffer.alloc(120_000);
  assert.match(crestRejection({ type: "image/png", bytes: logo, sha256: "x" }), /size/, "too big for a team crest");
  assert.equal(crestRejection({ type: "image/png", bytes: logo, sha256: "x" }, MAX_LEAGUE_LOGO_BYTES), null);
  assert.match(crestRejection({ type: "image/png", bytes: Buffer.alloc(MAX_LEAGUE_LOGO_BYTES + 1), sha256: "x" }, MAX_LEAGUE_LOGO_BYTES), /size/);
  const [stock] = PLACEHOLDER_SHA256;
  assert.match(crestRejection({ type: "image/png", bytes: Buffer.alloc(90_381), sha256: stock }, MAX_LEAGUE_LOGO_BYTES), /placeholder/);
});

const png = Buffer.from("89504e470d0a1a0a", "hex");

test("a normal crest image is accepted", () => {
  assert.equal(crestRejection({ type: "image/png", bytes: png, sha256: "abc" }), null);
});

test("the provider's stock image is refused", () => {
  const [stock] = PLACEHOLDER_SHA256;
  assert.match(crestRejection({ type: "image/png", bytes: png, sha256: stock }), /placeholder/);
});

test("non-images, empty and oversized files are refused", () => {
  assert.match(crestRejection({ type: "text/html", bytes: png, sha256: "x" }), /not an image/);
  assert.match(crestRejection({ type: "image/png", bytes: Buffer.alloc(0), sha256: "x" }), /size 0/);
  assert.match(crestRejection({ type: "image/png", bytes: Buffer.alloc(MAX_CREST_BYTES + 1), sha256: "x" }), /size/);
});
