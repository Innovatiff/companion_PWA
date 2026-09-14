/**
 * Hometown gallery (photos 2-6): which files may join, the per-run download
 * cap, and rank assignment. Wikimedia is mocked; nothing leaves the machine.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  galleryCandidates, fetchGallery, freeRanks, downloadBudget, rejectReason, isTownArticle, loadOverrides, GALLERY_SIZE,
} from "../src/feeds/town-photos.mjs";

const page = (titles) => ({ images: titles.map((t) => ({ title: `Archivo:${t}` })) });

test("gallery comes from the town's own article, never its department's, state's or parish's", () => {
  const hue = { country: "GT", admin_region: "Huehuetenango", name: "Huehuetenango" };
  assert.equal(isTownArticle(hue, "Departamento de Huehuetenango"), false);
  assert.equal(isTownArticle(hue, "Huehuetenango (departamento)"), false);
  assert.equal(isTownArticle(hue, "Huehuetenango (municipio)"), true);
  assert.equal(isTownArticle({ name: "Uruapan" }, "Uruapan del Progreso"), true);
  assert.equal(isTownArticle({ name: "Kingston" }, "Kingston, Jamaica"), true);
  assert.equal(isTownArticle({ name: "Montego Bay" }, "Saint James Parish, Jamaica"), false);
  assert.equal(isTownArticle({ name: "Zamora" }, "Zamora de Hidalgo"), true);
  assert.equal(isTownArticle({ name: "Zamora" }, "Jacona"), false);
});

test("gallery refuses old photos, paintings, postcards and businesses, by file name", () => {
  const kgn = { country: "JM", admin_region: "Kingston", name: "Kingston" };
  const got = galleryCandidates(kgn, page([
    "Kingston (1907).jpg", "Kingston, Jamaica from the masthead of HMAS Melbourne - 1915.jpg",
    "Hotel Kingston 3.jpg", "JM-kingston-bank.jpg", "Kingston en el siglo XIX.jpg", "Pintura de Kingston.jpg",
    "Kingston dairy processing plant.jpg", "Kingston waterfront 2019.jpg",
  ]));
  assert.deepEqual(got, ["File:Kingston waterfront 2019.jpg"]);
});

test("gallery refuses panoramas wider than 2:1 and old, painted or commercial files by category", () => {
  const ii = (w, h, cats) => ({ mime: "image/jpeg", thumbwidth: w, thumbheight: h,
    extmetadata: { LicenseShortName: { value: "CC BY 2.0" }, Artist: { value: "Ana" }, Categories: { value: cats } } });
  assert.match(rejectReason(ii(480, 200, "Views of Montego Bay"), { gallery: true }), /panorama/);
  assert.equal(rejectReason(ii(480, 240, "Views of Montego Bay"), { gallery: true }), null);
  for (const cats of ["Postcards of Jamaica|Jamaica in the 1900s", "Kingston, Jamaica in the 20th century", "1907 Kingston earthquake",
                      "Unidentified paintings|Paintings of Morelia", "2015 in Honduras|Hotels in San Pedro Sula", "Dairy companies|Lacthosa",
                      "Shops in Mexico photographed in 2023|Buildings in Tapachula, Chiapas"]) {
    assert.match(rejectReason(ii(480, 320, cats), { gallery: true }) ?? "", /category/, cats);
  }
  assert.equal(rejectReason(ii(480, 320, "2009 in Honduras|Buildings in La Ceiba|Self-published work"), { gallery: true }), null);
});

test("gallery refuses a file whose Commons description is about a business, not a view taken from one", () => {
  const ii = (description) => ({ mime: "image/jpeg", thumbwidth: 480, thumbheight: 320,
    extmetadata: { LicenseShortName: { value: "CC0" }, Artist: { value: "Ana" }, Categories: { value: "Buildings in San Pedro Sula" },
                   ImageDescription: { value: description } } });
  assert.match(rejectReason(ii("Bank of Occidente in San Pedro Sula, Honduras"), { gallery: true }), /description/);
  assert.match(rejectReason(ii("Bank im Stadtzentrum"), { gallery: true }), /description/);
  assert.match(rejectReason(ii("Lacthosa dairy processing plant in San Pedro Sula"), { gallery: true }), /description/);
  assert.equal(rejectReason(ii("A view of San Pedro Sula, Honduras taken from Gran Hotel Sula."), { gallery: true }), null);
  assert.equal(rejectReason(ii("Cathedral of San Pedro Sula, Honduras"), { gallery: true }), null);
  assert.match(rejectReason(ii("Building in San Pedro Sula"), { gallery: true }), /description/, "an unnamed building is not a view of the town");
  assert.equal(rejectReason(ii("Edificio escolar Preparatoria Tapachula"), { gallery: true }), null, "a named public building is");
  assert.equal(rejectReason(ii("Bank of Occidente in San Pedro Sula, Honduras"), { gallery: false }), null, "photo 1 keeps its 0034 rules");
});

test("the overrides file has a gallery section a person can edit", () => {
  const o = loadOverrides();
  assert.ok(o.photos && typeof o.photos === "object");
  for (const [key, v] of Object.entries(o.gallery)) {
    assert.match(key, /^(MX|GT|HN|JM):[^:]+:[^:]+$/);
    for (const f of [...(v.exclude ?? []), ...(v.include ?? [])]) assert.match(f, /^File:.+\.jpe?g$/i, f);
  }
});

const MORELIA = { country: "MX", admin_region: "Michoacán", name: "Morelia" };

test("gallery candidates: named after the town; maps, flags, arms, logos, diagrams, portraits and other places never", () => {
  const p = page([
    "Morelia - Palacio de Gobierno.jpg",
    "Acueducto Morelia Mich Mexico.jpg",
    "Mapa de Morelia.jpg",
    "Bandera de Morelia.jpg",
    "Escudo de Morelia.jpg",
    "Logo Ayuntamiento Morelia.jpg",
    "Diagrama del centro de Morelia.jpg",
    "Retrato de José María Morelos, Morelia.jpg",
    "Collage Morelia.jpg",
    "Morelia locator map.jpg",
    "Catedral de Zamora vista desde Morelia.jpg",   // names another town
    "Estadio Morelos.jpg",                          // not named after the town
    "Morelia centro.png",                           // not a JPEG
    "Catedral de Morelia.jpg",                      // photo 1
  ]);
  const got = galleryCandidates(MORELIA, p, { have: ["File:Catedral de Morelia.jpg"], otherPlaces: ["Zamora", "Uruapan", "Michoacán"] });
  assert.deepEqual(got, ["File:Morelia - Palacio de Gobierno.jpg", "File:Acueducto Morelia Mich Mexico.jpg"]);
});

test("gallery overrides: a person's exclusions are never used; inclusions come first", () => {
  const p = page(["Morelia - Palacio de Gobierno.jpg", "Morelia, centro 19.jpg"]);
  const overrides = { "MX:Michoacán:Morelia": { exclude: ["File:Morelia, centro 19.jpg"], include: ["File:Plaza de Armas (Morelia).jpg"] } };
  assert.deepEqual(galleryCandidates(MORELIA, p, { overrides }),
    ["File:Plaza de Armas (Morelia).jpg", "File:Morelia - Palacio de Gobierno.jpg"]);
});

test("gallery Commons checks: portrait and map categories, no author, portrait orientation are refused", () => {
  const ii = (over = {}, cats = "Morelia|Cathedrals in Mexico") => ({
    mime: "image/jpeg", thumbwidth: 480, thumbheight: 320,
    extmetadata: { LicenseShortName: { value: "CC BY-SA 4.0" }, Artist: { value: "<a>Jane</a>" }, Categories: { value: cats } },
    ...over,
  });
  assert.equal(rejectReason(ii(), { gallery: true }), null);
  assert.match(rejectReason(ii({}, "Portraits of men|Morelia"), { gallery: true }), /category/);
  assert.match(rejectReason(ii({}, "Maps of Michoacán"), { gallery: true }), /category/);
  assert.equal(rejectReason(ii({}, "Portraits of men"), { gallery: false }), null, "photo 1 keeps its 0034 rules");
  assert.match(rejectReason(ii({ thumbheight: 600 }), { gallery: true }), /landscape/);
  assert.match(rejectReason({ ...ii(), extmetadata: { LicenseShortName: { value: "CC BY-SA 4.0" }, Artist: { value: "Unknown author" } } }, { gallery: true }), /author/);
});

test("ranks: photo 1 is never a gallery rank; free ranks fill lowest first, up to 6", () => {
  assert.deepEqual(freeRanks([], 10), [2, 3, 4, 5, 6]);
  assert.deepEqual(freeRanks([2, 4], 10), [3, 5, 6]);
  assert.deepEqual(freeRanks([2, 3], 1), [4]);
  assert.deepEqual(freeRanks([2, 3, 4, 5, 6], 3), []);
  assert.equal(GALLERY_SIZE, 6);
});

/** A mocked Wikimedia: every file passes, each download is a distinct small JPEG. */
function mockCommons({ cats = {} } = {}) {
  const calls = { info: 0, download: 0 };
  let n = 0;
  const fetchImpl = async (url) => {
    if (url.startsWith("https://commons.wikimedia.org/w/api.php")) {
      calls.info++;
      const title = decodeURIComponent(new URL(url).searchParams.get("titles"));
      return {
        ok: true,
        json: async () => ({ query: { pages: { 1: { imageinfo: [{
          mime: "image/jpeg", thumbwidth: 480, thumbheight: 300,
          thumburl: `https://upload.wikimedia.org/thumb/${encodeURIComponent(title)}/480px-x.jpg`,
          descriptionurl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(title)}`,
          extmetadata: { LicenseShortName: { value: "CC BY 4.0" }, Artist: { value: "Ana" }, Categories: { value: cats[title] ?? "Morelia" } },
        }] } } } }),
      };
    }
    calls.download++;
    const body = Buffer.from(`jpeg-${++n}`);
    return { ok: true, headers: new Map([["content-type", "image/jpeg"]]), arrayBuffer: async () => body };
  };
  return { fetchImpl, calls };
}

test("fetchGallery: ranks after the ones already stored, skipping refused files", async () => {
  const { fetchImpl } = mockCommons({ cats: { "File:Morelia gente 2.jpg": "Portraits of women" } });
  const p = page(["Morelia 1.jpg", "Morelia gente 2.jpg", "Morelia 3.jpg", "Morelia 4.jpg"]);
  const g = await fetchGallery(MORELIA, p, { usedRanks: [2], fetchImpl });
  assert.deepEqual(g.photos.map((x) => [x.rank, x.fileTitle]),
    [[3, "File:Morelia 1.jpg"], [4, "File:Morelia 3.jpg"], [5, "File:Morelia 4.jpg"]]);
  assert.equal(g.capped, false);
  assert.equal(g.exhausted, true);
  assert.equal(g.reasons.length, 1);
});

test("fetchGallery: a full gallery asks Wikimedia nothing", async () => {
  const { fetchImpl, calls } = mockCommons();
  const g = await fetchGallery(MORELIA, page(["Morelia 1.jpg"]), { usedRanks: [2, 3, 4, 5, 6], fetchImpl });
  assert.deepEqual(g.photos, []);
  assert.equal(calls.info + calls.download, 0);
});

test("download cap: one budget across towns; the run stops downloading at the cap", async () => {
  const { fetchImpl, calls } = mockCommons();
  const budget = downloadBudget(7);
  const titles = (town) => page(Array.from({ length: 8 }, (_, i) => `${town} ${i + 1}.jpg`));
  const a = await fetchGallery(MORELIA, titles("Morelia"), { budget, fetchImpl });
  const uruapan = { country: "MX", admin_region: "Michoacán", name: "Uruapan" };
  const b = await fetchGallery(uruapan, titles("Uruapan"), { budget, fetchImpl });
  assert.equal(a.photos.length, 5);
  assert.equal(a.capped, false);
  assert.equal(b.photos.length, 2);
  assert.equal(b.capped, true);
  assert.equal(b.exhausted, false);
  assert.equal(budget.used, 7);
  assert.equal(calls.download, 7, "no download beyond the cap");
  const c = await fetchGallery({ ...uruapan, name: "Zamora" }, titles("Zamora"), { budget, fetchImpl });
  assert.equal(c.photos.length, 0);
  assert.equal(c.capped, true);
});
