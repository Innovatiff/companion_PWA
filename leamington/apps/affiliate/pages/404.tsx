// Our own 404, so a missing page (or another affiliate's client) ships no framework JS.
import { Page } from "../lib/layout.tsx";
import { STRINGS } from "../lib/strings.ts";

export const config = { unstable_runtimeJS: false };

export default function NotFound() {
  const { es, en } = STRINGS;
  return (
    <Page title="404" viewer={null}>
      <h1>{es.notFound}<br /><small lang="en">{en.notFound}</small></h1>
      <p><a href="/">{es.navClients} · {en.navClients}</a></p>
    </Page>
  );
}
