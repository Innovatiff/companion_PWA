/**
 * A lighter copy of the portal's inline CSS for pages that have no tables, stat
 * cards, pipelines, code slips, printing or sign-in card (Vista previa). Every
 * page inlines its CSS (docs/DESIGN.md), so rules a page never uses cost bytes
 * on every visit; dropping them saves about 0.9 KB compressed per page.
 *
 * Derived from the full string at start-up, never copied, so a change to
 * PORTAL_CSS reaches these pages too. A rule is kept unless every one of its
 * selectors names something below; @media print is dropped; other @media
 * blocks are filtered the same way.
 */

const TAGS = /(^|[\s>+~])(table|thead|tbody|tr|th|td|caption)(?![\w-])/;
const CLASSES = new RegExp(
  "\\.(wrap|stats|stat|pipeline|code|auth|grid|ico|up|down|amber|narrow|pill|danger|mono|countries|fielderr|codein|choice|big|client|rows)(?![\\w-])" +
  "|\\.badge\\.(good|bad)(?![\\w-])|\\.chip\\.(bad|unk|plain)(?![\\w-])|input\\[type=checkbox\\]");

export const unusedSelector = (s: string): boolean => TAGS.test(s.trim()) || CLASSES.test(s);

/** Top-level rules and @-blocks, each with its braces. */
export function splitRules(css: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}" && --depth === 0) {
      out.push(css.slice(start, i + 1));
      start = i + 1;
    }
  }
  if (depth !== 0 || css.slice(start).trim()) throw new Error("lite-css: unbalanced CSS");
  return out;
}

function filterRules(css: string): string {
  return splitRules(css).map((rule) => {
    const open = rule.indexOf("{");
    const head = rule.slice(0, open);
    if (head.startsWith("@media print")) return "";
    if (head.startsWith("@")) {
      const inner = filterRules(rule.slice(open + 1, -1));
      return inner ? `${head}{${inner}}` : "";
    }
    const kept = head.split(",").filter((s) => !unusedSelector(s));
    return kept.length ? `${kept.join(",")}${rule.slice(open)}` : "";
  }).join("");
}

export const liteCss = (css: string): string => filterRules(css);
