"use server";

import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { safeNext } from "@/lib/safe-next";
import { createClient } from "@/lib/supabase/server";
import { isConfirmType, isTokenHash } from "./state";

/**
 * Spends the emailed link, on a person's button press (see ./state.ts for why not on GET).
 *
 * `verifyOtp({ token_hash, type })` turns the hash into a session and writes the cookies. The
 * hash is never logged or echoed; `next` goes through `safeNext`, so the form cannot become an
 * open redirect; and only the three types the advisor tools send are accepted.
 */
export async function confirmSignInAction(formData: FormData): Promise<void> {
  const tokenHash = formData.get("token_hash");
  const type = formData.get("type");
  const fallback = type === "recovery" ? "/reset-password" : "/dashboard";
  const next = safeNext(String(formData.get("next") ?? ""), fallback);

  if (!isTokenHash(tokenHash) || !isConfirmType(type) || env.authChecksDisabledForLocalDev) {
    redirect("/auth/confirm?failed=1");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  if (error) {
    // Code and status only: never the token hash, the email or the error body.
    console.warn("[auth] confirm failed", { type, code: error.code, status: error.status });
    redirect("/auth/confirm?failed=1");
  }

  // `redirect` throws NEXT_REDIRECT, so it stays outside any try/catch.
  redirect(next);
}
