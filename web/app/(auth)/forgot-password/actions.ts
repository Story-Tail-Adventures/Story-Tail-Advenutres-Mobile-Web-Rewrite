"use server";

import { authErrorByKind, mapAuthError } from "@/lib/auth-errors";
import { env } from "@/lib/env";
import { emailFormSchema } from "@/lib/validation/auth";
import { flattenIssues } from "@/lib/validation/flatten";
import { createClient } from "@/lib/supabase/server";
import type { ForgotPasswordState } from "./state";

/**
 * Screen 2.1.4 Forgot Password — see docs/Screen-Inventory.md §2.1.4 and
 * design/source-prototype/screens/client-auth.jsx `C214_ForgotPassword`.
 *
 * **The answer never depends on whether the account exists.** A "no account with that
 * email" message would turn this form into an account-enumeration oracle for anyone with
 * a list of addresses — the same rule that makes `mapAuthError` collapse "wrong password"
 * into "invalid credentials" and makes the sign-up gate return `confirm_email` for a taken
 * address. Supabase's `resetPasswordForEmail` already answers success for an unknown
 * address; this action must not add a branch that undoes that.
 *
 * Rate limiting is real and worth surfacing: supabase/config.toml allows two auth emails
 * per hour, so a second request inside that window comes back as `over_email_send_rate_limit`.
 * That maps to `rate_limited`, which is safe to show — it is a property of the request, not
 * of whether the address exists. It is shown for a request that WOULD have sent an email,
 * so strictly it is a weak signal; the alternative is silently doing nothing and letting
 * someone wait for a mail that is never coming.
 */
const EMAIL_FIELDS = ["email"] as const;

export async function requestPasswordResetAction(
  _prev: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const email = String(formData.get("email") ?? "");

  const parsed = emailFormSchema.safeParse({ email });
  if (!parsed.success) {
    return { fieldErrors: flattenIssues(parsed.error, EMAIL_FIELDS), email };
  }

  if (env.authChecksDisabledForLocalDev) {
    console.warn(
      "[auth] Supabase is not configured. Copy web/.env.example to web/.env.local and " +
        "fill it in from `supabase status`.",
    );
    return { formError: authErrorByKind.not_configured, email };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    // The link lands on the PKCE callback, which exchanges the code for a recovery
    // session and then sends them to the form that actually sets the password.
    redirectTo: `${env.siteUrl}/auth/callback?next=${encodeURIComponent("/reset-password")}`,
  });

  if (error) {
    const mapped = mapAuthError(error);
    // Never the email or the AuthError object — code and status only.
    console.warn("[auth] password reset request failed", {
      code: error.code,
      status: error.status,
    });

    if (mapped.kind === "rate_limited" || mapped.kind === "not_configured") {
      return { formError: mapped, email: parsed.data.email };
    }

    // Anything else — including an address GoTrue dislikes — reports as sent. See above.
    return { outcome: "sent", email: parsed.data.email };
  }

  return { outcome: "sent", email: parsed.data.email };
}
