/**
 * Serving a town photo's bytes from our own database, with one set of headers
 * for every route that does it (/photo/{id}, 0034, and /photo/{id}/{rank},
 * 0045): 30 days immutable, an ETag from sha256, nosniff, 304 on the ETag,
 * 404 when absent. The phone never loads a third-party asset.
 */
import type { NextApiRequest, NextApiResponse } from "next";

type Row = { content_type: string; bytes: Buffer; sha256: string } | undefined;

export async function servePhoto(req: NextApiRequest, res: NextApiResponse, load: () => Promise<Row> | null) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).end();
  }
  res.setHeader("X-Content-Type-Options", "nosniff");
  const p = await load();
  if (!p) {
    res.setHeader("Cache-Control", "no-cache");
    return res.status(404).end();
  }
  const etag = `"${p.sha256}"`;
  res.setHeader("Content-Type", p.content_type);
  res.setHeader("Cache-Control", "public, max-age=2592000, immutable");
  res.setHeader("ETag", etag);
  if (req.headers["if-none-match"] === etag) return res.status(304).end();
  res.setHeader("Content-Length", String(p.bytes.length));
  return req.method === "HEAD" ? res.status(200).end() : res.status(200).end(p.bytes);
}
