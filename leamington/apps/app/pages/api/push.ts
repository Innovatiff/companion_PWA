/**
 * POST /api/push: save or turn off this phone's push subscription.
 *
 *   {"action": "subscribe", "subscription": {"endpoint", "keys": {"p256dh", "auth"}}}
 *   {"action": "unsubscribe", "endpoint": "..."}
 *
 * The client id comes from the session cookie only; the database validates the
 * subscription (0027).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { sameOrigin } from "@leamington/shared/src/server/portal.ts";
import { db } from "../../lib/db";
import { readSession, cookieValue } from "../../lib/session";

export const config = { api: { bodyParser: { sizeLimit: "8kb" } } };

const str = (v: unknown): string => (typeof v === "string" ? v : "");

export default async function push(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end();
  }
  if (!sameOrigin(req)) return res.status(403).end();
  const clientId = readSession(cookieValue(req.headers.cookie));
  if (!clientId) return res.status(401).end();

  const body = (typeof req.body === "object" && req.body) || {};
  try {
    if (body.action === "subscribe") {
      const s = body.subscription ?? {};
      await db().query("select app.save_push_subscription($1, $2, $3, $4, $5)",
        [clientId, str(s.endpoint), str(s.keys?.p256dh), str(s.keys?.auth), str(req.headers["user-agent"])]);
      return res.status(204).end();
    }
    if (body.action === "unsubscribe") {
      await db().query("select app.remove_push_subscription($1, $2)", [clientId, str(body.endpoint)]);
      return res.status(204).end();
    }
    return res.status(400).end();
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "23514") return res.status(400).end();
    if (code === "42501") return res.status(401).end();
    throw err;
  }
}
