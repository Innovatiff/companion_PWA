# Curated static data

Loaded by `src/feeds/static.mjs`. The record kind is the filename minus `.json` and minus a two-letter prefix plus `-`/`_`. Each record carries `verified_at` and `verified_by`, and none sets `needs_verification`.

**Everything here was checked on 2026-09-13** by `claude-code (checked against source_url)`. Each fact was read on the official page named in `source_url`. Some records carry extra fields (`rule`, `notes`, `office`, `emergency_phone`, `fees_note`, `sector`, `source_urls`). The current writers ignore them; they explain the date rule or add provenance.

Validated by `test/static-data.test.mjs`:

```
cd services/ingest && node --test test/static-data.test.mjs
```

`emergency_contacts` and `transit` have **no loader or table yet**. Until one exists, `ingestStatic` reports these files as "unknown record kind" warnings and skips them.

## Files

### Holidays: national public holidays, 2026-09-13 to 2027-12-31

| File | Records | Sources |
| --- | --- | --- |
| `mx-holidays.json` | 11 | Ley Federal del Trabajo art. 74 (diputados.gob.mx, last amended DOF 14-05-2026). Election day: INE Central Electoral, 31-07-2026. |
| `gt-holidays.json` | 17 | Código de Trabajo art. 127 (PDF on mcd.gob.gt). Decreto 19-2018 (congreso.gob.gt). Diario de Centro América, 23-06-2026, on the 2020 Constitutional Court ruling. |
| `hn-holidays.json` | 16 | Código del Trabajo art. 339 (trabajo.gob.hn). Decreto 78-2015 and Decreto 126-2020 in La Gaceta (tsc.gob.hn). |
| `jm-holidays.json` | 13 | Holidays (Public General) Act and Schedule (mlss.gov.jm). Good Friday and Christmas Day: Consulate General of Jamaica, Toronto (jcgtoronto.ca). |
| `on-provincial_holidays.json` | 18 | Ontario's nine public holidays, 2026 and 2027, from Your guide to the Employment Standards Act, "Public holidays" (ontario.ca). Checked 2026-09-14. Loaded into `provincial_holidays` (0042). |

Ontario: the guide lists nine public holidays. It says an employer is not required to give Easter Monday, the first Monday in August (Civic Holiday) or Remembrance Day, so those are not included. The dates follow each holiday's rule: Family Day is the third Monday in February, Victoria Day the Monday before 25 May, Labour Day the first Monday in September and Thanksgiving the second Monday in October. Good Friday is two days before Easter (5 April 2026, 28 March 2027). A holiday on a weekend keeps its date; the ESA gives a substitute day or holiday pay instead.

How the movable dates were resolved (Easter 2027 = 28 March):

- **Mexico**
  - 2026: third Monday of November = 16 Nov.
  - 2027: first Monday of February = 1 Feb; third Monday of March = 15 Mar; third Monday of November = 15 Nov.
  - Art. 74 IX makes the ordinary federal jornada electoral a rest day. INE states it is 6 June 2027.
- **Guatemala**
  - Decreto 19-2018 moves an asueto to a Monday: to the previous Monday if it falls on Tuesday or Wednesday, to the next Monday if it falls Thursday through Sunday.
  - 30 June 2027 is a Wednesday, so the rest day is Monday 28 June.
  - 1 May and 20 October are no longer moved: the Constitutional Court struck those words from the decree in 2020 (as reported by the Diario de Centro América). The other asuetos are excepted by the decree itself.
- **Honduras**
  - Decreto 78-2015 moves the 3, 12 and 21 October holidays into the "Semana Morazánica", starting the first Wednesday of October: 7 Oct 2026 and 6 Oct 2027.
  - Public employees get Wednesday to Friday. The private sector gets Wednesday 12 M to Saturday 12 M.
  - Decreto 126-2020 moved it only for 2020, and says 78-2015 applies again in later years.
- **Jamaica**
  - Labour Day moves to Monday if 23 May is a Saturday or Sunday: 24 May 2027.
  - Emancipation Day moves to Monday if 1 August is a Sunday: 2 Aug 2027.
  - National Heroes' Day is the third Monday of October: 19 Oct 2026, 18 Oct 2027.
  - Ash Wednesday 2027 is 10 Feb.

### School calendar: national calendars only

| File | Records | Source |
| --- | --- | --- |
| `mx-school_calendar.json` | 22 | SEP, Subsecretaría de Educación Básica, 15-07-2026: publication in the DOF of the 2026-2027 calendar (preescolar, primaria, secundaria). |
| `gt-school_calendar.json` | 12 | MINEDUC Acuerdo Ministerial 4817-2025 (Diario de Centro América, 22-12-2025), Calendario Escolar 2026, **public sector**. |

### Consulates

| File | Records | Source |
| --- | --- | --- |
| `mx-consulates.json` | 1 | consulmex.sre.gob.mx/leamington, "Ubicación, Horarios y Teléfonos". |
| `hn-consulates.json` | 1 | embajadahondurasencanada.hn: pasaportes (requirements, cost, booking link) and tarifas. |
| `jm-consulates.json` | 1 | jcgtoronto.ca: fees page, "Revised Fees 2026" PDF (as of 1 April 2026), contact details. |

### Emergency contacts (new kind, no loader yet)

| File | Records | Source |
| --- | --- | --- |
| `ca-emergency_contacts.json` | 5 | opp.ca (911, OPP non-emergency), windsorpolice.ca, ontario.ca "Your health" (Health811), ontariopoisoncentre.ca. The OPP's Leamington detachment is listed on leamington.ca. |
| `mx-emergency_contacts.json` | 2 | gob.mx/911; consulmex Leamington contact page (emergency line). |
| `gt-emergency_contacts.json` | 8 | conred.gob.gt "Números de emergencia". |
| `jm-emergency_contacts.json` | 2 | jcf.gov.jm (Police Emergency 119, Crime Stop 311). |

### Transit (new kind, no loader yet)

| File | Records | Source |
| --- | --- | --- |
| `ca-transit.json` | 3 | leamington.ca (LTGO On-Demand Transit); citywindsor.ca Transit Windsor fares and routes pages (city network, Amherstburg 605). |

## Excluded, and why

Nothing below was filled from memory or from third-party sites.

### Holidays

- **Guatemala:**
  - **Sábado Santo 2027** is left out. Art. 127 lists "jueves, viernes y sábado santos". But Decreto 19-2018 exempts only "jueves y viernes santo" from the move to Monday, so it is unclear whether the Saturday rest stays on Saturday or moves to Monday.
  - **Medio día del miércoles santo** is left out. It appears in Decreto 19-2018's list of exceptions but not in art. 127's list of asuetos for private workers.
  - **10 de mayo** (working mothers only) and the **local patron-saint day** are not national holidays.
- **Guatemala, Honduras:** the Constitutional Court ruling is cited through the state gazette's news report (dca.gob.gt). The ruling itself was not fetched from cc.gob.gt.
- **Honduras:** Semana Santa is recorded as art. 339 states it (Thursday, Friday and Saturday). Any extra days the executive grants each year to the public sector are not included.
- **Jamaica:**
  - The Act PDF on mlss.gov.jm carries amendments up to L.N. 146/1999. Later amendments could not be confirmed.
  - Boxing Day 2027 is recorded on its statutory date, Sunday 26 Dec. The Minister may appoint a different day by order; none was found.
  - The consulate's holidays page says "2nd Monday in October" for National Heroes' Day. The Act says the third Monday, and the Act was used.

### School calendar

- **Mexico 2027-2028:** not yet published.
- **Guatemala 2027:** not yet published. The **private, cooperative and municipal** calendar (Acuerdo 4818-2025) was not fetched.
- **Honduras:** left out entirely. se.gob.hn/calendario-escolar still serves the "Calendario Académico Referencial **2023**". The 2026 calendar appears only as a Google Drive link in a Facebook post, which could not be fetched as an official page.
- **Jamaica:** left out entirely. No official 2026-2027 "Calendar of School Terms and Holidays" bulletin could be fetched; moey.gov.jm points to a Google Drive folder whose files did not load. Only news reports of the 7 September 2026 reopening were found.

### Consulates

- **Guatemala (Consulado General en Toronto):** left out. Every minex.gob.gt URL returned HTTP 403, from both curl and WebFetch. Search snippets of that page show a jurisdiction of Ontario (except the city of Ottawa), Manitoba and Nunavut, but they were not accepted as a source.
- **Mexico:** services, fees, documents and booking link are left out. Every other consulmex Leamington page, including the fee table and passport requirements, is behind a Radware bot challenge and could not be read. Only the contact page loaded, through WebFetch. The consulate's jurisdiction is not stated on that page.
- **Honduras:**
  - The record is the **Embassy in Ottawa**, whose website runs passport services and appointment booking. It is not a consulate, and the site does not state which office covers southwestern Ontario.
  - A Consulado General in Montreal appears on third-party sites only, so it was not included. Jurisdiction is **ambiguous**.
  - Office hours are not stated on the embassy site.
- **Jamaica:**
  - Office hours are not published on jcgtoronto.ca; the "Mon–Thu 08:00–13:00" seen in search results comes from third-party sites.
  - The site does not state which area the Consulate General covers.
  - Passport documents are published only as a video and an application-form link, so none were transcribed.
  - Visa fees "vary"; the renunciation, restoration and marriage citizenship fees were left out as not useful to this audience.
- No availability of any kind is recorded, and booking is a link only.

### Emergency contacts

- **Honduras:** left out entirely. 911.gob.hn serves a placeholder template, or refuses connections. policianacional.gob.hn/911 redirects to 127.0.0.1.
- **Jamaica fire/ambulance:** the only official source found is a 2011–2013 JIS article announcing 112/911 to replace 110. It is too old to confirm current service.
- **Consulate emergency lines:** Guatemala, Honduras and Jamaica publish none on the pages that could be read.
- **Windsor-Essex county police other than OPP and Windsor Police** (for example LaSalle, Amherstburg) were not added.

### Transit

- **LTW (Leamington to Windsor) Transit:** discontinued effective 30 April 2026, according to leamington.ca. There is currently no official Leamington–Windsor public transit record.
- **LTGO:** the page gives operating hours of Saturday 8:00 AM–7:00 PM (from 8 Sept 2026), but booking-agent hours of Saturday 7:00 AM–9:30 PM. The record uses the operating hours.
- **Transit Windsor:**
  - Routes are linked, not transcribed.
  - The Tunnel Bus and any airport service do not appear in the current route chart, so neither was added.
  - LaSalle 25 is covered by the Transit Windsor network record.
