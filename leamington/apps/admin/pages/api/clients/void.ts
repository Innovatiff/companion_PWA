/** POST /api/clients/void: void a payment, with a required reason (app.void_subscription). */
import type { NextApiRequest, NextApiResponse } from "next";
import { asPerson } from "@leamington/shared/src/server/db.ts";
import { field } from "@leamington/shared/src/server/portal.ts";
import { ownerApi, go, pgCode } from "../../../lib/server.ts";
import { isUuid } from "../../../lib/rules.ts";

export default async function voidPayment(req: NextApiRequest, res: NextApiResponse) {
  const person = await ownerApi(req, res);
  if (!person) return;

  const clientId = field(req.body, "client_id");
  const subId = field(req.body, "subscription_id");
  const reason = field(req.body, "reason").trim().slice(0, 200);
  if (!isUuid(clientId)) return go(res, "/clients");
  const page = `/clients/${clientId}`;
  if (!isUuid(subId)) return go(res, page, { e: "invalid" });
  if (!reason) return res.redirect(303, `${page}?void=${subId}&e=reason#void`);

  try {
    const done = await asPerson(person.authUserId, async (q) => {
      const own = await q.query("select 1 from subscriptions where id = $1 and client_id = $2", [subId, clientId]);
      if (!own.rows[0]) return false;
      await q.query("select app.void_subscription($1::uuid, $2)", [subId, reason]);
      return true;
    });
    return go(res, page, done ? { ok: "voided" } : { e: "invalid" });
  } catch (err) {
    if (pgCode(err) === "23514") return go(res, page, { e: "already" });
    throw err;
  }
}
