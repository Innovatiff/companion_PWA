/**
 * GET /api/preview/photo/{municipalityId}: the town's photo for Vista previa, from
 * municipality_photos (0034, the row app.town_photo describes). The preview shows
 * its credit next to it. Headers as Hoy's /photo (lib/picture.ts).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { servePicture } from "../../../../lib/picture.ts";

export default function photo(req: NextApiRequest, res: NextApiResponse) {
  return servePicture(req, res, "municipalityId", (q, id) =>
    q.query("select content_type, bytes, sha256 from municipality_photos where municipality_id = $1::bigint", [id]).then((r) => r.rows[0]));
}
