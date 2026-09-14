/**
 * POST /api/welcome: the welcome screen was seen (app.mark_welcomed, 0041, keeps
 * the first time). Both its arrow and "Saltar" post here; then home.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { sameOrigin } from "@leamington/shared/src/server/portal.ts";
import { db } from "../../lib/db";
import { readSession, cookieValue, clearedCookie } from "../../lib/session";

export default async function welcome(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end();
  }
  if (!sameOrigin(req)) return res.status(403).end();
  const clientId = readSession(cookieValue(req.headers.cookie));
  if (!clientId) return res.redirect(303, "/login");

  const { rows } = await db().query("select app.mark_welcomed($1) as at", [clientId]);
  if (!rows[0]?.at) {
    res.setHeader("Set-Cookie", clearedCookie);
    return res.redirect(303, "/login?e=inactive");
  }
  return res.redirect(303, "/");
}
