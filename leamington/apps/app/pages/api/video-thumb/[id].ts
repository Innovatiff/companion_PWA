/**
 * GET /video-thumb/{videoId} (rewritten here): a football video's thumbnail as
 * our own cached copy (0049, app.video_thumb). Ingest re-encodes YouTube's
 * thumbnail to one JPEG of at most 14 KB (about 320 x 180); the phone never
 * loads anything from YouTube until the member chooses to watch.
 *
 * Same headers as /photo (lib/photo-serve.ts): 30 days immutable, an ETag from
 * sha256, 304, nosniff, 404 for an unknown video or one without a thumbnail.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { db } from "../../../lib/db";
import { servePhoto } from "../../../lib/photo-serve";

export default function videoThumb(req: NextApiRequest, res: NextApiResponse) {
  const id = String(req.query.id ?? "");
  return servePhoto(req, res, () => /^\d{1,18}$/.test(id)
    ? db().query("select content_type, bytes, sha256 from app.video_thumb($1)", [id]).then((r) => r.rows[0])
    : null);
}
