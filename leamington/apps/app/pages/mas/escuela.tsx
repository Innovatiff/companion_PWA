/**
 * Calendario escolar: the national school calendar of their country, from
 * today on. National only; department-level calendars do not exist as data.
 */
import Head from "next/head";
import { EV_CSS } from "../../lib/page-css";
import type { GetServerSideProps } from "next";
import { formatDate } from "@leamington/shared/src/format.ts";
import { db } from "../../lib/db";
import { loadClient, recordView } from "../../lib/client";
import { t } from "../../lib/t";
import { PageHead, TabBar } from "../../lib/frame";
import { DateBlock } from "../../lib/ui";

export const config = { unstable_runtimeJS: false };

type Event = { school_year: string; event_name: string; start_date: string; end_date: string | null; verified_at: string; source_url: string | null };
type Props = { lang: "es" | "en"; events: Event[] };

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const loaded = await loadClient(ctx);
  if ("redirect" in loaded) return loaded;
  const { client } = loaded;
  const { rows } = await db().query(
    `select school_year, event_name, to_char(start_date, 'YYYY-MM-DD') as start_date,
            to_char(end_date, 'YYYY-MM-DD') as end_date, to_char(verified_at, 'YYYY-MM-DD') as verified_at, source_url
       from school_calendar
      where country = $1 and coalesce(end_date, start_date) >= (now() at time zone $2)::date
      order by start_date, event_name
      limit 40`, [client.country, client.timezone]);
  await recordView(client.id, "escuela", { events: rows.length, has_kids: client.hasKids });
  return { props: { lang: client.language, events: rows } };
};

export default function Escuela({ lang, events }: Props) {
  const range = (e: Event) =>
    e.end_date && e.end_date !== e.start_date
      ? `${formatDate(e.start_date, lang)} – ${formatDate(e.end_date, lang, true)}`
      : formatDate(e.start_date, lang, true);
  return (
    <>
      <Head>
        <title>{`${t(lang, "Calendario escolar", "School calendar")} · Hoy`}</title>
        <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
        <style dangerouslySetInnerHTML={{ __html: EV_CSS }} />
      </Head>
      <main>
        <PageHead lang={lang} title={t(lang, "Escuela", "School")} art="school" back />
        {events.length > 0 && <p className="step">{t(lang, "Calendario nacional", "National calendar")} · {events[0].school_year}</p>}
        {/* No events: no list at all, never an empty card. */}
        {events.length > 0 && <ul className="rows">
          {events.map((e) => (
            <li className="ev school" key={e.event_name + e.start_date}>
              <DateBlock date={e.start_date} lang={lang} />
              <span>
                <b>{e.event_name}</b><br /><small>{range(e)}</small><br />
                <small>
                  {t(lang, "Verificado", "Verified")}: {formatDate(e.verified_at, lang)}
                  {e.source_url && <>{" · "}<a href={e.source_url} rel="noopener">{t(lang, "Fuente", "Source")}</a></>}
                </small>
              </span>
            </li>
          ))}
        </ul>}
      </main>
      <TabBar current="mas" lang={lang} />
    </>
  );
}
