/**
 * Registrar cliente, direct from the owner: the same 4 fields as the affiliate
 * portal (full name, country, department/parish, team). The country is a GET
 * step first, because the regions and teams depend on it. Registered under the
 * house affiliate, which earns no commission.
 *
 * The form carries a code generated here. If the same form is submitted twice
 * (a double tap on 2 bars), the second attempt finds that code already
 * registered for the same name and goes to it instead of charging twice.
 */
import type { GetServerSideProps } from "next";
import { asPerson } from "@leamington/shared/src/server/db.ts";
import { generateCode } from "@leamington/shared/src/code.ts";
import { ownerPage, plain, type Viewer } from "../../lib/server.ts";
import { COUNTRIES, isCountry, q1 } from "../../lib/rules.ts";
import { strings } from "../../lib/i18n.ts";
import { Page } from "../../lib/ui.tsx";

export const config = { unstable_runtimeJS: false };

type Team = { id: string; name: string };
type Props = {
  viewer: Viewer; country: string | null; regions: string[]; teams: Team[]; code: string;
  values: { name: string; region: string; team: string }; error: string | null;
};

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const g = await ownerPage(ctx);
  if ("redirect" in g) return g;
  const country = isCountry(q1(ctx.query.country)) ? q1(ctx.query.country) : null;
  let regions: string[] = [];
  let teams: Team[] = [];
  if (country) {
    ({ regions, teams } = await asPerson(g.person.authUserId, async (q) => {
      const r = await q.query("select admin_region from app.admin_regions($1::country_code)", [country]);
      const tm = await q.query(
        `select t.id::text as id, t.name from teams t join leagues l on l.id = t.league_id
          where l.country = $1::country_code and l.active order by t.name`, [country]);
      return { regions: r.rows.map((x) => x.admin_region as string), teams: tm.rows as Team[] };
    }));
  }
  return {
    props: plain({
      viewer: g.viewer, country, regions, teams, code: generateCode(),
      values: { name: q1(ctx.query.name).slice(0, 120), region: q1(ctx.query.region), team: q1(ctx.query.team) },
      error: q1(ctx.query.e) || null,
    }),
  };
};

export default function NewClient({ viewer, country, regions, teams, code, values, error }: Props) {
  const t = strings(viewer.lang);
  const n = t.newClient;
  const err = (key: string) => (error === key ? <p className="err hint" id={`${key}-err`}>{n.errors[key]}</p> : null);
  return (
    <Page viewer={viewer} section="clients" title={n.title}>
      <div className="narrow">
        <p>{n.lead}</p>
        {error && !["name", "region", "team"].includes(error) && <p className="err" role="alert">{n.errors[error] ?? n.errors.invalid}</p>}
        {!country ? (
          <form method="get" action="/clients/new">
            <label htmlFor="country">{n.country}</label>
            <select id="country" name="country" required defaultValue="">
              <option value="" disabled>{n.choose}</option>
              {COUNTRIES.map((c) => <option key={c} value={c}>{t.country[c]}</option>)}
            </select>
            <button type="submit">{n.next}</button>
          </form>
        ) : (
          <form method="post" action="/api/clients/register">
            <p>{n.country}: <b>{t.country[country]}</b> · <a href="/clients/new">{n.changeCountry}</a></p>
            <input type="hidden" name="country" value={country} />
            <input type="hidden" name="code" value={code} />
            <label htmlFor="name">{n.fullName}</label>
            <input id="name" name="name" required maxLength={120} autoComplete="off" defaultValue={values.name}
                   aria-describedby={error === "name" ? "name-err" : undefined} />
            {err("name")}
            <label htmlFor="region">{t.region[country]}</label>
            <select id="region" name="region" required defaultValue={values.region}
                    aria-describedby={error === "region" ? "region-err" : undefined}>
              <option value="">{n.choose}</option>
              {regions.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            {err("region")}
            {teams.length > 0 && (
              <>
                <label htmlFor="team">{n.team}</label>
                <select id="team" name="team" defaultValue={values.team}>
                  <option value="">{n.noTeam}</option>
                  {teams.map((tm) => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
                </select>
                {err("team")}
              </>
            )}
            <button type="submit">{n.submit}</button>
          </form>
        )}
      </div>
    </Page>
  );
}
