/**
 * Feriados aquí y allá (0042): Ontario's public holidays (Employment Standards
 * Act) and their home country's national holidays, merged by date
 * (app.holidays_here_and_there). Each row: a date block, the flag, the
 * countdown and "Verificado: {date}". Pills filter Todos / Ontario / {País}.
 * The home country's full next-12-months list, with its sources, stays below.
 */
import Head from "next/head";
import type { GetServerSideProps } from "next";
import { formatDate, formatWeekdayDate, localDate } from "@leamington/shared/src/format.ts";
import { db } from "../../lib/db";
import { loadClient, recordView } from "../../lib/client";
import { t } from "../../lib/t";
import { PageHead, TabBar } from "../../lib/frame";
import { DateBlock, FLAG, daysBetween } from "../../lib/ui";

export const config = { unstable_runtimeJS: false };

type Merged = { date: string; name: string; where: string; days_left: number; verified_at: string };
type Holiday = { holiday_date: string; name: string; verified_at: string; source_url: string | null };
type Filter = "todos" | "on" | "pais";
type Props = { lang: "es" | "en"; country: string; today: string; merged: Merged[]; holidays: Holiday[]; ontarioSource: string | null; f: Filter };

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const loaded = await loadClient(ctx);
  if ("redirect" in loaded) return loaded;
  const { client } = loaded;
  const f: Filter = ctx.query.f === "on" || ctx.query.f === "pais" ? ctx.query.f : "todos";
  const [merged, home, source] = await Promise.all([
    db().query("select app.holidays_here_and_there($1, now(), 50) as h", [client.id]),
    db().query(
      `select to_char(holiday_date, 'YYYY-MM-DD') as holiday_date, name,
              to_char(verified_at, 'YYYY-MM-DD') as verified_at, source_url
         from holidays
        where country = $1
          and holiday_date >= (now() at time zone $2)::date
          and holiday_date < (now() at time zone $2)::date + 366
        order by holiday_date, name`, [client.country, client.timezone]),
    db().query("select source_url from provincial_holidays where province = 'ON' order by verified_at desc limit 1"),
  ]);
  const list = (merged.rows[0]?.h ?? []) as Merged[];
  await recordView(client.id, "feriados", { holidays: home.rows.length, merged: list.length, ontario: list.filter((x) => x.where === "ON").length, filter: f });
  return {
    props: {
      lang: client.language, country: client.country, today: localDate(new Date(), client.timezone), merged: list,
      holidays: home.rows, ontarioSource: source.rows[0]?.source_url ?? null, f,
    },
  };
};

const COUNTRY: Record<string, [string, string]> = {
  MX: ["México", "Mexico"], GT: ["Guatemala", "Guatemala"], HN: ["Honduras", "Honduras"], JM: ["Jamaica", "Jamaica"],
};

export default function Feriados({ lang, country, today, merged, holidays, ontarioSource, f }: Props) {
  const home = COUNTRY[country]?.[lang === "en" ? 1 : 0] ?? country;
  const soon = (n: number) => (n === 0 ? t(lang, "Hoy", "Today") : n === 1 ? t(lang, "Mañana", "Tomorrow") : t(lang, `En ${n} días`, `In ${n} days`));
  const rows = merged.filter((h) => f === "todos" || (f === "on" ? h.where === "ON" : h.where !== "ON"));
  const row = (h: Merged) => (
    <div className="tile hol" key={h.date + h.where + h.name} data-where={h.where} data-d={h.date}>
      <DateBlock date={h.date} lang={lang} />
      <span>
        <small>{`${h.where === "ON" ? `${FLAG.CA} Ontario` : `${FLAG[h.where] ?? ""} ${home}`} · ${formatWeekdayDate(h.date, lang).split(" ")[0]}`}</small>
        <p className="line">{h.name}</p>
        <small><span className="chip">{soon(h.days_left)}</span>{` ${t(lang, "Verificado", "Verified")}: ${formatDate(h.verified_at, lang)}`}</small>
      </span>
    </div>
  );
  const pills: [Filter, string][] = [["todos", t(lang, "Todos", "All")], ["on", `${FLAG.CA} Ontario`], ["pais", `${FLAG[country] ?? ""} ${home}`]];
  return (
    <>
      <Head>
        <title>{`${t(lang, "Feriados", "Holidays")} · Hoy`}</title>
        <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
      </Head>
      <main>
        <PageHead lang={lang} title={t(lang, "Feriados", "Public holidays")} art="canada" back />
        <nav className="seg" aria-label={t(lang, "Mostrar", "Show")}>
          {pills.map(([key, label]) => (
            <a key={key} href={key === "todos" ? "/mas/feriados" : `/mas/feriados?f=${key}`} aria-current={key === f ? "page" : undefined}>{label}</a>
          ))}
        </nav>
        {rows.slice(0, 8).map(row)}
        {rows.length > 8 && (
          <details className="morehol">
            <summary>{t(lang, `Ver más feriados (${rows.length - 8})`, `More holidays (${rows.length - 8})`)}</summary>
            {rows.slice(8).map(row)}
          </details>
        )}
        {ontarioSource && f !== "pais" && rows.some((h) => h.where === "ON") && (
          <p><small>{t(lang, "Ontario: ", "Ontario: ")}<a href={ontarioSource} rel="noopener">{t(lang, "Ley de Normas de Empleo (fuente)", "Employment Standards Act (source)")}</a></small></p>
        )}
        {holidays.length > 0 && (
          <details className="card">
            <summary>{t(lang, `${home}: los próximos 12 meses (${holidays.length})`, `${home}: the next 12 months (${holidays.length})`)}</summary>
            <ul className="rows">
              {holidays.map((h) => (
                <li key={h.holiday_date + h.name}>
                  <b>{h.name}</b><br />
                  <small>
                    {`${formatWeekdayDate(h.holiday_date, lang)} · ${soon(daysBetween(today, h.holiday_date))} · ${t(lang, "Verificado", "Verified")}: ${formatDate(h.verified_at, lang)}`}
                    {h.source_url && <>{" · "}<a href={h.source_url} rel="noopener">{t(lang, "Fuente", "Source")}</a></>}
                  </small>
                </li>
              ))}
            </ul>
          </details>
        )}
      </main>
      <TabBar current="mas" lang={lang} />
    </>
  );
}
