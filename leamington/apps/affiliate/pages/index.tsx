/**
 * My clients. Renewals due soon first (with days left), then every client.
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
import { formatDate } from "@leamington/shared/src/format.ts";
import { Page, setPageLang, viewerOf, type Viewer } from "../lib/layout.tsx";
import { strings } from "../lib/strings.ts";
import { countryName, splitClients, statusLabel, type ClientRow } from "../lib/clients.ts";

export const config = { unstable_runtimeJS: false };

type Props = { viewer: Viewer; clients: ClientRow[] };

export const getServerSideProps: GetServerSideProps<Props> = async ({ req, res }) => {
  res.setHeader("Cache-Control", "private, no-store");
  const auth = await requirePerson(req, "affiliate");
  if (!auth.person) return { redirect: auth.redirect };
  const person = auth.person;
  setPageLang(req, person.language);

  const clients = await asPerson(person.authUserId, async (q) => {
    const { rows } = await q.query(
      `select client_id as id, full_name, code, country::text as country, admin_region, status, days_left,
              period_end::text as period_end, is_test, active, created_at
         from client_status
        order by created_at desc`);
    return rows.map((r): ClientRow => ({
      id: r.id, fullName: r.full_name, code: r.code, country: r.country, adminRegion: r.admin_region,
      status: r.status, daysLeft: r.days_left == null ? null : Number(r.days_left), periodEnd: r.period_end,
      isTest: r.is_test, active: r.active, createdAt: new Date(r.created_at).toISOString(),
    }));
  });
  return { props: { viewer: viewerOf(person), clients } };
};

export default function Clients({ viewer, clients }: Props) {
  const t = strings(viewer.lang);
  const { due, all } = splitClients(clients);
  const end = (c: ClientRow) => (c.periodEnd ? formatDate(c.periodEnd, viewer.lang, true) : "");
  const name = (c: ClientRow) => (
    <>
      <a href={`/clients/${c.id}/code`}>{c.fullName}</a>
      {c.isTest && <> <span className="chip">{t.test}</span></>}
      {!c.active && <> <span className="chip">{t.inactive}</span></>}
    </>
  );

  return (
    <Page title={t.clientsTitle} viewer={viewer} nav="clients">
      <h1>{t.clientsTitle}</h1>
      <div className="actions"><a className="button" href="/register">{t.registerClient}</a></div>

      {due.length > 0 && (
        <div className="wrap">
          <table>
            <caption>{t.dueCaption}</caption>
            <thead>
              <tr><th>{t.colName}</th><th>{t.colCode}</th><th className="num">{t.colDaysLeft}</th><th>{t.colPeriodEnd}</th><th>{t.colCountry}</th></tr>
            </thead>
            <tbody>
              {due.map((c) => (
                <tr key={c.id}>
                  <td>{name(c)}</td>
                  <td className="mono">{formatCode(c.code)}</td>
                  <td className="num">{t.daysLeft(c.daysLeft ?? 0)}</td>
                  <td>{end(c)}</td>
                  <td>{countryName(c.country, viewer.lang)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {all.length === 0 ? (
        <p>{t.noClients}</p>
      ) : (
        <div className="wrap">
          <table>
            <caption>{t.allCaption} ({all.length})</caption>
            <thead>
              <tr><th>{t.colName}</th><th>{t.colCode}</th><th>{t.colCountry}</th><th>{t.colRegion}</th><th>{t.colStatus}</th><th>{t.colPeriodEnd}</th></tr>
            </thead>
            <tbody>
              {all.map((c) => (
                <tr key={c.id}>
                  <td>{name(c)}</td>
                  <td className="mono">{formatCode(c.code)}</td>
                  <td>{countryName(c.country, viewer.lang)}</td>
                  <td>{c.adminRegion ?? ""}</td>
                  <td><span className={`chip s-${c.status}`}>{statusLabel(c.status, t)}</span></td>
                  <td>{end(c)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Page>
  );
}
