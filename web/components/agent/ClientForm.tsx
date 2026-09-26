"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import {
  createClientAction,
  updateClientAction,
} from "@/app/(agent)/agent/clients/actions";
import { Alert } from "@/components/ui/Alert";
import { Field } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { SelectField } from "@/components/ui/Select";
import { TextareaField } from "@/components/ui/Textarea";
import { COUNTRIES, usesUsAddressLabels } from "@/lib/countries";
import { CLIENT_COPY } from "@/lib/agent/content";
import {
  EMPTY_CLIENT_FORM,
  initialClientFormState,
  type ClientFormValues,
} from "@/lib/agent/clientFormState";

/**
 * Screens 3.3.9 and 3.3.10 — the same form, twice.
 *
 * §3.3.10's own Screen Inventory entry says "Same as Create Client", and it is: the same
 * fields, the same rules, the same schema. What differs is the copy, where the buttons sit
 * (the prototype puts Edit's in the header) and two hidden inputs carrying the id and the
 * version. One component with a `mode` beats two that drift.
 *
 * ── FOUR DEPARTURES FROM THE PROTOTYPE, EACH BECAUSE THE DRAWING CANNOT BE STORED ──
 *
 *  1. ADDRESS IS SIX FIELDS, NOT ONE. The prototype draws a single "Address" input.
 *     `client.mailing_address_id` points at an `address` row with line1, line2, city,
 *     region, postal_code and country, and one text box cannot fill six columns. The
 *     region and postal labels follow the chosen country, the same courtesy §2.1.10 pays —
 *     a Canadian typing their postal code into a box labelled ZIP is being told the form
 *     was not built for them.
 *  2. IMPORTANT DATES ARE A REPEATER, NOT A TEXT INPUT. The prototype draws one box
 *     labelled "Important dates · birthdays, anniversaries". The column is a jsonb array of
 *     `{label, date, recurring}`; a single string cannot produce it, and anything typed
 *     there would be unqueryable prose. Each row is a name, a date and an "every year" box.
 *  3. THE INVITE TOGGLE IS DISABLED WITH ITS REASON. The prototype draws it live and ON.
 *     Nothing in the repository creates a `client_invite` row, no email provider is wired,
 *     and issuing a portal invitation is handing out a bearer credential — it wants its own
 *     expiry, revocation and rate-limit thinking rather than a checkbox on a create form.
 *     §3.9.3 is where emailing a client a one-time link gets built.
 *  4. "SAVE & CREATE TRIP" IS DISABLED. §3.4.3 is not built, so the second half of that
 *     button has nowhere to go. Plain Save is right beside it and does the whole job.
 *
 * TAGS ARE FREE-FORM AND THE SUGGESTIONS COME FROM THE BOOK. `client.tags` has no
 * vocabulary table, so the chips offered are the ones this advisor already uses — read from
 * `agent_client_roster_summary().tag_facets`, the same source the roster's filter chips use.
 */
export function ClientForm({
  mode,
  clientId,
  expectedVersion,
  defaults = EMPTY_CLIENT_FORM,
  suggestedTags = [],
}: {
  mode: "create" | "edit";
  clientId?: string;
  expectedVersion?: number;
  defaults?: ClientFormValues;
  suggestedTags?: string[];
}) {
  const action = mode === "create" ? createClientAction : updateClientAction;
  const [state, formAction, saving] = useActionState(action, initialClientFormState);
  const shown = state.values ?? defaults;

  const [country, setCountry] = useState(shown.addressCountry || "US");
  const usLabels = usesUsAddressLabels(country);

  const [tags, setTags] = useState<string[]>(shown.tags);
  const [newTag, setNewTag] = useState("");
  const [dates, setDates] = useState(shown.importantDates);

  const errors = state.fieldErrors ?? {};
  const first = (key: keyof typeof errors) => errors[key]?.[0];

  function addTag(raw: string) {
    const tag = raw.trim().toLowerCase();
    if (tag === "" || tags.includes(tag)) return;
    setTags([...tags, tag]);
    setNewTag("");
  }

  return (
    <form action={formAction} noValidate>
      {/* Everything inert while the save is in flight, the same guard §2.1's forms use:
          without it the Enter key in any input fires a second submit, and this endpoint
          writes an `audit_event` on every call. */}
      <fieldset disabled={saving} className="m-0 flex flex-col gap-5 border-0 p-0">
        {mode === "edit" && (
          <>
            <input type="hidden" name="clientId" value={clientId ?? ""} />
            {/* The optimistic lock. `agent_update_client` answers `stale` when it has
                moved, which is a 409 and the one failure the transport types. */}
            <input type="hidden" name="expectedVersion" value={expectedVersion ?? 0} />
          </>
        )}

        {state.formError && <Alert tone="error">{state.formError}</Alert>}

        <div className="card flex flex-col gap-5 p-5">
          <section className="flex flex-col gap-3">
            <h2 className="t-title-s m-0">{CLIENT_COPY.groupBasics}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                id="firstName" name="firstName" label={CLIENT_COPY.labelFirstName}
                defaultValue={shown.firstName} error={first("firstName")}
                required autoComplete="given-name"
              />
              <Field
                id="lastName" name="lastName" label={CLIENT_COPY.labelLastName}
                defaultValue={shown.lastName} error={first("lastName")}
                required autoComplete="family-name"
              />
              <Field
                id="preferredName" name="preferredName"
                label={CLIENT_COPY.labelPreferredName}
                hint={CLIENT_COPY.hintPreferredName}
                defaultValue={shown.preferredName} error={first("preferredName")}
                className="sm:col-span-2"
              />
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="t-title-s m-0">{CLIENT_COPY.groupContact}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                id="email" name="email" type="email" label={CLIENT_COPY.labelEmail}
                defaultValue={shown.email} error={first("email")}
                required autoComplete="email" className="sm:col-span-2"
              />
              {/* A duplicate is not just refused — the form offers the record that already
                  exists, which is the whole reason the Edge Function answers 200. */}
              {state.duplicateClientId && (
                <p className="t-body-s m-0 sm:col-span-2">
                  <Link
                    href={`/agent/clients/${state.duplicateClientId}`}
                    className="underline"
                  >
                    {CLIENT_COPY.duplicateEmailLink}
                  </Link>
                </p>
              )}
              <Field
                id="phone" name="phone" type="tel" label={CLIENT_COPY.labelPhone}
                defaultValue={shown.phone} error={first("phone")} autoComplete="tel"
              />
              <Field
                id="dateOfBirth" name="dateOfBirth" type="date"
                label={CLIENT_COPY.labelBirthday}
                defaultValue={shown.dateOfBirth} error={first("dateOfBirth")}
              />
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="t-title-s m-0">{CLIENT_COPY.groupAddress}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                id="addressLine1" name="addressLine1" label="Street address"
                defaultValue={shown.addressLine1} error={first("addressLine1")}
                autoComplete="address-line1" className="sm:col-span-2"
              />
              <Field
                id="addressLine2" name="addressLine2" label="Apt, suite, etc."
                defaultValue={shown.addressLine2} error={first("addressLine2")}
                autoComplete="address-line2" className="sm:col-span-2"
              />
              <Field
                id="addressCity" name="addressCity" label="City"
                defaultValue={shown.addressCity} error={first("addressCity")}
                autoComplete="address-level2"
              />
              <Field
                id="addressRegion" name="addressRegion"
                label={usLabels ? "State" : "Region"}
                defaultValue={shown.addressRegion} error={first("addressRegion")}
                autoComplete="address-level1"
              />
              <Field
                id="addressPostalCode" name="addressPostalCode"
                label={usLabels ? "ZIP code" : "Postal code"}
                defaultValue={shown.addressPostalCode} error={first("addressPostalCode")}
                autoComplete="postal-code"
              />
              <SelectField
                id="addressCountry" name="addressCountry" label="Country"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                error={first("addressCountry")}
                options={COUNTRIES.map((c) => ({ value: c.code, label: c.name }))}
              />
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="t-title-s m-0">{CLIENT_COPY.groupTags}</h2>
            <p className="t-body-s m-0 text-[var(--md-on-surface-variant)]">
              {CLIENT_COPY.hintTags}
            </p>
            {/* Each chosen tag posts as its own `tag` input; the action reads them with
                getAll. A hidden input rather than a checkbox because the set is built by
                typing as well as picking. */}
            <div className="flex flex-wrap items-center gap-1.5">
              {tags.map((t) => (
                <span key={t} className="chip chip-filter is-on">
                  <input type="hidden" name="tag" value={t} />
                  {t}
                  <button
                    type="button"
                    className="ml-1"
                    aria-label={`Remove tag ${t}`}
                    onClick={() => setTags(tags.filter((x) => x !== t))}
                  >
                    <Icon name="close" size={11} />
                  </button>
                </span>
              ))}
              {suggestedTags
                .filter((t) => !tags.includes(t))
                .map((t) => (
                  <button
                    key={t}
                    type="button"
                    className="chip chip-filter"
                    onClick={() => addTag(t)}
                  >
                    + {t}
                  </button>
                ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                className="input h-9 max-w-[220px] rounded-full px-3"
                placeholder={CLIENT_COPY.newTagPlaceholder}
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                // Enter adds the tag rather than submitting the form — on a form with a
                // required email above, a stray Enter here would otherwise fire a save.
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag(newTag);
                  }
                }}
                aria-label={CLIENT_COPY.newTagPlaceholder}
              />
              <button type="button" className="btn btn-tonal btn-sm" onClick={() => addTag(newTag)}>
                {CLIENT_COPY.addTag}
              </button>
            </div>
            {first("tags") && (
              <p className="t-body-s m-0 text-[var(--md-error)]">{first("tags")}</p>
            )}
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="t-title-s m-0">{CLIENT_COPY.groupDates}</h2>
            <p className="t-body-s m-0 text-[var(--md-on-surface-variant)]">
              {CLIENT_COPY.hintDates}
            </p>
            {dates.map((d, i) => (
              <div key={i} className="grid items-end gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
                <Field
                  id={`dateLabel-${i}`} name="dateLabel" label={CLIENT_COPY.labelDateLabel}
                  defaultValue={d.label}
                />
                <Field
                  id={`dateValue-${i}`} name="dateValue" type="date"
                  label={CLIENT_COPY.labelDateValue} defaultValue={d.date}
                />
                <label className="chip chip-filter mb-1">
                  <input
                    type="checkbox" name="dateRecurring" value={String(i)}
                    defaultChecked={d.recurring} className="sr-only"
                  />
                  {CLIENT_COPY.labelDateRecurring}
                </label>
                <button
                  type="button"
                  className="btn btn-text btn-sm mb-1"
                  onClick={() => setDates(dates.filter((_, j) => j !== i))}
                >
                  {CLIENT_COPY.removeDate}
                </button>
              </div>
            ))}
            {first("importantDates") && (
              <p className="t-body-s m-0 text-[var(--md-error)]">{first("importantDates")}</p>
            )}
            <button
              type="button"
              className="btn btn-tonal btn-sm self-start"
              onClick={() => setDates([...dates, { label: "", date: "", recurring: false }])}
            >
              <Icon name="plus" size={12} /> {CLIENT_COPY.addDate}
            </button>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="t-title-s m-0">{CLIENT_COPY.groupNotes}</h2>
            <TextareaField
              id="notes" name="notes" label={CLIENT_COPY.groupNotes}
              hint={CLIENT_COPY.hintNotes}
              defaultValue={shown.notes} error={first("notes")} rows={3}
            />
          </section>

          {mode === "create" && (
            <div
              className="card flex items-center gap-2.5 border-0 bg-[var(--md-secondary-container)] p-3 text-[var(--md-on-secondary-container)] opacity-60"
              title={CLIENT_COPY.inviteDeferred}
            >
              <Icon name="mail" size={16} />
              <span className="t-body-s flex-1">{CLIENT_COPY.inviteLabel}</span>
              <span className="t-body-s">{CLIENT_COPY.inviteDeferred}</span>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link href={clientId ? `/agent/clients/${clientId}` : "/agent/clients"} className="btn btn-text">
            {CLIENT_COPY.formCancel}
          </Link>
          <button type="submit" className="btn btn-filled ml-auto">
            {saving ? CLIENT_COPY.formSaving : CLIENT_COPY.formSave}
          </button>
          {mode === "create" && (
            <button
              type="button"
              disabled
              title={CLIENT_COPY.saveAndTripDeferred}
              className="btn btn-tonal opacity-50"
            >
              {CLIENT_COPY.saveAndTrip}
              <span className="sr-only"> — {CLIENT_COPY.saveAndTripDeferred}</span>
            </button>
          )}
        </div>
      </fieldset>
    </form>
  );
}
