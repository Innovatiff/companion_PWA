/**
 * Fetch team crests server-side into team_crests (0033), so Hoy serves them
 * from our own domain and the phone never calls a third party.
 *
 *   railway run --service companion_PWA -- node scripts/fetch-crests.mjs
 *
 * Only the provider's media host is fetched, only images, at most 150 KB each.
 * A crest that cannot be fetched is skipped and reported: the app then shows
 * the team without an image, never a broken one.
 */
import { createHash } from "node:crypto";
import { query, closePool } from "../src/db.mjs";

const ALLOWED_HOSTS = new Set(["media.api-sports.io", "media-4.api-sports.io", "media-3.api-sports.io", "media-2.api-sports.io", "media-1.api-sports.io"]);
const TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);
const MAX_BYTES = 150_000;

const { rows } = await query(
  `select t.id, t.name, t.crest_source_url
     from teams t left join team_crests c on c.team_id = t.id
    where t.crest_source_url is not null
      and (c.team_id is null or c.fetched_at < now() - interval '30 days' or c.source_url <> t.crest_source_url)
    order by t.id`);

let stored = 0;
const skipped = [];
for (const t of rows) {
  try {
    const url = new URL(t.crest_source_url);
    if (url.protocol !== "https:" || !ALLOWED_HOSTS.has(url.hostname)) throw new Error(`host not allowed: ${url.hostname}`);
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 15_000);
    const res = await fetch(url, { signal: ac.signal, headers: { "user-agent": "leamington-ingest/0.1" } });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const type = (res.headers.get("content-type") ?? "").split(";")[0].trim();
    if (!TYPES.has(type)) throw new Error(`not an image: ${type || "no type"}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_BYTES) throw new Error(`size ${bytes.length}`);
    await query(
      `insert into team_crests (team_id, content_type, bytes, sha256, source_url, fetched_at)
       values ($1, $2, $3, $4, $5, now())
       on conflict (team_id) do update
         set content_type = excluded.content_type, bytes = excluded.bytes, sha256 = excluded.sha256,
             source_url = excluded.source_url, fetched_at = now()`,
      [t.id, type, bytes, createHash("sha256").update(bytes).digest("hex"), t.crest_source_url]);
    await query("update teams set crest_fetched_at = now() where id = $1", [t.id]);
    stored++;
  } catch (err) {
    skipped.push(`${t.name}: ${err?.name === "AbortError" ? "timeout" : err.message}`);
  }
}
console.log(`crests: ${stored} stored, ${skipped.length} skipped of ${rows.length}`);
for (const s of skipped) console.log(`  skipped ${s}`);
await closePool();
