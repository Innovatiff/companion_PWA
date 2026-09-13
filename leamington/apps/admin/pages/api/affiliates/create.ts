/**
 * POST /api/affiliates/create: app.create_affiliate creates the affiliate and
 * their portal login in one transaction and returns a one-time setup token. The
 * token goes to the affiliate's page in a short-lived cookie and is shown once.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { asPerson } from "@leamington/shared/src/server/db.ts";
import { field } from "@leamington/shared/src/server/portal.ts";
import { ownerApi, go, pgCode } from "../../../lib/server.ts";
import { parsePercent, normalizeLogin } from "../../../lib/rules.ts";
import { flashCookie } from "../../../lib/flash.ts";

export default async function create(req: NextApiRequest, res: NextApiResponse) {
  const person = await ownerApi(req, res);
  if (!person) return;

  const values = {
    name: field(req.body, "name").trim().slice(0, 120),
    business: field(req.body, "business").trim().slice(0, 120),
    contact: field(req.body, "contact").trim().slice(0, 120),
    commission: field(req.body, "commission").trim(),
    login: field(req.body, "login").trim(),
    language: field(req.body, "language") === "en" ? "en" : "es",
  };
  const back = (e: string) => go(res, "/affiliates/new", { ...values, e });

  if (!values.name) return back("name");
  const rate = parsePercent(values.commission);
  if (rate === null) return back("commission");
  const login = normalizeLogin(values.login);
  if (!login) return back("login");

  try {
    const r = await asPerson(person.authUserId, async (q) => (await q.query(
      "select app.create_affiliate($1, $2, $3, $4::numeric, $5, $6::ui_language) as r",
      [values.name, values.business, values.contact, rate, login, values.language])).rows[0].r as { affiliate_id: string; setup_token: string });
    res.setHeader("Set-Cookie", flashCookie(r.affiliate_id, r.setup_token));
    return go(res, `/affiliates/${r.affiliate_id}`, { ok: "created" });
  } catch (err) {
    if (pgCode(err) === "23505") return back("login_taken");
    if (pgCode(err) === "23514") return back("invalid");
    throw err;
  }
}
