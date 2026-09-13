import Document, { Html, Head, Main, NextScript, type DocumentContext, type DocumentInitialProps } from "next/document";
import { PORTAL_CSS } from "@leamington/shared/src/ui/css.ts";

// Inline, so every page is one HTML response (docs/DESIGN.md). Only what the
// shared portal CSS does not already cover.
const CSS = PORTAL_CSS +
  "header.bar>span{font-weight:600}" +
  ".mono{font-family:ui-monospace,\"Roboto Mono\",monospace;white-space:nowrap;letter-spacing:.04em}" +
  ".s-active{color:var(--ok)}.s-due{color:var(--warn)}.s-lapsed{color:var(--danger)}.s-none{color:var(--muted)}" +
  ".countries{display:grid;grid-template-columns:repeat(auto-fit,minmax(12rem,1fr));gap:.75rem;margin:1rem 0}" +
  ".countries .button{margin:0;min-height:4.5rem;font-size:1.3rem;display:flex;align-items:center;justify-content:center}" +
  ".who{font-size:1.4rem;font-weight:650;margin:1rem 0 0}.fielderr{margin:.3rem 0 0}" +
  "input.codein{font:700 1.8rem/1.1 ui-monospace,\"Roboto Mono\",monospace;letter-spacing:.14em;text-transform:uppercase;text-align:center;min-height:4rem}" +
  "a.renew{display:inline-flex;align-items:center;min-height:48px;padding:0 .4rem;font-weight:600}" +
  ".note{border:2px solid var(--line);border-left:8px solid var(--ink);border-radius:.5rem;padding:.6rem .75rem;margin:1rem 0;background:var(--card)}" +
  ".note.warn{border-left-color:var(--warn)}.big{font-size:1.2rem;font-weight:650}";

type Props = DocumentInitialProps & { lang: string };

export default class AffiliateDocument extends Document<Props> {
  static async getInitialProps(ctx: DocumentContext): Promise<Props> {
    const initial = await Document.getInitialProps(ctx);
    // Pages set req.appLang in getServerSideProps from the signed-in person.
    const lang = (ctx.req as { appLang?: string } | undefined)?.appLang === "en" ? "en" : "es";
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
