/**
 * Sign in with a login name and password (0018_portal_accounts.sql).
 *
 * The person's language is not known until they sign in, so each message is
 * given in Spanish with the English beneath it. A plain HTML form.
 */
import type { GetServerSideProps } from "next";
import { currentPerson } from "@leamington/shared/src/server/portal.ts";
import { AuthPage } from "../lib/layout.tsx";
import { STRINGS, type Strings } from "../lib/strings.ts";

export const config = { unstable_runtimeJS: false };

const ERRORS = {
  invalid: "errInvalid",
  inactive: "errInactive",
  throttled: "errThrottled",
  setup_required: "errSetupRequired",
} as const satisfies Record<string, keyof Strings>;

type ErrorKey = keyof typeof ERRORS;
type Props = { error: ErrorKey | null; setupDone: boolean; login: string };

export const getServerSideProps: GetServerSideProps<Props> = async ({ req, res, query }) => {
  res.setHeader("Cache-Control", "private, no-store");
  const error = typeof query.e === "string" && query.e in ERRORS ? (query.e as ErrorKey) : null;
  const setupDone = query.ok === "setup";
  if (!error && !setupDone && (await currentPerson(req, "affiliate"))) {
    return { redirect: { destination: "/", permanent: false } };
  }
  const login = typeof query.login === "string" ? query.login.slice(0, 40) : "";
  return { props: { error, setupDone, login } };
};

const { es, en } = STRINGS;

function Both({ k }: { k: keyof Strings }) {
  return <>{es[k] as string}<br /><small lang="en">{en[k] as string}</small></>;
}

export default function Login({ error, setupDone, login }: Props) {
  return (
    <AuthPage title={es.loginTitle}>
      <h1>{es.loginTitle} <small lang="en">· {en.loginTitle}</small></h1>
      {setupDone && <p className="note" role="status"><Both k="setupDone" /></p>}
      {error && <p className="note bad" role="alert"><Both k={ERRORS[error]} /></p>}
      <form className="form" method="post" action="/api/login">
        <label htmlFor="login">{es.login} <small lang="en">· {en.login}</small></label>
        <input id="login" name="login" required maxLength={40} autoComplete="username" autoCapitalize="none"
               spellCheck={false} defaultValue={login} />
        <label htmlFor="password">{es.password} <small lang="en">· {en.password}</small></label>
        <input id="password" name="password" type="password" required autoComplete="current-password" />
        <button type="submit" className="block">{es.enter} · {en.enter}</button>
      </form>
    </AuthPage>
  );
}
