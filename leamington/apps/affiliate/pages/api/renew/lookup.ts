/**
 * POST /api/renew/lookup: the code typed at the counter -> the client's renewal page.
 *
 * The typed code is normalised (dashes, spaces, case, O→Q and the like) and
 * checked against the alphabet first; only a possible code reaches
 * app.renewal_lookup, which counts misses and throttles the affiliate after 20
 * in 15 minutes. The code never goes in a redirect.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { currentPerson, field, sameOrigin } from "@leamington/shared/src/server/portal.ts";
import { asPerson } from "@leamington/shared/src/server/db.ts";
import { lookupCode, lookupRedirect, refusedAffiliate } from "../../../lib/renew.ts";

export default async function lookup(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end();
  }
  if (!sameOrigin(req)) return res.status(403).end();
  const person = await currentPerson(req, "affiliate");
  if (!person || !person.affiliateId) return res.redirect(303, "/login");

  const code = lookupCode(field(req.body, "code"));
  if (!code) return res.redirect(303, "/renew?e=invalid");

  try {
    const r = await asPerson(person.authUserId, async (q) =>
      (await q.query("select app.renewal_lookup($1) as r", [code])).rows[0]?.r);
    return res.redirect(303, lookupRedirect(r));
  } catch (err) {
    if (refusedAffiliate(err)) return res.redirect(303, "/login");
    throw err;
  }
}
