import type { LoyaltyRow } from "@/lib/validation/preferences";
import type { PreferencesFormValues } from "@/app/(onboarding)/onboarding/preferences/state";

/**
 * Reads Screen 2.1.11 / 2.5.3's form post into the shape `parsePreferences` takes.
 *
 * EXTRACTED so the wizard and the account screen share one reader. It was private to the
 * wizard's actions module, and a `"use server"` file can only export async functions, so the
 * account route could not import it there. Two details below look like details and are not —
 * duplicating this by hand loses both:
 *
 *   · the row count is the LONGER of programs and numbers, so a mismatched post fails
 *     loudly instead of dropping a number;
 *   · `text()` rejects a `File`, which a multipart post would otherwise stringify into the
 *     field as "[object File]".
 */
export function readPreferencesForm(formData: FormData): PreferencesFormValues {
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
export function text(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}
