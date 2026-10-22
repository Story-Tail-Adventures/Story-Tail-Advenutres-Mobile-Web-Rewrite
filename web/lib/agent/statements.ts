import {
  callAgentRead,
  type AgentTripOverviewRow,
  type AgentCommissionCandidateRow,
  type AgentCommissionImportLineRow,
  type AgentCommissionImportListRow,
  type AgentCommissionImportRow,
} from "@/lib/agent/api";
import { rateLabel, travelDateLabel } from "@/lib/agent/commission";
import {
  STATEMENT_COPY,
  statementAlreadyNote,
  statementCandidateMeta,
  statementMonthLabel,
  statementOverNote,
  statementRateNote,
  statementReconcileTitle,
  statementShortNote,
  statementSummary,
} from "@/lib/agent/content";
import { selectionsFromMap } from "@/lib/agent/statementForm";
import { cents } from "@/lib/agent/queries";

/**
 * §3.7.5 and §3.7.6's view models, built like `commission.ts`: plain data out, formatted
 * here, and `null` (or `unavailable`) from a loader means the READ failed.
 *
 * MONEY TO THE CENT. The ledger shows whole dollars (Gyasi, 2026-10-11); a statement is the
 * record of what was paid, and reconciling it is the one job where $1,189.50 and $1,190 are
 * different answers.
 */

/** Rows that block "Mark as reconciled": each needs the advisor's decision. */
const BLOCKING = new Set(["suggested", "unmatched", "duplicate", "unreadable"]);

/**
 * Always two places: "$540.00", "$1,189.50". The shared formatter drops ".00", which in one
 * right-aligned Amount column put "$540" over "$1,189.50" (found in review).
 */
function exact(amountCents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountCents / 100);
}

function usd(value: string | null | undefined, currency = "USD"): string | null {
  if (value === null || value === undefined) return null;
  return exact(cents(value), currency);
}

function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
}

export function statementHref(importId: string): string {
  return `/agent/commission/import/${importId}`;
}

function statusLabel(status: string): string {
  if (status === "mapping") return STATEMENT_COPY.statusMapping;
  if (status === "reconciled") return STATEMENT_COPY.statusReconciled;
  return STATEMENT_COPY.statusReview;
}

function statusChip(status: string): string {
  if (status === "mapping") return "inquiry";
  if (status === "reconciled") return "booked";
  return "proposal";
}

/**
 * "April 2026 statement" when every paid-on date falls in one month, otherwise the file's
 * name — the prototype's "April statement", without guessing a month for a file that spans
 * two.
 */
export function statementLabel(filename: string, start: string | null, end: string | null): string {
  if (start && end && start.slice(0, 7) === end.slice(0, 7)) {
    const month = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", year: "numeric" })
      .format(new Date(`${start}T12:00:00Z`));
    return statementMonthLabel(month);
  }
  return filename;
}

// ─────────────────────────────────────────────────────────────────────────────
// The list
// ─────────────────────────────────────────────────────────────────────────────

export type StatementListItem = {
  importId: string;
  href: string;
  label: string;
  filename: string;
  statusLabel: string;
  statusChip: string;
  rowsLabel: string;
  uploadedLabel: string;
};

export async function loadStatements(): Promise<StatementListItem[] | null> {
  const res = await callAgentRead<AgentCommissionImportListRow>("agent_commission_imports");
  if (!res.ok) return null;
  return res.rows.map((r) => ({
    importId: r.import_id,
    href: statementHref(r.import_id),
    label: statementLabel(r.original_filename, r.period_start, r.period_end),
    filename: r.original_filename,
    statusLabel: statusLabel(r.status),
    statusChip: statusChip(r.status),
    // The matched count is final only once reconciled: while a statement is in review, each
    // decision moves it and the stored number would be stale.
    rowsLabel: r.status === "reconciled"
      ? `${plural(r.total_rows, "row", "rows")} · ${r.matched_rows} matched`
      : plural(r.total_rows, "row", "rows"),
    // The advisor's own calendar date, from SQL: the UTC date of an evening upload in the US
    // is tomorrow's.
    uploadedLabel: travelDateLabel(r.created_on) ?? r.created_on,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// One statement
// ─────────────────────────────────────────────────────────────────────────────

export type StatementView = {
  importId: string;
  version: number;
  status: "mapping" | "review" | "reconciled";
  filename: string;
  title: string;
  subtitle: string;
  totalRows: number;
  /** Rows that must be decided before Mark as reconciled. */
  needYou: number;
  /** What reconciling would do: lines paid, lines created. */
  willPay: number;
  willCreate: number;
  headers: string[];
  /** One per header: the platform field it holds, or "" to ignore it. */
  selections: string[];
  statementDate: string;
  /** Per header, the first non-blank value from the sample rows (for "e.g."). */
  samples: string[];
  reconciledOn: string | null;
  today: string;
};

export type StatementResult =
  | { ok: true; statement: StatementView }
  | { ok: false; reason: "not-found" | "unavailable" };

export function statementView(r: AgentCommissionImportRow): StatementView {
  const needYou = r.suggested_count + r.unmatched_count + r.duplicate_count + r.unreadable_count;
  // Settled rows only. A suggestion is not matched until the advisor confirms it; counting
  // it here too made "36 matched · 3 need you" out of 38 rows.
  const matched = r.confirmed_count + r.already_recorded_count + r.to_create_count;
  const headers = r.headers ?? [];
  const sample = r.sample_rows ?? [];
  return {
    importId: r.import_id,
    version: r.version,
    status: r.status === "mapping" || r.status === "reconciled" ? r.status : "review",
    filename: r.original_filename,
    title: statementReconcileTitle(statementLabel(r.original_filename, r.period_start, r.period_end)),
    subtitle: statementSummary(r.total_rows, matched, needYou, r.ignored_count),
    totalRows: r.total_rows,
    needYou,
    willPay: r.confirmed_count,
    willCreate: r.to_create_count,
    headers,
    selections: selectionsFromMap(r.column_map, headers.length),
    statementDate: r.statement_date ?? "",
    samples: headers.map((_, i) => sample.map((row) => (row[i] ?? "").trim()).find((v) => v !== "") ?? ""),
    reconciledOn: travelDateLabel(r.reconciled_on),
    today: r.as_of_date,
  };
}

export async function loadStatement(importId: string): Promise<StatementResult> {
  const res = await callAgentRead<AgentCommissionImportRow>("agent_commission_import", {
    p_import_id: importId,
  });
  if (!res.ok) return { ok: false, reason: "unavailable" };
  const row = res.rows[0];
  return row ? { ok: true, statement: statementView(row) } : { ok: false, reason: "not-found" };
}

// ─────────────────────────────────────────────────────────────────────────────
// Its rows
// ─────────────────────────────────────────────────────────────────────────────

export type StatementRowView = {
  rowId: string;
  rowNumber: number;
  state: string;
  needsYou: boolean;
  /** The prototype's mono cell: "SRB-220119 · Sandals Resorts · M Hayes". */
  statementLine: string;
  amountLabel: string | null;
  paidOnLabel: string | null;
  /** "Sandals Resorts · Hayes · Anniversary Week in Negril", or what will be created. */
  matchLabel: string;
  matchHref: string | null;
  /** The warning line under the match: a shortfall, a rate, a duplicate, a parse error. */
  note: string | null;
  /** Null once the advisor has decided the row (set aside, or a new line): the matcher's
   *  confidence no longer describes it. */
  confidenceLabel: string | null;
  confidenceChip: string;
  /** What the action cell shows when there is nothing to decide. */
  doneLabel: string | null;
  resolveHref: string;
};

function confidence(basis: string, state: string): { label: string | null; chip: string } {
  if (state === "to_create" || state === "ignored") return { label: null, chip: "past" };
  if (state === "unreadable" || basis === "none") return { label: STATEMENT_COPY.confidenceLow, chip: "due" };
  if (basis === "supplier_and_traveler") return { label: STATEMENT_COPY.confidenceMedium, chip: "proposal" };
  return { label: STATEMENT_COPY.confidenceHigh, chip: "booked" };
}

/** "14%" from (received + fee) / gross, to one place; null when there is no gross. */
function paidRate(paidCents: number, grossCents: number): string | null {
  if (grossCents <= 0) return null;
  return rateLabel(Math.round((paidCents / grossCents) * 1000) / 10);
}

/**
 * The note §3.7.6 exists for. For a row about to pay its line: the gap (expected − fee −
 * received) and, when it is short, the rate the payment works out to against the booking —
 * the prototype's "Sandals applied 14% not 15%", computed rather than asserted.
 */
function paymentNote(r: AgentCommissionImportLineRow, done = false): string | null {
  if (r.line_expected_cents === null || r.received_cents === null) return null;
  const expected = cents(r.line_expected_cents);
  const fee = r.fee_cents === null ? 0 : cents(r.fee_cents);
  const received = cents(r.received_cents);
  const gap = expected - fee - received;
  if (gap === 0) return null;
  if (gap < 0) return statementOverNote(exact(-gap, r.currency));

  const short = statementShortNote(
    exact(expected, r.currency),
    exact(received, r.currency),
    fee > 0 ? exact(fee, r.currency) : null,
    exact(gap, r.currency),
    done,
  );
  // Against the line's BOOKED gross, never the statement's: the question is what rate the
  // supplier paid on the booking the advisor recorded. A statement whose own gross differs
  // made the first draft say "paid at 13.1%, not 12%" about a payment that was SHORT.
  const paid = paidRate(received + fee, cents(r.line_gross_cents));
  const linePct = r.line_commission_pct === null ? null : rateLabel(r.line_commission_pct);
  return paid && linePct && paid !== linePct ? `${short} ${statementRateNote(paid, linePct)}` : short;
}

/**
 * "Sandals Resorts · Jordan Hayes · Anniversary Week in Negril": the line a row pays, or the
 * one the matcher suggested. The client's whole name (the first draft took the last word,
 * and "Van Der Berg" read "Berg").
 */
function lineLabelOf(r: AgentCommissionImportLineRow): string | null {
  return r.line_id
    ? [r.line_supplier_name, r.line_client_name, r.line_trip_title].filter(Boolean).join(" · ")
    : null;
}

/** A line the advisor chose to create: the shortfall it will start with, if any. */
function createNote(r: AgentCommissionImportLineRow, done: boolean): string | null {
  if (r.new_commission_pct === null || r.new_gross_cents === null || r.received_cents === null) return null;
  const gross = cents(r.new_gross_cents);
  const head = `${exact(gross, r.currency)} at ${rateLabel(r.new_commission_pct)}`;
  // Postgres's round(), half away from zero, on a positive amount: Math.round agrees.
  const expected = Math.round((gross * Number(r.new_commission_pct)) / 100);
  const fee = r.fee_cents === null ? 0 : cents(r.fee_cents);
  const received = cents(r.received_cents);
  const gap = expected - fee - received;
  if (gap <= 0) return head;
  return `${head}. ${statementShortNote(exact(expected, r.currency), exact(received, r.currency), fee > 0 ? exact(fee, r.currency) : null, exact(gap, r.currency), done)}`;
}

export function statementRowView(
  r: AgentCommissionImportLineRow,
  importId: string,
  reconciled = false,
): StatementRowView {
  const conf = confidence(r.match_basis, r.state);
  const lineLabel = lineLabelOf(r);

  let matchLabel = lineLabel ?? STATEMENT_COPY.noMatch;
  let matchHref = r.line_id ? `/agent/commission/ledger/${r.line_id}` : null;
  let note: string | null = null;
  let doneLabel: string | null = null;

  switch (r.state) {
    case "confirmed":
      note = paymentNote(r, reconciled);
      // "Auto" only where the matcher was certain (a reference); a suggestion the advisor
      // confirmed, or a line they picked, is "Matched".
      doneLabel = r.match_basis === "reference" || r.match_basis === "confirmation"
        ? STATEMENT_COPY.auto
        : STATEMENT_COPY.matched;
      break;
    case "suggested":
      note = paymentNote(r) ?? STATEMENT_COPY.checkSuggestion;
      break;
    case "already_recorded":
      note = statementAlreadyNote(
        r.line_status === "disputed" ? "disputed" : "received",
        usd(r.line_received_cents, r.currency),
        usd(r.received_cents, r.currency),
      );
      doneLabel = STATEMENT_COPY.alreadyRecorded;
      break;
    case "to_create":
      matchLabel = [r.new_supplier_name, r.new_trip_title].filter(Boolean).join(" · ");
      // Before reconcile the line does not exist (line_id is the old suggestion, if any);
      // after, it is the line this row created.
      matchHref = reconciled && r.line_id ? `/agent/commission/ledger/${r.line_id}` : null;
      note = createNote(r, reconciled);
      doneLabel = STATEMENT_COPY.newLine;
      break;
    case "ignored":
      matchLabel = lineLabel ?? "—";
      matchHref = null;
      doneLabel = STATEMENT_COPY.setAside;
      break;
    case "duplicate":
      note = STATEMENT_COPY.duplicateRow;
      break;
    case "unreadable":
      matchLabel = "—";
      matchHref = null;
      note = r.parse_error;
      break;
    default: // unmatched
      note = STATEMENT_COPY.possibleNew;
  }

  return {
    rowId: r.row_id,
    rowNumber: r.row_number,
    state: r.state,
    needsYou: BLOCKING.has(r.state),
    statementLine: [r.reference, r.supplier_text, r.traveler_text].filter(Boolean).join(" · ") || "—",
    amountLabel: usd(r.received_cents, r.currency),
    paidOnLabel: travelDateLabel(r.paid_on),
    matchLabel,
    matchHref,
    note,
    confidenceLabel: conf.label,
    confidenceChip: conf.chip,
    doneLabel,
    resolveHref: `${statementHref(importId)}/rows/${r.row_id}`,
  };
}

/** Needs-you rows first, then file order: the prototype's "3 need attention" at the top. */
export async function loadStatementRows(
  importId: string,
  reconciled = false,
): Promise<StatementRowView[] | null> {
  const res = await callAgentRead<AgentCommissionImportLineRow>("agent_commission_import_rows", {
    p_import_id: importId,
  });
  if (!res.ok) return null;
  return res.rows
    .map((r) => statementRowView(r, importId, reconciled))
    .sort((a, b) => Number(b.needsYou) - Number(a.needsYou) || a.rowNumber - b.rowNumber);
}

// ─────────────────────────────────────────────────────────────────────────────
// Resolving one row
// ─────────────────────────────────────────────────────────────────────────────

export type CandidateView = {
  commissionId: string;
  title: string;
  meta: string;
  travelLabel: string | null;
};

export type ResolveRowView = {
  row: StatementRowView & {
    raw: AgentCommissionImportLineRow;
    /** The suggestion, when the matcher made one and the row is not already on it. */
    suggestion: { label: string; note: string | null } | null;
    /** Pre-fills for "create": the row's gross and the rate it works out to. */
    createGross: string;
  };
  candidates: CandidateView[];
};

export async function loadRowToResolve(
  importId: string,
  rowId: string,
): Promise<{ ok: true; view: ResolveRowView } | { ok: false; reason: "not-found" | "unavailable" }> {
  const [rowsRes, candRes] = await Promise.all([
    callAgentRead<AgentCommissionImportLineRow>("agent_commission_import_rows", { p_import_id: importId }),
    callAgentRead<AgentCommissionCandidateRow>("agent_commission_import_candidates", {
      p_import_id: importId,
      p_row_id: rowId,
    }),
  ]);
  if (!rowsRes.ok || !candRes.ok) return { ok: false, reason: "unavailable" };
  const raw = rowsRes.rows.find((r) => r.row_id === rowId);
  if (!raw) return { ok: false, reason: "not-found" };

  const view = statementRowView(raw, importId);
  // The suggested line, labelled as ITSELF. Labelling it with the row's match label put "New
  // line · Kyoto" on a button that pays the old suggestion (found in review). Not offered for
  // a duplicate: its suggestion is the line an earlier row already pays.
  const suggestedLabel = lineLabelOf(raw);
  const suggestion = suggestedLabel && !["confirmed", "already_recorded", "duplicate"].includes(raw.state)
    ? { label: suggestedLabel, note: paymentNote(raw) }
    : null;

  return {
    ok: true,
    view: {
      row: {
        ...view,
        raw,
        suggestion,
        createGross: raw.gross_cents === null ? "" : (cents(raw.gross_cents) / 100).toFixed(2),
      },
      candidates: candRes.rows.map((c) => ({
        commissionId: c.commission_id,
        title: c.trip_title,
        meta: statementCandidateMeta(c.supplier_name, c.client_name, exact(cents(c.expected_cents))),
        travelLabel: travelDateLabel(c.start_date),
      })),
    },
  };
}

/**
 * The rate a new line needs for this row to pay it in full: (received + fee) / gross, rounded
 * DOWN to two places. Rounded to nearest, $1,234.56 on $9,999.00 gave 12.35%, an expected of
 * $1,234.88, and a new line born Disputed for 32 cents.
 */
export function impliedRate(receivedCents: number, feeCents: number, grossCents: number): string {
  if (grossCents <= 0) return "";
  return String(Math.floor(((receivedCents + feeCents) * 10000) / grossCents) / 100);
}

/** The trip a new line would go on, by id: live and the advisor's, or null. */
export async function loadTripPick(
  tripId: string,
): Promise<{ tripId: string; title: string; clientName: string } | null> {
  const res = await callAgentRead<AgentTripOverviewRow>("agent_trip_overview", { p_trip_id: tripId });
  const trip = res.ok ? res.rows[0] : undefined;
  return trip ? { tripId: trip.trip_id, title: trip.title, clientName: trip.client_display_name } : null;
}
