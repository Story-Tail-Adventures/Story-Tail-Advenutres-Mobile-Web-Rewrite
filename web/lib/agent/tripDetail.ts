import {
  callAgentRead,
  type AgentTripActivityRow,
  type AgentTripComponentRow,
  type AgentTripDocumentRow,
  type AgentTripItineraryDayRow,
  type AgentTripItineraryMetaRow,
  type AgentTripMessageRow,
  type AgentTripOverviewRow,
  type AgentTripPaymentRow,
} from "@/lib/agent/api";
import { agentIdentity, cents, localDate, monthDay, money } from "@/lib/agent/queries";
import type { IconName } from "@/components/ui/icon-paths";

/**
 * Screen 3.4.2's view models — Trip Detail's own sibling to `queries.ts`, not folded into
 * it. Trip Detail is eight tabs' worth of shapes on its own screen; `queries.ts` already
 * covers three (Worklist, Pipeline, Calendar).
 *
 * SAME THREE RULES AS `queries.ts`: plain JSON-safe data, formatting happens here server-side
 * in the agent's own time zone, and `null` from a loader means the READ failed — an empty
 * tab is a populated object (or empty array) rather than `null`.
 */

export type TripDetailOverview = {
  tripId: string;
  clientId: string;
  clientName: string;
  title: string;
  tripType: string;
  status: string;
  statusChangedLabel: string | null;
  startLabel: string | null;
  endLabel: string | null;
  destinations: string[];
  travelerCount: number;
  totalValueLabel: string;
  totalPaidLabel: string;
  totalCommissionLabel: string;
  cancellationReason: string | null;
  refundStatus: string | null;
  notes: string | null;
  version: number;
  cardOnFile: string | null;
  lastActivityLabel: string | null;
  componentCount: number;
  manualComponentCount: number;
  apiComponentCount: number;
  /**
   * The two raw dates the status chip is derived from, in the agent's own zone — NOT
   * pre-formatted, because `tripStatusPresentation` compares them rather than printing
   * them. Every other date on this model is a label; these two are the exception, and the
   * accessor computes both so neither is ever the browser's idea of today.
   */
  today: string;
  nextUnpaidDueDate: string | null;
};

async function loadOverview(tripId: string): Promise<TripDetailOverview | null> {
  const [me, res] = await Promise.all([
    agentIdentity(),
    callAgentRead<AgentTripOverviewRow>("agent_trip_overview", { p_trip_id: tripId }),
  ]);
  if (!res.ok) return null;
  const r = res.rows[0];
  if (!r) return null;

  const cardOnFile =
    r.card_last4 && r.card_brand
      ? `${r.card_brand.toUpperCase()} •••• ${r.card_last4}${
          r.card_spending_limit_cents ? ` · ${money(r.card_spending_limit_cents, r.currency)} cap` : ""
        }`
      : null;

  return {
    tripId: r.trip_id,
    clientId: r.client_id,
    clientName: r.client_display_name,
    title: r.title,
    tripType: r.trip_type,
    status: r.status,
    statusChangedLabel: monthDay(localDate(r.status_changed_at, me.timeZone)),
    startLabel: monthDay(r.start_date),
    endLabel: monthDay(r.end_date),
    destinations: r.destinations ?? [],
    travelerCount: r.traveler_count,
    totalValueLabel: money(r.total_value_cents, r.currency),
    totalPaidLabel: money(r.total_paid_cents, r.currency),
    totalCommissionLabel: money(r.total_commission_cents, r.currency),
    cancellationReason: r.cancellation_reason,
    refundStatus: r.refund_status,
    notes: r.notes,
    version: r.version,
    cardOnFile,
    lastActivityLabel: r.last_activity_at
      ? monthDay(localDate(r.last_activity_at, me.timeZone))
      : null,
    componentCount: r.component_count,
    manualComponentCount: r.manual_component_count,
    apiComponentCount: r.api_component_count,
    today: r.as_of_date,
    nextUnpaidDueDate: r.next_unpaid_due_date,
  };
}

/** `time` arrives as `HH:MM:SS`; the seconds are never meaningful to show. */
function hhmm(value: string | null): string | null {
  if (!value) return null;
  const [h, m] = value.split(":");
  return h && m ? `${h}:${m}` : value;
}

export type TripComponentRow = {
  componentId: string;
  icon: IconName;
  title: string;
  subtitle: string | null;
  sourceBadge: string;
  costLabel: string;
  orderIndex: number;
};

/**
 * One icon per `component_kind` value. `custom` and anything unrecognised fall back to
 * `receipt` — a generic line-item glyph, not a blank render.
 */
const COMPONENT_ICONS: Record<string, IconName> = {
  flight: "plane",
  hotel: "building",
  cruise: "ship",
  transfer: "trip",
  excursion: "sparkle",
  insurance: "shield",
  custom: "receipt",
};

export function componentKindIcon(kind: string): IconName {
  return COMPONENT_ICONS[kind] ?? "receipt";
}

async function loadComponents(tripId: string): Promise<TripComponentRow[] | null> {
  const res = await callAgentRead<AgentTripComponentRow>("agent_trip_components", {
    p_trip_id: tripId,
  });
  if (!res.ok) return null;

  return res.rows.map((c) => {
    const dateBit = c.start_date ? monthDay(c.start_date) : null;
    const timeBit = hhmm(c.start_time);
    const subtitle = [dateBit, timeBit, c.location].filter(Boolean).join(" · ") || null;
    return {
      componentId: c.component_id,
      icon: componentKindIcon(c.kind),
      title: c.display_name,
      subtitle,
      sourceBadge: c.api_source ?? "Manual",
      costLabel: money(c.cost_cents, c.currency),
      orderIndex: c.order_index,
    };
  });
}

export type TripItineraryActivity = {
  activityId: string;
  block: string | null;
  timeLabel: string | null;
  title: string;
  body: string | null;
  location: string | null;
  confirmationNumber: string | null;
  gyasisTip: string | null;
  componentId: string | null;
};

export type TripItineraryDay = {
  dayId: string;
  dayNumber: number;
  dateLabel: string | null;
  label: string | null;
  summary: string | null;
  activities: TripItineraryActivity[];
};

export type TripItineraryView = {
  itineraryId: string | null;
  coverImageUrl: string | null;
  introNote: string | null;
  closingNote: string | null;
  /** "Published" or "Draft" — never blank; an agent must know which one they are reading. */
  publishedLabel: string;
  days: TripItineraryDay[];
};

async function loadItinerary(tripId: string): Promise<TripItineraryView | null> {
  const [metaRes, daysRes] = await Promise.all([
    callAgentRead<AgentTripItineraryMetaRow>("agent_trip_itinerary_meta", { p_trip_id: tripId }),
    callAgentRead<AgentTripItineraryDayRow>("agent_trip_itinerary_days", { p_trip_id: tripId }),
  ]);
  if (!metaRes.ok || !daysRes.ok) return null;

  const meta = metaRes.rows[0];

  // No itinerary drafted yet is a real, empty state — not a read failure.
  if (!meta) {
    return {
      itineraryId: null,
      coverImageUrl: null,
      introNote: null,
      closingNote: null,
      publishedLabel: "Draft",
      days: [],
    };
  }

  const byDay = new Map<string, TripItineraryDay>();
  for (const row of daysRes.rows) {
    let day = byDay.get(row.day_id);
    if (!day) {
      day = {
        dayId: row.day_id,
        dayNumber: row.day_number,
        dateLabel: monthDay(row.date),
        label: row.day_label,
        summary: row.day_summary,
        activities: [],
      };
      byDay.set(row.day_id, day);
    }
    // The LEFT JOIN yields one all-null activity_* row for a day with nothing scheduled yet.
    if (row.activity_id) {
      day.activities.push({
        activityId: row.activity_id,
        block: row.block,
        timeLabel: hhmm(row.start_time),
        title: row.activity_title ?? "",
        body: row.activity_body,
        location: row.location,
        confirmationNumber: row.confirmation_number,
        gyasisTip: row.gyasis_tip,
        componentId: row.component_id,
      });
    }
  }

  return {
    itineraryId: meta.itinerary_id,
    coverImageUrl: meta.cover_image_url,
    introNote: meta.intro_note,
    closingNote: meta.closing_note,
    publishedLabel: meta.published_at ? "Published" : "Draft",
    days: [...byDay.values()].sort((a, b) => a.dayNumber - b.dayNumber),
  };
}

export type TripPaymentRow = {
  milestoneId: string;
  kind: string;
  label: string;
  amountLabel: string;
  paidLabel: string;
  dueLabel: string | null;
  status: string;
  /** For the sidebar's status dot: paid is good, an unpaid/overdue row is warn. */
  dot: "good" | "warn";
};

async function loadPayments(tripId: string): Promise<TripPaymentRow[] | null> {
  const res = await callAgentRead<AgentTripPaymentRow>("agent_trip_payments", {
    p_trip_id: tripId,
  });
  if (!res.ok) return null;

  return res.rows.map((p) => ({
    milestoneId: p.milestone_id,
    kind: p.kind,
    label: p.label,
    amountLabel: money(p.amount_cents, p.currency),
    paidLabel: money(p.paid_cents, p.currency),
    dueLabel: monthDay(p.due_date),
    status: p.status,
    dot: p.status === "paid" ? "good" : "warn",
  }));
}

export type TripDocumentRow = {
  documentId: string;
  kind: string;
  filename: string;
  sizeLabel: string;
  isSensitive: boolean;
  createdLabel: string | null;
};

function sizeLabel(bytes: string): string {
  const n = cents(bytes); // same digit-string parse, whatever the field means
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

async function loadDocuments(tripId: string): Promise<TripDocumentRow[] | null> {
  const [me, res] = await Promise.all([
    agentIdentity(),
    callAgentRead<AgentTripDocumentRow>("agent_trip_documents", { p_trip_id: tripId }),
  ]);
  if (!res.ok) return null;

  return res.rows.map((d) => ({
    documentId: d.document_id,
    kind: d.kind,
    filename: d.filename,
    sizeLabel: sizeLabel(d.size_bytes),
    isSensitive: d.is_sensitive,
    createdLabel: monthDay(localDate(d.created_at, me.timeZone)),
  }));
}

export type TripMessageRow = {
  messageId: string;
  senderRole: string;
  body: string;
  createdLabel: string | null;
  isInternalNote: boolean;
};

async function loadMessages(tripId: string): Promise<TripMessageRow[] | null> {
  const [me, res] = await Promise.all([
    agentIdentity(),
    callAgentRead<AgentTripMessageRow>("agent_trip_messages", { p_trip_id: tripId }),
  ]);
  if (!res.ok) return null;

  return res.rows.map((m) => ({
    messageId: m.message_id,
    senderRole: m.sender_role,
    body: m.body,
    createdLabel: monthDay(localDate(m.created_at, me.timeZone)),
    isInternalNote: m.is_internal_note,
  }));
}

export type TripActivityRow = {
  historyId: string;
  fromLabel: string | null;
  toLabel: string;
  changedByName: string;
  changedAtLabel: string | null;
};

async function loadActivity(tripId: string): Promise<TripActivityRow[] | null> {
  const [me, res] = await Promise.all([
    agentIdentity(),
    callAgentRead<AgentTripActivityRow>("agent_trip_activity", { p_trip_id: tripId }),
  ]);
  if (!res.ok) return null;

  return res.rows.map((h) => ({
    historyId: h.history_id,
    fromLabel: h.from_status,
    toLabel: h.to_status,
    // Nullable per Data-Model §8.8 (a transition with no recorded actor); no such row exists
    // today, but a future system-driven transition must not render a blank name.
    changedByName: h.changed_by_name ?? "System",
    changedAtLabel: monthDay(localDate(h.changed_at, me.timeZone)),
  }));
}

export const loadTripOverview = loadOverview;
export const loadTripComponents = loadComponents;
export const loadTripItinerary = loadItinerary;
export const loadTripPayments = loadPayments;
export const loadTripDocuments = loadDocuments;
export const loadTripMessages = loadMessages;
export const loadTripActivity = loadActivity;
