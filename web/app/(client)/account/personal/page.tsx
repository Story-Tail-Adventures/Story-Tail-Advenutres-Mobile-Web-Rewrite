import type { Metadata } from "next";
import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";

import { ProfileForm } from "@/app/(onboarding)/onboarding/profile/ProfileForm";
import type { ProfileFormValues } from "@/app/(onboarding)/onboarding/profile/state";
import NextLink from "@/components/mui/NextLink";
import { Icon } from "@/components/ui/Icon";
import { env } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

import { AccountHeader } from "../AccountHeader";
import { saveAccountProfileAction } from "./actions";
import { PERSONAL } from "./content";

export const metadata: Metadata = { title: "Personal info" };

/** The legacy `.btn` (40px, 24px sides) and `.btn-text` (12px sides) boxes on MUI's Button. */
const BTN_SX = { minHeight: 40, px: "24px", gap: 1, whiteSpace: "nowrap" } as const;
const TEXT_BTN_SX = { minHeight: 40, px: "12px", gap: 1, whiteSpace: "nowrap" } as const;

const ROW_SX = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: 2,
} as const;

/**
 * Screen Inventory 2.5.2 — Personal Info Edit. §4.4 Pattern A.
 * Artboards: client-account.jsx `C252_PersonalInfo`, client-account-mobile.jsx
 * `M252_PersonalInfo`.
 *
 * Mounts 2.1.10's form, which turns out to be exactly the writable set: phone, date of
 * birth, mailing address, emergency contact, passport expiry and issuing country. The
 * wizard's own notes carry the shape of all of it — six structured address fields rather
 * than one line, E.164 phone normalisation, and no passport NUMBER until column-level
 * encryption exists.
 *
 * TWO FIELDS THE ARTBOARD DRAWS AS EDITABLE ARE READ-ONLY HERE, and both are write-path
 * gaps rather than design choices:
 *
 *  · NAME. No Edge Function writes `client.first_name` / `last_name` / `preferred_name` —
 *    they are set once at registration (2.1.2) and by `handle_new_user()`. PostgREST cannot
 *    write them either: `client` has a SELECT policy and no write policy. So the name is
 *    displayed with a note about how to change it, rather than offered in a box that would
 *    silently discard the edit.
 *  · EMAIL. Changing it is GoTrue's (`supabase.auth.updateUser`), and `account.email` is
 *    only mirrored back by a trigger that does not exist — `auth_bridge` has one for
 *    `AFTER INSERT` and one for `AFTER UPDATE OF email_confirmed_at`, and NONE for
 *    `AFTER UPDATE OF email`. Offering the edit before that trigger exists would leave the
 *    login address and the CRM record disagreeing, and `handle_user_email_confirmed()`
 *    matches pre-created clients on `account.email` — so the next person to register the old
 *    address could be adopted onto the wrong client row. See the Screen Inventory note.
 */
export default async function PersonalInfoPage() {
  const { identity, defaults } = await currentProfile();

  return (
    <div className="client-fill">
      <AccountHeader title={PERSONAL.title} sub={PERSONAL.subtitle} />

      <Box sx={{ mx: "auto", width: "100%", maxWidth: 672, p: { xs: 2, md: 3 } }}>
        {/* The legacy card-flat: outlined on surface.2 (components/ui/Card). */}
        <Card variant="outlined" sx={{ mb: 2.5, p: 2, bgcolor: "surface.2" }}>
          <Typography
            component="h2"
            variant="overline"
            sx={{ display: "block", lineHeight: 1.3, color: "text.secondary" }}
          >
            {PERSONAL.identityHeading}
          </Typography>
          <Box component="dl" sx={{ m: 0, mt: 1, display: "flex", flexDirection: "column", gap: 1 }}>
            <Box sx={ROW_SX}>
              <Typography component="dt" variant="caption" sx={{ color: "text.secondary" }}>
                {PERSONAL.nameLabel}
              </Typography>
              <Typography component="dd" variant="body2" sx={{ m: 0, textAlign: "right" }}>
                {identity.name || PERSONAL.notSet}
              </Typography>
            </Box>
            <Box sx={ROW_SX}>
              <Typography component="dt" variant="caption" sx={{ color: "text.secondary" }}>
                {PERSONAL.emailLabel}
              </Typography>
              <Typography component="dd" variant="body2" noWrap sx={{ m: 0, minWidth: 0, textAlign: "right" }}>
                {identity.email || PERSONAL.notSet}
              </Typography>
            </Box>
          </Box>
          <Typography
            component="p"
            variant="caption"
            sx={{ mt: 1.5, display: "flex", gap: 1, color: "text.secondary" }}
          >
            <Box component="span" sx={{ mt: 0.25, display: "inline-flex", flexShrink: 0 }}>
              <Icon name="info" size={15} />
            </Box>
            {PERSONAL.identityNote}
          </Typography>
        </Card>

        <ProfileForm
          defaults={defaults}
          action={saveAccountProfileAction}
          footer={
            <Box sx={{ mt: 3, display: "flex", gap: 1.5 }}>
              <MuiButton
                component={NextLink}
                href="/account"
                variant="text"
                color="primary"
                sx={TEXT_BTN_SX}
              >
                {PERSONAL.cancel}
              </MuiButton>
              <MuiButton
                type="submit"
                form="profile-form"
                variant="contained"
                color="primary"
                sx={{ ...BTN_SX, flex: 1 }}
              >
                {PERSONAL.save}
              </MuiButton>
            </Box>
          }
        />
      </Box>
    </div>
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
  addressCountry: "",
  emergencyName: "",
  emergencyPhone: "",
  emergencyRelationship: "",
  passportExpiry: "",
  passportCountry: "",
};

/**
 * The caller's own row, plus the address it points at.
 *
 * `client_self_select` and its column grant scope this; `mailing_address_id` is granted and
 * `address_self_select` covers the row it names. A read failure yields an empty form and a
 * logged code rather than an error page — an account screen that cannot show what is on file
 * should still let you set it.
 */
async function currentProfile(): Promise<{
  identity: { name: string; email: string };
  defaults: ProfileFormValues;
}> {
  const blank = { identity: { name: "", email: "" }, defaults: EMPTY };
  if (env.authChecksDisabledForLocalDev) return blank;

  const supabase = await createClient();
  const { data: client, error } = await supabase
    .from("client")
    // prettier-ignore
    .select(
      "first_name, last_name, preferred_name, email, phone, date_of_birth, emergency_contact, mailing_address_id",
    )
    .maybeSingle();

  if (error || !client) {
    if (error) console.warn("[account] personal info read failed", { code: error.code });
    return blank;
  }

  // The passport read is NOT optional, and leaving it out was silent data loss: this form
  // posts every field, `toProfilePayload` maps an empty expiry AND country to
  // `passport: null`, and `onboarding-profile` archives the existing `travel_document` row
  // when it receives null. So a screen that rendered the passport fields blank would wipe a
  // traveler's passport record on every save — including a save that only changed a phone
  // number. 2.1.10 reads it back for the same reason; this is its query.
  //
  // The NUMBER is not selected, and cannot be: `document_number_encrypted` is outside the
  // column grant, which is what stops even the ciphertext being selectable.
  const [{ data: address }, { data: passport }] = await Promise.all([
    client.mailing_address_id
      ? supabase
          .from("address")
          .select("line1, line2, city, region, postal_code, country")
          .eq("id", client.mailing_address_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("travel_document")
      .select("expires_on, issuing_country")
      .eq("kind", "passport")
      .is("companion_id", null)
      .is("archived_at", null)
      .maybeSingle(),
  ]);

  const emergency = (client.emergency_contact ?? {}) as Record<string, unknown>;
  const str = (value: unknown) => (typeof value === "string" ? value : "");

  return {
    identity: {
      name: [client.preferred_name ?? client.first_name, client.last_name]
        .filter(Boolean)
        .join(" "),
      email: client.email ?? "",
    },
    defaults: {
      phone: client.phone ?? "",
      dateOfBirth: client.date_of_birth ?? "",
      addressLine1: address?.line1 ?? "",
      addressLine2: address?.line2 ?? "",
      addressCity: address?.city ?? "",
      addressRegion: address?.region ?? "",
      addressPostalCode: address?.postal_code ?? "",
      addressCountry: address?.country ?? "",
      emergencyName: str(emergency.name),
      emergencyPhone: str(emergency.phone),
      emergencyRelationship: str(emergency.relationship),
      // The passport NUMBER is deliberately absent — see 2.1.10's note and the Screen
      // Inventory note at 2.5.5. Expiry and issuing country are what drive the reminder,
      // and they MUST round-trip: see the comment on the read above.
      passportExpiry: passport?.expires_on ?? "",
      passportCountry: passport?.issuing_country ?? "",
    },
  };
}
