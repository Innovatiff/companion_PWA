#!/usr/bin/env node
/**
 * Who actually publishes into a country's alert feed?
 *
 * The Filtered Alert Hub exposes a feed per country
 * (country-hn-lang-en, country-gt-lang-en, ...). It is tempting to treat that
 * as "Honduras's alerts". It is not. Those feeds are GEOGRAPHIC FILTERS over
 * every CAP source in the hub: any alert whose polygon intersects the country
 * appears there, whoever issued it.
 *
 * Verified 2026-09-13: 100/100 of the most recent alerts in the Honduras feed
 * were issued by the BELIZE national met service. Subscribing naively would
 * have pushed Belizean marine advisories to workers' families in Honduras.
 *
 * This script attributes every item in a country feed to its issuing source, so
 * "is there a feed" is never confused with "does the national agency publish".
 *
 *   node alert-publishers.mjs            # all four countries
 *   node alert-publishers.mjs hn jm
 */

const FEED = (cc) => `https://cap-alerts.s3.amazonaws.com/country-${cc}-lang-en/rss.xml`;
const SRC_RE = /cap-(?:sources|alerts)\.s3[^/]*\.amazonaws\.com\/([a-z0-9-]+)\//;

const COUNTRIES = { hn: "Honduras", gt: "Guatemala", mx: "Mexico", jm: "Jamaica" };

const args = process.argv.slice(2).filter((a) => a in COUNTRIES);
const targets = args.length ? args : Object.keys(COUNTRIES);

for (const cc of targets) {
  let xml;
  try {
    const res = await fetch(FEED(cc), { headers: { "user-agent": "leamington-verify/0.1" } });
    if (!res.ok) { console.log(`${COUNTRIES[cc]}: HTTP ${res.status}`); continue; }
    xml = await res.text();
  } catch (err) {
    console.log(`${COUNTRIES[cc]}: unreachable (${err?.cause?.code || err.message})`);
    continue;
  }

  const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
  const counts = new Map();
  for (const it of items) {
    const m = SRC_RE.exec(it);
    const src = m ? m[1] : "unknown";
    counts.set(src, (counts.get(src) || 0) + 1);
  }

  const national = [...counts.entries()].filter(([s]) => s.startsWith(`${cc}-`));
  const nationalCount = national.reduce((a, [, n]) => a + n, 0);

  console.log(`\n${COUNTRIES[cc]}  (${items.length} recent alerts in country-${cc} feed)`);
  for (const [src, n] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
    const flag = src.startsWith(`${cc}-`) ? "  <-- national" : "";
    console.log(`   ${src.padEnd(20)} ${String(n).padStart(4)}${flag}`);
  }
  console.log(
    nationalCount > 0
      ? `   => national agency DOES publish CAP (${nationalCount}/${items.length} of recent alerts)`
      : `   => NO national CAP. Every alert here was issued by another country's agency.\n` +
        `      Treat this feed as unusable for ${COUNTRIES[cc]}; a scraper is required.`,
  );
}
