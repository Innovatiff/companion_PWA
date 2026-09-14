/**
 * Fuentes: feed health, one row per expected feed, most severe first.
 *
 * THREE STATES, never collapsed: ok, stale and error are distinct, and a feed
 * whose health this page cannot place ("never run", or anything unknown) is
 * "could not determine", never ok. A successful run that wrote 0 records says
 * whether the source confirmed it had nothing. The counts in the header band
 * are shown only when feeds are expected at all.
 *
 * feed_health_detail, source_runs and feed_expectations are operational tables
 * without an owner-facing RLS path for all of them; they are read with the
 * server connection, and only after the owner check has passed.
 */
import type { GetServerSideProps } from "next";
import { db } from "@leamington/shared/src/server/db.ts";
import { formatDateTime } from "@leamington/shared/src/format.ts";
import { ownerPage, plain, type Viewer } from "../lib/server.ts";
import { feedState, sortFeeds, durationLabel, type FeedState } from "../lib/rules.ts";
import { strings } from "../lib/i18n.ts";
import { Page, Card, StatCard, Chip, FEED_CHIP } from "../lib/ui.tsx";
import type { IconName, Tone } from "@leamington/shared/src/ui/Portal.tsx";

export const config = { unstable_runtimeJS: false };

type Feed = {
  feed: string; label: string; interval_s: number; last_ok_at: string | null; last_attempt_at: string | null;
  latest_status: string | null; health: string | null; latest_result: string | null; failures_24h: number | null;
  alert_delivery_failures_24h: number | null; running_since: string | null;
  records_written: number | null; last_finished_at: string | null; last_error: string | null; last_error_at: string | null;
};
type Unmonitored = { feed: string; last_attempt_at: string; runs: number };
type Props = { viewer: Viewer; feeds: Feed[]; unmonitored: Unmonitored[]; checkedAt: string };

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const g = await ownerPage(ctx);
  if ("redirect" in g) return g;
  // Owner check passed above.
  const [feeds, unmonitored, now] = await Promise.all([
    db().query(
      `select d.feed, d.label, extract(epoch from d.expected_interval)::int as interval_s, d.last_ok_at, d.last_attempt_at,
              d.latest_status::text as latest_status, d.health, d.latest_result::text as latest_result,
              d.failures_24h::int as failures_24h, d.alert_delivery_failures_24h::int as alert_delivery_failures_24h, d.running_since,
              lr.records_written, lr.finished_at as last_finished_at, le.error as last_error, le.started_at as last_error_at
         from feed_health_detail d
         left join lateral (select r.records_written, r.finished_at from source_runs r
                             where r.feed = d.feed and r.finished_at is not null
                             order by r.started_at desc limit 1) lr on true
         left join lateral (select r.error, r.started_at from source_runs r
                             where r.feed = d.feed and r.error is not null
                             order by r.started_at desc limit 1) le on true`),
    db().query(
      `select r.feed, max(r.started_at) as last_attempt_at, count(*)::int as runs
         from source_runs r
        where not exists (select 1 from feed_expectations e where e.feed = r.feed and e.active)
        group by r.feed order by 2 desc limit 50`),
    db().query("select now() as now"),
  ]);
  return { props: { viewer: g.viewer, feeds: sortFeeds(plain(feeds.rows as Feed[])), ...plain({ unmonitored: unmonitored.rows as Unmonitored[], checkedAt: now.rows[0].now as string }) } };
};

const STAT: [FeedState, IconName, Tone][] = [["ok", "check", "good"], ["stale", "clock", "warn"], ["error", "alert", "bad"], ["unknown", "activity", "brand"]];

export default function Feeds({ viewer, feeds, unmonitored, checkedAt }: Props) {
  const t = strings(viewer.lang);
  const f = t.feeds;
  const lang = viewer.lang;
  const when = (v: string | null) => (v ? formatDateTime(v, lang) : f.never);
  const count = (s: FeedState) => feeds.filter((row) => feedState(row.health) === s).length;
  const checked = `${t.checked}: ${formatDateTime(checkedAt, lang)}`;
  return (
    <Page
      viewer={viewer} section="feeds" title={f.title} subtitle={`${f.lead} ${checked}`}
      stats={feeds.length === 0 ? undefined : (
        <>{STAT.map(([s, icon, tone]) => <StatCard key={s} icon={icon} tone={tone} label={f.state[s]!} value={count(s)} note={t.now} />)}</>
      )}
    >
      {feeds.length === 0 ? <p className="note bad">{f.emptyExpect}</p> : (
        <Card title={f.expected}>
          <div className="wrap">
            <table>
              <caption className="sr">{f.expected}</caption>
              <thead>
                <tr>
                  <th scope="col">{f.feed}</th><th scope="col">{f.status}</th><th scope="col">{f.lastOk}</th>
                  <th scope="col">{f.lastRun}</th><th scope="col" className="num">{f.records}</th>
                  <th scope="col" className="num">{f.failures}</th><th scope="col">{f.lastError}</th>
                </tr>
              </thead>
              <tbody>
                {feeds.map((row) => {
                  const state = feedState(row.health);
                  const reason = row.health ? f.reason[row.health] : "";
                  return (
                    <tr key={row.feed}>
                      <th scope="row">{row.label}<br /><small className="nums">{row.feed} · {f.every} {durationLabel(row.interval_s, lang)}</small></th>
                      <td>
                        <Chip kind={FEED_CHIP[state]}>{f.state[state]}</Chip>
                        {reason ? <><br /><small>{reason}</small></> : null}
                        {state === "unknown" && row.health && !(row.health in f.reason) ? <><br /><small>{row.health}</small></> : null}
                        {row.running_since && <><br /><small>{f.running} {formatDateTime(row.running_since, lang)}</small></>}
                        {(row.alert_delivery_failures_24h ?? 0) > 0 && <><br /><Chip kind="bad">{f.ownerAlertFail(row.alert_delivery_failures_24h ?? 0)}</Chip></>}
                      </td>
                      <td>{when(row.last_ok_at)}</td>
                      <td>{when(row.last_attempt_at)}</td>
                      <td className="num">
                        {row.records_written ?? t.dash}
                        {row.latest_result && <><br /><small>{f.result[row.latest_result] ?? row.latest_result}</small></>}
                      </td>
                      <td className="num">{row.failures_24h ?? t.dash}</td>
                      <td className="break">{row.last_error ? <>{row.last_error}<br /><small>{when(row.last_error_at)}</small></> : t.dash}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {unmonitored.length > 0 && (
        <Card title={f.unmonitored}>
          <p className="note warn">{f.unmonitoredNote}</p>
          <div className="wrap">
            <table>
              <caption className="sr">{f.unmonitored}</caption>
              <thead><tr><th scope="col">{f.feed}</th><th scope="col">{f.lastRun}</th><th scope="col" className="num">{f.runs}</th></tr></thead>
              <tbody>
                {unmonitored.map((u) => (
                  <tr key={u.feed}><th scope="row" className="nums">{u.feed}</th><td>{when(u.last_attempt_at)}</td><td className="num">{u.runs}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </Page>
  );
}
