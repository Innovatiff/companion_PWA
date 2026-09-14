/**
 * My clients. Counts in the band, renewals due soon first (with days left), then
 * every client. Due, lapsed and never-paid clients carry a "Renovar" link to
 * /renew/<id>.
 *
 * Read from the client_status view (0019) inside asPerson, so row-level security
 * returns only this affiliate's clients. The ledger is ours: an empty result is
 * a confirmed fact, and the page says so plainly. A query that fails throws and
 * the page fails visibly; it never shows an empty list in its place.
 */
import type { GetServerSideProps } from "next";
import { requirePerson } from "@leamington/shared/src/server/portal.ts";
import { asPerson } from "@leamington/shared/src/server/db.ts";
import { formatCode } from "@leamington/shared/src/code.ts";
import { formatDate, formatMoney } from "@leamington/shared/src/format.ts";
import { Card, Hero, HeroAction, StatCard } from "@leamington/shared/src/ui/Portal.tsx";
import { Page, setPageLang, viewerOf, type Viewer } from "../lib/layout.tsx";
import { monthLabel, strings } from "../lib/strings.ts";
import { countryName, splitClients, statusLabel, statusTone, type ClientRow } from "../lib/clients.ts";

export const config = { unstable_runtimeJS: false };

type Props = { viewer: Viewer; now: string; clients: ClientRow[]; earnedThisMonth: string };

export const getServerSideProps: GetServerSideProps<Props> = async ({ req, res }) => {
  res.setHeader("Cache-Control", "private, no-store");
  const auth = await requirePerson(req, "affiliate");
  if (!auth.person) return { redirect: auth.redirect };
  const person = auth.person;
  setPageLang(req, person.language);

  const data = await asPerson(person.authUserId, async (q) => {
    const { rows } = await q.query(
      `select client_id as id, full_name, code, country::text as country, admin_region, status, days_left,
              period_end::text as period_end, is_test, active, created_at
         from client_status
        order by created_at desc`);
    const e = await q.query(
      "select earned_this_month::text from affiliate_earnings where affiliate_id = app.current_affiliate_id()");
    // Every affiliate has an earnings row (zeros included). Its absence is a fault, not zero.
    if (!e.rows[0]) throw new Error("affiliate_earnings returned no row for the signed-in affiliate");
    return {
      earnedThisMonth: e.rows[0].earned_this_month as string,
      clients: rows.map((r): ClientRow => ({
        id: r.id, fullName: r.full_name, code: r.code, country: r.country, adminRegion: r.admin_region,
        status: r.status, daysLeft: r.days_left == null ? null : Number(r.days_left), periodEnd: r.period_end,
        isTest: r.is_test, active: r.active, createdAt: new Date(r.created_at).toISOString(),
      })),
    };
  });
  return { props: { viewer: viewerOf(person), now: new Date().toISOString(), ...data } };
};

export default function Clients({ viewer, now, clients, earnedThisMonth }: Props) {
  const t = strings(viewer.lang);
  const lang = viewer.lang;
  const { due, all } = splitClients(clients);
  const count = (status: string) => clients.filter((c) => c.status === status).length;
  const end = (c: ClientRow) => (c.periodEnd ? formatDate(c.periodEnd, lang, true) : "");
  const chips = (c: ClientRow) => (
    <>
      {c.isTest && <> <span className="chip test">{t.test}</span></>}
      {!c.active && <> <span className="chip">{t.inactive}</span></>}
    </>
  );
  const renew = (c: ClientRow) =>
    c.active && c.status !== "active"
      ? <a className="pill" href={`/renew/${c.id}`} aria-label={t.renewLinkFor(c.fullName)}>{t.renewLink}</a>
      : null;

  return (
    <Page title={t.clientsTitle} viewer={viewer} nav="clients" badges={{ clients: all.length, due: due.length }}>
      <Hero
        title={t.clientsTitle}
        subtitle={t.clientsSub(viewer.name, due.length)}
        action={<>
          <HeroAction href="/renew" icon="refresh">{t.navRenew}</HeroAction>
          <HeroAction href="/register" icon="plus">{t.registerClient}</HeroAction>
        </>}
        stats={<>
          <StatCard icon="users" tone="good" label={t.statActive} value={count("active")} note={t.today} />
          <StatCard icon="clock" tone="warn" label={t.statusDue} value={count("due")} note={t.next30Days} href={due.length ? "#due" : undefined} />
          <StatCard icon="alert" tone="bad" label={t.statLapsed} value={count("lapsed")} note={t.today} />
          <StatCard icon="dollar" label={t.earnedThisMonth} value={formatMoney(earnedThisMonth)} note={monthLabel(new Date(now), lang)} href="/earnings" />
        </>}
      />

      {due.length > 0 && (
        <Card id="due" title={t.dueCaption} action={<a href="/renew">{t.renewWithCode}</a>}>
          <ul className="list">
            {due.map((c) => (
              <li key={c.id}>
                <div>
                  <div className="t"><a href={`/clients/${c.id}/code`}>{c.fullName}</a>{chips(c)}</div>
                  <div className="meta">
                    <span className="mono">{formatCode(c.code)}</span>
                    <span>{countryName(c.country, lang)}{c.adminRegion ? ` · ${c.adminRegion}` : ""}</span>
                    <span>{t.periodEnds}: {end(c)}</span>
                  </div>
                </div>
                <div className="actions">
                  <span className="chip warn">{t.expiresIn(c.daysLeft ?? 0)}</span>
                  {renew(c)}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title={`${t.allCaption} (${all.length})`}>
        {all.length === 0 ? (
          <p>{t.noClients}</p>
        ) : (
          <div className="wrap">
            <table>
              <caption className="sr">{t.allCaption} ({all.length})</caption>
              <thead>
                <tr>
                  <th>{t.colName}</th><th>{t.colCode}</th><th>{t.colCountry}</th><th>{t.colRegion}</th>
                  <th>{t.colStatus}</th><th>{t.colPeriodEnd}</th><th><span className="sr">{t.colAction}</span></th>
                </tr>
              </thead>
              <tbody>
                {all.map((c) => (
                  <tr key={c.id}>
                    <td><a href={`/clients/${c.id}/code`}>{c.fullName}</a>{chips(c)}</td>
                    <td className="mono">{formatCode(c.code)}</td>
                    <td>{countryName(c.country, lang)}</td>
                    <td>{c.adminRegion ?? ""}</td>
                    <td><span className={`chip ${statusTone(c.status)}`}>{statusLabel(c.status, t)}</span></td>
                    <td>{end(c)}</td>
                    <td>{renew(c)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </Page>
  );
}
