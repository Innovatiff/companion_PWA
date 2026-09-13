/**
 * POST /api/register: the affiliate has taken $20 and registers the client.
 *
 * 1. Check the four fields against what our database lists for the country.
 *    A problem goes back to the form with the typed values and the reason.
 * 2. Generate a code and call app.register_client inside asPerson, so the
 *    database authorises the affiliate and records the paid sale. A code that
 *    collides (unique_violation) is retried with a new one, up to 5 times, each
 *    in a fresh transaction because the error aborts the one it happened in.
 * 3. Redirect to the code page.
 *
 * Double submit: with no JavaScript the button cannot disable itself, and a
 * second tap at a busy counter would record a second $20 sale. Each attempt
 * takes a per-affiliate advisory lock and, if this affiliate registered the same
 * name, country, region and team in the last 2 minutes, returns that client
 * instead of creating another.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { currentPerson, sameOrigin } from "@leamington/shared/src/server/portal.ts";
import { asPerson } from "@leamington/shared/src/server/db.ts";
import { generateCode } from "@leamington/shared/src/code.ts";
import { isCountry } from "../../lib/clients.ts";
import { loadRegisterOptions } from "../../lib/options.ts";
import {
  CodeExhaustedError, readRegisterInput, registerFormUrl, teamIdFor, validateRegister, withFreshCode,
} from "../../lib/register.ts";

const REJECTED = new Set(["23514", "22P02", "23502", "22001"]); // check, bad input, not null, too long

export default async function register(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end();
  }
  if (!sameOrigin(req)) return res.status(403).end();
  const person = await currentPerson(req, "affiliate");
  if (!person || !person.affiliateId) return res.redirect(303, "/login");
  const affiliateId = person.affiliateId;

  const input = readRegisterInput(req.body);
  const country = input.country;
  if (!isCountry(country)) return res.redirect(303, registerFormUrl(input, "country"));

  const options = await asPerson(person.authUserId, (q) => loadRegisterOptions(q, country));
  const error = validateRegister(input, options.regions, options.teams.map((tm) => tm.id));
  if (error) return res.redirect(303, registerFormUrl(input, error));
  const teamId = teamIdFor(input);

  try {
    const clientId = await withFreshCode((code) => asPerson(person.authUserId, async (q) => {
        await q.query("select pg_advisory_xact_lock(hashtext('register_client'), hashtext($1))", [affiliateId]);
        const recent = await q.query<{ id: string }>(
          `select id from clients
            where affiliate_id = $1 and lower(full_name) = lower($2) and country = $3::country_code
              and admin_region = $4 and team_id is not distinct from $5::bigint
              and created_at > now() - interval '2 minutes'
            order by created_at desc limit 1`,
          [affiliateId, input.name, country, input.region, teamId]);
        if (recent.rows[0]) return recent.rows[0].id;

        const { rows } = await q.query<{ r: { client_id: string } }>(
          "select app.register_client($1::uuid, $2, $3, $4::country_code, $5, $6::bigint, $7::uuid) as r",
          [affiliateId, code, input.name, country, input.region, teamId, person.authUserId]);
        const id = rows[0]?.r?.client_id;
        if (!id) throw new Error("app.register_client returned no client id");
        return id;
    }), generateCode, 5);
    return res.redirect(303, `/clients/${clientId}/code`);
  } catch (err) {
    if (err instanceof CodeExhaustedError) return res.redirect(303, registerFormUrl(input, "code"));
    const code = (err as { code?: string }).code;
    if (code && REJECTED.has(code)) {
      console.error("register_client rejected", code, (err as Error).message);
      return res.redirect(303, registerFormUrl(input, "rejected"));
    }
    throw err;
  }
}
