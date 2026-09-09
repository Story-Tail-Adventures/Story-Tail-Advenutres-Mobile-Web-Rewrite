"use client";

import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { OnboardingActions } from "@/components/onboarding/OnboardingActions";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { DateField } from "@/components/ui/DateField";
import { Field } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { SelectField } from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Spinner";
import { COUNTRIES } from "@/lib/countries";
import {
  WIZARD_BACK_LABEL,
  previousRoute,
  wizardStepIndex,
} from "@/lib/onboarding/steps";
import {
  COMPANION_LIMITS,
  expiresWithinSixMonths,
} from "@/lib/validation/companion";
import { todayIso } from "@/lib/validation/profile";
import {
  continueCompanionsAction,
  removeCompanionAction,
  saveCompanionAction,
  skipCompanionsAction,
} from "./actions";
import {
  COMPANIONS_TEXT,
  MAX_COMPANIONS,
  initialCompanionsState,
  type CompanionRow,
} from "./state";

/**
 * Screen 2.1.12's list and its add/edit form (design: `C2112_Companions` / `M2112`).
 *
 * A LIST, not a form, and that changes the shape of the screen: each traveler is saved as
 * they are added rather than at the end, so a household half-entered when the tab closes is
 * still a household half-entered when they come back. "Save & continue" therefore saves
 * nothing — it only moves the wizard on.
 *
 * DEPARTURES FROM THE PROTOTYPE. The card subtitle prints "Passport B987654321 · 02/2031";
 * the number is gone (see state.ts). The avatar letter comes from the first name rather
 * than from the first character of a joined string, and is `aria-hidden` — it is decoration
 * beside a name that is already there. And there is no "invite them to the platform"
 * control, which the Inventory asks for and the schema cannot honour: `companion` has no
 * email column, and a client-initiated invite would write a new record into an agent's book.
 */

const STEP_INDEX = wizardStepIndex("companions");
const CONTINUE_FORM_ID = "companions-continue";
const RELATIONSHIP_LIST_ID = "companion-relationships";

const COUNTRY_OPTIONS = COUNTRIES.map((country) => ({
  value: country.code,
  label: country.name,
}));

export function CompanionsList({
  companions,
}: {
  companions: readonly CompanionRow[];
}) {
  const [saveState, saveAction] = useActionState(
    saveCompanionAction,
    initialCompanionsState,
  );
  const [removeState, removeAction] = useActionState(
    removeCompanionAction,
    initialCompanionsState,
  );
  const [continueState, continueAction, continuing] = useActionState(
    async () => {
      await continueCompanionsAction();
      return initialCompanionsState;
    },
    initialCompanionsState,
  );

  // Which row the form is editing, or "new" while adding, or null when the form is closed.
  const [editing, setEditing] = useState<string | null>(null);

  /**
   * Closed by a save that LANDED, and by nothing else.
   *
   * Closing on submit instead — which is what this replaced — emptied the form the moment a
   * name failed validation, which is the one thing a rejected submit must never do.
   *
   * Adjusted during render rather than in an effect: React's own guidance for "reset state
   * when something changes", and the only shape `react-hooks/set-state-in-effect` allows.
   * The extra render happens before the browser paints, so nothing flickers.
   */
  // Focus follows the form. It opens in a fixed slot below a list that can be twelve rows
  // long, so without this a keyboard or screen-reader user clicks Edit and nothing appears
  // to happen. `openForm` also remembers where to send focus back to on cancel.
  const returnFocus = useRef<HTMLButtonElement | null>(null);
  const openForm = (target: string, trigger: HTMLButtonElement | null) => {
    returnFocus.current = trigger;
    setEditing(target);
  };
  const closeForm = () => {
    setEditing(null);
    returnFocus.current?.focus();
  };

  const [seenToken, setSeenToken] = useState(saveState.savedToken);
  // PRESENT and new, not merely different. A rejected save returns no token at all, so
  // comparing for inequality alone treats `undefined` as a fresh result and closes the form
  // on exactly the failure it was written to keep open.
  if (saveState.savedToken !== undefined && saveState.savedToken !== seenToken) {
    setSeenToken(saveState.savedToken);
    setEditing(null);
  }
  const full = companions.length >= MAX_COMPANIONS;

  const row =
    editing && editing !== "new"
      ? companions.find((companion) => companion.id === editing)
      : undefined;

  // The row the form is open on has gone — removed in another tab, or by a Remove that
  // raced the Edit. Closing beats leaving a form whose hidden id points at nothing, which
  // would relabel itself "Add a traveler" and then fail on save with no explanation.
  if (editing && editing !== "new" && !row) setEditing(null);

  /**
   * A rejected submit's leftovers belong to the row they came FROM.
   *
   * Without this check, failing validation on one traveler and then clicking Edit on a
   * different one opens the second row's form pre-filled with the first one's typed values
   * and errors — and saves them over the second person's record. `editingId` is what the
   * action hands back to say which row it was.
   */
  const target = editing === "new" ? undefined : (editing ?? undefined);
  const stateIsForThisRow = editing !== null && saveState.editingId === target;
  const values = stateIsForThisRow ? (saveState.values ?? row) : row;
  const fieldErrors = stateIsForThisRow ? saveState.fieldErrors : undefined;
  const formError = stateIsForThisRow ? saveState.formError : undefined;

  return (
    <>
      <div className="flex flex-col gap-4">
        {removeState.formError && (
          <Alert tone="error">{removeState.formError}</Alert>
        )}

        {companions.length === 0 ? (
          <EmptyState
            onAdd={() => setEditing("new")}
            disabled={editing === "new"}
          />
        ) : (
          <ul
            aria-label={COMPANIONS_TEXT.listAriaLabel}
            className="flex flex-col gap-2.5"
          >
            {companions.map((companion) => (
              <CompanionCard
                key={companion.id}
                companion={companion}
                removeAction={removeAction}
                onEdit={(trigger) => openForm(companion.id, trigger)}
                editing={editing === companion.id}
                busy={editing !== null}
              />
            ))}
          </ul>
        )}

        {full && <Alert tone="info">{COMPANIONS_TEXT.errorMax}</Alert>}

        {editing === null && companions.length > 0 && !full && (
          <div>
            <Button
              type="button"
              variant="outlined"
              onClick={() => setEditing("new")}
            >
              <Icon name="users" size={15} />
              {COMPANIONS_TEXT.addCta}
            </Button>
          </div>
        )}

        {editing !== null && (
          <CompanionForm
            key={editing}
            action={saveAction}
            editingId={editing === "new" ? undefined : editing}
            title={
              row
                ? COMPANIONS_TEXT.formEditTitle(
                    `${row.firstName} ${row.lastName}`,
                  )
                : COMPANIONS_TEXT.formAddTitle
            }
            values={values}
            fieldErrors={fieldErrors}
            formError={formError}
            onCancel={closeForm}
          />
        )}
      </div>

      {/* The wizard's own Continue submits this — it carries no fields because everything
          on the screen is already saved by the time somebody presses it. */}
      <form id={CONTINUE_FORM_ID} action={continueAction} className="hidden" />
      {continueState.formError && (
        <Alert tone="error">{continueState.formError}</Alert>
      )}

      {/* Leaving the step with a form open would discard what is in it — the same data loss
          the save-token fix exists to prevent, reachable through a different button. Held
          back rather than silently swallowed, and told why. */}
      {editing !== null && (
        <p className="t-body-s mt-4 mb-0 text-on-surface-variant">
          {COMPANIONS_TEXT.unfinishedForm}
        </p>
      )}

      <OnboardingActions
        formId={CONTINUE_FORM_ID}
        saving={continuing}
        disabled={editing !== null}
        primaryLabel={COMPANIONS_TEXT.primaryCta}
        pendingLabel={COMPANIONS_TEXT.pending}
        secondaryLabel={COMPANIONS_TEXT.secondaryCta}
        secondaryA11yLabel={COMPANIONS_TEXT.secondaryCtaA11y}
        secondaryPendingLabel={COMPANIONS_TEXT.secondaryPending}
        skipAction={skipCompanionsAction}
        backHref={previousRoute(STEP_INDEX)}
        backLabel={WIZARD_BACK_LABEL}
      />
    </>
  );
}

function EmptyState({
  onAdd,
  disabled,
}: {
  onAdd: () => void;
  disabled: boolean;
}) {
  return (
    <div className="card-flat rounded-lg border border-outline-variant px-5 py-6 text-center">
      <p className="t-title-s m-0 text-on-surface">
        {COMPANIONS_TEXT.emptyTitle}
      </p>
      <p className="t-body-s mx-auto mt-1.5 mb-4 max-w-120 text-on-surface-variant">
        {COMPANIONS_TEXT.emptyBody}
      </p>
      <Button
        type="button"
        variant="filled"
        onClick={onAdd}
        disabled={disabled}
      >
        <Icon name="users" size={15} />
        {COMPANIONS_TEXT.emptyCta}
      </Button>
    </div>
  );
}

function CompanionCard({
  companion,
  removeAction,
  onEdit,
  editing,
  busy,
}: {
  companion: CompanionRow;
  removeAction: (formData: FormData) => void;
  onEdit: (trigger: HTMLButtonElement) => void;
  /** This row is the one the form is open on. */
  editing: boolean;
  /** Some row's form is open. Removing anything now would strand it. */
  busy: boolean;
}) {
  const name = `${companion.firstName} ${companion.lastName}`;
  const expiringSoon =
    companion.passportExpiry !== "" &&
    expiresWithinSixMonths(companion.passportExpiry);

  const meta = [
    companion.relationship || null,
    companion.dateOfBirth
      ? COMPANIONS_TEXT.born(formatDate(companion.dateOfBirth))
      : null,
    companion.passportExpiry
      ? (expiringSoon
          ? COMPANIONS_TEXT.passportExpiringSoon
          : COMPANIONS_TEXT.passportExpires)(
          formatMonth(companion.passportExpiry),
        )
      : COMPANIONS_TEXT.passportNone,
  ].filter(Boolean);

  return (
    <li className="card-flat flex items-center gap-3 rounded-lg border border-outline-variant px-4 py-3">
      {/* Decoration: the name is right beside it, so announcing a letter is noise. */}
      <span aria-hidden="true" className="avatar shrink-0">
        {companion.firstName.slice(0, 1).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <p className="t-title-s m-0 text-on-surface">{name}</p>
        <p
          className={`t-body-s m-0 ${expiringSoon ? "text-warning" : "text-on-surface-variant"}`}
        >
          {meta.join(" · ")}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          type="button"
          variant="text"
          size="sm"
          onClick={(event) => onEdit(event.currentTarget)}
          disabled={editing}
          aria-label={COMPANIONS_TEXT.editAriaLabel(name)}
        >
          {COMPANIONS_TEXT.editAction}
        </Button>
        <form action={removeAction}>
          <input type="hidden" name="id" value={companion.id} />
          {/* Disabled while any form is open: removing the row being edited leaves a form
              posting a dead id, and removing a different one shifts the list under it. */}
          <RemoveButton name={name} disabled={busy} />
        </form>
      </div>
    </li>
  );
}

function RemoveButton({ name, disabled }: { name: string; disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="text"
      size="sm"
      disabled={pending || disabled}
      aria-label={COMPANIONS_TEXT.removeAriaLabel(name)}
    >
      {pending ? (
        <>
          <Spinner className="size-4" />
          {COMPANIONS_TEXT.removePending}
        </>
      ) : (
        COMPANIONS_TEXT.removeAction
      )}
    </Button>
  );
}

function CompanionForm({
  action,
  editingId,
  title,
  values,
  fieldErrors,
  formError,
  onCancel,
}: {
  action: (formData: FormData) => void;
  editingId?: string;
  title: string;
  values?: Omit<CompanionRow, "id">;
  fieldErrors?: Partial<Record<string, string[]>>;
  formError?: string;
  onCancel: () => void;
}) {
  const first = (key: string) => fieldErrors?.[key]?.[0];

  return (
    <form
      action={action}
      noValidate
      className="card-flat rounded-lg border border-outline-variant px-4 py-4"
    >
      {editingId && <input type="hidden" name="id" value={editingId} />}

      <p className="t-title-s m-0 text-on-surface">{title}</p>
      <p className="t-body-s mt-1 mb-4 text-on-surface-variant">
        {COMPANIONS_TEXT.formSub}
      </p>

      {formError && (
        <div className="mb-3">
          <Alert tone="error">{formError}</Alert>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <Field
          id="companionFirstName"
          name="firstName"
          // The form mounts below a list that can be twelve rows long; without this,
          // opening it moves nothing a keyboard user can perceive.
          autoFocus
          label={COMPANIONS_TEXT.labelFirstName}
          // Somebody else's name: browser autofill would happily drop the account holder's
          // own in.
          autoComplete="off"
          maxLength={COMPANION_LIMITS.name}
          defaultValue={values?.firstName ?? ""}
          error={first("firstName")}
        />
        <Field
          id="companionLastName"
          name="lastName"
          label={COMPANIONS_TEXT.labelLastName}
          autoComplete="off"
          maxLength={COMPANION_LIMITS.name}
          defaultValue={values?.lastName ?? ""}
          error={first("lastName")}
        />
        <Field
          id="companionRelationship"
          name="relationship"
          label={COMPANIONS_TEXT.labelRelationship}
          autoComplete="off"
          list={RELATIONSHIP_LIST_ID}
          maxLength={COMPANION_LIMITS.relationship}
          defaultValue={values?.relationship ?? ""}
          error={first("relationship")}
        />
        <DateField
          id="companionDateOfBirth"
          name="dateOfBirth"
          label={COMPANIONS_TEXT.labelDateOfBirth}
          max={todayIso()}
          defaultValue={values?.dateOfBirth ?? ""}
          error={first("dateOfBirth")}
        />
        <DateField
          id="companionPassportExpiry"
          name="passportExpiry"
          label={COMPANIONS_TEXT.labelPassportExpiry}
          defaultValue={values?.passportExpiry ?? ""}
          error={first("passportExpiry")}
        />
        <SelectField
          id="companionPassportCountry"
          name="passportCountry"
          label={COMPANIONS_TEXT.labelPassportCountry}
          options={COUNTRY_OPTIONS}
          placeholder={COMPANIONS_TEXT.countryPlaceholder}
          defaultValue={values?.passportCountry ?? ""}
          error={first("passportCountry")}
        />
        {/* Suggestions, not a menu: "Mother-in-law" and "Godson" are real answers. */}
        <datalist id={RELATIONSHIP_LIST_ID}>
          {COMPANIONS_TEXT.relationshipSuggestions.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <SaveButton />
        <Button type="button" variant="text" onClick={onCancel}>
          {COMPANIONS_TEXT.formCancel}
        </Button>
      </div>
    </form>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="filled" disabled={pending}>
      {pending ? (
        <>
          <Spinner className="size-4" />
          {COMPANIONS_TEXT.formSaving}
        </>
      ) : (
        COMPANIONS_TEXT.formSave
      )}
    </Button>
  );
}

/**
 * An ISO date as something a person reads.
 *
 * The locale is PINNED and the time zone is UTC, both deliberately. This component renders
 * on the server and hydrates in the browser, and `toLocaleDateString(undefined, …)` asks
 * each of them for its own answer — Node's locale is the host's, the browser's is the
 * reader's, and where they differ React throws the page away and re-renders it. That is
 * exactly the bug `lib/countries.ts` documents, caught there by the console and avoided
 * here by not asking the question. UTC for the same reason plus a second one: these are
 * date-only columns, and rendering them in a westward time zone shows yesterday.
 *
 * "11 March 1990" rather than a numeric form, because the prototype's `11/03/1990` is
 * unreadable — it is March 11th to an American and the 11th of March to everybody else.
 */
const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  year: "numeric",
  month: "long",
  day: "numeric",
  timeZone: "UTC",
});

const MONTH_FORMAT = new Intl.DateTimeFormat("en-GB", {
  year: "numeric",
  month: "short",
  timeZone: "UTC",
});

function formatDate(iso: string): string {
  return DATE_FORMAT.format(new Date(`${iso}T00:00:00Z`));
}

function formatMonth(iso: string): string {
  return MONTH_FORMAT.format(new Date(`${iso}T00:00:00Z`));
}
