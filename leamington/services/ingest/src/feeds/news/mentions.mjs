/**
 * Local matching: which of our clients' towns a story names, precomputed at
 * ingest into news_mentions. Name matching is fragile, so it errs on the side
 * of saying nothing:
 *
 *   - Only sources of the town's own country ("Kingston" in a Mexican paper is
 *     never Kingston, Jamaica).
 *   - Title and summary only, accent- and case-insensitive, whole words.
 *   - An AMBIGUOUS name (a common word or surname, a saint's name, a name
 *     several of our municipalities share, a famous place elsewhere) counts
 *     only when the story also names the town's region (state, department,
 *     parish), or the outlet is a regional one of that region.
 *   - A town named like its country ("Guatemala") only through an alias
 *     ("Ciudad de Guatemala").
 *   - Jamaica: a client in a town (Montego Bay) in a parish (St. James) is
 *     matched by the town or by the parish name.
 *   - Known non-place uses of a name ("Manchester United") never count.
 *
 * What matched is stored, so a wrong match can be seen and the rule tightened.
 */

/** " words " : accents removed, lower case, punctuation as spaces, padded for whole-word search. */
export const fold = (s) => ` ${String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
const has = (hay, needle) => needle.trim() && hay.includes(needle);

const COUNTRY_NAMES = new Set(["mexico", "guatemala", "honduras", "jamaica"].map((n) => fold(n)));

/**
 * Names that are words, surnames, saints or famous places before they are one
 * of our towns. Folded. A name shared by two or more of our municipalities is
 * ambiguous as well (computed from the catalogue, see sharedNames).
 */
export const AMBIGUOUS = new Set([
  // common words and phrases
  "progreso", "el progreso", "la paz", "paz", "la libertad", "libertad", "la esperanza", "esperanza", "la union", "union",
  "la democracia", "democracia", "victoria", "la victoria", "concordia", "la concordia", "el paraiso", "paraiso",
  "providencia", "la trinidad", "trinidad", "tela", "reforma", "la reforma", "independencia", "soledad", "la soledad",
  "nuevo", "porvenir", "el porvenir", "florida", "la estancia", "estancia", "el rosario", "rosario", "la palma", "palma",
  "los amates", "colon", "cortes", "morazan", "lempira", "valle", "la entrada", "entrada", "puerto", "las flores", "flores", "la cruz", "cruz", "el sauce", "sabana grande",
  "concepcion", "trinidad", "el triunfo", "triunfo", "la iguala", "jesus", "el carmen", "carmen", "dolores", "mercedes",
  "guadalupe", "lagunas", "las lajas", "vista hermosa", "buenavista", "buena vista", "san martin", "general",
  "armeria", "tecate", "aldama", "matamoros", "comonfort", "salvatierra", "valladolid", "cardenas",
  // surnames used as town names
  "zamora", "morelos", "hidalgo", "juarez", "benito juarez", "emiliano zapata", "zapata", "zaragoza", "ocampo", "jimenez",
  "guerrero", "allende", "madero", "obregon", "bravo", "galeana", "escobedo", "lerdo", "mina", "doctor arroyo", "arroyo",
  "iturbide", "abasolo", "victoria", "bolivar", "sucre", "santander", "leon", "calderon", "villa", "garza", "herrera",
  "gonzalez", "ramirez", "rodriguez", "martinez", "lopez", "perez", "sanchez", "moreno", "alvarez", "castillo", "ortega",
  "salinas", "cuauhtemoc",
  // saints and saint-names shared by many places
  "san pedro", "santa cruz", "san jose", "santa rosa", "santa ana", "san juan", "san miguel", "san marcos", "san antonio",
  "san luis", "san lorenzo", "san francisco", "san felipe", "santiago", "santa barbara", "santa maria", "santa lucia",
  "san cristobal", "san andres", "san pablo", "san rafael", "san sebastian", "san jeronimo", "san ignacio", "san isidro",
  "san vicente", "santa catarina", "san mateo", "santo domingo", "santa elena", "santa fe", "san bartolo", "san agustin",
  "san carlos", "san diego", "santa clara", "santa teresa", "santa ines", "san fernando", "san buenaventura",
  // famous places elsewhere, and parish names used abroad
  // (A town named like its own state or department, "Huehuetenango", "Puebla", is not listed: in its own
  // country's outlets the name is that place, city or region, and both concern a client from there.)
  "cambridge", "manchester", "portland", "hanover", "kingston", "richmond", "alexandria",
  "panama", "la habana", "cuba", "roma", "paris", "lima", "cordoba", "toledo", "granada",
  "sevilla", "valencia", "madrid", "salamanca", "leon", "trinidad", "washington", "los angeles", "houston", "dallas",
].map((n) => fold(n)));

// "Kingston" is Jamaica's capital: in a Jamaican outlet it is the city. The
// list above still marks it, and a Jamaican source of the same country is enough
// for a capital: see CAPITALS.
const CAPITALS = new Set(["JM:Kingston:Kingston"]);

/** Extra ways a story names a town. `cs` = case-sensitive, as written. */
export const ALIASES = {
  "HN:Francisco Morazán:Distrito Central": [{ text: "Tegucigalpa" }, { text: "Comayagüela" }],
  "HN:Cortés:San Pedro Sula": [{ text: "SPS", cs: true }],
  "GT:Guatemala:Guatemala": [{ text: "Ciudad de Guatemala" }, { text: "capital guatemalteca" }],
  // "Xela", not "Xelajú": the dry run found "Xelajú" only as the football club (Xelajú MC).
  "GT:Quetzaltenango:Quetzaltenango": [{ text: "Xela" }],
  "MX:Ciudad de México:Ciudad de México": [{ text: "CDMX", cs: true }],
  "JM:St. James:Montego Bay": [{ text: "MoBay" }, { text: "Mo Bay" }],
};

/** Region names that confirm an ambiguous town. Folded variants; "St." also as "Saint". */
export function regionVariants(region) {
  const out = new Set([fold(region)]);
  const f = fold(region);
  if (f.startsWith(" st ")) out.add(` saint ${f.slice(4)}`);
  if (f === " michoacan ") out.add(" michoacan de ocampo ");
  if (f === " ciudad de mexico ") out.add(" cdmx ");
  if (f === " francisco morazan ") out.add(" francisco morazan ");
  return [...out];
}

function nameVariants(name) {
  const f = fold(name);
  const out = new Set([f]);
  if (f.startsWith(" st ")) out.add(` saint ${f.slice(4)}`);
  if (f.includes(" la ")) out.add(f.replace(" la ", " la "));
  // "Savanna-la-Mar" folds to "savanna la mar"; "Sav-la-Mar" is its common short form.
  if (f === " savanna la mar ") out.add(" sav la mar ");
  return [...out];
}

/** What follows a name that makes it not the place. Folded. */
const NOT_THE_PLACE = [
  / manchester (united|city) /, / portland (trail blazers|timbers|thorns|oregon|maine) /, / kingston (ontario|upon|new york|ny|university) /,
  / santa cruz (de tenerife|bolivia|california) /, / la paz (bolivia|baja) /, / san pedro (garza|tlaquepaque) /,
  / hanover (germany|park) /, / cambridge (university|uk) /, / progreso (yucatan) /,
];

/** Folded names that two or more catalogue municipalities share (any country). */
export function sharedNames(municipalities) {
  const count = new Map();
  for (const m of municipalities) count.set(fold(m.name), (count.get(fold(m.name)) ?? 0) + 1);
  return new Set([...count].filter(([, n]) => n > 1).map(([k]) => k));
}

const townKey = (t) => `${t.country}:${t.admin_region}:${t.name}`;

/** Whether `name` (folded) names the place in `text` (folded), not a team or a place elsewhere. */
function placeHit(text, variant) {
  if (!has(text, variant)) return false;
  // Every occurrence followed by a not-the-place word means no.
  const withoutNonPlace = NOT_THE_PLACE.reduce((t, re) => t.replace(new RegExp(re.source, "g"), " "), text);
  return withoutNonPlace.includes(variant);
}

/**
 * The towns an item names. `towns`: [{id, name, country, admin_region}] (the
 * targets); `source`: {country, admin_region}; `shared`: sharedNames(catalogue).
 * Returns [{municipalityId, matched, rule}] where rule is one of
 * 'name', 'alias', 'parish', 'name+region', 'name+regional_source'.
 */
/**
 * A dateline naming a big newsroom city says where the story was filed, not
 * what it is about. The dry runs found "KINGSTON, Jamaica —" on nearly every
 * Jamaica Observer story, "San Pedro Sula, Honduras." on La Prensa's national
 * stories (a product promotion, the league table), and "MORELIA, Mich., 14 de
 * septiembre de 2026.-" on Quadratín's statewide ones. A dateline naming any
 * other town ("MONTEGO BAY, St James —", "URUAPAN, Mich.", "Tapachula, Chiapas;")
 * is local reporting, and stays. The town named again later in the text still counts.
 */
const NEWSROOM_DATELINE = /^\s*(kingston|tegucigalpa|san pedro sula|ciudad de m[eé]xico|cdmx|ciudad de guatemala|guatemala|morelia)(,[^\n—–]{0,50}?)?(\.-|\.(?=\s)|\s[—–-]\s|[—–])\s*/i;
const CAPITAL_DATELINE = NEWSROOM_DATELINE;
export const stripCapitalDateline = (s) => String(s ?? "").replace(CAPITAL_DATELINE, "");

export function findMentions({ title, summary }, source, towns, { shared = new Set() } = {}) {
  const raw = `${stripCapitalDateline(title)} ${stripCapitalDateline(summary)}`;
  const text = fold(raw);
  // Folded but with commas kept, for "Colomba Costa Cuca, Quetzaltenango" (a town, then its department).
  const commaText = ` ${raw.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9,]+/g, " ")} `;
  const out = [];
  for (const t of towns) {
    if (t.country !== source.country) continue;
    const key = townKey(t);
    const regionalSource = source.admin_region && source.admin_region === t.admin_region;
    const regionNamed = !AMBIGUOUS.has(fold(t.admin_region)) && !COUNTRY_NAMES.has(fold(t.admin_region))
      && regionVariants(t.admin_region).some((v) => placeHit(text, v));
    let hit = null;

    const f = fold(t.name);
    if (!COUNTRY_NAMES.has(f)) {
      // A town named like its department ("Quetzaltenango", "Huehuetenango"): "<another town>, Quetzaltenango"
      // is the department in an address, not the city. The dry run found it on road-block stories.
      const townText = fold(t.admin_region) === f
        ? fold(commaText.replace(new RegExp(`,\\s*${f.trim()}(?=[\\s,]|$)`, "g"), " , "))
        : text;
      const variant = nameVariants(t.name).find((v) => placeHit(townText, v));
      if (variant) {
        const ambiguous = (AMBIGUOUS.has(f) || shared.has(f)) && !(CAPITALS.has(key) && source.country === t.country);
        // A town named like its own region ("Huehuetenango") is the region's name too: not a confirmation of itself.
        const regionIsName = fold(t.admin_region) === f;
        if (!ambiguous) hit = { matched: t.name, rule: "name" };
        else if (regionalSource) hit = { matched: t.name, rule: "name+regional_source" };
        else if (regionNamed && !regionIsName) hit = { matched: t.name, rule: "name+region" };
      }
    }

    // The town's own name first; an alias ("SPS", "Tegucigalpa") only when the name is not there.
    for (const a of hit ? [] : ALIASES[key] ?? []) {
      const ok = a.cs ? new RegExp(`(^|[^\\p{L}\\p{N}])${a.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\p{L}\\p{N}])`, "u").test(raw) : placeHit(text, fold(a.text));
      if (ok) { hit = { matched: a.text, rule: "alias" }; break; }
    }

    // Jamaica: the parish names the client's town too.
    if (!hit && t.country === "JM" && fold(t.admin_region) !== fold(t.name)) {
      const pv = regionVariants(t.admin_region).find((v) => placeHit(text, v));
      const parishAmbiguous = AMBIGUOUS.has(fold(t.admin_region));
      if (pv && (!parishAmbiguous || regionalSource || / parish /.test(text))) hit = { matched: t.admin_region, rule: "parish" };
    }

    if (hit) out.push({ municipalityId: t.id, ...hit });
  }
  return out;
}
