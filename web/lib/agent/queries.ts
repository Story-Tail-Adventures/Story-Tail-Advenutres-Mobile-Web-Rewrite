import {
  callAgentRead,
  type AgentInboxRow,
  type AgentKpiRow,
  type AgentPaymentRow,
  type AgentTripRow,
} from "@/lib/agent/api";
import { AGENT_COPY } from "@/lib/agent/content";
import type { CalendarEvent } from "@/lib/agent/calendar";
import { formatTripMoney } from "@/lib/trips/money";
import { createClient } from "@/lib/supabase/server";

/**
 * §3.2's view models.
 *
 * THREE RULES, and each one is a bug this codebase has already shipped once:
 *
 *  1. EVERYTHING IS PLAIN DATA. No `Date`, no `Map`, no function, no `undefined` value.
 *     A function in a props object passed from a server component to a client one
 *     typechecks, passes every unit test — they render both sides in one process, so the
 *     boundary is never crossed — and throws at runtime. `copy.nights(n)` did exactly that
 *     on the hotel-search work. `queries.test.ts` asserts JSON round-tripping per model.
 *
 *  2. FORMATTING HAPPENS HERE, SERVER-SIDE. Money and dates arrive as strings. That is also
 *     what keeps the agent's time zone correct: the accessors compute "this month" and
 *     "departing in 30 days" in `agent.time_zone`, and formatting a date in the browser
 *     would reintroduce the mismatch one layer up.
 *
 *  3. NULL IS NOT ZERO. `commission_confidence_pct` and `inquiry_to_book_days` come back
 *     NULL when there is nothing to report, and the generated types claim otherwise — see
 *     `lib/agent/api.ts`. A tile with no value renders its reason, never a confident 0.
 *
 * `null` from a loader means the READ FAILED. An empty book returns a populated object with
 * empty arrays. §2.2 set that contract and §2.4 repeated it; a caller that conflates them
 * shows "something went wrong" to an advisor whose book is simply empty.
 */

export type AgentKpi = {
  id: string;
  label: string;
  /** Pre-formatted. Null when there is nothing to report — render `unavailable` instead. */
  value: string | null;
  /** The second line. Null when it is not computable; never a fabricated delta. */
  sub: string | null;
  /** Non-null when the tile has no value and the screen owes an explanation. */
  unavailable: string | null;
  accent: "primary" | "secondary" | "tertiary" | "surface";
  icon: "briefcase" | "check" | "dollar" | "clock" | "users";
};

export type WorklistTrip = {
  tripId: string;
  clientName: string;
  title: string;
  valueLabel: string;
  status: string;
  /** Pre-formatted relative label, e.g. "3 days" or "Tomorrow". Null when there is no date. */
  dueLabel: string | null;
  startLabel: string | null;
};

export type WorklistPayment = {
  milestoneId: string;
  clientName: string;
  label: string;
  amountLabel: string;
  dueLabel: string;
  overdue: boolean;
};

export type WorklistMessage = {
  conversationId: string;
  clientName: string;
  preview: string;
  timeLabel: string;
  unread: number;
};

export type Worklist = {
  greetingName: string;
  partOfDay: "Morning" | "Afternoon" | "Evening";
  periodLabel: string;
  needsYouCount: number;
  kpis: AgentKpi[];
  currencyNote: string | null;
  proposalsAwaiting: WorklistTrip[];
  paymentsDue: WorklistPayment[];
  newInquiries: WorklistTrip[];
  departingSoon: WorklistTrip[];
  recentMessages: WorklistMessage[];
};

/** Money arrives as a digit-string; `Number()` is applied exactly once, here. */
function cents(value: string | null | undefined): number {
  if (!value) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function money(value: string | null | undefined, currency: string | null): string {
  return formatTripMoney(cents(value), currency ?? "USD", { whole: true });
}

/** Days between two ISO dates, both already in the agent's zone. */
function daysFrom(todayIso: string, thenIso: string): number {
  const a = Date.parse(`${todayIso}T00:00:00Z`);
  const b = Date.parse(`${thenIso}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

function relativeDay(todayIso: string, thenIso: string | null): string | null {
  if (!thenIso) return null;
  const d = daysFrom(todayIso, thenIso);
  if (d === 0) return "Today";
  if (d === 1) return "Tomorrow";
  if (d < 0) return `${Math.abs(d)} ${Math.abs(d) === 1 ? "day" : "days"} late`;
  return `${d} days`;
}

function monthDay(iso: string | null): string | null {
  if (!iso) return null;
  const [, m, d] = iso.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[Number(m) - 1]} ${d}`;
}

function partOfDayIn(timeZone: string): Worklist["partOfDay"] {
  // `Intl` rather than an offset table: America/Chicago is CST or CDT depending on the date
  // and a fixed offset is wrong for half the year.
  let hour: number;
  try {
    hour = Number(
      new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone }).format(
        new Date(),
      ),
    );
  } catch {
    // An unrecognised IANA name would otherwise throw inside a server component. The
    // greeting being wrong is better than the page not rendering.
    hour = new Date().getUTCHours();
  }
  if (!Number.isFinite(hour)) hour = 12;
  if (hour < 12) return "Morning";
  if (hour < 18) return "Afternoon";
  return "Evening";
}

function kpisFrom(k: AgentKpiRow): AgentKpi[] {
  const cur = k.dominant_currency;
  return [
    {
      id: "pipeline",
      label: "Pipeline value",
      value: money(k.pipeline_value_cents, cur),
      sub: `${k.active_trip_count + k.new_inquiry_count} open trips`,
      unavailable: null,
      accent: "primary",
      icon: "briefcase",
    },
    {
      id: "booked",
      label: "Booked · month",
      value: money(k.booked_month_cents, cur),
      sub: null,
      unavailable: null,
      accent: "secondary",
      icon: "check",
    },
    {
      id: "commission",
      label: "Commission expected",
      value: money(k.commission_expected_cents, cur),
      // NULL, not 0%. An empty pipeline has nothing to be confident about, and a 0% there
      // would be a claim rather than an absence.
      sub: k.commission_confidence_pct === null ? null : `${k.commission_confidence_pct}% confidence`,
      unavailable: null,
      accent: "tertiary",
      icon: "dollar",
    },
    {
      id: "cycle",
      label: "Inquiry → book",
      value: k.inquiry_to_book_days === null ? null : `${k.inquiry_to_book_days} d`,
      sub:
        k.inquiry_to_book_sample > 0
          ? `over ${k.inquiry_to_book_sample} ${k.inquiry_to_book_sample === 1 ? "trip" : "trips"}`
          : null,
      // The honest state Data-Model §8.8 commits to: the figure accumulates forward from
      // the first booking after trip_status_history shipped.
      unavailable: k.inquiry_to_book_days === null ? AGENT_COPY.cycleTimeUnavailable : null,
      accent: "surface",
      icon: "clock",
    },
    {
      id: "clients",
      label: "Active clients",
      value: String(k.active_client_count),
      sub: null,
      unavailable: null,
      accent: "surface",
      icon: "users",
    },
  ];
}

/**
 * The agent's own name and time zone, for the greeting. Their own row, under RLS.
 *
 * THE TIME ZONE IS NOT DECORATION. The accessors compute "this month" and "departing in 30
 * days" in `agent.time_zone` precisely so the figures mean what the person reading them
 * thinks; deriving the greeting from the SERVER's clock instead undoes that in the most
 * visible line on the screen. At 15:00 in Chicago the server is at 20:00 UTC and the page
 * said "Evening, Gyasi" — caught in the browser, because no unit test knows what time it is
 * where he lives.
 *
 * `platform_user.time_zone` is inside the client column grant, so this needs no new read
 * surface. It defaults to America/Chicago.
 */
async function agentIdentity(): Promise<{ displayName: string; timeZone: string }> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("platform_user")
    .select("display_name, time_zone")
    .maybeSingle();
  return {
    displayName: data?.display_name ?? "",
    timeZone: data?.time_zone || "America/Chicago",
  };
}

export async function loadWorklist(): Promise<Worklist | null> {
  // One call per accessor, in parallel. Not one combined RPC: each answers a different
  // question and the board read is the one that would grow.
  const [me, kpiRes, boardRes, dueRes, inboxRes] = await Promise.all([
    agentIdentity(),
    callAgentRead<AgentKpiRow>("agent_kpis"),
    callAgentRead<AgentTripRow>("agent_trip_board"),
    callAgentRead<AgentPaymentRow>("agent_payments_due", { p_within_days: 21 }),
    callAgentRead<AgentInboxRow>("agent_inbox", { p_limit: 5 }),
  ]);

  if (!kpiRes.ok || !boardRes.ok || !dueRes.ok || !inboxRes.ok) return null;

  // No row at all means the caller is not an agent. The layout's gate should already have
  // caught that, so this is the second line of defence rather than the first.
  const k = kpiRes.rows[0];
  if (!k) return null;

  const today = k.as_of_date;
  const trips = boardRes.rows;

  const proposalsAwaiting = trips
    .filter((t) => t.status === "proposal" && t.proposal_sent_at !== null)
    .map((t) => toWorklistTrip(t, today, t.proposal_viewed_at === null ? "Awaiting reply" : "Viewed"));

  const newInquiries = trips
    .filter((t) => t.status === "inquiry")
    .map((t) => toWorklistTrip(t, today, null));

  const departingSoon = trips
    .filter((t) => t.start_date !== null && daysFrom(today, t.start_date) >= 0 && daysFrom(today, t.start_date) < 30)
    .map((t) => toWorklistTrip(t, today, null));

  const paymentsDue = dueRes.rows.map((p) => ({
    milestoneId: p.milestone_id,
    clientName: p.client_display_name,
    label: `${p.trip_title} · ${p.label}`,
    amountLabel: money(p.amount_cents, p.currency),
    dueLabel: relativeDay(today, p.due_date) ?? "No date",
    overdue: (p.days_until ?? 0) < 0,
  }));

  const recentMessages = inboxRes.rows.map((m) => ({
    conversationId: m.conversation_id,
    clientName: m.client_display_name,
    preview: m.last_message_preview ?? "",
    timeLabel: monthDay(m.last_message_at.slice(0, 10)) ?? "",
    unread: m.agent_unread_count,
  }));

  // Derived, never a literal. A hardcoded count that says 3 when there are 7 is worse than
  // no count, and it is the first thing on the screen.
  const needsYouCount = proposalsAwaiting.length + paymentsDue.length + newInquiries.length;

  const [, month, day] = today.split("-");
  const periodLabel = `${monthDay(today) ?? `${month}-${day}`}`;

  return {
    greetingName: me.displayName.split(" ")[0] || "there",
    partOfDay: partOfDayIn(me.timeZone),
    periodLabel,
    needsYouCount,
    kpis: kpisFrom(k),
    // Under-reporting with the exclusion named, never a mixed sum. The accessors scope
    // every money figure to one currency; this is the screen saying so.
    currencyNote:
      k.currency_count > 1
        ? AGENT_COPY.currencyNote(k.dominant_currency ?? "USD", k.currency_count - 1)
        : null,
    proposalsAwaiting,
    paymentsDue,
    newInquiries,
    departingSoon,
    recentMessages,
  };
}

function toWorklistTrip(t: AgentTripRow, today: string, dueLabel: string | null): WorklistTrip {
  return {
    tripId: t.trip_id,
    clientName: t.client_display_name,
    title: t.title,
    valueLabel: money(t.total_value_cents, t.currency),
    status: t.status,
    dueLabel,
    startLabel: relativeDay(today, t.start_date),
  };
}

export type PipelineCard = {
  tripId: string;
  clientName: string;
  title: string;
  valueLabel: string;
  status: string;
  version: number;
};

export type PipelineColumn = {
  status: string;
  label: string;
  count: number;
  totalLabel: string;
  cards: PipelineCard[];
};

export type Pipeline = {
  columns: PipelineColumn[];
  cancelledCount: number;
  currencyNote: string | null;
};

/**
 * The five columns, from the `trip_status` enum minus `cancelled`.
 *
 * The prototype draws `Qualified` and `Traveling`; neither exists in the enum. Screen
 * Inventory §3.2.2's five map exactly onto it, so the Data Model and the document agree
 * against the drawing and the hierarchy puts both above it.
 */
export const PIPELINE_STAGES = [
  { status: "inquiry", label: "Inquiry" },
  { status: "proposal", label: "Proposal" },
  { status: "booked", label: "Booked" },
  { status: "in_progress", label: "In progress" },
  { status: "completed", label: "Completed" },
] as const;

export async function loadPipeline(): Promise<Pipeline | null> {
  const [kpiRes, boardRes] = await Promise.all([
    callAgentRead<AgentKpiRow>("agent_kpis"),
    callAgentRead<AgentTripRow>("agent_trip_board"),
  ]);
  if (!kpiRes.ok || !boardRes.ok) return null;
  const k = kpiRes.rows[0];
  if (!k) return null;

  const trips = boardRes.rows;
  const columns = PIPELINE_STAGES.map((stage) => {
    const cards = trips.filter((t) => t.status === stage.status);
    const total = cards.reduce((sum, t) => sum + cents(t.total_value_cents), 0);
    return {
      status: stage.status,
      label: stage.label,
      count: cards.length,
      totalLabel: formatTripMoney(total, k.dominant_currency ?? "USD", { whole: true }),
      cards: cards.map((t) => ({
        tripId: t.trip_id,
        clientName: t.client_display_name,
        title: t.title,
        valueLabel: money(t.total_value_cents, t.currency),
        status: t.status,
        version: t.version,
      })),
    };
  });

  return {
    columns,
    // `cancelled` is a status, not a funnel stage. Counted beneath the board so cancelled
    // trips are excluded without becoming invisible. The board read filters archived trips,
    // not cancelled ones, so they are here to count.
    cancelledCount: trips.filter((t) => t.status === "cancelled").length,
    currencyNote:
      k.currency_count > 1
        ? AGENT_COPY.currencyNote(k.dominant_currency ?? "USD", k.currency_count - 1)
        : null,
  };
}

/**
 * Screen 3.2.3's events for one month.
 *
 * Departures and returns come off the trip board; payment dates off
 * `agent_payments_due`, which has no lower bound (already-overdue is the point of the
 * worklist section) and is asked for a wide window here so a month view can look forward.
 *
 * THE AVAILABILITY LAYER IS ABSENT ON PURPOSE. `agent_availability.time_off_blocks` is jsonb
 * with no declared schema — there is nothing to validate a parse against, which is the same
 * gap Data-Model §7.4 cites as its reason for making PipelineWeight a table. The
 * `availability` event kind exists so the layer switches on with no other change when §3.12
 * defines the shape.
 */
export async function loadCalendar(): Promise<{
  today: string;
  events: CalendarEvent[];
} | null> {
  const [kpiRes, boardRes, dueRes] = await Promise.all([
    callAgentRead<AgentKpiRow>("agent_kpis"),
    callAgentRead<AgentTripRow>("agent_trip_board"),
    callAgentRead<AgentPaymentRow>("agent_payments_due", { p_within_days: 400 }),
  ]);
  if (!kpiRes.ok || !boardRes.ok || !dueRes.ok) return null;
  const k = kpiRes.rows[0];
  if (!k) return null;

  const events: CalendarEvent[] = [];

  for (const t of boardRes.rows) {
    if (t.start_date) {
      events.push({
        id: `dep-${t.trip_id}`,
        kind: "departure",
        date: t.start_date,
        label: `${t.client_display_name} departs`,
        detail: t.title,
        // Trip detail is §3.4.2 and unbuilt. Null rather than a link to a 404.
        href: null,
      });
    }
    if (t.end_date) {
      events.push({
        id: `ret-${t.trip_id}`,
        kind: "return",
        date: t.end_date,
        label: `${t.client_display_name} returns`,
        detail: t.title,
        href: null,
      });
    }
  }

  for (const p of dueRes.rows) {
    if (!p.due_date) continue;
    events.push({
      id: `pay-${p.milestone_id}`,
      kind: "payment",
      date: p.due_date,
      label: `${p.label} · ${money(p.amount_cents, p.currency)}`,
      detail: p.client_display_name,
      href: null,
    });
  }

  // Unfiltered. `buildMonth` maps events by date, so ones outside the month are simply
  // never looked up, and its agenda already scopes to the month — filtering here would mean
  // knowing which month to show before knowing what `today` is, which is the wrong order.
  return { today: k.as_of_date, events };
}
