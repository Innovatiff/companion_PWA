/**
 * Tasa de referencia: today's reference rate with 30 days of context, drawn as
 * a small server-rendered line. Never a provider name, never a ranking,
 * prediction or advice. A rate more than 3 days old is not shown at all.
 */
import Head from "next/head";
import type { GetServerSideProps } from "next";
import { TabBar } from "@leamington/shared/src/ui/TabBar.tsx";
import { formatDate } from "@leamington/shared/src/format.ts";
import { db } from "../../lib/db";
import { loadClient, recordView } from "../../lib/client";
import { t } from "../../lib/t";
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

/** The last 30 days as a line, oldest on the left. Decorative: the table below has the numbers. */
function Spark({ days }: { days: Day[] }) {
  const pts = [...days].reverse().map((d) => Number(d.rate));
  if (pts.length < 2) return null;
  const lo = Math.min(...pts), hi = Math.max(...pts);
  const xy = pts.map((v, i) => `${((i * 300) / (pts.length - 1)).toFixed(1)},${(6 + ((hi - v) / (hi - lo || 1)) * 64).toFixed(1)}`);
  return (
    <svg className="spark" viewBox="0 0 300 76" preserveAspectRatio="none" aria-hidden="true">
      <path d={`M${xy.join("L")}L300,76L0,76Z`} fill="#ecebff" />
      <path d={`M${xy.join("L")}`} fill="none" stroke="#3533cd" strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

export default function Tasa({ r }: { r: Rate }) {
  const lang = r.language;
  return (
    <>
      <Head>
        <title>{`${t(lang, "Tasa", "Rate")} · Hoy`}</title>
        <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
        <style dangerouslySetInnerHTML={{ __html: TASA_CSS }} />
      </Head>
      <main>
        <p><a href="/mas">← {t(lang, "Más", "More")}</a></p>
        <h1>{t(lang, "Tasa de referencia", "Reference rate")}</h1>
        {r.current && r.latest && (
          <>
            <section className="card">
              <small>{r.note} · {formatDate(r.latest.date, lang)}</small>
              <p className="line">{FLAG.CA} CAD → {FLAG[COUNTRY[r.currency]]} {r.currency}</p>
              <p className="big">1 CAD = {fmt(r.latest.rate)} {r.currency}</p>
              {r.days && <Spark days={r.days} />}
              <small>{t(lang, "Últimos 30 días", "Last 30 days")}</small>
            </section>
            <div className="pair">
              <section className="card"><small>{t(lang, "Más alta en 30 días", "30-day high")}</small><p className="line">↑ {fmt(r.high_30d)}</p></section>
              <section className="card"><small>{t(lang, "Más baja en 30 días", "30-day low")}</small><p className="line">↓ {fmt(r.low_30d)}</p></section>
            </div>
            <div className="wrap">
              <table>
                <thead><tr><th>{t(lang, "Día", "Day")}</th><th className="n">{r.currency}</th></tr></thead>
                <tbody>
                  {r.days?.map((d) => (
                    <tr key={d.date}><td>{formatDate(d.date, lang)}</td><td className="n">{fmt(d.rate)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>
      <TabBar current="mas" lang={lang} />
    </>
  );
}
