/**
 * Team crests into team_crests (0033), so Hoy serves them from our own domain.
 * Runs daily for teams without a crest (new teams appear with fixtures);
 * scripts/fetch-crests.mjs runs it by hand.
 *
 * Only the provider's media host, only images, at most 50 KB (Hoy's budget).
 * The provider serves one stock "logo soon" image for teams without a crest; it
 * is not that team's crest and is never stored. Beyond that known image, any
 * image identical for two or more teams is removed the same way. A team without
 * a crest shows its initials.
 */
import { createHash } from "node:crypto";
import { query } from "../db.mjs";

const ALLOWED_HOSTS = new Set(["media.api-sports.io", "media-1.api-sports.io", "media-2.api-sports.io", "media-3.api-sports.io", "media-4.api-sports.io"]);
const TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);
export const MAX_CREST_BYTES = 50_000;
// League logos: four images, shown on Fútbol only, cached 30 days (0037).
export const MAX_LEAGUE_LOGO_BYTES = 150_000;
export const PLACEHOLDER_SHA256 = new Set(["9f8004a0b4a645c2061f82ebf7ede6520830c071eb2ca9a37fa3f150d53bef11"]);

/** Why a fetched image may not be stored as a crest, or null. Exported for tests. */
export function crestRejection({ type, bytes, sha256 }, maxBytes = MAX_CREST_BYTES) {
  if (!TYPES.has(type)) return `not an image: ${type || "no type"}`;
  if (!bytes || bytes.length === 0 || bytes.length > maxBytes) return `size ${bytes?.length ?? 0}`;
  if (PLACEHOLDER_SHA256.has(sha256)) return "provider placeholder image, not a crest";
  return null;
}

export async function ingestCrests(ctx) {
  const log = ctx.log ?? { info() {} };
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
      const bytes = Buffer.from(await res.arrayBuffer());
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      const why = crestRejection({ type, bytes, sha256 });
      if (why) throw new Error(why);
      await query(
        `insert into team_crests (team_id, content_type, bytes, sha256, source_url, fetched_at)
         values ($1, $2, $3, $4, $5, now())
         on conflict (team_id) do update
           set content_type = excluded.content_type, bytes = excluded.bytes, sha256 = excluded.sha256,
               source_url = excluded.source_url, fetched_at = now()`,
        [t.id, type, bytes, sha256, t.crest_source_url]);
      await query("update teams set crest_fetched_at = now() where id = $1", [t.id]);
      stored++;
    } catch (err) {
      skipped.push(`${t.name}: ${err?.name === "AbortError" ? "timeout" : err.message}`);
    }
  }

  // League logos, under the same rules.
  const { rows: leagues } = await query(
    `select l.id, l.name, l.crest_source_url
       from leagues l left join league_crests c on c.league_id = l.id
      where l.crest_source_url is not null
        and (c.league_id is null or c.fetched_at < now() - interval '30 days' or c.source_url <> l.crest_source_url)
      order by l.id`);
  for (const l of leagues) {
    try {
      const url = new URL(l.crest_source_url);
      if (url.protocol !== "https:" || !ALLOWED_HOSTS.has(url.hostname)) throw new Error(`host not allowed: ${url.hostname}`);
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 15_000);
      const res = await fetch(url, { signal: ac.signal, headers: { "user-agent": "leamington-ingest/0.1" } });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const type = (res.headers.get("content-type") ?? "").split(";")[0].trim();
      const bytes = Buffer.from(await res.arrayBuffer());
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      const why = crestRejection({ type, bytes, sha256 }, MAX_LEAGUE_LOGO_BYTES);
      if (why) throw new Error(why);
      await query(
        `insert into league_crests (league_id, content_type, bytes, sha256, source_url, fetched_at)
         values ($1, $2, $3, $4, $5, now())
         on conflict (league_id) do update
           set content_type = excluded.content_type, bytes = excluded.bytes, sha256 = excluded.sha256,
               source_url = excluded.source_url, fetched_at = now()`,
        [l.id, type, bytes, sha256, l.crest_source_url]);
      stored++;
    } catch (err) {
      skipped.push(`league ${l.name}: ${err?.name === "AbortError" ? "timeout" : err.message}`);
    }
  }

  // An image identical for several teams is stock, not a crest; oversized ones break the budget.
  const removed = await query(
    `delete from team_crests
      where sha256 in (select sha256 from team_crests group by sha256 having count(*) > 1)
         or octet_length(bytes) > $1
     returning team_id`, [MAX_CREST_BYTES]);

  log.info("crests", { teams: rows.length, stored, skipped: skipped.length, removed: removed.rowCount });
  return { recordsWritten: stored, skipped, removed: removed.rowCount, teams: rows.length };
}
