/**
 * Which files may become a town's photo: the article's lead image, then files
 * named after the town; never another place's photo from the same article;
 * never maps, flags, arms or collages; a person's override first.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { photoCandidates, FREE_LICENSE } from "../src/feeds/town-photos.mjs";

const SPS = { country: "HN", admin_region: "Cortés", name: "San Pedro Sula" };

test("lead image first, then files named after the town; other places never", () => {
  const page = {
    pageimage: "Catedral_San_Pedro_Sula.jpg",
    images: [
      { title: "Archivo:Avenida en Tegucigalpa.jpg" },
      { title: "Archivo:Boulevard San Pedro Sula norte.JPG" },
      { title: "Archivo:Escudo de San Pedro Sula.jpg" },
      { title: "Archivo:Mapa San Pedro Sula.jpg" },
      { title: "Archivo:Collage of San Pedro Sula.jpg" },
      { title: "Archivo:Bandera San Pedro Sula.svg" },
    ],
  };
  assert.deepEqual(photoCandidates(SPS, page), ["File:Catedral San Pedro Sula.jpg", "File:Boulevard San Pedro Sula norte.JPG"]);
});

test("accents and case do not hide the town's name", () => {
  const town = { country: "MX", admin_region: "Michoacán", name: "Zamora" };
  const page = { images: [{ title: "Archivo:SANTUARIO GUADALUPANO, ZAMORA MICHOACÁN.jpg" }] };
  assert.deepEqual(photoCandidates(town, page), ["File:SANTUARIO GUADALUPANO, ZAMORA MICHOACÁN.jpg"]);
});

test("a person's override is the only candidate", () => {
  const page = { pageimage: "Stadium.jpg", images: [{ title: "Archivo:San Pedro Sula 1.jpg" }] };
  assert.deepEqual(photoCandidates(SPS, page, { "HN:Cortés:San Pedro Sula": "File:Boulevard Micheletti SPS.jpg" }),
    ["File:Boulevard Micheletti SPS.jpg"]);
});

test("only free licenses pass", () => {
  for (const ok of ["CC BY-SA 4.0", "CC BY 2.0", "CC0", "Public domain", "CC BY-SA 3.0"]) assert.ok(FREE_LICENSE.test(ok), ok);
  for (const no of ["Fair use", "All rights reserved", "GFDL", "CC BY-NC 4.0", ""]) assert.ok(!FREE_LICENSE.test(no), no);
});
