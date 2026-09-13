/**
 * Ventas: sales per affiliate FIRST, so it is obvious who is selling and who
 * isn't; then the money summary. Test data is marked, and excluded from money.
 */
import type { GetServerSideProps } from "next";
import { asPerson } from "@leamington/shared/src/server/db.ts";
import { formatDateTime, formatMoney } from "@leamington/shared/src/format.ts";
import { ownerPage, plain, type Viewer } from "../lib/server.ts";
import { sortSales, isQuiet, monthLabel, type SalesRow } from "../lib/rules.ts";
import { strings } from "../lib/i18n.ts";
import { Page, Chip, Stat } from "../lib/ui.tsx";

export const config = { unstable_runtimeJS: false };

type Row = SalesRow & {
  renewals_30d: number; renewals_all: number;
  active_clients: number; due_clients: number; lapsed_clients: number;
};
type Stats = { month: string; gross: string; commissions: string; net: string; owed: string; due: number; lapsed: number };
type Props = { viewer: Viewer; rows: Row[]; stats: Stats };

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const g = await ownerPage(ctx);
  if ("redirect" in g) return g;
  const { rows, stats } = await asPerson(g.person.authUserId, async (q) => {
    const sales = await q.query(
      `select affiliate_id, name, active, is_test, is_house,
              sales_7d::int, sales_30d::int, sales_all::int, renewals_30d::int, renewals_all::int, last_sale_at,
              active_clients::int, due_clients::int, lapsed_clients::int
         from sales_per_affiliate`);
    const s = await q.query(
      `with m as (select * from revenue_by_month where to_char(month, 'YYYY-MM') = to_char(app.business_today(), 'YYYY-MM'))
       select to_char(app.business_today(), 'YYYY-MM') as month,
              coalesce((select gross from m), 0)::text as gross,
              coalesce((select affiliate_commissions from m), 0)::text as commissions,
              coalesce((select net from m), 0)::text as net,
              (select coalesce(sum(greatest(owed, 0)), 0) from affiliate_earnings where not is_test)::text as owed,
              (select count(*) from client_status where status = 'due' and not is_test)::int as due,
              (select count(*) from client_status where status = 'lapsed' and not is_test)::int as lapsed`);
    return { rows: sales.rows as Row[], stats: s.rows[0] as Stats };
  });
  return { props: { viewer: g.viewer, rows: sortSales(plain(rows)), stats: plain(stats) } };
};

export default function Home({ viewer, rows, stats }: Props) {
  const t = strings(viewer.lang);
  const h = t.home;
  const month = h.thisMonth(monthLabel(stats.month, viewer.lang));
  return (
    <Page viewer={viewer} section="sales" title={h.title}>
      {rows.length === 0 ? <p>{h.empty}</p> : (
        <div className="wrap">
          <table>
            <caption>{h.caption}</caption>
            <thead>
              <tr>
                <th scope="col">{h.affiliate}</th>
                <th scope="col" className="num">{h.d7}</th>
                <th scope="col" className="num">{h.d30}</th>
                <th scope="col" className="num">{h.all}</th>
                <th scope="col" className="num">{h.renewals}</th>
                <th scope="col">{h.lastSale}</th>
                <th scope="col" className="num">{h.active}</th>
                <th scope="col" className="num">{h.due}</th>
                <th scope="col" className="num">{h.lapsed}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const quiet = isQuiet(r);
                return (
                  <tr key={r.affiliate_id} className={quiet ? "quiet" : undefined}>
                    <th scope="row">
                      <a href={`/affiliates/${r.affiliate_id}`}>{r.name}</a>{" "}
                      {quiet && <Chip kind="bad">{t.chip.quiet}</Chip>}{" "}
                      {r.is_house && r.name !== t.chip.house && <Chip>{t.chip.house}</Chip>}{" "}
                      {!r.active && <Chip kind="unk">{t.chip.inactive}</Chip>}{" "}
                      {r.is_test && <Chip kind="test">{t.chip.test}</Chip>}
                    </th>
                    <td className="num">{r.sales_7d}</td>
                    <td className="num"><b>{r.sales_30d}</b></td>
                    <td className="num">{r.sales_all}</td>
                    <td className="num">{r.renewals_30d} / {r.renewals_all}</td>
                    <td>{r.last_sale_at ? formatDateTime(r.last_sale_at, viewer.lang) : h.never}</td>
                    <td className="num">{r.active_clients - r.due_clients}</td>
                    <td className="num">{r.due_clients}</td>
                    <td className="num">{r.lapsed_clients}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <h2>{h.stats}</h2>
      <div className="stats">
        <Stat value={formatMoney(stats.gross)} label={h.gross} period={month} />
        <Stat value={formatMoney(stats.commissions)} label={h.commissions} period={month} />
        <Stat value={formatMoney(stats.net)} label={h.net} period={month} />
        <Stat value={formatMoney(stats.owed)} label={h.owed} period={h.allTime} />
        <Stat value={<a href="/renewals">{stats.due}</a>} label={h.renewalsDue} period={h.now} />
        <Stat value={<a href="/renewals#lapsed">{stats.lapsed}</a>} label={h.lapsedClients} period={h.now} />
      </div>
      <p><small>{h.testNote}</small></p>
    </Page>
  );
}
