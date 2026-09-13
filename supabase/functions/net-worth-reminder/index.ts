// Monthly net worth reminder sender.
//
// Invoked daily by pg_cron (16:00 UTC, two hours after the tax job so one
// Resend outage cannot take both down). Emails account holders whose latest
// net worth snapshot is 30+ days old, prompting them to log this month.
//
// Audience: every user with at least one net_worth_entries row is upserted into
// email_subscriptions (topic net-worth-monthly) at send time, so they hold an
// unsubscribe token. Users with zero entries never appear: the candidate list
// comes from net_worth_latest_snapshots(), which reads only that table.
//
// Safety properties (same as quarterly-tax-reminder):
//   - reminder_sends unique(email, reminder_key) is claimed BEFORE sending, so
//     re-runs and hostile triggering cannot double-send. A failed send deletes
//     its claim so the next run retries.
//   - Freshness is re-checked per user immediately before each send, so someone
//     who logs a snapshot mid-run is not emailed.
//   - Without RESEND_API_KEY set, every run is a dry run (logs, no sends).
//   - ?dry_run=1 forces a dry run and returns the would-be recipients.
//   - ?test_date=YYYY-MM-DD simulates the run date.
//   - ?only=<email> restricts the run to one address (pre-launch test sends).
//   - ?simulate_failure=1 treats every send as a Resend error without calling
//     Resend, to exercise the claim release.
//   - GET ?unsubscribe=<token> opts the address out (no auth required).
//
// verify_jwt is disabled because the unsubscribe link must work from email
// clients; the send path is gated by the x-cron-secret header, checked against
// Vault (net_worth_cron_secret), which is also where the pg_cron job reads it.

import { createClient } from "npm:@supabase/supabase-js@2";

const CRON_SECRET_NAME = "net_worth_cron_secret";
const TOPIC = "net-worth-monthly";
const FROM = "VestlyFi <reminders@vestlyfi.com>";
const SITE = "https://vestlyfi.com";
const DORMANT_DAYS = 30;
const SEND_GAP_MS = 600; // stays under Resend's default 2 requests/second

// One reminder per user per calendar month, however long they stay dormant: a
// user idle for three months gets three emails, not ninety. To cap harder
// (say, once per dormancy streak), change this key and nothing else.
function reminderKeyFor(userId: string, today: string): string {
  return `net-worth:${userId}:${today.slice(0, 7)}`;
}

// Mirrors the currency-to-locale table in assets/currency.js so amounts read
// the same way they do in the tracker.
const CURRENCY_LOCALES: Record<string, string> = {
  USD: "en-US", EUR: "de-DE", GBP: "en-GB", CAD: "en-CA", AUD: "en-AU", NZD: "en-NZ",
  CHF: "de-CH", JPY: "ja-JP", CNY: "zh-CN", HKD: "en-HK", SGD: "en-SG", INR: "en-IN",
  KRW: "ko-KR", SEK: "sv-SE", NOK: "nb-NO", DKK: "da-DK", PLN: "pl-PL", CZK: "cs-CZ",
  ZAR: "en-ZA", BRL: "pt-BR", MXN: "es-MX", AED: "en-AE", ILS: "he-IL", TRY: "tr-TR",
};

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

type Snapshot = {
  user_id: string; email: string | null; last_date: string;
  net_worth: number | string; currency: string | null;
};

// Fails closed: an RPC error, a missing Vault secret, or a missing header all
// come back as not authorized.
async function cronAuthorized(req: Request): Promise<boolean> {
  const candidate = req.headers.get("x-cron-secret");
  if (!candidate) return false;
  const { data, error } = await sb.rpc("cron_secret_matches", {
    secret_name: CRON_SECRET_NAME, candidate,
  });
  if (error) console.error(`cron secret check failed: ${error.message}`);
  return !error && data === true;
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round(
    (Date.parse(toIso + "T00:00:00Z") - Date.parse(fromIso + "T00:00:00Z")) / 86400000,
  );
}

// "July 14", or "December 20, 2025" when the snapshot is from another year.
function plainDate(iso: string, today: string): string {
  const d = new Date(iso + "T12:00:00Z");
  const base = `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
  return iso.slice(0, 4) === today.slice(0, 4) ? base : `${base}, ${d.getUTCFullYear()}`;
}

function money(value: number, currency: string | null): string {
  const code = currency && CURRENCY_LOCALES[currency] ? currency : "USD";
  return new Intl.NumberFormat(CURRENCY_LOCALES[code], {
    style: "currency", currency: code, minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(value);
}

function emailHtml(opts: {
  monthName: string; lastDate: string; today: string;
  netWorth: number; currency: string | null; token: string;
}): string {
  const trackerUrl = `${SITE}/net-worth/`;
  const unsubUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/net-worth-reminder?unsubscribe=${opts.token}`;
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f6f5f2">
<div style="max-width:520px;margin:0 auto;padding:32px 24px;font-family:Arial,Helvetica,sans-serif;color:#22252e">
  <p style="margin:0 0 20px;font-size:18px;font-weight:bold;color:#8a6d1f">VestlyFi</p>
  <p style="margin:0 0 16px;font-size:16px"><strong>Time to log your ${opts.monthName} net worth.</strong></p>
  <p style="margin:0 0 16px">You last logged on ${plainDate(opts.lastDate, opts.today)}, when your net worth was <strong>${money(opts.netWorth, opts.currency)}</strong>. A few minutes of updated balances keeps your trend line honest.</p>
  <p style="margin:0 0 16px"><a href="${trackerUrl}" style="color:#8a6d1f;font-weight:bold">Log your ${opts.monthName} snapshot</a></p>
  <p style="margin:0 0 16px">Once it's in, tap Share under your chart to turn the change into a clean image you can post or send.</p>
  <p style="margin:28px 0 0;font-size:12px;color:#8b8e98">You're getting this because you track your net worth on VestlyFi. We send at most one reminder a month, and only when you haven't logged a snapshot in ${DORMANT_DAYS} days. <a href="${unsubUrl}" style="color:#8b8e98">Unsubscribe</a></p>
</div></body></html>`;
}

async function handleUnsubscribe(token: string): Promise<Response> {
  const { data, error } = await sb
    .from("email_subscriptions")
    .update({ unsubscribed_at: new Date().toISOString() })
    .eq("token", token)
    .select("email");
  const ok = !error && data && data.length > 0;
  const msg = ok
    ? "You're unsubscribed. No more net worth reminders will be sent to this address."
    : "That unsubscribe link wasn't recognized. It may have already been used.";
  return new Response(
    `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#0a0f1e;color:#f5f0e8;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0"><div style="text-align:center;padding:24px"><p style="font-size:20px;color:#e8c97a;margin-bottom:12px">VestlyFi</p><p>${msg}</p></div></body></html>`,
    { status: ok ? 200 : 404, headers: { "Content-Type": "text/html" } },
  );
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  const unsubToken = url.searchParams.get("unsubscribe");
  if (unsubToken) return handleUnsubscribe(unsubToken);

  if (!(await cronAuthorized(req))) return json({ error: "unauthorized" }, 401);

  const resendKey = Deno.env.get("RESEND_API_KEY") ?? "";
  const dryRun = url.searchParams.get("dry_run") === "1" || !resendKey;
  const simulateFailure = url.searchParams.get("simulate_failure") === "1";
  const only = url.searchParams.get("only")?.trim().toLowerCase() || null;
  const today = url.searchParams.get("test_date") ?? new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) return json({ error: "test_date must be YYYY-MM-DD" }, 400);
  const monthName = MONTHS[Number(today.slice(5, 7)) - 1];
  const reminderKey = reminderKeyFor("<user_id>", today);

  // 1. Latest snapshot per user. Only users with entries come back.
  const { data: snaps, error: snapsErr } = await sb.rpc("net_worth_latest_snapshots");
  if (snapsErr) return json({ error: snapsErr.message }, 500);
  const withEmail = (snaps as Snapshot[]).filter((s) => s.email);

  // 2. Auto-enroll every tracker user so each holds an unsubscribe token.
  //    ignoreDuplicates leaves existing rows, including unsubscribed ones, alone.
  if (withEmail.length > 0) {
    const { error: enrollErr } = await sb.from("email_subscriptions").upsert(
      withEmail.map((s) => ({ email: s.email, user_id: s.user_id, topic: TOPIC, source: "net-worth-tracker" })),
      { onConflict: "email,topic", ignoreDuplicates: true },
    );
    if (enrollErr) return json({ error: enrollErr.message }, 500);
  }

  const { data: subs, error: subsErr } = await sb
    .from("email_subscriptions")
    .select("email, token, unsubscribed_at")
    .eq("topic", TOPIC);
  if (subsErr) return json({ error: subsErr.message }, 500);
  const subByEmail = new Map((subs ?? []).map((s) => [s.email, s]));

  // 3. Dormant 30+ days, still subscribed.
  const candidates = withEmail.filter((s) => {
    const sub = subByEmail.get(s.email!);
    return daysBetween(s.last_date, today) >= DORMANT_DAYS
      && sub && !sub.unsubscribed_at
      && (!only || s.email === only);
  });

  let sent = 0, alreadySent = 0, failed = 0, skippedFresh = 0;
  const wouldSend: string[] = [];
  for (const snap of candidates) {
    const email = snap.email!;
    const sub = subByEmail.get(email)!;
    const releaseClaim = (id: string) => sb.from("reminder_sends").delete().eq("id", id);

    // Claim before sending: the unique constraint makes retries safe.
    const { data: claim, error: claimErr } = await sb
      .from("reminder_sends")
      .insert({ email, reminder_key: reminderKeyFor(snap.user_id, today) })
      .select("id")
      .maybeSingle();
    if (!claim) {
      if (claimErr && claimErr.code !== "23505") {
        failed++;
        console.error(`claim failed for ${email}: ${claimErr.message}`);
      } else {
        alreadySent++;
      }
      continue;
    }

    if (dryRun) {
      wouldSend.push(email);
      await releaseClaim(claim.id);
      continue;
    }

    // Re-check freshness right before sending, in case they logged mid-run.
    const { data: fresh, error: freshErr } = await sb.rpc("net_worth_latest_snapshots", { p_user_ids: [snap.user_id] });
    const current = (fresh as Snapshot[] | null)?.[0];
    if (freshErr || !current) {
      failed++;
      await releaseClaim(claim.id);
      console.error(`freshness re-check failed for ${email}: ${freshErr?.message ?? "no snapshot"}`);
      continue;
    }
    if (daysBetween(current.last_date, today) < DORMANT_DAYS) {
      skippedFresh++;
      await releaseClaim(claim.id);
      continue;
    }

    if (sent + failed > 0) await new Promise((r) => setTimeout(r, SEND_GAP_MS));

    const html = emailHtml({
      monthName, lastDate: current.last_date, today,
      netWorth: Number(current.net_worth), currency: current.currency, token: sub.token,
    });
    const res = simulateFailure
      ? new Response("simulated failure", { status: 500 })
      : await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: FROM, to: [email], subject: `Log your ${monthName} net worth`, html }),
      });
    if (res.ok) { sent++; }
    else {
      failed++;
      await releaseClaim(claim.id); // release for retry
      console.error(`Resend failed for ${email}: ${res.status} ${await res.text()}`);
    }
  }

  return json({
    reminderKey, dryRun, sent, alreadySent, failed, skippedFresh,
    wouldSend: dryRun ? wouldSend : undefined,
    recipients: candidates.length,
  });
});
