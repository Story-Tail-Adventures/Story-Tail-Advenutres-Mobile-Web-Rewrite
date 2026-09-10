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

/**
 * `loyalty_programs` is jsonb with no CHECK on its shape, so what comes back is whatever was
 * written. Data-Model §6.2 documents `{program, number, tier}` and the Edge Function builds
 * exactly that — but a column with no constraint eventually holds something else, and this
 * one renders straight into an input.
 *
 * SHARED, and the sharing is the point. `onboarding-preferences` persists
 * `number: optionalText(row, "number") ?? null`, and `optionalText` maps "" to null — so
 * "typed a program, left the member number blank" is stored as
 * `{program: "AAdvantage", number: null}`. A reader that demands two strings drops that row
 * entirely, and because the function replaces `loyalty_programs` wholesale, the next save
 * deletes the program from the traveler's record. Coerce; drop only when BOTH halves are
 * empty. §2.5.3 hand-copied this once and lost exactly that case.
 */
export function readLoyalty(value: unknown): LoyaltyRow[] {
  if (!Array.isArray(value)) return [];
  const rows: LoyaltyRow[] = [];
  for (const entry of value) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) continue;
    const row = entry as Record<string, unknown>;
    const program = typeof row.program === "string" ? row.program : "";
    const number = typeof row.number === "string" ? row.number : "";
    if (program === "" && number === "") continue;
    rows.push({ program, number });
  }
  return rows;
}
