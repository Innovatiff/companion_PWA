/**
 * First-run setup, done by the client: one question per screen.
 *
 *   1 municipality   2 other towns (up to 3)   3 seasonal or settled + date
 *   4 kids           5 the rate corridor
 *
 * Every step can be skipped, and progress is saved on the server at each step,
 * so a closed browser resumes where it stopped. Plain forms, no client JS:
 * search is a GET form, results are submit buttons. `?edit=1` walks the same
 * screens from Más, returning there at the end.
 */
import Head from "next/head";
import type { GetServerSideProps } from "next";
import { db } from "../../lib/db";
import { loadClient, recordView } from "../../lib/client";
import { t } from "../../lib/t";

export const config = { unstable_runtimeJS: false };

const STEPS = ["municipality", "watch", "segment", "kids", "corridor"] as const;
type Step = (typeof STEPS)[number];
type Place = { id: number; name: string; admin_region: string };
type Lang = "es" | "en";

const ERRORS: Record<string, [string, string]> = {
  pick: ["Elige un lugar de la lista.", "Choose a place from the list."],
  max: ["Puedes agregar hasta 3 lugares.", "You can add up to 3 places."],
  date: ["La fecha tiene que ser hoy o después.", "The date must be today or later."],
  segment: ["Elige una de las dos opciones.", "Choose one of the two options."],
  invalid: ["No pudimos guardar eso. Inténtalo otra vez.", "We could not save that. Try again."],
};

type Props = {
  lang: Lang; country: string; step: Step; index: number; edit: boolean; error: string | null;
  regions: string[]; region: string; q: string; results: Place[] | null;
  home: Place | null; watch: Place[]; segment: string; date: string | null; today: string;
};

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const loaded = await loadClient(ctx);
  if ("redirect" in loaded) return loaded;
  const { client } = loaded;
  const step = String(ctx.params?.step) as Step;
  if (!STEPS.includes(step)) return { notFound: true };

  const one = (v: unknown) => (typeof v === "string" ? v : "");
  const q = one(ctx.query.q).trim().slice(0, 60);
  const region = one(ctx.query.region).slice(0, 80);
  const error = one(ctx.query.e) in ERRORS ? one(ctx.query.e) : null;

  const { rows: [c] } = await db().query(
    `select c.municipality_id::int as home_id, m.name as home_name, m.admin_region as home_region, c.segment,
            to_char(coalesce(c.departure_date, c.next_trip_date), 'YYYY-MM-DD') as date,
            to_char((now() at time zone c.timezone)::date, 'YYYY-MM-DD') as today
       from clients c left join municipalities m on m.id = c.municipality_id
      where c.id = $1`, [client.id]);
  const home = c.home_id ? { id: c.home_id, name: c.home_name, admin_region: c.home_region } : null;

  let regions: string[] = [];
  let watch: Place[] = [];
  let results: Place[] | null = null;
  if (step === "municipality" || step === "watch") {
    regions = (await db().query("select admin_region from app.admin_regions($1)", [client.country])).rows.map((r) => r.admin_region);
    watch = (await db().query(
      `select m.id::int, m.name, m.admin_region from client_watch_locations w join municipalities m on m.id = w.municipality_id
        where w.client_id = $1 order by m.name`, [client.id])).rows;
    if (q.length >= 2) {
      const found: Place[] = (await db().query(
        "select id::int, name, admin_region from app.search_municipalities($1, $2, $3, 12)",
        [client.country, regions.includes(region) ? region : null, q])).rows;
      results = step === "watch"
        ? found.filter((p) => p.id !== home?.id && !watch.some((w) => w.id === p.id))
        : found;
    }
  }

  await recordView(client.id, "setup", { step, searched: q.length >= 2, results: results?.length ?? null });
  return {
    props: {
      lang: client.language, country: client.country, step, index: STEPS.indexOf(step), edit: ctx.query.edit === "1", error,
      regions, region: regions.includes(region) ? region : "", q, results, home, watch,
      segment: c.segment ?? "seasonal", date: c.date, today: c.today,
    },
  };
};

const COUNTRY: Record<string, [string, string]> = {
  MX: ["México", "Mexico"], GT: ["Guatemala", "Guatemala"], HN: ["Honduras", "Honduras"], JM: ["Jamaica", "Jamaica"],
};
const REGION: Record<string, [string, string]> = {
  MX: ["Estado", "State"], GT: ["Departamento", "Department"], HN: ["Departamento", "Department"], JM: ["Parroquia", "Parish"],
};
const CURRENCY: Record<string, [string, string, string]> = {
  MX: ["MXN", "pesos mexicanos", "Mexican pesos"], GT: ["GTQ", "quetzales", "quetzales"],
  HN: ["HNL", "lempiras", "lempiras"], JM: ["JMD", "dólares jamaiquinos", "Jamaican dollars"],
};

export default function SetupStep(p: Props) {
  const { lang, step, edit } = p;
  const pick = (pair: [string, string] | undefined) => (pair ? pair[lang === "en" ? 1 : 0] : "");
  const hidden = (
    <>
      <input type="hidden" name="step" value={step} />
      {edit && <input type="hidden" name="edit" value="1" />}
    </>
  );
  const search = (label: string) => (
    <form method="get" action={`/setup/${step}`}>
      {edit && <input type="hidden" name="edit" value="1" />}
      <label htmlFor="region">{pick(REGION[p.country])}</label>
      <select id="region" name="region" defaultValue={p.region}>
        <option value="">{t(lang, "Todos", "All")}</option>
        {p.regions.map((r) => <option key={r} value={r}>{r}</option>)}
      </select>
      <label htmlFor="q">{label}</label>
      <input id="q" name="q" defaultValue={p.q} minLength={2} maxLength={60} required autoComplete="off" />
      <button type="submit">{t(lang, "Buscar", "Search")}</button>
    </form>
  );
  const results = (name: "municipality_id" | "add") => p.results && (
    p.results.length > 0 ? (
      <form method="post" action="/api/setup" className="results">
        {hidden}
        {p.results.map((r) => (
          <button key={r.id} type="submit" name={name} value={r.id}>{r.name} — {r.admin_region}</button>
        ))}
      </form>
    ) : (
      <p>{t(lang, `No encontramos “${p.q}”. Revisa cómo se escribe, o elige otro ${pick(REGION[p.country]).toLowerCase()}.`,
                  `We found no “${p.q}”. Check the spelling, or choose another ${pick(REGION[p.country]).toLowerCase()}.`)}</p>
    )
  );
  const country = pick(COUNTRY[p.country]);
  const [code, esName, enName] = CURRENCY[p.country] ?? ["", "", ""];

  return (
    <>
      <Head>
        <title>Hoy</title>
        <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
      </Head>
      <main>
        <p className="step">{t(lang, `Paso ${p.index + 1} de 5`, `Step ${p.index + 1} of 5`)}</p>
        {p.error && <p className="err" role="alert">{pick(ERRORS[p.error])}</p>}

        {step === "municipality" && (
          <>
            <h1>{t(lang, `¿De qué municipio de ${country} eres?`, `Which town in ${country} are you from?`)}</h1>
            <p><small>{t(lang, "Te mostramos su clima y los avisos oficiales de ese lugar.", "We show you its weather and the official warnings for it.")}</small></p>
            {p.home && <p>{t(lang, "Ahora", "Now")}: <strong>{p.home.name} — {p.home.admin_region}</strong></p>}
            {search(t(lang, "Escribe el nombre", "Type the name"))}
            {results("municipality_id")}
          </>
        )}

        {step === "watch" && (
          <>
            <h1>{t(lang, "¿Quieres ver el clima de otros lugares?", "Do you want the weather for other places too?")}</h1>
            <p><small>{t(lang, "Por ejemplo, donde vive tu familia. Hasta 3.", "For example, where your family lives. Up to 3.")}</small></p>
            {p.watch.length > 0 && (
              <form method="post" action="/api/setup">
                {hidden}
                <ul className="rows">
                  {p.watch.map((w) => (
                    <li key={w.id}>
                      {w.name} — {w.admin_region}
                      <button type="submit" name="remove" value={w.id} className="link">{t(lang, "Quitar", "Remove")}</button>
                    </li>
                  ))}
                </ul>
              </form>
            )}
            {p.watch.length < 3 && (
              <>
                {search(t(lang, "Escribe el nombre", "Type the name"))}
                {results("add")}
              </>
            )}
            <form method="post" action="/api/setup">
              {hidden}
              <button type="submit" name="action" value="done" className={p.watch.length ? "" : "secondary"}>
                {t(lang, "Siguiente", "Next")}
              </button>
            </form>
          </>
        )}

        {step === "segment" && (
          <form method="post" action="/api/setup">
            {hidden}
            <h1>{t(lang, "¿Regresas al terminar la temporada, o vives aquí todo el año?",
                         "Do you go home when the season ends, or live here all year?")}</h1>
            <label className="choice"><input type="radio" name="segment" value="seasonal" defaultChecked={p.segment !== "settled"} />
              {t(lang, "Regreso al terminar la temporada", "I go home when the season ends")}</label>
            <label className="choice"><input type="radio" name="segment" value="settled" defaultChecked={p.segment === "settled"} />
              {t(lang, "Vivo aquí todo el año", "I live here all year")}</label>
            <label htmlFor="date">{t(lang, "¿Qué día regresas, o cuándo es tu próximo viaje? (si ya lo sabes)",
                                            "What day do you go home, or when is your next trip? (if you know)")}</label>
            <input id="date" name="date" type="date" min={p.today} defaultValue={p.date ?? ""} />
            <button type="submit">{t(lang, "Siguiente", "Next")}</button>
          </form>
        )}

        {step === "kids" && (
          <form method="post" action="/api/setup">
            {hidden}
            <h1>{t(lang, `¿Tienes hijos en la escuela en ${country}?`, `Do you have children in school in ${country}?`)}</h1>
            <p><small>{t(lang, "Así te mostramos primero el calendario escolar.", "Then we show you the school calendar first.")}</small></p>
            <button type="submit" name="has_kids" value="yes">{t(lang, "Sí", "Yes")}</button>
            <button type="submit" name="has_kids" value="no" className="secondary">No</button>
          </form>
        )}

        {step === "corridor" && (
          <form method="post" action="/api/setup">
            {hidden}
            <h1>{t(lang, `Tu tasa: dólares canadienses a ${esName}`, `Your rate: Canadian dollars to ${enName}`)}</h1>
            <p>{t(lang, `Te mostramos cuánto vale 1 CAD en ${code}. Es una tasa de referencia: tu banco o remesadora te dará otra.`,
                        `We show you what 1 CAD is worth in ${code}. It is a reference rate: your bank or transfer service will give you a different one.`)}</p>
            <button type="submit">{t(lang, "Está bien", "That's right")}</button>
          </form>
        )}

        <form method="post" action="/api/setup">
          {hidden}
          <button type="submit" name="action" value="skip" className="link skip">{t(lang, "Saltar", "Skip")}</button>
        </form>
      </main>
    </>
  );
}
