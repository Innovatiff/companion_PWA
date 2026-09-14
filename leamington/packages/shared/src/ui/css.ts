/**
 * The design system from docs/DESIGN.md, as inline CSS. System fonts only;
 * nothing is downloaded. Hoy inlines APP_CSS (TOKENS and BASE are its parts);
 * the portals inline PORTAL_CSS.
 */

// Hoy's look (docs/DESIGN.md section 3, owner's direction 2026-09-14): a soft
// lavender ground, white cards with a large radius and diffuse shadows, one
// blue-violet primary, an indigo hero that follows the sky, pictures on rounded
// tiles, pills, and a raised round centre tab. Colour is never the only signal.
export const TOKENS =
  ":root{--ink:#1b1f3b;--paper:#eef0fb;--card:#fff;--muted:#5a6080;--line:#e6e8f5;--tile:#eceefd;" +
  "--brand:#4f5bd5;--brand-2:#5d69e0;--brand-ink:#3f4bc4;--brand-soft:#e8eafc;--danger:#b42318;--danger-soft:#fdecea;" +
  "--warn:#9a4a00;--warn-soft:#fdf0dc;--caution:#7a5f00;--caution-soft:#fbf4d4;--ok:#0f7a55;--ok-soft:#e2f5ec;--rain:#2f74d0;" +
  "--focus:#1a56db;--r:20px;--shadow:0 1px 2px rgba(40,48,120,.05),0 10px 28px rgba(40,48,120,.08)}";

export const BASE = TOKENS +
  "*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}" +
  "body{margin:0;font:17px/1.5 system-ui,-apple-system,Roboto,\"Segoe UI\",sans-serif;color:var(--ink);background:var(--paper)}" +
  "a{color:var(--brand-ink)}:focus-visible{outline:3px solid var(--focus);outline-offset:2px}" +
  "h1{font-size:1.65rem;line-height:1.2;margin:.4rem 0 1rem;font-weight:800;letter-spacing:-.02em}" +
  "h2{font-size:1.12rem;line-height:1.3;margin:1.5rem .2rem .65rem;font-weight:750;letter-spacing:-.01em}" +
  "p{margin:.5rem 0}small,.muted{color:var(--muted);font-size:.85rem}" +
  ".sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}" +
  "ul.rows{list-style:none;margin:0 0 1rem;padding:.2rem 1.1rem;background:var(--card);border-radius:var(--r);box-shadow:var(--shadow)}" +
  "ul.rows>li{padding:.85rem 0;border-bottom:1px solid var(--line)}ul.rows>li:last-child{border-bottom:0}" +
  "label{display:block;font-weight:650;margin:1rem 0 .4rem}" +
  "input,select{font:inherit;width:100%;min-height:52px;padding:.6rem 1rem;border:1.5px solid #d3d7ee;border-radius:16px;background:var(--card);color:var(--ink)}" +
  "input:focus,select:focus{outline:3px solid rgba(79,91,213,.22);border-color:var(--brand)}" +
  "input[type=checkbox],input[type=radio]{width:1.35rem;min-height:1.35rem;vertical-align:middle;margin:0 .7rem 0 0;accent-color:var(--brand)}" +
  ".choice{display:flex;align-items:center;min-height:56px;font-weight:550;margin:.5rem 0;padding:.5rem 1rem;background:var(--card);border-radius:18px;box-shadow:var(--shadow)}" +
  "button,.button{display:block;width:100%;min-height:54px;font:inherit;font-weight:700;padding:.85rem 1rem;border:0;border-radius:999px;" +
  "background:linear-gradient(135deg,var(--brand),var(--brand-2));color:#fff;text-align:center;text-decoration:none;cursor:pointer;margin:.75rem 0;box-shadow:0 10px 22px rgba(79,91,213,.3)}" +
  ".button.secondary,button.secondary{background:var(--card);color:var(--brand-ink);box-shadow:var(--shadow)}" +
  ".err{color:var(--danger);background:var(--danger-soft);padding:.75rem 1rem;border-radius:16px}.ok{color:var(--ok)}" +
  ".skip{display:block;text-align:center;padding:.8rem;min-height:48px}";

export const APP_CSS = BASE +
  "main{max-width:34rem;margin:0 auto;padding:.9rem 1rem calc(7.5rem + env(safe-area-inset-bottom))}#slot:empty{display:none}" +
  // Motion: cards rise in, bars and rings fill, whole numbers count up. CSS only,
  // transform and opacity only (no layout shift), nothing loops but the sky, and
  // all of it stops under prefers-reduced-motion.
  "@property --n{syntax:\"<integer>\";inherits:false;initial-value:0}@property --p{syntax:\"<number>\";inherits:false;initial-value:0}" +
  "@keyframes up{from{opacity:0;transform:translateY(14px)}}@keyframes grow{from{transform:scaleX(0)}}@keyframes cu{from{--n:0}}@keyframes fill{from{--p:0}}" +
  "@keyframes pulse{50%{transform:scale(1.3)}}@keyframes tw{to{opacity:.35}}" +
  "main>*,.towns>*,.menu>li{animation:up .5s cubic-bezier(.2,.7,.3,1) both}" +
  "main>:nth-child(3){animation-delay:.05s}main>:nth-child(4){animation-delay:.1s}main>:nth-child(5){animation-delay:.15s}main>:nth-child(6){animation-delay:.2s}" +
  "main>:nth-child(7){animation-delay:.25s}main>:nth-child(n+8){animation-delay:.3s}.menu>li:nth-child(2n),.towns>:nth-child(2n){animation-delay:.08s}" +
  ".cu{counter-reset:n var(--n);animation:cu 1.1s cubic-bezier(.2,.7,.3,1) both}.cu::before{content:counter(n)}" +
  ".bar{display:block;height:.5rem;margin-top:.3rem;border-radius:9px;background:var(--tile);overflow:hidden}" +
  ".bar i{display:block;height:100%;border-radius:9px;background:linear-gradient(90deg,#8f98f5,var(--brand));transform-origin:left;animation:grow 1s .2s cubic-bezier(.2,.7,.3,1) both}" +
  ".ring{position:relative;display:grid;place-items:center;flex:none;width:4.9rem;height:4.9rem;border-radius:50%;background:conic-gradient(var(--brand) calc(var(--p)*1%),var(--tile) 0);animation:fill 1.2s .15s cubic-bezier(.2,.7,.3,1) both}" +
  ".ring.rn{background:conic-gradient(var(--rain) calc(var(--p)*1%),#dde8fa 0)}.ring::before{content:\"\";position:absolute;inset:.6rem;border-radius:50%;background:var(--card)}" +
  ".ring>span{position:relative;text-align:center;line-height:1.05}.ring b{display:block;font-size:1.05rem;font-weight:800}.ring small{display:block;font-size:.68rem;font-weight:650}" +
  "@media (prefers-reduced-motion:reduce){*,::before,::after{animation:none!important;transition:none!important}}" +
  // Home's top row: initials, the member pill, the warnings bell
  ".top{display:flex;align-items:center;justify-content:space-between;gap:.75rem;margin:0 0 1rem}" +
  ".av{display:grid;place-items:center;flex:none;width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,#ffd9b0,#ffb9cc);color:#5a2140;font-weight:800;box-shadow:0 0 0 3px #fff,var(--shadow)}" +
  ".member{display:inline-flex;align-items:center;gap:.45rem;min-height:48px;padding:0 1.35rem;border-radius:999px;background:linear-gradient(135deg,var(--brand),var(--brand-2));color:#fff;font-weight:750;text-decoration:none;box-shadow:0 10px 22px rgba(79,91,213,.35)}.member b{color:#ffd66b}" +
  ".bellbtn,.back{position:relative;display:grid;place-items:center;flex:none;width:48px;height:48px;border-radius:50%;background:var(--card);color:var(--ink);box-shadow:var(--shadow)}" +
  ".top svg,.back svg{width:24px;height:24px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}" +
  ".dot{position:absolute;top:11px;right:12px;width:11px;height:11px;border-radius:50%;background:#e5343a;box-shadow:0 0 0 2.5px #fff;animation:pulse 1.2s ease-in-out .6s 3}" +
  // The hero (home greeting, login, expiry): an indigo gradient with a diagonal light
  ".hello{position:relative;isolation:isolate;overflow:hidden;display:flex;align-items:center;gap:.75rem;color:#fff;border-radius:24px;padding:1.25rem;margin:0 0 1rem;" +
  "background:linear-gradient(125deg,#3b44b5,#5f6be3);box-shadow:0 16px 34px rgba(63,75,196,.28)}" +
  ".hello::before{content:\"\";position:absolute;inset:0;z-index:-1;background:linear-gradient(115deg,transparent 52%,rgba(255,255,255,.09) 52% 66%,transparent 66%)}" +
  ".hello>div{flex:1;min-width:0}.hello h1{margin:.5rem 0 0;color:#fff;font-size:1.8rem;line-height:1.15}.hello p{margin:.35rem 0 0;color:rgba(255,255,255,.92);font-size:.95rem}.hello small{color:rgba(255,255,255,.88)}" +
  ".hello .ico{width:3.6rem;height:3.6rem;border-radius:50%;background:rgba(255,255,255,.16);color:#fff}.art{flex:none;display:block}" +
  ".lbl{display:inline-flex;align-items:center;gap:.35rem;padding:.25rem .75rem;border-radius:999px;background:rgba(10,14,60,.2);font-size:.8rem;font-weight:700}" +
  // Home's live sky: dawn, day, dusk, night in Leamington right now
  ".sk{display:block;min-height:10rem}.sk>.art{position:absolute;top:.8rem;right:.8rem;width:5.75rem;height:5.75rem}.sk>div{position:relative}.sk h1{padding-right:5.25rem}" +
  ".s-day{background:radial-gradient(circle at 86% 18%,rgba(255,226,140,.35),transparent 34%),linear-gradient(135deg,#3e46c4,#2a74c9)}" +
  ".s-dawn{background:radial-gradient(circle at 86% 20%,rgba(255,196,120,.45),transparent 36%),linear-gradient(135deg,#43389e,#8a4a9e 55%,#c24a6e)}" +
  ".s-dusk{background:radial-gradient(circle at 86% 20%,rgba(255,160,90,.42),transparent 36%),linear-gradient(135deg,#312d86,#7a3f93 55%,#bf5a4a)}" +
  ".s-night{background:linear-gradient(135deg,#12163f,#2c3281)}" +
  ".s-night::after{content:\"\";position:absolute;inset:0;z-index:-1;animation:tw 2.8s ease-in-out infinite alternate;background:" +
  "radial-gradient(1.6px 1.6px at 12% 22%,#fff 50%,transparent 70%),radial-gradient(1.2px 1.2px at 36% 10%,#fff 50%,transparent 70%),radial-gradient(1.4px 1.4px at 60% 34%,#fff 50%,transparent 70%)," +
  "radial-gradient(1px 1px at 74% 72%,#fff 50%,transparent 70%),radial-gradient(1.6px 1.6px at 48% 86%,#fff 50%,transparent 70%),radial-gradient(1.2px 1.2px at 92% 90%,#fff 50%,transparent 70%)," +
  "radial-gradient(1px 1px at 24% 66%,#fff 50%,transparent 70%),radial-gradient(1.3px 1.3px at 66% 6%,#fff 50%,transparent 70%)}" +
  // Their hometown photo inside the hero, with its credit
  ".ht{display:flex;align-items:center;gap:.75rem;margin:1rem 0 0;padding:.5rem;border-radius:18px;background:rgba(10,14,60,.24)}" +
  ".ht>img{flex:none;width:5.5rem;height:4.2rem;border-radius:13px;object-fit:cover}.ht>span{min-width:0}" +
  ".place{display:inline-flex;align-items:center;gap:.3rem;font-size:.95rem;font-weight:750}" +
  ".credit{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;margin:.35rem .2rem 0;font-size:.7rem;line-height:1.35;color:var(--muted)}.credit a{color:inherit}" +
  ".hello .credit{margin:.15rem 0 0;color:rgba(255,255,255,.9)}.ht .credit{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
  // Section headers with "Ver todo", section page headers, the once-a-day prompt
  ".sh{display:flex;align-items:center;justify-content:space-between;gap:1rem;margin:1.25rem .2rem .35rem}.sh h2{margin:0}" +
  ".sh>a{display:inline-flex;align-items:center;min-height:48px;padding:0 .2rem;font-weight:700;font-size:.92rem;text-decoration:none;color:var(--brand-ink)}" +
  ".ph{display:grid;grid-template-columns:48px minmax(0,1fr) 52px;align-items:center;gap:.6rem;margin:0 0 1rem}.ph h1{margin:0;text-align:center;font-size:1.35rem}" +
  ".ph.tab{grid-template-columns:minmax(0,1fr) 52px}.ph.tab h1{text-align:left;font-size:1.8rem}" +
  ".prompt{display:flex;align-items:center;min-height:52px;padding:.8rem 1.1rem;background:var(--brand-soft);color:var(--brand-ink);border-radius:18px;text-decoration:none;font-weight:700;margin:0 0 .75rem}" +
  "#stamp{color:var(--muted);font-size:.9rem;margin-top:1rem;text-align:center}.step{color:var(--muted);font-size:.85rem;margin:0;font-weight:650}" +
  // Cards and rows: a picture on a rounded tile, a short label, the line or a big number
  ".card,.tile{background:var(--card);border-radius:var(--r);box-shadow:var(--shadow);margin:0 0 .75rem}.card{padding:1rem 1.1rem}" +
  ".tile{display:flex;gap:.9rem;align-items:center;min-height:4.75rem;padding:.8rem 1rem;text-decoration:none;color:var(--ink)}.tile>span:not([class]){flex:1;min-width:0}" +
  ".pic,.ico,.mi{display:grid;place-items:center;flex:none;border-radius:16px;background:var(--tile);color:var(--brand-ink)}" +
  ".pic{width:3.5rem;height:3.5rem}.pic .art{width:2.6rem;height:2.6rem}.ico{width:3rem;height:3rem}" +
  ".ico svg,.i svg,.dial svg,.place svg{width:25px;height:25px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}" +
  ".i{display:inline-grid;place-items:center;vertical-align:-.2em;margin-right:.35rem;color:var(--brand-ink)}.i svg,.dial svg,.place svg{width:1.15em;height:1.15em;stroke-width:2.2}" +
  ".tile p{margin:.1rem 0}.tile small{display:block}.tile small:first-child{font-weight:650}" +
  "p.line{font-size:1.15rem;font-weight:700;margin:.05rem 0 0;line-height:1.3}" +
  ".nb{display:block;font-size:2.1rem;font-weight:800;line-height:1.1;letter-spacing:-.02em;font-variant-numeric:tabular-nums}" +
  ".nb em{font-style:normal;font-size:.95rem;font-weight:700;color:var(--muted);letter-spacing:0;margin-left:.3rem}" +
  // "Ahora" beside its forecast fallback: the fallback shows only once "Ahora" is gone
  "span.ahora,.fc{display:contents}.ahora+.fc{display:none}.tx{flex:1;min-width:0}.aw{font-weight:800;color:var(--brand-ink)}.tb .aw{display:inline}.hello .aw{color:#fff}" +
  ".nc{display:flex;flex-wrap:wrap;gap:.35rem;margin:.55rem 0 0}.nc>span{display:inline-flex;align-items:center;gap:.3rem;padding:.3rem .75rem;border-radius:999px;background:var(--tile);font-size:.86rem;font-weight:650}" +
  ".nc svg{width:1.1em;height:1.1em;fill:none;stroke:var(--brand-ink);stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}" +
  // Letra grande's two previews (Más)
  ".aa{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.65rem}.aa button{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.15rem;min-height:6rem;margin:0;border-radius:20px}" +
  ".aa .a1{font-size:1.45rem;font-weight:800;line-height:1.1}.aa .a2{font-size:2.3rem;font-weight:800;line-height:1}.aa .on::after{content:\"✓\";font-weight:800}.letra h2{margin:.1rem 0 .75rem}" +
  "a.tile.x::after{display:none}.ev{display:flex;gap:.85rem;align-items:center}.ev>span{flex:1;min-width:0}" +
  "a.tile::after{content:\"›\";display:grid;place-items:center;flex:none;width:2.2rem;height:2.2rem;margin-left:auto;border-radius:50%;background:var(--tile);color:var(--brand-ink);font-size:1.4rem;line-height:1}" +
  ".stale .pic,.due .pic{background:var(--warn-soft)}" +
  ".flag{font-size:.95rem;letter-spacing:0;margin-right:.35rem}" +
  ".chip{display:inline-block;padding:.15rem .65rem;border-radius:999px;background:var(--brand-soft);color:var(--brand-ink);font-size:.8rem;font-weight:750;white-space:nowrap;vertical-align:middle}" +
  ".chip.ok{background:var(--ok-soft);color:var(--ok)}.chip.warn{background:var(--warn-soft);color:var(--warn)}" +
  ".seg{display:flex;gap:.3rem;padding:.3rem;margin:0 0 1rem;background:var(--card);border-radius:999px;box-shadow:var(--shadow);overflow-x:auto}" +
  ".seg a{flex:1 0 auto;display:grid;place-items:center;min-height:48px;padding:0 1rem;border-radius:999px;text-decoration:none;color:var(--ink);font-weight:650;font-size:.92rem;white-space:nowrap}.seg a[aria-current]{background:var(--brand);color:#fff}" +
  ".macro{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.6rem;margin:0 0 .75rem}" +
  ".macro>*{background:var(--card);border-radius:18px;padding:.8rem .75rem;box-shadow:var(--shadow);min-width:0;margin:0}.macro small{display:block;font-weight:650}.macro b{display:block;font-size:1.3rem;font-weight:800;font-variant-numeric:tabular-nums}" +
  // Crests, date blocks, lottery balls, tap-to-call
  ".cr{display:grid;place-items:center;flex:none;font-weight:800;object-fit:contain}span.cr{border-radius:50%}" +
  ".dt{display:grid;place-items:center;align-content:center;flex:none;width:3.5rem;height:3.6rem;border-radius:16px;background:var(--tile);color:var(--brand-ink);font-size:.72rem;font-weight:750;text-transform:uppercase;line-height:1.15}.dt b{font-size:1.5rem;line-height:1}" +
  ".holiday .dt{background:#ffeede;color:#9a3d00}.school .dt{background:var(--ok-soft);color:var(--ok)}" +
  ".balls{display:flex;flex-wrap:wrap;gap:.4rem;margin:.35rem 0}.balls b{display:grid;place-items:center;min-width:2.4rem;height:2.4rem;padding:0 .3rem;border-radius:999px;color:#fff;font-weight:800;font-variant-numeric:tabular-nums;" +
  "background:radial-gradient(circle at 35% 30%,#8f98f5,#3f4bc4 70%);box-shadow:0 3px 8px rgba(27,31,59,.2)}" +
  ".balls b:nth-child(3n+2){background:radial-gradient(circle at 35% 30%,#ffb46b,#c25400 70%)}.balls b:nth-child(3n){background:radial-gradient(circle at 35% 30%,#5ad19e,#0f7a55 70%)}" +
  ".call{display:flex;flex-direction:column;align-items:flex-start;gap:.3rem;text-decoration:none;color:var(--ink);min-width:0}" +
  ".call>a:not(.dial){display:flex;flex-direction:column;gap:.3rem;color:inherit;text-decoration:none}" +
  ".num{display:block;font-size:2rem;font-weight:800;line-height:1.1;letter-spacing:-.01em;font-variant-numeric:tabular-nums}" +
  ".sos{background:linear-gradient(135deg,#b42318,#d63d42);color:#fff;box-shadow:0 12px 26px rgba(180,35,24,.28)}.sos small,.sos a{color:#fff}.sos .ico{background:rgba(255,255,255,.2);color:#fff}.sos .pic{background:#fff}" +
  ".dial{display:inline-flex;align-items:center;gap:.45rem;min-height:48px;padding:.45rem .9rem;border-radius:999px;background:var(--ok-soft);color:var(--ok);font-weight:750;text-decoration:none;font-size:.92rem}" +
  ".dialrow{display:flex;align-items:center;gap:.9rem;text-decoration:none;color:inherit;min-height:48px}" +
  ".pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.75rem}.pair .card{padding:1rem .85rem}.pair .dial{font-size:.8rem;padding:.4rem .6rem;gap:.3rem;white-space:nowrap}.dialrow .num{font-size:1.6rem;white-space:nowrap}" +
  // Match cards (home and Fútbol), today in the league
  ".match{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;gap:.5rem;text-align:center;text-decoration:none;color:var(--ink)}.match>small{grid-column:1/-1;font-weight:650}" +
  ".match>span{display:flex;flex-direction:column;align-items:center;gap:.35rem;font-weight:700;font-size:.92rem;line-height:1.2;overflow-wrap:anywhere}" +
  ".match>.chip{padding:.4rem .8rem;background:linear-gradient(135deg,var(--brand),var(--brand-2));color:#fff}" +
  ".score{font-size:1.9rem;font-weight:800;font-variant-numeric:tabular-nums;white-space:nowrap}" +
  ".lg{display:block;text-decoration:none;color:var(--ink)}.lg>small{display:block;font-weight:650}" +
  ".lg>span{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;gap:.5rem;margin-top:.6rem;font-weight:650;font-size:.88rem}" +
  ".lg>span>span{display:flex;align-items:center;gap:.4rem;min-width:0}.lg>span>span:last-child{justify-content:flex-end;text-align:right}.lg b{font-variant-numeric:tabular-nums}" +
  // Official warnings (home and Clima)
  ".alert{display:block;background:var(--card);border-radius:var(--r);padding:1rem 1rem 1rem 1.15rem;margin:.75rem 0;border-left:6px solid var(--muted);box-shadow:var(--shadow);color:var(--ink);text-decoration:none}" +
  ".alert.red{border-left-color:var(--danger)}.alert.orange{border-left-color:#d97706}.alert.yellow{border-left-color:#ca8a04}.alert>small{display:block}" +
  ".level{display:inline-block;font-weight:800;text-transform:uppercase;font-size:.74rem;letter-spacing:.06em;padding:.2rem .65rem;border-radius:999px;background:#eef0f6}" +
  ".level .i{color:inherit;margin-right:.25rem}.red .level{background:var(--danger-soft);color:var(--danger)}.orange .level{background:var(--warn-soft);color:var(--warn)}.yellow .level{background:var(--caution-soft);color:var(--caution)}" +
  // Their other towns: a row of picture cards
  ".towns{display:flex;gap:.7rem;overflow-x:auto;margin:0 -1rem;padding:.2rem 1rem .8rem;scroll-snap-type:x mandatory}" +
  ".town{flex:1 0 10rem;scroll-snap-align:start;background:var(--card);border-radius:var(--r);box-shadow:var(--shadow);overflow:hidden;text-decoration:none;color:var(--ink)}" +
  ".thumb{display:grid;place-items:center;width:100%;height:6rem;object-fit:cover;background:linear-gradient(135deg,#e3e7fd,#f6f7ff)}" +
  ".tb{display:block;padding:.6rem .85rem .75rem}.tb b{display:block;font-size:.95rem;line-height:1.2}.tt{display:flex;align-items:center;gap:.3rem;font-size:1.75rem;font-weight:800;margin:.1rem 0;line-height:1.1}" +
  "main>section{margin-bottom:.25rem}" +
  // Más grid, login and expiry
  ".menu{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.75rem;list-style:none;padding:0;margin:0 0 1rem}" +
  ".menu a{display:flex;flex-direction:column;gap:.65rem;min-height:8.25rem;height:100%;padding:1rem;background:var(--card);border-radius:var(--r);text-decoration:none;color:var(--ink);font-weight:750;line-height:1.25;box-shadow:var(--shadow)}" +
  ".menu small{display:block;font-weight:500;margin-top:.2rem;line-height:1.3}" +
  ".brandmark{font-weight:800;font-size:2.5rem;color:#fff;letter-spacing:-.03em;margin:0;line-height:1}" +
  ".steps{list-style:none;padding:0;margin:.5rem 0}.steps li{display:flex;gap:.75rem;align-items:flex-start;margin:.8rem 0}" +
  ".steps .n{display:grid;place-items:center;flex:none;width:2rem;height:2rem;border-radius:50%;background:var(--brand);color:#fff;font-weight:800;font-size:.9rem}" +
  ".inf{display:flex;gap:.7rem;align-items:flex-start;margin:.6rem 0}.inf>.i{margin:0;padding-top:.1rem}" +
  ".code{font:700 2.1rem/1.1 ui-monospace,\"Roboto Mono\",monospace;letter-spacing:.12em;border:2px dashed var(--brand);border-radius:20px;padding:1rem;text-align:center;background:#f7f8ff;color:var(--ink);margin:.5rem 0 1rem}" +
  // Tab bar: white, rounded top, outline icons with labels, a raised round Clima button
  "nav.tabs{position:fixed;left:0;right:0;bottom:0;z-index:50;display:flex;align-items:flex-end;max-width:34rem;margin:0 auto;background:var(--card);border-radius:26px 26px 0 0;" +
  "box-shadow:0 -8px 30px rgba(40,48,120,.1);padding:.35rem .4rem calc(.35rem + env(safe-area-inset-bottom))}" +
  "nav.tabs a{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:.15rem;min-width:0;min-height:58px;padding:.3rem 0;color:#676d8c;text-decoration:none;font-size:.74rem;font-weight:650}" +
  "nav.tabs svg{width:48px;height:30px;padding:2px 11px;border-radius:999px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}" +
  "nav.tabs a[aria-current=page]{color:var(--brand-ink);font-weight:800}nav.tabs a[aria-current=page]:not(.c) svg{background:var(--brand-soft)}" +
  ".fab{display:grid;place-items:center;width:62px;height:62px;margin:-34px 0 .1rem;border-radius:50%;color:#fff;background:linear-gradient(135deg,var(--brand),var(--brand-2));box-shadow:0 0 0 7px rgba(79,91,213,.15),0 12px 24px rgba(79,91,213,.4)}" +
  "nav.tabs .fab svg{width:32px;height:32px;padding:0;stroke-width:2}nav.tabs a.c[aria-current=page] .fab{box-shadow:0 0 0 8px rgba(79,91,213,.32),0 12px 24px rgba(79,91,213,.45)}" +
  // Letra grande (clients.text_size = 'large'): <html class="big">
  "html.big{font-size:125%;--muted:#3a405e;--line:#cdd1e8}html.big body{font-size:20px;line-height:1.45}" +
  "html.big small,html.big .credit,html.big .step{font-weight:600}html.big p.line{font-weight:750}html.big .credit{font-size:.74rem}" +
  "html.big .tile{min-height:5.75rem;padding:.95rem}html.big .pair,html.big .menu{grid-template-columns:minmax(0,1fr)}" +
  "html.big .menu a{flex-direction:row;align-items:center;min-height:5.5rem}html.big .menu a,html.big h1,html.big p.line,html.big .match>span{overflow-wrap:anywhere}" +
  "html.big nav.tabs a{font-size:.66rem;min-height:66px}html.big nav.tabs svg{height:32px}html.big main{padding-bottom:calc(9rem + env(safe-area-inset-bottom))}" +
  "html.big .sh>a,html.big .seg a,html.big .dial{min-height:56px}html.big a.tile::after{display:none}html.big .pic{width:3rem;height:3rem}html.big .pic .art{width:2.2rem;height:2.2rem}html.big .sk>.art{width:4.25rem;height:4.25rem}html.big .sk h1{padding-right:3.5rem}html.big .lbl{max-width:calc(100% - 4rem)}html.big .ring{width:4.4rem;height:4.4rem}html.big .nb{font-size:1.9rem}";

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
