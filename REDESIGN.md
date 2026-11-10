# Homepage redesign

Working notes for the `home-redesign` branch. Read this first at the start of
each session, and update it before ending one. `*.md` is in `.vercelignore`,
so this file is never served.

Preview (always the newest push on this branch):
https://vestlyfi-git-home-redesign-jnavarra06413-2676s-projects.vercel.app/home-v2/

## Rules for this branch

- Nothing here goes live until the branch is merged into `main`.
- End every session with a commit and a push to `home-redesign`.
- Pull `main` into this branch now and then so the final merge stays clean.
- Test on the branch's Vercel preview link, on desktop and on a phone.

## Settled (the user likes these)

- The 01/02/03 "how it works" cards are gone.
- A thin animated net worth line runs along the bottom of the first screen.
  No text in the band and no click target. The moving dot stays mid-screen
  with history on the left and open space on the right.
- The line climbs with the occasional dip and jump, and the scale refits so it
  never leaves the frame. Small dots mark monthly check-ins. It draws itself
  in from the left on load.
- Scrolling holds the page while the band grows into a net worth dashboard
  preview (sample data), then normal scrolling continues.
- The dashboard preview always shows debts next to assets, and they add up to
  the net worth shown.
- Reduced motion: no pinning or drift; the finished preview shows as a still.

## Tried and dropped

- Gridlines, a dashed projection line and a shaded cone in the band (Nov 9).
- A centered headline with a rotating "Plus calculators for ___" line and a
  word-by-word load-in (Nov 9). The user didn't like anything above the band.

## Open: what goes above the band

Three candidates live on the prototype; switch with the A/B/C buttons in the
"Prototype" badge, or `?hero=a`, `?hero=b`, `?hero=c`.

- **A, live number:** huge sample net worth that ticks with the dot's height,
  "Own $X − Owe $Y" under it, one line of copy, two buttons. The dashboard
  at the end of the scroll shows the same live number.
- **B, statement:** left-aligned "Everything you own. / Everything you owe. /
  One number." with two buttons and a quiet link to /calculators/.
- **C, tool grid:** headline and buttons on the left; tiles on the right for
  Net Worth Tracker (big, with the live number), Debt Tracker, Calculators,
  Diagrams. Same link targets as the current homepage's tool cards.

## Status

- [x] Branch created from `main` (Nov 9 2026)
- [x] Prototype at `/home-v2/` (noindex, no analytics, "Prototype" badge)
- [x] Vercel builds a preview link for this branch on every push
- [x] Three candidate tops (A/B/C) built and checked on desktop and phone size
- [ ] User picks A, B or C (or a mix), then delete the other two
- [ ] Try it on a real phone
- [ ] Tune: drift speed, line wiggle, band height, scroll length
- [ ] Decide on the optional debt line in the band
- [ ] Move the hero share card into the page (the "share your progress" moment)
- [ ] Bring over the tools section and footer (bug report modal included)
- [ ] Replace `index.html` with the new design; keep the title, description,
      canonical, structured data, analytics and the email-link redirect script;
      only one H1
- [ ] Check speed on a mid-range Android phone
- [ ] Note the homepage "Start tracking" click rate before launch
- [ ] Delete `/home-v2/` and merge into `main`
