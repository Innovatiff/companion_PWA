#!/usr/bin/env node
// LOCAL ONLY: Hoy's layout audit. Opens every page of the app in headless Chrome
// (DevTools protocol, no extra dependencies) and, for every combination of
//   width 320 / 360 / 375 / 390 / 430,
//   text size normal / big (html.big),
//   theme light / dark (prefers-color-scheme, "Automático"),
//   font normal / wide stress (Verdana, to stand in for iOS's wider glyphs),
// reports as failures:
//   (a) the document scrolling horizontally;
//   (b) an element, or a line of text, reaching past its nearest box (card,
//       tile, chip, button, …) by more than 1px;
//   (c) any element wider inside than out (scrollWidth > clientWidth + 1) that
//       is not one of the intentional horizontal scrollers listed below (an
//       overflow:hidden box's clipped decorations are (d)'s business, and the
//       scrollers' designed bleed to the screen edge is not counted);
//   (d) a line of text clipped by an overflow:hidden ancestor.
// Exits non-zero on any failure.
//
//   BASE=http://localhost:3100 CODES=DEMXHN42,TEZTJM24,DEMXMX42 EXPIRED_CODE=DEMXEX42 \
//   WELCOME_CODE=DEMXGT42 node scripts/layout-audit.mjs
// Optional: ONLY=/clima,/mas (page filter), WIDTHS=320,390, QUICK=1 (normal font, light only).
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const WebSocket = require("next/dist/compiled/ws");

const BASE = process.env.BASE ?? "http://localhost:3100";
const CODES = (process.env.CODES ?? "DEMXHN42").split(",").filter(Boolean);
const WIDTHS = (process.env.WIDTHS ?? "320,360,375,390,430").split(",").map(Number);
const SIZES = ["normal", "big"];
const THEMES = process.env.QUICK ? ["light"] : ["light", "dark"];
const FONTS = process.env.QUICK ? ["normal"] : ["normal", "wide"];
const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null;
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

// Intentional horizontal scrollers: their content may run past their edges.
const SCROLLERS = [".towns", ".hstrip", ".gal", ".hscroll", ".wrap", "nav.seg", ".seg.jump"];
// Boxes: an element or text inside one must stay inside it.
const BOXES = [
  ".card", ".tile", ".alert", ".choice", ".chip", "button", ".button", ".cp", ".dial", ".seg a", ".strip li", ".gw", ".here",
  ".work", ".wf", ".hs", ".town", ".alla", ".season", ".hello", ".mcard", ".badge", ".menu a", ".mfacts li", ".hilo>span",
  ".stats>span", ".feat li", ".prev", ".prev li", ".xb", ".lbl", ".ribbon", ".level", ".nc>span", ".sky span", ".hl b", ".dif",
  ".member", ".prompt", ".offbar", ".err", ".stale", ".heat", ".wcard", ".townhead", ".ht", ".dt", ".code", ".chg", ".opt",
  ".draw", "nav.tabs a", ".wkc li", ".bw li", ".mini li", ".fx", ".grp", ".hero", ".call", ".dialrow", "input", "select", "summary",
  ".ah", ".hc", ".wd", ".picks", ".arr", ".cform", "details", ".results button", ".steps li", ".mfoot", ".rhead", ".rt", ".rt2",
];

const INJECT_STILL = "*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}";
const INJECT_WIDE = "*{font-family:Verdana,Tahoma,sans-serif!important;font-weight:inherit}";

// ---------------------------------------------------------------------------
// The in-page check
// ---------------------------------------------------------------------------
const CHECK = `(() => {
  const BOX = ${JSON.stringify(BOXES.join(","))};
  const SCROLL = ${JSON.stringify(SCROLLERS.join(","))};
  const out = [];
  const seen = new Set();
  const name = (el) => {
    const parts = [];
    for (let e = el; e && e.nodeType === 1 && e !== document.body && parts.length < 5; e = e.parentElement) {
      let s = e.tagName.toLowerCase();
      if (e.id) s += "#" + e.id;
      else if (e.classList && e.classList.length) s += "." + [...e.classList].join(".");
      parts.unshift(s);
    }
    return parts.join(" > ");
  };
  const text = (el) => (el.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 70);
  const add = (kind, el, detail, snippet) => {
    const key = kind + name(el) + snippet;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ kind, sel: name(el), text: snippet ?? text(el), detail });
  };
  const hiddenish = (el) => !!el.closest(".sr,[hidden],template,noscript,head");
  const boxOf = (el) => {
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      if (e.matches(SCROLL)) return null;
      if (e.matches(BOX)) return e;
    }
    return null;
  };
  const inScroller = (el) => !!el.closest(SCROLL);

  // (a) the page scrolls sideways
  const de = document.documentElement;
  if (de.scrollWidth > de.clientWidth + 1 || document.body.scrollWidth > de.clientWidth + 1) {
    out.push({ kind: "a", sel: "html", text: "", detail: "page " + Math.max(de.scrollWidth, document.body.scrollWidth) + "px wide in " + de.clientWidth + "px" });
  }

  const all = document.body.querySelectorAll("*");
  for (const el of all) {
    if (el.closest("svg") && el.tagName.toLowerCase() !== "svg") continue;
    if (hiddenish(el)) continue;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;

    // (b) the element's box inside its nearest box (sideways); decorations placed on purpose are skipped
    const decorative = (cs.position === "absolute" || cs.position === "fixed") && el.getAttribute("aria-hidden") === "true";
    const box = el.parentElement ? boxOf(el.parentElement) : null;
    if (box && !decorative && cs.position !== "fixed") {
      const b = box.getBoundingClientRect();
      const over = Math.max(b.left - r.left, r.right - b.right);
      if (over > 1) add("b", el, "box " + Math.round(over) + "px past " + name(box).split(" > ").pop());
    }

  }

  // (c) wider inside than out. Measured with the intentional scrollers and the
  // decorations placed on purpose (absolute, aria-hidden) taken out of the flow.
  const aside = [...document.querySelectorAll(SCROLL), ...[...document.querySelectorAll("[aria-hidden=true]")].filter((e) => /absolute|fixed/.test(getComputedStyle(e).position))];
  const was = aside.map((e) => e.style.getPropertyValue("display"));
  aside.forEach((e) => e.style.setProperty("display", "none", "important"));
  for (const el of all) {
    if (!(el instanceof HTMLElement) || el.closest("svg") || hiddenish(el) || inScroller(el)) continue;
    if (/^(INPUT|SELECT|TEXTAREA|IMG|VIDEO)$/.test(el.tagName)) continue;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.display === "inline" || /hidden|clip/.test(cs.overflowX)) continue;
    if (el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1) add("c", el, "scrollWidth " + el.scrollWidth + " > clientWidth " + el.clientWidth);
  }
  aside.forEach((e, i) => { e.style.removeProperty("display"); if (was[i]) e.style.setProperty("display", was[i]); });

  // Text: every line box inside its nearest box (b), and never clipped by overflow:hidden (d)
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.nodeValue.trim()) continue;
    const p = n.parentElement;
    if (!p || hiddenish(p) || p.closest("script,style,title")) continue;
    const pcs = getComputedStyle(p);
    if (pcs.visibility === "hidden" || pcs.display === "none") continue;
    range.selectNodeContents(n);
    const rects = [...range.getClientRects()].filter((q) => q.width > 0 && q.height > 0);
    if (!rects.length) continue;
    const snippet = n.nodeValue.replace(/\\s+/g, " ").trim().slice(0, 70);
    const box = boxOf(p);
    if (box) {
      const b = box.getBoundingClientRect();
      // Sideways by more than 1px; up or down beyond a glyph's own ascent and descent (tight line-heights on big numbers).
      const v = Math.max(1, parseFloat(pcs.fontSize) * 0.3);
      for (const q of rects) {
        const side = Math.max(b.left - q.left, q.right - b.right), up = Math.max(b.top - q.top, q.bottom - b.bottom);
        if (side > 1 || up > v) { add("b", p, "text " + Math.round(Math.max(side, up)) + "px past " + name(box).split(" > ").pop(), snippet); break; }
      }
    }
    for (let a = p; a && a !== document.documentElement; a = a.parentElement) {
      if (a.matches(SCROLL)) break;
      const acs = getComputedStyle(a);
      const clipX = /hidden|clip/.test(acs.overflowX), clipY = /hidden|clip/.test(acs.overflowY);
      if (!clipX && !clipY) continue;
      const b = a.getBoundingClientRect();
      const bl = b.left + parseFloat(acs.borderLeftWidth), br = b.right - parseFloat(acs.borderRightWidth);
      const bt = b.top + parseFloat(acs.borderTopWidth), bb = b.bottom - parseFloat(acs.borderBottomWidth);
      const v = Math.max(1, parseFloat(pcs.fontSize) * 0.3);
      const clipped = rects.some((q) => (clipX && (q.left < bl - 1 || q.right > br + 1)) || (clipY && (q.top < bt - v || q.bottom > bb + v)));
      if (clipped) { add("d", p, "text clipped by " + name(a).split(" > ").pop(), snippet); break; }
    }
  }
  return out;
})()`;

// ---------------------------------------------------------------------------
// Chrome over the DevTools protocol
// ---------------------------------------------------------------------------
const profile = mkdtempSync(join(tmpdir(), "hoy-audit-"));
const PORT = Number(process.env.CDP_PORT ?? 9777);
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`, "--no-first-run", "--window-size=500,900", "about:blank"], { stdio: "ignore" });
const done = (code) => { try { chrome.kill("SIGKILL"); } catch {} try { rmSync(profile, { recursive: true, force: true }); } catch {} process.exit(code); };

let wsUrl;
for (let i = 0; i < 100 && !wsUrl; i++) {
  await new Promise((r) => setTimeout(r, 200));
  try { wsUrl = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === "page")?.webSocketDebuggerUrl; } catch {}
}
if (!wsUrl) { console.error("Chrome did not start"); done(2); }
const ws = new WebSocket(wsUrl);
await new Promise((r) => ws.on("open", r));
let id = 0;
const pending = new Map();
const events = [];
ws.on("message", (m) => { const msg = JSON.parse(m); if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); } else events.push(msg); });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400));
  return r.result?.result?.value;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await send("Page.enable");
await send("Network.enable");

async function signIn(code) {
  const res = await fetch(`${BASE}/api/login`, { method: "POST", redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", origin: BASE }, body: new URLSearchParams({ code }) });
  const c = res.headers.getSetCookie().map((x) => x.split(";")[0]).find((x) => x.startsWith("lc="));
  if (!c) throw new Error(`${code} did not sign in (${res.status})`);
  return c;
}
async function useCookie(cookie) {
  await send("Network.clearBrowserCookies");
  if (cookie) {
    const at = cookie.indexOf("=");
    await send("Network.setCookie", { name: cookie.slice(0, at), value: cookie.slice(at + 1), url: BASE, httpOnly: true, sameSite: "Lax" });
  }
}
async function html(path, cookie) {
  return (await fetch(BASE + path, { headers: cookie ? { cookie } : {}, redirect: "manual" })).text();
}

// A number check with numbers the first checkable game takes, so the page shows a result.
async function loteriaCheck(cookie) {
  const page = await html("/mas/loteria", cookie);
  const form = /<form[^>]*action="\/mas\/loteria#g(\d+)"[^>]*>([\s\S]*?)<\/form>/.exec(page);
  if (!form) return null;
  const inputs = [...form[2].matchAll(/<input(?![^>]*type="hidden")[^>]*>/g)].map((m) => m[0]);
  const need = Math.max(1, inputs.filter((t) => / required=""/.test(t)).length);
  const width = Number(/maxLength="(\d+)"|maxlength="(\d+)"/i.exec(inputs[0] ?? "")?.slice(1).find(Boolean) ?? 1);
  const wide = /placeholder="0+"/.test(inputs[0] ?? "");
  const nums = Array.from({ length: need }, (_, i) => (wide ? String(i + 1).padStart(width, "0") : String((i + 1) % 10)));
  return `/mas/loteria?g=${form[1]}&${nums.map((n) => `n=${n}`).join("&")}`;
}

async function pagesFor(code) {
  const cookie = await signIn(code);
  const check = await loteriaCheck(cookie);
  const pages = ["/", "/clima", "/clima/aqui", "/futbol", "/mas", "/mas/miembro", "/mas/semana", "/mas/loteria", check,
    "/mas/tasa?r=7", "/mas/tasa?r=30", "/mas/tasa?r=90", "/mas/tasa?r=30&cad=100", "/mas/tasa?dir=local&n=1000",
    "/mas/feriados", "/mas/escuela", "/mas/consulado", "/mas/emergencias", "/mas/transporte", "/mas/avisos",
    "/setup/municipality?edit=1", "/setup/municipality?edit=1&q=San", "/setup/watch?edit=1", "/setup/segment?edit=1",
    "/setup/kids?edit=1", "/setup/corridor?edit=1"].filter(Boolean);
  return pages.map((p) => ({ label: `${code} ${p}`, path: p, cookie }));
}

const targets = [];
for (const code of CODES) targets.push(...(await pagesFor(code)));
targets.push({ label: "signed out /login", path: "/login", cookie: null });
targets.push({ label: "signed out /login?e=inactive", path: "/login?e=inactive", cookie: null });
if (process.env.EXPIRED_CODE) targets.push({ label: `${process.env.EXPIRED_CODE} expiry screen`, path: "/", cookie: await signIn(process.env.EXPIRED_CODE) });
if (process.env.WELCOME_CODE) targets.push({ label: `${process.env.WELCOME_CODE} welcome screen`, path: "/", cookie: await signIn(process.env.WELCOME_CODE) });
const chosen = ONLY ? targets.filter((t) => ONLY.some((o) => t.path === o || t.path.startsWith(o + "?") || t.label.includes(o))) : targets;

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
const failures = new Map(); // page|kind|sel|text -> { detail, combos[] }
let combos = 0;
for (const t of chosen) {
  await useCookie(t.cookie);
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 900, deviceScaleFactor: 1, mobile: true });
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] });
  events.length = 0;
  await send("Page.navigate", { url: BASE + t.path });
  for (let i = 0; i < 150 && !events.some((e) => e.method === "Page.loadEventFired"); i++) await wait(100);
  await wait(300);
  const title = await evaluate("document.title");
  // A welcome page must be looked at before it is marked seen: the page's own button does that, we never press it.
  await evaluate(`(() => { const s = document.createElement("style"); s.id = "audit-still"; s.textContent = ${JSON.stringify(INJECT_STILL)}; document.head.appendChild(s);
    document.querySelectorAll("img[loading=lazy]").forEach((i) => i.removeAttribute("loading"));
    document.querySelectorAll("details").forEach((d) => { d.open = true; }); return true; })()`);
  const bigAtLoad = await evaluate("document.documentElement.classList.contains('big')");
  for (const width of WIDTHS) {
    await send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: true });
    for (const size of SIZES) {
      await evaluate(`document.documentElement.classList.toggle("big", ${size === "big"})`);
      for (const theme of THEMES) {
        await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: theme }] });
        for (const font of FONTS) {
          await evaluate(`(() => { let s = document.getElementById("audit-wide"); if (${font === "wide"}) { if (!s) { s = document.createElement("style"); s.id = "audit-wide"; s.textContent = ${JSON.stringify(INJECT_WIDE)}; document.head.appendChild(s); } } else if (s) s.remove(); return true; })()`);
          await wait(40);
          const found = await evaluate(CHECK);
          combos++;
          for (const f of found) {
            const key = `${t.label}|${f.kind}|${f.sel}|${f.text}`;
            if (!failures.has(key)) failures.set(key, { page: t.label, ...f, combos: [] });
            failures.get(key).combos.push(`${width} ${size} ${theme} ${font}`);
          }
        }
      }
    }
  }
  await evaluate(`document.documentElement.classList.toggle("big", ${bigAtLoad})`);
  process.stdout.write(`checked ${t.label} (${title})\n`);
}

const perPage = WIDTHS.length * SIZES.length * THEMES.length * FONTS.length;
const list = [...failures.values()];
for (const f of list) {
  const shown = f.combos.length > 6 ? `${f.combos.slice(0, 6).join("; ")}; … ${f.combos.length} combinations` : f.combos.join("; ");
  console.log(`FAIL (${f.kind}) ${f.page} :: ${f.sel} :: "${f.text}" :: ${f.detail} :: ${shown}`);
}
const kinds = list.reduce((m, f) => ((m[f.kind] = (m[f.kind] ?? 0) + 1), m), {});
console.log(`\nLayout audit: ${chosen.length} pages × ${perPage} combinations (widths ${WIDTHS.join("/")}, ${SIZES.join("/")}, ${THEMES.join("/")}, ${FONTS.join("/")} font) = ${combos} checks; ` +
  `${list.length} distinct failures${list.length ? ` (${Object.entries(kinds).map(([k, n]) => `${k}: ${n}`).join(", ")})` : ""}`);
ws.close();
done(list.length ? 1 : 0);
