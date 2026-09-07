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

/* ────────────────────────────────────────────────────────────────────────────
 * Screen 2.2.2 All Trips List
 * ──────────────────────────────────────────────────────────────────────────── */

/** The filter tabs 2.2.2 offers. `all` is not a status — it is the absence of one. */
export const TRIP_FILTERS = ["all", "upcoming", "planning", "past", "cancelled"] as const;
export type TripFilter = (typeof TRIP_FILTERS)[number];

export function isTripFilter(value: string | undefined): value is TripFilter {
  return typeof value === "string" && (TRIP_FILTERS as readonly string[]).includes(value);
}

/**
 * Which statuses each tab shows.
 *
 * `upcoming` is booked-or-travelling rather than "start_date in the future", because a trip
 * that started yesterday is not upcoming and a booked trip with no dates yet still is.
 */
const FILTER_STATUSES: Record<Exclude<TripFilter, "all">, readonly TripStatus[]> = {
  upcoming: ["booked", "in_progress"],
  planning: ["inquiry", "proposal"],
  past: ["completed"],
  cancelled: ["cancelled"],
};

export type TripsList = {
  trips: DashboardTrip[];
  /** Counts for every tab, from the same rows — so a tab never lies about what it holds. */
  counts: Record<TripFilter, number>;
};

/**
 * Every trip on the account, with the counts for all five tabs.
 *
 * ONE query and the filtering in memory, deliberately. BRD §4.3 sizes the platform at 20–40
 * active trips, so the whole set is a page of rows — and the tab counts have to be computed
 * from the same snapshot the list came from, or a count and its list disagree the moment
 * anything changes between two round trips.
 */
export async function loadTrips(
  filter: TripFilter = "all",
  today = todayIsoUtc(),
): Promise<TripsList | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("trip")
    .select("id, title, trip_type, status, start_date, end_date, destinations, traveler_count, total_value_cents, total_paid_cents, currency")
    .order("start_date", { ascending: false, nullsFirst: false });

  if (error) return null;
  const rows = data ?? [];

  const counts = {
    all: rows.length,
    upcoming: rows.filter((r) => FILTER_STATUSES.upcoming.includes(r.status as TripStatus)).length,
    planning: rows.filter((r) => FILTER_STATUSES.planning.includes(r.status as TripStatus)).length,
    past: rows.filter((r) => FILTER_STATUSES.past.includes(r.status as TripStatus)).length,
    cancelled: rows.filter((r) => FILTER_STATUSES.cancelled.includes(r.status as TripStatus)).length,
  } satisfies Record<TripFilter, number>;

  const visible =
    filter === "all" ? rows : rows.filter((r) => FILTER_STATUSES[filter].includes(r.status as TripStatus));

  // The earliest unpaid milestone PER TRIP, because without it this list labels the same
  // trip differently from the dashboard: `tripStatusPresentation` needs a due date to turn
  // "Booked" into "Final payment due", and a list that omits it says Booked while the hero
  // two clicks away says Final payment due. Caught by looking at the two screens together.
  //
  // One extra query for the whole page rather than one per row — `in` over a handful of ids,
  // ordered so the first hit per trip is the soonest.
  const bookedIds = visible
    .filter((r) => r.status === "booked" || r.status === "in_progress")
    .map((r) => r.id);

  const dueByTrip = new Map<string, string>();
  if (bookedIds.length > 0) {
    const { data: milestones } = await supabase
      .from("payment_milestone")
      .select("trip_id, due_date, order_index, status")
      .in("trip_id", bookedIds)
      .neq("status", "paid")
      .neq("status", "waived")
      .order("order_index", { ascending: true });

    for (const m of milestones ?? []) {
      if (m.due_date && !dueByTrip.has(m.trip_id)) dueByTrip.set(m.trip_id, m.due_date);
    }
  }

  return {
    trips: visible.map((r) => toDashboardTrip(r, today, dueByTrip.get(r.id) ?? null)),
    counts,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Screen 2.2.3 Trip Detail / Overview
 * ──────────────────────────────────────────────────────────────────────────── */

export type PaymentMilestoneView = {
  id: string;
  kind: string;
  label: string;
  amountCents: number;
  paidCents: number;
  currency: string;
  dueDate: string | null;
  status: string;
};

export type TripDetail = {
  trip: DashboardTrip;
  /** Client-visible cancellation fields — moved out of Internal in Data-Model §21 for this. */
  cancellationReason: string | null;
  refundStatus: string | null;
  /**
   * `itinerary.intro_note`, NOT `trip.notes`. The latter is where the agent writes what he
   * thinks and is outside the client column grant; this is the client-facing note
   * Design-System §2.4 calls the voice-forward surface.
   */
  introNote: string | null;
  closingNote: string | null;
  itineraryReady: boolean;
  dayCount: number;
  componentCount: number;
  documentCount: number;
  unreadCount: number;
  conversationId: string | null;
  milestones: PaymentMilestoneView[];
};

/** Null when the trip is not the caller's, which RLS makes indistinguishable from absent. */
export async function loadTripDetail(
  tripId: string,
  today = todayIsoUtc(),
): Promise<TripDetail | null> {
  const supabase = await createClient();

  const { data: row } = await supabase
    .from("trip")
    .select("id, title, trip_type, status, start_date, end_date, destinations, traveler_count, total_value_cents, total_paid_cents, currency, cancellation_reason, refund_status")
    .eq("id", tripId)
    .maybeSingle();

  if (!row) return null;

  const [{ data: itinerary }, { data: milestoneRows }, { count: componentCount }, { count: documentCount }, { data: conversations }] =
    await Promise.all([
      supabase
        .from("itinerary")
        .select("id, intro_note, closing_note, published_at")
        .eq("trip_id", tripId)
        .maybeSingle(),
      supabase
        .from("payment_milestone")
        .select("id, kind, label, amount_cents, paid_cents, currency, due_date, status, order_index")
        .eq("trip_id", tripId)
        .order("order_index", { ascending: true }),
      supabase
        .from("trip_component")
        .select("id", { count: "exact", head: true })
        .eq("trip_id", tripId),
      supabase
        .from("document")
        .select("id", { count: "exact", head: true })
        .eq("trip_id", tripId),
      supabase
        .from("conversation")
        .select("id, client_unread_count")
        .eq("trip_id", tripId)
        .limit(1),
    ]);

  // Days are counted only when the itinerary is readable at all — an unpublished one is
  // invisible to this session, so a count from it would always be zero and imply "no days".
  let dayCount = 0;
  if (itinerary?.published_at) {
    const { count } = await supabase
      .from("itinerary_day")
      .select("id", { count: "exact", head: true })
      .eq("itinerary_id", itinerary.id);
    dayCount = count ?? 0;
  }

  const milestones = (milestoneRows ?? []).map((m) => ({
    id: m.id,
    kind: m.kind,
    label: m.label,
    amountCents: Number(m.amount_cents),
    paidCents: Number(m.paid_cents),
    currency: m.currency,
    dueDate: m.due_date ?? null,
    status: m.status,
  }));

  const nextUnpaid = milestones.find((m) => m.status !== "paid" && m.status !== "waived");

  return {
    trip: toDashboardTrip(row, today, nextUnpaid?.dueDate ?? null),
    cancellationReason: row.cancellation_reason ?? null,
    refundStatus: row.refund_status ?? null,
    introNote: itinerary?.intro_note ?? null,
    closingNote: itinerary?.closing_note ?? null,
    itineraryReady: Boolean(itinerary?.published_at),
    dayCount,
    componentCount: componentCount ?? 0,
    documentCount: documentCount ?? 0,
    unreadCount: conversations?.[0]?.client_unread_count ?? 0,
    conversationId: conversations?.[0]?.id ?? null,
    milestones,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Screens 2.2.4 Itinerary Viewer, 2.2.5 Day Detail, 2.2.8 Empty component states
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * `itinerary_day.weather_forecast`, which is agent-authored and cached with a TTL — not a
 * live API. BRD §9 names no weather integration, and this column is the reason none is
 * needed at MVP. Every field is optional because the agent fills in what he knows.
 */
export type DayWeather = {
  highF?: number;
  lowF?: number;
  summary?: string;
  windMph?: number;
  windDir?: string;
  uvIndex?: number;
};

export type ItineraryActivity = {
  id: string;
  block: "morning" | "afternoon" | "evening" | "all_day";
  startTime: string | null;
  endTime: string | null;
  title: string;
  body: string | null;
  location: string | null;
  address: string | null;
  phone: string | null;
  confirmationNumber: string | null;
  /** Design-System §2.4's voice-forward moment inside a day. */
  gyasisTip: string | null;
};

export type ItineraryDay = {
  id: string;
  dayNumber: number;
  date: string;
  label: string | null;
  summary: string | null;
  weather: DayWeather | null;
  activities: ItineraryActivity[];
};

export type ItineraryView = {
  tripId: string;
  tripTitle: string;
  tripChip: string;
  tripStatusLabel: string;
  startDate: string | null;
  endDate: string | null;
  travelerCount: number;
  destinations: string[];
  tripType: string;
  introNote: string | null;
  closingNote: string | null;
  days: ItineraryDay[];
  /**
   * 2.2.8's data. Which component kinds the trip HAS, so the viewer can say what is still
   * missing — "your flights aren't booked yet" is only true if there is no flight component.
   */
  componentKinds: string[];
  /** The "important info" panel: what the trip itself can answer. */
  insuranceReference: string | null;
  emergencyContact: { name?: string; phone?: string; relationship?: string } | null;
  visaRequired: boolean | null;
};

function parseWeather(value: unknown): DayWeather | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const num = (k: string) => (typeof v[k] === "number" ? (v[k] as number) : undefined);
  const str = (k: string) => (typeof v[k] === "string" ? (v[k] as string) : undefined);
  const out: DayWeather = {
    highF: num("high_f"),
    lowF: num("low_f"),
    summary: str("summary"),
    windMph: num("wind_mph"),
    windDir: str("wind_dir"),
    uvIndex: num("uv_index"),
  };
  return Object.values(out).some((x) => x !== undefined) ? out : null;
}

/**
 * The whole itinerary in four queries.
 *
 * All days and all activities at once rather than a day at a time: a seven-day itinerary is
 * a few dozen rows, the day navigator needs every day's label anyway, and 2.2.5 is then a
 * pure selection rather than another round trip. It also means the PDF export — when it
 * lands — reads from the same shape.
 *
 * Null when there is no readable itinerary, which includes the case where one exists but is
 * unpublished: the policy makes a draft invisible, so "not published" and "no itinerary"
 * arrive identically here and the caller decides what to say.
 */
export async function loadItinerary(tripId: string, today = todayIsoUtc()): Promise<ItineraryView | null> {
  const supabase = await createClient();

  const { data: trip } = await supabase
    .from("trip")
    .select("id, title, trip_type, status, start_date, end_date, destinations, traveler_count, total_value_cents, total_paid_cents, currency")
    .eq("id", tripId)
    .maybeSingle();

  if (!trip) return null;

  const { data: itinerary } = await supabase
    .from("itinerary")
    .select("id, intro_note, closing_note, published_at")
    .eq("trip_id", tripId)
    .maybeSingle();

  if (!itinerary) return null;

  const { data: dayRows } = await supabase
    .from("itinerary_day")
    .select("id, day_number, date, label, summary, weather_forecast")
    .eq("itinerary_id", itinerary.id)
    .order("day_number", { ascending: true });

  const days = dayRows ?? [];
  const dayIds = days.map((d) => d.id);

  const { data: activityRows } = dayIds.length
    ? await supabase
        .from("itinerary_activity")
        .select("id, itinerary_day_id, block, start_time, end_time, title, body, location, address, phone, confirmation_number, gyasis_tip, order_index")
        .in("itinerary_day_id", dayIds)
        .order("order_index", { ascending: true })
    : { data: [] };

  const { data: components } = await supabase
    .from("trip_component")
    .select("kind, confirmation_number")
    .eq("trip_id", tripId);

  const { data: client } = await supabase
    .from("client")
    .select("emergency_contact")
    .maybeSingle();

  const byDay = new Map<string, ItineraryActivity[]>();
  for (const a of activityRows ?? []) {
    const list = byDay.get(a.itinerary_day_id) ?? [];
    list.push({
      id: a.id,
      block: a.block as ItineraryActivity["block"],
      startTime: a.start_time ?? null,
      endTime: a.end_time ?? null,
      title: a.title,
      body: a.body ?? null,
      location: a.location ?? null,
      address: a.address ?? null,
      phone: a.phone ?? null,
      confirmationNumber: a.confirmation_number ?? null,
      gyasisTip: a.gyasis_tip ?? null,
    });
    byDay.set(a.itinerary_day_id, list);
  }

  const kinds = (components ?? []).map((c) => c.kind as string);
  const insurance = (components ?? []).find((c) => c.kind === "insurance");
  const emergency = client?.emergency_contact as ItineraryView["emergencyContact"];
  const presentation = tripStatusPresentation({ status: trip.status as TripStatus, today });

  return {
    tripId: trip.id,
    tripTitle: trip.title,
    tripChip: presentation.chip,
    tripStatusLabel: presentation.label,
    startDate: trip.start_date ?? null,
    endDate: trip.end_date ?? null,
    travelerCount: trip.traveler_count ?? 1,
    destinations: trip.destinations ?? [],
    tripType: trip.trip_type,
    introNote: itinerary.intro_note ?? null,
    closingNote: itinerary.closing_note ?? null,
    days: days.map((d) => ({
      id: d.id,
      dayNumber: d.day_number,
      date: d.date,
      label: d.label ?? null,
      summary: d.summary ?? null,
      weather: parseWeather(d.weather_forecast),
      activities: byDay.get(d.id) ?? [],
    })),
    componentKinds: kinds,
    insuranceReference: insurance?.confirmation_number ?? null,
    emergencyContact: emergency ?? null,
    // Nothing in the schema records a visa requirement, so this stays null rather than
    // asserting "not required" — a wrong answer here is somebody turned away at a gate.
    visaRequired: null,
  };
}
