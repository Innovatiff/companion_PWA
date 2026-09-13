/**
 * Clima: official warnings first, then the forecast for their towns, then the
 * last 30 days of warnings.
 *
 * Warnings are shown verbatim: agency, level, place, issue time, source link.
 * The section never says "no warnings". When our copy is current it says when we
 * last checked the agency; when it is stale it says since when we could not,
 * and links to the agency's own page. A stale list is never shown as the list.
 *
 * Forecast days follow the home-line rules (0023): at least two providers
 * updated within 12 hours, a range when they disagree. A day without that is
 * absent.
 */
import Head from "next/head";
import type { GetServerSideProps } from "next";
import { TabBar } from "@leamington/shared/src/ui/TabBar.tsx";
import { formatDate, formatTime12, formatWeekdayDate, localDate } from "@leamington/shared/src/format.ts";
import { db } from "../lib/db";
import { loadClient, recordView } from "../lib/client";
import { t } from "../lib/t";

export const config = { unstable_runtimeJS: false };

type Alert = {
  id: number; agency: string; level: string; msg_type: string | null; event: string | null; headline: string | null;
  description: string | null; instruction: string | null; area_desc: string | null;
  issued_at: string | null; expires_at: string | null; source_url: string | null;
  cancelled_at: string | null; superseded: boolean;
};
type Day = { date: string; temp: string; low: number | null; text: string };
type Town = { id: number; name: string; admin_region: string; is_home: boolean; days: Day[] };
type Weather = {
  language: "es" | "en"; timezone: string; has_home: boolean; towns: Town[];
  alerts_state: "current" | "stale" | "not_monitored"; alerts_checked_at: string | null;
  agency: string | null; agency_url: string | null;
  alerts_here: Alert[] | null; alerts_elsewhere: Alert[] | null; history: Alert[];
};
type Props = { w: Weather; country: string; today: string };

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  // Official warnings stay available after a paid period ends (OPEN-DECISIONS 3.6).
  const loaded = await loadClient(ctx, { allowUnpaid: true });
  if ("redirect" in loaded) return loaded;
  const { client } = loaded;
  const { rows } = await db().query("select app.weather_page($1) as w", [client.id]);
  const w = rows[0]?.w as Weather;
  await recordView(client.id, "clima", {
    alerts_state: w.alerts_state, alerts_checked_at: w.alerts_checked_at,
    alerts_here: w.alerts_here?.length ?? null, alerts_elsewhere: w.alerts_elsewhere?.length ?? null,
    has_home: w.has_home, towns: w.towns.map((town) => ({ id: town.id, days: town.days.length })),
    history: w.history.length,
  });
  return { props: { w, country: client.country, today: localDate(new Date(), client.timezone) } };
};

const LEVEL: Record<string, [string, string]> = {
  red: ["Rojo", "Red"], orange: ["Naranja", "Orange"], yellow: ["Amarillo", "Yellow"], green: ["Verde", "Green"],
};
const COUNTRY: Record<string, [string, string]> = {
  MX: ["México", "Mexico"], GT: ["Guatemala", "Guatemala"], HN: ["Honduras", "Honduras"], JM: ["Jamaica", "Jamaica"],
};

export default function Clima({ w, country, today }: Props) {
  const lang = w.language;
  const tz = w.timezone;
  const pick = (pair: [string, string] | undefined, fallback: string) => (pair ? pair[lang === "en" ? 1 : 0] : fallback);
  const moment = (iso: string) => {
    const day = localDate(iso, tz);
    return day === today ? formatTime12(iso, tz) : `${formatTime12(iso, tz)}, ${formatDate(day, lang)}`;
  };
  const dayName = (date: string, i: number) =>
    date === today ? t(lang, "Hoy", "Today") : i === 1 && date > today ? t(lang, "Mañana", "Tomorrow") : formatWeekdayDate(date, lang);

  const card = (a: Alert) => (
    <div key={a.id} className={`alert ${a.level}`}>
      <span className="level">
        {pick(LEVEL[a.level], a.level)}
        {a.msg_type === "Update" ? ` · ${t(lang, "Actualización", "Update")}` : ""}
      </span>
      <p><strong>{a.headline ?? a.event}</strong></p>
      {a.area_desc && <p>{a.area_desc}</p>}
      <p><small>
        {a.issued_at && <>{t(lang, "Emitido", "Issued")}: {moment(a.issued_at)}</>}
        {a.expires_at && <><br />{t(lang, "Vence", "Expires")}: {moment(a.expires_at)}</>}
      </small></p>
      {(a.description || a.instruction) && (
        <details>
          <summary>{t(lang, "Texto completo", "Full text")}</summary>
          {a.description && <p>{a.description}</p>}
          {a.instruction && <p>{a.instruction}</p>}
        </details>
      )}
      {a.source_url && <p><small><a href={a.source_url} rel="noopener">{t(lang, "Fuente", "Source")}: {a.agency}</a></small></p>}
    </div>
  );

  const agencyLink = w.agency_url && w.agency && (
    <p><a href={w.agency_url} rel="noopener">{t(lang, `Ver avisos de ${w.agency}`, `See ${w.agency} warnings`)}</a></p>
  );

  return (
    <>
      <Head>
        <title>{`${t(lang, "Clima", "Weather")} · Hoy`}</title>
        <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
      </Head>
      <main>
        <h1>{t(lang, "Clima", "Weather")}</h1>

        <h2>{t(lang, "Avisos oficiales", "Official warnings")}</h2>
        {w.alerts_state === "current" && (
          <>
            {w.alerts_here?.map(card)}
            <p><small>
              {t(lang, `Revisamos los avisos de ${w.agency} a las ${moment(w.alerts_checked_at!)}.`,
                       `We checked ${w.agency} warnings at ${moment(w.alerts_checked_at!)}.`)}
            </small></p>
            {w.alerts_elsewhere && w.alerts_elsewhere.length > 0 && (
              <details>
                <summary>{t(lang, `En otras partes de ${pick(COUNTRY[country], country)}`, `Elsewhere in ${pick(COUNTRY[country], country)}`)} ({w.alerts_elsewhere.length})</summary>
                {w.alerts_elsewhere.map(card)}
              </details>
            )}
          </>
        )}
        {w.alerts_state === "stale" && (
          <>
            <p>
              {w.alerts_checked_at
                ? t(lang, `No hemos podido revisar los avisos de ${w.agency} desde las ${moment(w.alerts_checked_at)}.`,
                          `We have not been able to check ${w.agency} warnings since ${moment(w.alerts_checked_at)}.`)
                : t(lang, `No hemos podido revisar los avisos de ${w.agency}.`, `We have not been able to check ${w.agency} warnings.`)}
            </p>
            {agencyLink}
          </>
        )}
        {w.alerts_state === "not_monitored" && (
          <>
            <p>{t(lang, `Hoy todavía no recibe los avisos de ${w.agency ?? "tu país"}. Consúltalos en su página.`,
                        `Hoy does not receive ${w.agency ?? "your country's"} warnings yet. Check their page.`)}</p>
            {agencyLink}
          </>
        )}

        {!w.has_home && (
          <a className="prompt" href="/setup/municipality">{t(lang, "Elige tu municipio para ver el clima →", "Choose your town to see the weather →")}</a>
        )}
        {w.towns.filter((town) => town.days.length > 0).map((town) => (
          <section key={town.id}>
            <h2>{town.name}</h2>
            <ul className="rows">
              {town.days.map((d, i) => (
                <li key={d.date}>
                  <small>{dayName(d.date, i)}</small><br />
                  {d.text}{d.low != null && <small> · {t(lang, "mín", "low")} {d.low}°</small>}
                </li>
              ))}
            </ul>
          </section>
        ))}

        {w.history.length > 0 && (
          <details>
            <summary>{t(lang, "Avisos de los últimos 30 días", "Warnings from the last 30 days")}</summary>
            <ul className="rows">
              {w.history.map((a) => (
                <li key={a.id}>
                  <small>
                    {pick(LEVEL[a.level], a.level)} · {a.issued_at && moment(a.issued_at)} · {
                      a.cancelled_at ? t(lang, "cancelado", "cancelled")
                        : a.superseded ? t(lang, "reemplazado", "replaced")
                        : t(lang, "terminó", "ended")}
                  </small><br />
                  {a.headline ?? a.event}{a.area_desc && <><br /><small>{a.area_desc}</small></>}
                  {a.source_url && <><br /><small><a href={a.source_url} rel="noopener">{t(lang, "Fuente", "Source")}: {a.agency}</a></small></>}
                </li>
              ))}
            </ul>
          </details>
        )}
      </main>
      <TabBar current="clima" lang={lang} />
    </>
  );
}
