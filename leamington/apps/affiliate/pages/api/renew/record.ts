/**
 * POST /api/renew/record: the affiliate has taken the $20.
 *
 * The form carries the client id and a request key generated when the status
 * page was rendered. app.affiliate_record_renewal records at most one renewal per
 * key, so a double tap (no JavaScript to disable the button) answers `duplicate`
 * and lands on the same receipt. A second renewal for the same client within 10
 * minutes needs the "Sí, cobrar otros 6 meses" box (confirm_repeat=1).
 *
 * The collector is the signed-in affiliate; the commission always goes to the
 * affiliate who registered the client. The database decides both.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { currentPerson, field, sameOrigin } from "@leamington/shared/src/server/portal.ts";
import { asPerson } from "@leamington/shared/src/server/db.ts";
import { isUuid } from "../../../lib/clients.ts";
import { recordRedirect, refusedAffiliate, ticked } from "../../../lib/renew.ts";

export default async function record(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end();
  }
  if (!sameOrigin(req)) return res.status(403).end();
  const person = await currentPerson(req, "affiliate");
  if (!person || !person.affiliateId) return res.redirect(303, "/login");

  const clientId = field(req.body, "client_id");
  const requestKey = field(req.body, "request_key");
  if (!isUuid(clientId) || !isUuid(requestKey)) return res.status(400).end();
  const confirmRepeat = ticked(field(req.body, "confirm_repeat"));

  try {
    const r = await asPerson(person.authUserId, async (q) =>
      (await q.query("select app.affiliate_record_renewal($1::uuid, $2::uuid, $3::uuid, $4::boolean) as r",
        [clientId, requestKey, person.authUserId, confirmRepeat])).rows[0]?.r);
    return res.redirect(303, recordRedirect(r, clientId));
  } catch (err) {
    if (refusedAffiliate(err)) return res.redirect(303, "/login");
    // No such client, or a request key already used for another client: a tampered form.
    if ((err as { code?: string }).code === "23514") {
      console.error("affiliate_record_renewal rejected", (err as Error).message);
      return res.status(400).end();
    }
    throw err;
  }
}
