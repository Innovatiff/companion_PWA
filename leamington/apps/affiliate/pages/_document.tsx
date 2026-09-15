import Document, { Html, Head, Main, NextScript, type DocumentContext, type DocumentInitialProps } from "next/document";
import { PORTAL_CSS } from "@leamington/shared/src/ui/css.ts";
import { liteCss } from "../lib/lite-css.ts";

// Inline, so every page is one HTML response (docs/DESIGN.md). Only what the
// shared portal CSS does not already cover: the code input, the country choices,
// label/value rows, the client's name on a slip, and printing a grid as one column.
const CSS = PORTAL_CSS +
  ".mono{font-family:ui-monospace,\"Roboto Mono\",monospace;white-space:nowrap;letter-spacing:.04em}" +
  ".countries{display:grid;grid-template-columns:repeat(auto-fit,minmax(11rem,1fr));gap:.75rem}" +
  ".countries a{min-height:5rem;font-size:1.25rem;margin:0}" +
  ".fielderr{color:var(--bad);font-weight:600;font-size:.87rem;margin:.35rem 0 0}" +
  "input.codein{font:700 1.8rem/1.1 ui-monospace,\"Roboto Mono\",monospace;letter-spacing:.14em;text-transform:uppercase;text-align:center;min-height:4rem}" +
  ".form button{margin-top:1rem;min-height:52px}" +
  ".choice{display:flex;align-items:center;min-height:48px}" +
  ".big{font-size:1.15rem;font-weight:650}.client{font-size:1.4rem;font-weight:700;margin:0}" +
  ".note>p{margin:0 0 .3rem}" +
  ".rows>li>span:first-child{color:var(--muted)}" +
  ".auth h1{font-size:1.35rem;margin:0 0 1rem}" +
  "td a,.list .t a{color:var(--ink);font-weight:600;text-decoration:none}" +
  "@media print{.grid{display:block}}";

// Pages without tables or stat cards (setPageCss "lite"): the same rules minus those (lib/lite-css.ts).
const LITE_CSS = liteCss(CSS);

type Props = DocumentInitialProps & { lang: string; lite: boolean };

export default class AffiliateDocument extends Document<Props> {
  static async getInitialProps(ctx: DocumentContext): Promise<Props> {
    const initial = await Document.getInitialProps(ctx);
    // Pages set req.appLang in getServerSideProps from the signed-in person, and req.appCss.
    const req = ctx.req as { appLang?: string; appCss?: string } | undefined;
    const lang = req?.appLang === "en" ? "en" : "es";
    return { ...initial, lang, lite: req?.appCss === "lite" };
  }

  render() {
    return (
      <Html lang={this.props.lang}>
        <Head>
          {/* No favicon request. */}
          <link rel="icon" href="data:," />
          <style dangerouslySetInnerHTML={{ __html: this.props.lite ? LITE_CSS : CSS }} />
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}
