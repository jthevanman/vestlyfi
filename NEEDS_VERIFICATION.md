# NEEDS_VERIFICATION — Quarterly Estimated Tax by State

Pages listed here ship with `<meta name="robots" content="noindex,follow">` and are
**excluded from the sitemap** until their data is verified from official state
sources and their `needsVerification` flag is set to `false`.

Wrong tax numbers are worse than no page. Do not clear a flag until brackets,
standard deductions, the estimated-payment threshold, and the agency links have
all been checked against the state tax agency for tax year 2026.

**29 of 51 pages pending verification.**

| State | Abbr | What to verify | Official source to use |
| --- | --- | --- | --- |
| Alabama | AL | brackets_single, brackets_married, standard deductions, threshold, agency name + URL, payment portal, quarterly weights | Alabama Department of Revenue / Taxation (official .gov) |
| Arkansas | AR | brackets_single, brackets_married, standard deductions, threshold, agency name + URL, payment portal, quarterly weights | Arkansas Department of Revenue / Taxation (official .gov) |
| California | CA | brackets_single, brackets_married, standard deductions, threshold, agency name + URL, payment portal, quarterly weights | California Department of Revenue / Taxation (official .gov) |
| Connecticut | CT | brackets_single, brackets_married, standard deductions, threshold, agency name + URL, payment portal, quarterly weights | Connecticut Department of Revenue / Taxation (official .gov) |
| Delaware | DE | brackets_single, brackets_married, standard deductions, threshold, agency name + URL, payment portal, quarterly weights | Delaware Department of Revenue / Taxation (official .gov) |
| District of Columbia | DC | brackets_single, brackets_married, standard deductions, threshold, agency name + URL, payment portal, quarterly weights | District of Columbia Department of Revenue / Taxation (official .gov) |
| Georgia | GA | brackets_single, brackets_married, standard deductions, threshold, agency name + URL, payment portal, quarterly weights | Georgia Department of Revenue / Taxation (official .gov) |
| Hawaii | HI | brackets_single, brackets_married, standard deductions, threshold, agency name + URL, payment portal, quarterly weights | Hawaii Department of Revenue / Taxation (official .gov) |
| Idaho | ID | brackets_single, brackets_married, standard deductions, threshold, agency name + URL, payment portal, quarterly weights | Idaho Department of Revenue / Taxation (official .gov) |
| Kansas | KS | brackets_single, brackets_married, standard deductions, threshold, agency name + URL, payment portal, quarterly weights | Kansas Department of Revenue / Taxation (official .gov) |
| Maine | ME | brackets_single, brackets_married, standard deductions, threshold, agency name + URL, payment portal, quarterly weights | Maine Department of Revenue / Taxation (official .gov) |
| Maryland | MD | brackets_single, brackets_married, standard deductions, threshold, agency name + URL, payment portal, quarterly weights | Maryland Department of Revenue / Taxation (official .gov) |
| Massachusetts | MA | brackets_single, brackets_married, standard deductions, threshold, agency name + URL, payment portal, quarterly weights | Massachusetts Department of Revenue / Taxation (official .gov) |
| Mississippi | MS | brackets_single, brackets_married, standard deductions, threshold, agency name + URL, payment portal, quarterly weights | Mississippi Department of Revenue / Taxation (official .gov) |
| Missouri | MO | brackets_single, brackets_married, standard deductions, threshold, agency name + URL, payment portal, quarterly weights | Missouri Department of Revenue / Taxation (official .gov) |
| Montana | MT | brackets_single, brackets_married, standard deductions, threshold, agency name + URL, payment portal, quarterly weights | Montana Department of Revenue / Taxation (official .gov) |
| Nebraska | NE | brackets_single, brackets_married, standard deductions, threshold, agency name + URL, payment portal, quarterly weights | Nebraska Department of Revenue / Taxation (official .gov) |
| New Jersey | NJ | brackets_single, brackets_married, standard deductions, threshold, agency name + URL, payment portal, quarterly weights | New Jersey Department of Revenue / Taxation (official .gov) |
| New Mexico | NM | brackets_single, brackets_married, standard deductions, threshold, agency name + URL, payment portal, quarterly weights | New Mexico Department of Revenue / Taxation (official .gov) |
| North Dakota | ND | brackets_single, brackets_married, standard deductions, threshold, agency name + URL, payment portal, quarterly weights | North Dakota Department of Revenue / Taxation (official .gov) |
| Ohio | OH | brackets_single, brackets_married, standard deductions, threshold, agency name + URL, payment portal, quarterly weights | Ohio Department of Revenue / Taxation (official .gov) |
| Oklahoma | OK | brackets_single, brackets_married, standard deductions, threshold, agency name + URL, payment portal, quarterly weights | Oklahoma Department of Revenue / Taxation (official .gov) |
| Oregon | OR | brackets_single, brackets_married, standard deductions, threshold, agency name + URL, payment portal, quarterly weights | Oregon Department of Revenue / Taxation (official .gov) |
| Rhode Island | RI | brackets_single, brackets_married, standard deductions, threshold, agency name + URL, payment portal, quarterly weights | Rhode Island Department of Revenue / Taxation (official .gov) |
| South Carolina | SC | brackets_single, brackets_married, standard deductions, threshold, agency name + URL, payment portal, quarterly weights | South Carolina Department of Revenue / Taxation (official .gov) |
| Utah | UT | brackets_single, brackets_married, standard deductions, threshold, agency name + URL, payment portal, quarterly weights | Utah Department of Revenue / Taxation (official .gov) |
| Vermont | VT | brackets_single, brackets_married, standard deductions, threshold, agency name + URL, payment portal, quarterly weights | Vermont Department of Revenue / Taxation (official .gov) |
| West Virginia | WV | brackets_single, brackets_married, standard deductions, threshold, agency name + URL, payment portal, quarterly weights | West Virginia Department of Revenue / Taxation (official .gov) |
| Wisconsin | WI | brackets_single, brackets_married, standard deductions, threshold, agency name + URL, payment portal, quarterly weights | Wisconsin Department of Revenue / Taxation (official .gov) |

## Known caveats & deferrals (verified pages)

Items flagged during verification that could not be confirmed from an official
source, or that are modeled as a documented approximation:

- **Traffic-first batch, modeling needs (deferred until handled correctly):**
  - **Ohio** — self-employment income qualifies for Ohio's Business Income Deduction
    (first $250,000 deducted, remainder taxed at a flat 3%); the graduated nonbusiness
    brackets would badly overstate a 1099 filer. Model the BID before indexing.
  - **Oregon & Missouri** — both allow a federal income-tax-liability subtraction (OR up to
    ~$8,250, MO up to $5,000/$10,000, both phased out by AGI). Needs a federalTaxDeduction
    engine feature; without it the estimate runs materially high. OR 2026 also unpublished (use 2025 + banner).
  - **Wisconsin** — standard deduction phases down as income rises (not a flat amount);
    the flat-deduction model would be off across the income range.
  - **Maryland** — every county levies a local income tax (2.25%–3.20%) on top of the state
    rate, and 2025 added new 6.25%/6.5% top brackets; model state brackets + disclose local tax.
- **California — deferred (still noindex).** The FTB blocks automated access (HTTP 403
  on the tax-rate-schedule page and the 2026 Form 540-ES instructions), and CA typically
  does not publish inflation-adjusted 2026 brackets until ~August. Needs manual
  transcription of the full FTB schedule plus the 30/40/0/30 weighting and 1% MHS surtax.
- **New York — indexed, with a documented limitation.** 2026 brackets transcribed from the
  official IT-2105-I (2026) instructions. The tax-benefit-recapture supplemental tax above
  NYAGI $107,650, the MCTMT, and NYC/Yonkers local taxes are NOT modeled (noted on-page);
  the estimate can run slightly low for high earners in the NYC metro.
- **Idaho — deferred (still noindex).** The official 2026 individual rate was not
  yet published on tax.idaho.gov (rate schedule only ran through 2025). Do not
  verify until the 2026 rate is posted.
- **Massachusetts — deferred (still noindex).** 2026 flat rate (5.0%) and $1,107,750
  surtax threshold are confirmed, but the official personal-exemption page returned
  HTTP 403 and MA uses its own gross-income base (not federal AGI). Needs the
  exemption amount + base rules confirmed before indexing.
- **Iowa — indexed, with a documented approximation.** 2026 flat rate 3.8% confirmed by
  the Oct 2025 IDR press release (authoritative over the stale 3.9% provisions page); the
  $1,000 estimated-payment threshold is confirmed. Iowa's standard deduction was not
  published in the sources checked and is omitted (estimate runs slightly high); confirm and add it.
- **Mississippi — rate resolved, still noindex.** DOR's own FAQ confirms the structure:
  first $10,000 of taxable income exempt, remainder taxed at 4.4% (the tax-year-2026 rate).
  Model as brackets [0–10,000 @ 0%, 10,000+ @ 4.4%]. Still pending: MS standard deduction
  ($2,300/$4,600 believed) + personal exemption ($6,000/$12,000 believed) + estimated
  threshold — dor.ms.gov returned a TLS certificate error, so these were not confirmed.
- **Georgia — genuine official-source conflict, still noindex.** Standard deduction is
  consistently $15,000/$30,000, but the 2026 RATE conflicts within DOR sources: the 2026
  Employer's Tax Guide summary says withhold at 5.19%, while the DOR standard-deductions
  page references a 4.99% flat rate. The authoritative 2026 Employer's Guide PDF 403s.
  Do not index until the exact tax-year-2026 rate is confirmed from the rate schedule.
- **Illinois (indexed).** Rate 4.95% and $1,000 threshold confirmed official. The IL
  personal exemption allowance (~$2,850/person) is NOT modeled, so the estimate runs
  slightly high; documented in selfEmploymentNotes. Add the exemption to refine.
- **North Carolina (indexed).** Rate 3.99% confirmed official for 2026. Standard
  deduction ($12,750 / $25,500) is the latest published (2025) amount; confirm the
  2026 figure when NCDOR posts it.
- **Arizona (indexed).** Rate 2.5% confirmed; standard deduction modeled as equal to
  the federal amount per ADOR guidance ("matches the federal amount"). Confirm the
  exact 2026 AZ figure when the Form 140 instructions are posted.

## Verification checklist per state

1. Pull 2026 bracket table from the state tax agency (single + married).
2. Confirm the standard deduction / conformity basis.
3. Confirm the estimated-payment threshold (dollar amount that triggers the requirement).
4. Confirm due-date schedule and any weighting (e.g., California 30/40/0/30).
5. Record 2–3 genuinely state-unique facts.
6. Set `stateTaxAgencyName`, `stateTaxAgencyUrl`, `statePaymentPortalUrl` (https, official).
7. Set `needsVerification: false` and `lastVerified` to the date checked.
8. Re-run `node tools/generate.mjs`.

