/**
 * News, pure parts: RSS and Atom parsing of real-world messy feeds, summary
 * cutting, url normalising, og:image, picture variants within their limits,
 * and local mention matching with the ambiguous names.
 *   node --test test/news-parse.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import jpeg from "jpeg-js";
import { PNG } from "pngjs";

import { parseFeed, cutSummary, plainText, normaliseUrl, ogImage, httpsUrl } from "../src/feeds/news/parse.mjs";
import { makeVariants, cropBox, resizeArea, sniff, VARIANTS } from "../src/feeds/news/image.mjs";
import { findMentions, sharedNames, fold } from "../src/feeds/news/mentions.mjs";
import { graphicTerm } from "../src/feeds/news/graphic.mjs";
import { fetchCapped, fetchPicture, repeatedImages, interleave, budget } from "../src/feeds/news.mjs";
import { photoJpeg } from "./helpers/news-images.mjs";

const fixture = (name) => readFileSync(new URL(`./fixtures/news/${name}`, import.meta.url), "utf8");

// ---------------------------------------------------------------------------
// Parsing

test("RSS: CDATA, entities, escaped HTML, WordPress footers and broken items", () => {
  const { format, items, dropped } = parseFeed(fixture("rss-messy.xml"), { baseUrl: "https://www.laprensa.hn/rss/portada" });
  assert.equal(format, "rss");
  assert.equal(dropped, 3, "no date, blank title, javascript: link");
  assert.equal(items.length, 6);
  const [sps, exc, pl, gleaner, observer, criterio] = items;

  assert.equal(sps.title, "¿Habrá Ley Seca en SPS este 15 de septiembre? Esto se sabe");
  assert.equal(sps.guid, "8e8e9fa7-bf76-43a5-84f5-599da97c9390");
  assert.equal(sps.summary, "San Pedro Sula, Honduras. Los sampedranos conmemoran los 205 años de independencia “con fervor”.");
  assert.equal(sps.imageUrl, "https://www.laprensa.hn/binrepository/1_15587336_20260914091526.jpg", "the <img> inside the escaped description");
  assert.equal(sps.publishedAt.toISOString(), "2026-09-14T15:23:23.000Z");

  assert.equal(exc.title, "Así terminó el medallero de los Juegos Centroamericanos 2026: México en la cima", "CDATA escaped twice");
  assert.equal(exc.summary, "Sumando un total de 407 preseas, México terminó en todo lo alto del medallero");
  assert.equal(exc.publishedAt.toISOString(), "2026-09-14T20:34:41.000Z");
  assert.match(exc.imageUrl, /6a77927b0e745\.png$/);

  assert.equal(pl.title, "China rechaza la idea de que está en una “competencia maliciosa” con EE.UU.");
  assert.equal(pl.summary, "Esto se produce tras los llamamientos para que se desacelere el desarrollo de la IA.", "the footer is gone");
  assert.ok(!/FULL ARTICLE|alert/.test(JSON.stringify(pl)), "content:encoded (the full article) is never read");
  assert.equal(pl.imageUrl, null, "an empty media:content url is no picture");
  assert.equal(pl.url, "https://www.prensalibre.com/internacional/china-rechaza-la-idea/?utm_source=rss&utm_medium=rss");

  assert.equal(gleaner.url, "https://jamaica-gleaner.com/article/news/20260914/second-chance", "http upgraded to https");
  assert.equal(gleaner.summary, "Justice Minister Delroy Chuck says there is no longer a backlog of expungement applications in Kingston & St Andrew.");
  assert.equal(gleaner.imageUrl, "https://jamaica-gleaner.com/sites/default/files/second-chance.jpg");

  assert.equal(observer.summary, null, "a description that repeats the title is no summary");
  assert.match(observer.imageUrl, /-1200\.jpg$/, "the widest picture");
  assert.equal(observer.guid, observer.url, "no guid: the url");

  assert.equal(criterio.publishedAt.toISOString(), "2026-09-14T21:25:15.000Z", "CST");
  assert.ok(criterio.summary.length <= 300 && criterio.summary.endsWith("…") && !criterio.summary.startsWith(" "));
});

test("Atom: alternate link, published before updated, html summary, relative thumbnail, xhtml content", () => {
  const { format, items, dropped } = parseFeed(fixture("atom.xml"), { baseUrl: "https://noticias.example/atom.xml" });
  assert.equal(format, "atom");
  assert.equal(dropped, 1);
  assert.equal(items[0].title, "Lluvias dejan inundaciones en Zamora, Michoacán");
  assert.equal(items[0].url, "https://noticias.example/2026/09/14/lluvias-zamora");
  assert.equal(items[0].guid, "tag:noticias.example,2026:1001");
  assert.equal(items[0].publishedAt.toISOString(), "2026-09-14T18:00:00.000Z");
  assert.equal(items[0].summary, "Vecinos de Zamora reportan calles anegadas.");
  assert.equal(items[0].imageUrl, "https://noticias.example/img/lluvias-zamora.jpg");
  assert.equal(items[1].publishedAt.toISOString(), "2026-09-14T10:00:00.000Z");
  assert.equal(items[1].summary, "Contenido & más");
  assert.equal(items[1].imageUrl, null);
});

test("pictures inside descriptions: emoji, avatars and small images are skipped", () => {
  const feed = (desc) => `<rss version="2.0"><channel><item><title>T</title><link>https://lahora.gt/n</link><pubDate>Mon, 14 Sep 2026 17:25:48 +0000</pubDate><description><![CDATA[${desc}]]></description></item></channel></rss>`;
  const emoji = `<img draggable="false" role="img" class="emoji" alt="💙" src="https://s.w.org/images/core/emoji/17.0.2/72x72/1f499.png">`;
  assert.equal(parseFeed(feed(`<p>Hola ${emoji}</p>`)).items[0].imageUrl, null, "only an emoji: no picture, so og:image is tried");
  assert.equal(parseFeed(feed(`${emoji}<img width="150" height="150" src="https://img.example/a-150x150.jpg"><img src="https://img.example/a.jpg">`)).items[0].imageUrl, "https://img.example/a.jpg");
  assert.equal(parseFeed(feed(`<img src="https://secure.gravatar.com/avatar/x.jpg">`)).items[0].imageUrl, null);
});

test("no graphic pictures: death and violence terms, real headlines, and figurative uses that stay", () => {
  const g = (title, summary) => graphicTerm({ title, summary });
  // Suppressed (real headlines of 2026-09-14, and the list's terms).
  assert.equal(g("¡Crímenes no paran! A balazos ultiman un joven en La Ceiba"), "a balazos");
  assert.equal(g("Uruapan: hallan cuerpo con impacto de bala en aljibe de la 28 de Octubre"), "hallan cuerpo");
  assert.equal(g("Localizan cadáver en aljibe de obra en construcción, al poniente de Uruapan"), "cadáver");
  assert.equal(g("Dos años después del asesinato de Juan López, la memoria es resistencia"), "asesinato");
  assert.equal(g("Mujer muere tras caer en las Cataratas de San Miguel Dueñas"), "muere");
  assert.equal(g("Police say fatally shot criminal was choking Retirement dump"), "fatally shot");
  assert.equal(g("Alleged ‘high risk’ serial robber among three killed in reported confrontation with police"), "killed");
  assert.equal(g("Three dead after St Andrew shooting involving police"), "shooting");
  assert.equal(g("Violencia en Tapachula", "Un hombre fue asesinado anoche en la colonia Centro"), "asesinado", "the summary counts");
  assert.equal(g("ATAQUE ARMADO EN MORELIA DEJA DOS HERIDOS"), "ataque armado");
  assert.equal(g("Hallan restos humanos en fosa clandestina de Zamora"), "restos humanos");
  assert.equal(g("Encuentran a hombre sin vida en río"), "sin vida");
  assert.equal(g("Detienen a sicario en Choloma"), "sicario");
  assert.equal(g("Homicidio en Comayagua"), "homicidio");
  assert.equal(g("Feminicidio en Quetzaltenango: exigen justicia"), "feminicidio");
  assert.equal(g("Masacre en bar de Tegucigalpa"), "masacre");
  assert.equal(g("Balacera en la colonia Rivera Hernández"), "balacera");
  assert.equal(g("Joven baleado en San Pedro Sula"), "baleado");
  assert.equal(g("Tiroteo deja tres lesionados"), "tiroteo");
  assert.equal(g("Hallan a dos hombres ejecutados en Apatzingán"), "ejecutados");
  assert.equal(g("Localizan a decapitado en Michoacán"), "decapitado");
  assert.equal(g("Man stabbed in Half Way Tree"), "stabbed");
  assert.equal(g("Corpse found in Portmore gully"), "corpse");
  assert.equal(g("Dead body discovered in St Catherine"), "dead body");
  assert.equal(g("Murder charge laid"), "murder");
  assert.equal(g("Homicide detectives probe incident"), "homicide");
  assert.equal(g("Día de Muertos en Pátzcuaro, pero un asesinato empaña la fiesta"), "asesinato", "a figurative use does not cancel a real one");
  // Kept with their pictures.
  for (const ok of [
    "Día de Muertos: Pátzcuaro prepara su noche de ofrendas",
    "Altar de muertos gigante en el zócalo de Morelia",
    "Los aficionados quedaron muertos de risa con el show",
    "Negociación salarial en punto muerto",
    "El técnico pidió tiempo muerto al minuto 80",
    "Shooting star seen over Kingston",
    "Reggae Boyz shooting guard joins club",
    "Obras ejecutadas en Uruapan superan los 200 millones",
    "Restos del huracán dejan lluvias en Chiapas",
    "Restaurantes de Morelia listos para las fiestas patrias",
    "Muertoscopio: la exposición del Museo",
    "Driver shortage at Montego Bay Metro",
    "Remesas apuntan a su menor crecimiento desde 2020",
    "La Fosa de las Marianas, en documental",
    // From the dry run: retrospective deaths and administrative "ejecutados" keep their pictures.
    "¿De qué murió el director del INA, Javier Talavera?",
    "Gertrudis Bocanegra: la insurgente que murió por la independencia",
  ]) assert.equal(g(ok), null, ok);
  assert.equal(g("Policía Municipal del DC decomisa más de 100 carros abandonados",
    "Tegucigalpa, Honduras.- Más de 100 vehículos... del programa “Cero Chatarra”. Los operativos , ejecutados por la Alcaldía…"), null);
  assert.equal(g("Obras ya ejecutadas en Uruapan"), null);
});

test("a page that is not a feed is a failure, never an empty feed", () => {
  assert.throws(() => parseFeed("<!doctype html><html><body>Just a moment...</body></html>"), /HTML page/);
  assert.throws(() => parseFeed(""), /neither RSS nor Atom/);
  assert.deepEqual(parseFeed(`<rss version="2.0"><channel><title>x</title></channel></rss>`).items, []);
});

test("summary: at most 300 characters, cut at a word, with an ellipsis", () => {
  const long = "palabra ".repeat(60).trim() + " final";
  const cut = cutSummary(long);
  assert.ok(cut.length <= 300, String(cut.length));
  assert.ok(cut.endsWith("palabra…"), cut.slice(-12));
  assert.equal(cutSummary("Corto y claro."), "Corto y claro.");
  assert.equal(cutSummary("x".repeat(300)), "x".repeat(300));
  assert.equal(cutSummary(`${"a".repeat(290)}, bbbbbbbbbbbbbbbbbbbbbb`), `${"a".repeat(290)}…`, "no trailing comma before the ellipsis");
  assert.equal(cutSummary("y".repeat(400)).length, 300, "one long word is cut hard");
  assert.equal(plainText("<p>Uno&nbsp;<b>dos</b></p><script>x()</script><p>tres &amp;amp; cuatro</p>"), "Uno dos tres & cuatro");
});

test("url normalising and og:image", () => {
  assert.equal(normaliseUrl("https://www.prensalibre.com/a/b/?utm_source=rss&utm_medium=rss"), "prensalibre.com/a/b");
  assert.equal(normaliseUrl("https://prensalibre.com/a/b"), "prensalibre.com/a/b");
  assert.equal(normaliseUrl("https://www.jornada.com.mx/2026/09/14/opinion/002a1edi?partner=rss"), "jornada.com.mx/2026/09/14/opinion/002a1edi");
  assert.equal(normaliseUrl("https://x.example/nota?id=5&utm_campaign=a"), "x.example/nota?id=5");
  assert.equal(httpsUrl("ftp://x.example/a"), null);
  assert.equal(httpsUrl("/nota", "https://x.example/feed"), "https://x.example/nota");
  assert.equal(ogImage(`<head><meta content="https://x.example/og.jpg" property="og:image"></head>`, "https://x.example/n"), "https://x.example/og.jpg");
  assert.equal(ogImage(`<meta property='og:image' content='/img/a.jpg'>`, "https://x.example/n"), "https://x.example/img/a.jpg");
  assert.equal(ogImage(`<meta name="twitter:image" content="http://x.example/t.jpg">`, "https://x.example/n"), "https://x.example/t.jpg");
  assert.equal(ogImage(`<p>no meta</p>`, "https://x.example/n"), null);
});

// ---------------------------------------------------------------------------
// Pictures

test("variants: thumb 160 px within 10 KB, lead 480 px within 45 KB, both JPEG, same crop", () => {
  for (const [w, h, lead] of [[1200, 900, [480, 360]], [1920, 1080, [480, 270]], [600, 1200, [480, 360]], [3000, 500, [480, 240]], [400, 300, [400, 300]]]) {
    const v = makeVariants(photoJpeg(w, h));
    assert.deepEqual([v.lead.width, v.lead.height], lead, `${w}x${h}`);
    assert.equal(v.thumb.width, 160);
    assert.equal(v.thumb.height, Math.round(160 * lead[1] / lead[0]));
    assert.ok(v.thumb.bytes.length <= VARIANTS.thumb.maxBytes, `thumb ${v.thumb.bytes.length}`);
    assert.ok(v.lead.bytes.length <= VARIANTS.lead.maxBytes, `lead ${v.lead.bytes.length}`);
    assert.equal(sniff(v.thumb.bytes), "image/jpeg");
    const back = jpeg.decode(v.lead.bytes);
    assert.deepEqual([back.width, back.height], lead);
  }
});

test("crop: taller than 4:3 keeps the upper middle, wider than 2:1 keeps the centre", () => {
  assert.deepEqual(cropBox(600, 1200), { x: 0, y: 250, w: 600, h: 450 });
  assert.deepEqual(cropBox(3000, 500), { x: 1000, y: 0, w: 1000, h: 500 });
  assert.deepEqual(cropBox(1600, 900), { x: 0, y: 0, w: 1600, h: 900 });
});

test("area-averaging resize and PNG transparency on white", () => {
  const checker = { width: 2, height: 2, data: Buffer.from([0, 0, 0, 255, 255, 255, 255, 255, 255, 255, 255, 255, 0, 0, 0, 255]) };
  const one = resizeArea(checker, { x: 0, y: 0, w: 2, h: 2 }, 1, 1);
  assert.ok(Math.abs(one[0] - 128) <= 1 && Math.abs(one[1] - 128) <= 1, String(one[0]));

  const png = new PNG({ width: 640, height: 400 });
  png.data.fill(0);                                   // fully transparent black
  const v = makeVariants(PNG.sync.write(png));
  const px = jpeg.decode(v.thumb.bytes);
  assert.ok(px.data[0] > 240 && px.data[1] > 240 && px.data[2] > 240, "transparent is white, not black");
});

test("pictures that are not used: too small, WebP, not an image, too big", async () => {
  assert.throws(() => makeVariants(photoJpeg(200, 150)), /only 200 px wide/);
  assert.throws(() => makeVariants(Buffer.from("<html>")), /not a JPEG or PNG/);
  const webp = Buffer.concat([Buffer.from("RIFF\0\0\0\0WEBPVP8 "), Buffer.alloc(40)]);
  const serve = (body, type, status = 200) => async () => new Response(body, { status, headers: { "content-type": type } });
  await assert.rejects(fetchPicture("https://img.example/a.webp", { fetchImpl: serve(webp, "image/webp") }), /WebP is not decoded/);
  await assert.rejects(fetchPicture("https://img.example/a", { fetchImpl: serve("<html></html>", "text/html") }), /not an accepted image: text\/html/);
  await assert.rejects(fetchPicture("https://img.example/a", { fetchImpl: serve("", "image/jpeg", 404) }), /HTTP 404/);
  await assert.rejects(fetchCapped("https://img.example/big", { fetchImpl: serve(Buffer.alloc(2_000_001), "image/jpeg"), timeoutMs: 5000, maxBytes: 2_000_000 }), /over 2000000 bytes/);
  const hang = (url, { signal }) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))));
  await assert.rejects(fetchCapped("https://img.example/slow", { fetchImpl: hang, timeoutMs: 30, maxBytes: 10 }), /timeout after 30 ms/);
  // A dropped connection is tried once more; the Accept header never invites WebP.
  let tries = 0;
  const flaky = async (url, { headers }) => {
    assert.ok(!/webp|image\/\*/.test(headers.accept), headers.accept);
    if (tries++ === 0) throw new TypeError("fetch failed", { cause: { code: "UND_ERR_SOCKET" } });
    return new Response(photoJpeg(640, 480), { headers: { "content-type": "image/jpeg" } });
  };
  assert.equal((await fetchPicture("https://img.example/flaky.jpg", { fetchImpl: flaky })).variants.lead.width, 480);
  assert.equal(tries, 2);
  const ok = await fetchPicture("https://img.example/p.jpg", { fetchImpl: serve(photoJpeg(800, 600), "image/jpeg") });
  assert.match(ok.sha256, /^[0-9a-f]{64}$/);
  assert.ok(ok.variants.lead.bytes.length <= 45_000);
});

test("placeholders, interleaving and budgets", () => {
  const items = [{ imageUrl: "https://x/logo.jpg" }, { imageUrl: "https://x/logo.jpg" }, { imageUrl: "https://x/logo.jpg" }, { imageUrl: "https://x/a.jpg" }];
  assert.deepEqual([...repeatedImages(items)], ["https://x/logo.jpg"]);
  assert.deepEqual(interleave([[1, 2, 3], ["a"], [10, 20]]), [1, "a", 10, 2, 20, 3]);
  const b = budget(2);
  assert.deepEqual([b.take(), b.take(), b.take()], [true, true, false]);
  assert.equal(b.used, 2);
});

// ---------------------------------------------------------------------------
// Mentions, with real headlines of 2026-09-14

const TOWNS = [
  { id: 1, country: "HN", admin_region: "Cortés", name: "San Pedro Sula" },
  { id: 2, country: "HN", admin_region: "Atlántida", name: "La Ceiba" },
  { id: 3, country: "MX", admin_region: "Michoacán", name: "Zamora" },
  { id: 4, country: "MX", admin_region: "Michoacán", name: "Uruapan" },
  { id: 5, country: "MX", admin_region: "Chiapas", name: "Tapachula" },
  { id: 6, country: "GT", admin_region: "Quetzaltenango", name: "Quetzaltenango" },
  { id: 7, country: "GT", admin_region: "Huehuetenango", name: "Huehuetenango" },
  { id: 8, country: "JM", admin_region: "St. James", name: "Montego Bay" },
  { id: 9, country: "JM", admin_region: "Kingston", name: "Kingston" },
  { id: 10, country: "HN", admin_region: "Yoro", name: "El Progreso" },
  { id: 11, country: "HN", admin_region: "La Paz", name: "La Paz" },
  { id: 12, country: "JM", admin_region: "Manchester", name: "Mandeville" },
  { id: 13, country: "HN", admin_region: "Francisco Morazán", name: "Distrito Central" },
  { id: 14, country: "GT", admin_region: "Guatemala", name: "Guatemala" },
  { id: 15, country: "HN", admin_region: "Copán", name: "San José" },
  { id: 16, country: "MX", admin_region: "Michoacán", name: "Morelia" },
];
const CATALOGUE = [...TOWNS, { name: "San José" }, { name: "San José" }, { name: "El Progreso" }];
const shared = sharedNames(CATALOGUE);
const NAT = (country) => ({ country, admin_region: null });
const hits = (title, summary, source) => findMentions({ title, summary }, source, TOWNS, { shared }).map((m) => `${TOWNS.find((t) => t.id === m.municipalityId).name}|${m.rule}|${m.matched}`);

test("mentions: plain names, aliases, accents and case, whole words, own country only", () => {
  assert.deepEqual(hits("¿Habrá Ley Seca en SPS este 15 de septiembre? Esto se sabe", null, NAT("HN")), ["San Pedro Sula|alias|SPS"]);
  assert.deepEqual(hits("Color y fervor patrio engalanan los desfiles patrios en San Pedro Sula este lunes", null, NAT("HN")), ["San Pedro Sula|name|San Pedro Sula"]);
  assert.deepEqual(hits("DESFILES EN SAN PEDRO SULA", null, NAT("HN")), ["San Pedro Sula|name|San Pedro Sula"]);
  assert.deepEqual(hits("Las sps de la región", null, NAT("HN")), [], "SPS is matched as written");
  assert.deepEqual(hits("Uruapan: hallan cuerpo con impacto de bala en aljibe de la 28 de Octubre", "En una construcción", { country: "MX", admin_region: "Michoacán" }), ["Uruapan|name|Uruapan"]);
  assert.deepEqual(hits("Detienen a cuatro hombres por daños a puente en la colonia Mil Garzas", "Vecinos de Tapachula alertaron a la policía", NAT("MX")), ["Tapachula|name|Tapachula"]);
  assert.deepEqual(hits("Suspenden clases en Tapachula", null, NAT("GT")), [], "a Guatemalan outlet never names a Mexican town for us");
  assert.deepEqual(hits("Lluvias en Quetzaltenango y Huehuetenango", null, NAT("GT")), ["Quetzaltenango|name|Quetzaltenango", "Huehuetenango|name|Huehuetenango"]);
  assert.deepEqual(hits("Feria de Xela atrae visitantes", null, NAT("GT")), ["Quetzaltenango|alias|Xela"]);
  assert.deepEqual(hits("Guastatoya vs. Xelajú MC: siga el minuto a minuto", null, NAT("GT")), [], "Xelajú is the football club");
  // A town, then its department: the department, not the city (real headlines of 2026-09-14).
  assert.deepEqual(hits("Paso bloqueado en ambos sentidos en el km 225 de Colomba Costa Cuca, Quetzaltenango", null, NAT("GT")), []);
  assert.deepEqual(hits("Autoridades aseguran que se libera el único tramo bloqueado este sábado", "El bloqueo comenzó a las 6:38 horas en Santo Domingo, Colomba Costa Cuca, Quetzaltenango, y Provial informó", NAT("GT")), []);
  assert.deepEqual(hits("Accidente en Chiantla, Huehuetenango", null, NAT("GT")), []);
  assert.deepEqual(hits("Tour de chocolate en Quetzaltenango", "Quetzaltenango, Quetzaltenango. Una familia", NAT("GT")), ["Quetzaltenango|name|Quetzaltenango"], "the city named first still counts");
  assert.deepEqual(hits("Crisis hídrica en Tegucigalpa", null, NAT("HN")), ["Distrito Central|alias|Tegucigalpa"]);
  assert.deepEqual(hits("Guatemala clasifica a la Liga de Naciones", null, NAT("GT")), [], "the country's name is not its capital");
  assert.deepEqual(hits("Tráfico en la Ciudad de Guatemala", null, NAT("GT")), ["Guatemala|alias|Ciudad de Guatemala"]);
  assert.deepEqual(hits("Paro en La Ceiba", null, NAT("HN")), ["La Ceiba|name|La Ceiba"]);
});

test("mentions: ambiguous names need their region or a regional outlet", () => {
  // Zamora the surname, and Zamorano in Honduras.
  assert.deepEqual(hits("El diputado Carlos Zamora presenta iniciativa", null, NAT("MX")), []);
  assert.deepEqual(hits("Zamorano, Honduras.- Desalojan carretera a Danlí", null, NAT("MX")), []);
  assert.deepEqual(hits("Lluvias dejan inundaciones en Zamora, Michoacán", null, NAT("MX")), ["Zamora|name+region|Zamora"]);
  assert.deepEqual(hits("Zamora celebra su feria", "Miles de visitantes en Michoacán de Ocampo", NAT("MX")), ["Zamora|name+region|Zamora"]);
  assert.deepEqual(hits("Feria en Zamora", null, { country: "MX", admin_region: "Michoacán" }), ["Zamora|name+regional_source|Zamora"]);
  assert.deepEqual(hits("Feria en Zamora", null, { country: "MX", admin_region: "Chiapas" }), [], "another region's outlet is not enough");
  // Common words.
  assert.deepEqual(hits("El progreso del país depende de la paz social", null, NAT("HN")), []);
  assert.deepEqual(hits("Accidente en El Progreso, Yoro", null, NAT("HN")), ["El Progreso|name+region|El Progreso"]);
  assert.deepEqual(hits("Marcha por la paz en La Paz", null, NAT("HN")), [], "a town named like its ambiguous department is never confirmed by it");
  assert.deepEqual(hits("Obras en La Paz", null, { country: "HN", admin_region: "La Paz" }), ["La Paz|name+regional_source|La Paz"]);
  // A name several of our municipalities share.
  assert.deepEqual(hits("Robo en San José", null, NAT("HN")), []);
  assert.deepEqual(hits("Robo en San José, Copán", null, NAT("HN")), ["San José|name+region|San José"]);
});

test("mentions: Jamaica, the town or its parish, the capital, and not-the-place uses", () => {
  assert.deepEqual(hits("Shorter routes, quicker pick-ups", "JUTC adds buses in Montego Bay", NAT("JM")), ["Montego Bay|name|Montego Bay"]);
  assert.deepEqual(hits("St James police report fewer murders", null, NAT("JM")), ["Montego Bay|parish|St. James"]);
  assert.deepEqual(hits("Saint James farmers get irrigation", null, NAT("JM")), ["Montego Bay|parish|St. James"]);
  assert.deepEqual(hits("Justice Minister Delroy Chuck speaks in Kingston", null, NAT("JM")), ["Kingston|name|Kingston"], "the capital in a Jamaican outlet");
  assert.deepEqual(hits("Hurricane watch for Kingston and St Andrew", null, NAT("MX")), [], "never from another country's outlet");
  assert.deepEqual(hits("Manchester United beat Chelsea", null, NAT("JM")), []);
  assert.deepEqual(hits("Manchester parish council meets", null, NAT("JM")), ["Mandeville|parish|Manchester"]);
  // The dry run: nearly every Observer story starts "KINGSTON, Jamaica —", where national news is filed.
  assert.deepEqual(hits("Surge in road deaths; at least 40 killed in crashes in last 28 days", "KINGSTON, Jamaica — At least 40 people have died", NAT("JM")), []);
  assert.deepEqual(hits("One injured in collision involving JUTC bus", "KINGSTON, Jamaica — A bus crashed on Molynes Road in Kingston this morning", NAT("JM")), ["Kingston|name|Kingston"], "Kingston named again after the dateline");
  assert.deepEqual(hits("Kingston-based firm expands", null, NAT("JM")), ["Kingston|name|Kingston"], "a hyphen is not a dateline");
  assert.deepEqual(hits("Garbage collection to improve", "MONTEGO BAY, St James — There should be an improvement", NAT("JM")), ["Montego Bay|name|Montego Bay"], "another town's dateline is where the story happened");
  assert.deepEqual(hits("Desfiles patrios", "Tegucigalpa, Honduras.- Las calles se llenan", NAT("HN")), []);
  assert.deepEqual(hits("Glosa del informe", "Ciudad de México, 13 Septiembre.- La presidenta", NAT("MX")), []);
  // Newsroom datelines of La Prensa (San Pedro Sula) and Quadratín (Morelia), real summaries of 2026-09-14.
  assert.deepEqual(hits("Cocina Catracha, un coleccionable de comida hondureña", "San Pedro Sula. En el marco del mes de la patria, diario LA PRENSA y El Heraldo", NAT("HN")), []);
  assert.deepEqual(hits("Tabla de posiciones Liga Nacional de Honduras", "San Pedro Sula, Honduras.- La jornada 7 del Torneo Apertura 2026", NAT("HN")), []);
  assert.deepEqual(hits("¿Habrá Ley Seca en SPS este 15 de septiembre?", "San Pedro Sula, Honduras. Los sampedranos conmemoran", NAT("HN")), ["San Pedro Sula|alias|SPS"], "the title still names it");
  assert.deepEqual(hits("Mejora FGE capacitación y mecanismos de evaluación", "MORELIA, Mich., 14 de septiembre de 2026.- La Fiscalía General del Estado", { country: "MX", admin_region: "Michoacán" }), []);
  assert.deepEqual(hits("Hallan a dos hombres", "URUAPAN, Mich., 14 de septiembre de 2026.- Dos hombres", { country: "MX", admin_region: "Michoacán" }), ["Uruapan|name|Uruapan"], "a dateline of another town is local reporting");
  assert.deepEqual(hits("Salud bucal", "Tapachula, Chiapas; 13 de septiembre de 2026.- La salud bucal", { country: "MX", admin_region: "Chiapas" }), ["Tapachula|name|Tapachula"]);
  assert.deepEqual(hits("Morelia sin agua en 20 colonias", null, NAT("MX")), ["Morelia|name|Morelia"]);
  assert.deepEqual(hits("San Pedro Sula registra lluvias", null, NAT("HN")), ["San Pedro Sula|name|San Pedro Sula"], "a town at the start of a headline is not a dateline");
  // The town's own name is reported before an alias.
  assert.deepEqual(hits("Driver shortage at Montego Bay Metro", "MoBay commuters wait", NAT("JM")), ["Montego Bay|name|Montego Bay"]);
  assert.deepEqual(hits("MoBay commuters wait", null, NAT("JM")), ["Montego Bay|alias|MoBay"]);
  assert.deepEqual(hits("Traffic in Manchester", null, NAT("JM")), [], "an ambiguous parish name alone is not enough");
  assert.equal(fold("Savanna-la-Mar"), " savanna la mar ");
});
