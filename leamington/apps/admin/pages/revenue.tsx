/**
 * Ingresos, from revenue_by_month (real clients only). Per month: gross,
 * commissions affiliates earned, net = gross − commissions, and cash actually
 * paid out to real affiliates. Plus what is still owed today.
 */
import type { GetServerSideProps } from "next";
import { asPerson } from "@leamington/shared/src/server/db.ts";
import { formatMoney } from "@leamington/shared/src/format.ts";
import { ownerPage, plain, type Viewer } from "../lib/server.ts";
import { mergeRevenue, monthLabel, type RevenueLine } from "../lib/rules.ts";
import { strings } from "../lib/i18n.ts";
import { Page, Stat } from "../lib/ui.tsx";

export const config = { unstable_runtimeJS: false };

type Props = { viewer: Viewer; lines: RevenueLine[]; totals: Omit<RevenueLine, "month">; owed: string };

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const g = await ownerPage(ctx);
  if ("redirect" in g) return g;
  const data = await asPerson(g.person.authUserId, async (q) => {
    const rev = await q.query(
      `select to_char(month, 'YYYY-MM') as month, sales::int, renewals::int, gross::text,
              affiliate_commissions::text, net::text
         from revenue_by_month`);
    const pay = await q.query(
      `select to_char(date_trunc('month', p.paid_at at time zone 'America/Toronto'), 'YYYY-MM') as month, sum(p.amount)::text as paid_out
         from affiliate_payouts p join affiliates a on a.id = p.affiliate_id
        where p.voided_at is null and not a.is_test
        group by 1`);
    const owed = await q.query("select coalesce(sum(greatest(owed, 0)), 0)::text as owed from affiliate_earnings where not is_test");
    return { ...mergeRevenue(rev.rows, pay.rows), owed: owed.rows[0].owed as string };
  });
  return { props: plain({ viewer: g.viewer, ...data }) };
};

const money = (cents: number) => formatMoney(cents / 100);

export default function Revenue({ viewer, lines, totals, owed }: Props) {
  const t = strings(viewer.lang);
  const r = t.revenue;
  return (
    <Page viewer={viewer} section="revenue" title={r.title}>
      <p className="note">{r.note}</p>
      <div className="stats">
        <Stat value={money(totals.gross)} label={r.grossAll} period={t.home.allTime} />
        <Stat value={money(totals.net)} label={r.netAll} period={t.home.allTime} />
        <Stat value={money(totals.paidOut)} label={r.paidAll} period={t.home.allTime} />
        <Stat value={formatMoney(owed)} label={r.owed} period={t.home.allTime} />
      </div>
      {lines.length === 0 ? <p>{r.empty}</p> : (
        <div className="wrap">
          <table>
            <caption>{r.caption}</caption>
            <thead>
              <tr>
                <th scope="col">{r.month}</th><th scope="col" className="num">{r.sales}</th><th scope="col" className="num">{r.renewals}</th>
                <th scope="col" className="num">{r.gross}</th><th scope="col" className="num">{r.commissions}</th>
                <th scope="col" className="num">{r.net}</th><th scope="col" className="num">{r.paidOut}</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.month}>
                  <th scope="row">{monthLabel(l.month, viewer.lang)}</th>
                  <td className="num">{l.sales}</td><td className="num">{l.renewals}</td>
                  <td className="num">{money(l.gross)}</td><td className="num">{money(l.commissions)}</td>
                  <td className="num"><b>{money(l.net)}</b></td><td className="num">{money(l.paidOut)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">{r.total}</th>
                <td className="num">{totals.sales}</td><td className="num">{totals.renewals}</td>
                <td className="num">{money(totals.gross)}</td><td className="num">{money(totals.commissions)}</td>
                <td className="num"><b>{money(totals.net)}</b></td><td className="num">{money(totals.paidOut)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Page>
  );
}
