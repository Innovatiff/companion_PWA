/**
 * POST /api/logout: end the owner's session on the server (app.portal_sign_out,
 * 0028), so a copied cookie stops working too, then clear the cookie.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { signOut, sameOrigin } from "@leamington/shared/src/server/portal.ts";

export default async function logout(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end();
  }
  if (!sameOrigin(req)) return res.status(403).end();
  res.setHeader("Set-Cookie", await signOut(req, "owner"));
  return res.redirect(303, "/login?m=out");
}
