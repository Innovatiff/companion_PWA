/**
 * Fútbol v2 without a database: Shorts on real saved feeds (test/fixtures/videos,
 * fetched 2026-09-14 and 2026-09-15), categories on real titles, national teams
 * (aliases, match titles, federation channels, the women's team apart) with
 * titles that must not match, club matching of real news headlines with the
 * news guards, and the vertical Short thumbnail.
 *   node --test test/futbol-v2-parse.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { parseYouTubeFeed } from "../src/feeds/videos/youtube.mjs";
import { classifyVideo } from "../src/feeds/videos/highlight.mjs";
import { matchNations } from "../src/feeds/videos/nations.mjs";
import { buildTeamIndex, ALIAS_DATA } from "../src/feeds/videos/teams.mjs";
import { matchNewsTeams, footballContext } from "../src/feeds/news/teams.mjs";
import { makeShortThumb, box916, THUMB } from "../src/feeds/videos/thumb.mjs";
import { photoJpeg } from "./helpers/news-images.mjs";

const feeds = new Map();
const feed = (name) => feeds.get(name) ?? feeds.set(name, parseYouTubeFeed(readFileSync(new URL(`./fixtures/videos/${name}`, import.meta.url), "utf8"))).get(name);
/** The full title of the entry of a saved feed that starts with `start`. */
const title = (name, start) => {
  const e = feed(name).entries.find((x) => x.title.startsWith(start));
  assert.ok(e, `${name}: no title starting "${start}"`);
  return e.title;
};

test("Shorts on real feeds: the /shorts/ link is the only sign, and a Short's url is its /shorts/ page", () => {
  for (const [name, channelId, shorts] of [["liga-bbva-mx.xml", "UCq8BPLXtFeiSFOvmJrknWGg", 10], ["seleccion-mexicana.xml", "UC3D3rXIt1zy-TC_wJ3V8Z_w", 8], ["concacaf.xml", "UCqn7r-so0mBLaJTtTms9dAQ", 8]]) {
    const p = feed(name);
    assert.equal(p.channelId, channelId);
    assert.equal(p.entries.filter((e) => e.isShort).length, shorts, name);
    for (const e of p.entries) {
      assert.equal(e.url, e.isShort ? `https://www.youtube.com/shorts/${e.youtubeId}` : `https://www.youtube.com/watch?v=${e.youtubeId}`, e.title);
      assert.match(e.thumbUrl, /^https:\/\/i\d?\.ytimg\.com\/vi\/[\w-]{11}\/hqdefault\.jpg$/, "the same 480 x 360 thumbnail for Shorts and videos");
    }
  }
  const short = feed("liga-bbva-mx.xml").entries.find((e) => e.title.startsWith("#ElPasillo del @clubamerica"));
  assert.ok(short.isShort);
});

test("categories on real titles (Spanish and English, accents and case ignored)", () => {
  const cases = [
    // highlight: a summary word or a result line
    ["highlight", title("liga-bbva-mx.xml", "SANTOS 2-1 JUÁREZ")],
    ["highlight", title("tudn-mexico.xml", "RESUMEN Y GOLES - Santos vs Juárez")],
    ["highlight", title("concacaf.xml", "Motagua toma ventaja")],
    ["highlight", title("mobay-united.xml", "Montego Bay United vs Harbour View")],
    ["highlight", title("deportes-tvc-hn.xml", "Marathón 1 - 0 Olimpia")],
    ["highlight", "Resumen: Independiente 2 - 1 Juticalpa FC | Liga Nacional Hondubet | Jornada #7"],          // Multicable TV
    ["highlight", "MINI RESUMEN: León 2-0 Atlético San Luis | Apertura 2026"],                               // TUDN USA
    // goals: a goal word without a summary word
    ["goals", title("deportes-tvc-hn.xml", "Top 5 Goles de la Jornada 7")],
    ["goals", title("mobay-united.xml", "GOAL! ⚽️ What a volley")],
    ["goals", title("concacaf.xml", "El primer golpe es de Club Olimpia")],
    ["goals", title("tvj.xml", "TAJAY GRANT OPENS THE ACCOUNT!")],
    ["goals", title("tudn-mexico.xml", "¡Golazo de Lozano para Santos!")],
    ["goals", "¡GOOOL de Díber Cambindo para León con un gran remate! #shorts"],                              // TUDN USA
    ["goals", "Goles: Cobán 2 Comunicaciones 2."],                                                           // Tiki Taka
    // interview: press conferences, post-match words, a player telling it
    ["interview", "Gabriel Milito en Conferencia de Prensa | Chivas vs Pumas | Jornada 8 AP2026"],
    ["interview", title("mobay-united.xml", "Javier Ainstein Pre-Match Press Conference")],
    ["interview", title("deportes-tvc-hn.xml", "Henry Figueroa expresa")],
    ["interview", title("ffh-plus.xml", "Así fue el Media Day")],
    ["interview", title("liga-bbva-mx.xml", "Esta es #LaReacción de Esteban Lozano")],
    ["interview", title("liga-bbva-mx.xml", "Luego del juegazo")],
    ["interview", title("jfflive.xml", "Coach Hubert Busby speaks")],
    // preview
    ["preview", title("tudn-mexico.xml", "Se viene el Clásico Nacional")],
    ["preview", title("seleccion-mexicana.xml", "¡ANDRÉS GUARDADO VUELVE!")],
    ["preview", "previa Cremas vs Malacateco"],
    // other: talk shows, analysis, podcasts, live and full matches, tunnels, news
    ["other", title("tudn-mexico.xml", "¡BAILE AZUL!")],
    ["other", title("ffh-plus.xml", "Análisis Arbitral Jornada 6")],
    ["other", title("ffh-plus.xml", "Episodio 02 del Podcast FFH")],
    ["other", title("tvj.xml", "FULL MATCH: Molynes United FC vs Treasure Beach FC")],
    ["other", title("tvj.xml", "Privy Council Visa Waiver")],
    ["other", "EN VIVO | MARATHÓN VS OLIMPIA | FECHA 7 APERTURA 2026"],
    ["other", title("liga-bbva-mx.xml", "Así se vio #ElPasillo")],
    ["other", title("liga-bbva-mx.xml", "#POV: Eres testigo")],
    ["other", "Selección Nacional Guatemala: Resumen primer entreno del presente microciclo de trabajo"],       // FEDEFUT: training
    ["other", "Rayados Gaming Cup ya comenzó y te traemos los highlights de la primera fase!👊🏼🎮"],             // Monterrey: esports
    ["other", "Toluca vs Tijuana: Pronóstico y posibles alineaciones del partido de la Liga Femenil BBVA"],
  ];
  for (const [category, t] of cases) assert.equal(classifyVideo(t).category, category, `${t}: ${JSON.stringify(classifyVideo(t))}`);
});

const nat = (t, channel = { kind: "broadcaster", country: "MX" }) => matchNations({ title: t }, channel).map((n) => `${n.country}${n.women ? ":women" : ""}:${n.rule}`).sort();

test("national teams: aliases anywhere, guarded names only in a match against another national team, the women's team apart", () => {
  assert.deepEqual(nat("Selección Mexicana vs América de Cali | Amistoso"), ["MX:alias"]);
  assert.deepEqual(nat("Guatemala 1-0 Nicaragua | Resumen del Partido 2021 | #Guatemala Vs #Nicaragua"), ["GT:name+match"]);
  assert.deepEqual(nat("Islas Vírgenes vs Guatemala 0-3 GOLES Y RESUMEN / Eliminatoria Qatar 2022"), ["GT:name+match"]);
  assert.deepEqual(nat("Honduras 🇭🇳 V 🇨🇱 Chile"), ["HN:name+match"]);
  assert.deepEqual(nat("México vs Honduras | Resumen | Nations League"), ["HN:name+match", "MX:name+match"]);
  assert.deepEqual(nat("Reggae Boyz beat Trinidad and Tobago", { kind: "broadcaster", country: "JM" }), ["JM:alias"]);
  assert.deepEqual(nat("La H vs Costa Rica: así llega la Bicolor Catracha"), ["HN:name+match"]);
  // The women's team: never the men's.
  assert.deepEqual(nat("México Femenil vs Canadá | Resumen"), ["MX:women:name+match"]);
  assert.deepEqual(nat("Selección Mexicana Femenil vs Estados Unidos"), ["MX:women:alias"]);
  assert.deepEqual(nat("Reggae Girlz qualify for the World Cup"), ["JM:women:alias"]);

  const MUST_NOT = [
    "BYD King: precio, características y autonomía del auto eléctrico que se incendió en la México-Toluca",
    "Tabla de posiciones Liga Nacional de Honduras: Marathón tumba a Olimpia y así queda Motagua",
    "Honduras Progreso vs Juventud Yoreña | Liga de Ascenso Honduras | Jornada #4",                           // Multicable TV
    "Resumen: Pumas FC 5 - 1 Honduras de El Progreso | Liga de Ascenso Honduras",                              // Multicable TV
    "Come in our upcoming semi-finals match at Jamaica National Stadium on May 17 & May 20.",                  // MoBay United
    "Jamaica College vs Kingston College | Manning Cup final",
    "Real Madrid vs Real España: la final soñada",
    "Ciudad de México vs Guadalajara: ¿qué ciudad vive mejor el futbol?",
    "México Sub-20 vs Panamá | Premundial",
    "Preparación de la Selección Nacional U-20 en Puebla, México",                                             // FFH +
    "El Tri de Alex Lora vs Molotov: concierto en el Zócalo",
    "Liga Nacional de Guatemala: Municipal vs Xelajú",
    "Gran Premio de México vs Brasil: ¿cuál tiene más aficionados?",
    "¡Nos vamos al Mundial de FIFA e! | esports",                                                              // FMF
    "Chapines celebran la Independencia en Los Ángeles",
    "Así se vive la tradición de las antorchas por los 205 años de Independencia en Guatemala",
    "Estados Unidos deporta a 200 hondureños; llegan a Honduras este martes",
  ];
  for (const t of MUST_NOT) assert.deepEqual(nat(t), [], t);
  for (const e of feed("concacaf.xml").entries) assert.deepEqual(nat(e.title, { kind: "confederation", country: null }), [], e.title);
});

test("a federation's own channel: titles naming the team count, the women's apart, referees, youth and nameless titles do not", () => {
  const fmf = { kind: "national", country: "MX", name: "Selección Nacional de México" };
  const jff = { kind: "national", country: "JM", name: "JFFLIVE" };
  const ffh = { kind: "national", country: "HN", name: "FFH +" };
  assert.deepEqual(nat(title("seleccion-mexicana.xml", "EN VIVO | PRESENTACIÓN DE RAFAEL MÁRQUEZ"), fmf), ["MX:national_channel"]);
  assert.deepEqual(nat(title("seleccion-mexicana.xml", "¡ANDRÉS GUARDADO VUELVE!"), fmf), ["MX:national_channel"], "EL BÚNKER is the federation's show");
  assert.deepEqual(nat(title("seleccion-mexicana.xml", "¡Nos vamos al Mundial de FIFA e!"), fmf), []);
  assert.deepEqual(nat(title("jfflive.xml", "REGGAE BOYZ VS NIGERIA"), jff), ["JM:national_channel"]);
  assert.deepEqual(nat(title("jfflive.xml", "POST MATCH PRESS CONFERENCE: JAMAICA Vs NIGERIA"), jff), ["JM:national_channel"]);
  assert.deepEqual(nat(title("jfflive.xml", "REGGAE GIRLZ Vs PANAMA"), jff), ["JM:women:national_channel"], "one row per team: the channel's rule");
  assert.deepEqual(nat(title("jfflive.xml", "WOMEN'S FOOTBALL STRATEGY"), jff), ["JM:women:national_channel"]);
  // The Reggae Girlz' coach and player, titles naming no team: neither team.
  assert.deepEqual(nat(title("jfflive.xml", "Coach Hubert Busby speaks after 0-0 draw with Panama"), jff), []);
  assert.deepEqual(nat(title("jfflive.xml", "Atlanta Primus reflects"), jff), []);
  assert.deepEqual(nat(title("ffh-plus.xml", "¡La H llegó a La Ceiba!"), ffh), ["HN:national_channel"]);
  assert.deepEqual(nat(title("ffh-plus.xml", "Análisis Arbitral Jornada 6"), ffh), []);
  assert.deepEqual(nat(title("ffh-plus.xml", "Preparación de la Selección Nacional U-20"), ffh), []);
  assert.deepEqual(nat(title("ffh-plus.xml", "Hoy nos jugamos el siguiente paso"), ffh), [], "#HU20 is the under-20s");
});

// Clubs as in fetch-news --dry-run: one team per club of team-aliases.json, league ids per country.
const L = { MX: 1, HN: 2, GT: 3, JM: 4 };
const TEAMS = ALIAS_DATA.clubs.map((c, i) => ({ id: i + 1, league_id: L[c.country], country: c.country, name: c.names[0], short_name: null, key: c.key }));
const idx = buildTeamIndex(TEAMS);
const clubs = (country, t, summary = null) => matchNewsTeams({ title: t, summary }, { country }, idx)
  .map((m) => `${TEAMS.find((x) => x.id === m.teamId).key}:${m.rule}:${m.matched}`).sort();

test("news clubs on real headlines (2026-09-15 feeds): aliases with a football word, guarded names in a match line or after el/del/al", () => {
  assert.deepEqual(clubs("MX", "Puebla vs Toluca: A qué hora y dónde ver el partido de la Jornada 7 de la Liga MX",
    "Puebla vs Toluca en la Jornada 7 de la Liga MX; partido en vivo por FOX One, ESPN y Disney. Martes 15 de septiembre a las 19:00 horas."),
  ["mx-puebla:name+match:Puebla", "mx-toluca:alias+context:Toluca"]);
  assert.deepEqual(clubs("MX", "Emilio Azcárraga reacciona a la derrota del América ante Cruz Azul; \"Se salvaron\"",
    "Hace unas horas, Cruz Azul y América protagonizaron uno de los partidos más emocionantes del Apertura 2026 en la cancha del Estadio Banorte."),
  ["mx-america:name+article:América", "mx-cruz-azul:alias+context:Cruz Azul"]);
  assert.deepEqual(clubs("HN", "Policía Nacional anuncia cierres y operativo de seguridad por Motagua vs Alianza",
    "Tegucigalpa, Honduras.- La Policía Nacional de Honduras implementará un amplio dispositivo de seguridad en calles aledañas al Estadio Nacional \"Chelato\" Uclés, debido al encuentro entre FC Motagua y Alianza de El Salvador."),
  ["hn-motagua:alias+context:Motagua"]);
  assert.deepEqual(clubs("GT", "Roberto Montoya analiza el complicado inicio de Comunicaciones",
    "Tras su primera semana al frente de Comunicaciones, Roberto Montoya habló con Emisoras Unidas sobre el complicado inicio de su etapa como técnico de los cremas."),
  ["gt-comunicaciones:alias+context:Comunicaciones"]);
  assert.deepEqual(clubs("HN", "Olimpia y Marathón empatan en el Clásico: Olimpia vs Marathón terminó 1-1"),
    ["hn-marathon:name+match:Marathón", "hn-olimpia:name+match:Olimpia"]);
  // "la victoria" is the word; "del Olimpia" is the club.
  assert.deepEqual(clubs("HN", "La victoria del Olimpia en el partido ante Real España"), ["hn-olimpia:name+article:Olimpia"]);
  assert.deepEqual(clubs("GT", "Luto en el fútbol nacional: fallece Francisco “Pinula” Contreras, leyenda de Comunicaciones FC"), ["gt-comunicaciones:alias+context:Comunicaciones"]);
});

test("news clubs: stories that must not match", () => {
  const MUST_NOT = [
    // real headlines, 2026-09-15
    ["MX", "Claudia Sheinbaum recibe a Los Tigres del Norte en Palacio Nacional", "Claudia Sheinbaum recibe a Los Tigres del Norte y destaca su trayectoria previo al concierto del 15 de septiembre en la CDMX"],
    ["MX", "Los narcocorridos más famosos de Los Tigres del Norte: las canciones que no podrían cantar en su concierto gratis", null],
    ["MX", "BYD King: precio, características y autonomía del auto eléctrico que se incendió en la México-Toluca", "¿Qué es el BYD King? Conoce el precio del sedán híbrido que volvió a generar interés tras el accidente en la México-Toluca."],
    ["MX", "La extensión del crimen organizado amenaza la democracia en América Latina, según informe", "La extensión del crimen organizado constituye una amenaza para la democracia en América Latina, la región más polarizada del mundo."],
    ["GT", "La indispensable segunda Independencia de Guatemala como ejemplo para América", null],
    ["MX", "Toluca no tiene piedad y golea a Tijuana en la Liga Femenil BBVA", "Las Diablas del Toluca hicieron vivir un infierno a Tijuana en la Jornada 7 de la Liga Femenil BBVA."],
    ["GT", "Municipal empata con Malacateco y podría perder el liderato".replace("Malacateco", "su rival"), null],
    // the guards' own cases
    ["MX", "Copa América 2028: las sedes del torneo, confirmadas", null],
    ["HN", "Olimpia de Paraguay golea en la Copa Libertadores", null],
    ["GT", "La Policía Municipal de Tránsito cerrará calles por el partido de este domingo", null],
    ["GT", "Concejo Municipal aprueba el presupuesto; el partido oficialista votó en contra", null],
    ["HN", "Victoria del candidato del Partido Nacional en la jornada electoral", null],
    ["HN", "El río Motagua se desborda en Omoa; evacúan a familias", null],
    ["HN", "Vida saludable: el deporte y el partido de la salud", null],
    ["MX", "El América Latina Summit reúne a técnicos de la región", null],
    ["GT", "Ministerio de Comunicaciones anuncia cierre de la ruta al Atlántico", null],
    ["MX", "Chiapas aprueba paridad municipal: la mitad de las alcaldías, para mujeres en 2027", null],
  ];
  for (const [country, t, s] of MUST_NOT) assert.deepEqual(clubs(country, t, s), [], t);
  // Clubs of the outlet's country only.
  assert.deepEqual(clubs("MX", "Motagua vs Olimpia: el Clásico capitalino de la jornada"), []);
  // A football word inside a phrase that is not football is not context.
  assert.equal(footballContext("Reunión del equipo técnico del partido político", idx), null);
  assert.equal(footballContext("Chivas 🆚 Pumas", idx), "vs");
});

test("Short thumbnails: 180 x 320 from hqdefault's centre 9:16 band, at most 14 KB; a picture too short is refused", () => {
  assert.deepEqual(box916(480, 360), { x: 138, y: 0, w: 203, h: 360 });
  const t = makeShortThumb(photoJpeg(480, 360));
  assert.deepEqual([t.width, t.height], [180, 320]);
  assert.ok(t.bytes.length <= THUMB.maxBytes, `${t.bytes.length}`);
  assert.throws(() => makeShortThumb(photoJpeg(320, 180)), /only 180 px high/);
  assert.throws(() => makeShortThumb(Buffer.from("<html>")), /not a JPEG/);
});
