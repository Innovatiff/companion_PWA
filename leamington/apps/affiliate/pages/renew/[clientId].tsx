/**
 * Renew, step 2: what the affiliate needs to see before taking $20.
 *
 * From app.renewal_status: who the client is, where their period stands, who
 * registered them (information only), exactly which period this payment buys,
 * and this business's commission on it: whoever collects a renewal earns it
 * (0031). Any active affiliate can open any client found by code; the client id
 * alone is a uuid nobody types.
 *
 * The form carries a request key generated here, once per render, so a double
 * tap records one renewal. A renewal in the last 10 minutes (or ?recent=1 from a
 * refused attempt) shows a warning and a required confirmation box.
 */
import { randomUUID } from "node:crypto";
import type { GetServerSideProps } from "next";
import { requirePerson } from "@leamington/shared/src/server/portal.ts";
import { asPerson } from "@leamington/shared/src/server/db.ts";
import { formatCode } from "@leamington/shared/src/code.ts";
import { formatDate, formatDateTime, formatMoney } from "@leamington/shared/src/format.ts";
import { Card, Hero, HeroAction } from "@leamington/shared/src/ui/Portal.tsx";
import { Page, setPageLang, viewerOf, type Viewer } from "../../lib/layout.tsx";
import { strings } from "../../lib/strings.ts";
import { countryName, isUuid, statusTone } from "../../lib/clients.ts";
import {
  commissionLabel, periodPlacement, refusedAffiliate, registrantName, renewStatusLabel, type Registrant,
} from "../../lib/renew.ts";

export const config = { unstable_runtimeJS: false };

type Status = {
  client_id: string;
  full_name: string;
  code: string;
  country: string;
  client_active: boolean;
  is_test: boolean;
  status: string;
  period_start: string | null;
  period_end: string | null;
  days_left: number | null;
  original_affiliate: Registrant & { active: boolean };
  amount: number | string;
  your_commission: number | string;
  next_period_start: string;
  next_period_end: string;
  recent_renewal: { paid_at: string; period_end: string; collected_by_you: boolean } | null;
};

type Props = { viewer: Viewer; s: Status; requestKey: string; recent: boolean };

export const getServerSideProps: GetServerSideProps<Props> = async ({ req, res, params, query }) => {
  res.setHeader("Cache-Control", "private, no-store");
  const auth = await requirePerson(req, "affiliate");
  if (!auth.person) return { redirect: auth.redirect };
  const person = auth.person;
  setPageLang(req, person.language);

  const clientId = params?.clientId;
  if (!isUuid(clientId)) return { notFound: true };

  let s: Status | null | undefined;
  try {
    s = await asPerson(person.authUserId, async (q) =>
      (await q.query("select app.renewal_status($1::uuid) as s", [clientId])).rows[0]?.s);
  } catch (err) {
    if (refusedAffiliate(err)) return { redirect: { destination: "/login", permanent: false } };
    throw err;
  }
  if (!s) return { notFound: true };
  return { props: { viewer: viewerOf(person), s, requestKey: randomUUID(), recent: query.recent === "1" } };
};

export default function RenewClient({ viewer, s, requestKey, recent }: Props) {
  const t = strings(viewer.lang);
  const lang = viewer.lang;
  const day = (d: string) => formatDate(d, lang, true);
  const placement = periodPlacement(s.status);
  const warn = Boolean(s.recent_renewal) || recent;

  return (
    <Page title={t.renewTitle} viewer={viewer} nav="renew">
      <Hero title={t.renewTitle} subtitle={t.renewStatusSub}
            action={<HeroAction href="/renew" icon="search">{t.findAnother}</HeroAction>} />
      <div className="grid">
        <Card title={<>{s.full_name}{s.is_test && <> <span className="chip test">{t.test}</span></>}</>}>
          <ul className="list rows">
            <li><span>{t.colStatus}</span><span className={`chip ${statusTone(s.status)}`}>{renewStatusLabel(s.status, s.days_left, t)}</span></li>
            {s.period_end && <li><span>{t.periodEnds}</span><b>{day(s.period_end)}</b></li>}
            <li><span>{t.colCountry}</span><span>{countryName(s.country, lang)}</span></li>
            <li><span>{t.colCode}</span><span className="mono">{formatCode(s.code)}</span></li>
            <li><span>{t.colRegisteredBy}</span><span>{registrantName(s.original_affiliate, t)}</span></li>
          </ul>
        </Card>

        {!s.client_active ? (
          <p className="note bad" role="alert">{t.clientInactive}</p>
        ) : (
          <Card title={t.whatItBuys}>
            <p className="note big">{commissionLabel(s.your_commission, t)}</p>
            <p className="big">{t.newPeriod(day(s.next_period_start), day(s.next_period_end))}</p>
            <p className="muted">{placement === "lapsed" ? t.startsTodayLapsed : placement === "none" ? t.startsTodayNone : t.extendsFromEnd}</p>

            <form method="post" action="/api/renew/record">
              <input type="hidden" name="client_id" value={s.client_id} />
              <input type="hidden" name="request_key" value={requestKey} />
              {warn && (
                <div className="note warn" role="alert">
                  <p>
                    {s.recent_renewal
                      ? t.recentWarning(formatDateTime(s.recent_renewal.paid_at, lang), day(s.recent_renewal.period_end), s.recent_renewal.collected_by_you)
                      : t.recentWarningGeneric}
                  </p>
                  <label className="choice">
                    <input type="checkbox" name="confirm_repeat" value="1" required />
                    {t.confirmRepeat}
                  </label>
                </div>
              )}
              <p className="muted">{t.renewNote}</p>
              <button type="submit" className="block big">{t.collectButton(formatMoney(s.amount))}</button>
            </form>
          </Card>
        )}
      </div>
    </Page>
  );
}
