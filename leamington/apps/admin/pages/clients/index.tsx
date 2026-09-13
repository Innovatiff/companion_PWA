/** Clientes: every client across affiliates, filtered with a plain GET form. */
import type { GetServerSideProps } from "next";
import { asPerson } from "@leamington/shared/src/server/db.ts";
import { normalizeCode } from "@leamington/shared/src/code.ts";
import { formatDate } from "@leamington/shared/src/format.ts";
import { ownerPage, plain, type Viewer } from "../../lib/server.ts";
import { isUuid, isClientStatus, CLIENT_STATUSES, containsPattern, q1 } from "../../lib/rules.ts";
import { strings } from "../../lib/i18n.ts";
import { Page, Chip, StatusChip } from "../../lib/ui.tsx";

export const config = { unstable_runtimeJS: false };

const LIMIT = 200;

type Row = {
  client_id: string; full_name: string; code: string; country: string; admin_region: string | null;
  status: string; period_end: string | null; days_left: number | null; is_test: boolean; active: boolean;
  affiliate_id: string; affiliate_name: string; is_house: boolean; total: number;
};
type Aff = { id: string; name: string; is_house: boolean; is_test: boolean };
type Props = { viewer: Viewer; rows: Row[]; total: number; affiliates: Aff[]; filter: { aff: string; status: string; q: string } };

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const g = await ownerPage(ctx);
  if ("redirect" in g) return g;
  const aff = isUuid(q1(ctx.query.aff)) ? q1(ctx.query.aff) : "";
  const status = isClientStatus(q1(ctx.query.status)) ? q1(ctx.query.status) : "";
  const text = q1(ctx.query.q).trim().slice(0, 80);
  const code = normalizeCode(text);
  const { rows, affiliates } = await asPerson(g.person.authUserId, async (q) => {
    const list = await q.query(
      `select cs.client_id, cs.full_name, cs.code, cs.country::text as country, cs.admin_region, cs.status,
              cs.period_end::text as period_end, cs.days_left, cs.is_test, cs.active,
              a.id as affiliate_id, a.name as affiliate_name, a.is_house, (count(*) over ())::int as total
         from client_status cs
         join affiliates a on a.id = cs.affiliate_id
        where ($1::uuid is null or cs.affiliate_id = $1::uuid)
          and ($2::text is null or cs.status = $2::text)
          and ($3::text is null or cs.full_name ilike $3::text or ($4::text is not null and cs.code like $4::text))
        order by cs.created_at desc
        limit ${LIMIT}`,
      [aff || null, status || null, text ? containsPattern(text) : null, code.length >= 2 ? containsPattern(code) : null]);
    const affs = await q.query("select id, name, is_house, is_test from affiliates order by is_house desc, name");
    return { rows: list.rows as Row[], affiliates: affs.rows as Aff[] };
  });
  return { props: plain({ viewer: g.viewer, rows, total: rows[0]?.total ?? 0, affiliates, filter: { aff, status, q: text } }) };
};

export default function Clients({ viewer, rows, total, affiliates, filter }: Props) {
  const t = strings(viewer.lang);
  const c = t.clients;
  return (
    <Page viewer={viewer} section="clients" title={c.title}>
      <p><a className="button inline" href="/clients/new">{c.register}</a></p>
      <form method="get" action="/clients" className="filters">
        <div>
          <label htmlFor="aff">{c.affiliate}</label>
          <select id="aff" name="aff" defaultValue={filter.aff}>
            <option value="">{t.all}</option>
            {affiliates.map((a) => (
              <option key={a.id} value={a.id}>{a.name}{a.is_house ? ` (${t.chip.house})` : ""}{a.is_test ? ` (${t.chip.test})` : ""}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="status">{c.status}</label>
          <select id="status" name="status" defaultValue={filter.status}>
            <option value="">{t.all}</option>
            {CLIENT_STATUSES.map((s) => <option key={s} value={s}>{t.status[s]}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="q">{c.search}</label>
          <input id="q" name="q" defaultValue={filter.q} autoComplete="off" />
        </div>
        <div><button type="submit">{c.filter}</button></div>
      </form>

      {rows.length === 0 ? <p>{c.empty}</p> : (
        <div className="wrap">
          <table>
            <caption>{c.caption(rows.length, total)}</caption>
            <thead>
              <tr>
                <th scope="col">{c.name}</th><th scope="col">{c.code}</th><th scope="col">{c.affiliate}</th>
                <th scope="col">{c.countryCol}</th><th scope="col">{c.regionCol}</th><th scope="col">{c.status}</th>
                <th scope="col">{c.periodEnd}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.client_id}>
                  <th scope="row">
                    <a href={`/clients/${r.client_id}`}>{r.full_name}</a>{" "}
                    {r.is_test && <Chip kind="test">{t.chip.test}</Chip>}{" "}
                    {!r.active && <Chip kind="unk">{t.chip.inactive}</Chip>}
                  </th>
                  <td className="num">{r.code}</td>
                  <td>{r.affiliate_name}{r.is_house ? ` (${t.chip.house})` : ""}</td>
                  <td>{t.country[r.country] ?? r.country}</td>
                  <td>{r.admin_region ?? t.dash}</td>
                  <td><StatusChip status={r.status} daysLeft={r.days_left} lang={viewer.lang} /></td>
                  <td>{r.period_end ? formatDate(r.period_end, viewer.lang, true) : t.dash}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Page>
  );
}
