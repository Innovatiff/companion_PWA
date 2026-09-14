/**
 * /setup?token=… — the one-time link the owner hands over. The affiliate sets a
 * password (at least 10 characters, typed twice), then signs in.
 */
import type { GetServerSideProps } from "next";
import { AuthPage } from "../lib/layout.tsx";
import { STRINGS, type Strings } from "../lib/strings.ts";

export const config = { unstable_runtimeJS: false };

const ERRORS = {
  weak_password: "errWeak",
  mismatch: "errMismatch",
  invalid_token: "errInvalidToken",
  expired: "errExpired",
} as const satisfies Record<string, keyof Strings>;

type ErrorKey = keyof typeof ERRORS;
type Props = { token: string; error: ErrorKey | null };

export const getServerSideProps: GetServerSideProps<Props> = async ({ res, query }) => {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  const token = typeof query.token === "string" ? query.token.slice(0, 200) : "";
  let error = typeof query.e === "string" && query.e in ERRORS ? (query.e as ErrorKey) : null;
  if (!token) error = "invalid_token";
  return { props: { token, error } };
};

const { es, en } = STRINGS;

function Both({ k }: { k: keyof Strings }) {
  return <>{es[k] as string}<br /><small lang="en">{en[k] as string}</small></>;
}

export default function Setup({ token, error }: Props) {
  const unusable = error === "invalid_token" || error === "expired";
  return (
    <AuthPage title={es.setupTitle}>
      <h1>{es.setupTitle} <small lang="en">· {en.setupTitle}</small></h1>
      {error && <p className="note bad" role="alert"><Both k={ERRORS[error]} /></p>}
      {unusable ? (
        <p>
          <a href="/login">{es.setupSignIn}</a><br />
          <small lang="en"><a href="/login">{en.setupSignIn}</a></small>
        </p>
      ) : (
        <form className="form" method="post" action="/api/setup">
          <input type="hidden" name="token" value={token} />
          <label htmlFor="password">{es.newPassword} <small lang="en">· {en.newPassword}</small></label>
          <input id="password" name="password" type="password" required minLength={10} autoComplete="new-password" />
          <label htmlFor="password2">{es.repeatPassword} <small lang="en">· {en.repeatPassword}</small></label>
          <input id="password2" name="password2" type="password" required minLength={10} autoComplete="new-password" />
          <button type="submit" className="block">{es.savePassword} · {en.savePassword}</button>
        </form>
      )}
    </AuthPage>
  );
}
