/**
 * POST /api/clients/renew: the owner marks a renewal paid (app.record_renewal).
 * There is no payment processing; this records $20 received.
 *
 * The form carries the period end the owner was looking at. Under a per-client
 * lock, if the client's current period end is no longer that, a renewal was
 * already recorded (a double tap, or a second tab), and nothing is recorded.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { asPerson } from "@leamington/shared/src/server/db.ts";
import { field } from "@leamington/shared/src/server/portal.ts";
import { ownerApi, go } from "../../../lib/server.ts";
import { isUuid, safeBack } from "../../../lib/rules.ts";

export default async function renew(req: NextApiRequest, res: NextApiResponse) {
  const person = await ownerApi(req, res);
  if (!person) return;

  const clientId = field(req.body, "client_id");
  const expect = field(req.body, "expect_end");
  const back = safeBack(field(req.body, "back"));
  if (!isUuid(clientId)) return go(res, back, { e: "invalid" });

  const r = await asPerson(person.authUserId, async (q) => {
    await q.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [`renew:${clientId}`]);
    const cur = await q.query("select period_end::text as period_end from client_status where client_id = $1", [clientId]);
    if (!cur.rows[0]) return { e: "invalid" };
    if ((cur.rows[0].period_end ?? "none") !== expect) return { e: "stale" };
    const { rows } = await q.query("select app.record_renewal($1::uuid, $2::uuid) as r", [clientId, person.authUserId]);
    return { end: String(rows[0].r.period_end) };
  });

  if ("e" in r) return go(res, back, { e: r.e });
  if (back === "/renewals") return go(res, back, { ok: "renewed", c: clientId, end: r.end });
  return go(res, back, { ok: "renewed", end: r.end });
}
