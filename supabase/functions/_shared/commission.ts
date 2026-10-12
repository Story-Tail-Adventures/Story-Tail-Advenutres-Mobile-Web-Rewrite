/**
 * §3.7's request vocabulary and the ledger CSV — the `agent-commission` route's pure half.
 *
 * Kept apart from the route for the reason `component.ts` is: every check here is a case
 * that would otherwise reach Postgres and come back as an opaque 500 (a cast error, a CHECK
 * violation) or, worse, land in the row. `commission_test.ts` pins each one.
 *
 * The SQL functions defend the same rules again (status sets, the 0–100 rate, the 0–365
 * lag, the expected-from-gross arithmetic). This layer exists so the advisor reads a
 * sentence instead of a 500; it is not the only fence.
 */
import { badRequest } from "./problem.ts";
import { isUuid } from "./uuid.ts";
import { readCents } from "./component.ts";

export { readCents };

/**
 * A REQUIRED amount in cents. `readCents` reads absent and blank as 0, which is right for an
 * optional fee and wrong for a gross or an amount received: a forgotten field saved a $0
 * line, or marked a line received for nothing (found in review).
 */
export function requireCents(value: unknown, field: string): number {
  if (value === undefined || value === null || value === "") throw badRequest(`${field} is required.`);
  return readCents(value, field);
}

/** A number, or a non-blank numeric string. `Number(" ")` and `Number([5])` are not answers. */
function strictNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") return Number(value.trim());
  return Number.NaN;
}

/**
 * Text Postgres will accept. A NUL byte or a lone surrogate passes a length check and then
 * fails inside Postgres ("\u0000 cannot be converted to text") as a 500.
 */
function cleanText(value: string, field: string): string {
  if (value.includes("\u0000") || !value.isWellFormed()) throw badRequest(`${field}: some characters can't be saved. Remove them and try again.`);
  return value;
}

export const COMMISSION_STATUSES = [
  "expected",
  "invoiced",
  "received",
  "disputed",
  "lost",
] as const;
export type CommissionStatus = (typeof COMMISSION_STATUSES)[number];

/** A new line has not been paid: `received` / `disputed` arrive through the payment op. */
export const CREATE_STATUSES = ["expected", "invoiced"] as const;
/** The only two statuses the payment op sets — the ones that carry money and a date. */
export const PAYMENT_STATUSES = ["received", "disputed"] as const;

export const PAYMENT_TERMS = ["at_booking", "after_travel"] as const;
export type PaymentTerms = (typeof PAYMENT_TERMS)[number];

const MAX_REFERENCE = 64;
const MAX_NOTES = 4000;

export function readStatus<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field = "Status",
): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw badRequest(`${field} must be one of: ${allowed.join(", ")}.`);
  }
  return value as T;
}

export function readTerms(value: unknown): PaymentTerms {
  return readStatus(value, PAYMENT_TERMS, "Payment terms");
}

/**
 * A commission rate: 0 to 100 with at most two decimals (`numeric(5,2)` under a 0–100
 * CHECK). Required — a line with no rate has no expected amount, and expected is always
 * computed from it.
 */
export function readRate(value: unknown): number {
  if (value === undefined || value === null || value === "") {
    throw badRequest("Commission rate is required.");
  }
  const n = strictNumber(value);
  if (!Number.isFinite(n)) throw badRequest("Commission rate must be a number.");
  if (n < 0 || n > 100) throw badRequest("Commission rate must be between 0 and 100.");
  // Rounded, not refused: `component.ts` makes the same call for a third decimal nobody meant.
  return Math.round(n * 100) / 100;
}

/** Days after booking or travel the supplier pays: a whole number, 0 to 365. */
export function readLagDays(value: unknown): number {
  const n = strictNumber(value);
  if (!Number.isInteger(n)) {
    throw badRequest("Payment days must be a whole number.");
  }
  if (n < 0 || n > 365) throw badRequest("Payment days must be between 0 and 365.");
  return n;
}

/** Inteletravel's own reference for the line. Optional; trimmed; blank is none. */
export function readReference(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw badRequest("Inteletravel reference must be text.");
  const trimmed = cleanText(value, "Inteletravel reference").trim();
  if (trimmed.length > MAX_REFERENCE) throw badRequest("Inteletravel reference is too long.");
  return trimmed === "" ? null : trimmed;
}

export function readNotes(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw badRequest("Notes must be text.");
  const trimmed = cleanText(value, "Notes").trim();
  if (trimmed.length > MAX_NOTES) throw badRequest("Notes are too long.");
  return trimmed === "" ? null : trimmed;
}

/**
 * A real calendar date, or a 400. Shaped right is not enough: `2026-02-31` would reach
 * Postgres and come back as a 500 for what is a typo.
 */
export function readDate(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) {
    throw badRequest(`${field} must be a date.`);
  }
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) {
    throw badRequest(`${field} must be a date.`);
  }
  return value;
}

export function readId(value: unknown, what: string): string {
  if (typeof value !== "string" || !isUuid(value)) throw badRequest(`That is not a ${what} id.`);
  return value;
}

function optionalId(value: unknown, what: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  return readId(value, what);
}

function optionalDate(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  return readDate(value, field);
}

export type LedgerFilters = {
  p_status: CommissionStatus[] | null;
  p_supplier_id: string | null;
  p_trip_id: string | null;
  p_travel_from: string | null;
  p_travel_to: string | null;
};

/** The ledger's filters, exactly as the web's `ledgerQueryFromParams` produces them. */
export function readLedgerFilters(value: unknown): LedgerFilters {
  const f = (value ?? {}) as Record<string, unknown>;
  let statuses: CommissionStatus[] | null = null;
  if (f.statuses !== undefined && f.statuses !== null) {
    if (!Array.isArray(f.statuses)) throw badRequest("statuses must be a list.");
    statuses = [...new Set(f.statuses.map((s) => readStatus(s, COMMISSION_STATUSES)))];
    if (statuses.length === 0) statuses = null;
  }
  return {
    p_status: statuses,
    p_supplier_id: optionalId(f.supplierId, "supplier"),
    p_trip_id: optionalId(f.tripId, "trip"),
    p_travel_from: optionalDate(f.travelFrom, "Travel from"),
    p_travel_to: optionalDate(f.travelTo, "Travel to"),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// The CSV
// ─────────────────────────────────────────────────────────────────────────────

/** One row of `agent_export_commission`. Money is a digit-string, as it crosses PostgREST. */
export type ExportRow = {
  trip_title: string;
  client_display_name: string;
  supplier_name: string;
  travel_start: string | null;
  travel_end: string | null;
  status: string;
  gross_booking_cents: string;
  commission_pct: number | string;
  expected_commission_cents: string;
  processing_fee_cents: string;
  received_commission_cents: string;
  received_at: string | null;
  payment_terms: string;
  payment_lag_days: number;
  inteletravel_reference: string | null;
  currency: string;
};

const HEADER = [
  "Trip",
  "Client",
  "Supplier",
  "Travel start",
  "Travel end",
  "Status",
  "Gross",
  "Rate %",
  "Expected",
  "Fee",
  "Received",
  "Received on",
  "Payment terms",
  "Payment days",
  "Inteletravel reference",
  "Currency",
];

/**
 * Cents as an exact decimal string — "1234.56", never a float. The screens show whole
 * dollars; an export is data for the books and keeps every cent. Done on the digit-string,
 * so no value ever passes through a JS number.
 */
export function centsToDecimal(cents: string): string {
  const raw = String(cents).trim();
  if (!/^-?\d+$/.test(raw)) throw new Error(`not a cents value: ${raw}`);
  const negative = raw.startsWith("-");
  const digits = (negative ? raw.slice(1) : raw).padStart(3, "0");
  const whole = digits.slice(0, -2).replace(/^0+(?=\d)/, "");
  return `${negative ? "-" : ""}${whole}.${digits.slice(-2)}`;
}

/**
 * One CSV cell. Two jobs:
 *
 *  1. RFC 4180 quoting — commas, quotes and line breaks are wrapped and doubled.
 *  2. FORMULA INJECTION. A trip title or a client name is typed by a person, and a cell that
 *     starts with `=`, `+`, `-`, `@`, a tab or a carriage return is a formula to Excel and
 *     Sheets. "=HYPERLINK(…)" in a client's surname would run on the advisor's machine the
 *     moment the file opened. Such a cell is prefixed with an apostrophe, which spreadsheets
 *     treat as "this is text". Applied to text cells only — a negative number is a number.
 */
export function csvCell(value: string | number | null | undefined, text = true): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (text && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** A third enum value must not be filed silently as "After travel". */
function termsLabel(terms: string): string {
  if (terms === "at_booking") return "At booking";
  if (terms === "after_travel") return "After travel";
  throw new Error(`unknown payment terms in export: ${terms}`);
}

export function toCsv(rows: ExportRow[]): string {
  const lines = [HEADER.map((h) => csvCell(h)).join(",")];
  for (const r of rows) {
    lines.push([
      csvCell(r.trip_title),
      csvCell(r.client_display_name),
      csvCell(r.supplier_name),
      csvCell(r.travel_start, false),
      csvCell(r.travel_end, false),
      csvCell(r.status),
      csvCell(centsToDecimal(r.gross_booking_cents), false),
      csvCell(r.commission_pct, false),
      csvCell(centsToDecimal(r.expected_commission_cents), false),
      csvCell(centsToDecimal(r.processing_fee_cents), false),
      csvCell(centsToDecimal(r.received_commission_cents), false),
      csvCell(r.received_at, false),
      csvCell(termsLabel(r.payment_terms)),
      csvCell(r.payment_lag_days, false),
      csvCell(r.inteletravel_reference),
      csvCell(r.currency),
    ].join(","));
  }
  // CRLF, per RFC 4180, and a trailing one so the last row is a complete line.
  return lines.join("\r\n") + "\r\n";
}
