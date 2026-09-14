/**
 * GET /photo/{municipalityId} (rewritten to /api/photo/{municipalityId}): a
 * town's photo from municipality_photos (0034), served from our own domain so
 * the phone never loads a third-party asset. Photos are freely licensed images
 * from Wikimedia Commons, fetched server-side by
 * services/ingest/scripts/fetch-town-photos.mjs; every page that shows one
 * shows its credit (author and license, linked to the file's page).
 *
 * Same caching and security headers as /crest: 30 days, ETag from sha256,
 * nosniff, 404 when absent.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { db } from "../../../lib/db";

export default async function photo(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).end();
  }
  res.setHeader("X-Content-Type-Options", "nosniff");
  const id = String(req.query.municipalityId ?? "");
  if (!/^\d{1,18}$/.test(id)) {
    res.setHeader("Cache-Control", "no-cache");
    return res.status(404).end();
  }

  const { rows } = await db().query(
    "select content_type, bytes, sha256 from municipality_photos where municipality_id = $1", [id]);
  const p = rows[0] as { content_type: string; bytes: Buffer; sha256: string } | undefined;
  if (!p) {
    res.setHeader("Cache-Control", "no-cache");
    return res.status(404).end();
  }

  const etag = `"${p.sha256}"`;
  res.setHeader("Content-Type", p.content_type);
  res.setHeader("Cache-Control", "public, max-age=2592000, immutable");
  res.setHeader("ETag", etag);
  if (req.headers["if-none-match"] === etag) return res.status(304).end();
  res.setHeader("Content-Length", String(p.bytes.length));
  return req.method === "HEAD" ? res.status(200).end() : res.status(200).end(p.bytes);
}
