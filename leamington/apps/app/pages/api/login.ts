/**
 * POST /api/login from the plain HTML form. The code is the account.
 *
 * The code is normalised the way the affiliate reads it aloud ("0" -> "Q",
 * "1" -> "J", ...), then checked in the database, which throttles repeated
 * failures from the same source. Success sets the session cookie and goes home.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { normalizeCode, isValidCode } from "@leamington/shared/src/code.ts";
import { sourceHash } from "@leamington/shared/src/server/source.ts";
import { db } from "../../lib/db";
import { makeSession, sessionCookie, secureCookies } from "../../lib/session";

export default async function login(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end();
  }
  const back = (reason: string) => res.redirect(303, `/login?e=${reason}`);

  const typed = typeof req.body?.code === "string" ? req.body.code : "";
  if (!isValidCode(typed)) return back("invalid");

  const { rows } = await db().query("select app.login_with_code($1, $2) as result",
    [normalizeCode(typed), sourceHash(req, "client")]);
  const result = rows[0]?.result as { status: string; client_id?: string } | undefined;
  if (!result || result.status !== "ok" || !result.client_id) return back(result?.status ?? "invalid");

  res.setHeader("Set-Cookie", sessionCookie(makeSession(result.client_id), secureCookies()));
  return res.redirect(303, "/");
}
