// Screen 2.1.10 Profile Completion — see docs/Screen-Inventory.md §2.1.10 (Pattern G,
// §4.4) and design/source-prototype/screens/client-auth.jsx `C2110_ProfileCompletion` +
// client-auth-mobile.jsx `M2110_ProfileCompletion`. P1.
//
// Step 2 of 6. Everything it asks for is optional and the step itself is skippable; what it
// buys is the paperwork Gyasi would otherwise chase by email before a booking.
import type { Metadata } from "next";
import { OnboardingShell } from "@/components/onboarding/OnboardingShell";
import { DEFAULT_COUNTRY } from "@/lib/countries";
import { env } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { wizardStepIndex } from "@/lib/onboarding/steps";
import { ProfileForm } from "./ProfileForm";
import { PROFILE_TEXT, type ProfileFormValues } from "./state";

export const metadata: Metadata = {
  title: PROFILE_TEXT.metaTitle,
  description: PROFILE_TEXT.metaDescription,
  robots: { index: false, follow: false },
};

const STEP_INDEX = wizardStepIndex("profile");

export default async function ProfilePage() {
  return (
    <OnboardingShell
      stepIndex={STEP_INDEX}
      title={PROFILE_TEXT.title}
      sub={PROFILE_TEXT.sub}
    >
      <ProfileForm defaults={await currentProfile()} />
    </OnboardingShell>
  );
}

const EMPTY: ProfileFormValues = {
  phone: "",
  dateOfBirth: "",
  addressLine1: "",
  addressLine2: "",
  addressCity: "",
  addressRegion: "",
  addressPostalCode: "",
  addressCountry: DEFAULT_COUNTRY,
  emergencyName: "",
  emergencyPhone: "",
  emergencyRelationship: "",
  passportExpiry: "",
  passportCountry: "",
};

/**
 * What is already on file, so a wizard resumed on this step shows what is there rather than
 * an empty form. Jordan in the seed already has a phone and an address; a form that came up
 * blank would read as those having been lost.
 *
 * Read through the caller's own session and RLS, never the service role: `client_self_select`,
 * `address_self_select` and `travel_document_self_select` (20260903190707) exist precisely so
 * a traveler can read their own record back. The passport NUMBER is not among the columns
 * `authenticated` is granted — that grant list is what stops even the ciphertext being
 * selectable — which is another reason there is no number field on this screen.
 *
 * A read failure yields an empty form rather than an error page. The wizard's job is to
 * collect, and an empty box is a recoverable state; a 500 on step two is not.
 */
async function currentProfile(): Promise<ProfileFormValues> {
  if (env.authChecksDisabledForLocalDev) return EMPTY;

  const supabase = await createClient();

  const { data: client, error: clientError } = await supabase
    .from("client")
    .select("phone, date_of_birth, emergency_contact, mailing_address_id")
    .maybeSingle();
  if (clientError) warn("client", clientError);
  if (!client) return EMPTY;

  const [
    { data: address, error: addressError },
    { data: passport, error: passportError },
  ] = await Promise.all([
    client.mailing_address_id
      ? supabase
          .from("address")
          .select("line1, line2, city, region, postal_code, country")
          .eq("id", client.mailing_address_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("travel_document")
      .select("expires_on, issuing_country")
      .eq("kind", "passport")
      .is("companion_id", null)
      .is("archived_at", null)
      .maybeSingle(),
  ]);
  if (addressError) warn("address", addressError);
  if (passportError) warn("travel_document", passportError);

  const emergency = readEmergencyContact(client.emergency_contact);

  return {
    phone: client.phone ?? "",
    dateOfBirth: client.date_of_birth ?? "",
    addressLine1: address?.line1 ?? "",
    addressLine2: address?.line2 ?? "",
    addressCity: address?.city ?? "",
    addressRegion: address?.region ?? "",
    addressPostalCode: address?.postal_code ?? "",
    addressCountry: address?.country ?? DEFAULT_COUNTRY,
    emergencyName: emergency.name,
    emergencyPhone: emergency.phone,
    emergencyRelationship: emergency.relationship,
    passportExpiry: passport?.expires_on ?? "",
    passportCountry: passport?.issuing_country ?? "",
  };
}

/**
 * The code only, never the row.
 *
 * Falling back to an empty form is the right behaviour — the wizard's job is to collect,
 * and a blank box is recoverable where a 500 on step two is not — but doing it silently
 * means an RLS misconfiguration looks exactly like a traveler who has filled nothing in.
 * The same shape `onboardingStatus` uses for the same reason.
 */
function warn(table: string, error: { code?: string }): void {
  console.warn("[onboarding] profile prefill read failed", {
    table,
    code: error.code,
  });
}

/**
 * `client.emergency_contact` is jsonb with no CHECK on its shape, so what comes back is
 * whatever was written — checked here rather than trusted. Data-Model §6.1 documents
 * `{name, phone, relationship}` and the Edge Function builds exactly that, but a column
 * with no constraint is a column that will eventually hold something else.
 */
function readEmergencyContact(value: unknown): {
  name: string;
  phone: string;
  relationship: string;
} {
  const empty = { name: "", phone: "", relationship: "" };
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return empty;

  // Sound because of the guard above: this narrows `Json` to the object shape `str` then
  // checks key by key.
  const contact = value as Record<string, unknown>;
  const str = (key: string) =>
    typeof contact[key] === "string" ? contact[key] : "";
  return {
    name: str("name"),
    phone: str("phone"),
    relationship: str("relationship"),
  };
}
