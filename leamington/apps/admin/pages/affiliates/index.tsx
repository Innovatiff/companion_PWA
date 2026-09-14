/** Afiliados: commission, active, sales, what each is owed, and the lapse rate of their clients. */
import type { GetServerSideProps } from "next";
import { asPerson } from "@leamington/shared/src/server/db.ts";
import { formatMoney } from "@leamington/shared/src/format.ts";
import { ownerPage, plain, type Viewer } from "../../lib/server.ts";
import { lapseRateLabel, percentLabel } from "../../lib/rules.ts";
import { strings } from "../../lib/i18n.ts";
import { Page, Card, HeroAction, Chip, Desc } from "../../lib/ui.tsx";

export const config = { unstable_runtimeJS: false };

type Row = {
  affiliate_id: string; name: string; business_name: string | null; active: boolean; is_test: boolean; is_house: boolean;
  rate: string; sales: number; renewals: number; earned: string; paid_out: string; owed: string; lapse_rate: string | null;
};
type Props = { viewer: Viewer; rows: Row[] };

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const g = await ownerPage(ctx);
  if ("redirect" in g) return g;
  const rows = await asPerson(g.person.authUserId, async (q) => (await q.query(
    `select e.affiliate_id, e.name, a.business_name, e.active, e.is_test, e.is_house, e.commission_rate::text as rate,
            e.sales::int, e.renewals::int, e.earned::text, e.paid_out::text, e.owed::text, l.lapse_rate::text as lapse_rate
       from affiliate_earnings e join affiliates a on a.id = e.affiliate_id
       left join affiliate_lapse_rate l on l.affiliate_id = e.affiliate_id
      order by e.is_test, e.is_house, not e.active, e.name`)).rows as Row[]);
  return { props: plain({ viewer: g.viewer, rows }) };
};

export default function Affiliates({ viewer, rows }: Props) {
  const t = strings(viewer.lang);
  const a = t.affiliates;
  return (
    <Page viewer={viewer} section="affiliates" title={a.title} subtitle={a.subtitle}
          action={<HeroAction href="/affiliates/new">{a.add}</HeroAction>}>
      <Card title={a.listTitle}>
        <Desc>{a.caption}</Desc>
        <div className="wrap">
          <table>
            <caption className="sr">{a.listTitle}</caption>
            <thead>
              <tr>
                <th scope="col">{a.name}</th><th scope="col" className="num">{a.commission}</th><th scope="col">{a.active}</th>
                <th scope="col" className="num">{a.sales}</th><th scope="col" className="num">{a.renewals}</th>
                <th scope="col" className="num">{a.earned}</th><th scope="col" className="num">{a.paidOut}</th>
                <th scope="col" className="num">{a.owed}</th><th scope="col" className="num">{a.lapse}</th>
                <th scope="col"><span className="sr">{t.view}</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const lapse = lapseRateLabel(r.lapse_rate);
                return (
                  <tr key={r.affiliate_id}>
                    <th scope="row">
                      <a href={`/affiliates/${r.affiliate_id}`}>{r.name}</a>{" "}
                      {r.is_house && <Chip>{t.chip.house}</Chip>}{" "}
                      {r.is_test && <Chip kind="test">{t.chip.test}</Chip>}
                      {r.business_name && <><br /><small>{r.business_name}</small></>}
                    </th>
                    <td className="num">{percentLabel(r.rate)}</td>
                    <td>{r.active ? a.yes : <Chip kind="unk">{t.chip.inactive}</Chip>}</td>
                    <td className="num">{r.sales}</td>
                    <td className="num">{r.renewals}</td>
                    <td className="num">{formatMoney(r.earned)}</td>
                    <td className="num">{formatMoney(r.paid_out)}</td>
                    <td className="num"><b>{formatMoney(r.owed)}</b></td>
                    {lapse ? <td className="num">{lapse}</td> : <td className="num"><small>{t.renewals.nobodyYet}</small></td>}
                    <td className="num"><a className="pill" href={`/affiliates/${r.affiliate_id}`}>{t.view}</a></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </Page>
  );
}
