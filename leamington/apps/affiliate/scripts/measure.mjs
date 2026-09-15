// Transferred bytes for the affiliate portal, counted on the wire: compressed
// response bodies plus response headers. Budget (docs/DESIGN.md): cold ≤ 25 KB,
// warm ≤ 10 KB, no JavaScript.
//
// Cold: sign in, open the clients list, register one client, see its code.
// Warm: open the clients list again.
// Renewal cold/warm: /renew, POST lookup, status page, POST record, receipt,
// twice for that client (the second with the confirmation box).
//
// LOCAL ONLY: it registers a client and renews it twice, which records a $20
// sale and two $20 renewals.
//
//   BASE=http://localhost:3200 LOGIN=ana PASSWORD=... node scripts/measure.mjs
import http from "node:http";
import zlib from "node:zlib";

const BASE = new URL(process.env.BASE ?? "http://localhost:3200");
if (!["localhost", "127.0.0.1", "[::1]"].includes(BASE.hostname)) {
  console.error(`REFUSING: ${BASE.origin} is not local. This script records a sale.`);
  process.exit(2);
}
const LOGIN = process.env.LOGIN;
const PASSWORD = process.env.PASSWORD;
if (!LOGIN || !PASSWORD) { console.error("set LOGIN and PASSWORD for an affiliate account"); process.exit(2); }
const COLD_BUDGET = 25_000;
const WARM_BUDGET = 10_000;

function send(path, { method = "GET", cookie, form } = {}) {
  const body = form ? new URLSearchParams(form).toString() : null;
  return new Promise((resolve, reject) => {
    const headers = {
      "accept-encoding": "br, gzip",
      "user-agent": "Mozilla/5.0 (Linux; Android 11; SM-A022M) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36",
      accept: "text/html,*/*",
    };
    if (cookie) headers.cookie = cookie;
    if (body != null) {
      headers["content-type"] = "application/x-www-form-urlencoded";
      headers["content-length"] = Buffer.byteLength(body);
    }
    const req = http.request({ host: BASE.hostname, port: BASE.port, path, method, headers }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const raw = Buffer.concat(chunks);
        let head = `HTTP/1.1 ${res.statusCode} ${res.statusMessage}\r\n`;
        for (let i = 0; i < res.rawHeaders.length; i += 2) head += `${res.rawHeaders[i]}: ${res.rawHeaders[i + 1]}\r\n`;
        const encoding = res.headers["content-encoding"] ?? "none";
        const decoded = encoding === "gzip" ? zlib.gunzipSync(raw).toString()
          : encoding === "br" ? zlib.brotliDecompressSync(raw).toString() : raw.toString();
        resolve({
          label: `${method} ${path}`, status: res.statusCode, encoding, body: raw.length, headers: Buffer.byteLength(head + "\r\n"),
          decoded, cookie: res.headers["set-cookie"]?.find((c) => c.startsWith("la="))?.split(";")[0], location: res.headers.location,
        });
      });
    });
    req.on("error", reject);
    if (body != null) req.write(body);
    req.end();
  });
}

const row = (r) => `  ${r.label.slice(0, 44).padEnd(44)} ${String(r.status).padEnd(4)} ${r.encoding.padEnd(5)} body ${String(r.body).padStart(6)}  headers ${String(r.headers).padStart(4)}  total ${String(r.body + r.headers).padStart(6)}`;
const total = (rs) => rs.reduce((s, r) => s + r.body + r.headers, 0);
// docs/DESIGN.md section 1 budgets a "Warm page". The renewal's warm run is five
// requests (three pages and two redirects), so it is checked page by page; its
// total is printed for information.
const largestOf = (rs) => Math.max(...rs.map((r) => r.body + r.headers));

const cold = [];
cold.push(await send("/login"));
const login = await send("/api/login", { method: "POST", form: { login: LOGIN, password: PASSWORD } });
cold.push(login);
const cookie = login.cookie;
if (!cookie) { console.error("sign-in did not set a session cookie:", login.status, "->", login.location); process.exit(1); }
cold.push(await send("/", { cookie }));
cold.push(await send("/register", { cookie }));
const form = await send("/register?country=MX", { cookie });
cold.push(form);
const region = /<select[^>]*id="region"[\s\S]*?<option value="([^"]+)"/.exec(form.decoded)?.[1];
const hasTeams = /<select[^>]*id="team"/.test(form.decoded);
const registered = await send("/api/register", {
  method: "POST", cookie, form: { country: "MX", name: `Medición ${Date.now().toString(36)}`, region: region ?? "", team: hasTeams ? "none" : "" },
});
cold.push(registered);
if (!registered.location?.startsWith("/clients/")) { console.error("registration failed:", registered.status, registered.location); process.exit(1); }
cold.push(await send(registered.location, { cookie }));

const warm = [await send("/", { cookie })];

// Renewal in person, for the client just registered: enter the code, look it up,
// the status page, collect, the receipt. Cold is the first renewal in this
// session; warm is the same flow again at once, which shows the recent-renewal
// warning and needs the confirmation box.
const code = /class="code"[^>]*>([A-Z0-9-]+)</.exec(cold[cold.length - 1].decoded)?.[1];
if (!code) { console.error("no code on the code page"); process.exit(1); }
async function renewalFlow(confirm) {
  const steps = [await send("/renew", { cookie })];
  const found = await send("/api/renew/lookup", { method: "POST", cookie, form: { code } });
  steps.push(found);
  if (!found.location?.startsWith("/renew/")) { console.error("lookup failed:", found.status, found.location); process.exit(1); }
  const status = await send(found.location, { cookie });
  steps.push(status);
  const value = (name) => new RegExp(`<input[^>]*name="${name}"[^>]*value="([^"]*)"`).exec(status.decoded)?.[1] ?? "";
  const form = { client_id: value("client_id"), request_key: value("request_key") };
  if (confirm) form.confirm_repeat = "1";
  const recorded = await send("/api/renew/record", { method: "POST", cookie, form });
  steps.push(recorded);
  if (!recorded.location?.startsWith("/renew/done/")) { console.error("renewal failed:", recorded.status, recorded.location); process.exit(1); }
  steps.push(await send(recorded.location, { cookie }));
  return steps.map((s) => ({ ...s, label: s.label.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/, "<uuid>") }));
}
const renewCold = await renewalFlow(false);
const renewWarm = await renewalFlow(true);

// Vista previa, cold: a fresh sign-in, the dashboard, the country, the search and
// the preview of a Mexican town. Warm: the same preview after changing the team
// (more=1). Its pictures are cached files outside the page budget (docs/DESIGN.md
// section 1, as Hoy's photos); their bytes are listed apart.
const PREVIEW_Q = process.env.PREVIEW_Q ?? "morelia";
const previewCold = [await send("/login")];
const login2 = await send("/api/login", { method: "POST", form: { login: LOGIN, password: PASSWORD } });
previewCold.push(login2);
const cookie2 = login2.cookie;
if (!cookie2) { console.error("second sign-in did not set a cookie"); process.exit(1); }
previewCold.push(await send("/", { cookie: cookie2 }));
previewCold.push(await send("/vista-previa", { cookie: cookie2 }));
// Exactly one town matches: the search answers with its preview.
const shown = await send(`/vista-previa?country=MX&q=${encodeURIComponent(PREVIEW_Q)}`, { cookie: cookie2 });
previewCold.push(shown);
const townId = /name="m" value="(\d+)"/.exec(shown.decoded)?.[1];
if (!townId) { console.error(`"${PREVIEW_Q}" did not match exactly one town`); process.exit(1); }
// Several towns match: the list, then the chosen town (the same sign-in, dashboard and form rows).
const PREVIEW_MANY = process.env.PREVIEW_MANY ?? "san";
const previewPick = previewCold.slice(0, 4);
const list = await send(`/vista-previa?country=MX&q=${encodeURIComponent(PREVIEW_MANY)}`, { cookie: cookie2 });
previewPick.push(list);
const pickId = /country=MX&amp;m=(\d+)/.exec(list.decoded)?.[1];
if (!pickId) { console.error(`"${PREVIEW_MANY}" listed no towns`); process.exit(1); }
previewPick.push(await send(`/vista-previa?country=MX&m=${pickId}`, { cookie: cookie2 }));
const previewWarm = [await send(`/vista-previa?country=MX&m=${townId}&more=1&team=none`, { cookie: cookie2 })];
const pictures = [];
for (const [, src] of shown.decoded.matchAll(/src="(\/api\/preview\/[^"]+)"/g)) pictures.push(await send(src, { cookie: cookie2 }));

console.log("Cold: sign in, clients, register a client, its code page");
cold.forEach((r) => console.log(row(r)));
console.log(`  TOTAL ${total(cold)} bytes (budget ${COLD_BUDGET})`);
console.log("\nWarm: the clients list again");
warm.forEach((r) => console.log(row(r)));
console.log(`  TOTAL ${total(warm)} bytes (budget ${WARM_BUDGET})`);
console.log("\nRenewal, cold: /renew, look up the code, status, collect, receipt");
renewCold.forEach((r) => console.log(row(r)));
console.log(`  TOTAL ${total(renewCold)} bytes (budget ${COLD_BUDGET})`);
console.log("\nRenewal, warm: the same again at once (warning + confirmation box)");
renewWarm.forEach((r) => console.log(row(r)));
console.log(`  TOTAL ${total(renewWarm)} bytes over ${renewWarm.length} requests; largest page ${largestOf(renewWarm)} (warm page budget ${WARM_BUDGET})`);

console.log("\nVista previa, cold: sign in, dashboard, the form, a search matching one town (its preview)");
previewCold.forEach((r) => console.log(row(r)));
console.log(`  TOTAL ${total(previewCold)} bytes (budget ${COLD_BUDGET})`);
console.log("\nVista previa, cold: sign in, dashboard, the form, a search listing several towns, the chosen one");
previewPick.forEach((r) => console.log(row(r)));
console.log(`  TOTAL ${total(previewPick)} bytes (budget ${COLD_BUDGET})`);
console.log("\nVista previa, warm: the preview again with another team choice");
previewWarm.forEach((r) => console.log(row(r)));
console.log(`  TOTAL ${total(previewWarm)} bytes (budget ${WARM_BUDGET})`);
console.log("\nVista previa pictures (cached 30 days, outside the page budget)");
pictures.forEach((r) => console.log(row({ ...r, label: r.label.replace(/\?.*$/, "") })));
console.log(`  TOTAL ${total(pictures)} bytes`);

const html = [...cold, ...warm, ...renewCold, ...renewWarm, ...previewCold, ...previewWarm].filter((r) => /<html/i.test(r.decoded));
const scripts = html.flatMap((r) => [...r.decoded.matchAll(/<script\b[^>]*>/g)].map((m) => `${r.label}: ${m[0]}`));
const external = scripts.filter((s) => /\bsrc=/.test(s));
const nextRefs = html.reduce((n, r) => n + (r.decoded.match(/\/_next\//g) ?? []).length, 0);
const largest = html.reduce((m, r) => (r.body + r.headers > m.body + m.headers ? r : m), html[0]);
console.log(`\nLargest page: ${largest.label}, ${largest.body + largest.headers} bytes on the wire, ${Buffer.byteLength(largest.decoded)} decoded`);
console.log(`<script> tags across ${html.length} pages: ${scripts.length}; with src: ${external.length}${external.length ? " -> " + external.join(" ") : ""}`);
console.log(`references to /_next/: ${nextRefs}`);

const over = [];
if (total(cold) > COLD_BUDGET) over.push(`cold ${total(cold)} > ${COLD_BUDGET}`);
if (total(warm) > WARM_BUDGET) over.push(`warm ${total(warm)} > ${WARM_BUDGET}`);
if (total(renewCold) > COLD_BUDGET) over.push(`renewal cold ${total(renewCold)} > ${COLD_BUDGET}`);
if (largestOf(renewWarm) > WARM_BUDGET) over.push(`renewal warm page ${largestOf(renewWarm)} > ${WARM_BUDGET}`);
if (total(previewCold) > COLD_BUDGET) over.push(`preview cold ${total(previewCold)} > ${COLD_BUDGET}`);
if (total(previewPick) > COLD_BUDGET) over.push(`preview cold, picked from a list ${total(previewPick)} > ${COLD_BUDGET}`);
if (total(previewWarm) > WARM_BUDGET) over.push(`preview warm ${total(previewWarm)} > ${WARM_BUDGET}`);
if (scripts.length || nextRefs) over.push("framework or page JavaScript present");
console.log(over.length ? `\nOVER BUDGET: ${over.join("; ")}` : "\nWITHIN BUDGET");
process.exit(over.length ? 1 : 0);
