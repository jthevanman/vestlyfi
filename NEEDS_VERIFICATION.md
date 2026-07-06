# NEEDS_VERIFICATION — Quarterly Estimated Tax by State

Pages listed here ship with `<meta name="robots" content="noindex,follow">` and are
**excluded from the sitemap** until their data is verified from official state
sources and their `needsVerification` flag is set to `false`.

Wrong tax numbers are worse than no page. Do not clear a flag until brackets,
standard deductions, the estimated-payment threshold, and the agency links have
all been checked against the state tax agency for tax year 2026.

**3 of 51 pages pending verification.**

| State | Abbr | What to verify | Official source to use |
| --- | --- | --- | --- |
| California | CA | brackets_single, brackets_married, standard deductions, threshold, agency name + URL, payment portal, quarterly weights | California Department of Revenue / Taxation (official .gov) |
| Maine | ME | brackets_single, brackets_married, standard deductions, threshold, agency name + URL, payment portal, quarterly weights | Maine Department of Revenue / Taxation (official .gov) |
| Vermont | VT | brackets_single, brackets_married, standard deductions, threshold, agency name + URL, payment portal, quarterly weights | Vermont Department of Revenue / Taxation (official .gov) |

## Known caveats & deferrals (verified pages)

Items flagged during verification that could not be confirmed from an official
source, or that are modeled as a documented approximation:

- **Traffic-first batch — now INDEXED (Ohio, Oregon, Missouri, Wisconsin, Georgia):**
  - **Ohio** — ohioBid model: first $250k of 1099 income deducted, remainder 3%; other
    income flat 2.75% over $26,050 (2026 HB96). Municipal/school-district taxes not modeled.
  - **Oregon (taxYearBasis 2025)** — federalTaxDeduction cap-phaseout: $8,500 cap phased out
    $125k–$145k AGI (official OR-40 Table 4). Portland-area local taxes not modeled.
  - **Missouri (taxYearBasis 2025)** — verified 2025 rate schedule (0% to $1,313; graduated
    to a 4.7% top over $9,191); federalTaxDeduction percent-of-federal (35/25/15/5/0%, cap
    $5k/$10k). 2026 withholding confirms the 4.7% top rate. KC/St. Louis 1% earnings tax not modeled.
  - **Wisconsin (taxYearBasis 2025)** — brackets derived + cross-checked against the official
    Tax Computation Worksheet subtraction amounts (Act 15 expanded the 4.4% bracket); the
    slidingStandardDeduction is fit to the official 2025 std-deduction table (MFJ $60k -> $18,823).
  - **Georgia** — conflict RESOLVED: HB 463 (signed 5/11/2026) cut the flat rate to 4.99%
    retroactive to 1/1/2026 (the 5.19% Employer's Guide predates it). Std deduction $15k/$30k
    applies to TY2026; $1,750 tip/overtime exclusion 2026-2028 noted.
  - **Maryland — INDEXED (taxYearBasis 2025), with a source caveat.** Fixed statutory
    2%-5.75% brackets + BRFA-2025 top brackets (6.25% >$500k / 6.5% >$1M single; >$600k/>$1.2M
    joint), capped standard deduction (~$2,700/$5,450). Every county's local income tax
    (2.25%-3.20%) is disclosed but NOT computed. NOTE: marylandtaxes.gov blocks automated
    fetch (JS page + dead PDF link + redirects), so these rest on stable statute + the
    provided BRFA change; human should spot-check the std-deduction max and BRFA thresholds.
  - **South Carolina (taxYearBasis 2025)** — 0%/3%/6% on federal taxable income. TY2025
    top rate 6% is a temporary cut scheduled to REVERT to 6.2% in July 2026 — re-check for
    TY2026. The 44% capital-gains deduction and 3% active-business election are not modeled.
  - **Oklahoma (taxYearBasis 2025)** — 2025 six-bracket schedule (top 4.75% over $7,200/$14,400)
    on federal AGI after std deduction + $1,000 exemption. TY2026 changes to three brackets
    (top 4.5%, HB 2764) — extract the 2026 thresholds from the OTC Legislative Update and re-index.
  - **New Jersey** — statutory unindexed schedule (unchanged since 2020), top 10.75%. NOTE:
    NJ gross income is NOT federal AGI (no half-SE-tax deduction, no standard deduction); modeled
    as gross SE income minus the $1,000 exemption. Estimated-payment trigger $400 (NJ-1040-ES).
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

