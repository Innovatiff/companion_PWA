/**
 * Tasa de referencia, after the reference's Analytics screen (0042):
 *   - the rate big, with "1 CAD · tasa de referencia" and its date
 *   - Semana / Mes / 3 meses; bars for 7 and 30 days, a smooth line for 90,
 *     one mark per real stored day (MXN has no weekend quotes, and none is drawn)
 *   - the high and low with their dates, and the change since the first day shown
 *   - the week of the rate, the calculator, and "Avísame cuando suba"
 *
 * Descriptive only (CLAUDE.md): never a provider name, a ranking, a forecast
 * or advice, and no colour that says good or bad. A rate that is not current is
 * shown with its date and said plainly not to be today's.
 */
import Head from "next/head";
import type { GetServerSideProps } from "next";
import { formatDate } from "@leamington/shared/src/format.ts";
import { db } from "../../lib/db";
import { loadClient, recordView } from "../../lib/client";
import { t } from "../../lib/t";
import { TabBar } from "../../lib/frame";
import { EXPIRE_SCRIPT } from "../../lib/open-script";
import { Art, FLAG, Pic } from "../../lib/ui";
import {
  CAD_CHIPS, CAD_MAX, LOCAL_CHIPS, RateChart, WeekCircles, convert, decimalsFor, num, parseAmount, rateText, shortDate,
  type FxHistory, type Reminder,
} from "../../lib/money";
import { TASA_CSS } from "../../lib/page-css";

export const config = { unstable_runtimeJS: false };

const RANGES = [7, 30, 90] as const;
const COUNTRY: Record<string, string> = { MXN: "MX", GTQ: "GT", HNL: "HN", JMD: "JM" };
const ERRORS: Record<string, [string, string]> = {
  "reminder-range": ["Elige un número cerca de la tasa de hoy.", "Choose a number close to today's rate."],
  "reminder-norate": ["Todavía no hay tasa.", "There is no rate yet."],
  "reminder-number": ["Escribe un número, por ejemplo 18.70.", "Enter a number, for example 18.70."],
};

type Props = {
  lang: "es" | "en"; r: 7 | 30 | 90; h: FxHistory; rem: Reminder | null; start: number | null; pushOff: boolean;
  calc: { local: boolean; raw: string | null }; e: string | null; ok: string | null;
};

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const loaded = await loadClient(ctx);
  if ("redirect" in loaded) return loaded;
  const { client } = loaded;
  const r = (RANGES as readonly number[]).includes(Number(ctx.query.r)) ? (Number(ctx.query.r) as 7 | 30 | 90) : 30;
  const [main, push] = await Promise.all([
    db().query("select app.fx_history($1, $2) as h, app.rate_reminder($1) as rem", [client.id, r]),
    db().query("select count(*)::int as n from push_subscriptions where client_id = $1 and disabled_at is null", [client.id]),
  ]);
  const h = main.rows[0].h as FxHistory;
  const rem = (main.rows[0].rem ?? null) as Reminder | null;
  // The reference rate on the day the reminder was set: where its progress bar starts.
  const start = rem
    ? (await db().query(
        `select rate::float8 as rate from fx_rates
          where quote = $1::fx_currency and rate_date <= ($2::timestamptz at time zone $3)::date
          order by rate_date desc limit 1`, [rem.currency, rem.created_at, client.timezone])).rows[0]?.rate ?? null
    : null;
  const local = ctx.query.dir === "local";
  const raw = local ? ctx.query.n : ctx.query.cad;
  const e = typeof ctx.query.e === "string" && ctx.query.e in ERRORS ? ctx.query.e : null;
  const ok = ctx.query.ok === "reminder" || ctx.query.ok === "cleared" ? ctx.query.ok : null;
  await recordView(client.id, "tasa", {
    range: r, current: h.current, points: h.points.length, stale: h.latest?.stale ?? null, reminder: Boolean(rem), calc: local ? "local" : "cad",
  });
  return {
    props: {
      lang: client.language, r, h, rem, start, pushOff: push.rows[0].n === 0,
      calc: { local, raw: typeof raw === "string" ? raw : null }, e, ok,
    },
  };
};

export default function Tasa({ lang, r, h, rem, start, pushOff, calc, e, ok }: Props) {
  const cur = h.currency;
  const latest = h.latest;
  const rate = latest ? Number(latest.rate) : null;
  const href = (params: Record<string, string | number | undefined>) => {
    const s = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") s.set(k, String(v));
    return `/mas/tasa?${s.toString()}`;
  };
  const range = { 7: t(lang, "Semana", "Week"), 30: t(lang, "Mes", "Month"), 90: t(lang, "3 meses", "3 months") } as const;

  // Calculator: chips, a typed amount, or the default 100 CAD (or the second local chip).
  const chips = calc.local ? LOCAL_CHIPS[cur] ?? [] : CAD_CHIPS;
  const cap = calc.local && rate ? Math.ceil(CAD_MAX * rate) : CAD_MAX;
  const amount = calc.raw == null ? (calc.local ? chips[1] ?? null : 100) : parseAmount(calc.raw, cap);
  const bad = calc.raw != null && amount == null;
  const result = amount != null && rate ? convert(amount, rate, !calc.local, cur) : null;
  const from = calc.local ? cur : "CAD", to = calc.local ? "CAD" : cur;
  const amountText = (n: number, currency: string) => num(n, currency === "CAD" ? (Number.isInteger(n) ? 0 : 2) : Number.isInteger(n) ? 0 : 2, lang);

  // Reminder: suggest a little above the latest rate; progress from the day it was set.
  const suggest = rate ? (Math.round(rate * 1.01 * 100) / 100).toFixed(2) : "";
  const pct = rem && start != null && rem.latest_rate != null && Number(rem.target) > start
    ? Math.min(100, Math.max(0, ((Number(rem.latest_rate) - start) / (Number(rem.target) - start)) * 100)) : null;
  const rq = r === 30 ? undefined : r;

  return (
    <>
      <Head>
        <title>{`${t(lang, "Tasa", "Rate")} · Hoy`}</title>
        <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
        <style dangerouslySetInnerHTML={{ __html: TASA_CSS }} />
      </Head>
      <main>
        <header className="ph">
          <a className="back" href="/mas" aria-label={t(lang, "Volver a Más", "Back to More")}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
          </a>
          <h1>{t(lang, "Tasa", "Rate")}</h1>
          <a className="bellbtn" href="#avisame" aria-label={t(lang, "Avísame cuando la tasa llegue a un número", "Tell me when the rate reaches a number")}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z" /><path d="M10 21h4" /></svg>
          </a>
        </header>

        {latest && rate != null && (
          <>
            <section className="rhead">
              <div>
                <p className="rt"><b>{rateText(rate)}</b><span>{cur}</span></p>
                <small>{`${FLAG.CA} 1 CAD → ${FLAG[COUNTRY[cur]] ?? ""} · ${h.note}`}</small>
              </div>
              <small className="rdate"><time dateTime={latest.date}>{shortDate(latest.date, lang)}</time></small>
            </section>
            {(!h.current || latest.stale) && (
              <p className="stale">{t(lang, `Esta tasa de referencia es del ${formatDate(latest.date, lang, true)}. No es la de hoy.`,
                                           `This reference rate is from ${formatDate(latest.date, lang, true)}. It is not today's.`)}</p>
            )}

            <nav className="seg" aria-label={t(lang, "Periodo", "Period")}>
              {RANGES.map((n) => <a key={n} href={href({ r: n })} aria-current={n === r ? "page" : undefined}>{range[n]}</a>)}
            </nav>

            <section className="card chartc">
              <RateChart h={h} lang={lang} />
              {h.high && h.low && (
                <p className="hilo">
                  <span className="hi" data-d={h.high.date}><small>{t(lang, "Más alta", "Highest")}</small><b>{rateText(h.high.rate)}</b><small>{shortDate(h.high.date, lang)}</small></span>
                  <span className="lo" data-d={h.low.date}><small>{t(lang, "Más baja", "Lowest")}</small><b>{rateText(h.low.rate)}</b><small>{shortDate(h.low.date, lang)}</small></span>
                </p>
              )}
              {h.change_pct != null && h.points.length > 1 && (
                <span className="chg" data-pct={h.change_pct}>
                  {`${h.change_pct > 0 ? "+" : ""}${num(h.change_pct, 2, lang)}% ${t(lang, `desde el ${shortDate(h.points[0].date, lang)}`, `since ${shortDate(h.points[0].date, lang)}`)}`}
                </span>
              )}
            </section>

            {h.week.length > 0 && (
              <section className="card wk" id="semana">
                <div className="ch"><Pic name="calendar" /><h2>{t(lang, "Semana de la tasa", "The rate's week")}</h2></div>
                <WeekCircles week={h.week} lang={lang} />
              </section>
            )}

            <section className="card calc" id="calc">
              <div className="ch"><Pic name="calculator" /><h2>{t(lang, "Calculadora", "Calculator")}</h2></div>
              <nav className="seg sm" aria-label={t(lang, "Dirección", "Direction")}>
                <a href={`${href({ r: rq, cad: 100 })}#calc`} aria-current={!calc.local ? "page" : undefined}>{`CAD → ${cur}`}</a>
                <a href={`${href({ r: rq, dir: "local", n: LOCAL_CHIPS[cur]?.[1] })}#calc`} aria-current={calc.local ? "page" : undefined}>{`${cur} → CAD`}</a>
              </nav>
              <p className="chips">
                {chips.map((c) => (
                  <a key={c} className={c === amount ? "cp on" : "cp"}
                     href={`${calc.local ? href({ r: rq, dir: "local", n: c }) : href({ r: rq, cad: c })}#calc`}>
                    {calc.local ? `${num(c, 0, lang)}` : `$${c}`}
                  </a>
                ))}
              </p>
              {amount != null && result != null && (
                <p className="cres" data-dir={calc.local ? "local" : "cad"} data-amount={amount} data-result={result}>
                  <b>{`${amountText(amount, from)} ${from}`}</b>
                  <span className="big">{`≈ ${num(result, calc.local ? 2 : decimalsFor(cur), lang)} ${to}`}</span>
                </p>
              )}
              <form method="get" action="/mas/tasa#calc" className="cform">
                {rq && <input type="hidden" name="r" value={rq} />}
                {calc.local && <input type="hidden" name="dir" value="local" />}
                <label htmlFor="amt" className="sr">{t(lang, `Cantidad en ${from}`, `Amount in ${from}`)}</label>
                <input id="amt" name={calc.local ? "n" : "cad"} type="number" inputMode="decimal" min="1" max={cap} step="0.01"
                       placeholder={from} defaultValue={amount != null && !chips.includes(amount) ? String(amount) : ""} />
                <button type="submit">{t(lang, "Calcular", "Calculate")}</button>
              </form>
              {bad && <p className="err" role="alert">{t(lang, `Escribe una cantidad entre 1 y ${num(cap, 0, lang)} ${from}.`, `Enter an amount from 1 to ${num(cap, 0, lang)} ${from}.`)}</p>}
              <small>{t(lang, `Con la tasa de referencia del ${formatDate(latest.date, lang)}. Cada servicio de envío usa su propia tasa y cobra su comisión.`,
                              `At the reference rate of ${formatDate(latest.date, lang)}. Each transfer service uses its own rate and charges its fee.`)}</small>
            </section>
          </>
        )}

        <section className="card remind" id="avisame">
          <div className="ch"><Art name="bell-reminder" size={56} lazy /><h2>{t(lang, "Avísame cuando la tasa llegue a…", "Tell me when the rate reaches…")}</h2></div>
          {e && <p className="err" role="alert">{t(lang, ...ERRORS[e])}</p>}
          {ok === "reminder" && !e && <p className="ok" role="status">{t(lang, "Listo.", "Done.")}</p>}
          {rem ? (
            <div className="rem" data-target={rem.target}>
              <p className="rt2">
                <b>{rateText(rem.target)}</b><span>{rem.currency}</span>
                {rem.reached === true && h.valid_until && <span className="chip got" data-line="reached" data-until={h.valid_until}>{t(lang, "¡Llegó!", "Reached!")}</span>}
              </p>
              {pct != null && (
                <>
                  <span className="bar"><i style={{ width: `${pct}%` }} /></span>
                  <p className="rgl"><small>{rateText(start!)}</small><small>{rateText(rem.target)}</small></p>
                </>
              )}
              <small>{t(lang, `Te avisamos una vez cuando la tasa de referencia llegue a ${rateText(rem.target)} ${rem.currency}.`,
                              `We tell you once when the reference rate reaches ${rateText(rem.target)} ${rem.currency}.`)}</small>
              <form method="post" action="/api/rate-reminder">
                <input type="hidden" name="action" value="clear" />
                {rq && <input type="hidden" name="r" value={rq} />}
                <button type="submit" className="secondary">{t(lang, "Quitar aviso", "Remove reminder")}</button>
              </form>
            </div>
          ) : rate != null && (
            <>
              <form method="post" action="/api/rate-reminder" className="arr">
                <input type="hidden" name="action" value="set" />
                {rq && <input type="hidden" name="r" value={rq} />}
                <label htmlFor="target" className="sr">{t(lang, `Tasa en ${cur}`, `Rate in ${cur}`)}</label>
                <input id="target" name="target" type="number" inputMode="decimal" step="0.01" min="0.01" defaultValue={suggest} />
                <button type="submit">{t(lang, "Avísame", "Remind me")}</button>
              </form>
              <small>{t(lang, "Te avisamos una vez cuando la tasa de referencia llegue a ese número.", "We tell you once when the reference rate reaches that number.")}</small>
            </>
          )}
          {pushOff && (rem || rate != null) && (
            <p className="inf"><small>{t(lang, "El aviso llega como notificación: ", "The reminder arrives as a notification: ")}
              <a href="/mas/avisos">{t(lang, "activa las notificaciones", "turn on notifications")}</a>.</small></p>
          )}
        </section>

        {/* At 3 meses the chart, high and low already show the window; the table stays for Semana and Mes. */}
        {latest && h.points.length > 0 && r !== 90 && (
          <details className="card days">
            <summary>{t(lang, `Todos los días (${h.points.length})`, `Every day (${h.points.length})`)}</summary>
            <table>
              <thead><tr><th>{t(lang, "Día", "Day")}</th><th className="n">{cur}</th></tr></thead>
              <tbody>{[...h.points].reverse().map((p) => <tr key={p.date}><td>{shortDate(p.date, lang)}</td><td className="n">{rateText(p.rate)}</td></tr>)}</tbody>
            </table>
          </details>
        )}
      </main>
      <TabBar current="tasa" lang={lang} />
      {rem?.reached === true && <script dangerouslySetInnerHTML={{ __html: EXPIRE_SCRIPT }} />}
    </>
  );
}
