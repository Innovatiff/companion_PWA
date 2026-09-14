/**
 * Tasa de referencia: today's reference rate, big, with 30 days of context: a
 * small server-rendered line, where today sits between the 30-day low and high,
 * and the daily table. Never a provider name, never a ranking, prediction or
 * advice. A rate more than 3 days old is not shown at all.
 */
import Head from "next/head";
import type { GetServerSideProps } from "next";
import { formatDate } from "@leamington/shared/src/format.ts";
import { db } from "../../lib/db";
import { loadClient, recordView } from "../../lib/client";
import { t } from "../../lib/t";
import { PageHead, TabBar } from "../../lib/frame";
import { FLAG } from "../../lib/ui";
import { TASA_CSS } from "../../lib/page-css";

export const config = { unstable_runtimeJS: false };

type Day = { date: string; rate: number };
type Rate = {
  language: "es" | "en"; currency: string; current: boolean; note?: string;
  latest?: Day; high_30d?: number; low_30d?: number; days?: Day[];
};

export const getServerSideProps: GetServerSideProps<{ r: Rate }> = async (ctx) => {
  const loaded = await loadClient(ctx);
  if ("redirect" in loaded) return loaded;
  const { rows } = await db().query("select app.rate_page($1) as r", [loaded.client.id]);
  const r = rows[0]?.r as Rate;
  await recordView(loaded.client.id, "tasa", { current: r.current, days: r.days?.length ?? 0 });
  return { props: { r } };
};

const fmt = (n: number | undefined) => (n == null ? "" : Number(n).toFixed(2));
const COUNTRY: Record<string, string> = { MXN: "MX", GTQ: "GT", HNL: "HN", JMD: "JM" };

/** The last 30 days as a line, oldest on the left, with today's dot. Decorative: the table below has the numbers. */
function Spark({ days }: { days: Day[] }) {
  const pts = [...days].reverse().map((d) => Number(d.rate));
  if (pts.length < 2) return null;
  const lo = Math.min(...pts), hi = Math.max(...pts);
  const xy = pts.map((v, i) => [(i * 300) / (pts.length - 1), 8 + ((hi - v) / (hi - lo || 1)) * 62]);
  const line = xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join("L");
  const [lx, ly] = xy[xy.length - 1];
  return (
    <svg className="spark" viewBox="0 0 300 76" preserveAspectRatio="none" aria-hidden="true">
      <path d={`M${line}L300,76L0,76Z`} fill="#e8eafc" />
      <path className="ln" d={`M${line}`} pathLength={1} fill="none" stroke="#4f5bd5" strokeWidth="3" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r="4" fill="#fff" stroke="#3f4bc4" strokeWidth="3" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default function Tasa({ r }: { r: Rate }) {
  const lang = r.language;
  const lo = Number(r.low_30d), hi = Number(r.high_30d), now = Number(r.latest?.rate);
  const at = hi > lo ? Math.min(100, Math.max(0, ((now - lo) / (hi - lo)) * 100)) : 50;
  return (
    <>
      <Head>
        <title>{`${t(lang, "Tasa", "Rate")} · Hoy`}</title>
        <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
        <style dangerouslySetInnerHTML={{ __html: TASA_CSS }} />
      </Head>
      <main>
        <PageHead lang={lang} title={t(lang, "Tasa", "Rate")} art="money" />
        {r.current && r.latest && (
          <>
            <section className="card">
              <small>{`${FLAG.CA} 1 CAD → ${FLAG[COUNTRY[r.currency]] ?? ""} ${r.currency} · ${r.note ?? t(lang, "tasa de referencia", "reference rate")} · ${formatDate(r.latest.date, lang)}`}</small>
              <p className="rt"><b>{fmt(r.latest.rate)}</b><span>{r.currency}</span></p>
              {r.days && <Spark days={r.days} />}
              <small>{t(lang, "Últimos 30 días", "Last 30 days")}</small>
              {r.low_30d != null && r.high_30d != null && (
                <>
                  <span className="rg"><i style={{ left: `${at}%` }} /></span>
                  <p className="rgl">
                    <span><small>{t(lang, "Más baja en 30 días", "30-day low")}</small><b>↓ {fmt(r.low_30d)}</b></span>
                    <span><small>{t(lang, "Más alta en 30 días", "30-day high")}</small><b>↑ {fmt(r.high_30d)}</b></span>
                  </p>
                </>
              )}
            </section>
            {r.days && r.days.length > 0 && (
              <div className="wrap">
                <table>
                  <caption>{t(lang, "Últimos 7 días", "Last 7 days")}</caption>
                  <thead><tr><th>{t(lang, "Día", "Day")}</th><th className="n">{r.currency}</th></tr></thead>
                  <tbody>{r.days.slice(0, 7).map((d) => <tr key={d.date}><td>{formatDate(d.date, lang)}</td><td className="n">{fmt(d.rate)}</td></tr>)}</tbody>
                </table>
                {r.days.length > 7 && (
                  <details>
                    <summary>{t(lang, `Los ${r.days.length} días`, `All ${r.days.length} days`)}</summary>
                    <table>
                      <thead><tr><th>{t(lang, "Día", "Day")}</th><th className="n">{r.currency}</th></tr></thead>
                      <tbody>{r.days.map((d) => <tr key={d.date}><td>{formatDate(d.date, lang)}</td><td className="n">{fmt(d.rate)}</td></tr>)}</tbody>
                    </table>
                  </details>
                )}
              </div>
            )}
          </>
        )}
      </main>
      <TabBar current="tasa" lang={lang} />
    </>
  );
}
