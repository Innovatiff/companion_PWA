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
  ".team{display:flex;align-items:center;gap:1rem}.team h1{margin:0}.team p{margin:.15rem 0 0}";

export const CLIMA_CSS =
  ".days{display:grid;grid-template-columns:repeat(auto-fit,minmax(6.2rem,1fr));gap:.6rem;margin:0 0 .75rem}" +
  ".card.day{margin:0;padding:.8rem .4rem;text-align:center}.day small{display:block}.day .art{margin:.25rem auto}.day b{display:block;font-size:1.55rem;letter-spacing:-.02em;line-height:1.15}" +
  ".day.rain{background:linear-gradient(#e8f0ff,#fff 70%)}.day.sun{background:linear-gradient(#fff4d6,#fff 70%)}h2 .chip{margin-left:.4rem}" +
  // A town's photo as its header, with a dark overlay under the white name
  ".townhead{position:relative;display:flex;align-items:flex-end;min-height:8.5rem;margin:1.3rem 0 .6rem;border-radius:18px;overflow:hidden;background:#1d2147;box-shadow:var(--shadow)}" +
  ".townhead img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}" +
  ".townhead::before{content:\"\";position:absolute;inset:0;z-index:1;background:linear-gradient(rgba(14,16,44,.2),rgba(14,16,44,.82))}" +
  ".townhead h2{position:relative;z-index:2;margin:.9rem 1rem;color:#fff;font-size:1.2rem;text-transform:none;letter-spacing:-.01em;text-shadow:0 1px 3px rgba(0,0,0,.5)}" +
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
