/**
 * Consulado: their country's consulate serving Windsor-Essex. Address, hours,
 * phone and the booking link only. We never scrape appointment availability.
 */
import Head from "next/head";
import type { GetServerSideProps } from "next";
import { TabBar } from "@leamington/shared/src/ui/TabBar.tsx";
import { formatDate } from "@leamington/shared/src/format.ts";
import { db } from "../../lib/db";
import { loadClient, recordView } from "../../lib/client";
import { t } from "../../lib/t";

export const config = { unstable_runtimeJS: false };

type Service = { name: string; cost?: string | null; documents?: string[] | null };
type Consulate = {
  id: number; city: string; address: string | null; hours: string | null; phone: string | null; email: string | null;
  booking_url: string | null; services: Service[] | null; verified_at: string; source_url: string | null;
};
type Props = { lang: "es" | "en"; consulates: Consulate[] };

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const loaded = await loadClient(ctx);
  if ("redirect" in loaded) return loaded;
  const { client } = loaded;
  const { rows } = await db().query(
    `select id::int, city, address, hours, phone, email, booking_url, services,
            to_char(verified_at, 'YYYY-MM-DD') as verified_at, source_url
       from consulates where country = $1
      order by (city = 'Leamington') desc, city`, [client.country]);
  await recordView(client.id, "consulado", { consulates: rows.length });
  return { props: { lang: client.language, consulates: rows } };
};

const tel = (n: string) => `tel:${n.replace(/[^\d+]/g, "")}`;

export default function Consulado({ lang, consulates }: Props) {
  return (
    <>
      <Head>
        <title>{`${t(lang, "Consulado", "Consulate")} · Hoy`}</title>
        <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
      </Head>
      <main>
        <p><a href="/mas">← {t(lang, "Más", "More")}</a></p>
        <h1>{t(lang, "Consulado", "Consulate")}</h1>
        {consulates.map((c) => (
          <section key={c.id}>
            <h2>{c.city}</h2>
            {c.address && <p>{c.address}</p>}
            {c.hours && <p><small>{t(lang, "Horario", "Hours")}</small><br />{c.hours}</p>}
            {c.phone && <p><a href={tel(c.phone)}>{c.phone}</a></p>}
            {c.email && <p><a href={`mailto:${c.email}`}>{c.email}</a></p>}
            {c.booking_url && <p><a className="button secondary" href={c.booking_url} rel="noopener">{t(lang, "Pedir cita", "Book an appointment")}</a></p>}
            {c.services && c.services.length > 0 && (
              <ul className="rows">
                {c.services.map((s) => (
                  <li key={s.name}>
                    {s.name}{s.cost && <small> · {s.cost}</small>}
                    {s.documents && s.documents.length > 0 && <><br /><small>{s.documents.join(" · ")}</small></>}
                  </li>
                ))}
              </ul>
            )}
            <p><small>
              {t(lang, "Verificado", "Verified")}: {formatDate(c.verified_at, lang)}
              {c.source_url && <>{" · "}<a href={c.source_url} rel="noopener">{t(lang, "Fuente", "Source")}</a></>}
            </small></p>
          </section>
        ))}
      </main>
      <TabBar current="mas" lang={lang} />
    </>
  );
}
