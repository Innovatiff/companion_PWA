/**
 * Home: a morning message, not a dashboard.
 *
 *   Buenos días, {name}
 *   {team} juega hoy 7pm          only when a fixture exists
 *   {municipality}: 28°, lluvia   their home town
 *   1 CAD = 18.51 HNL ↑ (más alto en 12 días)
 *   Faltan 127 días               departure, or a settled user's next trip
 *
 * Every line comes from our Postgres via app.render_home, which decides what is
 * current enough to show. A line without current data is absent, never stale and
 * never a placeholder. If setup never reached the municipality, a single link
 * offers it at most once a day: never modal, never blocking. No client runtime
 * JS; one small inline script (see lib/open-script.ts).
 */
import Head from "next/head";
import type { GetServerSideProps } from "next";
import { TabBar } from "@leamington/shared/src/ui/TabBar.tsx";
import { formatCode } from "@leamington/shared/src/code.ts";
import { formatDate } from "@leamington/shared/src/format.ts";
import { db } from "../lib/db";
import { readSession, cookieValue, clearedCookie } from "../lib/session";
import { OPEN_SCRIPT } from "../lib/open-script";
import { recordView, type Access } from "../lib/client";
import { t } from "../lib/t";

export const config = { unstable_runtimeJS: false };

type Line = { key: string; text: string; valid_until: string; note?: string };
type Expired = { language: "es" | "en"; access: Access };
type Props =
  | { renderId: string; renderedAt: string; language: "es" | "en"; lines: Line[]; prompt: string | null; expired?: undefined }
  | { expired: Expired };

export const getServerSideProps: GetServerSideProps<Props> = async ({ req, res }) => {
  res.setHeader("Cache-Control", "private, no-cache");
  const clientId = readSession(cookieValue(req.headers.cookie));
  if (!clientId) return { redirect: { destination: "/login", permanent: false } };

  // No paid period covering today: the expiry screen instead of the morning message.
  const access = await db().query(
    "select language, app.client_access(id) as access from clients where id = $1 and active", [clientId]);
  const a = access.rows[0];
  if (a?.access && !a.access.paid) {
    (req as { appLang?: string }).appLang = a.language;
    await recordView(clientId, "expiry", { status: a.access.status, period_end: a.access.period_end });
    return { props: { expired: { language: a.language, access: a.access } } };
  }

  const { rows } = await db().query("select app.render_home($1) as m", [clientId]);
  const m = rows[0]?.m;
  if (!m) {
    res.setHeader("Set-Cookie", clearedCookie);
    return { redirect: { destination: "/login?e=inactive", permanent: false } };
  }

  (req as { appLang?: string }).appLang = m.language;
  return {
    props: {
      renderId: m.render_id, renderedAt: m.rendered_at, language: m.language, lines: m.lines, prompt: m.prompt ?? null,
    },
  };
};

/**
 * The expiry screen: the paid period has ended. It says so, shows the code
 * large, names the affiliate who registered them, and says any Hoy affiliate
 * can reactivate it on the spot. Official weather warnings stay one tap away.
 */
function ExpiryScreen({ language: lang, access: a }: Expired) {
  return (
    <>
      <Head>
        <title>Hoy</title>
        <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
      </Head>
      <main data-lang={lang}>
        <header className="hello">
          <h1>{a.status === "lapsed"
            ? t(lang, "Tu suscripción a Hoy terminó", "Your Hoy subscription has ended")
            : t(lang, "Tu cuenta de Hoy no tiene un periodo pagado", "Your Hoy account has no paid period")}</h1>
          {a.period_end && (
            <p>{t(lang, `Terminó el ${formatDate(a.period_end, lang, true)}.`, `It ended on ${formatDate(a.period_end, lang, true)}.`)}</p>
          )}
        </header>
        <section className="card">
          <small>{t(lang, "Tu código", "Your code")}</small>
          <p className="code">{formatCode(a.code)}</p>
          <p className="line">
            {t(lang, "Cualquier afiliado de Hoy puede reactivarla: muéstrale este código y paga $20.00 por 6 meses. Funciona otra vez en ese momento.",
                     "Any Hoy affiliate can reactivate it: show them this code and pay $20.00 for 6 months. It works again right away.")}
          </p>
          <p><small>
            {a.affiliate_is_house
              ? t(lang, "Te registró Hoy directamente.", "You were registered by Hoy directly.")
              : t(lang, `Te registró: ${a.affiliate_name}`, `Registered by: ${a.affiliate_name}`)}
          </small></p>
        </section>
        <a className="button secondary" href="/clima">
          {t(lang, "Los avisos oficiales del clima siguen aquí", "Official weather warnings are still here")}
        </a>
      </main>
    </>
  );
}

// Each home line as a card: an icon, a small label, the sentence, and a link to
// its section. The card carries data-line/data-until, so the offline script
// removes the whole card when the line expires.
const TILE: Record<string, { href?: string; es: string; en: string; icon: string }> = {
  fixture: { href: "/futbol", es: "Fútbol", en: "Football", icon: '<circle cx="12" cy="12" r="9"/><path d="m12 7 4 3-1.5 4.5h-5L8 10z"/>' },
  weather: { href: "/clima", es: "Clima", en: "Weather", icon: '<path d="M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 11a3.5 3.5 0 0 0 1 7z"/>' },
  rate: { href: "/mas/tasa", es: "Tasa de referencia", en: "Reference rate", icon: '<path d="M4 8h13l-3-3M20 16H7l3 3"/>' },
  countdown: { es: "Tu fecha", en: "Your date", icon: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>' },
};

export default function Home(props: Props) {
  if (props.expired) return <ExpiryScreen {...props.expired} />;
  const { renderId, renderedAt, language, lines, prompt } = props;
  const [greeting, ...rest] = lines;
  const en = language === "en";
  return (
    <>
      <Head>
        <title>Hoy</title>
        <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
      </Head>
      <main data-render={renderId} data-rendered={renderedAt} data-lang={language}>
        {/* Reserved for a future feature. Empty, and takes no space. */}
        <div id="slot"></div>
        {greeting && (
          <header className="hello" data-line={greeting.key} data-until={greeting.valid_until}>
            <h1>{greeting.text}</h1>
            <p>{en ? "Your day at a glance" : "Tu resumen de hoy"}</p>
          </header>
        )}
        {prompt === "municipality" && (
          <a className="prompt" href="/setup/municipality">
            {en ? "Choose your town to see the weather →" : "Elige tu municipio para ver el clima →"}
          </a>
        )}
        {rest.map((line) => {
          const tile = TILE[line.key];
          const inner = (
            <>
              {tile && <span className="ico"><svg viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML={{ __html: tile.icon }} /></span>}
              <span>
                <small>{line.note ?? (tile ? (en ? tile.en : tile.es) : "")}</small>
                <p className="line">{line.text}</p>
              </span>
            </>
          );
          return tile?.href
            ? <a key={line.key} href={tile.href} className={`tile ${line.key}`} data-line={line.key} data-until={line.valid_until}>{inner}</a>
            : <div key={line.key} className={`tile ${line.key}`} data-line={line.key} data-until={line.valid_until}>{inner}</div>;
        })}
        <p id="stamp" hidden></p>
      </main>
      <TabBar current="inicio" lang={language} />
      <script dangerouslySetInnerHTML={{ __html: OPEN_SCRIPT }} />
    </>
  );
}
