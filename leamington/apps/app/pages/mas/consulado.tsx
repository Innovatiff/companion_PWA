/**
 * Consulado: their country's consulate serving Windsor-Essex. Address, hours,
 * phone and the booking link only. We never scrape appointment availability,
 * and there is no external map.
 */
import Head from "next/head";
import type { GetServerSideProps } from "next";
import { formatDate } from "@leamington/shared/src/format.ts";
import { db } from "../../lib/db";
import { loadClient, recordView } from "../../lib/client";
import { t } from "../../lib/t";
import { PageHead, TabBar } from "../../lib/frame";
import { FLAG, Icon, Pic, tel } from "../../lib/ui";

export const config = { unstable_runtimeJS: false };

type Service = { name: string; cost?: string | null; documents?: string[] | null };
type Consulate = {
  id: number; city: string; address: string | null; hours: string | null; phone: string | null; email: string | null;
  booking_url: string | null; services: Service[] | null; verified_at: string; source_url: string | null;
};
type Props = { lang: "es" | "en"; country: string; consulates: Consulate[] };

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
  return { props: { lang: client.language, country: client.country, consulates: rows } };
};

export default function Consulado({ lang, country, consulates }: Props) {
  return (
    <>
      <Head>
        <title>{`${t(lang, "Consulado", "Consulate")} · Hoy`}</title>
        <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
      </Head>
      <main>
        <PageHead lang={lang} title={t(lang, "Consulado", "Consulate")} art="consulate" back />
        {consulates.map((c) => (
          <section key={c.id}>
            <div className="card">
              <div className="dialrow">
                <Pic name="pin" lazy />
                <span>
                  <small>{FLAG[country]} {t(lang, "Consulado en", "Consulate in")}</small>
                  <p className="line">{c.city}</p>
                </span>
              </div>
              {c.address && <p className="inf"><span className="i"><Icon name="pin" /></span><span>{c.address}</span></p>}
              {c.hours && <p className="inf"><span className="i"><Icon name="clock" /></span><span>{c.hours}</span></p>}
              {c.phone && <p><a className="dial" href={tel(c.phone)}><Icon name="phone" />{c.phone}</a></p>}
              {c.email && <p className="inf"><span className="i"><Icon name="mail" /></span><a href={`mailto:${c.email}`}>{c.email}</a></p>}
              {c.booking_url && <a className="button secondary" href={c.booking_url} rel="noopener">{t(lang, "Pedir cita", "Book an appointment")}</a>}
              <p><small>
                {t(lang, "Verificado", "Verified")}: {formatDate(c.verified_at, lang)}
                {c.source_url && <>{" · "}<a href={c.source_url} rel="noopener">{t(lang, "Fuente", "Source")}</a></>}
              </small></p>
            </div>
            {c.services && c.services.length > 0 && (
              <>
                <h2>{t(lang, "Trámites", "Services")}</h2>
                <ul className="rows">
                  {c.services.map((s) => (
                    <li key={s.name}>
                      <b>{s.name}</b>{s.cost && <small> · {s.cost}</small>}
                      {s.documents && s.documents.length > 0 && <><br /><small>{s.documents.join(" · ")}</small></>}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        ))}
      </main>
      <TabBar current="mas" lang={lang} />
    </>
  );
}
