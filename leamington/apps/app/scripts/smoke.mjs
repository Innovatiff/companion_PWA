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

const BASE = new URL(process.env.BASE ?? "http://localhost:3100");
const client = BASE.protocol === "https:" ? https : http;
const CODE = process.env.CODE;
if (!CODE) { console.error("set CODE to a client code"); process.exit(2); }

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
  return r.text;
}

// Images come only from our own domain: team crests (each at most 50 KB, lazy),
// league logos (at most 150 KB, lazy) and town photos (each at most 120 KB,
// always with a credit on the same page).
// All sized, all cached for 30 days with an ETag, nosniff, and a 304 on the ETag.
const imagesChecked = new Set();
async function images(html, label) {
  const imgs = [...html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
  check(imgs.every((i) => /src="\/(crest|photo|league-crest)\/\d+"/.test(i) && /width="\d+"/.test(i) && /height="\d+"/.test(i) && / alt=""/.test(i)),
    `${label}: every image is a crest or a town photo from our own domain, sized`, imgs.join(" "));
  check(imgs.filter((i) => /src="\/(crest|league-crest)\//.test(i)).every((i) => / loading="lazy"/.test(i)), `${label}: crests and league logos load lazily`);
  const photos = new Set(imgs.map((i) => /src="\/photo\/(\d+)"/.exec(i)?.[1]).filter(Boolean));
  const credited = new Set([...html.matchAll(/<small class="credit" data-photo="(\d+)">([\s\S]*?)<\/small>/g)]
    .filter((m) => /<a href="https?:\/\/[^"]+"[^>]*>[^<]+<\/a>/.test(m[2]) && /· /.test(m[2])).map((m) => m[1]));
  check([...photos].every((id) => credited.has(id)), `${label}: every town photo shown has its credit (author, linked, and license)`,
    `photos ${[...photos]} credited ${[...credited]}`);
  for (const i of imgs) {
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
  check(places.filter((p) => /^<section id="t\d+"/.test(p)).every((p) => p.includes('class="card now')), `${label}: every town shown has today's card`);
  const leamington = /<div class="card here[^"]*"[^>]*><b class="nm">Leamington<\/b>/.test(clima);
  check(home.includes('data-line="local"') === leamington, `${label}: "Leamington hoy" is on home exactly when Clima has Leamington's forecast`);
  await images(futbol, `${label} /futbol (richer)`);
  await images(clima, `${label} /clima (richer)`);
}

// Signed out.
const anon = await send("/clima");
check(anon.status === 307 && anon.location.includes("/login"), "signed out, a section redirects to /login", `${anon.status} ${anon.location}`);
const health = await send("/health");
check(health.status === 200 && JSON.parse(health.text).status === "ok", "/health reports ok", health.text);

// Sign in.
const login = await send("/api/login", { method: "POST", form: { code: CODE } });
check(login.status === 303 && Boolean(login.cookie), "the code signs in", `${login.status} ${login.location}`);
const cookie = login.cookie;

for (const path of ["/", "/futbol", "/mas", "/mas/tasa", "/mas/feriados", "/mas/escuela", "/mas/consulado",
  "/mas/emergencias", "/mas/transporte", "/mas/loteria", "/mas/avisos",
  "/setup/municipality?edit=1", "/setup/watch?edit=1", "/setup/segment?edit=1", "/setup/kids?edit=1", "/setup/corridor?edit=1"]) {
  await page(path, cookie);
}

await extras(cookie, CODE);
await more(cookie, CODE);
await teamVisuals(cookie, CODE);
await richer(cookie, CODE);
for (const path of ["/crest/999999999999", "/crest/abc", "/photo/999999999999", "/photo/abc", "/league-crest/999999999999", "/league-crest/abc"]) {
  const r = await send(path);
  check(r.status === 404 && r.headers["x-content-type-options"] === "nosniff", `${path} is 404`, String(r.status));
}

const clima = await page("/clima", cookie);
check(/Revisamos los avisos|We checked .* warnings|No hemos podido revisar|We have not been able to check|todavía no recibe|does not receive/.test(clima),
  "/clima says when warnings were checked, that it could not, or that they are not received");
check(/<nav class="tabs"/.test(clima) && (clima.match(/<a [^>]*href="\/(futbol|clima|mas)?"/g) ?? []).length >= 4, "/clima has the 4-item tab bar");

// Search is accent-insensitive and partial.
const search = await send("/setup/municipality?edit=1&q=MONTEGO", { cookie });
check(/name="municipality_id"/.test(search.text), "municipality search finds a partial, differently-cased name");

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
  check(await teamVisuals(k.cookie, process.env.CREST_CODE) > 0, `${process.env.CREST_CODE}: a team with a stored crest shows it as an image`);
  await extras(k.cookie, process.env.CREST_CODE);
  await more(k.cookie, process.env.CREST_CODE);
  await richer(k.cookie, process.env.CREST_CODE);
}

// A client whose paid period has ended: the expiry screen, and only the
// official weather warnings stay open.
if (process.env.EXPIRED_CODE) {
  const x = await send("/api/login", { method: "POST", form: { code: process.env.EXPIRED_CODE } });
  check(x.status === 303 && Boolean(x.cookie), "a lapsed client can still sign in", `${x.status} ${x.location}`);
  const home = await page("/", x.cookie, "/ (expired)");
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

console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
