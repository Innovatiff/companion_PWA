/**
 * POST /api/open: the phone reports home screen opens, including ones served
 * from the offline cache and queued until it was back online.
 *
 * The client id comes from the session cookie only. The database accepts an
 * open only for a render that belongs to that client, and ignores repeats.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { db } from "../../lib/db";
import { readSession, cookieValue } from "../../lib/session";

export const config = { api: { bodyParser: { sizeLimit: "32kb" } } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Open = { render_id: string; opened_at: string; from_cache: boolean; shown: string[] };

export default async function open(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end();
  }
  const clientId = readSession(cookieValue(req.headers.cookie));
  if (!clientId) return res.status(401).end();

  let body: unknown = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { return res.status(400).end(); }
  }
  const opens = (body as { opens?: unknown })?.opens;
  if (!Array.isArray(opens)) return res.status(400).end();

  const clean: Open[] = opens.slice(0, 100).filter((o): o is Open =>
    typeof o?.render_id === "string" && UUID.test(o.render_id)
    && typeof o?.opened_at === "string" && !Number.isNaN(Date.parse(o.opened_at))
    && typeof o?.from_cache === "boolean"
    && Array.isArray(o?.shown) && o.shown.every((k: unknown) => typeof k === "string"));
  if (clean.length) {
    await db().query("select app.record_home_opens($1, $2::jsonb)", [clientId, JSON.stringify(clean)]);
  }
  return res.status(204).end();
}
