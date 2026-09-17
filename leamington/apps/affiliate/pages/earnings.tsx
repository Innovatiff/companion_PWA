/**
 * My earnings. Registrations and renewals apart.
 *
 * The rule (0031): registering a client earns the registration commission;
 * whoever collects a renewal earns that renewal, even for a client another
 * business registered. So the renewals here are the ones this business
 * collected, split into its own clients and other businesses' clients. Renewals
 * of its own clients made elsewhere earn it nothing and are shown as a count
 * only: clients to win back next time.
 *
 *   affiliate_earnings          totals, sales_earned, renewals_earned, the splits
 *   app.my_renewal_collections  each renewal I collected, and who registered the client
 *   subscriptions (sale)        each registration
 *   affiliate_payouts           what has been paid to me
 *
 * Every read is inside asPerson; the affiliate id comes from the signed session,
 * and row-level security stands behind it. Voided payments are excluded.
 */
import type { GetServerSideProps } from "next";
import { requirePerson } from "@leamington/shared/src/server/portal.ts";
import { asPerson } from "@leamington/shared/src/server/db.ts";
import { formatDate, formatDateTime, formatMoney } from "@leamington/shared/src/format.ts";
import { Card, Hero, HeroAction, StatCard } from "@leamington/shared/src/ui/Portal.tsx";
import { Page, setPageLang, viewerOf, type Viewer } from "../lib/layout.tsx";
import { monthLabel, strings, weekLabel, weekRange } from "../lib/strings.ts";
import { commissionOf } from "../lib/renew.ts";

export const config = { unstable_runtimeJS: false };

const ROWS_SHOWN = 100;
const WEEKS_SHOWN = 8;

type Totals = {
  sales: number; renewals: number; earned: string; earnedThisMonth: string; paidOut: string; owed: string;
  salesEarned: string; renewalsEarned: string; renewalsOwnClients: number; renewalsOtherClients: number;
  renewalsOtherClientsEarned: string; ownClientsRenewedElsewhere: number; perRenewal: string;
};
type Registration = { id: string; paidAt: string; amount: string; clientId: string; clientName: string };
type Renewal = {
  key: string; paidAt: string; clientName: string; periodStart: string; periodEnd: string; commission: string;
  registeredBy: string; registeredByYou: boolean;
};
type Payout = { id: string; paidAt: string; amount: string; method: string | null; note: string | null; kind: string; weekStart: string | null };
type Week = {
  weekStart: string; weekEnd: string; sales: number; renewals: number; cash: string; keeps: string;
  owed: string; settled: string; outstanding: string; isCurrent: boolean;
};
type List<T> = { rows: T[]; more: boolean };
type Props = { viewer: Viewer; now: string; totals: Totals; renewals: List<Renewal>; registrations: List<Registration>; payouts: Payout[]; weeks: Week[] };

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
              sales_earned::text, renewals_earned::text, renewals_own_clients, renewals_other_clients,
              renewals_other_clients_earned::text, own_clients_renewed_elsewhere,
              commission_rate::text, app.price_per_period()::text as price
         from affiliate_earnings where affiliate_id = app.current_affiliate_id()`);
    const row = e.rows[0];
    // Every affiliate has an earnings row (zeros included). Its absence is a fault, not zero.
    if (!row) throw new Error("affiliate_earnings returned no row for the signed-in affiliate");

    const renewals = await q.query(
      `select request_key::text, paid_at, full_name, period_start::text, period_end::text, commission::text,
              registered_by, registered_by_you
         from app.my_renewal_collections($1)`, [ROWS_SHOWN + 1]);

    const sales = await q.query(
      `select s.id::text, s.paid_at, s.affiliate_payout::text as amount, c.id::text as client_id, c.full_name
         from subscriptions s join clients c on c.id = s.client_id
        where s.affiliate_id = app.current_affiliate_id() and s.kind = 'sale' and s.paid_at is not null and s.voided_at is null
        order by s.paid_at desc
        limit $1`, [ROWS_SHOWN + 1]);

    // What this business owes the owner, week by week (0054). Its own rows only: the view filters by the signed-in affiliate.
    const w = await q.query(
      `select week_start::text, week_end::text, sales::int, renewals::int, cash_collected::text as cash,
              affiliate_keeps::text as keeps, owed_to_owner::text as owed, settled::text, outstanding::text, is_current
         from affiliate_week_collections
        where week_start <= app.business_week()
          and week_start > app.business_week() - ($1::int * 7)
        order by week_start desc`, [WEEKS_SHOWN]);

    const o = await q.query(
      `select id::text, paid_at, amount::text, method, note, kind, week_start::text
         from affiliate_payouts
        where affiliate_id = app.current_affiliate_id() and voided_at is null
        order by paid_at desc`);

    return {
      totals: {
        sales: Number(row.sales), renewals: Number(row.renewals), earned: row.earned,
        earnedThisMonth: row.earned_this_month, paidOut: row.paid_out, owed: row.owed,
        salesEarned: row.sales_earned, renewalsEarned: row.renewals_earned,
        renewalsOwnClients: Number(row.renewals_own_clients), renewalsOtherClients: Number(row.renewals_other_clients),
        renewalsOtherClientsEarned: row.renewals_other_clients_earned,
        ownClientsRenewedElsewhere: Number(row.own_clients_renewed_elsewhere),
        perRenewal: commissionOf(row.price, row.commission_rate),
      },
      renewals: list(renewals.rows, (r): Renewal => ({
        key: r.request_key, paidAt: iso(r.paid_at), clientName: r.full_name, periodStart: r.period_start, periodEnd: r.period_end,
        commission: r.commission, registeredBy: r.registered_by, registeredByYou: r.registered_by_you,
      })),
      registrations: list(sales.rows, (r): Registration => ({
        id: r.id, paidAt: iso(r.paid_at), amount: r.amount, clientId: r.client_id, clientName: r.full_name,
      })),
      payouts: o.rows.map((r): Payout => ({
        id: r.id, paidAt: iso(r.paid_at), amount: r.amount, method: r.method, note: r.note,
        kind: r.kind, weekStart: r.week_start,
      })),
      weeks: w.rows.map((r): Week => ({
        weekStart: r.week_start, weekEnd: r.week_end, sales: r.sales, renewals: r.renewals, cash: r.cash,
        keeps: r.keeps, owed: r.owed, settled: r.settled, outstanding: r.outstanding, isCurrent: r.is_current,
      })),
    };
  });
  return { props: { viewer: viewerOf(person), now: new Date().toISOString(), ...data } };
};

export default function Earnings({ viewer, now, totals, renewals, registrations, payouts, weeks }: Props) {
  const t = strings(viewer.lang);
  const lang = viewer.lang;
  const day = (d: string) => formatDate(d, lang, true);
  const since = (what: string) => `${what} · ${t.sinceStart}`;
  const renewalsTitle = renewals.more ? t.renewalsLatest(renewals.rows.length) : t.renewalsCaption;
  const registrationsTitle = registrations.more ? t.registrationsLatest(registrations.rows.length) : t.registrationsCaption;
  return (
    <Page title={t.earningsTitle} viewer={viewer} nav="earnings">
      <Hero
        title={t.earningsTitle}
        subtitle={t.allCad}
        action={<HeroAction href="/renew" icon="refresh">{t.navRenew}</HeroAction>}
        stats={<>
          <StatCard icon="userPlus" label={t.statRegistrationsLabel} value={formatMoney(totals.salesEarned)} note={since(t.statRegistrations(totals.sales))} />
          <StatCard icon="refresh" tone="good" label={t.statRenewalsLabel} value={formatMoney(totals.renewalsEarned)} note={since(t.statRenewals(totals.renewals))} />
          <StatCard icon="dollar" label={t.earnedThisMonth} value={formatMoney(totals.earnedThisMonth)} note={monthLabel(new Date(now), lang)} />
          <StatCard icon="wallet" tone="warn" label={t.owed} value={formatMoney(totals.owed)} note={t.asOfToday} />
        </>}
      />
      {Number(totals.perRenewal) > 0 && <p className="note">{t.renewAnywhere(formatMoney(totals.perRenewal))}</p>}

      {weeks.length > 0 && (
        <Card title={t.weeksTitle}>
          <p className="muted">{t.weeksNote}</p>
          <div className="wrap">
            <table>
              <caption className="sr">{t.weeksTitle}</caption>
              <thead>
                <tr>
                  <th>{t.weekCol}</th><th className="num">{t.weekSales}</th><th className="num">{t.weekRenewals}</th>
                  <th className="num">{t.weekCash}</th><th className="num">{t.weekKeeps}</th>
                  <th className="num">{t.weekOwed}</th><th className="num">{t.weekSettled}</th><th className="num">{t.weekLeft}</th>
                </tr>
              </thead>
              <tbody>
                {weeks.map((w) => (
                  <tr key={w.weekStart}>
                    <td>{weekRange(w.weekStart, w.weekEnd, lang)}{w.isCurrent && <> <span className="chip">{t.weekCurrent}</span></>}</td>
                    <td className="num">{w.sales}</td>
                    <td className="num">{w.renewals}</td>
                    <td className="num">{formatMoney(w.cash)}</td>
                    <td className="num">{formatMoney(w.keeps)}</td>
                    <td className="num"><b>{formatMoney(w.owed)}</b></td>
                    <td className="num">{formatMoney(w.settled)}</td>
                    <td className="num">{Number(w.outstanding) > 0 ? formatMoney(w.outstanding) : <span className="chip good">{t.weekDone}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div className="grid">
        <div>
          <Card title={renewalsTitle}>
            {renewals.rows.length === 0 ? (
              <p>{t.noRenewals}</p>
            ) : (
              <div className="wrap">
                <table id="renewals">
                  <caption className="sr">{renewalsTitle}</caption>
                  <thead>
                    <tr><th>{t.colClient}</th><th>{t.colDate}</th><th>{t.colPeriod}</th><th className="num">{t.colAmount}</th><th>{t.colRegisteredBy}</th></tr>
                  </thead>
                  <tbody>
                    {renewals.rows.map((r) => (
                      <tr key={r.key}>
                        <td>{r.clientName}</td>
                        <td>{formatDateTime(r.paidAt, lang)}</td>
                        <td>{t.periodRange(day(r.periodStart), day(r.periodEnd))}</td>
                        <td className="num">{formatMoney(r.commission)}</td>
                        <td>{r.registeredByYou ? t.youShort : r.registeredBy}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title={registrationsTitle}>
            {registrations.rows.length === 0 ? (
              <p>{t.noRegistrations}</p>
            ) : (
              <div className="wrap">
                <table id="registrations">
                  <caption className="sr">{registrationsTitle}</caption>
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
          </Card>
        </div>

        <div>
          <Card title={t.totalsTitle}>
            <ul className="list">
              <li><div><div className="t">{t.earned}</div><div className="meta">{t.sinceStart}</div></div><b className="big">{formatMoney(totals.earned)}</b></li>
              <li><div><div className="t">{t.paidOut}</div><div className="meta">{t.sinceStart}</div></div><b className="big">{formatMoney(totals.paidOut)}</b></li>
              <li><div><div className="t">{t.statRenewalsLabel}</div><div className="meta">{t.statRenewalsSplit(totals.renewalsOwnClients, totals.renewalsOtherClients, formatMoney(totals.renewalsOtherClientsEarned))}</div></div></li>
            </ul>
            {totals.ownClientsRenewedElsewhere > 0 && <p>{t.renewedElsewhere(totals.ownClientsRenewedElsewhere)}</p>}
          </Card>

          <Card title={t.payoutsCaption}>
            {payouts.length === 0 ? (
              <p>{t.noPayouts}</p>
            ) : (
              <ul className="list">
                {payouts.map((p) => (
                  <li key={p.id}>
                    <div>
                      <div className="t">{formatDateTime(p.paidAt, lang)}</div>
                      {p.kind === "kept" ? (
                        <div className="meta">
                          <span>{p.weekStart ? t.keptWeek(weekLabel(p.weekStart, lang)) : t.keptCommission}</span>
                        </div>
                      ) : (p.method || p.note) && (
                        <div className="meta">
                          {p.method && <span>{t.colMethod}: {p.method}</span>}
                          {p.note && <span>{t.colNote}: {p.note}</span>}
                        </div>
                      )}
                    </div>
                    <b className="big">{formatMoney(p.amount)}</b>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </Page>
  );
}
