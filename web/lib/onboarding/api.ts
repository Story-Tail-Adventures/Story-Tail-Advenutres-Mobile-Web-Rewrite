import { env } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

/**
 * Calling an onboarding Edge Function from a server action.
 *
 * Every §2.1.9–2.1.14 write goes through one of these functions rather than through
 * PostgREST, because the tables they touch have SELECT-only RLS and no write policy — see
 * supabase/functions/_shared/onboarding.ts for why each one is that way. A browser or
 * server-action `.update()` would match zero rows and return 204: it would look like it
 * worked and change nothing.
 *
 * The caller's own access token is forwarded, never the service-role key. The function
 * verifies it and resolves the traveler from it; the service role lives on the far side of
 * that boundary and never enters `web/` (Data-Model §21.2).
 */

export type OnboardingFunction =
  | "onboarding-step"
  | "onboarding-profile"
  | "onboarding-preferences"
  | "onboarding-companions"
  | "onboarding-connect";

export type OnboardingResult =
  | { ok: true; data: unknown }
  | { ok: false; kind: "unauthenticated" | "rejected" | "unavailable"; detail?: string };

/**
 * POST to an onboarding function.
 *
 * Failure comes back as a value rather than a throw, because every caller is a server
 * action that has to turn it into form state. The three kinds map to the three things a
 * screen can usefully do: send them to sign in, show what was wrong with the input, or say
 * it did not work and offer to try again.
 *
 * `detail` is only ever populated from a 4xx problem+json body, which the functions build
 * from `badRequest(...)` messages we wrote. A 5xx detail is deliberately dropped — those
 * carry whatever Postgres said, and that is for the function log, not a traveler.
 */
export async function callOnboarding(
  fn: OnboardingFunction,
  body: Record<string, unknown>,
): Promise<OnboardingResult> {
  if (env.authChecksDisabledForLocalDev) {
    return { ok: false, kind: "unavailable" };
  }

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return { ok: false, kind: "unauthenticated" };
  }

  let response: Response;
  try {
    response = await fetch(`${env.supabaseUrl}/functions/v1/${fn}`, {
      method: "POST",
      headers: {
        apikey: env.supabaseAnonKey,
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (cause) {
    // The function never answered. Never log the body — it is the traveler's profile.
    console.warn("[onboarding] request failed", { fn, cause: String(cause) });
    return { ok: false, kind: "unavailable" };
  }

  if (response.ok) {
    return { ok: true, data: await response.json().catch(() => ({})) };
  }

  if (response.status === 401 || response.status === 403) {
    return { ok: false, kind: "unauthenticated" };
  }

  if (response.status >= 400 && response.status < 500) {
    const detail = await problemDetail(response);
    return { ok: false, kind: "rejected", detail };
  }

  console.warn("[onboarding] function failed", { fn, status: response.status });
  return { ok: false, kind: "unavailable" };
}

/** The `detail` from an RFC 7807 body, if it carried one. */
async function problemDetail(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    return typeof body.detail === "string" ? body.detail : undefined;
  } catch {
    return undefined;
  }
}
