import Document, { Html, Head, Main, NextScript, type DocumentContext, type DocumentInitialProps } from "next/document";
import { PORTAL_CSS } from "@leamington/shared/src/ui/css.ts";

// Inline, so a cold load is one HTML response (docs/DESIGN.md). The shared
// dashboard look (section 9) plus the few pieces only the owner portal uses.
const CSS = PORTAL_CSS +
  // Cobros: the amount and its button on one row of the weekly table.
  "form.inline{display:flex;gap:.4rem;align-items:center;margin:0}form.inline input{width:6.5rem;min-height:40px;margin:0}form.inline button{margin:0;white-space:nowrap}" +
  // Tables: row links without underlines until hovered; forms in cells sit flush; totals row.
  "td form{margin:0}tbody th a,td a:not(.pill){text-decoration:none}tbody th a:hover,td a:not(.pill):hover{text-decoration:underline}" +
  "tr.quiet>th{box-shadow:inset 3px 0 var(--bad)}tfoot th,tfoot td{border-top:1px solid var(--line);font-weight:650}" +
  "tbody th{min-width:10rem}tbody th small{font-weight:500}td.nums{white-space:nowrap}td.break{overflow-wrap:anywhere;min-width:8rem}table.wrap-head thead th{white-space:normal;vertical-align:bottom}" +
  ".nums{font-variant-numeric:tabular-nums;letter-spacing:.03em}.desc{color:var(--muted);font-size:.85rem;margin:-.35rem 0 .9rem}" +
  // Forms inside cards
  ".filters{display:flex;flex-wrap:wrap;gap:0 .9rem;align-items:flex-end;margin-bottom:.75rem}.filters>div{flex:1 1 11rem}" +
  ".card form>button,.card form>.actions{margin-top:1.1rem}.hint{margin:.3rem 0 0}.note.hint{margin:.4rem 0 0;padding:.45rem .75rem;font-size:.85rem}" +
  ".card.danger{border-color:var(--bad);box-shadow:inset 4px 0 var(--bad)}" +
  ".copy{font:.95rem ui-monospace,\"Roboto Mono\",monospace;word-break:break-all;-webkit-user-select:all;user-select:all;" +
  "background:#fafaff;border:1px dashed var(--brand);border-radius:10px;padding:.75rem;margin:0 0 .5rem}" +
  // Details, small figures, compact lists, pipeline periods
  "dl.kv{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:.55rem 1.25rem;margin:0}dl.kv dt{color:var(--muted)}dl.kv dd{margin:0}" +
  ".minis{display:grid;grid-template-columns:repeat(auto-fit,minmax(9.5rem,1fr));gap:.6rem}" +
  ".minis>div{background:#f6f7fb;border-radius:12px;padding:.8rem .9rem;font-size:.85rem}.minis b{display:block;font-size:1.3rem;font-variant-numeric:tabular-nums}" +
  ".minis small{display:block;margin-top:.15rem}.list.compact>li{padding:.55rem .75rem}.list a.t{color:var(--ink);text-decoration:none}" +
  ".pipeline small{display:block;font-size:.72rem;margin-top:.15rem}.hero .chip{margin-left:.4rem}" +
  // Sign-in pages, and the printed code
  ".auth h1{font-size:1.3rem;margin:0 0 1rem;line-height:1.3}.auth h1 small{display:block;font-size:.85rem;font-weight:500}" +
  ".auth form>button{margin-top:1.25rem}.print-only{display:none}@media print{.print-only{display:block}}";

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
