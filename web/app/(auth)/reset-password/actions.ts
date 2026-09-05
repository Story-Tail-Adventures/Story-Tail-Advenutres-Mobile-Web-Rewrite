"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { authErrorByKind, mapAuthError } from "@/lib/auth-errors";
import { env } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { flattenIssues } from "@/lib/validation/flatten";
import { PASSWORD_PAIR_FIELDS, passwordPairSchema } from "@/lib/validation/registration";
import type { ResetPasswordState } from "./state";

/**
 * Screen 2.1.5 Reset Password — see docs/Screen-Inventory.md §2.1.5 and
 * design/source-prototype/screens/client-auth.jsx `C215_ResetPassword`.
 *
 * The authority here is the recovery session, not anything in the form. GoTrue's emailed
 * link goes to /auth/callback, which exchanges the code for a session and then sends the
 * browser here; `updateUser` then changes the password of whoever that session belongs to.
 * There is deliberately no email field and no token field — a form that took either would
 * be a password-reset oracle, and neither would be trusted anyway.
 *
 * Neither password is ever logged, echoed back in the returned state, or put in a redirect.
 */
export async function resetPasswordAction(
  _prev: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  const parsed = passwordPairSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return { fieldErrors: flattenIssues(parsed.error, PASSWORD_PAIR_FIELDS) };
  }

  if (env.authChecksDisabledForLocalDev) {
    console.warn(
      "[auth] Supabase is not configured. Copy web/.env.example to web/.env.local and " +
        "fill it in from `supabase status`.",
    );
    return { formError: authErrorByKind.not_configured };
  }

  const supabase = await createClient();

  // Re-check the session here rather than trusting the page's render-time check. Between
  // the page rendering and this submit the recovery session can expire, and "your password
  // is updated" for a request that updated nothing is the worst possible outcome.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { formError: authErrorByKind.session_expired };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });

  if (error) {
    const mapped = mapAuthError(error);
    console.warn("[auth] password update failed", {
      code: error.code,
      status: error.status,
    });

    // GoTrue's own weak-password policy caught something the client rule did not. That
    // belongs on the field, not above the form.
    if (mapped.kind === "weak_password") {
      return { fieldErrors: { password: [mapped.message] } };
    }
    return { formError: mapped };
  }

  // They are signed in on the recovery session, so there is nothing to sign in to — drop
  // the cached logged-out shell and take them to their trips.
  revalidatePath("/", "layout");
  redirect("/dashboard");
}
