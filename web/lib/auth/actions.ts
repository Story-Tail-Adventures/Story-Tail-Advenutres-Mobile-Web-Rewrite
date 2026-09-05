"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { authErrorByKind } from "@/lib/auth-errors";
import { env } from "@/lib/env";
import { isOAuthProvider, type OAuthProvider } from "@/lib/auth/providers";
import { safeNext } from "@/lib/safe-next";
import { createClient } from "@/lib/supabase/server";

/**
 * The two auth actions that belong to no single screen.
 *
 * They live in lib/ rather than beside a route because both are used from several: OAuth
 * from 2.1.1 Login, 2.1.2 Registration and 2.0.6 the sign-up gate; sign-out from 2.1.3
 * Email Verification today and the dashboard shell as soon as 2.2.1 exists.
 */

function providerEnabled(provider: OAuthProvider): boolean {
  return provider === "google" ? env.googleAuthEnabled : env.appleAuthEnabled;
}

/**
 * Start an OAuth sign-in (Screens 2.1.1, 2.1.2, 2.0.6).
 *
 * Submitted by a button inside the ordinary email form, so it needs no JavaScript and no
 * second `<form>` — HTML has no nested forms, and a button-level `formAction` is how
 * React 19 expresses "this submit goes somewhere else".
 *
 * The provider arrives as a BOUND argument, not a form field, and that is not a style
 * choice. React encodes a server action's identity into the submitter's `name` attribute,
 * so `<button name="provider" value="google" formAction={…}>` has its name overwritten
 * with `$ACTION_ID_…`: the value never arrives, and the server and client disagree about
 * the attribute, which shows up as a hydration mismatch. `.bind` is the supported way to
 * pass a constant to an action, and Next encrypts bound arguments, so a reader of the page
 * source cannot rewrite this one either.
 *
 * `skipBrowserRedirect` is not optional here. Called on the server, supabase-js has no
 * `window` to navigate, so without it the returned URL would simply be dropped and the
 * submit would appear to do nothing. We take the URL and let Next issue the redirect —
 * which also keeps the PKCE verifier cookie that @supabase/ssr just wrote, the one
 * /auth/callback needs to exchange the code.
 *
 * A disabled provider returns silently rather than erroring. The buttons that reach this
 * action are already rendered disabled from the same env flags; anyone who gets past that
 * is posting by hand, and there is nothing to tell them.
 */
export async function signInWithProviderAction(
  provider: OAuthProvider,
  formData: FormData,
): Promise<void> {
  const next = safeNext(formData.get("next"));

  // Bound arguments are encrypted rather than trusted blindly, but the allowlist stays:
  // it costs nothing and it is the check that stops a future caller passing a string.
  if (!isOAuthProvider(provider) || !providerEnabled(provider)) return;
  if (env.authChecksDisabledForLocalDev) return;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      // `provider` rides along so the callback knows which social sign-in was attempted
      // if it comes back a collision — Screen 2.1.8 names the provider in its CTA, and
      // GoTrue's error redirect does not carry it. Not personal data, unlike the address.
      redirectTo:
        `${env.siteUrl}/auth/callback?next=${encodeURIComponent(next)}` +
        `&provider=${provider}`,
      skipBrowserRedirect: true,
    },
  });

  if (error || !data?.url) {
    // Code and status only. The provider's error body is not traveler-facing copy.
    console.warn("[auth] oauth start failed", {
      provider,
      code: error?.code,
      status: error?.status,
    });
    redirect(`/login?error=${authErrorByKind.unknown.kind}`);
  }

  // `redirect` throws NEXT_REDIRECT, so it stays outside any try/catch.
  redirect(data.url);
}

/**
 * Sign out (Screen 2.1.3 "Sign out", and the dashboard shell later).
 *
 * `scope: "local"` deliberately: this signs out this browser, not every device the person
 * is signed in on. Revoking every session belongs to Screen 2.5.7's explicit "sign out
 * everywhere" button, and quietly doing it here would log someone out of their phone
 * because they closed a tab on a laptop.
 */
export async function signOutAction(): Promise<void> {
  if (!env.authChecksDisabledForLocalDev) {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) {
      console.warn("[auth] sign-out failed", { code: error.code, status: error.status });
    }
  }

  // Drop the per-request auth state the layout tree cached, or the signed-in shell keeps
  // rendering for one more navigation.
  revalidatePath("/", "layout");
  redirect("/login");
}
