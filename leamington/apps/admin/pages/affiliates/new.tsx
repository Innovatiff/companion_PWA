/** Nuevo afiliado: creates the affiliate and their portal login in one step. */
import type { GetServerSideProps } from "next";
import { ownerPage, plain, type Viewer } from "../../lib/server.ts";
import { q1 } from "../../lib/rules.ts";
import { strings } from "../../lib/i18n.ts";
import { Page } from "../../lib/ui.tsx";

export const config = { unstable_runtimeJS: false };

type Values = { name: string; business: string; contact: string; commission: string; login: string; language: string };
type Props = { viewer: Viewer; values: Values; error: string | null };

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const g = await ownerPage(ctx);
  if ("redirect" in g) return g;
  const v = (k: string, fallback = "") => q1(ctx.query[k]).slice(0, 120) || fallback;
  return {
    props: plain({
      viewer: g.viewer,
      values: { name: v("name"), business: v("business"), contact: v("contact"), commission: v("commission", "40"), login: v("login"), language: v("language", "es") },
      error: q1(ctx.query.e) || null,
    }),
  };
};

export default function NewAffiliate({ viewer, values, error }: Props) {
  const t = strings(viewer.lang);
  const n = t.newAffiliate;
  const err = (key: string, ...keys: string[]) =>
    error && [key, ...keys].includes(error) ? <p className="err hint" id={`${key}-err`}>{n.errors[error]}</p> : null;
  return (
    <Page viewer={viewer} section="affiliates" title={n.title}>
      <form method="post" action="/api/affiliates/create" className="narrow">
        {error && !["name", "commission", "login", "login_taken"].includes(error) && <p className="err" role="alert">{n.errors.invalid}</p>}
        <label htmlFor="name">{n.name}</label>
        <input id="name" name="name" required maxLength={120} defaultValue={values.name} autoComplete="off" />
        {err("name")}
        <label htmlFor="business">{n.business}</label>
        <input id="business" name="business" maxLength={120} defaultValue={values.business} autoComplete="off" />
        <label htmlFor="contact">{n.contact}</label>
        <input id="contact" name="contact" maxLength={120} defaultValue={values.contact} autoComplete="off" />
        <label htmlFor="commission">{n.commission}</label>
        <input id="commission" name="commission" required inputMode="decimal" maxLength={6} defaultValue={values.commission} aria-describedby="commission-hint" />
        <p className="hint" id="commission-hint"><small>{n.commissionHint}</small></p>
        {err("commission")}
        <label htmlFor="login">{n.login}</label>
        <input id="login" name="login" required maxLength={40} autoCapitalize="none" spellCheck={false} autoComplete="off"
               defaultValue={values.login} aria-describedby="login-hint" />
        <p className="hint" id="login-hint"><small>{n.loginHint}</small></p>
        {err("login", "login_taken")}
        <label htmlFor="language">{n.language}</label>
        <select id="language" name="language" defaultValue={values.language}>
          <option value="es">Español</option>
          <option value="en">English</option>
        </select>
        <button type="submit">{n.submit}</button>
      </form>
    </Page>
  );
}
