/**
 * POST /api/login from the sign-in form. An affiliate's credentials are refused
 * here as "invalid" (packages/shared/src/server/portal.ts).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { signIn, sameOrigin, field } from "@leamington/shared/src/server/portal.ts";

export default async function login(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end();
  }
  if (!sameOrigin(req)) return res.status(403).end();
  const r = await signIn(req, "owner", field(req.body, "login"), field(req.body, "password"));
  if (r.status !== "ok" || !r.cookie) return res.redirect(303, `/login?m=${r.status}`);
  res.setHeader("Set-Cookie", r.cookie);
  return res.redirect(303, "/");
}
