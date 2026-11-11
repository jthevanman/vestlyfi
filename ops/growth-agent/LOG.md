# VestlyFi growth agent log

The weekly growth agent reads this file first, grades every open experiment
whose read date has passed, then picks and ships the next improvement. Newest
run on top. Each experiment keeps its baseline, the metric that decides it, and
a read date, so later runs can tell what worked and build on it.

Status values: OPEN (waiting for its read date), WON, LOST, FLAT, NEEDS REVIEW
(on a branch, not merged, waiting for the owner).

## Open experiments

| ID | Shipped | Change | Decides it | Baseline | Read on |
|---|---|---|---|---|---|
| E1 | 2026-10-27 | 1099 hub retitle ("1099 Tax Calculator 2026") | CTR at constant position for "1099 estimated tax calculator" family | Sep 28 to Oct 25: 927 impr, 0 clicks, pos 12.9 | 2026-11-17 |
| E2 | 2026-11-10 | Car credit-score pages retargeted to "car loan" queries; sibling grid cut to +/-30 points | Position of "{score} credit score car loan" / "car loan with {score}" / "is {score} a good credit score to buy a car" queries; cluster clicks | Oct 11 to Nov 7: 1,578 impr, 6 clicks. 640 page 362 impr pos 19.6, 0 clicks. 750 page 105 impr pos 20.9. "640 credit score car loan" 32 impr pos 20.1; "is 640 a good credit score to buy a car" 16 impr pos 17.3 | 2026-12-08 |

## Known traps (do not repeat)

- Brand sitelinks look like zero-click wins. /calculators/, /create-a-diagram/
  and /debt-tracker/ rank ~1.5 only for the query "vestlyfi". Exclude the
  brand query before calling anything a CTR problem.
- Page-level average position hides real query rank. The car pages average
  ~8.5 per page but their named queries sit at 17 to 50. Judge on query rows.
- Snippet-only rewrites did not move CTR on the car cluster (Aug 31 2026, read
  Oct 27). Do not try another title-only pass on a cluster that ranks page 2+.
- The car pages' Aug 31 titles were patched into HTML and never into
  tools/gen-car-pages.mjs. Fixed on 2026-11-10. Before editing any generated
  page, run its generator first and check the diff is empty; if not, the
  generator is stale and must be fixed first.
- `npm test` fails on Windows (directory argument). Run
  `node --test tools/test/*.test.mjs`. Two projection tests already fail on
  main (classifyCategory, projectForward contributions); compare against that
  baseline rather than expecting all green.
- The "calculate tax for/on 1099" family (about 300 impr at pos 4 to 5)
  vanished on Oct 8 2026 with no site change that day. Treat as a Google
  results change, not something a page edit caused.

## Runs

### 2026-11-10 (set up by hand, first run)

- Read the Nov 9 emailed digest. Its "do this one thing" (/calculators/ title
  rewrite) was a brand sitelink, so no change made there.
- Search Console flagged "Blocked due to other 4xx issue" on Nov 9. All 161
  sitemap URLs and every internal link return 200 to Googlebot. Only malformed
  URLs (a stray `%`, a JS template string in account/index.html) return 400 or
  404, so no real page is blocked. Check the GSC indexing report URL list if
  it grows.
- Shipped E2.
- Next candidates, in order: read E1 on Nov 17; quarterly-tax hub ranks 14 to
  28 for its main queries going into the Jan 15 Q4 deadline, so body/content
  depth there is the next ranking play; coast-fire-by-age fell 42 to 12
  impressions week over week, check whether it persists.
