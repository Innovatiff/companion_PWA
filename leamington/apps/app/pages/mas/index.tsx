/**
 * Más: everything that is not a morning glance, as a grid of large tiles.
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

// Stroke icons on a 24px grid, inline so they cost no request.
const ICON = {
  tasa: '<path d="M4 8h13l-3-3M20 16H7l3 3"/>',
  feriados: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  escuela: '<path d="M4 5h6a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H4zM20 5h-6a2 2 0 0 0-2 2v13a2 2 0 0 1 2-2h6z"/>',
  consulado: '<path d="M3 21h18M5 21V10l7-5 7 5v11M9 21v-5h6v5"/>',
  emergencias: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
  transporte: '<rect x="4" y="3" width="16" height="14" rx="3"/><path d="M4 11h16M8 21v-4M16 21v-4"/>',
  loteria: '<path d="m12 3 2.6 5.6 6 .6-4.5 4 1.3 6L12 16.2l-5.4 3 1.3-6-4.5-4 6-.6z"/>',
  avisos: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>',
  ajustes: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
} as const;

export default function Mas({ client }: { client: Client }) {
  const lang = client.language;
  const links: [string, keyof typeof ICON, string, string][] = [
    ["/mas/tasa", "tasa", "Tasa de referencia", "Reference rate"],
    ["/mas/feriados", "feriados", "Feriados", "Public holidays"],
    ["/mas/escuela", "escuela", "Calendario escolar", "School calendar"],
    ["/mas/consulado", "consulado", "Consulado", "Consulate"],
    ["/mas/emergencias", "emergencias", "Emergencias", "Emergencies"],
    ["/mas/transporte", "transporte", "Transporte", "Getting around"],
    ["/mas/loteria", "loteria", "Lotería", "Lottery"],
    ["/mas/avisos", "avisos", "Notificaciones", "Notifications"],
    ["/setup/municipality?edit=1", "ajustes", "Mis ajustes", "My settings"],
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
        <ul className="menu">
          {links.map(([href, icon, es, en]) => (
            <li key={href}>
              <a href={href}>
                <span className="mi"><svg viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICON[icon] }} /></span>
                {t(lang, es, en)}
              </a>
            </li>
          ))}
        </ul>
        <p><small>{t(lang, "Lista de municipios: GeoNames (CC BY 4.0).", "Town list: GeoNames (CC BY 4.0).")}</small></p>
      </main>
      <TabBar current="mas" lang={lang} />
    </>
  );
}
