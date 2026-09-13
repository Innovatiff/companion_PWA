// End-to-end smoke run against a running affiliate portal (`next start`).
//
//   setup -> login -> register a JM and an MX client -> code page -> clients
//   list -> earnings -> logout, and affiliate B cannot see A's clients or code
//   pages (row-level security, through the running app).
//
//   Renewals in person: B looks up A's client by code, renews early (B earns it,
//   the client stays A's),
//   a double tap records once, a second renewal within 10 minutes needs the
//   confirmation box, both earnings pages show it, and a lapsed client restarts
//   today. The lapse is made with psql, so psql must reach the same local
//   database (PGHOST/PGPORT/PGUSER, and PSQL_DB, default leamington_affiliate).
//
// LOCAL ONLY: it sets passwords, records real $20 sales and renewals, and moves
// subscription dates. It refuses a non-local BASE or PGHOST.
//
//   eval "$(psql -At -F ' ' -f scripts/local-accounts.sql leamington_affiliate |
//           awk '{print "export SETUP_TOKEN_" toupper($1) "=" $2}')"
//   BASE=http://localhost:3200 LOGIN_A=ana SETUP_TOKEN_A=$SETUP_TOKEN_ANA \
//     LOGIN_B=beto SETUP_TOKEN_B=$SETUP_TOKEN_BETO node scripts/smoke.mjs
//
// Without SETUP_TOKEN_A/B the accounts are assumed set up already, with
// PASSWORD_A/PASSWORD_B.
import http from "node:http";
import { execFileSync } from "node:child_process";

const BASE = new URL(process.env.BASE ?? "http://localhost:3200");
if (!["localhost", "127.0.0.1", "[::1]"].includes(BASE.hostname)) {
  console.error(`REFUSING: ${BASE.origin} is not local. This script records sales.`);
  process.exit(2);
}
const PGHOST = process.env.PGHOST ?? "";
if (PGHOST && !PGHOST.startsWith("/") && !["localhost", "127.0.0.1", "::1"].includes(PGHOST)) {
  console.error(`REFUSING: PGHOST=${PGHOST} is not local. This script moves subscription dates.`);
  process.exit(2);
}
const PSQL_DB = process.env.PSQL_DB ?? "leamington_affiliate";
/** One value from the local database. Only uuids we matched and fixed text are interpolated. */
const sql = (query) => execFileSync("psql", ["-v", "ON_ERROR_STOP=1", "-X", "-At", "-c", query, PSQL_DB], { encoding: "utf8" }).trim();
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
/** HTML without React's text-node separators, so a sentence built from pieces reads as one string. */
const plain = (html) => html.replace(/<!-- -->/g, "");
const hidden = (html, name) => new RegExp(`<input[^>]*name="${name}"[^>]*value="([^"]*)"`).exec(html)?.[1] ?? "";
const table = (html, id) => new RegExp(`<table id="${id}">([\\s\\S]*?)</table>`).exec(html)?.[1] ?? "";
const rowWith = (html, needle) => [...html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((m) => plain(m[1])).find((t) => t.includes(needle)) ?? "";
const MONTHS = {
  es: ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
};
const longDate = (iso, lang) => {
  const [y, m, d] = iso.split("-").map(Number);
  return lang === "en" ? `${d} ${MONTHS.en[m - 1]} ${y}` : `${d} de ${MONTHS.es[m - 1]} de ${y}`;
};

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
// Renewals in person: B collects A's client's renewal and earns it (0031); the client stays A's.
const renewalsOf = (id) => Number(sql(`select count(*) from subscriptions where client_id = '${id}' and kind = 'renewal'`));
const loginLiteral = (login) => `'${login.replace(/'/g, "''")}'`;
const registrant = sql(`select coalesce(a.business_name, a.name) from affiliates a join portal_logins p on p.affiliate_id = a.id where p.login = ${loginLiteral(A.login)}`);
const periodEnd = (id) => sql(`select max(period_end) from subscriptions where client_id = '${id}' and paid_at is not null and voided_at is null`);
const money = (v) => `$${Number(v).toFixed(2)}`;
const earnedBy = (key, login) => sql(`select (s.affiliate_id = p.affiliate_id and s.affiliate_payout = 8.00)::text
  from subscriptions s, portal_logins p where s.request_key = '${key}' and p.login = ${loginLiteral(login)}`) === "true";
const earningsOf = (login) => sql(`select e.renewals || ' ' || e.renewals_earned || ' ' || e.renewals_own_clients || ' ' || e.renewals_other_clients
    || ' ' || e.renewals_other_clients_earned || ' ' || e.own_clients_renewed_elsewhere
  from affiliate_earnings e join portal_logins p on p.affiliate_id = e.affiliate_id where p.login = ${loginLiteral(login)}`).split(" ");
const plus6 = (iso) => sql(`select (date '${iso}' + interval '6 months')::date`);

r = await get("/renew", cookieB);
check("renew 1: /renew is a plain form posting the code to /api/renew/lookup, Renew current in the nav",
  r.status === 200 && /<form(?=[^>]*\baction="\/api\/renew\/lookup")(?=[^>]*\bmethod="post")[^>]*>/.test(r.text)
  && /<input(?=[^>]*\bname="code")(?=[^>]*\bclass="codein")[^>]*>/.test(r.text) && /href="\/renew" aria-current="page"/.test(r.text));

r = await post("/api/renew/lookup", { code: ` ${jmCode.toLowerCase().replace("-", " ")} ` }, cookieB);
check("renew 2: B looks up A's client by code (lower case, a space) and is sent to its renewal page",
  r.status === 303 && r.location === `/renew/${jm.id}`, `${r.status} ${r.location}`);
check("renew 2: the code is not in the redirect", !r.location.toUpperCase().includes(jmCode.replace("-", "")));
const statusUrl = r.location;
const endBefore = periodEnd(jm.id);
const endAfter = plus6(endBefore);
r = await get(statusUrl, cookieB);
let p = plain(r.text);
check("renew 2: the status page shows name, country in words, formatted code, period end and an Active chip",
  r.status === 200 && p.includes(jm.name) && p.includes("Jamaica") && p.includes(jmCode) && p.includes(`Paid until: <b>${longDate(endBefore, "en")}</b>`)
  && p.includes(">Active<"), p.slice(0, 400));
check(`renew 2: "Registered by: ${registrant}" as information, and "Your commission: $8.00" for B`,
  p.includes(`Registered by: ${registrant}`) && p.includes("Your commission: $8.00") && !p.includes("on their behalf") && !p.includes("goes to"));
check("renew 2: an early renewal extends from the current end",
  p.includes(`New period: ${longDate(endBefore, "en")} – ${longDate(endAfter, "en")}`) && p.includes("It adds on to the current period"));
check("renew 2: one primary button 'I collected $20.00 — renew', no confirmation box yet",
  /<form(?=[^>]*\baction="\/api\/renew\/record")(?=[^>]*\bmethod="post")[^>]*>/.test(r.text) && p.includes(">I collected $20.00 — renew</button>")
  && !/name="confirm_repeat"/.test(r.text));
const form1 = { client_id: hidden(r.text, "client_id"), request_key: hidden(r.text, "request_key") };
check("renew 2: hidden client_id and a uuid request_key", form1.client_id === jm.id && new RegExp(`^${UUID}$`).test(form1.request_key), JSON.stringify(form1));

const beforeRenew = renewalsOf(jm.id);
r = await post("/api/renew/record", form1, cookieB);
check("renew 3: collecting goes to the receipt for this request key", r.status === 303 && r.location === `/renew/done/${form1.request_key}`, `${r.status} ${r.location}`);
const receiptUrl = r.location;
check("renew 3: exactly one renewal recorded", renewalsOf(jm.id) === beforeRenew + 1, renewalsOf(jm.id));
r = await get(receiptUrl, cookieB);
p = plain(r.text);
check("renew 3: the receipt says Renewed, with the period extended from the old end",
  r.status === 200 && p.includes(">Renewed</h1>") && p.includes(`New period: ${longDate(endBefore, "en")} – ${longDate(endAfter, "en")}`), p.slice(0, 600));
check(`renew 3: "Your commission: $8.00", "Registered by: ${registrant}", "Collected by: you", $20.00, a 24 h time, and the account is active`,
  p.includes("Your commission: $8.00") && p.includes(`Registered by: ${registrant}`) && p.includes("Collected by: you") && p.includes("Amount: $20.00")
  && /Date: [^<]*\b([01]\d|2[0-3]):[0-5]\d\b/.test(p) && p.includes("The account is active now."));
check("renew 3: the receipt is printable and offers Renew another", r.text.includes('onclick="print()"') && p.includes('href="/renew">Renew another<'));
check("renew 3: the period in the database is the one the receipt shows",
  sql(`select period_start || ' ' || period_end from subscriptions where request_key = '${form1.request_key}'`) === `${endBefore} ${endAfter}`);
check("renew 3: B, the collecting business, earns the $8.00", earnedBy(form1.request_key, B.login));
check("renew 3: the client stays registered to A, and the renewal records A as registrant",
  sql(`select (s.registered_by_affiliate_id = c.affiliate_id and c.affiliate_id = p.affiliate_id)::text
         from subscriptions s join clients c on c.id = s.client_id, portal_logins p
        where s.request_key = '${form1.request_key}' and p.login = ${loginLiteral(A.login)}`) === "true");
r = await get(receiptUrl, cookieA);
check("renew 3: A, who neither collected nor earns it, gets 404 for the receipt", r.status === 404, r.status);

r = await post("/api/renew/record", form1, cookieB);
check("renew 4: the exact same form again lands on the same receipt", r.status === 303 && r.location === receiptUrl, r.location);
check("renew 4: and records nothing new", renewalsOf(jm.id) === beforeRenew + 1, renewalsOf(jm.id));

r = await get(statusUrl, cookieB);
p = plain(r.text);
const form2 = { client_id: hidden(r.text, "client_id"), request_key: hidden(r.text, "request_key") };
check("renew 5: a fresh status page warns of the renewal a moment ago, when and until what date, collected by you",
  p.includes("This client was renewed a moment ago (") && p.includes("collected by you") && p.includes(`paid until ${longDate(endAfter, "en")}`), p.slice(0, 800));
check("renew 5: it requires the 'Yes, collect another 6 months' box, and has a new request key",
  /<input(?=[^>]*\bname="confirm_repeat")(?=[^>]*\brequired)[^>]*>/.test(r.text) && p.includes("Yes, collect another 6 months") && form2.request_key !== form1.request_key && form2.request_key !== "");
r = await post("/api/renew/record", form2, cookieB);
check("renew 5: submitting without the box goes back with ?recent=1", r.status === 303 && r.location === `${statusUrl}?recent=1`, r.location);
check("renew 5: and records nothing", renewalsOf(jm.id) === beforeRenew + 1, renewalsOf(jm.id));
r = await get(r.location, cookieB);
check("renew 5: ?recent=1 shows the warning and the box", r.status === 200 && plain(r.text).includes("renewed a moment ago") && /name="confirm_repeat"/.test(r.text));

// The confirmation, on B's own client (so A's numbers stay one renewal).
r = await get(`/renew/${bClient.id}`, cookieB);
p = plain(r.text);
check("renew 5b: B's own client says 'Registered by: you' and 'Your commission: $8.00'",
  r.status === 200 && p.includes("Registered by: you") && p.includes("Your commission: $8.00"));
const ownForm = { client_id: hidden(r.text, "client_id"), request_key: hidden(r.text, "request_key") };
r = await post("/api/renew/record", ownForm, cookieB);
r = await get(r.location, cookieB);
check("renew 5b: B's own receipt: 'Your commission: $8.00', 'Registered by: you', 'Collected by: you'",
  r.status === 200 && plain(r.text).includes("Your commission: $8.00") && plain(r.text).includes("Registered by: you") && plain(r.text).includes("Collected by: you"));
check("renew 5b: a business renewing its own client earns it", earnedBy(ownForm.request_key, B.login));
r = await get(`/renew/${bClient.id}`, cookieB);
const confirmForm = { client_id: hidden(r.text, "client_id"), request_key: hidden(r.text, "request_key"), confirm_repeat: "1" };
const bBefore = renewalsOf(bClient.id);
r = await post("/api/renew/record", confirmForm, cookieB);
check("renew 5b: with the box ticked, a second renewal within 10 minutes is recorded",
  r.status === 303 && r.location === `/renew/done/${confirmForm.request_key}` && renewalsOf(bClient.id) === bBefore + 1, `${r.location} ${renewalsOf(bClient.id)}`);
const bOwnReceipt = r.location;
r = await get(bOwnReceipt, cookieA);
check("renew 5b: A gets 404 for a receipt she neither collected nor earns", r.status === 404, r.status);

const [aRen, aRenEarned, , , , aElsewhere] = earningsOf(A.login);
if (A.token) check("renew 6: on this fresh run, A has 0 renewals and 1 renewal of her clients made elsewhere", aRen === "0" && aElsewhere === "1", `${aRen} ${aElsewhere}`);
r = await get("/earnings", cookieA);
p = plain(r.text);
check("renew 6: A's renewals stat counts only what she collected, and B's renewal of her client is not in her list",
  r.status === 200 && p.includes(`<b>${money(aRenEarned)}</b>ganado en ${aRen} ${aRen === "1" ? "renovación" : "renovaciones"}`)
  && !table(r.text, "renewals").includes(jm.name), `${aRen} ${aRenEarned}`);
check("renew 6: A sees, as information and not money, that her client renewed elsewhere",
  p.includes(aElsewhere === "1" ? "<p>1 renovación de tus clientes se hizo en otro negocio o con Hoy." : `<p>${aElsewhere} renovaciones de tus clientes se hicieron en otro negocio o con Hoy.`));
check("renew 6: nothing says a renewal elsewhere still pays her", !p.includes("igual ganaste") && !p.includes("cada vez que renueva"));
check("renew 6: the incentive: any Hoy client can renew with you and the commission is yours",
  p.includes("Cualquier cliente de Hoy puede renovar contigo, y la comisión es tuya: $8.00 por cada renovación que cobras"));
check("renew 6: registrations and renewals are separate stat blocks, and the registration is listed",
  /<b>\$[\d.]+<\/b>ganado en \d+ registros?<br\/?>/.test(p) && /<b>\$[\d.]+<\/b>ganado en \d+ renovaci(ón|ones)<br\/?>/.test(p)
  && rowWith(table(r.text, "registrations"), jm.name).includes("$8.00"));

const [, , bOwn, bOther, bOtherEarned] = earningsOf(B.login);
if (B.token) check("renew 7: on this fresh run, B has 2 renewals of its own client and 1 of another business's", bOwn === "2" && bOther === "1" && bOtherEarned === "8.00", `${bOwn} ${bOther} ${bOtherEarned}`);
r = await get("/earnings", cookieB);
p = decode(plain(r.text));
const bRow = rowWith(table(r.text, "renewals"), jm.name);
check(`renew 7: B's "Renewals you collected" lists A's client: $8.00 commission, registered by ${registrant}, the period`,
  r.status === 200 && p.includes(">Renewals you collected<") && bRow.includes("<td class=\"num\">$8.00</td>") && bRow.includes(`<td>${registrant}</td>`)
  && bRow.includes(`${longDate(endBefore, "en")} – ${longDate(endAfter, "en")}`), bRow);
check("renew 7: B's renewals stat splits own clients from other businesses' clients",
  p.includes(`${bOwn} of your clients · ${bOther} of other businesses' clients (${money(bOtherEarned)})`));
check("renew 7: B's own client's renewals say 'Registered by: you'", rowWith(table(r.text, "renewals"), bClient.name).includes("<td>you</td>"));
check("renew 7: A's client is not among B's registrations", !table(r.text, "registrations").includes(jm.name));
r = await get("/", cookieB);
check("renew 7: A's client still does not appear in B's client list", r.status === 200 && !r.text.includes(jm.name) && !r.text.includes(jmCode));
r = await get(jm.location, cookieB);
check("renew 7: and B still gets 404 for A's code page", r.status === 404, r.status);

// 900 days pass for A's JM client: the periods and the payments that bought them move back together.
sql(`update subscriptions set period_start = period_start - 900, period_end = period_end - 900, paid_at = paid_at - interval '900 days'
      where client_id = '${jm.id}'`);
const today = sql("select app.business_today()");
r = await get("/", cookieA);
check("renew 8: A's list shows the lapsed client with a Renovar link", r.text.includes(`href="/renew/${jm.id}"`) && rowWith(r.text, jm.name).includes("Vencido"));
r = await get(`/renew/${jm.id}`, cookieA);
p = plain(r.text);
check("renew 8: lapsed: Vencido, 'Registrado por: ti', your commission, and the new period starts today",
  r.status === 200 && p.includes(">Vencido<") && p.includes("Registrado por: ti") && p.includes("Tu comisión: $8.00")
  && p.includes(`Nuevo periodo: ${longDate(today, "es")} – ${longDate(plus6(today), "es")}`) && p.includes("Empieza hoy, porque el periodo anterior ya terminó")
  && !/name="confirm_repeat"/.test(r.text), p.slice(0, 800));
const lapsedForm = { client_id: hidden(r.text, "client_id"), request_key: hidden(r.text, "request_key") };
r = await post("/api/renew/record", lapsedForm, cookieA);
check("renew 8: renewing the lapsed client goes to its receipt", r.status === 303 && r.location === `/renew/done/${lapsedForm.request_key}`, r.location);
r = await get(r.location, cookieA);
p = plain(r.text);
check("renew 8: the receipt starts today, says the account is active and was reactivated",
  p.includes(">Renovado</h1>") && p.includes(`Nuevo periodo: ${longDate(today, "es")} – ${longDate(plus6(today), "es")}`)
  && p.includes("La cuenta ya está activa.") && p.includes("La cuenta estaba vencida y se reactivó") && p.includes("Tu comisión: $8.00") && p.includes("Cobrado por: ti"));
check("renew 8: the database agrees: starts today, a reactivation, the client active again",
  sql(`select s.period_start || ' ' || s.reactivation || ' ' || cs.status from subscriptions s join client_status cs on cs.client_id = s.client_id
        where s.request_key = '${lapsedForm.request_key}'`) === `${today} true active`);

check("renew 8: A renewing her own client earns it", earnedBy(lapsedForm.request_key, A.login));
r = await get("/earnings", cookieA);
check("renew 8: and it is in her renewals: $8.00, registered by her", rowWith(table(r.text, "renewals"), jm.name).includes("$8.00")
  && rowWith(table(r.text, "renewals"), jm.name).includes("<td>ti</td>"));

let absent = "QQQQQQQQ";
for (const c of ["QQQQQQQQ", "QQQQQQQR", "QQQQQQQT"]) if (sql(`select count(*) from clients where code = '${c}'`) === "0") { absent = c; break; }
r = await post("/api/renew/lookup", { code: `${absent.slice(0, 4)}-${absent.slice(4)}` }, cookieB);
check("renew 9: an unknown code is not_found", r.status === 303 && r.location === "/renew?e=not_found", r.location);
r = await get(r.location, cookieB);
check("renew 9: and says so under the field", /id="code-err"[^>]*>No client has that code/.test(r.text) && /aria-invalid="true"/.test(r.text));
r = await post("/api/renew/lookup", { code: "ACD-12" }, cookieB);
check("renew 9: a malformed code is invalid", r.status === 303 && r.location === "/renew?e=invalid", r.location);
r = await get(r.location, cookieB);
check("renew 9: and says what a code looks like", /id="code-err"[^>]*>That code is not valid/.test(r.text));
r = await post("/api/renew/lookup", { code: jmCode }, cookieB, "http://evil.example");
check("renew 9: a cross-origin lookup is 403", r.status === 403, r.status);
const jmNow = renewalsOf(jm.id);
r = await get(`/renew/${jm.id}`, cookieB);
r = await post("/api/renew/record", { client_id: jm.id, request_key: hidden(r.text, "request_key"), confirm_repeat: "1" }, cookieB, "http://evil.example");
check("renew 9: a cross-origin record is 403 and records nothing", r.status === 403 && renewalsOf(jm.id) === jmNow, `${r.status} ${renewalsOf(jm.id)}`);
r = await send("/api/renew/record");
check("renew 9: GET /api/renew/record is 405", r.status === 405, r.status);
r = await post("/api/renew/record", { client_id: jm.id, request_key: "00000000-0000-4000-8000-000000000000" });
check("renew 9: record without a session goes to /login", r.status === 303 && r.location === "/login", r.location);
r = await post("/api/renew/record", { client_id: "nope", request_key: "also-nope" }, cookieB);
check("renew 9: record with malformed ids is 400", r.status === 400, r.status);
for (const path of ["/renew/not-a-uuid", "/renew/00000000-0000-4000-8000-000000000000", "/renew/done/00000000-0000-4000-8000-000000000000", "/renew/done/x"]) {
  r = await get(path, cookieB);
  check(`renew 9: ${path} is 404`, r.status === 404, r.status);
}

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
