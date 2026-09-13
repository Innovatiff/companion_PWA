/**
 * POST /api/affiliates/payout: record cash paid to an affiliate (app.record_payout).
 *
 * Under a per-affiliate lock: refused if another payout was recorded since the
 * page was loaded (a double tap), and refused if it is more than the affiliate
 * is owed (a typo such as 240 for 24.0). There is no function to void a payout,
 * so a mistake here must be prevented rather than undone.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { asPerson } from "@leamington/shared/src/server/db.ts";
import { field } from "@leamington/shared/src/server/portal.ts";
import { ownerApi, go } from "../../../lib/server.ts";
import { isUuid, parseAmount, toCents } from "../../../lib/rules.ts";

const METHODS = ["efectivo", "transferencia", "deposito", "otro"];

export default async function payout(req: NextApiRequest, res: NextApiResponse) {
  const person = await ownerApi(req, res);
  if (!person) return;

  const id = field(req.body, "affiliate_id");
  if (!isUuid(id)) return go(res, "/affiliates");
  const page = `/affiliates/${id}`;
  const amount = parseAmount(field(req.body, "amount"));
  if (!amount) return go(res, page, { e: "amount" });
  const method = METHODS.includes(field(req.body, "method")) ? field(req.body, "method") : "otro";
  const note = field(req.body, "note").trim().slice(0, 200);
  const expectLast = field(req.body, "last_payout");

  const result = await asPerson(person.authUserId, async (q) => {
    await q.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [`payout:${id}`]);
    const last = (await q.query(
      "select coalesce(max(id)::text, 'none') as last from affiliate_payouts where affiliate_id = $1", [id])).rows[0].last;
    if (last !== expectLast) return "stale";
    const e = (await q.query("select owed::text, is_house from affiliate_earnings where affiliate_id = $1", [id])).rows[0];
    if (!e || e.is_house) return "invalid";
    if (toCents(amount) > toCents(e.owed)) return "over";
    await q.query("select app.record_payout($1::uuid, $2::numeric, $3, $4, $5::uuid)", [id, amount, method, note, person.authUserId]);
    return "ok";
  });
  return go(res, page, result === "ok" ? { ok: "payout" } : { e: result });
}
