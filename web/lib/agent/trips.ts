import {
  callAgentRead,
  type AgentTripRosterRow,
  type AgentTripSummaryRow,
} from "@/lib/agent/api";
import { agentIdentity, cents, money, relativeDay } from "@/lib/agent/queries";
import { tripStatusPresentation, type StatusChip, type TripStatus } from "@/lib/trips/status";
import type { TripQuery, TripStatusFilter } from "@/lib/agent/tripStatuses";

/**
 * Screen 3.4.1's view models — a sibling of `clients.ts`, built the same way for the same
 * reasons: plain JSON-safe data out, formatting done here in the agent's own time zone, and
 * `null` from a loader means the READ failed. An empty list is a populated object with
 * `rows: []`, because an advisor with no trips and an advisor whose read fell over need
 * different screens.
 */

/** Matches `agent_trip_roster`'s own default so the two cannot drift. */
export const TRIP_PAGE_SIZE = 25;

/**
 * The stage vocabulary and URL parsing live in `tripStatuses.ts`, which imports nothing that
 * reaches the server client — the bulk bar is a client component and needs them. Re-exported
 * here so a server-side caller has one import rather than two.
 */
export {
  TRIP_STATUS_FILTERS,
  LIVE_STATUSES,
  tripQueryFromParams,
  isDefaultStages,
  type TripStatusFilter,
  type TripQuery,
} from "@/lib/agent/tripStatuses";

export type TripRosterRow = {
  tripId: string;
  title: string;
  clientId: string;
  clientName: string;
  status: TripStatus;
  /** What the row was SHOWING — the bulk write's per-trip guard posts this back. */
  statusChip: StatusChip;
  statusLabel: string;
  travelLabel: string | null;
  destinationLabel: string | null;
  travelerCount: number;
  valueLabel: string;
  commissionLabel: string | null;
  componentCount: number;
  lastActivityLabel: string | null;
  version: number;
};

export type TripRoster = {
  rows: TripRosterRow[];
  counts: Record<TripStatusFilter, number>;
  total: number;
  pipelineLabel: string | null;
  page: number;
  pageCount: number;
  pageSize: number;
};

/** `Aug 12 – 19, 2026`, or the year on both when they differ. Null when there are no dates. */
function travelLabel(start: string | null, end: string | null, timeZone: string): string | null {
  if (!start) return null;
  const opts: Intl.DateTimeFormatOptions = { timeZone, month: "short", day: "numeric" };
  const s = new Date(`${start}T12:00:00Z`);
  const startText = new Intl.DateTimeFormat("en-US", opts).format(s);
  const startYear = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric" }).format(s);

  if (!end) return `${startText}, ${startYear}`;

  const e = new Date(`${end}T12:00:00Z`);
  const endYear = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric" }).format(e);
  const endText = new Intl.DateTimeFormat("en-US", opts).format(e);

  if (startYear !== endYear) return `${startText}, ${startYear} – ${endText}, ${endYear}`;
  // Same month, so the month is not repeated: "Aug 12 – 19, 2026".
  const endDay = new Intl.DateTimeFormat("en-US", { timeZone, day: "numeric" }).format(e);
  const sameMonth = startText.split(" ")[0] === endText.split(" ")[0];
  return sameMonth
    ? `${startText} – ${endDay}, ${endYear}`
    : `${startText} – ${endText}, ${endYear}`;
}

export async function loadTripRoster(query: TripQuery): Promise<TripRoster | null> {
  const { timeZone } = await agentIdentity();

  const [rowsResult, summaryResult] = await Promise.all([
    callAgentRead<AgentTripRosterRow>("agent_trip_roster", {
      p_status: query.statuses,
      p_client_id: null,
      p_search: query.search.length > 0 ? query.search : null,
      p_limit: TRIP_PAGE_SIZE,
      p_offset: (query.page - 1) * TRIP_PAGE_SIZE,
    }),
    callAgentRead<AgentTripSummaryRow>("agent_trip_roster_summary", {}),
  ]);

  if (!rowsResult.ok || !summaryResult.ok) return null;

  const raw = rowsResult.rows;
  const summary = summaryResult.rows[0];

  // `total_count` rides on every row and is the count BEFORE the page window. With no rows
  // there is nothing to read it off, and zero is the right answer anyway.
  const total = raw[0]?.total_count ?? 0;
  const today = raw[0]?.as_of_date ?? new Date().toISOString().slice(0, 10);

  const rows: TripRosterRow[] = raw.map((r) => {
    const status = r.status as TripStatus;
    // Derived HERE rather than in the component, because it needs the agent's `today` and
    // the component has no business knowing what day it is. The same call `clientDetail.ts`
    // makes, for the same reason.
    const presentation = tripStatusPresentation({
      status,
      nextUnpaidDueDate: null,
      today,
    });

    const destinations = r.destinations ?? [];

    return {
      tripId: r.trip_id,
      title: r.title,
      clientId: r.client_id,
      clientName: r.client_display_name,
      status,
      statusChip: presentation.chip,
      statusLabel: presentation.label,
      travelLabel: travelLabel(r.start_date, r.end_date, timeZone),
      // One destination reads as itself; several get a count, because three place names in a
      // table cell wrap into three lines and say less than "Nassau +2".
      destinationLabel: destinations.length === 0
        ? null
        : destinations.length === 1
          ? destinations[0]
          : `${destinations[0]} +${destinations.length - 1}`,
      travelerCount: r.traveler_count,
      valueLabel: money(r.total_value_cents, r.currency),
      // A dash, never "$0.00": a trip with no commission yet has not earned nothing, it has
      // not been priced. Same call §3.3.1's lifetime column makes.
      commissionLabel: cents(r.total_commission_cents) === 0
        ? null
        : money(r.total_commission_cents, r.currency),
      componentCount: r.component_count,
      lastActivityLabel: relativeDay(today, r.last_activity_at?.slice(0, 10) ?? null),
      version: r.version,
    };
  });

  const counts = {
    inquiry: summary?.inquiry_count ?? 0,
    proposal: summary?.proposal_count ?? 0,
    booked: summary?.booked_count ?? 0,
    in_progress: summary?.in_progress_count ?? 0,
    completed: summary?.completed_count ?? 0,
    cancelled: summary?.cancelled_count ?? 0,
  } satisfies Record<TripStatusFilter, number>;

  return {
    rows,
    counts,
    total,
    pipelineLabel: summary && cents(summary.pipeline_cents) > 0
      ? money(summary.pipeline_cents, summary.pipeline_currency)
      : null,
    page: query.page,
    pageCount: Math.max(1, Math.ceil(total / TRIP_PAGE_SIZE)),
    pageSize: TRIP_PAGE_SIZE,
  };
}
