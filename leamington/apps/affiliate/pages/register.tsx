/**
 * Register a client: four fields, 90 seconds, no JavaScript.
 *
 *   /register               step 1: the country, four big buttons (GET links)
 *   /register?country=MX    step 2: name, department/parish, team for that country
 *
 * The form POSTs to /api/register. A validation error comes back here with what
 * was typed in the query string and the reason under the field.
 */
import type { GetServerSideProps } from "next";
import { requirePerson } from "@leamington/shared/src/server/portal.ts";
import { asPerson } from "@leamington/shared/src/server/db.ts";
import { Page, setPageLang, viewerOf, type Viewer } from "../lib/layout.tsx";
import { strings } from "../lib/strings.ts";
import { COUNTRIES, countryName, isCountry, regionLabel, type Country } from "../lib/clients.ts";
import { NAME_MAX, NO_TEAM, isRegisterError, readRegisterInput, type RegisterError, type RegisterInput } from "../lib/register.ts";
import { loadRegisterOptions, type RegisterOptions } from "../lib/options.ts";

export const config = { unstable_runtimeJS: false };

type Props = {
  viewer: Viewer;
  country: Country | null;
  input: RegisterInput;
  error: RegisterError | null;
  options: RegisterOptions;
};

export const getServerSideProps: GetServerSideProps<Props> = async ({ req, res, query }) => {
  res.setHeader("Cache-Control", "private, no-store");
  const auth = await requirePerson(req, "affiliate");
  if (!auth.person) return { redirect: auth.redirect };
  const person = auth.person;
  setPageLang(req, person.language);

  const input = readRegisterInput(query);
  const error = isRegisterError(query.e) ? query.e : null;
  const country = isCountry(input.country) ? input.country : null;
  const options = country
    ? await asPerson(person.authUserId, (q) => loadRegisterOptions(q, country))
    : { regions: [], teams: [] };
  return { props: { viewer: viewerOf(person), country, input, error, options } };
};

export default function Register({ viewer, country, input, error, options }: Props) {
  const t = strings(viewer.lang);
  const lang = viewer.lang;

  if (!country) {
    return (
      <Page title={t.registerTitle} viewer={viewer} nav="register">
        <h1>{t.registerTitle}</h1>
        <p>{t.chooseCountry}</p>
        {error === "country" && <p className="err" role="alert">{t.errCountry}</p>}
        <div className="countries">
          {COUNTRIES.map((c) => (
            <a key={c} className="button" href={`/register?country=${c}`}>{countryName(c, lang)}</a>
          ))}
        </div>
      </Page>
    );
  }

  const fieldError = (field: RegisterError, message: string) =>
    error === field ? <p id={`${field}-err`} className="err fielderr">{message}</p> : null;
  const invalid = (field: RegisterError) => (error === field ? { "aria-invalid": true, "aria-describedby": `${field}-err` } : {});

  return (
    <Page title={t.registerTitle} viewer={viewer} nav="register">
      <div className="narrow">
        <h1>{t.registerTitle}</h1>
        <p><b>{countryName(country, lang)}</b> · <a href="/register">{t.changeCountry}</a></p>
        {error === "code" && <p className="err" role="alert">{t.errCode}</p>}
        {error === "rejected" && <p className="err" role="alert">{t.errRejected}</p>}

        <form method="post" action="/api/register">
          <input type="hidden" name="country" value={country} />

          <label htmlFor="name">{t.fullName}</label>
          <input id="name" name="name" required minLength={2} maxLength={NAME_MAX} autoComplete="off"
                 autoCapitalize="words" spellCheck={false} defaultValue={input.name} {...invalid("name")} />
          {fieldError("name", t.errName)}

          <label htmlFor="region">{regionLabel(country, lang)}</label>
          <select id="region" name="region" required defaultValue={options.regions.includes(input.region) ? input.region : ""} {...invalid("region")}>
            <option value="">{t.choose}</option>
            {options.regions.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          {fieldError("region", t.errRegion)}

          {options.teams.length > 0 && (
            <>
              <label htmlFor="team">{t.team}</label>
              <select id="team" name="team" required
                      defaultValue={input.team === NO_TEAM || options.teams.some((tm) => tm.id === input.team) ? input.team : ""}
                      {...invalid("team")}>
                <option value="">{t.choose}</option>
                <option value={NO_TEAM}>{t.noTeam}</option>
                {options.teams.map((tm) => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
              </select>
              {fieldError("team", t.errTeam)}
            </>
          )}

          <p className="muted">{t.saleNote}</p>
          <button type="submit">{t.submitRegister}</button>
        </form>
      </div>
    </Page>
  );
}
