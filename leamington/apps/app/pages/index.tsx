/**
 * Home: a morning message, not a dashboard.
 *
 *   Buenos días, {name}
 *   {team} juega hoy 7pm          only when a fixture exists
 *   {municipality}: 28°, lluvia   their home town
 *   1 CAD = 18.51 HNL ↑ (más alto en 12 días)
 *   Faltan 127 días               departure, or a settled user's next trip
 *
 * Every line comes from our Postgres via app.render_home, which decides what is
 * current enough to show. A line without current data is absent, never stale and
 * never a placeholder. No client runtime JS; one small inline script (see
 * lib/open-script.ts).
 */
import Head from "next/head";
import type { GetServerSideProps } from "next";
import { db } from "../lib/db";
import { readSession, cookieValue, clearedCookie } from "../lib/session";
import { OPEN_SCRIPT } from "../lib/open-script";

export const config = { unstable_runtimeJS: false };

type Line = { key: string; text: string; valid_until: string; note?: string };
type Props = { renderId: string; renderedAt: string; language: "es" | "en"; lines: Line[] };

export const getServerSideProps: GetServerSideProps<Props> = async ({ req, res }) => {
  res.setHeader("Cache-Control", "private, no-cache");
  const clientId = readSession(cookieValue(req.headers.cookie));
  if (!clientId) return { redirect: { destination: "/login", permanent: false } };

  const { rows } = await db().query("select app.render_home($1) as m", [clientId]);
  const m = rows[0]?.m;
  if (!m) {
    res.setHeader("Set-Cookie", clearedCookie);
    return { redirect: { destination: "/login?e=inactive", permanent: false } };
  }

  (req as { appLang?: string }).appLang = m.language;
  return { props: { renderId: m.render_id, renderedAt: m.rendered_at, language: m.language, lines: m.lines } };
};

export default function Home({ renderId, renderedAt, language, lines }: Props) {
  const [greeting, ...rest] = lines;
  return (
    <>
      <Head>
        <title>Hoy</title>
        <meta name="viewport" content="width=device-width,initial-scale=1" />
      </Head>
      <main data-render={renderId} data-rendered={renderedAt} data-lang={language}>
        {/* Reserved for a future feature. Empty, and takes no space. */}
        <div id="slot"></div>
        {greeting && (
          <h1 data-line={greeting.key} data-until={greeting.valid_until}>{greeting.text}</h1>
        )}
        {rest.map((line) => (
          <p key={line.key} data-line={line.key} data-until={line.valid_until}>
            {line.text}
            {line.note ? <> <small>{line.note}</small></> : null}
          </p>
        ))}
        <p id="stamp" hidden></p>
      </main>
      <script dangerouslySetInnerHTML={{ __html: OPEN_SCRIPT }} />
    </>
  );
}
