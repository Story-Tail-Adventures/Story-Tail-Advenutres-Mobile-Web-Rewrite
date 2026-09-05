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
import { PROFILE_TEXT, type ProfileFormValues, type ProfileState } from "./state";

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
  const values = readValues(formData);

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

/**
 * Every input as a trimmed-of-nothing string; the schema does the trimming.
 *
 * RAW, and the form depends on that. Eleven of its thirteen inputs are uncontrolled, and
 * React does not re-apply `defaultValue` to a DOM node that is already mounted — so after a
 * failed submit those inputs show whatever the browser kept, not what this echoes back.
 * That is only invisible because the two agree. Normalise anything here — trim it,
 * uppercase it, turn `(305) 555-0184` into `+13055550184` — and the uncontrolled fields
 * will quietly keep showing the old text while the controlled ones update.
 */
function readValues(formData: FormData): ProfileFormValues {
  return {
    phone: text(formData.get("phone")),
    dateOfBirth: text(formData.get("dateOfBirth")),
    addressLine1: text(formData.get("addressLine1")),
    addressLine2: text(formData.get("addressLine2")),
    addressCity: text(formData.get("addressCity")),
    addressRegion: text(formData.get("addressRegion")),
    addressPostalCode: text(formData.get("addressPostalCode")),
    addressCountry: text(formData.get("addressCountry")),
    emergencyName: text(formData.get("emergencyName")),
    emergencyPhone: text(formData.get("emergencyPhone")),
    emergencyRelationship: text(formData.get("emergencyRelationship")),
    passportExpiry: text(formData.get("passportExpiry")),
    passportCountry: text(formData.get("passportCountry")),
  };
}

/** A File — from a multipart post that has no business here — is not a value. */
function text(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}
