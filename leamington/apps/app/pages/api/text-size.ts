/**
 * POST /api/text-size: Letra grande. Saves "normal" or "large" for the signed-in
 * client (app.set_text_size, 0040), then returns to Más, where the next page
 * already renders <html class="big"> or not.
 *
 * The client id comes from the session cookie only; a foreign origin is refused,
 * and so is any value other than the two sizes.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { sameOrigin, field } from "@leamington/shared/src/server/portal.ts";
import { db } from "../../lib/db";
import { readSession, cookieValue, clearedCookie } from "../../lib/session";

const SIZES = ["normal", "large"];

export default async function textSize(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end();
  }
  if (!sameOrigin(req)) return res.status(403).end();
  const clientId = readSession(cookieValue(req.headers.cookie));
  if (!clientId) return res.redirect(303, "/login");

  const size = field(req.body, "size");
  if (!SIZES.includes(size)) return res.status(400).end();

  try {
    const { rows } = await db().query("select app.set_text_size($1, $2) as size", [clientId, size]);
    if (!rows[0]?.size) {
      // Not an active client any more: signed out, as every page does.
      res.setHeader("Set-Cookie", clearedCookie);
      return res.redirect(303, "/login?e=inactive");
    }
  } catch (err) {
    if ((err as { code?: string }).code === "23514") return res.status(400).end();
    throw err;
  }
  return res.redirect(303, "/mas#letra");
}
