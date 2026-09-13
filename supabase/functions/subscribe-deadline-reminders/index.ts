// Email-capture endpoint for the "remind me before each deadline" widget on
// the quarterly-tax pages. No account required: POST {email, state_slug?,
// source?} and the address joins the quarterly-tax-deadlines topic.
//
// verify_jwt is disabled because this is called from the static site without
// a session. Abuse surface is limited: strict validation, a honeypot field,
// and an upsert that cannot create duplicates. Re-subscribing after an
// unsubscribe re-activates the row (that is the user's intent).

import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set([
  "https://vestlyfi.com",
  "https://www.vestlyfi.com",
  "http://localhost:8834",
  "http://localhost:8835",
]);

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function cors(origin: string | null): HeadersInit {
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://vestlyfi.com";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Content-Type": "application/json",
  };
}

Deno.serve(async (req: Request) => {
  const headers = cors(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), { status: 405, headers });
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), { status: 400, headers });
  }

  // Honeypot: real users never fill this hidden field.
  if (typeof body.website === "string" && body.website.length > 0) {
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email) || email.length > 254) {
    return new Response(JSON.stringify({ error: "invalid email" }), { status: 400, headers });
  }
  const stateSlug = typeof body.state_slug === "string" && /^[a-z-]{2,40}$/.test(body.state_slug)
    ? body.state_slug : null;
  const source = typeof body.source === "string" ? body.source.slice(0, 120) : null;

  const { error } = await sb.from("email_subscriptions").upsert(
    {
      email,
      topic: "quarterly-tax-deadlines",
      state_slug: stateSlug,
      source,
      unsubscribed_at: null, // re-subscribing re-activates
    },
    { onConflict: "email,topic" },
  );
  if (error) {
    console.error(`subscribe upsert failed: ${error.message}`);
    return new Response(JSON.stringify({ error: "could not subscribe" }), { status: 500, headers });
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
});
