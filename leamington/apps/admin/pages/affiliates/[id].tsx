/**
 * One affiliate: the one-time setup link (shown once, right after creating or
 * resetting), account, money, and the owner's actions: deactivate/reactivate,
 * commission, reset sign-in, record a payout. Destructive actions take a second
 * confirming step.
 *
 * The sign-in name and last sign-in come from portal_logins, which has no RLS
 * policy for anyone; it is read with the server connection, and only after the
 * owner check above has passed.
 */
import type { GetServerSideProps } from "next";
import { asPerson, db } from "@leamington/shared/src/server/db.ts";
import { cookieValue } from "@leamington/shared/src/server/session.ts";
import { formatDateTime, formatMoney } from "@leamington/shared/src/format.ts";
import { ownerPage, plain, type Viewer } from "../../lib/server.ts";
import { isUuid, percentLabel, percentInput, readFlash, setupLink, q1 } from "../../lib/rules.ts";
import { FLASH_COOKIE, clearedFlash } from "../../lib/flash.ts";
import { strings } from "../../lib/i18n.ts";
import { Page, Chip, Note, Stat } from "../../lib/ui.tsx";

export const config = { unstable_runtimeJS: false };

type Affiliate = {
  id: string; name: string; business_name: string | null; contact: string | null; rate: string; active: boolean;
  is_test: boolean; is_house: boolean; created_at: string; sales: number; renewals: number;
  earned: string; earned_this_month: string; paid_out: string; owed: string;
  sales_earned: string; renewals_earned: string; renewals_by_others: number; renewals_by_others_earned: string;
  collected_for_others: number; cash_collected: string;
};
type Payout = { id: string; amount: string; paid_at: string; method: string | null; note: string | null; voided_at: string | null; void_reason: string | null };
type Sale = { id: string; kind: string; amount: string; commission: string; paid_at: string; voided_at: string | null; client_id: string; full_name: string; is_test: boolean };
type Login = { login: string; last_login_at: string | null; setup_pending: boolean; active: boolean } | null;
type Props = {
  viewer: Viewer; a: Affiliate; payouts: Payout[]; sales: Sale[]; lastPayout: string; login: Login;
  setupUrl: string | null; confirm: string | null; ok: string | null; error: string | null;
};

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const g = await ownerPage(ctx);
  if ("redirect" in g) return g;
  const id = q1(ctx.query.id);
  if (!isUuid(id)) return { notFound: true };
  const data = await asPerson(g.person.authUserId, async (q) => {
    const a = await q.query(
      `select a.id, a.name, a.business_name, a.contact, a.commission_rate::text as rate, a.active, a.is_test, a.is_house, a.created_at,
              e.sales::int, e.renewals::int, e.earned::text, e.earned_this_month::text, e.paid_out::text, e.owed::text,
              e.sales_earned::text, e.renewals_earned::text, e.renewals_by_others::int, e.renewals_by_others_earned::text,
              rc.collected_for_others::int, rc.cash_collected::text
         from affiliates a
         join affiliate_earnings e on e.affiliate_id = a.id
         join renewal_collection_by_affiliate rc on rc.affiliate_id = a.id
        where a.id = $1`, [id]);
    if (!a.rows[0]) return null;
    const p = await q.query(
      `select id::text, amount::text, paid_at, method, note, voided_at, void_reason
         from affiliate_payouts where affiliate_id = $1 order by paid_at desc, id desc`, [id]);
    const s = await q.query(
      `select s.id, s.kind, s.amount::text, s.affiliate_payout::text as commission, s.paid_at, s.voided_at,
              c.id as client_id, c.full_name, c.is_test
         from subscriptions s join clients c on c.id = s.client_id
        where s.affiliate_id = $1 and s.paid_at is not null
        order by s.paid_at desc limit 100`, [id]);
    const last = p.rows.reduce((m: number, r: Payout) => Math.max(m, Number(r.id)), 0);
    return { a: a.rows[0] as Affiliate, payouts: p.rows as Payout[], sales: s.rows as Sale[], lastPayout: last ? String(last) : "none" };
  });
  if (!data) return { notFound: true };

  // Owner check passed above. portal_logins is server-only (0018).
  const login = data.a.is_house ? null : ((await db().query(
    `select login, last_login_at, password_hash is null as setup_pending, active
       from portal_logins where affiliate_id = $1`, [id])).rows[0] ?? null) as Login;

  // The one-time setup link, if it was just issued for this affiliate. Shown once.
  const token = readFlash(cookieValue(ctx.req.headers.cookie, FLASH_COOKIE), id);
  if (cookieValue(ctx.req.headers.cookie, FLASH_COOKIE) !== undefined) ctx.res.setHeader("Set-Cookie", clearedFlash());
  const base = process.env.AFFILIATE_URL?.trim() || "http://localhost:3200";

  const confirm = q1(ctx.query.confirm);
  return {
    props: plain({
      viewer: g.viewer, ...data, login,
      setupUrl: token ? setupLink(base, token) : null,
      confirm: ["deactivate", "reset"].includes(confirm) ? confirm : null,
      ok: q1(ctx.query.ok) || null, error: q1(ctx.query.e) || null,
    }),
  };
};

export default function AffiliatePage({ viewer, a, payouts, sales, lastPayout, login, setupUrl, confirm, ok, error }: Props) {
  const t = strings(viewer.lang);
  const k = t.affiliate;
  const lang = viewer.lang;
  const self = `/affiliates/${a.id}`;
  return (
    <Page viewer={viewer} section="affiliates" title={a.name}>
      {ok && k.ok[ok] && <Note>{k.ok[ok]}</Note>}
      {error && !["commission", "amount", "over"].includes(error) && <Note kind="bad">{k.errors[error] ?? k.errors.invalid}</Note>}

      {setupUrl && (
        <div className="panel">
          <h2>{k.setupTitle}</h2>
          <p className="copy">{setupUrl}</p>
          <p><small>{k.setupNote}</small></p>
        </div>
      )}

      <p>
        {a.is_house && <Chip>{t.chip.house}</Chip>}{" "}
        {!a.active && <Chip kind="unk">{t.chip.inactive}</Chip>}{" "}
        {a.is_test && <Chip kind="test">{t.chip.test}</Chip>}
      </p>
      {a.is_house && <p>{k.houseNote}</p>}

      <dl className="kv">
        {login && <><dt>{k.login}</dt><dd className="nums">{login.login}</dd></>}
        {login && <><dt>{k.lastLogin}</dt><dd>{login.setup_pending ? k.setupPending : login.last_login_at ? formatDateTime(login.last_login_at, lang) : t.dash}</dd></>}
        <dt>{k.business}</dt><dd>{a.business_name ?? t.dash}</dd>
        <dt>{k.contact}</dt><dd>{a.contact ?? t.dash}</dd>
        <dt>{k.commission}</dt><dd>{percentLabel(a.rate)}</dd>
        <dt>{k.created}</dt><dd>{formatDateTime(a.created_at, lang)}</dd>
      </dl>

      <h2>{k.earnings}</h2>
      <div className="stats">
        <Stat value={formatMoney(a.owed)} label={k.owed} period={t.home.today} />
        <Stat value={formatMoney(a.earned)} label={k.earned} period={t.home.allTime} />
        <Stat value={formatMoney(a.earned_this_month)} label={k.earnedMonth} period={t.home.month} />
        <Stat value={formatMoney(a.paid_out)} label={k.paidOut} period={t.home.allTime} />
        <Stat value={a.sales} label={k.sales} period={t.home.allTime} />
        <Stat value={a.renewals} label={k.renewals} period={t.home.allTime} />
      </div>

      <h2>{k.collection}</h2>
      <div className="stats">
        <Stat value={formatMoney(a.sales_earned)} label={k.salesEarned} period={t.home.allTime} />
        <Stat value={formatMoney(a.renewals_earned)} label={k.renewalsEarned} period={t.home.allTime} />
        <Stat value={formatMoney(a.renewals_by_others_earned)} label={k.byOthers(a.renewals_by_others)} period={t.home.allTime} />
        <Stat value={a.collected_for_others} label={k.forOthers} period={t.home.allTime} />
        <Stat value={formatMoney(a.cash_collected)} label={k.cash} period={t.home.allTime} />
      </div>
      <p><a href="/renewals/log">{k.collectionLink}</a></p>
      {a.is_test && <p><small>{t.home.testNote}</small></p>}

      {!a.is_house && (
        <>
          {confirm === "deactivate" && a.active && (
            <div className="panel danger narrow">
              <h2>{k.deactivateTitle}</h2>
              <p>{k.deactivateNote}</p>
              <form method="post" action="/api/affiliates/update" className="actions">
                <input type="hidden" name="affiliate_id" value={a.id} />
                <input type="hidden" name="action" value="deactivate" />
                <button type="submit">{k.deactivate}</button>
                <a className="button secondary" href={self}>{t.cancel}</a>
              </form>
            </div>
          )}
          {confirm === "reset" && (
            <div className="panel danger narrow">
              <h2>{k.resetTitle}</h2>
              <p>{k.resetNote}</p>
              <form method="post" action="/api/affiliates/reset" className="actions">
                <input type="hidden" name="affiliate_id" value={a.id} />
                <button type="submit">{k.reset}</button>
                <a className="button secondary" href={self}>{t.cancel}</a>
              </form>
            </div>
          )}

          <div className="actions narrow">
            {a.active ? (
              <a className="button secondary" href={`${self}?confirm=deactivate`}>{k.deactivate}</a>
            ) : (
              <form method="post" action="/api/affiliates/update">
                <input type="hidden" name="affiliate_id" value={a.id} />
                <input type="hidden" name="action" value="reactivate" />
                <button type="submit" className="secondary">{k.reactivate}</button>
              </form>
            )}
            <a className="button secondary" href={`${self}?confirm=reset`}>{k.reset}</a>
          </div>

          <form method="post" action="/api/affiliates/update" className="narrow">
            <h2>{k.changeCommission}</h2>
            <input type="hidden" name="affiliate_id" value={a.id} />
            <input type="hidden" name="action" value="commission" />
            <label htmlFor="commission">{t.newAffiliate.commission}</label>
            <input id="commission" name="commission" required inputMode="decimal" maxLength={6} defaultValue={percentInput(a.rate)} aria-describedby="commission-note" />
            <p className="hint" id="commission-note"><small>{k.commissionNote}</small></p>
            {error === "commission" && <p className="err hint">{k.errors.commission}</p>}
            <button type="submit" className="secondary">{k.save}</button>
          </form>

          <form method="post" action="/api/affiliates/payout" className="narrow">
            <h2>{k.payout}</h2>
            <p>{formatMoney(a.owed)} — {k.owed}</p>
            <input type="hidden" name="affiliate_id" value={a.id} />
            <input type="hidden" name="last_payout" value={lastPayout} />
            <label htmlFor="amount">{k.amount}</label>
            <input id="amount" name="amount" required inputMode="decimal" maxLength={12} autoComplete="off" />
            {(error === "amount" || error === "over") && <p className="err hint">{k.errors[error]}</p>}
            <label htmlFor="method">{k.method}</label>
            <select id="method" name="method" defaultValue="efectivo">
              {Object.entries(k.methods).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
            </select>
            <label htmlFor="note">{k.note}</label>
            <input id="note" name="note" maxLength={200} autoComplete="off" />
            <button type="submit">{k.payoutSubmit}</button>
          </form>
        </>
      )}

      {payouts.length > 0 && (
        <div className="wrap">
          <table>
            <caption>{k.payouts}</caption>
            <thead>
              <tr><th scope="col">{k.date}</th><th scope="col" className="num">{k.amountCol}</th><th scope="col">{k.method}</th><th scope="col">{k.note}</th></tr>
            </thead>
            <tbody>
              {payouts.map((p) => (
                <tr key={p.id}>
                  <th scope="row">{formatDateTime(p.paid_at, lang)}</th>
                  <td className="num">{formatMoney(p.amount)}</td>
                  <td>{p.method ? k.methods[p.method] ?? p.method : t.dash}</td>
                  <td>{p.note ?? ""}{p.voided_at && <> <Chip kind="bad">{t.chip.voided}</Chip> <small>{p.void_reason}</small></>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {sales.length > 0 && (
        <div className="wrap">
          <table>
            <caption>{k.history} <small>{k.last100}</small></caption>
            <thead>
              <tr>
                <th scope="col">{k.date}</th><th scope="col">{k.client}</th><th scope="col">{k.kind}</th>
                <th scope="col" className="num">{k.amountCol}</th><th scope="col" className="num">{k.commissionCol}</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((s) => (
                <tr key={s.id}>
                  <th scope="row">{formatDateTime(s.paid_at, lang)}</th>
                  <td>
                    <a href={`/clients/${s.client_id}`}>{s.full_name}</a>{" "}
                    {s.is_test && <Chip kind="test">{t.chip.test}</Chip>}
                  </td>
                  <td>{t.kind[s.kind] ?? s.kind} {s.voided_at && <Chip kind="bad">{t.chip.voided}</Chip>}</td>
                  <td className="num">{formatMoney(s.amount)}</td>
                  <td className="num">{formatMoney(s.commission)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Page>
  );
}
