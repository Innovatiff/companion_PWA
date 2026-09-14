/**
 * CSS that only one or two pages use, inlined by those pages alone, so the home
 * screen (opened every morning on metered data) does not carry it. Shared rules
 * live in APP_CSS (packages/shared/src/ui/css.ts), which every page inlines
 * after these, so page rules that meet a shared one are written more specific.
 * Match cards and warning cards are shared: home shows them too.
 */
const TABLE =
  ".wrap{overflow-x:auto;margin:.5rem 0 1rem;background:var(--card);border-radius:18px;padding:.4rem .9rem;box-shadow:var(--shadow)}" +
  "table{border-collapse:collapse;width:100%;font-size:.95rem}caption{text-align:left;font-weight:700;padding:.5rem 0}" +
  "th,td{text-align:left;padding:.55rem .35rem;border-bottom:1px solid var(--line)}tr:last-child td{border-bottom:0}" +
  "th{font-size:.72rem;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}.n{text-align:right;font-variant-numeric:tabular-nums}";

export const FUTBOL_CSS = TABLE +
  // The hero: a pitch with the crest, league and flag, form and goals
  ".hero{position:relative;overflow:hidden;color:#fff;border-radius:22px;padding:1rem 1.15rem 1.15rem;margin:.2rem 0 1rem;" +
  "background:radial-gradient(circle at 88% 18%,rgba(255,255,255,.2),transparent 42%),repeating-linear-gradient(90deg,rgba(255,255,255,.05) 0 26px,transparent 26px 52px),linear-gradient(135deg,#0c4a2e,#157a3c 55%,#28a653);" +
  "box-shadow:0 10px 28px rgba(12,74,46,.3)}" +
  ".hero .top{display:flex;align-items:center;gap:.5rem;margin:0;font-size:.82rem;font-weight:700}.hero .top .flag{margin-left:auto;font-size:1.3rem}" +
  ".lgo{flex:none;object-fit:contain}.hero .lgo{background:#fff;border-radius:9px;padding:3px}" +
  ".hero .id{display:flex;align-items:center;gap:1rem;margin:.9rem 0 .2rem}.hero .id>div{min-width:0}" +
  ".lgb{display:grid;place-items:center;flex:none;width:76px;height:76px;border-radius:50%;background:#fff;font-size:2.5rem;box-shadow:0 6px 16px rgba(0,0,0,.2)}" +
  ".hero img.cr{background:#fff;border-radius:50%;padding:7px;box-shadow:0 6px 16px rgba(0,0,0,.2)}.hero .id>.lgo{padding:8px;border-radius:18px}" +
  ".hero h1{margin:0;color:#fff;font-size:1.75rem;overflow-wrap:anywhere}.hero p{margin:.1rem 0 0;color:rgba(255,255,255,.85);font-size:.9rem}" +
  ".form{display:flex;flex-wrap:wrap;align-items:center;gap:.35rem;margin-top:.8rem}.hero small{color:rgba(255,255,255,.88)}.form>small:first-child{font-weight:700;margin-right:.2rem}" +
  ".form .lgd{flex-basis:100%;font-size:.72rem}" +
  ".fc{display:inline-grid;place-items:center;width:1.65rem;height:1.65rem;border-radius:8px;font-size:.8rem;font-weight:800;color:#fff;vertical-align:middle}" +
  ".fc.W{background:#12a150}.fc.D{background:#737a94}.fc.L{background:#d63a2b}.hero .fc{box-shadow:0 0 0 2px rgba(255,255,255,.75)}" +
  ".stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.5rem;margin-top:.85rem}" +
  ".stats>span{background:rgba(255,255,255,.14);border-radius:14px;padding:.5rem .3rem;text-align:center}.stats b{display:block;font-size:1.5rem;line-height:1.1}.stats small{font-size:.7rem}" +
  // Next match, results
  ".nx{padding:1.1rem .9rem}.venue{grid-column:1/-1;display:flex;justify-content:center;align-items:center;margin:.3rem 0 0;color:var(--muted);font-size:.82rem}" +
  ".res{border-left:5px solid var(--line)}.res.W{border-left-color:#12a150}.res.L{border-left-color:#d63a2b}.res.D{border-left-color:#737a94}.res>small .fc{width:1.3rem;height:1.3rem;font-size:.68rem;border-radius:6px}" +
  // A league's matches under its logo
  ".grp{padding:.8rem 1rem .4rem}.grp>header{display:flex;align-items:center;gap:.6rem;padding-bottom:.6rem;border-bottom:1px solid var(--line)}" +
  ".grp h3{flex:1;margin:0;font-size:.95rem}.grp .flag{font-size:1.2rem;margin:0}" +
  ".fxs{list-style:none;margin:0;padding:0}.fx{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;gap:.5rem;padding:.65rem 0;border-bottom:1px solid var(--line);font-size:.88rem}" +
  ".fx:last-child{border-bottom:0}.fx>span.h,.fx>span.a{display:flex;align-items:center;gap:.45rem;min-width:0;line-height:1.2;overflow-wrap:break-word;hyphens:auto}.fx>span.a{justify-content:flex-end;text-align:right}" +
  ".fx b{font-weight:650}.fx .sc{font-size:1.1rem;font-weight:800;font-variant-numeric:tabular-nums;padding:0 .2rem}.fx>small{grid-column:1/-1;text-align:center;margin-top:-.25rem;font-size:.75rem}" +
  ".team{display:flex;align-items:center;gap:1rem}.team h1{margin:0}.team p{margin:.15rem 0 0}";

export const CLIMA_CSS =
  // Town headers: a photo under a dark overlay, or a sky gradient
  ".townhead{position:relative;isolation:isolate;display:flex;align-items:flex-end;min-height:8.5rem;margin:1.3rem 0 .6rem;border-radius:18px;overflow:hidden;background:#1d2147;box-shadow:var(--shadow)}" +
  ".townhead img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}" +
  ".townhead::before{content:\"\";position:absolute;inset:0;z-index:1;background:linear-gradient(rgba(14,16,44,.2),rgba(14,16,44,.82))}" +
  ".townhead h2{position:relative;z-index:2;margin:.9rem 1rem;color:#fff;font-size:1.2rem;text-transform:none;letter-spacing:-.01em;text-shadow:0 1px 3px rgba(0,0,0,.5)}" +
  ".townhead.plain{min-height:4.4rem;background:linear-gradient(135deg,#1747a6,#2f74e0 60%,#6fb1ff)}.townhead.plain::before{display:none}h2 .chip{margin-left:.4rem}" +
  // Today: a big card with the picture, temperature, low and rain chance
  ".now{display:flex;align-items:center;gap:.9rem;padding:.9rem 1rem}.now>span{flex:1;min-width:0}.now small{display:block}" +
  ".now.rain,.here.rain{background:linear-gradient(135deg,#e2ecff,#fff 70%)}.now.sun,.here.sun{background:linear-gradient(135deg,#fff0c7,#fff 70%)}" +
  ".tp{display:block;font-size:2.7rem;font-weight:800;letter-spacing:-.03em;line-height:1.05}" +
  ".rp{display:block;margin-top:.45rem}.bar{display:block;height:.45rem;margin-top:.25rem;border-radius:9px;background:rgba(29,95,209,.14);overflow:hidden}" +
  ".bar i{display:block;height:100%;border-radius:9px;background:linear-gradient(90deg,#7ab3ff,#1d5fd1)}" +
  // Sunrise, sunset, moon
  ".sky{display:flex;flex-wrap:wrap;gap:.4rem;margin:0 0 .75rem}.sky span{padding:.3rem .7rem;border-radius:999px;background:var(--card);box-shadow:var(--shadow);font-size:.8rem;font-weight:600}" +
  ".sky.sm{margin:.55rem 0 0;gap:.3rem}.sky.sm span{padding:.12rem .45rem;box-shadow:none;background:rgba(27,31,59,.06);font-size:.72rem}" +
  // Three days with temperature range bars
  ".strip{list-style:none;margin:0 0 .75rem;padding:.2rem 1rem;background:var(--card);border-radius:18px;box-shadow:var(--shadow)}" +
  ".strip li{display:grid;grid-template-columns:3.9rem 1.4rem 3.5rem 1.9rem minmax(2rem,1fr) 3.9rem;align-items:center;gap:.3rem;padding:.6rem 0;border-bottom:1px solid var(--line);font-size:.92rem}" +
  ".strip li:last-child{border-bottom:0}.strip .pr{color:#1d5fd1;font-weight:600;white-space:nowrap;font-size:.8rem}.strip .lo{color:var(--muted);text-align:right}.strip b{text-align:right;white-space:nowrap}" +
  ".rng{position:relative;display:block;height:.42rem;border-radius:9px;background:var(--line)}.rng i{position:absolute;top:0;bottom:0;border-radius:9px;background:linear-gradient(90deg,#7ab3ff,#fdb813,#f0703c)}" +
  // Here in Canada
  ".here{margin:0 0 .75rem;padding:.9rem .85rem}.pair .here{margin:0}.here .nm{display:block;font-size:1.05rem}.here small{display:block}" +
  ".here .hn{display:flex;align-items:center;gap:.35rem;margin:.25rem 0}.here .tp{font-size:2rem}" +
  ".mini{list-style:none;display:grid;gap:.2rem;margin:.5rem 0 0;padding:.45rem 0 0;border-top:1px solid var(--line)}.mini li{display:flex;align-items:center;gap:.3rem;font-size:.85rem}.mini small{flex:1}" +
  "#aqui{margin-bottom:.75rem}" +
  "main>details{background:var(--card);border-radius:18px;padding:.2rem 1rem;margin:.75rem 0;box-shadow:var(--shadow)}" +
  "details{margin:.5rem 0}summary{min-height:44px;padding:.6rem 0;cursor:pointer;font-weight:650}";

export const TASA_CSS = TABLE +
  ".big{font-size:1.9rem;font-weight:750;letter-spacing:-.02em;margin:.2rem 0 0;font-variant-numeric:tabular-nums}" +
  ".spark{display:block;width:100%;height:4.5rem;margin:.6rem 0 .2rem}";

export const LOGIN_CSS =
  ".feat{display:flex;flex-wrap:wrap;gap:.5rem;list-style:none;padding:0;margin:0 0 1rem}" +
  ".feat li{display:flex;align-items:center;padding:.35rem .8rem;border-radius:999px;background:var(--card);box-shadow:var(--shadow);font-weight:600;font-size:.85rem}";

export const SETUP_CSS =
  "button.link{display:inline;width:auto;min-height:44px;margin:0 0 0 .5rem;padding:.5rem;background:transparent;color:var(--brand);text-decoration:underline;font-weight:500;box-shadow:none}" +
  "button.link.skip{display:block;width:100%;margin:.5rem 0;color:var(--muted)}" +
  ".results button{text-align:left;background:var(--card);color:var(--ink);border:1.5px solid var(--line);font-weight:500;margin:.45rem 0;box-shadow:none}";
