"use client";

import { useActionState, useSyncExternalStore } from "react";

import {
  bulkSetTripStatusAction,
  type BulkStatusState,
} from "@/app/(agent)/agent/trips/actions";
import { TRIP_COPY } from "@/lib/agent/content";
import { TRIP_STATUS_FILTERS } from "@/lib/agent/tripStatuses";

/**
 * Screen 3.4.1's bulk-select column and the stage change behind it.
 *
 * BUILT ON §3.3.1's BAR, with one thing genuinely different. There the selection was a list
 * of ids; here each checkbox posts `tripId:fromStatus`, because setting a stage OVERWRITES
 * where adding a tag cannot. The stage a row was showing travels with the row, and a trip
 * somebody else moved meanwhile is skipped rather than clobbered.
 *
 * Packed into ONE field value rather than two parallel ones: `getAll("trip")` and
 * `getAll("fromStatus")` would have to stay zipped by position, and nothing in the markup
 * would enforce it.
 *
 * Everything else is §3.3.1's, for §3.3.1's reasons — the selection is not React state, the
 * bar is revealed by `:has()` in CSS so it works before hydration, the receipt lives outside
 * the bar so clearing the selection does not take it away, and the stage select is
 * `required` so React 19's post-action `form.reset()` cannot eat a selection over a
 * validation slip.
 *
 * NO CANCEL OPTION. §3.4.16 is a whole screen for cancelling one trip — impact list,
 * mandatory reason — and it is refused in the action, the Edge Function and the SQL besides.
 */

const SELECT_ALL_ID = "trip-select-all";

const NEVER_CHANGES = () => () => {};
function useHydrated(): boolean {
  return useSyncExternalStore(NEVER_CHANGES, () => true, () => false);
}

export function SelectAllTrips() {
  const hydrated = useHydrated();
  if (!hydrated) return null;

  return (
    <input
      id={SELECT_ALL_ID}
      type="checkbox"
      aria-label={TRIP_COPY.bulkSelectAll}
      className="size-4 cursor-pointer accent-[var(--md-primary)]"
      onChange={(event) => {
        const form = event.currentTarget.form;
        if (!form) return;
        const on = event.currentTarget.checked;
        for (const box of form.querySelectorAll<HTMLInputElement>('input[name="trip"]')) {
          box.checked = on;
        }
        event.currentTarget.indeterminate = false;
      }}
    />
  );
}

export function TripBulkStatusForm({ children }: { children: React.ReactNode }) {
  const [state, formAction, pending] = useActionState<BulkStatusState, FormData>(
    bulkSetTripStatusAction,
    {},
  );

  /** Keeps the header checkbox truthful. Pure DOM — `indeterminate` has no HTML attribute. */
  function syncSelectAll(event: React.FormEvent<HTMLFormElement>) {
    const form = event.currentTarget;
    const all = form.querySelector<HTMLInputElement>(`#${SELECT_ALL_ID}`);
    if (!all) return;
    const boxes = [...form.querySelectorAll<HTMLInputElement>('input[name="trip"]')];
    const ticked = boxes.filter((b) => b.checked).length;
    all.checked = ticked > 0 && ticked === boxes.length;
    all.indeterminate = ticked > 0 && ticked < boxes.length;
  }

  return (
    <form action={formAction} onChange={syncSelectAll} className="bulk-form">
      {(state.message || state.error) && (
        <p
          role="status"
          className={`t-body-s mb-2 rounded-xl px-3 py-2 ${
            state.error
              ? "bg-[var(--md-error-container)] text-[var(--md-on-error-container)]"
              : "bg-[var(--md-secondary-container)] text-[var(--md-on-secondary-container)]"
          }`}
        >
          {state.error ?? state.message}
        </p>
      )}

      {children}

      <div className="bulk-bar mt-2 flex-wrap items-center gap-2 rounded-2xl border border-[var(--md-outline-variant)] bg-[var(--md-surface-2)] px-3 py-2">
        <span className="t-body-s font-semibold">{TRIP_COPY.bulkLegend}</span>
        <label className="sr-only" htmlFor="bulk-status">
          {TRIP_COPY.colStage}
        </label>
        <select
          id="bulk-status"
          name="toStatus"
          required
          defaultValue=""
          className="input h-8 min-w-0 rounded-full px-3 text-[12.5px]"
        >
          <option value="" disabled>
            {TRIP_COPY.colStage}…
          </option>
          {TRIP_STATUS_FILTERS.filter((f) => f.value !== "cancelled").map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <button type="submit" disabled={pending} className="btn btn-orange btn-sm shrink-0">
          {pending ? TRIP_COPY.bulkWorking : TRIP_COPY.bulkApply}
        </button>
      </div>
    </form>
  );
}
