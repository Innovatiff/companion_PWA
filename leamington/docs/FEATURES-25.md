# Hoy: 25 free features in five rounds (from 2026-09-14)

The owner asked for 25 features that make members feel valued, with more
illustrations and less text, plus animations and a new look after a reference
design. Every feature is free for the member.

Each round is built, then reviewed on real screens and reworked before the next
round starts. The standing rules still apply:
- no fabricated data
- silence is never evidence
- clients never call external APIs
- FX is a reference rate only, with no advice
- lottery shows results only
- official warnings stay verbatim

## Round 1: Ahora y diseño
1. **Ahora:** the current temperature, feels-like, humidity, wind and sky. Three providers, median, observed within 90 minutes; shown on Clima, home and watched towns.
2. **New look:** a lavender background, indigo gradient hero, soft cards, pills and a floating centre tab.
3. **Animated illustrations:** cached SVG files instead of text-heavy rows, with reduced-motion respected.
4. **Live sky greeting:** home's hero follows Leamington's real sky (dawn, day, dusk, night).
5. **Letra grande:** an easy-read mode with bigger type and stronger contrast, set in Más.

## Round 2: Tú eres Hoy
6. **Member card:** name, code, member since, valid until, and the business that registered them.
7. **Insignias:** badges earned from real facts. Locked badges say how to earn them, and all are free.
8. **Season ring:** progress from arrival to departure, or a countdown to the next trip.
9. **Welcome:** a first-open screen with the hometown photo and a round arrow button.
10. **Allá y aquí:** hometown clock, day or night, and current weather there and in Leamington.

## Round 3: Tu dinero
11. **Rate chart:** 7, 30 and 90 days, with a pill toggle and the high and low.
12. **Sending calculator:** amount chips, both directions, at the reference rate.
13. **Rate reminder:** one push when the reference rate reaches the member's number.
14. **Week of the rate:** seven day-circles showing up or down against the day before.
15. **Holidays here and there:** Ontario statutory holidays and home holidays, with a countdown.

## Round 4: Tu día de trabajo
16. **Hour by hour:** the next 12 hours in Leamington, temperature and rain chance.
17. **Sun and heat:** UV index and heat for the field day.
18. **Air quality:** a smoke and air-quality gauge for Leamington.
19. **Your day in icons:** jacket, umbrella, sunscreen and water, from the real forecast numbers.
20. **Time change and daylight:** the clock-change reminder and tomorrow's sunrise.

## Round 5: Siempre contigo
21. **¿Salió mi número?:** check numbers against official lottery results.
22. **Tu semana:** a weekly recap from real rows: days they opened Hoy, the week of the rate, their team's results, the latest lottery results, holidays ahead, badges earned. It replaces "Quiniela Hoy" (free football picks), which would have had nothing to show while the football provider account is suspended.
23. **Hometown gallery:** more freely licensed photos of the hometown.
24. **Offline:** pages saved for use without internet, with the time they were saved.
25. **Night mode:** an automatic dark theme.

Round reviews may reshape any feature; each change is noted here.

## Review notes

### Round 1 (2026-09-14)
- **Ahora ranges.** The first production morning showed ranges like "11–16°".
  - **Cause:** the providers' readings were half an hour apart during the warm-up, and in Morelia one outlier stood against two providers that agreed.
  - **Fix (0043):** only readings within 20 minutes of the newest are combined. The temperature is the median when two providers agree within 2°, and a range only when none do. OpenWeather is now called every 30 minutes while there are 17 places or fewer, so its reading is as recent as the others'.
- **Clima's today card** repeated the strip's "Hoy" row: merged in round 2.
- **Home row headers** wrapped ("Leamington · Ahora · 9:25am"): shortened in round 2.

### Round 2 (2026-09-14)
- **The welcome screen is not a page view.** The Explorador badge counts distinct pages opened, so counting the welcome would make "Abre 5 secciones" untrue. welcomed_at is its record.
- **The welcome says "Te damos la bienvenida a Hoy"**, which reads right for everyone.
- **Vigía has no earned date:** saving watched towns rewrites their rows, so the date would be the last save, not when it was earned.
- **Temporada is decided for the current season only**, because only one arrival and one departure are stored.
- **Carried into round 3:** the welcome photo credit is clamped to two lines, and home's "Ahora" rows share one layout at 360 and 390 px.

### Round 3 (2026-09-14)
- **The reminder ranks below match day and above the 30-day high** in the one-a-day engagement queue, because the member asked for it (OPEN-DECISIONS 3.23). It fires once.
- **MXN has no weekend days**, since its source publishes business days only. Charts show real stored days and never fill a gap.
- **Carried into round 4:** Feriados listed two years in one scroll, so it now shows the next eight with the rest folded. Tasa at 3 meses was near its byte budget, so its day table is gone; the line with its high and low shows that window.

### Round 4 (2026-09-14)
- **The detail moved to its own page,** "Hoy en Leamington" (/clima/aqui), so Clima stays within budget.
- **An hour whose providers disagree shows its rain and sky but no temperature.** A missing workday flag never reads as "no risk", and the heat chip appears only from "Precaución" up.
- **The morning number is labelled "6–7am"**, since the 7am hour is used when 6am has no data.

### Round 5 (2026-09-14)
- **Quiniela Hoy became Tu semana** (feature 22).
- **Lottery checks show matches only,** never prizes, and nothing is compared while a game's results are stale. Each game's format comes from its operator's rules page.
- **Offline copies hide every expired block** (Ahora, hourly cells, air, clocks) and are cleared when another code signs in.
- **Gallery candidates were reviewed by eye.** Historic images, businesses, panoramas and generic buildings are filtered out.
- **Uruapan showed "Ahora 14–23°" during a rain shower. This is real disagreement, not an error.** All three providers place the town correctly (1,617 m). Open-Meteo's model said 23° under cloud, while WeatherAPI (13.9°) and OpenWeather (19.9°) reported light rain. No two agree within 2°, so the range stands rather than a false single number.
- **Polish from production review:**
  - Lotería printed a raw "mas1" label; it now shows "Más 1".
  - Lotería shows the latest draw per game and folds the earlier ones.
  - Tu semana falls back to "últimos 7 días" early in the week.
  - Dark-mode chips are restyled.
