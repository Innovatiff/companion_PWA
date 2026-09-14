/**
 * /setup?token=… — the owner sets a password with the one-time link printed by
 * scripts/create-owner.mjs. The token is checked (and used up) only on submit.
 * A link that is invalid or already used (a double submit, say) points to the
 * sign-in page, since the password may well be set already.
 */
import Head from "next/head";
import type { GetServerSideProps } from "next";
import { AuthLayout } from "@leamington/shared/src/ui/Portal.tsx";
import { strings } from "../lib/i18n.ts";

export const config = { unstable_runtimeJS: false };

const ERRORS = {
  weak_password: ["La contraseña debe tener al menos 10 caracteres.", "The password must be at least 10 characters."],
  mismatch: ["Las dos contraseñas no coinciden.", "The two passwords do not match."],
  invalid_token: ["Este enlace no es válido o ya se usó. Pide uno nuevo.", "This link is not valid or was already used. Ask for a new one."],
  expired: ["Este enlace venció. Pide uno nuevo.", "This link has expired. Ask for a new one."],
} as const;

type Key = keyof typeof ERRORS;
type Props = { token: string; error: Key | null };

export const getServerSideProps: GetServerSideProps<Props> = async ({ res, query }) => {
  res.setHeader("Cache-Control", "private, no-store");
  const token = typeof query.token === "string" ? query.token.slice(0, 200) : "";
  const e = typeof query.e === "string" && query.e in ERRORS ? (query.e as Key) : null;
  return { props: { token, error: token ? e : "invalid_token" } };
};

export default function Setup({ token, error }: Props) {
  const es = strings("es");
  const en = strings("en");
  return (
    <>
      <Head>
        <title>{`Contraseña · ${es.brand} ${es.product}`}</title>
        <meta name="viewport" content="width=device-width,initial-scale=1" />
      </Head>
      <AuthLayout brand={es.brand} product={es.product}>
        <h1>Crea tu contraseña<small>Set your password</small></h1>
        {error && (
          <p className="note bad" role="alert">{ERRORS[error][0]}<br /><small>{ERRORS[error][1]}</small></p>
        )}
        {error === "invalid_token" && (
          <p><a href="/login">{es.auth.signInHere}</a><br /><small><a href="/login">{en.auth.signInHere}</a></small></p>
        )}
        {token && (
          <form method="post" action="/api/setup">
            <input type="hidden" name="token" value={token} />
            <label htmlFor="password">Contraseña (mínimo 10 caracteres) · Password (10+ characters)</label>
            <input id="password" name="password" type="password" required minLength={10} autoComplete="new-password" />
            <label htmlFor="confirm">Repite la contraseña · Repeat it</label>
            <input id="confirm" name="confirm" type="password" required minLength={10} autoComplete="new-password" />
            <button type="submit" className="block">Guardar · Save</button>
          </form>
        )}
      </AuthLayout>
    </>
  );
}
