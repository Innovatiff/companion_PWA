/**
 * Login: the code, and nothing else. No email, no password, no SMS.
 *
 * The user's language is not known until the code is, so the page says each
 * thing once in Spanish and once in English. It is a plain HTML form: no client
 * JS is needed to sign in on a cheap phone.
 */
import Head from "next/head";
import type { GetServerSideProps } from "next";
import { readSession, cookieValue } from "../lib/session";
import { Art, type ArtName } from "../lib/ui";
import { LOGIN_CSS } from "../lib/page-css";

export const config = { unstable_runtimeJS: false };

const ERRORS = {
  invalid: ["Ese código no existe. Revísalo e inténtalo otra vez.", "That code doesn't exist. Check it and try again."],
  inactive: ["Este código no está activo. Habla con la persona que te lo dio.", "This code isn't active. Talk to the person who gave it to you."],
  throttled: ["Demasiados intentos. Espera 15 minutos.", "Too many tries. Wait 15 minutes."],
} as const;

type ErrorKey = keyof typeof ERRORS;
type Props = { error: ErrorKey | null };

export const getServerSideProps: GetServerSideProps<Props> = async ({ req, res, query }) => {
  res.setHeader("Cache-Control", "private, no-cache");
  const e = typeof query.e === "string" && query.e in ERRORS ? (query.e as ErrorKey) : null;
  if (!e && readSession(cookieValue(req.headers.cookie))) {
    return { redirect: { destination: "/", permanent: false } };
  }
  return { props: { error: e } };
};

// What Hoy has, in both languages.
const FEATURES: [ArtName, string, string][] = [
  ["football", "Fútbol", "Football"], ["partly-day", "Clima", "Weather"], ["money", "Tasa", "Rate"], ["calendar", "Feriados", "Holidays"],
];

const STEPS: [string, string][] = [
  ["Pide tu código a la persona que te registró.", "Ask the person who registered you for your code."],
  ["Escríbelo arriba y toca Entrar.", "Type it above and tap Enter."],
  ["Listo. En un teléfono nuevo, entra con el mismo código.", "Done. On a new phone, sign in with the same code."],
];

export default function Login({ error }: Props) {
  return (
    <>
      <Head>
        <title>Hoy</title>
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <style dangerouslySetInnerHTML={{ __html: LOGIN_CSS }} />
      </Head>
      <main>
        <header className="hello">
          <div>
            <div className="brandmark">Hoy</div>
            <p>Tu día en un vistazo<br /><small>Your day at a glance</small></p>
          </div>
          <Art name="sun" size={80} />
        </header>
        <ul className="feat">
          {FEATURES.map(([art, es, en]) => <li key={art}><Art name={art} size={40} />{es}<small>{en}</small></li>)}
        </ul>
        <section className="card">
          <h1>Escribe tu código<br /><small>Enter your code</small></h1>
          {error && (
            <p className="err" role="alert">
              {ERRORS[error][0]}<br /><small>{ERRORS[error][1]}</small>
            </p>
          )}
          <form method="post" action="/api/login">
            <label htmlFor="code">Código · Code</label>
            <input id="code" name="code" className="codein" required autoComplete="off" autoCapitalize="characters"
                   spellCheck={false} inputMode="text" maxLength={12} />
            <button type="submit">Entrar · Enter</button>
          </form>
        </section>
        <ol className="steps">
          {STEPS.map(([es, en], i) => (
            <li key={i}><span className="n">{i + 1}</span><span>{es}<br /><small>{en}</small></span></li>
          ))}
        </ol>
      </main>
    </>
  );
}
