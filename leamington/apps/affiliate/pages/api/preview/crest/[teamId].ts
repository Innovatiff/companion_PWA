/**
 * GET /api/preview/crest/{teamId}: a team crest from team_crests (0033), linked
 * only when the preview's crest flag is true. Headers as Hoy's /crest (lib/picture.ts),
 * including the SVG content security policy.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { servePicture } from "../../../../lib/picture.ts";

export default function crest(req: NextApiRequest, res: NextApiResponse) {
  return servePicture(req, res, "teamId", (q, id) =>
    q.query("select content_type, bytes, sha256 from team_crests where team_id = $1::bigint", [id]).then((r) => r.rows[0]));
}
