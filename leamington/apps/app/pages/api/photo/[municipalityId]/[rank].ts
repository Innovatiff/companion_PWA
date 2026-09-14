/**
 * GET /photo/{municipalityId}/{rank} (rewritten here): one photo of a town's
 * gallery (0045). Rank 1 is the town's photo (municipality_photos); ranks 2-6
 * are municipality_gallery_photos. Exactly the headers of /photo/{id}
 * (lib/photo-serve.ts); 404 for a rank the town does not have.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { db } from "../../../../lib/db";
import { servePhoto } from "../../../../lib/photo-serve";

export default function galleryPhoto(req: NextApiRequest, res: NextApiResponse) {
  const id = String(req.query.municipalityId ?? "");
  const rank = String(req.query.rank ?? "");
  if (!/^\d{1,18}$/.test(id) || !/^[1-6]$/.test(rank)) return servePhoto(req, res, () => null);
  return servePhoto(req, res, () => (rank === "1"
    ? db().query("select content_type, bytes, sha256 from municipality_photos where municipality_id = $1", [id])
    : db().query("select content_type, bytes, sha256 from municipality_gallery_photos where municipality_id = $1 and rank = $2", [id, Number(rank)])
  ).then((r) => r.rows[0]));
}
