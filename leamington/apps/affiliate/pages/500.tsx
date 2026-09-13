// A portal page that cannot load fails visibly and never shows old numbers (docs/DESIGN.md 6).
import { Page } from "../lib/layout.tsx";
import { STRINGS } from "../lib/strings.ts";

export const config = { unstable_runtimeJS: false };

export default function ServerError() {
  const { es, en } = STRINGS;
  return (
    <Page title="500" viewer={null}>
      <h1>{es.serverError}<br /><small lang="en">{en.serverError}</small></h1>
      <p><a href="/">{es.navClients} · {en.navClients}</a></p>
    </Page>
  );
}
