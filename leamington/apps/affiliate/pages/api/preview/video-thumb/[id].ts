/**
 * GET /api/preview/video-thumb/{videoId}: our cached thumbnail of a football video
 * (app.video_thumb, 0049), at most 14 KB. Headers as Hoy's /video-thumb (lib/picture.ts).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { servePicture } from "../../../../lib/picture.ts";

export default function videoThumb(req: NextApiRequest, res: NextApiResponse) {
  return servePicture(req, res, "id", (q, id) =>
    q.query("select content_type, bytes, sha256 from app.video_thumb($1::bigint)", [id]).then((r) => r.rows[0]));
}
