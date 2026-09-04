"use client";

import { useActionState, useState } from "react";
import { OnboardingActions } from "@/components/onboarding/OnboardingActions";
import { Alert } from "@/components/ui/Alert";
import { Field } from "@/components/ui/Field";
import { SelectField } from "@/components/ui/Select";
import {
  COUNTRIES,
  DEFAULT_COUNTRY,
  usesUsAddressLabels,
} from "@/lib/countries";
import { PROFILE_LIMITS, isRealDate, todayIso } from "@/lib/validation/profile";
import { saveProfileAction, skipProfileAction } from "./actions";
import {
  PROFILE_TEXT,
  initialProfileState,
  type ProfileFormValues,
} from "./state";

/**
 * Screen 2.1.10's form (design: `C2110_ProfileCompletion` / `M2110_ProfileCompletion`).
 *
 * TWO DEVIATIONS FROM THE PROTOTYPE, both because it cannot be built as drawn.
 *
 * 1. The single free-text "Mailing address" input is six structured fields. There is no
 *    free-text address column anywhere in the schema: `client.mailing_address_id` points at
 *    `address`, whose `line1`, `city` and `country` are NOT NULL and whose country is
 *    `char(2)`. Persisting one string would mean parsing it, and an address parser fails the
 *    first time somebody types an apartment number.
 * 2. There is no passport-number field. See the note on `hintPassport` in state.ts.
 *
 * The groups are `<fieldset>`s because they are genuinely groups — an error like "an
 * address needs a city" belongs to the set, and a `<legend>` is how a screen reader hears
 * which set each input is in.
 */

const FORM_ID = "profile-form";
const RELATIONSHIP_LIST_ID = "relationship-suggestions";

const COUNTRY_OPTIONS = COUNTRIES.map((country) => ({
  value: country.code,
  label: country.name,
}));

export function ProfileForm({ defaults }: { defaults: ProfileFormValues }) {
  const [state, formAction, saving] = useActionState(
    saveProfileAction,
    initialProfileState,
  );
  const shown = state.values ?? defaults;

  // Controlled, because the region and postal-code labels follow it: a Canadian typing
  // their postal code into a box labelled ZIP is being told the form was not built for them.
  const [country, setCountry] = useState(
    shown.addressCountry || DEFAULT_COUNTRY,
  );
  const usLabels = usesUsAddressLabels(country);

  // Live, because the useful moment for this warning is while somebody is looking at the
  // date they just typed. It never blocks the save — an expired passport is exactly the
  // record we want on file, since it is what makes the renewal reminder fire.
  const [passportExpiry, setPassportExpiry] = useState(shown.passportExpiry);
  const expired = isRealDate(passportExpiry) && passportExpiry < todayIso();

  const errors = state.fieldErrors ?? {};
  const first = (key: keyof typeof errors) => errors[key]?.[0];

  return (
    <>
      <form id={FORM_ID} action={formAction} noValidate>
        {/* Everything inert while the save is in flight — the same guard RegisterForm and
            JoinForm use. Without it the Enter key in any of thirteen inputs fires a second
            submit, and this endpoint writes an `audit_event` on every call. */}
        <fieldset
          disabled={saving}
          className="m-0 flex flex-col gap-5 border-0 p-0"
        >
          {state.formError && <Alert tone="error">{state.formError}</Alert>}

          <p className="t-body-s m-0 text-on-surface-variant">
            {PROFILE_TEXT.optionalNote}
          </p>

          <div className="grid gap-3 md:grid-cols-2">
            <Field
              id="phone"
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              label={PROFILE_TEXT.labelPhone}
              hint={PROFILE_TEXT.hintPhone}
              error={first("phone")}
              defaultValue={shown.phone}
            />
            <Field
              id="dateOfBirth"
              name="dateOfBirth"
              type="date"
              autoComplete="bday"
              label={PROFILE_TEXT.labelDob}
              hint={PROFILE_TEXT.hintDob}
              error={first("dateOfBirth")}
              defaultValue={shown.dateOfBirth}
              max={todayIso()}
            />
          </div>

          <Group
            legend={PROFILE_TEXT.groupAddress}
            error={first("address")}
            errorId="address-error"
          >
            <div className="grid gap-3 md:grid-cols-2">
              <div className="md:col-span-2">
                <Field
                  id="addressLine1"
                  name="addressLine1"
                  // The group error also describes this field. See `describedBy` on Field:
                  // a fieldset's own aria-describedby never reaches the controls inside it.
                  describedBy={first("address") ? "address-error" : undefined}
                  autoComplete="address-line1"
                  maxLength={PROFILE_LIMITS.addressLine}
                  label={PROFILE_TEXT.labelAddressLine1}
                  error={first("addressLine1")}
                  defaultValue={shown.addressLine1}
                />
              </div>
              <div className="md:col-span-2">
                <Field
                  id="addressLine2"
                  name="addressLine2"
                  autoComplete="address-line2"
                  maxLength={PROFILE_LIMITS.addressLine}
                  label={PROFILE_TEXT.labelAddressLine2}
                  error={first("addressLine2")}
                  defaultValue={shown.addressLine2}
                />
              </div>
              <Field
                id="addressCity"
                name="addressCity"
                autoComplete="address-level2"
                maxLength={PROFILE_LIMITS.city}
                label={PROFILE_TEXT.labelAddressCity}
                error={first("addressCity")}
                defaultValue={shown.addressCity}
              />
              <Field
                id="addressRegion"
                name="addressRegion"
                autoComplete="address-level1"
                maxLength={PROFILE_LIMITS.region}
                label={
                  usLabels
                    ? PROFILE_TEXT.labelAddressRegionUs
                    : PROFILE_TEXT.labelAddressRegion
                }
                error={first("addressRegion")}
                defaultValue={shown.addressRegion}
              />
              <Field
                id="addressPostalCode"
                name="addressPostalCode"
                autoComplete="postal-code"
                maxLength={PROFILE_LIMITS.postalCode}
                label={
                  usLabels
                    ? PROFILE_TEXT.labelAddressPostalUs
                    : PROFILE_TEXT.labelAddressPostal
                }
                error={first("addressPostalCode")}
                defaultValue={shown.addressPostalCode}
              />
              <SelectField
                id="addressCountry"
                name="addressCountry"
                autoComplete="country"
                label={PROFILE_TEXT.labelAddressCountry}
                options={COUNTRY_OPTIONS}
                error={first("addressCountry")}
                value={country}
                onChange={(event) => setCountry(event.target.value)}
              />
            </div>
          </Group>

          <Group
            legend={PROFILE_TEXT.groupEmergency}
            hint={PROFILE_TEXT.hintEmergency}
            error={first("emergencyContact")}
            errorId="emergency-error"
          >
            <div className="grid gap-3 md:grid-cols-3">
              <Field
                id="emergencyName"
                name="emergencyName"
                describedBy={
                  first("emergencyContact") ? "emergency-error" : undefined
                }
                autoComplete="off"
                maxLength={PROFILE_LIMITS.emergencyName}
                label={PROFILE_TEXT.labelEmergencyName}
                error={first("emergencyName")}
                defaultValue={shown.emergencyName}
              />
              <Field
                id="emergencyPhone"
                name="emergencyPhone"
                type="tel"
                inputMode="tel"
                autoComplete="off"
                label={PROFILE_TEXT.labelEmergencyPhone}
                error={first("emergencyPhone")}
                defaultValue={shown.emergencyPhone}
              />
              <Field
                id="emergencyRelationship"
                name="emergencyRelationship"
                autoComplete="off"
                list={RELATIONSHIP_LIST_ID}
                maxLength={PROFILE_LIMITS.emergencyRelationship}
                label={PROFILE_TEXT.labelEmergencyRelationship}
                error={first("emergencyRelationship")}
                defaultValue={shown.emergencyRelationship}
              />
              {/* Suggestions, not a menu: "Sister-in-law" and "Neighbor" are real answers and
                an enum would refuse them. */}
              <datalist id={RELATIONSHIP_LIST_ID}>
                {PROFILE_TEXT.relationshipSuggestions.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
            </div>
          </Group>

          <Group
            legend={PROFILE_TEXT.groupPassport}
            note={PROFILE_TEXT.groupPassportOptional}
            hint={PROFILE_TEXT.hintPassport}
            error={first("passport")}
            errorId="passport-error"
          >
            <div className="flex flex-col gap-3">
              {expired && (
                <Alert tone="warning">
                  {PROFILE_TEXT.passportExpiredWarning}
                </Alert>
              )}
              <div className="grid gap-3 md:grid-cols-2">
                <Field
                  id="passportExpiry"
                  name="passportExpiry"
                  describedBy={first("passport") ? "passport-error" : undefined}
                  type="date"
                  label={PROFILE_TEXT.labelPassportExpiry}
                  error={first("passportExpiry")}
                  value={passportExpiry}
                  onChange={(event) => setPassportExpiry(event.target.value)}
                />
                <SelectField
                  id="passportCountry"
                  name="passportCountry"
                  label={PROFILE_TEXT.labelPassportCountry}
                  options={COUNTRY_OPTIONS}
                  placeholder={PROFILE_TEXT.countryPlaceholder}
                  error={first("passportCountry")}
                  defaultValue={shown.passportCountry}
                />
              </div>
            </div>
          </Group>
        </fieldset>
      </form>

      <OnboardingActions
        formId={FORM_ID}
        saving={saving}
        primaryLabel={PROFILE_TEXT.primaryCta}
        pendingLabel={PROFILE_TEXT.pending}
        secondaryLabel={PROFILE_TEXT.secondaryCta}
        secondaryA11yLabel={PROFILE_TEXT.secondaryCtaA11y}
        secondaryPendingLabel={PROFILE_TEXT.secondaryPending}
        skipAction={skipProfileAction}
      />
    </>
  );
}

/**
 * One of the three groups.
 *
 * The group error is announced twice over, because one channel is not enough. `role="alert"`
 * reads it out when it appears — the useful moment, right after a rejected submit. And the
 * caller threads `errorId` onto the group's first input through `describedBy`, so somebody
 * who tabs back into the group later still hears why it is marked wrong: `aria-describedby`
 * on the `<fieldset>` alone is NOT inherited by the controls inside it.
 */
function Group({
  legend,
  note,
  hint,
  error,
  errorId,
  children,
}: {
  legend: string;
  note?: string;
  hint?: string;
  error?: string;
  errorId: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset
      className="m-0 border-0 p-0"
      aria-describedby={error ? errorId : undefined}
    >
      <legend className="t-title-s mb-1 p-0 text-on-surface">{legend}</legend>
      {note && (
        <p className="t-body-s mt-0 mb-1 text-on-surface-variant">{note}</p>
      )}
      {hint && (
        <p className="t-body-s mt-0 mb-3 text-on-surface-variant">{hint}</p>
      )}
      {error && (
        <p id={errorId} role="alert" className="t-body-s mt-0 mb-3 text-error">
          {error}
        </p>
      )}
      {children}
    </fieldset>
  );
}
