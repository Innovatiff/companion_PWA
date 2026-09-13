/**
 * Renovaciones: the renewal pipeline. Due (ending within 30 days, soonest
 * first) and lapsed (most recently lapsed first). "Marcar pagado" records the
 * renewal; the owner comes back here with the new period end named.
 */
import type { GetServerSideProps } from "next";
import { asPerson } from "@leamington/shared/src/server/db.ts";
import { formatDate } from "@leamington/shared/src/format.ts";
import { ownerPage, plain, type Viewer } from "../lib/server.ts";
import { isUuid, q1 } from "../lib/rules.ts";
import { strings } from "../lib/i18n.ts";
import { Page, Chip, Note } from "../lib/ui.tsx";

export const config = { unstable_runtimeJS: false };

const LIMIT = 300;

type Row = {
  client_id: string; full_name: string; code: string; period_end: string; days_left: number; is_test: boolean;
  active: boolean; affiliate_id: string; affiliate_name: string; is_house: boolean;
};
type Props = { viewer: Viewer; due: Row[]; lapsed: Row[]; confirmation: { name: string; end: string } | null; error: string | null };

const SELECT = `select cs.client_id, cs.full_name, cs.code, cs.period_end::text as period_end, cs.days_left, cs.is_test, cs.active,
                       a.id as affiliate_id, a.name as affiliate_name, a.is_house
                  from client_status cs join affiliates a on a.id = cs.affiliate_id`;

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const g = await ownerPage(ctx);
  if ("redirect" in g) return g;
  const clientId = q1(ctx.query.c);
  const end = q1(ctx.query.end);
  const data = await asPerson(g.person.authUserId, async (q) => {
    const due = await q.query(`${SELECT} where cs.status = 'due' order by cs.period_end asc, cs.full_name limit ${LIMIT + 1}`);
    const lapsed = await q.query(`${SELECT} where cs.status = 'lapsed' order by cs.period_end desc, cs.full_name limit ${LIMIT + 1}`);
    let confirmation: Props["confirmation"] = null;
    if (q1(ctx.query.ok) === "renewed" && isUuid(clientId) && /^\d{4}-\d{2}-\d{2}$/.test(end)) {
      const c = await q.query("select full_name from clients where id = $1", [clientId]);
      if (c.rows[0]) confirmation = { name: c.rows[0].full_name, end };
    }
    return { due: due.rows as Row[], lapsed: lapsed.rows as Row[], confirmation };
  });
  return { props: plain({ viewer: g.viewer, ...data, error: q1(ctx.query.e) || null }) };
};

function Pipeline({ viewer, rows, caption, empty, id }: { viewer: Viewer; rows: Row[]; caption: string; empty: string; id: string }) {
  const t = strings(viewer.lang);
  const r = t.renewals;
  const shown = rows.slice(0, LIMIT);
  return (
    <section id={id}>
      {rows.length === 0 ? <><h2>{caption}</h2><p>{empty}</p></> : (
        <div className="wrap">
          <table>
            <caption>{caption}{rows.length > LIMIT ? ` — ${r.truncated(LIMIT)}` : ""}</caption>
            <thead>
              <tr>
                <th scope="col">{r.client}</th><th scope="col">{r.affiliate}</th><th scope="col">{r.when}</th>
                <th scope="col">{r.periodEnd}</th><th scope="col"><span className="noprint">{r.markPaid}</span></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <tr key={row.client_id}>
                  <th scope="row">
                    <a href={`/clients/${row.client_id}`}>{row.full_name}</a>{" "}
                    {row.is_test && <Chip kind="test">{t.chip.test}</Chip>}{" "}
                    {!row.active && <Chip kind="unk">{t.chip.inactive}</Chip>}
                  </th>
                  <td>{row.affiliate_name}{row.is_house ? ` (${t.chip.house})` : ""}</td>
                  <td>
                    {row.days_left >= 0
                      ? <Chip kind="warn">{t.dueIn(row.days_left)}</Chip>
                      : <Chip kind="bad">{t.lapsedAgo(-row.days_left)}</Chip>}
                  </td>
                  <td>{formatDate(row.period_end, viewer.lang, true)}</td>
                  <td>
                    <form method="post" action="/api/clients/renew">
                      <input type="hidden" name="client_id" value={row.client_id} />
                      <input type="hidden" name="expect_end" value={row.period_end} />
                      <input type="hidden" name="back" value="/renewals" />
                      <button type="submit">{r.markPaid}</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function Renewals({ viewer, due, lapsed, confirmation, error }: Props) {
  const t = strings(viewer.lang);
  const r = t.renewals;
  return (
    <Page viewer={viewer} section="renewals" title={r.title}>
      {confirmation && <Note>{r.renewed(confirmation.name, formatDate(confirmation.end, viewer.lang, true))}</Note>}
      {error && <Note kind="bad">{t.client.errors[error] ?? t.client.errors.invalid}</Note>}
      <Pipeline viewer={viewer} rows={due} caption={r.dueCaption} empty={r.noneDue} id="due" />
      <Pipeline viewer={viewer} rows={lapsed} caption={r.lapsedCaption} empty={r.noneLapsed} id="lapsed" />
    </Page>
  );
}
