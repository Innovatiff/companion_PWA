/**
 * Every page name the app records a view for is one page_views accepts. The app
 * swallows a refused view (recordView), so without this a new page's views are
 * lost silently, as they were for six pages before 0053.
 *
 *   node --test test/*.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const APP = join(import.meta.dirname, "..");
const MIGRATIONS = join(APP, "../../packages/db/migrations");

function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : []);
}

test("every recordView page name is allowed by the newest page_views_page_check", () => {
  let allowed = null;
  for (const f of readdirSync(MIGRATIONS).filter((n) => n.endsWith(".sql")).sort()) {
    const sql = readFileSync(join(MIGRATIONS, f), "utf8");
    // The table's first definition (inline check) and each later "add constraint".
    const m = [...sql.matchAll(/(?:page_views_page_check\s+check|page\s+text\s+not\s+null\s+check)\s*\(\s*page\s+in\s*\(([^)]*)\)/g)].at(-1);
    if (m) allowed = new Set([...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]));
  }
  assert.ok(allowed?.size, "found the page_views page check in the migrations");

  const used = new Map();
  for (const f of files(join(APP, "pages"))) {
    for (const m of readFileSync(f, "utf8").matchAll(/recordView\([^,]+,\s*"([^"]+)"/g)) used.set(m[1], f);
  }
  assert.ok(used.size > 0, "found recordView calls in pages");
  const missing = [...used].filter(([name]) => !allowed.has(name)).map(([name, f]) => `${name} (${f.slice(APP.length + 1)})`);
  assert.deepEqual(missing, [], "page names the database would refuse");
});
