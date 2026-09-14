/**
 * No graphic pictures (docs/OPEN-DECISIONS.md 3.24). Members open Hoy every
 * morning; a crime story's picture is often a covered body or a crime scene.
 * When a story's title or summary speaks of death or violence, the story is
 * kept but its picture is never fetched nor shown; news_items.image_suppressed
 * records the term that matched.
 *
 * Spanish and English, accent- and case-insensitive, whole words. Figurative
 * uses ("Día de Muertos", "muertos de risa", "punto muerto", "shooting star")
 * are removed before matching. Erring toward no picture is cheap: the headline
 * and summary still show.
 */
import { fold } from "./mentions.mjs";

/** Terms as written (for the record); matched folded. Multi-word phrases first. */
export const GRAPHIC_TERMS = [
  // Spanish
  "cuerpo sin vida", "cuerpos sin vida", "sin vida", "ataque armado", "ataques armados", "a balazos", "restos humanos",
  "restos óseos", "fosa clandestina", "fosas clandestinas", "hallan cuerpo", "hallan cuerpos", "localizan cuerpo",
  "localizan cuerpos", "encuentran cuerpo", "pierde la vida", "pierden la vida", "perdió la vida", "perdieron la vida",
  "le quitan la vida", "quitó la vida", "arma blanca", "herido de bala", "heridos de bala", "impacto de bala",
  // ("murió"/"murieron" are not listed: the dry run found them on obituaries, history and "¿De qué murió…?")
  "muerto", "muerta", "muertos", "muertas", "muere", "mueren", "matan", "mataron", "asesinan",
  "asesinado", "asesinada", "asesinados", "asesinadas", "asesinato", "asesinatos", "homicidio", "homicidios",
  "cadáver", "cadáveres", "restos", "masacre", "masacres", "balacera", "balaceras", "baleado", "baleada", "baleados",
  "balean", "tiroteo", "tiroteos", "ejecutado", "ejecutada", "ejecutados", "ejecutadas", "decapitado", "decapitada",
  "decapitados", "descuartizado", "descuartizada", "desmembrado", "fosa", "fosas", "feminicidio", "feminicidios",
  "sicario", "sicarios", "ultiman", "ultimado", "ultimada", "ultimados", "acribillado", "acribillada", "acribillados",
  "apuñalado", "apuñalada", "degollado", "degollada", "linchado", "linchamiento", "masacrados", "cuerpo embolsado",
  "encobijado", "encobijados",
  // English
  "dead body", "dead bodies", "shot dead", "shot and killed", "found dead", "fatally shot", "gunned down",
  "mass grave", "murder-suicide", "killed", "kills", "murder", "murders", "murdered", "corpse", "corpses",
  "shooting", "shootings", "massacre", "homicide", "homicides", "stabbed", "stabbing", "stabbings", "slain",
  "beheaded", "decapitated", "lynched", "gunman", "gunmen",
];

/** Figurative and harmless uses, removed from the folded text before matching. */
const NOT_GRAPHIC = [
  "dia de muertos", "dia de los muertos", "dias de muertos", "altar de muertos", "altares de muertos", "noche de muertos",
  "pan de muerto", "muerto de risa", "muerta de risa", "muertos de risa", "muertas de risa", "punto muerto", "tiempo muerto",
  "tiempos muertos", "peso muerto", "mar muerto", "angulo muerto", "angulos muertos", "naturaleza muerta", "letra muerta",
  "via muerta", "horas muertas", "muerto de hambre", "muertos de hambre", "muerto de miedo", "muertos de miedo",
  "vida o muerte", "restos arqueologicos", "restos del huracan", "restos de la tormenta", "restos de la depresion",
  "los restos del partido", "restos fosiles", "fosa septica", "fosas septicas", "fosas nasales", "fosa nasal",
  "fosa de las marianas", "fosa oceanica", "ejecutado el proyecto", "ejecutados los recursos", "presupuesto ejecutado",
  "recursos ejecutados", "obras ejecutadas", "obra ejecutada", "proyectos ejecutados", "fondos ejecutados",
  "shooting star", "shooting stars", "shooting guard", "shooting percentage", "shooting range", "photo shooting",
  "film shooting", "video shooting", "shooting for the stars", "clay shooting", "sport shooting", "shooting sports",
  "killed it", "murder mystery", "murder mysteries",
].map((p) => fold(p));

/** "Ejecutado" of work, money or plans ("Los operativos, ejecutados por la Alcaldía"), on folded text. */
const ADMIN_EXECUTED = / (operativos?|operaciones|trabajos?|labores|proyectos?|programas?|obras?|acciones|fondos?|recursos?|presupuestos?|planes|plan|contratos?|montos?|gastos?|inversion|inversiones|actividades|tareas|pagos?|mantenimientos?|politicas|estrategias?) (que )?(fueron |han sido |son |seran |ya )?ejecutad(o|a|os|as) /g;

const FOLDED = GRAPHIC_TERMS.map((t) => [t, fold(t.replace(/-/g, " "))]);

/** The first term that marks the story as graphic, or null. */
export function graphicTerm({ title, summary } = {}) {
  let text = fold(`${title ?? ""} . ${summary ?? ""}`);
  for (const p of NOT_GRAPHIC) text = text.split(p).join(" ");
  text = text.replace(ADMIN_EXECUTED, " ");
  for (const [term, f] of FOLDED) if (text.includes(f)) return term;
  return null;
}
