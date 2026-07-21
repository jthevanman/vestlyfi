#!/usr/bin/env python3
"""VestlyFi weekly Google Search Console digest.

Dependency-free (stdlib + openssl). Authenticates a read-only service account,
pulls this-week-vs-prior-week Search Analytics, and prints a Markdown digest to
stdout. Report-only: it never changes the site or GSC.

Key:      ~/.config/vestlyfi/gsc-sa.json   (never commit this)
Property: sc-domain:vestlyfi.com
Run:      python3 tools/gsc-weekly.py
"""
import json, base64, time, subprocess, tempfile, os, sys, urllib.request, urllib.parse
import datetime as dt

KEY_PATH = os.path.expanduser("~/.config/vestlyfi/gsc-sa.json")
SITE = "sc-domain:vestlyfi.com"
SCOPE = "https://www.googleapis.com/auth/webmasters.readonly"
TOKEN_URI = "https://oauth2.googleapis.com/token"
LAG_DAYS = 3          # GSC data is ~3 days behind
STRIKING_MIN_POS, STRIKING_MAX_POS = 5.0, 20.0
STRIKING_MIN_IMPR = 3
NOCLICK_MIN_IMPR = 10


def b64u(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def get_token() -> str:
    with open(KEY_PATH) as f:
        sa = json.load(f)
    now = int(time.time())
    header = {"alg": "RS256", "typ": "JWT"}
    claim = {"iss": sa["client_email"], "scope": SCOPE, "aud": TOKEN_URI,
             "iat": now, "exp": now + 3600}
    signing_input = f"{b64u(json.dumps(header).encode())}.{b64u(json.dumps(claim).encode())}"
    with tempfile.NamedTemporaryFile("w", suffix=".pem", delete=False) as pk:
        pk.write(sa["private_key"])
        pk_path = pk.name
    try:
        sig = subprocess.run(["openssl", "dgst", "-sha256", "-sign", pk_path],
                             input=signing_input.encode(), capture_output=True,
                             check=True).stdout
    finally:
        os.unlink(pk_path)
    jwt = f"{signing_input}.{b64u(sig)}"
    data = urllib.parse.urlencode({
        "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
        "assertion": jwt}).encode()
    resp = urllib.request.urlopen(urllib.request.Request(TOKEN_URI, data=data))
    return json.load(resp)["access_token"]


def query(token, start, end, dimensions=None, row_limit=25):
    body = {"startDate": str(start), "endDate": str(end), "rowLimit": row_limit}
    if dimensions:
        body["dimensions"] = dimensions
    url = (f"https://searchconsole.googleapis.com/webmasters/v3/sites/"
           f"{urllib.parse.quote(SITE, safe='')}/searchAnalytics/query")
    req = urllib.request.Request(url, data=json.dumps(body).encode(),
                                 headers={"Authorization": f"Bearer {token}",
                                          "Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(req)).get("rows", [])


def totals(token, start, end):
    rows = query(token, start, end)
    if not rows:
        return {"clicks": 0, "impressions": 0, "ctr": 0.0, "position": 0.0}
    return rows[0]


def by_key(rows):
    return {r["keys"][0]: r for r in rows}


def path(url):
    return url.replace("https://vestlyfi.com", "").replace("https://www.vestlyfi.com", "") or "/"


def fmt_delta(cur, prev, pct=False, invert=False):
    d = cur - prev
    arrow = "→" if d == 0 else ("▲" if (d > 0) != invert else "▼")
    if pct:
        return f"{arrow} {d:+.1f}"
    return f"{arrow} {d:+d}" if float(d).is_integer() else f"{arrow} {d:+.1f}"


def main():
    token = get_token()
    end = dt.date.today() - dt.timedelta(days=LAG_DAYS)
    start = end - dt.timedelta(days=6)
    prev_end = start - dt.timedelta(days=1)
    prev_start = prev_end - dt.timedelta(days=6)

    t = totals(token, start, end)
    p = totals(token, prev_start, prev_end)

    cur_pages = by_key(query(token, start, end, ["page"], 500))
    prev_pages = by_key(query(token, prev_start, prev_end, ["page"], 500))
    cur_q = query(token, start, end, ["query"], 1000)

    out = []
    out.append(f"# VestlyFi GSC weekly digest")
    out.append(f"**This week:** {start} → {end}  |  **Prior week:** {prev_start} → {prev_end}  _(GSC 3-day lag)_\n")

    # Totals
    out.append("## Totals (this week vs prior)")
    out.append("| Metric | This week | Prior | Change |")
    out.append("|---|--:|--:|--:|")
    out.append(f"| Clicks | {t['clicks']} | {p['clicks']} | {fmt_delta(t['clicks'], p['clicks'])} |")
    out.append(f"| Impressions | {t['impressions']} | {p['impressions']} | {fmt_delta(t['impressions'], p['impressions'])} |")
    out.append(f"| CTR | {t['ctr']*100:.2f}% | {p['ctr']*100:.2f}% | {fmt_delta(t['ctr']*100, p['ctr']*100, pct=True)}pp |")
    # lower position is better -> invert arrow direction
    out.append(f"| Avg position | {t['position']:.1f} | {p['position']:.1f} | {fmt_delta(t['position'], p['position'], pct=True, invert=True)} |")
    out.append(f"| Pages w/ impressions | {len(cur_pages)} | {len(prev_pages)} | {fmt_delta(len(cur_pages), len(prev_pages))} |")
    out.append("")

    # Striking distance queries
    striking = [r for r in cur_q
                if STRIKING_MIN_POS <= r["position"] <= STRIKING_MAX_POS
                and r["impressions"] >= STRIKING_MIN_IMPR]
    striking.sort(key=lambda r: r["impressions"], reverse=True)
    out.append(f"## Striking-distance queries (pos {int(STRIKING_MIN_POS)}–{int(STRIKING_MAX_POS)}, best near-term wins)")
    if striking:
        out.append("| Query | Impr | Clicks | Pos | CTR |")
        out.append("|---|--:|--:|--:|--:|")
        for r in striking[:15]:
            out.append(f"| {r['keys'][0]} | {r['impressions']} | {r['clicks']} | {r['position']:.1f} | {r['ctr']*100:.1f}% |")
    else:
        out.append("_None this week._")
    out.append("")

    # Impressions but no clicks -> title/meta candidates
    noclick = [r for u, r in cur_pages.items()
               if r["impressions"] >= NOCLICK_MIN_IMPR and r["clicks"] == 0]
    noclick.sort(key=lambda r: r["impressions"], reverse=True)
    out.append(f"## High impressions, zero clicks (title/meta rewrite candidates, ≥{NOCLICK_MIN_IMPR} impr)")
    if noclick:
        out.append("| Page | Impr | Pos |")
        out.append("|---|--:|--:|")
        for r in noclick[:15]:
            out.append(f"| {path(r['keys'][0])} | {r['impressions']} | {r['position']:.1f} |")
    else:
        out.append("_None this week._")
    out.append("")

    # Movers by impressions WoW
    deltas = []
    for url, r in cur_pages.items():
        prev_impr = prev_pages.get(url, {}).get("impressions", 0)
        deltas.append((url, r["impressions"] - prev_impr, r["impressions"], prev_impr))
    gainers = sorted(deltas, key=lambda x: x[1], reverse=True)[:8]
    losers = sorted([d for d in deltas if d[1] < 0], key=lambda x: x[1])[:8]

    out.append("## Top gaining pages (impressions WoW)")
    out.append("| Page | Δ | This wk | Prior |")
    out.append("|---|--:|--:|--:|")
    for url, d, cur, prev in gainers:
        out.append(f"| {path(url)} | {d:+d} | {cur} | {prev} |")
    out.append("")
    if losers:
        out.append("## Top declining pages (impressions WoW)")
        out.append("| Page | Δ | This wk | Prior |")
        out.append("|---|--:|--:|--:|")
        for url, d, cur, prev in losers:
            out.append(f"| {path(url)} | {d:+d} | {cur} | {prev} |")
        out.append("")

    md = "\n".join(out)

    if "--html" in sys.argv:
        print(render_html(start, end, prev_start, prev_end, t, p,
                          cur_pages, prev_pages, striking, noclick, gainers, losers))
    else:
        print(md)


def _esc(s):
    return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def render_html(start, end, prev_start, prev_end, t, p, cur_pages, prev_pages,
                striking, noclick, gainers, losers):
    css = ("body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;"
           "color:#1a2233;max-width:680px;margin:0 auto;padding:8px 4px}"
           "h1{font-size:20px;margin:0 0 2px}h2{font-size:15px;margin:22px 0 6px;color:#0f1a30}"
           ".sub{color:#5a6478;font-size:12px;margin-bottom:4px}"
           "table{border-collapse:collapse;width:100%;font-size:13px;margin-top:4px}"
           "th,td{padding:6px 8px;border-bottom:1px solid #e6e9f0;text-align:left}"
           "th{background:#f5f7fb;font-weight:600}td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}"
           ".up{color:#0a7d33}.down{color:#b3261e}.flat{color:#5a6478}"
           ".foot{color:#8a92a5;font-size:11px;margin-top:24px;border-top:1px solid #e6e9f0;padding-top:8px}")

    def delta_html(cur, prev, pct=False, invert=False, suffix=""):
        d = cur - prev
        good = (d > 0) != invert
        cls = "flat" if d == 0 else ("up" if good else "down")
        arrow = "→" if d == 0 else ("▲" if d > 0 else "▼")
        val = f"{d:+.1f}" if pct or not float(d).is_integer() else f"{d:+d}"
        return f'<span class="{cls}">{arrow} {val}{suffix}</span>'

    h = [f"<style>{css}</style>",
         "<h1>VestlyFi GSC weekly digest</h1>",
         f'<div class="sub">This week {start} → {end} vs prior {prev_start} → {prev_end} · GSC 3-day lag</div>']

    h.append("<h2>Totals</h2><table>"
             "<tr><th>Metric</th><th class='n'>This week</th><th class='n'>Prior</th><th class='n'>Change</th></tr>")
    rows = [
        ("Clicks", t['clicks'], p['clicks'], delta_html(t['clicks'], p['clicks'])),
        ("Impressions", t['impressions'], p['impressions'], delta_html(t['impressions'], p['impressions'])),
        ("CTR", f"{t['ctr']*100:.2f}%", f"{p['ctr']*100:.2f}%", delta_html(t['ctr']*100, p['ctr']*100, pct=True, suffix="pp")),
        ("Avg position", f"{t['position']:.1f}", f"{p['position']:.1f}", delta_html(t['position'], p['position'], pct=True, invert=True)),
        ("Pages w/ impressions", len(cur_pages), len(prev_pages), delta_html(len(cur_pages), len(prev_pages))),
    ]
    for name, cur, prev, dl in rows:
        h.append(f"<tr><td>{name}</td><td class='n'>{cur}</td><td class='n'>{prev}</td><td class='n'>{dl}</td></tr>")
    h.append("</table>")

    h.append("<h2>Striking-distance queries (pos 5–20, best near-term wins)</h2>")
    if striking:
        h.append("<table><tr><th>Query</th><th class='n'>Impr</th><th class='n'>Clicks</th><th class='n'>Pos</th><th class='n'>CTR</th></tr>")
        for r in striking[:15]:
            h.append(f"<tr><td>{_esc(r['keys'][0])}</td><td class='n'>{r['impressions']}</td><td class='n'>{r['clicks']}</td><td class='n'>{r['position']:.1f}</td><td class='n'>{r['ctr']*100:.1f}%</td></tr>")
        h.append("</table>")
    else:
        h.append("<p class='sub'>None this week.</p>")

    h.append(f"<h2>High impressions, zero clicks (title/meta candidates, ≥{NOCLICK_MIN_IMPR} impr)</h2>")
    if noclick:
        h.append("<table><tr><th>Page</th><th class='n'>Impr</th><th class='n'>Pos</th></tr>")
        for r in noclick[:15]:
            h.append(f"<tr><td>{_esc(path(r['keys'][0]))}</td><td class='n'>{r['impressions']}</td><td class='n'>{r['position']:.1f}</td></tr>")
        h.append("</table>")
    else:
        h.append("<p class='sub'>None this week.</p>")

    h.append("<h2>Top gaining pages (impressions WoW)</h2><table><tr><th>Page</th><th class='n'>Δ</th><th class='n'>This wk</th><th class='n'>Prior</th></tr>")
    for url, d, cur, prev in gainers:
        h.append(f"<tr><td>{_esc(path(url))}</td><td class='n up'>+{d}</td><td class='n'>{cur}</td><td class='n'>{prev}</td></tr>")
    h.append("</table>")

    if losers:
        h.append("<h2>Top declining pages (impressions WoW)</h2><table><tr><th>Page</th><th class='n'>Δ</th><th class='n'>This wk</th><th class='n'>Prior</th></tr>")
        for url, d, cur, prev in losers:
            h.append(f"<tr><td>{_esc(path(url))}</td><td class='n down'>{d}</td><td class='n'>{cur}</td><td class='n'>{prev}</td></tr>")
        h.append("</table>")

    h.append('<div class="foot">Read-only Search Console pull · report only, no changes made · sc-domain:vestlyfi.com</div>')
    return "".join(h)


if __name__ == "__main__":
    try:
        main()
    except urllib.error.HTTPError as e:
        print(f"GSC API error {e.code}: {e.read().decode()[:500]}", file=sys.stderr)
        sys.exit(1)
