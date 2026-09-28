"use client";

import Link from "next/link";
import { useActionState } from "react";

import {
  generateItineraryAction,
  saveActivityAction,
  saveDayAction,
  type GenerateState,
} from "@/app/(agent)/agent/trips/[tripId]/itinerary/actions";
import { Icon } from "@/components/ui/Icon";
import { ITINERARY_COPY } from "@/lib/agent/content";
import {
  BLOCKS,
  type ActivityValues,
  type DayValues,
  type ItineraryState,
} from "@/lib/agent/itinerary";

/**
 * §3.4.14's three client islands: the generate button, the day form, the entry form.
 *
 * ONE FILE, THREE COMPONENTS, because all three are small `useActionState` wrappers and
 * splitting them would be three files of imports around one hook each. The page decides
 * which of the two forms is open from the URL.
 */

/**
 * The Key actions line's "Auto-generate".
 *
 * IT SAYS WHAT IT WILL DO BEFORE IT IS PRESSED. An advisor who has spent an hour writing
 * needs to know the button will not touch it beforehand, not after — so the hint is next to
 * the control rather than in a confirmation dialog it would learn to dismiss.
 *
 * AND IT REPORTS WHICH OF THREE THINGS HAPPENED. "Added what was missing", "already up to
 * date", and "the trip has no dates" are different facts, and a page that looked the same
 * in all three would make the advisor press it again to find out.
 */
export function GenerateItineraryButton({ tripId }: { tripId: string }) {
  const [state, formAction, pending] = useActionState<GenerateState, FormData>(
    generateItineraryAction,
    {},
  );

  return (
    <div>
      <form action={formAction} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="tripId" value={tripId} />
        <button type="submit" disabled={pending} className="btn btn-orange btn-sm">
          {pending ? ITINERARY_COPY.generateWorking : ITINERARY_COPY.generateLabel}
        </button>
        <button
          type="button"
          disabled
          title={ITINERARY_COPY.previewDeferred}
          className="btn btn-outlined btn-sm"
        >
          {ITINERARY_COPY.previewLabel}
          <span className="sr-only"> — {ITINERARY_COPY.previewDeferred}</span>
        </button>
      </form>

      <p className="t-body-s mt-1.5 text-[var(--md-on-surface-variant)]">
        <Icon name="info" size={12} /> {ITINERARY_COPY.generateHint}
      </p>

      {state.message && (
        <p
          // `role="status"` rather than `alert`: two of the three outcomes are ordinary
          // information and an assertive announcement for "already up to date" would be
          // the screen shouting about nothing.
          role="status"
          className={`t-body-s mt-1.5 rounded-xl px-3 py-2 ${
            state.kind === "error"
              ? "bg-[var(--md-error-container)] text-[var(--md-on-error-container)]"
              : "bg-[var(--md-surface-2)] text-[var(--md-on-surface-variant)]"
          }`}
        >
          {state.message}
        </p>
      )}
    </div>
  );
}

export function DayForm({ tripId, initial }: { tripId: string; initial: DayValues }) {
  const [state, formAction, pending] = useActionState<ItineraryState, FormData>(
    saveDayAction,
    {},
  );
  const values = state.dayValues ?? initial;
  const isEdit = values.dayId !== "";

  return (
    <form action={formAction} className="card p-4">
      <input type="hidden" name="tripId" value={tripId} />
      {isEdit && <input type="hidden" name="dayId" value={values.dayId} />}

      <h2 className="t-title-l m-0 mb-3">
        {isEdit ? ITINERARY_COPY.editDay : ITINERARY_COPY.addDay}
      </h2>

      {state.formError && (
        <p role="alert" className="t-body-s mb-3 rounded-xl bg-[var(--md-error-container)] px-3 py-2 text-[var(--md-on-error-container)]">
          {state.formError}
        </p>
      )}

      <div className="flex flex-col gap-3">
        <div>
          <label className="field-label" htmlFor="day-date">
            {ITINERARY_COPY.dayDateLabel}
          </label>
          <input
            id="day-date"
            name="date"
            type="date"
            defaultValue={values.date}
            className="input h-10 w-full rounded-xl px-3"
          />
          {state.fieldErrors?.date && (
            <p role="alert" className="t-body-s mt-1 text-[var(--md-error)]">
              {state.fieldErrors.date[0]}
            </p>
          )}
        </div>

        <div>
          <label className="field-label" htmlFor="day-label">
            {ITINERARY_COPY.dayLabelLabel}
          </label>
          <input
            id="day-label"
            name="label"
            maxLength={120}
            defaultValue={values.label}
            placeholder={ITINERARY_COPY.dayLabelPlaceholder}
            className="input h-10 w-full rounded-xl px-3"
          />
          <p className="t-body-s mt-1 text-[var(--md-on-surface-variant)]">
            {ITINERARY_COPY.dayLabelHint}
          </p>
        </div>

        <div>
          <label className="field-label" htmlFor="day-summary">
            {ITINERARY_COPY.daySummaryLabel}
          </label>
          <textarea
            id="day-summary"
            name="summary"
            rows={3}
            maxLength={4000}
            defaultValue={values.summary}
            className="input w-full rounded-xl px-3 py-2"
          />
          <p className="t-body-s mt-1 text-[var(--md-on-surface-variant)]">
            {ITINERARY_COPY.daySummaryHint}
          </p>
        </div>
      </div>

      <Buttons tripId={tripId} pending={pending} />
    </form>
  );
}

export function ActivityForm({
  tripId,
  initial,
  days,
  fromBooking,
}: {
  tripId: string;
  initial: ActivityValues;
  days: { dayId: string; dayNumber: number; dateLabel: string | null }[];
  fromBooking: boolean;
}) {
  const [state, formAction, pending] = useActionState<ItineraryState, FormData>(
    saveActivityAction,
    {},
  );
  const values = state.activityValues ?? initial;
  const isEdit = values.activityId !== "";
  const err = (n: string) => state.fieldErrors?.[n]?.[0];

  return (
    <form action={formAction} className="card p-4">
      <input type="hidden" name="tripId" value={tripId} />
      {isEdit && <input type="hidden" name="activityId" value={values.activityId} />}

      <h2 className="t-title-l m-0 mb-3">
        {isEdit ? ITINERARY_COPY.editActivity : ITINERARY_COPY.addActivity}
      </h2>

      {/* An entry generated from a booking says so, because editing the prose here does
          NOT change the booking — and an advisor who assumed it did would go looking for
          the flight number they just corrected. */}
      {fromBooking && (
        <p className="t-body-s mb-3 rounded-xl bg-[var(--md-surface-2)] px-3 py-2 text-[var(--md-on-surface-variant)]">
          <Icon name="info" size={12} /> {ITINERARY_COPY.fromBookingHint}
        </p>
      )}

      {state.formError && (
        <p role="alert" className="t-body-s mb-3 rounded-xl bg-[var(--md-error-container)] px-3 py-2 text-[var(--md-on-error-container)]">
          {state.formError}
        </p>
      )}

      <div className="flex flex-col gap-3">
        <div>
          <label className="field-label" htmlFor="act-day">
            Day
          </label>
          <select
            id="act-day"
            name="dayId"
            defaultValue={values.dayId}
            className="input h-10 w-full rounded-xl px-3"
          >
            {days.map((d) => (
              <option key={d.dayId} value={d.dayId}>
                Day {d.dayNumber}
                {d.dateLabel ? ` · ${d.dateLabel}` : ""}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="field-label" htmlFor="act-title">
            {ITINERARY_COPY.activityTitleLabel}
          </label>
          <input
            id="act-title"
            name="title"
            required
            maxLength={200}
            defaultValue={values.title}
            placeholder={ITINERARY_COPY.activityTitlePlaceholder}
            className="input h-10 w-full rounded-xl px-3"
            aria-describedby={err("title") ? "act-title-error" : undefined}
          />
          {err("title") && (
            <p id="act-title-error" role="alert" className="t-body-s mt-1 text-[var(--md-error)]">
              {err("title")}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label" htmlFor="act-start">
              {ITINERARY_COPY.startsLabel}
            </label>
            <input id="act-start" name="startTime" type="time" defaultValue={values.startTime}
              className="input h-10 w-full rounded-xl px-3" />
          </div>
          <div>
            <label className="field-label" htmlFor="act-end">
              {ITINERARY_COPY.endsLabel}
            </label>
            <input id="act-end" name="endTime" type="time" defaultValue={values.endTime}
              className="input h-10 w-full rounded-xl px-3" />
          </div>
        </div>

        <div>
          <label className="field-label" htmlFor="act-block">
            {ITINERARY_COPY.blockLabel}
          </label>
          <select id="act-block" name="block" defaultValue={values.block}
            className="input h-10 w-full rounded-xl px-3">
            {BLOCKS.map((b) => (
              <option key={b.value} value={b.value}>{b.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="field-label" htmlFor="act-body">
            {ITINERARY_COPY.activityBodyLabel}
          </label>
          <textarea id="act-body" name="body" rows={4} maxLength={4000}
            defaultValue={values.body} className="input w-full rounded-xl px-3 py-2" />
          <p className="t-body-s mt-1 text-[var(--md-on-surface-variant)]">
            {ITINERARY_COPY.activityBodyHint}
          </p>
        </div>

        <div>
          <label className="field-label" htmlFor="act-tip">
            {ITINERARY_COPY.tipLabel}
          </label>
          <textarea id="act-tip" name="gyasisTip" rows={3} maxLength={2000}
            defaultValue={values.gyasisTip} className="input w-full rounded-xl px-3 py-2" />
          <p className="t-body-s mt-1 text-[var(--md-on-surface-variant)]">
            {ITINERARY_COPY.tipHint}
          </p>
        </div>

        <div>
          <label className="field-label" htmlFor="act-where">
            {ITINERARY_COPY.whereLabel}
          </label>
          <input id="act-where" name="location" maxLength={200} defaultValue={values.location}
            className="input h-10 w-full rounded-xl px-3" />
        </div>

        <div>
          <label className="field-label" htmlFor="act-address">
            {ITINERARY_COPY.addressLabel}
          </label>
          <input id="act-address" name="address" maxLength={200} defaultValue={values.address}
            className="input h-10 w-full rounded-xl px-3" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label" htmlFor="act-phone">
              {ITINERARY_COPY.phoneLabel}
            </label>
            <input id="act-phone" name="phone" maxLength={40} defaultValue={values.phone}
              className="input h-10 w-full rounded-xl px-3" />
          </div>
          <div>
            <label className="field-label" htmlFor="act-conf">
              {ITINERARY_COPY.confirmationLabel}
            </label>
            <input id="act-conf" name="confirmationNumber" maxLength={80}
              defaultValue={values.confirmationNumber}
              className="input h-10 w-full rounded-xl px-3 font-mono" />
          </div>
        </div>
      </div>

      <Buttons tripId={tripId} pending={pending} />
    </form>
  );
}

function Buttons({ tripId, pending }: { tripId: string; pending: boolean }) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <button type="submit" disabled={pending} className="btn btn-orange">
        {pending ? ITINERARY_COPY.saving : ITINERARY_COPY.save}
      </button>
      <Link href={`/agent/trips/${tripId}/itinerary`} className="btn btn-tonal">
        {ITINERARY_COPY.cancel}
      </Link>
    </div>
  );
}
