#!/usr/bin/env node
/**
 * Source verification harness.
 *
 * CLAUDE.md gates UI work on verifying the football leagues, the weather-alert
 * sources and the lottery sources. This script performs those checks and writes
 * a report. Run it from a network that can actually reach these hosts:
 *
 *     node services/ingest/verify/run.mjs
 *     node services/ingest/verify/run.mjs --category alerts
 *     node services/ingest/verify/run.mjs --json report.json --markdown report.md
 *
 * Optional API keys (sources needing an absent key are SKIPPED, not failed):
 *     API_FOOTBALL_KEY  SPORTMONKS_KEY  OPENWEATHER_KEY  WEATHERAPI_KEY
 *
 * Exit code is 1 if any probed source failed, so this can gate a CI job.
 */

import { writeFileSync } from "node:fs";
import { SOURCES, JM_DRAW_TIMES } from "./sources.mjs";
import {
  fetchWithTimeout, detectFormat, inspectCap,
  inspectFootballLeagues, inspectFxCurrencies, inspectScrapeTarget,
} from "./probe.mjs";

const args = process.argv.slice(2);
const argOf = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };
const onlyCategory = argOf("--category");
const jsonOut = argOf("--json");
const mdOut = argOf("--markdown");
const CONCURRENCY = Number(argOf("--concurrency") || 4);

const env = process.env;
const C = process.stdout.isTTY
  ? { g: "\x1b[32m", r: "\x1b[31m", y: "\x1b[33m", d: "\x1b[2m", b: "\x1b[1m", x: "\x1b[0m" }
  : { g: "", r: "", y: "", d: "", b: "", x: "" };

function resolveUrl(url) {
  return url.replace(/\{(\w+)\}/g, (_, k) => env[k] ?? `{${k}}`);
}

async function probeOne(src) {
  const base = { id: src.id, label: src.label, category: src.category, country: src.country, url: src.url, why: src.why, step: src.step };

  if (src.needsKey && !env[src.needsKey]) {
    return { ...base, outcome: "skipped", detail: `needs ${src.needsKey}` };
  }

  try {
    const headers = typeof src.headers === "function" ? src.headers(env) : src.headers || {};
    const res = await fetchWithTimeout(resolveUrl(src.url), { headers });
    const format = detectFormat(res.body, res.contentType);
    const out = {
      ...base,
      outcome: res.ok ? "ok" : "failed",
      status: res.status,
      ms: res.ms,
      format,
      bytes: res.body.length,
    };

    if (!res.ok) { out.detail = `HTTP ${res.status}`; return out; }

    if (format === "cap" || ((format === "atom" || format === "rss" || format === "xml") && src.expect === "cap")) {
      out.cap = inspectCap(res.body);
      out.detail = out.cap.geometryUnknown
        ? `${out.cap.entries} entries (index)`
        : `${out.cap.entries} entries, ${out.cap.polygons} polygon(s), ${out.cap.circles} circle(s)`;
      if (out.cap.note) out.warning = out.cap.note;
    } else if (src.inspect === "footballLeagues") {
      out.football = inspectFootballLeagues(res.body);
      const hits = Object.entries(out.football.leagues).filter(([, v]) => v).map(([k]) => k);
      out.detail = hits.length ? `found: ${hits.join(", ")}` : "none of the four leagues found";
      if (!out.football.allFour) {
        const missing = Object.entries(out.football.leagues).filter(([, v]) => !v).map(([k]) => k);
        out.warning = `missing: ${missing.join(", ")}`;
      }
    } else if (src.inspect === "fxCurrencies") {
      out.fx = inspectFxCurrencies(res.body);
      out.detail = out.fx.all ? "all four currencies quoted" : `missing: ${(out.fx.missing || []).join(", ")}`;
      if (!out.fx.all) out.warning = out.detail;
    } else if (src.expect === "html") {
      out.scrape = inspectScrapeTarget(res.body);
      out.detail = out.scrape.note;
      if (out.scrape.looksJsApp) out.warning = out.scrape.note;
    } else {
      out.detail = `${format}, ${res.body.length} bytes`;
    }
    return out;
  } catch (err) {
    return { ...base, outcome: "failed", detail: describeNetworkError(err) };
  }
}

/**
 * `fetch` collapses every transport failure into a bare TypeError, which tells
 * an operator nothing. Surface the underlying cause so "blocked by an egress
 * proxy" is never mistaken for "the source is down".
 */
function describeNetworkError(err) {
  const cause = err?.cause;
  const code = cause?.code || err?.code;
  const msg = String(cause?.message || err?.message || err);
  if (err?.name === "AbortError") return "timeout";
  if (code === "ENOTFOUND") return "DNS lookup failed (host not found)";
  if (code === "ECONNREFUSED") return "connection refused";
  if (code === "ECONNRESET") return "connection reset mid-transfer";
  if (code === "UND_ERR_CONNECT_TIMEOUT") return "connect timeout";
  if (code === "CERT_HAS_EXPIRED") return "TLS certificate expired";
  if (/self.signed|unable to verify|CERT_/i.test(msg)) return `TLS verification failed (${code || "cert"})`;
  if (/403|proxy/i.test(msg)) return "blocked by proxy (egress policy)";
  if (code) return `${code}: ${msg}`;
  // A proxy that refuses CONNECT usually reaches fetch as an opaque TypeError.
  return err?.name === "TypeError"
    ? `network unreachable or blocked by egress policy (${msg})`
    : msg;
}

async function runPool(items, worker, limit) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (true) {
        const i = next++;
        if (i >= items.length) return;
        results[i] = await worker(items[i]);
      }
    }),
  );
  return results;
}

const targets = SOURCES.filter((s) => !onlyCategory || s.category === onlyCategory);
if (targets.length === 0) {
  console.error(`No sources match --category ${onlyCategory}`);
  process.exit(2);
}

console.log(`\n${C.b}Leamington source verification${C.x}  ${C.d}${new Date().toISOString()}${C.x}`);
console.log(`${C.d}Probing ${targets.length} source(s)${onlyCategory ? ` in "${onlyCategory}"` : ""}...${C.x}\n`);

const results = await runPool(targets, probeOne, CONCURRENCY);

const mark = (o) => (o === "ok" ? `${C.g}ok     ${C.x}` : o === "skipped" ? `${C.y}skip   ${C.x}` : `${C.r}FAILED ${C.x}`);

for (const cat of [...new Set(targets.map((t) => t.category))]) {
  console.log(`${C.b}${cat.toUpperCase()}${C.x}`);
  for (const r of results.filter((r) => r.category === cat)) {
    const step = r.step ? ` ${C.d}[step ${r.step}]${C.x}` : "";
    console.log(`  ${mark(r.outcome)} ${r.label}${step}`);
    console.log(`         ${C.d}${r.url}${C.x}`);
    if (r.detail) console.log(`         ${r.detail}${r.ms != null ? `  ${C.d}(${r.ms}ms)${C.x}` : ""}`);
    if (r.warning) console.log(`         ${C.y}! ${r.warning}${C.x}`);
  }
  console.log();
}

const failed = results.filter((r) => r.outcome === "failed");
const skipped = results.filter((r) => r.outcome === "skipped");
console.log(`${C.b}Summary${C.x}  ${C.g}${results.filter(r=>r.outcome==="ok").length} ok${C.x}  ${C.r}${failed.length} failed${C.x}  ${C.y}${skipped.length} skipped${C.x}`);

// Alerts get an explicit readiness verdict, because that is the decision the
// launch-country choice hangs on.
const alertResults = results.filter((r) => r.category === "alerts" && r.country !== "*");
if (alertResults.length) {
  console.log(`\n${C.b}Alert-source readiness by country${C.x}`);
  for (const country of [...new Set(alertResults.map((r) => r.country))]) {
    const rs = alertResults.filter((r) => r.country === country);
    const cap = rs.find((r) => r.cap?.hasGeometry);
    const anyCap = rs.find((r) => r.format === "cap");
    const verdict = cap
      ? `${C.g}CAP with geometry — step 1, polygon matching supported${C.x}`
      : anyCap
        ? `${C.y}CAP present but no polygon seen — confirm geometry before relying on it${C.x}`
        : rs.some((r) => r.outcome === "ok")
          ? `${C.y}no CAP — step 3 scrape, fragile by definition${C.x}`
          : `${C.r}nothing reachable${C.x}`;
    console.log(`  ${country}: ${verdict}`);
  }
}

if (onlyCategory === "lottery" || !onlyCategory) {
  console.log(`\n${C.b}Jamaica draw cadence${C.x} ${C.d}(build ingest around these, not a fixed interval)${C.x}`);
  for (const [game, times] of Object.entries(JM_DRAW_TIMES.games)) {
    console.log(`  ${game.padEnd(10)} ${times.join("  ")}  ${C.d}${JM_DRAW_TIMES.timezone} (${JM_DRAW_TIMES.utcOffset}, no DST)${C.x}`);
  }
}

if (jsonOut) {
  writeFileSync(jsonOut, JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
  console.log(`\nJSON report -> ${jsonOut}`);
}
if (mdOut) {
  const lines = [
    `# Source verification report`, ``,
    `Generated: ${new Date().toISOString()}`, ``,
    `| Source | Country | Result | Format | Detail |`,
    `| --- | --- | --- | --- | --- |`,
    ...results.map((r) =>
      `| ${r.label} | ${r.country} | ${r.outcome} | ${r.format || "-"} | ${(r.warning || r.detail || "").replace(/\|/g, "\\|")} |`),
  ];
  writeFileSync(mdOut, lines.join("\n") + "\n");
  console.log(`Markdown report -> ${mdOut}`);
}

process.exit(failed.length > 0 ? 1 : 0);
