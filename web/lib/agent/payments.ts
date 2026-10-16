import { PAYMENTS_COPY, SCHEDULE_COPY } from "@/lib/agent/content";
import { PAID_NOTE_MAX, PAID_REFERENCE_MAX, checkPayUrl, looksLikeCardNumber } from "@/lib/trips/payLink";

/**
 * §3.4.15 Trip Payment Schedule's vocabulary and form shape.
 *
 * SERVER-FREE, like `components.ts`, `tripStatuses.ts` and `newTrip.ts`, and for the same
 * reason: the editor is a client component, and anything it imports that reaches
 * `lib/supabase/server.ts` drags `next/headers` into the browser bundle and 500s the route.
 *
 * ── THE SCHEDULE AND THE MONEY ARE TWO FORMS ─────────────────────────────────────────────
 *
 * `agent_upsert_payment_milestone` says what the supplier expects and when;
 * `agent_set_milestone_paid` says whether the money moved. Only the second may touch
 * `trip.total_paid_cents`, the "paid so far" a traveler and the advisor both read. That
 * separation is the whole shape of this screen, so it is two sets of values here rather
 * than one. (§3.6's pay link is a third write, `agent_set_milestone_pay_url`, and touches
 * neither.)
 */

/** `payment_milestone_kind`, exactly. */
export const MILESTONE_KINDS = [
  { value: "deposit", label: SCHEDULE_COPY.kindDeposit },
  { value: "interim", label: SCHEDULE_COPY.kindInterim },
  { value: "final", label: SCHEDULE_COPY.kindFinal },
] as const;

export type MilestoneKind = (typeof MILESTONE_KINDS)[number]["value"];

/**
 * `payment_milestone_status`, exactly, and every one of the four is reachable from the UI.
 *
 * `waived` is the one that earns its place. Data-Model §9.5: suppliers do forgive
 * milestones, and a waived one is not a paid one — it must not raise what the client has
 * paid. `overdue` is stored rather than derived from `due_date < today` because an advisor
 * has to be able to suppress it when a supplier has verbally extended a deadline.
 */
export const MILESTONE_STATUSES = [
  { value: "scheduled", label: SCHEDULE_COPY.statusScheduled, hint: SCHEDULE_COPY.statusScheduledHint },
  { value: "paid", label: SCHEDULE_COPY.statusPaid, hint: SCHEDULE_COPY.statusPaidHint },
  { value: "overdue", label: SCHEDULE_COPY.statusOverdue, hint: SCHEDULE_COPY.statusOverdueHint },
  { value: "waived", label: SCHEDULE_COPY.statusWaived, hint: SCHEDULE_COPY.statusWaivedHint },
] as const;

export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number]["value"];

export function isMilestoneKind(value: unknown): value is MilestoneKind {
  return typeof value === "string" && MILESTONE_KINDS.some((k) => k.value === value);
}

export function isMilestoneStatus(value: unknown): value is MilestoneStatus {
  return typeof value === "string" && MILESTONE_STATUSES.some((s) => s.value === value);
}

export type MilestoneValues = {
  milestoneId: string;
  kind: MilestoneKind;
  label: string;
  /** Dollars as typed, e.g. "1000.00" — converted to cents at the action. */
  amount: string;
  dueDate: string;
};

export type ScheduleState = {
  fieldErrors?: Record<string, string[]>;
  formError?: string;
  values?: MilestoneValues;
};

export function emptyMilestone(): MilestoneValues {
  return {
    milestoneId: "",
    // `deposit` is the one an advisor adds first and most often — a schedule is usually
    // built front to back.
    kind: "deposit",
    label: "",
    amount: "",
    dueDate: "",
  };
}

export function milestoneFromFormData(form: FormData): MilestoneValues {
  const text = (name: string) => (form.get(name) ?? "").toString().trim();
  const rawKind = text("kind");
  return {
    milestoneId: text("milestoneId"),
    kind: isMilestoneKind(rawKind) ? rawKind : "deposit",
    label: text("label"),
    amount: text("amount"),
    dueDate: text("dueDate"),
  };
}

/**
 * Dollars as typed to a whole number of cents, or `null` when it is not a number.
 *
 * Deliberately a copy of `components.ts`'s, NOT an import from it. That module is §3.4.4's
 * vocabulary and this one is §3.4.15's; a shared helper between them would be the first
 * thread of a `lib/agent/money.ts` that every screen imports and nobody owns. If a third
 * screen needs it, that is the moment to extract it — see the round-trip tests on both.
 *
 * Cents, never a float: `Math.round(1000.1 * 100)` is 100010 and `1000.1 * 100` is
 * 100010.00000000001.
 */
export function dollarsToCents(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, "");
  if (cleaned === "") return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}

export function centsToDollars(cents: string | number | null): string {
  if (cents === null || cents === "") return "";
  const n = typeof cents === "number" ? cents : Number(cents);
  if (!Number.isFinite(n)) return "";
  return (n / 100).toFixed(2);
}

/** Field-level, so each message lands against the control that caused it. */
export function validateMilestone(
  values: MilestoneValues,
): Record<string, string[]> | null {
  const errors: Record<string, string[]> = {};

  if (!values.label) errors.label = [SCHEDULE_COPY.labelRequired];

  const cents = dollarsToCents(values.amount);
  if (cents === null) errors.amount = [SCHEDULE_COPY.amountNotANumber];
  // A ZERO MILESTONE IS REFUSED, and the database would take it. A row saying the supplier
  // expects nothing on a date is not a schedule entry; it is a row an advisor will later
  // read as a mistake and cannot tell from one.
  else if (cents === 0) errors.amount = [SCHEDULE_COPY.amountRequired];

  return Object.keys(errors).length > 0 ? errors : null;
}

/**
 * The milestone "Remind the client" is about (§3.10 Stage 2): the first one still owed, in the
 * order the schedule reads (due date first, which `agent_trip_payments` already sorts by). Paid
 * and waived ones are not owed. Null when nothing is left to pay.
 */
export function nextUnpaidMilestone<T extends { milestoneId: string; status: string }>(rows: readonly T[]): T | null {
  return rows.find((r) => r.status === "scheduled" || r.status === "overdue") ?? null;
}

/* ── §3.6 pay links and Mark paid (ruled 2026-10-16) ─────────────────────────────────── */

export type PayLinkState = {
  /** The sentence to show under the field, or nothing. */
  error?: string;
  /** What was typed, kept so a refusal does not empty the field. */
  value?: string;
};

/**
 * The pay link field, checked on the web before the Edge Function and the database check it
 * again (Data-Model §9.5): https only, at most 2,048 characters, never a card number. An
 * empty value means remove the link.
 */
export function validatePayLink(raw: string): { ok: true; url: string | null } | { ok: false; error: string } {
  const check = checkPayUrl(raw);
  if (check.ok) return check;
  const error =
    check.reason === "card"
      ? PAYMENTS_COPY.linkCard
      : check.reason === "length"
        ? PAYMENTS_COPY.linkTooLong
        : PAYMENTS_COPY.linkNotHttps;
  return { ok: false, error };
}

export type MarkPaidValues = {
  /** Dollars as typed; blank means the whole amount. */
  amount: string;
  /** ISO `yyyy-mm-dd`. */
  paidOn: string;
  reference: string;
  note: string;
};

export type MarkPaidState = {
  fieldErrors?: Partial<Record<keyof MarkPaidValues, string>>;
  formError?: string;
  values?: MarkPaidValues;
};

export function markPaidFromFormData(form: FormData): MarkPaidValues {
  const text = (name: string) => (form.get(name) ?? "").toString().trim();
  return {
    amount: text("amount"),
    paidOn: text("paidOn"),
    reference: text("reference"),
    note: text("note"),
  };
}

/**
 * Mark Paid's fields (Screen-Inventory §3.6.5). `today` is the advisor's own date, so a
 * future date is refused here as the SQL refuses it. The confirmation number and the note
 * are refused, not masked, when they hold a card-shaped number (Data-Model §9.5).
 */
export function validateMarkPaid(
  values: MarkPaidValues,
  today: string,
): Partial<Record<keyof MarkPaidValues, string>> | null {
  const errors: Partial<Record<keyof MarkPaidValues, string>> = {};

  // "0" and a bare "$" both parse to zero cents; marking a payment paid for nothing would
  // hide the client's pay button while nothing was paid.
  if (values.amount !== "") {
    const cents = dollarsToCents(values.amount);
    if (cents === null || cents <= 0) errors.amount = PAYMENTS_COPY.paidAmountInvalid;
  }
  // A round trip catches 2026-02-31, which Date.parse quietly rolls over to March.
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(values.paidOn) ? new Date(`${values.paidOn}T00:00:00Z`) : null;
  if (!parsed || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== values.paidOn || values.paidOn > today) {
    errors.paidOn = PAYMENTS_COPY.paidDateInvalid;
  }
  if (values.reference.length > PAID_REFERENCE_MAX) errors.reference = PAYMENTS_COPY.paidReferenceTooLong;
  else if (looksLikeCardNumber(values.reference)) errors.reference = PAYMENTS_COPY.paidCardLike;
  if (values.note.length > PAID_NOTE_MAX) errors.note = PAYMENTS_COPY.paidNoteTooLong;
  else if (looksLikeCardNumber(values.note)) errors.note = PAYMENTS_COPY.paidCardLike;

  return Object.keys(errors).length > 0 ? errors : null;
}
