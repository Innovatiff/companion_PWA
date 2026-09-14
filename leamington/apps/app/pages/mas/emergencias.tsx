/**
 * Emergencias: numbers in Canada first (where they are), then their own
 * country's. Every number is a big tap-to-call card with "Verificado: {date}".
 */
import Head from "next/head";
import type { GetServerSideProps } from "next";
import { TabBar } from "@leamington/shared/src/ui/TabBar.tsx";
import { formatDate } from "@leamington/shared/src/format.ts";
import { db } from "../../lib/db";
import { loadClient, recordView } from "../../lib/client";
import { t } from "../../lib/t";
import { FLAG, Icon, tel } from "../../lib/ui";

export const config = { unstable_runtimeJS: false };

type Contact = { id: number; country: string; region: string; label: string; number: string; notes: string | null; verified_at: string; source_url: string | null };
type Props = { lang: "es" | "en"; country: string; contacts: Contact[] };

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const loaded = await loadClient(ctx);
  if ("redirect" in loaded) return loaded;
  const { client } = loaded;
  const { rows } = await db().query(
    `select id::int, country, region, label, number, notes, to_char(verified_at, 'YYYY-MM-DD') as verified_at, source_url
       from emergency_contacts
      where country in ('CA', $1)
      order by (country = 'CA') desc, (number = '911') desc, region, label`, [client.country]);
  await recordView(client.id, "emergencias", { canada: rows.filter((r) => r.country === "CA").length, home: rows.filter((r) => r.country !== "CA").length });
  return { props: { lang: client.language, country: client.country, contacts: rows } };
};

const NAMES: Record<string, [string, string]> = {
  CA: ["En Canadá", "In Canada"], MX: ["México", "Mexico"], GT: ["Guatemala", "Guatemala"], HN: ["Honduras", "Honduras"], JM: ["Jamaica", "Jamaica"],
};

export default function Emergencias({ lang, country, contacts }: Props) {
  return (
    <>
      <Head>
        <title>{`${t(lang, "Emergencias", "Emergencies")} · Hoy`}</title>
        <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
      </Head>
      <main>
        <p><a href="/mas">← {t(lang, "Más", "More")}</a></p>
        <h1>{t(lang, "Emergencias", "Emergencies")}</h1>
        {["CA", country].map((c) => {
          const list = contacts.filter((r) => r.country === c);
          return list.length === 0 ? null : (
            <section key={c}>
              <h2>{FLAG[c]} {NAMES[c]?.[lang === "en" ? 1 : 0] ?? c}</h2>
              {list.map((r) => (
                <div key={r.id} className={`card${r.country === "CA" && r.number === "911" ? " sos" : ""}`}>
                  <a className="dialrow" href={tel(r.number)}>
                    <span className="ico"><Icon name="phone" /></span>
                    <span>
                      <small>{r.label}</small>
                      <span className="num">{r.number}</span>
                    </span>
                  </a>
                  <p><small>
                    {(r.region || r.notes) && <>{[r.region, r.notes].filter(Boolean).join(" · ")}<br /></>}
                    {t(lang, "Verificado", "Verified")}: {formatDate(r.verified_at, lang)}
                    {r.source_url && <>{" · "}<a href={r.source_url} rel="noopener">{t(lang, "Fuente", "Source")}</a></>}
                  </small></p>
                </div>
              ))}
            </section>
          );
        })}
      </main>
      <TabBar current="mas" lang={lang} />
    </>
  );
}
