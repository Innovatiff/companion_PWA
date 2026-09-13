/** POST /api/setup: set the password with the one-time token, then sign in. */
import type { NextApiRequest, NextApiResponse } from "next";
import { completeSetup, sameOrigin, field } from "@leamington/shared/src/server/portal.ts";
import { qs } from "../../lib/rules.ts";

export default async function setup(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end();
  }
  if (!sameOrigin(req)) return res.status(403).end();
  const token = field(req.body, "token");
  const password = field(req.body, "password");
  if (password !== field(req.body, "confirm")) return res.redirect(303, `/setup${qs({ token, e: "mismatch" })}`);
  const r = await completeSetup(token, password);
  if (r.status !== "ok") return res.redirect(303, `/setup${qs({ token, e: r.status })}`);
  return res.redirect(303, r.role === "owner" ? "/login?m=setup" : "/login?m=other_portal");
}
