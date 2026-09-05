"use server";

import { redirect } from "next/navigation";
import { authErrorByKind, mapAuthError } from "@/lib/auth-errors";
import { env } from "@/lib/env";
import { isOAuthProvider } from "@/lib/auth/providers";
import { createClient } from "@/lib/supabase/server";
import { loginSchema } from "@/lib/validation/auth";
import { flattenIssues } from "@/lib/validation/flatten";
import type { LinkAccountState } from "./state";

/**
 * Screen 2.1.8 Social Login / Account Linking — see docs/Screen-Inventory.md §2.1.8
 * (Pattern J, §4.4) and design/source-prototype/screens/client-auth.jsx `C218_LinkAccount`.
 *
 * The order is the whole security argument: **sign in first, link second.** Proving the
 * password proves the person at the keyboard owns the existing account, and the OAuth round
 * trip that `linkIdentity` starts proves the provider agrees they own the social one. Doing
 * it the other way round — linking on the strength of a matching email address — is how
 * accounts get taken over by anyone who can register that address at a provider.
 *
 * This is also why the screen exists at all rather than Supabase silently auto-linking: it
 * only does that when the existing address is already confirmed. An unconfirmed one is
 * exactly the case where a matching email proves nothing.
 *
 * Note this cannot be exercised end to end until real OAuth clients exist and
 * `[auth.external.*]` blocks are configured — `enable_manual_linking` is switched on in
 * supabase/config.toml for it, but no provider is.
 */
const LOGIN_FIELDS = ["email", "password"] as const;

export async function linkAccountAction(
  _prev: LinkAccountState,
  formData: FormData,
): Promise<LinkAccountState> {
  const email = String(formData.get("email") ?? "");
  const provider = formData.get("provider");

  const parsed = loginSchema.safeParse({ email, password: formData.get("password") });
  if (!parsed.success) {
    return { fieldErrors: flattenIssues(parsed.error, LOGIN_FIELDS), email };
  }

  if (!isOAuthProvider(provider)) {
    return { formError: authErrorByKind.unknown, email };
  }

  if (env.authChecksDisabledForLocalDev) {
    return { formError: authErrorByKind.not_configured, email };
  }

  const supabase = await createClient();

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (signInError) {
    // Same collapse as 2.1.1: never distinguish "no such account" from "wrong password".
    return { formError: mapAuthError(signInError), email };
  }

  const { data, error: linkError } = await supabase.auth.linkIdentity({
    provider,
    options: {
      redirectTo: `${env.siteUrl}/auth/callback?next=${encodeURIComponent("/dashboard")}`,
      skipBrowserRedirect: true,
    },
  });

  if (linkError || !data?.url) {
    console.warn("[auth] identity link failed", {
      provider,
      code: linkError?.code,
      status: linkError?.status,
    });
    // They ARE signed in now — the password worked. Losing the link is a disappointment,
    // not a dead end, so take them where they were going and let them retry from settings.
    redirect("/dashboard");
  }

  // `redirect` throws NEXT_REDIRECT, so it stays outside any try/catch.
  redirect(data.url);
}
