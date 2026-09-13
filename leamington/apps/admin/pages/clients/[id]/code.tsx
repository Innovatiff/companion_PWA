/**
 * The client's access code, huge and printable, grouped 4 + 4. The print
 * stylesheet shows only the name and the code. The one inline script is the
 * print button.
 */
import type { GetServerSideProps } from "next";
import { asPerson } from "@leamington/shared/src/server/db.ts";
import { formatCode } from "@leamington/shared/src/code.ts";
import { ownerPage, plain, type Viewer } from "../../../lib/server.ts";
import { isUuid, q1 } from "../../../lib/rules.ts";
import { strings } from "../../../lib/i18n.ts";
import { Page, Chip, Note } from "../../../lib/ui.tsx";

export const config = { unstable_runtimeJS: false };

type Props = { viewer: Viewer; id: string; name: string; code: string; isTest: boolean; registered: boolean };

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const g = await ownerPage(ctx);
  if ("redirect" in g) return g;
  const id = q1(ctx.query.id);
  if (!isUuid(id)) return { notFound: true };
  const c = await asPerson(g.person.authUserId, async (q) =>
    (await q.query("select full_name, code, is_test from clients where id = $1", [id])).rows[0]);
  if (!c) return { notFound: true };
  return { props: plain({ viewer: g.viewer, id, name: c.full_name, code: c.code, isTest: c.is_test, registered: q1(ctx.query.ok) === "registered" }) };
};

const PRINT = 'document.getElementById("print").addEventListener("click",function(){window.print()})';

export default function Code({ viewer, id, name, code, isTest, registered }: Props) {
  const t = strings(viewer.lang);
  return (
    <Page viewer={viewer} section="clients" title={name}>
      <div className="narrow">
        {registered && <div className="noprint"><Note>{t.code.registered}</Note></div>}
        {isTest && <p className="noprint"><Chip kind="test">{t.chip.test}</Chip></p>}
        <p className="noprint"><small>{t.code.title}</small></p>
        <div className="code" aria-label={t.code.title}>{formatCode(code)}</div>
        <p>{t.code.never}</p>
        <div className="actions noprint">
          <button type="button" id="print">{t.code.print}</button>
          <a className="button secondary" href={`/clients/${id}`}>{t.code.back}</a>
        </div>
        <script dangerouslySetInnerHTML={{ __html: PRINT }} />
      </div>
    </Page>
  );
}
