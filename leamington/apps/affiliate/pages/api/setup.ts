/**
 * POST /api/setup: set the password with the one-time token, then sign in.
 * The two typed passwords must match; the database enforces the length and the
 * token (0018).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { completeSetup, field, sameOrigin } from "@leamington/shared/src/server/portal.ts";

export default async function setup(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end();
  }
  if (!sameOrigin(req)) return res.status(403).end();

  const token = field(req.body, "token").trim().slice(0, 200);
  const password = field(req.body, "password");
  const back = (status: string) => res.redirect(303, `/setup?token=${encodeURIComponent(token)}&e=${status}`);

  if (!token) return back("invalid_token");
  if (password !== field(req.body, "password2")) return back("mismatch");

  const result = await completeSetup(token, password);
  if (result.status !== "ok") return back(result.status);
  if (result.role !== "affiliate") return back("invalid_token");
  return res.redirect(303, `/login?ok=setup&login=${encodeURIComponent(result.login ?? "")}`);
}
