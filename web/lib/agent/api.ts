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
  | "agent_availability_self";

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

export type AgentFunction = "agent-trip-status";

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
