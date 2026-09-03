import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { safeNext } from "@/lib/safe-next";
import { createClient } from "@/lib/supabase/server";

/**
 * Auth callback — finishes the PKCE email-confirmation flow that the sign-up gate
 * (Screen 2.0.6, web/app/(public)/(plain)/join) starts with `emailRedirectTo`. P2.
 *
 * Hosted Supabase confirms email by default: `signUp` returns no session, GoTrue mails a
 * link, and that link lands here with `?code=…&next=…`. Exchanging the code writes the
 * session cookies (web/lib/supabase/server.ts), and the traveler continues to wherever
 * they were headed before the gate.
 *
 * Two guards: `next` goes through `safeNext` so the confirmation link can never become an
 * open redirect, and a failed exchange sends people to /login with nothing appended —
 * GoTrue's `error_description` is not traveler-facing copy, and echoing it would let a
 * crafted link put arbitrary text on our sign-in page.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"), "/dashboard");

  let exchanged = false;

  if (code && !env.authChecksDisabledForLocalDev) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      // Code and status only — never the code parameter, the email or the error body.
      console.warn("[auth] callback exchange failed", {
        code: error.code,
        status: error.status,
      });
    }
    exchanged = !error;
  }

  // `redirect` throws NEXT_REDIRECT, so it stays outside any try/catch. A relative
  // Location resolves against whatever host the browser used, which is what we want
  // behind a reverse proxy.
  redirect(exchanged ? next : "/login");
}
