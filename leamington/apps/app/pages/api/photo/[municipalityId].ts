/**
 * GET /photo/{municipalityId} (rewritten to /api/photo/{municipalityId}): a
 * town's photo from municipality_photos (0034), served from our own domain so
 * the phone never loads a third-party asset. Photos are freely licensed images
 * from Wikimedia Commons, fetched server-side by
 * services/ingest/scripts/fetch-town-photos.mjs; every page that shows one
 * shows its credit (author and license, linked to the file's page).
 *
 * Same caching and security headers as /crest and the gallery (lib/photo-serve.ts):
 * 30 days, ETag from sha256, nosniff, 404 when absent.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { db } from "../../../lib/db";
import { servePhoto } from "../../../lib/photo-serve";

export default function photo(req: NextApiRequest, res: NextApiResponse) {
  const id = String(req.query.municipalityId ?? "");
  return servePhoto(req, res, () => /^\d{1,18}$/.test(id)
    ? db().query("select content_type, bytes, sha256 from municipality_photos where municipality_id = $1", [id]).then((r) => r.rows[0])
    : null);
}
