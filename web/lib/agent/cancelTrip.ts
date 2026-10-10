import type { TripDetailOverview } from "@/lib/agent/tripDetail";

/**
 * §3.4.16's vocabulary and its impact list.
 *
 * SERVER-FREE ON PURPOSE. `CancelTripDialog` is a client component, and anything reachable
 * from `lib/supabase/server.ts` drags `next/headers` into the browser bundle and 500s the
 * route. Same reason `tripStatuses.ts`, `components.ts`, `payments.ts` and `itinerary.ts`
 * exist as their own modules.
 */

/**
 * Mirrors the `trip_refund_status_vocabulary` CHECK (20261001100000), which is the
 * authority, and `REFUND_STATUSES` in `supabase/functions/_shared/trip.ts`, which the Edge
 * Function validates against. Three copies of four strings, kept in step by tests on each
 * side rather than by a shared definition, because SQL, Deno and the browser bundle cannot
 * share one.
 *
 * The ORDER is the order the advisor reads them in, not the CHECK's: "none expected" first
 * because it is the commonest answer on a cancellation the client caused.
 */
export const REFUND_STATUS_OPTIONS = [
  { value: "none_expected", label: "None expected" },
  { value: "pending", label: "Pending" },
  { value: "partial", label: "Partial" },
  { value: "full", label: "Full" },
] as const;

export type RefundStatusValue = (typeof REFUND_STATUS_OPTIONS)[number]["value"];

/** The label for a stored value, or null. Unknown strings return null rather than echoing. */
export function refundStatusLabel(value: string | null): string | null {
  if (!value) return null;
  return REFUND_STATUS_OPTIONS.find((o) => o.value === value)?.label ?? null;
}

export function isRefundStatusValue(value: string): value is RefundStatusValue {
  return REFUND_STATUS_OPTIONS.some((o) => o.value === value);
}

export type ImpactLine = {
  /** `warn` is something the advisor must go and do elsewhere; `info` is a consequence. */
  tone: "info" | "warn";
  text: string;
};

/**
 * WHAT CANCELLING ACTUALLY DOES, derived from this trip rather than written down.
 *
 * The prototype's impact list (`agent-trip.jsx:588-592`) is four hardcoded sentences, and
 * two of them are not true of this system:
 *
 *   * "Card authorization will be revoked" — NOTHING REVOKES IT. There is no revoke path
 *     on the agent side at all; §3.6 owns that and is unbuilt. Rendering that sentence
 *     would be a promise the code does not keep, on a payment surface, which is the exact
 *     defect class the last three PRs were spent removing. It is inverted here into the
 *     true version: the authorization STAYS, and that is something to go and deal with.
 *   * "Sandals cancellation fee · $120 per policy" — nothing stores a supplier cancellation
 *     fee anywhere in the schema. Omitted rather than invented.
 *
 * What is left is derived and checkable. An empty list is a fine answer for an inquiry with
 * nothing attached, and the dialog says so rather than rendering an empty box.
 */
export function cancelImpact(overview: TripDetailOverview): ImpactLine[] {
  const lines: ImpactLine[] = [];

  // TRUE since 20260930140000: the forecast sums `total_commission_cents` over OPEN trips,
  // and `cancelled` is not one. So this number really does leave the dashboard today.
  if (!isZeroMoney(overview.totalCommissionLabel)) {
    lines.push({
      tone: "info",
      text: `Commission expected drops by ${overview.totalCommissionLabel} — a cancelled trip leaves the forecast.`,
    });
  }

  // Cancelling changes a status. It does not move money, and saying so out loud is the
  // point: an advisor who assumes otherwise will not go and start the refund.
  if (!isZeroMoney(overview.totalPaidLabel)) {
    lines.push({
      tone: "warn",
      text: `${overview.totalPaidLabel} is recorded as paid. Cancelling does not move money — record where the refund stands below.`,
    });
  }

  // The prototype's claim, inverted into the truth.
  if (overview.cardOnFile) {
    lines.push({
      tone: "warn",
      text: `The card on file (${overview.cardOnFile}) stays authorized. Revoking an authorization arrives with §3.6.`,
    });
  }

  if (overview.componentCount > 0) {
    lines.push({
      tone: "warn",
      text: `${overview.componentCount} booked ${overview.componentCount === 1 ? "item" : "items"} stay on the trip. Cancelling here does not tell any supplier.`,
    });
  }

  return lines;
}

/**
 * Whether a formatted money label is zero.
 *
 * Strips every non-digit rather than parsing: the label has already been through
 * `formatTripMoney`, so it carries a symbol, separators and possibly no decimals, and
 * re-parsing it as a number is how "$1,000" becomes 1. The only question here is whether
 * any digit in it is non-zero.
 */
function isZeroMoney(label: string): boolean {
  return !/[1-9]/.test(label);
}
