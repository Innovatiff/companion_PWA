/**
 * GET /api/preview/news-thumb/{itemId}: a story's small picture (app.news_image
 * 'thumb', 0047, at most 10 KB), never for a graphic story or an outlet whose
 * pictures are off. Headers as Hoy's /news-image (lib/picture.ts).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { servePicture } from "../../../../lib/picture.ts";

export default function newsThumb(req: NextApiRequest, res: NextApiResponse) {
  return servePicture(req, res, "id", (q, id) =>
    q.query("select content_type, bytes, sha256 from app.news_image($1::bigint, 'thumb')", [id]).then((r) => r.rows[0]));
}
