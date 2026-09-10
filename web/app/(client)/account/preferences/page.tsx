import type { Metadata } from "next";
import Link from "next/link";

import { PreferencesForm } from "@/app/(onboarding)/onboarding/preferences/PreferencesForm";
import type { PreferencesFormValues } from "@/app/(onboarding)/onboarding/preferences/state";
import { env } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type { LoyaltyRow } from "@/lib/validation/preferences";

import { AccountHeader } from "../AccountHeader";
import { saveAccountPreferencesAction } from "./actions";
import { ACCOUNT_PREFERENCES } from "./content";

export const metadata: Metadata = { title: "Travel preferences" };

/**
 * Screen Inventory 2.5.3 — Travel Preferences Edit. §4.4 Pattern A, "same chip behavior as
 * 2.1.11".
 * Artboards: client-account.jsx `C253_PreferencesEdit`, client-account-mobile.jsx
 * `M253_PreferencesEdit`.
 *
 * REAL, and it mounts 2.1.11's form rather than growing a second one — which is what the
 * Screen Inventory note asks for. Three things are shared and one differs:
 *
 *   shared:  `PreferencesForm` (the chips, the loyalty repeater, the controlled
 *            "No restrictions" clearing rule that the CHECK constraint also enforces)
 *   shared:  `parsePreferences` — the closed vocabularies
 *   shared:  `readPreferencesForm` — extracted from the wizard's actions so both routes
 *            read a post the same way
 *   differs: the action omits `advance`, so the write lands without moving the onboarding
 *            cursor, and the footer is Save/Cancel instead of Save-and-continue/Skip.
 *
 * ONE CAVEAT the Edge Function records about itself: its read-then-write is not locked, and
 * `travel_preference` has no optimistic-concurrency column, so two tabs saving at once is
 * last-write-wins. That is unchanged from 2.1.11 and is not made worse here.
 */
export default async function AccountPreferencesPage() {
  return (
    <div className="client-fill">
      <AccountHeader
        title={ACCOUNT_PREFERENCES.title}
        sub={ACCOUNT_PREFERENCES.subtitle}
      />
      <div className="mx-auto w-full max-w-2xl p-4 md:p-6">
        <PreferencesForm
          defaults={await currentPreferences()}
          action={saveAccountPreferencesAction}
          footer={
            <div className="mt-6 flex gap-3">
              <Link href="/account" className="btn btn-text">
                {ACCOUNT_PREFERENCES.cancel}
              </Link>
              <button type="submit" form="preferences-form" className="btn btn-filled flex-1">
                {ACCOUNT_PREFERENCES.save}
              </button>
            </div>
          }
        />
      </div>
    </div>
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
 * What is already on file — 2.1.11's own prefill read, unchanged.
 *
 * `travel_preference_self_select` scopes it to the caller and the table has no column-level
 * revokes, so the whole row is readable by its owner. A read failure yields an empty form
 * and a logged code rather than an error page: on the wizard that was because its job is to
 * collect, and here it is because an account screen that cannot show you your preferences
 * should still let you set them.
 */
async function currentPreferences(): Promise<PreferencesFormValues> {
  if (env.authChecksDisabledForLocalDev) return EMPTY;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("travel_preference")
    // One string literal, not a concatenation: the generated client infers the row type from
    // the literal, and a `+` turns it into `string` and the result into an error type.
    // prettier-ignore
    .select(
      "preferred_destinations, travel_styles, dietary_restrictions, dietary_notes, accessibility_needs, accessibility_notes, loyalty_programs, budget_band, favorite_past_trips",
    )
    .maybeSingle();

  if (error) {
    console.warn("[account] preferences prefill read failed", { code: error.code });
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

/** `loyalty_programs` is jsonb; anything that is not the two-string shape is dropped. */
function readLoyalty(value: unknown): LoyaltyRow[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    if (typeof row !== "object" || row === null) return [];
    const { program, number } = row as Record<string, unknown>;
    if (typeof program !== "string" || typeof number !== "string") return [];
    return [{ program, number }];
  });
}
