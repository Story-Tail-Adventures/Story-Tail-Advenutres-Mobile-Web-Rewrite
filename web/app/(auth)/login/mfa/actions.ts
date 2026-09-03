"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { authErrorByKind } from "@/lib/auth-errors";
import { env } from "@/lib/env";
import { safeNext } from "@/lib/safe-next";
import { createClient } from "@/lib/supabase/server";
import { flattenIssues } from "@/lib/validation/flatten";
import { MFA_FIELDS, mfaFormSchema } from "@/lib/validation/mfa";
import type { MfaChallengeState } from "./state";

/**
 * Screen 2.1.7 MFA Challenge — see docs/Screen-Inventory.md §2.1.7 and
 * design/source-prototype/screens/client-auth.jsx `C217_MFAChallenge`. P1.
 *
 * The factor is resolved from the session rather than taken from the form. A posted
 * `factorId` would be a request to be challenged on a factor of the caller's choosing,
 * which is the opposite of what a challenge is for.
 *
 * A wrong code returns a field error and nothing else: no attempt counter, no lockout
 * message, no "3 tries remaining". Supabase rate-limits verification server-side
 * (`token_verifications` in supabase/config.toml), and a countdown on screen mostly tells
 * an attacker how much room they have left.
 */
export async function mfaChallengeAction(
  _prev: MfaChallengeState,
  formData: FormData,
): Promise<MfaChallengeState> {
  const parsed = mfaFormSchema.safeParse({ code: formData.get("code") });
  if (!parsed.success) {
    return { fieldErrors: flattenIssues(parsed.error, MFA_FIELDS) };
  }

  if (env.authChecksDisabledForLocalDev) {
    return { formError: authErrorByKind.not_configured };
  }

  const supabase = await createClient();

  const { data: factors } = await supabase.auth.mfa.listFactors();
  const factor = (factors?.totp ?? []).find((f) => f.status === "verified");

  if (!factor) {
    // The session ended, or the factor was removed from another device while this form sat
    // open. Either way there is nothing here to answer.
    return { formError: authErrorByKind.session_expired };
  }

  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId: factor.id,
    code: parsed.data.code,
  });

  if (error) {
    // Never the code — it is a live credential for another few seconds.
    console.warn("[auth] mfa challenge failed", { code: error.code, status: error.status });

    if (error.code === "over_request_rate_limit") {
      return { formError: authErrorByKind.rate_limited };
    }
    return {
      fieldErrors: {
        code: ["That code didn't match. Codes roll over every 30 seconds — try the current one."],
      },
    };
  }

  // The session is aal2 now, which is what the proxy has been waiting for.
  revalidatePath("/", "layout");
  redirect(safeNext(formData.get("next")));
}
