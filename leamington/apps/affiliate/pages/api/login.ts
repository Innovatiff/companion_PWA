/**
 * POST /api/login from the plain HTML form. The database checks the password and
 * throttles failures per source and per login name (0018).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { field, sameOrigin, signIn } from "@leamington/shared/src/server/portal.ts";

export default async function login(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end();
  }
  if (!sameOrigin(req)) return res.status(403).end();

  const name = field(req.body, "login").trim().slice(0, 40);
  const password = field(req.body, "password");
  const back = (status: string) =>
    res.redirect(303, `/login?e=${status}${name ? `&login=${encodeURIComponent(name)}` : ""}`);
  if (!name || !password) return back("invalid");

  const result = await signIn(req, "affiliate", name, password);
  if (result.status !== "ok" || !result.cookie) return back(result.status === "ok" ? "invalid" : result.status);

  res.setHeader("Set-Cookie", result.cookie);
  return res.redirect(303, "/");
}
