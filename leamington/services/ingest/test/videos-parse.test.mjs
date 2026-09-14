/**
 * Football videos without a database: YouTube Atom parsing on real saved feeds
 * (test/fixtures/videos, fetched 2026-09-14), is_highlight on real titles,
 * team matching including every guarded name, and thumbnail limits.
 *   node --test test/videos-parse.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import jpeg from "jpeg-js";

import { parseYouTubeFeed, ytimgUrl, mqThumbUrl, feedUrl } from "../src/feeds/videos/youtube.mjs";
import { classifyTitle, isHighlight } from "../src/feeds/videos/highlight.mjs";
import { buildTeamIndex, matchTeams, clubTeam, tokens } from "../src/feeds/videos/teams.mjs";
import { makeThumb, box169, THUMB } from "../src/feeds/videos/thumb.mjs";
import { photoJpeg } from "./helpers/news-images.mjs";

const fixture = (name) => readFileSync(new URL(`./fixtures/videos/${name}`, import.meta.url), "utf8");

test("a real channel feed: 15 entries, Shorts marked, ids, watch urls, views, i.ytimg.com thumbnails", () => {
  const p = parseYouTubeFeed(fixture("liga-bbva-mx.xml"));
  assert.equal(p.channelId, "UCq8BPLXtFeiSFOvmJrknWGg");
  assert.equal(p.channelName, "LIGA BBVA MX");
  assert.equal(p.entries.length, 15);
  assert.equal(p.dropped, 0);
  assert.equal(p.entries.filter((e) => e.isShort).length, 10, "the feed carries Shorts (/shorts/ links)");
  const first = p.entries[0];
  assert.deepEqual(
    { id: first.youtubeId, url: first.url, title: first.title, at: first.publishedAt.toISOString(), views: first.views, short: first.isShort },
    { id: "s459I1LgkpE", url: "https://www.youtube.com/watch?v=s459I1LgkpE", title: "SANTOS 2-1 JUÁREZ J8 AP26 | Los Guerreros logran una voltereta y logran su primer triunfo del torneo",
      at: "2026-09-14T05:06:34.000Z", views: 32076, short: false });
  assert.ok(p.entries.every((e) => /^https:\/\/i\d?\.ytimg\.com\/vi\/[\w-]{11}\/hqdefault\.jpg$/.test(e.thumbUrl)), "thumbnails over https from YouTube's CDN");
  assert.equal(feedUrl("UCq8BPLXtFeiSFOvmJrknWGg"), "https://www.youtube.com/feeds/videos.xml?channel_id=UCq8BPLXtFeiSFOvmJrknWGg");
  assert.equal(mqThumbUrl("s459I1LgkpE"), "https://i.ytimg.com/vi/s459I1LgkpE/mqdefault.jpg");

  const hn = parseYouTubeFeed(fixture("deportes-tvc-hn.xml"));
  assert.equal(hn.channelId, "UC4f_is0qbF8WTiJlPWqn8Rw");
  assert.ok(hn.entries.some((e) => e.title === "Marathón 1 - 0 Olimpia | Jornada 7 | Liga Nacional - Apertura 2026 - 2027"), "entities decoded");
});

test("not a feed is a failure, never an empty channel; a bad entry is dropped; only YouTube's image host", () => {
  assert.throws(() => parseYouTubeFeed("<!doctype html><html><body>Before you continue to YouTube</body></html>"), /not a feed \(an HTML page\)/);
  assert.throws(() => parseYouTubeFeed(""), /not a feed/);
  const p = parseYouTubeFeed(`<feed xmlns="http://www.w3.org/2005/Atom"><title>X</title>
    <entry><yt:videoId>short</yt:videoId><title>Bad id</title><published>2026-09-14T00:00:00+00:00</published></entry>
    <entry><yt:videoId>abcdefghijk</yt:videoId><title>No date</title></entry>
    <entry><yt:videoId>abcdefghijk</yt:videoId><title>Ok &amp; fine</title><link rel="alternate" href="https://www.youtube.com/watch?v=abcdefghijk"/><published>2026-09-14T00:00:00+00:00</published>
      <media:group><media:thumbnail url="https://evil.example/vi/abcdefghijk/hqdefault.jpg" width="480" height="360"/></media:group></entry></feed>`);
  assert.equal(p.dropped, 2);
  assert.deepEqual([p.entries[0].title, p.entries[0].thumbUrl, p.entries[0].views], ["Ok & fine", null, null]);
  assert.equal(ytimgUrl("http://i.ytimg.com/vi/abcdefghijk/mqdefault.jpg"), "https://i.ytimg.com/vi/abcdefghijk/mqdefault.jpg");
  assert.equal(ytimgUrl("https://i.ytimg.com.evil.example/x.jpg"), null);
});

test("is_highlight on real titles, with the exclusions", () => {
  const yes = [
    "SANTOS 2-1 JUÁREZ J8 AP26 | Los Guerreros logran una voltereta y logran su primer triunfo del torneo",   // LIGA BBVA MX
    "RESUMEN Y GOLES - Santos vs Juárez | Liga MX - Jornada 8 Apertura 2026 | TUDN",
    "RESUMEN SUPER EXTENDIDO - Santos vs Juárez | Liga MX - Jornada 8 Apertura 2026 | TUDN",
    "Marathón 1 - 0 Olimpia | Jornada 7 | Liga Nacional - Apertura 2026 - 2027",                             // Deportes TVC
    "Top 5 Goles de la Jornada 7 - Liga Nacional de Honduras - Apertura 2026-2027",
    "Montego Bay United vs Harbour View - Extended Match Highlights",                                        // MoBay United
    "Montego Bay United vs Tivoli Gardens - All Goals Highlights",
    "¡TODOS LOS GOLES DEL PARTIDO! | RESUMEN COMPLETO | CHIVAS vs PUMAS J8 AP26",                              // Chivas
    "Olimpia 4-1 Platense | Noche de goles en Comayagua | Resumen Jornada 6",                                  // Olimpia
    "Guastatoya 2-1 Xelajú MC | Jornada 9 | Apertura 2026",                                                   // Guatefutbol TV
    "Inside The House|Match Highlights|Waterhouse 1-0 Montego Bay United 🔥🩵💛🏡",                             // Waterhouse FC
  ];
  const no = [
    ["Gabriel Milito en Conferencia de Prensa | Chivas vs Pumas | Jornada 8 AP2026", "never:conferencia"],
    ["CONFERENCIA DE PRENSA J8 SANTOS 2-1 JUAREZ AP26", "never:conferencia"],
    ["Javier Ainstein Pre-Match Press Conference | Matchday 1 vs Chapelton Maroons", "never:press conference"],
    ["Azul De Por Vida: El Podcast | Episodio 8 | Rodolfo Rotondi", "never:podcast"],
    ["EN VIVO | MARATHÓN VS OLIMPIA | FECHA 7 APERTURA 2026", "not-unless-said:en vivo"],
    ["LIVE: Tivoli Gardens vs Humble Lion FC | Match Day 1 | 2026-2027 Jamaica Premier League", "not-unless-said:live"],
    ["Coach Hubert Busby speaks after 0-0 draw with Panama", "never:speaks"],
    ["Henry Figueroa expresa su felicidad tras anotar el gol de la victoria ante Olimpia", "never:expresa"],
    ["Se ACABARON las VACACIONES en AMÉRICA tras DERROTA ante CRUZ AZUL | Lo mejor Futbol Picante", "never:futbol picante"],
    ["Los jugadores cremas perdieron la confianza | Cuadro Titular | domingo 13 de septiembre", "never:cuadro titular"],
    ["¡LO MANDÓ A DORMIR! Omar Chávez vs Brayan Santander | PELEA COMPLETA y NOCAUT | Box Azteca", "never:box azteca"],
    ["Así se vio #ElPasillo de Chivas contra Pumas. ⚔️", "no-signal"],
    ["Así se vivió el pasillo del Clásico Regio", "not-unless-said:pasillo"],
    ["CRUZ AZUL GOLEA al AMÉRICA y CARLOS HERMOSILLO se lo FESTEJA al POLLO ORTIZ y PAUL AGUILAR", "no-signal"],
  ];
  for (const t of yes) assert.ok(isHighlight(t), `${t}: ${JSON.stringify(classifyTitle(t))}`);
  for (const [t, why] of no) assert.deepEqual(classifyTitle(t), { highlight: false, why }, t);
});

// Teams as the fixtures provider names them; league ids per country.
const L = { MX: 1, HN: 2, GT: 3, JM: 4 };
const T = [
  ["MX", "Club America"], ["MX", "Cruz Azul"], ["MX", "Guadalajara Chivas"], ["MX", "U.N.A.M. - Pumas"], ["MX", "Santos Laguna"], ["MX", "FC Juarez"],
  ["MX", "Monterrey"], ["MX", "Tigres UANL"], ["MX", "Toluca"], ["MX", "Atlas"],
  ["HN", "CD Motagua"], ["HN", "Olimpia"], ["HN", "Real España"], ["HN", "Marathón"], ["HN", "Platense"], ["HN", "Victoria"], ["HN", "Vida"], ["HN", "Génesis"],
  ["GT", "Comunicaciones"], ["GT", "Municipal"], ["GT", "Xelaju MC"], ["GT", "Guastatoya"],
  ["JM", "Montego Bay United"], ["JM", "Harbour View"], ["JM", "Cavalier"], ["JM", "Mount Pleasant"], ["JM", "Arnett Gardens"], ["JM", "Portmore United"],
  ["JM", "Tivoli Gardens"], ["JM", "Waterhouse"], ["JM", "Chapelton Maroons"],
].map(([country, name], i) => ({ id: i + 1, league_id: L[country], country, name, short_name: null }));
const idx = buildTeamIndex(T);
const id = (name) => T.find((t) => t.name === name).id;
const names = (ms) => ms.map((m) => T.find((t) => t.id === m.teamId).name).sort();
const tv = (country) => ({ country, league_id: null, kind: "broadcaster", name: `tv-${country}` });
const league = (country) => ({ country, league_id: L[country], kind: "league", name: `league-${country}` });
const NOW = "2026-09-14T12:00:00Z";
const m = (title, channel, opts) => matchTeams({ title, publishedAt: NOW }, channel, idx, opts);

test("team matching on real titles: aliases anywhere, guarded names only in a match title", () => {
  assert.deepEqual(names(m("CRUZ AZUL 4-3 AMÉRICA | Partidazo y la Máquina se queda con los 3 puntos | J8 AP26", league("MX"))), ["Club America", "Cruz Azul"]);
  assert.deepEqual(m("CRUZ AZUL 4-3 AMÉRICA | Partidazo", league("MX")).find((x) => x.teamId === id("Club America")), { teamId: id("Club America"), matched: "América", rule: "name+match" });
  assert.deepEqual(names(m("RESUMEN Y GOLES - Santos vs Juárez | Liga MX - Jornada 8 Apertura 2026 | TUDN", tv("MX"))), ["FC Juarez", "Santos Laguna"]);
  assert.deepEqual(names(m("MONTERREY 0-0 TIGRES | Nada para nadie en el Clásico Regio | J8 AP26", league("MX"))), ["Monterrey", "Tigres UANL"]);
  assert.deepEqual(names(m("Marathón 1 - 0 Olimpia | Jornada 7 | Liga Nacional - Apertura 2026 - 2027", tv("HN"))), ["Marathón", "Olimpia"]);
  assert.deepEqual(names(m("¿Motagua demostró contra Alianza que está para ser campeón de la Copa Centroamericana?", tv("HN"))), ["CD Motagua"], "an alias counts in any title");
  assert.deepEqual(names(m("Cobán Imperial 2-2 Comunicaciones | Jornada 9 | Apertura 2026", tv("GT"))), ["Comunicaciones"], "Comunicaciones is an alias; Cobán is not in these teams");
  assert.deepEqual(names(m("Municipal 2-2 Malacateco | Apertura 2026 | Jornada 9", tv("GT"))), [], "Municipal needs another club of the league on the other side");
  assert.deepEqual(names(m("Municipal 2-2 Xelajú MC | Apertura 2026 | Jornada 9", tv("GT"))), ["Municipal", "Xelaju MC"]);
  assert.deepEqual(names(m("Montego Bay United vs Harbour View - Extended Match Highlights", tv("JM"))), ["Harbour View", "Montego Bay United"]);
  assert.deepEqual(names(m("LIVE: Portmore United vs Cavalier F.C. | SUPER-FINALS | 2025-2026 Jamaica Premier League", league("JM"))), ["Cavalier", "Portmore United"]);
  assert.deepEqual(names(m("LIVE: Tivoli Gardens vs Humble Lion FC | Match Day 1", league("JM"))), [], "Tivoli Gardens is guarded and Humble Lion is not one of these teams");
  assert.deepEqual(names(m("Inside Fyah House|Full Match Highlights| WFC 3-STP 0|PUFC 0-1 WFC", tv("JM"))), [], "initials are not names");
});

test("every guarded name: never alone, never from another country, never in the phrases that are not the club", () => {
  const MUST_NOT = [
    ["MX", "¡MENSAJE PARA EL AMÉRICA! 😳 “Lo vamos a jugar como se tiene que jugar”: Amaury Vergara"],
    ["MX", "Copa América 2028: México vs Estados Unidos"],
    ["MX", "Selección Mexicana vs América de Cali | Amistoso"],
    ["MX", "Latin America vs North America All-Star Game"],
    ["MX", "REAL MADRID JUGÓ MUY MAL ante el RAYO VALLECANO. JOSÉ MOURINHO no MUESTRA ENERGÍA"],
    ["HN", "Real Madrid vs Real España: la final soñada"],
    ["HN", "Club Olimpia Paraguay 2-0 Cerro Porteño | Resumen"],
    ["HN", "Olimpia se enfrenta a Firpo en la Copa Centroamericana | Cuadro Titular"],
    ["HN", "Marathón llega motivado a Costa Rica | Cuadro Titular | 13 de septiembre"],
    ["HN", "RESUMEN: Platense 0-3 Internacional Santa Tecla (J7 | Apertura 2026)"],
    ["HN", "Victoria 3-0 Tela FC | RESUMEN Y GOLES"],
    ["HN", "Vida saludable para futbolistas"],
    ["GT", "Mundial de Clubes: Municipal de Lima vs Universitario"],
    ["GT", "Seguridad municipal en el estadio"],
    ["JM", "Mount Pleasant FA vs Salcedo FC | Concacaf Caribbean Cup"].map((x, i) => (i ? x.replace("FA", "") : x)),
    ["JM", "Harbour View residents protest road works"],
    ["JM", "Portmore mall opens new food court"],
    ["JM", "Arnett Gardens community day"],
    ["JM", "Cavalier Pride: school sports day"],
    ["HN", "Génesis 1:1 En el principio creó Dios"],
  ];
  for (const [c, t] of MUST_NOT) assert.deepEqual(names(m(t, tv(c))), [], `${c}: ${t}`);

  // A Mexican channel never matches a Honduran club, whatever the title.
  assert.deepEqual(names(m("Motagua vs Olimpia | Resumen", tv("MX"))), []);
  // A guarded name from a channel of another league of the same country is refused.
  assert.deepEqual(names(m("Marathón 1 - 0 Olimpia", { country: "HN", league_id: 99, kind: "league" })), []);
  // Guarded names confirmed by a stored fixture (both clubs named, kickoff near the publish time).
  const fixtures = [{ home_team_id: id("Olimpia"), away_team_id: id("Marathón"), kickoff: "2026-09-13T01:00:00Z" }];
  assert.deepEqual(m("Yairo Moreno en exclusiva tras el triunfo de Marathón ante Olimpia en el Clásico", tv("HN"), { fixtures }).map((x) => x.rule), ["name+fixture", "name+fixture"]);
  assert.deepEqual(m("Yairo Moreno en exclusiva tras el triunfo de Marathón ante Olimpia en el Clásico", tv("HN")), [], "without the fixture: nothing");
  assert.deepEqual(m("Marathón ante Olimpia", tv("HN"), { fixtures: [{ ...fixtures[0], kickoff: "2026-08-01T01:00:00Z" }] }), [], "a fixture weeks away does not confirm");
});

test("club channels count for their own club; women's, youth and reserve sides never count", () => {
  const club = { country: "MX", league_id: null, kind: "club", club_key: "mx-america", name: "Club América" };
  assert.equal(clubTeam(idx, club).id, id("Club America"));
  const own = m("Presentación de Refuerzos - Santiago Baños y Antonio Ibrahim", { ...club, team_id: id("Club America") });
  assert.deepEqual(own, [{ teamId: id("Club America"), matched: "Club América", rule: "club_channel" }]);
  const chivas = { country: "MX", league_id: null, kind: "club", team_id: id("Guadalajara Chivas"), name: "Chivas" };
  assert.deepEqual(names(m("¡EL GOLAZO DE SANTIAGO SANDOVAL! | CHIVAS VS PUMAS | CHIVASTV 🔴⚪️", chivas)), ["Guadalajara Chivas", "U.N.A.M. - Pumas"]);
  for (const t of ["🔴 EN VIVO: Chivas vs Pumas Sub21 | Jornada 8 Apertura 2026.", "SUB19 RESUMEN Y GOLES: CHIVAS VS PUMAS | J8 APERTURA 2026",
    "Resumen | Cruz Azul Femenil vs Pumas | Jornada 7 | Apertura 2026", "Resumen | Cruz Azul Hidalgo vs Piratas FC | Liga de Expansión | Jornada 8 | Apertura 2026",
    // From the 2026-09-14 dry run: a hyphenated age group, and "FEM".
    "Sub-19 | FC Juárez vs América | AP26", "🔴 📹 Rayados vs Tigres Sub-21 | Jornada 8", "¡EL LATIDO DEL CUARTO TRIUNFO DEL TORNEO! | CHIVAS FEM vs PUMAS FEM | AP26"]) {
    assert.deepEqual(m(t, chivas), [], t);
  }
  assert.deepEqual(tokens("CHIVAS 🆚 Pumas 2-1"), ["chivas", "vs", "pumas", "2", "-", "1"]);
});

test("thumbnails: 320 x 180, at most 14 KB, letterbox bars cropped, small or non-JPEG refused", () => {
  const mq = makeThumb(photoJpeg(320, 180));
  assert.deepEqual([mq.width, mq.height], [320, 180]);
  assert.ok(mq.bytes.length <= THUMB.maxBytes, `${mq.bytes.length}`);
  const hq = makeThumb(photoJpeg(480, 360));
  assert.deepEqual([hq.width, hq.height], [320, 180], "hqdefault's 4:3 frame gives its 16:9 band");
  assert.deepEqual(box169(480, 360), { x: 0, y: 45, w: 480, h: 270 });
  const noisy = Buffer.from(jpeg.encode({ data: Buffer.from(Array.from({ length: 320 * 180 * 4 }, () => Math.floor(Math.random() * 256))), width: 320, height: 180 }, 95).data);
  // The busiest picture (pure noise) is made smaller in quality, then in width, but never over the limit.
  const n = makeThumb(noisy);
  assert.ok(n.bytes.length <= THUMB.maxBytes && (n.quality <= 32 || n.width === 288), `${n.bytes.length} B, q${n.quality}, ${n.width} px`);
  assert.equal(n.height, Math.round(n.width * 9 / 16));
  assert.throws(() => makeThumb(photoJpeg(100, 56)), /only 100 px wide/);
  assert.throws(() => makeThumb(Buffer.from("<html>")), /not a JPEG/);
  assert.throws(() => makeThumb(Buffer.alloc(0)), /empty/);
});
