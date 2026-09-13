import { extractFeedLinks, sourceIdFromUrl, fetchCapDocument, capPolygonToWkt, severityToLevel } from "../src/feeds/cap.mjs";
import { fetchText } from "../src/run-feed.mjs";

// 1. coordinate order — the detail that silently ruins everything
const wkt = capPolygonToWkt("17.9,-76.1 17.9,-75.9 17.5,-75.9 17.5,-76.1");
console.log("polygon lat,lon -> WKT lon lat:", wkt);
console.log("  first coord is longitude (negative ~-76):", wkt.includes("POLYGON((-76.1 17.9"));
console.log("  ring auto-closed:", wkt.endsWith("-76.1 17.9))"));

// 2. severity mapping
for (const s of ["Extreme","Severe","Moderate","Minor","Unknown"])
  console.log(`  ${s.padEnd(9)} -> ${severityToLevel(s)}`);

// 3. live feed
const { body } = await fetchText("https://cap-alerts.s3.amazonaws.com/country-jm-lang-en/rss.xml");
const links = extractFeedLinks(body);
console.log("\nfeed items:", links.length);
const bySource = {};
for (const l of links) { const s = sourceIdFromUrl(l.link) || "?"; bySource[s] = (bySource[s]||0)+1; }
console.log("by issuing source:", bySource);

const national = links.filter(l => sourceIdFromUrl(l.link) === "jm-jms-en");
console.log("national (jm-jms-en):", national.length);

const doc = await fetchCapDocument(national[0].link);
console.log("\nparsed CAP document:");
for (const k of ["capIdentifier","capSender","capSent","msgType","event","severityRaw","level","language","areaDesc","expiresAt"])
  console.log(`  ${k.padEnd(14)}: ${String(doc[k]).slice(0,78)}`);
console.log(`  polygons      : ${doc.polygonWkts.length}`);
console.log(`  vertices      : ${doc.polygonWkts.map(w=>w.split(",").length).join(", ")}`);
console.log(`  headline      : ${String(doc.headline).slice(0,90)}`);
console.log(`  wkt prefix    : ${doc.polygonWkts[0]?.slice(0,70)}...`);
