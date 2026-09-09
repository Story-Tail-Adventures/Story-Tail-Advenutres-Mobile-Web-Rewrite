"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { authErrorByKind, mapAuthError } from "@/lib/auth-errors";
import { env } from "@/lib/env";
import { safeNext } from "@/lib/safe-next";
import { createClient } from "@/lib/supabase/server";
import { flattenJoinIssues, joinSchema } from "./schema";
import type { JoinState } from "./state";

/**
 * Screen 2.0.6 Sign-up Gate — see docs/Screen-Inventory.md §2.0.6 (Pattern J, §4.4) and
 * design/source-prototype/screens/client-public.jsx `C206_SignUpGate`. P2.
 *
 * Mirrors web/app/(auth)/login/actions.ts: the password never enters client JS state,
 * @supabase/ssr writes the session cookie from the server, and the form works without
 * JavaScript. Differences that matter here:
 *
 *  - **Metadata is exactly `{ first_name, last_name }`**, built from validated fields.
 *    The `handle_new_user` trigger trusts `raw_user_meta_data`, so nothing from the form
 *    is spread into it and `agent_id` in particular is never accepted from the client.
 *  - **Account enumeration.** With email confirmations ON (hosted default) GoTrue answers
 *    a duplicate email with an obfuscated user and no session — the same shape as a real
 *    sign-up awaiting confirmation. With confirmations OFF (local) it answers
 *    `user_already_exists`. To keep the two indistinguishable in every configuration,
 *    `email_taken` returns the SAME `{ outcome: "confirm_email", email }` state as a
 *    successful sign-up without a session. Do not add a "that email is taken" branch.
 *  - **Logging.** Never the password, the email, the metadata or the AuthError object —
 *    `error.code` / `error.status` only.
 *  - `revalidatePath("/dashboard")`, not the whole layout: purging the root would evict
 *    every static public page from the cache on each sign-up.
 *
 * `intent` and `trip` arrive as hidden inputs for the quote hand-off; today they are carried
 * only by `next` (the page the gate returns to). Per BRD §6.5 (2026-09-09) a quote request
 * creates a Trip, so this gate is where an anonymous visitor becomes someone a Trip can
 * belong to — see supabase/functions/quote-request.
 */
export async function signUpAction(_prev: JoinState, formData: FormData): Promise<JoinState> {
  // Echoed back on any failure so a fumbled submit does not clear the form. The
  // password is deliberately absent from this object and from every return below.
  const echo = {
    firstName: text(formData.get("firstName")),
    lastName: text(formData.get("lastName")),
    email: text(formData.get("email")),
  };
  const next = safeNext(formData.get("next"));

  const parsed = joinSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: formData.get("email"),
    password: formData.get("password"),
    terms: formData.get("terms"),
  });

  if (!parsed.success) {
    return { fieldErrors: flattenJoinIssues(parsed.error), ...echo };
  }

  // Before `supabase start` has ever run there is no URL or anon key, and reaching for
  // them throws. Surface that as a form error rather than a 500 (mirrors
  // AuthError.NotConfigured on mobile).
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
        // Same state as success-without-session, on purpose. See the module comment.
        return { outcome: "confirm_email", email: parsed.data.email };
      case "email_invalid":
        return { fieldErrors: { email: [mapped.message] }, ...echo };
      case "weak_password":
        // GoTrue's policy caught something the client rule did not; it belongs on the
        // field, and the kind's "See what's needed" link points back at this very form.
        return { fieldErrors: { password: [mapped.message] }, ...echo };
      default:
        break;
    }

    console.warn("[auth] sign-up failed", { code: error.code, status: error.status });

    // A sign-up has no "wrong password" — that fallback (and its reset-password link)
    // is sign-in vocabulary. Anything unrecognised is simply "try again".
    const formError = mapped.kind === "invalid_credentials" ? authErrorByKind.unknown : mapped;
    return { formError, ...echo };
  }

  if (data.session) {
    // Confirmations are off: they are signed in right now. Drop the dashboard's cached
    // logged-out render, then leave — `redirect` throws NEXT_REDIRECT, so it stays
    // outside any try/catch.
    revalidatePath("/dashboard");
    redirect(next);
  }

  return { outcome: "confirm_email", email: parsed.data.email };
}

function text(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}
