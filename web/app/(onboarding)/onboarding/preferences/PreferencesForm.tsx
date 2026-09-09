"use client";

import { useActionState, useState } from "react";
import { OnboardingActions } from "@/components/onboarding/OnboardingActions";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { ChipGroup, ChipInput } from "@/components/ui/Chip";
import { Field } from "@/components/ui/Field";
import { TextareaField } from "@/components/ui/Textarea";
import {
  WIZARD_BACK_LABEL,
  previousRoute,
  wizardStepIndex,
} from "@/lib/onboarding/steps";
import {
  ACCESSIBILITY_OPTIONS,
  BUDGET_OPTIONS,
  BUDGET_UNSURE_LABEL,
  DESTINATION_SUGGESTIONS,
  DIETARY_OPTIONS,
  NONE,
  PREFERENCE_LIMITS,
  TRAVEL_STYLE_OPTIONS,
  type Option,
} from "@/lib/validation/preferences";
import { savePreferencesAction, skipPreferencesAction } from "./actions";
import {
  PREFERENCES_TEXT,
  initialPreferencesState,
  type PreferencesFormValues,
} from "./state";

/**
 * Screen 2.1.11's form (design: `C2111_PreferencesCapture` / `M2111_PreferencesCapture`).
 *
 * THE CHIPS ARE REAL INPUTS. The prototype draws `<span className="chip">` and encodes
 * selection by appending " ✓" to the label — a span is not focusable, not announced and not
 * operable by keyboard, and `"Caribbean ✓"` in a `text[]` breaks every comparison that ever
 * reads it. Checkboxes also keep the screen working with JavaScript off, like the rest of
 * §2.1.
 *
 * FOUR OTHER DEPARTURES, each because the prototype cannot be built as drawn:
 *  - the dual-thumb $1k–$10k+ slider is four radio bands, because `budget_band` is one
 *    nullable text column and two thumbs is two numbers (Data-Model §6.2);
 *  - the single loyalty text input is a two-column repeater, because the column holds
 *    `{program, number, tier}` objects and splitting "Marriott Bonvoy 123" on the last
 *    space credits somebody's miles to the wrong account;
 *  - "No restrictions" and "None" clear their group, because the arrays now carry a CHECK
 *    that forbids the sentinel beside a real answer;
 *  - the free-text boxes beside the diet and access chips, and the "a trip you still talk
 *    about" box, are additions. The Inventory lists the last one; the first two are the
 *    fields an advisor forwards to a resort kitchen, which five chips cannot say.
 */

const STEP_INDEX = wizardStepIndex("preferences");
const FORM_ID = "preferences-form";
/** Two rows to start, so the repeater reads as a list rather than a single box. */
const INITIAL_LOYALTY_ROWS = 2;

interface LoyaltyRowState {
  key: number;
  program: string;
  number: string;
}

/** What is on file, plus a blank line to type the next one on. */
function initialLoyaltyRows(
  saved: readonly { program: string; number: string }[],
): LoyaltyRowState[] {
  const rows = saved.map((row, key) => ({ key, ...row }));
  while (rows.length < INITIAL_LOYALTY_ROWS) {
    rows.push({ key: rows.length, program: "", number: "" });
  }
  return rows;
}

export function PreferencesForm({
  defaults,
}: {
  defaults: PreferencesFormValues;
}) {
  const [state, formAction, saving] = useActionState(
    savePreferencesAction,
    initialPreferencesState,
  );
  const shown = state.values ?? defaults;

  const errors = state.fieldErrors ?? {};
  const first = (key: keyof typeof errors) => errors[key]?.[0];

  // Controlled, because "No restrictions" has to clear the rest of its group — a rule the
  // CHECK constraint enforces and a form should never let somebody break in the first place.
  const [dietary, setDietary] = useState<string[]>(shown.dietary);
  const [accessibility, setAccessibility] = useState<string[]>(
    shown.accessibility,
  );

  /**
   * The repeater's rows, as stable keys carrying their INITIAL values.
   *
   * Keyed rather than counted, because removing row 2 of 3 by decrementing a count would
   * unmount the third row's DOM and shuffle everyone's text up a line. The current values
   * stay uncontrolled and stay with their key; only which rows exist is state.
   */
  const [loyaltyRows, setLoyaltyRows] = useState(() =>
    initialLoyaltyRows(shown.loyalty),
  );

  // Destinations somebody typed on a previous visit are chips too, or they would silently
  // vanish from a form that is showing them what is on file. Compared case-INSENSITIVELY,
  // matching how `parsePreferences` deduplicates: otherwise a stored "caribbean" renders as
  // a second chip beside "Caribbean" and looks like a bug.
  const extraDestinations = shown.destinations.filter(
    (destination) =>
      !DESTINATION_SUGGESTIONS.some(
        (suggestion) => suggestion.toLowerCase() === destination.toLowerCase(),
      ),
  );

  return (
    <>
      <form id={FORM_ID} action={formAction} noValidate>
        <fieldset
          disabled={saving}
          className="m-0 flex flex-col gap-6 border-0 p-0"
        >
          {state.formError && <Alert tone="error">{state.formError}</Alert>}

          <Group
            legend={PREFERENCES_TEXT.sectionDestinations}
            hint={PREFERENCES_TEXT.hintDestinations}
            error={first("destinations")}
            errorId="destinations-error"
          >
            <ChipGroup>
              {[...DESTINATION_SUGGESTIONS, ...extraDestinations].map(
                (destination) => (
                  <ChipInput
                    key={destination}
                    name="destinations"
                    value={destination}
                    label={destination}
                    defaultChecked={shown.destinations.some(
                      (chosen) =>
                        chosen.toLowerCase() === destination.toLowerCase(),
                    )}
                  />
                ),
              )}
            </ChipGroup>
            <div className="mt-3 md:max-w-96">
              <Field
                id="destinationOther"
                name="destinationOther"
                label={PREFERENCES_TEXT.labelDestinationOther}
                placeholder={PREFERENCES_TEXT.placeholderDestinationOther}
                autoComplete="off"
                maxLength={PREFERENCE_LIMITS.destinationLength * 3}
                defaultValue={shown.destinationOther}
                describedBy={
                  first("destinations") ? "destinations-error" : undefined
                }
              />
            </div>
          </Group>

          <Group
            legend={PREFERENCES_TEXT.sectionStyle}
            hint={PREFERENCES_TEXT.hintStyle}
            error={first("travelStyles")}
            errorId="travelStyles-error"
          >
            <ChipGroup>
              {TRAVEL_STYLE_OPTIONS.map((option) => (
                <ChipInput
                  key={option.value}
                  name="travelStyles"
                  // "Honeymoon" is the label; `romantic` is what the column stores.
                  value={option.value}
                  label={option.label}
                  defaultChecked={shown.travelStyles.includes(option.value)}
                />
              ))}
            </ChipGroup>
          </Group>

          <SentinelGroup
            legend={PREFERENCES_TEXT.sectionDiet}
            name="dietary"
            options={DIETARY_OPTIONS}
            selected={dietary}
            onChange={setDietary}
            error={first("dietary")}
            errorId="dietary-error"
            notesId="dietaryNotes"
            notesLabel={PREFERENCES_TEXT.labelDietNotes}
            notesPlaceholder={PREFERENCES_TEXT.placeholderDietNotes}
            notesValue={shown.dietaryNotes}
            notesError={first("dietaryNotes")}
          />

          <SentinelGroup
            legend={PREFERENCES_TEXT.sectionAccess}
            name="accessibility"
            options={ACCESSIBILITY_OPTIONS}
            selected={accessibility}
            onChange={setAccessibility}
            error={first("accessibility")}
            errorId="accessibility-error"
            notesId="accessibilityNotes"
            notesLabel={PREFERENCES_TEXT.labelAccessNotes}
            notesPlaceholder={PREFERENCES_TEXT.placeholderAccessNotes}
            notesValue={shown.accessibilityNotes}
            notesError={first("accessibilityNotes")}
          />

          <Group
            legend={PREFERENCES_TEXT.sectionLoyalty}
            hint={PREFERENCES_TEXT.hintLoyalty}
            error={first("loyalty")}
            errorId="loyalty-error"
          >
            <div className="flex flex-col gap-3">
              {loyaltyRows.map((row, index) => (
                <div key={row.key} className="flex items-end gap-2">
                  <div className="grid flex-1 gap-3 md:grid-cols-2">
                    <Field
                      id={`loyaltyProgram-${row.key}`}
                      name="loyaltyProgram"
                      label={PREFERENCES_TEXT.labelLoyaltyProgram}
                      placeholder={PREFERENCES_TEXT.placeholderLoyaltyProgram}
                      autoComplete="off"
                      maxLength={PREFERENCE_LIMITS.loyaltyProgram}
                      defaultValue={row.program}
                      describedBy={
                        first("loyalty") ? "loyalty-error" : undefined
                      }
                    />
                    <Field
                      id={`loyaltyNumber-${row.key}`}
                      name="loyaltyNumber"
                      label={PREFERENCES_TEXT.labelLoyaltyNumber}
                      autoComplete="off"
                      maxLength={PREFERENCE_LIMITS.loyaltyNumber}
                      defaultValue={row.number}
                      // "Which program is that number for?" is an error ABOUT this box.
                      describedBy={
                        first("loyalty") ? "loyalty-error" : undefined
                      }
                    />
                  </div>
                  {loyaltyRows.length > 1 && (
                    <Button
                      type="button"
                      variant="text"
                      size="sm"
                      onClick={() =>
                        setLoyaltyRows((rows) =>
                          rows.filter((r) => r.key !== row.key),
                        )
                      }
                      aria-label={`${PREFERENCES_TEXT.loyaltyRemove} program ${index + 1}`}
                    >
                      {PREFERENCES_TEXT.loyaltyRemove}
                    </Button>
                  )}
                </div>
              ))}
              {loyaltyRows.length < PREFERENCE_LIMITS.loyaltyRows && (
                <div>
                  <Button
                    type="button"
                    variant="text"
                    size="sm"
                    onClick={() =>
                      setLoyaltyRows((rows) => [
                        ...rows,
                        {
                          key: rows.length ? rows[rows.length - 1].key + 1 : 0,
                          program: "",
                          number: "",
                        },
                      ])
                    }
                  >
                    {PREFERENCES_TEXT.loyaltyAdd}
                  </Button>
                </div>
              )}
            </div>
          </Group>

          <Group
            legend={PREFERENCES_TEXT.sectionBudget}
            hint={PREFERENCES_TEXT.hintBudget}
            error={first("budgetBand")}
            errorId="budgetBand-error"
          >
            <ChipGroup>
              {BUDGET_OPTIONS.map((option) => (
                <ChipInput
                  key={option.value}
                  type="radio"
                  name="budgetBand"
                  value={option.value}
                  label={option.label}
                  defaultChecked={shown.budgetBand === option.value}
                />
              ))}
              {/* Not decoration: a radio group cannot return to unselected, so without an
                  explicit way to say nothing the first tap would be irreversible. */}
              <ChipInput
                type="radio"
                name="budgetBand"
                value=""
                label={BUDGET_UNSURE_LABEL}
                defaultChecked={shown.budgetBand === ""}
              />
            </ChipGroup>
          </Group>

          <div className="md:max-w-160">
            <TextareaField
              id="favoritePastTrips"
              name="favoritePastTrips"
              label={PREFERENCES_TEXT.labelFavorites}
              placeholder={PREFERENCES_TEXT.placeholderFavorites}
              maxLength={PREFERENCE_LIMITS.favorites}
              defaultValue={shown.favoritePastTrips}
              error={first("favoritePastTrips")}
            />
          </div>
        </fieldset>
      </form>

      <OnboardingActions
        formId={FORM_ID}
        saving={saving}
        primaryLabel={PREFERENCES_TEXT.primaryCta}
        pendingLabel={PREFERENCES_TEXT.pending}
        secondaryLabel={PREFERENCES_TEXT.secondaryCta}
        secondaryA11yLabel={PREFERENCES_TEXT.secondaryCtaA11y}
        secondaryPendingLabel={PREFERENCES_TEXT.secondaryPending}
        skipAction={skipPreferencesAction}
        backHref={previousRoute(STEP_INDEX)}
        backLabel={WIZARD_BACK_LABEL}
      />
    </>
  );
}

/**
 * A chip group whose first option is a sentinel that clears the rest.
 *
 * Controlled, unlike the other two groups, because "No restrictions" alongside "Pescatarian"
 * tells a resort kitchen two contradictory things — the CHECK constraint added in
 * 20260904124903 refuses it, and a form should never let somebody get that far.
 */
function SentinelGroup({
  legend,
  name,
  options,
  selected,
  onChange,
  error,
  errorId,
  notesId,
  notesLabel,
  notesPlaceholder,
  notesValue,
  notesError,
}: {
  legend: string;
  name: string;
  options: readonly Option[];
  selected: string[];
  onChange: (next: string[]) => void;
  error?: string;
  errorId: string;
  notesId: string;
  notesLabel: string;
  notesPlaceholder: string;
  notesValue: string;
  notesError?: string;
}) {
  function toggle(value: string, checked: boolean): void {
    if (!checked) {
      onChange(selected.filter((entry) => entry !== value));
      return;
    }
    // Ticking the sentinel clears everything else; ticking anything else clears it.
    if (value === NONE) onChange([NONE]);
    else onChange([...selected.filter((entry) => entry !== NONE), value]);
  }

  return (
    <Group legend={legend} error={error} errorId={errorId}>
      <ChipGroup>
        {options.map((option) => (
          <ChipInput
            key={option.value}
            name={name}
            value={option.value}
            label={option.label}
            checked={selected.includes(option.value)}
            onChange={(event) => toggle(option.value, event.target.checked)}
          />
        ))}
      </ChipGroup>
      <div className="mt-3 md:max-w-160">
        <Field
          id={notesId}
          name={notesId}
          label={notesLabel}
          placeholder={notesPlaceholder}
          autoComplete="off"
          maxLength={PREFERENCE_LIMITS.notes}
          defaultValue={notesValue}
          error={notesError}
          describedBy={error ? errorId : undefined}
          // Inert while the sentinel is ticked, so the contradiction cannot be typed at
          // all — a disabled input posts nothing, which is the same as clearing it. The
          // rules and a CHECK constraint both refuse the pair; this is what stops anybody
          // having to be told about it.
          disabled={selected.includes(NONE)}
        />
      </div>
    </Group>
  );
}

/**
 * One labelled group.
 *
 * The error is announced on appearance (`role="alert"`) and threaded onto a control through
 * `describedBy`, because `aria-describedby` on a `<fieldset>` is not inherited by the
 * inputs inside it — the same arrangement 2.1.10 uses.
 */
function Group({
  legend,
  hint,
  error,
  errorId,
  children,
}: {
  legend: string;
  hint?: string;
  error?: string;
  errorId: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="m-0 border-0 p-0">
      <legend className="t-title-s mb-1 p-0 text-on-surface">{legend}</legend>
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
