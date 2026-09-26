import { callEdgeFunction, type EdgeCallResult } from "@/lib/supabase/edge";
import { env } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

/**
 * THE SEAM. The one file that knows how §3.2's data actually arrives.
 *
 * Reads are SECURITY DEFINER accessors over PostgREST `/rpc/`; the write is an Edge
 * Function. Pages and components see neither — they call `lib/agent/queries.ts`, which calls
 * this. Moving a read between transports is a change inside this file.
 *
 * WHY READS ARE RPC AND THE WRITE IS NOT. The accessors are granted to `authenticated` and
 * resolve the caller from `auth.uid()`, which is right for a read: a direct PostgREST call
 * is just another way to ask the same question. A write cannot be — an agent could POST to
 * `/rpc/agent_set_trip_status` from a browser and move a trip with no `audit_event`. So that
 * function is service_role-only and `agent-trip-status` is the only door.
 *
 * ── THE GENERATED TYPES LIE ABOUT NULLABILITY, AND THIS IS WHERE IT BITES ────────
 *
 * `supabase gen types` cannot infer nullability from a `RETURNS TABLE` signature, so it
 * declares every column non-nullable: `commission_confidence_pct: number` and
 * `inquiry_to_book_days: number`. Both are NULL in exactly the cases Screen 3.2.1 most needs
 * to tell apart — an empty pipeline has no confidence to report, a book with no booked
 * transitions has no cycle time — and `supabase/tests/rls_agent_reads.sql` asserts they come
 * back NULL rather than 0, because a zero there is a claim where an absence is the truth.
 *
 * So every field this file reads is treated as nullable WHATEVER TYPESCRIPT SAYS. The row
 * types below re-declare them with `| null` rather than trusting the generated ones; the
 * migration's own comment records the same warning next to the function.
 */

export type AgentRead =
  | "agent_kpis"
  | "agent_trip_board"
  | "agent_payments_due"
  | "agent_inbox"
  | "agent_availability_self"
  | "agent_trip_overview"
  | "agent_trip_components"
  | "agent_trip_itinerary_meta"
  | "agent_trip_itinerary_days"
  | "agent_trip_payments"
  | "agent_trip_documents"
  | "agent_trip_messages"
  | "agent_trip_activity"
  | "agent_client_roster"
  | "agent_client_roster_summary";

export type AgentReadResult<T> =
  | { ok: true; rows: T[] }
  | { ok: false; kind: "unauthenticated" | "unavailable" };

/**
 * A row from any `agent_*()` accessor, with the nullability the database actually has.
 *
 * Deliberately NOT `Database["public"]["Functions"]["agent_kpis"]["Returns"][number]` — see
 * the header. Every optional field carries `| null` here even where the generated type does
 * not, and the fields that are genuinely NOT NULL in SQL (ids, counts, the digit-string
 * money columns) are left required.
 */
export type AgentKpiRow = {
  agent_id: string;
  as_of_date: string;
  dominant_currency: string | null;
  currency_count: number;
  pipeline_value_cents: string;
  booked_month_cents: string;
  commission_expected_cents: string;
  commission_weighted_cents: string;
  commission_confidence_pct: number | null;
  inquiry_to_book_days: number | null;
  inquiry_to_book_sample: number;
  active_client_count: number;
  active_trip_count: number;
  new_inquiry_count: number;
  unread_message_count: number;
};

export type AgentTripRow = {
  trip_id: string;
  client_id: string;
  client_display_name: string;
  title: string;
  trip_type: string;
  status: string;
  status_changed_at: string;
  start_date: string | null;
  end_date: string | null;
  destinations: string[] | null;
  traveler_count: number;
  total_value_cents: string;
  total_paid_cents: string;
  total_commission_cents: string;
  currency: string;
  notes: string | null;
  version: number;
  proposal_sent_at: string | null;
  proposal_viewed_at: string | null;
  next_due_date: string | null;
  next_due_cents: string | null;
  next_due_currency: string | null;
  agent_unread_count: number;
};

export type AgentPaymentRow = {
  milestone_id: string;
  trip_id: string;
  trip_title: string;
  client_id: string;
  client_display_name: string;
  kind: string;
  label: string;
  amount_cents: string;
  paid_cents: string;
  currency: string;
  due_date: string | null;
  status: string;
  days_until: number | null;
};

export type AgentInboxRow = {
  conversation_id: string;
  client_id: string;
  client_display_name: string;
  trip_id: string | null;
  trip_title: string | null;
  subject: string | null;
  last_message_at: string;
  last_message_preview: string | null;
  agent_unread_count: number;
};

/**
 * §3.4.2's eight row shapes. Same warning as `AgentKpiRow`/`AgentTripRow` above: every
 * nullable field here carries `| null` by hand, because `supabase gen types` cannot infer it
 * from `RETURNS TABLE`.
 */
export type AgentTripOverviewRow = {
  trip_id: string;
  client_id: string;
  client_display_name: string;
  title: string;
  trip_type: string;
  status: string;
  status_changed_at: string;
  start_date: string | null;
  end_date: string | null;
  destinations: string[] | null;
  traveler_count: number;
  traveler_breakdown: Record<string, unknown> | null;
  total_value_cents: string;
  total_paid_cents: string;
  total_commission_cents: string;
  currency: string;
  cancellation_reason: string | null;
  refund_status: string | null;
  notes: string | null;
  version: number;
  card_last4: string | null;
  card_brand: string | null;
  card_spending_limit_cents: string | null;
  last_activity_at: string | null;
  component_count: number;
  manual_component_count: number;
  api_component_count: number;
  as_of_date: string;
  /** Earliest scheduled/overdue milestone. Null when nothing is outstanding. */
  next_unpaid_due_date: string | null;
};

export type AgentTripComponentRow = {
  component_id: string;
  kind: string;
  display_name: string;
  start_date: string | null;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  confirmation_number: string | null;
  cost_cents: string;
  commission_pct: number | null;
  commission_cents: string;
  currency: string;
  api_source: string | null;
  order_index: number;
};

export type AgentTripItineraryMetaRow = {
  itinerary_id: string;
  cover_image_url: string | null;
  intro_note: string | null;
  closing_note: string | null;
  published_at: string | null;
  last_published_at: string | null;
};

export type AgentTripItineraryDayRow = {
  day_id: string;
  day_number: number;
  date: string;
  day_label: string | null;
  day_summary: string | null;
  activity_id: string | null;
  block: string | null;
  start_time: string | null;
  end_time: string | null;
  activity_title: string | null;
  activity_body: string | null;
  location: string | null;
  address: string | null;
  phone: string | null;
  confirmation_number: string | null;
  gyasis_tip: string | null;
  component_id: string | null;
  activity_order: number | null;
};

export type AgentTripPaymentRow = {
  milestone_id: string;
  kind: string;
  label: string;
  amount_cents: string;
  paid_cents: string;
  currency: string;
  due_date: string | null;
  status: string;
  order_index: number;
};

export type AgentTripDocumentRow = {
  document_id: string;
  owner_user_id: string;
  kind: string;
  filename: string;
  mime_type: string;
  size_bytes: string;
  is_sensitive: boolean;
  created_at: string;
};

export type AgentTripMessageRow = {
  message_id: string;
  sender_role: string;
  body: string;
  created_at: string;
  is_internal_note: boolean;
};

export type AgentTripActivityRow = {
  history_id: string;
  from_status: string | null;
  to_status: string;
  changed_at: string;
  changed_by_name: string | null;
};

/**
 * §3.3.1's roster row.
 *
 * NEARLY EVERY FIELD HERE IS NULLABLE, and the generated types say none of them are. A
 * roster is mostly clients who are missing something: `email` is nullable on the table,
 * `phone` and the four trip fields are absent for anyone without a trip, and
 * `lifetime_currency` is NULL for anyone with nothing committed — which is the honest answer
 * and not a zero, so `rls_agent_clients.sql` asserts it comes back NULL rather than 'USD'.
 *
 * `lifetime_value_cents` and `total_count` are the two that are genuinely NOT NULL. The
 * first is a digit-string, not a number: a bigint that crosses as JSON loses precision past
 * 2^53, and the roster sums whole books of business.
 */
export type AgentClientRosterRow = {
  client_id: string;
  display_name: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  status: string;
  tags: string[] | null;
  lifetime_value_cents: string;
  lifetime_currency: string | null;
  lifetime_currency_count: number;
  trip_count: number;
  last_trip_title: string | null;
  last_trip_end_date: string | null;
  next_trip_title: string | null;
  next_trip_start_date: string | null;
  next_trip_status: string | null;
  next_trip_destinations: string[] | null;
  last_contact_at: string | null;
  created_at: string;
  archived_at: string | null;
  as_of_date: string;
  total_count: number;
};

/**
 * §3.3.1's header counts and the tag chips.
 *
 * The four counts are NOT NULL — an empty book reports four zeros. `tag_facets` comes back
 * as `Json` from the generated types because PostgREST cannot describe a jsonb's shape; the
 * accessor builds it with `jsonb_build_object('tag', …, 'count', …)` and
 * `rls_agent_clients.sql` asserts every facet's count equals what that chip actually
 * returns, so the shape below is asserted in SQL rather than merely declared here.
 */
export type AgentClientSummaryRow = {
  active_count: number;
  in_motion_count: number;
  inquiry_count: number;
  archived_count: number;
  tag_facets: { tag: string; count: number }[] | null;
};

/**
 * Call one accessor.
 *
 * ZERO ROWS IS A VALID ANSWER, NOT AN ERROR. A client, an admin or an archived agent gets an
 * empty result rather than a rejection — every read boundary in this schema answers that way
 * and `rls_agent_reads.sql` asserts it. `agent_kpis()` still distinguishes the two cases that
 * matter: one row of zeros for an agent with an empty book, no row at all for a non-agent.
 */
export async function callAgentRead<T>(
  read: AgentRead,
  args: Record<string, unknown> = {},
): Promise<AgentReadResult<T>> {
  if (env.authChecksDisabledForLocalDev) {
    return { ok: false, kind: "unavailable" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, kind: "unauthenticated" };

  const { data, error } = await supabase.rpc(read, args as never);

  if (error) {
    // Never the message: a PostgREST error can carry the statement. The code is enough to
    // tell a privilege problem from a plan problem.
    console.warn("[agent] read failed", { read, code: error.code });
    return { ok: false, kind: "unavailable" };
  }

  return { ok: true, rows: (data ?? []) as T[] };
}

export type AgentFunction = "agent-trip-status" | "agent-trip-notes";

/**
 * The §3.x door onto the shared Edge Function transport.
 *
 * Its own union, separate from `TripFunction`, for the reason `lib/supabase/edge.ts`
 * records: one implementation, two typed doors, and neither can call the other's routes.
 */
export async function callAgentFunction(
  fn: AgentFunction,
  body: Record<string, unknown>,
): Promise<EdgeCallResult> {
  return callEdgeFunction(fn, { method: "POST", body }, "agent");
}
