// End-to-end smoke test of Hoy against a running server and a local database.
//
//   BASE=http://localhost:3100 CODE=TEZTJM24 SETUP_CODE=DEMXHN42 SETUP_QUERY=ceiba node scripts/smoke.mjs
//
// CODE signs in and visits every page. SETUP_CODE (optional) walks the setup
// flow: search, choose a town, skip, answer, finish. It changes that client.
import http from "node:http";

const BASE = new URL(process.env.BASE ?? "http://localhost:3100");
const CODE = process.env.CODE;
if (!CODE) { console.error("set CODE to a client code"); process.exit(2); }

let failures = 0;
const check = (ok, label, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${!ok && detail ? ` -- ${detail}` : ""}`);
  if (!ok) failures++;
};

function send(path, { method = "GET", cookie, form, json, origin } = {}) {
  const body = form ? new URLSearchParams(form).toString() : json ? JSON.stringify(json) : null;
  return new Promise((resolve, reject) => {
    const headers = { accept: "text/html,*/*" };
    if (cookie) headers.cookie = cookie;
    if (origin) headers.origin = origin;
    if (body != null) {
      headers["content-type"] = form ? "application/x-www-form-urlencoded" : "application/json";
      headers["content-length"] = Buffer.byteLength(body);
    }
    const req = http.request({ host: BASE.hostname, port: BASE.port, path, method, headers }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({
        status: res.statusCode, location: res.headers.location ?? "", text: Buffer.concat(chunks).toString(),
        cookie: res.headers["set-cookie"]?.[0]?.split(";")[0],
      }));
    });
    req.on("error", reject);
    if (body != null) req.write(body);
    req.end();
  });
}

// Words that would turn silence into reassurance, or show a placeholder.
const FORBIDDEN = [/sin avisos/i, /no alerts/i, /no hay (alertas|avisos|partidos)/i, /no matches/i, /all clear/i, /cargando/i, /loading/i];

async function page(path, cookie, label = path) {
  const r = await send(path, { cookie });
  check(r.status === 200, `${label} 200`, `got ${r.status} ${r.location}`);
  check(!/<script[^>]+src=/i.test(r.text) && !r.text.includes("/_next/"), `${label} ships no framework JS`);
  const bad = FORBIDDEN.find((re) => re.test(r.text.replace(/<script[\s\S]*?<\/script>/g, "")));
  check(!bad, `${label} has no reassurance-from-silence or placeholder text`, String(bad));
  return r.text;
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
}

console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
