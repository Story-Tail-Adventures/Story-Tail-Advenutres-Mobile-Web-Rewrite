import { createClient } from "@/lib/supabase/server";
import { daysUntilDeparture, tripStatusPresentation, type TripStatus } from "./status";

/**
 * Server-side reads for the §2.2 screens.
 *
 * EVERY SELECT NAMES ITS COLUMNS, and that is not a style preference — it is required.
 * `trip_read_policies` revokes the table-level SELECT grant and grants back a column list,
 * so `select("*")` raises 42501 rather than returning fewer columns. The reference
 * implementation for this shape is
 * web/app/(onboarding)/onboarding/connect/page.tsx, which does the same for `trip`.
 *
 * These run on the caller's own session, never the service role: the policies added in
 * 20260907031255 are what scope the rows, and a service-role read here would bypass the
 * very thing that makes the data safe to render.
 *
 * `archived_at IS NULL` is in the policies for these tables, so it is NOT repeated in the
 * queries — repeating it would imply the policy did not cover it.
 */

/** ISO `yyyy-mm-dd` in UTC. The countdown math is UTC-midnight based; see status.ts. */
export function todayIsoUtc(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export type DashboardTrip = {
  id: string;
  title: string;
  tripType: string;
  status: TripStatus;
  startDate: string | null;
  endDate: string | null;
  destinations: string[];
  travelerCount: number;
  totalValueCents: number;
  totalPaidCents: number;
  currency: string;
  /** Derived, so web and native cannot disagree — see status.ts. */
  chip: string;
  statusLabel: string;
  daysUntil: number | null;
};

export type DashboardData = {
  /** The trip the hero counts down to, or null. */
  upcoming: DashboardTrip | null;
  /** `inquiry` and `proposal` — things Gyasi is still working on. */
  inPlanning: DashboardTrip[];
  /** `completed`, newest first. */
  past: DashboardTrip[];
  /** The soonest unpaid milestone on the upcoming trip, for the action-needed card. */
  nextPayment: {
    label: string;
    amountCents: number;
    currency: string;
    dueDate: string | null;
    daysUntilDue: number | null;
  } | null;
  /** Whether the upcoming trip's itinerary is published and therefore readable. */
  itineraryReady: boolean;
  /** The last thing Gyasi said, for the advisor card. */
  latestMessage: {
    body: string;
    createdAt: string;
    tripId: string | null;
    conversationId: string;
    unread: number;
  } | null;
};

/**
 * The column lists are single unbroken string literals at each call site, and they have to
 * be. `supabase-js` infers the row type from the literal passed to `.select()` — a const, or
 * even a `"a" + "b"` concatenation, degrades every field to `GenericStringError`, so
 * `row.status` stops type-checking and the generated types buy nothing. Long lines here are
 * the price of that inference.
 */
function toDashboardTrip(
  row: Record<string, unknown>,
  today: string,
  nextUnpaidDueDate: string | null = null,
): DashboardTrip {
  const status = row.status as TripStatus;
  const presentation = tripStatusPresentation({ status, today, nextUnpaidDueDate });
  return {
    id: row.id as string,
    title: row.title as string,
    tripType: row.trip_type as string,
    status,
    startDate: (row.start_date as string | null) ?? null,
    endDate: (row.end_date as string | null) ?? null,
    destinations: (row.destinations as string[] | null) ?? [],
    travelerCount: (row.traveler_count as number | null) ?? 1,
    totalValueCents: Number(row.total_value_cents ?? 0),
    totalPaidCents: Number(row.total_paid_cents ?? 0),
    currency: (row.currency as string | null) ?? "USD",
    chip: presentation.chip,
    statusLabel: presentation.label,
    daysUntil: daysUntilDeparture(row.start_date as string | null, today),
  };
}

/**
 * Everything Screen 2.2.1 renders, in five queries.
 *
 * Five rather than one join because PostgREST's embedded-resource syntax would need
 * foreign-key relationships it cannot see through RLS in the shape we want, and because
 * these are all single-digit row counts — BRD §4.3 sizes the whole platform at 20–40 active
 * trips. A join would be premature.
 *
 * Returns null only when there is no session; an empty account returns a DashboardData with
 * every field empty, because "no trips" is a state the screen renders rather than an error.
 */
export async function loadDashboard(today = todayIsoUtc()): Promise<DashboardData | null> {
  const supabase = await createClient();

  const { data: tripRows, error } = await supabase
    .from("trip")
    .select("id, title, trip_type, status, start_date, end_date, destinations, traveler_count, total_value_cents, total_paid_cents, currency")
    .order("start_date", { ascending: true, nullsFirst: false });

  if (error) return null;
  const trips = tripRows ?? [];

  // The hero: the soonest trip that has not finished. `in_progress` outranks `booked`
  // because somebody who is already travelling should see that trip, not the next one.
  const active = trips.filter(
    (t) => t.status === "booked" || t.status === "in_progress",
  );
  const traveling = active.find((t) => t.status === "in_progress");
  const upcomingRow =
    traveling ??
    active.find((t) => !t.start_date || daysUntilDeparture(t.start_date, today) !== null) ??
    null;

  let nextPayment: DashboardData["nextPayment"] = null;
  let itineraryReady = false;
  let nextUnpaidDueDate: string | null = null;

  if (upcomingRow) {
    const { data: milestones } = await supabase
      .from("payment_milestone")
      .select("label, amount_cents, currency, due_date, status, order_index")
      .eq("trip_id", upcomingRow.id)
      .neq("status", "paid")
      .neq("status", "waived")
      .order("order_index", { ascending: true });

    const next = milestones?.[0];
    if (next) {
      nextUnpaidDueDate = next.due_date ?? null;
      nextPayment = {
        label: next.label,
        amountCents: Number(next.amount_cents),
        currency: next.currency,
        dueDate: next.due_date ?? null,
        daysUntilDue: next.due_date ? daysUntilDeparture(next.due_date, today) : null,
      };
    }

    // `published_at` is the access boundary, not just a flag: an unpublished itinerary is
    // invisible to this session entirely, so a row coming back at all means it is readable.
    const { data: itinerary } = await supabase
      .from("itinerary")
      .select("id, published_at")
      .eq("trip_id", upcomingRow.id)
      .maybeSingle();
    itineraryReady = Boolean(itinerary?.published_at);
  }

  const { data: conversations } = await supabase
    .from("conversation")
    .select("id, trip_id, last_message_preview, last_message_at, client_unread_count")
    .order("last_message_at", { ascending: false })
    .limit(1);

  const conversation = conversations?.[0];
  const latestMessage = conversation?.last_message_preview
    ? {
        body: conversation.last_message_preview,
        createdAt: conversation.last_message_at,
        tripId: conversation.trip_id ?? null,
        conversationId: conversation.id,
        unread: conversation.client_unread_count ?? 0,
      }
    : null;

  return {
    upcoming: upcomingRow ? toDashboardTrip(upcomingRow, today, nextUnpaidDueDate) : null,
    inPlanning: trips
      .filter((t) => t.status === "inquiry" || t.status === "proposal")
      .map((t) => toDashboardTrip(t, today)),
    past: trips
      .filter((t) => t.status === "completed")
      .sort((a, b) => (b.start_date ?? "").localeCompare(a.start_date ?? ""))
      .map((t) => toDashboardTrip(t, today)),
    nextPayment,
    itineraryReady,
    latestMessage,
  };
}
