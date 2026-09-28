"use client";

import Link from "next/link";
import { useActionState } from "react";

import { saveMilestoneAction } from "@/app/(agent)/agent/trips/[tripId]/payments/actions";
import { SCHEDULE_COPY } from "@/lib/agent/content";
import {
  MILESTONE_KINDS,
  emptyMilestone,
  type MilestoneValues,
  type ScheduleState,
} from "@/lib/agent/payments";

/**
 * §3.4.15's add/edit form — the schedule half only.
 *
 * NOTHING HERE POSTS `paid_cents` OR `status`. Those belong to the row's own status control
 * in `PaymentScheduleTable`, and keeping them out of this form is what makes a label edit
 * incapable of moving `trip.total_paid_cents` — the figure a traveler is shown as their
 * outstanding balance when they authorize a card. The separation runs SQL → route → action
 * → form, and this is its last layer.
 */
export function MilestoneForm({
  tripId,
  initial,
}: {
  tripId: string;
  initial?: MilestoneValues;
}) {
  const [state, formAction, pending] = useActionState<ScheduleState, FormData>(
    saveMilestoneAction,
    {},
  );

  const values = state.values ?? initial ?? emptyMilestone();
  const isEdit = values.milestoneId !== "";
  const err = (name: string) => state.fieldErrors?.[name]?.[0];

  return (
    <form action={formAction} className="card p-4">
      <input type="hidden" name="tripId" value={tripId} />
      {isEdit && <input type="hidden" name="milestoneId" value={values.milestoneId} />}

      <h2 className="t-title-l m-0 mb-3">
        {isEdit ? SCHEDULE_COPY.editHeading : SCHEDULE_COPY.addHeading}
      </h2>

      {state.formError && (
        <p
          role="alert"
          className="t-body-s mb-3 rounded-xl bg-[var(--md-error-container)] px-3 py-2 text-[var(--md-on-error-container)]"
        >
          {state.formError}
        </p>
      )}

      <div className="flex flex-col gap-3">
        <div>
          <label className="field-label" htmlFor="milestone-kind">
            {SCHEDULE_COPY.kindLabel}
          </label>
          <select
            id="milestone-kind"
            name="kind"
            defaultValue={values.kind}
            className="input h-10 w-full rounded-xl px-3"
          >
            {MILESTONE_KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="field-label" htmlFor="milestone-label">
            {SCHEDULE_COPY.labelLabel}
          </label>
          <input
            id="milestone-label"
            name="label"
            required
            maxLength={120}
            defaultValue={values.label}
            placeholder={SCHEDULE_COPY.labelPlaceholder}
            className="input h-10 w-full rounded-xl px-3"
            aria-describedby={err("label") ? "milestone-label-error" : undefined}
          />
          {err("label") && (
            <p id="milestone-label-error" role="alert" className="t-body-s mt-1 text-[var(--md-error)]">
              {err("label")}
            </p>
          )}
        </div>

        <div>
          <label className="field-label" htmlFor="milestone-amount">
            {SCHEDULE_COPY.amountLabel}
          </label>
          <input
            id="milestone-amount"
            name="amount"
            inputMode="decimal"
            defaultValue={values.amount}
            placeholder="0.00"
            className="input h-10 w-full rounded-xl px-3 font-mono"
            aria-describedby={err("amount") ? "milestone-amount-error" : undefined}
          />
          <p className="t-body-s mt-1 text-[var(--md-on-surface-variant)]">
            {SCHEDULE_COPY.amountHint}
          </p>
          {err("amount") && (
            <p id="milestone-amount-error" role="alert" className="t-body-s mt-1 text-[var(--md-error)]">
              {err("amount")}
            </p>
          )}
        </div>

        <div>
          <label className="field-label" htmlFor="milestone-due">
            {SCHEDULE_COPY.dueLabel}
          </label>
          <input
            id="milestone-due"
            name="dueDate"
            type="date"
            defaultValue={values.dueDate}
            className="input h-10 w-full rounded-xl px-3"
          />
          <p className="t-body-s mt-1 text-[var(--md-on-surface-variant)]">
            {SCHEDULE_COPY.dueHint}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="submit" disabled={pending} className="btn btn-orange">
          {pending ? SCHEDULE_COPY.saving : SCHEDULE_COPY.save}
        </button>
        {isEdit && (
          <Link href={`/agent/trips/${tripId}/payments`} className="btn btn-tonal">
            {SCHEDULE_COPY.cancel}
          </Link>
        )}
      </div>
    </form>
  );
}
