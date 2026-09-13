/**
 * My earnings. Registrations and renewals apart, both credited to the affiliate
 * who registered the client, so a client registered in March who renews in
 * September (with anyone) shows up here as money earned without lifting a finger.
 *
 *   affiliate_earnings        totals, sales_earned, renewals_earned, renewals_by_others
 *   renewal_log               each renewal of my clients, and who collected it
 *   subscriptions (sale)      each registration
 *   app.my_renewal_collections renewals I took the $20 for, mine or another affiliate's
 *   affiliate_payouts         what has been paid to me
 *
 * Every read is inside asPerson; the affiliate id comes from the signed session,
 * and row-level security stands behind it. Voided payments are excluded.
 */
import type { GetServerSideProps } from "next";
import { requirePerson } from "@leamington/shared/src/server/portal.ts";
import { asPerson } from "@leamington/shared/src/server/db.ts";
import { formatDate, formatDateTime, formatMoney } from "@leamington/shared/src/format.ts";
import { Page, setPageLang, viewerOf, type Viewer } from "../lib/layout.tsx";
import { monthLabel, strings } from "../lib/strings.ts";
import { collectedByLabel, commissionOf } from "../lib/renew.ts";

export const config = { unstable_runtimeJS: false };

const ROWS_SHOWN = 100;

type Totals = {
  sales: number; renewals: number; earned: string; earnedThisMonth: string; paidOut: string; owed: string;
  salesEarned: string; renewalsEarned: string; renewalsByOthers: number; renewalsByOthersEarned: string; perRenewal: string;
};
type Registration = { id: string; paidAt: string; amount: string; clientId: string; clientName: string };
type Renewal = {
  id: string; paidAt: string; clientId: string; clientName: string; periodStart: string; periodEnd: string; commission: string;
  collected_by_owner: boolean; collected_by_other: boolean;
};
type Collection = { key: string; paidAt: string; clientName: string; amount: string; earner: string; earnerIsYou: boolean };
type Payout = { id: string; paidAt: string; amount: string; method: string | null; note: string | null };
type List<T> = { rows: T[]; more: boolean };
type Props = {
  viewer: Viewer; now: string; totals: Totals;
  renewals: List<Renewal>; registrations: List<Registration>; collections: List<Collection>; payouts: Payout[];
};

const list = <R, T>(rows: R[], map: (r: R) => T): List<T> => ({ rows: rows.slice(0, ROWS_SHOWN).map(map), more: rows.length > ROWS_SHOWN });
const iso = (v: string | Date) => new Date(v).toISOString();

export const getServerSideProps: GetServerSideProps<Props> = async ({ req, res }) => {
  res.setHeader("Cache-Control", "private, no-store");
  const auth = await requirePerson(req, "affiliate");
  if (!auth.person) return { redirect: auth.redirect };
  const person = auth.person;
  setPageLang(req, person.language);

  const data = await asPerson(person.authUserId, async (q) => {
    const e = await q.query(
      `select sales, renewals, earned::text, earned_this_month::text, paid_out::text, owed::text,
              sales_earned::text, renewals_earned::text, renewals_by_others, renewals_by_others_earned::text,
              commission_rate::text, app.price_per_period()::text as price
         from affiliate_earnings where affiliate_id = app.current_affiliate_id()`);
    const row = e.rows[0];
    // Every affiliate has an earnings row (zeros included). Its absence is a fault, not zero.
    if (!row) throw new Error("affiliate_earnings returned no row for the signed-in affiliate");

    const renewals = await q.query(
      `select subscription_id::text as id, paid_at, client_id::text, full_name, period_start::text, period_end::text,
              commission::text, collected_by_owner, collected_by_other
         from renewal_log
        where earning_affiliate_id = app.current_affiliate_id() and voided_at is null
        order by paid_at desc
        limit $1`, [ROWS_SHOWN + 1]);

    const sales = await q.query(
      `select s.id::text, s.paid_at, s.affiliate_payout::text as amount, c.id::text as client_id, c.full_name
         from subscriptions s join clients c on c.id = s.client_id
        where s.affiliate_id = app.current_affiliate_id() and s.kind = 'sale' and s.paid_at is not null and s.voided_at is null
        order by s.paid_at desc
        limit $1`, [ROWS_SHOWN + 1]);

    const collections = await q.query(
      `select request_key::text, paid_at, full_name, amount::text, earning_affiliate, earner_is_you
         from app.my_renewal_collections($1)`, [ROWS_SHOWN + 1]);

    const o = await q.query(
      `select id::text, paid_at, amount::text, method, note
         from affiliate_payouts
        where affiliate_id = app.current_affiliate_id() and voided_at is null
        order by paid_at desc`);

    return {
      totals: {
        sales: Number(row.sales), renewals: Number(row.renewals), earned: row.earned,
        earnedThisMonth: row.earned_this_month, paidOut: row.paid_out, owed: row.owed,
        salesEarned: row.sales_earned, renewalsEarned: row.renewals_earned,
        renewalsByOthers: Number(row.renewals_by_others), renewalsByOthersEarned: row.renewals_by_others_earned,
        perRenewal: commissionOf(row.price, row.commission_rate),
      },
      renewals: list(renewals.rows, (r): Renewal => ({
        id: r.id, paidAt: iso(r.paid_at), clientId: r.client_id, clientName: r.full_name, periodStart: r.period_start,
        periodEnd: r.period_end, commission: r.commission, collected_by_owner: r.collected_by_owner, collected_by_other: r.collected_by_other,
      })),
      registrations: list(sales.rows, (r): Registration => ({
        id: r.id, paidAt: iso(r.paid_at), amount: r.amount, clientId: r.client_id, clientName: r.full_name,
      })),
      collections: list(collections.rows, (r): Collection => ({
        key: r.request_key, paidAt: iso(r.paid_at), clientName: r.full_name, amount: r.amount,
        earner: r.earning_affiliate, earnerIsYou: r.earner_is_you,
      })),
      payouts: o.rows.map((r): Payout => ({
        id: r.id, paidAt: iso(r.paid_at), amount: r.amount, method: r.method, note: r.note,
      })),
    };
  });
  return { props: { viewer: viewerOf(person), now: new Date().toISOString(), ...data } };
};

export default function Earnings({ viewer, now, totals, renewals, registrations, collections, payouts }: Props) {
  const t = strings(viewer.lang);
  const lang = viewer.lang;
  const day = (d: string) => formatDate(d, lang, true);
  return (
    <Page title={t.earningsTitle} viewer={viewer} nav="earnings">
      <h1>{t.earningsTitle}</h1>

      {totals.renewalsByOthers > 0 && (
        <p className="note big ok">{t.renewalsByOthers(totals.renewalsByOthers, formatMoney(totals.renewalsByOthersEarned))}</p>
      )}

      <div className="stats">
        <div className="stat"><b>{formatMoney(totals.salesEarned)}</b>{t.statRegistrations(totals.sales)}<br /><small>{t.sinceStart}</small></div>
        <div className="stat"><b>{formatMoney(totals.renewalsEarned)}</b>{t.statRenewals(totals.renewals)}<br /><small>{t.sinceStart}</small></div>
        <div className="stat"><b>{formatMoney(totals.earned)}</b>{t.earned}<br /><small>{t.sinceStart}</small></div>
        <div className="stat"><b>{formatMoney(totals.earnedThisMonth)}</b>{t.earnedThisMonth}<br /><small>{monthLabel(new Date(now), lang)}</small></div>
        <div className="stat"><b>{formatMoney(totals.paidOut)}</b>{t.paidOut}<br /><small>{t.sinceStart}</small></div>
        <div className="stat"><b>{formatMoney(totals.owed)}</b>{t.owed}<br /><small>{t.asOfToday}</small></div>
      </div>
      {Number(totals.perRenewal) > 0 && <p className="note">{t.renewalPitch(formatMoney(totals.perRenewal))}</p>}
      <p className="muted">{t.allCad}</p>

      {renewals.rows.length === 0 ? (
        <><h2>{t.renewalsCaption}</h2><p>{t.noRenewals}</p></>
      ) : (
        <div className="wrap">
          <table id="renewals">
            <caption>{renewals.more ? t.renewalsLatest(renewals.rows.length) : t.renewalsCaption}</caption>
            <thead>
              <tr><th>{t.colClient}</th><th>{t.colDate}</th><th>{t.colPeriod}</th><th className="num">{t.colAmount}</th><th>{t.colCollectedBy}</th></tr>
            </thead>
            <tbody>
              {renewals.rows.map((r) => (
                <tr key={r.id}>
                  <td><a href={`/clients/${r.clientId}/code`}>{r.clientName}</a></td>
                  <td>{formatDateTime(r.paidAt, lang)}</td>
                  <td>{t.periodRange(day(r.periodStart), day(r.periodEnd))}</td>
                  <td className="num">{formatMoney(r.commission)}</td>
                  <td>{collectedByLabel(r, t)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {registrations.rows.length === 0 ? (
        <><h2>{t.registrationsCaption}</h2><p>{t.noRegistrations}</p></>
      ) : (
        <div className="wrap">
          <table id="registrations">
            <caption>{registrations.more ? t.registrationsLatest(registrations.rows.length) : t.registrationsCaption}</caption>
            <thead><tr><th>{t.colClient}</th><th>{t.colDate}</th><th className="num">{t.colAmount}</th></tr></thead>
            <tbody>
              {registrations.rows.map((p) => (
                <tr key={p.id}>
                  <td><a href={`/clients/${p.clientId}/code`}>{p.clientName}</a></td>
                  <td>{formatDateTime(p.paidAt, lang)}</td>
                  <td className="num">{formatMoney(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {collections.rows.length > 0 && (
        <>
          <h2>{t.collectionsCaption}</h2>
          <p className="muted">{t.collectionsNote}</p>
          <div className="wrap">
            <table id="collections">
              <caption>{collections.more ? t.collectionsLatest(collections.rows.length) : t.collectionsCaption}</caption>
              <thead><tr><th>{t.colClient}</th><th>{t.colDate}</th><th className="num">{t.colCharged}</th><th>{t.colCommissionFor}</th></tr></thead>
              <tbody>
                {collections.rows.map((c) => (
                  <tr key={c.key}>
                    <td>{c.clientName}</td>
                    <td>{formatDateTime(c.paidAt, lang)}</td>
                    <td className="num">{formatMoney(c.amount)}</td>
                    <td>{c.earnerIsYou ? t.forYou : t.forOther(c.earner)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {payouts.length === 0 ? (
        <><h2>{t.payoutsCaption}</h2><p>{t.noPayouts}</p></>
      ) : (
        <div className="wrap">
          <table>
            <caption>{t.payoutsCaption}</caption>
            <thead><tr><th>{t.colDate}</th><th className="num">{t.colCharged}</th><th>{t.colMethod}</th><th>{t.colNote}</th></tr></thead>
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
