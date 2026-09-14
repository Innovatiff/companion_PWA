/**
 * POST /api/theme: Modo noche (0046). Saves "auto", "light" or "dark" for the
 * signed-in client (app.set_theme), then returns to Más, where the next page
 * renders <html class="dark">, <html class="light"> or neither (auto follows
 * the phone). Same origin and session checks as the other member forms; any
 * other value is refused.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { sameOrigin, field } from "@leamington/shared/src/server/portal.ts";
import { db } from "../../lib/db";
import { readSession, cookieValue, clearedCookie } from "../../lib/session";

const THEMES = ["auto", "light", "dark"];

export default async function theme(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end();
  }
  if (!sameOrigin(req)) return res.status(403).end();
  const clientId = readSession(cookieValue(req.headers.cookie));
  if (!clientId) return res.redirect(303, "/login");

  const value = field(req.body, "theme");
  if (!THEMES.includes(value)) return res.status(400).end();

  try {
    const { rows } = await db().query("select app.set_theme($1, $2) as theme", [clientId, value]);
    if (!rows[0]?.theme) {
      res.setHeader("Set-Cookie", clearedCookie);
      return res.redirect(303, "/login?e=inactive");
    }
  } catch (err) {
    if ((err as { code?: string }).code === "23514") return res.status(400).end();
    throw err;
  }
  return res.redirect(303, "/mas#tema");
}
