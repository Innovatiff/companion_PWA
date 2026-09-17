/**
 * Cobros: what each business owes for each week, and recording what it hands
 * over. The week is Sunday to Saturday on Leamington time (0054).
 *
 * A week's row is the cash that business physically took (registrations and the
 * renewals it collected), less the commission it keeps. A renewal the owner
 * collected is the owner's cash and is in nobody's week.
 */
import type { GetServerSideProps } from "next";
import { asPerson } from "@leamington/shared/src/server/db.ts";
import { formatDate, formatMoney } from "@leamington/shared/src/format.ts";
import { ownerPage, plain, type Viewer } from "../lib/server.ts";
import { toCents } from "../lib/rules.ts";
import { strings } from "../lib/i18n.ts";
import { Page, Card, StatCard, Desc, cap } from "../lib/ui.tsx";

export const config = { unstable_runtimeJS: false };

type Week = {
  affiliateId: string; name: string; weekStart: string; weekEnd: string;
  sales: number; renewals: number; cash: string; keeps: string; owed: string; settled: string; outstanding: string;
  payments: number; isCurrent: boolean;
};
type Props = { viewer: Viewer; weeks: Week[]; error: string | null; ok: boolean };

const WEEKS_SHOWN = 8;

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const g = await ownerPage(ctx);
  if ("redirect" in g) return g;
  const weeks = await asPerson(g.person.authUserId, async (q) => {
    const { rows } = await q.query(
      `select affiliate_id::text, name, week_start::text, week_end::text, sales::int, renewals::int,
              cash_collected::text as cash, affiliate_keeps::text as keeps, owed_to_owner::text as owed,
              settled::text, outstanding::text, payments::int, is_current
         from affiliate_week_collections
        where not is_test and not is_house
          and week_start <= app.business_week()
          and week_start > app.business_week() - ($1::int * 7)
        order by week_start desc, name`, [WEEKS_SHOWN]);
    return rows.map((r) => ({
      affiliateId: r.affiliate_id, name: r.name, weekStart: r.week_start, weekEnd: r.week_end,
      sales: r.sales, renewals: r.renewals, cash: r.cash, keeps: r.keeps, owed: r.owed,
      settled: r.settled, outstanding: r.outstanding, payments: r.payments, isCurrent: r.is_current,
    }));
  });
  const e = typeof ctx.query.e === "string" ? ctx.query.e : null;
  return { props: plain({ viewer: g.viewer, weeks, error: e, ok: ctx.query.ok === "collection" }) };
};

const sum = (rows: Week[], key: "outstanding" | "settled" | "owed") =>
  formatMoney(rows.reduce((n, w) => n + toCents(w[key]), 0) / 100);

export default function Collections({ viewer, weeks, error, ok }: Props) {
  const t = strings(viewer.lang);
  const c = t.collections;
  const current = weeks.filter((w) => w.isCurrent);
  const owing = weeks.filter((w) => toCents(w.outstanding) > 0);
  const byWeek: [string, Week[]][] = [];
  for (const w of weeks) {
    const last = byWeek[byWeek.length - 1];
    if (last && last[0] === w.weekStart) last[1].push(w);
    else byWeek.push([w.weekStart, [w]]);
  }
  return (
    <Page
      viewer={viewer} section="collections" title={c.title} subtitle={c.subtitle}
      stats={
        <>
          <StatCard icon="wallet" tone="warn" label={cap(c.outstandingAll)} value={sum(owing, "outstanding")} note={c.lastWeeks(WEEKS_SHOWN)} />
          <StatCard icon="dollar" label={cap(c.owedThisWeek)} value={sum(current, "owed")} note={c.thisWeek} />
          <StatCard icon="receipt" tone="good" label={cap(c.settledThisWeek)} value={sum(current, "settled")} note={c.thisWeek} />
        </>
      }
    >
      {ok && <p className="note good" role="status">{c.saved}</p>}
      {error && <p className="note bad" role="alert">{c.errors[error] ?? c.errors.amount}</p>}
      {byWeek.length === 0 ? (
        <Card title={c.title}><p>{c.empty}</p></Card>
      ) : byWeek.map(([weekStart, rows]) => (
        <Card key={weekStart} title={`${c.week} ${formatDate(rows[0].weekStart, viewer.lang)} — ${formatDate(rows[0].weekEnd, viewer.lang)}`}
              action={rows[0].isCurrent ? <span className="chip">{c.thisWeek}</span> : undefined}>
          <Desc>{c.caption}</Desc>
          <div className="wrap">
            <table>
              <caption className="sr">{c.caption}</caption>
              <thead>
                <tr>
                  <th>{c.business}</th><th className="num">{c.sales}</th><th className="num">{c.renewals}</th>
                  <th className="num">{c.cash}</th><th className="num">{c.keeps}</th><th className="num">{c.owes}</th>
                  <th className="num">{c.settled}</th><th className="num">{c.outstanding}</th><th>{c.record}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((w) => {
                  const left = toCents(w.outstanding);
                  return (
                    <tr key={w.affiliateId}>
                      <td><a href={`/affiliates/${w.affiliateId}`}>{w.name}</a></td>
                      <td className="num">{w.sales}</td>
                      <td className="num">{w.renewals}</td>
                      <td className="num">{formatMoney(w.cash)}</td>
                      <td className="num">{formatMoney(w.keeps)}</td>
                      <td className="num"><b>{formatMoney(w.owed)}</b></td>
                      <td className="num">{formatMoney(w.settled)}{w.payments > 1 && <> <small>({c.payments(w.payments)})</small></>}</td>
                      <td className="num">{left > 0 ? formatMoney(w.outstanding) : <span className="chip good">{c.done}</span>}</td>
                      <td>
                        {left > 0 && (
                          <form method="post" action="/api/collections/record" className="inline">
                            <input type="hidden" name="affiliate_id" value={w.affiliateId} />
                            <input type="hidden" name="week_start" value={w.weekStart} />
                            <label className="sr" htmlFor={`a-${w.affiliateId}-${w.weekStart}`}>{c.amount}</label>
                            <input id={`a-${w.affiliateId}-${w.weekStart}`} name="amount" required inputMode="decimal"
                                   maxLength={12} autoComplete="off" defaultValue={w.outstanding} />
                            <button type="submit" className="pill">{c.record}</button>
                          </form>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="note warn">{c.note}</p>
        </Card>
      ))}
    </Page>
  );
}
