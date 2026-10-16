import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { safeNext } from "@/lib/safe-next";
import { createClient } from "@/lib/supabase/server";

/**
 * Finishes the sign-in links an advisor sends from the Account admin tab (§3.9): a password
 * reset, a magic link, or an invite.
 *
 * Those links are made with GoTrue's Admin API (`generateLink`), which is not a PKCE flow, so
 * `/auth/callback` (which exchanges a `code`) cannot finish them. The email carries the token
 * HASH instead, and `verifyOtp({ token_hash, type })` here turns it into a session and writes
 * the cookies, server-side.
 *
 * Three guards, the same as `/auth/callback`'s:
 * - `type` must be one of the three the advisor tools send. Anything else is refused, so this
 *   route cannot be used to finish an email change or a sign-up some other way.
 * - `next` goes through `safeNext`, so a link can never become an open redirect.
 * - a failure goes to /login with nothing appended: GoTrue's error text is not traveler copy,
 *   and the token hash is never logged or echoed.
 */
const ALLOWED: readonly EmailOtpType[] = ["recovery", "magiclink", "invite"];

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const fallback = type === "recovery" ? "/reset-password" : "/dashboard";
  const next = safeNext(searchParams.get("next"), fallback);

  let verified = false;

  if (tokenHash && type && ALLOWED.includes(type) && !env.authChecksDisabledForLocalDev) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) {
      // Code and status only: never the token hash, the email or the error body.
      console.warn("[auth] confirm failed", { type, code: error.code, status: error.status });
    }
    verified = !error;
  }

  // `redirect` throws NEXT_REDIRECT, so it stays outside any try/catch.
  redirect(verified ? next : "/login");
}
