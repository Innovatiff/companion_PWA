/**
 * CSS that only one or two pages use, inlined by those pages alone, so the home
 * screen (opened every morning on metered data) does not carry it. Shared rules
 * live in APP_CSS (packages/shared/src/ui/css.ts), which every page inlines
 * after these, so page rules that meet a shared one are written more specific.
 * Match cards and warning cards are shared: home shows them too.
 */
// Rows in a white card (Clima, Feriados, Escuela, Transporte, Consulado, setup) and the error box (forms): page-only.
const ROWS = "ul.rows{list-style:none;margin:0 0 1rem;padding:.2rem 1.1rem;background:var(--card);border-radius:var(--r);box-shadow:var(--shadow)}ul.rows>li{padding:.85rem 0;border-bottom:1px solid var(--line)}ul.rows>li:last-child{border-bottom:0}";
// "Avisos para tu familia" (0052): Clima's warnings and Más → Notificaciones; a warning opened from a notification.
const FAMILY = ".fam{background:var(--card);border-radius:var(--r);box-shadow:var(--shadow);padding:.9rem 1rem;margin:.75rem 0}.fam h3{margin:0 0 .3rem;font-size:1.02rem}.fam p{margin:.35rem 0}" +
  ".ftowns{list-style:none;display:flex;flex-wrap:wrap;gap:.4rem;margin:.55rem 0 .2rem;padding:0}.ftowns li{display:inline-flex;flex-wrap:wrap;align-items:baseline;gap:.35rem;max-width:100%;padding:.35rem .75rem;border-radius:999px;background:var(--tile);font-weight:700;overflow-wrap:anywhere}.ftowns small{color:var(--muted);font-weight:650}" +
  ".fadd{display:inline-flex;align-items:center;min-height:48px;font-weight:750;color:var(--brand-ink);text-decoration:none}.fck{color:var(--muted)}" +
  ".fst{margin:.4rem 0;padding:.6rem .85rem;border-radius:14px;background:var(--warn-soft);color:var(--warn);font-weight:650}.fst a{color:inherit}.fph{font-weight:650}" +
  ".fbtn{display:flex;align-items:center;justify-content:center;min-height:48px;margin:.5rem 0 0;padding:0 1rem;border-radius:999px;background:var(--brand);color:#fff;font-weight:750;text-decoration:none;text-align:center}" +
  ".focus>.step{margin:.6rem .2rem 0}.focus>.alert{outline:3px solid var(--brand);outline-offset:2px}";
export const AVISOS_CSS = FAMILY;
const ERR = ".err{color:var(--danger);background:var(--danger-soft);padding:.75rem 1rem;border-radius:16px}.ok{color:var(--ok)}";

const TABLE =
  ".wrap{overflow-x:auto;margin:.5rem 0 1rem;background:var(--card);border-radius:var(--r);padding:.4rem 1rem;box-shadow:var(--shadow)}" +
  "table{border-collapse:collapse;width:100%;font-size:.95rem}caption{text-align:left;font-weight:750;padding:.6rem 0}" +
  "th,td{text-align:left;padding:.6rem .35rem;border-bottom:1px solid var(--line)}tr:last-child td{border-bottom:0}" +
  "th{font-size:.74rem;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}.n{text-align:right;font-variant-numeric:tabular-nums}";

// Football videos (0049): the data note, the strip of cards, the big cards of /futbol/videos. Never a player.
const VIDEO = ".vnote{display:flex;align-items:center;gap:.45rem;margin:-.1rem .2rem .55rem;color:var(--muted);font-size:.82rem;font-weight:650}.vnote svg{flex:none}.vstrip{display:flex;align-items:flex-start;gap:.65rem;overflow-x:auto;scroll-snap-type:x mandatory;scroll-padding-inline:1rem;margin:0 -1rem .9rem;padding:.1rem 1rem .6rem}.vcard{display:flex;flex-direction:column;text-decoration:none;color:var(--ink)}.vstrip .vcard{flex:none;width:14.5rem;scroll-snap-align:start;background:var(--card);border-radius:18px;box-shadow:var(--shadow)}.vth{position:relative;display:block;aspect-ratio:16/9;overflow:hidden;border-radius:18px 18px 0 0;background:var(--tile)}.vth img{display:block;width:100%;height:100%;object-fit:cover}.play{position:absolute;left:50%;top:50%;width:2.6rem;height:2.6rem;margin:-1.3rem 0 0 -1.3rem;border-radius:50%;background:rgba(10,12,40,.62)}.play::after{content:\"\";position:absolute;left:1.02rem;top:.75rem;border-style:solid;border-width:.55rem 0 .55rem .9rem;border-color:transparent transparent transparent #fff}.vbadge{position:absolute;left:.5rem;top:.5rem;padding:.12rem .55rem;border-radius:999px;background:var(--brand);color:#fff;font-size:.72rem;font-weight:800}.vbadge.in{position:static;align-self:flex-start;margin-bottom:.2rem}.vb{display:flex;flex-direction:column;gap:.15rem;min-width:0;padding:.6rem .75rem .75rem}.vt{font-size:.92rem;line-height:1.3;font-weight:750}.vstrip .vt{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}.nw{white-space:nowrap}.card.vcard.big{padding:0}.vcard.big .vth{border-radius:var(--r) var(--r) 0 0}.vcard.big .vt{font-size:1.02rem}.vcard.big .vb{padding:.75rem 1rem .9rem}.vcard.big{margin:0 0 .75rem}" +
  // Shorts: vertical cards (9:16), in a strip or a two-column grid; their title in 2 lines
  ".vstrip .vcard.short{width:7.5rem}.short .vth{aspect-ratio:9/16;border-radius:16px 16px 0 0}.short .vb{padding:.45rem .55rem .6rem}.short .vt{font-size:.82rem}.vstrip .short .vt{-webkit-line-clamp:2}" +
  ".short .play{width:2rem;height:2rem;margin:-1rem 0 0 -1rem}.short .play::after{left:.78rem;top:.55rem;border-width:.45rem 0 .45rem .72rem}.short .vbadge{left:.4rem;top:.4rem;font-size:.66rem}" +
  "" +
  ".snote{margin:-.2rem .2rem .55rem;color:var(--muted);font-size:.82rem;font-weight:650}";
// A compact news card (Noticias, and team news on Fútbol).
const NEWSROW = ".nrow{display:flex;flex-wrap:wrap;align-items:flex-start;gap:.6rem .85rem;padding:.8rem .9rem}.nth{flex:none;width:80px;height:80px;border-radius:12px;object-fit:cover;background:var(--tile)}" + ".nx{flex:1 1 9.5rem;min-width:0}.nrow .nt{font-size:.98rem}.nrow .nt a::after{content:\" \\2197\";color:var(--brand-ink)}.ntowns{display:flex;flex-wrap:wrap;gap:.3rem;margin:.1rem 0 .2rem}" + ".nres summary{display:flex;align-items:center;min-height:48px;cursor:pointer;font-weight:700;color:var(--brand-ink)}.nres p{margin:0 0 .2rem}" + "html.big .nth{width:64px;height:64px}";

// Fútbol adds these only when it shows a table, or team news.
export const TABLE_CSS = TABLE;
export const NEWSROW_CSS = NEWSROW + ".nread{display:inline-flex;align-items:center;min-height:48px;font-weight:750;text-decoration:none}";

export const FUTBOL_CSS = VIDEO +
  // Section jump pills under the hero (an intentional horizontal scroller)
  ".jump{display:flex;gap:.4rem;overflow-x:auto;margin:0 -1rem .8rem;padding:.1rem 1rem .35rem}.jump a{flex:none;display:inline-flex;align-items:center;min-height:48px;padding:0 1.05rem;border-radius:999px;background:var(--card);box-shadow:var(--shadow);color:var(--ink);font-weight:700;font-size:.9rem;text-decoration:none;white-space:nowrap}.vids,#noticias,#resultados{scroll-margin-top:1rem}" +
  // The hero: an indigo pitch with the crest, league and flag, form and goals
  ".hero{position:relative;isolation:isolate;overflow:hidden;color:#fff;border-radius:24px;padding:1rem 1.15rem 1.15rem;margin:0 0 1rem;" +
  "background:repeating-linear-gradient(90deg,rgba(255,255,255,.045) 0 26px,transparent 26px 52px),linear-gradient(135deg,#3b44b5,#5f6be3);box-shadow:0 16px 34px rgba(63,75,196,.28)}" +
  ".hero::after{content:\"\";position:absolute;z-index:-1;right:-3.5rem;top:-3.5rem;width:10rem;height:10rem;border-radius:50%;border:2px solid rgba(255,255,255,.14)}" +
  ".hero .top{display:flex;align-items:center;gap:.5rem;margin:0;font-size:.85rem;font-weight:700}.hero .top .flag{margin-left:auto;font-size:1.3rem}" +
  ".lgo{flex:none;object-fit:contain}.hero .lgo{background:#fff;border-radius:9px;padding:3px}" +
  ".hero .id{display:flex;align-items:center;gap:1rem;margin:.9rem 0 .2rem}.hero .id>div{min-width:0}" +
  ".lgb{display:grid;place-items:center;flex:none;width:76px;height:76px;border-radius:50%;background:#fff;font-size:2.5rem;box-shadow:0 6px 16px rgba(0,0,0,.2)}" +
  ".hero img.cr{background:#fff;border-radius:50%;padding:7px;box-shadow:0 6px 16px rgba(0,0,0,.2)}.hero .id>.lgo{padding:8px;border-radius:18px}" +
  ".hero h1{margin:0;color:#fff;font-size:1.5rem;overflow-wrap:anywhere}.hero p{margin:.1rem 0 0;color:rgba(255,255,255,.92);font-size:.92rem}" +
  ".form{display:flex;flex-wrap:wrap;align-items:center;gap:.35rem;margin-top:.85rem}.hero small{color:rgba(255,255,255,.92)}.form>small:first-child{font-weight:700;margin-right:.2rem}" +
  ".form .lgd{flex-basis:100%;font-size:.74rem}" +
  ".fc{display:inline-grid;place-items:center;width:1.75rem;height:1.75rem;border-radius:9px;font-size:.82rem;font-weight:800;color:#fff;vertical-align:middle}" +
  ".fc.W{background:#0e8a43}.fc.D{background:#6b7190}.fc.L{background:#c9352a}.hero .fc{box-shadow:0 0 0 2px rgba(255,255,255,.8)}" +
  ".stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.5rem;margin-top:.9rem}" +
  ".stats>span{background:rgba(10,14,60,.22);border-radius:16px;padding:.55rem .3rem;text-align:center}.stats b{display:block;font-size:1.5rem;line-height:1.1}.stats small{font-size:.72rem;overflow-wrap:anywhere;hyphens:auto}" +
  // Section jumps, next match, results
  ".nx{padding:1.1rem .9rem}.venue{grid-column:1/-1;display:flex;justify-content:center;align-items:center;margin:.3rem 0 0;color:var(--muted);font-size:.84rem}" +
  ".res{border-left:6px solid var(--line)}.res.W{border-left-color:#0e8a43}.res.L{border-left-color:#c9352a}.res.D{border-left-color:#6b7190}.res>small .fc{width:1.35rem;height:1.35rem;font-size:.7rem;border-radius:7px}" +
  // A league's matches under its logo
  ".grp{padding:.8rem 1rem .4rem}.grp>header{display:flex;align-items:center;gap:.6rem;padding-bottom:.6rem;border-bottom:1px solid var(--line)}" +
  ".grp h3{flex:1;margin:0;font-size:.98rem}.grp .flag{font-size:1.2rem;margin:0}" +
  ".fxs{list-style:none;margin:0;padding:0}.fx{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;gap:.5rem;padding:.7rem 0;border-bottom:1px solid var(--line);font-size:.9rem}" +
  ".fx:last-child{border-bottom:0}.fx>span.h,.fx>span.a{display:flex;align-items:center;gap:.45rem;min-width:0;line-height:1.2;overflow-wrap:anywhere;hyphens:auto}.fx>span>b{min-width:0}html.big .fx{font-size:.8rem;gap:.3rem}html.big .fx .cr{width:1.35rem;height:1.35rem;font-size:.5rem}@media (max-width:400px){html.big .fx .cr{display:none}}html.big .fx>span.h,html.big .fx>span.a{gap:.3rem;hyphens:manual}.fx>span.a{justify-content:flex-end;text-align:right}" +
  ".fx b{font-weight:700}.fx .sc{font-size:1.15rem;font-weight:800;font-variant-numeric:tabular-nums;padding:0 .2rem}.fx>small{grid-column:1/-1;text-align:center;margin-top:-.25rem;font-size:.76rem}" +
  ".team{display:flex;align-items:center;gap:1rem}.team h1{margin:0}.team p{margin:.15rem 0 0}";

// "Ahora" (0040) blocks, used by Clima and Hoy en Leamington: the sky's picture,
// the temperature big, its word and the chips.
const AHORA =
  ".ahora{display:flex;flex-wrap:wrap;align-items:center;gap:.3rem .9rem}.ahora>span{flex:1 1 7rem;min-width:0}.ahora.card>.art{width:5rem;height:5rem}html.big .ahora.card>.art{width:4rem;height:4rem}.ahora small{display:block}.ahora .nc{flex-basis:100%;margin-top:.2rem}" +
  ".ahora.card{padding:1rem 1.1rem;background:linear-gradient(135deg,#e6e9fd,#fff 70%)}" +
  ".ahora.in{margin:.55rem 0 .4rem;padding:.55rem 0;border-block:1px solid var(--line)}.ahora.in .art{width:3.2rem;height:3.2rem}.ahora.in .nc>span{padding:.2rem .5rem;font-size:.76rem}" +
  ".tn{display:block;font-size:2.8rem;font-weight:800;letter-spacing:-.03em;line-height:1.05;font-variant-numeric:tabular-nums}.ahora.in .tn{font-size:1.9rem}.lab{display:block;font-size:.98rem}" + ".nc{display:flex;flex-wrap:wrap;gap:.35rem;margin:.55rem 0 0}.nc>span{display:inline-flex;align-items:center;gap:.3rem;padding:.3rem .75rem;border-radius:999px;background:var(--tile);font-size:.8rem;font-weight:650}.nc svg{width:1.1em;height:1.1em;fill:none;stroke:var(--brand-ink);stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}";

export const CLIMA_CSS = ROWS + AHORA + FAMILY + ".seg{display:flex;gap:.3rem;padding:.3rem;margin:0 0 1rem;background:var(--card);border-radius:999px;box-shadow:var(--shadow);overflow-x:auto}.seg a{flex:1 0 auto;display:grid;place-items:center;min-height:48px;padding:0 1rem;border-radius:999px;text-decoration:none;color:var(--ink);font-weight:650;font-size:.92rem;white-space:nowrap}.seg a[aria-current]{background:var(--brand);color:#fff}" + ".gal{display:flex;gap:.6rem;overflow-x:auto;scroll-snap-type:x mandatory;scroll-padding-inline:1rem;margin:.5rem -1rem .6rem;padding:0 1rem .3rem}.gph{flex:none;width:11.25rem;margin:0;scroll-snap-align:start}.gph img{display:block;width:100%;height:auto;aspect-ratio:4/3;object-fit:cover;border-radius:16px;background:var(--tile)}" +
  // Town headers: a photo under a dark overlay, or the indigo gradient
  ".townhead{position:relative;isolation:isolate;display:flex;align-items:flex-end;min-height:9rem;margin:1.4rem 0 .6rem;border-radius:var(--r);overflow:hidden;background:#1d2147;box-shadow:var(--shadow)}" +
  ".townhead img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}" +
  ".townhead::before{content:\"\";position:absolute;inset:0;z-index:1;background:linear-gradient(rgba(14,16,44,.15),rgba(14,16,44,.82))}" +
  ".townhead h2{position:relative;z-index:2;margin:.9rem 1rem;color:#fff;font-size:1.15rem;text-shadow:0 1px 3px rgba(0,0,0,.5)}" +
  ".townhead.plain{min-height:4.6rem;background:linear-gradient(135deg,#3b44b5,#5f6be3)}.townhead.plain::before{display:none}h2 .chip{margin-left:.45rem;text-shadow:none}" +
  // Today: the picture, the big temperature, the low, and the rain-chance ring
  ".now{display:flex;flex-wrap:wrap;align-items:center;gap:.6rem .8rem;padding:1rem}.now>span:not(.ring){flex:1 1 7rem;min-width:0}.now small{display:block}" +
  ".now.rain,.here.rain{background:linear-gradient(135deg,#e3edff,#fff 70%)}.now.sun,.here.sun{background:linear-gradient(135deg,#fff3d6,#fff 70%)}" +
  // The day's forecast, secondary: high and low as arrow chips
  ".hl{display:flex;flex-wrap:wrap;align-items:center;gap:.3rem;margin:.3rem 0}.hl b{display:inline-block;padding:.15rem .6rem;border-radius:999px;font-weight:800;font-variant-numeric:tabular-nums;white-space:nowrap}" +
  ".hl .tp{background:#fff0d6;color:#8a3b00;font-size:1rem}.hl .lo{background:#e3edff;color:#1d4f9a;font-size:1rem}.hl .rn{background:var(--tile);color:var(--brand-ink);font-size:.85rem}" +
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
  // Here in Canada: one full-width card per place. "Ahora" beside today's forecast (they stack when narrow), the chips in one
  // wrapping row, then tomorrow, sunrise and sunset in one compact row.
  ".here{margin:0 0 .75rem;padding:.9rem 1rem}.here>.nm{font-size:1.05rem}.here>small{margin-left:.45rem}" +
  ".hrow{display:flex;flex-wrap:wrap;align-items:flex-start;gap:.6rem 1.1rem;margin-top:.55rem}.ahora.in{display:contents}" +
  ".an{flex:1 1 10rem;display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;column-gap:.65rem;min-width:0}.an>span{display:contents}" +
  ".an small{grid-column:1/-1;margin-bottom:.15rem}.an .art{grid-row:2/span 2;width:3rem;height:3rem}.an .tn,.an .lab{grid-column:2}" +
  ".ahora.in .nc{order:2;flex-basis:100%;margin:0}.htd{order:1;flex:1 1 9rem;min-width:0}.htd .hn{display:flex;align-items:center;gap:.35rem}.htd .hl{margin:.35rem 0 0}.htd .art{width:1.9rem;height:1.9rem}" +
  ".hfoot{display:flex;flex-wrap:wrap;align-items:center;gap:.35rem .7rem;margin-top:.65rem;padding-top:.55rem;border-top:1px solid var(--line)}" +
  ".mini{display:flex;flex-wrap:wrap;gap:.35rem .7rem;list-style:none;margin:0;padding:0}.mini li{display:inline-flex;align-items:center;gap:.3rem;font-size:.84rem}.mini .art{width:1.4rem;height:1.4rem}.hfoot .sky.sm{margin:0}" +
  // Letra grande: the three-day strip fits a 360px screen
  "html.big .strip li{grid-template-columns:2.6rem 1.5rem 2.4rem 1.7rem minmax(1rem,1fr) 2.9rem;gap:.2rem;font-size:.8rem}html.big .strip .art{width:1.5rem;height:1.5rem}" +
  ".aquilink{display:inline-flex;align-items:center;min-height:44px;margin-top:.3rem;font-weight:750;text-decoration:none}" +
  "#aqui,#avisos{scroll-margin-top:1rem}#aqui{margin-bottom:.75rem}" +
  "main>details{background:var(--card);border-radius:var(--r);padding:.2rem 1rem;margin:.75rem 0;box-shadow:var(--shadow)}" +
  "details{margin:.5rem 0}summary{min-height:48px;padding:.7rem 0;cursor:pointer;font-weight:700}";

export const TASA_CSS = ERR + TABLE + ".seg{display:flex;gap:.3rem;padding:.3rem;margin:0 0 1rem;background:var(--card);border-radius:999px;box-shadow:var(--shadow);overflow-x:auto}.seg a{flex:1 0 auto;display:grid;place-items:center;min-height:48px;padding:0 1rem;border-radius:999px;text-decoration:none;color:var(--ink);font-weight:650;font-size:.92rem;white-space:nowrap}.seg a[aria-current]{background:var(--brand);color:#fff}" + ".arr{display:flex;flex-wrap:wrap;gap:.5rem;align-items:center}.arr input{flex:1 1 9rem;min-width:0}.arr button{flex:1 0 auto;width:auto;margin:0;padding:.7rem 1.2rem}" +
  // Header: back, title, the reminder bell
  ".ph .bellbtn svg{width:24px;height:24px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}" +
  // The rate big, its date; a plain note when it is not today's
  ".rhead{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:.3rem .75rem;margin:0 .2rem .9rem}.rhead small{display:block}.rdate{text-align:right;font-weight:650;white-space:nowrap}" +
  ".rt{display:flex;flex-wrap:wrap;align-items:baseline;gap:.35rem;margin:0 0 .15rem;font-variant-numeric:tabular-nums}.rt b{font-size:2.7rem;font-weight:800;letter-spacing:-.03em;line-height:1}.rt span{font-weight:750;color:var(--muted)}" +
  ".stale{margin:0 0 .85rem;padding:.65rem .95rem;border-radius:16px;background:var(--warn-soft);color:var(--warn);font-weight:650}" +
  // Chart card: bars grow from the bottom, the line draws on; neutral colours only
  ".chartc{padding:1rem .85rem .85rem}.chart{display:block;width:100%;height:auto;overflow:visible}" +
  ".chart .b{fill:#cdd2f7;transform-box:fill-box;transform-origin:bottom;animation:rise .6s cubic-bezier(.2,.7,.3,1) both}.chart .b.on{fill:var(--brand)}@keyframes rise{from{transform:scaleY(0)}}" +
  ".chart .g{fill:none;stroke:#c7ccf5;stroke-width:1;stroke-dasharray:3 4}.chart .tk{font-size:10px;fill:#5a6080;font-weight:650}" +
  ".chart .ar{fill:#e8eafc}.chart .ln{fill:none;stroke:var(--brand);stroke-width:3;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:1;animation:draw 1.4s .2s ease-out both}@keyframes draw{from{stroke-dashoffset:1}}" +
  ".chart .dt2{fill:#fff;stroke:var(--brand-ink);stroke-width:3}" +
  ".hilo{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.6rem;margin:.8rem 0 .2rem}.hilo>span{padding:.55rem .75rem;border-radius:14px;background:var(--tile)}.hilo small{display:block}.hilo b{font-size:1.1rem;font-variant-numeric:tabular-nums}" +
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
  ".cres{margin:.3rem 0 .8rem;font-variant-numeric:tabular-nums}.cres b{font-size:1.1rem}.cres .big{display:block;font-size:1.95rem;font-weight:800;letter-spacing:-.02em;line-height:1.15;overflow-wrap:anywhere}" +
  ".cform{display:flex;flex-wrap:wrap;gap:.5rem;margin:0 0 .6rem}.cform input{flex:1 1 8rem;min-width:0}.cform button{flex:1 0 auto;width:auto;margin:0;padding:.7rem 1.1rem}" +
  // Reminder
  ".rt2{display:flex;align-items:baseline;flex-wrap:wrap;gap:.4rem;margin:.7rem 0 .35rem;font-variant-numeric:tabular-nums}.rt2 b{font-size:1.95rem;font-weight:800}.rt2 span{font-weight:750;color:var(--muted)}.rt2 .chip.got{background:var(--brand);color:#fff}" +
  ".rgl{display:flex;justify-content:space-between;margin:.2rem 0 .5rem}.remind .arr{margin:.8rem 0 .5rem}.remind form button.secondary{margin-top:.8rem}" +
  "details.days{padding:.2rem 1rem}details summary{min-height:48px;padding:.75rem 0;cursor:pointer;font-weight:700;color:var(--brand-ink)}" +
  "html.big .rt b{font-size:2.3rem}html.big .wkc .o{width:2.1rem}html.big .cres .big{font-size:1.7rem}";

// The member page (0041): a premium card, then the badges grid.
export const MIEMBRO_CSS =
  ".mcard{position:relative;isolation:isolate;overflow:hidden;display:flex;flex-direction:column;min-height:13rem;color:#fff;border-radius:24px;padding:1.1rem 1.25rem 1.15rem;margin:0 0 1rem;" +
  "background:radial-gradient(circle at 88% 0%,rgba(255,255,255,.22),transparent 42%),repeating-linear-gradient(135deg,rgba(255,255,255,.05) 0 2px,transparent 2px 12px),linear-gradient(135deg,#232a8f,#4b3fc4 55%,#7c3aed);" +
  "box-shadow:0 22px 44px rgba(59,40,160,.35)}" +
  ".mcard::after{content:\"\";position:absolute;inset:0;z-index:-1;background:linear-gradient(110deg,transparent 35%,rgba(255,255,255,.3) 50%,transparent 65%);transform:translateX(-130%);animation:shine 1.7s .45s ease-out both}" +
  "@keyframes shine{to{transform:translateX(130%)}}" +
  ".mtop{display:flex;flex-wrap:wrap;align-items:center;gap:.4rem .5rem}.mtop .art{margin-left:auto}.mark{font-weight:800;letter-spacing:.02em;white-space:nowrap}.mark b{color:#ffd66b}" +
  ".ribbon{padding:.2rem .7rem;border-radius:999px;background:linear-gradient(90deg,#e5a50a,#ffe08a,#f5c542);color:#4a3000;font-size:.74rem;font-weight:800;white-space:nowrap;box-shadow:0 4px 10px rgba(0,0,0,.2)}" +
  ".mname{margin:auto 0 0;padding-top:.8rem;font-size:1.25rem;font-weight:800;line-height:1.2;overflow-wrap:anywhere}.mnum{margin:.1rem 0 0;color:rgba(255,255,255,.88);font-weight:700}" +
  ".mcode{margin:.55rem 0 .6rem;overflow-wrap:anywhere;font:700 1.5rem/1.1 ui-monospace,\"Roboto Mono\",monospace;letter-spacing:.2em}" +
  ".mfoot{display:flex;flex-wrap:wrap;gap:.3rem 1.6rem}.mfoot small{display:block;color:rgba(255,255,255,.8);font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em}.mfoot time{font-weight:750}" +
  ".mst{align-self:flex-start;margin-top:.6rem;background:#fff;color:#8a3b00}" +
  ".mfacts{list-style:none;padding:0;margin:0 0 .5rem}.mfacts li{display:flex;align-items:center;gap:.8rem;margin:0 0 .6rem;padding:.7rem .9rem;background:var(--card);border-radius:var(--r);box-shadow:var(--shadow)}.mfacts small{display:block}" +
  ".badges{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.65rem;list-style:none;padding:0;margin:0 0 1rem}" +
  ".badge{display:flex;flex-direction:column;align-items:center;text-align:center;gap:.3rem;padding:1rem .6rem .9rem;background:var(--card);border-radius:var(--r);box-shadow:var(--shadow);animation:pop .5s cubic-bezier(.3,1.5,.5,1) both}" +
  ".badge:nth-child(2){animation-delay:.07s}.badge:nth-child(3){animation-delay:.14s}.badge:nth-child(4){animation-delay:.21s}.badge:nth-child(5){animation-delay:.28s}.badge:nth-child(6){animation-delay:.35s}.badge:nth-child(7){animation-delay:.42s}.badge:nth-child(8){animation-delay:.49s}" +
  "@keyframes pop{from{opacity:0;transform:scale(.7)}}" +
  ".badge>b{font-size:.95rem;hyphens:auto}.badge small{line-height:1.3}.bt{position:relative}.badge.off .art{filter:grayscale(1);opacity:.45}.badge.off>b{color:var(--muted)}" +
  ".ring.sm{position:absolute;right:0;bottom:0;width:2.5rem;height:2.5rem;box-shadow:0 2px 6px rgba(40,48,120,.2);border-radius:50%}.ring.sm::before{inset:.3rem}.ring.sm b{font-size:.62rem}";

// The welcome screen (0041), inlined only when home shows it.
export const WELCOME_CSS =
  ".welcome{position:relative;isolation:isolate;overflow:hidden;display:flex;flex-direction:column;justify-content:space-between;max-width:none;min-height:100vh;min-height:100dvh;margin:0;" +
  "padding:1rem 1rem calc(1rem + env(safe-area-inset-bottom));color:#fff}" +
  ".wbg{position:absolute;inset:0;z-index:-2;width:100%;height:100%;object-fit:cover}" +
  ".welcome.wp::before{content:\"\";position:absolute;inset:0;z-index:-1;background:linear-gradient(rgba(10,12,40,.6),rgba(10,12,40,.05) 35%,rgba(10,12,40,.45))}" +
  ".wtop{max-width:34rem}.welcome .credit{margin:0;color:#fff;font-size:.74rem;text-shadow:0 1px 3px rgba(0,0,0,.7)}" +
  ".wcard{width:100%;max-width:34rem;margin:0 auto;padding:1.4rem 1.4rem 1.2rem;background:#fff;color:var(--ink);border-radius:32px;box-shadow:0 24px 50px rgba(0,0,0,.35)}" +
  ".wcard h1{margin:.5rem 0 .3rem;font-size:1.6rem}.wcard p{margin:0 0 1.1rem;color:var(--muted);font-weight:700}" +
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
  "@keyframes pop{from{transform:scale(0)}}.hv{position:absolute;left:0;right:0;margin-top:-1.7rem;font-size:.8rem;font-weight:800}" +
  ".hc .art{width:1.75rem;height:1.75rem}.rb{display:flex;align-items:flex-end;width:.6rem;height:2.6rem;margin-top:.2rem;border-radius:9px;background:#e3edff;overflow:hidden}" +
  ".rb i{display:block;width:100%;border-radius:9px;background:#a9c8f3;transform-origin:bottom;animation:rise .7s .3s cubic-bezier(.2,.7,.3,1) both}@keyframes rise{from{transform:scaleY(0)}}" +
  ".rh .rb i{background:var(--rain)}.rp2{min-height:1.1em;font-size:.7rem;font-weight:650}.rh .rp2{color:var(--rain);font-weight:800}.hh{font-size:.7rem;font-weight:750;color:var(--ink)}" +
  // Gauges: the needle sweeps once
  ".gw{display:flex;flex-direction:column;align-items:center;text-align:center;margin-top:.5rem}.gauge{display:block;width:100%;max-width:15rem;height:auto;overflow:visible}" +
  ".gauge .ndl{transform-origin:100px 100px;transform:rotate(var(--a));animation:sweep 1.1s .2s cubic-bezier(.2,.7,.3,1) both}@keyframes sweep{from{transform:rotate(0deg)}}" +
  ".gauge .nd{stroke:var(--ink);stroke-width:5;stroke-linecap:round}.gauge .hub{fill:var(--ink)}.gauge .rg2{fill:none;stroke:var(--ink);stroke-width:28}" +
  ".gv{display:flex;align-items:baseline;justify-content:center;gap:.3rem;margin:-.6rem 0 0;font-variant-numeric:tabular-nums}.gv b{font-size:2.45rem;font-weight:800;line-height:1}.gv span{font-weight:750;color:var(--muted)}" +
  ".gl{margin:.25rem 0 .1rem;font-weight:750;font-size:1.05rem}" +
  ".heat{display:flex;align-items:center;gap:.8rem;margin:.9rem 0 0;padding:.7rem .85rem;border-radius:16px;background:var(--warn-soft)}.heat b{display:block}.heat .chip{margin-top:.3rem;background:#fff;color:var(--warn)}" +
  ".light .gv{justify-content:flex-start;margin:.6rem 0 .1rem}.light .gv b{font-size:2rem}.rise{margin:.5rem 0 0}" +
  "html.big .gv b{font-size:2.1rem}html.big .hgrid{grid-template-columns:repeat(var(--n),minmax(3.3rem,1fr));min-width:calc(var(--n)*3.3rem)}";

// Lotería (0045): the number check's forms and draws; official balls drop in.
// Extra result balls ("Más 1", "Adicional", "Bonus Ball"), shared by Lotería and Tu semana.
const XBALL = ".brow{display:flex;flex-wrap:wrap;align-items:center;gap:0 .8rem}.xb{display:inline-flex;align-items:center;gap:.35rem}.xb small{font-weight:750;color:var(--muted)}.xb .balls b{width:2.1rem;height:2.1rem;font-size:.88rem}";

export const LOTERIA_CSS = ERR + XBALL +
  ".ch{display:flex;align-items:center;gap:.7rem}.ch small{display:block}.gname{font-size:1.1rem}" +
  ".picks{display:flex;flex-wrap:wrap;gap:.4rem;margin:.8rem 0 .35rem}.picks input{width:3rem;min-height:50px;padding:.4rem;text-align:center;font-size:1.15rem;font-weight:800}" +
  ".picks.wide input{width:8.5rem;letter-spacing:.2em}.picks button{width:auto;margin:0;padding:.8rem 1.15rem}" +
  ".lot .stale{margin:.75rem 0 0;padding:.65rem .95rem;border-radius:14px;background:var(--warn-soft);color:var(--warn);font-weight:650}.lot .err{margin:.75rem 0 0}" +
  ".mine{margin:.75rem 0 0;font-weight:650}.draw{margin:.6rem 0 0;box-shadow:none;background:var(--tile)}" +
  ".balls b{animation:drop .55s cubic-bezier(.3,1.4,.5,1) both}.balls b:nth-child(2){animation-delay:.07s}.balls b:nth-child(3){animation-delay:.14s}" +
  ".balls b:nth-child(4){animation-delay:.21s}.balls b:nth-child(5){animation-delay:.28s}.balls b:nth-child(6){animation-delay:.35s}@keyframes drop{from{opacity:0;transform:translateY(-18px)}}" +
  ".balls b.hit{position:relative;box-shadow:0 0 0 3px var(--card),0 0 0 6px var(--brand)}" +
  ".balls b i{position:absolute;top:-.4rem;right:-.4rem;display:grid;place-items:center;width:1.15rem;height:1.15rem;border-radius:50%;background:var(--brand);color:#fff;font-size:.62rem;font-style:normal}" +
  ".pos,.anyo{display:block;font-weight:700;color:var(--brand-ink)}" +
  ".res .tile{margin-bottom:.5rem}.prev{margin:0 0 .9rem;border-radius:18px;background:var(--card);box-shadow:var(--shadow)}.prev summary{display:flex;align-items:center;min-height:48px;padding:0 1rem;font-weight:700;cursor:pointer}" +
  ".prev ul{list-style:none;margin:0;padding:0 1rem .4rem}.prev li{padding:.5rem 0;border-top:1px solid var(--line)}.prev .balls{margin:0}.prev .balls b{width:2.1rem;height:2.1rem;font-size:.88rem}.prev small{display:block;margin-top:.2rem}";

// Tu semana (0045): the opened-days circles, the rate's week, the week's parts.
export const SEMANA_CSS = XBALL +
  ".ch{display:flex;align-items:center;gap:.7rem}.ch h2{margin:0}.wtitle{margin:-.4rem .2rem 1rem;font-weight:750;color:var(--muted)}" +
  ".wkc{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:.25rem;list-style:none;padding:0;margin:.2rem 0 .55rem;text-align:center}.wkc small{display:block;font-weight:650;margin-bottom:.25rem}" +
  ".wkc .o{display:grid;place-items:center;width:2.5rem;max-width:100%;aspect-ratio:1;margin:0 auto;border-radius:50%;border:2px solid var(--brand);color:var(--brand-ink);font-weight:800;animation:pop .45s cubic-bezier(.3,1.5,.5,1) both}" +
  ".wc.up .o{background:var(--brand);color:#fff}.wc.nd .o{border-style:dashed;border-color:#aab2e6}@keyframes pop{from{opacity:0;transform:scale(.6)}}" +
  ".wc:nth-child(2) .o{animation-delay:.06s}.wc:nth-child(3) .o{animation-delay:.12s}.wc:nth-child(4) .o{animation-delay:.18s}.wc:nth-child(5) .o{animation-delay:.24s}.wc:nth-child(6) .o{animation-delay:.3s}.wc:nth-child(7) .o{animation-delay:.36s}" +
  ".big1{display:flex;flex-wrap:wrap;align-items:baseline;gap:.2rem .5rem;margin:.3rem 0 0;font-weight:700}.big1 b{font-size:2rem;line-height:1}" +
  ".rt{display:flex;flex-wrap:wrap;align-items:baseline;gap:.35rem;margin:.6rem 0 .2rem;font-variant-numeric:tabular-nums}.rt b{font-size:2rem;font-weight:800;line-height:1}.rt span{font-weight:750;color:var(--muted)}.rt small{margin-left:auto}" +
  ".stale{margin:.4rem 0;padding:.6rem .9rem;border-radius:14px;background:var(--warn-soft);color:var(--warn);font-weight:650}" +
  ".chart{display:block;width:100%;height:auto;margin-top:.5rem;overflow:visible}.chart .b{fill:#cdd2f7;transform-box:fill-box;transform-origin:bottom;animation:rise .6s cubic-bezier(.2,.7,.3,1) both}.chart .b.on{fill:var(--brand)}" +
  "@keyframes rise{from{transform:scaleY(0)}}.chart .g{fill:none;stroke:#c7ccf5;stroke-width:1;stroke-dasharray:3 4}.chart .tk{font-size:10px;fill:#5a6080;font-weight:650}" +
  ".hilo{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.6rem;margin:.75rem 0 .2rem}.hilo>span{padding:.55rem .75rem;border-radius:14px;background:var(--tile)}.hilo small{display:block}.hilo b{font-size:1.1rem;font-variant-numeric:tabular-nums}" +
  ".chg{display:inline-block;margin-top:.5rem;padding:.25rem .8rem;border-radius:999px;background:var(--tile);color:var(--brand-ink);font-weight:750;font-size:.86rem}" +
  ".bw{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.5rem;list-style:none;padding:0;margin:.4rem 0 0;text-align:center}.bw li{display:flex;flex-direction:column;align-items:center}.bw .art{animation:pop .5s cubic-bezier(.3,1.5,.5,1) both}" +
  ".res2{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;gap:.5rem;margin:.5rem 0;font-weight:650;font-size:.92rem}" +
  ".res2>span{display:flex;align-items:center;gap:.4rem;min-width:0;overflow-wrap:anywhere;hyphens:auto}.res2>span:last-child{justify-content:flex-end;text-align:right}.res2 .sc{font-size:1.2rem;font-weight:800}.res2 .rd{grid-column:1/-1;color:var(--muted);font-weight:600}.nx2{margin:.6rem 0 0}" +
  ".rng{display:block;margin-top:.35rem;font-weight:650}.wcap{display:block;font-weight:650}";

export const LOGIN_CSS = ERR + ".brandmark{font-weight:800;font-size:2.2rem;color:#fff;letter-spacing:-.03em;margin:0;line-height:1}.steps{list-style:none;padding:0;margin:.5rem 0}.steps li{display:flex;gap:.75rem;align-items:flex-start;margin:.8rem 0}.steps .n{display:grid;place-items:center;flex:none;width:2rem;height:2rem;border-radius:50%;background:var(--brand);color:#fff;font-weight:800;font-size:.9rem}" +
  ".feat{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.5rem;list-style:none;padding:0;margin:0 0 1rem}" +
  ".feat li{display:flex;flex-direction:column;align-items:center;gap:.25rem;padding:.65rem .2rem;border-radius:18px;background:var(--card);box-shadow:var(--shadow);font-weight:750;font-size:.8rem;text-align:center;line-height:1.2}" +
  ".feat small{font-size:.7rem;font-weight:550}";

export const SETUP_CSS = ROWS + ERR + "input[type=checkbox],input[type=radio]{width:1.35rem;min-height:1.35rem;vertical-align:middle;margin:0 .7rem 0 0;accent-color:var(--brand)}.choice{display:flex;align-items:center;min-height:52px;font-weight:550;margin:.5rem 0;padding:.5rem 1rem;background:var(--card);border-radius:18px;box-shadow:var(--shadow)}" +
  "button.link{display:inline;width:auto;min-height:48px;margin:0 0 0 .5rem;padding:.5rem;background:transparent;color:var(--brand-ink);text-decoration:underline;font-weight:550;box-shadow:none}" +
  "button.link.skip{display:block;width:100%;margin:.5rem 0;color:var(--muted)}" +
  ".results button{text-align:left;background:var(--card);color:var(--ink);border-radius:18px;font-weight:550;margin:.5rem 0;box-shadow:var(--shadow)}" +
  ".prog{display:flex;align-items:center;gap:.75rem;margin:0 0 1rem}.prog .bar{flex:1;margin:0}";

// Más (moved out of APP_CSS so every other page stays lighter): the grid, Letra grande, Tema, the arrival form.
export const MAS_CSS = ERR +
  ".menu{display:grid;gap:.5rem;list-style:none;padding:0;margin:0 0 1rem}" +
  ".menu a{display:flex;align-items:center;gap:.85rem;min-height:4.25rem;padding:.65rem 1rem;background:var(--card);border-radius:var(--r);text-decoration:none;color:var(--ink);font-weight:750;line-height:1.25;box-shadow:var(--shadow)}" +
  ".menu a>span:not(.pic){flex:1;min-width:0;hyphens:auto}.menu small{display:block;font-weight:500;margin-top:.15rem;line-height:1.3}" +
  ".menu a::after{content:\"\u203a\";display:grid;place-items:center;flex:none;width:2rem;height:2rem;border-radius:50%;background:var(--tile);color:var(--brand-ink);font-size:1.3rem;line-height:1}" +
  ".letra h2,.llegada h2{margin:.1rem 0 .7rem}" +
  ".arr{display:flex;flex-wrap:wrap;gap:.5rem;align-items:center}.arr input{flex:1 1 10rem;min-width:0}.arr button{flex:1 0 auto;width:auto;margin:0;padding:.7rem 1.2rem}" +
  "form.optlist{display:grid;grid-template-columns:minmax(0,1fr);gap:.5rem}" +
  "form.optlist button{display:flex;align-items:center;gap:.8rem;min-height:56px;margin:0;padding:.55rem .85rem;border-radius:16px;background:var(--tile);color:var(--ink);box-shadow:none;text-align:left;font-weight:700}" +
  "form.optlist button.on{background:var(--brand-soft);box-shadow:inset 0 0 0 2px var(--brand)}" +
  ".ot{flex:1;min-width:0}.ot b{display:block;line-height:1.25;hyphens:auto}.ot small{display:block;font-weight:500;line-height:1.3}" +
  ".ck{display:grid;place-items:center;flex:none;width:1.6rem;height:1.6rem;border-radius:50%;border:2px solid #c3c8e8;color:#fff;font-size:.8rem;font-weight:800}.on .ck{background:var(--brand);border-color:var(--brand)}" +
  ".sw{flex:none;display:block;width:2.5rem;height:1.75rem;border-radius:8px;border:2px solid var(--line)}.sw.light{background:linear-gradient(135deg,#eef0fb 50%,#fff 50%)}.sw.dark{background:linear-gradient(135deg,#0e1230 50%,#1a2046 50%)}.sw.auto{background:linear-gradient(135deg,#eef0fb 50%,#1a2046 50%)}" +
  ".az{display:grid;place-items:center;flex:none;width:2.5rem;height:2.5rem;border-radius:12px;background:var(--card);color:var(--ink);font-size:1rem;font-weight:800;line-height:1}.az.l{font-size:1.4rem}" +
  // Letra grande: the words get the room (no chevron on menu rows, as on tiles; smaller previews and gaps on option rows)
  "html.big .menu a::after{display:none}html.big form.optlist button{gap:.55rem;padding:.5rem .7rem}html.big .sw{width:2rem;height:1.5rem}html.big .az{width:2.1rem;height:2.1rem}html.big .ck{width:1.4rem;height:1.4rem}";

// The expiry screen (home's route while a period has ended): the code and the steps.
export const EXPIRY_CSS = ".steps{list-style:none;padding:0;margin:.5rem 0}.steps li{display:flex;gap:.75rem;align-items:flex-start;margin:.8rem 0}.steps .n{display:grid;place-items:center;flex:none;width:2rem;height:2rem;border-radius:50%;background:var(--brand);color:#fff;font-weight:800;font-size:.9rem}.code{overflow-wrap:anywhere;font:700 1.75rem/1.1 ui-monospace,\\\"Roboto Mono\\\",monospace;letter-spacing:.12em;border:2px dashed var(--brand);border-radius:20px;padding:1rem;text-align:center;background:#f7f8ff;color:var(--ink);margin:.5rem 0 1rem}";

// Feriados: the filter pills and "Ver más feriados".
export const FERIADOS_CSS = ROWS + ".seg{display:flex;gap:.3rem;padding:.3rem;margin:0 0 1rem;background:var(--card);border-radius:999px;box-shadow:var(--shadow);overflow-x:auto}.seg a{flex:1 0 auto;display:grid;place-items:center;min-height:48px;padding:0 1rem;border-radius:999px;text-decoration:none;color:var(--ink);font-weight:650;font-size:.92rem;white-space:nowrap}.seg a[aria-current]{background:var(--brand);color:#fff}details.morehol>summary{display:flex;align-items:center;min-height:48px;padding:.6rem 1.1rem;margin:0 0 .75rem;border-radius:999px;background:var(--card);box-shadow:var(--shadow);font-weight:750;color:var(--brand-ink);cursor:pointer}";

// Noticias (0047): the section pills, the lead story, compact story cards, the sources.
export const NOTICIAS_CSS =
  ".seg{display:flex;gap:.3rem;padding:.3rem;margin:0 0 1rem;background:var(--card);border-radius:999px;box-shadow:var(--shadow);overflow-x:auto}.seg a{flex:1 0 auto;display:grid;place-items:center;min-height:48px;padding:0 1rem;border-radius:999px;text-decoration:none;color:var(--ink);font-weight:650;font-size:.92rem;white-space:nowrap}.seg a[aria-current]{background:var(--brand);color:#fff}" +
  ".nupd{margin:-.35rem .2rem .7rem}.stale{margin:0 0 .85rem;padding:.65rem .95rem;border-radius:16px;background:var(--warn-soft);color:var(--warn);font-weight:650}" +
  ".nlead{padding:.8rem .85rem 1rem}.nlead .nt{font-size:1.2rem;margin:.25rem 0 .35rem}.nsum{margin:0 0 .3rem}" +
  ".nread{display:inline-flex;align-items:center;min-height:48px;font-weight:750;text-decoration:none}" +
  NEWSROW +
  ".nsrc{margin:1rem .2rem}";

// Rows with a picture (Escuela, Transporte) and tap-to-call rows (Emergencias, Consulado): only those pages carry them.
export const EV_CSS = ROWS + ".ev{display:flex;gap:.85rem;align-items:center}.ev>span:not(.pic){flex:1;min-width:0}.ev{flex-wrap:wrap;align-items:flex-start}.ev>span:not(.pic){flex:1 1 11rem}";
export const DIAL_CSS = ROWS + ".dialrow{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem .85rem;text-decoration:none;color:inherit;min-height:48px}.dialrow>span:not(.pic){flex:1 1 12rem;min-width:0}.dialrow .num{font-size:1.3rem;white-space:nowrap}";

// /futbol/videos (0049): the tabs, the update line, one column of big video cards.
export const VIDEOS_CSS = VIDEO +
  ".seg{display:flex;gap:.3rem;padding:.3rem;margin:0 0 1rem;background:var(--card);border-radius:999px;box-shadow:var(--shadow);overflow-x:auto}.seg a{flex:1 0 auto;display:grid;place-items:center;min-height:48px;padding:0 1rem;border-radius:999px;text-decoration:none;color:var(--ink);font-weight:650;font-size:.92rem;white-space:nowrap}.seg a[aria-current]{background:var(--brand);color:#fff}" +
  ".nupd{margin:-.35rem .2rem .7rem}.stale{margin:0 0 .85rem;padding:.65rem .95rem;border-radius:16px;background:var(--warn-soft);color:var(--warn);font-weight:650}.vsrc{margin:1rem .2rem}" +
  // The Shorts grid and the team tab's category filter
  ".vgrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.65rem}.vgrid .vcard{min-width:0;background:var(--card);border-radius:18px;box-shadow:var(--shadow)}.vgrid .vt{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.cats{display:flex;flex-wrap:wrap;gap:.4rem;margin:0 0 .8rem}.cats a{display:inline-flex;align-items:center;min-height:48px;padding:0 1rem;border-radius:999px;background:var(--tile);color:var(--brand-ink);font-weight:700;font-size:.88rem;text-decoration:none}.cats a[aria-current]{background:var(--brand);color:#fff}";
