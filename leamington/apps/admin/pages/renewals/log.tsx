/**
 * Cobro y registro de renovaciones. Since 0031 a renewal's commission goes to
 * the business that collects it; the client stays registered to the business
 * that registered them, which keeps the registration commission.
 *   Cobro vs comisión  renewal_collection_by_affiliate: which businesses win
 *                      renewals (own clients and other businesses' clients),
 *                      and whose clients renew elsewhere or with the owner;
 *                      test affiliates last, the house affiliate as "Directo"
 *   Registro           renewal_log, newest first, the latest 200, voided included
 *                      and marked
 */
import type { GetServerSideProps } from "next";
import { asPerson } from "@leamington/shared/src/server/db.ts";
import { formatCode } from "@leamington/shared/src/code.ts";
import { formatDateTime, formatMoney } from "@leamington/shared/src/format.ts";
import { ownerPage, plain, type Viewer } from "../../lib/server.ts";
import { collectorLabel, sortAffiliateGroups, toCents } from "../../lib/rules.ts";
import { strings } from "../../lib/i18n.ts";
import { Page, Chip } from "../../lib/ui.tsx";

export const config = { unstable_runtimeJS: false };

const LOG_LIMIT = 200;

type Collection = {
  affiliate_id: string; name: string; active: boolean; is_test: boolean; is_house: boolean;
  renewals_collected: number; renewals_own_clients: number; renewals_other_clients: number;
  own_clients_renewed_elsewhere: number; own_clients_renewed_by_owner: number;
  cash_collected: string; renewal_commission: string;
};
type LogRow = {
  subscription_id: string; paid_at: string; client_id: string; full_name: string; code: string; is_test: boolean;
  amount: string; commission: string; registered_by_affiliate: string | null; registrant_is_house: boolean;
  collecting_affiliate: string | null; collected_by_owner: boolean; renewed_elsewhere: boolean;
  reactivation: boolean; lapsed_days: number | null; voided_at: string | null; void_reason: string | null;
};
type Props = { viewer: Viewer; collection: Collection[]; log: LogRow[] };

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const g = await ownerPage(ctx);
  if ("redirect" in g) return g;
  const data = await asPerson(g.person.authUserId, async (q) => {
    const c = await q.query(
      `select affiliate_id, name, active, is_test, is_house, renewals_collected::int, renewals_own_clients::int,
              renewals_other_clients::int, own_clients_renewed_elsewhere::int, own_clients_renewed_by_owner::int,
              cash_collected::text, renewal_commission::text
         from renewal_collection_by_affiliate`);
    const l = await q.query(
      `select l.subscription_id, l.paid_at, l.client_id, l.full_name, l.code, l.is_test, l.amount::text, l.commission::text,
              l.registered_by_affiliate, coalesce(ra.is_house, false) as registrant_is_house,
              l.collecting_affiliate, l.collected_by_owner, l.renewed_elsewhere, l.reactivation, l.lapsed_days,
              l.voided_at, l.void_reason
         from renewal_log l left join affiliates ra on ra.id = l.registered_by_affiliate_id
        order by l.paid_at desc, l.subscription_id limit ${LOG_LIMIT}`);
    const collection = sortAffiliateGroups(c.rows as Collection[],
      (a, b) => b.renewals_collected - a.renewals_collected || toCents(b.cash_collected) - toCents(a.cash_collected));
    return { collection, log: l.rows as LogRow[] };
  });
  return { props: plain({ viewer: g.viewer, ...data }) };
};

export default function RenewalLog({ viewer, collection, log }: Props) {
  const t = strings(viewer.lang);
  const k = t.renewalLog;
  const lang = viewer.lang;
  return (
    <Page viewer={viewer} section="renewals" title={k.title}>
      <p><a href="/renewals">{k.back}</a></p>

      <section id="collection">
        <div className="wrap">
          <table>
            <caption>{k.collectionCaption}<br /><small>{k.collectionNote}</small></caption>
            <thead>
              <tr>
                <th scope="col">{k.affiliate}</th>
                <th scope="col" className="num">{k.collected}</th><th scope="col" className="num">{k.own}</th>
                <th scope="col" className="num">{k.other}</th><th scope="col" className="num">{k.elsewhere}</th>
                <th scope="col" className="num">{k.byOwner}</th><th scope="col" className="num">{k.cash}</th>
                <th scope="col" className="num">{k.commission}</th>
              </tr>
            </thead>
            <tbody>
              {collection.map((r) => (
                <tr key={r.affiliate_id}>
                  <th scope="row">
                    <a href={`/affiliates/${r.affiliate_id}`}>{r.is_house ? t.chip.house : r.name}</a>{" "}
                    {!r.active && <Chip kind="unk">{t.chip.inactive}</Chip>}{" "}
                    {r.is_test && <Chip kind="test">{t.chip.test}</Chip>}
                  </th>
                  <td className="num">{r.renewals_collected}</td>
                  <td className="num">{r.renewals_own_clients}</td>
                  <td className="num">{r.renewals_other_clients}</td>
                  <td className="num">{r.own_clients_renewed_elsewhere}</td>
                  <td className="num">{r.own_clients_renewed_by_owner}</td>
                  <td className="num">{formatMoney(r.cash_collected)}</td>
                  <td className="num">{formatMoney(r.renewal_commission)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p><small>{t.home.testNote}</small></p>
      </section>

      <section id="log">
        {log.length === 0 ? <><h2>{k.logCaption(LOG_LIMIT)}</h2><p>{k.emptyLog}</p></> : (
          <div className="wrap">
            <table>
              <caption>{k.logCaption(LOG_LIMIT)}</caption>
              <thead>
                <tr>
                  <th scope="col">{k.date}</th><th scope="col">{k.client}</th><th scope="col">{k.code}</th>
                  <th scope="col">{k.registeredBy}</th><th scope="col">{k.earner}</th>
                  <th scope="col" className="num">{k.amount}</th><th scope="col" className="num">{k.commissionCol}</th>
                  <th scope="col">{k.marks}</th>
                </tr>
              </thead>
              <tbody>
                {log.map((r) => (
                  <tr key={r.subscription_id}>
                    <th scope="row">{formatDateTime(r.paid_at, lang)}</th>
                    <td>
                      <a href={`/clients/${r.client_id}`}>{r.full_name}</a>{" "}
                      {r.is_test && <Chip kind="test">{t.chip.test}</Chip>}
                    </td>
                    <td className="nums">{formatCode(r.code)}</td>
                    <td>{r.registrant_is_house ? t.chip.house : r.registered_by_affiliate ?? t.dash}</td>
                    <td>{collectorLabel(r, t.ownerNoCommission)}</td>
                    <td className="num">{formatMoney(r.amount)}</td>
                    <td className="num">{formatMoney(r.commission)}</td>
                    <td>
                      {r.renewed_elsewhere && <Chip>{k.elsewhereChip}</Chip>}{" "}
                      {r.reactivation && <Chip kind="good">{t.reactivation(r.lapsed_days)}</Chip>}{" "}
                      {r.voided_at && <><Chip kind="bad">{t.chip.voided}</Chip> <small>{r.void_reason}</small></>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </Page>
  );
}
