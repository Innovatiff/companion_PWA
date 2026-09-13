/**
 * The design system from docs/DESIGN.md, as inline CSS. System fonts only;
 * nothing is downloaded. Each app inlines BASE plus its own variant.
 */

export const TOKENS =
  ":root{--ink:#10231c;--paper:#f6f3ea;--card:#fff;--muted:#566860;--line:#d9d3c3;" +
  "--danger:#9b1c1c;--warn:#8a4b00;--caution:#6b5a00;--ok:#1f5e3b;--focus:#1a56db}";

export const BASE = TOKENS +
  "*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}" +
  "body{margin:0;font:18px/1.45 system-ui,-apple-system,Roboto,\"Segoe UI\",sans-serif;color:var(--ink);background:var(--paper)}" +
  "a{color:inherit}:focus-visible{outline:3px solid var(--focus);outline-offset:2px}" +
  "h1{font-size:1.55rem;line-height:1.25;margin:.5rem 0 1rem;font-weight:650}" +
  "h2{font-size:1.15rem;margin:1.5rem 0 .5rem}p{margin:.5rem 0}" +
  "small,.muted{color:var(--muted);font-size:.85rem}" +
  "ul.rows{list-style:none;margin:0;padding:0}ul.rows>li{padding:.7rem 0;border-bottom:1px solid var(--line)}" +
  "ul.rows>li>a{display:block;text-decoration:none;min-height:44px}" +
  "label{display:block;font-weight:600;margin:.8rem 0 .35rem}" +
  "input,select{font:inherit;width:100%;min-height:48px;padding:.55rem .7rem;border:2px solid var(--ink);border-radius:.5rem;background:var(--card);color:var(--ink)}" +
  "input[type=checkbox],input[type=radio]{width:1.4rem;min-height:1.4rem;vertical-align:middle;margin:0 .5rem 0 0}" +
  ".choice{display:flex;align-items:center;min-height:48px;font-weight:400;margin:.25rem 0}" +
  "button,.button{display:block;width:100%;min-height:48px;font:inherit;font-weight:600;padding:.7rem 1rem;border:0;" +
  "border-radius:.5rem;background:var(--ink);color:#fff;text-align:center;text-decoration:none;cursor:pointer;margin:.75rem 0}" +
  ".button.secondary,button.secondary{background:transparent;color:var(--ink);border:2px solid var(--ink)}" +
  ".err{color:var(--danger)}.ok{color:var(--ok)}.skip{display:block;text-align:center;padding:.8rem;min-height:48px}";

export const APP_CSS = BASE +
  "main{max-width:34rem;margin:0 auto;padding:1rem 1rem calc(5.5rem + env(safe-area-inset-bottom))}" +
  "#slot:empty{display:none}.prompt{display:block;padding:.75rem;border:2px solid var(--ink);border-radius:.5rem;text-decoration:none;margin:.5rem 0 1rem}" +
  "p.line{font-size:1.2rem;margin:.6rem 0}#stamp{color:var(--muted);font-size:.9rem;margin-top:1.5rem}" +
  "nav.tabs{position:fixed;left:0;right:0;bottom:0;display:flex;background:var(--ink);padding-bottom:env(safe-area-inset-bottom)}" +
  "nav.tabs a{flex:1;display:flex;flex-direction:column;align-items:center;gap:.1rem;min-height:56px;padding:.45rem 0 .35rem;" +
  "color:#dcd7c9;text-decoration:none;font-size:.8rem;border-top:3px solid transparent}" +
  "nav.tabs a[aria-current=page]{color:#fff;border-top-color:#fff;font-weight:650}" +
  "nav.tabs svg{width:24px;height:24px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}" +
  ".alert{border:2px solid var(--line);border-left:8px solid var(--muted);border-radius:.5rem;padding:.75rem;margin:.75rem 0;background:var(--card)}" +
  ".alert.red{border-left-color:var(--danger)}.alert.orange{border-left-color:var(--warn)}.alert.yellow{border-left-color:var(--caution)}" +
  ".level{font-weight:700;text-transform:uppercase;font-size:.8rem;letter-spacing:.04em}" +
  ".step{color:var(--muted);font-size:.85rem;margin:0}.nums{font-variant-numeric:tabular-nums;letter-spacing:.05em}" +
  ".wrap{overflow-x:auto;margin:1rem 0}table{border-collapse:collapse;width:100%;font-size:1rem}caption{text-align:left;font-weight:650;padding:.4rem 0}" +
  "th,td{text-align:left;padding:.45rem .4rem;border-bottom:1px solid var(--line)}th{font-size:.85rem;color:var(--muted)}" +
  ".n{text-align:right;font-variant-numeric:tabular-nums}" +
  "button.link{display:inline;width:auto;min-height:44px;margin:0 0 0 .5rem;padding:.5rem;background:transparent;color:var(--ink);text-decoration:underline;font-weight:400}" +
  "button.link.skip{display:block;width:100%;margin:.5rem 0}" +
  ".results button{text-align:left;background:var(--card);color:var(--ink);border:2px solid var(--line);font-weight:400;margin:.4rem 0}" +
  "details{margin:1rem 0}summary{min-height:44px;padding:.5rem 0;cursor:pointer;font-weight:600}" +
  ".code{font:700 2.2rem/1.1 ui-monospace,\"Roboto Mono\",monospace;letter-spacing:.12em;border:3px solid var(--ink);" +
  "border-radius:.5rem;padding:.8rem;text-align:center;background:var(--card);margin:.5rem 0 1rem}";

export const PORTAL_CSS = BASE +
  "main{max-width:64rem;margin:0 auto;padding:1rem}" +
  "header.bar{display:flex;flex-wrap:wrap;gap:.4rem 1rem;align-items:center;justify-content:space-between;padding:.6rem 1rem;background:var(--ink);color:#fff}" +
  "header.bar a{color:#fff;text-decoration:none;min-height:44px;display:inline-flex;align-items:center}" +
  "header.bar nav{display:flex;flex-wrap:wrap;gap:0 1rem}header.bar a[aria-current=page]{text-decoration:underline;text-underline-offset:.3em}" +
  "header.bar form{margin:0}header.bar button{display:inline;width:auto;min-height:44px;margin:0;padding:.3rem .8rem;background:transparent;border:2px solid #fff}" +
  ".wrap{overflow-x:auto;margin:.5rem 0 1.5rem}table{border-collapse:collapse;width:100%;font-size:.95rem;background:var(--card)}" +
  "caption{text-align:left;font-weight:650;padding:.5rem 0;caption-side:top}" +
  "th,td{text-align:left;padding:.55rem .6rem;border-bottom:1px solid var(--line);vertical-align:top}" +
  "th{font-size:.85rem;color:var(--muted);font-weight:600}td.num,th.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}" +
  ".stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(11rem,1fr));gap:.75rem;margin:1rem 0}" +
  ".stat{background:var(--card);border:1px solid var(--line);border-radius:.5rem;padding:.75rem}" +
  ".stat b{display:block;font-size:1.6rem;font-variant-numeric:tabular-nums}" +
  ".chip{display:inline-block;padding:.05rem .45rem;border:1px solid currentColor;border-radius:1rem;font-size:.8rem;white-space:nowrap}" +
  ".code{font:700 2.4rem/1.1 ui-monospace,\"Roboto Mono\",monospace;letter-spacing:.14em;border:3px solid var(--ink);" +
  "border-radius:.5rem;padding:1rem;text-align:center;background:var(--card);margin:1rem 0}" +
  ".narrow{max-width:30rem}.actions{display:flex;flex-wrap:wrap;gap:.5rem}.actions>*{flex:1 1 12rem}" +
  "@media print{header.bar,nav,.noprint{display:none!important}body{background:#fff}main{padding:0}}";
