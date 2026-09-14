/**
 * GET /news-image/{itemId}/{thumb|lead} (rewritten here): a story's picture as
 * our own cached copy (0047, app.news_image). Ingest keeps a thumb (about 160 px,
 * at most 10 KB) and a lead (about 480 px, at most 45 KB) JPEG of the publisher's
 * picture; the phone never loads it from the publisher. No bytes for a story
 * whose picture is suppressed (graphic) or whose outlet's pictures are off.
 *
 * Same headers as /photo (lib/photo-serve.ts): 30 days immutable, an ETag from
 * the picture's sha256 and variant, 304, nosniff, 404 when absent.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { db } from "../../../../lib/db";
import { servePhoto } from "../../../../lib/photo-serve";

export default function newsImage(req: NextApiRequest, res: NextApiResponse) {
  const id = String(req.query.id ?? "");
  const size = String(req.query.size ?? "");
  return servePhoto(req, res, () => /^\d{1,18}$/.test(id) && (size === "thumb" || size === "lead")
    ? db().query("select content_type, bytes, sha256 from app.news_image($1, $2)", [id, size]).then((r) => r.rows[0])
    : null);
}
