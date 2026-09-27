"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { createTripAction } from "@/app/(agent)/agent/trips/new/actions";
import { Icon } from "@/components/ui/Icon";
import { NEW_TRIP_COPY } from "@/lib/agent/content";
import {
  EMPTY_NEW_TRIP,
  TRIP_TYPES,
  type NewTripState,
} from "@/lib/agent/newTrip";

/**
 * Screen 3.4.3 — pick a shape, pick a client, name it.
 *
 * THE CLIENT PICKER IS A `<datalist>`, NOT A SEARCH-AS-YOU-TYPE. The advisor's whole book is
 * already on the page (it is tens, not thousands), so a live search would be a round trip
 * per keystroke to filter a list the browser can filter itself — and `<datalist>` keeps the
 * control a plain `<input>`, so the form still submits with JavaScript off. When the book
 * outgrows that, §3.3.1's accessor already takes `p_search`.
 *
 * THE TYPE TILES ARE RADIOS, drawn as cards. The prototype draws `<button>`s, which are not
 * a group, not announced as one, and not operable with arrow keys. A `<fieldset>` of radios
 * is the same picture and the right control — the call §3.3.1's status chips made.
 *
 * FIVE TILES, NOT THE PROTOTYPE'S SIX. See `TRIP_TYPES` — "Honeymoon" is not a `trip_type`.
 *
 * "START FROM A TEMPLATE" IS DISABLED with its reason: `trip_template` has no rows and
 * §3.4.13 is the screen that fills it, so the alternative is a picker that opens on nothing.
 */
export function NewTripForm({
  clients,
  presetClientId,
}: {
  clients: { id: string; name: string; email: string | null }[];
  presetClientId?: string;
}) {
  const [state, formAction, pending] = useActionState<NewTripState, FormData>(
    createTripAction,
    {},
  );

  const values = state.values ?? {
    ...EMPTY_NEW_TRIP,
    clientId: presetClientId ?? "",
  };

  // Held here only so the hidden id can follow what was typed. The form still posts without
  // JavaScript: the visible input carries a `list`, and the action reads the id field, which
  // is pre-filled when the page was opened from a client.
  const [clientText, setClientText] = useState(() => {
    const preset = clients.find((c) => c.id === (presetClientId ?? values.clientId));
    return preset ? preset.name : "";
  });

  const matched = clients.find(
    (c) => c.name.toLowerCase() === clientText.trim().toLowerCase(),
  );

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {state.formError && (
        <p role="alert" className="t-body-s rounded-xl bg-[var(--md-error-container)] px-3 py-2 text-[var(--md-on-error-container)]">
          {state.formError}
        </p>
      )}

      {/* ── Type ─────────────────────────────────────────────────────── */}
      <fieldset className="border-0 p-0">
        <legend className="t-title-s mb-2 p-0">{NEW_TRIP_COPY.typeLabel}</legend>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {TRIP_TYPES.map((t) => (
            <label
              key={t.value}
              className="card flex cursor-pointer items-start gap-3 px-3.5 py-3 has-[:checked]:border-[var(--md-primary)] has-[:checked]:bg-[var(--md-primary-container)]"
            >
              <input
                type="radio"
                name="tripType"
                value={t.value}
                defaultChecked={values.tripType === t.value}
                className="mt-1 size-4 accent-[var(--md-primary)]"
              />
              <span className="min-w-0">
                <span className="t-title-s flex items-center gap-1.5">
                  <Icon name={t.icon} size={13} /> {t.label}
                </span>
                <span className="t-body-s mt-0.5 block text-[var(--md-on-surface-variant)]">
                  {t.hint}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* ── Client ───────────────────────────────────────────────────── */}
      <div>
        <label className="t-title-s mb-1 block" htmlFor="trip-client">
          {NEW_TRIP_COPY.clientLabel}
        </label>
        <p className="t-body-s mb-1.5 text-[var(--md-on-surface-variant)]">
          {NEW_TRIP_COPY.clientHint}
        </p>
        <input
          id="trip-client"
          list="trip-client-options"
          value={clientText}
          onChange={(e) => setClientText(e.target.value)}
          placeholder={NEW_TRIP_COPY.clientPlaceholder}
          autoComplete="off"
          className="input h-10 w-full rounded-xl px-3"
          aria-describedby={state.fieldErrors?.clientId ? "trip-client-error" : undefined}
        />
        <datalist id="trip-client-options">
          {clients.map((c) => (
            <option key={c.id} value={c.name}>
              {c.email ?? ""}
            </option>
          ))}
        </datalist>
        {/* What the action actually reads. Kept in step with the visible field rather than
            parsed out of it, so a name that happens to match two clients cannot pick one
            silently — an unmatched name simply posts no id and the action says so. */}
        <input type="hidden" name="clientId" value={matched?.id ?? (clientText ? "" : values.clientId)} />
        {state.fieldErrors?.clientId && (
          <p id="trip-client-error" role="alert" className="t-body-s mt-1 text-[var(--md-error)]">
            {state.fieldErrors.clientId[0]}
          </p>
        )}
      </div>

      {/* ── Title ────────────────────────────────────────────────────── */}
      <div>
        <label className="t-title-s mb-1 block" htmlFor="trip-title">
          {NEW_TRIP_COPY.titleLabel}
        </label>
        <p className="t-body-s mb-1.5 text-[var(--md-on-surface-variant)]">
          {NEW_TRIP_COPY.titleHint}
        </p>
        <input
          id="trip-title"
          name="title"
          required
          maxLength={160}
          defaultValue={values.title}
          placeholder={NEW_TRIP_COPY.titlePlaceholder}
          className="input h-10 w-full rounded-xl px-3"
          aria-describedby={state.fieldErrors?.title ? "trip-title-error" : undefined}
        />
        {state.fieldErrors?.title && (
          <p id="trip-title-error" role="alert" className="t-body-s mt-1 text-[var(--md-error)]">
            {state.fieldErrors.title[0]}
          </p>
        )}
      </div>

      {/* ── Travelers ────────────────────────────────────────────────── */}
      <div className="max-w-[220px]">
        <label className="t-title-s mb-1 block" htmlFor="trip-travelers">
          {NEW_TRIP_COPY.travelersLabel}
        </label>
        <p className="t-body-s mb-1.5 text-[var(--md-on-surface-variant)]">
          {NEW_TRIP_COPY.travelersHint}
        </p>
        <input
          id="trip-travelers"
          name="travelerCount"
          type="number"
          min={1}
          max={64}
          defaultValue={values.travelerCount}
          className="input h-10 w-full rounded-xl px-3"
        />
      </div>

      <p className="t-body-s rounded-xl bg-[var(--md-surface-2)] px-3 py-2 text-[var(--md-on-surface-variant)]">
        <Icon name="info" size={12} /> {NEW_TRIP_COPY.startsAsInquiry}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={pending} className="btn btn-orange">
          {pending ? NEW_TRIP_COPY.submitting : NEW_TRIP_COPY.submit}
        </button>
        <Link href="/agent/trips" className="btn btn-tonal">
          {NEW_TRIP_COPY.cancel}
        </Link>
        <button
          type="button"
          disabled
          title={NEW_TRIP_COPY.templateDeferred}
          className="btn btn-text ml-auto"
        >
          {NEW_TRIP_COPY.templateLabel}
          <span className="sr-only"> — {NEW_TRIP_COPY.templateDeferred}</span>
        </button>
      </div>
    </form>
  );
}
