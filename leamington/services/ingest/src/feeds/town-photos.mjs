/**
 * Hometown photos from Wikimedia Commons: photo 1 into municipality_photos
 * (0034), photos 2-6 into municipality_gallery_photos (0045).
 * Runs daily for towns that clients live in or watch; scripts/fetch-town-photos.mjs
 * runs it by hand (with --dry-run to review).
 *
 *   1. Find the town's own Wikipedia article (Spanish; English for Jamaica) and
 *      require its coordinates within 25 km of our town, so a same-name place
 *      elsewhere is never used.
 *   2. Photo 1, in order: the article's lead image, then photos whose file name
 *      contains the town's name. An article's other files can show other places
 *      ("Avenida en Tegucigalpa" on San Pedro Sula's page), so they are never used.
 *   3. Gallery (photos 2-6): only files of the same article whose file name, or
 *      Commons title, names the town, and that name no other place; never maps,
 *      flags, arms, logos, diagrams, collages or portraits of people (by file
 *      name and by Commons categories).
 *   4. Every photo: a landscape JPEG on Commons, a free license (CC0, public
 *      domain, CC BY, CC BY-SA) and a named author. Hoy shows both as a credit.
 *   5. Download Commons' 480 px rendering (lower quality first), at most 120 KB,
 *      and at most DOWNLOAD_CAP downloads per run so Wikimedia is not hammered.
 * A person's choices and exclusions live in src/feeds/town-photo-overrides.json;
 * a chosen file still passes every check. No photo that passes is no photo.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { query } from "../db.mjs";

const UA = "HoyApp/1.0 (https://hoy-production.up.railway.app; hometown photos from Wikimedia Commons, daily, at most 20 downloads)";
const WIDTH = 480;
const MAX_BYTES = 120_000;
const MAX_KM = 25;
export const GALLERY_SIZE = 6;          // photo 1 plus five more
export const DOWNLOAD_CAP = 20;         // per run
const GALLERY_RECHECK_DAYS = 30;        // a town whose gallery could not be filled is looked at again after this
const COUNTRY = { MX: "México", GT: "Guatemala", HN: "Honduras", JM: "Jamaica" };
const REJECT = /(escudo|coat[_ ]of[_ ]arms|bandera|flag|mapa|\bmap\b|locator|location|localizaci|seal|sello|logo|emblem|diagram|plano|collage)/i;
/** Gallery only: file names that are never a view of the town. */
export const GALLERY_REJECT = /(escudo|arms|bandera|flag|mapa|\bmaps?\b|locator|location|localizaci|ubicaci|seal|sello|logo|emblem|insignia|diagram|diagrama|grafic|graph|chart|plano|croquis|collage|montaje|mosaico|montage|signature|firma|retrato|portrait|busto|bust\b|estatua de|monumento a |selfie|poster|cartel|afiche|billete|moneda|stamp|sello postal|timbre|screenshot|captura|\bdivisi[oó]n|municipios?\b.*\b(de|of)\b.*\b(estado|departamento|parish)|census|censo|poblaci[oó]n|clima|climograma|satellite|satelite|sentinel|landsat|nasa|iss\d|\bsts-|aerial view of .* region|\b1[5-9]\d\d\b|siglo x[vix]+\b|antigu[ao]s? fotograf|pintura|painting|postal\b|postcard|grabado|litograf|\b(hotel|hostal|motel|resort|bank|banco|mall|dairy|plant|factory|f[aá]brica|supermercado|tienda|walmart))/i;
/** Commons categories that mark a file as not a view of the town. */
export const CATEGORY_REJECT = /(portraits?\b|people of|people with|men of|women of|\bmen\b|\bwomen\b|politicians|presidents|mayors|governors|musicians|singers|actors|actresses|footballers|players|athletes|births|deaths|\bflags?\b|coats? of arms|\bmaps?\b|locator maps|logos|diagrams|charts|signatures|seals of|emblems|satellite pictures|images from space|iss expedition|collages|paintings?|postcards?|drawings|engravings|lithographs?|illustrations|black and white photographs|\b1[5-9]\d\d (in|photographs)\b|\bin the 1[5-9]\d0s\b|\b(1[5-9]|20)th century\b|earthquake|hotels|companies|\bshops\b|shopping|\bbanks\b|restaurants|factories|supermarkets|advertisements)/i;

/**
 * The town's own article, not its department's, state's or parish's: the
 * article's title is the town's name, or starts with it ("Uruapan del
 * Progreso", "Huehuetenango (municipio)", "Kingston, Jamaica").
 */
export function isTownArticle(town, title) {
  const f = fold(title);
  const n = fold(town.name);
  if (/\b(departamento|department|estado|state|parish|region|provincia|province)\b/.test(f.replace(n, " "))) return false;
  return f === n || f.startsWith(`${n} `) || f.startsWith(`municipio de ${n}`) || f.startsWith(`ciudad de ${n}`);
}
/** Gallery only: a Commons description whose subject is a business ("Bank of Occidente in San Pedro Sula"). */
export const DESCRIPTION_REJECT = /(\b(bank|banco) (of|de|del)\b|^\s*(hotel|bank|banco|mall|factory|f[aá]brica|supermarket|supermercado|tienda|store|shop)\b|\b(dairy|processing plant|shopping mall|centro comercial|plaza comercial)\b|^\s*(an? )?(building|edificio)s? (in|en|de)\b)/i;
export const FREE_LICENSE = /^(cc0|cc-zero|public domain|pd\b|pd-|cc by(-sa)? ?\d(\.\d)?|cc-by(-sa)?-\d(\.\d)?)/i;

export function loadOverrides(url = new URL("./town-photo-overrides.json", import.meta.url)) {
  try {
    const j = JSON.parse(readFileSync(url, "utf8"));
    return { photos: j.photos ?? {}, gallery: j.gallery ?? {} };
  } catch {
    return { photos: {}, gallery: {} };
  }
}

async function getJson(fetchImpl, url) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 15_000);
  try {
    const res = await fetchImpl(url, { signal: ac.signal, headers: { "user-agent": UA, accept: "application/json" } });
    return res.ok ? await res.json() : null;
  } finally { clearTimeout(timer); }
}

const km = (a, b, c, d) => {
  const r = (x) => (x * Math.PI) / 180;
  const h = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};
const plain = (html) => String(html ?? "").replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, "\"").replace(/&#0?39;/g, "'").replace(/\s+/g, " ").trim();
export const fold = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const key = (town) => `${town.country}:${town.admin_region}:${town.name}`;
const asFile = (t) => (t.startsWith("File:") ? t : `File:${t.replace(/^[^:]+:/, "")}`).replace(/_/g, " ");

async function findArticle(m, fetchImpl, { townOnly = false } = {}) {
  const lang = m.country === "JM" ? "en" : "es";
  const titles = [...new Set([m.name, `${m.name}, ${COUNTRY[m.country]}`, `${m.name} (ciudad)`, `${m.name} (${m.admin_region})`, `${m.name}, ${m.admin_region}`])];
  for (const title of titles) {
    const q = await getJson(fetchImpl, `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&redirects=1&prop=images|pageimages|coordinates&piprop=name&imlimit=500&titles=${encodeURIComponent(title)}`);
    const page = Object.values(q?.query?.pages ?? {})[0];
    const c = page?.coordinates?.[0];
    if (!page || page.missing !== undefined || !c) continue;
    if (townOnly && !isTownArticle(m, page.title)) continue;
    const dist = km(m.lat, m.lng, c.lat, c.lon);
    if (dist > MAX_KM) continue;
    return { lang, page, dist, url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, "_"))}` };
  }
  return null;
}

/** The files that may be photo 1 for a town, in order. Exported for tests. */
export function photoCandidates(town, page, overrides = {}) {
  const chosen = overrides[key(town)];
  if (chosen) return [chosen.startsWith("File:") ? chosen : `File:${chosen}`];
  const name = fold(town.name);
  const lead = page.pageimage ? [`File:${page.pageimage.replace(/_/g, " ")}`] : [];
  const named = (page.images ?? []).map((i) => `File:${i.title.replace(/^[^:]+:/, "")}`)
    .filter((t) => fold(t).includes(name));
  return [...new Set([...lead, ...named])].filter((t) => /\.jpe?g$/i.test(t) && !REJECT.test(t)).slice(0, 8);
}

/**
 * The files that may join a town's gallery, in order, before the Commons checks.
 * From the town's own article only; named after the town; not photo 1 or a file
 * already stored; not excluded by a person; never a map, flag, arms, logo,
 * diagram, collage or portrait by file name; never a file that names another
 * place we know (`otherPlaces`, folded names). A person's `include` list comes
 * first and still passes every later check. Exported for tests.
 */
export function galleryCandidates(town, page, { overrides = {}, have = [], otherPlaces = [] } = {}) {
  const o = overrides[key(town)] ?? {};
  const exclude = new Set((o.exclude ?? []).map(asFile));
  const taken = new Set(have.map(asFile));
  const name = fold(town.name);
  const others = otherPlaces.map(fold).filter((p) => p && p !== name && !name.includes(p) && !p.includes(name));
  const inPage = (page.images ?? []).map((i) => asFile(i.title));
  const auto = inPage.filter((t) => {
    const f = fold(t.replace(/\.[a-z]+$/i, ""));
    return f.includes(name) && !others.some((p) => new RegExp(`\\b${p}\\b`).test(f.replace(name, " ")));
  });
  const ok = (t) => /\.jpe?g$/i.test(t) && !GALLERY_REJECT.test(t) && !exclude.has(t) && !taken.has(t);
  return [...new Set([...(o.include ?? []).map(asFile), ...auto])].filter(ok);
}

/** Why a Commons file cannot be used, or null. `gallery` adds the category checks. */
export function rejectReason(ii, { gallery = false } = {}) {
  const meta = ii?.extmetadata ?? {};
  const license = plain(meta.LicenseShortName?.value);
  const author = plain(meta.Artist?.value);
  if (!ii) return "not on Commons";
  if (ii.mime !== "image/jpeg") return ii.mime;
  if (!(ii.thumbwidth >= 480 && ii.thumbwidth >= ii.thumbheight * 1.25)) return `not landscape ${ii.thumbwidth}x${ii.thumbheight}`;
  if (!FREE_LICENSE.test(license)) return `license "${license}"`;
  if (!author || /unknown|desconocido|anonymous|an[oó]nimo/i.test(author)) return "no author";
  if (gallery) {
    if (ii.thumbwidth > ii.thumbheight * 2) return `panorama ${ii.thumbwidth}x${ii.thumbheight}`;
    const cats = plain(meta.Categories?.value);
    const hit = cats.split("|").find((c) => CATEGORY_REJECT.test(c));
    if (hit) return `category "${hit.slice(0, 60)}"`;
    const description = plain(meta.ImageDescription?.value);
    if (DESCRIPTION_REJECT.test(description)) return `description "${description.slice(0, 60)}"`;
  }
  return null;
}

async function download(thumbUrl, fetchImpl) {
  for (const url of [thumbUrl.replace(/\/(\d+px-)/, "/qlow-$1"), thumbUrl]) {
    try {
      const res = await fetchImpl(url, { headers: { "user-agent": UA } });
      const type = (res.headers.get("content-type") ?? "").split(";")[0];
      const bytes = Buffer.from(await res.arrayBuffer());
      if (res.ok && type === "image/jpeg" && bytes.length > 0 && bytes.length <= MAX_BYTES) return bytes;
    } catch { /* try the next rendering */ }
  }
  return null;
}

/** A per-run download budget. `take()` is false once it is spent. */
export function downloadBudget(cap = DOWNLOAD_CAP) {
  let used = 0;
  return { take: () => (used < cap ? (used++, true) : false), get used() { return used; }, get spent() { return used >= cap; }, cap };
}

async function fileInfo(fileTitle, fetchImpl) {
  const info = await getJson(fetchImpl, `https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|size|mime|extmetadata&iiurlwidth=${WIDTH}&titles=${encodeURIComponent(fileTitle)}`);
  return Object.values(info?.query?.pages ?? {})[0]?.imageinfo?.[0] ?? null;
}

/** Check then download one file. {photo} | {reason} | {capped: true}. */
async function tryFile(fileTitle, { gallery, budget, fetchImpl }) {
  const ii = await fileInfo(fileTitle, fetchImpl);
  const why = rejectReason(ii, { gallery });
  if (why) return { reason: `${fileTitle.slice(5, 50)}: ${why}` };
  if (!budget.take()) return { capped: true };
  const bytes = await download(ii.thumburl, fetchImpl);
  if (!bytes) return { reason: `${fileTitle.slice(5, 50)}: no JPEG under ${MAX_BYTES} B` };
  const meta = ii.extmetadata ?? {};
  return { photo: { fileTitle, bytes, width: ii.thumbwidth, height: ii.thumbheight, license: plain(meta.LicenseShortName?.value),
                    licenseUrl: plain(meta.LicenseUrl?.value) || null, author: plain(meta.Artist?.value).slice(0, 200),
                    sourcePage: ii.descriptionurl, description: plain(meta.ImageDescription?.value).slice(0, 120) } };
}

async function pickPhoto(town, article, overrides, { budget, fetchImpl }) {
  const reasons = [];
  for (const fileTitle of photoCandidates(town, article.page, overrides)) {
    const r = await tryFile(fileTitle, { gallery: false, budget, fetchImpl });
    if (r.capped) return { reasons, capped: true };
    if (r.photo) return r.photo;
    reasons.push(r.reason);
  }
  return { reasons };
}

/** The free ranks, lowest first, for up to `want` new photos. Exported for tests. */
export function freeRanks(usedRanks, want) {
  const used = new Set(usedRanks.map(Number));
  const out = [];
  for (let r = 2; r <= GALLERY_SIZE && out.length < want; r++) if (!used.has(r)) out.push(r);
  return out;
}

/**
 * Gallery photos for one town: checks candidates in order and downloads until
 * the free ranks are filled, the candidates run out, or the budget is spent.
 * Returns { photos: [{rank, ...photo}], reasons, capped, exhausted }.
 * Exported for tests (fetchImpl is mocked there).
 */
export async function fetchGallery(town, page, { usedRanks = [], have = [], overrides = {}, otherPlaces = [], budget = downloadBudget(), fetchImpl = fetch } = {}) {
  const ranks = freeRanks(usedRanks, GALLERY_SIZE);
  const photos = [];
  const reasons = [];
  let capped = false;
  const candidates = galleryCandidates(town, page, { overrides, have, otherPlaces });
  let i = 0;
  const seen = new Set();
  for (; i < candidates.length && photos.length < ranks.length; i++) {
    const r = await tryFile(candidates[i], { gallery: true, budget, fetchImpl });
    if (r.capped) { capped = true; break; }
    if (r.reason) { reasons.push(r.reason); continue; }
    const sha = createHash("sha256").update(r.photo.bytes).digest("hex");
    if (seen.has(sha)) { reasons.push(`${candidates[i].slice(5, 50)}: same image as another`); continue; }
    seen.add(sha);
    photos.push({ rank: ranks[photos.length], sha256: sha, ...r.photo });
  }
  return { photos, reasons, capped, exhausted: !capped && i >= candidates.length };
}

async function townsToFetch(towns) {
  const cols = `m.id, m.country::text, m.admin_region, m.name, m.lat, m.lng,
                p.file_title as lead_title, p.gallery_checked_at,
                coalesce((select array_agg(g.rank) from municipality_gallery_photos g where g.municipality_id = m.id), '{}') as ranks,
                coalesce((select array_agg(g.file_title) from municipality_gallery_photos g where g.municipality_id = m.id), '{}') as titles`;
  if (towns.length) {
    return (await query(
      `select ${cols} from municipalities m left join municipality_photos p on p.municipality_id = m.id
        where (m.country::text || ':' || m.admin_region || ':' || m.name) = any($1)`, [towns])).rows;
  }
  // No photo yet, or a gallery with room whose last look was long enough ago.
  return (await query(
    `select ${cols}
       from municipalities m
       left join municipality_photos p on p.municipality_id = m.id
      where (m.id in (select municipality_id from clients where active and municipality_id is not null)
          or m.id in (select municipality_id from client_watch_locations))
        and (p.municipality_id is null
          or ((select count(*) from municipality_gallery_photos g where g.municipality_id = m.id) < $1 - 1
              and (p.gallery_checked_at is null or p.gallery_checked_at < now() - make_interval(days => $2))))
      order by (p.municipality_id is null) desc, m.country, m.name`, [GALLERY_SIZE, GALLERY_RECHECK_DAYS])).rows;
}

async function otherPlaceNames(town) {
  // Names of other municipalities and admin regions we know, in any of our
  // countries, that a file name could show instead of this town.
  const { rows } = await query(
    `select distinct n from (select name as n from municipalities where id <> $1 and length(name) >= 5
                             union select admin_region from municipalities where length(admin_region) >= 5) s`, [town.id]);
  return rows.map((r) => r.n).filter((n) => !fold(town.admin_region).includes(fold(n)));
}

const safe = (s) => s.replace(/[^\p{L}\p{N}]+/gu, "_");

/**
 * The feed. `towns` ("COUNTRY:Region:Town") limits the run to those towns;
 * `dryDir` saves the chosen photos there (photo 1 as -1.jpg, gallery as -2..-6)
 * instead of storing them; `cap` is the download budget for the run.
 */
export async function ingestTownPhotos(ctx, { towns = [], dryDir = null, cap = DOWNLOAD_CAP, fetchImpl = fetch } = {}) {
  const log = ctx.log ?? { info() {}, warn() {} };
  const overrides = loadOverrides();
  if (dryDir) mkdirSync(dryDir, { recursive: true });
  const rows = await townsToFetch(towns);
  const budget = downloadBudget(cap);

  let stored = 0;
  const lines = [];
  for (const m of rows) {
    const label = `${m.country} ${m.name} (${m.admin_region})`;
    if (budget.spent) { lines.push(`- ${label}: download cap of ${cap} reached, next run`); continue; }
    try {
      const article = await findArticle(m, fetchImpl);
      if (!article) { lines.push(`- ${label}: no article within ${MAX_KM} km`); continue; }

      let lead = m.lead_title;
      if (!lead || dryDir) {
        const photo = await pickPhoto(m, article, overrides.photos, { budget, fetchImpl });
        if (photo.capped) { lines.push(`- ${label}: download cap of ${cap} reached, next run`); continue; }
        if (!photo.bytes) { lines.push(`- ${label}: no usable photo in ${article.url}${photo.reasons.length ? ` (${photo.reasons.join("; ")})` : ""}`); continue; }
        lead = photo.fileTitle;
        const line = `${label}: #1 ${photo.fileTitle} · ${photo.author} · ${photo.license} · ${photo.bytes.length} B · ${article.dist.toFixed(1)} km · ${article.url}`;
        if (dryDir) {
          writeFileSync(`${dryDir}/${m.country}-${safe(m.name)}-1.jpg`, photo.bytes);
          lines.push(`✓ (dry) ${line}`);
        } else {
          await query(
            `insert into municipality_photos (municipality_id, content_type, bytes, width, height, sha256, file_title,
                                              source_page_url, article_url, author, license, license_url, fetched_at)
             values ($1, 'image/jpeg', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
             on conflict (municipality_id) do update
               set bytes = excluded.bytes, width = excluded.width, height = excluded.height, sha256 = excluded.sha256,
                   file_title = excluded.file_title, source_page_url = excluded.source_page_url, article_url = excluded.article_url,
                   author = excluded.author, license = excluded.license, license_url = excluded.license_url, fetched_at = now()`,
            [m.id, photo.bytes, photo.width, photo.height, createHash("sha256").update(photo.bytes).digest("hex"), photo.fileTitle,
             photo.sourcePage, article.url, photo.author, photo.license, photo.licenseUrl]);
          stored++;
          lines.push(`✓ ${line}`);
        }
      }

      // The gallery comes only from the town's own article (photo 1 may have come
      // from a department article that redirects from the town's name).
      const galleryArticle = isTownArticle(m, article.page.title) ? article : await findArticle(m, fetchImpl, { townOnly: true });
      if (!galleryArticle) {
        lines.push(`- ${label}: no gallery, ${article.url} is not the town's own article and none was found`);
        if (!dryDir) await query(`update municipality_photos set gallery_checked_at = now() where municipality_id = $1`, [m.id]);
        continue;
      }
      if (dryDir) lines.push(`  ${label}: gallery from ${galleryArticle.url}`);
      const g = await fetchGallery(m, galleryArticle.page, {
        usedRanks: dryDir ? [] : m.ranks, have: [lead, ...(dryDir ? [] : m.titles)],
        overrides: overrides.gallery, otherPlaces: await otherPlaceNames(m), budget, fetchImpl,
      });
      for (const p of g.photos) {
        const line = `${label}: #${p.rank} ${p.fileTitle} · ${p.author} · ${p.license} · ${p.bytes.length} B${p.description ? ` · "${p.description}"` : ""}`;
        if (dryDir) {
          writeFileSync(`${dryDir}/${m.country}-${safe(m.name)}-${p.rank}.jpg`, p.bytes);
          lines.push(`✓ (dry) ${line}`);
          continue;
        }
        await query(
          `insert into municipality_gallery_photos (municipality_id, rank, content_type, bytes, width, height, sha256, file_title,
                                                    source_page_url, article_url, author, license, license_url, fetched_at)
           values ($1, $2, 'image/jpeg', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now())
           on conflict do nothing`,
          [m.id, p.rank, p.bytes, p.width, p.height, p.sha256, p.fileTitle, p.sourcePage, galleryArticle.url, p.author, p.license, p.licenseUrl]);
        stored++;
        lines.push(`✓ ${line}`);
      }
      for (const r of g.reasons) lines.push(`  · ${label} skipped ${r}`);
      if (g.capped) lines.push(`- ${label}: gallery stopped at the download cap of ${cap}, next run`);
      // Looked at every candidate: do not ask Wikimedia again for a while.
      if (!dryDir && !g.capped) {
        await query(`update municipality_photos set gallery_checked_at = now() where municipality_id = $1`, [m.id]);
      }
    } catch (err) {
      lines.push(`- ${label}: ${err?.name === "AbortError" ? "timeout" : err.message}`);
    }
  }
  log.info("town_photos", { towns: rows.length, stored, downloads: budget.used, cap, dry: Boolean(dryDir) });
  return { recordsWritten: stored, lines, towns: rows.length, downloads: budget.used };
}
