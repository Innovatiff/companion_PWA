/**
 * One client: details, the payment history, "Marcar renovación pagada", and
 * voiding a payment (a second, confirming step with a required reason).
 */
import type { GetServerSideProps } from "next";
import { asPerson } from "@leamington/shared/src/server/db.ts";
import { formatCode } from "@leamington/shared/src/code.ts";
import { formatDate, formatDateTime, formatMoney } from "@leamington/shared/src/format.ts";
import { ownerPage, plain, type Viewer } from "../../../lib/server.ts";
import { isUuid, percentLabel, q1 } from "../../../lib/rules.ts";
import { strings } from "../../../lib/i18n.ts";
import { Page, Chip, Note, StatusChip } from "../../../lib/ui.tsx";

export const config = { unstable_runtimeJS: false };

type Client = {
  client_id: string; full_name: string; code: string; country: string; language: string; admin_region: string | null;
  municipality: string | null; status: string; period_end: string | null; days_left: number | null; is_test: boolean;
  active: boolean; created_at: string; last_seen_at: string | null; affiliate_id: string; affiliate_name: string;
  is_house: boolean; affiliate_is_test: boolean; team: string | null;
};
type Sub = {
  id: string; kind: string; amount: string; commission: string; rate: string | null; period_start: string; period_end: string;
  paid_at: string | null; voided_at: string | null; void_reason: string | null; affiliate_name: string | null;
  collected_by_affiliate_id: string | null; collector_name: string | null; reactivation: boolean; lapsed_days: number | null;
};
type Props = {
  viewer: Viewer; client: Client; subs: Sub[]; voidId: string | null; ok: string | null; end: string | null; re: boolean; error: string | null;
};

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const g = await ownerPage(ctx);
  if ("redirect" in g) return g;
  const id = q1(ctx.query.id);
  if (!isUuid(id)) return { notFound: true };
  const data = await asPerson(g.person.authUserId, async (q) => {
    const c = await q.query(
      `select cs.client_id, cs.full_name, cs.code, cs.country::text as country, cs.language::text as language,
              cs.admin_region, cs.municipality, cs.status, cs.period_end::text as period_end, cs.days_left,
              cs.is_test, cs.active, cs.created_at, cs.last_seen_at,
              a.id as affiliate_id, a.name as affiliate_name, a.is_house, a.is_test as affiliate_is_test, t.name as team
         from client_status cs
         join clients c on c.id = cs.client_id
         join affiliates a on a.id = cs.affiliate_id
         left join teams t on t.id = c.team_id
        where cs.client_id = $1`, [id]);
    if (!c.rows[0]) return null;
    const s = await q.query(
      `select s.id, s.kind, s.amount::text as amount, s.affiliate_payout::text as commission, s.commission_rate::text as rate,
              s.period_start::text as period_start, s.period_end::text as period_end, s.paid_at, s.voided_at, s.void_reason,
              a.name as affiliate_name, s.collected_by_affiliate_id, ca.name as collector_name, s.reactivation, s.lapsed_days
         from subscriptions s
         left join affiliates a on a.id = s.affiliate_id
         left join affiliates ca on ca.id = s.collected_by_affiliate_id
        where s.client_id = $1
        order by s.period_start desc, s.created_at desc`, [id]);
    return { client: c.rows[0] as Client, subs: s.rows as Sub[] };
  });
  if (!data) return { notFound: true };
  const voidId = q1(ctx.query.void);
  return {
    props: plain({
      viewer: g.viewer, ...data,
      voidId: data.subs.some((s) => s.id === voidId && !s.voided_at) ? voidId : null,
      ok: q1(ctx.query.ok) || null, end: /^\d{4}-\d{2}-\d{2}$/.test(q1(ctx.query.end)) ? q1(ctx.query.end) : null,
      re: q1(ctx.query.re) === "1", error: q1(ctx.query.e) || null,
    }),
  };
};

export default function ClientPage({ viewer, client: c, subs, voidId, ok, end, re, error }: Props) {
  const t = strings(viewer.lang);
  const k = t.client;
  const lang = viewer.lang;
  const voiding = subs.find((s) => s.id === voidId);
  return (
    <Page viewer={viewer} section="clients" title={c.full_name}>
      {ok === "renewed" && end && <Note>{(re ? k.reactivated : k.renewed)(formatDate(end, lang, true))}</Note>}
      {ok === "voided" && <Note>{k.voidedOk}</Note>}
      {error && error !== "reason" && <Note kind="bad">{k.errors[error] ?? k.errors.invalid}</Note>}

      <p>
        <StatusChip status={c.status} daysLeft={c.days_left} lang={lang} />{" "}
        {c.is_test && <Chip kind="test">{t.chip.test}</Chip>}{" "}
        {!c.active && <Chip kind="unk">{t.chip.inactive}</Chip>}
      </p>
      <h2>{k.details}</h2>
      <dl className="kv">
        <dt>{t.clients.code}</dt><dd className="nums">{formatCode(c.code)} · <a href={`/clients/${c.client_id}/code`}>{k.viewCode}</a></dd>
        <dt>{k.affiliate}</dt>
        <dd>
          <a href={`/affiliates/${c.affiliate_id}`}>{c.affiliate_name}</a>
          {c.is_house ? ` (${t.chip.house})` : ""}{c.affiliate_is_test ? ` (${t.chip.test})` : ""}
        </dd>
        <dt>{k.country}</dt><dd>{t.country[c.country] ?? c.country}</dd>
        <dt>{t.region[c.country] ?? t.clients.regionCol}</dt><dd>{c.admin_region ?? t.dash}</dd>
        <dt>{k.municipality}</dt><dd>{c.municipality ?? t.dash}</dd>
        <dt>{k.team}</dt><dd>{c.team ?? t.dash}</dd>
        <dt>{k.language}</dt><dd>{k.langName[c.language] ?? c.language}</dd>
        <dt>{k.periodEnd}</dt><dd>{c.period_end ? formatDate(c.period_end, lang, true) : t.dash}</dd>
        <dt>{k.created}</dt><dd>{formatDateTime(c.created_at, lang)}</dd>
        <dt>{k.lastSeen}</dt><dd>{c.last_seen_at ? formatDateTime(c.last_seen_at, lang) : t.dash}</dd>
      </dl>

      <form method="post" action="/api/clients/renew" className="narrow">
        <input type="hidden" name="client_id" value={c.client_id} />
        <input type="hidden" name="expect_end" value={c.period_end ?? "none"} />
        <input type="hidden" name="back" value={`/clients/${c.client_id}`} />
        <button type="submit">{k.renew}</button>
        <p className="hint"><small>{k.renewNote}</small></p>
      </form>

      {voiding && (
        <div className="panel danger narrow" id="void">
          <h2>{k.voidTitle}</h2>
          <p>
            {t.kind[voiding.kind] ?? voiding.kind} · {formatMoney(voiding.amount)} ·{" "}
            {formatDate(voiding.period_start, lang, true)} – {formatDate(voiding.period_end, lang, true)}
          </p>
          <p><small>{k.voidNote}</small></p>
          <form method="post" action="/api/clients/void">
            <input type="hidden" name="client_id" value={c.client_id} />
            <input type="hidden" name="subscription_id" value={voiding.id} />
            <label htmlFor="reason">{k.reason}</label>
            <input id="reason" name="reason" required maxLength={200} autoComplete="off"
                   aria-describedby={error === "reason" ? "reason-err" : undefined} />
            {error === "reason" && <p className="err hint" id="reason-err">{k.errors.reason}</p>}
            <div className="actions">
              <button type="submit">{k.voidConfirm}</button>
              <a className="button secondary" href={`/clients/${c.client_id}`}>{t.cancel}</a>
            </div>
          </form>
        </div>
      )}

      <div className="wrap">
        <table>
          <caption>{k.history}</caption>
          <thead>
            <tr>
              <th scope="col">{k.kind}</th><th scope="col" className="num">{k.amount}</th>
              <th scope="col" className="num">{k.commission}</th><th scope="col">{k.period}</th>
              <th scope="col">{k.paid}</th><th scope="col">{k.collector}</th><th scope="col">{k.voided}</th>
            </tr>
          </thead>
          <tbody>
            {subs.map((s) => (
              <tr key={s.id}>
                <th scope="row">
                  {t.kind[s.kind] ?? s.kind}
                  {s.reactivation && <> <Chip kind="good">{t.reactivation(s.lapsed_days)}</Chip></>}
                  <br /><small>{s.affiliate_name ?? t.dash}</small>
                </th>
                <td className="num">{formatMoney(s.amount)}</td>
                <td className="num">{formatMoney(s.commission)}{s.rate !== null && <><br /><small>{percentLabel(s.rate)}</small></>}</td>
                <td>{formatDate(s.period_start, lang, true)} – {formatDate(s.period_end, lang, true)}</td>
                <td>{s.paid_at ? formatDateTime(s.paid_at, lang) : t.dash}</td>
                <td>{!s.paid_at ? t.dash : s.collected_by_affiliate_id ? s.collector_name ?? t.dash : t.owner}</td>
                <td>
                  {s.voided_at ? (
                    <><Chip kind="bad">{t.chip.voided}</Chip> {formatDateTime(s.voided_at, lang)}<br /><small>{s.void_reason}</small></>
                  ) : s.paid_at ? (
                    <a href={`/clients/${c.client_id}?void=${s.id}#void`}>{k.void}</a>
                  ) : t.dash}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Page>
  );
}
