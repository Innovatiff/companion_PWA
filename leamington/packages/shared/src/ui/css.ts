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

/**
 * The portals' dashboard look (docs/DESIGN.md section 9): a white sidebar with
 * icons and counts, a gradient header band with the page title and its main
 * action, stat cards overlapping the band, and rounded white cards on a pale
 * blue-grey ground. System fonts, no images, no JavaScript. On a phone the
 * sidebar becomes a top bar with a scrolling row of links.
 */
export const PORTAL_CSS =
  ":root{--bg:#eef1f8;--panel:#fff;--ink:#1b1f3b;--muted:#646a88;--line:#e4e7f0;--soft-line:#eff1f6;" +
  "--brand:#3533cd;--brand-2:#5b5bf0;--brand-soft:#ecebff;--good:#0f7a55;--good-soft:#e2f5ec;--warn:#9a5a00;--warn-soft:#fdf0d8;" +
  "--bad:#c0262d;--bad-soft:#fde7e7;--test:#6b2fbf;--test-soft:#f1e8ff;--focus:#1a56db}" +
  "*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}" +
  "body{margin:0;font:15px/1.5 system-ui,-apple-system,\"Segoe UI\",Roboto,sans-serif;color:var(--ink);background:var(--bg)}" +
  "a{color:var(--brand)}:focus-visible{outline:3px solid var(--focus);outline-offset:2px}" +
  "h1,h2,h3{letter-spacing:-.015em}h2{font-size:1.08rem;font-weight:650;margin:0 0 .75rem}h3{font-size:.95rem;margin:1rem 0 .5rem}p{margin:.5rem 0}" +
  "small,.muted{color:var(--muted);font-size:.82rem}.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}" +
  "svg.i{width:18px;height:18px;flex:none;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}" +
  // Frame
  ".app{display:grid;grid-template-columns:15.5rem minmax(0,1fr);gap:1rem;padding:1rem;max-width:90rem;margin:0 auto;min-height:100vh}" +
  ".side{min-width:0;background:var(--panel);border-radius:18px;padding:1.4rem .85rem 1rem;display:flex;flex-direction:column;position:sticky;top:1rem;height:calc(100vh - 2rem);box-shadow:0 1px 2px rgba(27,31,59,.04)}" +
  ".brand{display:block;font-weight:800;font-size:1.65rem;color:var(--brand);text-decoration:none;padding:0 .75rem 1.3rem;letter-spacing:-.03em;line-height:1.1}" +
  ".brand small{display:block;font-size:.72rem;font-weight:600;color:var(--muted);letter-spacing:.06em;text-transform:uppercase;margin-top:.15rem}" +
  ".side nav{display:flex;flex-direction:column;gap:.2rem}" +
  ".side nav a{display:flex;align-items:center;gap:.75rem;padding:.6rem .75rem;border-radius:10px;color:#3b4060;text-decoration:none;font-size:.92rem;min-height:42px}" +
  ".side nav a:hover{background:#f3f4fa}" +
  ".side nav a[aria-current=page]{background:linear-gradient(135deg,var(--brand),var(--brand-2));color:#fff;font-weight:600;box-shadow:0 6px 16px rgba(53,51,205,.28)}" +
  ".badge{margin-left:auto;min-width:1.5rem;padding:.05rem .45rem;border-radius:999px;font-size:.72rem;font-weight:700;text-align:center;background:var(--brand-soft);color:var(--brand)}" +
  ".badge.good{background:var(--good-soft);color:var(--good)}.badge.warn{background:var(--warn-soft);color:var(--warn)}.badge.bad{background:var(--bad-soft);color:var(--bad)}" +
  ".side nav a[aria-current=page] .badge{background:rgba(255,255,255,.22);color:#fff}" +
  ".side hr{border:0;border-top:1px solid var(--line);margin:.9rem .5rem}" +
  ".who{margin-top:auto;display:flex;align-items:center;gap:.65rem;padding:.9rem .5rem 0;border-top:1px solid var(--line)}" +
  ".avatar{width:2.3rem;height:2.3rem;border-radius:50%;background:var(--brand-soft);color:var(--brand);display:grid;place-items:center;font-weight:700;flex:none}" +
  ".who .name{min-width:0;flex:1}.who b{display:block;font-size:.88rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.who small{display:block;font-size:.75rem}" +
  ".who form{margin:0}.icon-btn{display:grid;place-items:center;width:44px;height:44px;border-radius:10px;border:0;background:transparent;color:var(--muted);cursor:pointer;padding:0}" +
  ".icon-btn:hover{background:#f3f4fa;color:var(--ink)}" +
  ".main{min-width:0}" +
  // Header band and stat cards
  ".hero{border-radius:18px;padding:1.4rem 1.5rem 5.4rem;color:#fff;" +
  "background:repeating-linear-gradient(115deg,rgba(255,255,255,.045) 0 2px,transparent 2px 16px),linear-gradient(120deg,#2320b3 0%,#3836dc 55%,#7075f3 100%)}" +
  ".hero.flat{padding-bottom:1.5rem;margin-bottom:1rem}" +
  ".hero .top{display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;flex-wrap:wrap}" +
  ".hero h1{margin:0;font-size:1.9rem;font-weight:700;line-height:1.2}.hero p{margin:.3rem 0 0;color:rgba(255,255,255,.86);font-size:.9rem}" +
  ".hero a{color:#fff}.hero .actions{display:flex;gap:.5rem;flex-wrap:wrap}" +
  ".btn-light{display:inline-flex;align-items:center;gap:.5rem;background:#fff;color:var(--ink)!important;font-weight:600;padding:.6rem 1.1rem;border-radius:10px;text-decoration:none;box-shadow:0 4px 14px rgba(20,20,80,.18);min-height:44px;border:0;font:inherit;font-weight:600;cursor:pointer}" +
  ".stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(11.5rem,1fr));gap:.9rem;margin:-4.2rem 1rem 1rem;position:relative}" +
  ".stat{background:var(--panel);border-radius:14px;padding:1rem 1.1rem;border:1px solid var(--line);box-shadow:0 10px 26px rgba(30,34,90,.09);min-width:0}" +
  ".stat .label{display:flex;align-items:center;gap:.6rem;font-weight:600;font-size:.88rem}" +
  ".ico{width:2rem;height:2rem;border-radius:9px;display:grid;place-items:center;background:var(--brand-soft);color:var(--brand);flex:none}" +
  ".ico.good{background:var(--good-soft);color:var(--good)}.ico.warn{background:var(--warn-soft);color:var(--warn)}.ico.bad{background:var(--bad-soft);color:var(--bad)}" +
  ".stat .value{display:block;font-size:1.85rem;font-weight:700;margin:.55rem 0 .1rem;font-variant-numeric:tabular-nums;letter-spacing:-.02em;color:var(--ink);text-decoration:none}" +
  ".stat .sub{font-size:.8rem;color:var(--muted)}.up{color:var(--good)}.down{color:var(--bad)}.amber{color:var(--warn)}" +
  // Cards, lists, pipeline
  ".grid{display:grid;grid-template-columns:minmax(0,1.9fr) minmax(0,1fr);gap:1rem;align-items:start}" +
  ".card{background:var(--panel);border-radius:16px;border:1px solid var(--line);padding:1.1rem 1.25rem;margin-bottom:1rem;min-width:0}" +
  ".card-h{display:flex;justify-content:space-between;align-items:center;gap:.75rem;margin-bottom:.75rem;flex-wrap:wrap}.card-h h2{margin:0}" +
  ".card-h a{font-size:.82rem;color:var(--ink);text-underline-offset:3px}" +
  ".list{list-style:none;margin:0;padding:0}.list>li{padding:.85rem .9rem;border-radius:12px;display:flex;gap:.75rem;align-items:center;justify-content:space-between}" +
  ".list>li:nth-child(even){background:#f6f7fb}.list .t{font-weight:600}.meta{display:flex;flex-wrap:wrap;gap:.35rem 1rem;color:var(--muted);font-size:.83rem;margin-top:.2rem}" +
  ".pipeline{display:grid;grid-template-columns:repeat(auto-fit,minmax(7rem,1fr));gap:.4rem}" +
  ".pipeline>*{display:block;padding:.9rem .5rem;border-radius:12px;text-align:center;color:var(--ink);text-decoration:none;font-size:.82rem}" +
  ".pipeline>*:hover{background:#f6f7fb}.pipeline b{display:block;font-size:1.55rem;font-weight:700;font-variant-numeric:tabular-nums}" +
  ".pipeline .on{background:var(--brand-soft);color:var(--brand);border:1px solid #d9d7ff}" +
  // Tables
  ".wrap{overflow-x:auto;margin:0}table{border-collapse:collapse;width:100%;font-size:.9rem}" +
  "caption{text-align:left;font-weight:650;font-size:1.02rem;padding:0 0 .75rem;caption-side:top}" +
  "th,td{text-align:left;padding:.7rem .75rem;border-bottom:1px solid var(--soft-line);vertical-align:middle}" +
  "thead th{font-size:.72rem;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);border-bottom:1px solid var(--line);white-space:nowrap}" +
  "tbody tr:hover{background:#f8f9fd}tbody tr:last-child>*{border-bottom:0}td.num,th.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}" +
  "tr.quiet{background:#fff8f8}" +
  // Chips, buttons, forms, notes
  ".chip{display:inline-flex;align-items:center;gap:.25rem;padding:.12rem .55rem;border-radius:999px;font-size:.73rem;font-weight:600;background:#eef0f6;color:#474c68;white-space:nowrap;vertical-align:middle}" +
  ".chip.good{background:var(--good-soft);color:var(--good)}.chip.warn{background:var(--warn-soft);color:var(--warn)}.chip.bad{background:var(--bad-soft);color:var(--bad)}" +
  ".chip.test{background:var(--test-soft);color:var(--test)}.chip.unk,.chip.plain{background:#eef0f6;color:#474c68}" +
  "button,.button{display:inline-flex;align-items:center;justify-content:center;gap:.5rem;font:inherit;font-weight:600;padding:.65rem 1.15rem;border-radius:10px;border:0;" +
  "background:linear-gradient(135deg,var(--brand),var(--brand-2));color:#fff;min-height:44px;cursor:pointer;text-decoration:none;margin:.25rem 0}" +
  "button.secondary,.button.secondary{background:#fff;color:var(--ink);border:1px solid var(--line)}" +
  "button.danger,.button.danger{background:var(--bad)}button.block,.button.block{width:100%}" +
  ".pill{display:inline-flex;align-items:center;padding:.3rem .8rem;border-radius:8px;background:var(--brand-soft);color:var(--brand);font-size:.8rem;font-weight:600;text-decoration:none;min-height:32px;border:0;margin:0}" +
  "label{display:block;font-weight:600;font-size:.87rem;margin:.9rem 0 .35rem}" +
  "input,select,textarea{font:inherit;width:100%;min-height:46px;padding:.6rem .85rem;border:1px solid #d6d9e6;border-radius:10px;background:#fff;color:var(--ink)}" +
  "input:focus,select:focus,textarea:focus{outline:3px solid rgba(53,51,205,.2);border-color:var(--brand)}" +
  "input[type=checkbox],input[type=radio]{width:1.15rem;min-height:1.15rem;margin:0 .5rem 0 0;vertical-align:middle;accent-color:var(--brand)}" +
  ".form{max-width:36rem}.actions{display:flex;flex-wrap:wrap;gap:.5rem}.narrow{max-width:30rem}" +
  ".note{padding:.75rem 1rem;border-radius:12px;background:var(--good-soft);color:var(--good);font-weight:500;margin:0 0 1rem}" +
  ".note.bad,.err{background:var(--bad-soft);color:var(--bad)}.note.warn{background:var(--warn-soft);color:var(--warn)}.ok{color:var(--good)}" +
  ".code{font:700 2.4rem/1.1 ui-monospace,\"Roboto Mono\",monospace;letter-spacing:.14em;border:2px dashed var(--brand);color:var(--ink);" +
  "border-radius:14px;padding:1.1rem;text-align:center;background:#fafaff;margin:1rem 0}" +
  // Sign-in pages
  ".auth{min-height:100vh;display:grid;place-items:center;padding:1rem;" +
  "background:radial-gradient(60rem 30rem at 0% 0%,#dfe3ff,transparent),radial-gradient(50rem 30rem at 100% 100%,#e4ecff,transparent),var(--bg)}" +
  ".auth .card{width:100%;max-width:26rem;padding:1.75rem;box-shadow:0 20px 50px rgba(30,34,90,.12)}.auth .brand{padding:0 0 1rem}" +
  // Phone
  "@media (max-width:56rem){.app{grid-template-columns:minmax(0,1fr);padding:.6rem;gap:.6rem}" +
  ".side{position:static;height:auto;padding:.8rem;border-radius:14px}.brand{font-size:1.35rem;padding:0 .4rem .6rem}" +
  ".side nav{flex-direction:row;flex-wrap:wrap;gap:.25rem}.side nav a{white-space:nowrap;padding:.45rem .7rem;min-height:40px;flex:1 1 auto}" +
  ".side hr{display:none}.who{padding:.6rem .3rem 0;margin-top:.5rem}" +
  ".hero{padding:1.1rem 1.1rem 4.8rem}.hero h1{font-size:1.45rem}.stats{grid-template-columns:repeat(2,minmax(0,1fr));margin:-3.9rem .5rem .8rem;gap:.6rem}" +
  ".stat{padding:.8rem}.stat .value{font-size:1.5rem}.grid{grid-template-columns:1fr}.card{padding:1rem}.list>li{flex-wrap:wrap}.main{overflow:hidden}}" +
  "@media print{.side,.hero,.noprint{display:none!important}body{background:#fff}.app{display:block;padding:0}.card{border:0}}";
