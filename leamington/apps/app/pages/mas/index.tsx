/**
 * Más: everything that is not a morning glance, as a grid of large tiles.
 * Where a real record exists (app.home_extras, 0033), a tile says what is
 * inside: the next holiday, their consulate's city, the latest draw's game.
 */
import Head from "next/head";
import type { GetServerSideProps } from "next";
import { TabBar } from "@leamington/shared/src/ui/TabBar.tsx";
import { formatDate } from "@leamington/shared/src/format.ts";
import { db } from "../../lib/db";
import { loadClient, recordView, type Client } from "../../lib/client";
import { t } from "../../lib/t";
import { FLAG, Icon, type IconName } from "../../lib/ui";

export const config = { unstable_runtimeJS: false };

type Extras = {
  next_holiday: { date: string; name: string } | null;
  emergency: { number: string } | null;
  consulate: { city: string } | null;
  lottery: { game: string } | null;
} | null;

export const getServerSideProps: GetServerSideProps<{ client: Client; x: Extras }> = async (ctx) => {
  const loaded = await loadClient(ctx);
  if ("redirect" in loaded) return loaded;
  const { rows } = await db().query("select app.home_extras($1) as x", [loaded.client.id]);
  await recordView(loaded.client.id, "mas", {});
  return { props: { client: loaded.client, x: rows[0]?.x ?? null } };
};

// Each tile's icon colours: background, then ink.
const TONE: Record<string, [string, string]> = {
  tasa: ["#fdf0dc", "#9a4a00"], feriados: ["#fdecea", "#b42318"], escuela: ["#e2f5ec", "#0f7a55"],
  consulado: ["#ecebff", "#3533cd"], emergencias: ["#ffeef5", "#b3246b"], transporte: ["#e5efff", "#1d5fd1"],
  loteria: ["#fff3cf", "#8a5200"], avisos: ["#f1e8ff", "#6b2fbf"], ajustes: ["#eef0f6", "#474c68"],
};

// "15 de septiembre" is itself a holiday's name in Honduras: say it once.
function nextHoliday(h: { date: string; name: string }, lang: "es" | "en"): string {
  const day = formatDate(h.date, lang);
  return h.name.toLowerCase().includes(day.toLowerCase()) ? h.name : `${day} · ${h.name}`;
}

export default function Mas({ client, x }: { client: Client; x: Extras }) {
  const lang = client.language;
  const links: [string, string, IconName, string, string, string][] = [
    ["/mas/tasa", "tasa", "swap", "Tasa de referencia", "Reference rate", `${FLAG.CA} CAD → ${FLAG[client.country]}`],
    ["/mas/feriados", "feriados", "calendar", "Feriados", "Public holidays",
      x?.next_holiday ? nextHoliday(x.next_holiday, lang) : t(lang, "Días festivos nacionales", "National holidays")],
    ["/mas/escuela", "escuela", "book", "Calendario escolar", "School calendar", t(lang, "Calendario nacional", "National calendar")],
    ["/mas/consulado", "consulado", "building", "Consulado", "Consulate",
      x?.consulate?.city ?? t(lang, "Dirección y teléfono", "Address and phone")],
    ["/mas/emergencias", "emergencias", "phone", "Emergencias", "Emergencies",
      x?.emergency ? t(lang, `${x.emergency.number} y otros números`, `${x.emergency.number} and other numbers`) : t(lang, "Números para llamar", "Numbers to call")],
    ["/mas/transporte", "transporte", "bus", "Transporte", "Getting around", "Leamington · Windsor"],
    ["/mas/loteria", "loteria", "star", "Lotería", "Lottery", x?.lottery?.game ?? t(lang, "Resultados oficiales", "Official results")],
    ["/mas/avisos", "avisos", "bell", "Notificaciones", "Notifications", t(lang, "Alertas en este teléfono", "Alerts on this phone")],
    ["/setup/municipality?edit=1", "ajustes", "sliders", "Mis ajustes", "My settings", client.municipality ?? t(lang, "Tu municipio y tus datos", "Your town and details")],
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
          {links.map(([href, key, icon, es, en, sub]) => (
            <li key={href}>
              <a href={href}>
                <span className="mi" style={{ background: TONE[key][0], color: TONE[key][1] }}><Icon name={icon} /></span>
                <span>{t(lang, es, en)}<small>{sub}</small></span>
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
