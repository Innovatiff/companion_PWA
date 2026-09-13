import Document, { Html, Head, Main, NextScript, type DocumentContext, type DocumentInitialProps } from "next/document";
import { PORTAL_CSS } from "@leamington/shared/src/ui/css.ts";

// Inline, so a cold load is one HTML response (docs/DESIGN.md). The portal
// variant plus the few pieces only the owner portal uses.
const CSS = PORTAL_CSS +
  ".chip.bad{color:var(--danger)}.chip.warn{color:var(--warn)}.chip.good{color:var(--ok)}" +
  ".chip.unk{color:var(--caution);border-style:dashed}.chip.test{color:#fff;background:var(--muted);border-color:var(--muted);font-weight:700}" +
  "tr.quiet td{background:#fbeeee}tr.quiet td:first-child{box-shadow:inset 4px 0 var(--danger)}" +
  "td form{margin:0}td button,button.inline,.button.inline{display:inline-block;width:auto;margin:0;padding:.45rem .9rem}" +
  ".note{border-left:4px solid var(--ok);background:var(--card);padding:.6rem .8rem;margin:1rem 0}.note.bad{border-left-color:var(--danger)}" +
  ".filters{display:flex;flex-wrap:wrap;gap:0 1rem;align-items:flex-end}.filters>div{flex:1 1 11rem}.filters button{width:auto}" +
  ".copy{font:1rem ui-monospace,\"Roboto Mono\",monospace;word-break:break-all;-webkit-user-select:all;user-select:all;" +
  "background:var(--card);border:2px solid var(--ink);border-radius:.5rem;padding:.75rem}" +
  "dl.kv{display:grid;grid-template-columns:max-content 1fr;gap:.3rem 1rem;margin:.5rem 0 1rem}dl.kv dt{color:var(--muted)}dl.kv dd{margin:0}" +
  ".panel{border:2px solid var(--line);border-radius:.5rem;padding:.25rem 1rem .5rem;margin:1rem 0;background:var(--card)}" +
  ".panel.danger{border-color:var(--danger)}.hint{margin:.2rem 0 0}";

type Props = DocumentInitialProps & { lang: string };

export default class AdminDocument extends Document<Props> {
  static async getInitialProps(ctx: DocumentContext): Promise<Props> {
    const initial = await Document.getInitialProps(ctx);
    // Pages set req.adminLang in getServerSideProps once the owner is known.
    const lang = (ctx.req as { adminLang?: string } | undefined)?.adminLang === "en" ? "en" : "es";
    return { ...initial, lang };
  }

  render() {
    return (
      <Html lang={this.props.lang}>
        <Head>
          {/* No favicon request. */}
          <link rel="icon" href="data:," />
          <style dangerouslySetInnerHTML={{ __html: CSS }} />
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}
