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
import { MAS_CSS } from "../../lib/page-css";

export const config = { unstable_runtimeJS: false };

type Extras = {
  next_holiday: { date: string; name: string } | null;
  emergency: { number: string } | null;
  consulate: { city: string } | null;
  lottery: { game: string } | null;
} | null;

// Why an arrival date was not saved (pages/api/arrival.ts).
const ARRIVAL_ERRORS: Record<string, [string, string]> = {
  "arrival-date": ["Escribe una fecha completa: día, mes y año.", "Enter a full date: day, month and year."],
  "arrival-range": ["No se guardó: la fecha tiene que estar a menos de 400 días de hoy y no después de tu regreso.",
                    "Not saved: the date must be within 400 days of today and not after your going-home date."],
};

type Props = { client: Client; x: Extras; e: string | null; ok: boolean };

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const loaded = await loadClient(ctx);
  if ("redirect" in loaded) return loaded;
  const { rows } = await db().query("select app.home_extras($1) as x", [loaded.client.id]);
  await recordView(loaded.client.id, "mas", {});
  const e = typeof ctx.query.e === "string" && ctx.query.e in ARRIVAL_ERRORS ? ctx.query.e : null;
  return { props: { client: loaded.client, x: rows[0]?.x ?? null, e, ok: ctx.query.ok === "arrival" } };
};

// "15 de septiembre" is itself a holiday's name in Honduras: say it once.
function nextHoliday(h: { date: string; name: string }, lang: "es" | "en"): string {
  const day = formatDate(h.date, lang);
  return h.name.toLowerCase().includes(day.toLowerCase()) ? h.name : `${day} · ${h.name}`;
}

export default function Mas({ client, x, e, ok }: Props) {
  const lang = client.language;
  const links: [string, ArtName, string, string, string | null][] = [
    ["/noticias", "news", "Noticias", "News", null],
    ["/mas/tasa", "money", "Tasa de referencia", "Reference rate", `${FLAG.CA} CAD → ${FLAG[client.country]}`],
    ["/mas/feriados", "calendar", "Feriados", "Public holidays", x?.next_holiday ? nextHoliday(x.next_holiday, lang) : null],
    ["/mas/escuela", "school", "Calendario escolar", "School calendar", null],
    ["/mas/consulado", "consulate", "Consulado", "Consulate", x?.consulate?.city ?? null],
    ["/mas/emergencias", "phone", "Emergencias", "Emergencies", x?.emergency?.number ?? null],
    ["/mas/transporte", "bus", "Transporte", "Getting around", "Leamington · Windsor"],
    ["/mas/loteria", "lottery", "Lotería", "Lottery", x?.lottery?.game ?? null],
    ["/mas/avisos", "bell", "Notificaciones", "Notifications", null],
    ["/setup/municipality?edit=1", "settings", "Mis ajustes", "My settings", client.municipality],
    ["/mas/semana", "week", "Tu semana", "Your week", null],
  ];
  // The school calendar leads for parents; everyone can still find it.
  if (client.hasKids) links.unshift(links.splice(links.findIndex((l) => l[0] === "/mas/escuela"), 1)[0]);

  return (
    <>
      <Head>
        <title>{`${t(lang, "Más", "More")} · Hoy`}</title>
        <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
        <style dangerouslySetInnerHTML={{ __html: MAS_CSS }} />
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
        {/* The day they arrived this season (0041), for the season ring: seasonal members only. */}
        {client.segment === "seasonal" && (
          <section id="llegada" className="card llegada">
            <h2>{t(lang, "Llegué a Canadá el…", "I arrived in Canada on…")}</h2>
            {e && <p className="err" role="alert">{t(lang, ...ARRIVAL_ERRORS[e])}</p>}
            {ok && !e && <p className="ok" role="status">{t(lang, "Guardado.", "Saved.")}</p>}
            <form method="post" action="/api/arrival" className="arr">
              <label htmlFor="arrival" className="sr">{t(lang, "Fecha de llegada", "Arrival date")}</label>
              <input id="arrival" name="date" type="date" defaultValue={client.arrivalDate ?? ""} />
              <button type="submit">{t(lang, "Guardar", "Save")}</button>
            </form>
            <small>{t(lang, "Déjala vacía para borrarla.", "Leave it empty to clear it.")}</small>
          </section>
        )}
        {/* Modo noche (0046) and Letra grande: each choice a full-width row (a preview, the name and a short hint, a check on the current one). */}
        <section id="tema" className="card letra">
          <h2>{t(lang, "Tema", "Theme")}</h2>
          <form method="post" action="/api/theme" className="optlist">
            {(["auto", "light", "dark"] as const).map((v) => (
              <button key={v} type="submit" name="theme" value={v} className={client.theme === v ? "on" : "secondary"} aria-pressed={client.theme === v}>
                <span className={`sw ${v}`} aria-hidden="true" />
                <span className="ot">
                  <b>{v === "auto" ? t(lang, "Automático", "Automatic") : v === "light" ? t(lang, "Claro", "Light") : t(lang, "Oscuro", "Dark")}</b>
                  <small>{v === "auto" ? t(lang, "Como tu teléfono", "Like your phone") : v === "light" ? t(lang, "Fondo claro", "Light background") : t(lang, "Fondo oscuro, para la noche", "Dark background, for night")}</small>
                </span>
                <span className="ck" aria-hidden="true">{client.theme === v ? "✓" : ""}</span>
              </button>
            ))}
          </form>
        </section>
        <section id="letra" className="card letra">
          <h2>{t(lang, "Tamaño de letra", "Text size")}</h2>
          <form method="post" action="/api/text-size" className="optlist">
            {(["normal", "large"] as const).map((size) => (
              <button key={size} type="submit" name="size" value={size} className={client.textSize === size ? "on" : "secondary"}
                      aria-pressed={client.textSize === size}>
                <span className={size === "large" ? "az l" : "az"} aria-hidden="true">Aa</span>
                <span className="ot">
                  <b>{size === "large" ? t(lang, "Grande", "Large") : t(lang, "Normal", "Normal")}</b>
                  <small>{size === "large" ? t(lang, "Letra más grande en toda la app", "Bigger text everywhere in the app") : t(lang, "El tamaño de siempre", "The usual size")}</small>
                </span>
                <span className="ck" aria-hidden="true">{client.textSize === size ? "✓" : ""}</span>
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
