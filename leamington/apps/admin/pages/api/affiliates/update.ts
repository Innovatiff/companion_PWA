/**
 * POST /api/affiliates/update: deactivate, reactivate, or change the commission
 * (app.update_affiliate sets both, so the other value is read under a lock and
 * kept). A new commission applies to later payments only.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { asPerson } from "@leamington/shared/src/server/db.ts";
import { field } from "@leamington/shared/src/server/portal.ts";
import { ownerApi, go } from "../../../lib/server.ts";
import { isUuid, parsePercent } from "../../../lib/rules.ts";

export default async function update(req: NextApiRequest, res: NextApiResponse) {
  const person = await ownerApi(req, res);
  if (!person) return;

  const id = field(req.body, "affiliate_id");
  const action = field(req.body, "action");
  if (!isUuid(id)) return go(res, "/affiliates");
  const page = `/affiliates/${id}`;
  if (!["deactivate", "reactivate", "commission"].includes(action)) return go(res, page, { e: "invalid" });
  const rate = action === "commission" ? parsePercent(field(req.body, "commission")) : null;
  if (action === "commission" && rate === null) return go(res, page, { e: "commission" });

  const result = await asPerson(person.authUserId, async (q) => {
    await q.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [`affiliate:${id}`]);
    const cur = (await q.query("select active, commission_rate::text as rate, is_house from affiliates where id = $1", [id])).rows[0];
    if (!cur || cur.is_house) return "invalid";
    const active = action === "commission" ? cur.active : action === "reactivate";
    await q.query("select app.update_affiliate($1::uuid, $2, $3::numeric)", [id, active, rate ?? cur.rate]);
    return action === "commission" ? "commission" : active ? "reactivated" : "deactivated";
  });
  return go(res, page, result === "invalid" ? { e: "invalid" } : { ok: result });
}
