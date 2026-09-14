/**
 * Renovaciones: the renewal pipeline, in this order:
 *   Por vencer  ending within 30 days, soonest first
 *   Vencidos    no paid period covering today, most recently lapsed first
 *   Reactivados paid after lapsing, last 90 days, newest first (renewal_log)
 * then the lapse rate per affiliate (affiliate_lapse_rate). The header links to
 * the collection vs commission table and the renewal log (/renewals/log).
 *
 * "Marcar pagado" records a renewal collected by the owner (app.record_renewal):
 * credited to the house affiliate at no commission (0031); early, it starts
 * where the current period ends; lapsed, it starts today (0029). The owner comes
 * back here with the new period end named.
 */
import type { GetServerSideProps } from "next";
import type { ReactNode } from "react";
import { asPerson } from "@leamington/shared/src/server/db.ts";
import { formatCode } from "@leamington/shared/src/code.ts";
import { formatDate, formatDateTime } from "@leamington/shared/src/format.ts";
import { ownerPage, plain, type Viewer } from "../lib/server.ts";
import { collectorLabel, isUuid, lapseRateLabel, q1, sortAffiliateGroups } from "../lib/rules.ts";
import { strings } from "../lib/i18n.ts";
import { Page, Card, HeroAction, StatCard, Chip, Note, Desc } from "../lib/ui.tsx";

export const config = { unstable_runtimeJS: false };

const LIMIT = 300;

type Row = {
  client_id: string; full_name: string; code: string; period_end: string; days_left: number; is_test: boolean;
  active: boolean; affiliate_id: string; affiliate_name: string; is_house: boolean;
};
type Reactivated = {
  subscription_id: string; paid_at: string; client_id: string; full_name: string; code: string; is_test: boolean;
  lapsed_days: number | null; collected_by_owner: boolean; collecting_affiliate: string | null;
  registered_by_affiliate: string | null; registrant_is_house: boolean;
};
type Lapse = {
  affiliate_id: string; name: string; active: boolean; is_test: boolean; is_house: boolean;
  came_due: number; lapsed: number; renewed: number; reactivated: number; lapse_rate: string | null;
};
type Counts = { due: number; lapsed: number; reactivated: number };
type Props = {
  viewer: Viewer; due: Row[]; lapsed: Row[]; reactivated: Reactivated[]; lapse: Lapse[]; counts: Counts;
  confirmation: { name: string; end: string; reactivation: boolean } | null; error: string | null;
};

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
    // A voided reactivation did not reactivate anyone: that client is back under Vencidos.
    const reactivated = await q.query(
      `select l.subscription_id, l.paid_at, l.client_id, l.full_name, l.code, l.is_test, l.lapsed_days,
              l.collected_by_owner, l.collecting_affiliate, l.registered_by_affiliate, coalesce(ra.is_house, false) as registrant_is_house
         from renewal_log l left join affiliates ra on ra.id = l.registered_by_affiliate_id
        where l.reactivation and l.voided_at is null and l.paid_at > now() - interval '90 days'
        order by l.paid_at desc, l.subscription_id limit ${LIMIT + 1}`);
    const lapse = await q.query(
      `select affiliate_id, name, active, is_test, is_house, came_due::int, lapsed::int, renewed::int, reactivated::int,
              lapse_rate::text as lapse_rate
         from affiliate_lapse_rate`);
    // Headline counts: real clients only, not capped by the table limit.
    const counts = await q.query(
      `select (select count(*) from client_status where status = 'due' and not is_test)::int as due,
              (select count(*) from client_status where status = 'lapsed' and not is_test)::int as lapsed,
              (select count(*) from renewal_log
                where reactivation and voided_at is null and not is_test and paid_at > now() - interval '90 days')::int as reactivated`);
    let confirmation: Props["confirmation"] = null;
    if (q1(ctx.query.ok) === "renewed" && isUuid(clientId) && /^\d{4}-\d{2}-\d{2}$/.test(end)) {
      const c = await q.query("select full_name from clients where id = $1", [clientId]);
      if (c.rows[0]) confirmation = { name: c.rows[0].full_name, end, reactivation: q1(ctx.query.re) === "1" };
    }
    return {
      due: due.rows as Row[], lapsed: lapsed.rows as Row[], reactivated: reactivated.rows as Reactivated[],
      lapse: sortAffiliateGroups(lapse.rows as Lapse[], (a, b) => b.came_due - a.came_due), counts: counts.rows[0] as Counts, confirmation,
    };
  });
  return { props: plain({ viewer: g.viewer, ...data, error: q1(ctx.query.e) || null }) };
};

function Pipeline({ viewer, rows, title, desc, caption, empty, id, children }: {
  viewer: Viewer; rows: Row[]; title: string; desc: string; caption: string; empty: string; id: string; children?: ReactNode;
}) {
  const t = strings(viewer.lang);
  const r = t.renewals;
  const shown = rows.slice(0, LIMIT);
  const truncated = rows.length > LIMIT ? ` ${r.truncated(LIMIT)}` : "";
  return (
    <Card title={title} id={id}>
      <Desc>{desc}{truncated}</Desc>
      {children}
      {rows.length === 0 ? <p>{empty}</p> : (
        <div className="wrap">
          <table>
            <caption className="sr">{caption}{truncated ? ` —${truncated}` : ""}</caption>
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
                  <td>{row.is_house ? t.chip.house : row.affiliate_name}</td>
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
                      <button type="submit" className="pill">{r.markPaid}</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function ReactivatedList({ viewer, rows }: { viewer: Viewer; rows: Reactivated[] }) {
  const t = strings(viewer.lang);
  const r = t.renewals;
  const shown = rows.slice(0, LIMIT);
  const truncated = rows.length > LIMIT ? ` ${r.truncated(LIMIT)}` : "";
  return (
    <Card title={r.reactivatedTitle} id="reactivated">
      <Desc>{r.reactivatedDesc}{truncated}</Desc>
      {rows.length === 0 ? <p>{r.noneReactivated}</p> : (
        <div className="wrap">
          <table>
            <caption className="sr">{r.reactivatedCaption}{truncated ? ` —${truncated}` : ""}</caption>
            <thead>
              <tr>
                <th scope="col">{r.client}</th><th scope="col">{r.when}</th><th scope="col">{r.renewedOn}</th>
                <th scope="col">{r.registeredBy}</th><th scope="col">{r.earner}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <tr key={row.subscription_id}>
                  <th scope="row">
                    <a href={`/clients/${row.client_id}`}>{row.full_name}</a>{" "}
                    {row.is_test && <Chip kind="test">{t.chip.test}</Chip>}
                    <br /><small className="nums">{formatCode(row.code)}</small>
                  </th>
                  <td>{row.lapsed_days ? <Chip kind="good">{r.lapsedFor(row.lapsed_days)}</Chip> : <Chip kind="good">{t.reactivation(null)}</Chip>}</td>
                  <td>{formatDateTime(row.paid_at, viewer.lang)}</td>
                  <td>{row.registrant_is_house ? t.chip.house : row.registered_by_affiliate ?? t.dash}</td>
                  <td>{collectorLabel(row, t.ownerNoCommission)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function LapseRate({ viewer, rows }: { viewer: Viewer; rows: Lapse[] }) {
  const t = strings(viewer.lang);
  const r = t.renewals;
  return (
    <Card title={r.lapseTitle} id="lapse">
      <Desc>{r.lapseDef}</Desc>
      <div className="wrap">
        <table>
          <caption className="sr">{r.lapseTitle}</caption>
          <thead>
            <tr>
              <th scope="col">{r.affiliate}</th><th scope="col" className="num">{r.cameDue}</th>
              <th scope="col" className="num">{r.renewedCol}</th><th scope="col" className="num">{r.lapsedNow}</th>
              <th scope="col" className="num">{r.reactivatedCol}</th><th scope="col" className="num">{r.rate}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const rate = lapseRateLabel(row.lapse_rate);
              return (
                <tr key={row.affiliate_id}>
                  <th scope="row">
                    <a href={`/affiliates/${row.affiliate_id}`}>{row.is_house ? t.chip.house : row.name}</a>{" "}
                    {!row.active && <Chip kind="unk">{t.chip.inactive}</Chip>}{" "}
                    {row.is_test && <Chip kind="test">{t.chip.test}</Chip>}
                  </th>
                  <td className="num">{row.came_due}</td>
                  <td className="num">{row.renewed}</td>
                  <td className="num">{row.lapsed}</td>
                  <td className="num">{row.reactivated}</td>
                  {rate ? <td className="num"><b>{rate}</b></td> : <td className="num"><small>{r.nobodyYet}</small></td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export default function Renewals({ viewer, due, lapsed, reactivated, lapse, counts, confirmation, error }: Props) {
  const t = strings(viewer.lang);
  const r = t.renewals;
  const lang = viewer.lang;
  return (
    <Page
      viewer={viewer} section="renewals" title={r.title} subtitle={r.subtitle}
      action={<HeroAction href="/renewals/log" icon="list">{r.logAction}</HeroAction>}
      stats={
        <>
          <StatCard icon="clock" tone="warn" label={r.dueTitle} value={counts.due} note={t.home.now} href="#due" />
          <StatCard icon="alert" tone="bad" label={r.lapsedTitle} value={counts.lapsed} note={t.home.now} href="#lapsed" />
          <StatCard icon="refresh" tone="good" label={r.reactivatedTitle} value={counts.reactivated} note={t.home.last90} href="#reactivated" />
        </>
      }
    >
      {confirmation && (
        <Note>
          {confirmation.reactivation
            ? r.reactivatedOk(confirmation.name, formatDate(confirmation.end, lang, true))
            : r.renewed(confirmation.name, formatDate(confirmation.end, lang, true))}
        </Note>
      )}
      {error && <Note kind="bad">{t.client.errors[error] ?? t.client.errors.invalid}</Note>}
      <Pipeline viewer={viewer} rows={due} title={r.dueTitle} desc={r.dueDesc} caption={r.dueCaption} empty={r.noneDue} id="due">
        <p className="note warn">{r.markPaidNote}</p>
      </Pipeline>
      <Pipeline viewer={viewer} rows={lapsed} title={r.lapsedTitle} desc={r.lapsedDesc} caption={r.lapsedCaption} empty={r.noneLapsed} id="lapsed" />
      <ReactivatedList viewer={viewer} rows={reactivated} />
      <LapseRate viewer={viewer} rows={lapse} />
    </Page>
  );
}
