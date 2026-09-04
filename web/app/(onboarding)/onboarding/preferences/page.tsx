// Screen 2.1.11 Travel Preferences Capture — see docs/Screen-Inventory.md §2.1.11
// (Pattern G, §4.4) and design/source-prototype/screens/client-auth.jsx
// `C2111_PreferencesCapture` + client-auth-mobile.jsx `M2111_PreferencesCapture`. P1.
//
// Step 3 of 6, and one database row: `travel_preference`, 1:1 with `client`. Everything on
// it is optional. What it buys is Gyasi not asking the same six questions on every trip.
import type { Metadata } from "next";
import { OnboardingShell } from "@/components/onboarding/OnboardingShell";
import { env } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type { LoyaltyRow } from "@/lib/validation/preferences";
import { wizardStepIndex } from "@/lib/onboarding/steps";
import { PreferencesForm } from "./PreferencesForm";
import { PREFERENCES_TEXT, type PreferencesFormValues } from "./state";

export const metadata: Metadata = {
  title: PREFERENCES_TEXT.metaTitle,
  description: PREFERENCES_TEXT.metaDescription,
  robots: { index: false, follow: false },
};

const STEP_INDEX = wizardStepIndex("preferences");

export default async function PreferencesPage() {
  return (
    <OnboardingShell
      stepIndex={STEP_INDEX}
      title={PREFERENCES_TEXT.title}
      sub={PREFERENCES_TEXT.sub}
    >
      <PreferencesForm defaults={await currentPreferences()} />
    </OnboardingShell>
  );
}

const EMPTY: PreferencesFormValues = {
  destinations: [],
  destinationOther: "",
  travelStyles: [],
  dietary: [],
  dietaryNotes: "",
  accessibility: [],
  accessibilityNotes: "",
  loyalty: [],
  budgetBand: "",
  favoritePastTrips: "",
};

/**
 * What is already on file.
 *
 * Read through the caller's own session: `travel_preference_self_select` (20260903190707)
 * exists so a traveler can read their own row, and unlike `travel_document` this table has
 * no column-level revokes — the whole row is readable by its owner. No service role.
 *
 * A read failure yields an empty form and a logged code, never an error page. The wizard's
 * job is to collect.
 */
async function currentPreferences(): Promise<PreferencesFormValues> {
  if (env.authChecksDisabledForLocalDev) return EMPTY;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("travel_preference")
    // One string literal, not a concatenation: the generated client infers the row type
    // from the literal, and a `+` turns it into `string` and the result into an error type.
    // prettier-ignore
    .select(
      "preferred_destinations, travel_styles, dietary_restrictions, dietary_notes, accessibility_needs, accessibility_notes, loyalty_programs, budget_band, favorite_past_trips",
    )
    .maybeSingle();

  if (error) {
    console.warn("[onboarding] preferences prefill read failed", {
      code: error.code,
    });
    return EMPTY;
  }
  if (!data) return EMPTY;

  return {
    destinations: data.preferred_destinations ?? [],
    destinationOther: "",
    travelStyles: data.travel_styles ?? [],
    dietary: data.dietary_restrictions ?? [],
    dietaryNotes: data.dietary_notes ?? "",
    accessibility: data.accessibility_needs ?? [],
    accessibilityNotes: data.accessibility_notes ?? "",
    loyalty: readLoyalty(data.loyalty_programs),
    budgetBand: data.budget_band ?? "",
    favoritePastTrips: data.favorite_past_trips ?? "",
  };
}

/**
 * `loyalty_programs` is jsonb with no CHECK on its shape, so what comes back is whatever
 * was written. Data-Model §6.2 documents `{program, number, tier}` and the Edge Function
 * builds exactly that, but a column with no constraint eventually holds something else —
 * and this one renders straight into an input.
 */
function readLoyalty(value: unknown): LoyaltyRow[] {
  if (!Array.isArray(value)) return [];
  const rows: LoyaltyRow[] = [];
  for (const entry of value) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry))
      continue;
    const row = entry as Record<string, unknown>;
    const program = typeof row.program === "string" ? row.program : "";
    const number = typeof row.number === "string" ? row.number : "";
    if (program === "" && number === "") continue;
    rows.push({ program, number });
  }
  return rows;
}
