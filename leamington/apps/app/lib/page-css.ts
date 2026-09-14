/**
 * CSS that only one or two pages use, inlined by those pages alone, so the home
 * screen (opened every morning on metered data) does not carry it. Shared rules
 * live in APP_CSS (packages/shared/src/ui/css.ts), which every page inlines
 * after these, so page rules that meet a shared one are written more specific.
 * Match cards and warning cards are shared: home shows them too.
 */
const TABLE =
  ".wrap{overflow-x:auto;margin:.5rem 0 1rem;background:var(--card);border-radius:var(--r);padding:.4rem 1rem;box-shadow:var(--shadow)}" +
  "table{border-collapse:collapse;width:100%;font-size:.95rem}caption{text-align:left;font-weight:750;padding:.6rem 0}" +
  "th,td{text-align:left;padding:.6rem .35rem;border-bottom:1px solid var(--line)}tr:last-child td{border-bottom:0}" +
  "th{font-size:.74rem;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}.n{text-align:right;font-variant-numeric:tabular-nums}";

export const FUTBOL_CSS = TABLE +
  // The hero: an indigo pitch with the crest, league and flag, form and goals
  ".hero{position:relative;isolation:isolate;overflow:hidden;color:#fff;border-radius:24px;padding:1rem 1.15rem 1.15rem;margin:0 0 1rem;" +
  "background:repeating-linear-gradient(90deg,rgba(255,255,255,.045) 0 26px,transparent 26px 52px),linear-gradient(135deg,#3b44b5,#5f6be3);box-shadow:0 16px 34px rgba(63,75,196,.28)}" +
  ".hero::after{content:\"\";position:absolute;z-index:-1;right:-3.5rem;top:-3.5rem;width:10rem;height:10rem;border-radius:50%;border:2px solid rgba(255,255,255,.14)}" +
  ".hero .top{display:flex;align-items:center;gap:.5rem;margin:0;font-size:.85rem;font-weight:700}.hero .top .flag{margin-left:auto;font-size:1.3rem}" +
  ".lgo{flex:none;object-fit:contain}.hero .lgo{background:#fff;border-radius:9px;padding:3px}" +
  ".hero .id{display:flex;align-items:center;gap:1rem;margin:.9rem 0 .2rem}.hero .id>div{min-width:0}" +
  ".lgb{display:grid;place-items:center;flex:none;width:76px;height:76px;border-radius:50%;background:#fff;font-size:2.5rem;box-shadow:0 6px 16px rgba(0,0,0,.2)}" +
  ".hero img.cr{background:#fff;border-radius:50%;padding:7px;box-shadow:0 6px 16px rgba(0,0,0,.2)}.hero .id>.lgo{padding:8px;border-radius:18px}" +
  ".hero h1{margin:0;color:#fff;font-size:1.8rem;overflow-wrap:anywhere}.hero p{margin:.1rem 0 0;color:rgba(255,255,255,.92);font-size:.92rem}" +
  ".form{display:flex;flex-wrap:wrap;align-items:center;gap:.35rem;margin-top:.85rem}.hero small{color:rgba(255,255,255,.92)}.form>small:first-child{font-weight:700;margin-right:.2rem}" +
  ".form .lgd{flex-basis:100%;font-size:.74rem}" +
  ".fc{display:inline-grid;place-items:center;width:1.75rem;height:1.75rem;border-radius:9px;font-size:.82rem;font-weight:800;color:#fff;vertical-align:middle}" +
  ".fc.W{background:#0e8a43}.fc.D{background:#6b7190}.fc.L{background:#c9352a}.hero .fc{box-shadow:0 0 0 2px rgba(255,255,255,.8)}" +
  ".stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.5rem;margin-top:.9rem}" +
  ".stats>span{background:rgba(10,14,60,.22);border-radius:16px;padding:.55rem .3rem;text-align:center}.stats b{display:block;font-size:1.8rem;line-height:1.1}.stats small{font-size:.72rem}" +
  // Section jumps, next match, results
  ".nx{padding:1.1rem .9rem}.venue{grid-column:1/-1;display:flex;justify-content:center;align-items:center;margin:.3rem 0 0;color:var(--muted);font-size:.84rem}" +
  ".res{border-left:6px solid var(--line)}.res.W{border-left-color:#0e8a43}.res.L{border-left-color:#c9352a}.res.D{border-left-color:#6b7190}.res>small .fc{width:1.35rem;height:1.35rem;font-size:.7rem;border-radius:7px}" +
  // A league's matches under its logo
  ".grp{padding:.8rem 1rem .4rem}.grp>header{display:flex;align-items:center;gap:.6rem;padding-bottom:.6rem;border-bottom:1px solid var(--line)}" +
  ".grp h3{flex:1;margin:0;font-size:.98rem}.grp .flag{font-size:1.2rem;margin:0}" +
  ".fxs{list-style:none;margin:0;padding:0}.fx{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;gap:.5rem;padding:.7rem 0;border-bottom:1px solid var(--line);font-size:.9rem}" +
  ".fx:last-child{border-bottom:0}.fx>span.h,.fx>span.a{display:flex;align-items:center;gap:.45rem;min-width:0;line-height:1.2;overflow-wrap:break-word;hyphens:auto}.fx>span.a{justify-content:flex-end;text-align:right}" +
  ".fx b{font-weight:700}.fx .sc{font-size:1.15rem;font-weight:800;font-variant-numeric:tabular-nums;padding:0 .2rem}.fx>small{grid-column:1/-1;text-align:center;margin-top:-.25rem;font-size:.76rem}" +
  ".team{display:flex;align-items:center;gap:1rem}.team h1{margin:0}.team p{margin:.15rem 0 0}";

// "Ahora" (0040) blocks, used by Clima and Hoy en Leamington: the sky's picture,
// the temperature big, its word and the chips.
const AHORA =
  ".ahora{display:flex;flex-wrap:wrap;align-items:center;gap:.3rem .9rem}.ahora>span{flex:1;min-width:0}.ahora small{display:block}.ahora .nc{flex-basis:100%;margin-top:.2rem}" +
  ".ahora.card{padding:1rem 1.1rem;background:linear-gradient(135deg,#e6e9fd,#fff 70%)}" +
  ".ahora.in{margin:.55rem 0 .4rem;padding:.55rem 0;border-block:1px solid var(--line)}.ahora.in .art{width:3.2rem;height:3.2rem}.ahora.in .nc>span{padding:.2rem .5rem;font-size:.76rem}" +
  ".tn{display:block;font-size:3.3rem;font-weight:800;letter-spacing:-.03em;line-height:1.05;font-variant-numeric:tabular-nums}.ahora.in .tn{font-size:2.2rem}.lab{display:block;font-size:1.05rem}";

export const CLIMA_CSS = AHORA +
  // Town headers: a photo under a dark overlay, or the indigo gradient
  ".townhead{position:relative;isolation:isolate;display:flex;align-items:flex-end;min-height:9rem;margin:1.4rem 0 .6rem;border-radius:var(--r);overflow:hidden;background:#1d2147;box-shadow:var(--shadow)}" +
  ".townhead img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}" +
  ".townhead::before{content:\"\";position:absolute;inset:0;z-index:1;background:linear-gradient(rgba(14,16,44,.15),rgba(14,16,44,.82))}" +
  ".townhead h2{position:relative;z-index:2;margin:.9rem 1rem;color:#fff;font-size:1.3rem;text-shadow:0 1px 3px rgba(0,0,0,.5)}" +
  ".townhead.plain{min-height:4.6rem;background:linear-gradient(135deg,#3b44b5,#5f6be3)}.townhead.plain::before{display:none}h2 .chip{margin-left:.45rem;text-shadow:none}" +
  // Today: the picture, the big temperature, the low, and the rain-chance ring
  ".now{display:flex;align-items:center;gap:.8rem;padding:1rem}.now>span:not(.ring){flex:1;min-width:0}.now small{display:block}" +
  ".now.rain,.here.rain{background:linear-gradient(135deg,#e3edff,#fff 70%)}.now.sun,.here.sun{background:linear-gradient(135deg,#fff3d6,#fff 70%)}" +
  // The day's forecast, secondary: high and low as arrow chips
  ".hl{display:flex;flex-wrap:wrap;align-items:center;gap:.3rem;margin:.3rem 0}.hl b{display:inline-block;padding:.15rem .6rem;border-radius:999px;font-weight:800;font-variant-numeric:tabular-nums;white-space:nowrap}" +
  ".hl .tp{background:#fff0d6;color:#8a3b00;font-size:1.15rem}.hl .lo{background:#e3edff;color:#1d4f9a;font-size:1.15rem}.hl .rn{background:var(--tile);color:var(--brand-ink);font-size:.85rem}" +
  ".rp{display:block;margin-top:.45rem}.rp .bar{background:rgba(47,116,208,.14)}.rp .bar i{background:linear-gradient(90deg,#7ab3ff,var(--rain))}" +
  // Sunrise, sunset, moon
  ".sky{display:flex;flex-wrap:wrap;gap:.4rem;margin:0 0 .75rem}.sky span{display:inline-flex;align-items:center;gap:.3rem;padding:.35rem .8rem;border-radius:999px;background:var(--card);box-shadow:var(--shadow);font-size:.84rem;font-weight:650}" +
  ".sky.sm{margin:.55rem 0 0;gap:.3rem}.sky.sm span{padding:.12rem .5rem;box-shadow:none;background:var(--tile);font-size:.74rem}" +
  // Three days with temperature range bars
  ".strip{list-style:none;margin:0 0 .75rem;padding:.2rem 1rem;background:var(--card);border-radius:var(--r);box-shadow:var(--shadow)}" +
  ".strip li{display:grid;grid-template-columns:3.6rem 1.9rem 3.3rem 1.9rem minmax(2rem,1fr) 3.9rem;align-items:center;gap:.3rem;padding:.55rem 0;border-bottom:1px solid var(--line);font-size:.94rem}" +
  ".strip li:last-child{border-bottom:0}.strip .art{width:1.9rem;height:1.9rem}.strip .pr{color:var(--rain);font-weight:650;white-space:nowrap;font-size:.8rem}.strip .lo{color:var(--muted);text-align:right}.strip b{text-align:right;white-space:nowrap}" +
  ".rng{position:relative;display:block;height:.45rem;border-radius:9px;background:var(--tile)}" +
  ".rng i{position:absolute;top:0;bottom:0;border-radius:9px;background:linear-gradient(90deg,#7ab3ff,#fdb813,#f0703c);transform-origin:left;animation:grow 1s .25s cubic-bezier(.2,.7,.3,1) both}" +
  // Here in Canada
  ".here{margin:0 0 .75rem;padding:.9rem .85rem}.pair .here{margin:0}.here .nm{display:block;font-size:1.05rem}.here small{display:block}" +
  ".here .hn{display:flex;align-items:center;flex-wrap:wrap;gap:.1rem .35rem;margin:.3rem 0 0}.here .hn .hl{margin:0}.here .hl b{font-size:.95rem;padding:.1rem .45rem}" +
  ".mini{list-style:none;display:grid;gap:.2rem;margin:.5rem 0 0;padding:.45rem 0 0;border-top:1px solid var(--line)}.mini li{display:flex;align-items:center;gap:.3rem;font-size:.86rem}.mini small{flex:1}.mini .art{width:1.5rem;height:1.5rem}" +
  // Letra grande: the three-day strip fits a 360px screen
  "html.big .strip li{grid-template-columns:2.6rem 1.5rem 2.4rem 1.7rem minmax(1rem,1fr) 2.9rem;gap:.2rem;font-size:.8rem}html.big .strip .art{width:1.5rem;height:1.5rem}" +
  ".aquilink{display:inline-flex;align-items:center;min-height:44px;margin-top:.3rem;font-weight:750;text-decoration:none}" +
  "#aqui,#avisos{scroll-margin-top:1rem}#aqui{margin-bottom:.75rem}" +
  "main>details{background:var(--card);border-radius:var(--r);padding:.2rem 1rem;margin:.75rem 0;box-shadow:var(--shadow)}" +
  "details{margin:.5rem 0}summary{min-height:48px;padding:.7rem 0;cursor:pointer;font-weight:700}";

export const TASA_CSS = TABLE +
  // Header: back, title, the reminder bell
  ".ph .bellbtn svg{width:24px;height:24px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}" +
  // The rate big, its date; a plain note when it is not today's
  ".rhead{display:flex;align-items:flex-end;justify-content:space-between;gap:.75rem;margin:0 .2rem .9rem}.rhead small{display:block}.rdate{text-align:right;font-weight:650;white-space:nowrap}" +
  ".rt{display:flex;align-items:baseline;gap:.35rem;margin:0 0 .15rem;font-variant-numeric:tabular-nums}.rt b{font-size:3.2rem;font-weight:800;letter-spacing:-.03em;line-height:1}.rt span{font-weight:750;color:var(--muted)}" +
  ".stale{margin:0 0 .85rem;padding:.65rem .95rem;border-radius:16px;background:var(--warn-soft);color:var(--warn);font-weight:650}" +
  // Chart card: bars grow from the bottom, the line draws on; neutral colours only
  ".chartc{padding:1rem .85rem .85rem}.chart{display:block;width:100%;height:auto;overflow:visible}" +
  ".chart .b{fill:#cdd2f7;transform-box:fill-box;transform-origin:bottom;animation:rise .6s cubic-bezier(.2,.7,.3,1) both}.chart .b.on{fill:var(--brand)}@keyframes rise{from{transform:scaleY(0)}}" +
  ".chart .g{fill:none;stroke:#c7ccf5;stroke-width:1;stroke-dasharray:3 4}.chart .tk{font-size:10px;fill:#5a6080;font-weight:650}" +
  ".chart .ar{fill:#e8eafc}.chart .ln{fill:none;stroke:var(--brand);stroke-width:3;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:1;animation:draw 1.4s .2s ease-out both}@keyframes draw{from{stroke-dashoffset:1}}" +
  ".chart .dt2{fill:#fff;stroke:var(--brand-ink);stroke-width:3}" +
  ".hilo{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.6rem;margin:.8rem 0 .2rem}.hilo>span{padding:.55rem .75rem;border-radius:14px;background:var(--tile)}.hilo small{display:block}.hilo b{font-size:1.25rem;font-variant-numeric:tabular-nums}" +
  ".chg{display:inline-block;margin-top:.55rem;padding:.25rem .8rem;border-radius:999px;background:var(--tile);color:var(--brand-ink);font-weight:750;font-size:.86rem}" +
  // Section card headers
  ".ch{display:flex;align-items:center;gap:.7rem}.ch h2{margin:0}" +
  // The week: seven circles that pop in
  ".wkc{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:.25rem;list-style:none;padding:0;margin:.8rem 0 .55rem;text-align:center}.wkc small{display:block;font-weight:650;margin-bottom:.25rem}" +
  ".wkc .o{display:grid;place-items:center;width:2.5rem;max-width:100%;aspect-ratio:1;margin:0 auto;border-radius:50%;border:2px solid var(--brand);color:var(--brand-ink);font-weight:800;animation:pop .45s cubic-bezier(.3,1.5,.5,1) both}" +
  ".wc.up .o{background:var(--brand);color:#fff}.wc.nd .o{border-style:dashed;border-color:#aab2e6}" +
  ".wc:nth-child(2) .o{animation-delay:.06s}.wc:nth-child(3) .o{animation-delay:.12s}.wc:nth-child(4) .o{animation-delay:.18s}.wc:nth-child(5) .o{animation-delay:.24s}.wc:nth-child(6) .o{animation-delay:.3s}.wc:nth-child(7) .o{animation-delay:.36s}" +
  "@keyframes pop{from{opacity:0;transform:scale(.6)}}.wcap{font-weight:650}" +
  // Calculator
  ".seg.sm{margin:.8rem 0 0}.seg.sm a{min-height:44px;font-size:.88rem}" +
  ".chips{display:flex;flex-wrap:wrap;gap:.45rem;margin:.75rem 0}.cp{display:inline-flex;align-items:center;min-height:48px;padding:0 1.05rem;border-radius:999px;background:var(--tile);color:var(--brand-ink);font-weight:750;text-decoration:none}.cp.on{background:var(--brand);color:#fff}" +
  ".cres{margin:.3rem 0 .8rem;font-variant-numeric:tabular-nums}.cres b{font-size:1.1rem}.cres .big{display:block;font-size:2.3rem;font-weight:800;letter-spacing:-.02em;line-height:1.15;overflow-wrap:anywhere}" +
  ".cform{display:flex;gap:.5rem;margin:0 0 .6rem}.cform input{flex:1;min-width:0}.cform button{width:auto;margin:0;padding:.8rem 1.1rem}" +
  // Reminder
  ".rt2{display:flex;align-items:baseline;flex-wrap:wrap;gap:.4rem;margin:.7rem 0 .35rem;font-variant-numeric:tabular-nums}.rt2 b{font-size:2.3rem;font-weight:800}.rt2 span{font-weight:750;color:var(--muted)}.rt2 .chip.got{background:var(--brand);color:#fff}" +
  ".rgl{display:flex;justify-content:space-between;margin:.2rem 0 .5rem}.remind .arr{margin:.8rem 0 .5rem}.remind form button.secondary{margin-top:.8rem}" +
  "details.days{padding:.2rem 1rem}details summary{min-height:48px;padding:.75rem 0;cursor:pointer;font-weight:700;color:var(--brand-ink)}" +
  "html.big .rt b{font-size:2.6rem}html.big .cform{flex-wrap:wrap}html.big .cform button{width:100%}html.big .wkc .o{width:2.1rem}html.big .cres .big{font-size:1.9rem}";

// The member page (0041): a premium card, then the badges grid.
export const MIEMBRO_CSS =
  ".mcard{position:relative;isolation:isolate;overflow:hidden;display:flex;flex-direction:column;min-height:13rem;color:#fff;border-radius:24px;padding:1.1rem 1.25rem 1.15rem;margin:0 0 1rem;" +
  "background:radial-gradient(circle at 88% 0%,rgba(255,255,255,.22),transparent 42%),repeating-linear-gradient(135deg,rgba(255,255,255,.05) 0 2px,transparent 2px 12px),linear-gradient(135deg,#232a8f,#4b3fc4 55%,#7c3aed);" +
  "box-shadow:0 22px 44px rgba(59,40,160,.35)}" +
  ".mcard::after{content:\"\";position:absolute;inset:0;z-index:-1;background:linear-gradient(110deg,transparent 35%,rgba(255,255,255,.3) 50%,transparent 65%);transform:translateX(-130%);animation:shine 1.7s .45s ease-out both}" +
  "@keyframes shine{to{transform:translateX(130%)}}" +
  ".mtop{display:flex;align-items:center;gap:.5rem}.mtop .art{margin-left:auto}.mark{font-weight:800;letter-spacing:.02em;white-space:nowrap}.mark b{color:#ffd66b}" +
  ".ribbon{padding:.2rem .7rem;border-radius:999px;background:linear-gradient(90deg,#e5a50a,#ffe08a,#f5c542);color:#4a3000;font-size:.74rem;font-weight:800;white-space:nowrap;box-shadow:0 4px 10px rgba(0,0,0,.2)}" +
  ".mname{margin:auto 0 0;padding-top:.8rem;font-size:1.4rem;font-weight:800;line-height:1.2;overflow-wrap:anywhere}.mnum{margin:.1rem 0 0;color:rgba(255,255,255,.88);font-weight:700}" +
  ".mcode{margin:.55rem 0 .6rem;font:700 1.75rem/1.1 ui-monospace,\"Roboto Mono\",monospace;letter-spacing:.2em}" +
  ".mfoot{display:flex;flex-wrap:wrap;gap:.3rem 1.6rem}.mfoot small{display:block;color:rgba(255,255,255,.8);font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em}.mfoot time{font-weight:750}" +
  ".mst{align-self:flex-start;margin-top:.6rem;background:#fff;color:#8a3b00}" +
  ".mfacts{list-style:none;padding:0;margin:0 0 .5rem}.mfacts li{display:flex;align-items:center;gap:.8rem;margin:0 0 .6rem;padding:.7rem .9rem;background:var(--card);border-radius:var(--r);box-shadow:var(--shadow)}.mfacts small{display:block}" +
  ".badges{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.65rem;list-style:none;padding:0;margin:0 0 1rem}" +
  ".badge{display:flex;flex-direction:column;align-items:center;text-align:center;gap:.3rem;padding:1rem .6rem .9rem;background:var(--card);border-radius:var(--r);box-shadow:var(--shadow);animation:pop .5s cubic-bezier(.3,1.5,.5,1) both}" +
  ".badge:nth-child(2){animation-delay:.07s}.badge:nth-child(3){animation-delay:.14s}.badge:nth-child(4){animation-delay:.21s}.badge:nth-child(5){animation-delay:.28s}.badge:nth-child(6){animation-delay:.35s}.badge:nth-child(7){animation-delay:.42s}.badge:nth-child(8){animation-delay:.49s}" +
  "@keyframes pop{from{opacity:0;transform:scale(.7)}}" +
  ".badge>b{font-size:1rem}.badge small{line-height:1.3}.bt{position:relative}.badge.off .art{filter:grayscale(1);opacity:.45}.badge.off>b{color:var(--muted)}" +
  ".ring.sm{position:absolute;right:-.7rem;bottom:-.35rem;width:2.5rem;height:2.5rem;box-shadow:0 2px 6px rgba(40,48,120,.2);border-radius:50%}.ring.sm::before{inset:.3rem}.ring.sm b{font-size:.62rem}";

// The welcome screen (0041), inlined only when home shows it.
export const WELCOME_CSS =
  ".welcome{position:relative;isolation:isolate;overflow:hidden;display:flex;flex-direction:column;justify-content:space-between;max-width:none;min-height:100vh;min-height:100dvh;margin:0;" +
  "padding:1rem 1rem calc(1rem + env(safe-area-inset-bottom));color:#fff}" +
  ".wbg{position:absolute;inset:0;z-index:-2;width:100%;height:100%;object-fit:cover}" +
  ".welcome.wp::before{content:\"\";position:absolute;inset:0;z-index:-1;background:linear-gradient(rgba(10,12,40,.6),rgba(10,12,40,.05) 35%,rgba(10,12,40,.45))}" +
  ".wtop{max-width:34rem}.welcome .credit{margin:0;-webkit-line-clamp:2;color:#fff;font-size:.74rem;text-shadow:0 1px 3px rgba(0,0,0,.7)}" +
  ".wcard{width:100%;max-width:34rem;margin:0 auto;padding:1.4rem 1.4rem 1.2rem;background:#fff;color:var(--ink);border-radius:32px;box-shadow:0 24px 50px rgba(0,0,0,.35)}" +
  ".wcard h1{margin:.5rem 0 .3rem;font-size:1.85rem}.wcard p{margin:0 0 1.1rem;color:var(--muted);font-weight:700}" +
  ".wgo{display:flex;align-items:center;justify-content:space-between;gap:1rem}" +
  ".go{display:grid;place-items:center;flex:none;width:5.25rem;height:5.25rem;min-height:0;margin:.4rem .4rem .4rem 0;padding:0;border-radius:50%;box-shadow:0 0 0 10px rgba(79,91,213,.16),0 14px 28px rgba(79,91,213,.45)}" +
  ".go svg{width:2.2rem;height:2.2rem;fill:none;stroke:#fff;stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round}" +
  ".wskip{width:auto;min-height:48px;margin:0;padding:.5rem .9rem;background:transparent;color:var(--muted);box-shadow:none;font-weight:700;text-decoration:underline}";

// Hoy en Leamington (0044): the hours chart, the UV and air gauges, daylight.
export const AQUI_CSS = AHORA +
  ".ch{display:flex;align-items:center;gap:.7rem}.ch h2{margin:0}" +
  // Hours: the line draws on, dots pop, rain bars grow from the bottom
  ".hscroll{overflow-x:auto;margin:.5rem -.4rem 0;padding:0 .4rem}.hgrid{position:relative;display:grid;grid-template-columns:repeat(var(--n),minmax(2.5rem,1fr));min-width:calc(var(--n)*2.5rem)}" +
  ".hsvg{position:absolute;left:0;top:0;width:100%;height:96px;overflow:visible;pointer-events:none}" +
  ".hl2{fill:none;stroke:var(--brand);stroke-width:3;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:1;animation:draw 1.3s .2s ease-out both}@keyframes draw{from{stroke-dashoffset:1}}" +
  ".hc{display:flex;flex-direction:column;align-items:center;gap:.15rem;min-width:0;text-align:center}.hp{position:relative;display:block;width:100%;height:96px}" +
  ".hd{position:absolute;left:50%;width:11px;height:11px;margin:-5.5px 0 0 -5.5px;border-radius:50%;background:#fff;border:3px solid var(--brand);animation:pop .4s .9s cubic-bezier(.3,1.5,.5,1) both}" +
  "@keyframes pop{from{transform:scale(0)}}.hv{position:absolute;left:0;right:0;margin-top:-1.8rem;font-size:.86rem;font-weight:800}" +
  ".hc .art{width:1.75rem;height:1.75rem}.rb{display:flex;align-items:flex-end;width:.6rem;height:2.6rem;margin-top:.2rem;border-radius:9px;background:#e3edff;overflow:hidden}" +
  ".rb i{display:block;width:100%;border-radius:9px;background:#a9c8f3;transform-origin:bottom;animation:rise .7s .3s cubic-bezier(.2,.7,.3,1) both}@keyframes rise{from{transform:scaleY(0)}}" +
  ".rh .rb i{background:var(--rain)}.rp2{min-height:1.1em;font-size:.7rem;font-weight:650}.rh .rp2{color:var(--rain);font-weight:800}.hh{font-size:.7rem;font-weight:750;color:var(--ink)}" +
  // Gauges: the needle sweeps once
  ".gw{display:flex;flex-direction:column;align-items:center;text-align:center;margin-top:.5rem}.gauge{display:block;width:100%;max-width:15rem;height:auto;overflow:visible}" +
  ".gauge .ndl{transform-origin:100px 100px;transform:rotate(var(--a));animation:sweep 1.1s .2s cubic-bezier(.2,.7,.3,1) both}@keyframes sweep{from{transform:rotate(0deg)}}" +
  ".gauge .nd{stroke:var(--ink);stroke-width:5;stroke-linecap:round}.gauge .hub{fill:var(--ink)}.gauge .rg2{fill:none;stroke:var(--ink);stroke-width:28}" +
  ".gv{display:flex;align-items:baseline;justify-content:center;gap:.3rem;margin:-.6rem 0 0;font-variant-numeric:tabular-nums}.gv b{font-size:2.9rem;font-weight:800;line-height:1}.gv span{font-weight:750;color:var(--muted)}" +
  ".gl{margin:.25rem 0 .1rem;font-weight:750;font-size:1.05rem}" +
  ".heat{display:flex;align-items:center;gap:.8rem;margin:.9rem 0 0;padding:.7rem .85rem;border-radius:16px;background:var(--warn-soft)}.heat b{display:block}.heat .chip{margin-top:.3rem;background:#fff;color:var(--warn)}" +
  ".light .gv{justify-content:flex-start;margin:.6rem 0 .1rem}.light .gv b{font-size:2.3rem}.rise{margin:.5rem 0 0}" +
  "html.big .gv b{font-size:2.3rem}html.big .hgrid{grid-template-columns:repeat(var(--n),minmax(3rem,1fr));min-width:calc(var(--n)*3rem)}";

export const LOGIN_CSS =
  ".feat{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.5rem;list-style:none;padding:0;margin:0 0 1rem}" +
  ".feat li{display:flex;flex-direction:column;align-items:center;gap:.25rem;padding:.65rem .2rem;border-radius:18px;background:var(--card);box-shadow:var(--shadow);font-weight:750;font-size:.8rem;text-align:center;line-height:1.2}" +
  ".feat small{font-size:.7rem;font-weight:550}";

export const SETUP_CSS =
  "button.link{display:inline;width:auto;min-height:48px;margin:0 0 0 .5rem;padding:.5rem;background:transparent;color:var(--brand-ink);text-decoration:underline;font-weight:550;box-shadow:none}" +
  "button.link.skip{display:block;width:100%;margin:.5rem 0;color:var(--muted)}" +
  ".results button{text-align:left;background:var(--card);color:var(--ink);border-radius:18px;font-weight:550;margin:.5rem 0;box-shadow:var(--shadow)}" +
  ".prog{display:flex;align-items:center;gap:.75rem;margin:0 0 1rem}.prog .bar{flex:1;margin:0}";
