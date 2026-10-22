import { COMMISSION_COPY } from "@/lib/agent/content";

/**
 * §3.7.2's status vocabulary and URL parsing — deliberately SERVER-FREE, for the reason
 * `tripStatuses.ts` gives: anything a client component might import must not reach
 * `lib/supabase/server.ts`, or the route 500s at request time while every test passes.
 */

/**
 * Five statuses, five chips. The chip KIND is the design prototype's own mapping
 * (agent-commission.jsx's StatusChip): expected reads as a fresh inquiry, invoiced as a
 * proposal out, received as booked and settled, disputed as payment due, lost as past.
 */
export const COMMISSION_STATUS_FILTERS = [
  { value: "expected", label: COMMISSION_COPY.filterExpected, chip: "inquiry" },
  { value: "invoiced", label: COMMISSION_COPY.filterInvoiced, chip: "proposal" },
  { value: "received", label: COMMISSION_COPY.filterReceived, chip: "booked" },
  { value: "disputed", label: COMMISSION_COPY.filterDisputed, chip: "due" },
  { value: "lost", label: COMMISSION_COPY.filterLost, chip: "past" },
] as const;

export type CommissionStatus = (typeof COMMISSION_STATUS_FILTERS)[number]["value"];

export type LedgerQuery = {
  /** Empty means every status — unlike the trip list, the ledger opens on all of it. */
  statuses: CommissionStatus[];
  supplierId: string | null;
  tripId: string | null;
  /** ISO dates, inclusive, on the trip's START date. */
  travelFrom: string | null;
  travelTo: string | null;
  page: number;
};

export type LedgerParams = {
  status?: string | string[];
  supplier?: string;
  trip?: string;
  from?: string;
  to?: string;
  page?: string;
};

/** See `ledgerQueryFromParams`: the offset is a Postgres `integer`. */
const MAX_PAGE = 100_000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A real calendar date or null. `2026-02-31` is shaped right and is not a date; Postgres
 * would refuse it, the read would fail, and the advisor would get a retry screen for a typo.
 */
function isoDate(value: string | undefined): string | null {
  // Year 0000 is shaped right too, and Postgres has no year zero.
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) return null;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value ? value : null;
}

/**
 * `?status=` repeated, `?supplier=`, `?trip=`, `?from=`, `?to=`, `?page=`. Anything malformed
 * is DROPPED rather than passed on: a uuid column handed "abc" makes PostgREST answer 400,
 * which reads on this screen as "the ledger could not be loaded".
 */
export function ledgerQueryFromParams(params: LedgerParams): LedgerQuery {
  const raw = params.status === undefined
    ? []
    : Array.isArray(params.status) ? params.status : [params.status];
  const valid = COMMISSION_STATUS_FILTERS.map((f) => f.value as string);
  const statuses = [...new Set(raw.filter((s): s is CommissionStatus => valid.includes(s)))];

  let travelFrom = isoDate(params.from);
  let travelTo = isoDate(params.to);
  // A range typed backwards is still a range. Swapping it beats an empty table that the
  // advisor has to puzzle out.
  if (travelFrom && travelTo && travelFrom > travelTo) {
    [travelFrom, travelTo] = [travelTo, travelFrom];
  }

  const page = Number.parseInt(params.page ?? "1", 10);

  return {
    statuses,
    supplierId: params.supplier && UUID.test(params.supplier) ? params.supplier : null,
    tripId: params.trip && UUID.test(params.trip) ? params.trip : null,
    travelFrom,
    travelTo,
    // Capped: the offset is a Postgres `integer`, and `?page=99999999999` would overflow it
    // into a 400 — the retry screen, for a URL typo. 100,000 pages is 2.5 million lines.
    page: Number.isFinite(page) && page > 0 ? Math.min(page, MAX_PAGE) : 1,
  };
}

/** True when anything but the page narrows the ledger. */
export function isFiltered(query: LedgerQuery): boolean {
  return query.statuses.length > 0 || query.supplierId !== null || query.tripId !== null ||
    query.travelFrom !== null || query.travelTo !== null;
}

/**
 * The ledger URL for a query. One builder for the paginator, the trip chip's "show every
 * trip" link and Trip Detail's entry point, so none of them can drop a filter the others keep.
 */
export function ledgerHref(query: LedgerQuery): string {
  return withFilters("/agent/commission/ledger", query, true);
}

/**
 * The CSV export for the same filters — every page of them, so no `page`. One builder with
 * `ledgerHref` so the file can never be filtered differently from the screen it came from.
 */
export function ledgerExportHref(query: LedgerQuery): string {
  return withFilters("/agent/commission/ledger/export", query, false);
}

function withFilters(path: string, query: LedgerQuery, withPage: boolean): string {
  const params = new URLSearchParams();
  for (const s of query.statuses) params.append("status", s);
  if (query.supplierId) params.set("supplier", query.supplierId);
  if (query.tripId) params.set("trip", query.tripId);
  if (query.travelFrom) params.set("from", query.travelFrom);
  if (query.travelTo) params.set("to", query.travelTo);
  if (withPage && query.page > 1) params.set("page", String(query.page));
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

/** The empty query, for links that start from nothing (a tile, Trip Detail). */
export const EMPTY_LEDGER_QUERY: LedgerQuery = {
  statuses: [],
  supplierId: null,
  tripId: null,
  travelFrom: null,
  travelTo: null,
  page: 1,
};
