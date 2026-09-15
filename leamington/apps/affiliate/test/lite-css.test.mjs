/**
 * The lighter inline CSS for Vista previa (lib/lite-css.ts): it keeps every rule
 * the preview pages use, drops tables, stat cards and printing, and stays
 * balanced, so a change to PORTAL_CSS cannot silently break the page.
 *
 *   node --test test/*.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";
import { liteCss, splitRules, unusedSelector } from "../lib/lite-css.ts";
import { PORTAL_CSS } from "../../../packages/shared/src/ui/css.ts";

const lite = liteCss(PORTAL_CSS);

test("the lite CSS is balanced and smaller by at least 700 compressed bytes", () => {
  assert.doesNotThrow(() => splitRules(lite));
  const saved = zlib.gzipSync(PORTAL_CSS).length - zlib.gzipSync(lite).length;
  assert.ok(saved >= 700, `saved ${saved}`);
});

test("it keeps what the preview pages use", () => {
  for (const s of [".app{", ".side{", ".side nav a[aria-current=page]{", ".brand{", ".who{", ".hero{", ".hero h1{", ".btn-light{",
    ".card{", ".card-h{", ".list{", ".list>li:nth-child(even){", ".meta{", "button,.button{", "button.secondary,.button.secondary{",
    "button.block,.button.block{", "label{", "input,select,textarea{", ".note{", ".note.warn{", ".chip{", ".chip.test{", ".badge{", ".badge.warn{",
    ".sr{", "svg.i{", "@media (max-width:56rem){"]) {
    assert.ok(lite.includes(s), `missing ${s}`);
  }
  assert.ok(lite.includes(".list .t a") || !PORTAL_CSS.includes(".list .t a"), "a selector list keeps its used half");
});

test("it drops tables, stat cards, pipelines, the code slip, sign-in and printing", () => {
  for (const s of ["table{", "thead th{", ".stats{", ".stat{", ".pipeline{", ".code{", ".auth{", "@media print", ".grid{"]) {
    assert.ok(!lite.includes(s), `still has ${s}`);
  }
  assert.equal(unusedSelector("td a"), true);
  assert.equal(unusedSelector(".list .t a"), false);
  assert.equal(unusedSelector(".codein"), true);
  assert.equal(unusedSelector(".card-h h2"), false);
  assert.equal(unusedSelector(".hero .actions"), false);
});
