# Homepage redesign

Working notes for the `home-redesign` branch. Read this first at the start of
each session, and update it before ending one. `*.md` is in `.vercelignore`,
so this file is never served.

## Rules for this branch

- Nothing here goes live until the branch is merged into `main`.
- End every session with a commit and a push to `home-redesign`.
- Pull `main` into this branch now and then so the final merge stays clean.
- Test on the branch's Vercel preview link, on desktop and on a phone.

## The idea

- The 01/02/03 "how it works" cards are gone.
- First screen: a big centered headline and the two buttons, with a thin
  animated net worth line along the bottom. No text in the band and no click
  target. The moving dot stays mid-screen with history on the left and open
  space on the right. No gridlines, no dashed projection, no shaded cone
  (all tried and dropped on Nov 9).
- The line climbs with the occasional dip and jump, and the scale refits so it
  never leaves the frame. Small dots mark monthly check-ins.
- Under the headline, "Plus calculators for ___ →" swaps the calculator name
  every 2.4s (slot-machine style) and links to /calculators/ only. It sits in
  the subheading so the H1 stays "VestlyFi Net Worth Tracker".
- On load the headline words rise in one by one, then the rest, then the
  band's line draws itself in from the left before it starts drifting.
- Scrolling holds the page while the band grows into a net worth dashboard
  preview (sample data), then normal scrolling continues.
- The dashboard preview always shows debts next to assets, and they add up to
  the net worth shown.
- Reduced motion: no pinning or drift; the finished preview shows as a still.

## Status

- [x] Branch created from `main` (Nov 9 2026)
- [x] Prototype at `/home-v2/` (noindex, no analytics, "Prototype" badge)
- [x] Confirm Vercel builds a preview link for this branch (it does, on every push)
- [x] Rotating calculators line and load-in intro (Nov 9)
- [x] Reduced-motion version checked (static list, still dashboard)
- [ ] Try the prototype on a phone and decide: keep going or drop it
- [ ] Optional, if the top still feels plain: own/owe/net worth ticker tied to
      the line, and a slow gold glow behind the headline
- [ ] Tune: drift speed, line wiggle, band height, scroll length
- [ ] Decide on the optional debt line in the band
- [ ] Move the hero share card into the page (the "share your progress" moment)
- [ ] Bring over the tools section and footer (bug report modal included)
- [ ] Replace `index.html` with the new design; keep the title, description,
      canonical, structured data, analytics and the email-link redirect script
- [ ] Check speed on a mid-range Android phone
- [ ] Note the homepage "Start tracking" click rate before launch
- [ ] Delete `/home-v2/` and merge into `main`
