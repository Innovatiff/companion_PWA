/**
 * The issued code, huge, grouped 4+4, with the client's name, country and
 * period end. Printable: the print stylesheet keeps only the name, the code and
 * the instruction for the client, in the client's language.
 *
 * Read inside asPerson, so another affiliate's client is simply not there: 404.
 */
import type { GetServerSideProps } from "next";
import { requirePerson } from "@leamington/shared/src/server/portal.ts";
import { asPerson } from "@leamington/shared/src/server/db.ts";
import { formatCode } from "@leamington/shared/src/code.ts";
import { formatDate } from "@leamington/shared/src/format.ts";
import { Card, Hero, HeroAction } from "@leamington/shared/src/ui/Portal.tsx";
import { Page, setPageLang, viewerOf, type Viewer } from "../../../lib/layout.tsx";
import { strings } from "../../../lib/strings.ts";
import { clientInstruction, countryName, isUuid } from "../../../lib/clients.ts";

export const config = { unstable_runtimeJS: false };

type Client = { fullName: string; code: string; country: string; adminRegion: string | null; language: string; periodEnd: string | null };
type Props = { viewer: Viewer; client: Client; hoyUrl: string | null };

export const getServerSideProps: GetServerSideProps<Props> = async ({ req, res, params }) => {
  res.setHeader("Cache-Control", "private, no-store");
  const auth = await requirePerson(req, "affiliate");
  if (!auth.person) return { redirect: auth.redirect };
  const person = auth.person;
  setPageLang(req, person.language);

  const id = params?.id;
  if (!isUuid(id)) return { notFound: true };
  const client = await asPerson(person.authUserId, async (q) => {
    const { rows } = await q.query(
      `select full_name, code, country::text as country, admin_region, language::text as language, period_end::text as period_end
         from client_status where client_id = $1`, [id]);
    const r = rows[0];
    return r ? { fullName: r.full_name, code: r.code, country: r.country, adminRegion: r.admin_region, language: r.language, periodEnd: r.period_end } : null;
  });
  if (!client) return { notFound: true };
  return { props: { viewer: viewerOf(person), client, hoyUrl: process.env.HOY_URL?.trim() || null } };
};

export default function Code({ viewer, client, hoyUrl }: Props) {
  const t = strings(viewer.lang);
  const printButton = `<button type="button" class="secondary" onclick="print()">${t.print}</button>`;
  return (
    <Page title={t.codeTitle} viewer={viewer}>
      <Hero
        title={t.codeTitle}
        subtitle={t.codeSub}
        action={<>
          <HeroAction href="/register" icon="userPlus">{t.registerAnother}</HeroAction>
          <HeroAction href="/" icon="users">{t.backToClients}</HeroAction>
        </>}
      />
      <div className="grid">
        <Card>
          <p className="client">{client.fullName}</p>
          <div className="code" aria-label={`${t.codeFor} ${client.fullName}`}>{formatCode(client.code)}</div>
          <p lang={client.language === "en" ? "en" : "es"}>{clientInstruction(client.language, hoyUrl)}</p>
          <div className="noprint" dangerouslySetInnerHTML={{ __html: printButton }} />
        </Card>
        <Card title={t.codeDetails} className="noprint">
          <ul className="list rows">
            <li><span>{t.colCountry}</span><span>{countryName(client.country, viewer.lang)}</span></li>
            {client.adminRegion && <li><span>{t.colRegion}</span><span>{client.adminRegion}</span></li>}
            <li><span>{t.periodEnds}</span><b>{client.periodEnd ? formatDate(client.periodEnd, viewer.lang, true) : t.statusNone}</b></li>
          </ul>
          <p className="muted">{t.neverUsed}</p>
        </Card>
      </div>
    </Page>
  );
}
