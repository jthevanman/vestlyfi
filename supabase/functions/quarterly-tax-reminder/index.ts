// Quarterly estimated-tax deadline reminder sender.
//
// Invoked daily by pg_cron (14:00 UTC). Sends a reminder email 7 days and
// 1 day before each federal estimated-tax deadline, to the union of:
//   1. active email_subscriptions rows (topic quarterly-tax-deadlines)
//   2. account holders with a quarterly-tax saved result (upserted into
//      email_subscriptions at send time so unsubscribe works uniformly)
//
// Safety properties:
//   - reminder_sends unique(email, reminder_key) is claimed BEFORE sending,
//     so re-runs and hostile triggering cannot double-send.
//   - Without RESEND_API_KEY set, every run is a dry run (logs, no sends).
//   - ?dry_run=1 forces a dry run; ?test_date=YYYY-MM-DD simulates a date.
//   - GET ?unsubscribe=<token> opts the address out (no auth required).
//
// verify_jwt is disabled because the unsubscribe link must work from email
// clients; the send path is gated by the x-cron-secret header instead. The
// expected value lives only in Vault (quarterly_tax_cron_secret), which is also
// where the pg_cron job reads it from. Nothing secret is in this file.

import { createClient } from "npm:@supabase/supabase-js@2";

const CRON_SECRET_NAME = "quarterly_tax_cron_secret";
const FROM = "VestlyFi <reminders@vestlyfi.com>";
const SITE = "https://vestlyfi.com";

// Federal estimated-tax due dates. Extend as years roll over.
const DEADLINES = [
  { date: "2026-09-15", label: "Q3 2026" },
  { date: "2027-01-15", label: "Q4 2026" },
  { date: "2027-04-15", label: "Q1 2027" },
  { date: "2027-06-15", label: "Q2 2027" },
  { date: "2027-09-15", label: "Q3 2027" },
];
const OFFSETS = [7, 1]; // days before the deadline to send

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

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

function prettyDate(iso: string): string {
  const d = new Date(iso + "T12:00:00Z");
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

function emailHtml(opts: {
  deadlineLabel: string; deadlineDate: string; daysOut: number;
  stateSlug: string | null; savedId: string | null; savedLabel: string | null; token: string;
}): string {
  const when = opts.daysOut === 1 ? "tomorrow" : `in ${opts.daysOut} days`;
  const calcUrl = opts.stateSlug
    ? `${SITE}/calculators/quarterly-tax/${opts.stateSlug}/`
    : `${SITE}/calculators/quarterly-tax/`;
  const savedLine = opts.savedId
    ? `<p style="margin:0 0 16px">Your saved calculation${opts.savedLabel ? ` (<strong>${opts.savedLabel}</strong>)` : ""} is one click away: <a href="${calcUrl}?saved=${opts.savedId}" style="color:#8a6d1f">open it here</a>.</p>`
    : `<p style="margin:0 0 16px">Not sure what you owe? The <a href="${calcUrl}" style="color:#8a6d1f">quarterly tax calculator</a> takes about a minute.</p>`;
  const unsubUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/quarterly-tax-reminder?unsubscribe=${opts.token}`;
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f6f5f2">
<div style="max-width:520px;margin:0 auto;padding:32px 24px;font-family:Arial,Helvetica,sans-serif;color:#22252e">
  <p style="margin:0 0 20px;font-size:18px;font-weight:bold;color:#8a6d1f">VestlyFi</p>
  <p style="margin:0 0 16px;font-size:16px"><strong>Your ${opts.deadlineLabel} estimated tax payment is due ${when}</strong>, on ${prettyDate(opts.deadlineDate)}.</p>
  ${savedLine}
  <p style="margin:0 0 16px">Paying on time avoids the IRS underpayment penalty, which accrues daily from the due date. Full schedule and rules: <a href="${SITE}/calculators/quarterly-tax/deadlines/" style="color:#8a6d1f">2026 deadline guide</a>.</p>
  <p style="margin:28px 0 0;font-size:12px;color:#8b8e98">You're getting this because you asked for deadline reminders or saved a quarterly-tax calculation on VestlyFi. <a href="${unsubUrl}" style="color:#8b8e98">Unsubscribe</a></p>
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
    ? "You're unsubscribed. No more deadline reminders will be sent to this address."
    : "That unsubscribe link wasn't recognized. It may have already been used.";
  return new Response(
    `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#0a0f1e;color:#f5f0e8;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0"><div style="text-align:center;padding:24px"><p style="font-size:20px;color:#e8c97a;margin-bottom:12px">VestlyFi</p><p>${msg}</p></div></body></html>`,
    { status: ok ? 200 : 404, headers: { "Content-Type": "text/html" } },
  );
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  const unsubToken = url.searchParams.get("unsubscribe");
  if (unsubToken) return handleUnsubscribe(unsubToken);

  if (!(await cronAuthorized(req))) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  const resendKey = Deno.env.get("RESEND_API_KEY") ?? "";
  const dryRun = url.searchParams.get("dry_run") === "1" || !resendKey;
  const today = url.searchParams.get("test_date") ?? new Date().toISOString().slice(0, 10);

  // Which reminder (if any) fires today?
  let target: { date: string; label: string; daysOut: number } | null = null;
  for (const d of DEADLINES) {
    const days = daysBetween(today, d.date);
    if (OFFSETS.includes(days)) { target = { ...d, daysOut: days }; break; }
  }
  if (!target) {
    return new Response(JSON.stringify({ sent: 0, skipped: "no deadline within send window", today }), {
      headers: { "Content-Type": "application/json" },
    });
  }
  const reminderKey = `${target.date}:d${target.daysOut}`;

  // Fold quarterly-tax savers into email_subscriptions (so they hold tokens).
  const { data: saves, error: savesErr } = await sb
    .from("saved_results")
    .select("id, user_id, calculator, label, created_at")
    .like("calculator", "calculators/quarterly-tax%")
    .order("created_at", { ascending: false });
  if (savesErr) {
    return new Response(JSON.stringify({ error: savesErr.message }), { status: 500 });
  }
  const latestSaveByUser = new Map<string, { id: string; label: string | null; stateSlug: string | null }>();
  for (const s of saves ?? []) {
    if (!latestSaveByUser.has(s.user_id)) {
      const m = s.calculator.match(/^calculators\/quarterly-tax\/([a-z-]+)$/);
      latestSaveByUser.set(s.user_id, { id: s.id, label: s.label, stateSlug: m ? m[1] : null });
    }
  }
  if (latestSaveByUser.size > 0) {
    const { data: usersPage } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
    for (const u of usersPage?.users ?? []) {
      const save = latestSaveByUser.get(u.id);
      if (!save || !u.email) continue;
      await sb.from("email_subscriptions").upsert(
        { email: u.email.toLowerCase(), user_id: u.id, topic: "quarterly-tax-deadlines", state_slug: save.stateSlug, source: "saved-result" },
        { onConflict: "email,topic", ignoreDuplicates: true },
      );
    }
  }

  // Active recipients.
  const { data: subs, error: subsErr } = await sb
    .from("email_subscriptions")
    .select("email, user_id, state_slug, token")
    .eq("topic", "quarterly-tax-deadlines")
    .is("unsubscribed_at", null);
  if (subsErr) {
    return new Response(JSON.stringify({ error: subsErr.message }), { status: 500 });
  }

  let sent = 0, alreadySent = 0, failed = 0;
  const wouldSend: string[] = [];
  for (const sub of subs ?? []) {
    // Claim before sending: the unique constraint makes retries safe.
    const { data: claim } = await sb
      .from("reminder_sends")
      .insert({ email: sub.email, reminder_key: reminderKey })
      .select("id")
      .maybeSingle();
    if (!claim) { alreadySent++; continue; }

    if (dryRun) {
      wouldSend.push(sub.email);
      await sb.from("reminder_sends").delete().eq("id", claim.id); // release claim
      continue;
    }

    const save = sub.user_id ? latestSaveByUser.get(sub.user_id) : undefined;
    const html = emailHtml({
      deadlineLabel: target.label, deadlineDate: target.date, daysOut: target.daysOut,
      stateSlug: sub.state_slug, savedId: save?.id ?? null, savedLabel: save?.label ?? null,
      token: sub.token,
    });
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM, to: [sub.email],
        subject: `${target.label} estimated taxes are due ${target.daysOut === 1 ? "tomorrow" : prettyDate(target.date)}`,
        html,
      }),
    });
    if (res.ok) { sent++; }
    else {
      failed++;
      await sb.from("reminder_sends").delete().eq("id", claim.id); // release for retry
      console.error(`Resend failed for ${sub.email}: ${res.status} ${await res.text()}`);
    }
  }

  return new Response(JSON.stringify({
    reminderKey, dryRun, sent, alreadySent, failed,
    wouldSend: dryRun ? wouldSend : undefined,
    recipients: subs?.length ?? 0,
  }), { headers: { "Content-Type": "application/json" } });
});
