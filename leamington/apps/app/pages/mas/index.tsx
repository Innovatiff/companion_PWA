/**
 * Más: everything that is not a morning glance, as a grid of picture tiles.
 * Where a real record exists (app.home_extras, 0033), a tile says what is
 * inside: the next holiday, their consulate's city, the latest draw's game.
 * Otherwise the tile is its picture and its name, nothing more.
 */
import Head from "next/head";
import type { GetServerSideProps } from "next";
import { formatDate } from "@leamington/shared/src/format.ts";
import { db } from "../../lib/db";
import { loadClient, recordView, type Client } from "../../lib/client";
import { t } from "../../lib/t";
import { PageHead, TabBar } from "../../lib/frame";
import { FLAG, Pic, type ArtName } from "../../lib/ui";

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

// "15 de septiembre" is itself a holiday's name in Honduras: say it once.
function nextHoliday(h: { date: string; name: string }, lang: "es" | "en"): string {
  const day = formatDate(h.date, lang);
  return h.name.toLowerCase().includes(day.toLowerCase()) ? h.name : `${day} · ${h.name}`;
}

export default function Mas({ client, x }: { client: Client; x: Extras }) {
  const lang = client.language;
  const links: [string, ArtName, string, string, string | null][] = [
    ["/mas/tasa", "money", "Tasa de referencia", "Reference rate", `${FLAG.CA} CAD → ${FLAG[client.country]}`],
    ["/mas/feriados", "calendar", "Feriados", "Public holidays", x?.next_holiday ? nextHoliday(x.next_holiday, lang) : null],
    ["/mas/escuela", "school", "Calendario escolar", "School calendar", null],
    ["/mas/consulado", "consulate", "Consulado", "Consulate", x?.consulate?.city ?? null],
    ["/mas/emergencias", "phone", "Emergencias", "Emergencies", x?.emergency?.number ?? null],
    ["/mas/transporte", "bus", "Transporte", "Getting around", "Leamington · Windsor"],
    ["/mas/loteria", "lottery", "Lotería", "Lottery", x?.lottery?.game ?? null],
    ["/mas/avisos", "bell", "Notificaciones", "Notifications", null],
    ["/setup/municipality?edit=1", "settings", "Mis ajustes", "My settings", client.municipality],
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
        <PageHead lang={lang} title={t(lang, "Más", "More")} art="crown" />
        <ul className="menu">
          {links.map(([href, art, es, en, sub]) => (
            <li key={href}>
              <a href={href}>
                <Pic name={art} />
                <span>{t(lang, es, en)}{sub && <small>{sub}</small>}</span>
              </a>
            </li>
          ))}
        </ul>
        {/* Letra grande: two big previews; the current one is marked. */}
        <section id="letra" className="card letra">
          <h2>{t(lang, "Tamaño de letra", "Text size")}</h2>
          <form method="post" action="/api/text-size" className="aa">
            {(["normal", "large"] as const).map((size) => (
              <button key={size} type="submit" name="size" value={size} className={client.textSize === size ? "on" : "secondary"}
                      aria-pressed={client.textSize === size}>
                <span className={size === "large" ? "a2" : "a1"} aria-hidden="true">Aa</span>
                {size === "large" ? t(lang, "Grande", "Large") : t(lang, "Normal", "Normal")}
              </button>
            ))}
          </form>
        </section>
        <p><small>{t(lang, "Lista de municipios: GeoNames (CC BY 4.0).", "Town list: GeoNames (CC BY 4.0).")}</small></p>
      </main>
      <TabBar current="mas" lang={lang} />
    </>
  );
}
