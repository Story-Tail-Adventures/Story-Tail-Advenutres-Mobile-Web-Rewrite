import Form from "next/form";

import { TRIP_COPY } from "@/lib/agent/content";
import {
  isDefaultStages,
  TRIP_STATUS_FILTERS,
  type TripQuery,
  type TripStatusFilter,
} from "@/lib/agent/tripStatuses";

/**
 * Screen 3.4.1's search box and stage chips.
 *
 * A GET FORM VIA `next/form`, exactly as §3.3.1's filters are and for the same reasons: the
 * filters round-trip through the URL, so a filtered list is shareable, the back button means
 * what it says, the page stays a server component, and it all works with JavaScript off.
 *
 * SIX CHIPS, NOT THE PROTOTYPE'S FOUR — see `TRIP_STATUS_FILTERS`. They are CHECKBOXES, not
 * radios, which is where this departs from §3.3.1's status filter: a client is active or
 * archived and never both, but "show me proposals and booked" is an ordinary thing to want,
 * and the accessor already takes an array.
 *
 * NO `page` INPUT, deliberately. Applying a filter while on page 3 of the old result set
 * would land past the end of the new one and render an empty table over a non-zero count —
 * the trap §3.3.1's filters record.
 */
export function TripRosterFilters({
  query,
  counts,
}: {
  query: TripQuery;
  counts: Record<TripStatusFilter, number>;
}) {
  const picked = new Set(query.statuses);
  // The default (the live four) is not a selection the advisor made, so the chips read as
  // unticked rather than showing four highlighted ones nobody chose.
  const isDefault = isDefaultStages(query.statuses);

  return (
    <Form action="/agent/trips" className="mb-3 flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="trip-q">
          {TRIP_COPY.searchLabel}
        </label>
        <input
          id="trip-q"
          type="search"
          name="q"
          defaultValue={query.search}
          placeholder={TRIP_COPY.searchPlaceholder}
          className="input h-9 min-w-0 flex-1 rounded-full px-4"
        />
        <button type="submit" className="btn btn-tonal btn-sm shrink-0">
          {TRIP_COPY.searchLabel}
        </button>
      </div>

      <fieldset className="flex flex-wrap items-center gap-1.5">
        <legend className="sr-only">{TRIP_COPY.colStage}</legend>
        {TRIP_STATUS_FILTERS.map((f) => (
          <label key={f.value} className="chip chip-filter h-7 cursor-pointer px-3">
            <input
              type="checkbox"
              name="status"
              value={f.value}
              defaultChecked={!isDefault && picked.has(f.value)}
              className="sr-only"
            />
            {f.label}
            <span className="ml-1 opacity-60">{counts[f.value]}</span>
          </label>
        ))}
      </fieldset>
    </Form>
  );
}
