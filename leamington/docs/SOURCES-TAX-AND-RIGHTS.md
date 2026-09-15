# Source verification: tax, documents and worker rights

**Date:** 2026-09-15 (every page below was fetched on this date unless marked otherwise)
**Scope:** Feature 3 (tax refund and document reminders) and Feature 4 (know your rights).
**Status:** source research only. No code, no screens, no advice.

Read this with CLAUDE.md's working agreements: *verify data sources before building
UI*, every static record carries `verified_at`, and *wrong-but-confident is worse
than absent*.

---

## Method and limits

Evidence classes, same meaning as in `SOURCE-VERIFICATION.md`:

| Class | Meaning |
| --- | --- |
| **FETCHED** | Page fetched live on 2026-09-15; the fact is taken from its content. |
| **FETCHED (primary text)** | Legislation text downloaded and read directly (O. Reg. 285/01). |
| **SEARCH-ONLY** | Seen only in a search-engine snippet. **Not verified. Do not build on it.** |
| **BLOCKED** | Fetch failed (403, bot wall, TLS error, 404). Unknown. |

Two caveats about how the pages were read:

1. Most pages were read through a summarising fetch tool, not byte-for-byte. Every
   *quoted* phrase below came back as a quotation from the page. Before any wording
   ships in the UI, copy it again from the live page by hand.
2. **Search-engine summaries contradicted the fetched pages twice during this
   research.** One said harvesters get overtime after 50 hours. The fetched ontario.ca
   page says harvesters are *not* entitled to overtime; the 50-hour rule belongs to
   seasonal fresh fruit and vegetable *processors*. Another said greenhouse workers are
   "near farmers". Neither the fetched page nor the regulation says that. This is exactly
   the kind of error Hoy must not publish, and it is why only FETCHED facts appear in
   the tables.

"Date modified" is the page's own stamp as shown on the page (canada.ca "Date
modified", ontario.ca "Updated"/"Last updated"). "Not shown" means the page carried none.

---

## 1. Summary

### Solid enough to build on (official, fetched, stable or predictably changing)

- **SAWP tax basics (CRA).** Employers deduct income tax, CPP and EI from SAWP
  workers. T4 slips are due by the end of February. A return must be filed to get back
  excess tax withheld or overpaid CPP/EI, and CRA issues no refund until one is filed.
  Residency status (non-resident / deemed resident / deemed non-resident) changes how
  the worker is taxed, and CRA publishes the ties test and the 183-day rule.
- **2025 tax year deadlines:** file by **April 30, 2026**, pay by **April 30, 2026**
  (June 15, 2026 filing if self-employed). This is past and is useful only as a
  pattern. **CRA has not yet published 2026-tax-year (filed in 2027) dates on the
  pages fetched.**
- **The GST/HST credit no longer exists under that name.** It was renamed the
  **Canada Groceries and Essentials Benefit (CGEB)** as of July 2026. Any copy that
  says "GST/HST credit" is now wrong.
- **CRA scam warnings** and the **Tax Rebate Discounting Act fee cap** (discounters
  must pay at least 85¢ per dollar of the first $300 and 95¢ per dollar after that).
- **Document expiry rules:** a 9-series SIN expires with the work permit (Service
  Canada). IRCC says to apply to extend at least 30 days before expiry. Maintained
  status applies only if IRCC receives the application *before* expiry. The restoration
  window is 90 days, and you cannot work while restoring.
- **Ontario minimum wage:** $17.60 until Sept 30, 2026, then **$17.95 from Oct 1,
  2026**. The rate is published by April 1 and takes effect Oct 1 each year.
- **The ESA farm exemptions,** from both the ontario.ca guide *and* the regulation
  text (O. Reg. 285/01 s. 2(2), ss. 24–27). Farm employees in primary production get
  **no** minimum wage, hours limits, rest/eating periods, overtime, public holidays or
  vacation pay. **Harvesters** of fruit, vegetables and tobacco **do** get minimum wage
  (piece-work and room-and-board rules apply). They get vacation pay and public holidays
  after 13 weeks, and no overtime.
- **Federal TFW protections:** the ESDC tip line **1-866-602-9448**, confidential, with
  **a Spanish-language page**; the "Your rights are protected" page **in Spanish**; and
  IRCC's open work permit for vulnerable workers, with fetched eligibility conditions.
- **OHSA applies to farms** with paid workers (O. Reg. 414/05). The right-to-refuse
  procedure, reprisal protection and the MLITSD line **1-877-202-0008** are all fetched.
- **WSIB** covers SAWP workers from the agreed departure point in the home country
  until they return, under policy 12-04-08, effective May 1, 2025. Claims line:
  1-800-387-0750.
- **Legal Aid Ontario-funded clinics** serving Windsor-Essex: Legal Assistance of
  Windsor and the Windsor-Essex Bilingual Legal Clinic, confirmed on LAO's own listings.

### Not solid, or must not be built as a single rule

- **Guatemala and Honduras are not SAWP countries.** The ESDC SAWP overview lists
  Mexico and Caribbean countries. Guatemalan and Honduran workers are normally in the
  **Agricultural Stream** of the TFWP, and several rules differ by stream:
  - **OHIP:** SAWP workers are covered from day one. Other agri-food workers need proof
    of full-time work for 6 consecutive months.
  - **Housing:** free under SAWP. The Agricultural Stream allows up to $30/week in
    deductions.
  - **Airfare recovery:** permitted under SAWP within contract limits, never under the
    Agricultural Stream.
  - **The WSIB policy** is written for the Commonwealth Caribbean/Mexican SAWP.

  **Any UI that treats "seasonal agricultural worker" as one status will be wrong for
  roughly half of Hoy's countries.** Hoy needs the member's *program* (SAWP vs
  Agricultural Stream vs other) before showing these facts.
- **Greenhouse workers.** Leamington's core workforce works in greenhouses. Neither the
  ontario.ca guide nor O. Reg. 285/01 uses the word "greenhouse". The farm exemption
  depends on being "employed on a farm" in "primary production" of listed products,
  which include vegetables. Mushrooms and flowers have their own, smaller exemptions,
  and packing/processing work has different rules. **No fetched official page states
  which category a greenhouse vegetable picker or packer falls into.** Hoy must not
  answer "do I get overtime / public holidays?" for greenhouse workers. It can only show
  the categories and the official phone line.
- **The CGEB (formerly GST/HST credit) and the Canada Workers Benefit for these
  workers.** CGEB requires being "a resident of Canada for tax purposes" around each
  payment. CWB requires being "a resident of Canada throughout the year". No fetched
  page says how either applies to non-resident or deemed-resident seasonal workers.
  **Do not tell workers they qualify.**
- **Free tax clinic list.** CRA's clinic finder is a session-based form marked
  `noindex, nofollow`, with no export or open data. Scripted queries returned nothing
  usable: the "No clinics available" text is a static template string present before
  any search. **INCONCLUSIVE, not "no clinics in Leamington".** Link only.
- **Consulates.** The Mexico Leamington consulate site sits behind a bot wall. The one
  page that loaded, the PTAT page (updated Dec 22, 2025), still quotes the **2024
  Ontario minimum wage ($16.71)**. That is proof that consular pages cannot be used as a
  source for Ontario rules. The Guatemala MINEX pages returned 403. Honduras's embassy
  site has no worker-protection content. Jamaica Liaison Service office contacts appear
  only on non-government sites in search results.
- **2026 tax year (filed in 2027) dates:** not published on the fetched CRA pages. Do
  not pre-fill.

---

## 2. Feature 3 findings: tax refund and document reminders

Fetched date for every row: **2026-09-15**.

### 3.1 Residency status and who files

| # | Fact (plain words) | Source (title, URL) | Page date | Spanish | Stability | Verification plan | Risk |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T1 | Seasonal agricultural workers without significant residential ties are usually **non-residents** (under 183 days in Canada; taxed only on Canadian income), **deemed residents** (183+ days and not resident elsewhere under a treaty; taxed on world income) or **deemed non-residents** (treaty resident elsewhere; taxed like non-residents). | *Seasonal agricultural workers from other countries*, https://www.canada.ca/en/revenue-agency/services/tax/international-non-residents/individuals-leaving-entering-canada-non-residents/seasonal-agricultural-workers-other-countries.html | 2026-01-20 | No (EN/FR only) | Rarely changes (statute) | Quarterly diff of the page; annual human read before tax season | **HIGH.** Depends on days in Canada, ties and treaty. A worker who stays past 183 days changes category. Never infer status for the member. |
| T2 | The page names income tax treaties with **Mexico, Barbados, Jamaica, Trinidad and Tobago** in the SAWP context. It names no treaty for Guatemala or Honduras. | same as T1 | 2026-01-20 | No | Rarely | same as T1 | **HIGH.** Absence from this page is not evidence that no treaty exists (SILENCE IS NEVER EVIDENCE). Do not build treaty logic. |
| T3 | Primary residential ties: a home, a spouse/common-law partner, or dependants in Canada. Secondary ties include a driver's licence and provincial health insurance. **Form NR74** asks CRA for a residency opinion on entering Canada; **NR73** on leaving. | *Determining your residency status*, https://www.canada.ca/en/revenue-agency/services/tax/international-non-residents/information-been-moved/determining-your-residency-status.html | 2026-01-20 | No | Rarely | Annual | **MED.** Holding an OHIP card is itself listed as a possible secondary tie. |
| T4 | Employers must deduct **income tax, CPP and EI** from SAWP workers; code **15** in box 29 of the T4; T4s are due by the last day of February. A return must be filed if the worker wants a refund of excess tax or overpaid CPP/EI, owes tax, or CRA asks for one. | *Seasonal Agricultural Workers Program* (payroll), https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/payroll-deductions-contributions/special-situations/seasonal-agricultural-workers-program.html | 2026-08-17 | No | Rarely (rates change yearly; the rule doesn't) | Quarterly diff | **MED.** Written for employers. Present it as "what CRA tells employers", not as a promise of a refund. |
| T5 | The **5013-R** return is for non-residents, non-residents electing under section 217, and deemed residents. The 5013-G guide says: "Even if you did not have any income in the year, you still have to file a return to get the benefits, credits, and refund you may be entitled to." | *2025 Income Tax and Benefit Guide for Non-Residents and Deemed Residents of Canada*, https://www.canada.ca/en/revenue-agency/services/forms-publications/tax-packages-years/general-income-tax-benefit-package/non-residents/5013-g/guide-non-residents-deemed-residents-canada-completing-your-return.html | 2026-01-20 | No | **Annual** (new guide each tax year; URL is reused) | Each February, confirm the guide year has rolled to the new tax year | **MED.** Which return a worker files depends on status (T1). Hoy must not pick the form. |
| T6 | Section 217: an election a non-resident can make for certain Canadian-source income. The overview page is fetched; the detail pages ("Who can elect", due dates) were **not** fetched. A search snippet says SAWP workers can elect to include CPP income; **SEARCH-ONLY, not verified.** | *Electing under section 217*, https://www.canada.ca/en/revenue-agency/services/tax/international-non-residents/individuals-leaving-entering-canada-non-residents/electing-under-section-217.html | 2026-01-20 | No | Rarely | Fetch the sub-pages before any use | **HIGH.** Specialist topic. Do not surface in v1. |

### 3.2 Refunds and benefits that commonly come up

| # | Fact | Source | Page date | Spanish | Stability | Verification plan | Risk |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T7 | CPP overpayment (line 44800): "The CRA will refund the excess contributions to you or use them to reduce your balance owing." | *Line 44800 – CPP or QPP overpayment*, https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/about-your-tax-return/tax-return/completing-a-tax-return/deductions-credits-expenses/line-44800-cpp-overpayment.html | 2026-01-20 | No | Annual (line numbers stable) | Annual | **MED.** Overpayment ≠ all CPP paid. Workers often believe all CPP comes back; the page does not say that. |
| T8 | EI overpayment (line 45000): refunded or applied to a balance owing; "If the difference is $1 or less, you may not receive a refund." (A three-year limit appeared in a search snippet but **not** on the fetched page.) | *Line 45000 – Employment insurance overpayment*, https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/about-your-tax-return/tax-return/completing-a-tax-return/deductions-credits-expenses/line-45000-employment-insurance-overpayment.html | 2026-01-20 | No | Annual | Annual | **MED.** Same misunderstanding as T7. |
| T9 | **The GST/HST credit was renamed the Canada Groceries and Essentials Benefit (CGEB) as of July 2026.** The last GST/HST credit payment was April 2, 2026, and a one-time top-up was paid June 5, 2026. | *GST/HST credit – No longer available*, https://www.canada.ca/en/revenue-agency/services/child-family-benefits/gst-hst-credit.html | 2026-07-08 | No | Just changed; expect follow-up edits | Monthly until early 2027, then quarterly | **HIGH.** Anything written before July 2026 (NGO leaflets, consular pages) uses the old name. |
| T10 | CGEB eligibility: "a resident of Canada for tax purposes" in the month before a payment and at the start of the payment month; 19+ (with exceptions); a return must be filed to be paid; formerly the GST/HST credit. | *Who is eligible – Canada Groceries and Essentials Benefit*, https://www.canada.ca/en/revenue-agency/services/child-family-benefits/gst-hst-credit/who-eligible.html | 2026-03-02 | No | Annual (thresholds) | Quarterly | **HIGH.** No fetched page explains how this applies to non-resident or deemed-resident seasonal workers. Say only "CRA decides eligibility when you file". Never "you qualify". |
| T11 | Canada Workers Benefit: requires working income, net income below the provincial level, and being "a resident of Canada throughout the year". | *Who is eligible* (CWB), https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/about-your-tax-return/tax-return/completing-a-tax-return/deductions-credits-expenses/line-45300-canada-workers-benefit-cwb/who-is-eligible.html | 2026-04-08 | No | Annual | Annual | **HIGH.** "Throughout the year" likely excludes many seasonal non-residents, but the page doesn't address them. **Do not list CWB as a common refund for SAWP workers.** |
| T12 | Newcomers page: residents can apply for some benefits before a first return. Temporary residents with work permits can get certain benefits after 19 months of residency if their permits stay valid. | *Newcomers to Canada and the CRA*, https://www.canada.ca/en/revenue-agency/services/tax/international-non-residents/individuals-leaving-entering-canada-non-residents/newcomers-canada-immigrants.html | 2026-08-03 | No. A Spanish CRA newcomer video page appeared in search but returned 404 on fetch (§7). **Unverified.** | Annual | Annual | **MED.** Aimed at people who have become residents. Relevant to `settled` members, not the typical SAWP worker. |

### 3.3 Deadlines

| # | Fact | Source | Page date | Spanish | Stability | Verification plan | Risk |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T13 | **2025 tax year:** file by **April 30, 2026**; pay by **April 30, 2026**; self-employed (or spouse) file by **June 15, 2026** but still pay by April 30. Non-residents: April 30 (June 15 if self-employed). RRSP deadline March 2, 2026. | *Due dates and payment dates – Personal income tax*, https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/important-dates-individuals.html | 2026-01-20 | No | **Annual** (page rewritten each January) | Re-fetch every January and after any CRA announcement; store per tax year | **MED.** The fetched page did not state a weekend/holiday rule. Don't add one from memory. |
| T14 | **2026 tax year (filed 2027): not published** on the fetched page, which lists only the 2025 tax year. | same as T13 | 2026-01-20 | No | Expected Jan 2027 | Poll in January 2027; hold the reminder feature for 2027 until published | **HIGH if pre-filled.** Leave empty until CRA publishes. |
| T15 | The 5013-G guide repeats: "For most people, the return is due April 30, 2026, and payment is due April 30, 2026"; self-employed returns June 15, 2026. | 5013-G guide (T5) | 2026-01-20 | No | Annual | Cross-check against T13 each year; they must agree | Low |
| T16 | Workers must receive T4 slips by **February 28** of the following year (employer deadline: last day of February). | payroll page (T4) | 2026-08-17 | No | Rarely | Annual | Low. Useful as a "your T4 should have arrived" reminder. |

### 3.4 Free help: CVITP clinics

| # | Fact | Source | Page date | Spanish | Stability | Verification plan | Risk |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T17 | Free tax clinics (CVITP) are run by community organizations with volunteers, for people with "a modest income and a simple tax situation". | *Free tax clinics*, https://www.canada.ca/en/revenue-agency/services/tax/individuals/community-volunteer-income-tax-program.html | 2026-02-19 | No (EN/FR) | Stable program | Annual | Low |
| T18 | Suggested income limits: 1 person $40,000; 2 $55,000; 3 $60,000; 4 $65,000; 5 $70,000; +$5,000 per extra person (organizations may adjust). **Not handled:** deceased persons, self-employment/business income (small exceptions under $1,000), rental income, interest over $1,200, capital gains, bankruptcy, T1135 foreign property, most foreign income. Bring photo ID, SIN or temporary SIN, slips, receipts, last notice of assessment. Clinic types: walk-in, drop-off, by appointment (in person or virtual). | *Get your taxes done at a free tax clinic*, https://www.canada.ca/en/revenue-agency/services/tax/individuals/community-volunteer-income-tax-program/need-a-hand-complete-your-tax-return.html | 2026-01-27 | No | Limits may change yearly | Annual, January | **MED.** The page does not say whether clinics take non-resident (5013-R) returns. Do not promise a clinic will file a non-resident return; that question stays open (§6). |
| T19 | Clinic finder: https://apps.cra-arc.gc.ca/ebci/oecv/external/prot/startClinicSearch.action?request_locale=en_CA. It is a session-based POST form (province, city, clinic type, years to prepare, **language, including Spanish**), marked `noindex, nofollow, noarchive`, with no download or export. Its own text: clinics "can be held at any time during the year, however, most clinics are offered in March and April"; "community organizations add clinics regularly". Leamington, Kingsville, Essex and Windsor appear in its Ontario city list. | Clinic finder (fetched with curl) | Not shown | Search filter only | **Changes continuously**, peaking Feb–Apr | Link only. If ever ingested, it needs written CRA permission and a daily run in season | **HIGH if ingested.** A scripted search on 2026-09-15 returned no usable results; the "No clinics available" string is a static template on the page. **INCONCLUSIVE**, and must never be shown as "no clinics near you". |
| T20 | Search on Open Government / canada.ca found **no machine-readable clinic dataset**. CRA publishes only aggregate statistics per province. | *Statistics: Free tax clinics*, https://www.canada.ca/en/revenue-agency/services/tax/individuals/community-volunteer-income-tax-program/free-tax-clinic-statistics.html (seen in search, **not fetched**) | n/a | n/a | n/a | Re-search open.canada.ca yearly | **MED.** Not finding a dataset is not proof none exists. |
| T21 | **South Essex Community Council (SECC)**, Leamington, advertised an "Income Tax Clinic Leamington" on March 4, 2026; 215 Talbot Street East, Leamington; (519) 326-8629. The site lists English, Arabic, French, Italian, Punjabi and **Spanish** as site languages. The event page did not state CVITP status, eligibility or whether it serves non-residents. | *Income Tax Clinic Leamington / March 4, 2026 / SECC*, https://secc.on.ca/events/income-tax-clinic-leamington-3/?mc_id=5484 | Not shown | Site language list includes Spanish; per-clinic language unknown | Annual (event pages) | Check each January for the new season's event; phone to confirm | **MED. NGO, not government.** Label as a community organization. Past event dates must never show as upcoming. |

### 3.5 Scams and paid preparers

| # | Fact | Source | Page date | Spanish | Stability | Verification plan | Risk |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T22 | The CRA will **never**: send refunds or payments by e-transfer or text message; accept or pay in cryptocurrency; demand immediate payment by Interac e-transfer, crypto, prepaid or gift cards; "threaten to deport or arrest you, or put you in prison"; use aggressive language; meet in public to collect payment; charge fees to talk to an agent; ask for personal or financial details by voicemail or email. Report scams to the Canadian Anti-Fraud Centre. | *Recognize a scam – Scams and fraud – CRA*, https://www.canada.ca/en/revenue-agency/corporate/scams-fraud/recognize-scam.html | 2026-08-06 | No | Updated a few times a year | Quarterly diff | Low. These are safe to show near-verbatim. The deportation threat is especially relevant for temporary workers. |
| T23 | **Tax discounters** (preparers who pay you part of your refund now) "must pay you at least 85 cents for each dollar of the first $300 of an estimated refund, plus 95 cents for each remaining dollar". They must give you a signed **Form RC71**, and must "immediately send you" Form RC72 and your notice of assessment once CRA processes the return. | *Discounter information for individuals*, https://www.canada.ca/en/services/taxes/income-tax/personal-income-tax/how-file/tax-preparer/discounters.html | 2026-03-04 | No | Rarely (Tax Rebate Discounting Act) | Annual | **MED.** This cap applies to *discounting* only. The fetched pages do not say a percentage-of-refund fee is illegal for ordinary preparers, so Hoy must not say it is. |
| T24 | *Using a professional tax preparer* contained no warnings about fees or percentage-of-refund charges when fetched. | https://www.canada.ca/en/services/taxes/income-tax/personal-income-tax/how-file/tax-preparer.html | 2026-03-05 | No | n/a | Annual | Low. Recorded so nobody assumes CRA said something here. |

### 3.6 Documents with expiry dates

| # | Document | What the official source says | Source | Page date | Spanish | Stability | Member enters | Verification plan | Risk |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| D1 | **Work permit (IRCC)** | "You should apply **at least** 30 calendar days before the expiry date of your current work permit." Fees from $155. | *Extend or change the conditions on your work permit: About the process*, https://www.canada.ca/en/immigration-refugees-citizenship/services/work-canada/extend.html | 2026-07-17 | No | Rules rare; fees occasionally | Permit expiry date | Quarterly diff | **HIGH.** The SAWP permit mechanics differ (employer/foreign-government process). The 30-day advice is general IRCC guidance, not SAWP-specific. |
| D2 | Maintained status | "if you applied to extend or change your work permit **before** your work permit expired, you have maintained your status and are authorized to work until we finalize your application." | IRCC Help Centre Q189, https://ircc.canada.ca/english/helpcentre/answer.asp?qnum=189&top=17 | 2026-09-01 | No | Rare | Date the extension was submitted (optional) | Quarterly | **HIGH.** It only works if the application was received *before* expiry. |
| D3 | Expired permit: restoration | "We must receive your application to restore your status no more than 90 days after your status expired." "Normally, you aren't allowed to work until your status has been restored." No guarantee of approval; if refused, you must leave. | *Restore your status and get a work permit*, https://www.canada.ca/en/immigration-refugees-citizenship/services/work-canada/restore.html | 2026-08-28 | No | Rare | n/a | Quarterly | **HIGH.** Reminders must fire well before expiry. After expiry, show only the official link and no countdown framed as "time left to fix it". |
| D4 | **SIN (9-series)** | "SINs issued to temporary residents always start with '9'"; "Your SIN expires on the same date your work permit, study permit or visitor record expires." Update the SIN after a new permit. You can keep working on an expired SIN under maintained status "until IRCC makes a decision". Apply online (~5 business days), by mail (~20) or in person. | *Social Insurance Number for temporary residents in Canada*, https://www.canada.ca/en/employment-social-development/services/sin/temporary-residents.html | 2026-06-02 | No | Rare | Nothing new: derive from the permit date, but let the member confirm | Quarterly | **MED.** Ontario's agri-food page (D6) says the SIN "will need to be renewed if you return to work in Canada". A SAWP worker returning next season needs a new SIN expiry. |
| D5 | EI special benefits need a valid SIN | Foreign workers "may also be entitled to receive EI maternity, parental, compassionate care or family caregiver benefits after they leave Canada, as long as their social insurance number has not expired." | *Digest of Benefit Entitlement Principles – Chapter 1*, s. 1.1.7.1, https://www.canada.ca/en/employment-social-development/programs/ei/ei-list/reports/digest/chapter-1/authority.html | 2026-04-01 | No | Rare | n/a | Annual | **HIGH.** Ties the SIN expiry to EI. See E1–E3. |
| D6 | **OHIP: SAWP workers** | "Under the Seasonal Agricultural Worker Program, workers are eligible for coverage under OHIP from the first day of their arrival in Ontario." Form **3715-82**. | *When you arrive in Ontario* (Resources for international agri-food workers), https://www.ontario.ca/document/resources-international-agri-food-workers/when-you-arrive-ontario | 2026-07-07 | **Yes**, whole guide as PDF: https://files.ontario.ca/omafa-resources-for-international-agri-food-workers-0-sp-2026-01-02.pdf (dated 2026-01-02, may lag the HTML) | Rare | Health card expiry date printed on the card | Semi-annual; compare the Spanish PDF date to the HTML | **HIGH.** SAWP only. |
| D7 | **OHIP: other agri-food workers** (incl. Agricultural Stream, e.g. Guatemala/Honduras) | "All other IAWs that have a valid work permit will need to provide proof of employment by an Ontario business in a full-time job for a minimum of 6 consecutive months." Form **0265-82**. The *Apply for OHIP* page: "There is no longer a waiting period"; if a permit has expired but you hold maintained status, "you may be eligible (please contact ServiceOntario...)". | D6 URL; *Apply for OHIP and get a health card*, https://www.ontario.ca/page/apply-ohip-and-get-health-card | D6: 2026-07-07; OHIP page: 2025-07-21 | Spanish PDF as D6 | Rare | Card expiry | Semi-annual | **HIGH.** Do not tell a non-SAWP worker he is covered on arrival. **Neither page, nor *Renew a health card* (updated 2026-09-14), states that the card expiry matches the permit.** Let the member enter the date printed on the card. |
| D8 | ServiceOntario Health INFOline 1-866-532-3161. Farmer Wellness Initiative counselling 1-866-267-6255, 24/7, English/French/**Spanish**. | *Accessing health care* (agri-food), https://www.ontario.ca/document/resources-international-agri-food-workers/accessing-health-care | 2026-01-07 | Spanish PDF | Phone numbers change occasionally | Quarterly | Low |
| D9 | **Passport: Mexico** | SRE: renewal abroad needs a Mexitel appointment (https://mexitel.sre.gob.mx/citas.webportal/), the passport being renewed, biometrics and a fee. Validities abroad are 1, 3, 6 or 10 years, and "Los pasaportes con vigencia de un año no podrán ser renovados." The fetched SRE page gives **no** advance-renewal window. | *Trámite de Pasaporte desde el extranjero*, https://www.gob.mx/sre/acciones-y-programas/tramite-de-pasaporte-8014 | Published 2015-07-22 (no update date) | **Spanish original** | Fees annual; rules rare | Passport expiry | Semi-annual; the page is old, so confirm against the consulate | **MED.** The page is 11 years old. The Leamington consulate's passport pages were **BLOCKED**. |
| D10 | **Passport: Guatemala** | IGM pages **BLOCKED** (403). Ontario's consular directory lists the Consulate General of Guatemala in Toronto (T. address below). | *Consular offices*, https://www.ontario.ca/page/consular-offices | 2026-09-04 | n/a | — | Passport expiry | Retry IGM/MINEX from another network | **HIGH.** No verified renewal rules. Show the date reminder and the consulate contact only. |
| D11 | **Passport: Honduras** | Embassy of Honduras in Ottawa, 130 Albert Street, Suite 504, (613) 233-8900. Appointments via https://citaconsular.sreci.gob.hn/. 5-year passport US$60, 10-year US$75; under-21s only 5 years. Honduran birth certificate required at the appointment; payment by bank draft in USD; prepaid Canada Post return envelope. No renewal window stated. | *Passports* (Embassy of Honduras in Canada), https://embajadahondurasencanada.hn/en/passports/ | Not shown | Site has an EN path; Spanish not checked | Fees occasional | Passport expiry | Semi-annual | **MED.** Fees in USD. Consular authentications happen only in Montreal (embassy home page). |
| D12 | **Passport: Jamaica** | JIS: people overseas "must submit their application to the relevant Jamaican Embassy or Consulate". Processing "approximately four (4) to six (6) weeks". A renewal must include the expired passport. PICA: adult passports valid 10 years, minors 5. **Neither fetched page gives a renewal window.** A search snippet says the Toronto consulate renews "within 12 months" of expiry: **SEARCH-ONLY.** The consulate renewal page (https://jcgtoronto.ca/renewal/) only links forms; phone (416) 598-3008. | *Obtaining a Jamaican Passport – Overseas*, https://jis.gov.jm/information/faqs/obtaining-a-jamaican-passport-overseas/ ; *General Passport Information*, https://www.pica.gov.jm/passport/general-information | Not shown | n/a (English) | Rare | Passport expiry | Semi-annual; read the consulate's renewal PDF before stating any window | **MED.** JIS (4–6 weeks) and the search snippet for the consulate (6–8 weeks) differ. Quote neither as a promise. |
| D13 | **SAWP contract end / return** | SAWP: max **8 months**, between **January 1 and December 15**; minimum 240 hours in 6 weeks or less. Employer arranges and pays round-trip transport (payroll recovery allowed except BC). A signed contract must be on file before work starts. | *Hire a temporary worker through the SAWP – Overview*, https://www.canada.ca/en/employment-social-development/services/foreign-workers/agricultural/seasonal-agricultural.html ; *Program requirements*, https://www.canada.ca/en/employment-social-development/services/foreign-workers/agricultural/seasonal-agricultural/requirements.html | 2026-06-03; 2026-03-30 | No | Rare | Contract end date **and** booked departure date (they can differ) | Annual | **MED.** Written for employers. Dec 15 is a program ceiling, not the member's date. Hoy already asks for a departure date at first run; reuse it and never compute one. |

### 3.7 Employment Insurance

| # | Fact | Source | Page date | Spanish | Stability | Verification plan | Risk |
| --- | --- | --- | --- | --- | --- | --- | --- |
| E1 | Foreign workers "can receive regular benefits, provided they meet eligibility and entitlement conditions, while in Canada"; special benefits after leaving Canada as in D5. Foreign workers are exempt from EI premiums only "when they remain covered under an EI program in their country". | EI Digest ch. 1 (D5) | 2026-04-01 | No | Rare | Annual | **HIGH.** It says "may". Eligibility is decided per claim. |
| E2 | For people outside Canada: maternity, parental, sickness, compassionate care and family caregiver benefits need **600 insured hours** in the last 52 weeks (or since the last claim), and a valid SIN if permanently residing outside Canada/US. | *EI – Workers and residents outside of Canada – Eligibility*, https://www.canada.ca/en/services/benefits/ei/ei-outside-canada/eligibility.html | **2023-02-27** | No | Rare, but the page is 3.5 years old | Annual; watch for EI reforms | **HIGH.** The page does not mention SAWP. The 600-hour figure is general. |
| E3 | TFWs who lose their job through no fault of their own, or leave it because of abuse, "may qualify" for EI. | *Temporary foreign workers: Your rights are protected*, https://www.canada.ca/en/employment-social-development/services/foreign-workers/protected-rights.html | 2025-07-25 | **Yes**: https://www.canada.ca/en/employment-social-development/services/foreign-workers/protected-rights-es.html (2025-07-25) | Rare | Semi-annual; check both languages | **MED.** |
| E4 | **No fetched canada.ca page describes an EI special-benefit rule specific to seasonal agricultural workers.** | — | — | — | — | Re-search yearly | **HIGH if assumed.** Hoy must not say "SAWP workers get parental benefits". It can only link E1/E2. |

---

## 3. Feature 4 findings: know your rights

### 4.1 Employment Standards Act (Ontario) for farm and greenhouse workers

**The exemptions are the whole story here.** The table combines the ontario.ca guide
with the regulation text itself (O. Reg. 285/01, downloaded from e-Laws as
`https://www.ontario.ca/laws/docs/010285_e.doc`, consolidation "From July 1, 2025",
last amendment 477/24).

**Who is who (regulation s. 2(2), s. 24):**
- **Farm employee:** "a person employed on a farm whose employment is directly related
  to the primary production of eggs, milk, grain, seeds, fruit, vegetables, maple
  products, honey, tobacco, herbs, pigs, cattle, sheep, goats, poultry, deer, elk,
  ratites, bison, rabbits, game birds, wild boar and cultured fish". **Mushrooms and
  flowers are not on this list;** they have separate, smaller exemptions (s. 4(3), 8, 9).
- **Harvester:** "an employee who is employed on a farm to harvest fruit, vegetables or
  tobacco for marketing or storage" (s. 24).

| ESA entitlement | Farm employee (primary production) | Fruit/veg/tobacco **harvester** | Mushroom growing / flower growing | Seasonal fresh fruit & veg **processor** (≤16 weeks/yr) |
| --- | --- | --- | --- | --- |
| Minimum wage | **No** | **Yes**, but a customary piece rate that lets a worker "exercising reasonable effort" earn minimum wage counts as compliance, and room/board counts at set values (s. 25) | Yes (not exempted) | Yes |
| Hours-of-work limits, rest, eating periods | **No** | **No** | **No** (s. 4(3)) | Not exempted on the fetched page |
| Three-hour rule | **No** | **Yes** (s. 25.1) | Not in the fetched text | — |
| Overtime | **No** | **No** | **No** (s. 8) | **Yes, after 50 hours/week** (not 44) |
| Public holidays | **No** | **Yes, after 13 weeks** (s. 27; guide says "13 consecutive weeks") | **No** (s. 9) | — |
| Vacation with pay | **No** | **Yes, after 13 weeks**, earned from day one (s. 26; guide says weeks need not be consecutive) | Mushrooms: not exempted; flowers: guide lists no vacation exemption | — |
| Wage payment, statements, deductions, leaves, termination, equal pay | **Yes** | **Yes** | Yes | Yes |

Sources for the table (all fetched 2026-09-15):

| # | Source | Page date | Spanish | Stability | Verification plan |
| --- | --- | --- | --- | --- | --- |
| R1 | *Agriculture, growing, breeding, keeping and fishing* (Industries and jobs with exemptions or special rules), https://www.ontario.ca/document/industries-and-jobs-exemptions-or-special-rules/agriculture-growing-breeding-keeping-and-fishing | 2024-10-22 | No HTML; see R8 | Rare (regulation change) | Quarterly diff; compare against e-Laws last-amendment number |
| R2 | *Agricultural employees* (Your guide to the ESA), https://www.ontario.ca/document/your-guide-employment-standards-act-0/agricultural-employees | 2024-07-08 | No | Rare | Quarterly |
| R3 | O. Reg. 285/01, https://www.ontario.ca/laws/regulation/010285 (doc export above) | Consolidated from 2025-07-01; last amendment O. Reg. 477/24 | No | Rare | Monthly check of the "Last amendment" line; any change triggers a full re-read |

Risk flags for 4.1:
- **CRITICAL: greenhouses.** "Greenhouse" appears in neither R1, R2 nor the
  regulation. Whether a Leamington greenhouse tomato/pepper/cucumber worker is a
  "farm employee", a "harvester" or neither (e.g. packing) is **not answered by any
  fetched source.** The regulation's "employed on a farm" and "directly related to the
  primary production" wording decides it, and that is a legal characterisation. **Hoy
  must show the categories and send people to the Employment Standards Information
  Centre. It must never tell a greenhouse worker which column is his.**
- **CRITICAL: harvesters vs other farm workers.** The same man can move between
  columns in a season (planting → harvesting → packing). Minimum wage applies to
  harvesting but not to other primary-production work. Never summarise it as "farm
  workers get minimum wage" or "farm workers don't get minimum wage". Both are wrong
  for some of the season.
- **Guide vs regulation wording:** "13 consecutive weeks" (guide, public holidays) vs
  "13 weeks or more" (regulation s. 27). Quote the guide and link the regulation; do not
  paraphrase either.

### 4.2 Minimum wage, pay, deductions, housing

| # | Fact | Source | Page date | Spanish | Stability | Verification plan | Risk |
| --- | --- | --- | --- | --- | --- | --- | --- |
| R4 | General minimum wage **$17.60/h** (Oct 1, 2025 – Sept 30, 2026). **$17.95/h from Oct 1, 2026** (to Sept 30, 2027). Student $16.60; homeworkers $19.35. Indexed to Ontario CPI; "the new rate will be published on or before April 1 and will come into effect on October 1." | *Minimum wage* (ESA guide), https://www.ontario.ca/document/your-guide-employment-standards-act-0/minimum-wage | 2026-04-01 | No HTML | **Annual, every October 1** | Fetch each April 1–15 (new rate) and Oct 1 (switch-over). Store the rate with effective_from/effective_to, never a single "current" value | **HIGH.** Farm employees in primary production are not entitled to it (4.1). Always render it with the exception. The Mexico consulate PTAT page still says $16.71 (2024), which shows what happens when this is copied by hand. |
| R5 | Room and board deemed as wages for harvesters (O. Reg. 285/01 s. 25(5)): serviced housing $99.35/wk; housing $73.30/wk; room $31.70/wk private, $15.85/wk shared; board $2.55/meal, max $53.55/wk; room and board $85.25/wk private, $69.40/wk shared. Housing counts only if fit for habitation, with a kitchen, 2 rooms and private toilet/washing (s. 25(6)); room/board counts only if actually received (s. 25(9)). | R3 text; figures also on R4 | see R3/R4 | No | Rare (unchanged since 2017 amendment) | With R3 | **HIGH.** These are *minimum-wage accounting values*, not permission to charge rent. For SAWP, federal rules make housing free (R12). |
| R6 | Wage statement must show the pay period, wage rate (if any), gross wages, deductions and net pay, and room/board amounts if applicable; electronic statements are OK if the employee can print them. Deductions are allowed only if required by statute (tax, EI, CPP), a court order, or **written authorization**. No deductions for faulty work or cash shortages unless the employee had sole access and control and gave written consent. Since June 21, 2024 the employee chooses the deposit account. | *Payment of wages* (ESA guide), https://www.ontario.ca/document/your-guide-employment-standards-act-0/payment-wages | 2024-07-08 | No | Rare | Semi-annual | **MED.** These apply to farm workers (wage payment is not exempt: R2). |
| R7 | Vacation: 2 weeks and ≥4% under 5 years; 3 weeks and ≥6% after 5 years. Overtime (general): after 44 h/week at 1½ times the regular rate. Public holidays: New Year's, Family Day, Good Friday, Victoria Day, Canada Day, Labour Day, Thanksgiving, Christmas, Boxing Day. | *Vacation*, https://www.ontario.ca/document/your-guide-employment-standards-act-0/vacation (2026-02-05); *Overtime pay*, https://www.ontario.ca/document/your-guide-employment-standards-act-0/overtime-pay (2026-02-05); *Public holidays*, https://www.ontario.ca/document/your-guide-employment-standards-act-0/public-holidays (2024-07-08) | as listed | No | Rare | Semi-annual | **CRITICAL.** These are the *general* rules. **Never show them without the 4.1 exemptions beside them.** On their own they mislead most Hoy members. |
| R8 | Spanish ESA poster: *Employment Standards in Ontario* exists as a Spanish PDF, https://files.ontario.ca/employment-standards-in-ontario-spanish.pdf (HTTP 200, `Last-Modified: 14 Jan 2019`). | curl HEAD | Server date 2019-01-14 | **Yes** | Stale | Compare to the English poster version yearly | **HIGH.** It is a 2019 file and likely predates later ESA changes. Link only with a visible "published 2019" note, or not at all. |
| R9 | Employment Protection for Foreign Nationals Act (EPFNA): recruiters and employers may not charge fees or recover costs, "including any related to hiring you" ("one exception related to some seasonal agriculture workers"); may not take your passport or work permit; may not penalize you for asserting rights. ESA claims: within 2 years; EPFNA claims: within 3½ years. | *Employment rights and obligations for foreign nationals*, https://www.ontario.ca/page/employment-rights-and-obligations-foreign-nationals | **2021-12-07** | Not on page | Rare | Annual | **MED.** The SAWP cost-recovery exception is not spelled out on this page. Don't paraphrase it. |
| R10 | Contacts: **Employment Standards Information Centre 1-800-531-5551** (23 languages); **OHS Contact Centre 1-877-202-0008** (24/7, 23 languages); **WSIB 1-800-387-0750**; Canadian Human Trafficking Hotline listed on the page, but the fetch tool rendered the number as "1-833-1010", which is too short to be a valid number. **Digits unverified; copy from the live page by hand before use.** | *Your rights and workplace safety* (agri-food), https://www.ontario.ca/document/resources-international-agri-food-workers/your-rights-and-workplace-safety | 2026-01-07 | Spanish PDF (D6) | Phone numbers: occasional | Quarterly; call-test numbers twice a year | **HIGH for the trafficking hotline digits.** Must be verified by hand before display. |
| R11 | Federal SAWP wages: pay the same wages and benefits as Canadians in the same occupation, and at least the wage tables or the provincial minimum, "whichever is higher". | *SAWP: Wages, working conditions and occupations*, https://www.canada.ca/en/employment-social-development/services/foreign-workers/agricultural/seasonal-agricultural/working-conditions.html | 2026-05-14 | No | Wage tables annual | Annual | **MED.** A federal program condition on employers, separate from ESA entitlements. Don't merge the two. |
| R12 | Housing: **SAWP** employers provide housing at no cost (except BC), inspected within 8 months before the application. **Agricultural Stream** employers must provide "adequate, suitable and affordable housing" and may deduct "a maximum of $30 per week" for on-farm housing unless the province sets lower. Agricultural Stream employers must pay round-trip transport and may not recover it; they must pay for private emergency health insurance until provincial coverage starts; no recruitment fees. | SAWP *Program requirements* (D13, 2026-03-30); *Hire a TFW through the Agricultural Stream – Program requirements*, https://www.canada.ca/en/employment-social-development/services/foreign-workers/agricultural/agricultural/requirements.html (2025-11-20); *Your rights are protected* (E3) | as listed | Rights page in Spanish (E3) | Rare | Semi-annual | **CRITICAL: depends on program.** Free housing is a SAWP fact; a $30/week deduction can be lawful in the Agricultural Stream. |

### 4.3 Occupational health and safety, heat

| # | Fact | Source | Page date | Spanish | Stability | Verification plan | Risk |
| --- | --- | --- | --- | --- | --- | --- | --- |
| S1 | O. Reg. 414/05 applies the OHSA to farming operations "subject to certain limitations and conditions", where there are paid workers, including SAWP and temporary workers. | *Guide to the Occupational Health and Safety Act for farming operations*, https://www.ontario.ca/page/guide-occupational-health-safety-act-for-farming-operations | **2026-08-26** | No | Rare (just updated) | Quarterly | **MED.** "Limitations and conditions": some OHSA regulations don't apply to farms. Don't claim more than the guide. |
| S2 | **Right to refuse unsafe work:** tell the supervisor right away and why; the employer investigates with the worker and a representative present; the worker stays paid during the investigation; if the refusal continues, an MLITSD inspector is called and decides in writing. | S1 | 2026-08-26 | No | Rare | Quarterly | **HIGH.** It's a procedure, not a walk-off. Describe the steps faithfully. |
| S3 | Reprisals are prohibited: an employer cannot dismiss or threaten dismissal, discipline, suspend or penalise a worker for following the Act or using OHSA rights. | S1 | 2026-08-26 | No | Rare | Quarterly | **MED.** For TFWs the real fear is repatriation. Pair this with the ESDC tip line (F1). |
| S4 | A Joint Health and Safety Committee is required where 20+ workers are regularly employed **and** the farm is in **mushroom, greenhouse, dairy, hog, cattle or poultry** farming; certified members at 50+ workers. MLITSD toll-free **1-877-202-0008**. | S1 | 2026-08-26 | No | Rare | Quarterly | Low. Notably, **greenhouses are named here** (OHSA), unlike the ESA pages. |
| S5 | Heat stress: "you must take every reasonable precaution in the circumstances for the protection of a worker" (OHSA general duty). Covers heat rash, cramps, fainting, heat exhaustion, heat stroke, and engineering/administrative controls and acclimatization. **No numeric heat limit and no farm-specific heat rule.** | *Managing heat stress at work*, https://www.ontario.ca/page/managing-heat-stress-work | 2025-11-06 | No | Rare | Before each summer (May) | **HIGH.** Don't imply a temperature at which work must stop. None is stated. |

### 4.4 Federal: TFWP compliance, tip line, open work permit, SAWP

| # | Fact | Source | Page date | Spanish | Stability | Verification plan | Risk |
| --- | --- | --- | --- | --- | --- | --- | --- |
| F1 | **Service Canada tip line 1-866-602-9448.** Messages 24/7; live agents in 200+ languages Mon–Fri 6:30 a.m.–8 p.m. ET. "We'll never tell your employer or anyone at your workplace who made the report." You don't have to give your name, phone or LMIA/permit number. Online form: https://www.canada.ca/en/employment-social-development/services/foreign-workers/report-abuse/tool.html. "If you're in danger, call 9-1-1 now." "For privacy reasons, we cannot tell you what happens after you make your report." | *How to report abuse of temporary foreign workers*, https://www.canada.ca/en/employment-social-development/services/foreign-workers/report-abuse.html | EN 2024-09-19 | **Yes**: *Cómo denunciar los abusos de los trabajadores extranjeros temporales*, https://www.canada.ca/en/employment-social-development/services/foreign-workers/report-abuse-es.html (2026-04-30) | Rare | Quarterly; both languages | **MED.** The ES page is newer than the EN page. If they disagree, show the newer page and flag it. |
| F2 | Rights listed: same protections as citizens; right to refuse dangerous work; health care without employer permission; privacy with health providers; workers' comp; freedom from abuse and reprisal. Employers **must** give a signed contract before day one, pay as agreed including overtime, and pay private health insurance until provincial coverage. They **must not** confiscate passports/permits, force unsafe or unauthorized work, "deport" workers or change immigration status, or make workers "reimburse recruitment-related fees". | *Temporary foreign workers: Your rights are protected* (E3) | 2025-07-25 | **Yes**: *Trabajadores extranjeros temporales: sus derechos están protegidos* (E3, 2025-07-25); also listed in Chinese, Hindi, Korean, Punjabi, Tagalog, Thai | Rare | Semi-annual | **HIGH.** "Pay overtime" is federal wording and conflicts on its face with the ESA farm exemptions (4.1). It means "overtime as agreed or required by law". Show both with sources; never resolve it for the member. |
| F3 | IRCC: TFWs "are protected by Canada's labour laws"; employers must not confiscate documents. Federal Labour Program 1-800-641-4049 (federally regulated work only; provincial offices handle most farm work). | *Temporary foreign worker rights and labour standards*, https://www.canada.ca/en/immigration-refugees-citizenship/services/work-canada/worker-rights.html | 2026-03-31 | No | Rare | Semi-annual | **MED.** Don't route Ontario farm workers to the federal labour line. Ontario ESA (R10) is the right office. |
| F4 | **Open work permit for vulnerable workers**, "Who can apply": you are **in Canada**; you hold a "valid (not expired) employer-specific work permit with your employer's name on it, **or** applied to extend your work permit before it expired and you're still waiting on a decision"; and you "are being abused or at risk of being abused in relation to your job in Canada". Abuse "can be physical, sexual, financial, psychological or reprisal". The permit lets you work for most employers. | *Open work permit for vulnerable workers: Who can apply*, https://www.canada.ca/en/immigration-refugees-citizenship/services/work-canada/special-instructions/vulnerable-workers/eligibility.html ; overview https://www.canada.ca/en/immigration-refugees-citizenship/services/work-canada/special-instructions/vulnerable-workers.html | 2025-12-19; 2026-03-05 | Linked from the Spanish rights page (E3) | Rare | Quarterly | **HIGH.** It needs an employer-specific permit. Fees, duration and family eligibility were **not** on the fetched pages. Do not state them. |
| F5 | SAWP (IRCC): "you can work for any SAWP employer in Canada. You can also work for more than one employer without needing to apply for another work permit." | *Seasonal Agricultural Worker Program* (IRCC), https://www.canada.ca/en/immigration-refugees-citizenship/services/work-canada/special-instructions/agricultural/seasonal-agricultural.html | 2026-03-05 | No | Rare | Semi-annual | **HIGH.** The ESDC requirements page says employers "cannot informally transfer or share" workers (fines up to $50,000). Moving between SAWP employers goes through the program. Show both; don't simplify. |
| F6 | Participating foreign governments "appoint representatives to assist workers in Canada". | SAWP overview (D13) | 2026-06-03 | No | Rare | Annual | Low. This is the official basis for the consular/liaison section. |

### 4.5 Health and injury: WSIB, OHIP

| # | Fact | Source | Page date | Spanish | Stability | Verification plan | Risk |
| --- | --- | --- | --- | --- | --- | --- | --- |
| H1 | WSIB policy **12-04-08** covers workers under the "Commonwealth Caribbean/Mexican Seasonal Agricultural Workers Program". Coverage starts "as soon as a worker reaches the agreed-upon point of departure in their home country and remains in place until they return to their home country". Effective for decisions and accidents on or after **May 1, 2025**. | *Foreign Agricultural Workers* (Operational Policy Manual), https://www.wsib.ca/en/operational-policy-manual/foreign-agricultural-workers | Effective 2025-05-01 | Spanish policy version exists (linked from H3) | Rare | Semi-annual | **CRITICAL: SAWP only.** The fetched pages do not describe coverage for Agricultural Stream workers (Guatemala/Honduras). Do not show "covered from your home airport" to them. |
| H2 | SAWP guide: coverage includes travel from the Ontario airport to the employer, work-related travel, meal breaks and sleep in employer housing. Employer first aid; report to the employer; Form 6 if treatment beyond first aid or lost time/pay; the **employer must tell WSIB within three business days**. WSIB can arrange a health assessment and a treatment plan to take home. 1-800-387-0750, translation available. | *Commonwealth Caribbean and Mexican seasonal agricultural workers – Workplace injuries: A guide*, https://www.wsib.ca/en/commonwealth-caribbean-mexican-seasonal-agricultural-workers-workplace-injuries-workers-guide | 2024-12-10 | Not checked | Rare | Semi-annual | **HIGH.** The worker's own claim time limit was not on the fetched page. Don't state one. |
| H3 | Foreign Agricultural Workers Program: file a claim online or call 1-800-387-0750 ("translators available to help"); after returning home workers "may continue to be entitled to further medical treatment and assessments"; travel costs to appointments. **Spanish** claim form (Form 6) and Spanish policy available. | *Foreign Agricultural Workers Program*, https://www.wsib.ca/en/foreign-agricultural-workers-program | 2026-06-22 | **Spanish Form 6 and policy (PDF links on page)** | Rare | Semi-annual | **MED.** "May". |
| H4 | TFWP employers must provide provincial workplace safety insurance from day one at no cost to the worker (SAWP), and must ensure TFWs are covered (Agricultural Stream). | D13 SAWP requirements; R12 Agricultural Stream requirements | 2026-03-30; 2025-11-20 | No | Rare | Semi-annual | **MED.** The federal *program* requirement is the only fetched basis for non-SAWP WSIB coverage. |
| H5 | OHIP: see D6–D8. SAWP workers are covered from day one; others need 6 months of full-time employment; ServiceOntario INFOline 1-866-532-3161. | D6/D7 | — | Spanish PDF | Rare | Semi-annual | **CRITICAL: program-dependent** (as D7). |

### 4.6 Free legal help (government-funded vs NGO)

| # | Organisation | Type / funding (as fetched) | Contact (as fetched) | Source | Page date | Spanish | Stability | Verification plan | Risk |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| L1 | **Legal Aid Ontario** | Provincial agency (government-funded). 1-800-668-8258 per ontario.ca; "72 independent legal clinics". | — | *Finding support* (agri-food), https://www.ontario.ca/document/resources-international-agri-food-workers/finding-support | 2026-01-12 | Spanish PDF (D6) | Rare | Quarterly | Low |
| L2 | **Legal Assistance of Windsor (LAW)** | Community legal clinic **funded by Legal Aid Ontario** | 2-443 Ouellette Ave., Windsor N9A 4J2; (519) 256-7831; Mon–Fri 9–4. Areas: social benefits, housing, immigration and refugee law, gender-based violence, workplace sexual harassment, Indigenous justice, anti-trafficking. English/French; "Interpretation services available in other languages." | LAO listing https://www.legalaid.on.ca/legal-clinics/legal-assistance-of-windsor/ ; clinic site https://www.legalassistanceofwindsor.com/ | Not shown | Interpretation only | Hours/areas occasional | Semi-annual | **MED.** The LAO listing does not say whether Leamington is in its catchment, and it lists **no employment-standards area**. Don't send wage claims here as a matter of course. |
| L3 | **Windsor-Essex Bilingual Legal Clinic (WEBLC)** | Community legal clinic **funded by Legal Aid Ontario** | 1770 Langlois Ave., Windsor N8X 4M5; (519) 253-3526; toll-free (855) 650-9716; Mon–Fri 8:30–4:30 (LAO listing; the clinic site says 9–3:30 with limited walk-in, a discrepancy). Areas include immigration, **employment rights**, housing, OW/ODSP. Runs the "C.A.R.E. for International Workers Program" (clinic site). | LAO listing https://www.legalaid.on.ca/legal-clinics/windsor-essex-bilingual-legal-clinic/ ; https://www.blc-cjb.com/ | Not shown | English/French; interpretation | Occasional | Semi-annual; resolve the hours discrepancy by phone | **MED.** The hours differ between the two official-ish pages. Show the LAO listing and the "Verificado" date. |
| L4 | **Migrant Farmworker Clinic** (Windsor Law + Justicia for Migrant Workers) | University clinic plus **NGO** partner. Funding **not stated** on the fetched page. | Leamington, Sundays in the fall term ~2–7 p.m.; staff lawyer email on the page. Site: migrantfarmworkerclinic.ca (not fetched). | *Migrant Farmworkers Clinic and Seminar*, https://www.uwindsor.ca/law/migrant-farmworkers | Not shown | Not stated | **Seasonal/academic term** | Each September and January | **HIGH.** Term-bound hours go stale quickly. Label as university/NGO, not government. |
| L5 | **Workforce WindsorEssex, TeaMWork** | **Federally funded** NGO project (Migrant Worker Support Program; "over $3.6 million" announced 2022-12-19) | https://workforcewindsoressex.com/teamwork/ (not fetched) | ESDC news release, https://www.canada.ca/en/employment-social-development/news/2022/12/government-of-canada-protects-and-empowers-temporary-foreign-workers-in-southwestern-ontario-through-the-migrant-worker-support-program.html ; also listed on L1 page | 2022-12-19 | Not stated | **Funding term not stated.** May have ended. | Confirm the project is still running before listing | **HIGH.** A 2022 announcement is not evidence of a 2026 service. |
| L6 | **Migrant Worker Community Program** (mwcp.ca) | Community organisation (ontario.ca lists it under Windsor-Essex; funding not stated) | interpretation, translation, community connections | L1 page | 2026-01-12 | Not stated | Unknown | Fetch site before listing | **MED.** NGO. |

### 4.7 Consular help

| # | Country | What was fetched | Source | Page date | Language | Stability | Verification plan | Risk |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C1 | **Mexico: Consulado de Carrera de México en Leamington** | PTAT page: the consulate exists "to protect you, help you and guide you regarding your rights and obligations in Canada". General line 800-841-2020 / WhatsApp 55-7335-6824, Mon–Fri 8:00–18:00. Covers minimum wage, COWAN medical insurance, WSIB, OHIP, SIN, CPP, deductions. **It states the Ontario minimum wage as $16.71/h (2024), which is out of date.** | *Programa de Trabajadores Agrícolas Temporales*, https://consulmex.sre.gob.mx/leamington/index.php/asistencia-y-proteccion-consular/programa-de-trabajadores-agricolas-temporales | 2025-12-22 | Spanish | Phones rare; content stale | Manual, quarterly, from a normal browser | **HIGH.** Other pages (protección, contacto, FAQ, home) are **BLOCKED** by a Radware bot wall. The 24-hour protection line **(519) 324-1481** and address **350 Highway 77, Leamington N8H 3V5** appear **only in search snippets: SEARCH-ONLY.** Never use this page for Ontario rules. |
| C2 | **Mexico: Consulate General, Toronto** | 350-11 King Street West, Toronto M5H 4C7; 416-368-2875; comunicacionestor@sre.gob.mx | *Consular offices*, https://www.ontario.ca/page/consular-offices | 2026-09-04 | English | Occasional | Quarterly | Low. The Ontario list does **not** include the Leamington consulate. |
| C3 | **Guatemala: Consulate General, Toronto** | 110 Sheppard Avenue East, Suite 200, Toronto M2N 6Y8; constoronto@minex.gob.gt; **no phone in the Ontario listing**. A search snippet gives 437-561-1011 and jurisdiction "Ontario except Ottawa, Manitoba, Nunavut": **SEARCH-ONLY**. MINEX pages and PDF **BLOCKED** (403). No fetched Guatemalan government page on worker protection; guatemala.gob.gt article **BLOCKED**. | C2 URL | 2026-09-04 | — | Occasional | Retry MINEX from another network; ask the consulate | **HIGH.** Protection services for workers unverified. Show contact only. |
| C4 | **Honduras: Embassy, Ottawa; Consulate General, Montreal** | Embassy 130 Albert St., Suite 504, Ottawa K1P 5G4, (613) 233-8900; Consulate General Montreal (514) 439-7151; authentications and powers of attorney "exclusively at the Consulate General in Montreal"; appointments https://citaconsular.sreci.gob.hn/. **No worker-protection content** on the site. Honduras is **not** in the Ontario consular list. | *Embajada de Honduras en Canadá*, https://embajadahondurasencanada.hn/en/home/ | Not shown | English path | Occasional | Semi-annual | **HIGH.** No official Honduran worker-protection source found. A tnh.gob.hn article returned 404. |
| C5 | **Jamaica: Consulate General, Toronto** | 303 Eglinton Avenue East, Toronto M4P 1L3; 416-598-3008; info@jcgtoronto.ca | C2 URL | 2026-09-04 | English | Occasional | Quarterly | Low |
| C6 | **Jamaica: Jamaican Liaison Service (JLS)** | MLSS (Jamaican Ministry of Labour and Social Security): the JLS is "a programme of the Ministry of Labour and Social Security" to "safeguard their welfare"; acting Chief Liaison Officer Althea Riley. **No office addresses or phones on the fetched ministry page.** The Jamaican High Commission Ottawa SAWP page (plain HTTP only; HTTPS certificate does not match) gives only the MLSS Labour Division in Kingston: 1F North Street, (876) 922-9500-14. JLS Toronto (230 Sheppard Ave W, 416-733-4358), Leamington (33 Princess St, Suite 304, 519-326-6401) and toll-free 1-888-898-3951 appear **only** on jamliser.com, Yellow Pages and Yelp: **not verified as official.** | *Jamaica Liaison Service Fetes Farmworkers In Canada*, https://www.mlss.gov.jm/news/jamaica-liaison-service-fetes-farmworkers-in-canada/ ; http://www.jhcottawa.ca/seasonal-agriculture-workers.html | 2024-08-14; JHC not shown | English | Occasional | Get the JLS contacts in writing from MLSS or the Consulate General | **HIGH.** For Jamaicans the liaison officer is the main contact, and it is the one Hoy could not verify. |

---

## 4. Machine-readable data vs static records

| Data | Machine-readable? | Finding | Proposed handling | `verified_at` cadence |
| --- | --- | --- | --- | --- |
| CVITP free tax clinics | **No** | Session-bound POST form, `noindex, nofollow`, no export, no open dataset found. Scripted queries on 2026-09-15 were **INCONCLUSIVE** (static "No clinics available" template; no totals for Toronto/Ottawa). | **Link only** to the CRA finder. Optionally one hand-verified local record (e.g. SECC) per season, labelled as a community organization, with season dates. | Hand-check weekly Feb–Apr; monthly otherwise; hide past-dated events automatically |
| Ontario minimum wage | **No API found** (HTML page; the regulation is a .doc export) | Predictable: published by April 1, effective Oct 1. | Static record with `effective_from` / `effective_to`; ingest job diffs the ontario.ca page and **alerts the owner** instead of auto-publishing | Check Apr 1–15 and Sept 25–Oct 2 each year; otherwise monthly |
| ESA farm exemptions (O. Reg. 285/01) | Semi: e-Laws `.doc` export downloads by script, with a "Last amendment" line | Change detection is scriptable; interpretation is not. | Monitor `Last amendment:` in `https://www.ontario.ca/laws/docs/010285_e.doc`; any change → owner review; content stays hand-written | Automated monthly diff; human re-read on change and yearly |
| CRA deadlines | No | Page rewritten each January. | Static per-tax-year record; **do not create the 2026-tax-year record until CRA publishes** | January each year, then quarterly |
| CRA benefit names and eligibility (CGEB, CWB) | No | CGEB rename July 2026 shows these change. | Static, link-heavy, no eligibility claims | Quarterly (monthly until 2027 for CGEB) |
| Tip lines and phone numbers (ESDC, MLITSD, WSIB, ServiceOntario) | No | Stable, high-stakes. | Static; page diff plus a twice-yearly human call test | Quarterly page check; call test every 6 months |
| IRCC / SIN / OHIP document rules | No | Stable. | Static | Quarterly |
| Member document dates (permit, SIN, card, passport, contract end, departure) | n/a | **Entered by the member**; never derived from program rules | Stored per member; reminders computed from the member's own date only | n/a (member data); prompt a re-check when a date passes |
| Consular contacts | No; two of four sites block scripts | ontario.ca's consular list is fetchable and official (Ontario), but excludes Leamington (Mexico) and Honduras. | Static, hand-verified; ontario.ca list as a cross-check | Quarterly |
| Legal clinics | No (LAO listing pages are fetchable HTML) | LAO listings are the official record for funded clinics. | Static from LAO listings | Semi-annual; term-bound clinics each Sept and Jan |

Proposed `verified_at` rule for this feature: **a record older than its cadence
stops rendering its fact** and shows only the official link and "Consulta la página
oficial". It does not keep showing a stale fact with an old date. This follows
CLAUDE.md's "a stale lottery number is worse than no number".

---

## 5. Content rules proposed for the UI

1. **Only sourced facts.** Every rights or tax statement is a record with `source_url`,
   `source_title`, `source_date_modified`, `fetched_at`, `verified_at`, `language`, and
   the `spanish_url` if one exists. No record, no sentence.
2. **"Verificado: 15 de septiembre"** on every card, per CLAUDE.md, plus a link to the
   official page ("Ver en canada.ca" / "Ver en ontario.ca").
3. **Name the author.** "Según la Agencia de Ingresos de Canadá (CRA)…", "Según el
   Gobierno de Ontario…". NGO and consular items carry a visible "organización
   comunitaria" or "consulado" label, never presented as government.
4. **No advice, no eligibility verdicts.** Never "you qualify", "you will get a refund",
   "your employer owes you overtime". Say what the source says and who decides:
   "CRA decide cuando presentas tu declaración."
5. **Exceptions travel with the rule.** The general minimum wage, overtime, public
   holiday and vacation rules are never rendered without the farm-employee and harvester
   exceptions *on the same card*. A card that would show a general ESA rule alone must
   not render.
6. **Program-gated facts.** Facts that differ by program (OHIP day-one coverage, free
   housing, airfare recovery, WSIB policy 12-04-08) render only when the member's
   program is known. If it isn't known, show both versions labelled "SAWP" and
   "Programa Agrícola (TFWP)", or show neither. **Nationality must not stand in for
   program.**
7. **No greenhouse classification.** Hoy never tells a member which ESA category he is
   in. It lists the categories verbatim and gives the Employment Standards Information
   Centre (1-800-531-5551).
8. **Quote rather than paraphrase** for rights and warnings. The same rule CLAUDE.md
   applies to weather alerts applies here: translations of English-only pages must be
   marked as Hoy's translation ("Traducción de Hoy; el texto oficial está en inglés"),
   and where an official Spanish page exists (ESDC tip line, rights page, ontario.ca
   agri-food PDF, WSIB Spanish Form 6), link to it instead of translating.
9. **No "none found" states.** Never "no hay clínicas cerca", "no tienes que presentar
   declaración" or "no hay fechas". Absence of a record means "no verificado", not no
   service (SILENCE IS NEVER EVIDENCE).
10. **Dated amounts carry their period.** "$17.95 por hora desde el 1 de octubre de
    2026", never "el salario mínimo es $17.95".
11. **Reminders use only member-entered dates.** Hoy never computes a permit, SIN,
    card or passport expiry from program rules. It may suggest "IRCC recomienda
    solicitar al menos 30 días antes", with the source.
12. **Scam content is the safest content.** CRA's "the CRA will never…" list can be
    shown near-verbatim and pushed in February–April, though it belongs in the
    ENGAGEMENT queue, not the ALERT queue.
13. **Emergencies first.** Any abuse or danger card leads with "Si estás en peligro,
    llama al 9-1-1" as ESDC does, then the tip line.

---

## 6. Open questions for the owner

1. **Do we collect the member's program** (SAWP / TFWP Agricultural Stream / other /
   settled)? Several rights facts cannot be shown correctly without it, and nationality
   is not a proxy. The affiliate form is currently 4 fields.
2. **Greenhouse classification:** accept "categories + phone line only" for greenhouse
   workers, or pay for a legal review (e.g. a Legal Aid clinic or a lawyer) of how
   O. Reg. 285/01 applies to Leamington greenhouse vegetable and packing work?
3. **CVITP:** link-only acceptable? Ingesting the clinic finder would be scraping a
   `noindex` government form, and it only has meaningful data Feb–Apr. Alternatively,
   contact CRA's local outreach office for a seasonal list.
4. **Do CVITP clinics file non-resident (5013-R) returns?** No fetched page says so.
   Ask SECC and the CRA outreach officer before telling SAWP workers to go to a free
   clinic.
5. **CGEB and CWB for seasonal workers:** do we show these at all? The fetched
   eligibility tests are residency-based and silent on non-residents. Recommend: not in
   v1.
6. **Translations:** most CRA, IRCC and ontario.ca HTML is English/French only. Who
   translates, who reviews, and do we show English source text alongside?
7. **Jamaican Liaison Service contacts:** can someone obtain them from MLSS or the
   Toronto Consulate General in writing? They are the most important contact for
   Jamaican members and are unverified.
8. **Mexico Leamington consulate:** its site blocks scripts and its PTAT page is
   stale (2024 wage). Verify contacts by phone quarterly? Or omit the Leamington
   consulate and show Toronto (the Ontario list) until verified?
9. **Guatemala and Honduras worker protection:** no official protection content was
   reachable. Accept contact-only cards for those two countries?
10. **Workforce WindsorEssex TeaMWork:** is it still funded in 2026? The only source is a
    2022 announcement.
11. **Legal liability wording:** does the owner want a standard "Hoy no da asesoría
    legal ni fiscal" line on every card, and has a lawyer seen it?
12. **Reminder timing:** how far ahead should document reminders fire (e.g. 60 and 30
    days before permit expiry, per IRCC's "at least 30 days")? This is a product
    decision; the source only gives the 30-day floor.

---

## 7. Pages that couldn't be fetched (or returned unusable content)

| URL | Result | Effect |
| --- | --- | --- |
| https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/about-your-tax-return/tax-return/completing-a-tax-return/important-dates-individuals.html | HTTP 404 (moved) | Used the current URL `…/topics/important-dates-individuals.html` instead |
| https://apps.cra-arc.gc.ca/ebci/oecv/external/prot/startClinicSearch.action?request_locale=en_CA (via WebFetch) | "Session expired" page | Re-fetched with curl and cookies; form structure read; search results **INCONCLUSIVE** |
| CRA clinic search POST (`cli_srch_01_srch.action`) for LEAMINGTON, WINDSOR, TORONTO, OTTAWA | No usable result; zero-result text is static template | Clinic availability unknown |
| https://consulmex.sre.gob.mx/leamington/index.php/asistencia-y-proteccion-consular | 302 to Radware bot wall (validate.perfdrive.com) | Protection-line phone unverified |
| https://consulmex.sre.gob.mx/leamington/index.php/preguntas-frecuentes | Radware bot wall | Passport details for Leamington unverified |
| https://consulmex.sre.gob.mx/leamington/index.php/contacto-inicio | Radware bot wall | Address/phones unverified |
| https://consulmex.sre.gob.mx/leamington/index.php/home (curl) | Radware bot wall | — |
| https://www.minex.gob.gt/din/3083-Consulado-General-de-Guatemala-en-Toronto-Ontario-Canad%C3%A1 | HTTP 403 (WebFetch and browser UA) | Guatemala consulate phone/jurisdiction unverified |
| https://www.minex.gob.gt/Uploads/Toronto17062024.pdf | HTTP 403 (HTML error page) | — |
| https://igm.gob.gt/pasaportes-en-el-extranjero/ | HTTP 403 (WebFetch and browser UA) | Guatemalan passport rules unverified |
| https://guatemala.gob.gt/consulado-general-de-guatemala-en-montreal-recibe-y-orienta-a-trabajadores-temporales-a-su-llegada-a-canada/ | HTTP 403 | Guatemalan worker-protection services unverified |
| https://tnh.gob.hn/nacional/embajada-de-honduras-en-canada-atiende-a-compatriotas-que-laboran-en-empresas-agricolas/ | HTTP 404 | Honduran worker-protection activity unverified |
| https://www.jhcottawa.ca/seasonal-agriculture-workers.html | TLS error: certificate does not cover www.jhcottawa.ca | Read over plain HTTP instead; provenance weaker, content limited to MLSS Kingston contacts |
| https://missions.mfaft.gov.jm/congentoronto/passport-3/ | HTTP 404 | Jamaica consulate renewal window unverified |
| https://www.canada.ca/en/revenue-agency/news/cra-multimedia-library/individuals-video-gallery/benefits-credits-newcomers-canada-spanish.html | HTTP 404 | Spanish CRA newcomer video not confirmed |
| https://www.ontario.ca/laws/regulation/010285 (WebFetch) | JavaScript shell, no text | Used the e-Laws `.doc` export instead (read successfully) |
| https://www.ontario.ca/laws/api/regulation/010285 | HTTP 502 | — |
| https://www.ontario.ca/document/employment-standard-act-policy-and-interpretation-manual/ontario-regulation-28501-when-work-deemed-be-performed-exemptions-and-special-rules | Fetched, but the returned content had no agricultural sections | Farm definitions taken from the regulation text instead |
| Section 217 sub-pages ("Who can elect", due dates) | Not fetched (time) | Section 217 details for SAWP remain SEARCH-ONLY |
| https://www.canada.ca/en/revenue-agency/services/tax/individuals/community-volunteer-income-tax-program/free-tax-clinic-statistics.html | Not fetched (seen in search only) | — |
| migrantfarmworkerclinic.ca, workforcewindsoressex.com/teamwork/, mwcp.ca, jamliser.com | Not fetched | Listed only as leads |

Pages that loaded but were **silent** on the question asked. These are recorded so
the silence is not read as a negative:
- CRA *Seasonal agricultural workers from other countries*: no filing, refund or benefit content.
- 5013-G guide: whether non-residents (vs deemed residents) can get CGEB or CWB.
- *Renew a health card* and *Apply for OHIP*: whether the health card expires with the work permit.
- *Managing heat stress at work*: no numeric limit and no farm-specific rule.
- ontario.ca ESA pages and O. Reg. 285/01: the word "greenhouse".
- WSIB pages: coverage specifics for non-SAWP agricultural workers, and the worker's claim time limit.
- IRCC vulnerable workers pages: fees, permit duration, family members.
