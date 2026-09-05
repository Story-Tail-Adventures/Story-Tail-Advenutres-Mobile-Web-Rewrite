/**
 * The onboarding wizard's cursor — Screen Inventory §2.1.9 through §2.1.14.
 *
 * Two callers, two meanings:
 *
 *   { step: "profile" }   2.1.9's "Get started" — the wizard has begun, resume here
 *   { complete: true }    2.1.9's "Skip the tour" AND 2.1.14's "Continue to my dashboard"
 *
 * Skipping and finishing are the same write on purpose. Screen Inventory §2.1.9 offers
 * "skip to dashboard" as a real choice, not a deferral, and a traveler who declines the
 * wizard must not be asked again on every sign-in. What they skipped is still visible —
 * their profile is simply empty, and 2.1.10 has a second entry point in account settings.
 *
 * WHY AN EDGE FUNCTION. `platform_user` has SELECT-only RLS. That is not incidental: the
 * table carries `role`, so a self-service UPDATE policy would let a client make themselves
 * an agent. A browser `.update()` here matches zero rows and returns 204 — it would look
 * like it worked, and the traveler would be re-greeted on every sign-in forever.
 *
 * No audit_event. `platform_user` is not one of rule 3's sensitive tables and this records
 * a UI position, not a change to anyone's data. The one write here that WOULD deserve an
 * audit row — repointing `client_id` at a different traveler — is invite redemption, and
 * that lives in its own function.
 */
import { handlePreflight, corsHeaders } from "../_shared/cors.ts";
import { requireUser } from "../_shared/auth.ts";
import { badRequest, problem } from "../_shared/problem.ts";
import {
  advanceOnboarding,
  isOnboardingStep,
  onboardingDb,
  readJson,
  requireClientId,
} from "../_shared/onboarding.ts";

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  try {
    if (req.method !== "POST") throw badRequest("Use POST.");

    const ctx = await requireUser(req);
    // Not for the client id — this writes platform_user — but for the role check: an
    // agent has no onboarding wizard, and letting one move a cursor that does not exist
    // would quietly corrupt their row.
    requireClientId(ctx);

    const body = await readJson(req);
    const db = onboardingDb();

    if (body.complete === true) {
      await advanceOnboarding(db, ctx.platformUserId, null, { complete: true });
      return json({ ok: true, completed: true });
    }

    if (!isOnboardingStep(body.step)) {
      throw badRequest("Send either a known step or complete: true.");
    }

    await advanceOnboarding(db, ctx.platformUserId, body.step);
    return json({ ok: true, step: body.step });
  } catch (err) {
    return problem(err);
  }
});

function json(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
