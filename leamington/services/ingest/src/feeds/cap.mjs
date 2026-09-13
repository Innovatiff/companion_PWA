/**
 * CAP (Common Alerting Protocol) ingest.
 *
 * Two rules drive the shape of this file:
 *
 * 1. The Alert Hub's per-country feeds are GEOGRAPHIC FILTERS, not national
 *    sources. 100/100 of the most recent alerts in the Honduras feed were
 *    issued by Belize. Every item is therefore filtered by issuing source
 *    before it is trusted as national.
 *
 * 2. Agency wording is passed through VERBATIM. Nothing here rewrites,
 *    summarises, translates or paraphrases. The raw document is stored
 *    alongside the parsed fields so the original is always recoverable.
 */

import { XMLParser } from "fast-xml-parser";
import { fetchText } from "../run-feed.mjs";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  // Strip cap: / atom: prefixes so cap:polygon and polygon parse alike.
  transformTagName: (tag) => tag.replace(/^[a-z0-9]+:/i, ""),
  parseTagValue: false,      // keep everything as text; we coerce deliberately
  trimValues: true,
});

const asArray = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

/**
 * CAP severity -> our alert_level.
 *
 * CLAUDE.md pushes on red/orange equivalents only. Mapping Severe to orange
 * (rather than red) keeps red for Extreme, so "red" means what an agency's own
 * red means rather than being inflated by our mapping.
 */
export function severityToLevel(severity) {
  switch (String(severity || "").toLowerCase()) {
    case "extreme":  return "red";
    case "severe":   return "orange";
    case "moderate": return "yellow";
    case "minor":    return "green";
    default:         return "unknown";
  }
}

/**
 * CAP polygons are "lat,lon lat,lon ..." — latitude FIRST.
 * PostGIS wants longitude first. Getting this backwards silently places every
 * alert in the wrong hemisphere, so it is done in exactly one place.
 */
export function capPolygonToWkt(polygonText) {
  const pts = String(polygonText).trim().split(/\s+/).filter(Boolean);
  if (pts.length < 4) return null;              // a ring needs >= 4 points
  const coords = [];
  for (const p of pts) {
    const [lat, lon] = p.split(",").map(Number);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    coords.push(`${lon} ${lat}`);
  }
  // CAP requires the ring to be closed; repair it if the publisher did not.
  if (coords[0] !== coords[coords.length - 1]) coords.push(coords[0]);
  return `POLYGON((${coords.join(", ")}))`;
}

/**
 * CAP <references> is a space-separated list of "sender,identifier,sent"
 * triples naming the messages this one updates or cancels. We match on the
 * identifier -- never on area name.
 */
export function parseReferences(refs) {
  if (!refs) return [];
  return String(refs)
    .trim()
    .split(/\s+/)
    .map((r) => {
      const parts = r.split(",");
      // "sender,identifier,sent"; some publishers omit the sent field.
      return parts.length >= 2 ? parts[1]?.trim() : null;
    })
    .filter(Boolean);
}

/** Parse one CAP alert document into the shape weather_alerts expects. */
export function parseCapDocument(xml, sourceUrl) {
  const doc = parser.parse(xml);
  const alert = doc?.alert;
  if (!alert) return null;

  // An alert carries one or more <info> blocks, one per language. Prefer the
  // agency's own language; never a translation.
  const infos = asArray(alert.info);
  if (!infos.length) return null;
  const info = infos[0];

  const areas = asArray(info.area);
  const polygons = areas.flatMap((a) => asArray(a.polygon)).filter(Boolean);
  const circles = areas.flatMap((a) => asArray(a.circle)).filter(Boolean);

  const wkts = polygons.map(capPolygonToWkt).filter(Boolean);

  let center = null, radiusM = null;
  if (!wkts.length && circles.length) {
    // CAP circle: "lat,lon radiusKm"
    const [pt, km] = String(circles[0]).trim().split(/\s+/);
    const [lat, lon] = String(pt).split(",").map(Number);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      center = `POINT(${lon} ${lat})`;
      radiusM = (Number(km) || 0) * 1000;
    }
  }

  return {
    capIdentifier: alert.identifier ?? null,
    capSender: alert.sender ?? null,
    capSent: alert.sent ?? null,
    msgType: alert.msgType ?? "Alert",
    capReferences: alert.references ?? null,
    referencedIdentifiers: parseReferences(alert.references),
    // Ack and Error are machine bookkeeping: stored for the record, never shown.
    surfaceable: !["Ack", "Error"].includes(alert.msgType ?? "Alert"),
    // Verbatim agency wording. Not touched.
    event: info.event ?? "(sin evento)",
    headline: info.headline ?? null,
    description: info.description ?? null,
    instruction: info.instruction ?? null,
    areaDesc: areas.map((a) => a.areaDesc).filter(Boolean).join("; ") || null,
    severityRaw: info.severity ?? null,
    level: severityToLevel(info.severity),
    language: info.language ?? null,
    effectiveAt: info.effective ?? null,
    expiresAt: info.expires ?? null,
    issuedAt: info.effective || alert.sent || null,
    polygonWkts: wkts,
    centerWkt: center,
    radiusM,
    sourceUrl,
    raw: xml,
  };
}

/**
 * RSS gives <link>url</link>; Atom gives <link href="..."/>, possibly several
 * (self, alternate), in which case the alternate is the document.
 */
function hrefOf(link) {
  const links = asArray(link);
  const pick = links.find((l) => typeof l === "string")
    ?? links.find((l) => !l?.["@_rel"] || l["@_rel"] === "alternate")
    ?? links[0];
  return typeof pick === "string" ? pick : pick?.["@_href"];
}

function itemsOf(doc) {
  return asArray(doc?.rss?.channel?.item ?? doc?.feed?.entry)
    .map((it) => ({ link: hrefOf(it.link), pubDate: it.pubDate ?? it.updated ?? null, title: it.title ?? null }))
    .filter((x) => x.link);
}

/** Pull the item links out of an RSS or Atom feed. */
export function extractFeedLinks(rssXml) {
  return itemsOf(parser.parse(rssXml));
}

/** http/https and a trailing slash do not make a different resource. */
const sameUrl = (u) => String(u).trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "").toLowerCase();

/**
 * Split a feed index into CAP document links and placeholder entries.
 *
 * An index with nothing active is not always an empty list. Jamaica's feed
 * publishes one entry, "There are no active watches, warnings or advisories",
 * whose link is the feed's own URL. An entry that links back to the feed is the
 * feed describing itself, never a CAP document; fetching it as one fails, and
 * that turned a confirmed-quiet feed into a partial run every 15 minutes.
 */
export function parseFeedIndex(xml, feedUrl) {
  const doc = parser.parse(xml);
  const self = new Set(
    [feedUrl, doc?.feed?.id, ...asArray(doc?.feed?.link), ...asArray(doc?.rss?.channel?.link)]
      .map((l) => (typeof l === "string" ? l : l?.["@_href"]))
      .filter(Boolean)
      .map(sameUrl));
  const entries = itemsOf(doc);
  return {
    documents: entries.filter((e) => !self.has(sameUrl(e.link))),
    placeholders: entries.filter((e) => self.has(sameUrl(e.link))),
  };
}

/**
 * Which issuing source does this alert document URL belong to?
 * Alert Hub paths look like .../<source-id>/<shard>/<file>.xml
 */
export function sourceIdFromUrl(url) {
  const m = /cap-(?:sources|alerts)\.s3[^/]*\.amazonaws\.com\/([a-z0-9-]+)\//i.exec(url || "");
  return m ? m[1] : null;
}

export async function fetchCapDocument(url) {
  const { body } = await fetchText(url, { timeoutMs: 20_000 });
  return parseCapDocument(body, url);
}
