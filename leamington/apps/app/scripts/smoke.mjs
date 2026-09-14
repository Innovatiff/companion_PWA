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
    tabs(r.text, label, path === "/" ? "/" : path.startsWith("/mas/tasa") ? "/mas/tasa" : path.startsWith("/mas") ? "/mas" : path);
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
  check(imgs.every((i) => (/src="\/(crest|photo|league-crest)\/\d+"/.test(i) || ART_SRC.test(i)) && /width="\d+"/.test(i) && /height="\d+"/.test(i) && / alt=""/.test(i)),
    `${label}: every image is a crest, a town photo or an illustration from our own domain, sized`, imgs.join(" "));
  check(imgs.filter((i) => /src="\/(crest|league-crest)\//.test(i)).every((i) => / loading="lazy"/.test(i)), `${label}: crests and league logos load lazily`);
  const photos = new Set(imgs.map((i) => /src="\/photo\/(\d+)"/.exec(i)?.[1]).filter(Boolean));
  const credited = new Set([...html.matchAll(/<small class="credit" data-photo="(\d+)">([\s\S]*?)<\/small>/g)]
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
    const [, kind, id] = /src="\/(crest|photo|league-crest)\/(\d+)"/.exec(i) ?? [];
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
  check((home.match(/ data-line="/g) ?? []).length === (home.match(/ data-until="\d{4}-\d{2}-\d{2}T/g) ?? []).length,
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
  const watched = [...home.matchAll(/href="\/clima#t(\d+)"/g)].map((m) => m[1]);
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

for (const path of ["/", "/futbol", "/mas", "/mas/miembro", "/mas/tasa", "/mas/feriados", "/mas/escuela", "/mas/consulado",
  "/mas/emergencias", "/mas/transporte", "/mas/loteria", "/mas/avisos",
  "/setup/municipality?edit=1", "/setup/watch?edit=1", "/setup/segment?edit=1", "/setup/kids?edit=1", "/setup/corridor?edit=1"]) {
  await page(path, cookie);
}

await extras(cookie, CODE);
await more(cookie, CODE);
await arrival(cookie, CODE, CODE);
await round2(cookie, CODE, CODE);
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
