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
  // §3.4.1. A sibling of agent_trip_board rather than an extension of it — the board is
  // stage-shaped and §3.2.2 depends on that.
  | "agent_trip_roster"
  | "agent_trip_roster_summary"
  // §3.4.13. `agent_templates` is the grid; `agent_template` is one payload, kept separate
  // because the grid renders a dozen cards and none of them needs the whole blob.
  | "agent_templates"
  | "agent_template"
  | "agent_trip_board"
  | "agent_payments_due"
  | "agent_inbox"
  | "agent_availability_self"
  | "agent_trip_overview"
  | "agent_trip_components"
  // §3.4.5 – §3.4.12's supplier picker. No arguments — see the function's own comment.
  | "agent_suppliers"
  | "agent_trip_itinerary_meta"
  | "agent_trip_itinerary_days"
  | "agent_trip_payments"
  | "agent_trip_documents"
  | "agent_trip_messages"
  | "agent_trip_activity"
  | "agent_client_roster"
  | "agent_client_roster_summary"
  | "agent_client_overview"
  | "agent_client_companions"
  | "agent_client_trips"
  | "agent_client_conversations"
  | "agent_client_documents"
  | "agent_client_notes"
  | "agent_client_activity"
  // §3.7.1 / §3.7.2. The ledger is service-role-only at the table, so these five definer
  // accessors are the agent's whole view of it. Two numbers on purpose: the dashboard's
  // "Expected · 90d" reads trip totals, everything else reads ledger lines.
  | "agent_commission_ledger"
  | "agent_commission_ledger_summary"
  | "agent_commission_ledger_suppliers"
  | "agent_commission_dashboard"
  | "agent_commission_monthly"
  // §3.7.3. One line, through the same scope as the ledger, so a removed line or one whose
  // two agent ids disagree is no row here either.
  | "agent_commission_line"
  // §3.7.5 / §3.7.6. An imported statement, its rows beside their ledger lines, and the
  // lines one row could pay. The tables are service-role only; these are the whole view.
  | "agent_commission_imports"
  | "agent_commission_import"
  | "agent_commission_import_rows"
  | "agent_commission_import_candidates"
  // §3.7.7. Trip grain, the worklist's own weighted figure by stage, and that forecast spread
  // over the months each booking's supplier should pay.
  | "agent_commission_forecast"
  | "agent_commission_cash_in"
  // §3.4.16 (§3.7 Stage 5). The trip's Expected and Invoiced lines, which the cancel dialog
  // offers to mark Lost, each with the version the close is checked against.
  | "agent_trip_open_commission";

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
/**
 * §3.4.13's grid row.
 *
 * `times_used` is DERIVED in SQL from `trip.template_id`, not a stored counter — see the
 * accessor. `value_cents` is a digit-string like every other money column on this side,
 * because PostgREST serialises bigint as a JSON number and loses precision past 2^53.
 *
 * Hand-declared with `| null` where the column really is nullable: `supabase gen types`
 * cannot infer nullability from a RETURNS TABLE signature and declares every column
 * non-nullable, which is wrong for `description`.
 */
export type AgentTemplateRow = {
  template_id: string;
  name: string;
  description: string | null;
  trip_type: string;
  component_count: number;
  day_count: number;
  value_cents: string;
  times_used: number;
  created_at: string;
  updated_at: string;
};

export type AgentKpiRow = {
  agent_id: string;
  as_of_date: string;
  /** NULL when the book reaches no money figure at all; 'USD' otherwise. */
  currency: string | null;
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
  refund_detail: string | null;
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
  supplier_id: string | null;
  supplier_name: string | null;
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
  /**
   * §3.4.12's kind-specific detail. `jsonb` with no schema in Postgres — Data-Model §23 put
   * the validation in `supabase/functions/_shared/component.ts` and nowhere else, so what
   * arrives here is whatever was last written. Read defensively: a key may be absent, and
   * the values are strings or booleans.
   */
  payload: Record<string, unknown> | null;
  order_index: number;
};

/** §3.4.5 – §3.4.12's supplier picker. Agency-wide, not per-advisor. */
export type AgentSupplierRow = {
  supplier_id: string;
  name: string;
  kind: string;
  default_commission_pct: number | null;
  /** §3.7.4's prefill, since 20261011120000. NULL = varies or not on file. */
  commission_payment_terms: string | null;
  commission_payment_lag_days: number | null;
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
  /** When the money actually landed. §3.4.15's editor shows it; nothing else reads it. */
  paid_at: string | null;
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
/**
 * §3.4.1's roster row.
 *
 * HAND-DECLARED NULLABILITY, like every other row type in this file. `supabase gen types`
 * cannot infer it from a `RETURNS TABLE` signature and calls every column non-nullable, so
 * a generated type would promise a `start_date` that an inquiry has never had.
 */
export type AgentTripRosterRow = {
  trip_id: string;
  title: string;
  client_id: string;
  client_display_name: string;
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
  component_count: number;
  last_activity_at: string | null;
  version: number;
  as_of_date: string;
  total_count: number;
};

export type AgentTripSummaryRow = {
  inquiry_count: number;
  proposal_count: number;
  booked_count: number;
  in_progress_count: number;
  completed_count: number;
  cancelled_count: number;
  total_count: number;
  pipeline_cents: string;
  pipeline_currency: string | null;
};

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
/**
 * §3.3.2 / §3.3.3's one row.
 *
 * Wide, because the Overview tab IS wide — a header card, a snapshot grid, a preferences
 * card and four mini-stats all read from the same client. travel_preference rides it
 * because `travel_preference.client_id` is UNIQUE, so there is no cardinality to fold.
 *
 * `notes` here is `client.notes`, the agent's free-form column that the Snapshot card
 * shows. The Notes TAB is the `client_note` table and has its own row type below. Two note
 * surfaces, and Data-Model §6.1 says so out loud.
 *
 * The jsonb columns are typed structurally rather than as `unknown`: nothing validates
 * their shape in Postgres, so every field is optional here and every reader must treat it
 * that way. `important_dates` in particular is where the prototype's invented "surprise
 * flag" would have gone, and there is no such field.
 */
export type AgentClientOverviewRow = {
  client_id: string;
  display_name: string;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  status: string;
  tags: string[] | null;
  important_dates: { label?: string; date?: string; recurring?: boolean }[] | null;
  emergency_contact: { name?: string; phone?: string; relationship?: string } | null;
  address_line1: string | null;
  address_line2: string | null;
  address_city: string | null;
  address_region: string | null;
  address_postal_code: string | null;
  address_country: string | null;
  notes: string | null;
  version: number;
  created_at: string;
  archived_at: string | null;
  preferred_destinations: string[] | null;
  travel_styles: string[] | null;
  dietary_restrictions: string[] | null;
  dietary_notes: string | null;
  accessibility_needs: string[] | null;
  accessibility_notes: string | null;
  loyalty_programs: { program?: string; number?: string; tier?: string }[] | null;
  budget_band: string | null;
  favorite_past_trips: string | null;
  lifetime_value_cents: string;
  lifetime_currency: string | null;
  commission_cents: string;
  trip_count: number;
  active_trip_count: number;
  note_count: number;
  document_count: number;
  last_contact_at: string | null;
  as_of_date: string;
};

export type AgentClientCompanionRow = {
  companion_id: string;
  first_name: string;
  last_name: string;
  relationship: string | null;
  date_of_birth: string | null;
  passport_expiry: string | null;
  passport_country: string | null;
  linked_client_id: string | null;
  invited: boolean;
};

export type AgentClientTripRow = {
  trip_id: string;
  title: string;
  trip_type: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  destinations: string[] | null;
  traveler_count: number;
  total_value_cents: string;
  total_paid_cents: string;
  total_commission_cents: string;
  currency: string;
  as_of_date: string;
};

export type AgentClientConversationRow = {
  conversation_id: string;
  trip_id: string | null;
  trip_title: string | null;
  subject: string | null;
  last_message_at: string;
  last_message_preview: string | null;
  agent_unread_count: number;
  message_count: number;
};

export type AgentClientDocumentRow = {
  document_id: string;
  kind: string;
  filename: string;
  mime_type: string;
  size_bytes: string;
  is_sensitive: boolean;
  trip_id: string | null;
  trip_title: string | null;
  created_at: string;
};

export type AgentClientNoteRow = {
  note_id: string;
  body: string;
  author_name: string | null;
  author_is_me: boolean;
  created_at: string;
  updated_at: string;
};

export type AgentClientActivityRow = {
  event_id: string;
  event_type: string;
  target_entity: string | null;
  target_id: string | null;
  actor_name: string | null;
  actor_role: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export type AgentClientSummaryRow = {
  active_count: number;
  in_motion_count: number;
  inquiry_count: number;
  archived_count: number;
  tag_facets: { tag: string; count: number }[] | null;
};

/**
 * §3.7.2's ledger row. One per commission LINE, not per trip: a trip can carry several
 * suppliers' lines, and most trips carry none yet.
 *
 * `commission_pct` is Postgres `numeric`, which PostgREST sends as a JSON number. It is a
 * rate between 0 and 100 with two decimals, so a number is safe here where money is not.
 */
export type AgentCommissionLedgerRow = {
  commission_id: string;
  trip_id: string;
  trip_title: string;
  /** Lines on archived trips stay (a commission line is a tax record); the trip page does not. */
  trip_archived: boolean;
  client_id: string;
  client_display_name: string;
  supplier_id: string;
  supplier_name: string;
  start_date: string | null;
  end_date: string | null;
  gross_booking_cents: string;
  commission_pct: number;
  expected_commission_cents: string;
  processing_fee_cents: string;
  received_commission_cents: string;
  currency: string;
  status: string;
  received_at: string | null;
  inteletravel_reference: string | null;
  as_of_date: string;
  total_count: number;
};

export type AgentCommissionSummaryRow = {
  expected_count: number;
  invoiced_count: number;
  received_count: number;
  disputed_count: number;
  lost_count: number;
  total_count: number;
};

export type AgentCommissionSupplierRow = {
  supplier_id: string;
  supplier_name: string;
  line_count: number;
};

/**
 * §3.7.1's tiles. The two rates are NULL when nothing arrived in that window — not 0%, which
 * would be a claim about a rate nobody was paid at.
 */
export type AgentCommissionDashboardRow = {
  as_of_date: string;
  currency: string | null;
  ytd_received_cents: string;
  ly_received_cents: string;
  avg_rate_pct: number | null;
  ly_avg_rate_pct: number | null;
  upcoming_commission_cents: string;
  upcoming_trip_count: number;
  at_risk_cents: string;
  disputed_count: number;
  trailing_12_cents: string;
  prior_12_cents: string;
};

/** §3.7.3's one line. Money is a digit-string; `commission_pct` is a JSON number. */
export type AgentCommissionLineRow = {
  commission_id: string;
  trip_id: string;
  trip_title: string;
  trip_status: string;
  trip_archived: boolean;
  trip_start_date: string | null;
  trip_end_date: string | null;
  booked_on: string | null;
  client_id: string;
  client_display_name: string;
  supplier_id: string;
  supplier_name: string;
  gross_booking_cents: string;
  commission_pct: number;
  expected_commission_cents: string;
  processing_fee_cents: string;
  received_commission_cents: string;
  currency: string;
  payment_terms: string;
  payment_lag_days: number;
  /** NULL when the anchor date is not known yet — no end date, or never booked. */
  expected_payment_date: string | null;
  status: string;
  received_at: string | null;
  inteletravel_reference: string | null;
  notes: string | null;
  version: number;
  can_remove: boolean;
  as_of_date: string;
};

/** §3.7.5's list of past statements. */
export type AgentCommissionImportListRow = {
  import_id: string;
  original_filename: string;
  status: string;
  total_rows: number;
  matched_rows: number;
  unmatched_rows: number;
  period_start: string | null;
  period_end: string | null;
  created_at: string;
  /** The upload's date in the advisor's own zone. */
  created_on: string;
  reconciled_at: string | null;
};

/** §3.7.5 / §3.7.6's one statement. `column_map` is field → header index. */
export type AgentCommissionImportRow = {
  import_id: string;
  original_filename: string;
  status: string;
  headers: string[];
  column_map: Record<string, number> | null;
  statement_date: string | null;
  total_rows: number;
  period_start: string | null;
  period_end: string | null;
  version: number;
  created_at: string;
  reconciled_at: string | null;
  /** The reconcile's date in the advisor's own zone. */
  reconciled_on: string | null;
  confirmed_count: number;
  suggested_count: number;
  unmatched_count: number;
  duplicate_count: number;
  unreadable_count: number;
  already_recorded_count: number;
  to_create_count: number;
  ignored_count: number;
  /** The first three rows' cells, for the map screen. */
  sample_rows: string[][] | null;
  as_of_date: string;
};

/** §3.7.6's row: the statement line, and the ledger line beside it (all null when none). */
export type AgentCommissionImportLineRow = {
  row_id: string;
  row_number: number;
  state: string;
  match_basis: string;
  reference: string | null;
  supplier_text: string | null;
  traveler_text: string | null;
  gross_cents: string | null;
  received_cents: string | null;
  fee_cents: string | null;
  paid_on: string | null;
  currency: string;
  parse_error: string | null;
  line_id: string | null;
  line_trip_id: string | null;
  line_trip_title: string | null;
  line_client_name: string | null;
  line_supplier_name: string | null;
  line_status: string | null;
  line_gross_cents: string | null;
  line_commission_pct: number | null;
  line_expected_cents: string | null;
  line_fee_cents: string | null;
  line_received_cents: string | null;
  line_received_at: string | null;
  new_trip_id: string | null;
  new_trip_title: string | null;
  new_supplier_id: string | null;
  new_supplier_name: string | null;
  new_gross_cents: string | null;
  new_commission_pct: number | null;
};

/** §3.7.6's "match to a different line". */
export type AgentCommissionCandidateRow = {
  commission_id: string;
  trip_id: string;
  trip_title: string;
  client_name: string;
  supplier_name: string;
  status: string;
  start_date: string | null;
  gross_booking_cents: string;
  commission_pct: number;
  expected_cents: string;
  supplier_matches: boolean;
  traveler_matches: boolean;
};

/** §3.7.7's stage row. The totals repeat on every row, rounded once as agent_kpis rounds. */
export type AgentCommissionForecastRow = {
  status: string;
  weight_pct: number;
  trip_count: number;
  raw_cents: string;
  weighted_cents: string;
  total_raw_cents: string;
  total_weighted_cents: string;
  as_of_date: string;
};

/** §3.7.7's calendar row: overdue, twelve months, later, undated — every one, zero or not. */
export type AgentCommissionCashInRow = {
  bucket: string;
  month_start: string | null;
  cents: string;
  trip_count: number;
  received_cents: string;
};

export type AgentTripOpenCommissionRow = {
  commission_id: string;
  supplier_name: string;
  status: string;
  expected_commission_cents: string;
  currency: string;
  version: number;
};

export type AgentCommissionMonthRow = {
  month_start: string;
  received_cents: string;
  line_count: number;
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

export type AgentFunction =
  | "agent-trip-status"
  // §3.4.3, and §3.4.4's component writes when they land.
  | "agent-trip"
  | "agent-trip-notes"
  // §3.4.14. Its own door rather than five more ops on `agent-trip`, which already
  // carries seven over 500 lines — the itinerary is a different entity graph reached
  // through a different screen, the same reasoning that split `agent-trip-status` out.
  | "agent-itinerary"
  // §3.4.13. Its own door for the same reason, and one `apply` writes components, itinerary
  // days and activities in a single statement — the largest write on this surface.
  | "agent-template"
  // §3.3.7. An RPC write would let an agent POST from a browser with no audit_event,
  // which is the reason every agent write on this surface is a function.
  | "agent-client-notes"
  // §3.3.9 / §3.3.10 / §3.3.12 and §3.3.1's bulk tag — one function, four ops.
  | "agent-client"
  // §3.7.3 / §3.7.4 and §3.7.2's export. Each SQL write audits itself in the same
  // transaction; the function supplies the audit id, ip and user agent.
  | "agent-commission"
  // §3.7.5 / §3.7.6. Upload, map, resolve, reconcile, discard. Only reconcile writes the
  // ledger, all of it in one transaction.
  | "commission-import";

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
