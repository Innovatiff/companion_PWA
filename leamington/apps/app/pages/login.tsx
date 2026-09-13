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

export default function Login({ error }: Props) {
  return (
    <>
      <Head>
        <title>Código · Code</title>
        <meta name="viewport" content="width=device-width,initial-scale=1" />
      </Head>
      <main>
        <h1>Escribe tu código<br /><small>Enter your code</small></h1>
        {error && (
          <p className="err" role="alert">
            {ERRORS[error][0]}<br /><small>{ERRORS[error][1]}</small>
          </p>
        )}
        <form method="post" action="/api/login">
          <label htmlFor="code">Código · Code</label>
          <input id="code" name="code" required autoComplete="off" autoCapitalize="characters"
                 spellCheck={false} inputMode="text" maxLength={12} />
          <button type="submit">Entrar · Enter</button>
        </form>
      </main>
    </>
  );
}
