"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { callOnboarding } from "@/lib/onboarding/api";
import { COMPLETE_TEXT, type CompleteState } from "./state";

/**
 * Screen 2.1.14's one action: finish.
 *
 * This is the moment `platform_user.onboarding_completed_at` becomes non-null, which is
 * what stops the gate in the (client) layout routing every future sign-in back into the
 * wizard. `onboarding-step` is idempotent on completion — it only stamps a row whose
 * timestamp is still null — so a double-submit cannot rewrite when somebody joined.
 *
 * Unlike 2.1.9's skip, a failure here is NOT swallowed. The whole purpose of the button is
 * the write, so reporting a failure and offering the dashboard anyway is the honest
 * outcome; silently redirecting would leave them meeting this screen again tomorrow with
 * no idea why.
 */
export async function finishOnboardingAction(
  _prev: CompleteState,
  _formData: FormData,
): Promise<CompleteState> {
  const result = await callOnboarding("onboarding-step", { complete: true });

  if (!result.ok) {
    if (result.kind === "unauthenticated") redirect("/login");
    return { error: COMPLETE_TEXT.error };
  }

  // The gate reads onboarding_completed_at, so the cached shell has to go or the redirect
  // lands straight back here.
  revalidatePath("/", "layout");
  redirect("/dashboard");
}
