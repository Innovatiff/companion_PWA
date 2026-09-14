/**
 * Transporte: getting around Leamington and Windsor. Curated records, each with
 * "Verificado: {date}".
 */
import Head from "next/head";
import type { GetServerSideProps } from "next";
import { formatDate } from "@leamington/shared/src/format.ts";
import { db } from "../../lib/db";
import { loadClient, recordView } from "../../lib/client";
import { t } from "../../lib/t";
import { PageHead, TabBar } from "../../lib/frame";
import { Pic } from "../../lib/ui";

export const config = { unstable_runtimeJS: false };

type Transit = {
  id: number; area: string; operator: string; name: string; description: string | null; fares: string | null;
  schedule_url: string | null; contact: string | null; verified_at: string; source_url: string | null;
};
type Props = { lang: "es" | "en"; transit: Transit[] };

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const loaded = await loadClient(ctx);
  if ("redirect" in loaded) return loaded;
  const { client } = loaded;
  const { rows } = await db().query(
    `select id::int, area, operator, name, description, fares, schedule_url, contact,
            to_char(verified_at, 'YYYY-MM-DD') as verified_at, source_url
       from transit
      order by array_position(array['Leamington', 'Windsor-Essex', 'Windsor'], area), kind, name`);
  await recordView(client.id, "transporte", { records: rows.length });
  return { props: { lang: client.language, transit: rows } };
};

export default function Transporte({ lang, transit }: Props) {
  const areas = [...new Set(transit.map((r) => r.area))];
  return (
    <>
      <Head>
        <title>{`${t(lang, "Transporte", "Getting around")} · Hoy`}</title>
        <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
      </Head>
      <main>
        <PageHead lang={lang} title={t(lang, "Transporte", "Getting around")} art="bus" back />
        {areas.map((area) => (
          <section key={area}>
            <h2>{area}</h2>
            <ul className="rows">
              {transit.filter((r) => r.area === area).map((r) => (
                <li className="ev" key={r.id}>
                  <Pic name="bus" lazy />
                  <span>
                    <strong>{r.name}</strong><br /><small>{r.operator}</small>
                    {r.description && <p>{r.description}</p>}
                    {r.fares && <p><small>{t(lang, "Tarifa", "Fare")}: {r.fares}</small></p>}
                    {r.contact && <p><small>{r.contact}</small></p>}
                    <small>
                      {r.schedule_url && <><a href={r.schedule_url} rel="noopener">{t(lang, "Horarios", "Schedules")}</a>{" · "}</>}
                      {t(lang, "Verificado", "Verified")}: {formatDate(r.verified_at, lang)}
                    </small>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </main>
      <TabBar current="mas" lang={lang} />
    </>
  );
}
