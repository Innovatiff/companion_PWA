/**
 * Renew, step 1: the code from the client's receipt. One big input, one button.
 *
 * The form POSTs to /api/renew/lookup, so the code (the client's account) never
 * sits in a URL, a history entry or a log line. Errors come back as ?e= only.
 * There is no list of clients to browse: any affiliate can renew any client,
 * but only by the code the client carries.
 */
import type { GetServerSideProps } from "next";
import { requirePerson } from "@leamington/shared/src/server/portal.ts";
import { Card, Hero } from "@leamington/shared/src/ui/Portal.tsx";
import { Page, setPageLang, viewerOf, type Viewer } from "../../lib/layout.tsx";
import { strings } from "../../lib/strings.ts";
import { isRenewError, type RenewError } from "../../lib/renew.ts";

export const config = { unstable_runtimeJS: false };

type LookupError = Exclude<RenewError, "inactive">;
type Props = { viewer: Viewer; error: LookupError | null };

export const getServerSideProps: GetServerSideProps<Props> = async ({ req, res, query }) => {
  res.setHeader("Cache-Control", "private, no-store");
  const auth = await requirePerson(req, "affiliate");
  if (!auth.person) return { redirect: auth.redirect };
  setPageLang(req, auth.person.language);
  const error = isRenewError(query.e) && query.e !== "inactive" ? query.e : null;
  return { props: { viewer: viewerOf(auth.person), error } };
};

export default function Renew({ viewer, error }: Props) {
  const t = strings(viewer.lang);
  const message = error === "invalid" ? t.errLookupInvalid : error === "not_found" ? t.errLookupNotFound : error === "throttled" ? t.errLookupThrottled : null;
  return (
    <Page title={t.renewTitle} viewer={viewer} nav="renew">
      <Hero title={t.renewTitle} subtitle={t.renewSub} />
      <Card className="form">
        <p>{t.renewIntro}</p>
        <form method="post" action="/api/renew/lookup">
          <label htmlFor="code">{t.renewCodeLabel}</label>
          <input id="code" name="code" className="codein" required autoComplete="off" autoCapitalize="characters"
                 spellCheck={false} inputMode="text" maxLength={16}
                 {...(message ? { "aria-invalid": true, "aria-describedby": "code-err" } : {})} />
          {message && <p id="code-err" className="fielderr" role="alert">{message}</p>}
          <button type="submit" className="block">{t.renewFind}</button>
        </form>
      </Card>
    </Page>
  );
}
