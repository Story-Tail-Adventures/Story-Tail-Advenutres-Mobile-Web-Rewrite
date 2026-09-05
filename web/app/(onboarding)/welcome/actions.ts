"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { callOnboarding } from "@/lib/onboarding/api";
import { WELCOME_TEXT, type WelcomeState } from "./state";

/**
 * Screen 2.1.9's two exits.
 *
 * "Get started" sets the cursor to the first step so an abandoned wizard resumes there
 * rather than back at this screen. "Skip the tour" ends the wizard outright — Screen
 * Inventory §2.1.9 offers skipping as a real choice, and somebody who declines must not be
 * asked again on every sign-in.
 */

export async function beginOnboardingAction(): Promise<void> {
  // Best effort. If the cursor cannot be set the wizard still works — they simply resume
  // from the welcome screen next time, which is where they are now anyway. Holding
  // somebody on this page over a bookkeeping write would be the worse failure.
  await callOnboarding("onboarding-step", { step: "profile" });
  redirect("/onboarding/profile");
}

export async function skipOnboardingAction(
  _prev: WelcomeState,
  _formData: FormData,
): Promise<WelcomeState> {
  const result = await callOnboarding("onboarding-step", { complete: true });

  if (!result.ok) {
    if (result.kind === "unauthenticated") redirect("/login");
    // Reported rather than swallowed: if this silently failed they would be greeted by
    // this screen again on every single sign-in, with no idea why.
    return { error: WELCOME_TEXT.skipError };
  }

  // The gate in the (client) layout reads onboarding_completed_at, so the cached shell has
  // to go or the redirect lands right back here.
  revalidatePath("/", "layout");
  redirect("/dashboard");
}
