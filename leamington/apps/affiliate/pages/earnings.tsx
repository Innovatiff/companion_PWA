/**
 * My earnings: totals from affiliate_earnings, each commission (sales and
 * renewals, voided ones excluded), and payouts received. All CAD.
 *
 * Every read is inside asPerson; the affiliate id comes from the signed session,
 * and row-level security stands behind it.
 */
import type { GetServerSideProps } from "next";
import { requirePerson } from "@leamington/shared/src/server/portal.ts";
import { asPerson } from "@leamington/shared/src/server/db.ts";
import { formatDateTime, formatMoney } from "@leamington/shared/src/format.ts";
import { Page, setPageLang, viewerOf, type Viewer } from "../lib/layout.tsx";
import { monthLabel, strings } from "../lib/strings.ts";

export const config = { unstable_runtimeJS: false };

const PAYMENTS_SHOWN = 100;

type Totals = { sales: number; renewals: number; earned: string; earnedThisMonth: string; paidOut: string; owed: string };
type Payment = { id: string; paidAt: string; kind: string; amount: string; clientId: string; clientName: string };
type Payout = { id: string; paidAt: string; amount: string; method: string | null; note: string | null };
type Props = { viewer: Viewer; now: string; totals: Totals; payments: Payment[]; morePayments: boolean; payouts: Payout[] };

export const getServerSideProps: GetServerSideProps<Props> = async ({ req, res }) => {
  res.setHeader("Cache-Control", "private, no-store");
  const auth = await requirePerson(req, "affiliate");
  if (!auth.person) return { redirect: auth.redirect };
  const person = auth.person;
  setPageLang(req, person.language);

  const data = await asPerson(person.authUserId, async (q) => {
    const e = await q.query(
      `select sales, renewals, earned::text, earned_this_month::text, paid_out::text, owed::text
         from affiliate_earnings where affiliate_id = app.current_affiliate_id()`);
    const row = e.rows[0];
    // Every affiliate has an earnings row (zeros included). Its absence is a fault, not zero.
    if (!row) throw new Error("affiliate_earnings returned no row for the signed-in affiliate");

    const p = await q.query(
      `select s.id, s.paid_at, s.kind, s.affiliate_payout::text as amount, c.id as client_id, c.full_name
         from subscriptions s join clients c on c.id = s.client_id
        where s.affiliate_id = app.current_affiliate_id() and s.paid_at is not null and s.voided_at is null
        order by s.paid_at desc
        limit $1`, [PAYMENTS_SHOWN + 1]);

    const o = await q.query(
      `select id::text, paid_at, amount::text, method, note
         from affiliate_payouts
        where affiliate_id = app.current_affiliate_id() and voided_at is null
        order by paid_at desc`);

    return {
      totals: {
        sales: Number(row.sales), renewals: Number(row.renewals), earned: row.earned,
        earnedThisMonth: row.earned_this_month, paidOut: row.paid_out, owed: row.owed,
      },
      payments: p.rows.slice(0, PAYMENTS_SHOWN).map((r): Payment => ({
        id: r.id, paidAt: new Date(r.paid_at).toISOString(), kind: r.kind, amount: r.amount, clientId: r.client_id, clientName: r.full_name,
      })),
      morePayments: p.rows.length > PAYMENTS_SHOWN,
      payouts: o.rows.map((r): Payout => ({
        id: r.id, paidAt: new Date(r.paid_at).toISOString(), amount: r.amount, method: r.method, note: r.note,
      })),
    };
  });
  return { props: { viewer: viewerOf(person), now: new Date().toISOString(), ...data } };
};

export default function Earnings({ viewer, now, totals, payments, morePayments, payouts }: Props) {
  const t = strings(viewer.lang);
  const lang = viewer.lang;
  return (
    <Page title={t.earningsTitle} viewer={viewer} nav="earnings">
      <h1>{t.earningsTitle}</h1>
      <div className="stats">
        <div className="stat"><b>{formatMoney(totals.earned)}</b>{t.earned}<br /><small>{t.sinceStart}</small></div>
        <div className="stat"><b>{formatMoney(totals.earnedThisMonth)}</b>{t.earnedThisMonth}<br /><small>{monthLabel(new Date(now), lang)}</small></div>
        <div className="stat"><b>{formatMoney(totals.paidOut)}</b>{t.paidOut}<br /><small>{t.sinceStart}</small></div>
        <div className="stat"><b>{formatMoney(totals.owed)}</b>{t.owed}<br /><small>{t.asOfToday}</small></div>
      </div>
      <p>{t.salesCount(totals.sales, totals.renewals)}</p>
      <p className="muted">{t.allCad}</p>

      {payments.length === 0 ? (
        <><h2>{t.paymentsCaption}</h2><p>{t.noPayments}</p></>
      ) : (
        <div className="wrap">
          <table>
            <caption>{morePayments ? t.paymentsLatest(payments.length) : t.paymentsCaption}</caption>
            <thead><tr><th>{t.colClient}</th><th>{t.colDate}</th><th>{t.colKind}</th><th className="num">{t.colAmount}</th></tr></thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td><a href={`/clients/${p.clientId}/code`}>{p.clientName}</a></td>
                  <td>{formatDateTime(p.paidAt, lang)}</td>
                  <td>{p.kind === "renewal" ? t.kindRenewal : t.kindSale}</td>
                  <td className="num">{formatMoney(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {payouts.length === 0 ? (
        <><h2>{t.payoutsCaption}</h2><p>{t.noPayouts}</p></>
      ) : (
        <div className="wrap">
          <table>
            <caption>{t.payoutsCaption}</caption>
            <thead><tr><th>{t.colDate}</th><th className="num">{t.colAmount}</th><th>{t.colMethod}</th><th>{t.colNote}</th></tr></thead>
            <tbody>
              {payouts.map((p) => (
                <tr key={p.id}>
                  <td>{formatDateTime(p.paidAt, lang)}</td>
                  <td className="num">{formatMoney(p.amount)}</td>
                  <td>{p.method ?? ""}</td>
                  <td>{p.note ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Page>
  );
}
