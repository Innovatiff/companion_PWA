/**
 * Curated static data (services/ingest/data/*.json) must be loadable by
 * src/feeds/static.mjs and internally consistent.
 *
 * static.mjs does not export requireVerification (and importing it pulls in
 * the database client), so its rules are replicated here verbatim.
 *
 *   node --test test/static-data.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "data");
const files = readdirSync(DATA_DIR).filter((f) => f.endsWith(".json")).sort();

// Same derivation as static.mjs.
const kindOf = (file) => file.replace(/\.json$/, "").replace(/^[a-z]{2}[-_]/i, "");

// Same rules as static.mjs requireVerification.
function requireVerification(record, file, index) {
  const where = `${file}[${index}]`;
  if (!record.verified_at) throw new Error(`${where}: missing verified_at — a human must confirm this record`);
  if (!record.verified_by) throw new Error(`${where}: missing verified_by — who checked it?`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(record.verified_at)) throw new Error(`${where}: verified_at must be YYYY-MM-DD`);
  if (record.needs_verification === true) throw new Error(`${where}: flagged needs_verification — refusing to publish unconfirmed data`);
}

const HOME = ["MX", "GT", "HN", "JM"]; // country_code enum in 0002_core.sql
const KINDS = {
  holidays: { countries: HOME, required: ["country", "holiday_date", "name"], dates: ["holiday_date"], key: (r) => [r.country, r.holiday_date, r.name] },
  school_calendar: { countries: HOME, required: ["country", "school_year", "event_name", "start_date"], dates: ["start_date", "end_date"], key: (r) => [r.country, r.school_year, r.event_name, r.start_date] },
  consulates: { countries: HOME, required: ["country", "city"], dates: [], key: (r) => [r.country, r.city] },
  emergency_contacts: { countries: ["CA", ...HOME], required: ["country", "label", "number"], dates: [], key: (r) => [r.country, r.region ?? "", r.label, r.number] },
  transit: { countries: null, required: ["area", "operator", "kind", "name", "schedule_url"], dates: [], key: (r) => [r.area, r.operator, r.name] },
};

function isRealDate(s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function urlsIn(record) {
  const out = [];
  for (const [k, v] of Object.entries(record)) {
    if (/_url$/.test(k) && v != null) out.push([k, v]);
    if (k === "source_urls") for (const u of v) out.push([k, u]);
  }
  return out;
}

const load = (file) => JSON.parse(readFileSync(join(DATA_DIR, file), "utf8"));

test("there is curated data to check", () => {
  assert.ok(files.length > 0, `no .json files in ${DATA_DIR}`);
});

for (const file of files) {
  test(file, () => {
    const kind = kindOf(file);
    const spec = KINDS[kind];
    assert.ok(spec, `${file}: unknown record kind "${kind}"`);

    const records = load(file);
    assert.ok(Array.isArray(records) && records.length > 0, `${file}: must be a non-empty array`);

    const prefix = file.slice(0, 2).toUpperCase();
    const seen = new Set();
    records.forEach((r, i) => {
      const where = `${file}[${i}]`;
      assert.doesNotThrow(() => requireVerification(r, file, i));
      assert.ok(isRealDate(r.verified_at), `${where}: verified_at is not a real date`);
      assert.ok(!("needs_verification" in r), `${where}: included records must not carry needs_verification`);

      for (const f of spec.required) assert.ok(r[f] != null && r[f] !== "", `${where}: missing ${f}`);
      if (spec.countries) {
        assert.ok(spec.countries.includes(r.country), `${where}: invalid country ${r.country}`);
        assert.equal(r.country, prefix, `${where}: country ${r.country} does not match file prefix ${prefix}`);
      }
      for (const f of spec.dates) {
        if (r[f] == null) continue;
        assert.ok(isRealDate(r[f]), `${where}: ${f} "${r[f]}" is not a real YYYY-MM-DD date`);
      }
      if (r.end_date != null) assert.ok(r.end_date >= r.start_date, `${where}: end_date before start_date`);
      if (kind === "transit") {
        assert.ok(["Leamington", "Windsor", "Windsor-Essex"].includes(r.area), `${where}: invalid area ${r.area}`);
        assert.ok(["local", "intercity", "airport", "other"].includes(r.kind), `${where}: invalid kind ${r.kind}`);
      }
      if (kind === "consulates" && r.services != null) {
        assert.ok(Array.isArray(r.services), `${where}: services must be an array`);
        for (const s of r.services) {
          assert.ok(s.name, `${where}: service without name`);
          if (s.documents != null) assert.ok(Array.isArray(s.documents), `${where}: documents must be an array`);
        }
      }

      assert.ok(r.source_url, `${where}: missing source_url`);
      for (const [k, u] of urlsIn(r)) {
        let parsed;
        assert.doesNotThrow(() => { parsed = new URL(u); }, `${where}: ${k} is not a URL`);
        assert.equal(parsed.protocol, "https:", `${where}: ${k} must be https (${u})`);
      }

      const key = JSON.stringify(spec.key(r));
      assert.ok(!seen.has(key), `${where}: duplicate unique key ${key}`);
      seen.add(key);
    });
  });
}

test("unique keys hold across files of the same kind", () => {
  const byKind = new Map();
  for (const file of files) {
    const kind = kindOf(file);
    const spec = KINDS[kind];
    if (!spec) continue;
    const seen = byKind.get(kind) ?? new Map();
    load(file).forEach((r, i) => {
      const key = JSON.stringify(spec.key(r));
      assert.ok(!seen.has(key), `${file}[${i}] duplicates ${seen.get(key)} on ${key}`);
      seen.set(key, `${file}[${i}]`);
    });
    byKind.set(kind, seen);
  }
});
