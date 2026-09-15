/**
 * The preview's pictures from our own database, served by this portal (it cannot
 * rely on Hoy's domain routes). The same headers as Hoy's /photo, /crest and
 * /video-thumb (apps/app/lib/photo-serve.ts): 30 days immutable, an ETag from
 * sha256, 304 on the ETag, nosniff, 404 when absent. Read inside asPerson, so
 * only a signed-in affiliate gets bytes; anyone else gets the same 404.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { currentPerson } from "@leamington/shared/src/server/portal.ts";
import { asPerson, type Queryable } from "@leamington/shared/src/server/db.ts";

type Row = { content_type: string; bytes: Buffer; sha256: string } | undefined;

export async function servePicture(req: NextApiRequest, res: NextApiResponse, param: string,
                                   load: (q: Queryable, id: string) => Promise<Row>) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).end();
  }
  res.setHeader("X-Content-Type-Options", "nosniff");
  const id = String(req.query[param] ?? "");
  const person = /^\d{1,18}$/.test(id) ? await currentPerson(req, "affiliate") : null;
  const p = person ? await asPerson(person.authUserId, (q) => load(q, id)) : undefined;
  if (!p) {
    res.setHeader("Cache-Control", "no-cache");
    return res.status(404).end();
  }
  const etag = `"${p.sha256}"`;
  res.setHeader("Content-Type", p.content_type);
  res.setHeader("Cache-Control", "public, max-age=2592000, immutable");
  res.setHeader("ETag", etag);
  // A crest may be SVG: no scripts, no loads.
  if (p.content_type === "image/svg+xml") res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'");
  if (req.headers["if-none-match"] === etag) return res.status(304).end();
  res.setHeader("Content-Length", String(p.bytes.length));
  return req.method === "HEAD" ? res.status(200).end() : res.status(200).end(p.bytes);
}
