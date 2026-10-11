import { COMMISSION_COPY } from "@/lib/agent/content";
import { dollarsToCents } from "@/lib/agent/payments";

/**
 * §3.7.3 / §3.7.4's form vocabulary, parsing and validation — SERVER-FREE, for the reason
 * `payments.ts` and `tripStatuses.ts` give: the forms are client components, and anything
 * they import that reaches `lib/supabase/server.ts` 500s the route at request time.
 *
 * TWO FORMS, KEPT APART AT EVERY LAYER, the way §3.4.15 keeps a milestone's label apart from
 * whether it was paid. The LINE form says what was booked and what is owed; the PAYMENT form
 * says what arrived. Only the second reaches `received` / `disputed`, and the SQL, the route,
 * the actions and these types all hold that line.
 *
 * The validation here is so the advisor reads a sentence beside the field. The Edge Function
 * and the SQL both check again; nothing here is trusted.
 */

export const PAYMENT_TERMS_OPTIONS = [
  { value: "after_travel", label: COMMISSION_COPY.termsAfterTravel },
  { value: "at_booking", label: COMMISSION_COPY.termsAtBooking },
] as const;

/** What a NEW line may be. A line has not been paid when it is first entered. */
export const CREATE_STATUS_OPTIONS = [
  { value: "expected", label: COMMISSION_COPY.filterExpected },
  { value: "invoiced", label: COMMISSION_COPY.filterInvoiced },
] as const;

/**
 * What the edit may set. A line that is currently received or disputed keeps that status as
 * an option (editing its notes must not move it) — `editStatusOptions` adds it. Moving TO a
 * paid status is the payment form's job.
 */
export function editStatusOptions(current: string): { value: string; label: string }[] {
  const base: { value: string; label: string }[] = [
    { value: "expected", label: COMMISSION_COPY.filterExpected },
    { value: "invoiced", label: COMMISSION_COPY.filterInvoiced },
    { value: "lost", label: COMMISSION_COPY.filterLost },
  ];
  if (current === "received") base.push({ value: "received", label: COMMISSION_COPY.filterReceived });
  if (current === "disputed") base.push({ value: "disputed", label: COMMISSION_COPY.filterDisputed });
  return base;
}

// ─────────────────────────────────────────────────────────────────────────────
// The line form
// ─────────────────────────────────────────────────────────────────────────────

export type LineValues = {
  supplierId: string;
  /** Dollars, as typed: "6480.00". */
  gross: string;
  /** A percent, as typed: "12.5". */
  rate: string;
  paymentTerms: string;
  /** Whole days, as typed. */
  paymentLagDays: string;
  status: string;
  inteletravelReference: string;
  notes: string;
};

export type LineFormState = {
  fieldErrors?: Partial<Record<keyof LineValues, string>>;
  formError?: string;
  /** Echoed back so a refused submit keeps what was typed (React 19 resets the form). */
  values?: LineValues;
};

export function lineValuesFromForm(form: FormData): LineValues {
  const get = (k: string) => (form.get(k) ?? "").toString();
  return {
    supplierId: get("supplierId"),
    gross: get("gross").trim(),
    rate: get("rate").trim(),
    paymentTerms: get("paymentTerms"),
    paymentLagDays: get("paymentLagDays").trim(),
    status: get("status"),
    inteletravelReference: get("inteletravelReference").trim(),
    notes: get("notes"),
  };
}

/** A percent, 0–100 with at most two decimals, or null. */
export function parseRate(input: string): number | null {
  const cleaned = input.replace(/[%\s]/g, "");
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return n >= 0 && n <= 100 ? n : null;
}

/** Whole days, 0–365, or null. */
export function parseLagDays(input: string): number | null {
  if (!/^\d{1,3}$/.test(input.trim())) return null;
  const n = Number(input.trim());
  return n <= 365 ? n : null;
}

export function validateLine(values: LineValues): LineFormState["fieldErrors"] | null {
  const errors: NonNullable<LineFormState["fieldErrors"]> = {};
  if (!values.supplierId) errors.supplierId = COMMISSION_COPY.supplierRequired;
  // `dollarsToCents("")` is 0, which is a real gross for a zero-commission line — so a blank
  // is allowed to mean zero, the same reading the milestone form gives an empty amount.
  if (dollarsToCents(values.gross) === null) errors.gross = COMMISSION_COPY.grossInvalid;
  if (parseRate(values.rate) === null) errors.rate = COMMISSION_COPY.rateInvalid;
  if (parseLagDays(values.paymentLagDays) === null) errors.paymentLagDays = COMMISSION_COPY.lagInvalid;
  return Object.keys(errors).length > 0 ? errors : null;
}

/**
 * The preview beside the Expected field: gross × rate in cents, or null while either is not
 * a number. A PREVIEW — the server computes the stored figure itself and never takes this
 * one, so a rounding edge in floating point can at worst show a cent the save then corrects.
 */
export function previewExpectedCents(gross: string, rate: string): number | null {
  const cents = dollarsToCents(gross);
  const pct = parseRate(rate);
  if (cents === null || pct === null) return null;
  return Math.round((cents * pct) / 100);
}

/**
 * What adding a line for a supplier can fill in, from that supplier's components on the
 * trip: the summed cost as gross, and a rate — the components' own when they agree, the
 * gross-weighted average when they don't. Only the components that NAME the supplier count;
 * the trip's package components often carry none (Data-Model §10.1's nullable-supplier
 * note), and guessing which supplier an unnamed component belongs to would be worse than
 * filling nothing.
 */
export type SupplierPrefill = { grossCents: number; rate: number | null };

export function prefillBySupplier(
  components: { supplierId: string | null; costCents: number; commissionPct: number | null }[],
): Record<string, SupplierPrefill> {
  const sums = new Map<string, { gross: number; weighted: number; rated: number }>();
  for (const c of components) {
    if (!c.supplierId) continue;
    const s = sums.get(c.supplierId) ?? { gross: 0, weighted: 0, rated: 0 };
    s.gross += c.costCents;
    if (c.commissionPct !== null) {
      s.weighted += c.costCents * c.commissionPct;
      s.rated += c.costCents;
    }
    sums.set(c.supplierId, s);
  }
  const out: Record<string, SupplierPrefill> = {};
  for (const [id, s] of sums) {
    out[id] = {
      grossCents: s.gross,
      rate: s.rated > 0 ? Math.round((s.weighted / s.rated) * 100) / 100 : null,
    };
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// The payment form
// ─────────────────────────────────────────────────────────────────────────────

export type PaymentValues = {
  status: string;
  received: string;
  fee: string;
  receivedAt: string;
};

export type PaymentFormState = {
  fieldErrors?: Partial<Record<keyof PaymentValues, string>>;
  formError?: string;
  values?: PaymentValues;
};

export function paymentValuesFromForm(form: FormData): PaymentValues {
  const get = (k: string) => (form.get(k) ?? "").toString().trim();
  return {
    status: get("status"),
    received: get("received"),
    fee: get("fee"),
    receivedAt: get("receivedAt"),
  };
}

export function validatePayment(values: PaymentValues, today: string): PaymentFormState["fieldErrors"] | null {
  const errors: NonNullable<PaymentFormState["fieldErrors"]> = {};
  if (dollarsToCents(values.received) === null) errors.received = COMMISSION_COPY.amountInvalid;
  if (dollarsToCents(values.fee) === null) errors.fee = COMMISSION_COPY.amountInvalid;
  // ISO dates compare as strings. The server checks against the advisor's own today too.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.receivedAt) || values.receivedAt > today) {
    errors.receivedAt = COMMISSION_COPY.badDate;
  }
  return Object.keys(errors).length > 0 ? errors : null;
}

/** expected − fee − received, in cents, or null while either amount is not a number. */
export function previewGapCents(expectedCents: number, received: string, fee: string): number | null {
  const r = dollarsToCents(received);
  const f = dollarsToCents(fee);
  if (r === null || f === null) return null;
  return expectedCents - f - r;
}
