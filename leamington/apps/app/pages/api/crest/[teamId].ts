/**
 * GET /crest/{teamId} (rewritten to /api/crest/{teamId}): a team crest from
 * team_crests (0033), served from our own domain so the phone never loads a
 * third-party asset. Crests are fetched server-side by
 * services/ingest/scripts/fetch-crests.mjs.
 *
 * Pages link here only when the crest flag is true. Cached for 30 days; the
 * ETag is the image's sha256. SVG gets a CSP that blocks scripts and loads.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { db } from "../../../lib/db";

export default async function crest(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).end();
  }
  res.setHeader("X-Content-Type-Options", "nosniff");
  const id = String(req.query.teamId ?? "");
  if (!/^\d{1,18}$/.test(id)) {
    res.setHeader("Cache-Control", "no-cache");
    return res.status(404).end();
  }

  const { rows } = await db().query(
    "select content_type, bytes, sha256 from team_crests where team_id = $1", [id]);
  const c = rows[0] as { content_type: string; bytes: Buffer; sha256: string } | undefined;
  if (!c) {
    res.setHeader("Cache-Control", "no-cache");
    return res.status(404).end();
  }

  const etag = `"${c.sha256}"`;
  res.setHeader("Content-Type", c.content_type);
  res.setHeader("Cache-Control", "public, max-age=2592000, immutable");
  res.setHeader("ETag", etag);
  if (c.content_type === "image/svg+xml") {
    res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'");
  }
  if (req.headers["if-none-match"] === etag) return res.status(304).end();
  res.setHeader("Content-Length", String(c.bytes.length));
  return req.method === "HEAD" ? res.status(200).end() : res.status(200).end(c.bytes);
}
