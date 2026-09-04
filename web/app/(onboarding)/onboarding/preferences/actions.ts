"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { callOnboarding } from "@/lib/onboarding/api";
import { WIZARD_STEPS } from "@/lib/onboarding/steps";
import {
  parsePreferences,
  type LoyaltyRow,
} from "@/lib/validation/preferences";
import {
  PREFERENCES_TEXT,
  type PreferencesFormValues,
  type PreferencesState,
} from "./state";

/**
 * Screen 2.1.11's two exits.
 *
 * "Save & continue" writes the one `travel_preference` row through
 * supabase/functions/onboarding-preferences — an Edge Function because the table grants
 * SELECT only and has no write policy, so a browser `.update()` would match zero rows and
 * report success. "Skip for now" moves the cursor and writes nothing: calling the
 * preferences function with an empty body would spend an `audit_event` row on a save that
 * changed nothing.
 */

/** 2.1.12 Companions — the step after this one, from the one shared list. */
const NEXT_ROUTE = WIZARD_STEPS[3].route;
const NEXT_STEP = WIZARD_STEPS[3].slug;

export async function savePreferencesAction(
  _prev: PreferencesState,
  formData: FormData,
): Promise<PreferencesState> {
  const values = readValues(formData);

  const parsed = parsePreferences(values);
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors, values };

  const result = await callOnboarding("onboarding-preferences", {
    ...parsed.payload,
    advance: true,
  });

  if (!result.ok) {
    if (result.kind === "unauthenticated") redirect("/login");
    return { formError: result.detail ?? PREFERENCES_TEXT.formError, values };
  }

  revalidatePath("/", "layout");
  redirect(NEXT_ROUTE);
}

export async function skipPreferencesAction(): Promise<void> {
  const result = await callOnboarding("onboarding-step", { step: NEXT_STEP });
  if (!result.ok && result.kind === "unauthenticated") redirect("/login");
  // Otherwise best effort: a lost cursor write costs a resumed wizard one step, and
  // holding somebody on a screen they asked to skip would cost more.
  revalidatePath("/", "layout");
  redirect(NEXT_ROUTE);
}

/**
 * The form as it was posted, before any rule runs.
 *
 * RAW, and the form depends on it for the same reason 2.1.10's does: the text inputs are
 * uncontrolled, and React does not re-apply `defaultValue` to a node that is already
 * mounted. Normalise anything here and a failed submit will show the old text.
 *
 * A chip group posts one entry per ticked box, so `getAll` is the whole story — an
 * untouched group posts nothing at all, which is correctly an empty array and not "leave
 * this alone". The repeater posts two parallel lists, paired by index; a row the browser
 * sent with neither half filled in is dropped by `parsePreferences`.
 */
function readValues(formData: FormData): PreferencesFormValues {
  const programs = formData.getAll("loyaltyProgram").map(text);
  const numbers = formData.getAll("loyaltyNumber").map(text);
  // The longer of the two, not just the programs. The rendered form always posts them in
  // pairs, but a hand-built post with one more number than program would otherwise lose
  // that number silently instead of failing with "which program is that number for?".
  const rowCount = Math.max(programs.length, numbers.length);
  const loyalty: LoyaltyRow[] = Array.from({ length: rowCount }, (_, index) => ({
    program: programs[index] ?? "",
    number: numbers[index] ?? "",
  }));

  return {
    destinations: formData.getAll("destinations").map(text),
    destinationOther: text(formData.get("destinationOther")),
    travelStyles: formData.getAll("travelStyles").map(text),
    dietary: formData.getAll("dietary").map(text),
    dietaryNotes: text(formData.get("dietaryNotes")),
    accessibility: formData.getAll("accessibility").map(text),
    accessibilityNotes: text(formData.get("accessibilityNotes")),
    loyalty,
    budgetBand: text(formData.get("budgetBand")),
    favoritePastTrips: text(formData.get("favoritePastTrips")),
  };
}

/** A File — from a multipart post that has no business here — is not a value. */
function text(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}
