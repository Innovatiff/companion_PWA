/**
 * News: headlines from the national and regional outlets in news_sources
 * (0047), every 30 minutes. Copyright stance: docs/OPEN-DECISIONS.md 3.24.
 *
 * Per run:
 *   1. Read every active outlet's official RSS/Atom feed (timeout, size cap).
 *      An outlet that does not answer, or answers with something that is not a
 *      feed, is a warning (the run is partial); if no outlet answers the run
 *      fails, recorded as an error: never "no news".
 *   2. Keep items with a title, an https url and a date within 30 days. Store
 *      only the headline, the outlet's own summary cut to 300 characters, the
 *      url and the time. Dedupe by guid per outlet and by normalised url
 *      across outlets.
 *   3. A picture from the item's own feed tags, else the article's og:image
 *      (one page fetch per new item, at most PAGE_CAP per run). Downloaded at
 *      most 2 MB, JPEG or PNG, made into a thumb and a lead JPEG (news/image.mjs),
 *      at most IMAGE_CAP per run, shared out across outlets. An item whose
 *      picture fails is stored without one. Never hotlinked.
 *   4. Mentions of our clients' towns (the forecast feed's targets) in title and
 *      summary (news/mentions.mjs).
 *   5. Prune stories older than 30 days and unused pictures.
 *
 * `dryDir` fetches everything and writes nothing to the database: pictures are
 * saved there as files, and the result carries per-outlet stats and mentions
 * (scripts/fetch-news.mjs).
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { query } from "../db.mjs";
import { targetMunicipalities } from "./forecast.mjs";
import { parseFeed, ogImage, normaliseUrl } from "./news/parse.mjs";
import { makeVariants, sniff, DOWNLOAD_MAX_BYTES } from "./news/image.mjs";
import { findMentions, sharedNames } from "./news/mentions.mjs";
import { graphicTerm } from "./news/graphic.mjs";

export const IMAGE_CAP = 40;        // new pictures made per run
export const PAGE_CAP = 40;         // article pages read for og:image per run
export const MAX_AGE_DAYS = 30;
const FEED_MAX_BYTES = 5_000_000;
const PAGE_MAX_BYTES = 1_500_000;
const FEED_TIMEOUT_MS = 20_000;
const PAGE_TIMEOUT_MS = 12_000;
const IMAGE_TIMEOUT_MS = 15_000;
const FEED_CONCURRENCY = 4;
const UA = "HoyApp/1.0 (https://hoy-production.up.railway.app; headlines with links to the publisher, every 30 minutes)";
const IMAGE_TYPES = new Set(["image/jpeg", "image/jpg", "image/pjpeg", "image/png", "image/webp"]);
/** Site-wide pictures (logos, share defaults) that are not the story's own. */
const GENERIC_IMAGE = /(logo|placeholder|default[-_]?(image|og|share|thumb)|imagemeta|no[-_]?image|sin[-_]?imagen|share[-_]?default|favicon)/i;

/** A per-run budget: take() is false once spent. */
export function budget(cap) {
  let used = 0;
  return { take: () => (used < cap ? (used++, true) : false), get used() { return used; }, cap };
}

/** GET with a timeout and a byte cap. Throws on no answer, timeout, or a body over the cap. */
export async function fetchCapped(url, { fetchImpl = globalThis.fetch, timeoutMs, maxBytes, accept = "*/*" }) {
  const ac = new AbortController();
  let why = null;
  const timer = setTimeout(() => { why = `timeout after ${timeoutMs} ms`; ac.abort(); }, timeoutMs);
  try {
    const res = await fetchImpl(url, { signal: ac.signal, redirect: "follow", headers: { "user-agent": UA, accept } });
    const declared = Number(res.headers?.get?.("content-length"));
    if (declared > maxBytes) { why = `over ${maxBytes} bytes`; ac.abort(); throw new Error(why); }
    let bytes;
    if (res.body?.getReader) {
      const reader = res.body.getReader();
      const chunks = [];
      let total = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > maxBytes) { why = `over ${maxBytes} bytes`; ac.abort(); throw new Error(why); }
        chunks.push(Buffer.from(value));
      }
      bytes = Buffer.concat(chunks);
    } else {
      bytes = Buffer.from(await res.arrayBuffer());
      if (bytes.length > maxBytes) { why = `over ${maxBytes} bytes`; throw new Error(why); }
    }
    const type = (res.headers?.get?.("content-type") ?? "").split(";")[0].trim().toLowerCase();
    return { ok: res.ok, status: res.status, type, bytes, url: res.url || url };
  } catch (err) {
    if (why) throw new Error(why);
    throw new Error(err?.cause?.code ? `${err.cause.code}` : (err?.message ?? String(err)));
  } finally {
    clearTimeout(timer);
  }
}

/** Download a picture and make both variants. Throws with the reason. */
export async function fetchPicture(url, { fetchImpl }) {
  // JPEG or PNG only in Accept: with image/* some image servers answer WebP, which we cannot decode.
  const get = () => fetchCapped(url, { fetchImpl, timeoutMs: IMAGE_TIMEOUT_MS, maxBytes: DOWNLOAD_MAX_BYTES, accept: "image/jpeg,image/png;q=0.9" });
  let r;
  try {
    r = await get();
  } catch (err) {
    // A dropped connection (seen on two image CDNs) is tried once more; a timeout or an oversized picture is not.
    if (!/^(UND_ERR_SOCKET|ERR_HTTP2|ECONNRESET|EPIPE|fetch failed)/.test(err.message)) throw err;
    r = await get();
  }
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const kind = sniff(r.bytes);
  if (!IMAGE_TYPES.has(r.type) && !(kind && r.type.startsWith("application/octet-stream"))) throw new Error(`not an accepted image: ${r.type || "no type"}`);
  if (kind === "image/webp") throw new Error("WebP is not decoded");
  const sha256 = createHash("sha256").update(r.bytes).digest("hex");
  return { sha256, downloaded: r.bytes.length, variants: makeVariants(r.bytes) };
}

/** Pictures used by 3 or more items of one feed are the outlet's default picture, not the story's. */
export function repeatedImages(items) {
  const count = new Map();
  for (const it of items) if (it.imageUrl) count.set(it.imageUrl, (count.get(it.imageUrl) ?? 0) + 1);
  return new Set([...count].filter(([, n]) => n >= 3).map(([u]) => u));
}

/** Items of several outlets interleaved, newest first within each, so a per-run budget is shared out. */
export function interleave(lists) {
  const out = [];
  for (let i = 0; lists.some((l) => i < l.length); i++) for (const l of lists) if (i < l.length) out.push(l[i]);
  return out;
}

async function mapLimit(list, limit, fn) {
  const out = new Array(list.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, async () => {
    while (next < list.length) { const i = next++; out[i] = await fn(list[i], i); }
  }));
  return out;
}

/** The database side of a run. */
export function dbStore() {
  return {
    async sources() {
      return (await query(`select id, key, name, country::text, admin_region, feed_url, homepage_url, show_images from news_sources where active order by country, id`)).rows;
    },
    async towns() {
      const targets = (await targetMunicipalities()).filter((t) => t.kind === "municipality");
      if (!targets.length) return [];
      return (await query(`select id, name, country::text, admin_region from municipalities where id = any($1::bigint[])`, [targets.map((t) => t.id)])).rows;
    },
    async catalogue() {
      return (await query(`select name from municipalities`)).rows;
    },
    async known(sourceId, guids, urlKeys) {
      const g = await query(`select id, guid, image_checked_at is null as unchecked from news_items where source_id = $1 and guid = any($2::text[])`, [sourceId, guids]);
      const u = await query(`select url_key from news_items where url_key = any($1::text[])`, [urlKeys]);
      return {
        guids: new Set(g.rows.map((r) => r.guid)),
        urlKeys: new Set(u.rows.map((r) => r.url_key)),
        unchecked: new Map(g.rows.filter((r) => r.unchecked).map((r) => [r.guid, r.id])),
      };
    },
    async setImage(itemId, imageId) {
      await query(`update news_items set image_id = coalesce($2, image_id), image_checked_at = now() where id = $1`, [itemId, imageId]);
    },
    async imageBySha(sha256) {
      return (await query(`select id from news_images where sha256 = $1`, [sha256])).rows[0]?.id ?? null;
    },
    async saveImage({ sha256, sourceUrl, variants: v }) {
      const { rows } = await query(
        `insert into news_images (sha256, source_url, thumb, thumb_width, thumb_height, lead, lead_width, lead_height)
         values ($1, $2, $3, $4, $5, $6, $7, $8)
         on conflict (sha256) do update set fetched_at = news_images.fetched_at
         returning id`,
        [sha256, sourceUrl, v.thumb.bytes, v.thumb.width, v.thumb.height, v.lead.bytes, v.lead.width, v.lead.height]);
      return rows[0].id;
    },
    async saveItem(source, it, imageId, checked, suppressed = null) {
      const { rows } = await query(
        `insert into news_items (source_id, guid, url, url_key, title, summary, published_at, image_id, image_checked_at, image_suppressed)
         values ($1, $2, $3, $4, $5, $6, $7, $8, case when $9::boolean then now() end, $10)
         on conflict do nothing returning id`,
        [source.id, it.guid, it.url, it.urlKey, it.title, it.summary, it.publishedAt, imageId, Boolean(checked), suppressed]);
      return rows[0]?.id ?? null;
    },
    async saveMentions(itemId, mentions) {
      for (const m of mentions) {
        await query(`insert into news_mentions (item_id, municipality_id, matched, rule) values ($1, $2, $3, $4) on conflict do nothing`,
          [itemId, m.municipalityId, m.matched.slice(0, 120), m.rule]);
      }
    },
    async prune(now) {
      return (await query(`select app.prune_news($1) as r`, [now])).rows[0].r;
    },
  };
}

const safe = (s) => String(s).replace(/[^\p{L}\p{N}]+/gu, "_").slice(0, 60);

/** A store that writes nothing to the database: pictures go to `dir`. Sources and towns are given. */
export function dryStore(dir, { sources, towns, catalogue }) {
  mkdirSync(dir, { recursive: true });
  let seq = 0;
  const images = new Map();
  return {
    sources: async () => sources,
    towns: async () => towns,
    catalogue: async () => catalogue ?? towns,
    known: async () => ({ guids: new Set(), urlKeys: new Set(), unchecked: new Map() }),
    setImage: async () => {},
    imageBySha: async (sha) => images.get(sha) ?? null,
    async saveImage({ sha256, variants, name }) {
      const id = ++seq;
      images.set(sha256, id);
      writeFileSync(`${dir}/${safe(name)}-${id}-lead.jpg`, variants.lead.bytes);
      writeFileSync(`${dir}/${safe(name)}-${id}-thumb.jpg`, variants.thumb.bytes);
      return id;
    },
    saveItem: async () => ++seq,
    saveMentions: async () => {},
    prune: async () => null,
  };
}

/**
 * The feed. Options: fetchImpl (tests), now, imageCap, pageCap, store (dryStore
 * for a dry run). Returns { recordsWritten, sourceResult, stats, mentions }.
 */
export async function ingestNews(ctx, { fetchImpl = globalThis.fetch, now = new Date(), imageCap = IMAGE_CAP, pageCap = PAGE_CAP, store = dbStore() } = {}) {
  const log = ctx.log ?? { info() {}, warn() {} };
  const warnings = ctx.warnings ?? (ctx.warnings = []);
  const sources = await store.sources();
  if (!sources.length) {
    warnings.push("no active news sources; nothing was fetched");
    return { recordsWritten: 0, stats: [], mentions: [] };
  }
  const towns = await store.towns();
  const shared = sharedNames(await store.catalogue());
  const oldest = now.getTime() - MAX_AGE_DAYS * 864e5;
  const newest = now.getTime() + 3600e3;

  const stats = new Map(sources.map((s) => [s.key, { key: s.key, name: s.name, country: s.country, items: 0, fresh: 0, stored: 0, withImage: 0, imageFailures: 0, suppressed: 0, picturesOff: 0, thumbBytes: [], leadBytes: [], dropped: 0, error: null, failures: [] }]));

  // 1. Every feed, a few at a time.
  const fetched = await mapLimit(sources, FEED_CONCURRENCY, async (s) => {
    const st = stats.get(s.key);
    try {
      const r = await fetchCapped(s.feed_url, { fetchImpl, timeoutMs: FEED_TIMEOUT_MS, maxBytes: FEED_MAX_BYTES, accept: "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.1" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const parsed = parseFeed(r.bytes.toString("utf8"), { baseUrl: s.feed_url });
      const inWindow = parsed.items.filter((it) => it.publishedAt.getTime() >= oldest && it.publishedAt.getTime() <= newest);
      st.items = parsed.items.length;
      st.dropped = parsed.dropped + (parsed.items.length - inWindow.length);
      if (parsed.items.length === 0 && parsed.dropped > 0) warnings.push(`${s.key}: every item lacked a title, url or date`);
      const repeated = repeatedImages(parsed.items);
      for (const it of inWindow) {
        if (it.imageUrl && (repeated.has(it.imageUrl) || GENERIC_IMAGE.test(it.imageUrl))) it.imageUrl = null;
        it.urlKey = normaliseUrl(it.url);
      }
      return { source: s, items: inWindow.filter((it) => it.urlKey).sort((a, b) => b.publishedAt - a.publishedAt) };
    } catch (err) {
      st.error = err.message;
      warnings.push(`${s.key}: ${err.message}`);
      log.warn("news.source_failed", { source: s.key, error: err.message });
      return null;
    }
  });

  const answered = fetched.filter(Boolean);
  if (!answered.length) {
    // Not "no news": nobody answered. runFeed records this run as an error.
    const e = new Error(`no news source answered (${sources.length} tried): ${[...stats.values()].map((s) => `${s.key}: ${s.error}`).join("; ").slice(0, 900)}`);
    e.detail = e.message;   // kept as written by describeError (an outlet's "HTTP 403" is not our proxy)
    throw e;
  }

  // 2. New items only: not stored for this outlet (guid) nor under the same url by any outlet.
  const seenKeys = new Set();
  const perSource = [];
  const backfill = [];
  for (const { source, items } of answered) {
    const known = items.length ? await store.known(source.id, items.map((i) => i.guid), items.map((i) => i.urlKey)) : { guids: new Set(), urlKeys: new Set(), unchecked: new Map() };
    const fresh = items.filter((it) => {
      if (known.guids.has(it.guid) || known.urlKeys.has(it.urlKey) || seenKeys.has(it.urlKey)) return false;
      seenKeys.add(it.urlKey);
      return true;
    });
    stats.get(source.key).fresh = fresh.length;
    perSource.push(fresh.map((it) => ({ source, it })));
    // Stored by an earlier run whose picture budget was spent: still listed, so still worth a picture.
    // (Never for an outlet whose pictures are off, nor a story whose picture is suppressed.)
    if (source.show_images !== false) {
      backfill.push(items.filter((it) => known.unchecked?.has(it.guid) && !graphicTerm(it)).map((it) => ({ source, it, itemId: known.unchecked.get(it.guid) })));
    }
  }

  // 3-4. Pictures (budgeted, shared out across outlets), items, mentions.
  const images = budget(imageCap);
  const pages = budget(pageCap);
  const byUrl = new Map();
  const mentionsFound = [];
  const suppressedFound = [];
  const pictured = [];
  let written = 0;

  /** The story's picture: { imageId, checked }. checked is false only when a budget stopped the look. */
  async function pictureFor(source, it, st) {
    let imageUrl = it.imageUrl;
    if (!imageUrl) {
      if (!pages.take()) return { imageId: null, checked: false };
      try {
        const page = await fetchCapped(it.url, { fetchImpl, timeoutMs: PAGE_TIMEOUT_MS, maxBytes: PAGE_MAX_BYTES, accept: "text/html" });
        if (page.ok) imageUrl = ogImage(page.bytes.toString("utf8"), page.url);
        if (imageUrl && GENERIC_IMAGE.test(imageUrl)) imageUrl = null;
      } catch { /* no picture from the page */ }
      if (!imageUrl) return { imageId: null, checked: true };
    }
    if (byUrl.has(imageUrl)) return { imageId: byUrl.get(imageUrl), checked: true };
    if (!images.take()) return { imageId: null, checked: false };
    let imageId = null;
    try {
      const pic = await fetchPicture(imageUrl, { fetchImpl });
      imageId = (await store.imageBySha(pic.sha256))
        ?? await store.saveImage({ sha256: pic.sha256, sourceUrl: imageUrl, variants: pic.variants, name: `${source.key}-${it.title.slice(0, 30)}` });
      st.thumbBytes.push(pic.variants.thumb.bytes.length);
      st.leadBytes.push(pic.variants.lead.bytes.length);
    } catch (err) {
      st.imageFailures++;
      st.failures.push(`${imageUrl.slice(0, 90)}: ${err.message}`);
    }
    byUrl.set(imageUrl, imageId);
    return { imageId, checked: true };
  }

  for (const { source, it } of interleave(perSource)) {
    const st = stats.get(source.key);
    try {
      // No graphic pictures: a death or violence story keeps its text, its picture is never fetched.
      // An outlet with pictures off is not fetched either (left unchecked, so switching back on backfills).
      const term = graphicTerm(it);
      const { imageId, checked } = term ? { imageId: null, checked: true }
        : source.show_images === false ? { imageId: null, checked: false }
        : await pictureFor(source, it, st);
      const itemId = await store.saveItem(source, it, imageId, checked, term);
      if (!itemId) continue;
      written++;
      st.stored++;
      if (term) { st.suppressed++; suppressedFound.push({ source: source.key, term, title: it.title }); }
      if (!term && source.show_images === false) st.picturesOff++;
      if (imageId) { st.withImage++; pictured.push({ source: source.key, title: it.title }); }
      const mentions = findMentions(it, source, towns, { shared });
      if (mentions.length) {
        await store.saveMentions(itemId, mentions);
        for (const m of mentions) mentionsFound.push({ ...m, town: towns.find((t) => t.id === m.municipalityId)?.name, source: source.key, title: it.title });
      }
    } catch (err) {
      warnings.push(`${source.key}: item not stored (${err.message.slice(0, 120)})`);
    }
  }

  // Pictures for stories an earlier run stored without looking, newest first, with what budget is left.
  let backfilled = 0;
  for (const { source, it, itemId } of interleave(backfill)) {
    if (images.used >= images.cap) break;
    try {
      const { imageId, checked } = await pictureFor(source, it, stats.get(source.key));
      if (!checked) continue;
      await store.setImage(itemId, imageId);
      if (imageId) { backfilled++; stats.get(source.key).withImage++; }
    } catch (err) {
      warnings.push(`${source.key}: picture not stored (${err.message.slice(0, 120)})`);
    }
  }

  // 5. Prune.
  const pruned = await store.prune(now);

  const list = [...stats.values()];
  log.info("news", {
    sources: sources.length, answered: answered.length, stored: written, backfilled, images: images.used, pages: pages.used,
    imageFailures: list.reduce((n, s) => n + s.imageFailures, 0), mentions: mentionsFound.length, pruned,
  });
  return { recordsWritten: written, sourceResult: "items", stats: list, mentions: mentionsFound, suppressed: suppressedFound, pictured, imagesUsed: images.used, pagesUsed: pages.used };
}
