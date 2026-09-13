/**
 * Cobro y registro de renovaciones (0029): where renewals are collected vs who
 * earns on them.
 *   Cobro vs comisión  renewal_collection_by_affiliate, one row per affiliate;
 *                      test affiliates last, the house affiliate as "Directo"
 *   Registro           renewal_log, newest first, the latest 200, voided included
 *                      and marked
 */
import type { GetServerSideProps } from "next";
import { asPerson } from "@leamington/shared/src/server/db.ts";
import { formatCode } from "@leamington/shared/src/code.ts";
import { formatDateTime, formatMoney } from "@leamington/shared/src/format.ts";
import { ownerPage, plain, type Viewer } from "../../lib/server.ts";
import { collectedByOtherAffiliate, collectorLabel, sortAffiliateGroups, toCents } from "../../lib/rules.ts";
import { strings } from "../../lib/i18n.ts";
import { Page, Chip } from "../../lib/ui.tsx";

export const config = { unstable_runtimeJS: false };

const LOG_LIMIT = 200;

type Collection = {
  affiliate_id: string; name: string; active: boolean; is_test: boolean; is_house: boolean;
  renewals_collected: number; collected_for_others: number; cash_collected: string;
  renewals_earned: number; earned_collected_by_others: number; renewal_commission: string;
};
type LogRow = {
  subscription_id: string; paid_at: string; client_id: string; full_name: string; code: string; is_test: boolean;
  amount: string; commission: string; earning_affiliate: string | null; earner_is_house: boolean;
  collecting_affiliate: string | null; collected_by_owner: boolean; collected_by_other: boolean;
  reactivation: boolean; lapsed_days: number | null; voided_at: string | null; void_reason: string | null;
};
type Props = { viewer: Viewer; collection: Collection[]; log: LogRow[] };

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const g = await ownerPage(ctx);
  if ("redirect" in g) return g;
  const data = await asPerson(g.person.authUserId, async (q) => {
    const c = await q.query(
      `select affiliate_id, name, active, is_test, is_house, renewals_collected::int, collected_for_others::int,
              cash_collected::text, renewals_earned::int, earned_collected_by_others::int, renewal_commission::text
         from renewal_collection_by_affiliate`);
    const l = await q.query(
      `select l.subscription_id, l.paid_at, l.client_id, l.full_name, l.code, l.is_test, l.amount::text, l.commission::text,
              l.earning_affiliate, coalesce(ea.is_house, false) as earner_is_house,
              l.collecting_affiliate, l.collected_by_owner, l.collected_by_other, l.reactivation, l.lapsed_days,
              l.voided_at, l.void_reason
         from renewal_log l left join affiliates ea on ea.id = l.earning_affiliate_id
        order by l.paid_at desc, l.subscription_id limit ${LOG_LIMIT}`);
    const collection = sortAffiliateGroups(c.rows as Collection[],
      (a, b) => toCents(b.cash_collected) - toCents(a.cash_collected) || b.renewals_earned - a.renewals_earned);
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
                <th scope="col" className="num">{k.collected}</th><th scope="col" className="num">{k.forOthers}</th>
                <th scope="col" className="num">{k.cash}</th><th scope="col" className="num">{k.earned}</th>
                <th scope="col" className="num">{k.byOthers}</th><th scope="col" className="num">{k.commission}</th>
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
                  <td className="num">{r.collected_for_others}</td>
                  <td className="num">{formatMoney(r.cash_collected)}</td>
                  <td className="num">{r.renewals_earned}</td>
                  <td className="num">{r.earned_collected_by_others}</td>
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
                  <th scope="col">{k.date}</th><th scope="col">{k.client}</th><th scope="col">{k.collector}</th>
                  <th scope="col">{k.earner}</th><th scope="col" className="num">{k.amount}</th>
                  <th scope="col" className="num">{k.commissionCol}</th><th scope="col">{k.marks}</th>
                </tr>
              </thead>
              <tbody>
                {log.map((r) => (
                  <tr key={r.subscription_id}>
                    <th scope="row">{formatDateTime(r.paid_at, lang)}</th>
                    <td>
                      <a href={`/clients/${r.client_id}`}>{r.full_name}</a>{" "}
                      {r.is_test && <Chip kind="test">{t.chip.test}</Chip>}
                      <br /><small className="nums">{formatCode(r.code)}</small>
                    </td>
                    <td>{collectorLabel(r, t.owner)}</td>
                    <td>{r.earner_is_house ? t.chip.house : r.earning_affiliate ?? t.dash}</td>
                    <td className="num">{formatMoney(r.amount)}</td>
                    <td className="num">{formatMoney(r.commission)}</td>
                    <td>
                      {r.reactivation && <Chip kind="good">{t.reactivation(r.lapsed_days)}</Chip>}{" "}
                      {collectedByOtherAffiliate(r) && <Chip>{k.byOther}</Chip>}{" "}
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
