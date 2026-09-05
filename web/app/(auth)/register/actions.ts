"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { authErrorByKind, mapAuthError } from "@/lib/auth-errors";
import { env } from "@/lib/env";
import { safeNext } from "@/lib/safe-next";
import { createClient } from "@/lib/supabase/server";
import { flattenIssues } from "@/lib/validation/flatten";
import {
  REGISTRATION_WITH_CONFIRM_FIELDS,
  registrationWithConfirmSchema,
} from "@/lib/validation/registration";
import type { RegisterState } from "./state";

/**
 * Screen 2.1.2 Registration — see docs/Screen-Inventory.md §2.1.2 (Pattern A, §4.4) and
 * design/source-prototype/screens/client-auth.jsx `C212_Registration`. P1.
 *
 * The twin of `signUpAction` in app/(public)/(plain)/join/actions.ts, which is this same
 * sign-up wearing the 2.0.6 sign-up gate's clothes. Shared rules now live in
 * lib/validation/registration.ts; the ones below are worth repeating because getting any
 * of them wrong is a security bug rather than a bug.
 *
 *  - **Metadata is exactly `{ first_name, last_name }`**, built from validated fields.
 *    `handle_new_user()` trusts `raw_user_meta_data`, so nothing from the form is spread
 *    into it and `agent_id` in particular is never accepted from the client — otherwise a
 *    self-registering user could attach themselves to any active agent's book of business.
 *  - **Account enumeration.** With email confirmations ON (the hosted default) GoTrue
 *    answers a duplicate address with an obfuscated user and no session — the same shape
 *    as a real sign-up awaiting confirmation. With them OFF (local) it answers
 *    `user_already_exists`. So `email_taken` returns the SAME `{ outcome: "confirm_email" }`
 *    state as a successful sign-up. Do not add a "that email is taken" branch.
 *  - **Logging.** Never a password, the email, the metadata, or the AuthError object —
 *    `error.code` and `error.status` only.
 *  - `revalidatePath("/dashboard")`, not the whole layout: purging the root would evict
 *    every static public page from the cache on each sign-up.
 */
export async function registerAction(
  _prev: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  // Echoed back on failure so a fumbled submit does not clear the form. Neither password
  // is in this object, nor in any return below.
  const echo = {
    firstName: text(formData.get("firstName")),
    lastName: text(formData.get("lastName")),
    email: text(formData.get("email")),
  };
  const next = safeNext(formData.get("next"));

  const parsed = registrationWithConfirmSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
    terms: formData.get("terms"),
  });

  if (!parsed.success) {
    return {
      fieldErrors: flattenIssues(parsed.error, REGISTRATION_WITH_CONFIRM_FIELDS),
      ...echo,
    };
  }

  if (env.authChecksDisabledForLocalDev) {
    console.warn(
      "[auth] Supabase is not configured. Copy web/.env.example to web/.env.local and " +
        "fill it in from `supabase status`.",
    );
    return { formError: authErrorByKind.not_configured, ...echo };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      // Exactly these two keys. See the module comment.
      data: { first_name: parsed.data.firstName, last_name: parsed.data.lastName },
      emailRedirectTo: `${env.siteUrl}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error) {
    const mapped = mapAuthError(error);

    switch (mapped.kind) {
      case "email_taken":
        // The same state as success-without-session, on purpose. See the module comment.
        return { outcome: "confirm_email", email: parsed.data.email };
      case "email_invalid":
        return { fieldErrors: { email: [mapped.message] }, ...echo };
      case "weak_password":
        // GoTrue's policy caught something the client rule did not; it belongs on the
        // field rather than above the form.
        return { fieldErrors: { password: [mapped.message] }, ...echo };
      default:
        break;
    }

    console.warn("[auth] sign-up failed", { code: error.code, status: error.status });

    // A sign-up has no "wrong password" — that fallback, and its reset-password link, is
    // sign-in vocabulary. Anything unrecognised is simply "try again".
    const formError = mapped.kind === "invalid_credentials" ? authErrorByKind.unknown : mapped;
    return { formError, ...echo };
  }

  if (data.session) {
    // Confirmations are off: they are signed in right now. Drop the dashboard's cached
    // logged-out render, then leave — `redirect` throws NEXT_REDIRECT, so it stays outside
    // any try/catch.
    revalidatePath("/dashboard");
    redirect(next);
  }

  return { outcome: "confirm_email", email: parsed.data.email };
}

function text(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}
