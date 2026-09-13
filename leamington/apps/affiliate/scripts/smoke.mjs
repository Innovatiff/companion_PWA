// End-to-end smoke run against a running affiliate portal (`next start`).
//
//   setup -> login -> register a JM and an MX client -> code page -> clients
//   list -> earnings -> logout, and affiliate B cannot see A's clients or code
//   pages (row-level security, through the running app).
//
// LOCAL ONLY: it sets passwords and records real $20 sales. It refuses a
// non-local BASE.
//
//   eval "$(psql -At -F ' ' -f scripts/local-accounts.sql leamington_affiliate |
//           awk '{print "export SETUP_TOKEN_" toupper($1) "=" $2}')"
//   BASE=http://localhost:3200 LOGIN_A=ana SETUP_TOKEN_A=$SETUP_TOKEN_ANA \
//     LOGIN_B=beto SETUP_TOKEN_B=$SETUP_TOKEN_BETO node scripts/smoke.mjs
//
// Without SETUP_TOKEN_A/B the accounts are assumed set up already, with
// PASSWORD_A/PASSWORD_B.
import http from "node:http";

const BASE = new URL(process.env.BASE ?? "http://localhost:3200");
if (!["localhost", "127.0.0.1", "[::1]"].includes(BASE.hostname)) {
  console.error(`REFUSING: ${BASE.origin} is not local. This script records sales.`);
  process.exit(2);
}
const A = { login: process.env.LOGIN_A ?? "ana", token: process.env.SETUP_TOKEN_A, password: process.env.PASSWORD_A ?? "ana-local-password-1" };
const B = { login: process.env.LOGIN_B ?? "beto", token: process.env.SETUP_TOKEN_B, password: process.env.PASSWORD_B ?? "beto-local-password-1" };
const RUN = Date.now().toString(36);
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

let failures = 0;
function check(name, ok, detail = "") {
  if (ok) console.log(`PASS ${name}`);
  else { failures++; console.log(`FAIL ${name}${detail ? `\n     ${String(detail).slice(0, 400)}` : ""}`); }
  return ok;
}

function send(path, { method = "GET", cookie, form, origin } = {}) {
  const body = form ? new URLSearchParams(form).toString() : null;
  return new Promise((resolve, reject) => {
    const headers = { accept: "text/html,*/*" };
    if (cookie) headers.cookie = cookie;
    if (origin) headers.origin = origin;
    if (body != null) {
      headers["content-type"] = "application/x-www-form-urlencoded";
      headers["content-length"] = Buffer.byteLength(body);
    }
    const req = http.request({ host: BASE.hostname, port: BASE.port, path, method, headers }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({
        status: res.statusCode, location: res.headers.location ?? "", text: Buffer.concat(chunks).toString(),
        setCookie: res.headers["set-cookie"] ?? [],
      }));
    });
    req.on("error", reject);
    if (body != null) req.write(body);
    req.end();
  });
}

const htmlPages = [];
function page(label, r) {
  if (r.status === 200 && /<html/i.test(r.text)) htmlPages.push([label, r.text]);
  return r;
}
const get = async (path, cookie) => page(`GET ${path}`, await send(path, { cookie }));
const post = (path, form, cookie, origin) => send(path, { method: "POST", form, cookie, origin });

function options(html, id) {
  const select = new RegExp(`<select[^>]*id="${id}"[^>]*>([\\s\\S]*?)</select>`).exec(html)?.[1] ?? "";
  return [...select.matchAll(/<option[^>]*value="([^"]*)"[^>]*>([^<]*)</g)].map((m) => ({ value: decode(m[1]), label: decode(m[2]), selected: /selected/.test(m[0]) }));
}
const decode = (s) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const escapeHtml = (s) => s.replace(/&/g, "&amp;");

// ---------------------------------------------------------------------------
let r = await send("/health");
check("/health answers ok from the database", r.status === 200 && JSON.parse(r.text).status === "ok" && JSON.parse(r.text).surface === "affiliate", r.text);

r = await send("/");
check("signed out, / redirects to /login", [302, 307].includes(r.status) && r.location.endsWith("/login"), `${r.status} ${r.location}`);
r = await get("/login");
check("/login is a plain form", r.status === 200 && /<form(?=[^>]*\baction="\/api\/login")(?=[^>]*\bmethod="post")[^>]*>/.test(r.text));

async function signInAs(who, { tryWrongPassword }) {
  if (who.token) {
    r = await post("/api/login", { login: who.login, password: who.password });
    check(`${who.login}: sign-in before setup says setup_required`, r.status === 303 && r.location.includes("e=setup_required"), r.location);

    r = await get(`/setup?token=${who.token}`);
    check(`${who.login}: /setup shows the password form`, r.status === 200 && /action="\/api\/setup"/.test(r.text));
    r = await post("/api/setup", { token: who.token, password: "short", password2: "short" });
    check(`${who.login}: a short password is weak_password`, r.location.includes("e=weak_password"), r.location);
    r = await get(r.location);
    check(`${who.login}: the weak password message is shown`, /class="err"/.test(r.text));
    r = await post("/api/setup", { token: who.token, password: who.password, password2: who.password + "x" });
    check(`${who.login}: two different passwords are refused`, r.location.includes("e=mismatch"), r.location);
    r = await post("/api/setup", { token: "not-the-token", password: who.password, password2: who.password });
    check(`${who.login}: a wrong token is invalid_token`, r.location.includes("e=invalid_token"), r.location);
    r = await post("/api/setup", { token: who.token, password: who.password, password2: who.password }, null, "http://evil.example");
    check(`${who.login}: setup from another origin is refused`, r.status === 403, r.status);
    r = await post("/api/setup", { token: who.token, password: who.password, password2: who.password });
    check(`${who.login}: setup succeeds and goes to /login with a message`, r.status === 303 && r.location.startsWith("/login?ok=setup"), r.location);
    r = await get(r.location);
    check(`${who.login}: /login shows the success message and the login name`, /class="ok"/.test(r.text) && r.text.includes(`value="${who.login}"`));
    r = await post("/api/setup", { token: who.token, password: who.password, password2: who.password });
    check(`${who.login}: the setup link works once`, r.location.includes("e=invalid_token"), r.location);
  }
  if (tryWrongPassword) {
    r = await post("/api/login", { login: who.login, password: "definitely-wrong-password" });
    check(`${who.login}: a wrong password is invalid`, r.status === 303 && r.location.includes("e=invalid"), r.location);
    r = await post("/api/login", { login: who.login, password: who.password }, null, "http://evil.example");
    check(`${who.login}: sign-in from another origin is refused`, r.status === 403, r.status);
  }
  r = await post("/api/login", { login: who.login, password: who.password });
  const cookie = r.setCookie.find((c) => c.startsWith("la="))?.split(";")[0];
  check(`${who.login}: signs in, 303 to /, HttpOnly cookie`, r.status === 303 && r.location === "/" && Boolean(cookie)
    && r.setCookie.some((c) => /HttpOnly/.test(c) && /SameSite=Lax/.test(c)), `${r.status} ${r.location} ${r.setCookie}`);
  if (!cookie) { console.log("cannot continue without a session"); process.exit(1); }
  return cookie;
}

async function registerClient(cookie, country, name, { teamPick = "none" } = {}) {
  r = await get(`/register?country=${country}`, cookie);
  const regions = options(r.text, "region").filter((o) => o.value);
  const teams = options(r.text, "team").filter((o) => o.value);
  const region = country === "JM" ? (regions.find((o) => o.value === "St. James") ?? regions[0]) : regions[0];
  let team = "";
  if (teams.length) team = teamPick === "first-real" ? (teams.find((o) => o.value !== "none") ?? teams[0]).value : "none";
  r = await post("/api/register", { country, name, region: region?.value ?? "", team }, cookie);
  const m = new RegExp(`^/clients/(${UUID})/code$`).exec(r.location);
  check(`register ${country} "${name}": 303 to its code page`, r.status === 303 && Boolean(m), `${r.status} ${r.location}`);
  return { id: m?.[1], location: r.location, region: region?.value, team, name, country };
}

// ---------------------------------------------------------------------------
// Affiliate A
const cookieA = await signInAs(A, { tryWrongPassword: true });

r = await get("/", cookieA);
check("A: / lists clients, with the register button and the nav", r.status === 200 && r.text.includes('href="/register"') && /action="\/api\/logout"/.test(r.text)
  && r.text.includes('aria-current="page"'));

r = await get("/register", cookieA);
check("A: /register step 1 offers the four countries as GET links",
  ["MX", "GT", "HN", "JM"].every((c) => r.text.includes(`href="/register?country=${c}"`)));

r = await get("/register?country=JM", cookieA);
const jmRegions = options(r.text, "region").filter((o) => o.value);
check("A: step 2 for JM lists the parishes from app.admin_regions", jmRegions.length === 14 && jmRegions.some((o) => o.value === "St. James"), jmRegions.length);
check("A: JM has no teams, so no team field", options(r.text, "team").length === 0);

r = await post("/api/register", { country: "JM", name: "", region: "St. James", team: "" }, cookieA);
check("A: an empty name returns to the form with e=name", r.status === 303 && r.location.startsWith("/register?") && r.location.includes("e=name")
  && r.location.includes("country=JM") && r.location.includes("region=St.+James"), r.location);
r = await get(r.location, cookieA);
check("A: the form keeps the chosen parish and shows the error under the field",
  options(r.text, "region").some((o) => o.value === "St. James" && o.selected) && /id="name-err"/.test(r.text) && /aria-invalid="true"/.test(r.text));

r = await post("/api/register", { country: "JM", name: `Kept Name ${RUN}`, region: "Nowhere Parish", team: "" }, cookieA);
check("A: an unknown parish returns with e=region and the typed name", r.location.includes("e=region") && r.location.includes(`Kept+Name+${RUN}`), r.location);
r = await get(r.location, cookieA);
check("A: the typed name is preserved in the input", r.text.includes(`value="Kept Name ${RUN}"`));

r = await post("/api/register", { country: "MX", name: `Bad Team ${RUN}`, region: "Jalisco", team: "999999" }, cookieA);
check("A: a team not in the country returns with e=team", r.location.includes("e=team"), r.location);
r = await post("/api/register", { country: "CA", name: `No Country ${RUN}`, region: "x", team: "" }, cookieA);
check("A: an unknown country returns to step 1 with e=country", r.status === 303 && r.location.startsWith("/register?")
  && r.location.includes("e=country") && !r.location.includes("country=CA"), r.location);
r = await post("/api/register", { country: "JM", name: `Evil ${RUN}`, region: "St. James", team: "" }, cookieA, "http://evil.example");
check("A: register from another origin is refused", r.status === 403, r.status);
r = await send("/api/register");
check("A: GET /api/register is 405", r.status === 405, r.status);
r = await post("/api/register", { country: "JM", name: `No Session ${RUN}`, region: "St. James", team: "" });
check("A: register without a session goes to /login", r.status === 303 && r.location === "/login", r.location);

const jm = await registerClient(cookieA, "JM", `Smoke Jamaica ${RUN}`);
r = await get(jm.location, cookieA);
const jmCode = /class="code"[^>]*>([A-Z0-9]{4}-[A-Z0-9]{4})</.exec(r.text)?.[1];
check("A: the JM code page shows the code grouped 4+4 from the alphabet", /^[ACDEFGHJKMNPQRTVWXYZ2346]{4}-[ACDEFGHJKMNPQRTVWXYZ2346]{4}$/.test(jmCode ?? ""), jmCode);
check("A: the JM code page has the name, country, period end, English instruction, print and Registrar otro",
  r.text.includes(jm.name) && r.text.includes("Jamaica") && r.text.includes("St. James") && /Pagado hasta/.test(r.text)
  && /<p lang="en">Open Hoy/.test(r.text) && r.text.includes('onclick="print()"') && r.text.includes(">Registrar otro<"));

r = await post("/api/register", { country: "JM", name: jm.name, region: jm.region, team: "" }, cookieA);
check("A: a double submit of the same client returns the same client, not a second sale", r.location === jm.location, `${r.location} vs ${jm.location}`);

const mx = await registerClient(cookieA, "MX", `Smoke México ${RUN}`, { teamPick: "first-real" });
r = await get(mx.location, cookieA);
const mxCode = /class="code"[^>]*>([A-Z0-9]{4}-[A-Z0-9]{4})</.exec(r.text)?.[1];
check("A: the MX code page shows a code and the Spanish instruction", Boolean(mxCode) && /<p lang="es">Abre Hoy/.test(r.text) && r.text.includes("México"), mxCode);
check("A: the MX client was registered with a real team", mx.team !== "" && mx.team !== "none", mx.team);

r = await get("/", cookieA);
check("A: the clients list shows both new clients with formatted codes and Activo chips",
  r.text.includes(jm.name) && r.text.includes(escapeHtml(mx.name)) && r.text.includes(jmCode) && r.text.includes(mxCode) && r.text.includes(">Activo<"));
check("A: <html lang=\"es\"> for a Spanish affiliate", /<html lang="es"/.test(r.text));

r = await get("/earnings", cookieA);
check("A: earnings list both sales at $8.00 and show the payout history",
  r.status === 200 && r.text.includes(jm.name) && r.text.includes(mx.name) && r.text.includes("$8.00") && r.text.includes("Pagos que has recibido"));
const earned = /<b>(\$[\d.]+)<\/b>Ganado</.exec(r.text)?.[1];
check("A: earned total is shown with its period", Boolean(earned) && r.text.includes("desde tu primer registro"), earned);

// ---------------------------------------------------------------------------
// Affiliate B: row-level security through the running app
const cookieB = await signInAs(B, { tryWrongPassword: false });
r = await get(jm.location, cookieB);
check("RLS: B gets 404 for A's JM code page", r.status === 404, r.status);
check("RLS: the 404 does not leak A's client or code", !r.text.includes(jm.name) && !r.text.includes(jmCode));
r = await get(mx.location, cookieB);
check("RLS: B gets 404 for A's MX code page", r.status === 404, r.status);
r = await get("/", cookieB);
check("RLS: B's client list has none of A's clients or codes",
  r.status === 200 && !r.text.includes(jm.name) && !r.text.includes(escapeHtml(mx.name)) && !r.text.includes(jmCode) && !r.text.includes(mxCode));
check("B: English portal, <html lang=\"en\">", /<html lang="en"/.test(r.text) && r.text.includes(">My clients<"));
r = await get("/earnings", cookieB);
check("RLS: B's earnings have none of A's clients", r.status === 200 && !r.text.includes(jm.name) && !r.text.includes(mx.name));

const bClient = await registerClient(cookieB, "HN", `Smoke Beto ${RUN}`);
r = await get(bClient.location, cookieA);
check("RLS: A gets 404 for B's code page", r.status === 404, r.status);
r = await get("/", cookieA);
check("RLS: A's list does not include B's client", !r.text.includes(bClient.name));
r = await get("/clients/not-a-uuid/code", cookieA);
check("a malformed client id is 404", r.status === 404, r.status);

// ---------------------------------------------------------------------------
// No framework JS anywhere
for (const [label, html] of htmlPages) {
  const external = /<script\b[^>]*\bsrc=/i.test(html);
  const next = html.includes("/_next/");
  if (external || next) check(`no framework JS: ${label}`, false, `script src: ${external}, /_next/: ${next}`);
}
check(`no <script src> and no /_next/ in any of ${htmlPages.length} HTML pages`, htmlPages.every(([, h]) => !/<script\b[^>]*\bsrc=/i.test(h) && !h.includes("/_next/")));

// ---------------------------------------------------------------------------
// Logout
r = await send("/api/logout");
check("GET /api/logout is 405", r.status === 405, r.status);
r = await post("/api/logout", {}, cookieA, "http://evil.example");
check("logout from another origin is refused", r.status === 403, r.status);
r = await post("/api/logout", {}, cookieA);
check("logout: 303 to /login and the cookie is cleared", r.status === 303 && r.location === "/login" && r.setCookie.some((c) => /^la=;/.test(c) && /Max-Age=0/.test(c)),
  `${r.status} ${r.location} ${r.setCookie}`);
r = await send("/");
check("after logout, / redirects to /login", [302, 307].includes(r.status) && r.location.endsWith("/login"));

console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
