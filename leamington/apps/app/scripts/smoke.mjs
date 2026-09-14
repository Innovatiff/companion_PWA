// End-to-end smoke test of Hoy against a running server and a local database.
//
//   BASE=http://localhost:3100 CODE=TEZTJM24 SETUP_CODE=DEMXHN42 SETUP_QUERY=ceiba node scripts/smoke.mjs
//
// CODE signs in and visits every page. SETUP_CODE (optional) walks the setup
// flow: search, choose a town, skip, answer, finish. It changes that client.
// CREST_CODE (optional) is a client whose team has a stored crest: its image
// must show and be served from /crest/{id} with 30-day caching.
import http from "node:http";
import https from "node:https";
import zlib from "node:zlib";

const BASE = new URL(process.env.BASE ?? "http://localhost:3100");
const client = BASE.protocol === "https:" ? https : http;
const CODE = process.env.CODE;
if (!CODE) { console.error("set CODE to a client code"); process.exit(2); }

// Round 2 (0041) checks compare pages with the database functions they render.
// They need DATABASE_URL (the same database the server reads); without it they
// are reported as SKIP, never as passed.
const DB = process.env.DATABASE_URL ? new (await import("pg")).default.Pool({ connectionString: process.env.DATABASE_URL, max: 2 }) : null;
const q = (sql, params) => DB.query(sql, params);
const esc = (v) => String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
const pretty = (code) => `${code.slice(0, 4)}-${code.slice(4)}`;
// React does not keep attribute order: find a tag by its attributes, in any order.
const tag = (html, name, attrs) => [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, "g"))].map((m) => m[0])
  .find((t) => Object.entries(attrs).every(([k, v]) => t.includes(` ${k}="${v}"`)));
const attr = (t, name) => t ? new RegExp(` ${name}="([^"]*)"`).exec(t)?.[1] : undefined;

let failures = 0;
const check = (ok, label, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${!ok && detail ? ` -- ${detail}` : ""}`);
  if (!ok) failures++;
};

function send(path, { method = "GET", cookie, form, json, origin, headers: extra } = {}) {
  const body = form ? new URLSearchParams(form).toString() : json ? JSON.stringify(json) : null;
  return new Promise((resolve, reject) => {
    const headers = { accept: "text/html,*/*", ...extra };
    if (cookie) headers.cookie = cookie;
    if (origin) headers.origin = origin;
    if (body != null) {
      headers["content-type"] = form ? "application/x-www-form-urlencoded" : "application/json";
      headers["content-length"] = Buffer.byteLength(body);
    }
    const req = client.request({ host: BASE.hostname, port: BASE.port || undefined, path, method, headers }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({
        status: res.statusCode, location: res.headers.location ?? "", text: Buffer.concat(chunks).toString(),
        cookie: res.headers["set-cookie"]?.[0]?.split(";")[0], headers: res.headers, bytes: Buffer.concat(chunks).length,
      }));
    });
    req.on("error", reject);
    if (body != null) req.write(body);
    req.end();
  });
}

// Words that would turn silence into reassurance, or show a placeholder.
const FORBIDDEN = [/sin avisos/i, /no alerts/i, /no hay (alertas|avisos|partidos)/i, /no matches/i, /all clear/i, /cargando/i, /loading/i];
const visible = (html) => html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/ loading="lazy"/g, "");

async function page(path, cookie, label = path) {
  const r = await send(path, { cookie });
  check(r.status === 200, `${label} 200`, `got ${r.status} ${r.location}`);
  check(!/<script[^>]+src=/i.test(r.text) && !r.text.includes("/_next/"), `${label} ships no framework JS`);
  // Images' loading="lazy" attribute is markup, not words on the screen.
  const bad = FORBIDDEN.find((re) => re.test(visible(r.text)));
  check(!bad, `${label} has no reassurance-from-silence or placeholder text`, String(bad));
  if (r.status === 200 && !path.startsWith("/setup/") && !label.includes("(expired)")) {
    tabs(r.text, label, path === "/" ? "/" : path.startsWith("/clima") ? "/clima" : path.startsWith("/mas/tasa") ? "/mas/tasa" : path.startsWith("/mas") || path.startsWith("/noticias") ? "/mas" : path.startsWith("/futbol") ? "/futbol" : path);
  }
  if (r.status === 200) await images(r.text, label);
  return r.text;
}

// The tab bar (docs/DESIGN.md): five labelled items in this order, Clima as the
// raised round centre button, and exactly the page's own tab marked current.
const TAB_HREFS = ["/", "/futbol", "/clima", "/mas/tasa", "/mas"];
function tabs(html, label, current) {
  const nav = /<nav class="tabs"[^>]*>([\s\S]*?)<\/nav>/.exec(html)?.[1] ?? "";
  const links = [...nav.matchAll(/<a ([^>]*)>/g)].map((m) => m[1]);
  const hrefs = links.map((a) => /href="([^"]*)"/.exec(a)?.[1]);
  check(hrefs.join(" ") === TAB_HREFS.join(" "), `${label}: the tab bar is Inicio, Fútbol, Clima, Tasa, Más`, hrefs.join(" "));
  check(/<a href="\/clima" class="c"[^>]*><span class="fab"><svg/.test(nav), `${label}: Clima is the raised centre button`);
  check(nav.split("</a>").slice(0, 5).every((chunk) => /<span>[^<]+<\/span>$/.test(chunk)), `${label}: every tab has a text label`);
  const marked = links.map((a, i) => (a.includes('aria-current="page"') ? i : -1)).filter((i) => i >= 0);
  check(marked.length === 1 && marked[0] === TAB_HREFS.indexOf(current), `${label}: its own tab is marked current`, `marked ${marked}`);
}

// Images come only from our own domain: team crests (each at most 50 KB, lazy),
// league logos (at most 150 KB, lazy) and town photos (each at most 120 KB,
// always with a credit on the same page).
// All sized, all cached for 30 days with an ETag, nosniff, and a 304 on the ETag.
const imagesChecked = new Set();
const ART_SRC = /src="(\/art\/[a-z-]+\.svg\?v=\d+)"/;
async function images(html, label) {
  const imgs = [...html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
  check(imgs.every((i) => (/src="\/(crest|photo|league-crest)\/\d+"/.test(i) || /src="\/photo\/\d+\/[1-6]"/.test(i) || /src="\/news-image\/\d+\/(thumb|lead)"/.test(i) || /src="\/video-thumb\/\d+"/.test(i) || ART_SRC.test(i)) && /width="\d+"/.test(i) && /height="\d+"/.test(i) && / alt=""/.test(i)),
    `${label}: every image is a crest, a town photo or an illustration from our own domain, sized`, imgs.join(" "));
  check(imgs.filter((i) => /src="\/(crest|league-crest)\//.test(i)).every((i) => / loading="lazy"/.test(i)), `${label}: crests and league logos load lazily`);
  const photos = new Set(imgs.map((i) => /src="\/photo\/(\d+(?:\/[1-6])?)"/.exec(i)?.[1]).filter(Boolean));
  const credited = new Set([...html.matchAll(/<small class="credit" data-photo="(\d+(?:\/[1-6])?)">([\s\S]*?)<\/small>/g)]
    .filter((m) => /<a href="https?:\/\/[^"]+"[^>]*>[^<]+<\/a>/.test(m[2]) && /· /.test(m[2])).map((m) => m[1]));
  check([...photos].every((id) => credited.has(id)), `${label}: every town photo shown has its credit (author, linked, and license)`,
    `photos ${[...photos]} credited ${[...credited]}`);
  for (const i of imgs) {
    // Illustrations: versioned, immutable for 30 days, at most 1.5 KB gzipped,
    // no script or outside reference, and still under reduced motion.
    const art = ART_SRC.exec(i);
    if (art) {
      if (imagesChecked.has(art[1])) continue;
      imagesChecked.add(art[1]);
      const r = await send(art[1]);
      const gz = zlib.gzipSync(Buffer.from(r.text), { level: 9 }).length;
      check(r.status === 200 && /^image\/svg\+xml/.test(r.headers["content-type"] ?? "") && gz <= 1500,
        `${art[1]} serves an SVG of at most 1.5 KB gzipped`, `${r.status} ${r.headers["content-type"]} ${gz}`);
      const cc = r.headers["cache-control"] ?? "";
      check(/public/.test(cc) && /max-age=2592000/.test(cc) && /immutable/.test(cc) && r.headers["x-content-type-options"] === "nosniff",
        `${art[1]} is cached for 30 days, immutable, with nosniff`, cc);
      check(!/animation/.test(r.text) || /@media\s*\(prefers-reduced-motion:\s*reduce\)/.test(r.text), `${art[1]} stops its motion under reduced motion`);
      check(!/<script|<foreignObject|(xlink:)?href="(https?:)?\/\//i.test(r.text), `${art[1]} has no script and no outside reference`);
      continue;
    }
    const [, kind, id] = /src="\/(crest|photo|league-crest)\/(\d+(?:\/[1-6])?)"/.exec(i) ?? [];
    if (!kind || imagesChecked.has(kind + id)) continue;
    imagesChecked.add(kind + id);
    const path = `/${kind}/${id}`;
    const limit = kind === "crest" ? 50_000 : kind === "photo" ? 120_000 : 150_000;
    const r = await send(path);
    check(r.status === 200 && /^image\//.test(r.headers["content-type"] ?? "") && r.bytes > 0 && r.bytes <= limit,
      `${path} serves an image of at most ${limit / 1000} KB`, `${r.status} ${r.headers["content-type"]} ${r.bytes}`);
    check(/max-age=2592000/.test(r.headers["cache-control"] ?? "") && Boolean(r.headers.etag) && r.headers["x-content-type-options"] === "nosniff",
      `${path} is cached for 30 days, with an ETag and nosniff`, JSON.stringify(r.headers));
    const again = await send(path, { headers: { "if-none-match": r.headers.etag } });
    check(again.status === 304, `${path} answers 304 to its own ETag`, String(again.status));
  }
  return { crests: imgs.filter((i) => i.includes('src="/crest/')).length, photos: photos.size };
}

// The team header shows the crest when stored, otherwise the team's initials.
async function teamVisuals(cookie, label) {
  const f = await send("/futbol", { cookie });
  if (f.text.includes('class="card team"')) {
    check(/class="card team"><(img|span) class="cr"/.test(f.text), `${label}: the Fútbol team header shows its crest or its initials`);
  }
  return (await images(f.text, `${label} /futbol`)).crests;
}

// Home quick cards ("Útil para ti") render only when their record exists, as
// the section pages built on the same records show; every time-bound element
// on home carries its expiry. CLIENT_TZ is the client's timezone (default Toronto).
async function extras(cookie, label) {
  const [home, feriados, emergencias, consulado, loteria] = await Promise.all(
    ["/", "/mas/feriados", "/mas/emergencias", "/mas/consulado", "/mas/loteria"].map(async (p) => (await send(p, { cookie })).text));
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: process.env.CLIENT_TZ ?? "America/Toronto" }).format(new Date());
  const first = /<time class="dt" dateTime="(\d{4}-\d{2}-\d{2})"/i.exec(feriados)?.[1];
  const within = Boolean(first) && (Date.parse(first) - Date.parse(today)) / 86_400_000 <= 120;
  check(home.includes('data-line="holiday"') === within, `${label}: the next-holiday card shows exactly when a holiday is within 120 days`, `first ${first}`);
  check(home.includes('class="card call sos" href="tel:911"') === /class="card sos"><a class="dialrow" href="tel:911"/.test(emergencias),
    `${label}: the 911 card shows exactly when Ontario's 911 record exists`);
  check(home.includes('href="/mas/consulado"') === /Consulado en|Consulate in/.test(consulado), `${label}: the consulate card shows exactly when a consulate record exists`);
  check(home.includes('data-line="lottery"') === loteria.includes('class="balls"'), `${label}: the lottery card shows exactly when a recent official draw exists`);
  check(!/<p class="line"><\/p>|<span class="line"><\/span>|<span class="balls"><\/span>|<span class="num"><\/span>/.test(home), `${label}: no quick card renders without its data`);
  const lines = [...home.matchAll(/<[a-z]+\b[^>]*\bdata-line="[^"]*"[^>]*>/g)].map((m) => m[0]);
  check(lines.length > 0 && lines.every((o) => /\bdata-until="\d{4}-\d{2}-\d{2}T/.test(o)),
    `${label}: every time-bound element on home carries its expiry`);
  await images(home, `${label} /`);
}

// The newer home sections (0034) render only with real data, checked against
// the section pages that show the same records.
async function more(cookie, label) {
  const [home, clima, futbol, avisos, escuela, mas] = await Promise.all(
    ["/", "/clima", "/futbol", "/mas/avisos", "/mas/escuela", "/mas"].map(async (p) => (await send(p, { cookie })).text));
  const section = (key) => new RegExp(`<section data-line="${key}"[\\s\\S]*?</section>`).exec(home)?.[0] ?? "";

  check(!/sin avisos|no alerts|no hay (alertas|avisos)|all clear/i.test(visible(home)), `${label}: home never says "sin avisos" or "no alerts"`);

  // Home's top row: initials, the member pill, and a bell whose dot shows exactly
  // when home lists an official warning (never a calm sign when it does not).
  const top = /<div class="top">([\s\S]*?)<\/div>/.exec(home)?.[1] ?? "";
  check(/<span class="av" aria-hidden="true">\p{Lu}{1,2}<\/span>/u.test(top), `${label}: home shows the member's initials`);
  check(/<a class="member" href="\/mas\/miembro">/.test(top), `${label}: the Miembro pill opens the member page`);
  check(/<a class="bellbtn" href="\/clima#avisos"/.test(top), `${label}: the bell opens Clima's official warnings`);
  const listed = (section("alerts").match(/class="alert [a-z]+"/g) ?? []).length;
  check(top.includes('class="dot"') === (listed > 0), `${label}: the bell's dot shows exactly when home lists an official warning`, `listed ${listed}`);
  check(clima.includes('id="avisos"'), `${label}: Clima has the warnings the bell opens`);

  // The hero follows Leamington's sky; ?sky= changes it only with the local preview on.
  const phase = /<header class="hello sk s-(dawn|day|dusk|night)"/.exec(home)?.[1];
  check(!home.includes('data-line="greeting"') || Boolean(phase), `${label}: the greeting sits on Leamington's sky`);
  if (phase && process.env.SKY_PREVIEW !== "1") {
    const forced = (await send(`/?sky=${phase === "night" ? "day" : "night"}`, { cookie })).text;
    check(forced.includes(`class="hello sk s-${phase}"`), `${label}: ?sky= cannot change the sky without the local preview`);
  }
  const monitored = !/todavía no recibe|does not receive/.test(clima);
  check(Boolean(section("alerts")) === monitored, `${label}: the warnings section shows exactly when we read that country's official warnings`);
  if (section("alerts")) {
    check(/Revisamos los avisos de|We checked .* warnings|No hemos podido revisar|We have not been able to check/.test(section("alerts")),
      `${label}: the warnings section says when we checked, or since when we could not`);
  }

  const upcoming = /Próximos partidos|Next matches/.test(futbol);
  check(!home.includes('data-line="match"') || upcoming, `${label}: the next-match card shows only when Fútbol has an upcoming match`);
  if (home.includes('data-line="match"')) {
    check(/class="card match"[^>]*>[\s\S]*?class="cr"[\s\S]*?class="chip"[\s\S]*?class="cr"/.test(section("football")),
      `${label}: the next-match card shows both teams' crests or initials and the kickoff`);
  }
  check(!home.includes('data-line="league"') || /Hoy en la liga|In the league today/.test(futbol), `${label}: today's league rows show only when Fútbol has them`);

  const climaTowns = clima.split('<section id="t').slice(1).map((chunk) => {
    const body = chunk.slice(0, chunk.indexOf("</section>"));
    return { id: /^\d+/.exec(body)?.[0], home: body.includes('class="chip"'), today: />(Hoy|Today)</.test(body) };
  });
  // Today appears once per town: the forecast card, not again as the strip's first row.
  const townBodies = clima.split('<section id="t').slice(1).map((chunk) => chunk.slice(0, chunk.indexOf("</section>")));
  check(townBodies.every((b) => (b.match(/>(Hoy|Today)</g) ?? []).length <= 1), `${label}: Clima shows each town's today once`);
  // The watched-town cards (the home photo also links to its own town's section on Clima).
  const watched = [...home.matchAll(/<a class="town" href="\/clima#t(\d+)"/g)].map((m) => m[1]);
  check(watched.every((id) => climaTowns.some((town) => town.id === id && !town.home && town.today)),
    `${label}: every watched-town card is a town Clima shows with today's forecast`, `home ${watched}`);
  check(climaTowns.filter((town) => !town.home && town.today).every((town) => watched.includes(town.id)),
    `${label}: every other town with today's forecast gets a card on home`);

  check(home.includes('data-line="plan"') && /Tu plan vence el \d|Your plan ends on \d/.test(section("reminders")),
    `${label}: a paying client sees when the plan ends`);
  check(!home.includes('data-line="push"') || avisos.includes('id="on"'), `${label}: "Activa las alertas" shows only where this phone can subscribe`);
  const hasEvents = /<ul class="rows"><li/.test(escuela);
  const parent = mas.indexOf("/mas/escuela") < mas.indexOf("/mas/tasa");
  check(!home.includes('data-line="school"') || (hasEvents && parent), `${label}: the school card shows only for a parent with a school event`);
  check(!(hasEvents && parent) || home.includes('data-line="school"'), `${label}: a parent with a school event sees it on home`);
  await images(home, `${label} / (more)`);
  await images(clima, `${label} /clima`);
}

// The welcome screen (0041): shown exactly when not yet welcomed, set up and
// paid; a plain form with the arrow and Saltar; a foreign origin is refused;
// the POST marks it and home follows.
async function welcome(cookie, code, label) {
  const home = (await send("/", { cookie })).text;
  const shown = home.includes('<main class="welcome');
  if (DB) {
    const { rows: [w] } = await q(
      "select welcomed_at is not null as done, app.setup_next_step(id) as step, (app.client_access(id)->>'paid')::boolean as paid from clients where code = $1", [code]);
    check(shown === (!w.done && !w.step && w.paid), `${label}: the welcome screen shows exactly when not yet welcomed, set up and paid`, JSON.stringify(w));
  } else console.log(`SKIP ${label}: welcome vs database (set DATABASE_URL)`);
  if (!shown) return;
  check(Boolean(tag(home, "form", { method: "post", action: "/api/welcome" })) && Boolean(tag(home, "button", { type: "submit", class: "go" })) && />(Saltar|Skip)</.test(home),
    `${label}: the welcome screen has the round arrow and Saltar in a plain form`);
  check(!home.includes('<nav class="tabs"') && !/<script/.test(home), `${label}: the welcome screen is one screen with no script`);
  check(/Te damos la bienvenida a Hoy|Welcome to Hoy/.test(home), `${label}: the welcome screen greets them`);
  await images(home, `${label} welcome`);
  const foreign = await send("/api/welcome", { method: "POST", cookie, origin: "https://evil.example" });
  check(foreign.status === 403 && (await send("/", { cookie })).text.includes('<main class="welcome'), `${label}: a cross-origin welcome post is refused and changes nothing`);
  const done = await send("/api/welcome", { method: "POST", cookie, form: { skip: "1" } });
  const after = (await send("/", { cookie })).text;
  check(done.status === 303 && done.location === "/" && !after.includes('<main class="welcome') && after.includes("data-render="),
    `${label}: the welcome POST marks it and home follows`, `${done.status} ${done.location}`);
  if (DB) check((await q("select welcomed_at is not null as done from clients where code = $1", [code])).rows[0].done, `${label}: welcomed is recorded`);
}

// "Llegué a Canadá el…" (0041): only for seasonal members; a real date is saved,
// a date the database refuses shows why and changes nothing, a foreign origin is
// refused. The member's own date is put back at the end.
async function arrival(cookie, code, label) {
  const mas = (await send("/mas", { cookie })).text;
  const form = mas.includes('action="/api/arrival"');
  const stored = async () => DB ? (await q("select to_char(arrival_date, 'YYYY-MM-DD') as d, segment::text as s from clients where code = $1", [code])).rows[0] : null;
  const before = await stored();
  if (DB) check(form === (before.s === "seasonal"), `${label}: the arrival form shows exactly for a seasonal member`, before.s);
  const inputValue = (html) => attr(tag(html, "input", { id: "arrival", name: "date", type: "date" }), "value") ?? "";
  if (!form) {
    const r = await send("/api/arrival", { method: "POST", cookie, form: { date: "2026-09-01" } });
    check(r.status === 400, `${label}: a member who is not seasonal cannot set an arrival`, String(r.status));
    if (DB) check((await stored()).d === before.d, `${label}: ... and nothing changes`);
    return;
  }
  const original = inputValue(mas);
  if (DB) check(original === (before.d ?? ""), `${label}: the arrival form shows the stored date`);
  const day = new Date(Date.now() - 20 * 86_400_000).toISOString().slice(0, 10);
  const ok = await send("/api/arrival", { method: "POST", cookie, form: { date: day } });
  const saved = (await send(ok.location.split("#")[0] || "/mas", { cookie })).text;
  check(ok.status === 303 && ok.location.startsWith("/mas?ok=arrival") && inputValue(saved) === day && /class="ok"/.test(saved),
    `${label}: a real arrival date is saved`, `${ok.status} ${ok.location} ${inputValue(saved)}`);
  if (DB) check((await stored()).d === day, `${label}: ... in the database`);
  for (const [date, reason] of [["2020-01-01", "arrival-range"], ["31/12/2026", "arrival-date"], ["2026-02-30", "arrival-date"]]) {
    const bad = await send("/api/arrival", { method: "POST", cookie, form: { date } });
    const page = (await send(bad.location.split("#")[0], { cookie })).text;
    check(bad.status === 303 && bad.location.startsWith(`/mas?e=${reason}`) && /class="err" role="alert"/.test(page) && inputValue(page) === day,
      `${label}: the arrival "${date}" is refused with a reason and changes nothing`, `${bad.status} ${bad.location}`);
  }
  const foreign = await send("/api/arrival", { method: "POST", cookie, origin: "https://evil.example", form: { date: "" } });
  check(foreign.status === 403 && inputValue((await send("/mas", { cookie })).text) === day, `${label}: a cross-origin arrival post is refused and changes nothing`);
  await send("/api/arrival", { method: "POST", cookie, form: { date: original } });
  check(inputValue((await send("/mas", { cookie })).text) === original, `${label}: the member's own arrival date is put back`);
}

// The member page, badges, season ring and Allá y aquí (0041), held to the
// database functions they render.
async function round2(cookie, code, label) {
  const [home, miembro, clima] = await Promise.all(["/", "/mas/miembro", "/clima"].map(async (p) => (await send(p, { cookie })).text));

  // Allá y aquí: two clocks, the difference, a 15-minute validity, temperatures only with "Ahora".
  const alla = /<section class="alla" data-line="alla" data-until="([^"]+)">([\s\S]*?)<\/section>/.exec(home);
  if (alla) {
    const left = Date.parse(alla[1]) - Date.now();
    check(left > 0 && left <= 15 * 60_000 + 5_000, `${label}: "Allá y aquí" holds for at most 15 minutes`, alla[1]);
    check((alla[2].match(/class="clk">\d{1,2}(:\d{2})?(am|pm)</g) ?? []).length === 2, `${label}: "Allá y aquí" shows both local times`);
    check(/class="dif">(Misma hora|Same time|Allá: [\d.]+ h (más|menos)|There: [\d.]+ h (ahead|behind))</.test(alla[2]), `${label}: "Allá y aquí" shows the time difference`);
    const nowTemps = [...alla[2].matchAll(/class="nowt" data-line="alla-(home|leam)-now" data-until="([^"]+)">(-?\d+(–-?\d+)?°)</g)];
    check(nowTemps.every((m) => Date.parse(m[2]) > Date.now()), `${label}: "Allá y aquí" temperatures carry their validity`);
    const homeTown = clima.split('<section id="t').slice(1).find((c) => c.slice(0, c.indexOf("</section>")).includes('class="chip"')) ?? "";
    const leamCard = /<b class="nm">Leamington<\/b>([\s\S]*?)<\/div><\/div>/.exec(clima)?.[1] ?? "";
    check(nowTemps.some((m) => m[1] === "home") === homeTown.slice(0, homeTown.indexOf("</section>")).includes('class="ahora card"'),
      `${label}: the hometown temperature in "Allá y aquí" shows exactly with its "Ahora"`);
    check(nowTemps.some((m) => m[1] === "leam") === leamCard.includes('class="ahora in"'), `${label}: Leamington's temperature in "Allá y aquí" shows exactly with its "Ahora"`);
  }

  if (!DB) { console.log(`SKIP ${label}: member card, badges, season and "Allá y aquí" vs database (set DATABASE_URL)`); return; }
  const { rows: [r] } = await q(
    "select app.member_card(id) as m, app.member_badges(id) as b, app.season_progress(id) as s, app.home_more(id)->>'home_timezone' as tz from clients where code = $1", [code]);
  const m = r.m;
  check(Boolean(alla) === Boolean(r.tz), `${label}: "Allá y aquí" shows exactly when a hometown is set`);

  // Member card: exactly its fields.
  check(miembro.includes(`<p class="mname">${esc(m.full_name)}</p>`), `${label}: the member card shows the full name`);
  check(m.member_number == null ? !miembro.includes('class="mnum"') : miembro.includes(`<p class="mnum">${m.language === "en" ? "Member" : "Miembro"} #${m.member_number}</p>`),
    `${label}: the member number shows exactly when there is one`, String(m.member_number));
  check(miembro.includes(`<p class="mcode">${pretty(m.code)}</p>`), `${label}: the member card shows the code`);
  check(miembro.includes('class="ribbon"') === m.founder, `${label}: the founder ribbon shows exactly for a founder`, String(m.founder));
  check(miembro.includes(`dateTime="${m.member_since}"`), `${label}: the member card shows member since`);
  check(m.valid_until ? miembro.includes(`<span class="mvalid"><small>`) && miembro.includes(`dateTime="${m.valid_until}"`) : !miembro.includes('class="mvalid"'),
    `${label}: "valid until" shows exactly when the plan is active or due`);
  check(miembro.includes('class="chip mst"') === (m.status !== "active"), `${label}: a status chip shows exactly when not active`, m.status);
  check(m.business ? miembro.includes(`<b>${esc(m.business)}</b>`) : !miembro.includes('class="mbiz"'), `${label}: the registering business shows exactly when there is one`);
  check(m.renewals > 0 ? miembro.includes(`data-renewals="${m.renewals}"`) : !miembro.includes("data-renewals="), `${label}: renewals show exactly when there are some`);

  // Badges: the same keys, in order, earned or locked, with dates and n/of rings.
  const lis = [...miembro.matchAll(/<li class="badge (on|off)" data-key="([a-z]+)">([\s\S]*?)<\/li>/g)];
  check(lis.map((x) => x[2]).join() === r.b.map((b) => b.key).join(), `${label}: the badges are the database's, in its order`, lis.map((x) => x[2]).join());
  check(r.b.every((b, i) => lis[i] && (lis[i][1] === "on") === b.earned), `${label}: each badge is earned or locked as the database says`);
  check(r.b.every((b, i) => !lis[i] || !b.earned || !b.earned_at || lis[i][3].includes(`dateTime="${b.earned_at}"`)), `${label}: earned badges show the day they were earned`);
  check(r.b.every((b, i) => !lis[i] || b.earned || (b.progress ? lis[i][3].includes(`<b>${b.progress.n}/${b.progress.of}</b>`) : !lis[i][3].includes('class="ring'))),
    `${label}: locked badges show n/of rings exactly where there is progress`);
  const earned = r.b.filter((b) => b.earned).length;
  check(new RegExp(`<a class="tile brow" href="/mas/miembro"[^>]*>[\\s\\S]*?<span class="sr">${earned}</span>[\\s\\S]*?(de|of) ${r.b.length}<`).test(home),
    `${label}: home's badge row says ${earned} of ${r.b.length}`);

  // Season ring: the database's kind, never a negative number of days.
  const sc = /<section class="season" data-line="season" data-until="[^"]+" data-kind="([a-z]+)">([\s\S]*?)<\/section>/.exec(home);
  check((sc?.[1] ?? null) === (r.s?.kind ?? null), `${label}: the season card's kind is the database's`, `${sc?.[1]} vs ${r.s?.kind}`);
  if (sc && r.s) {
    const text = sc[2].replace(/<[^>]+>/g, " ");
    check(!/(^|\s)[-−]\s?\d/.test(text), `${label}: the season card never shows negative days`);
    if (!r.s.past && r.s.days_left > 0) check(sc[2].includes(`<span class="sr">${r.s.days_left}</span>`), `${label}: the season card shows the days left`);
    if (r.s.kind === "season") check(sc[2].includes(`<span class="sr">${r.s.pct}</span>`), `${label}: the season card shows the season's percentage`);
    if (r.s.past) check(!/<span class="sr">\d+<\/span>[^<]*<\/b>(<small>|<em>)(días|días|days|day|día)/.test(sc[2]), `${label}: a past date is said in words, not days`);
  }
}

// Round 3, "Tu dinero" (0042): Tasa, the calculator, the reminder and Feriados,
// held to app.fx_history, app.rate_reminder and app.holidays_here_and_there.
// FX stays descriptive: no provider name, no advice, no forecast.
const PROVIDERS = /frankfurter|exchangerate|open\.er-api|jsdelivr|currency-api|fawazahmed|fixer\.io|oanda|xe\.com|wise\.com|western ?union|remitly|moneygram/i;
const ADVICE = /\b(te conviene|conviene (enviar|esperar|mandar)|buen momento|mal momento|mejor momento|env[ií]a ahora|espera a que|te recomendamos|recomendamos|va a subir|va a bajar|pron[oó]stico de la tasa|good time to|best time to|we recommend|you should (send|wait)|will (rise|fall|go up|go down))\b/i;
const tagsOf = (html, name, cls) => [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, "g"))].map((m) => m[0]).filter((t) => new RegExp(` class="${cls}"`).test(t));

async function money(cookie, code, label) {
  if (!DB) { console.log(`SKIP ${label}: Tasa, calculator, reminder and Feriados vs database (set DATABASE_URL)`); return; }
  const history = async (days) => (await q("select app.fx_history(id, $2) as h from clients where code = $1", [code, days])).rows[0].h;

  for (const r of [7, 30, 90]) {
    const path = `/mas/tasa?r=${r}`;
    const tl = `${label} ${path}`;
    const html = (await send(path, { cookie })).text;
    const h = await history(r);
    const words = visible(html).replace(/<[^>]+>/g, " ");
    check(!PROVIDERS.test(html), `${tl}: names no rate provider`, PROVIDERS.exec(html)?.[0]);
    check(!ADVICE.test(words), `${tl}: gives no advice or forecast`, ADVICE.exec(words)?.[0]);
    check(Boolean(tag(html, "a", { href: path })?.includes('aria-current="page"')), `${tl}: its range pill is the active one`);
    if (!h.latest) {
      check(!html.includes('class="chart"') && !html.includes('class="cres"'), `${tl}: no chart and no calculation without a reference rate`);
      continue;
    }
    check(/tasa de referencia|reference rate/.test(words), `${tl}: says "tasa de referencia"`);
    const open = tag(html, "svg", { class: "chart" }) ?? "";
    const at = html.indexOf(open);
    const body = open ? html.slice(at + open.length, html.indexOf("</svg>", at)) : "";
    if (r <= 30) {
      const bars = tagsOf(body, "rect", "b( on)?");
      check(bars.map((b) => attr(b, "data-d")).join() === h.points.map((p) => p.date).join(),
        `${tl}: one bar per real stored day, none invented`, `${bars.length} bars, ${h.points.length} points`);
      check(bars.length > 0 && / class="b on"/.test(bars.at(-1)) && bars.filter((b) => / class="b on"/.test(b)).length === 1, `${tl}: only the latest bar is highlighted`);
    } else {
      const d = attr(tag(body, "path", { class: "ln" }), "d") ?? "";
      const steps = (d.match(/C/g) ?? []).length;
      check(steps === Math.max(0, h.points.length - 1), `${tl}: the line passes through exactly the stored days`, `${steps} steps, ${h.points.length} points`);
    }
    check(attr(tag(html, "span", { class: "hi" }), "data-d") === h.high.date && html.includes(`<b>${Number(h.high.rate).toFixed(2)}</b>`), `${tl}: the high and its date are the database's`);
    check(attr(tag(html, "span", { class: "lo" }), "data-d") === h.low.date && html.includes(`<b>${Number(h.low.rate).toFixed(2)}</b>`), `${tl}: the low and its date are the database's`);
    check(html.includes('class="stale"') === (!h.current || h.latest.stale), `${tl}: says the rate is not today's exactly when it is not current`);
    check(h.change_pct == null || h.points.length < 2 ? !html.includes('class="chg"') : attr(tag(html, "span", { class: "chg" }), "data-pct") === String(h.change_pct),
      `${tl}: the change chip is the database's`);
    const circles = tagsOf(html, "li", "wc [a-z]+");
    check(circles.map((c) => attr(c, "data-dir")).join() === h.week.map((w) => w.dir ?? "").join()
      && circles.map((c) => attr(c, "data-d")).join() === h.week.map((w) => w.date).join(), `${tl}: the week circles are the database's week`);
  }

  // Calculator at the reference rate, both ways; anything that is not a plain amount is ignored.
  const h = await history(30);
  if (h.latest) {
    const rate = Number(h.latest.rate), dec = h.currency === "JMD" ? 0 : 2;
    const round = (n, d) => Math.round(n * 10 ** d) / 10 ** d;
    const result = async (path) => tag((await send(path, { cookie })).text, "p", { class: "cres" });
    const fwd = await result("/mas/tasa?cad=200");
    check(attr(fwd, "data-dir") === "cad" && Number(attr(fwd, "data-amount")) === 200 && Number(attr(fwd, "data-result")) === round(200 * rate, dec),
      `${label}: 200 CAD converts at the reference rate`, fwd);
    check(Number(attr(await result("/mas/tasa?cad=37.5"), "data-result")) === round(37.5 * rate, dec), `${label}: a typed CAD amount converts at the reference rate`);
    const back = await result("/mas/tasa?dir=local&n=2500");
    check(attr(back, "data-dir") === "local" && Number(attr(back, "data-result")) === round(2500 / rate, 2), `${label}: ${h.currency} converts back to CAD at the reference rate`, back);
    for (const bad of ["abc", "-5", "0", "1e5", "99999999", "12.345"]) {
      const page = (await send(`/mas/tasa?cad=${encodeURIComponent(bad)}`, { cookie })).text;
      check(!page.includes('class="cres"') && Boolean(tag(page, "form", { action: "/mas/tasa#calc" })), `${label}: the calculator ignores "${bad}" and shows the form again`);
    }
  }

  // Reminder: set, refused, cleared, and the member's own state put back.
  const reminder = async () => (await q("select app.rate_reminder(id) as r from clients where code = $1", [code])).rows[0].r;
  const before = await reminder();
  const post = (form, extra = {}) => send("/api/rate-reminder", { method: "POST", cookie, form, ...extra });
  if (!h.latest) {
    const r = await post({ action: "set", target: "10" });
    check(r.location.startsWith("/mas/tasa?e=reminder-norate") && (await reminder()) === null, `${label}: no reminder can be set without a reference rate`, r.location);
  } else {
    const rate = Number(h.latest.rate);
    const target = (Math.round(rate * 1.02 * 100) / 100).toFixed(2);
    const set = await post({ action: "set", target });
    const page = (await send(set.location.split("#")[0], { cookie })).text;
    check(set.status === 303 && set.location.startsWith("/mas/tasa?ok=reminder") && Number(attr(tag(page, "div", { class: "rem" }), "data-target")) === Number(target)
      && Number((await reminder())?.target) === Number(target), `${label}: a reminder is set and shown with its target`, set.location);
    const pushes = Number((await q("select count(*) from push_subscriptions ps join clients c on c.id = ps.client_id where c.code = $1 and ps.disabled_at is null", [code])).rows[0].count);
    const remind = /<section class="card remind" id="avisame">([\s\S]*?)<\/section>/.exec(page)?.[1] ?? "";
    check(remind.includes('href="/mas/avisos"') === (pushes === 0), `${label}: the reminder says to turn on notifications exactly when no phone receives them`);
    const far = await post({ action: "set", target: (rate * 2).toFixed(2) });
    check(far.location.startsWith("/mas/tasa?e=reminder-range") && /class="err" role="alert"/.test((await send(far.location.split("#")[0], { cookie })).text)
      && Number((await reminder())?.target) === Number(target), `${label}: a target far from the rate is refused with a reason and nothing changes`, far.location);
    const junk = await post({ action: "set", target: "diez" });
    check(junk.location.startsWith("/mas/tasa?e=reminder-number") && Number((await reminder())?.target) === Number(target), `${label}: a target that is not a number is refused`);
    const foreign = await post({ action: "clear" }, { origin: "https://evil.example" });
    check(foreign.status === 403 && (await reminder()) !== null, `${label}: a cross-origin reminder post is refused and changes nothing`, String(foreign.status));
    const clear = await post({ action: "clear" });
    const cleared = (await send(clear.location.split("#")[0], { cookie })).text;
    check(clear.location.startsWith("/mas/tasa?ok=cleared") && (await reminder()) === null && Boolean(tag(cleared, "input", { id: "target" })) && !cleared.includes('class="rem"'),
      `${label}: clearing the reminder removes it`);
    if (before) await post({ action: "set", target: String(before.target) });
    check(Number((await reminder())?.target ?? 0) === Number(before?.target ?? 0), `${label}: the member's own reminder is put back`);
  }

  // Feriados aquí y allá: the merged order, verified dates, and each filter.
  const merged = (await q("select app.holidays_here_and_there(id, now(), 50) as h from clients where code = $1", [code])).rows[0].h ?? [];
  for (const [f, keep] of [["", () => true], ["on", (x) => x.where === "ON"], ["pais", (x) => x.where !== "ON"]]) {
    const path = f ? `/mas/feriados?f=${f}` : "/mas/feriados";
    const html = (await send(path, { cookie })).text;
    const rows = [...html.matchAll(/<div class="tile hol"[^>]*>/g)];
    const want = merged.filter(keep);
    check(rows.map((m) => `${attr(m[0], "data-where")}@${attr(m[0], "data-d")}`).join() === want.map((x) => `${x.where}@${x.date}`).join(),
      `${label} ${path}: the holidays and their order are the database's`, `${rows.length} rows, ${want.length} expected`);
    check(rows.every((m, i) => /(Verificado|Verified): /.test(html.slice(m.index, rows[i + 1]?.index ?? html.indexOf("</main>")))), `${label} ${path}: every holiday shows when it was verified`);
    const more = html.indexOf('<details class="morehol">');
    check(rows.filter((m) => more < 0 || m.index < more).length === Math.min(8, want.length) && (want.length > 8) === (more >= 0),
      `${label} ${path}: the first 8 holidays show, the rest under "Ver más feriados"`);
    check(Boolean(tag(html, "a", { href: path })?.includes('aria-current="page"')), `${label} ${path}: its filter pill is the active one`);
  }

  // Home: the rate row's week dots, and the next holiday here or there.
  const home = (await send("/", { cookie })).text;
  if (home.includes('data-line="rate"')) {
    const dots = /<span class="wd"[^>]*>([\s\S]*?)<\/span>/.exec(home)?.[1] ?? "";
    const week = (await history(7)).week;
    check([...dots.matchAll(/<i class="([a-z]+)"/g)].map((m) => m[1]).join() === week.map((w) => w.dir ?? "nd").join(), `${label}: home's rate row shows the week as dots`);
  }
  const next = merged[0];
  check(home.includes('data-line="holiday"') === Boolean(next && next.days_left <= 120), `${label}: home's holiday card shows exactly when one is within 120 days`);
  if (home.includes('data-line="holiday"')) {
    const card = /<a class="tile holiday"[^>]*>([\s\S]*?)<\/a>/.exec(home)?.[1] ?? "";
    check(card.includes(`dateTime="${next.date}"`) && card.includes(`>${esc(next.name)}<`) && (next.where !== "ON" || card.includes("🇨🇦 Ontario")),
      `${label}: home's holiday is the next one in Ontario or at home, with its flag`);
  }
}

// Round 4, "Tu día de trabajo" (0044): Hoy en Leamington and home's workday
// card, held to app.hourly_outlook, app.sun_and_heat, app.air_quality and
// app.workday_outlook. A missing flag is not a finding: no reassurance words.
const REASSURE = /sin lluvia|todo bien|no hay riesgo|sin riesgo|all clear|no rain|nothing to worry|sin peligro|no risk/i;
function tzOffset(timeZone, at) {
  const name = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" }).formatToParts(at).find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const m = /GMT([+-])(\d{2}):?(\d{2})?/.exec(name);
  return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0)) : 0;
}
function nextTorontoChange(from) {
  const base = tzOffset("America/Toronto", from);
  for (let h = 1; h <= 24 * 400; h++) {
    const at = new Date(from.getTime() + h * 3_600_000);
    if (tzOffset("America/Toronto", at) !== base) return at;
  }
  return null;
}
const sectionOf = (html, cls) => {
  const i = html.indexOf(`<section class="card ${cls}"`);
  return i < 0 ? "" : html.slice(i, html.indexOf("</section>", i) + 10);
};
const untilOf = (chunk) => Date.parse(attr(chunk.slice(0, chunk.indexOf(">") + 1), "data-until"));

async function workday(cookie, code, label) {
  const [aqui, home] = await Promise.all(["/clima/aqui", "/"].map(async (p) => (await send(p, { cookie })).text));
  const words = (html) => visible(html).replace(/<[^>]+>/g, " ");
  check(!REASSURE.test(words(aqui)) && !REASSURE.test(words(home)), `${label}: no reassurance words on home or "Hoy en Leamington"`, REASSURE.exec(words(aqui) + words(home))?.[0]);

  // Cambio de hora: only within 14 days of Toronto's next real offset change.
  const change = nextTorontoChange(new Date());
  const soon = Boolean(change) && change.getTime() - Date.now() <= 14 * 86_400_000;
  check(home.includes('data-line="dst"') === soon && aqui.includes('data-line="dst"') === soon,
    `${label}: the time-change card shows exactly within 14 days of a real Toronto change`, String(change));
  if (process.env.SKY_PREVIEW === "1") {
    for (const [at, show, when] of [["2026-10-25T16:00:00Z", true, /domingo 1 de noviembre la hora se atrasa 1 hora|Sunday 1 November clocks go back 1 hour/],
                                     ["2026-10-10T16:00:00Z", false], ["2026-11-02T16:00:00Z", false],
                                     ["2027-03-05T16:00:00Z", true, /domingo 14 de marzo la hora se adelanta 1 hora|Sunday 14 March clocks go forward 1 hour/]]) {
      const page = (await send(`/clima/aqui?at=${at}`, { cookie })).text;
      const card = sectionOf(page, "dst");
      check(Boolean(card) === show && (!show || (when.test(card) && untilOf(card) > Date.parse(at))),
        `${label}: at ${at.slice(0, 10)} the time-change card ${show ? "names the real day and holds until it" : "is absent"}`);
    }
  }

  if (!DB) { console.log(`SKIP ${label}: hours, sun and heat, air and workday vs database (set DATABASE_URL)`); return; }
  const { rows: [x] } = await q(
    `select app.hourly_outlook('leamington', now(), 12, c.language::text) as h, app.hourly_outlook('leamington', now(), 6, c.language::text) as h6,
            app.sun_and_heat('leamington', now(), c.language::text) as s, app.air_quality('leamington', now(), c.language::text) as a,
            app.workday_outlook('leamington', now(), c.language::text) as w
       from clients c where c.code = $1`, [code]);

  // Por horas: a dot and label exactly where there is a temperature, a gap where not; rain bars; rain hours.
  const hrs = sectionOf(aqui, "hrs");
  check(Boolean(hrs) === Boolean(x.h), `${label}: "Por horas" shows exactly when the hourly outlook exists`);
  if (x.h && hrs) {
    const hours = x.h.hours;
    check(untilOf(hrs) === Date.parse(x.h.valid_until), `${label}: "Por horas" carries its validity`);
    const cols = hrs.split('<div class="hc').slice(1).map((c) => `<div class="hc${c}`);
    check(cols.length === hours.length && cols.every((c, i) => attr(c.slice(0, c.indexOf(">") + 1), "data-h") === hours[i].hour_start),
      `${label}: one column per hour the providers gave, in order`, `${cols.length} vs ${hours.length}`);
    check(cols.every((c, i) => Date.parse(attr(c.slice(0, c.indexOf(">") + 1), "data-until")) === Date.parse(hours[i].hour_start) + 3600e3),
      `${label}: every hour column expires when its hour is over (a kept offline copy drops past hours)`);
    const line = /<svg class="hsvg"[^>]*>/.exec(hrs);
    check(!line || Date.parse(attr(line[0], "data-until")) === Date.parse(hours[0].hour_start) + 3600e3,
      `${label}: the hourly line expires with the first hour`);
    check(cols.every((c, i) => c.includes('class="hd"') === (hours[i].temp_c != null) && (hours[i].temp_c == null || c.includes(`>${hours[i].temp_c}°<`))),
      `${label}: a dot and label exactly where the hour has a temperature, a gap where it does not`);
    check(cols.every((c, i) => {
      const open = c.slice(0, c.indexOf(">") + 1);
      return attr(open, "data-rain") === (hours[i].rain_prob == null ? undefined : String(hours[i].rain_prob))
        && open.startsWith('<div class="hc rh"') === x.h.rain_hours.includes(hours[i].hour);
    }), `${label}: rain bars match each hour's rain chance, rain hours highlighted`);
    let runs = 0;
    hours.forEach((hr, i) => { if (hr.temp_c != null && hours[i - 1]?.temp_c != null && hours[i - 2]?.temp_c == null) runs++; });
    const d = attr(tag(hrs, "path", { class: "hl2" }), "d") ?? "";
    check((d.match(/M/g) ?? []).length === runs, `${label}: the line breaks where an hour has no temperature`, `${(d.match(/M/g) ?? []).length} vs ${runs}`);
  }

  // Sol y calor: the UV gauge's value, label and peak; heat only from caution up.
  const s = x.s;
  const heatOn = ["caution", "high", "extreme"].includes(s?.heat_level) && s?.feels_max != null;
  const uv = sectionOf(aqui, "uvc");
  check(Boolean(uv) === Boolean(s && (s.uv_max != null || heatOn)), `${label}: "Sol y calor" shows exactly with UV or heat to show`);
  if (uv && s) {
    check(untilOf(uv) === Date.parse(s.valid_until), `${label}: "Sol y calor" carries its validity`);
    if (s.uv_max != null) {
      const g = tag(uv, "div", { class: "gw" });
      check(attr(g, "data-uv") === String(s.uv_max) && uv.includes(`>${esc(s.uv_label)}<`) && (!s.uv_peak_hour || uv.includes(s.uv_peak_hour)),
        `${label}: the UV gauge shows the database's value, label and peak hour`);
    }
    check(uv.includes('class="heat"') === heatOn && (!heatOn || (uv.includes(`${s.feels_max}°`) && uv.includes(esc(s.heat_label)))),
      `${label}: the heat chip shows exactly when heat is caution or above`, s.heat_level);
  }

  // Aire: the gauge's AQI, category and PM2.5, or the range with no single value.
  const air = sectionOf(aqui, "airc");
  check(Boolean(air) === Boolean(x.a), `${label}: "Aire" shows exactly when air quality exists`);
  if (air && x.a) {
    check(untilOf(air) === Date.parse(x.a.valid_until), `${label}: "Aire" carries its validity`);
    const g = tag(air, "div", { class: "gw" });
    if (x.a.range) {
      check(attr(g, "data-aqi") === undefined && !air.includes('class="ndl"') && air.includes(`${x.a.aqi_min}–${x.a.aqi_max}`)
        && air.includes(esc(x.a.label_min)) && air.includes(esc(x.a.label_max)), `${label}: providers far apart show the range, with no single value`);
    } else {
      check(attr(g, "data-aqi") === String(x.a.us_aqi) && air.includes('class="ndl"') && air.includes(`>${esc(x.a.label)}<`)
        && (x.a.pm2_5 == null || air.includes(`PM2.5 ${x.a.pm2_5}`)), `${label}: the air gauge shows the database's AQI, category and PM2.5`);
    }
  }

  // Home: the workday card's tiles are exactly its flags; the next hours strip.
  const w = x.w;
  const card = /<a class="work"[^>]*>([\s\S]*?)<\/a>/.exec(home);
  check(Boolean(card) === Boolean(w && (w.morning_temp != null || w.high != null || (w.flags ?? []).length)), `${label}: the workday card shows exactly with something to show`);
  if (card && w) {
    const open = card[0].slice(0, card[0].indexOf(">") + 1);
    check(attr(open, "data-day") === w.day && Date.parse(attr(open, "data-until")) === Date.parse(w.valid_until), `${label}: the workday card says which day and carries its validity`);
    check([...card[1].matchAll(/data-flag="([a-z_]+)"/g)].map((m) => m[1]).join() === (w.flags ?? []).join(), `${label}: the workday tiles are exactly its flags`, (w.flags ?? []).join());
    check((w.morning_temp == null || card[1].includes(`>${w.morning_temp}°<`)) && (w.high == null || card[1].includes(`>${w.high}°<`)), `${label}: the workday numbers are the database's`);
  }
  const strip = /<section data-line="hours" data-until="([^"]+)">([\s\S]*?)<\/section>/.exec(home);
  check(Boolean(strip) === Boolean(x.h6), `${label}: "Próximas horas" shows exactly when the next hours exist`);
  if (strip && x.h6) {
    const cells = [...strip[2].matchAll(/<span class="hs"([^>]*)>([\s\S]*?)<\/span>/g)].map((c) => [c[0], attr(`<span${c[1]}>`, "data-h"), c[2], attr(`<span${c[1]}>`, "data-until")]);
    check(cells.length > 0 && cells.every((c) => Date.parse(c[3]) === Date.parse(c[1]) + 3600e3), `${label}: every next-hours cell expires when its hour is over`);
    check(Date.parse(strip[1]) === Date.parse(x.h6.valid_until) && cells.map((c) => c[1]).join() === x.h6.hours.map((hr) => hr.hour_start).join()
      && cells.every((c, i) => c[2].includes("<b>") === (x.h6.hours[i].temp_c != null)), `${label}: "Próximas horas" is the database's hours, temperatures only where they exist`);
  }
}

// Noticias (0047): the page and the home card held to app.news_page and app.news_home.
// Copyright stance (OPEN-DECISIONS 3.24): headline, the publisher's own summary
// (at most 300 characters), our cached picture credited "Imagen: {source}", and
// the full story only on the publisher's site.
const NEWS_LIMIT = 10;
const NO_NEWS = /no hay noticias|sin noticias|no news|no stories/i;
async function news(cookie, code, label) {
  if (!DB) { console.log(`SKIP ${label}: Noticias vs database (set DATABASE_URL)`); return; }
  const np = (await q("select app.news_page(id, now(), $2) as n from clients where code = $1", [code, NEWS_LIMIT])).rows[0].n;
  const first = await send("/noticias", { cookie });
  const sections = ["local", "region", "national"].filter((s) => np[s].length > 0);
  const tabs = (html) => [...html.matchAll(/<a\b[^>]*data-section="([a-z]+)"[^>]*>/g)].map((m) => m[0]);
  check(first.status === 200 && tabs(first.text).map((t) => attr(t, "data-section")).join() === sections.join(),
    `${label} /noticias: a tab exactly for each section with stories`, `${tabs(first.text).map((t) => attr(t, "data-section"))} vs ${sections}`);
  if (np.local.length) {
    const home = np.municipality?.name;
    const want = home && np.local.every((i) => i.mentions.every((m) => m === home)) ? esc(home) : np.language === "en" ? "My towns" : "Mis pueblos";
    const got = /<a\b[^>]*data-section="local"[^>]*>([^<]*)<\/a>/.exec(first.text)?.[1];
    check(got === want, `${label} /noticias: the local tab names the hometown only when its stories name only the hometown, else "Mis pueblos"`, `${got} vs ${want}`);
  }
  check(!NO_NEWS.test(visible(first.text).replace(/<[^>]+>/g, " ")), `${label} /noticias never says there is no news`);
  check(/puede no estar al día|may not be up to date/.test(first.text) === Boolean(np.stale), `${label} /noticias: the not-current note exactly when the news is stale`, String(np.stale));
  check(np.sources.length > 0 && np.sources.every((x) => first.text.includes(`href="${esc(x.homepage_url)}" target="_blank" rel="noopener">${esc(x.name)}</a>`)),
    `${label} /noticias: every source listed, linked to its homepage`);
  if (sections.length) {
    check(first.text.includes(`<section data-section="${sections[0]}">`), `${label} /noticias opens on the first section with stories`);
    check((await send("/noticias?s=nope", { cookie })).text.includes(`<section data-section="${sections[0]}">`), `${label} /noticias: an unknown section opens the first with stories`);
  }
  for (const sec of sections) {
    const html = sec === sections[0] ? first.text : (await send(`/noticias?s=${sec}`, { cookie })).text;
    const tl = `${label} /noticias ${sec}`;
    check(tabs(html).some((t) => attr(t, "data-section") === sec && / aria-current="page"/.test(t)), `${tl}: its tab is the current one`);
    const items = np[sec];
    const lead = items.find((i) => i.image);
    const want = lead ? [lead, ...items.filter((i) => i !== lead)] : items;
    const at = html.indexOf(`<section data-section="${sec}">`);
    const cards = html.slice(at, html.indexOf("</section>", at)).split(/(?=<article )/).slice(1);
    const open = (c) => c.slice(0, c.indexOf(">") + 1);
    check(cards.map((c) => attr(open(c), "data-item")).join() === want.map((i) => String(i.id)).join(),
      `${tl}: exactly the section's stories, in order, the first with a picture as the lead`, `${cards.length} vs ${want.length}`);
    if (cards.length !== want.length) continue;
    check(cards.every((c, k) => c.includes(`>${esc(want[k].title)}</a>`) && c.includes(`${esc(want[k].source)} · `)), `${tl}: every title and source are the database's`);
    check(cards.every((c, k) => [...c.matchAll(/<a\b[^>]*>/g)].every((m) => attr(m[0], "href") === esc(want[k].url) && / target="_blank"/.test(m[0]) && / rel="noopener"/.test(m[0]))),
      `${tl}: every link in a story opens the publisher's own page (new tab, rel=noopener)`);
    check(cards.every((c, k) => {
      const reads = [...c.matchAll(/<a\b([^>]*)>(?:Leer en|Read on) ([^<]*) ↗<\/a>/g)];
      return (k === 0 && lead ? reads.length === 1 : reads.length === 0) && reads.every((m) => attr(`<a${m[1]}>`, "href") === esc(want[k].url) && m[2] === esc(want[k].source));
    }), `${tl}: the lead story says "Leer en {source}" with the story's own link`);
    check(cards.every((c, k) => {
      const imgs = [...c.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
      const variant = k === 0 && lead ? "lead" : "thumb";
      return imgs.length === (want[k].image ? 1 : 0)
        && imgs.every((i) => attr(i, "src") === `/news-image/${want[k].id}/${variant}` && (variant === "lead") !== / loading="lazy"/.test(i))
        && (/(Imagen|Image): /.test(c) === want[k].image) && (!want[k].image || c.includes(`: ${esc(want[k].source)}</small>`));
    }), `${tl}: a picture exactly where the story has one (the lead's eager, thumbs lazy), each credited to its source`);
    check(want.every((i) => i.summary == null || i.summary.length <= 300) && cards.every((c, k) => want[k].summary == null ? !/<p( class="nsum")?>/.test(c) : c.includes(`${esc(want[k].summary)}</p>`)),
      `${tl}: only the publisher's short summary (at most 300 characters), never the article`);
    check(cards.every((c, k) => [...c.matchAll(/data-town="([^"]*)"/g)].map((m) => m[1]).join() === (sec === "local" ? want[k].mentions.map(esc).join() : "")),
      `${tl}: the towns a local story names, and only on local stories`);
  }
  // The picture route: our cached copy, the same headers as a town photo; 404 for anything else.
  const all = [...np.local, ...np.region, ...np.national];
  const pic = all.find((i) => i.image);
  if (pic) {
    for (const [v, limit] of [["lead", 45_000], ["thumb", 10_000]]) {
      const path = `/news-image/${pic.id}/${v}`;
      const r = await send(path);
      check(r.status === 200 && r.headers["content-type"] === "image/jpeg" && r.bytes > 0 && r.bytes <= limit, `${path} serves a JPEG of at most ${limit / 1000} KB`, `${r.status} ${r.headers["content-type"]} ${r.bytes}`);
      check(/public/.test(r.headers["cache-control"] ?? "") && /max-age=2592000/.test(r.headers["cache-control"] ?? "") && /immutable/.test(r.headers["cache-control"] ?? "")
        && Boolean(r.headers.etag) && r.headers["x-content-type-options"] === "nosniff", `${path} is cached for 30 days, immutable, with an ETag and nosniff`, JSON.stringify(r.headers));
      check((await send(path, { headers: { "if-none-match": r.headers.etag } })).status === 304, `${path} answers 304 to its own ETag`);
    }
    check((await send(`/news-image/${pic.id}/huge`)).status === 404 && (await send("/news-image/abc/thumb")).status === 404, "/news-image: an unknown size or id is 404");
  }
  const bare = all.find((i) => !i.image);
  if (bare) check((await send(`/news-image/${bare.id}/thumb`)).status === 404, `${label}: a story without a picture has no picture to serve (404)`);
  // Home: the card exactly as app.news_home.
  const nh = (await q("select app.news_home(id) as n from clients where code = $1", [code])).rows[0].n;
  const home = (await send("/", { cookie })).text;
  const card = /<section class="newsh">([\s\S]*?)<\/section>/.exec(home)?.[1];
  check(Boolean(card) === Boolean(nh && (nh.lead || nh.more.length)), `${label}: home's "Noticias" shows exactly when news_home has stories`);
  if (card && nh) {
    check(card.includes('href="/noticias"'), `${label}: home's "Noticias" links to the page`);
    check((attr(tag(card, "div", { class: "nhl" }) ?? "", "data-item") ?? null) === (nh.lead ? String(nh.lead.id) : null)
      && (!nh.lead || (card.includes(`src="/news-image/${nh.lead.id}/lead"`) && card.includes(`>${esc(nh.lead.title)}</a>`) && card.includes(`: ${esc(nh.lead.source)}</small>`))),
      `${label}: home's lead story is news_home's, with its picture and credit`);
    check([...card.matchAll(/<li data-item="(\d+)">/g)].map((m) => m[1]).join() === nh.more.map((i) => String(i.id)).join()
      && nh.more.every((i) => card.includes(`href="${esc(i.url)}" target="_blank" rel="noopener">${esc(i.title)}</a>`)), `${label}: home's two more headlines are news_home's, linked to the publisher`);
    check(!NO_NEWS.test(card), `${label}: home's "Noticias" never says there is no news`);
  }
}

// Football videos (0049, OPEN-DECISIONS 3.25): links to official channels' videos on YouTube with our
// cached thumbnail, never a player, and the note that watching opens YouTube and uses a lot of data.
const VIDEOS_LIMIT = 12;
const NO_VIDEOS = /no hay videos|sin videos|no videos/i;
const NO_YOUTUBE_LOAD = /<iframe|ytimg\.com|youtube\.com\/embed|youtube-nocookie/i;
async function videos(cookie, code, label) {
  if (!DB) { console.log(`SKIP ${label}: videos vs database (set DATABASE_URL)`); return; }
  const fp = (await q("select app.football_page(id)->'videos' as v from clients where code = $1", [code])).rows[0].v;
  const fv = (await q("select app.football_videos(id, now(), $2) as v from clients where code = $1", [code, VIDEOS_LIMIT])).rows[0].v;
  const cardsIn = (html, sec) => {
    const at = html.indexOf(`<section class="vids" data-videos="${sec}">`) >= 0 ? html.indexOf(`<section class="vids" data-videos="${sec}">`) : html.indexOf(`<section data-videos="${sec}">`);
    if (at < 0) return null;
    return html.slice(at, html.indexOf("</section>", at)).split(/(?=<a class="(?:card )?vcard)/).slice(1);
  };
  const open = (c) => c.slice(0, c.indexOf(">") + 1);
  const holds = (cards, want, tl) => {
    check(cards.map((c) => attr(open(c), "data-video")).join() === want.map((v) => String(v.id)).join(), `${tl}: exactly the database's videos, in order`, `${cards.length} vs ${want.length}`);
    if (cards.length !== want.length) return;
    check(cards.every((c, k) => attr(open(c), "href") === `https://www.youtube.com/watch?v=${want[k].youtube_id}` && want[k].url === attr(open(c), "href")
      && / target="_blank"/.test(open(c)) && / rel="noopener"/.test(open(c))), `${tl}: every card links to its YouTube video (new tab, rel=noopener)`);
    check(cards.every((c, k) => c.includes(`<b class="vt">${esc(want[k].title)}</b>`) && c.includes(`YouTube · ${esc(want[k].channel)} · `)), `${tl}: every title and channel are the database's, credited to YouTube`);
    check(cards.every((c, k) => {
      const imgs = [...c.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
      return imgs.length === (want[k].thumb ? 1 : 0) && imgs.every((i) => attr(i, "src") === `/video-thumb/${want[k].id}` && / loading="lazy"/.test(i));
    }), `${tl}: a lazy thumbnail exactly where the video has one, never a broken picture`);
    check(cards.every((c, k) => /class="vbadge( in)?"/.test(c) === want[k].is_highlight), `${tl}: the "Resumen" badge exactly on highlights`);
    check(cards.every((c, k) => /class="vv">/.test(c) === (want[k].views != null)), `${tl}: views exactly where the database has them`);
    check(cards.every((c) => !/class="vv">[^<]*\bk\b/.test(c)) && cards.every((c) => !/class="vv">/.test(c) || /class="vv">[\d.,]+( mil| millón| millones de)? vistas<|class="vv">[\d.,]+[KMB]? views</.test(c)),
      `${tl}: views written in words ("705 mil vistas")`);
  };
  // Fútbol: the two strips right after the hero, as football_page.videos says.
  const futbol = (await send("/futbol", { cookie })).text;
  const any = Boolean(fp && (fp.team.length || fp.league.length));
  for (const [sec, want] of [["team", fp?.team ?? []], ["league", fp?.league ?? []]]) {
    const cards = cardsIn(futbol, sec);
    check(Boolean(cards) === want.length > 0, `${label} /futbol: the ${sec} videos strip shows exactly when there are videos`, `${cards?.length} vs ${want.length}`);
    if (cards) holds(cards, want, `${label} /futbol ${sec} videos`);
  }
  check(/Se abre en YouTube · usa muchos datos|Opens YouTube · uses a lot of data/.test(futbol) === any, `${label} /futbol: the data note shows exactly when videos are shown`);
  if (any) {
    const firstVids = futbol.indexOf('class="vids"');
    const later = [/class="card match/, /class="card grp"/, /class="wrap"/].map((re) => futbol.search(re)).filter((i) => i >= 0);
    check(futbol.indexOf('class="hero"') < firstVids && later.every((i) => firstVids < i), `${label} /futbol: the videos come right after the team hero`);
  }
  check(!NO_YOUTUBE_LOAD.test(futbol) && !NO_VIDEOS.test(visible(futbol).replace(/<[^>]+>/g, " ")), `${label} /futbol loads nothing from YouTube (no player, no ytimg) and never says there are no videos`);
  // /futbol/videos: the tabs, the big cards, the channels, the stale note.
  const page0 = (await send("/futbol/videos", { cookie })).text;
  const secs = [["team", fv.team_videos], ["league", fv.league_videos]].filter(([, l]) => l.length > 0);
  check([...page0.matchAll(/<a\b[^>]*data-section="([a-z]+)"/g)].map((m) => m[1]).join() === secs.map(([s]) => s).join(), `${label} /futbol/videos: a tab exactly for each list with videos`);
  check(/puede no estar al día|may not be up to date/.test(page0) === Boolean(fv.stale), `${label} /futbol/videos: the not-current note exactly when stale`, String(fv.stale));
  check(fv.channels.every((c) => page0.includes(`href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.name)}</a>`)), `${label} /futbol/videos: every channel listed, linked to YouTube`);
  check(!NO_YOUTUBE_LOAD.test(page0) && !NO_VIDEOS.test(visible(page0).replace(/<[^>]+>/g, " ")), `${label} /futbol/videos loads nothing from YouTube and never says there are no videos`);
  for (const [sec, want] of secs) {
    const html = sec === secs[0][0] ? page0 : (await send("/futbol/videos?s=league", { cookie })).text;
    check(/Se abre en YouTube · usa muchos datos|Opens YouTube · uses a lot of data/.test(html), `${label} /futbol/videos ${sec}: the data note is there`);
    holds(cardsIn(html, sec) ?? [], want, `${label} /futbol/videos ${sec}`);
  }
  // The thumbnail route: our cached copy with a town photo's headers; 404 otherwise.
  const withThumb = [...fv.team_videos, ...fv.league_videos].find((v) => v.thumb);
  if (withThumb) {
    const path = `/video-thumb/${withThumb.id}`;
    const r = await send(path);
    check(r.status === 200 && r.headers["content-type"] === "image/jpeg" && r.bytes > 0 && r.bytes <= 14_000, `${path} serves a JPEG of at most 14 KB`, `${r.status} ${r.bytes}`);
    check(/public/.test(r.headers["cache-control"] ?? "") && /max-age=2592000/.test(r.headers["cache-control"] ?? "") && /immutable/.test(r.headers["cache-control"] ?? "")
      && Boolean(r.headers.etag) && r.headers["x-content-type-options"] === "nosniff", `${path} is cached for 30 days, immutable, with an ETag and nosniff`, JSON.stringify(r.headers));
    check((await send(path, { headers: { "if-none-match": r.headers.etag } })).status === 304, `${path} answers 304 to its own ETag`);
  }
  const noThumb = (await q("select id from videos where thumb is null limit 1")).rows[0]?.id;
  check((await send("/video-thumb/abc")).status === 404 && (await send("/video-thumb/999999999")).status === 404 && (!noThumb || (await send(`/video-thumb/${noThumb}`)).status === 404),
    "/video-thumb: an unknown video, or one without a thumbnail, is 404");
}

// Round 5, "Siempre contigo" (0045, 0046): the number check, Tu semana, the
// hometown gallery, pages kept for offline, and Modo noche.
const LOTTO_WORDS = /ganaste|ganador|premio|probabilidad|odds|prize|números calientes|hot numbers|comprar|compra tu|\bbuy\b|jackpot|apuesta/i;
const sectionAt = (html, id) => {
  const at = html.indexOf(`id="${id}"`);
  if (at < 0) return "";
  const start = html.lastIndexOf("<section", at);
  return html.slice(start, html.indexOf("</section>", at) + 10);
};

async function round5(cookie, code, label) {
  // Pages kept for offline: exactly the member pages, cleared at sign-in; each carries its offline line, hidden online.
  const sw = (await send("/sw.js")).text;
  const saved = /const SAVED = \[([^\]]*)\]/.exec(sw)?.[1]?.replace(/\s/g, "");
  check(saved === '"/","/clima","/clima/aqui","/mas/tasa","/mas/miembro","/mas/semana","/noticias","/futbol/videos"', "sw.js keeps exactly Inicio, Clima, Hoy en Leamington, Tasa, Miembro, Tu semana, Noticias and Videos", saved);
  check(/pathname === "\/api\/login"\) \{\s*event\.waitUntil\(clearPages\(\)\)/.test(sw) && /pathname === "\/login"\) \{\s*event\.waitUntil\(clearPages\(\)\)/.test(sw)
    && /caches\.delete\(PAGES\)/.test(sw), "sw.js clears every kept page when the sign-in page opens or a code signs in");
  for (const path of ["/", "/clima", "/clima/aqui", "/mas/tasa", "/mas/miembro", "/mas/semana", "/noticias", "/futbol/videos"]) {
    const html = (await send(path, { cookie })).text;
    const bar = tag(html, "p", { id: "off" });
    check(Boolean(bar) && / hidden=""/.test(bar) && /(Sin conexión · guardado a las|Offline · saved at) \d{1,2}(:\d{2})?(am|pm)/.test(html),
      `${label} ${path}: carries the offline line with its saved time, hidden while online`);
  }

  // Modo noche: the class follows the setting; refused from elsewhere or unknown; combines with Letra grande.
  {
    const cls = (text) => (/<html[^>]*\bclass="([^"]*)"/.exec(text)?.[1] ?? "").split(" ").filter(Boolean).sort().join(" ");
    const page = async (p = "/mas") => (await send(p, { cookie })).text;
    const set = (theme, extra = {}) => send("/api/theme", { method: "POST", cookie, form: { theme }, ...extra });
    const before = DB ? (await q("select theme from clients where code = $1", [code])).rows[0].theme : "auto";
    const dark = await set("dark");
    const d1 = await page();
    check(dark.status === 303 && dark.location.startsWith("/mas") && cls(d1) === "dark" && /value="dark" class="on" aria-pressed="true"/.test(d1),
      `${label}: choosing Oscuro gives <html class="dark"> and marks it`, `${dark.status} ${cls(d1)}`);
    check(cls(await page("/")) === "dark" && cls(await page("/clima")) === "dark" && /html\.dark\{--ink:/.test(d1), `${label}: Oscuro applies on home and Clima, with the dark tokens inline`);
    await set("light");
    check(cls(await page()) === "light", `${label}: choosing Claro gives <html class="light">`);
    const foreign = await set("dark", { origin: "https://evil.example" });
    check(foreign.status === 403 && cls(await page()) === "light", `${label}: a cross-origin theme post is refused and changes nothing`, String(foreign.status));
    const bad = await set("sepia");
    check(bad.status === 400 && cls(await page()) === "light", `${label}: an unknown theme is refused and changes nothing`, String(bad.status));
    await set("auto");
    check(cls(await page()) === "", `${label}: Automático leaves the look to the phone`);
    await send("/api/text-size", { method: "POST", cookie, form: { size: "large" } });
    await set("dark");
    check(cls(await page()) === "big dark", `${label}: Letra grande and Oscuro combine`);
    await send("/api/text-size", { method: "POST", cookie, form: { size: "normal" } });
    await set(before);
    check(!DB || (await q("select theme from clients where code = $1", [code])).rows[0].theme === before, `${label}: the member's own theme is put back`);
  }

  if (!DB) { console.log(`SKIP ${label}: lottery check, Tu semana and gallery vs database (set DATABASE_URL)`); return; }

  // ¿Salió mi número?: every game of their country, held to app.lottery_check.
  const games = (await q("select app.lottery_checkable_games(id) as g from clients where code = $1", [code])).rows[0].g ?? [];
  const names = [...new Set([...games.map((g) => g.game), ...(await q("select name from lottery_games")).rows.map((r) => r.name)])];
  const noNames = (html) => names.reduce((text, n) => text.split(esc(n)).join(" "), visible(html).replace(/<[^>]+>/g, " "));
  const base = (await send("/mas/loteria", { cookie })).text;
  check(!LOTTO_WORDS.test(noNames(base)), `${label} /mas/loteria: no prize, odds, "hot numbers" or buying words`, LOTTO_WORDS.exec(noNames(base))?.[0]);

  // Official results: the latest draw of each game big, the earlier ones under "Sorteos anteriores";
  // extra fields only as the operator's labelled balls; never a raw field key.
  const lp = (await q("select app.lottery_page(id) as l from clients where code = $1", [code])).rows[0].l?.games ?? [];
  const plain = visible(base).replace(/<style[\s\S]*?<\/style>/g, "").replace(/<title>[\s\S]*?<\/title>/g, "").replace(/<[^>]+>/g, " ");
  const RAW_KEY = /\b[a-z]+[0-9]+\s*:|\b[a-z]+[A-Z][A-Za-z]*\s*:|\b[a-z]+_[a-z_]+\s*:|\b(mas1|megaBall|bonusBall|drawNumber|multiplicador|reintegros|adicional|concurso|sorteo|tipo)\s*:/;
  check(!RAW_KEY.test(plain), `${label} /mas/loteria: no result shows a raw field key`, RAW_KEY.exec(plain)?.[0]);
  const XBALLS = [["mas1", "Más 1"], ["adicional", "Adicional"], ["bonusBall", "Bonus Ball"]];
  const drawKey = (d) => `${d.draw_date} ${d.draw_time ?? ""}`.trim();
  check(base.split(' data-results="').length - 1 === lp.length, `${label} /mas/loteria: one results block per game with a draw in the last 2 days`, `${base.split(' data-results="').length - 1} vs ${lp.length}`);
  for (const g of lp) {
    const at = base.indexOf(` data-results="${esc(g.game)}"`);
    const sec = at < 0 ? "" : base.slice(base.lastIndexOf("<section", at), base.indexOf("</section>", at));
    const tiles = [...sec.matchAll(/<div class="tile lottery"[^>]*>/g)].map((m) => attr(m[0], "data-draw"));
    const rows = [...sec.matchAll(/<li\b[^>]*>/g)].map((m) => attr(m[0], "data-draw"));
    const tl = `${label} results ${g.game}`;
    check(tiles.length === 1 && tiles[0] === drawKey(g.draws[0]), `${tl}: the latest official draw is the card`, `${tiles} vs ${drawKey(g.draws[0])}`);
    check(rows.join() === g.draws.slice(1).map(drawKey).join() && sec.includes('<details class="prev">') === g.draws.length > 1,
      `${tl}: the earlier draws of the 2 days, exactly, under "Sorteos anteriores"`, `${rows.length} vs ${g.draws.length - 1}`);
    const chunks = sec.split(/(?=<div class="tile lottery"|<li\b)/).slice(1);
    check(chunks.length === g.draws.length && chunks.every((ch, i) => g.draws[i].numbers.every((n) => ch.includes(`<b>${n}</b>`)) && /(Verificado|Verified): /.test(ch)),
      `${tl}: every draw with its official numbers and its own verified time`);
    check(/href="https?:\/\//.test(chunks[0] ?? "") && (!sec.includes("<details") || /<summary>(Sorteos anteriores|Earlier draws) \(\d+\)<\/summary>/.test(sec)),
      `${tl}: the latest draw keeps its source link; the earlier draws are folded`);
    check(chunks.every((ch, i) => {
      const x = g.draws[i].extras ?? {};
      const want = XBALLS.filter(([k]) => /^\d{1,2}$/.test(String(x[k] ?? "")));
      const got = [...ch.matchAll(/data-extra="([^"]+)"/g)].map((m) => m[1]);
      return got.join() === want.map(([k]) => k).join() && want.every(([k, l]) => ch.includes(`<small>${l}</small><span class="balls"><b>${x[k]}</b>`));
    }), `${tl}: known extra fields as labelled balls ("Más 1", "Adicional", "Bonus Ball"), nothing else`);
  }
  for (const g of games.slice(0, 4)) {
    const latest = (await q("select numbers from lottery_results where game_id = $1 order by draw_date desc, draw_time_local desc nulls last limit 1", [g.game_id])).rows[0]?.numbers;
    let nums;
    if (g.match === "digits") {
      nums = latest && latest.length === g.pick_min ? [...latest].reverse().map(Number) : Array.from({ length: g.pick_min }, (_, i) => (i + 1) % 10);
    } else {
      nums = [...new Set((latest ?? []).map(Number).filter((n) => n >= g.min && n <= g.max))].slice(0, g.pick_min);
      for (let v = g.min; nums.length < g.pick_min; v++) if (!nums.includes(v)) nums.push(v);
    }
    const width = g.max >= 1000 ? String(g.max).length : 1;
    const html = (await send(`/mas/loteria?g=${g.game_id}&${nums.map((n) => `n=${String(n).padStart(width, "0")}`).join("&")}`, { cookie })).text;
    const block = sectionAt(html, `g${g.game_id}`);
    const c = (await q("select app.lottery_check(id, $2, $3::int[]) as c from clients where code = $1", [code, g.game_id, nums])).rows[0].c;
    const tl = `${label} lottery ${g.game}`;
    check(!LOTTO_WORDS.test(noNames(block)), `${tl}: no prize, odds or buying words`);
    if (c.error) {
      check(block.includes('class="err" role="alert"') && !block.includes('class="tile draw"'), `${tl}: a refusal is shown, with no comparison`, c.error);
    } else if (c.state === "stale") {
      check(block.includes('class="stale"') && !block.includes('class="tile draw"'), `${tl}: results not up to date say so, with no comparison`);
    } else {
      const chunks = block.split('<div class="tile draw"').slice(1);
      check(chunks.length === c.draws.length && chunks.every((ch, i) => attr(`<div${ch.slice(0, ch.indexOf(">") + 1)}`, "data-matched") === String(c.draws[i].matched_count)),
        `${tl}: every official draw of the week with the database's number of matches`, `${chunks.length} vs ${c.draws.length}`);
      check(chunks.every((ch, i) => {
        const d = c.draws[i];
        const want = g.match === "digits" ? (d.positions ?? []).filter(Boolean).length : d.numbers.filter((n) => nums.includes(Number(n))).length;
        return (ch.match(/<b class="hit">/g) ?? []).length === want;
      }), `${tl}: the matching official numbers are the ones highlighted`);
      if (g.match === "digits") {
        check(chunks.every((ch, i) => ch.includes('class="anyo"') === Boolean(c.draws[i].same_digits_any_order && !(c.draws[i].positions ?? []).every(Boolean))),
          `${tl}: "the same digits in another order" shows exactly when the database says so`);
      }
      check(chunks.every((ch) => /(Verificado|Verified): /.test(ch) && /href="https?:\/\//.test(ch)), `${tl}: every draw shows when it was verified and its source`);
    }
  }
  const takesMore = games[0];
  if (takesMore) {
    const html = (await send(`/mas/loteria?g=${takesMore.game_id}&n=${takesMore.max + 1}`, { cookie })).text;
    check(sectionAt(html, `g${takesMore.game_id}`).includes('class="err" role="alert"'), `${label}: numbers a game does not take are refused, saying what it takes`);
  }

  // Tu semana: every part exactly when week_summary has it.
  const wk = (await q("select app.week_summary(id) as w from clients where code = $1", [code])).rows[0].w;
  const semana = (await send("/mas/semana", { cookie })).text;
  // Early in the week: the last 7 stored rate days when the week has fewer than 3, and the latest current results when the week has none.
  const fx7 = (await q("select app.fx_history(id, 7) as h from clients where code = $1", [code])).rows[0].h;
  const weekRate = wk.rate && wk.rate.points.length >= 3 ? wk.rate : null;
  const rate7 = !weekRate && fx7?.latest && fx7.points.length ? fx7 : null;
  const notCurrent = new Set((await q("select g.name from lottery_games g join clients c on c.country = g.country where c.code = $1 and g.active and app.lottery_game_current(g.id, now()) is false", [code])).rows.map((r) => r.name));
  const lotLatest = wk.lottery ? null : lp.filter((g) => g.draws.length && !notCurrent.has(g.game));
  check(/Tasa · últimos 7 días|Rate · last 7 days/.test(semana) === Boolean(rate7) && !(weekRate && semana.includes('data-part="rate7"')),
    `${label} /mas/semana: "últimos 7 días" appears only when the week has fewer than 3 rate days`, `${wk.rate?.points.length ?? 0} points this week`);
  if (rate7) {
    const part = semana.slice(semana.indexOf('data-part="rate7"'), semana.indexOf("</section>", semana.indexOf('data-part="rate7"')));
    const rng = tag(part, "small", { class: "rng" });
    const from = fx7.points[0].date;
    check(attr(rng, "data-from") === from && attr(rng, "data-to") === fx7.latest.date && attr(tag(part, "span", { class: "hi" }), "data-d") === fx7.high.date
      && attr(tag(part, "span", { class: "lo" }), "data-d") === fx7.low.date && part.includes(`<b>${Number(fx7.latest.rate).toFixed(2)}</b>`),
      `${label} /mas/semana: the last-7-days card's dates, high and low are fx_history's`, `${attr(rng, "data-from")}..${attr(rng, "data-to")}`);
    check(tagsOf(part, "li", "wc [a-z]+").map((t) => attr(t, "data-d")).join() === fx7.week.filter((p) => p.date >= from).map((p) => p.date).join(),
      `${label} /mas/semana: the last-7-days circles are the stored days of that window`);
  }
  if (lotLatest?.length) {
    const part = semana.slice(semana.indexOf('data-part="lottery-latest"'), semana.indexOf("</section>", semana.indexOf('data-part="lottery-latest"')));
    const tiles = [...part.matchAll(/<div class="tile lottery"[^>]*>/g)].map((m) => `${attr(m[0], "data-game")}|${attr(m[0], "data-draw")}`);
    check(/(Lotería · últimos resultados|Lottery · latest results)<\/h2>/.test(part) && tiles.join() === lotLatest.map((g) => `${esc(g.game)}|${drawKey(g.draws[0])}`).join()
      && lotLatest.every((g) => g.draws[0].numbers.every((n) => part.includes(`<b>${n}</b>`))) && (part.match(/(Verificado|Verified): /g) ?? []).length === lotLatest.length,
      `${label} /mas/semana: with no result this week, each current game's latest official result, dated and verified`, tiles.join());
  }
  for (const [part, value] of [["opened", wk.opened], ["rate", weekRate], ["rate7", rate7], ["team", wk.team], ["weather", wk.weather],
                               ["badges", wk.badges?.length ? wk.badges : null], ["holidays", wk.holidays_ahead?.length ? wk.holidays_ahead : null],
                               ["lottery", wk.lottery?.length ? wk.lottery : null], ["lottery-latest", lotLatest?.length ? lotLatest : null]]) {
    check(semana.includes(`data-part="${part}"`) === Boolean(value), `${label} /mas/semana: "${part}" shows exactly when the week has it`);
  }
  if (wk.opened) {
    const opened = semana.slice(semana.indexOf('data-part="opened"'), semana.indexOf("</section>", semana.indexOf('data-part="opened"')));
    check(tagsOf(opened, "li", "wc [a-z]+").map((t) => attr(t, "data-open")).join() === wk.opened.weekdays.map((v) => (v === null ? "" : String(v))).join(),
      `${label} /mas/semana: the circles are the days opened, not opened and to come`);
  }
  if (weekRate) check(tagsOf(semana, "rect", "b( on)?").length === weekRate.points.length, `${label} /mas/semana: one bar per stored rate day this week`);
  if (wk.lottery) check(wk.lottery.every((l) => l.numbers.every((n) => semana.includes(`<b>${n}</b>`))), `${label} /mas/semana: the week's official numbers are shown`);
  if (wk.weather) {
    const wpart = semana.slice(semana.indexOf('data-part="weather"'));
    check(attr(tag(wpart, "span", { class: "hi" }), "data-t") === String(wk.weather.highest.temp_max) && attr(tag(wpart, "span", { class: "lo" }), "data-t") === String(wk.weather.lowest.temp_max)
      && wpart.includes(`${esc(wk.weather.label)}</h2>`), `${label} /mas/semana: the forecast's highest and lowest, labelled a forecast`);
  }
  const home = (await send("/", { cookie })).text;
  const teaser = /<a class="tile weekt"[^>]*>([\s\S]*?)<\/a>/.exec(home);
  check(Boolean(teaser) === Boolean(wk.opened), `${label}: home's "Tu semana" shows exactly when the week has opened days`);
  if (teaser) check([...teaser[1].matchAll(/<i class="([a-z]+)"/g)].map((m) => m[1]).join() === wk.opened.weekdays.map((v) => (v === true ? "up" : v === false ? "no" : "nd")).join(),
    `${label}: home's "Tu semana" dots are the week's days`);

  // Galería: each town's photos 2-6 exactly, each credited as town_gallery says; unknown ranks are 404.
  const clima = (await send("/clima", { cookie })).text;
  for (const id of [...clima.matchAll(/<section id="t(\d+)"/g)].map((m) => m[1])) {
    const strip = ((await q("select app.town_gallery($1::bigint) as g", [id])).rows[0].g ?? []).filter((p) => p.rank > 1);
    const shownRanks = [...clima.matchAll(new RegExp(`src="/photo/${id}/(\\d)"`, "g"))].map((m) => Number(m[1]));
    check(shownRanks.join() === strip.map((p) => p.rank).join(), `${label} /clima: town ${id} shows exactly its gallery photos`, `${shownRanks} vs ${strip.map((p) => p.rank)}`);
    for (const p of strip) {
      const credit = new RegExp(`<small class="credit" data-photo="${id}/${p.rank}">([\\s\\S]*?)</small>`).exec(clima)?.[1] ?? "";
      check(credit.includes(`>${esc(p.author)}<`) && credit.includes(`href="${esc(p.source_page_url)}"`) && credit.includes(esc(p.license)),
        `${label} /clima: gallery photo ${id}/${p.rank} carries its own credit`);
    }
    const missing = [2, 3, 4, 5, 6].find((r) => !strip.some((p) => p.rank === r));
    if (missing) {
      const r = await send(`/photo/${id}/${missing}`);
      check(r.status === 404 && r.headers["x-content-type-options"] === "nosniff", `/photo/${id}/${missing} (no such photo) is 404`, String(r.status));
    }
  }
  check((await send("/photo/1/9")).status === 404 && (await send("/photo/abc/2")).status === 404, "a gallery rank that cannot exist is 404");
  const hero = /<div class="ht">(<a [^>]*>)/.exec(home)?.[1];
  check(!home.includes('<div class="ht">') || /href="\/clima#t\d+"/.test(hero ?? ""), `${label}: the home photo opens the town's photos on Clima`);
}

// "Ahora" (0040): shown only with a temperature and an observation time, the
// temperature as the data wrote it (a range stays a range), the picture of the
// sky it reports, and its own validity (at most 90 minutes after observing).
const NOW_ART = (cond, day) => cond === "clear" ? (day === "0" ? "moon" : "sun")
  : cond === "partly_cloudy" ? (day === "0" ? "partly-night" : "partly-day")
  : ["fog", "drizzle", "rain", "storm", "snow"].includes(cond) ? cond : "cloud";
function ahora(html, label, { time = false } = {}) {
  const blocks = [...html.matchAll(/<(div|span) class="ahora[^"]*" data-line="[^"]+" data-until="([^"]*)" data-temp="([^"]*)" data-at="([^"]*)" data-cond="([^"]*)" data-day="([^"]*)">/g)];
  const words = (html.match(/>(Ahora|Now)</g) ?? []).length;
  const marked = (html.match(/<b class="aw">(Ahora|Now)<\/b>/g) ?? []).length;
  check(words === blocks.length && marked === blocks.length, `${label}: "Ahora" appears only inside a current-conditions block`, `${words} words, ${marked} marked, ${blocks.length} blocks`);
  const at = Date.now();
  for (const b of blocks) {
    const [whole, , until, temp, observed, cond, day] = b;
    const rest = html.slice(b.index + whole.length);
    const body = rest.slice(0, Math.min(...[rest.indexOf('class="fc"'), rest.indexOf('class="ahora'), 2500].filter((i) => i >= 0)));
    const tag = `${label}: "Ahora" ${temp}`;
    check(/^-?\d+°$|^-?\d+–-?\d+°$/.test(temp) && Number.isFinite(Date.parse(observed)) && Date.parse(observed) <= at + 10 * 60_000,
      `${tag} has a temperature and an observed time`, `${temp} ${observed}`);
    check(body.includes(`>${temp}<`) && (!temp.includes("–") || !/class="cu"/.test(body.slice(0, body.indexOf(`>${temp}<`)))),
      `${tag} shows the temperature as the data wrote it (a range stays a range)`);
    check(Number.isFinite(Date.parse(until)) && Date.parse(until) > at && Date.parse(until) - Date.parse(observed) <= 90 * 60_000 + 1000,
      `${tag} carries its validity`, `${observed} -> ${until}`);
    const art = /src="\/art\/([a-z-]+)\.svg/.exec(body)?.[1];
    check(art === NOW_ART(cond, day), `${tag}: the picture matches the sky (${cond || "none"}, ${day === "0" ? "night" : "day"})`, String(art));
    if (time) check(/(a las|at) \d{1,2}(:\d{2})?(am|pm)/.test(body), `${tag} says when it was observed`);
  }
  return blocks.length;
}

// Fútbol and Clima (0036): a score only on a finished match, form and goals only
// with results, no empty next-match shell, the league named even without a logo,
// Canada's places only with a forecast, sunrise and sunset only for places with
// coordinates, and home's "Leamington hoy" exactly when Clima has it.
async function richer(cookie, label) {
  const [futbol, clima, home] = await Promise.all(["/futbol", "/clima", "/"].map(async (p) => (await send(p, { cookie })).text));
  const rows = [...futbol.matchAll(/<li class="fx">([\s\S]*?)<\/li>/g)].map((m) => m[1]);
  check(rows.every((r) => /class="sc"/.test(r) !== /class="chip"/.test(r)), `${label}: every match row shows a final score or a kickoff chip, never both`);
  const next = /<section class="card match nx">([\s\S]*?)<\/section>/.exec(futbol)?.[1] ?? "";
  check(!/class="score"|class="sc"|\d+–\d+/.test(next), `${label}: the next match shows no score`);
  check(!/Próximo partido|Next match/.test(futbol) || Boolean(next), `${label}: no next-match heading without a match`);
  const hasResults = /<section class="card match res [WDL]"/.test(futbol);
  check(!futbol.includes('class="form"') || hasResults, `${label}: form chips show only with results`);
  check(!futbol.includes('class="stats"') || hasResults, `${label}: goal stats show only with results`);
  check([...futbol.matchAll(/<section class="card match res [WDL]"[^>]*>([\s\S]*?)<\/section>/g)].every((m) => /class="score">\d+–\d+</.test(m[1])),
    `${label}: every result card has its final score`);
  check(!/sin partidos|no hay partidos|no matches|sin datos|no data/i.test(visible(futbol)), `${label}: Fútbol never says there is nothing`);
  check([...futbol.matchAll(/<section class="card grp">(<header>[\s\S]*?<\/header>)/g)].every((m) => /<h3>[^<]+<\/h3>/.test(m[1])),
    `${label}: every league group names its league, with or without a logo`);
  const aqui = /<section id="aqui">([\s\S]*?)<\/section>/.exec(clima)?.[1];
  if (aqui) {
    const cards = (aqui.match(/class="card here/g) ?? []).length;
    check(cards > 0 && cards === (aqui.match(/class="tp"/g) ?? []).length, `${label}: every place in "Aquí en Canadá" has today's forecast`);
  }
  const places = clima.split(/(?=<section |<div class="card here)/);
  check(places.filter((p) => p.includes('class="sky')).every((p) => /data-lat="-?\d/.test(p.slice(0, 240))),
    `${label}: sunrise and sunset only for places with coordinates`);
  // A town is shown only with something current: today's forecast card, or "Ahora" (0040). Never an empty section.
  check(places.filter((p) => /^<section id="t\d+"/.test(p)).every((p) => p.includes('class="card now') || p.includes('class="ahora card"')),
    `${label}: every town shown has today's card or its weather now`);
  const leamingtonCard = /<div class="card here[^"]*"[^>]*><b class="nm">Leamington<\/b>([\s\S]*?)<\/div><\/div>/.exec(clima)?.[1] ?? "";
  const leamington = leamingtonCard.includes('class="tp"');
  check(home.includes('data-line="local"') === leamington, `${label}: "Leamington hoy" is on home exactly when Clima has Leamington's forecast`);

  // "Ahora" on both pages, and on home exactly where Clima has it.
  ahora(clima, `${label} /clima`, { time: true });
  ahora(home, `${label} /`);
  check(home.includes('data-line="leamington-now"') === leamingtonCard.includes('class="ahora in"'),
    `${label}: Leamington's "Ahora" is on home exactly when Clima has it`);
  const townNow = [...clima.matchAll(/<section id="t(\d+)"[^>]*>([\s\S]*?)<\/section>/g)]
    .map((m) => ({ id: m[1], home: m[2].includes('class="chip"'), now: m[2].includes('class="ahora card"') }));
  const homeTown = townNow.find((x) => x.home);
  check(!homeTown || home.includes('data-line="home-now"') === homeTown.now, `${label}: the home town's "Ahora" is on home exactly when Clima has it`);
  const watchNow = [...home.matchAll(/<a class="town" href="\/clima#t(\d+)">([\s\S]*?)<\/a>/g)].map((m) => ({ id: m[1], now: m[2].includes('data-line="watch-now"') }));
  check(watchNow.every((w) => w.now === Boolean(townNow.find((x) => x.id === w.id)?.now)), `${label}: each watched town's "Ahora" is on home exactly when Clima has it`);
  check(/<script>[^<]*data-until/.test(clima), `${label}: Clima drops anything past its data-until on an open or restored page`);
  await images(futbol, `${label} /futbol (richer)`);
  await images(clima, `${label} /clima (richer)`);
}

// Signed out.
const anon = await send("/clima");
check(anon.status === 307 && anon.location.includes("/login"), "signed out, a section redirects to /login", `${anon.status} ${anon.location}`);
const signin = await send("/login");
check(signin.status === 200, "/login 200");
await images(signin.text, "/login");
const health = await send("/health");
check(health.status === 200 && JSON.parse(health.text).status === "ok", "/health reports ok", health.text);

// Sign in.
const login = await send("/api/login", { method: "POST", form: { code: CODE } });
check(login.status === 303 && Boolean(login.cookie), "the code signs in", `${login.status} ${login.location}`);
const cookie = login.cookie;
await welcome(cookie, CODE, CODE);

for (const path of ["/", "/futbol", "/clima/aqui", "/mas", "/mas/miembro", "/mas/semana", "/mas/tasa", "/mas/feriados", "/mas/escuela", "/mas/consulado",
  "/mas/emergencias", "/mas/transporte", "/mas/loteria", "/mas/avisos", "/noticias", "/noticias?s=national", "/futbol/videos", "/futbol/videos?s=league",
  "/setup/municipality?edit=1", "/setup/watch?edit=1", "/setup/segment?edit=1", "/setup/kids?edit=1", "/setup/corridor?edit=1"]) {
  await page(path, cookie);
}

await extras(cookie, CODE);
await more(cookie, CODE);
await arrival(cookie, CODE, CODE);
await round2(cookie, CODE, CODE);
await money(cookie, CODE, CODE);
await workday(cookie, CODE, CODE);
await round5(cookie, CODE, CODE);
await news(cookie, CODE, CODE);
await videos(cookie, CODE, CODE);
await teamVisuals(cookie, CODE);
await richer(cookie, CODE);
for (const path of ["/crest/999999999999", "/crest/abc", "/photo/999999999999", "/photo/abc", "/league-crest/999999999999", "/league-crest/abc"]) {
  const r = await send(path);
  check(r.status === 404 && r.headers["x-content-type-options"] === "nosniff", `${path} is 404`, String(r.status));
}

const clima = await page("/clima", cookie);
check(/Revisamos los avisos|We checked .* warnings|No hemos podido revisar|We have not been able to check|todavía no recibe|does not receive/.test(clima),
  "/clima says when warnings were checked, that it could not, or that they are not received");
tabs(clima, "/clima", "/clima");

// Search is accent-insensitive and partial, in the signed-in client's own country
// (Más names it by flag: "CAD → 🇭🇳").
const SEARCH = { "🇯🇲": "MONTEGO", "🇭🇳": "CEIBA", "🇲🇽": "URUAPAN", "🇬🇹": "HUEHUE" };
const flag = /CAD → (🇯🇲|🇭🇳|🇲🇽|🇬🇹)/.exec((await send("/mas", { cookie })).text)?.[1];
check(Boolean(flag), "Más names the client's country for the search check", String(flag));
const search = await send(`/setup/municipality?edit=1&q=${encodeURIComponent(SEARCH[flag] ?? "MONTEGO")}`, { cookie });
check(/name="municipality_id"/.test(search.text), `municipality search finds a partial, differently-cased name (${SEARCH[flag]})`);

// Letra grande (0040): a saved size changes the next page's <html>; foreign
// origins and unknown values are refused and change nothing.
{
  const html = async (path = "/mas") => (await send(path, { cookie })).text;
  const isBig = (text) => /<html[^>]*\bclass="big"/.test(text);
  const large = await send("/api/text-size", { method: "POST", cookie, form: { size: "large" } });
  check(large.status === 303 && large.location.startsWith("/mas"), "choosing Grande saves and returns to Más", `${large.status} ${large.location}`);
  const masBig = await html();
  check(isBig(masBig), 'after Grande, the next page has <html class="big">');
  check(isBig(await html("/")) && isBig(await html("/clima")), "Grande applies on home and Clima too");
  check(/value="large" class="on" aria-pressed="true"/.test(masBig) && /value="normal" class="secondary" aria-pressed="false"/.test(masBig),
    "Más marks Grande as the current size");
  const foreign = await send("/api/text-size", { method: "POST", cookie, origin: "https://evil.example", form: { size: "normal" } });
  check(foreign.status === 403 && isBig(await html()), "a cross-origin text-size post is refused and changes nothing", String(foreign.status));
  const bad = await send("/api/text-size", { method: "POST", cookie, form: { size: "huge" } });
  check(bad.status === 400 && isBig(await html()), "an unknown text size is refused and changes nothing", String(bad.status));
  const anonSize = await send("/api/text-size", { method: "POST", form: { size: "large" } });
  check(anonSize.status === 303 && anonSize.location === "/login", "a text-size post without a session goes to sign-in", anonSize.location);
  const normal = await send("/api/text-size", { method: "POST", cookie, form: { size: "normal" } });
  const masNormal = await html();
  check(normal.status === 303 && !isBig(masNormal) && !isBig(await html("/")), 'after Normal, <html class="big"> is gone');
  check(/value="normal" class="on" aria-pressed="true"/.test(masNormal), "Más marks Normal as the current size");
}

// Push API guards.
check((await send("/api/push", { method: "POST", cookie, json: { action: "subscribe", subscription: { endpoint: "http://x" } } })).status === 400,
  "a malformed push subscription is refused");
check((await send("/api/push", { method: "POST", cookie, origin: "https://evil.example", json: { action: "unsubscribe", endpoint: "x" } })).status === 403,
  "a cross-origin push request is refused");
check((await send("/api/push", { method: "POST", json: { action: "unsubscribe", endpoint: "x" } })).status === 401,
  "a push request without a session is refused");
check((await send("/api/setup", { method: "POST", cookie, origin: "https://evil.example", form: { step: "kids", has_kids: "yes" } })).status === 403,
  "a cross-origin setup post is refused");

// Setup, start to finish, for a client who has not done it.
if (process.env.SETUP_CODE) {
  const s = await send("/api/login", { method: "POST", form: { code: process.env.SETUP_CODE } });
  check(s.status === 303 && s.location.startsWith("/setup/"), "a client with unanswered setup goes to setup at sign-in", s.location);
  const c = s.cookie;
  const q = process.env.SETUP_QUERY ?? "ceiba";
  const found = await send(`/setup/municipality?q=${encodeURIComponent(q)}`, { cookie: c });
  // React may write value before name.
  const id = (/<button[^>]*value="(\d+)"[^>]*name="municipality_id"/.exec(found.text)
    ?? /<button[^>]*name="municipality_id"[^>]*value="(\d+)"/.exec(found.text))?.[1];
  check(Boolean(id), `searching "${q}" offers towns`);
  const picked = await send("/api/setup", { method: "POST", cookie: c, form: { step: "municipality", municipality_id: id ?? "" } });
  check(picked.status === 303 && picked.location === "/setup/watch", "choosing a town moves to the next step", picked.location);
  const skipped = await send("/api/setup", { method: "POST", cookie: c, form: { step: "watch", action: "skip" } });
  check(skipped.location === "/setup/segment", "skipping moves on", skipped.location);
  const past = await send("/api/setup", { method: "POST", cookie: c, form: { step: "segment", segment: "seasonal", date: "2020-01-01" } });
  check(past.location === "/setup/segment?e=date", "a past date is refused with a reason", past.location);
  await send("/api/setup", { method: "POST", cookie: c, form: { step: "segment", segment: "settled", date: "" } });
  await send("/api/setup", { method: "POST", cookie: c, form: { step: "kids", has_kids: "yes" } });
  const done = await send("/api/setup", { method: "POST", cookie: c, form: { step: "corridor" } });
  check(done.location === "/", "the last step goes home", done.location);
  const again = await send("/api/login", { method: "POST", form: { code: process.env.SETUP_CODE } });
  check(again.location === "/", "after setup, sign-in goes home", again.location);
  const mas = await send("/mas", { cookie: c });
  check(mas.text.indexOf("/mas/escuela") < mas.text.indexOf("/mas/tasa"), "a parent sees the school calendar first in Más");
  await extras(c, process.env.SETUP_CODE);
  await more(c, process.env.SETUP_CODE);
  await richer(c, process.env.SETUP_CODE);
  await teamVisuals(c, process.env.SETUP_CODE);
}

// A client whose team has a stored crest (optional): it is shown as an image
// from our own domain, and served as one.
if (process.env.CREST_CODE) {
  const k = await send("/api/login", { method: "POST", form: { code: process.env.CREST_CODE } });
  check(k.status === 303 && Boolean(k.cookie), `${process.env.CREST_CODE} signs in`, `${k.status} ${k.location}`);
  await welcome(k.cookie, process.env.CREST_CODE, process.env.CREST_CODE);
  check(await teamVisuals(k.cookie, process.env.CREST_CODE) > 0, `${process.env.CREST_CODE}: a team with a stored crest shows it as an image`);
  await extras(k.cookie, process.env.CREST_CODE);
  await more(k.cookie, process.env.CREST_CODE);
  await richer(k.cookie, process.env.CREST_CODE);
  await arrival(k.cookie, process.env.CREST_CODE, process.env.CREST_CODE);
  await round2(k.cookie, process.env.CREST_CODE, process.env.CREST_CODE);
  await money(k.cookie, process.env.CREST_CODE, process.env.CREST_CODE);
  await workday(k.cookie, process.env.CREST_CODE, process.env.CREST_CODE);
  await round5(k.cookie, process.env.CREST_CODE, process.env.CREST_CODE);
}

// A client whose paid period has ended: the expiry screen, and only the
// official weather warnings stay open.
if (process.env.EXPIRED_CODE) {
  const x = await send("/api/login", { method: "POST", form: { code: process.env.EXPIRED_CODE } });
  check(x.status === 303 && Boolean(x.cookie), "a lapsed client can still sign in", `${x.status} ${x.location}`);
  const home = await page("/", x.cookie, "/ (expired)");
  check(!home.includes('<main class="welcome'), "the expiry screen wins over the welcome screen");
  const pretty = `${process.env.EXPIRED_CODE.slice(0, 4)}-${process.env.EXPIRED_CODE.slice(4)}`;
  check(home.includes(`class="code">${pretty}<`), "the expiry screen shows the code prominently");
  check(/Cualquier afiliado de Hoy puede reactivarla|Any Hoy affiliate can reactivate it/.test(home), "the expiry screen says any affiliate can reactivate");
  check(/Te registró|Registered by|registered by Hoy directly|Te registró Hoy directamente/.test(home), "the expiry screen names who registered them");
  check(!home.includes('data-line="greeting"') && !home.includes('<nav class="tabs"'), "no morning message and no tab bar while expired");
  for (const path of ["/futbol", "/mas", "/mas/tasa", "/setup/municipality"]) {
    const r = await send(path, { cookie: x.cookie });
    check(r.status === 307 && r.location.endsWith("/"), `${path} sends a lapsed client to the expiry screen`, `${r.status} ${r.location}`);
  }
  await page("/clima", x.cookie, "/clima (expired)");
  await page("/mas/avisos", x.cookie, "/mas/avisos (expired)");
}

await DB?.end();
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
