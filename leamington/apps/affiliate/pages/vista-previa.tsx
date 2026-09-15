/**
 * Vista previa: while talking to a prospect, show what Hoy would show THEM today.
 * No JavaScript: every choice is a GET link or a GET form.
 *
 *   /vista-previa                               the person's country (four buttons)
 *   /vista-previa?country=HN&q=ceiba            search our municipality list
 *   /vista-previa?country=HN&m=345[&team=12]    the preview, a team choice, "Registrar a esta persona"
 *
 * Every part comes from app.prospect_preview (0051) inside asPerson and is shown
 * only when present, with its date or time. The phone speaks the prospect's
 * language (English for Jamaica). Nothing about the prospect is saved; the first
 * GET of a preview adds one anonymous count (affiliate, country, time). The team
 * form carries more=1 so changing the team is not counted again.
 *
 * Pictures come from this portal's own routes (/api/preview/...), never Hoy's.
 */
import type { GetServerSideProps } from "next";
import { requirePerson } from "@leamington/shared/src/server/portal.ts";
import { asPerson } from "@leamington/shared/src/server/db.ts";
import { formatDate, localDate } from "@leamington/shared/src/format.ts";
import { Card, Hero } from "@leamington/shared/src/ui/Portal.tsx";
import { Page, setPageCss, setPageLang, viewerOf, type Viewer } from "../lib/layout.tsx";
import { strings } from "../lib/strings.ts";
import { COUNTRIES, countryName, type Country } from "../lib/clients.ts";
import { NO_TEAM } from "../lib/register.ts";
import { loadRegisterOptions, type TeamOption } from "../lib/options.ts";
import {
  SEARCH_MIN, clock, directHit, hoursMinutes, loadPreview, previewHref, previewRegisterHref, prospectLang, rateText, readPreviewQuery,
  searchTowns, townById, type Preview, type Town,
} from "../lib/preview.ts";

export const config = { unstable_runtimeJS: false };

type Props = {
  viewer: Viewer;
  country: Country | null;
  q: string;
  hits: Town[] | null;
  town: Town | null;
  teams: TeamOption[];
  team: string;
  preview: Preview | null;
};

// Only this page's rules, so no other portal page carries them.
const CSS =
  ".pv{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,21rem);gap:1rem;align-items:start}" +
  ".phone{max-width:25rem;margin:0 auto 1rem;background:#161a45;border-radius:2.3rem;padding:.65rem;box-shadow:0 18px 40px rgba(30,34,90,.25)}" +
  ".scr{background:#f1f2f9;border-radius:1.8rem;overflow:hidden;font-size:1.1rem;line-height:1.35}" +
  ".ph{position:relative;background:linear-gradient(135deg,#3e46c4,#2a74c9);color:#fff}" +
  ".ph img{display:block;width:100%;height:auto;aspect-ratio:3/2;object-fit:cover}" +
  ".ph h2{margin:0;padding:1.3rem 1rem .9rem;font-size:2rem;line-height:1.1;overflow-wrap:anywhere}" +
  ".ph img+h2{position:absolute;left:0;right:0;bottom:0;padding-top:3rem;background:linear-gradient(transparent,rgba(8,10,40,.72))}" +
  ".ph h2 small{display:block;color:rgba(255,255,255,.9);font-size:1rem;font-weight:600}" +
  ".cr{margin:0;padding:.3rem 1rem 0;font-size:.75rem;color:var(--muted);overflow-wrap:anywhere}.cr a{color:inherit}" +
  ".tl{display:grid;gap:.55rem;padding:.6rem}.two{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.55rem}.two>:only-child{grid-column:1/-1}" +
  ".tile{background:#fff;border-radius:1.1rem;padding:.8rem .95rem;min-width:0;overflow-wrap:anywhere}" +
  ".tile .k{display:block;font-size:.8rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}" +
  ".tile .v{display:block;font-size:2.1rem;font-weight:800;line-height:1.1;margin:.2rem 0;font-variant-numeric:tabular-nums}" +
  ".tile .v.m{font-size:1.25rem;line-height:1.25}.tile small{display:block;font-size:.88rem;color:var(--muted)}" +
  ".tile img{display:block;width:100%;height:auto;border-radius:.7rem;margin:.4rem 0}" +
  ".nw{display:flex;gap:.65rem;align-items:flex-start;margin-top:.55rem}.nw img{width:5rem;flex:none;margin:0}.nw b{display:block;font-size:1rem}" +
  ".also{margin:.3rem 0 0;padding-left:1.15rem;font-size:1rem}.also li{margin:.2rem 0}" +
  ".pv .button.block{min-height:56px;font-size:1.1rem}.pv form button{width:100%}" +
  "@media (max-width:56rem){.pv{grid-template-columns:minmax(0,1fr)}}" +
  "@media (max-width:24rem){.tile .v{font-size:1.7rem}.ph h2{font-size:1.6rem}}";

export const getServerSideProps: GetServerSideProps<Props> = async ({ req, res, query }) => {
  // A GET page; anything else is refused (and never counted).
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.statusCode = 405;
    res.setHeader("Allow", "GET, HEAD");
    res.end();
    return { props: {} as Props };
  }
  res.setHeader("Cache-Control", "private, no-store");
  const auth = await requirePerson(req, "affiliate");
  if (!auth.person) return { redirect: auth.redirect };
  const person = auth.person;
  setPageLang(req, person.language);
  setPageCss(req, "lite");

  const input = readPreviewQuery(query);
  const data = await asPerson(person.authUserId, async (q) => {
    const country = input.country;
    if (!country) return { country: null, q: input.q, hits: null, town: null, teams: [], team: "", preview: null };
    const found = input.m ? await townById(q, input.m) : null;
    let town = found && found.country === country ? found : null;
    let hits: Town[] | null = null;
    if (!town && input.q.length >= SEARCH_MIN) {
      hits = await searchTowns(q, country, input.q);
      // One town matches, or one has exactly the typed name: its preview at once, one step less at the counter.
      town = directHit(hits, input.q);
    }
    if (!town) return { country, q: input.q, hits, town: null, teams: [], team: "", preview: null };
    const { teams } = await loadRegisterOptions(q, country);
    const team = input.team === NO_TEAM || teams.some((t) => t.id === input.team) ? input.team : "";
    const teamId = team && team !== NO_TEAM ? team : null;
    const preview = await loadPreview(q, town, teamId, req.method === "GET" && !input.again);
    return { country, q: input.q, hits: null, town, teams, team, preview };
  });
  return { props: { viewer: viewerOf(person), ...data } };
};

export default function VistaPrevia({ viewer, country, q, hits, town, teams, team, preview }: Props) {
  const t = strings(viewer.lang);
  const lang = viewer.lang;

  // One GET form: the country and the town. Several matches come back as links.
  if (!country || !town || !preview) {
    return (
      <Page title={t.previewTitle} viewer={viewer} nav="preview">
        <Hero title={t.previewTitle} subtitle={t.previewSub} />
        <Card className="form" title={t.previewCountry}>
          <form method="get" action="/vista-previa">
            <label htmlFor="country">{t.colCountry}</label>
            <select id="country" name="country" required defaultValue={country ?? ""}>
              <option value="">{t.choose}</option>
              {COUNTRIES.map((c) => <option key={c} value={c}>{countryName(c, lang)}</option>)}
            </select>
            <label htmlFor="q">{t.previewTown}</label>
            <input id="q" name="q" type="search" required minLength={SEARCH_MIN} maxLength={60} autoComplete="off"
                   spellCheck={false} defaultValue={q} aria-describedby="q-hint" />
            <p id="q-hint" className="muted">{t.previewTownHint}</p>
            <button type="submit" className="block">{t.previewSearch}</button>
          </form>
          {country && hits && hits.length > 0 && (
            <>
              <p>{t.previewPick(hits.length, q)}</p>
              <ul className="list">
                {hits.map((h) => (
                  <li key={h.id}>
                    <div><div className="t"><a href={previewHref({ country, m: h.id })}>{h.name}</a></div><div className="meta">{h.adminRegion}</div></div>
                  </li>
                ))}
              </ul>
            </>
          )}
          {country && hits && hits.length === 0 && <p className="note warn" role="status">{t.previewNoMatch(q, countryName(country, lang))}</p>}
        </Card>
      </Page>
    );
  }

  return (
    <Page title={t.previewFor(town.name)} viewer={viewer} nav="preview">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <Hero title={t.previewFor(town.name)} subtitle={`${town.adminRegion} · ${countryName(town.country, lang)} · ${t.previewLanguage(prospectLang(town.country) === "en")}`} />
      <div className="pv">
        <PhonePreview p={preview} label={t.previewPhone} />
        <div>
          {!preview.now && !preview.today && (
            // Portal only, never in the phone: a newly previewed town is fetched on the weather feeds' next run.
            <p className="note warn" id="weather-pending" role="status">{t.previewWeatherPending}</p>
          )}
          <Card title={teams.length > 0 ? t.previewTeam : undefined}>
            <form method="get" action="/vista-previa">
              <input type="hidden" name="country" value={town.country} />
              <input type="hidden" name="m" value={town.id} />
              <input type="hidden" name="more" value="1" />
              {teams.length > 0 && (
                <>
                  <label htmlFor="team" className="sr">{t.previewTeam}</label>
                  <select id="team" name="team" defaultValue={team || NO_TEAM}>
                    <option value={NO_TEAM}>{t.previewNoTeam}</option>
                    {teams.map((tm) => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
                  </select>
                  <button type="submit" className="secondary">{t.previewUpdate}</button>
                </>
              )}
            </form>
            <a className="button secondary block" href={previewHref({ country: town.country })}>{t.previewChangeTown}</a>
          </Card>
          <Card>
            <a className="button block" id="register" href={previewRegisterHref(town, team)}>{t.previewRegister}</a>
            <p className="muted">{t.previewRegisterNote}</p>
            <p className="muted">{t.previewPrivacy}</p>
          </Card>
        </div>
      </div>
    </Page>
  );
}

/** The phone: the prospect's language, only the parts we hold. */
function PhonePreview({ p, label }: { p: Preview; label: string }) {
  const s = strings(p.language);
  const lang = p.language;
  const m = p.municipality;
  const off = p.time.offset_minutes;
  const video = p.video;
  const r = p.result;
  return (
    <section className="phone" aria-label={label} lang={lang}>
      <div className="scr">
        <div className="ph" data-part={p.photo ? "photo" : undefined}>
          {p.photo && <img src={`/api/preview/photo/${m.id}`} alt="" width={p.photo.width ?? undefined} height={p.photo.height ?? undefined} />}
          <h2>{m.name}<small>{m.admin_region}</small></h2>
        </div>
        {p.photo && (
          <p className="cr">{s.pvPhoto}: <a href={p.photo.source_page_url}>{p.photo.author} · {p.photo.license}</a></p>
        )}
        <div className="tl">
          <div className="two">
            {p.now ? (
              <div className="tile" data-part="now">
                <span className="k">{s.pvNow}</span><span className="v">{p.now.temp}</span>
                {p.now.label && <small>{p.now.label}</small>}
                <small>{s.pvObserved(clock(p.now.observed_at, m.timezone))}</small>
              </div>
            ) : p.today ? (
              <div className="tile" data-part="today">
                <span className="k">{s.pvForecast}</span><span className="v">{p.today.text}</span>
                <small>{formatDate(p.today.date, lang)}</small>
              </div>
            ) : null}
            <div className="tile" data-part="time">
              <span className="k">{s.pvTime}</span><span className="v">{p.time.local}</span>
              <small>{off === 0 ? s.pvSameTime : off < 0 ? s.pvBehind(hoursMinutes(off)) : s.pvAhead(hoursMinutes(off))}</small>
            </div>
          </div>
          {p.now && p.today && (
            <div className="tile" data-part="today">
              <span className="k">{s.pvForecast}</span><span className="v m">{p.today.text}</span>
              <small>{formatDate(p.today.date, lang)}</small>
            </div>
          )}
          {p.fx && (
            <div className="tile" data-part="fx">
              <span className="k">{s.pvRate}</span>
              <span className="v">1 CAD = {rateText(p.fx.rate)} {p.fx.currency}</span>
              <small>{p.fx.note} · {s.pvRateOf(formatDate(p.fx.date, lang))}</small>
            </div>
          )}
          {video && (
            <div className="tile" data-part="video">
              <span className="k">{video.scope === "team" && p.team ? s.pvTeamVideo(p.team.name) : s.pvLeagueVideo(video.league ?? "")}</span>
              {video.thumb && <img src={`/api/preview/video-thumb/${video.id}`} alt="" width={video.thumb_w ?? undefined} height={video.thumb_h ?? undefined} />}
              <span className="v m">{video.title}</span>
              <small>YouTube · {video.channel} · {formatDate(localDate(video.published_at, m.timezone), lang)}</small>
            </div>
          )}
          {r && (
            <div className="tile" data-part="result">
              <span className="k">{s.pvResult}</span>
              <span className="v m">{r.home} {r.home_score} – {r.away_score} {r.away}</span>
              <small>{r.league} · {formatDate(localDate(r.kickoff, m.timezone), lang)}</small>
            </div>
          )}
          {p.holiday && (
            <div className="tile" data-part="holiday">
              <span className="k">{s.pvHoliday}</span>
              <span className="v m">{p.holiday.name}</span>
              <small>{formatDate(p.holiday.date, lang)} · {s.pvIn(p.holiday.days_left)}</small>
              <small>{s.pvVerified(formatDate(p.holiday.verified_at, lang))}</small>
            </div>
          )}
          {p.news.length > 0 && (
            <div className="tile" data-part="news">
              <span className="k">{s.pvNews}</span>
              {p.news.map((n) => (
                <div className="nw" key={n.id}>
                  {n.image && <img src={`/api/preview/news-thumb/${n.id}`} alt="" width={n.thumb_w} height={n.thumb_h} />}
                  <div><b>{n.title}</b><small>{n.source} · {formatDate(localDate(n.published_at, m.timezone), lang)}</small></div>
                </div>
              ))}
            </div>
          )}
          <div className="tile">
            <span className="k">{s.pvAlso}</span>
            <ul className="also">
              {p.alerts_active && <li data-part="alerts">{s.pvAlsoAlerts}</li>}
              <li>{s.pvAlsoLeamington}</li>
              <li>{s.pvAlsoBadges}</li>
              <li>{s.pvAlsoNews}</li>
              <li>{s.pvAlsoVideos}</li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
