/**
 * Renew, step 3: the receipt, from app.renewal_receipt by request key.
 *
 * Only the business that collected (and so earns, 0031) gets a receipt; anyone
 * else, including the business that registered the client, gets 404. Printable like the code page: the print stylesheet
 * keeps the client's name, code and paid-until line, in the client's language.
 */
import type { GetServerSideProps } from "next";
import { requirePerson } from "@leamington/shared/src/server/portal.ts";
import { asPerson } from "@leamington/shared/src/server/db.ts";
import { formatCode } from "@leamington/shared/src/code.ts";
import { formatDate, formatDateTime, formatMoney } from "@leamington/shared/src/format.ts";
import { Page, setPageLang, viewerOf, type Viewer } from "../../../lib/layout.tsx";
import { strings } from "../../../lib/strings.ts";
import { isUuid } from "../../../lib/clients.ts";
import { commissionLabel, registeredByLabel, slipLang, type Registrant } from "../../../lib/renew.ts";

export const config = { unstable_runtimeJS: false };

type Receipt = {
  paid_at: string;
  full_name: string;
  code: string;
  country: string;
  period_start: string;
  period_end: string;
  amount: number | string;
  commission: number | string;
  reactivation: boolean;
  voided: boolean;
  earning_affiliate: { name: string; is_you: boolean };
  registered_by: Registrant;
  collected_by_you: boolean;
  status_now: string;
};

type Props = { viewer: Viewer; r: Receipt };

export const getServerSideProps: GetServerSideProps<Props> = async ({ req, res, params }) => {
  res.setHeader("Cache-Control", "private, no-store");
  const auth = await requirePerson(req, "affiliate");
  if (!auth.person) return { redirect: auth.redirect };
  const person = auth.person;
  setPageLang(req, person.language);

  const key = params?.key;
  if (!isUuid(key)) return { notFound: true };
  const r = await asPerson(person.authUserId, async (q) =>
    (await q.query("select app.renewal_receipt($1::uuid) as r", [key])).rows[0]?.r as Receipt | null);
  if (!r) return { notFound: true };
  return { props: { viewer: viewerOf(person), r } };
};

export default function RenewDone({ viewer, r }: Props) {
  const t = strings(viewer.lang);
  const lang = viewer.lang;
  const day = (d: string) => formatDate(d, lang, true);
  const client = slipLang(r.country);
  const tc = strings(client);
  const printButton = `<button type="button" class="secondary" onclick="print()">${t.print}</button>`;
  // The collecting business earns (0031); a receipt seen by anyone else carries no commission for them.
  const commission = r.earning_affiliate.is_you ? commissionLabel(r.commission, t) : t.noCommission;

  return (
    <Page title={r.voided ? t.voidedTitle : t.renewedTitle} viewer={viewer} nav="renew">
      <div className="narrow">
        <div className="noprint">
          <h1>{r.voided ? t.voidedTitle : t.renewedTitle}</h1>
          {r.voided && <p className="err" role="alert">{t.voidedNote}</p>}
          <p className="big">{t.newPeriod(day(r.period_start), day(r.period_end))}</p>
          {!r.voided && (r.status_now === "active" || r.status_now === "due") && <p className="ok big">{t.accountActive}</p>}
          {r.reactivation && <p>{t.reactivated}</p>}
          <p className="note">
            {commission}<br />
            {registeredByLabel(r.registered_by, t)}<br />
            {r.collected_by_you && <>{t.collectedByYou}<br /></>}
            {t.amountPaid(formatMoney(r.amount))}<br />
            {t.paidAt(formatDateTime(r.paid_at, lang))}
          </p>
        </div>

        <p className="who">{r.full_name}</p>
        <div className="code" aria-label={`${t.codeFor} ${r.full_name}`}>{formatCode(r.code)}</div>
        <p lang={client}>
          {tc.periodEnds}: <b>{formatDate(r.period_end, client, true)}</b><br />
          {formatMoney(r.amount)} · {formatDateTime(r.paid_at, client)}
        </p>

        <div className="noprint" dangerouslySetInnerHTML={{ __html: printButton }} />
        <div className="actions noprint">
          <a className="button" href="/renew">{t.renewAnother}</a>
          <a className="button secondary" href="/">{t.backToClients}</a>
        </div>
      </div>
    </Page>
  );
}
