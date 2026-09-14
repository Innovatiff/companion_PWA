// Our own 404, so a missing page (or another affiliate's client) ships no framework JS.
import { AuthPage } from "../lib/layout.tsx";
import { STRINGS } from "../lib/strings.ts";

export const config = { unstable_runtimeJS: false };

export default function NotFound() {
  const { es, en } = STRINGS;
  return (
    <AuthPage title="404">
      <h1>{es.notFound}<br /><small lang="en">{en.notFound}</small></h1>
      <p><a href="/">{es.navMyClients} · {en.navMyClients}</a></p>
    </AuthPage>
  );
}
