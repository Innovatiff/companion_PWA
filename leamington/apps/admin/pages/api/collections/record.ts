/**
 * POST /api/collections/record: record what a business handed over for one week
 * (app.record_week_collection, 0054).
 *
 * Under a per-business-and-week lock: refused if it is more than that week's
 * outstanding amount (a typo such as 240 for 24.0), if the week is not a Sunday
 * or has not started, or if the business is a test or house account. Recording
 * a week also marks that week's commission as kept, in the function.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { asPerson } from "@leamington/shared/src/server/db.ts";
import { field } from "@leamington/shared/src/server/portal.ts";
import { ownerApi, go } from "../../../lib/server.ts";
import { isUuid, parseAmount, toCents } from "../../../lib/rules.ts";

const METHODS = ["efectivo", "transferencia", "deposito", "otro"];
const isWeek = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

export default async function record(req: NextApiRequest, res: NextApiResponse) {
  const person = await ownerApi(req, res);
  if (!person) return;

  const page = "/collections";
  const id = field(req.body, "affiliate_id");
  const week = field(req.body, "week_start");
  if (!isUuid(id) || !isWeek(week)) return go(res, page, { e: "invalid" });
  const amount = parseAmount(field(req.body, "amount"));
  if (!amount) return go(res, page, { e: "amount" });
  const method = METHODS.includes(field(req.body, "method")) ? field(req.body, "method") : "efectivo";
  const note = field(req.body, "note").trim().slice(0, 200);

  const result = await asPerson(person.authUserId, async (q) => {
    await q.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [`collection:${id}:${week}`]);
    const w = (await q.query(
      `select outstanding::text, is_test, is_house from affiliate_week_collections
        where affiliate_id = $1 and week_start = $2::date`, [id, week])).rows[0];
    if (!w || w.is_house || w.is_test) return "invalid";
    if (toCents(amount) > toCents(w.outstanding)) return "over";
    await q.query("select app.record_week_collection($1::uuid, $2::date, $3::numeric, $4, $5, $6::uuid)",
      [id, week, amount, method, note, person.authUserId]);
    return "ok";
  });
  return go(res, page, result === "ok" ? { ok: "collection" } : { e: result });
}
