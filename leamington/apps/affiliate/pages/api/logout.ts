/** POST /api/logout: clear the portal cookie and go to sign-in. */
import type { NextApiRequest, NextApiResponse } from "next";
import { sameOrigin, signOutCookie } from "@leamington/shared/src/server/portal.ts";

export default async function logout(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end();
  }
  if (!sameOrigin(req)) return res.status(403).end();
  res.setHeader("Set-Cookie", signOutCookie("affiliate"));
  return res.redirect(303, "/login");
}
