/**
 * Ventas: the money summary in the header band, then sales per affiliate FIRST
 * among the cards, so it is obvious who is selling and who isn't; then the
 * renewal pipeline, the clients due soonest and feed health. Test data is
 * marked, and excluded from money and from the counts.
 */
import type { GetServerSideProps } from "next";
import { asPerson, db } from "@leamington/shared/src/server/db.ts";
import { formatDate, formatDateTime, formatMoney } from "@leamington/shared/src/format.ts";
import { ownerPage, plain, type Viewer } from "../lib/server.ts";
import { sortSales, sortFeeds, feedState, isQuiet, monthLabel, type SalesRow } from "../lib/rules.ts";
import { strings } from "../lib/i18n.ts";
import { Page, Card, HeroAction, StatCard, Chip, Desc, FEED_CHIP, cap } from "../lib/ui.tsx";

export const config = { unstable_runtimeJS: false };

type Row = SalesRow & {
  renewals_30d: number; renewals_all: number;
  active_clients: number; due_clients: number; lapsed_clients: number;
};
type Stats = {
  month: string; today: string; gross: string; commissions: string; net: string; owed: string;
  due: number; lapsed: number; reactivated: number;
};
type Soon = { client_id: string; full_name: string; country: string; days_left: number; is_test: boolean; affiliate_name: string; is_house: boolean };
type FeedLine = { feed: string; label: string; health: string | null; last_ok_at: string | null };
type Props = { viewer: Viewer; rows: Row[]; stats: Stats; soon: Soon[]; feeds: FeedLine[] };

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const g = await ownerPage(ctx);
  if ("redirect" in g) return g;
  const { rows, stats, soon } = await asPerson(g.person.authUserId, async (q) => {
    const sales = await q.query(
      `select affiliate_id, name, active, is_test, is_house,
              sales_7d::int, sales_30d::int, sales_all::int, renewals_30d::int, renewals_all::int, last_sale_at,
              active_clients::int, due_clients::int, lapsed_clients::int
         from sales_per_affiliate`);
    const s = await q.query(
      `with m as (select * from revenue_by_month where to_char(month, 'YYYY-MM') = to_char(app.business_today(), 'YYYY-MM'))
       select to_char(app.business_today(), 'YYYY-MM') as month, app.business_today()::text as today,
              coalesce((select gross from m), 0)::text as gross,
              coalesce((select affiliate_commissions from m), 0)::text as commissions,
              coalesce((select net from m), 0)::text as net,
              (select coalesce(sum(greatest(owed, 0)), 0) from affiliate_earnings where not is_test)::text as owed,
              (select count(*) from client_status where status = 'due' and not is_test)::int as due,
              (select count(*) from client_status where status = 'lapsed' and not is_test)::int as lapsed,
              (select count(*) from renewal_log
                where reactivation and voided_at is null and not is_test and paid_at > now() - interval '90 days')::int as reactivated`);
    // The first rows of /renewals "Por vencer", in the same order.
    const due = await q.query(
      `select cs.client_id, cs.full_name, cs.country::text as country, cs.days_left, cs.is_test, a.name as affiliate_name, a.is_house
         from client_status cs join affiliates a on a.id = cs.affiliate_id
        where cs.status = 'due' order by cs.period_end asc, cs.full_name limit 5`);
    return { rows: sales.rows as Row[], stats: s.rows[0] as Stats, soon: due.rows as Soon[] };
  });
  // Owner check passed above; feed_health_detail is read with the server connection, as on /feeds.
  const feeds = await db().query("select feed, label, health, last_ok_at from feed_health_detail");
  return {
    props: {
      viewer: g.viewer, rows: sortSales(plain(rows)), stats: plain(stats), soon: plain(soon),
      feeds: sortFeeds(plain(feeds.rows as FeedLine[])),
    },
  };
};

export default function Home({ viewer, rows, stats, soon, feeds }: Props) {
  const t = strings(viewer.lang);
  const h = t.home;
  const lang = viewer.lang;
  const month = h.thisMonth(monthLabel(stats.month, lang));
  return (
    <Page
      viewer={viewer} section="sales" title={t.nav.sales}
      subtitle={h.subtitle(formatDate(stats.today, lang))}
      action={<HeroAction href="/clients/new">{t.clients.register}</HeroAction>}
      stats={
        <>
          <StatCard icon="dollar" label={cap(h.gross)} value={formatMoney(stats.gross)} note={month} />
          <StatCard icon="store" label={cap(h.commissions)} value={formatMoney(stats.commissions)} note={month} />
          <StatCard icon="trend" tone="good" label={cap(h.net)} value={formatMoney(stats.net)} note={month} />
          <StatCard icon="wallet" tone="warn" label={cap(h.owed)} value={formatMoney(stats.owed)} note={h.allTime} href="/affiliates" />
        </>
      }
    >
      <Card title={h.title} action={<a href="/affiliates">{t.viewAll}</a>} id="sales">
        <Desc>{h.caption}</Desc>
        {rows.length === 0 ? <p>{h.empty}</p> : (
          <div className="wrap">
            <table>
              <caption className="sr">{h.title}</caption>
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
                  <th scope="col"><span className="sr">{t.view}</span></th>
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
                      <td>{r.last_sale_at ? formatDateTime(r.last_sale_at, lang) : h.never}</td>
                      <td className="num">{r.active_clients - r.due_clients}</td>
                      <td className="num">{r.due_clients}</td>
                      <td className="num">{r.lapsed_clients}</td>
                      <td className="num"><a className="pill" href={`/affiliates/${r.affiliate_id}`}>{t.view}</a></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p><small>{h.testNote}</small></p>
      </Card>

      <div className="grid">
        <div>
          <Card title={t.nav.renewals} action={<a href="/renewals">{t.viewAll}</a>}>
            <div className="pipeline">
              <a className="on" href="/renewals#due"><b>{stats.due}</b>{cap(h.renewalsDue)}<small>{h.now}</small></a>
              <a href="/renewals#lapsed"><b>{stats.lapsed}</b>{cap(h.lapsedClients)}<small>{h.now}</small></a>
              <a href="/renewals#reactivated"><b>{stats.reactivated}</b>{h.reactivated}<small>{h.last90}</small></a>
            </div>
          </Card>

          <Card title={h.dueSoon} action={<a href="/renewals#due">{t.viewAll}</a>}>
            {soon.length === 0 ? <p>{t.renewals.noneDue}</p> : (
              <ul className="list">
                {soon.map((s) => (
                  <li key={s.client_id}>
                    <div>
                      <a className="t" href={`/clients/${s.client_id}`}>{s.full_name}</a>{" "}
                      {s.is_test && <Chip kind="test">{t.chip.test}</Chip>}
                      <div className="meta">
                        <span>{s.is_house ? t.chip.house : s.affiliate_name}</span>
                        <span>{t.country[s.country] ?? s.country}</span>
                      </div>
                    </div>
                    <Chip kind="warn">{t.dueIn(s.days_left)}</Chip>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div>
          <Card title={h.feeds} action={<a href="/feeds">{t.view}</a>}>
            {feeds.length === 0 ? <p className="note bad">{t.feeds.emptyExpect}</p> : (
              <ul className="list compact">
                {feeds.map((f) => {
                  const state = feedState(f.health);
                  return (
                    <li key={f.feed}>
                      <div>
                        <span className="t">{f.label}</span>
                        <div className="meta">{t.feeds.lastOk}: {f.last_ok_at ? formatDateTime(f.last_ok_at, lang) : t.feeds.never}</div>
                      </div>
                      <Chip kind={FEED_CHIP[state]}>{t.feeds.state[state]}</Chip>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </Page>
  );
}
