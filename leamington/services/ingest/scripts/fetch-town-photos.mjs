/**
 * Hometown photos from Wikimedia Commons into municipality_photos (0034).
 *
 *   railway run --service companion_PWA -- node scripts/fetch-town-photos.mjs
 *   node scripts/fetch-town-photos.mjs --dry-run <dir> [--town MX:Michoacán:Morelia ...]
 *
 * For each town a client lives in or watches, without a photo yet:
 *   1. Find the town's own Wikipedia article (Spanish; English for Jamaica) and
 *      require its coordinates within 25 km of our town, so a same-name place
 *      elsewhere is never used.
 *   2. Candidates, in order: the article's lead image, then photos whose file
 *      name contains the town's name. An article's other files can show other
 *      places ("Avenida en Tegucigalpa" on San Pedro Sula's page), so they are
 *      never used. Coats of arms, flags, maps, logos and drawings are skipped.
 *   3. Require a landscape JPEG hosted on Commons, a free license (CC0, public
 *      domain, CC BY, CC BY-SA) and a named author. Hoy shows both as a credit.
 *   4. Download Commons' 480 px rendering (lower quality first), at most 120 KB.
 * A person can pick a better photo for a town in scripts/town-photo-overrides.json;
 * that file still passes every check.
 * A town with no photo that passes every check simply has no photo.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { query, closePool } from "../src/db.mjs";

// A person may choose a better photo for a town: scripts/town-photo-overrides.json
// maps "COUNTRY:Region:Town" to a Commons file. The chosen file still has to
// pass every license, author, format and size check below.
const OVERRIDES = JSON.parse(readFileSync(new URL("./town-photo-overrides.json", import.meta.url), "utf8")).photos ?? {};

const UA = "HoyApp/1.0 (https://hoy-production.up.railway.app; hometown photos)";
// 480 px is enough behind a phone greeting. Commons' lower-quality rendering
// ("qlow-") of that width is typically 25–35 KB; the normal one is the fallback.
const WIDTH = 480;
const MAX_BYTES = 120_000;
const MAX_KM = 25;
const COUNTRY = { MX: "México", GT: "Guatemala", HN: "Honduras", JM: "Jamaica" };
const REJECT = /(escudo|coat[_ ]of[_ ]arms|bandera|flag|mapa|\bmap\b|locator|location|localizaci|seal|sello|logo|emblem|diagram|plano|collage)/i;
const FREE = /^(cc0|cc-zero|public domain|pd\b|pd-|cc by(-sa)? ?\d(\.\d)?|cc-by(-sa)?-\d(\.\d)?)/i;

const args = process.argv.slice(2);
const dryIdx = args.indexOf("--dry-run");
const dryDir = dryIdx >= 0 ? args[dryIdx + 1] : null;
if (dryDir) mkdirSync(dryDir, { recursive: true });
const towns = [];
for (let i = 0; i < args.length; i++) if (args[i] === "--town") towns.push(args[++i]);

async function getJson(url) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 15_000);
  try {
    const res = await fetch(url, { signal: ac.signal, headers: { "user-agent": UA, accept: "application/json" } });
    return res.ok ? await res.json() : null;
  } finally { clearTimeout(timer); }
}

const km = (a, b, c, d) => {
  const r = (x) => (x * Math.PI) / 180;
  const h = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};
const plain = (html) => String(html ?? "").replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, "\"").replace(/&#0?39;/g, "'").replace(/\s+/g, " ").trim();
const fold = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

async function findArticle(m) {
  const lang = m.country === "JM" ? "en" : "es";
  const titles = [...new Set([m.name, `${m.name}, ${COUNTRY[m.country]}`, `${m.name} (ciudad)`, `${m.name} (${m.admin_region})`, `${m.name}, ${m.admin_region}`])];
  for (const title of titles) {
    const q = await getJson(`https://${lang}.wikipedia.org/w/api.php?action=query&format=json&redirects=1&prop=images|pageimages|coordinates&piprop=name&imlimit=100&titles=${encodeURIComponent(title)}`);
    const page = Object.values(q?.query?.pages ?? {})[0];
    const c = page?.coordinates?.[0];
    if (!page || page.missing !== undefined || !c) continue;
    const dist = km(m.lat, m.lng, c.lat, c.lon);
    if (dist > MAX_KM) continue;
    return { lang, page, dist, url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, "_"))}` };
  }
  return null;
}

function candidates(m, article) {
  const chosen = OVERRIDES[`${m.country}:${m.admin_region}:${m.name}`];
  if (chosen) return [chosen.startsWith("File:") ? chosen : `File:${chosen}`];
  const town = fold(m.name);
  const lead = article.page.pageimage ? [`File:${article.page.pageimage.replace(/_/g, " ")}`] : [];
  const named = (article.page.images ?? []).map((i) => `File:${i.title.replace(/^[^:]+:/, "")}`)
    .filter((t) => fold(t).includes(town));
  return [...new Set([...lead, ...named])].filter((t) => /\.jpe?g$/i.test(t) && !REJECT.test(t)).slice(0, 8);
}

async function pickPhoto(m, article) {
  const reasons = [];
  for (const fileTitle of candidates(m, article)) {
    const info = await getJson(`https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|size|mime|extmetadata&iiurlwidth=${WIDTH}&titles=${encodeURIComponent(fileTitle)}`);
    const page = Object.values(info?.query?.pages ?? {})[0];
    const ii = page?.imageinfo?.[0];
    const meta = ii?.extmetadata ?? {};
    const license = plain(meta.LicenseShortName?.value);
    const author = plain(meta.Artist?.value).slice(0, 200);
    const why = !ii ? "not on Commons" : ii.mime !== "image/jpeg" ? ii.mime
      : !(ii.thumbwidth >= 480 && ii.thumbwidth >= ii.thumbheight * 1.25) ? `not landscape ${ii.thumbwidth}x${ii.thumbheight}`
      : !FREE.test(license) ? `license "${license}"` : !author || /unknown|desconocido/i.test(author) ? "no author" : null;
    if (why) { reasons.push(`${fileTitle.slice(5, 45)}: ${why}`); continue; }
    const bytes = await download(ii.thumburl);
    if (!bytes) { reasons.push(`${fileTitle.slice(5, 45)}: no JPEG under ${MAX_BYTES} B`); continue; }
    return { fileTitle, bytes, width: ii.thumbwidth, height: ii.thumbheight, license,
             licenseUrl: plain(meta.LicenseUrl?.value) || null, author, sourcePage: ii.descriptionurl };
  }
  return { reasons };
}

/** The lower-quality rendering first, then the normal one; a JPEG within the size limit, or null. */
async function download(thumbUrl) {
  for (const url of [thumbUrl.replace(/\/(\d+px-)/, "/qlow-$1"), thumbUrl]) {
    try {
      const res = await fetch(url, { headers: { "user-agent": UA } });
      const type = (res.headers.get("content-type") ?? "").split(";")[0];
      const bytes = Buffer.from(await res.arrayBuffer());
      if (res.ok && type === "image/jpeg" && bytes.length > 0 && bytes.length <= MAX_BYTES) return bytes;
    } catch { /* try the next rendering */ }
  }
  return null;
}

const { rows } = towns.length
  ? await query(
      `select m.id, m.country::text, m.admin_region, m.name, m.lat, m.lng from municipalities m
        where (m.country::text || ':' || m.admin_region || ':' || m.name) = any($1)`, [towns])
  : await query(
      `select m.id, m.country::text, m.admin_region, m.name, m.lat, m.lng
         from municipalities m
         left join municipality_photos p on p.municipality_id = m.id
        where p.municipality_id is null
          and (m.id in (select municipality_id from clients where active and municipality_id is not null)
            or m.id in (select municipality_id from client_watch_locations))
        order by m.country, m.name`);

let stored = 0;
for (const m of rows) {
  const label = `${m.country} ${m.name} (${m.admin_region})`;
  try {
    const article = await findArticle(m);
    if (!article) { console.log(`- ${label}: no article within ${MAX_KM} km`); continue; }
    const photo = await pickPhoto(m, article);
    if (!photo.bytes) { console.log(`- ${label}: no usable photo in ${article.url}${photo.reasons.length ? ` (${photo.reasons.join("; ")})` : ""}`); continue; }
    const bytes = photo.bytes;
    const line = `${label}: ${photo.fileTitle} · ${photo.author} · ${photo.license} · ${bytes.length} B · ${article.dist.toFixed(1)} km · ${article.url}`;
    if (dryDir) {
      writeFileSync(`${dryDir}/${m.country}-${m.name.replace(/[^\p{L}\p{N}]+/gu, "_")}.jpg`, bytes);
      console.log(`✓ (dry) ${line}`);
      continue;
    }
    await query(
      `insert into municipality_photos (municipality_id, content_type, bytes, width, height, sha256, file_title,
                                        source_page_url, article_url, author, license, license_url, fetched_at)
       values ($1, 'image/jpeg', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
       on conflict (municipality_id) do update
         set bytes = excluded.bytes, width = excluded.width, height = excluded.height, sha256 = excluded.sha256,
             file_title = excluded.file_title, source_page_url = excluded.source_page_url, article_url = excluded.article_url,
             author = excluded.author, license = excluded.license, license_url = excluded.license_url, fetched_at = now()`,
      [m.id, bytes, photo.width, photo.height, createHash("sha256").update(bytes).digest("hex"), photo.fileTitle,
       photo.sourcePage, article.url, photo.author, photo.license, photo.licenseUrl]);
    stored++;
    console.log(`✓ ${line}`);
  } catch (err) {
    console.log(`- ${label}: ${err?.name === "AbortError" ? "timeout" : err.message}`);
  }
}
console.log(`town photos: ${stored} stored of ${rows.length}${dryDir ? " (dry run, nothing stored)" : ""}`);
await closePool();
