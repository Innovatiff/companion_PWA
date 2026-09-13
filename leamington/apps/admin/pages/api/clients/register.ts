/**
 * POST /api/clients/register: the owner registers a client directly, under the
 * house affiliate (no commission). A $20 paid sale.
 *
 * Codes: the form's pre-generated code first, then fresh ones from
 * generateCode(), retrying on unique_violation up to 5 attempts, each in a
 * fresh transaction. If the form's own code is already taken by a client of
 * the same name registered by the house in the last hour, this is the same
 * form submitted twice: go to that client instead of charging again.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { asPerson } from "@leamington/shared/src/server/db.ts";
import { field } from "@leamington/shared/src/server/portal.ts";
import { generateCode, isValidCode, normalizeCode } from "@leamington/shared/src/code.ts";
import { ownerApi, go, pgCode } from "../../../lib/server.ts";
import { isCountry } from "../../../lib/rules.ts";

const ATTEMPTS = 5;

export default async function register(req: NextApiRequest, res: NextApiResponse) {
  const person = await ownerApi(req, res);
  if (!person) return;

  const country = field(req.body, "country");
  const name = field(req.body, "name").trim().replace(/\s+/g, " ");
  const region = field(req.body, "region");
  const team = field(req.body, "team");
  const formCode = field(req.body, "code");
  if (!isCountry(country)) return go(res, "/clients/new");
  const back = (e: string) => go(res, "/clients/new", { country, e, name, region, team });

  if (!name || name.length > 120) return back("name");
  if (!region) return back("region");
  if (team && !/^\d{1,18}$/.test(team)) return back("team");

  let code = isValidCode(formCode) && normalizeCode(formCode) === formCode ? formCode : generateCode();
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    try {
      const r = await asPerson(person.authUserId, async (q) => {
        const house = (await q.query("select app.house_affiliate() as id")).rows[0].id as string;
        const { rows } = await q.query(
          "select app.register_client($1::uuid, $2, $3, $4::country_code, $5, $6::bigint, $7::uuid) as r",
          [house, code, name, country, region, team || null, person.authUserId]);
        return rows[0].r as { client_id: string };
      });
      return go(res, `/clients/${r.client_id}/code`, { ok: "registered" });
    } catch (err) {
      const sqlstate = pgCode(err);
      if (sqlstate === "23505") {
        if (code === formCode) {
          const dup = await asPerson(person.authUserId, async (q) => (await q.query(
            `select c.id from clients c join affiliates a on a.id = c.affiliate_id
              where c.code = $1 and a.is_house and c.full_name = $2 and c.created_at > now() - interval '1 hour'`,
            [code, name])).rows[0] as { id: string } | undefined);
          if (dup) return go(res, `/clients/${dup.id}/code`, { ok: "registered" });
        }
        code = generateCode();
        continue;
      }
      if (sqlstate === "23514") {
        const msg = String((err as Error).message);
        return back(msg.includes("department or parish") ? "region" : msg.includes("team") ? "team" : msg.includes("name") ? "name" : "invalid");
      }
      throw err;
    }
  }
  return back("codes");
}
