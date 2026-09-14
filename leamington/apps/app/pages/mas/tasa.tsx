/**
 * Tasa de referencia: today's reference rate with 30 days of context.
 * Never a provider name, never a ranking, prediction or advice. A rate more
 * than 3 days old is not shown at all.
 */
import Head from "next/head";
import type { GetServerSideProps } from "next";
import { TabBar } from "@leamington/shared/src/ui/TabBar.tsx";
import { formatDate } from "@leamington/shared/src/format.ts";
import { db } from "../../lib/db";
import { loadClient, recordView } from "../../lib/client";
import { t } from "../../lib/t";

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

export default function Tasa({ r }: { r: Rate }) {
  const lang = r.language;
  return (
    <>
      <Head>
        <title>{`${t(lang, "Tasa", "Rate")} · Hoy`}</title>
        <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
      </Head>
      <main>
        <p><a href="/mas">← {t(lang, "Más", "More")}</a></p>
        <h1>{t(lang, "Tasa de referencia", "Reference rate")}</h1>
        {r.current && r.latest && (
          <>
            <section className="card">
              <small>{r.note} · {formatDate(r.latest.date, lang)}</small>
              <p className="big">1 CAD = {fmt(r.latest.rate)} {r.currency}</p>
            </section>
            <div className="pair">
              <section className="card"><small>{t(lang, "Más alta en 30 días", "30-day high")}</small><p className="line">{fmt(r.high_30d)}</p></section>
              <section className="card"><small>{t(lang, "Más baja en 30 días", "30-day low")}</small><p className="line">{fmt(r.low_30d)}</p></section>
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
