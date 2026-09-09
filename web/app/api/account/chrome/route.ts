import { NextResponse } from "next/server";

import { initialsFor } from "@/lib/auth/initials";
import { env } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

/**
 * The two letters for the public top bar's avatar, and nothing else.
 *
 * ── WHY AN ENDPOINT AT ALL ───────────────────────────────────────────────────────
 *
 * The marketing pages are prerendered, so they cannot read a session (see
 * app/(public)/layout.tsx). The proxy's flag cookie tells the browser THAT somebody is
 * signed in, which is enough to paint the right chrome; it deliberately carries no identity,
 * so the initials come from here, fetched after paint by cookie-holders only.
 *
 * ── WHY NOT THE JWT ──────────────────────────────────────────────────────────────
 *
 * `user_metadata.first_name` is tempting — it needs no request. It is also wrong. It is
 * written once at sign-up (app/(public)/(plain)/join/actions.ts) and never updated, an OAuth
 * identity never has it at all (see supabase/migrations/20260903221802_oauth_names.sql), and
 * it has no `preferred_name` — which is the name the dashboard prefers, and which onboarding
 * does write. Somebody called Margaret who goes by Peggy would be `MS` here and `PS` on
 * their dashboard, permanently.
 *
 * So this runs the SAME read and the SAME initialsFor as app/(client)/layout.tsx. The two
 * avatars cannot disagree, because they are the same computation.
 *
 * ── WHAT IT RETURNS ──────────────────────────────────────────────────────────────
 *
 * `{ signedIn, initials }`. No name, no email, no ids. It is chrome, and a public page has no
 * business holding more than it draws.
 *
 * Authoritative rather than trusting: getUser() revalidates the JWT, so a stale flag cookie
 * (they outlive their token by design) gets `{ signedIn: false }` and the caller reverts to
 * the signed-out cluster. GET route handlers are uncached by default in Next 16, so there is
 * no `dynamic` export to add.
 */
export async function GET() {
  // Matches every other auth path: without Supabase configured there is no session to read,
  // and outside production that must render rather than 500.
  if (env.authChecksDisabledForLocalDev) {
    return NextResponse.json({ signedIn: false });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ signedIn: false });

  // `client_self_select` plus the column grant in client_column_grant scope this to the
  // caller's own row. An agent has no client row, so `client` comes back null and the caller
  // falls back to the brand monogram.
  const { data: client } = await supabase
    .from("client")
    .select("first_name, last_name, preferred_name")
    .maybeSingle();

  return NextResponse.json(
    {
      signedIn: true,
      initials: initialsFor(
        client?.preferred_name ?? client?.first_name,
        client?.last_name,
      ),
    },
    // Per-browser and short: the name behind it changes at onboarding and at a profile edit.
    { headers: { "Cache-Control": "private, max-age=60" } },
  );
}
