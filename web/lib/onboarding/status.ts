import { env } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { WIZARD_ROUTE_BY_SLUG, WIZARD_STEPS } from "./steps";

/**
 * Where the signed-in traveler is in the onboarding wizard.
 *
 * Read through the caller's own session, not the service role: `platform_user_self_select`
 * (added in the auth-bridge migration) already lets somebody read their own row, so there
 * is no reason to reach past RLS for it.
 */

export type PlatformRole = "client" | "agent" | "admin";

export interface OnboardingStatus {
  /**
   * `platform_user.role`, verbatim.
   *
   * This read has always SELECTed it and thrown it away behind `isClient`. §3.2 needs the
   * value: the two shells route in opposite directions and `admin` is a third answer, not
   * "not a client" — an admin may legally carry neither a client_id nor an agent_id, so
   * every read on either side returns nothing for them.
   */
  role: PlatformRole;
  /** False for an agent or admin — they have no wizard. Derived, so existing callers stand. */
  isClient: boolean;
  /** Null while the wizard is unfinished. */
  completedAt: string | null;
  /** Which step to resume on, or null before it starts and after it finishes. */
  step: string | null;
}

/**
 * `user_role` has three values and the column is NOT NULL, so anything else is a schema
 * change that has not reached this file. Fall back to `client`, which is the least
 * privileged shell, rather than widening the type to string.
 */
function asRole(value: string): PlatformRole {
  return value === "agent" || value === "admin" ? value : "client";
}

/**
 * The route each cursor value belongs on.
 *
 * Derived from [WIZARD_STEPS] rather than written out again: the rail, the progress bars
 * and this gate all have to agree about the wizard's shape, and a second list is how they
 * stop agreeing.
 */
export const ONBOARDING_ROUTE = WIZARD_ROUTE_BY_SLUG;

export const WELCOME_ROUTE = WIZARD_STEPS[0].route;

export async function onboardingStatus(): Promise<OnboardingStatus | null> {
  // Before `supabase start` has ever run there is nothing to ask. Returning null makes the
  // gate fall open rather than 500 on every protected route, matching how
  // `updateSession` and the (client) layout already treat this case.
  if (env.authChecksDisabledForLocalDev) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("platform_user")
    .select("role, onboarding_step, onboarding_completed_at")
    .maybeSingle();

  if (error || !data) {
    // A read failure must not lock somebody out of their own dashboard. Fail open and log
    // the code only — never the row.
    if (error) console.warn("[onboarding] status read failed", { code: error.code });
    return null;
  }

  const role = asRole(data.role);
  return {
    role,
    isClient: role === "client",
    completedAt: data.onboarding_completed_at,
    step: data.onboarding_step,
  };
}

/**
 * Where an unfinished wizard should send someone, or null to let them through.
 *
 * Pure, so the routing rule is testable without a Supabase client — the same reason
 * `authRedirectFor` was split out of `updateSession`.
 */
export function onboardingRedirectFor(
  status: OnboardingStatus | null,
): string | null {
  if (!status) return null;
  if (!status.isClient) return null;
  if (status.completedAt) return null;
  // Started but unfinished: resume where they stopped. Never started: the welcome screen.
  return status.step ? (ONBOARDING_ROUTE[status.step] ?? WELCOME_ROUTE) : WELCOME_ROUTE;
}
