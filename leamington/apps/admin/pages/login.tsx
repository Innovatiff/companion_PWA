/**
 * Owner sign-in: login name and password. The owner's language is not known
 * until they sign in, so each message is in Spanish with English beneath.
 */
import Head from "next/head";
import type { GetServerSideProps } from "next";
import { currentPerson } from "@leamington/shared/src/server/portal.ts";

export const config = { unstable_runtimeJS: false };

const MESSAGES = {
  invalid: ["Usuario o contraseña incorrectos.", "Wrong sign-in name or password."],
  inactive: ["Esta cuenta no está activa.", "This account is not active."],
  throttled: ["Demasiados intentos. Espera 15 minutos.", "Too many tries. Wait 15 minutes."],
  setup_required: ["Primero crea tu contraseña con el enlace que recibiste.", "First set your password with the link you were sent."],
  other_portal: ["La contraseña quedó guardada, pero es una cuenta de afiliado: entra en el portal de afiliados.", "Password saved, but this is an affiliate account: sign in on the affiliate portal."],
  setup: ["Contraseña guardada. Ya puedes entrar.", "Password saved. You can sign in now."],
  out: ["Sesión cerrada.", "Signed out."],
} as const;

type Key = keyof typeof MESSAGES;
type Props = { message: Key | null };

export const getServerSideProps: GetServerSideProps<Props> = async ({ req, res, query }) => {
  res.setHeader("Cache-Control", "private, no-store");
  const m = typeof query.m === "string" && query.m in MESSAGES ? (query.m as Key) : null;
  if (!m && (await currentPerson(req, "owner"))) return { redirect: { destination: "/", permanent: false } };
  return { props: { message: m } };
};

export default function Login({ message }: Props) {
  const good = message === "setup" || message === "out";
  return (
    <>
      <Head>
        <title>Leamington · Propietario</title>
        <meta name="viewport" content="width=device-width,initial-scale=1" />
      </Head>
      <main className="narrow">
        <h1>Portal del propietario<br /><small>Owner portal</small></h1>
        {message && (
          <p className={good ? "ok" : "err"} role={good ? "status" : "alert"}>
            {MESSAGES[message][0]}<br /><small>{MESSAGES[message][1]}</small>
          </p>
        )}
        <form method="post" action="/api/login">
          <label htmlFor="login">Usuario · Sign-in name</label>
          <input id="login" name="login" required autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={40} />
          <label htmlFor="password">Contraseña · Password</label>
          <input id="password" name="password" type="password" required autoComplete="current-password" />
          <button type="submit">Entrar · Sign in</button>
        </form>
      </main>
    </>
  );
}
