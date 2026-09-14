/**
 * Feriados: the next year of national public holidays in their country, each
 * with "Verificado: {date}", as date blocks.
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

type Holiday = { holiday_date: string; name: string; verified_at: string; source_url: string | null };
type Props = { lang: "es" | "en"; country: string; today: string; holidays: Holiday[] };

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const loaded = await loadClient(ctx);
  if ("redirect" in loaded) return loaded;
  const { client } = loaded;
  const { rows } = await db().query(
    `select to_char(holiday_date, 'YYYY-MM-DD') as holiday_date, name,
            to_char(verified_at, 'YYYY-MM-DD') as verified_at, source_url
       from holidays
      where country = $1
        and holiday_date >= (now() at time zone $2)::date
        and holiday_date < (now() at time zone $2)::date + 366
      order by holiday_date, name`, [client.country, client.timezone]);
  await recordView(client.id, "feriados", { holidays: rows.length });
  return { props: { lang: client.language, country: client.country, today: localDate(new Date(), client.timezone), holidays: rows } };
};

const COUNTRY: Record<string, [string, string]> = {
  MX: ["México", "Mexico"], GT: ["Guatemala", "Guatemala"], HN: ["Honduras", "Honduras"], JM: ["Jamaica", "Jamaica"],
};

export default function Feriados({ lang, country, today, holidays }: Props) {
  const soon = (date: string) => {
    const n = daysBetween(today, date);
    return n === 0 ? t(lang, "Hoy", "Today") : n === 1 ? t(lang, "Mañana", "Tomorrow") : t(lang, `En ${n} días`, `In ${n} days`);
  };
  return (
    <>
      <Head>
        <title>{`${t(lang, "Feriados", "Holidays")} · Hoy`}</title>
        <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
      </Head>
      <main>
        <PageHead lang={lang} title={t(lang, "Feriados", "Public holidays")} art="calendar" back />
        {holidays.length > 0 && <p className="step">{FLAG[country]} {COUNTRY[country]?.[lang === "en" ? 1 : 0]}</p>}
        {holidays.map((h, i) => {
          const weekday = formatWeekdayDate(h.holiday_date, lang).split(" ")[0];
          return (
            <div className={i === 0 ? "tile holiday" : "tile"} key={h.holiday_date + h.name}>
              <DateBlock date={h.holiday_date} lang={lang} />
              <span>
                <small>{weekday}{i === 0 && <> <span className="chip">{soon(h.holiday_date)}</span></>}</small>
                <p className="line">{h.name}</p>
                <small>
                  {t(lang, "Verificado", "Verified")}: {formatDate(h.verified_at, lang)}
                  {h.source_url && <>{" · "}<a href={h.source_url} rel="noopener">{t(lang, "Fuente", "Source")}</a></>}
                </small>
              </span>
            </div>
          );
        })}
      </main>
      <TabBar current="mas" lang={lang} />
    </>
  );
}
