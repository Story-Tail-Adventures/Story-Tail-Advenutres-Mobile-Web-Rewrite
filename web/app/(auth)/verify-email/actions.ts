"use server";

import { authErrorByKind, mapAuthError } from "@/lib/auth-errors";
import { env } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { emailFormSchema } from "@/lib/validation/auth";
import { flattenIssues } from "@/lib/validation/flatten";
import type { ChangeEmailState, ResendState } from "./state";

/**
 * Screen 2.1.3 Email Verification — see docs/Screen-Inventory.md §2.1.3 and
 * design/source-prototype/screens/client-auth.jsx `C213_EmailVerification`. P1.
 *
 * The screen has two entry points and they know different things:
 *
 *  - **Straight after sign-up**, there is no session (GoTrue withholds one until the
 *    address is confirmed), so the address has to come from the form.
 *  - **From the `email_not_confirmed` sign-in error**, there is no session either — the
 *    sign-in was refused. Same shape.
 *
 * A session only exists on this screen when confirmations are switched off, or when
 * someone navigates here after confirming. In that case the address comes from the session
 * and is never accepted from the form, because a form-supplied address on an authenticated
 * resend would let a signed-in person spray verification mail at strangers.
 */

const RESEND_FIELDS = ["email"] as const;

export async function resendVerificationAction(
  _prev: ResendState,
  formData: FormData,
): Promise<ResendState> {
  if (env.authChecksDisabledForLocalDev) {
    console.warn(
      "[auth] Supabase is not configured. Copy web/.env.example to web/.env.local and " +
        "fill it in from `supabase status`.",
    );
    return { formError: authErrorByKind.not_configured };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // A session, if there is one, outranks anything posted.
  const sessionEmail = user?.email;
  const submitted = String(formData.get("email") ?? "");
  const email = sessionEmail ?? submitted;

  const parsed = emailFormSchema.safeParse({ email });
  if (!parsed.success) {
    return { fieldErrors: flattenIssues(parsed.error, RESEND_FIELDS), email: submitted };
  }

  const { error } = await supabase.auth.resend({
    type: "signup",
    email: parsed.data.email,
    options: {
      emailRedirectTo: `${env.siteUrl}/auth/callback?next=${encodeURIComponent("/dashboard")}`,
    },
  });

  if (error) {
    const mapped = mapAuthError(error);
    console.warn("[auth] resend verification failed", {
      code: error.code,
      status: error.status,
    });

    // Worth showing, because it explains a mail that is not going to arrive. Everything
    // else reports as sent: "no account with that address" here would be exactly the
    // enumeration oracle that mapAuthError and the sign-up gate go out of their way to
    // avoid handing out.
    if (mapped.kind === "rate_limited" || mapped.kind === "not_configured") {
      return { formError: mapped, email: parsed.data.email };
    }
    return { outcome: "sent", email: parsed.data.email };
  }

  return { outcome: "sent", email: parsed.data.email };
}

/**
 * "Option to update email address" (§2.1.3 key actions).
 *
 * Requires a session — there is nothing to change otherwise, and an unauthenticated
 * "change the email on this account" form is an account-takeover form with a friendly
 * label. `double_confirm_changes = true` in supabase/config.toml means GoTrue mails BOTH
 * addresses, so someone who has walked away from a signed-in browser cannot quietly move
 * the account to their own inbox.
 */
export async function changeEmailAction(
  _prev: ChangeEmailState,
  formData: FormData,
): Promise<ChangeEmailState> {
  const submitted = String(formData.get("email") ?? "");

  const parsed = emailFormSchema.safeParse({ email: submitted });
  if (!parsed.success) {
    return { fieldErrors: flattenIssues(parsed.error, RESEND_FIELDS), email: submitted };
  }

  if (env.authChecksDisabledForLocalDev) {
    return { formError: authErrorByKind.not_configured, email: submitted };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { formError: authErrorByKind.session_expired, email: submitted };
  }

  const { error } = await supabase.auth.updateUser(
    { email: parsed.data.email },
    {
      emailRedirectTo: `${env.siteUrl}/auth/callback?next=${encodeURIComponent("/dashboard")}`,
    },
  );

  if (error) {
    console.warn("[auth] email change failed", { code: error.code, status: error.status });
    const mapped = mapAuthError(error);
    // `email_taken` is safe to surface here in a way it is not on sign-up: the caller is
    // already authenticated, so learning that some address is in use tells them nothing
    // they could not learn by trying to register it.
    return { formError: mapped, email: submitted };
  }

  return { outcome: "sent", email: parsed.data.email };
}
