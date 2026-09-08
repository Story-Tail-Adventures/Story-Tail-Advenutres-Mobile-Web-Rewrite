import { createClient } from "@/lib/supabase/server";
import { daysBetween, daysUntilDeparture, tripStatusPresentation, type TripStatus } from "./status";
import { FALLBACK_TIME_ZONE } from "./thread";

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
  /**
   * The last message on the newest thread, for the advisor card.
   *
   * NOT "the last thing Gyasi said", which is what this used to claim and what the card
   * used to render: `conversation.last_message_preview` is the last thing ANYBODY said, so
   * a traveler's own question came back quoted underneath "Gyasi · Your advisor" as though
   * he had said it. Caught by eye on the emulator after sending a test message.
   * [fromAgent] is what lets the card tell the two apart.
   */
  latestMessage: {
    body: string;
    createdAt: string;
    tripId: string | null;
    conversationId: string;
    unread: number;
    fromAgent: boolean;
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

  // Who spoke last. `conversation` denormalises the preview but not the sender, so this is
  // one more round trip — worth it, because without it the card misattributes the
  // traveler's own words to their advisor.
  let lastSender: string | null = null;
  if (conversation?.last_message_preview) {
    const { data: newest } = await supabase
      .from("message")
      .select("sender_role")
      .eq("conversation_id", conversation.id)
      .order("created_at", { ascending: false })
      .limit(1);
    lastSender = newest?.[0]?.sender_role ?? null;
  }

  const latestMessage = conversation?.last_message_preview
    ? {
        body: conversation.last_message_preview,
        createdAt: conversation.last_message_at,
        tripId: conversation.trip_id ?? null,
        conversationId: conversation.id,
        unread: conversation.client_unread_count ?? 0,
        fromAgent: lastSender === "agent",
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

/**
 * The caller's own `platform_user.id`.
 *
 * NOT `auth.getUser().id`, and the distinction cost a wrong label on screen before it was
 * caught: `platform_user.account_id` is the auth.users id, while `platform_user.id` is a
 * separate key — and `document.owner_user_id` / `message.sender_user_id` point at the
 * latter. Comparing against the auth id makes every row read "added by Gyasi", including a
 * traveler's own passport, because the comparison is false for everybody.
 *
 * No `.eq()` filter: RLS scopes `platform_user` to the caller's own row, which is the same
 * assumption `web/lib/onboarding/status.ts` runs on.
 */
async function currentPlatformUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("platform_user").select("id").maybeSingle();
  return data?.id ?? null;
}

/**
 * The caller's own `platform_user.id` and configured IANA time zone, in one read.
 *
 * The zone is what stops the thread rendering in the SERVER's zone — see the long note at
 * the top of web/lib/trips/thread.ts. Read together with the id because both come off the
 * same single row and the thread needs both.
 */
async function currentPlatformUser(): Promise<{ id: string | null; timeZone: string }> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("platform_user")
    .select("id, time_zone")
    .maybeSingle();
  return { id: data?.id ?? null, timeZone: data?.time_zone ?? FALLBACK_TIME_ZONE };
}

export type TripDocument = {
  id: string;
  kind: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  /** True when `owner_user_id` is the caller's own platform user — the §2.2.6 uploaded-by. */
  mine: boolean;
};

export type TripDocumentsView = {
  tripId: string;
  tripTitle: string;
  documents: TripDocument[];
};

/**
 * Screen 2.2.6.
 *
 * `size_bytes` comes back as a JSON NUMBER despite being `bigint` — PostgREST serialises
 * int8 as a plain number, not as a string, which is the opposite of what the OpenAPI
 * contract does with money. The `Number()` below is therefore a no-op in practice and is
 * kept only so a PostgREST config that started stringifying would not turn a size into
 * `NaN` silently. Verified against the running stack; the Kotlin twin decodes it as `Long`
 * for the same reason, after decoding it as a String swallowed every thread attachment.
 *
 * `storage_key` is deliberately NOT selected. It is outside the column grant, so naming it
 * would raise 42501 — and the whole point of `trip-document-url` is that the client never
 * holds a key. Opening a file goes through the signer.
 */
export async function loadTripDocuments(tripId: string): Promise<TripDocumentsView | null> {
  const supabase = await createClient();

  const [{ data: trip }, { data: rows }, myUserId] = await Promise.all([
    supabase.from("trip").select("id, title").eq("id", tripId).maybeSingle(),
    supabase
      .from("document")
      .select("id, owner_user_id, kind, filename, mime_type, size_bytes, created_at")
      .eq("trip_id", tripId)
      .order("created_at", { ascending: false }),
    currentPlatformUserId(),
  ]);

  // Null, not empty: RLS makes "not yours" and "does not exist" the same answer, and the
  // route turns that into a not-found rather than an empty library for somebody else's trip.
  if (!trip) return null;

  return {
    tripId: trip.id,
    tripTitle: trip.title,
    documents: (rows ?? []).map((d) => ({
      id: d.id,
      kind: d.kind,
      filename: d.filename,
      mimeType: d.mime_type,
      sizeBytes: Number(d.size_bytes ?? 0),
      createdAt: d.created_at,
      mine: myUserId !== null && d.owner_user_id === myUserId,
    })),
  };
}

export type ThreadMessage = {
  id: string;
  sender: "agent" | "client";
  body: string;
  createdAt: string;
  /** Documents attached to this message, already filtered to what the client may read. */
  attachments: TripDocument[];
};

export type TripThreadView = {
  tripId: string;
  tripTitle: string;
  conversationId: string | null;
  unreadCount: number;
  /** The traveler's own IANA zone, for grouping and formatting the timestamps. */
  timeZone: string;
  messages: ThreadMessage[];
};

/**
 * Screen 2.2.7.
 *
 * `is_internal_note` is not filtered here, and that is not an omission: it is outside the
 * client column grant, so naming it would raise 42501. The filtering happens in
 * `message_self_select`, which carries `is_internal_note = false` as a ROW predicate — the
 * internal notes are invisible rather than redacted. The seed keeps a deliberate internal
 * note on Jordan's thread and `rls_trip_graph.sql` asserts it never comes back.
 *
 * A trip with no conversation yet is a real state, not an error: the row is created by
 * `trip-message` on the first send. It renders as the empty thread.
 */
export async function loadTripThread(tripId: string): Promise<TripThreadView | null> {
  const supabase = await createClient();

  const [{ data: trip }, { data: conversations }] = await Promise.all([
    supabase.from("trip").select("id, title").eq("id", tripId).maybeSingle(),
    supabase
      .from("conversation")
      .select("id, client_unread_count")
      .eq("trip_id", tripId)
      .limit(1),
  ]);

  if (!trip) return null;

  const conversation = conversations?.[0] ?? null;
  if (!conversation) {
    const { timeZone } = await currentPlatformUser();
    return {
      tripId: trip.id,
      tripTitle: trip.title,
      conversationId: null,
      unreadCount: 0,
      timeZone,
      messages: [],
    };
  }

  const [{ data: rows }, me] = await Promise.all([
    supabase
      .from("message")
      .select("id, sender_role, body, created_at")
      .eq("conversation_id", conversation.id)
      .order("created_at", { ascending: true }),
    currentPlatformUser(),
  ]);
  const myUserId = me.id;

  const messages = rows ?? [];

  // Attachments in one query for the whole thread rather than one per message. The join goes
  // message_attachment → document, and `document`'s own policy still applies to the embedded
  // side: an attachment pointing at a `receipt` comes back with a null document and is
  // dropped below, which is the behaviour we want and the reason this is not an inner join.
  const attachmentsByMessage = new Map<string, TripDocument[]>();
  if (messages.length > 0) {
    const { data: attachmentRows } = await supabase
      .from("message_attachment")
      .select("message_id, document:document_id (id, owner_user_id, kind, filename, mime_type, size_bytes, created_at)")
      .in("message_id", messages.map((m) => m.id));

    for (const row of attachmentRows ?? []) {
      const d = row.document;
      if (!d) continue;
      const list = attachmentsByMessage.get(row.message_id) ?? [];
      list.push({
        id: d.id,
        kind: d.kind,
        filename: d.filename,
        mimeType: d.mime_type,
        sizeBytes: Number(d.size_bytes ?? 0),
        createdAt: d.created_at,
        mine: myUserId !== null && d.owner_user_id === myUserId,
      });
      attachmentsByMessage.set(row.message_id, list);
    }
  }

  return {
    tripId: trip.id,
    tripTitle: trip.title,
    conversationId: conversation.id,
    unreadCount: conversation.client_unread_count ?? 0,
    timeZone: me.timeZone,
    messages: messages.map((m) => ({
      id: m.id,
      sender: m.sender_role as "agent" | "client",
      body: m.body,
      createdAt: m.created_at,
      attachments: attachmentsByMessage.get(m.id) ?? [],
    })),
  };
}

export type PastTripView = {
  trip: DashboardTrip;
  /** `itinerary.closing_note` if the itinerary is readable, else `intro_note`. */
  noteFromGyasi: string | null;
  photos: TripDocument[];
  /** Every readable document, for the archived-itinerary and paperwork links. */
  documentCount: number;
  conversationId: string | null;
  /** False when there is no READABLE itinerary — a draft is invisible, so this is the same. */
  itineraryReady: boolean;
  nights: number | null;
  /** The client's own reflection on this trip, if they have started one. */
  reflection: {
    id: string;
    body: string;
    rating: number | null;
    status: string;
    /** False once it leaves `draft` — the Edge Function refuses edits after that. */
    editable: boolean;
  } | null;
};

/**
 * Screen 2.2.11.
 *
 * The NOTE prefers `closing_note` over `intro_note`, which is the one derivation on this
 * screen worth explaining: the intro note sets a trip up and reads oddly in the past tense
 * ("here is what I have planned"), while the closing note is written to be read afterwards.
 * Design-System §2.4 names this screen's voice as gratitude, and the closing note is where
 * Gyasi actually writes it. `intro_note` is the fallback because a trip with only an intro
 * note is better than a silent card.
 *
 * `testimonial` is read through its own policy — the client sees only their own rows — and
 * is the one place a §2.2 screen reads a table it cannot write.
 */
export async function loadPastTrip(
  tripId: string,
  today = todayIsoUtc(),
): Promise<PastTripView | null> {
  const supabase = await createClient();

  const { data: row } = await supabase
    .from("trip")
    .select("id, title, trip_type, status, start_date, end_date, destinations, traveler_count, total_value_cents, total_paid_cents, currency, cancellation_reason, refund_status")
    .eq("id", tripId)
    .maybeSingle();

  if (!row) return null;

  const [
    { data: itinerary },
    { data: documents },
    { data: conversations },
    { data: testimonials },
    myUserId,
  ] = await Promise.all([
    supabase
      .from("itinerary")
      .select("id, intro_note, closing_note, published_at")
      .eq("trip_id", tripId)
      .maybeSingle(),
    supabase
      .from("document")
      .select("id, owner_user_id, kind, filename, mime_type, size_bytes, created_at")
      .eq("trip_id", tripId)
      .order("created_at", { ascending: false }),
    supabase.from("conversation").select("id").eq("trip_id", tripId).limit(1),
    supabase
      .from("testimonial")
      .select("id, body, rating, status")
      .eq("trip_id", tripId)
      .limit(1),
    currentPlatformUserId(),
  ]);

  const all = (documents ?? []).map((d) => ({
    id: d.id,
    kind: d.kind,
    filename: d.filename,
    mimeType: d.mime_type,
    sizeBytes: Number(d.size_bytes ?? 0),
    createdAt: d.created_at,
    mine: myUserId !== null && d.owner_user_id === myUserId,
  }));

  const reflection = testimonials?.[0] ?? null;

  return {
    trip: toDashboardTrip(row, today),
    noteFromGyasi: itinerary?.closing_note ?? itinerary?.intro_note ?? null,
    photos: all.filter((d) => d.kind === "photo"),
    documentCount: all.length,
    conversationId: conversations?.[0]?.id ?? null,
    itineraryReady: Boolean(itinerary?.published_at),
    // Nights, not days: a Jan 6–13 trip is seven nights, which is how a traveler counts it
    // and what the artboard's snapshot prints.
    nights: row.start_date && row.end_date ? daysBetween(row.start_date, row.end_date) : null,
    reflection: reflection
      ? {
          id: reflection.id,
          body: reflection.body,
          rating: reflection.rating,
          status: reflection.status,
          editable: reflection.status === "draft",
        }
      : null,
  };
}

export type StatusChangeView = {
  trip: DashboardTrip;
  /** `trip.status_changed_at`, which is what makes this screen a NOTIFICATION landing. */
  changedAt: string | null;
  /** The latest SENT proposal, for a status that moved to `proposal`. */
  proposal: {
    id: string;
    coverTitle: string | null;
    versionNumber: number;
    sentAt: string | null;
  } | null;
  itineraryReady: boolean;
  nextPayment: PaymentMilestoneView | null;
};

/**
 * Screen 2.2.9.
 *
 * WHAT THIS SCREEN CAN HONESTLY SAY. The artboard's "What changed" card lists three specific
 * facts — the resort, the price, "two room types to choose between". Nothing in the schema
 * records a DIFF: there is no status-change history table, only `trip.status` and
 * `trip.status_changed_at`. So the narrative is derived from the status it landed on, and the
 * supporting detail comes from real rows — the sent proposal, the published itinerary, the
 * next unpaid milestone. Anything the data cannot support is not said.
 *
 * `status_changed_at` being null is a real state (a trip whose status never moved), and the
 * screen reads as a plain summary then rather than as a notification landing.
 */
export async function loadStatusChange(
  tripId: string,
  today = todayIsoUtc(),
): Promise<StatusChangeView | null> {
  const supabase = await createClient();

  const { data: row } = await supabase
    .from("trip")
    .select("id, title, trip_type, status, status_changed_at, start_date, end_date, destinations, traveler_count, total_value_cents, total_paid_cents, currency, cancellation_reason, refund_status")
    .eq("id", tripId)
    .maybeSingle();

  if (!row) return null;

  const [{ data: proposals }, { data: itinerary }, { data: milestones }] = await Promise.all([
    // `sent_at IS NOT NULL` because an unsent proposal is a draft Gyasi is still writing —
    // the seed keeps one deliberately, and `proposal_self_select` lets it through, so the
    // filter has to be here. Newest version first.
    supabase
      .from("proposal")
      .select("id, cover_title, version_number, sent_at")
      .eq("trip_id", tripId)
      .not("sent_at", "is", null)
      .order("version_number", { ascending: false })
      .limit(1),
    supabase
      .from("itinerary")
      .select("id, published_at")
      .eq("trip_id", tripId)
      .maybeSingle(),
    supabase
      .from("payment_milestone")
      .select("id, kind, label, amount_cents, paid_cents, currency, due_date, status")
      .eq("trip_id", tripId)
      .neq("status", "paid")
      .order("due_date", { ascending: true })
      .limit(1),
  ]);

  const proposal = proposals?.[0] ?? null;
  const milestone = milestones?.[0] ?? null;

  return {
    trip: toDashboardTrip(row, today),
    changedAt: row.status_changed_at ?? null,
    proposal: proposal
      ? {
          id: proposal.id,
          coverTitle: proposal.cover_title ?? null,
          versionNumber: proposal.version_number,
          sentAt: proposal.sent_at ?? null,
        }
      : null,
    itineraryReady: Boolean(itinerary?.published_at),
    nextPayment: milestone
      ? {
          id: milestone.id,
          kind: milestone.kind,
          label: milestone.label,
          amountCents: Number(milestone.amount_cents ?? 0),
          paidCents: Number(milestone.paid_cents ?? 0),
          currency: milestone.currency,
          dueDate: milestone.due_date ?? null,
          status: milestone.status,
        }
      : null,
  };
}
