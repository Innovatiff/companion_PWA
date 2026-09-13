/**
 * Más: everything that is not a morning glance. Plain links, one per row.
 */
import Head from "next/head";
import type { GetServerSideProps } from "next";
import { TabBar } from "@leamington/shared/src/ui/TabBar.tsx";
import { loadClient, recordView, type Client } from "../../lib/client";
import { t } from "../../lib/t";

export const config = { unstable_runtimeJS: false };

export const getServerSideProps: GetServerSideProps<{ client: Client }> = async (ctx) => {
  const loaded = await loadClient(ctx);
  if ("redirect" in loaded) return loaded;
  await recordView(loaded.client.id, "mas", {});
  return { props: { client: loaded.client } };
};

export default function Mas({ client }: { client: Client }) {
  const lang = client.language;
  const links: [string, string, string][] = [
    ["/mas/tasa", "Tasa de referencia", "Reference rate"],
    ["/mas/feriados", "Feriados", "Public holidays"],
    ["/mas/escuela", "Calendario escolar", "School calendar"],
    ["/mas/consulado", "Consulado", "Consulate"],
    ["/mas/emergencias", "Emergencias", "Emergencies"],
    ["/mas/transporte", "Transporte", "Getting around"],
    ["/mas/loteria", "Lotería", "Lottery"],
    ["/mas/avisos", "Notificaciones", "Notifications"],
    ["/setup/municipality?edit=1", "Mis ajustes", "My settings"],
  ];
  // The school calendar leads for parents; everyone can still find it.
  if (client.hasKids) links.unshift(links.splice(2, 1)[0]);

  return (
    <>
      <Head>
        <title>{`${t(lang, "Más", "More")} · Hoy`}</title>
        <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
      </Head>
      <main>
        <h1>{t(lang, "Más", "More")}</h1>
        <ul className="rows">
          {links.map(([href, es, en]) => (
            <li key={href}><a href={href}>{t(lang, es, en)}</a></li>
          ))}
        </ul>
        <p><small>{t(lang, "Lista de municipios: GeoNames (CC BY 4.0).", "Town list: GeoNames (CC BY 4.0).")}</small></p>
      </main>
      <TabBar current="mas" lang={lang} />
    </>
  );
}
