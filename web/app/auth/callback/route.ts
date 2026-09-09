import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { isIdentityCollision, isOAuthProvider } from "@/lib/auth/providers";
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
 *
 * One failure is not a failure: an OAuth sign-in whose email already belongs to a
 * password account comes back as an identity collision, and that is Screen 2.1.8's entry
 * point rather than an error. `provider` is on the URL because `signInWithProviderAction`
 * put it there — GoTrue's error redirect does not carry it, and 2.1.8 names the provider
 * in the button it asks someone to trust. The colliding ADDRESS is deliberately not
 * carried anywhere: it is personal data, and 2.1.8 asks for it.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"), "/dashboard");
  const provider = searchParams.get("provider");

  // The provider refused before we ever got a code — GoTrue redirects here with its own
  // error parameters instead.
  const returnedErrorCode = searchParams.get("error_code");
  if (isIdentityCollision(returnedErrorCode) && isOAuthProvider(provider)) {
    redirect(`/link-account?provider=${provider}`);
  }

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
      if (isIdentityCollision(error.code) && isOAuthProvider(provider)) {
        redirect(`/link-account?provider=${provider}`);
      }
    }
    exchanged = !error;
  }

  // `redirect` throws NEXT_REDIRECT, so it stays outside any try/catch. A relative
  // Location resolves against whatever host the browser used, which is what we want
  // behind a reverse proxy.
  redirect(exchanged ? next : "/login");
}
