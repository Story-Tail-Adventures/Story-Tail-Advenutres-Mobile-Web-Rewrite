import { TRIP_COPY } from "@/lib/agent/content";

/**
 * §3.4.1's stage vocabulary and URL parsing — deliberately SERVER-FREE.
 *
 * WHY THIS IS NOT IN `trips.ts`. The bulk bar is a client component and needs the stage
 * list. `trips.ts` imports `queries.ts` for `agentIdentity`, which imports
 * `lib/supabase/server.ts`, which imports `next/headers` — so one import from a
 * `"use client"` file drags a server-only module into the browser bundle and the whole
 * route 500s with "This API is only available in Server Components".
 *
 * It typechecks. All 1111 tests pass. It fails only when the page is actually opened, which
 * is the exact shape `hotel-search-decisions` recorded as "the server→client trap tests
 * cannot catch". Nothing in this file may import anything that reaches the server client.
 */

export const TRIP_STATUS_FILTERS = [
  { value: "inquiry", label: TRIP_COPY.filterInquiry },
  { value: "proposal", label: TRIP_COPY.filterProposal },
  { value: "booked", label: TRIP_COPY.filterBooked },
  { value: "in_progress", label: TRIP_COPY.filterTraveling },
  { value: "completed", label: TRIP_COPY.filterCompleted },
  { value: "cancelled", label: TRIP_COPY.filterCancelled },
] as const;

export type TripStatusFilter = (typeof TRIP_STATUS_FILTERS)[number]["value"];

/** The four the screen opens on — work in progress, not a decade of history. */
export const LIVE_STATUSES: TripStatusFilter[] = [
  "inquiry",
  "proposal",
  "booked",
  "in_progress",
];

export type TripQuery = {
  statuses: TripStatusFilter[];
  search: string;
  page: number;
};

/** `?status=` repeated, `?q=`, `?page=`. Unknown values are dropped rather than 400'd. */
export function tripQueryFromParams(params: {
  status?: string | string[];
  q?: string;
  page?: string;
}): TripQuery {
  const raw = params.status === undefined
    ? []
    : Array.isArray(params.status)
      ? params.status
      : [params.status];

  const valid = TRIP_STATUS_FILTERS.map((f) => f.value as string);
  const statuses = raw.filter((s): s is TripStatusFilter => valid.includes(s));

  const page = Number.parseInt(params.page ?? "1", 10);

  return {
    // No status in the URL means the live four, not "everything" — see LIVE_STATUSES.
    statuses: statuses.length > 0 ? statuses : LIVE_STATUSES,
    search: (params.q ?? "").trim(),
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

/** True when the statuses are the untouched default rather than a choice the advisor made. */
export function isDefaultStages(statuses: TripStatusFilter[]): boolean {
  return statuses.length === LIVE_STATUSES.length &&
    LIVE_STATUSES.every((s) => statuses.includes(s));
}
