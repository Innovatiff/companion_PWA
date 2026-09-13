/**
 * Alertas: the delivery log.
 *
 * 1. Owner alerts (Telegram): every attempt from owner_alert_deliveries, and the
 *    delivery path's overall state. "Never tested" is not "working".
 * 2. Client alert notifications: per weather alert, how many were queued, sent,
 *    failed, suppressed, and stuck (5 attempts, no longer claimed). The agency's
 *    wording is shown verbatim. An empty queue is never presented as "no alerts".
 *
 * These are operational tables read with the server connection, only after the
 * owner check has passed.
 */
import type { GetServerSideProps } from "next";
import { db } from "@leamington/shared/src/server/db.ts";
import { formatDateTime } from "@leamington/shared/src/format.ts";
import { ownerPage, plain, type Viewer } from "../lib/server.ts";
import { strings } from "../lib/i18n.ts";
import { Page, Chip, type ChipKind } from "../lib/ui.tsx";

export const config = { unstable_runtimeJS: false };

type Delivery = { id: string; feed: string; kind: string; attempted_at: string; delivered: boolean; http_status: number | null; error: string | null; summary: string | null };
type Health = { status: string; last_attempt_at: string | null; last_delivered_at: string | null; last_failure_error: string | null; failures_24h: number };
type AlertRow = {
  alert_id: string | null; cap_identifier: string | null; event: string | null; level: string | null; issued_at: string | null;
  msg_type: string | null; source_url: string | null; agency: string | null;
  queued: number; sent: number; failed: number; suppressed: number; stuck: number; last_error: string | null; last_queued_at: string;
};
type Props = { viewer: Viewer; deliveries: Delivery[]; health: Health; alerts: AlertRow[]; checkedAt: string };

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const g = await ownerPage(ctx);
  if ("redirect" in g) return g;
  // Owner check passed above.
  const [deliveries, health, alerts, now] = await Promise.all([
    db().query(
      `select d.id::text, d.feed, d.kind, d.attempted_at, d.delivered, d.http_status, d.error, oa.summary
         from owner_alert_deliveries d left join owner_alerts oa on oa.id = d.owner_alert_id
        order by d.attempted_at desc, d.id desc limit 100`),
    db().query("select status, last_attempt_at, last_delivered_at, last_failure_error, failures_24h::int from owner_alert_delivery_health"),
    db().query(
      `select n.weather_alert_id::text as alert_id, max(n.cap_identifier) as cap_identifier,
              w.event, w.level::text as level, w.issued_at, w.msg_type, w.source_url, s.agency,
              count(*) filter (where n.status = 'queued')::int as queued,
              count(*) filter (where n.status = 'sent')::int as sent,
              count(*) filter (where n.status = 'failed')::int as failed,
              count(*) filter (where n.status = 'suppressed')::int as suppressed,
              count(*) filter (where n.status = 'queued' and n.attempts >= 5)::int as stuck,
              (array_agg(n.error order by n.created_at desc) filter (where n.error is not null))[1] as last_error,
              max(n.created_at) as last_queued_at
         from notifications n
         left join weather_alerts w on w.id = n.weather_alert_id
         left join alert_sources s on s.id = w.source_id
        where n.channel = 'alert'
        group by n.weather_alert_id, w.id, s.id, (case when n.weather_alert_id is null then n.cap_identifier end)
        order by coalesce(w.issued_at, max(n.created_at)) desc
        limit 100`),
    db().query("select now() as now"),
  ]);
  return { props: plain({ viewer: g.viewer, deliveries: deliveries.rows, health: health.rows[0], alerts: alerts.rows, checkedAt: now.rows[0].now }) };
};

const HEALTH_KIND: Record<string, ChipKind> = { ok: "good", failing: "bad", untested: "unk" };
const LEVEL_KIND: Record<string, ChipKind> = { red: "bad", orange: "warn", yellow: "unk" };

export default function Alerts({ viewer, deliveries, health, alerts, checkedAt }: Props) {
  const t = strings(viewer.lang);
  const a = t.alerts;
  const lang = viewer.lang;
  return (
    <Page viewer={viewer} section="alerts" title={a.title}>
      <p><small>{t.checked}: {formatDateTime(checkedAt, lang)}</small></p>

      <h2>{a.owner}</h2>
      <p>
        <Chip kind={HEALTH_KIND[health.status] ?? "unk"}>{a.ownerHealth[health.status] ?? health.status}</Chip>{" "}
        {health.last_delivered_at && <small>{a.lastDelivered}: {formatDateTime(health.last_delivered_at, lang)}</small>}
      </p>
      {health.status === "failing" && health.last_failure_error && <p className="err">{health.last_failure_error}</p>}
      {deliveries.length === 0 ? <p>{a.ownerEmpty}</p> : (
        <div className="wrap">
          <table>
            <caption>{a.owner}</caption>
            <thead>
              <tr><th scope="col">{a.time}</th><th scope="col">{a.feed}</th><th scope="col">{a.kind}</th><th scope="col">{a.result}</th><th scope="col">{a.error}</th></tr>
            </thead>
            <tbody>
              {deliveries.map((d) => (
                <tr key={d.id}>
                  <th scope="row">{formatDateTime(d.attempted_at, lang)}</th>
                  <td className="nums">{d.feed}</td>
                  <td>{d.kind}{d.summary && <><br /><small>{d.summary}</small></>}</td>
                  <td>
                    {d.delivered ? <Chip kind="good">{a.delivered}</Chip> : <Chip kind="bad">{a.failed}</Chip>}
                    {d.http_status !== null && <> <small>HTTP {d.http_status}</small></>}
                  </td>
                  <td>{d.error ?? t.dash}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2>{a.clients}</h2>
      {alerts.length === 0 ? <p className="note bad">{a.clientsEmpty}</p> : (
        <div className="wrap">
          <table>
            <caption>{a.clientsCaption}</caption>
            <thead>
              <tr>
                <th scope="col">{a.event}</th><th scope="col">{a.level}</th><th scope="col">{a.agency}</th><th scope="col">{a.issued}</th>
                <th scope="col" className="num">{a.queued}</th><th scope="col" className="num">{a.sent}</th>
                <th scope="col" className="num">{a.failedCol}</th><th scope="col" className="num">{a.suppressed}</th>
                <th scope="col" className="num">{a.stuck}</th><th scope="col">{a.lastError}</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((r) => (
                <tr key={`${r.alert_id ?? "x"}-${r.cap_identifier ?? ""}`}>
                  <th scope="row">
                    {r.event ?? a.deleted}
                    {r.msg_type && r.msg_type !== "Alert" && <> <small>({r.msg_type})</small></>}
                    {r.cap_identifier && <><br /><small className="nums">{r.cap_identifier}</small></>}
                  </th>
                  <td>{r.level ? <Chip kind={LEVEL_KIND[r.level] ?? "plain"}>{t.level[r.level] ?? r.level}</Chip> : t.dash}</td>
                  <td>{r.source_url && r.agency ? <a href={r.source_url} rel="noreferrer">{r.agency}</a> : r.agency ?? t.dash}</td>
                  <td>{r.issued_at ? formatDateTime(r.issued_at, lang) : t.dash}</td>
                  <td className="num">{r.queued}</td><td className="num">{r.sent}</td>
                  <td className="num">{r.failed}</td><td className="num">{r.suppressed}</td>
                  <td className="num">{r.stuck > 0 ? <Chip kind="bad">{r.stuck}</Chip> : 0}</td>
                  <td>{r.last_error ?? t.dash}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Page>
  );
}
