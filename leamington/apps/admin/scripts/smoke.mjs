// End-to-end smoke run against a running admin server (next start). LOCAL/STAGING ONLY:
// it creates an owner, an affiliate and clients with unique names each run.
//
//   BASE=http://localhost:3300 DATABASE_URL=... SESSION_SECRET=... node scripts/smoke.mjs
//
// DATABASE_URL and SESSION_SECRET must be the server's own. The database is used
// only where the admin portal is not the actor: completing the affiliate's
// password and registering a client as that affiliate (the affiliate portal's
// job), and minting forged cookies to prove they are refused.
import { spawnSync } from "node:child_process";
import path from "node:path";
import pg from "pg";

const HERE = import.meta.dirname;
const BASE = (process.env.BASE ?? "http://localhost:3300").replace(/\/+$/, "");
if (!process.env.DATABASE_URL || !process.env.SESSION_SECRET) {
  console.error("set DATABASE_URL and SESSION_SECRET (the server's own)");
  process.exit(2);
}
const { makeToken } = await import(path.join(HERE, "../../../packages/shared/src/server/session.ts"));

const stamp = Date.now().toString(36);
const OWNER = `smoke.owner.${stamp}`, OWNER_PW = "owner-smoke-password-1";
const AFF = `smoke.aff.${stamp}`, AFF_PW = "affiliate-smoke-password-1";
let failures = 0, passes = 0;
const pass = (m) => { passes++; console.log(`PASS ${m}`); };
const fail = (m) => { failures++; console.log(`FAIL ${m}`); };
const check = (ok, m, detail = "") => (ok ? pass(m) : fail(`${m}${detail ? ` -- ${detail}` : ""}`));

async function http(p, { method = "GET", cookie, form, origin = BASE } = {}) {
  const headers = { accept: "text/html" };
  if (cookie) headers.cookie = cookie;
  let body;
  if (form) { body = new URLSearchParams(form).toString(); headers["content-type"] = "application/x-www-form-urlencoded"; }
  if (method === "POST" && origin) headers.origin = origin;
  const res = await fetch(BASE + p, { method, headers, body, redirect: "manual" });
  const text = await res.text();
  return { status: res.status, location: res.headers.get("location") ?? "", setCookie: res.headers.getSetCookie(), text };
}
const cookieFrom = (r, name) => r.setCookie.map((c) => c.split(";")[0]).find((c) => c.startsWith(`${name}=`));
const noFrameworkJs = (html) => !/<script[^>]*\bsrc=/i.test(html) && !html.includes("/_next/");
// HTML reading for tables: the part of a page inside <section id=...>, its rows, and a row's cells as text.
const section = (html, id) => {
  const i = html.indexOf(`id="${id}"`);
  if (i < 0) return "";
  const j = html.indexOf("</section>", i);
  return html.slice(i, j < 0 ? undefined : j);
};
const rowWith = (html, text) => (html.match(/<tr[\s>][\s\S]*?<\/tr>/g) ?? []).find((x) => x.includes(text));
const cells = (tr) => [...(tr ?? "").matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((m) => m[1]
  .replace(/<!-- -->/g, "").replace(/<br\/?>/g, " ").replace(/<[^>]+>/g, "")
  .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim());
const randomCode = "(select string_agg(substr('ACDEFGHJKMNPQRTVWXYZ2346', 1 + floor(random() * 24)::int, 1), '') from generate_series(1, 8))";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

try {
  // 1. create-owner -> setup -> login
  const created = spawnSync(process.execPath, [path.join(HERE, "create-owner.mjs"), OWNER, "es"], {
    env: { ...process.env, ADMIN_URL: BASE }, encoding: "utf8",
  });
  const link = /(\S+\/setup\?token=([0-9a-f]{48}))/.exec(created.stdout);
  check(created.status === 0 && link && !created.stdout.includes(process.env.DATABASE_URL), "create-owner prints a setup link and not DATABASE_URL", created.stderr);
  const ownerToken = link[2];

  check((await http(`/setup?token=${ownerToken}`)).status === 200, "GET /setup?token=… is 200");
  let r = await http("/api/setup", { method: "POST", form: { token: ownerToken, password: OWNER_PW, confirm: "different-password" } });
  check(r.status === 303 && r.location.includes("e=mismatch"), "setup refuses mismatched passwords", r.location);
  r = await http("/api/setup", { method: "POST", form: { token: ownerToken, password: "short", confirm: "short" } });
  check(r.status === 303 && r.location.includes("e=weak_password"), "setup refuses a password under 10 characters", r.location);
  r = await http("/api/setup", { method: "POST", form: { token: ownerToken, password: OWNER_PW, confirm: OWNER_PW } });
  check(r.status === 303 && r.location === "/login?m=setup", "setup sets the owner password", r.location);
  r = await http("/api/setup", { method: "POST", form: { token: ownerToken, password: OWNER_PW, confirm: OWNER_PW } });
  check(r.location.includes("e=invalid_token"), "the setup link works only once", r.location);

  check((await http("/")).location === "/login", "GET / without a session redirects to /login");
  r = await http("/api/login", { method: "POST", form: { login: OWNER, password: "wrong-password-123" } });
  check(r.status === 303 && r.location === "/login?m=invalid" && !cookieFrom(r, "lo"), "a wrong password is refused");
  r = await http("/api/login", { method: "POST", form: { login: OWNER, password: OWNER_PW } });
  const lo = cookieFrom(r, "lo");
  check(r.status === 303 && r.location === "/" && lo, "the owner signs in", `${r.status} ${r.location}`);
  check(r.setCookie[0]?.includes("HttpOnly") && r.setCookie[0]?.includes("SameSite=Lax"), "the owner cookie is HttpOnly and SameSite=Lax");

  r = await http("/");
  r = await http("/", { cookie: lo });
  check(r.status === 200 && r.text.includes("Ventas por afiliado") && r.text.includes('lang="es"'), "GET / shows sales per affiliate, lang=es");
  check(r.text.indexOf("Ventas por afiliado") < r.text.indexOf("Resumen"), "sales per affiliate comes before the money summary");
  check((await http("/api/login")).status === 405, "GET /api/login is 405");
  r = await http("/api/clients/renew", { method: "POST", cookie: lo, origin: "http://evil.example", form: { client_id: "x" } });
  check(r.status === 403, "a cross-origin POST is refused with 403", String(r.status));

  // 2. create an affiliate; the setup link is shown once
  r = await http("/api/affiliates/create", { method: "POST", cookie: lo, form: { name: "", commission: "40", login: AFF, language: "es" } });
  check(r.location.startsWith("/affiliates/new") && r.location.includes("e=name"), "creating an affiliate without a name is refused", r.location);
  r = await http("/api/affiliates/create", { method: "POST", cookie: lo, form: { name: "Smoke", commission: "140", login: AFF } });
  check(r.location.includes("e=commission"), "a commission over 100% is refused", r.location);
  r = await http("/api/affiliates/create", { method: "POST", cookie: lo, form: { name: `Afiliado Smoke ${stamp}`, business: "Tienda Smoke", contact: "519-555-0100", commission: "40", login: AFF, language: "es" } });
  const affId = /^\/affiliates\/([0-9a-f-]{36})\?ok=created$/.exec(r.location)?.[1];
  const flash = cookieFrom(r, "lo_setup");
  check(r.status === 303 && affId && flash, "an affiliate is created and redirected to its page with a one-time link cookie", r.location);
  r = await http("/api/affiliates/create", { method: "POST", cookie: lo, form: { name: "Otro", commission: "40", login: AFF } });
  check(r.location.includes("e=login_taken"), "a duplicate login is refused", r.location);

  r = await http(`/affiliates/${affId}?ok=created`, { cookie: `${lo}; ${flash}` });
  const affToken = /\/setup\?token=([0-9a-f]{48})/.exec(r.text)?.[1];
  check(r.status === 200 && affToken && r.text.includes("http://localhost:3200/setup?token=") && r.text.includes("72 horas"), "the affiliate setup link is shown, with its 72 h expiry");
  check(r.setCookie.some((c) => c.startsWith("lo_setup=;") && c.includes("Max-Age=0")), "showing the link clears its cookie");
  r = await http(`/affiliates/${affId}`, { cookie: lo });
  check(!/setup\?token=/.test(r.text), "the setup link is not shown a second time");

  // The affiliate portal's part: set the password, register a client as the affiliate.
  const done = await client.query("select app.portal_complete_setup($1, $2) as r", [affToken, AFF_PW]);
  check(done.rows[0].r.status === "ok", "the affiliate's setup token from the page is valid");
  const affAuth = (await client.query("select auth_user_id from portal_logins where login = $1", [AFF])).rows[0].auth_user_id;
  await client.query("begin");
  await client.query("select set_config('request.jwt.claim.sub', $1, true)", [affAuth]);
  const affClient = (await client.query(
    `select app.register_client($1, (select string_agg(substr('ACDEFGHJKMNPQRTVWXYZ2346', 1 + floor(random() * 24)::int, 1), '') from generate_series(1, 8)),
                                $2, 'JM', 'St. James', null, $3) as r`, [affId, `Cliente de Afiliado ${stamp}`, affAuth])).rows[0].r.client_id;
  await client.query("commit");
  pass("a client is registered as the affiliate ($8.00 earned)");

  // 3. register a client directly (house affiliate)
  r = await http("/clients/new", { cookie: lo });
  check(r.status === 200 && r.text.includes('name="country"'), "GET /clients/new asks for the country first");
  r = await http("/clients/new?country=JM", { cookie: lo });
  const formCode = /name="code" value="([A-Z0-9]{8})"/.exec(r.text)?.[1];
  const region = /<option value="(St\. [^"]+|Kingston)"/.exec(r.text)?.[1];
  check(r.status === 200 && formCode && region && r.text.includes("Parroquia"), "the JM step lists parishes and carries a code", `${formCode} ${region}`);
  const name = `Cliente Directo ${stamp}`;
  r = await http("/api/clients/register", { method: "POST", cookie: lo, form: { country: "JM", name: "", region, code: formCode } });
  check(r.location.includes("e=name"), "registering without a name is refused", r.location);
  r = await http("/api/clients/register", { method: "POST", cookie: lo, form: { country: "JM", name, region: "Nowhere", code: formCode } });
  check(r.location.includes("e=region"), "an unknown parish is refused", r.location);
  r = await http("/api/clients/register", { method: "POST", cookie: lo, form: { country: "JM", name, region, team: "", code: formCode } });
  const clientId = /^\/clients\/([0-9a-f-]{36})\/code\?ok=registered$/.exec(r.location)?.[1];
  check(r.status === 303 && clientId, "the owner registers a client directly", r.location);
  r = await http("/api/clients/register", { method: "POST", cookie: lo, form: { country: "JM", name, region, team: "", code: formCode } });
  check(r.location === `/clients/${clientId}/code?ok=registered`, "submitting the same form twice does not register twice", r.location);
  const house = (await client.query(
    `select count(*)::int as n, bool_and(a.is_house) as house, min(s.affiliate_payout)::text as payout
       from clients c join affiliates a on a.id = c.affiliate_id join subscriptions s on s.client_id = c.id where c.full_name = $1`, [name])).rows[0];
  check(house.n === 1 && house.house && house.payout === "0.00", "one paid sale under the house affiliate, no commission", JSON.stringify(house));

  r = await http(`/clients/${clientId}/code?ok=registered`, { cookie: lo });
  check(r.status === 200 && r.text.includes(`${formCode.slice(0, 4)}-${formCode.slice(4)}`) && r.text.includes("window.print()"), "the code page shows the code grouped 4+4 with a print button");

  // 4. renew it
  r = await http(`/clients/${clientId}`, { cookie: lo });
  const expectEnd = /name="expect_end" value="([^"]+)"/.exec(r.text)?.[1];
  check(r.status === 200 && expectEnd, "GET /clients/[id] offers the renewal", expectEnd);
  r = await http("/api/clients/renew", { method: "POST", cookie: lo, form: { client_id: clientId, expect_end: expectEnd, back: `/clients/${clientId}` } });
  const newEnd = /end=(\d{4}-\d{2}-\d{2})/.exec(r.location)?.[1];
  check(r.status === 303 && r.location.startsWith(`/clients/${clientId}?ok=renewed`) && newEnd, "a renewal is marked paid", r.location);
  r = await http("/api/clients/renew", { method: "POST", cookie: lo, form: { client_id: clientId, expect_end: expectEnd, back: `/clients/${clientId}` } });
  check(r.location.includes("e=stale"), "a repeated renewal form records nothing", r.location);
  r = await http(`/clients/${clientId}?ok=renewed&end=${newEnd}`, { cookie: lo });
  check(r.text.includes("Renovación registrada"), "the client page confirms the renewal");
  r = await http("/api/clients/renew", { method: "POST", cookie: lo, form: { client_id: affClient, expect_end: "wrong", back: "https://evil.example" } });
  check(r.location === "/renewals?e=stale", "the renewal redirect cannot leave the portal", r.location);

  // 5. void a payment
  r = await http(`/clients/${clientId}`, { cookie: lo });
  const subId = /\?void=([0-9a-f-]{36})/.exec(r.text)?.[1];
  r = await http(`/clients/${clientId}?void=${subId}`, { cookie: lo });
  check(r.status === 200 && r.text.includes('name="reason"'), "voiding asks for a confirming step with a reason");
  r = await http("/api/clients/void", { method: "POST", cookie: lo, form: { client_id: clientId, subscription_id: subId, reason: "  " } });
  check(r.location.includes("e=reason"), "a void without a reason is refused", r.location);
  r = await http("/api/clients/void", { method: "POST", cookie: lo, form: { client_id: clientId, subscription_id: subId, reason: "registrado dos veces (smoke)" } });
  check(r.location === `/clients/${clientId}?ok=voided`, "a payment is voided", r.location);
  r = await http("/api/clients/void", { method: "POST", cookie: lo, form: { client_id: clientId, subscription_id: subId, reason: "again" } });
  check(r.location.includes("e=already"), "voiding twice is refused", r.location);

  // 6. record a payout
  r = await http(`/affiliates/${affId}`, { cookie: lo });
  const lastPayout = /name="last_payout" value="([^"]+)"/.exec(r.text)?.[1];
  check(r.text.includes("$8.00"), "the affiliate page shows $8.00 owed");
  r = await http("/api/affiliates/payout", { method: "POST", cookie: lo, form: { affiliate_id: affId, amount: "80", method: "efectivo", last_payout: lastPayout } });
  check(r.location.includes("e=over"), "a payout above the amount owed is refused", r.location);
  r = await http("/api/affiliates/payout", { method: "POST", cookie: lo, form: { affiliate_id: affId, amount: "abc", method: "efectivo", last_payout: lastPayout } });
  check(r.location.includes("e=amount"), "a non-numeric payout is refused", r.location);
  r = await http("/api/affiliates/payout", { method: "POST", cookie: lo, form: { affiliate_id: affId, amount: "5,00", method: "efectivo", note: "smoke", last_payout: lastPayout } });
  check(r.location === `/affiliates/${affId}?ok=payout`, "a payout is recorded", r.location);
  r = await http("/api/affiliates/payout", { method: "POST", cookie: lo, form: { affiliate_id: affId, amount: "1", method: "efectivo", last_payout: lastPayout } });
  check(r.location.includes("e=stale"), "a repeated payout form records nothing", r.location);
  const owed = (await client.query("select owed::text from affiliate_earnings where affiliate_id = $1", [affId])).rows[0].owed;
  check(owed === "3.00", "owed is $3.00 after an $8.00 sale and a $5.00 payout", owed);

  r = await http("/api/affiliates/update", { method: "POST", cookie: lo, form: { affiliate_id: affId, action: "commission", commission: "35" } });
  const rate = (await client.query("select commission_rate::text from affiliates where id = $1", [affId])).rows[0].commission_rate;
  check(r.location.endsWith("ok=commission") && rate === "0.3500", "the commission changes to 35%", `${r.location} ${rate}`);

  // 6b. renewals collected in person (0029). A second affiliate collects a renewal on
  // the first affiliate's client (the affiliate portal's job, so through the database);
  // one of the first affiliate's clients is backdated until it lapses, and the owner
  // marks it paid here: a reactivation collected by the owner.
  const COL = `smoke.col.${stamp}`, COL_PW = "collector-smoke-password-1";
  const AFF_NAME = `Afiliado Smoke ${stamp}`, COL_NAME = `Cobrador Smoke ${stamp}`;
  const LAPSED_NAME = `Cliente Vencido ${stamp}`, AFF_CLIENT_NAME = `Cliente de Afiliado ${stamp}`;
  r = await http("/api/affiliates/create", { method: "POST", cookie: lo, form: { name: COL_NAME, commission: "40", login: COL, language: "es" } });
  const colId = /^\/affiliates\/([0-9a-f-]{36})\?ok=created$/.exec(r.location)?.[1];
  const colPage = await http(`/affiliates/${colId}?ok=created`, { cookie: `${lo}; ${cookieFrom(r, "lo_setup")}` });
  const colToken = /\/setup\?token=([0-9a-f]{48})/.exec(colPage.text)?.[1];
  check(colId && (await client.query("select app.portal_complete_setup($1, $2) as r", [colToken, COL_PW])).rows[0].r.status === "ok",
    "a second affiliate is created to collect renewals");
  const colAuth = (await client.query("select auth_user_id from portal_logins where login = $1", [COL])).rows[0].auth_user_id;

  const affCode = (await client.query("select code from clients where id = $1", [affClient])).rows[0].code;
  await client.query("begin");
  await client.query("select set_config('request.jwt.claim.sub', $1, true)", [colAuth]);
  const lookup = (await client.query("select app.renewal_lookup($1) as r", [affCode])).rows[0].r;
  const collected = (await client.query("select app.affiliate_record_renewal($1, gen_random_uuid(), $2) as r", [affClient, colAuth])).rows[0].r;
  await client.query("commit");
  check(lookup.status === "found" && collected.status === "renewed", "the second affiliate collects a renewal on the first affiliate's client", JSON.stringify(collected));

  await client.query("begin");
  await client.query("select set_config('request.jwt.claim.sub', $1, true)", [affAuth]);
  const lapsedClient = (await client.query(`select app.register_client($1, ${randomCode}, $2, 'JM', 'St. James', null, $3) as r`,
    [affId, LAPSED_NAME, affAuth])).rows[0].r.client_id;
  await client.query("commit");
  await client.query(
    `update subscriptions set period_start = period_start - 400, period_end = period_end - 400, paid_at = paid_at - interval '400 days'
      where client_id = $1`, [lapsedClient]);

  r = await http("/renewals", { cookie: lo });
  const [iDue, iLapsed, iReact] = ['id="due"', 'id="lapsed"', 'id="reactivated"'].map((s) => r.text.indexOf(s));
  check(r.status === 200 && iDue > 0 && iDue < iLapsed && iLapsed < iReact, "/renewals shows Due soon, Lapsed and Reactivated, in that order", `${iDue} ${iLapsed} ${iReact}`);
  let lapse = section(r.text, "lapse");
  check(cells(rowWith(lapse, AFF_NAME)).at(-1) === "100%", "the lapse rate is a percentage for an affiliate with a client who came due (1 of 1 lapsed)",
    cells(rowWith(lapse, AFF_NAME)).join(" | "));
  check(cells(rowWith(lapse, COL_NAME)).at(-1) === "Nadie ha llegado a su renovación todavía", "the lapse rate says nobody yet, never 0%, for an affiliate with no one come due",
    cells(rowWith(lapse, COL_NAME)).join(" | "));
  check(lapse.includes("Tasa = vencidos hoy ÷ llegaron a su renovación"), "the lapse rate explains its definition");

  const lapsedRow = rowWith(section(r.text, "lapsed"), LAPSED_NAME);
  const lapsedEnd = /name="expect_end" value="([^"]+)"/.exec(lapsedRow ?? "")?.[1];
  check(lapsedEnd, "the lapsed client is under Lapsed with Marcar pagado");
  r = await http("/api/clients/renew", { method: "POST", cookie: lo, form: { client_id: lapsedClient, expect_end: lapsedEnd, back: "/renewals" } });
  check(r.status === 303 && r.location.startsWith(`/renewals?ok=renewed&c=${lapsedClient}`) && r.location.endsWith("&re=1"), "owner Marcar pagado on a lapsed client records a reactivation", r.location);
  r = await http(r.location, { cookie: lo });
  check(r.text.includes(`Reactivación de ${LAPSED_NAME} registrada`), "the pipeline confirms a reactivation");
  const react = cells(rowWith(section(r.text, "reactivated"), LAPSED_NAME));
  check(/^Vencido \d+ días$/.test(react[1]) && react[3] === "Dueño" && react[4] === AFF_NAME,
    "the reactivation appears under Reactivated: lapsed N days, Cobrado por Dueño, the original affiliate earns", react.join(" | "));
  check(!rowWith(section(r.text, "lapsed"), LAPSED_NAME), "the reactivated client is no longer under Lapsed");
  lapse = section(r.text, "lapse");
  const affLapse = cells(rowWith(lapse, AFF_NAME));
  check(affLapse.slice(1).join(" ") === "1 1 0 1 0%", "after renewal the lapse rate is a real 0% (came due 1, renewed 1, lapsed 0, reactivated 1)", affLapse.join(" | "));

  r = await http("/renewals/log", { cookie: lo });
  const coll = section(r.text, "collection");
  const colColl = cells(rowWith(coll, COL_NAME)), affColl = cells(rowWith(coll, AFF_NAME));
  const view = (await client.query(
    `select affiliate_id, collected_for_others::int, earned_collected_by_others::int from renewal_collection_by_affiliate where affiliate_id in ($1, $2)`,
    [colId, affId])).rows;
  const vCol = view.find((v) => v.affiliate_id === colId), vAff = view.find((v) => v.affiliate_id === affId);
  check(r.status === 200 && Number(colColl[2]) > 0 && Number(colColl[2]) === vCol.collected_for_others && colColl[3] === "$20.00",
    "Cobro vs comisión: the collector has collected_for_others > 0 and $20.00 cash", colColl.join(" | "));
  check(Number(affColl[5]) > 0 && Number(affColl[5]) === vAff.earned_collected_by_others && Number(affColl[4]) === 2,
    "Cobro vs comisión: the original affiliate has earned_collected_by_others > 0", affColl.join(" | "));
  const tests = [...coll.matchAll(/<tr[\s>][\s\S]*?<\/tr>/g)].map((m) => m[0].includes("PRUEBA"));
  check(tests.indexOf(true) === -1 || tests.slice(tests.indexOf(true)).every(Boolean), "test affiliates are listed last");
  const log = section(r.text, "log");
  const byOther = cells(rowWith(log, AFF_CLIENT_NAME));
  check(/\d{1,2}:\d{2}$/.test(byOther[0]) && byOther[2] === COL_NAME && byOther[3] === AFF_NAME && byOther[2] !== byOther[3]
    && byOther[6].includes("Cobrado por otro afiliado") && byOther[1].includes(`${affCode.slice(0, 4)}-${affCode.slice(4)}`),
    "the renewal log shows a 24 h time, the code, Cobrado por and Gana as different names, and the other-affiliate mark", byOther.join(" | "));
  const byOwner = cells(rowWith(log, LAPSED_NAME));
  check(byOwner[2] === "Dueño" && byOwner[3] === AFF_NAME && /Reactivación, vencido \d+ días/.test(byOwner[6]) && !byOwner[6].includes("otro afiliado"),
    "the renewal log shows the owner's reactivation as Dueño, with its lapsed days and no other-affiliate mark", byOwner.join(" | "));
  const houseVoided = (await client.query("select voided_at is not null as v from subscriptions where client_id = $1 and kind = 'renewal'", [clientId])).rows[0].v;
  check(cells(rowWith(log, name))[6]?.includes("Anulado") === houseVoided, "the renewal log marks a voided renewal Anulado exactly when it is voided", String(houseVoided));

  r = await http(`/clients/${affClient}`, { cookie: lo });
  check(r.text.includes("Cobrado por") && cells(rowWith(r.text, COL_NAME)).includes(COL_NAME), "client detail shows Cobrado por: the collecting affiliate");
  r = await http(`/clients/${lapsedClient}`, { cookie: lo });
  const ownerSub = cells((r.text.match(/<tr[\s>][\s\S]*?<\/tr>/g) ?? []).find((x) => x.includes("Reactivación")));
  check(ownerSub.includes("Dueño"), "client detail shows Cobrado por Dueño and the Reactivación mark", ownerSub.join(" | "));
  r = await http(`/affiliates/${colId}`, { cookie: lo });
  check(r.text.includes("renovaciones cobradas para otros afiliados") && r.text.includes("efectivo cobrado en persona"), "affiliate detail shows renewals collected for others and cash collected");
  r = await http(`/affiliates/${affId}`, { cookie: lo });
  check(r.text.includes("ganado en registros") && r.text.includes("ganado en renovaciones"), "affiliate detail shows registrations earned vs renewals earned");
  r = await http("/affiliates", { cookie: lo });
  check(r.text.includes("Tasa de vencimiento") && cells(rowWith(r.text, COL_NAME)).at(-1) === "Nadie ha llegado a su renovación todavía"
    && cells(rowWith(r.text, AFF_NAME)).at(-1) === "0%", "/affiliates has a lapse rate column", cells(rowWith(r.text, AFF_NAME)).join(" | "));

  // 7. every page returns 200, with no framework JS
  const pages = [
    "/", "/clients", "/clients?status=active", `/clients?aff=${affId}&q=smoke`, "/clients/new", "/clients/new?country=MX",
    `/clients/${clientId}`, `/clients/${clientId}/code`, `/clients/${affClient}`, "/renewals", "/renewals/log", "/affiliates", "/affiliates/new", `/affiliates/${affId}`,
    `/affiliates/${affId}?confirm=deactivate`, `/affiliates/${affId}?confirm=reset`, "/revenue", "/feeds", "/alerts",
  ];
  for (const p of pages) {
    r = await http(p, { cookie: lo });
    check(r.status === 200 && noFrameworkJs(r.text), `GET ${p} is 200 with no <script src> or /_next/`, `${r.status}`);
  }
  for (const p of ["/login", "/setup?token=nope"]) {
    r = await http(p);
    check(r.status === 200 && noFrameworkJs(r.text), `GET ${p} (signed out) is 200 with no framework JS`, `${r.status}`);
  }
  r = await http("/health");
  check(r.status === 200 && JSON.parse(r.text).surface === "admin" && JSON.parse(r.text).status === "ok", "GET /health reports admin ok");
  check((await http("/clients/00000000-0000-4000-8000-000000000000", { cookie: lo })).status === 404, "an unknown client is 404");

  // 8. an affiliate's credentials and cookies are refused on admin
  r = await http("/api/login", { method: "POST", form: { login: AFF, password: AFF_PW } });
  check(r.location === "/login?m=invalid" && !cookieFrom(r, "lo"), "an affiliate's correct password does not sign in to admin", r.location);
  const forged = [
    [`la=${makeToken("affiliate", affAuth)}`, "the affiliate portal's own cookie"],
    [`lo=${makeToken("affiliate", affAuth)}`, "an affiliate-signed token in the owner cookie"],
    [`lo=${makeToken("owner", affAuth)}`, "an owner-signed token for an affiliate account"],
  ];
  for (const [cookie, what] of forged) {
    r = await http("/", { cookie });
    const api = await http("/api/affiliates/payout", { method: "POST", cookie, form: { affiliate_id: affId, amount: "1", last_payout: "none" } });
    check(r.status === 307 && r.location === "/login" && api.status === 303 && api.location === "/login", `${what} is rejected`, `${r.status} ${api.location}`);
  }

  // Destructive actions last: they end the affiliate's sessions.
  r = await http("/api/affiliates/update", { method: "POST", cookie: lo, form: { affiliate_id: affId, action: "deactivate" } });
  check(r.location.endsWith("ok=deactivated"), "the affiliate is deactivated", r.location);
  r = await http("/api/affiliates/update", { method: "POST", cookie: lo, form: { affiliate_id: affId, action: "reactivate" } });
  check(r.location.endsWith("ok=reactivated"), "the affiliate is reactivated", r.location);
  r = await http("/api/affiliates/reset", { method: "POST", cookie: lo, form: { affiliate_id: affId } });
  const resetFlash = cookieFrom(r, "lo_setup");
  const shown = await http(`/affiliates/${affId}?ok=reset`, { cookie: `${lo}; ${resetFlash}` });
  check(r.location.endsWith("ok=reset") && /setup\?token=[0-9a-f]{48}/.test(shown.text), "resetting the login shows a new setup link");

  // 9. logout
  r = await http("/api/logout", { method: "POST", cookie: lo });
  check(r.status === 303 && r.location === "/login?m=out" && r.setCookie.some((c) => c.startsWith("lo=;") && c.includes("Max-Age=0")), "logout clears the owner cookie");
  check((await http("/", { cookie: "lo=" })).location === "/login", "after logout / redirects to /login");
  r = await http("/", { cookie: lo });
  check(r.status === 307 && r.location === "/login", "the signed-out cookie itself no longer works (server-side sign-out)", `${r.status} ${r.location}`);
} catch (err) {
  fail(`unexpected error: ${err?.stack ?? err}`);
} finally {
  await client.end().catch(() => {});
}

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
