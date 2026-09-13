/**
 * What the register form offers for a country, read from our database inside the
 * affiliate's own RLS transaction: departments or parishes from
 * app.admin_regions (0020), and teams whose league plays in that country (the
 * same rule app.register_client enforces).
 */
import type { Queryable } from "@leamington/shared/src/server/db.ts";
import type { Country } from "./clients.ts";

export type TeamOption = { id: string; name: string };
export type RegisterOptions = { regions: string[]; teams: TeamOption[] };

export async function loadRegisterOptions(q: Queryable, country: Country): Promise<RegisterOptions> {
  const regions = await q.query<{ admin_region: string }>(
    "select admin_region from app.admin_regions($1::country_code)", [country]);
  const teams = await q.query<TeamOption>(
    `select t.id::text as id, t.name
       from teams t join leagues l on l.id = t.league_id
      where l.country = $1::country_code
      order by t.name`, [country]);
  return { regions: regions.rows.map((r) => r.admin_region), teams: teams.rows };
}
