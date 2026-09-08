/**
 * Trip status: the six stored values, and the seven labels the design asks for.
 *
 * BRD §6.2 wants trip cards reading "Proposal Ready", "Booked", "Final Payment Due",
 * "Traveling Now", "Past Trip". The `trip_status` enum has six values and none of them is
 * "Final Payment Due" — so two of the labels the client sees are DERIVED, and the
 * derivation has to live in exactly one place per stack or web and native will eventually
 * disagree about what the same trip is called.
 *
 * The Kotlin twin is
 * `mobile/shared/src/commonMain/kotlin/com/storytail/adventures/domain/trip/TripStatus.kt`,
 * and `.github/scripts/check_copy_parity.py` compares the two label tables on every CI run.
 * That is why TRIP_STATUS_MESSAGES is a flat object of plain strings: the parity checker
 * only reads top-level string keys, so a nested per-screen shape would be invisible to it
 * and would drift silently.
 */

/** The stored enum, verbatim from `trip_status` in the initial migration. */
export const TRIP_STATUSES = [
  "inquiry",
  "proposal",
  "booked",
  "in_progress",
  "completed",
  "cancelled",
] as const;

export type TripStatus = (typeof TRIP_STATUSES)[number];

/**
 * The chip variants in `web/styles/components.css`. Note these are PRESENTATIONAL and do
 * not map 1:1 onto TripStatus: `due` is a payment state layered on top of `booked`, and
 * `traveling`/`past` are the design's names for `in_progress`/`completed`. `lead` belongs
 * to the Phase 2 Lead entity and is never produced from a trip.
 */
export type StatusChip =
  | "inquiry"
  | "proposal"
  | "booked"
  | "due"
  | "traveling"
  | "past"
  | "cancelled";

export const TRIP_STATUS_MESSAGES = {
  inquiry: "Inquiry",
  proposalReady: "Proposal ready",
  booked: "Booked",
  finalPaymentDue: "Final payment due",
  travelingNow: "Traveling now",
  pastTrip: "Past trip",
  cancelled: "Cancelled",
} as const;

/**
 * How close an unpaid milestone has to be before a booked trip starts calling itself
 * "Final payment due" instead of "Booked".
 *
 * Fourteen days, matching the "ACTION NEEDED · 14 DAYS" overline the C221 artboard draws.
 * An already-overdue milestone counts too — a date in the past is not less urgent.
 */
export const DUE_SOON_DAYS = 14;

export type TripStatusInput = {
  status: TripStatus;
  /**
   * `due_date` of the earliest unpaid `payment_milestone`, or null when there is none.
   * ISO `yyyy-mm-dd`. A milestone with no due date set does not make a trip urgent.
   */
  nextUnpaidDueDate?: string | null;
  /** ISO `yyyy-mm-dd`. Injected so the derivation is pure and testable. */
  today: string;
};

export type TripStatusPresentation = {
  chip: StatusChip;
  label: string;
};

/** Whole days from `from` to `to`. Negative when `to` is in the past. */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.NaN;
  return Math.round((b - a) / 86_400_000);
}

/**
 * The one place a trip becomes a chip and a label.
 *
 * `cancelled` is checked before the payment override on purpose: a cancelled trip with an
 * unpaid milestone is not "Final payment due", it is cancelled, and the refund line on
 * Screen 2.2.10 is what speaks to the money.
 */
export function tripStatusPresentation(input: TripStatusInput): TripStatusPresentation {
  const { status, nextUnpaidDueDate, today } = input;
  const M = TRIP_STATUS_MESSAGES;

  switch (status) {
    case "cancelled":
      return { chip: "cancelled", label: M.cancelled };
    case "completed":
      return { chip: "past", label: M.pastTrip };
    case "in_progress":
      return { chip: "traveling", label: M.travelingNow };
    case "inquiry":
      return { chip: "inquiry", label: M.inquiry };
    case "proposal":
      return { chip: "proposal", label: M.proposalReady };
    case "booked": {
      if (nextUnpaidDueDate) {
        const days = daysBetween(today, nextUnpaidDueDate);
        if (!Number.isNaN(days) && days <= DUE_SOON_DAYS) {
          return { chip: "due", label: M.finalPaymentDue };
        }
      }
      return { chip: "booked", label: M.booked };
    }
  }
}

/**
 * Days until departure, or null when there is nothing to count down to.
 *
 * Null for an inquiry with no dates, and null once the trip has started — a countdown that
 * has reached zero is not a countdown, and Screen 2.2.1's hero switches to the traveling
 * treatment at that point.
 */
export function daysUntilDeparture(startDate: string | null | undefined, today: string): number | null {
  if (!startDate) return null;
  const days = daysBetween(today, startDate);
  if (Number.isNaN(days) || days < 0) return null;
  return days;
}
