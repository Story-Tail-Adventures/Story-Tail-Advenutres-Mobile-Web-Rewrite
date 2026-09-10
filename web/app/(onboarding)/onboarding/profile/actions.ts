"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { callOnboarding } from "@/lib/onboarding/api";
import { WIZARD_STEPS } from "@/lib/onboarding/steps";
import { flattenIssues } from "@/lib/validation/flatten";
import {
  PROFILE_FIELDS,
  profileSchema,
  toProfilePayload,
} from "@/lib/validation/profile";
import { readProfileForm } from "@/lib/validation/profile-form";
import { PROFILE_TEXT, type ProfileState } from "./state";

/**
 * Screen 2.1.10 Profile Completion — the two ways off the screen.
 *
 * Both go to the same place. "Save & continue" writes through
 * supabase/functions/onboarding-profile, which is an Edge Function and not a PostgREST
 * write because `client` is a sensitive table under CLAUDE.md rule 3 and owes an
 * `audit_event` on every mutation. "Skip for now" writes nothing but the cursor, through
 * `onboarding-step` — calling the profile function with an empty body would spend an audit
 * row saying somebody changed nothing.
 *
 * The wizard cursor is what makes the skip meaningful: it moves to `preferences`, so
 * closing the tab here and signing in tomorrow resumes at 2.1.11 rather than starting over.
 */

/** 2.1.11 Preferences — the step after this one, read from the one shared list. */
const NEXT_ROUTE = WIZARD_STEPS[2].route;
const NEXT_STEP = WIZARD_STEPS[2].slug;

export async function saveProfileAction(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  // Echoed back on failure so a fumbled submit does not empty thirteen inputs. These are
  // the raw strings, not the normalised ones: showing somebody `+13055550184` after they
  // typed `(305) 555-0184` and got a different field wrong would be its own small insult.
  const values = readProfileForm(formData);

  const parsed = profileSchema.safeParse(values);
  if (!parsed.success) {
    return { fieldErrors: flattenIssues(parsed.error, PROFILE_FIELDS), values };
  }

  const result = await callOnboarding("onboarding-profile", {
    ...toProfilePayload(parsed.data),
    advance: true,
  });

  if (!result.ok) {
    if (result.kind === "unauthenticated") redirect("/login");
    // `detail` only ever comes from a 4xx problem+json body the function built from its own
    // `badRequest` messages — plain English, and more use than a generic failure. A 5xx
    // detail is dropped by `callOnboarding` before it reaches here.
    return { formError: result.detail ?? PROFILE_TEXT.formError, values };
  }

  // The gate in the (client) layout and the wizard layout both read the cursor, so the
  // cached shell has to go or the next navigation is decided by a stale answer.
  revalidatePath("/", "layout");
  redirect(NEXT_ROUTE);
}

export async function skipProfileAction(): Promise<void> {
  const result = await callOnboarding("onboarding-step", { step: NEXT_STEP });

  if (!result.ok && result.kind === "unauthenticated") redirect("/login");
  // Otherwise best effort, deliberately. If the cursor cannot be written the traveler still
  // reaches 2.1.11; the only cost is that an abandoned wizard resumes one step earlier than
  // it should. Holding somebody on a screen they just asked to skip, over a bookkeeping
  // write, would be the worse failure.
  revalidatePath("/", "layout");
  redirect(NEXT_ROUTE);
}


