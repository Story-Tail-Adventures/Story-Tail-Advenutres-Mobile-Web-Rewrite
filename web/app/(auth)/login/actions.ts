"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { loginSchema } from "@/lib/validation/auth";
import { mapAuthError, authErrorByKind } from "@/lib/auth-errors";
import { env } from "@/lib/env";
import { flattenIssues } from "@/lib/validation/flatten";
import { safeNext, type LoginState } from "./state";

/**
 * Screen 2.1.1 Login — see docs/Screen-Inventory.md §2.1.1 and
 * design/source-prototype/screens/client-auth.jsx `C211_Login`.
 *
 * Runs on the server rather than in the browser. Three reasons, in order of weight:
 * the password never enters client JS state; @supabase/ssr writes the session cookie
 * from the server so the proxy and every RSC can read it with no client round-trip; and
 * the form still works with JavaScript disabled. It is still the official supabase-js
 * SDK, just executed on the Next server.
 *
 * Note the session cookie is NOT HttpOnly — @supabase/ssr deliberately leaves it
 * readable so the browser client can use the same session. So this protects the
 * password, not the resulting token. Guard the token the way you would any bearer
 * credential: it is XSS-reachable by design.
 */
const LOGIN_FIELDS = ["email", "password"] as const;

export async function signInAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "");
  const next = safeNext(formData.get("next"));

  const parsed = loginSchema.safeParse({
    email,
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { fieldErrors: flattenIssues(parsed.error, LOGIN_FIELDS), email };
  }

  // Before `supabase start` has ever run there is no URL or anon key, and reaching for
  // them throws. Surface that as a normal form error rather than a 500 — the screen is
  // still worth using while the backend is being set up. Mirrors AuthError.NotConfigured
  // on mobile.
  if (env.authChecksDisabledForLocalDev) {
    console.warn(
      "[auth] Supabase is not configured. Copy web/.env.example to web/.env.local and " +
        "fill it in from `supabase status`.",
    );
    return { formError: authErrorByKind.not_configured, email };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    return { formError: mapAuthError(error), email };
  }

  // The layout tree caches per-request auth state; drop it so the authenticated
  // shell renders instead of the logged-out one.
  revalidatePath("/", "layout");
  redirect(next);
}
