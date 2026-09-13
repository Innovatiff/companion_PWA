/** Fetching, format detection, and the per-category content checks. */

import { REQUIRED_LEAGUES, REQUIRED_CURRENCIES } from "./sources.mjs";

const UA = "leamington-source-verifier/0.1 (+ops contact in repo README)";

export async function fetchWithTimeout(url, { headers = {}, timeoutMs = 20000 } = {}) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA, accept: "*/*", ...headers },
      redirect: "follow",
      signal: ac.signal,
    });
    const body = await res.text();
    return {
      ok: res.ok,
      status: res.status,
      contentType: res.headers.get("content-type") || "",
      body,
      ms: Date.now() - started,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** What did we actually get back, regardless of what was advertised? */
export function detectFormat(body, contentType) {
  const head = body.slice(0, 4000);
  const isCap = /urn:oasis:names:tc:emergency:cap/i.test(head) || /<cap:/i.test(head);
  if (isCap) return "cap";
  if (/^\s*[[{]/.test(body) && /json/i.test(contentType)) return "json";
  if (/^\s*[[{]/.test(body)) {
    try { JSON.parse(body); return "json"; } catch { /* not json */ }
  }
  if (/<feed[\s>]/i.test(head)) return "atom";
  if (/<rss[\s>]/i.test(head)) return "rss";
  if (/<\?xml/i.test(head)) return "xml";
  if (/<html[\s>]|<!doctype html/i.test(head)) return "html";
  return "unknown";
}

/**
 * Inspect a CAP document.
 *
 * The decisive question is NOT "is there a feed" but "does it carry geometry".
 * CLAUDE.md requires matching a client's municipality coordinates against the
 * alert polygon; a CAP feed that only supplies <areaDesc> text cannot support
 * that rule, and would force us back to name matching -- the exact failure mode
 * the brief rules out.
 */
export function inspectCap(body) {
  const count = (re) => (body.match(re) || []).length;
  const entries = count(/<entry[\s>]/gi) || count(/<item[\s>]/gi);
  const polygons = count(/<(?:cap:)?polygon>/gi);
  const circles = count(/<(?:cap:)?circle>/gi);
  const geocodes = count(/<(?:cap:)?geocode>/gi);
  const areaDescs = count(/<(?:cap:)?areaDesc>/gi);
  const severities = [...body.matchAll(/<(?:cap:)?severity>([^<]+)</gi)].map((m) => m[1].trim());
  // A feed index (Atom list of links) is not itself an alert document.
  const isIndex = entries > 0 && areaDescs === 0 && polygons === 0;
  return {
    entries,
    polygons,
    circles,
    geocodes,
    areaDescs,
    severities: [...new Set(severities)],
    hasGeometry: polygons > 0 || circles > 0,
    geometryUnknown: isIndex,
    note: isIndex
      ? "looks like a feed index; fetch a linked alert document to confirm geometry"
      : polygons + circles === 0 && areaDescs > 0
        ? "AREA TEXT ONLY — no polygon/circle. Polygon matching would not be possible from this document."
        : "",
  };
}

/** Which of the four required leagues can we find in a provider's league list? */
export function inspectFootballLeagues(body) {
  const found = {};
  for (const l of REQUIRED_LEAGUES) {
    // Search the raw payload: schemas differ per provider, names do not.
    found[l.label] = l.match.test(body);
  }
  return { leagues: found, allFour: Object.values(found).every(Boolean) };
}

/** Does this FX source actually quote all four currencies we need? */
export function inspectFxCurrencies(body) {
  let parsed;
  try { parsed = JSON.parse(body); } catch { return { error: "not JSON" }; }
  const rates = parsed.rates || parsed.data || {};
  const present = {};
  for (const c of REQUIRED_CURRENCIES) present[c] = rates[c] != null;
  return {
    currencies: present,
    all: Object.values(present).every(Boolean),
    missing: REQUIRED_CURRENCIES.filter((c) => !present[c]),
  };
}

/** Is a results page server-rendered, or does it need a headless browser? */
export function inspectScrapeTarget(body) {
  const text = body.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<[^>]+>/g, " ");
  const digitGroups = (text.match(/\b\d{1,2}\b/g) || []).length;
  const looksJsApp =
    /__NEXT_DATA__|window\.__NUXT__|ng-version|data-reactroot|<div id="root">\s*<\/div>/i.test(body);
  return {
    bytes: body.length,
    serverRenderedNumbers: digitGroups,
    looksJsApp,
    note: looksJsApp
      ? "client-rendered — scraping needs a headless browser, or find the XHR endpoint it calls"
      : digitGroups > 10
        ? "numbers present in server HTML — plain HTTP scrape looks feasible"
        : "few numbers in server HTML — confirm the results actually live on this URL",
  };
}
