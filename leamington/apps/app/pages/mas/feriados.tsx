/**
 * Feriados: the next year of national public holidays in their country, each
 * with "Verificado: {date}".
 */
import Head from "next/head";
import type { GetServerSideProps } from "next";
import { TabBar } from "@leamington/shared/src/ui/TabBar.tsx";
import { formatDate, formatWeekdayDate } from "@leamington/shared/src/format.ts";
import { db } from "../../lib/db";
import { loadClient, recordView } from "../../lib/client";
import { t } from "../../lib/t";

export const config = { unstable_runtimeJS: false };

type Holiday = { holiday_date: string; name: string; verified_at: string; source_url: string | null };
type Props = { lang: "es" | "en"; country: string; holidays: Holiday[] };

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
  return { props: { lang: client.language, country: client.country, holidays: rows } };
};

const COUNTRY: Record<string, [string, string]> = {
  MX: ["México", "Mexico"], GT: ["Guatemala", "Guatemala"], HN: ["Honduras", "Honduras"], JM: ["Jamaica", "Jamaica"],
};

export default function Feriados({ lang, country, holidays }: Props) {
  return (
    <>
      <Head>
        <title>{`${t(lang, "Feriados", "Holidays")} · Hoy`}</title>
        <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
      </Head>
      <main>
        <p><a href="/mas">← {t(lang, "Más", "More")}</a></p>
        <h1>{t(lang, "Feriados", "Public holidays")}</h1>
        {holidays.length > 0 && <p className="step">{COUNTRY[country]?.[lang === "en" ? 1 : 0]}</p>}
        <ul className="rows">
          {holidays.map((h) => (
            <li key={h.holiday_date + h.name}>
              <small>{formatWeekdayDate(h.holiday_date, lang)}</small><br />{h.name}<br />
              <small>
                {t(lang, "Verificado", "Verified")}: {formatDate(h.verified_at, lang)}
                {h.source_url && <>{" · "}<a href={h.source_url} rel="noopener">{t(lang, "Fuente", "Source")}</a></>}
              </small>
            </li>
          ))}
        </ul>
      </main>
      <TabBar current="mas" lang={lang} />
    </>
  );
}
