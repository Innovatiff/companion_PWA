/**
 * POST /api/affiliates/reset: a new one-time setup link (app.reset_affiliate_login).
 * It clears the current password and ends the affiliate's sessions.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { asPerson } from "@leamington/shared/src/server/db.ts";
import { field } from "@leamington/shared/src/server/portal.ts";
import { ownerApi, go, pgCode } from "../../../lib/server.ts";
import { isUuid } from "../../../lib/rules.ts";
import { flashCookie } from "../../../lib/flash.ts";

export default async function reset(req: NextApiRequest, res: NextApiResponse) {
  const person = await ownerApi(req, res);
  if (!person) return;

  const id = field(req.body, "affiliate_id");
  if (!isUuid(id)) return go(res, "/affiliates");
  try {
    const token = await asPerson(person.authUserId, async (q) =>
      (await q.query("select app.reset_affiliate_login($1::uuid) as token", [id])).rows[0].token as string);
    res.setHeader("Set-Cookie", flashCookie(id, token));
    return go(res, `/affiliates/${id}`, { ok: "reset" });
  } catch (err) {
    if (pgCode(err) === "23514") return go(res, `/affiliates/${id}`, { e: "nologin" });
    throw err;
  }
}
