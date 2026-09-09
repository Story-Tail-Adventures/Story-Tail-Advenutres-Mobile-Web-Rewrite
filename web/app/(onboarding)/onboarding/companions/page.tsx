// Screen 2.1.12 Travel Companions / Household Setup — see docs/Screen-Inventory.md §2.1.12
// (Pattern G, §4.4) and design/source-prototype/screens/client-auth.jsx `C2112_Companions`
// + client-auth-mobile.jsx `M2112_Companions`. P1.
//
// Step 4 of 6. Name the people you usually travel with, so Gyasi has their traveler details
// instead of asking again on every booking. Optional, like every step before it.
import type { Metadata } from "next";
import { OnboardingShell } from "@/components/onboarding/OnboardingShell";
import { env } from "@/lib/env";
import { wizardStepIndex } from "@/lib/onboarding/steps";
import { createClient } from "@/lib/supabase/server";
import { CompanionsList } from "./CompanionsList";
import { COMPANIONS_TEXT, type CompanionRow } from "./state";

export const metadata: Metadata = {
  title: COMPANIONS_TEXT.metaTitle,
  description: COMPANIONS_TEXT.metaDescription,
  robots: { index: false, follow: false },
};

const STEP_INDEX = wizardStepIndex("companions");

export default async function CompanionsPage() {
  return (
    <OnboardingShell
      stepIndex={STEP_INDEX}
      title={COMPANIONS_TEXT.title}
      sub={COMPANIONS_TEXT.sub}
    >
      <CompanionsList {...await currentCompanions()} />
    </OnboardingShell>
  );
}

/**
 * The household already on file.
 *
 * Read through the caller's own session and `companion_self_select`. The column list is
 * explicit and short of the full row on purpose: `passport_number_encrypted` is outside the
 * grant `20260903190707` re-issued to `authenticated`, and Postgres checks column privilege
 * on ANY reference — so selecting it, or even asking whether it is null, is denied outright.
 * That is another reason there is no passport-number field on this screen.
 *
 * A read failure yields an empty list and a logged code. Somebody who cannot see their
 * household can still add to it, and the Edge Function is what refuses a duplicate.
 */
interface CompanionsRead {
  companions: CompanionRow[];
  /** True when the read itself failed — distinct from "you have not added anybody". */
  readFailed: boolean;
}

async function currentCompanions(): Promise<CompanionsRead> {
  if (env.authChecksDisabledForLocalDev)
    return { companions: [], readFailed: false };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companion")
    .select(
      "id, first_name, last_name, relationship, date_of_birth, passport_expiry, passport_country",
    )
    // Removed travelers are archived rather than deleted (Data-Model §20.1), so the list
    // has to say so or a Remove looks like it did nothing.
    .is("archived_at", null)
    .order("created_at", { ascending: true });

  if (error) {
    console.warn("[onboarding] companions read failed", { code: error.code });
    // Told, not swallowed. An empty list and a failed read look identical on screen, and
    // the second one invites somebody to re-add a household they already have.
    return { companions: [], readFailed: true };
  }

  return {
    companions: (data ?? []).map((row) => ({
      id: row.id,
      firstName: row.first_name,
      lastName: row.last_name,
      relationship: row.relationship ?? "",
      dateOfBirth: row.date_of_birth ?? "",
      passportExpiry: row.passport_expiry ?? "",
      passportCountry: row.passport_country ?? "",
    })),
    readFailed: false,
  };
}
